/**
 * Fundamentals API Routes
 * Endpoints for fetching company fundamentals data
 */

import express, { Request, Response } from 'express';
import { fundamentalsService } from '../services/fundamentalsService';

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
    console.error('[Fundamentals API] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

