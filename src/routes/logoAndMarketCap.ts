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
  try {
    const { tickers } = req.query;
    
    if (!tickers || typeof tickers !== 'string') {
      return res.status(400).json({ error: 'Tickers parameter is required' });
    }

    const tickerList = tickers.split(',').map(t => t.trim()).filter(t => t.length > 0);
    
    if (tickerList.length === 0) {
      return res.json({ logos: [], marketCaps: {} });
    }

    // Step 1: Get market caps (filters out invalid tickers)
    const marketCaps = await marketCapService.getMarketCaps(tickerList);
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
    const logos = await logoService.getLogos(validTickers);
    
    // Transform to match CompanyLogo interface expected by earnings-web
    const formattedLogos = logos.map(logo => ({
      ticker: logo.ticker,
      exchange: logo.exchange || '',
      name: logo.companyName,
      files: {
        logo_light: logo.logoUrl || undefined,
        mark_light: logo.iconUrl || undefined,
        logo_dark: logo.logoUrl || undefined,
        mark_dark: logo.iconUrl || undefined,
      },
      updated: Date.now(),
    }));
    
    res.json({
      logos: formattedLogos,
      marketCaps: marketCapMap,
    });
  } catch (error: any) {
    console.error('[Logo and Market Cap API] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

