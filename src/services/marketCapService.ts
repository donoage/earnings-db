/**
 * Market Cap & Fundamentals Service
 * Handles fetching and caching of comprehensive company fundamentals data
 * 
 * Data Sources:
 * - Ticker Details (market cap, price, shares, sector, description, etc.)
 * - 52-Week High/Low (from daily aggregates)
 * - Income Statement (revenue, net income, EPS, margins - TTM)
 * - Cash Flow Statement (operating CF, free CF, capex - TTM)
 * - Balance Sheet (assets, liabilities, equity - quarterly)
 * - Financial Ratios (P/E, P/B, ROE, ROA, liquidity ratios, etc.)
 * 
 * Caching Strategy:
 * 1. Check Redis cache (7 days TTL)
 * 2. Check PostgreSQL database (7 days refresh threshold)
 * 3. If data is stale (>7 days), fetch from Polygon API
 * 4. Smart fetching: only fetches missing data (parallel API calls)
 * 5. Store in PostgreSQL (non-blocking) and cache in Redis (non-blocking)
 * 
 * Performance:
 * - Full cache hit: ~1ms (Redis)
 * - DB cache hit: ~10ms (PostgreSQL)
 * - Full refresh: ~500ms (6 parallel API calls)
 * - Partial refresh: ~100-400ms (1-5 parallel API calls)
 */

import axios from 'axios';
import { prisma } from '../utils/prisma';
import { getCached, setCached, getCachedMany } from '../utils/redis';
import { CACHE_TTL, UPDATE_THRESHOLD } from '../utils/constants';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';
const POLYGON_BASE_URL = 'https://api.polygon.io';

interface MarketCapData {
  ticker: string;
  marketCap: number;
  week52High?: number;
  week52Low?: number;
  currentPrice?: number;
  sharesOutstanding?: number;
  sector?: string;
  industry?: string;
  description?: string;
  website?: string;
  exchange?: string;
  companyName?: string;
  updatedAt: Date;
}

class MarketCapService {
  /**
   * Get market cap for a single ticker
   */
  async getMarketCap(ticker: string): Promise<MarketCapData | null> {
    const tickerUpper = ticker.toUpperCase();
    const cacheKey = `marketcap:${tickerUpper}`;

    // 1. Check Redis cache
    const cached = await getCached<MarketCapData>(cacheKey);
    if (cached) {
      return cached;
    }

    // 2. Check PostgreSQL (from Fundamental table) - get ALL fields
    const dbData = await prisma.fundamental.findUnique({
      where: { ticker: tickerUpper },
    });

    if (dbData && dbData.marketCap) {
      const age = Date.now() - dbData.updatedAt.getTime();
      
      // If data is fresh enough, use it
      if (age < UPDATE_THRESHOLD.FUNDAMENTALS) {
        const marketCapData: MarketCapData = {
          ticker: dbData.ticker,
          marketCap: Number(dbData.marketCap),
          week52High: dbData.week52High ? Number(dbData.week52High) : undefined,
          week52Low: dbData.week52Low ? Number(dbData.week52Low) : undefined,
          currentPrice: dbData.currentPrice ? Number(dbData.currentPrice) : undefined,
          sharesOutstanding: dbData.sharesOutstanding ? Number(dbData.sharesOutstanding) : undefined,
          sector: dbData.sector || undefined,
          industry: dbData.industry || undefined,
          description: dbData.description || undefined,
          website: dbData.website || undefined,
          exchange: dbData.exchange || undefined,
          companyName: dbData.companyName,
          updatedAt: dbData.updatedAt,
        };
        await setCached(cacheKey, marketCapData, CACHE_TTL.FUNDAMENTALS);
        console.log(`[Market Cap Service] DB hit for ${tickerUpper} (age: ${Math.round(age / 1000 / 60)} minutes) - using cached fundamentals`);
        return marketCapData;
      } else {
        console.log(`[Market Cap Service] DB data for ${tickerUpper} is stale (age: ${Math.round(age / 1000 / 60 / 60)} hours) - refreshing from Polygon`);
      }
    }

    // 3. Fetch from Polygon API (pass existing data to avoid re-fetching what we have)
    console.log(`[Market Cap Service] Fetching ${tickerUpper} from Polygon API`);
    return await this.fetchFromPolygon(tickerUpper, dbData);
  }

