/**
 * Logo API Routes
 */

import { Router, Request, Response } from 'express';
import { logoService } from '../services/logoService';
import { marketCapService } from '../services/marketCapService';

const router = Router();

/**
 * GET /api/logos/:ticker
 * Get logo for a single ticker
 */
router.get('/:ticker', async (req: Request, res: Response) => {
  try {
    const { ticker } = req.params;
    
    if (!ticker) {
      return res.status(400).json({ error: 'Ticker is required' });
    }

    // Check if ticker has market cap (validates ticker exists and has data)
    const marketCap = await marketCapService.getMarketCap(ticker);
    if (!marketCap) {
      return res.status(404).json({ error: `Ticker ${ticker} not found or has no market cap data` });
    }

    const logo = await logoService.getLogo(ticker);
    
    if (!logo) {
      return res.status(404).json({ error: `Logo not found for ${ticker}` });
    }

    res.json(logo);
  } catch (error: any) {
    console.error('[Logos API] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/logos
 * Get logos for multiple tickers (comma-separated)
 * Example: /api/logos?tickers=AAPL,MSFT,GOOGL
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { tickers } = req.query;
    
    if (!tickers || typeof tickers !== 'string') {
      return res.status(400).json({ error: 'Tickers parameter is required' });
    }

    const tickerList = tickers.split(',').map(t => t.trim()).filter(t => t.length > 0);
    
    if (tickerList.length === 0) {
      return res.json([]);
    }

    // Filter out tickers without market cap (invalid tickers, ADRs without data, etc.)
    const marketCaps = await marketCapService.getMarketCaps(tickerList);
    const validTickers = marketCaps.map(mc => mc.ticker);
    
    if (validTickers.length === 0) {
      return res.json([]);
    }

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
    
    res.json(formattedLogos);
  } catch (error: any) {
    console.error('[Logos API] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/logos/:ticker/refresh
 * Force refresh logo from Polygon API
 */
router.post('/:ticker/refresh', async (req: Request, res: Response) => {
  try {
    const { ticker } = req.params;
    
    if (!ticker) {
      return res.status(400).json({ error: 'Ticker is required' });
    }

    const logo = await logoService.refreshLogo(ticker);
    
    if (!logo) {
      return res.status(404).json({ error: `Logo not found for ${ticker}` });
    }

    res.json(logo);
  } catch (error: any) {
    console.error('[Logos API] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

