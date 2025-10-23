/**
 * Fundamentals Service
 * Handles fetching and caching of company fundamentals data
 * 
 * Caching Strategy:
 * 1. Check Redis cache (7 days TTL)
 * 2. Check PostgreSQL database
 * 3. If data is older than 7 days, fetch from Polygon API
 * 4. Store in both Redis and PostgreSQL
 */

import axios from 'axios';
import { prisma } from '../utils/prisma';
import { getCached, setCached } from '../utils/redis';
import { CACHE_TTL, UPDATE_THRESHOLD } from '../utils/constants';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';
const POLYGON_BASE_URL = 'https://api.polygon.io';

interface FundamentalsData {
  ticker: string;
  name?: string;
  exchange?: string;
  sector?: string;
  industry?: string;
  
  // Market data
  marketCap?: number;
  sharesOutstanding?: number;
  currentPrice?: number;
  
  // Valuation ratios (from /ratios endpoint)
  priceToEarnings?: number;
  priceToBook?: number;
  priceToSales?: number;
  priceToCashFlow?: number;
  priceToFreeCashFlow?: number;
  enterpriseValue?: number;
  evToSales?: number;
  evToEbitda?: number;
  
  // Profitability ratios (from /ratios endpoint)
  returnOnAssets?: number;
  returnOnEquity?: number;
  profitMargin?: number;
  operatingMargin?: number;
  
  // Liquidity ratios (from /ratios endpoint)
  currentRatio?: number;
  quickRatio?: number;
  cashRatio?: number;
  
  // Leverage ratios (from /ratios endpoint)
  debtToEquity?: number;
  
  // Dividend metrics (from /ratios endpoint)
  dividendYield?: number;
  
  // Cash flow metrics (from /ratios endpoint)
  freeCashFlow?: number;
  
  // Income statement metrics (from /income-statements endpoint)
  revenue?: number;
  grossProfit?: number;
  operatingIncome?: number;
  netIncome?: number;
  ebitda?: number;
  earningsPerShare?: number;
  
  // Additional metrics
  beta?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  updatedAt?: Date;
}

class FundamentalsService {
  /**
   * Get fundamentals for a single ticker
   */
  async getFundamentals(ticker: string): Promise<FundamentalsData | null> {
    const tickerUpper = ticker.toUpperCase();
    const cacheKey = `fundamentals:${tickerUpper}`;

    // 1. Check Redis cache
    const cached = await getCached<FundamentalsData>(cacheKey);
    if (cached) {
      console.log(`[Fundamentals Service] Cache hit for ${tickerUpper}`);
      return cached;
    }

    // 2. Check PostgreSQL
    const dbFundamentals = await prisma.fundamental.findUnique({
      where: { ticker: tickerUpper },
    });

    if (dbFundamentals) {
      const age = Date.now() - dbFundamentals.updatedAt.getTime();
      
      // If data is fresh enough, use it
      if (age < UPDATE_THRESHOLD.FUNDAMENTALS) {
        const fundamentalsData = this.dbToFundamentalsData(dbFundamentals);
        await setCached(cacheKey, fundamentalsData, CACHE_TTL.FUNDAMENTALS);
        console.log(`[Fundamentals Service] DB hit for ${tickerUpper} (age: ${Math.round(age / 1000 / 60)} minutes)`);
        return fundamentalsData;
      }
    }

    // 3. Fetch from Polygon API
    console.log(`[Fundamentals Service] Fetching ${tickerUpper} from Polygon API`);
    return await this.fetchFromPolygon(tickerUpper);
  }

  /**
   * Get fundamentals for multiple tickers
   */
  async getBatchFundamentals(tickers: string[]): Promise<FundamentalsData[]> {
    const uniqueTickers = [...new Set(tickers.map(t => t.toUpperCase()))];
    console.log(`[Fundamentals Service] Fetching fundamentals for ${uniqueTickers.length} tickers`);
    
    const results = await Promise.all(
      uniqueTickers.map(ticker => this.getFundamentals(ticker))
    );
    
    return results.filter((f): f is FundamentalsData => f !== null);
  }

