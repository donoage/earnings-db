/**
 * Logo Service
 * Handles logo fetching with database and cache layers
 */

import axios from 'axios';
import { prisma } from '../utils/prisma';
import { getCached, setCached, CACHE_TTL } from '../utils/redis';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';
const POLYGON_BASE_URL = 'https://api.polygon.io';

interface LogoData {
  ticker: string;
  iconUrl: string | null;
  logoUrl: string | null;
  companyName: string;
  exchange: string | null;
}

export class LogoService {
  /**
   * Get logo for a single ticker
   * Priority: Redis Cache → PostgreSQL → Polygon API
   */
  async getLogo(ticker: string): Promise<LogoData | null> {
    const tickerUpper = ticker.toUpperCase();
    const cacheKey = `logo:${tickerUpper}`;

    // 1. Check Redis cache
    const cached = await getCached<LogoData>(cacheKey);
    if (cached) {
      return cached;
    }

    // 2. Check PostgreSQL
    const dbLogo = await prisma.logo.findUnique({
      where: { ticker: tickerUpper },
    });

    if (dbLogo) {
      const logoData: LogoData = {
        ticker: dbLogo.ticker,
        iconUrl: dbLogo.iconUrl,
        logoUrl: dbLogo.logoUrl,
        companyName: dbLogo.companyName,
        exchange: dbLogo.exchange,
      };
      
      // Cache in Redis
      await setCached(cacheKey, logoData, CACHE_TTL.LOGO);
      return logoData;
    }

    // 3. Fetch from Polygon API
    console.log(`[Logo Service] Fetching from Polygon for ${tickerUpper}`);
    try {
      const response = await axios.get(
        `${POLYGON_BASE_URL}/v3/reference/tickers/${tickerUpper}`,
        {
          params: { apiKey: POLYGON_API_KEY },
          timeout: 5000,
        }
      );

      if (response.data.status === 'OK' && response.data.results) {
        const result = response.data.results;
        const branding = result.branding || {};
        
        // Prefer icon_url over logo_url
        let iconUrl = branding.icon_url || branding.logo_url || null;
        let logoUrl = branding.logo_url || null;
        
        // Append API key for authentication
        if (iconUrl) iconUrl = `${iconUrl}?apiKey=${POLYGON_API_KEY}`;
        if (logoUrl) logoUrl = `${logoUrl}?apiKey=${POLYGON_API_KEY}`;

        const logoData: LogoData = {
          ticker: tickerUpper,
          iconUrl,
          logoUrl,
          companyName: result.name || tickerUpper,
          exchange: result.market || null,
        };

        // Store in PostgreSQL
        await prisma.logo.upsert({
          where: { ticker: tickerUpper },
          update: {
            iconUrl: logoData.iconUrl,
            logoUrl: logoData.logoUrl,
            companyName: logoData.companyName,
            exchange: logoData.exchange,
            updatedAt: new Date(),
          },
          create: {
            ticker: tickerUpper,
            iconUrl: logoData.iconUrl,
            logoUrl: logoData.logoUrl,
            companyName: logoData.companyName,
            exchange: logoData.exchange,
          },
        });

        // Cache in Redis
        await setCached(cacheKey, logoData, CACHE_TTL.LOGO);

        return logoData;
      }
    } catch (error: any) {
      console.error(`[Logo Service] Error fetching logo for ${tickerUpper}:`, error.message);
    }

    return null;
  }

  /**
   * Get logos for multiple tickers
   */
  async getLogos(tickers: string[]): Promise<LogoData[]> {
    const uniqueTickers = [...new Set(tickers.map(t => t.toUpperCase()))];
    const results = await Promise.all(
      uniqueTickers.map(ticker => this.getLogo(ticker))
    );
    
    return results.filter((logo): logo is LogoData => logo !== null);
  }

  /**
   * Refresh logo from Polygon (force update)
   */
  async refreshLogo(ticker: string): Promise<LogoData | null> {
    const tickerUpper = ticker.toUpperCase();
    
    // Delete from cache
    const cacheKey = `logo:${tickerUpper}`;
    await setCached(cacheKey, null, 0);
    
    // Fetch fresh data
    return this.getLogo(tickerUpper);
  }
}

export const logoService = new LogoService();

