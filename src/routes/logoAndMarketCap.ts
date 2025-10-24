/**
 * Logo and Market Cap API Routes
 * Combined endpoint for logos and market caps (optimized for performance)
 */

import { Router, Request, Response } from 'express';
import { logoService } from '../services/logoService';
import { marketCapService } from '../services/marketCapService';

const router = Router();

/**
 * GET /api/logo-and-market-cap
 * Get logos and market caps for multiple tickers (comma-separated)
 * Returns only data for tickers with valid market cap
 * Example: /api/logo-and-market-cap?tickers=AAPL,MSFT,GOOGL
 */
router.get('/', async (req: Request, res: Response) => {
  const requestId = Math.random().toString(36).substring(7);
  const startTime = Date.now();
  
  try {
    const { tickers } = req.query;
    
    if (!tickers || typeof tickers !== 'string') {
      return res.status(400).json({ error: 'Tickers parameter is required' });
    }

    const tickerList = tickers.split(',').map(t => t.trim()).filter(t => t.length > 0);
    console.log(`[Logo&MarketCap:${requestId}] 📊 Request for ${tickerList.length} tickers`);
    
    if (tickerList.length === 0) {
      return res.json({ logos: [], marketCaps: {} });
    }

    // Step 1: Get market caps (filters out invalid tickers)
    const mcStart = Date.now();
    const marketCaps = await marketCapService.getMarketCaps(tickerList);
    console.log(`[Logo&MarketCap:${requestId}] ✅ Market caps fetched in ${Date.now() - mcStart}ms`);
    
    const validTickers = marketCaps.map(mc => mc.ticker);
    
    // Create market cap map
    const marketCapMap: Record<string, number> = {};
    marketCaps.forEach(mc => {
      marketCapMap[mc.ticker] = mc.marketCap;
    });
    
    if (validTickers.length === 0) {
      return res.json({ logos: [], marketCaps: {} });
    }

    // Step 2: Get logos only for valid tickers
    const logoStart = Date.now();
    const logos = await logoService.getLogos(validTickers);
    console.log(`[Logo&MarketCap:${requestId}] ✅ Logos fetched in ${Date.now() - logoStart}ms`);
    
    // Get base URL for proxy endpoints
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    
    // Transform to match CompanyLogo interface expected by earnings-web
    // Use our proxy endpoint instead of direct Polygon URLs
    const formattedLogos = logos.map(logo => ({
      ticker: logo.ticker,
      exchange: logo.exchange || '',
      name: logo.companyName,
      files: {
        logo_light: logo.logoUrl ? `${baseUrl}/api/logos/${logo.ticker}/image?type=logo` : undefined,
        mark_light: logo.iconUrl ? `${baseUrl}/api/logos/${logo.ticker}/image?type=icon` : undefined,
        logo_dark: logo.logoUrl ? `${baseUrl}/api/logos/${logo.ticker}/image?type=logo` : undefined,
        mark_dark: logo.iconUrl ? `${baseUrl}/api/logos/${logo.ticker}/image?type=icon` : undefined,
      },
      updated: Date.now(),
    }));
    
    const totalTime = Date.now() - startTime;
    console.log(`[Logo&MarketCap:${requestId}] ✅ Total request time: ${totalTime}ms`);
    
    res.json({
      logos: formattedLogos,
      marketCaps: marketCapMap,
    });
  } catch (error: any) {
    console.error(`[Logo&MarketCap:${requestId}] ❌ Error after ${Date.now() - startTime}ms:`, error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