  /**
   * Fetch fundamentals from Polygon API
   * Combines data from multiple endpoints for comprehensive fundamentals
   */
  private async fetchFromPolygon(ticker: string): Promise<FundamentalsData | null> {
    try {
      // Fetch all data in parallel
      const [tickerInfo, ratios, incomeStatement, balanceSheet, cashFlow] = await Promise.allSettled([
        this.fetchTickerInfo(ticker),
        this.fetchRatios(ticker),
        this.fetchIncomeStatement(ticker),
        this.fetchBalanceSheet(ticker),
        this.fetchCashFlow(ticker),
      ]);

      // Start with basic ticker info
      const fundamentalsData: FundamentalsData = {
        ticker: ticker.toUpperCase(),
        updatedAt: new Date(),
      };

      // Merge ticker info
      if (tickerInfo.status === 'fulfilled' && tickerInfo.value) {
        Object.assign(fundamentalsData, tickerInfo.value);
      }

      // Merge ratios
      if (ratios.status === 'fulfilled' && ratios.value) {
        Object.assign(fundamentalsData, ratios.value);
      }

      // Merge income statement metrics
      if (incomeStatement.status === 'fulfilled' && incomeStatement.value) {
        Object.assign(fundamentalsData, incomeStatement.value);
      }

      // Merge balance sheet metrics
      if (balanceSheet.status === 'fulfilled' && balanceSheet.value) {
        Object.assign(fundamentalsData, balanceSheet.value);
      }

      // Merge cash flow metrics
      if (cashFlow.status === 'fulfilled' && cashFlow.value) {
        Object.assign(fundamentalsData, cashFlow.value);
      }

      // Store in PostgreSQL
      // Round BigInt fields to integers (market cap and shares don't need decimals)
      // Decimal fields (ratios, percentages) are already handled by Prisma schema
      const marketCapInt = fundamentalsData.marketCap ? BigInt(Math.round(fundamentalsData.marketCap)) : null;
      const sharesOutstandingInt = fundamentalsData.sharesOutstanding ? BigInt(Math.round(fundamentalsData.sharesOutstanding)) : null;
      const enterpriseValueInt = fundamentalsData.enterpriseValue ? BigInt(Math.round(fundamentalsData.enterpriseValue)) : null;
      const freeCashFlowInt = fundamentalsData.freeCashFlow ? BigInt(Math.round(fundamentalsData.freeCashFlow)) : null;
      
      const updateData = {
        companyName: fundamentalsData.name || '',
        exchange: fundamentalsData.exchange,
        sector: fundamentalsData.sector,
        industry: fundamentalsData.industry,
        marketCap: marketCapInt,
        sharesOutstanding: sharesOutstandingInt,
        currentPrice: fundamentalsData.currentPrice,
        
        // Valuation ratios
        priceToEarnings: fundamentalsData.priceToEarnings,
        priceToBook: fundamentalsData.priceToBook,
        priceToSales: fundamentalsData.priceToSales,
        enterpriseValue: enterpriseValueInt,
        
        // Profitability ratios
        profitMargin: fundamentalsData.profitMargin,
        operatingMargin: fundamentalsData.operatingMargin,
        returnOnAssets: fundamentalsData.returnOnAssets,
        returnOnEquity: fundamentalsData.returnOnEquity,
        
        // Liquidity & leverage ratios
        debtToEquity: fundamentalsData.debtToEquity,
        currentRatio: fundamentalsData.currentRatio,
        
        // Dividend & cash flow
        dividendYield: fundamentalsData.dividendYield,
        freeCashflow: freeCashFlowInt,
        
        updatedAt: new Date(),
      };
      
      await prisma.fundamental.upsert({
        where: { ticker: fundamentalsData.ticker },
        update: updateData,
        create: {
          ticker: fundamentalsData.ticker,
          ...updateData,
        },
      });

      // Cache in Redis
      const cacheKey = `fundamentals:${ticker.toUpperCase()}`;
      await setCached(cacheKey, fundamentalsData, CACHE_TTL.FUNDAMENTALS);

      return fundamentalsData;
    } catch (error: any) {
      console.error(`[Fundamentals Service] Error fetching ${ticker}:`, error.message);
      return null;
    }
  }

  /**
   * Fetch basic ticker info from Polygon
   */
  private async fetchTickerInfo(ticker: string): Promise<Partial<FundamentalsData> | null> {
    try {
      const response = await axios.get(
        `${POLYGON_BASE_URL}/v3/reference/tickers/${ticker}`,
        {
          params: { apiKey: POLYGON_API_KEY },
          timeout: 10000,
        }
      );

      if (response.data.status !== 'OK' || !response.data.results) {
        return null;
      }

      const result = response.data.results;
      return {
        name: result.name,
        exchange: result.primary_exchange,
        sector: result.sic_description,
        industry: result.sic_description,
        marketCap: result.market_cap,
        sharesOutstanding: result.share_class_shares_outstanding,
      };
    } catch (error: any) {
      console.error(`[Fundamentals Service] Error fetching ticker info for ${ticker}:`, error.message);
      return null;
    }
  }