  /**
   * Get market caps for multiple tickers
   */
  async getMarketCaps(tickers: string[]): Promise<MarketCapData[]> {
    const uniqueTickers = [...new Set(tickers.map(t => t.toUpperCase()))];
    console.log(`[Market Cap Service] Fetching market caps for ${uniqueTickers.length} tickers`);
    
    // Try to get from cache first (batch operation)
    const cacheKeys = uniqueTickers.map(t => `marketcap:${t}`);
    const cachedResults = await getCachedMany<MarketCapData>(cacheKeys);
    
    const results: (MarketCapData | null)[] = [];
    const tickersToFetch: string[] = [];
    
    // Separate cached vs needs-fetch
    for (let i = 0; i < uniqueTickers.length; i++) {
      if (cachedResults[i]) {
        results[i] = cachedResults[i];
      } else {
        results[i] = null;
        tickersToFetch.push(uniqueTickers[i]);
      }
    }
    
    // Fetch missing ones
    if (tickersToFetch.length > 0) {
      console.log(`[Market Cap Service] Cache miss for ${tickersToFetch.length} tickers, fetching...`);
      const fetchedResults = await Promise.all(
        tickersToFetch.map(ticker => this.getMarketCap(ticker))
      );
      
      // Merge results
      let fetchIndex = 0;
      for (let i = 0; i < results.length; i++) {
        if (results[i] === null) {
          results[i] = fetchedResults[fetchIndex++];
        }
      }
    }
    
    return results.filter((mc): mc is MarketCapData => mc !== null);
  }

