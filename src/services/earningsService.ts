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
  eps_actual?: number;
  eps_estimate?: number;
  eps_surprise?: number;
  eps_surprise_percent?: number;
  revenue_actual?: number;
  revenue_estimate?: number;
  revenue_surprise?: number;
  revenue_surprise_percent?: number;
  name: string;
  currency?: string;
  period?: string;
  period_year?: number;
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
    now.setHours(0, 0, 0, 0); // Start of today
    
    // Determine if this query is for past earnings (all dates before today)
    const isPastEarnings = query.dateTo && new Date(query.dateTo) < now;
    
    // Create cache key based on query parameters
    const cacheKey = this.createCacheKey(query);
    
    // 1. Check Redis cache (only for past earnings)
    if (isPastEarnings) {
      const cached = await getCached<EarningsEvent[]>(cacheKey);
      if (cached) {
        console.log(`[Earnings Service] Cache hit (past earnings) for ${cacheKey}`);
        return cached;
      }
    }

    // 2. Check PostgreSQL
    const dbEarnings = await this.fetchFromDatabase(query);
    
    if (dbEarnings.length > 0) {
      // Only cache past earnings (cache forever)
      if (isPastEarnings) {
        await setCached(cacheKey, dbEarnings, CACHE_TTL.EARNINGS_HISTORICAL);
        console.log(`[Earnings Service] DB hit (past earnings, cached forever) for ${cacheKey} (${dbEarnings.length} events)`);
      } else {
        console.log(`[Earnings Service] DB hit (upcoming earnings, not cached) for ${cacheKey} (${dbEarnings.length} events)`);
      }
      return dbEarnings;
    }

    // 3. Fetch from Polygon API (data not in database)
    console.log(`[Earnings Service] Data not in DB, fetching from Polygon API: ${cacheKey}`);
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
        eps_actual: result.actual_eps,
        eps_estimate: result.estimated_eps,
        eps_surprise: result.eps_surprise,
        eps_surprise_percent: result.eps_surprise_percent,
        revenue_actual: result.actual_revenue,
        revenue_estimate: result.estimated_revenue,
        revenue_surprise: result.revenue_surprise,
        revenue_surprise_percent: result.revenue_surprise_percent,
        name: result.company_name || result.ticker,
        currency: result.currency,
        period: result.fiscal_period,
        period_year: result.fiscal_year,
      }));

      // Store in database
      await this.storeInDatabase(earnings);

      // Cache in Redis (only for past earnings)
      const now = new Date();
      now.setHours(0, 0, 0, 0); // Start of today
      const isPastEarnings = query.dateTo && new Date(query.dateTo) < now;
      
      if (isPastEarnings) {
        const cacheKey = this.createCacheKey(query);
        await setCached(cacheKey, earnings, CACHE_TTL.EARNINGS_HISTORICAL);
        console.log(`[Earnings Service] Fetched ${earnings.length} past earnings from Polygon (cached forever)`);
      } else {
        console.log(`[Earnings Service] Fetched ${earnings.length} upcoming earnings from Polygon (not cached)`);
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
            epsActual: earning.eps_actual,
            epsEstimate: earning.eps_estimate,
            revenueActual: earning.revenue_actual ? BigInt(earning.revenue_actual) : null,
            revenueEstimate: earning.revenue_estimate ? BigInt(earning.revenue_estimate) : null,
            companyName: earning.name,
            currency: earning.currency,
            period: earning.period,
            periodYear: earning.period_year,
            updatedAt: new Date(),
          },
          create: {
            id: earning.id,
            ticker: earning.ticker,
            date: new Date(earning.date),
            time: earning.time,
            importance: earning.importance || 0,
            epsActual: earning.eps_actual,
            epsEstimate: earning.eps_estimate,
            revenueActual: earning.revenue_actual ? BigInt(earning.revenue_actual) : null,
            revenueEstimate: earning.revenue_estimate ? BigInt(earning.revenue_estimate) : null,
            companyName: earning.name,
            currency: earning.currency,
            period: earning.period,
            periodYear: earning.period_year,
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
      eps_actual: db.epsActual ? Number(db.epsActual) : undefined,
      eps_estimate: db.epsEstimate ? Number(db.epsEstimate) : undefined,
      revenue_actual: db.revenueActual ? Number(db.revenueActual) : undefined,
      revenue_estimate: db.revenueEstimate ? Number(db.revenueEstimate) : undefined,
      name: db.companyName,
      currency: db.currency,
      period: db.period,
      period_year: db.periodYear,
    };
  }
}

export const earningsService = new EarningsService();

