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
  website?: string;
  description?: string;
  currency?: string;
  employees?: number;
  
  // Market data
  marketCap?: number;
  sharesOutstanding?: number;
  currentPrice?: number;
  averageVolume?: number;
  
  // Valuation ratios (from /ratios endpoint)
  priceToEarnings?: number;
  priceToBook?: number;
  priceToSales?: number;
  priceToCashFlow?: number;
  priceToOperatingCashFlow?: number;  // Same as priceToCashFlow
  priceToFreeCashFlow?: number;
  enterpriseValue?: number;
  evToSales?: number;
  evToEbitda?: number;
  earningsPerShare?: number;
  
  // Profitability ratios (from /ratios endpoint & income statements)
  returnOnAssets?: number;
  returnOnEquity?: number;
  profitMargin?: number;
  operatingMargin?: number;
  grossMargin?: number;
  revenueGrowth?: number;
  earningsGrowth?: number;
  
  // Liquidity ratios (from /ratios endpoint)
  currentRatio?: number;
  quickRatio?: number;
  cashRatio?: number;
  
  // Leverage ratios (from /ratios endpoint)
  debtToEquity?: number;
  
  // Dividend metrics (from /ratios endpoint)
  dividendYield?: number;
  dividendRate?: number;
  
  // Cash flow metrics (from /ratios endpoint)
  freeCashFlow?: number;
  
  // Income statement metrics (from /income-statements endpoint)
  revenue?: number;
  grossProfit?: number;
  operatingIncome?: number;
  netIncome?: number;
  ebitda?: number;
  
  // Balance Sheet metrics (from /balance-sheets endpoint)
  totalAssets?: number;
  currentAssets?: number;
  totalLiabilities?: number;
  currentLiabilities?: number;
  totalEquity?: number;
  cash?: number;
  longTermDebt?: number;
  
  // Cash Flow Statement metrics (from /cash-flow-statements endpoint)
  operatingCashFlow?: number;
  cashFromInvesting?: number;  // investingCashFlow
  cashFromFinancing?: number;  // financingCashFlow
  capitalExpenditures?: number;  // capex
  
  // Additional metrics
  beta?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  updatedAt?: Date;
}

class FundamentalsService {
  /**
   * Check if fundamentals data is incomplete (missing critical fields)
   */
  private isIncompleteData(data: FundamentalsData): boolean {
    const missingFields: string[] = [];
    
    // Critical fields that should be present for complete data
    // Basic company info
    if (!data.exchange) missingFields.push('exchange');
    if (!data.sector) missingFields.push('sector');
    if (!data.industry) missingFields.push('industry');
    
    // Market data - these should always be available for public companies
    if (!data.marketCap) missingFields.push('marketCap');
    if (!data.currentPrice) missingFields.push('currentPrice');
    
    // Balance sheet fundamentals - at least total assets should exist
    if (!data.totalAssets) missingFields.push('totalAssets');
    
    // Income statement - revenue should always be available
    if (!data.revenue) missingFields.push('revenue');
    
    // Cash flow - operating cash flow should be available
    if (!data.operatingCashFlow) missingFields.push('operatingCashFlow');
    
    if (missingFields.length > 0) {
      console.log(`[Fundamentals Service] Missing critical fields for ${data.ticker}: ${missingFields.join(', ')}`);
      return true;
    }
    
    return false;
  }

