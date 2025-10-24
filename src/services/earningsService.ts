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
import { CACHE_TTL } from '../utils/constants';
import { marketCapService } from './marketCapService';

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
        return cached;
      }
    }

    // 2. For past earnings, check PostgreSQL first (data is complete)
    // For upcoming earnings, always fetch from Polygon (data changes as companies announce dates)
    if (isPastEarnings) {
      const dbEarnings = await this.fetchFromDatabase(query);
      
      if (dbEarnings.length > 0) {
        // Filter by market cap availability
        const filtered = await this.filterByMarketCap(dbEarnings);
        await setCached(cacheKey, filtered, CACHE_TTL.EARNINGS_HISTORICAL);
        console.log(`[Earnings Service] DB hit (past earnings, cached forever) for ${cacheKey} (${filtered.length} events after market cap filter)`);
        return filtered;
      }
    }

    // 3. Fetch from Polygon API (upcoming earnings or data not in database)
    console.log(`[Earnings Service] Fetching from Polygon API: ${cacheKey} (${isPastEarnings ? 'past data not in DB' : 'upcoming earnings - always fetch fresh'})`);
    const earnings = await this.fetchFromPolygon(query);
    
    // Filter by market cap availability
    return await this.filterByMarketCap(earnings);
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
   * Store earnings in database using batch operations
   */
  private async storeInDatabase(earnings: EarningsEvent[]): Promise<void> {
    if (earnings.length === 0) return;
    
    try {
      const BATCH_SIZE = 50;
      const batches = [];
      
      for (let i = 0; i < earnings.length; i += BATCH_SIZE) {
        batches.push(earnings.slice(i, i + BATCH_SIZE));
      }
      
      console.log(`[Earnings Service] Storing ${earnings.length} earnings in ${batches.length} batches`);
      
      for (const batch of batches) {
        await prisma.$transaction(
          batch.map(earning => 
            prisma.earning.upsert({
              where: { id: earning.id },
              update: {
                ticker: earning.ticker,
                date: new Date(earning.date),
                time: earning.time,
                importance: earning.importance || 0,
                epsActual: earning.eps_actual,
                epsEstimate: earning.eps_estimate,
                epsSurprise: earning.eps_surprise,
                epsSurprisePercent: earning.eps_surprise_percent,
                revenueActual: earning.revenue_actual,
                revenueEstimate: earning.revenue_estimate,
                revenueSurprise: earning.revenue_surprise,
                revenueSurprisePercent: earning.revenue_surprise_percent,
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
                epsSurprise: earning.eps_surprise,
                epsSurprisePercent: earning.eps_surprise_percent,
                revenueActual: earning.revenue_actual,
                revenueEstimate: earning.revenue_estimate,
                revenueSurprise: earning.revenue_surprise,
                revenueSurprisePercent: earning.revenue_surprise_percent,
                companyName: earning.name,
                currency: earning.currency,
                period: earning.period,
                periodYear: earning.period_year,
              },
            })
          )
        );
      }
      
      console.log(`[Earnings Service] Successfully stored ${earnings.length} earnings`);
    } catch (error: any) {
      console.error(`[Earnings Service] Error storing in database:`, error.message);
    }
  }

  /**
   * Filter earnings by market cap availability
   * Only include earnings for companies that have market cap data
   */
  private async filterByMarketCap(earnings: EarningsEvent[]): Promise<EarningsEvent[]> {
    if (earnings.length === 0) return earnings;
    
    // Get unique tickers
    const tickers = [...new Set(earnings.map(e => e.ticker))];
    
    // Fetch market caps for all tickers
    const marketCaps = await marketCapService.getMarketCaps(tickers);
    const marketCapMap = new Map(marketCaps.map(mc => [mc.ticker.toUpperCase(), mc.marketCap]));
    
    // Filter earnings to only include tickers with market cap data
    const filteredOut: string[] = [];
    const filtered = earnings.filter(earning => {
      const hasMarketCap = marketCapMap.has(earning.ticker.toUpperCase());
      if (!hasMarketCap) {
        filteredOut.push(earning.ticker);
      }
      return hasMarketCap;
    });
    
    // Sort by market cap (descending) - largest companies first
    filtered.sort((a, b) => {
      const marketCapA = marketCapMap.get(a.ticker.toUpperCase()) || 0;
      const marketCapB = marketCapMap.get(b.ticker.toUpperCase()) || 0;
      return marketCapB - marketCapA;
    });
    
    if (filteredOut.length > 0) {
      console.log(`[Earnings Service] Filtered out ${filteredOut.length} tickers without market cap: ${filteredOut.join(', ')}`);
    }
    console.log(`[Earnings Service] Market cap filter: ${earnings.length} → ${filtered.length} earnings (sorted by market cap)`);
    return filtered;
  }

  /**
   * Get primary earnings (top 5 per day per session)
   * Fast endpoint for initial render
   */
  async getPrimaryEarnings(query: EarningsQuery): Promise<EarningsEvent[]> {
    // Get all earnings (will be cached)
    const allEarnings = await this.getEarnings(query);
    
    // Split into primary (top 5 per day per session)
    return this.extractPrimaryEarnings(allEarnings);
  }

  /**
   * Get secondary earnings (remaining after primary)
   * Lazy loaded in background
   */
  async getSecondaryEarnings(query: EarningsQuery): Promise<EarningsEvent[]> {
    // Get all earnings (will use cache from primary call)
    const allEarnings = await this.getEarnings(query);
    
    // Get primary to exclude them
    const primary = this.extractPrimaryEarnings(allEarnings);
    const primaryIds = new Set(primary.map(e => e.id));
    
    // Return everything except primary
    return allEarnings.filter(e => !primaryIds.has(e.id));
  }

  /**
   * Extract top 5 earnings per day per session (before open / after close)
   */
  private extractPrimaryEarnings(earnings: EarningsEvent[]): EarningsEvent[] {
    // Group by date
    const byDate = new Map<string, EarningsEvent[]>();
    earnings.forEach(earning => {
      if (!byDate.has(earning.date)) {
        byDate.set(earning.date, []);
      }
      byDate.get(earning.date)!.push(earning);
    });

    const primary: EarningsEvent[] = [];

    // For each date, get top 5 before open and top 5 after close
    byDate.forEach((dayEarnings) => {
      // Split by session
      const beforeOpen = dayEarnings.filter(e => 
        !e.time || e.time === 'bmo' || e.time === 'time-pre-market' || (e.time && e.time.includes('before'))
      );
      const afterClose = dayEarnings.filter(e => 
        e.time && (e.time === 'amc' || e.time === 'time-after-hours' || e.time.includes('after'))
      );

      // Take top 5 from each session (already sorted by market cap)
      primary.push(...beforeOpen.slice(0, 5));
      primary.push(...afterClose.slice(0, 5));
    });

    return primary;
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
      eps_surprise: db.epsSurprise ? Number(db.epsSurprise) : undefined,
      eps_surprise_percent: db.epsSurprisePercent ? Number(db.epsSurprisePercent) : undefined,
      // Convert BigInt to Number for JSON serialization
      revenue_actual: db.revenueActual ? Number(db.revenueActual) : undefined,
      revenue_estimate: db.revenueEstimate ? Number(db.revenueEstimate) : undefined,
      revenue_surprise: db.revenueSurprise ? Number(db.revenueSurprise) : undefined,
      revenue_surprise_percent: db.revenueSurprisePercent ? Number(db.revenueSurprisePercent) : undefined,
      name: db.companyName,
      currency: db.currency,
      period: db.period,
      period_year: db.periodYear,
    };
  }
}

export const earningsService = new EarningsService();

