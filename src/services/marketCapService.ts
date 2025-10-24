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
  week52High?: number;
  week52Low?: number;
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
   * Fetch market cap and 52-week high/low from Polygon API
   */
  private async fetchFromPolygon(ticker: string): Promise<MarketCapData | null> {
    try {
      if (!POLYGON_API_KEY) {
        console.error(`[Market Cap Service] POLYGON_API_KEY is not set!`);
        return null;
      }
      
      // Fetch ticker details for market cap
      const tickerResponse = await axios.get(
        `${POLYGON_BASE_URL}/v3/reference/tickers/${ticker}`,
        {
          params: { apiKey: POLYGON_API_KEY },
          timeout: 10000,
        }
      );

      if (tickerResponse.data.status !== 'OK' || !tickerResponse.data.results) {
        return null;
      }

      const result = tickerResponse.data.results;
      const marketCap = result.market_cap;
      
      if (!marketCap) {
        return null;
      }

      // Fetch 52-week high/low using aggregates (past year of daily bars)
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const fromDate = oneYearAgo.toISOString().split('T')[0];
      const toDate = new Date().toISOString().split('T')[0];

      let week52High: number | undefined;
      let week52Low: number | undefined;

      try {
        const aggregatesResponse = await axios.get(
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

        if (aggregatesResponse.data.status === 'OK' && aggregatesResponse.data.results) {
          const bars = aggregatesResponse.data.results;
          if (bars.length > 0) {
            week52High = Math.max(...bars.map((bar: any) => bar.h));
            week52Low = Math.min(...bars.map((bar: any) => bar.l));
          }
        }
      } catch (aggError: any) {
        console.log(`[Market Cap Service] Could not fetch 52-week data for ${ticker}:`, aggError.message);
        // Continue without 52-week data
      }

      const marketCapData: MarketCapData = {
        ticker: ticker.toUpperCase(),
        marketCap,
        week52High,
        week52Low,
        updatedAt: new Date(),
      };

      // Update in PostgreSQL (upsert into Fundamental)
      await prisma.fundamental.upsert({
        where: { ticker: marketCapData.ticker },
        update: {
          marketCap: marketCapData.marketCap,
          week52High: marketCapData.week52High,
          week52Low: marketCapData.week52Low,
          updatedAt: new Date(),
        },
        create: {
          ticker: marketCapData.ticker,
          companyName: result.name || marketCapData.ticker,
          marketCap: marketCapData.marketCap,
          week52High: marketCapData.week52High,
          week52Low: marketCapData.week52Low,
        },
      });

      // Cache in Redis (12 hour TTL as requested)
      const cacheKey = `marketcap:${ticker.toUpperCase()}`;
      const TWELVE_HOURS = 12 * 60 * 60 * 1000;
      await setCached(cacheKey, marketCapData, TWELVE_HOURS);

      console.log(`[Market Cap Service] Fetched ${ticker}: marketCap=${marketCap}, 52wHigh=${week52High}, 52wLow=${week52Low}`);

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

