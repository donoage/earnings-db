import { Router, Request, Response } from 'express';
import { newsService } from '../services/newsService';
import log from '../utils/logger';

const router = Router();

/**
 * GET /api/news
 * Get news articles with optional filters
 * Query params:
 *   - ticker: Filter by ticker symbol (optional)
 *   - limit: Number of articles to return (default: 50, max: 1000)
 *   - dateFrom: Filter articles published on or after this date (YYYY-MM-DD)
 *   - dateTo: Filter articles published on or before this date (YYYY-MM-DD)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { ticker, limit, dateFrom, dateTo } = req.query;
    
    const params: {
      ticker?: string;
      limit?: number;
      dateFrom?: string;
      dateTo?: string;
    } = {};
    
    if (ticker && typeof ticker === 'string') {
      params.ticker = ticker.toUpperCase();
    }
    
    if (limit && typeof limit === 'string') {
      params.limit = Math.min(parseInt(limit), 1000);
    }
    
    if (dateFrom && typeof dateFrom === 'string') {
      params.dateFrom = dateFrom;
    }
    
    if (dateTo && typeof dateTo === 'string') {
      params.dateTo = dateTo;
    }
    
    const news = await newsService.getNews(params);
    
    res.json({
      count: news.length,
      results: news,
    });
  } catch (error: any) {
    log.error('News API error', { service: 'NewsRoute', endpoint: 'GET /api/news', error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/news/:ticker
 * Get news for a specific ticker
 */
router.get('/:ticker', async (req: Request, res: Response) => {
  try {
    const { ticker } = req.params;
    const { limit } = req.query;
    
    const params: {
      ticker: string;
      limit?: number;
    } = {
      ticker: ticker.toUpperCase(),
    };
    
    if (limit && typeof limit === 'string') {
      params.limit = Math.min(parseInt(limit), 1000);
    }
    
    const news = await newsService.getNews(params);
    
    res.json({
      ticker: ticker.toUpperCase(),
      count: news.length,
      results: news,
    });
  } catch (error: any) {
    log.error('News API error', { service: 'NewsRoute', endpoint: 'GET /api/news/:ticker', ticker: req.params.ticker, error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/news/cache/:ticker?
 * Clear cache for a specific ticker or all news
 */
router.delete('/cache/:ticker?', async (req: Request, res: Response) => {
  try {
    const { ticker } = req.params;
    await newsService.clearCache(ticker?.toUpperCase());
    res.json({ message: 'Cache cleared successfully' });
  } catch (error: any) {
    log.error('News API error clearing cache', { service: 'NewsRoute', endpoint: 'DELETE /api/news/cache/:ticker', ticker: req.params.ticker, error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

