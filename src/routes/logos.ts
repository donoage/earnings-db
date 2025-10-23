/**
 * Logo API Routes
 */

import { Router, Request, Response } from 'express';
import { logoService } from '../services/logoService';

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

    const logos = await logoService.getLogos(tickerList);
    
    res.json(logos);
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

