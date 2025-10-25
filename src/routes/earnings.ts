/**
 * Earnings API Routes
 * Endpoints for fetching earnings calendar data
 */

import express, { Request, Response } from 'express';
import { earningsService } from '../services/earningsService';
import { createScopedLogger, log } from '../utils/logger';

const router = express.Router();

/**
 * GET /api/earnings/primary
 * Get top 5 earnings per day per session (before open / after close)
 * Fast endpoint for initial render
 * Example: /api/earnings/primary?dateFrom=2025-01-01&dateTo=2025-01-31
 */
router.get('/primary', async (req: Request, res: Response) => {
  const logger = createScopedLogger('EarningsRoute.primary');
  logger.info('PRIMARY endpoint called', { service: 'EarningsRoute' });
  
  try {
    const { dateFrom, dateTo, tickers, importance } = req.query;
    logger.debug('Query params', { 
      service: 'EarningsRoute',
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      tickers: tickers as string,
      importance: importance as string
    });
    
    const query: any = {};
    if (dateFrom && typeof dateFrom === 'string') query.dateFrom = dateFrom;
    if (dateTo && typeof dateTo === 'string') query.dateTo = dateTo;
    if (tickers && typeof tickers === 'string') query.tickers = tickers;
    if (importance && typeof importance === 'string') query.importance = parseInt(importance);
    
    logger.debug('Calling getPrimaryEarnings', { service: 'EarningsRoute', query });
    const startTime = Date.now();
    
    const earnings = await earningsService.getPrimaryEarnings(query);
    
    const duration = Date.now() - startTime;
    logger.info('Service returned earnings', { service: 'EarningsRoute', count: earnings.length, duration_ms: duration });
    
    res.json(earnings);
  } catch (error: any) {
    logger.error('ERROR in PRIMARY endpoint', { 
      service: 'EarningsRoute',
      error_type: error.constructor?.name,
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({ error: 'Internal server error' });
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
    log.error('Earnings API error', { service: 'EarningsRoute', endpoint: 'GET /api/earnings/secondary', error: error.message, stack: error.stack });
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
    log.error('Earnings API error', { service: 'EarningsRoute', endpoint: 'GET /api/earnings', error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

