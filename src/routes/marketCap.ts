/**
 * Market Cap API Routes
 * Endpoints for fetching market cap data
 */

import express, { Request, Response } from 'express';
import { marketCapService } from '../services/marketCapService';
import log from '../utils/logger';

const router = express.Router();

/**
 * GET /api/market-cap/test/:ticker
 * Test endpoint to fetch a single ticker and return detailed error info
 */
router.get('/test/:ticker', async (req: Request, res: Response) => {
  try {
    const { ticker } = req.params;
    log.info('Market Cap API test request', { service: 'MarketCapRoute', endpoint: 'GET /api/market-cap/test/:ticker', ticker });
    
    const result = await marketCapService.getMarketCap(ticker);
    
    res.json({ 
      ticker,
      success: result !== null,
      data: result,
    });
  } catch (error: any) {
    log.error('Market Cap API test error', { service: 'MarketCapRoute', endpoint: 'GET /api/market-cap/test/:ticker', ticker: req.params.ticker, error: error.message, stack: error.stack });
    res.status(500).json({ 
      ticker: req.params.ticker,
      success: false,
      error: error.message,
      stack: error.stack,
    });
  }
});

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
      return res.json({ marketCaps: {} });
    }

    const marketCapsArray = await marketCapService.getMarketCaps(tickerList);
    
    // Transform array to object: { AAPL: 3000000000, MSFT: 2500000000, ... }
    const marketCaps: Record<string, number> = {};
    marketCapsArray.forEach(item => {
      if (item && item.ticker && item.marketCap !== null) {
        marketCaps[item.ticker] = item.marketCap;
      }
    });
    
    // If debug mode, return detailed info
    if (debug === 'true') {
      return res.json({ 
        marketCaps,
        requested: tickerList,
        found: Object.keys(marketCaps),
        missing: tickerList.filter(t => !marketCaps[t.toUpperCase()]),
      });
    }
    
    res.json({ marketCaps });
  } catch (error: any) {
    log.error('Market Cap API error', { service: 'MarketCapRoute', endpoint: 'GET /api/market-cap', error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

export default router;

