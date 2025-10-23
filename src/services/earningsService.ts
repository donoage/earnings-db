/**
 * Earnings Service
 * Handles fetching and caching of earnings events
 * 
 * Caching Strategy:
 * - Past earnings (date < today): 90 days cache (historical, won't change)
 * - Upcoming earnings (date >= today): 5 minutes cache (may get updates)
 * - Uses date-based cache keys for range queries
 */

import axios from 'axios';
import { prisma } from '../utils/prisma';
import { getCached, setCached } from '../utils/redis';
import { CACHE_TTL, UPDATE_THRESHOLD } from '../utils/constants';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';
const POLYGON_BASE_URL = 'https://api.polygon.io';

interface EarningsEvent {
  id: string;
  ticker: string;
  date: string;
  time?: string;
  importance?: number;
  epsActual?: number;
  epsEstimate?: number;
  revenueActual?: number;
  revenueEstimate?: number;
  companyName: string;
  currency?: string;
  period?: string;
  periodYear?: number;
}

interface EarningsQuery {
  dateFrom?: string;
  dateTo?: string;
  tickers?: string;
  importance?: number;
}

class EarningsService {
  /**
   * Get earnings events for a date range
   */
  async getEarnings(query: EarningsQuery): Promise<EarningsEvent[]> {
    const now = new Date();
    const twoYearsAgo = new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);
    
    // Determine if this query is for historical data (older than 2 years)
    const isHistorical = query.dateTo && new Date(query.dateTo) < twoYearsAgo;
    
    // Create cache key based on query parameters
    const cacheKey = this.createCacheKey(query);
    
    // 1. Check Redis cache (only for historical data)
    if (isHistorical) {
      const cached = await getCached<EarningsEvent[]>(cacheKey);
      if (cached) {
        console.log(`[Earnings Service] Cache hit (historical) for ${cacheKey}`);
        return cached;
      }
    }

    // 2. Check PostgreSQL
    const dbEarnings = await this.fetchFromDatabase(query);
    
    if (dbEarnings.length > 0) {
      // Only cache historical earnings (past 2 years)
      if (isHistorical) {
        await setCached(cacheKey, dbEarnings, CACHE_TTL.EARNINGS_HISTORICAL);
        console.log(`[Earnings Service] DB hit (historical, cached forever) for ${cacheKey} (${dbEarnings.length} events)`);
      } else {
        console.log(`[Earnings Service] DB hit (recent/upcoming, not cached) for ${cacheKey} (${dbEarnings.length} events)`);
      }
      return dbEarnings;
    }

