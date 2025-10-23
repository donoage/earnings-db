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
    const { tickers } = req.query;
    
    if (!tickers || typeof tickers !== 'string') {
      return res.status(400).json({ error: 'Missing tickers parameter' });
    }

    const tickerList = tickers.split(',').map(t => t.trim()).filter(t => t.length > 0);
    
    if (tickerList.length === 0) {
      return res.json({ marketCaps: [] });
    }

    const marketCaps = await marketCapService.getMarketCaps(tickerList);
    
    res.json({ marketCaps });
  } catch (error: any) {
    console.error('[Market Cap API] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

