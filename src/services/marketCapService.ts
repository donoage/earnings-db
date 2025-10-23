/**
 * Market Cap Service
 * Handles fetching and caching of market cap data
 * 
 * Caching Strategy:
 * 1. Check Redis cache (24 hours TTL)
 * 2. Check PostgreSQL database
 * 3. If data is older than 24 hours, fetch from Polygon API
 * 4. Store in both Redis and PostgreSQL
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
      console.log(`[Market Cap Service] Cache hit for ${tickerUpper}`);
      return cached;
    }

    // 2. Check PostgreSQL (from Fundamental table)
    const dbData = await prisma.fundamental.findUnique({
      where: { ticker: tickerUpper },
      select: { ticker: true, marketCap: true, updatedAt: true },
    });

    if (dbData && dbData.marketCap) {
      const age = Date.now() - dbData.updatedAt.getTime();
      
      // If data is fresh enough, use it
      if (age < UPDATE_THRESHOLD.MARKET_CAP) {
        const marketCapData: MarketCapData = {
          ticker: dbData.ticker,
          marketCap: Number(dbData.marketCap),
          updatedAt: dbData.updatedAt,
        };
        await setCached(cacheKey, marketCapData, CACHE_TTL.MARKET_CAP);
        console.log(`[Market Cap Service] DB hit for ${tickerUpper} (age: ${Math.round(age / 1000 / 60)} minutes)`);
        return marketCapData;
      }
    }

    // 3. Fetch from Polygon API
    console.log(`[Market Cap Service] Fetching ${tickerUpper} from Polygon API`);
    return await this.fetchFromPolygon(tickerUpper);
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
   * Fetch market cap from Polygon API
   */
  private async fetchFromPolygon(ticker: string): Promise<MarketCapData | null> {
    try {
      if (!POLYGON_API_KEY) {
        console.error(`[Market Cap Service] POLYGON_API_KEY is not set!`);
        return null;
      }

      console.log(`[Market Cap Service] Fetching ${ticker} from Polygon: ${POLYGON_BASE_URL}/v3/reference/tickers/${ticker}`);
      
      const response = await axios.get(
        `${POLYGON_BASE_URL}/v3/reference/tickers/${ticker}`,
        {
          params: { apiKey: POLYGON_API_KEY },
          timeout: 10000,
        }
      );

      console.log(`[Market Cap Service] Polygon response for ${ticker}:`, response.data.status);

      if (response.data.status !== 'OK' || !response.data.results) {
        console.warn(`[Market Cap Service] Invalid response for ${ticker}:`, response.data.status);
        return null;
      }

      const result = response.data.results;
      const marketCap = result.market_cap;
      
      if (!marketCap) {
        console.warn(`[Market Cap Service] No market cap found for ${ticker}`);
        return null;
      }

      const marketCapData: MarketCapData = {
        ticker: ticker.toUpperCase(),
        marketCap,
        updatedAt: new Date(),
      };

      // Update in PostgreSQL (upsert into Fundamental)
      await prisma.fundamental.upsert({
        where: { ticker: marketCapData.ticker },
        update: {
          marketCap: BigInt(marketCapData.marketCap),
          updatedAt: new Date(),
        },
        create: {
          ticker: marketCapData.ticker,
          companyName: result.name || marketCapData.ticker,
          marketCap: BigInt(marketCapData.marketCap),
        },
      });

      // Cache in Redis
      const cacheKey = `marketcap:${ticker.toUpperCase()}`;
      await setCached(cacheKey, marketCapData, CACHE_TTL.MARKET_CAP);

      return marketCapData;
    } catch (error: any) {
      console.error(`[Market Cap Service] Error fetching ${ticker}:`, error.message);
      return null;
    }
  }
}

export const marketCapService = new MarketCapService();