    // 3. Fetch from Polygon API
    console.log(`[Earnings Service] Fetching from Polygon API: ${cacheKey}`);
    return await this.fetchFromPolygon(query);
  }

  /**
   * Fetch earnings from database
   */
  private async fetchFromDatabase(query: EarningsQuery): Promise<EarningsEvent[]> {
    const { dateFrom, dateTo, tickers, importance } = query;
    
    const where: any = {};
    
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }
    
    if (tickers) {
      const tickerList = tickers.split(',').map(t => t.trim().toUpperCase());
      where.ticker = { in: tickerList };
    }
    
    if (importance !== undefined) {
      where.importance = { gte: importance };
    }

    const dbEarnings = await prisma.earning.findMany({
      where,
      orderBy: { date: 'asc' },
    });

    return dbEarnings.map(this.dbToEarningsEvent);
  }

  /**
   * Fetch earnings from Polygon API (Benzinga earnings endpoint)
   */
  private async fetchFromPolygon(query: EarningsQuery): Promise<EarningsEvent[]> {
    try {
      const params: any = {
        apiKey: POLYGON_API_KEY,
        sort: 'date.asc',
        limit: 1000,
      };

      if (query.dateFrom) params['date.gte'] = query.dateFrom;
      if (query.dateTo) params['date.lte'] = query.dateTo;
      if (query.tickers) params['ticker.any_of'] = query.tickers;
      if (query.importance !== undefined) params['importance.gte'] = query.importance;

      const response = await axios.get(
        `${POLYGON_BASE_URL}/benzinga/v1/earnings`,
        { params, timeout: 15000 }
      );

      if (response.data.status !== 'OK' || !response.data.results) {
        return [];
      }

      const earnings: EarningsEvent[] = response.data.results.map((result: any) => ({
        id: result.benzinga_id || `${result.ticker}-${result.fiscal_period}-${result.fiscal_year}`,
        ticker: result.ticker,
        date: result.date,
        time: result.time,
        importance: result.importance,
        epsActual: result.actual_eps,
        epsEstimate: result.estimated_eps,
        revenueActual: result.actual_revenue,
        revenueEstimate: result.estimated_revenue,
        companyName: result.company_name || result.ticker,
        currency: result.currency,
        period: result.fiscal_period,
        periodYear: result.fiscal_year,
      }));

      // Store in database
      await this.storeInDatabase(earnings);

      // Cache in Redis (only for historical data older than 2 years)
      const now = new Date();
      const twoYearsAgo = new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);
      const isHistorical = query.dateTo && new Date(query.dateTo) < twoYearsAgo;
      
      if (isHistorical) {
        const cacheKey = this.createCacheKey(query);
        await setCached(cacheKey, earnings, CACHE_TTL.EARNINGS_HISTORICAL);
        console.log(`[Earnings Service] Fetched ${earnings.length} historical events from Polygon (cached forever)`);
      } else {
        console.log(`[Earnings Service] Fetched ${earnings.length} recent/upcoming events from Polygon (not cached)`);
      }

      return earnings;
    } catch (error: any) {
      console.error(`[Earnings Service] Error fetching from Polygon:`, error.message);
      return [];
    }
  }

  /**
   * Store earnings in database
   */
  private async storeInDatabase(earnings: EarningsEvent[]): Promise<void> {
    try {
      for (const earning of earnings) {
        await prisma.earning.upsert({
          where: { id: earning.id },
          update: {
            ticker: earning.ticker,
            date: new Date(earning.date),
            time: earning.time,
            importance: earning.importance || 0,
            epsActual: earning.epsActual,
            epsEstimate: earning.epsEstimate,
            revenueActual: earning.revenueActual ? BigInt(earning.revenueActual) : null,
            revenueEstimate: earning.revenueEstimate ? BigInt(earning.revenueEstimate) : null,
            companyName: earning.companyName,
            currency: earning.currency,
            period: earning.period,
            periodYear: earning.periodYear,
            updatedAt: new Date(),
          },
          create: {
            id: earning.id,
            ticker: earning.ticker,
            date: new Date(earning.date),
            time: earning.time,
            importance: earning.importance || 0,
            epsActual: earning.epsActual,
            epsEstimate: earning.epsEstimate,
            revenueActual: earning.revenueActual ? BigInt(earning.revenueActual) : null,
            revenueEstimate: earning.revenueEstimate ? BigInt(earning.revenueEstimate) : null,
            companyName: earning.companyName,
            currency: earning.currency,
            period: earning.period,
            periodYear: earning.periodYear,
          },
        });
      }
    } catch (error: any) {
      console.error(`[Earnings Service] Error storing in database:`, error.message);
    }
  }

  /**
   * Create cache key from query parameters
   */
  private createCacheKey(query: EarningsQuery): string {
    const parts = ['earnings'];
    if (query.dateFrom) parts.push(`from:${query.dateFrom}`);
    if (query.dateTo) parts.push(`to:${query.dateTo}`);
    if (query.tickers) parts.push(`tickers:${query.tickers}`);
    if (query.importance !== undefined) parts.push(`imp:${query.importance}`);
    return parts.join(':');
  }

  /**
   * Convert database record to EarningsEvent
   */
  private dbToEarningsEvent(db: any): EarningsEvent {
    return {
      id: db.id,
      ticker: db.ticker,
      date: db.date.toISOString().split('T')[0],
      time: db.time,
      importance: db.importance,
      epsActual: db.epsActual ? Number(db.epsActual) : undefined,
      epsEstimate: db.epsEstimate ? Number(db.epsEstimate) : undefined,
      revenueActual: db.revenueActual ? Number(db.revenueActual) : undefined,
      revenueEstimate: db.revenueEstimate ? Number(db.revenueEstimate) : undefined,
      companyName: db.companyName,
      currency: db.currency,
      period: db.period,
      periodYear: db.periodYear,
    };
  }
}

export const earningsService = new EarningsService();