  /**
   * Get fundamentals for a single ticker
   */
  async getFundamentals(ticker: string): Promise<FundamentalsData | null> {
    const tickerUpper = ticker.toUpperCase();
    const cacheKey = `fundamentals:${tickerUpper}`;

    // 1. Check Redis cache
    const cached = await getCached<FundamentalsData>(cacheKey);
    if (cached) {
      // Check if cached data is incomplete
      if (this.isIncompleteData(cached)) {
        console.log(`[Fundamentals Service] Incomplete cached data for ${tickerUpper}, refetching...`);
        await this.clearCache(tickerUpper);
        return await this.fetchFromPolygon(tickerUpper);
      }
      return cached;
    }

    // 2. Check PostgreSQL
    const dbFundamentals = await prisma.fundamental.findUnique({
      where: { ticker: tickerUpper },
    });

    if (dbFundamentals) {
      const age = Date.now() - dbFundamentals.updatedAt.getTime();
      
      // If data is fresh enough, check if it's complete
      if (age < UPDATE_THRESHOLD.FUNDAMENTALS) {
        const fundamentalsData = this.dbToFundamentalsData(dbFundamentals);
        
        // Check if data is incomplete
        if (this.isIncompleteData(fundamentalsData)) {
          console.log(`[Fundamentals Service] Incomplete DB data for ${tickerUpper}, refetching...`);
          await this.clearCache(tickerUpper);
          return await this.fetchFromPolygon(tickerUpper);
        }
        
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
      const [tickerInfo, ratios, incomeStatement, balanceSheet, cashFlow, week52Data] = await Promise.allSettled([
        this.fetchTickerInfo(ticker),
        this.fetchRatios(ticker),
        this.fetchIncomeStatement(ticker),
        this.fetchBalanceSheet(ticker),
        this.fetchCashFlow(ticker),
        this.fetch52WeekData(ticker),
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

      // Merge 52-week data
      if (week52Data.status === 'fulfilled' && week52Data.value) {
        Object.assign(fundamentalsData, week52Data.value);
      }

      // Store in PostgreSQL
      // All numeric fields are now Decimal type in the schema
      const updateData = {
        companyName: fundamentalsData.name || '',
        exchange: fundamentalsData.exchange,
        sector: fundamentalsData.sector,
        industry: fundamentalsData.industry,
        website: fundamentalsData.website,
        description: fundamentalsData.description,
        currency: fundamentalsData.currency,
        employees: fundamentalsData.employees,
        marketCap: fundamentalsData.marketCap,
        sharesOutstanding: fundamentalsData.sharesOutstanding,
        currentPrice: fundamentalsData.currentPrice,
        averageVolume: fundamentalsData.averageVolume,
        week52High: fundamentalsData.fiftyTwoWeekHigh,
        week52Low: fundamentalsData.fiftyTwoWeekLow,
        
        // Valuation ratios
        priceToEarnings: fundamentalsData.priceToEarnings,
        priceToBook: fundamentalsData.priceToBook,
        priceToSales: fundamentalsData.priceToSales,
        priceToCashFlow: fundamentalsData.priceToCashFlow,
        priceToFreeCashFlow: fundamentalsData.priceToFreeCashFlow,
        enterpriseValue: fundamentalsData.enterpriseValue,
        evToSales: fundamentalsData.evToSales,
        evToEbitda: fundamentalsData.evToEbitda,
        
        // Profitability ratios
        profitMargin: fundamentalsData.profitMargin,
        operatingMargin: fundamentalsData.operatingMargin,
        grossMargin: fundamentalsData.grossMargin,
        returnOnAssets: fundamentalsData.returnOnAssets,
        returnOnEquity: fundamentalsData.returnOnEquity,
        revenueGrowth: fundamentalsData.revenueGrowth,
        earningsGrowth: fundamentalsData.earningsGrowth,
        
        // Liquidity & leverage ratios
        debtToEquity: fundamentalsData.debtToEquity,
        currentRatio: fundamentalsData.currentRatio,
        quickRatio: fundamentalsData.quickRatio,
        cashRatio: fundamentalsData.cashRatio,
        
        // Dividend & cash flow
        dividendYield: fundamentalsData.dividendYield,
        dividendRate: fundamentalsData.dividendRate,
        freeCashflow: fundamentalsData.freeCashFlow,
        
        // Income statement metrics
        revenue: fundamentalsData.revenue,
        grossProfit: fundamentalsData.grossProfit,
        operatingIncome: fundamentalsData.operatingIncome,
        netIncome: fundamentalsData.netIncome,
        ebitda: fundamentalsData.ebitda,
        earningsPerShare: fundamentalsData.earningsPerShare,
        
        // Balance Sheet fields
        totalAssets: fundamentalsData.totalAssets,
        currentAssets: fundamentalsData.currentAssets,
        totalLiabilities: fundamentalsData.totalLiabilities,
        currentLiabilities: fundamentalsData.currentLiabilities,
        totalEquity: fundamentalsData.totalEquity,
        cash: fundamentalsData.cash,
        longTermDebt: fundamentalsData.longTermDebt,
        
        // Cash Flow fields
        operatingCashFlow: fundamentalsData.operatingCashFlow,
        investingCashFlow: fundamentalsData.cashFromInvesting,
        financingCashFlow: fundamentalsData.cashFromFinancing,
        capex: fundamentalsData.capitalExpenditures,
        
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
        // Additional fields from ticker endpoint
        description: result.description,
        website: result.homepage_url,
        employees: result.total_employees,
        currency: result.currency_name?.toUpperCase(),
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
            // Note: The ratios endpoint doesn't support sorting by date
            // It returns the most recent data by default
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
        averageVolume: result.average_volume,
        earningsPerShare: result.earnings_per_share,
        
        // Valuation ratios
        priceToEarnings: result.price_to_earnings,
        priceToBook: result.price_to_book,
        priceToSales: result.price_to_sales,
        priceToCashFlow: result.price_to_cash_flow,
        priceToOperatingCashFlow: result.price_to_cash_flow,  // Same value
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
   * Fetches 2 years of annual data to calculate YoY growth
   * Reference: https://polygon.io/docs/api/llms/rest/stocks/fundamentals/income-statements
   */
  private async fetchIncomeStatement(ticker: string): Promise<Partial<FundamentalsData> | null> {
    try {
      const response = await axios.get(
        `${POLYGON_BASE_URL}/stocks/financials/v1/income-statements`,
        {
          params: {
            tickers: ticker,
            timeframe: 'annual',
            limit: 2, // Fetch 2 years for YoY growth calculation
            sort: 'period_end.desc',
            apiKey: POLYGON_API_KEY,
          },
          timeout: 10000,
        }
      );

      if (response.data.status !== 'OK' || !response.data.results || response.data.results.length === 0) {
        return null;
      }

      const currentYear = response.data.results[0];
      
      // Extract key income statement metrics from current year
      const revenue = currentYear.revenue;
      const grossProfit = currentYear.gross_profit;
      const operatingIncome = currentYear.operating_income;
      const netIncome = currentYear.net_income_loss_attributable_common_shareholders;
      const ebitda = currentYear.ebitda;
      
      // Calculate margins if we have revenue
      const profitMargin = revenue && netIncome ? netIncome / revenue : undefined;
      const operatingMargin = revenue && operatingIncome ? operatingIncome / revenue : undefined;
      const grossMargin = revenue && grossProfit ? grossProfit / revenue : undefined;

      // Calculate YoY growth if we have 2 years of data
      let revenueGrowth: number | undefined;
      let earningsGrowth: number | undefined;

      if (response.data.results.length >= 2) {
        const previousYear = response.data.results[1];
        
        // Revenue Growth (YoY)
        if (revenue && previousYear.revenue && previousYear.revenue !== 0) {
          revenueGrowth = ((revenue - previousYear.revenue) / previousYear.revenue) * 100;
        }
        
        // Earnings Growth (YoY)
        const prevNetIncome = previousYear.net_income_loss_attributable_common_shareholders;
        if (netIncome && prevNetIncome && prevNetIncome !== 0) {
          earningsGrowth = ((netIncome - prevNetIncome) / prevNetIncome) * 100;
        }

        console.log(`[Fundamentals Service] ✓ Growth for ${ticker}: revenue=${revenueGrowth?.toFixed(1)}%, earnings=${earningsGrowth?.toFixed(1)}%`);
      }

      return {
        revenue,
        grossProfit,
        operatingIncome,
        netIncome,
        ebitda,
        profitMargin,
        operatingMargin,
        grossMargin,
        revenueGrowth,
        earningsGrowth,
      };
    } catch (error: any) {
      console.error(`[Fundamentals Service] Error fetching income statement for ${ticker}:`, error.message);
      return null;
    }
  }

  /**
   * Fetch balance sheet from Polygon
   * Reference: https://polygon.io/docs/rest/stocks/fundamentals/balance-sheets
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
      const currentRatio = result.total_current_assets && result.total_current_liabilities
        ? result.total_current_assets / result.total_current_liabilities
        : undefined;

      return {
        totalAssets: result.total_assets,
        currentAssets: result.total_current_assets,
        totalLiabilities: result.total_liabilities,
        currentLiabilities: result.total_current_liabilities,
        totalEquity: result.total_equity,
        cash: result.cash_and_equivalents,
        longTermDebt: result.long_term_debt_and_capital_lease_obligations,
        currentRatio,
      };
    } catch (error: any) {
      console.error(`[Fundamentals Service] Error fetching balance sheet for ${ticker}:`, error.message);
      return null;
    }
  }

  /**
   * Fetch cash flow statement from Polygon
   * Reference: https://polygon.io/docs/rest/stocks/fundamentals/cash-flow-statements
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

      const result = response.data.results[0];
      
      return {
        operatingCashFlow: result.net_cash_from_operating_activities,
        cashFromInvesting: result.net_cash_from_investing_activities,
        cashFromFinancing: result.net_cash_from_financing_activities,
        capitalExpenditures: result.purchase_of_property_plant_and_equipment,
        // Note: freeCashFlow is already fetched from ratios endpoint
      };
    } catch (error: any) {
      console.error(`[Fundamentals Service] Error fetching cash flow for ${ticker}:`, error.message);
      return null;
    }
  }

  /**
   * Fetch 52-week high/low data from Polygon aggregates API
   */
  private async fetch52WeekData(ticker: string): Promise<Partial<FundamentalsData> | null> {
    try {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const fromDate = oneYearAgo.toISOString().split('T')[0];
      const toDate = new Date().toISOString().split('T')[0];
      
      const response = await axios.get(
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
      );

      if (response.data.status !== 'OK' || !response.data.results || response.data.results.length === 0) {
        return null;
      }

      const bars = response.data.results;
      const fiftyTwoWeekHigh = Math.max(...bars.map((bar: any) => bar.h));
      const fiftyTwoWeekLow = Math.min(...bars.map((bar: any) => bar.l));

      console.log(`[Fundamentals Service] ✓ 52-week data for ${ticker}: high=${fiftyTwoWeekHigh}, low=${fiftyTwoWeekLow}`);

      return {
        fiftyTwoWeekHigh,
        fiftyTwoWeekLow,
      };
    } catch (error: any) {
      console.error(`[Fundamentals Service] Error fetching 52-week data for ${ticker}:`, error.message);
      return null;
    }
  }

  /**
   * Clear cache and database entry for a ticker
   */
  async clearCache(ticker: string): Promise<{ success: boolean; message: string }> {
    const tickerUpper = ticker.toUpperCase();
    const cacheKey = `fundamentals:${tickerUpper}`;

    try {
      // Delete from Redis cache
      const { deleteCached } = await import('../utils/redis');
      await deleteCached(cacheKey);
      console.log(`[Fundamentals Service] Cleared Redis cache for ${tickerUpper}`);

      // Delete from PostgreSQL (using deleteMany to avoid errors if record doesn't exist)
      const deleteResult = await prisma.fundamental.deleteMany({
        where: { ticker: tickerUpper },
      });
      
      if (deleteResult.count > 0) {
        console.log(`[Fundamentals Service] Cleared database entry for ${tickerUpper}`);
      } else {
        console.log(`[Fundamentals Service] No database entry found for ${tickerUpper}`);
      }

      return {
        success: true,
        message: `Cache and database entry cleared for ${tickerUpper}`,
      };
    } catch (error: any) {
      console.error(`[Fundamentals Service] Error clearing cache for ${ticker}:`, error.message);
      return {
        success: false,
        message: `Error clearing cache: ${error.message}`,
      };
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
      website: db.website,
      description: db.description,
      currency: db.currency,
      employees: db.employees,
      
      // Market data - Convert Decimal to number for JSON serialization
      marketCap: db.marketCap ? Number(db.marketCap) : undefined,
      sharesOutstanding: db.sharesOutstanding ? Number(db.sharesOutstanding) : undefined,
      currentPrice: db.currentPrice ? Number(db.currentPrice) : undefined,
      averageVolume: db.averageVolume ? Number(db.averageVolume) : undefined,
      
      // Valuation ratios
      priceToEarnings: db.priceToEarnings ? Number(db.priceToEarnings) : undefined,
      priceToBook: db.priceToBook ? Number(db.priceToBook) : undefined,
      priceToSales: db.priceToSales ? Number(db.priceToSales) : undefined,
      priceToCashFlow: db.priceToCashFlow ? Number(db.priceToCashFlow) : undefined,
      priceToOperatingCashFlow: db.priceToCashFlow ? Number(db.priceToCashFlow) : undefined,  // Same value
      priceToFreeCashFlow: db.priceToFreeCashFlow ? Number(db.priceToFreeCashFlow) : undefined,
      enterpriseValue: db.enterpriseValue ? Number(db.enterpriseValue) : undefined,
      evToSales: db.evToSales ? Number(db.evToSales) : undefined,
      evToEbitda: db.evToEbitda ? Number(db.evToEbitda) : undefined,
      earningsPerShare: db.earningsPerShare ? Number(db.earningsPerShare) : undefined,
      
      // Profitability ratios
      profitMargin: db.profitMargin ? Number(db.profitMargin) : undefined,
      operatingMargin: db.operatingMargin ? Number(db.operatingMargin) : undefined,
      grossMargin: db.grossMargin ? Number(db.grossMargin) : undefined,
      returnOnAssets: db.returnOnAssets ? Number(db.returnOnAssets) : undefined,
      returnOnEquity: db.returnOnEquity ? Number(db.returnOnEquity) : undefined,
      revenueGrowth: db.revenueGrowth ? Number(db.revenueGrowth) : undefined,
      earningsGrowth: db.earningsGrowth ? Number(db.earningsGrowth) : undefined,
      
      // Liquidity ratios
      currentRatio: db.currentRatio ? Number(db.currentRatio) : undefined,
      quickRatio: db.quickRatio ? Number(db.quickRatio) : undefined,
      cashRatio: db.cashRatio ? Number(db.cashRatio) : undefined,
      
      // Leverage ratios
      debtToEquity: db.debtToEquity ? Number(db.debtToEquity) : undefined,
      
      // Dividend & cash flow
      dividendYield: db.dividendYield ? Number(db.dividendYield) : undefined,
      dividendRate: db.dividendRate ? Number(db.dividendRate) : undefined,
      freeCashFlow: db.freeCashflow ? Number(db.freeCashflow) : undefined,
      
      // Income statement metrics
      revenue: db.revenue ? Number(db.revenue) : undefined,
      grossProfit: db.grossProfit ? Number(db.grossProfit) : undefined,
      operatingIncome: db.operatingIncome ? Number(db.operatingIncome) : undefined,
      netIncome: db.netIncome ? Number(db.netIncome) : undefined,
      ebitda: db.ebitda ? Number(db.ebitda) : undefined,
      
      // Balance Sheet metrics
      totalAssets: db.totalAssets ? Number(db.totalAssets) : undefined,
      currentAssets: db.currentAssets ? Number(db.currentAssets) : undefined,
      totalLiabilities: db.totalLiabilities ? Number(db.totalLiabilities) : undefined,
      currentLiabilities: db.currentLiabilities ? Number(db.currentLiabilities) : undefined,
      totalEquity: db.totalEquity ? Number(db.totalEquity) : undefined,
      cash: db.cash ? Number(db.cash) : undefined,
      longTermDebt: db.longTermDebt ? Number(db.longTermDebt) : undefined,
      
      // Cash Flow metrics
      operatingCashFlow: db.operatingCashFlow ? Number(db.operatingCashFlow) : undefined,
      cashFromInvesting: db.investingCashFlow ? Number(db.investingCashFlow) : undefined,
      cashFromFinancing: db.financingCashFlow ? Number(db.financingCashFlow) : undefined,
      capitalExpenditures: db.capex ? Number(db.capex) : undefined,
      
      // Additional metrics
      beta: db.beta ? Number(db.beta) : undefined,
      fiftyTwoWeekHigh: db.week52High ? Number(db.week52High) : undefined,
      fiftyTwoWeekLow: db.week52Low ? Number(db.week52Low) : undefined,
      
      updatedAt: db.updatedAt,
    };
  }
}

export const fundamentalsService = new FundamentalsService();

