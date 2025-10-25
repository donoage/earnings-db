/**
 * Fundamentals API Routes
 * Endpoints for fetching company fundamentals data
 */

import express, { Request, Response } from 'express';
import { fundamentalsService } from '../services/fundamentalsService';
import log from '../utils/logger';

const router = express.Router();

/**
 * GET /api/fundamentals
 * Get fundamentals for multiple tickers (comma-separated)
 * Example: /api/fundamentals?tickers=AAPL,MSFT,GOOGL
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { ticker, tickers } = req.query;
    
    // Single ticker request
    if (ticker && typeof ticker === 'string') {
      const fundamentals = await fundamentalsService.getFundamentals(ticker);
      
      if (!fundamentals) {
        return res.status(404).json({ error: `No fundamentals found for ${ticker}` });
      }
      
      return res.json({ fundamentals });
    }
    
    // Multiple tickers request
    if (tickers && typeof tickers === 'string') {
      const tickerList = tickers.split(',').map(t => t.trim()).filter(t => t.length > 0);
      
      if (tickerList.length === 0) {
        return res.json({ fundamentals: [] });
      }
      
      const fundamentals = await fundamentalsService.getBatchFundamentals(tickerList);
      return res.json({ fundamentals });
    }
    
    return res.status(400).json({ error: 'Missing ticker or tickers parameter' });
  } catch (error: any) {
    log.error('Fundamentals API error', { 
      service: 'FundamentalsRoute',
      endpoint: 'GET /api/fundamentals',
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/fundamentals/cache/:ticker
 * Clear cache and database entry for a ticker to force fresh fetch
 * Example: DELETE /api/fundamentals/cache/TMUS
 */
router.delete('/cache/:ticker', async (req: Request, res: Response) => {
  try {
    const { ticker } = req.params;
    
    if (!ticker) {
      return res.status(400).json({ error: 'Missing ticker parameter' });
    }
    
    const result = await fundamentalsService.clearCache(ticker.toUpperCase());
    return res.json(result);
  } catch (error: any) {
    log.error('Fundamentals API error clearing cache', { 
      service: 'FundamentalsRoute',
      endpoint: 'DELETE /api/fundamentals/cache/:ticker',
      ticker: req.params.ticker,
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

