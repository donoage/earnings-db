/**
 * Market Cap API Routes
 * Endpoints for fetching market cap data
 */

import express, { Request, Response } from 'express';
import { marketCapService } from '../services/marketCapService';

const router = express.Router();

/**
 * GET /api/market-cap
 * Get market caps for multiple tickers (comma-separated)
 * Example: /api/market-cap?tickers=AAPL,MSFT,GOOGL
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { tickers, debug } = req.query;
    
    if (!tickers || typeof tickers !== 'string') {
      return res.status(400).json({ error: 'Missing tickers parameter' });
    }

    const tickerList = tickers.split(',').map(t => t.trim()).filter(t => t.length > 0);
    
    if (tickerList.length === 0) {
      return res.json({ marketCaps: [] });
    }

    const marketCaps = await marketCapService.getMarketCaps(tickerList);
    
    // If debug mode, return detailed info
    if (debug === 'true') {
      return res.json({ 
        marketCaps,
        requested: tickerList,
        found: marketCaps.map(m => m.ticker),
        missing: tickerList.filter(t => !marketCaps.some(m => m.ticker === t.toUpperCase())),
      });
    }
    
    res.json({ marketCaps });
  } catch (error: any) {
    console.error('[Market Cap API] Error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * GET /api/market-cap/test/:ticker
 * Test endpoint to fetch a single ticker and return detailed error info
 */
router.get('/test/:ticker', async (req: Request, res: Response) => {
  try {
    const { ticker } = req.params;
    console.log(`[Market Cap API Test] Testing ${ticker}`);
    
    const result = await marketCapService.getMarketCap(ticker);
    
    res.json({ 
      ticker,
      success: result !== null,
      data: result,
    });
  } catch (error: any) {
    console.error('[Market Cap API Test] Error:', error);
    res.status(500).json({ 
      ticker: req.params.ticker,
      success: false,
      error: error.message,
      stack: error.stack,
    });
  }
});

export default router;