  /**
   * Fetch financial ratios from Polygon
   * Reference: https://polygon.io/docs/rest/stocks/fundamentals/ratios
   */
  private async fetchRatios(ticker: string): Promise<Partial<FundamentalsData> | null> {
    try {
      const response = await axios.get(
        `${POLYGON_BASE_URL}/stocks/financials/v1/ratios`,
        {
          params: {
            ticker: ticker,
            limit: 1,
            sort: 'date.desc',
            apiKey: POLYGON_API_KEY,
          },
          timeout: 10000,
        }
      );

      if (response.data.status !== 'OK' || !response.data.results || response.data.results.length === 0) {
        return null;
      }

      const result = response.data.results[0];
      return {
        // Current price and market data
        currentPrice: result.price,
        marketCap: result.market_cap,
        earningsPerShare: result.earnings_per_share,
        
        // Valuation ratios
        priceToEarnings: result.price_to_earnings,
        priceToBook: result.price_to_book,
        priceToSales: result.price_to_sales,
        priceToCashFlow: result.price_to_cash_flow,
        priceToFreeCashFlow: result.price_to_free_cash_flow,
        enterpriseValue: result.enterprise_value,
        evToSales: result.ev_to_sales,
        evToEbitda: result.ev_to_ebitda,
        
        // Profitability ratios
        returnOnAssets: result.return_on_assets,
        returnOnEquity: result.return_on_equity,
        
        // Liquidity ratios
        currentRatio: result.current,
        quickRatio: result.quick,
        cashRatio: result.cash,
        
        // Leverage ratios
        debtToEquity: result.debt_to_equity,
        
        // Dividend metrics
        dividendYield: result.dividend_yield,
        
        // Cash flow metrics
        freeCashFlow: result.free_cash_flow,
      };
    } catch (error: any) {
      console.error(`[Fundamentals Service] Error fetching ratios for ${ticker}:`, error.message);
      return null;
    }
  }

  /**
   * Fetch income statement from Polygon
   * Reference: https://polygon.io/docs/api/llms/rest/stocks/fundamentals/income-statements
   */
  private async fetchIncomeStatement(ticker: string): Promise<Partial<FundamentalsData> | null> {
    try {
      const response = await axios.get(
        `${POLYGON_BASE_URL}/stocks/financials/v1/income-statements`,
        {
          params: {
            tickers: ticker,
            timeframe: 'trailing_twelve_months',
            limit: 1,
            sort: 'period_end.desc',
            apiKey: POLYGON_API_KEY,
          },
          timeout: 10000,
        }
      );

      if (response.data.status !== 'OK' || !response.data.results || response.data.results.length === 0) {
        return null;
      }

      const result = response.data.results[0];
      
      // Extract key income statement metrics
      const revenue = result.revenue;
      const grossProfit = result.gross_profit;
      const operatingIncome = result.operating_income;
      const netIncome = result.net_income_loss_attributable_common_shareholders;
      const ebitda = result.ebitda;
      
      // Calculate margins if we have revenue
      const profitMargin = revenue && netIncome ? netIncome / revenue : undefined;
      const operatingMargin = revenue && operatingIncome ? operatingIncome / revenue : undefined;

      return {
        revenue,
        grossProfit,
        operatingIncome,
        netIncome,
        ebitda,
        profitMargin,
        operatingMargin,
      };
    } catch (error: any) {
      console.error(`[Fundamentals Service] Error fetching income statement for ${ticker}:`, error.message);
      return null;
    }
  }

  /**
   * Fetch balance sheet from Polygon
   */
  private async fetchBalanceSheet(ticker: string): Promise<Partial<FundamentalsData> | null> {
    try {
      const response = await axios.get(
        `${POLYGON_BASE_URL}/stocks/financials/v1/balance-sheets`,
        {
          params: {
            tickers: ticker,
            timeframe: 'quarterly',
            limit: 1,
            sort: 'period_end.desc',
            apiKey: POLYGON_API_KEY,
          },
          timeout: 10000,
        }
      );

      if (response.data.status !== 'OK' || !response.data.results || response.data.results.length === 0) {
        return null;
      }

      const result = response.data.results[0];
      
      // Calculate current ratio if we have the data
      const currentRatio = result.current_assets && result.current_liabilities
        ? result.current_assets / result.current_liabilities
        : undefined;

      return {
        currentRatio,
      };
    } catch (error: any) {
      console.error(`[Fundamentals Service] Error fetching balance sheet for ${ticker}:`, error.message);
      return null;
    }
  }