  /**
   * Fetch market cap and fundamentals from Polygon API
   * Only fetches missing data to minimize API calls
   */
  private async fetchFromPolygon(ticker: string, existingData?: any): Promise<MarketCapData | null> {
    try {
      if (!POLYGON_API_KEY) {
        console.error(`[Market Cap Service] POLYGON_API_KEY is not set!`);
        return null;
      }

      // Check what data we already have
      const needsBasicInfo = !existingData || !existingData.marketCap;
      const needs52WeekData = !existingData || !existingData.week52High || !existingData.week52Low;
      const needsIncomeStatement = !existingData || !existingData.revenue;
      const needsCashFlow = !existingData || !existingData.operatingCashFlow;
      const needsBalanceSheet = !existingData || !existingData.totalAssets;
      const needsRatios = !existingData || !existingData.priceToEarnings;

      console.log(`[Market Cap Service] Fetching ${ticker} - needs: basic=${needsBasicInfo}, 52w=${needs52WeekData}, income=${needsIncomeStatement}, cashFlow=${needsCashFlow}, balance=${needsBalanceSheet}, ratios=${needsRatios}`);
      
      // Prepare parallel API calls
      const apiCalls: Promise<any>[] = [];
      
      // 1. Ticker details (always fetch for current price/market cap)
      const tickerPromise = axios.get(
        `${POLYGON_BASE_URL}/v3/reference/tickers/${ticker}`,
        {
          params: { apiKey: POLYGON_API_KEY },
          timeout: 10000,
        }
      );
      apiCalls.push(tickerPromise);

      // 2. 52-week high/low (only if needed)
      let aggregatesPromise: Promise<any> | null = null;
      if (needs52WeekData) {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const fromDate = oneYearAgo.toISOString().split('T')[0];
        const toDate = new Date().toISOString().split('T')[0];
        
        aggregatesPromise = axios.get(
          `${POLYGON_BASE_URL}/v2/aggs/ticker/${ticker}/range/1/day/${fromDate}/${toDate}`,
          {
            params: { 
              apiKey: POLYGON_API_KEY,
              adjusted: true,
              sort: 'asc',
              limit: 50000
            },
            timeout: 10000,
          }
        ).catch(err => {
          console.log(`[Market Cap Service] Could not fetch 52-week data for ${ticker}:`, err.message);
          return null;
        });
        apiCalls.push(aggregatesPromise);
      }

      // 3. Income statement (only if needed)
      let incomePromise: Promise<any> | null = null;
      if (needsIncomeStatement) {
        incomePromise = axios.get(
          `${POLYGON_BASE_URL}/stocks/financials/v1/income-statements`,
          {
            params: {
              apiKey: POLYGON_API_KEY,
              'tickers': ticker,
              timeframe: 'trailing_twelve_months',
              limit: 1,
              sort: 'period_end.desc'
            },
            timeout: 10000,
          }
        ).catch(err => {
          console.log(`[Market Cap Service] Could not fetch income statement for ${ticker}:`, err.message);
          return null;
        });
        apiCalls.push(incomePromise);
      }

      // 4. Cash flow (only if needed)
      let cashFlowPromise: Promise<any> | null = null;
      if (needsCashFlow) {
        cashFlowPromise = axios.get(
          `${POLYGON_BASE_URL}/stocks/financials/v1/cash-flow-statements`,
          {
            params: {
              apiKey: POLYGON_API_KEY,
              'tickers': ticker,
              timeframe: 'trailing_twelve_months',
              limit: 1,
              sort: 'period_end.desc'
            },
            timeout: 10000,
          }
        ).catch(err => {
          console.log(`[Market Cap Service] Could not fetch cash flow for ${ticker}:`, err.message);
          return null;
        });
        apiCalls.push(cashFlowPromise);
      }

      // 5. Balance sheet (only if needed)
      let balanceSheetPromise: Promise<any> | null = null;
      if (needsBalanceSheet) {
        balanceSheetPromise = axios.get(
          `${POLYGON_BASE_URL}/stocks/financials/v1/balance-sheets`,
          {
            params: {
              apiKey: POLYGON_API_KEY,
              'tickers': ticker,
              timeframe: 'quarterly',
              limit: 1,
              sort: 'period_end.desc'
            },
            timeout: 10000,
          }
        ).catch(err => {
          console.log(`[Market Cap Service] Could not fetch balance sheet for ${ticker}:`, err.message);
          return null;
        });
        apiCalls.push(balanceSheetPromise);
      }

      // 6. Ratios (only if needed)
      let ratiosPromise: Promise<any> | null = null;
      if (needsRatios) {
        ratiosPromise = axios.get(
          `${POLYGON_BASE_URL}/stocks/financials/v1/ratios`,
          {
            params: {
              apiKey: POLYGON_API_KEY,
              'ticker': ticker,
              limit: 1,
              sort: 'date.desc'
            },
            timeout: 10000,
          }
        ).catch(err => {
          console.log(`[Market Cap Service] Could not fetch ratios for ${ticker}:`, err.message);
          return null;
        });
        apiCalls.push(ratiosPromise);
      }

      // Execute all API calls in parallel
      const startTime = Date.now();
      await Promise.all(apiCalls);
      const fetchTime = Date.now() - startTime;
      console.log(`[Market Cap Service] Fetched ${apiCalls.length} APIs for ${ticker} in ${fetchTime}ms (parallel)`);

      // Process ticker response
      const tickerResponse = await tickerPromise;
      if (tickerResponse.data.status !== 'OK' || !tickerResponse.data.results) {
        return null;
      }

      const result = tickerResponse.data.results;
      const marketCap = result.market_cap;
      
      if (!marketCap) {
        return null;
      }

      // Extract additional fields from ticker details
      const companyName = result.name;
      const currentPrice = result.last_updated_utc ? undefined : result.close_price;
      const sharesOutstanding = result.share_class_shares_outstanding || result.weighted_shares_outstanding;
      const sector = result.sic_description;
      const industry = result.primary_exchange;
      const description = result.description;
      const website = result.homepage_url;
      const exchange = result.primary_exchange;

      // Process 52-week data (use cached if available)
      let week52High: number | undefined = existingData?.week52High ? Number(existingData.week52High) : undefined;
      let week52Low: number | undefined = existingData?.week52Low ? Number(existingData.week52Low) : undefined;
      let snapshotPrice: number | undefined;

      if (aggregatesPromise) {
        const aggregatesResponse = await aggregatesPromise;
        if (aggregatesResponse?.data?.status === 'OK' && aggregatesResponse.data.results) {
          const bars = aggregatesResponse.data.results;
          if (bars.length > 0) {
            week52High = Math.max(...bars.map((bar: any) => bar.h));
            week52Low = Math.min(...bars.map((bar: any) => bar.l));
            snapshotPrice = bars[bars.length - 1].c;
          }
        }
      }

      // Process income statement data (use cached or fetched)
      let revenue: number | undefined = existingData?.revenue ? Number(existingData.revenue) : undefined;
      let netIncome: number | undefined = existingData?.netIncome ? Number(existingData.netIncome) : undefined;
      let operatingIncome: number | undefined = existingData?.operatingIncome ? Number(existingData.operatingIncome) : undefined;
      let grossProfit: number | undefined = existingData?.grossProfit ? Number(existingData.grossProfit) : undefined;
      let ebitda: number | undefined = existingData?.ebitda ? Number(existingData.ebitda) : undefined;
      let earningsPerShare: number | undefined = existingData?.earningsPerShare ? Number(existingData.earningsPerShare) : undefined;

      if (incomePromise) {
        const incomeResponse = await incomePromise;
        if (incomeResponse?.data?.status === 'OK' && incomeResponse.data.results?.length > 0) {
          const income = incomeResponse.data.results[0];
          revenue = income.revenue;
          netIncome = income.consolidated_net_income_loss;
          operatingIncome = income.operating_income;
          grossProfit = income.gross_profit;
          ebitda = income.ebitda;
          earningsPerShare = income.diluted_earnings_per_share;
          console.log(`[Market Cap Service] ✓ Income statement: revenue=${revenue}, netIncome=${netIncome}, EPS=${earningsPerShare}`);
        }
      }

      // Process cash flow data (use cached or fetched)
      let operatingCashFlow: number | undefined = existingData?.operatingCashFlow ? Number(existingData.operatingCashFlow) : undefined;
      let capex: number | undefined = existingData?.capex ? Number(existingData.capex) : undefined;
      let freeCashFlow: number | undefined = existingData?.freeCashflow ? Number(existingData.freeCashflow) : undefined;
      let investingCashFlow: number | undefined = existingData?.investingCashFlow ? Number(existingData.investingCashFlow) : undefined;
      let financingCashFlow: number | undefined = existingData?.financingCashFlow ? Number(existingData.financingCashFlow) : undefined;

      if (cashFlowPromise) {
        const cashFlowResponse = await cashFlowPromise;
        if (cashFlowResponse?.data?.status === 'OK' && cashFlowResponse.data.results?.length > 0) {
          const cashFlow = cashFlowResponse.data.results[0];
          operatingCashFlow = cashFlow.net_cash_from_operating_activities;
          capex = cashFlow.purchase_of_property_plant_and_equipment ? Math.abs(cashFlow.purchase_of_property_plant_and_equipment) : undefined;
          investingCashFlow = cashFlow.net_cash_from_investing_activities;
          financingCashFlow = cashFlow.net_cash_from_financing_activities;
          
          // Calculate free cash flow
          if (operatingCashFlow !== undefined && capex !== undefined) {
            freeCashFlow = operatingCashFlow - capex;
          }
          
          console.log(`[Market Cap Service] ✓ Cash flow: operatingCF=${operatingCashFlow}, capex=${capex}, freeCF=${freeCashFlow}`);
        }
      }

      // Process balance sheet data (use cached or fetched)
      let totalAssets: number | undefined = existingData?.totalAssets ? Number(existingData.totalAssets) : undefined;
      let currentAssets: number | undefined = existingData?.currentAssets ? Number(existingData.currentAssets) : undefined;
      let totalLiabilities: number | undefined = existingData?.totalLiabilities ? Number(existingData.totalLiabilities) : undefined;
      let currentLiabilities: number | undefined = existingData?.currentLiabilities ? Number(existingData.currentLiabilities) : undefined;
      let totalEquity: number | undefined = existingData?.totalEquity ? Number(existingData.totalEquity) : undefined;
      let cash: number | undefined = existingData?.cash ? Number(existingData.cash) : undefined;
      let longTermDebt: number | undefined = existingData?.longTermDebt ? Number(existingData.longTermDebt) : undefined;

      if (balanceSheetPromise) {
        const balanceSheetResponse = await balanceSheetPromise;
        if (balanceSheetResponse?.data?.status === 'OK' && balanceSheetResponse.data.results?.length > 0) {
          const balanceSheet = balanceSheetResponse.data.results[0];
          totalAssets = balanceSheet.total_assets;
          currentAssets = balanceSheet.total_current_assets;
          totalLiabilities = balanceSheet.total_liabilities;
          currentLiabilities = balanceSheet.total_current_liabilities;
          totalEquity = balanceSheet.total_equity;
          cash = balanceSheet.cash_and_equivalents;
          longTermDebt = balanceSheet.long_term_debt_and_capital_lease_obligations;
          
          console.log(`[Market Cap Service] ✓ Balance sheet: assets=${totalAssets}, liabilities=${totalLiabilities}, equity=${totalEquity}`);
        }
      }

      // Process ratios data (use cached or fetched)
      let priceToEarnings: number | undefined = existingData?.priceToEarnings ? Number(existingData.priceToEarnings) : undefined;
      let priceToBook: number | undefined = existingData?.priceToBook ? Number(existingData.priceToBook) : undefined;
      let priceToSales: number | undefined = existingData?.priceToSales ? Number(existingData.priceToSales) : undefined;
      let priceToCashFlow: number | undefined = existingData?.priceToCashFlow ? Number(existingData.priceToCashFlow) : undefined;
      let priceToFreeCashFlow: number | undefined = existingData?.priceToFreeCashFlow ? Number(existingData.priceToFreeCashFlow) : undefined;
      let enterpriseValue: number | undefined = existingData?.enterpriseValue ? Number(existingData.enterpriseValue) : undefined;
      let evToSales: number | undefined = existingData?.evToSales ? Number(existingData.evToSales) : undefined;
      let evToEbitda: number | undefined = existingData?.evToEbitda ? Number(existingData.evToEbitda) : undefined;
      let returnOnAssets: number | undefined = existingData?.returnOnAssets ? Number(existingData.returnOnAssets) : undefined;
      let returnOnEquity: number | undefined = existingData?.returnOnEquity ? Number(existingData.returnOnEquity) : undefined;
      let debtToEquity: number | undefined = existingData?.debtToEquity ? Number(existingData.debtToEquity) : undefined;
      let currentRatio: number | undefined = existingData?.currentRatio ? Number(existingData.currentRatio) : undefined;
      let quickRatio: number | undefined = existingData?.quickRatio ? Number(existingData.quickRatio) : undefined;
      let cashRatio: number | undefined = existingData?.cashRatio ? Number(existingData.cashRatio) : undefined;
      let dividendYield: number | undefined = existingData?.dividendYield ? Number(existingData.dividendYield) : undefined;
      let averageVolume: number | undefined = existingData?.averageVolume ? Number(existingData.averageVolume) : undefined;

      if (ratiosPromise) {
        const ratiosResponse = await ratiosPromise;
        if (ratiosResponse?.data?.status === 'OK' && ratiosResponse.data.results?.length > 0) {
          const ratios = ratiosResponse.data.results[0];
          
          // Valuation ratios
          priceToEarnings = ratios.price_to_earnings;
          priceToBook = ratios.price_to_book;
          priceToSales = ratios.price_to_sales;
          priceToCashFlow = ratios.price_to_cash_flow;
          priceToFreeCashFlow = ratios.price_to_free_cash_flow;
          enterpriseValue = ratios.enterprise_value;
          evToSales = ratios.ev_to_sales;
          evToEbitda = ratios.ev_to_ebitda;
          
          // Profitability ratios
          returnOnAssets = ratios.return_on_assets;
          returnOnEquity = ratios.return_on_equity;
          
          // Liquidity ratios
          debtToEquity = ratios.debt_to_equity;
          currentRatio = ratios.current;
          quickRatio = ratios.quick;
          cashRatio = ratios.cash;
          
          // Other metrics
          dividendYield = ratios.dividend_yield;
          averageVolume = ratios.average_volume;
          
          // Override free cash flow from ratios if available (more accurate)
          if (ratios.free_cash_flow !== undefined) {
            freeCashFlow = ratios.free_cash_flow;
          }
          
          console.log(`[Market Cap Service] ✓ Ratios: P/E=${priceToEarnings}, P/B=${priceToBook}, ROE=${returnOnEquity}, current=${currentRatio}`);
        }
      }

      // Calculate margins if we have the data (or use cached)
      let profitMargin: number | undefined = existingData?.profitMargin ? Number(existingData.profitMargin) : undefined;
      let operatingMargin: number | undefined = existingData?.operatingMargin ? Number(existingData.operatingMargin) : undefined;
      let grossMargin: number | undefined = existingData?.grossMargin ? Number(existingData.grossMargin) : undefined;

      // Recalculate if we have fresh income statement data
      if (needsIncomeStatement && revenue && revenue > 0) {
        if (netIncome !== undefined) {
          profitMargin = (netIncome / revenue) * 100;
        }
        if (operatingIncome !== undefined) {
          operatingMargin = (operatingIncome / revenue) * 100;
        }
        if (grossProfit !== undefined) {
          grossMargin = (grossProfit / revenue) * 100;
        }
      }

      const marketCapData: MarketCapData = {
        ticker: ticker.toUpperCase(),
        marketCap,
        week52High,
        week52Low,
        currentPrice: snapshotPrice || currentPrice,
        sharesOutstanding,
        sector,
        industry,
        description,
        website,
        exchange,
        companyName,
        updatedAt: new Date(),
      };

      // Update in PostgreSQL (upsert into Fundamental) - non-blocking
      prisma.fundamental.upsert({
        where: { ticker: marketCapData.ticker },
        update: {
          marketCap: marketCapData.marketCap,
          week52High: marketCapData.week52High,
          week52Low: marketCapData.week52Low,
          currentPrice: marketCapData.currentPrice,
          sharesOutstanding: marketCapData.sharesOutstanding,
          sector: marketCapData.sector,
          industry: marketCapData.industry,
          description: marketCapData.description,
          website: marketCapData.website,
          exchange: marketCapData.exchange,
          companyName: marketCapData.companyName,
          averageVolume,
          // Income statement fields
          revenue,
          netIncome,
          operatingIncome,
          grossProfit,
          ebitda,
          earningsPerShare,
          // Cash flow fields
          operatingCashFlow,
          investingCashFlow,
          financingCashFlow,
          capex,
          freeCashflow: freeCashFlow,
          // Balance sheet fields
          totalAssets,
          currentAssets,
          totalLiabilities,
          currentLiabilities,
          totalEquity,
          cash,
          longTermDebt,
          // Valuation ratios
          priceToEarnings,
          priceToBook,
          priceToSales,
          priceToCashFlow,
          priceToFreeCashFlow,
          enterpriseValue,
          evToSales,
          evToEbitda,
          // Profitability ratios
          returnOnAssets,
          returnOnEquity,
          profitMargin,
          operatingMargin,
          grossMargin,
          // Liquidity ratios
          debtToEquity,
          currentRatio,
          quickRatio,
          cashRatio,
          dividendYield,
          updatedAt: new Date(),
        },
        create: {
          ticker: marketCapData.ticker,
          companyName: marketCapData.companyName || marketCapData.ticker,
          marketCap: marketCapData.marketCap,
          week52High: marketCapData.week52High,
          week52Low: marketCapData.week52Low,
          currentPrice: marketCapData.currentPrice,
          sharesOutstanding: marketCapData.sharesOutstanding,
          sector: marketCapData.sector,
          industry: marketCapData.industry,
          description: marketCapData.description,
          website: marketCapData.website,
          exchange: marketCapData.exchange,
          averageVolume,
          // Income statement fields
          revenue,
          netIncome,
          operatingIncome,
          grossProfit,
          ebitda,
          earningsPerShare,
          // Cash flow fields
          operatingCashFlow,
          investingCashFlow,
          financingCashFlow,
          capex,
          freeCashflow: freeCashFlow,
          // Balance sheet fields
          totalAssets,
          currentAssets,
          totalLiabilities,
          currentLiabilities,
          totalEquity,
          cash,
          longTermDebt,
          // Valuation ratios
          priceToEarnings,
          priceToBook,
          priceToSales,
          priceToCashFlow,
          priceToFreeCashFlow,
          enterpriseValue,
          evToSales,
          evToEbitda,
          // Profitability ratios
          returnOnAssets,
          returnOnEquity,
          profitMargin,
          operatingMargin,
          grossMargin,
          // Liquidity ratios
          debtToEquity,
          currentRatio,
          quickRatio,
          cashRatio,
          dividendYield,
        },
      }).catch(err => {
        console.error(`[Market Cap Service] Error storing fundamentals for ${ticker}:`, err.message);
      });

      // Cache in Redis (7 days TTL for fundamentals data) - non-blocking
      const cacheKey = `marketcap:${ticker.toUpperCase()}`;
      setCached(cacheKey, marketCapData, CACHE_TTL.FUNDAMENTALS).catch(err => {
        console.error(`[Market Cap Service] Error caching to Redis for ${ticker}:`, err.message);
      });

      console.log(`[Market Cap Service] ✅ Fetched complete fundamentals for ${ticker}:`);
      console.log(`  Market: cap=${marketCap}, price=${snapshotPrice || currentPrice}, 52w=[${week52Low}-${week52High}]`);
      console.log(`  Income: revenue=${revenue}, netIncome=${netIncome}, EPS=${earningsPerShare}`);
      console.log(`  CashFlow: operating=${operatingCashFlow}, free=${freeCashFlow}, capex=${capex}`);
      console.log(`  Balance: assets=${totalAssets}, liabilities=${totalLiabilities}, equity=${totalEquity}`);
      console.log(`  Ratios: P/E=${priceToEarnings}, P/B=${priceToBook}, ROE=${returnOnEquity}, current=${currentRatio}`);

      return marketCapData;
    } catch (error: any) {
      // Handle 404s silently (ticker doesn't exist or is invalid)
      if (error.response?.status === 404) {
        // Cache null result to avoid repeated lookups for invalid tickers
        const cacheKey = `marketcap:${ticker.toUpperCase()}`;
        await setCached(cacheKey, null, CACHE_TTL.MARKET_CAP);
        return null;
      }
      
      // Log other errors (rate limits, network issues, etc.)
      console.error(`[Market Cap Service] Error fetching ${ticker} (${error.response?.status || 'unknown'}):`, error.message);
      return null;
    }
  }
}

export const marketCapService = new MarketCapService();

