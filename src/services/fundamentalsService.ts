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
  marketCap?: number;
  sharesOutstanding?: number;
  priceToEarnings?: number;
  forwardPE?: number;
  priceToBook?: number;
  priceToSales?: number;
  enterpriseValue?: number;
  profitMargin?: number;
  operatingMargin?: number;
  returnOnAssets?: number;
  returnOnEquity?: number;
  debtToEquity?: number;
  currentRatio?: number;
  revenueGrowth?: number;
  earningsGrowth?: number;
  dividendYield?: number;
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
   */
  private async fetchFromPolygon(ticker: string): Promise<FundamentalsData | null> {
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
      
      const fundamentalsData: FundamentalsData = {
        ticker: ticker.toUpperCase(),
        name: result.name,
        exchange: result.primary_exchange,
        sector: result.sic_description,
        industry: result.sic_description,
        marketCap: result.market_cap,
        sharesOutstanding: result.share_class_shares_outstanding,
        updatedAt: new Date(),
      };

      // Store in PostgreSQL
      // Round BigInt fields to integers (market cap and shares don't need decimals)
      // Decimal fields (ratios, percentages) are already handled by Prisma schema
      const marketCapInt = fundamentalsData.marketCap ? BigInt(Math.round(fundamentalsData.marketCap)) : null;
      const sharesOutstandingInt = fundamentalsData.sharesOutstanding ? BigInt(Math.round(fundamentalsData.sharesOutstanding)) : null;
      
      await prisma.fundamental.upsert({
        where: { ticker: fundamentalsData.ticker },
        update: {
          companyName: fundamentalsData.name || '',
          exchange: fundamentalsData.exchange,
          sector: fundamentalsData.sector,
          industry: fundamentalsData.industry,
          marketCap: marketCapInt,
          sharesOutstanding: sharesOutstandingInt,
          updatedAt: new Date(),
        },
        create: {
          ticker: fundamentalsData.ticker,
          companyName: fundamentalsData.name || '',
          exchange: fundamentalsData.exchange,
          sector: fundamentalsData.sector,
          industry: fundamentalsData.industry,
          marketCap: marketCapInt,
          sharesOutstanding: sharesOutstandingInt,
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
   * Convert database record to FundamentalsData
   */
  private dbToFundamentalsData(db: any): FundamentalsData {
    return {
      ticker: db.ticker,
      name: db.name,
      exchange: db.exchange,
      sector: db.sector,
      industry: db.industry,
      marketCap: db.marketCap,
      sharesOutstanding: db.sharesOutstanding,
      priceToEarnings: db.priceToEarnings,
      forwardPE: db.forwardPE,
      priceToBook: db.priceToBook,
      priceToSales: db.priceToSales,
      enterpriseValue: db.enterpriseValue,
      profitMargin: db.profitMargin,
      operatingMargin: db.operatingMargin,
      returnOnAssets: db.returnOnAssets,
      returnOnEquity: db.returnOnEquity,
      debtToEquity: db.debtToEquity,
      currentRatio: db.currentRatio,
      revenueGrowth: db.revenueGrowth,
      earningsGrowth: db.earningsGrowth,
      dividendYield: db.dividendYield,
      beta: db.beta,
      fiftyTwoWeekHigh: db.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: db.fiftyTwoWeekLow,
      updatedAt: db.updatedAt,
    };
  }
}

export const fundamentalsService = new FundamentalsService();

