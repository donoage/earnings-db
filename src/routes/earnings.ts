/**
 * Earnings API Routes
 * Endpoints for fetching earnings calendar data
 */

import express, { Request, Response } from 'express';
import { earningsService } from '../services/earningsService';

const router = express.Router();

/**
 * GET /api/earnings
 * Get earnings events for a date range
 * Example: /api/earnings?dateFrom=2025-01-01&dateTo=2025-01-31&importance=5
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, tickers, importance } = req.query;
    
    const query: any = {};
    if (dateFrom && typeof dateFrom === 'string') query.dateFrom = dateFrom;
    if (dateTo && typeof dateTo === 'string') query.dateTo = dateTo;
    if (tickers && typeof tickers === 'string') query.tickers = tickers;
    if (importance && typeof importance === 'string') query.importance = parseInt(importance);
    
    const earnings = await earningsService.getEarnings(query);
    
    res.json(earnings);
  } catch (error: any) {
    console.error('[Earnings API] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

