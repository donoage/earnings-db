/**
 * Earnings API Routes
 * Endpoints for fetching earnings calendar data
 */

import express, { Request, Response } from 'express';
import { earningsService } from '../services/earningsService';

const router = express.Router();

/**
 * GET /api/earnings/primary
 * Get top 5 earnings per day per session (before open / after close)
 * Fast endpoint for initial render
 * Example: /api/earnings/primary?dateFrom=2025-01-01&dateTo=2025-01-31
 */
router.get('/primary', async (req: Request, res: Response) => {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[Earnings API:${requestId}] 🚀 PRIMARY endpoint called`);
  
  try {
    const { dateFrom, dateTo, tickers, importance } = req.query;
    console.log(`[Earnings API:${requestId}] 📋 Query params:`, { dateFrom, dateTo, tickers, importance });
    
    const query: any = {};
    if (dateFrom && typeof dateFrom === 'string') query.dateFrom = dateFrom;
    if (dateTo && typeof dateTo === 'string') query.dateTo = dateTo;
    if (tickers && typeof tickers === 'string') query.tickers = tickers;
    if (importance && typeof importance === 'string') query.importance = parseInt(importance);
    
    console.log(`[Earnings API:${requestId}] 🔄 Calling earningsService.getPrimaryEarnings with:`, query);
    const startTime = Date.now();
    
    const earnings = await earningsService.getPrimaryEarnings(query);
    
    const duration = Date.now() - startTime;
    console.log(`[Earnings API:${requestId}] ✅ Service returned ${earnings.length} earnings in ${duration}ms`);
    console.log(`[Earnings API:${requestId}] 📤 Sending response`);
    
    res.json(earnings);
  } catch (error: any) {
    console.error(`[Earnings API:${requestId}] ❌ ERROR in PRIMARY endpoint`);
    console.error(`[Earnings API:${requestId}] Error type:`, error.constructor?.name);
    console.error(`[Earnings API:${requestId}] Error message:`, error.message);
    console.error(`[Earnings API:${requestId}] Error stack:`, error.stack);
    res.status(500).json({ error: 'Internal server error', requestId });
  }
});

/**
 * GET /api/earnings/secondary
 * Get remaining earnings (beyond top 5 per day per session)
 * Lazy loaded in background
 * Example: /api/earnings/secondary?dateFrom=2025-01-01&dateTo=2025-01-31
 */
router.get('/secondary', async (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, tickers, importance } = req.query;
    
    const query: any = {};
    if (dateFrom && typeof dateFrom === 'string') query.dateFrom = dateFrom;
    if (dateTo && typeof dateTo === 'string') query.dateTo = dateTo;
    if (tickers && typeof tickers === 'string') query.tickers = tickers;
    if (importance && typeof importance === 'string') query.importance = parseInt(importance);
    
    const earnings = await earningsService.getSecondaryEarnings(query);
    
    res.json(earnings);
  } catch (error: any) {
    console.error('[Earnings API] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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