  /**
   * Fetch cash flow statement from Polygon
   */
  private async fetchCashFlow(ticker: string): Promise<Partial<FundamentalsData> | null> {
    try {
      const response = await axios.get(
        `${POLYGON_BASE_URL}/stocks/financials/v1/cash-flow-statements`,
        {
          params: {
            tickers: ticker,
            timeframe: 'trailing_twelve_months',
            limit: 1,
            sort: 'period_end.desc',
            apiKey: POLYGON_API_KEY,
          },
          timeout: 10000,
        }
      );

      if (response.data.status !== 'OK' || !response.data.results || response.data.results.length === 0) {
        return null;
      }

      // Cash flow data is available but we're not storing it in the current schema
      // This can be extended when we add more fields to the schema
      return {};
    } catch (error: any) {
      console.error(`[Fundamentals Service] Error fetching cash flow for ${ticker}:`, error.message);
      return null;
    }
  }

  /**
   * Convert database record to FundamentalsData
   */
  private dbToFundamentalsData(db: any): FundamentalsData {
    return {
      ticker: db.ticker,
      name: db.companyName,
      exchange: db.exchange,
      sector: db.sector,
      industry: db.industry,
      
      // Market data - Convert BigInt to number for JSON serialization
      marketCap: db.marketCap ? Number(db.marketCap) : undefined,
      sharesOutstanding: db.sharesOutstanding ? Number(db.sharesOutstanding) : undefined,
      currentPrice: db.currentPrice ? Number(db.currentPrice) : undefined,
      
      // Valuation ratios
      priceToEarnings: db.priceToEarnings ? Number(db.priceToEarnings) : undefined,
      priceToBook: db.priceToBook ? Number(db.priceToBook) : undefined,
      priceToSales: db.priceToSales ? Number(db.priceToSales) : undefined,
      priceToCashFlow: db.priceToCashFlow ? Number(db.priceToCashFlow) : undefined,
      priceToFreeCashFlow: db.priceToFreeCashFlow ? Number(db.priceToFreeCashFlow) : undefined,
      enterpriseValue: db.enterpriseValue ? Number(db.enterpriseValue) : undefined,
      evToSales: db.evToSales ? Number(db.evToSales) : undefined,
      evToEbitda: db.evToEbitda ? Number(db.evToEbitda) : undefined,
      
      // Profitability ratios
      profitMargin: db.profitMargin ? Number(db.profitMargin) : undefined,
      operatingMargin: db.operatingMargin ? Number(db.operatingMargin) : undefined,
      returnOnAssets: db.returnOnAssets ? Number(db.returnOnAssets) : undefined,
      returnOnEquity: db.returnOnEquity ? Number(db.returnOnEquity) : undefined,
      
      // Liquidity ratios
      currentRatio: db.currentRatio ? Number(db.currentRatio) : undefined,
      quickRatio: db.quickRatio ? Number(db.quickRatio) : undefined,
      cashRatio: db.cashRatio ? Number(db.cashRatio) : undefined,
      
      // Leverage ratios
      debtToEquity: db.debtToEquity ? Number(db.debtToEquity) : undefined,
      
      // Dividend & cash flow
      dividendYield: db.dividendYield ? Number(db.dividendYield) : undefined,
      freeCashFlow: db.freeCashflow ? Number(db.freeCashflow) : undefined,
      
      // Income statement metrics
      revenue: db.revenue ? Number(db.revenue) : undefined,
      grossProfit: db.grossProfit ? Number(db.grossProfit) : undefined,
      operatingIncome: db.operatingIncome ? Number(db.operatingIncome) : undefined,
      netIncome: db.netIncome ? Number(db.netIncome) : undefined,
      ebitda: db.ebitda ? Number(db.ebitda) : undefined,
      earningsPerShare: db.earningsPerShare ? Number(db.earningsPerShare) : undefined,
      
      // Additional metrics
      beta: db.beta ? Number(db.beta) : undefined,
      fiftyTwoWeekHigh: db.fiftyTwoWeekHigh ? Number(db.fiftyTwoWeekHigh) : undefined,
      fiftyTwoWeekLow: db.fiftyTwoWeekLow ? Number(db.fiftyTwoWeekLow) : undefined,
      
      updatedAt: db.updatedAt,
    };
  }
}

export const fundamentalsService = new FundamentalsService();

