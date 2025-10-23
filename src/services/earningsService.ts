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
    const { dateFrom, dateTo, tickers, importance } = query;
    
    // Create cache key based on query parameters
    const cacheKey = this.createCacheKey(query);
    
    // 1. Check Redis cache
    const cached = await getCached<EarningsEvent[]>(cacheKey);
    if (cached) {
      console.log(`[Earnings Service] Cache hit for ${cacheKey}`);
      return cached;
    }

    // 2. Check PostgreSQL
    const dbEarnings = await this.fetchFromDatabase(query);
    
    if (dbEarnings.length > 0) {
      // Determine if this is past or upcoming data
      const isPast = dateTo && new Date(dateTo) < new Date();
      const ttl = isPast ? CACHE_TTL.EARNINGS_PAST : CACHE_TTL.EARNINGS_UPCOMING;
      
      await setCached(cacheKey, dbEarnings, ttl);
      console.log(`[Earnings Service] DB hit for ${cacheKey} (${dbEarnings.length} events, TTL: ${ttl}s)`);
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
   * Fetch earnings from Polygon API
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
      if (query.tickers) params.ticker = query.tickers;
      if (query.importance !== undefined) params.importance = query.importance;

      const response = await axios.get(
        `${POLYGON_BASE_URL}/vX/reference/financials`,
        { params, timeout: 15000 }
      );

      if (response.data.status !== 'OK' || !response.data.results) {
        return [];
      }

      const earnings: EarningsEvent[] = response.data.results.map((result: any) => ({
        id: result.id || `${result.ticker}-${result.fiscal_period}-${result.fiscal_year}`,
        ticker: result.ticker,
        date: result.start_date,
        time: result.time_of_day,
        importance: result.importance,
        epsActual: result.financials?.income_statement?.basic_earnings_per_share?.value,
        epsEstimate: result.financials?.income_statement?.basic_earnings_per_share?.estimate,
        revenueActual: result.financials?.income_statement?.revenues?.value,
        revenueEstimate: result.financials?.income_statement?.revenues?.estimate,
        companyName: result.company_name || result.ticker,
        currency: result.financials?.income_statement?.revenues?.unit,
        period: result.fiscal_period,
        periodYear: result.fiscal_year,
      }));

      // Store in database
      await this.storeInDatabase(earnings);

      // Cache in Redis
      const cacheKey = this.createCacheKey(query);
      const isPast = query.dateTo && new Date(query.dateTo) < new Date();
      const ttl = isPast ? CACHE_TTL.EARNINGS_PAST : CACHE_TTL.EARNINGS_UPCOMING;
      await setCached(cacheKey, earnings, ttl);

      console.log(`[Earnings Service] Fetched ${earnings.length} events from Polygon`);
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

