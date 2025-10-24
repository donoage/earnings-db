/**
 * Logo API Routes
 */

import { Router, Request, Response } from 'express';
import axios from 'axios';
import { logoService } from '../services/logoService';
import { marketCapService } from '../services/marketCapService';

const router = Router();
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';

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

    // Check if ticker has market cap (validates ticker exists and has data)
    const marketCap = await marketCapService.getMarketCap(ticker);
    if (!marketCap) {
      return res.status(404).json({ error: `Ticker ${ticker} not found or has no market cap data` });
    }

    const logo = await logoService.getLogo(ticker);
    
    if (!logo) {
      return res.status(404).json({ error: `Logo not found for ${ticker}` });
    }

    // Get base URL for proxy endpoints
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    
    // Return proxy URLs instead of direct Polygon URLs
    const formattedLogo = {
      ticker: logo.ticker,
      exchange: logo.exchange || '',
      name: logo.companyName,
      files: {
        logo_light: logo.logoUrl ? `${baseUrl}/api/logos/${logo.ticker}/image?type=logo` : undefined,
        mark_light: logo.iconUrl ? `${baseUrl}/api/logos/${logo.ticker}/image?type=icon` : undefined,
        logo_dark: logo.logoUrl ? `${baseUrl}/api/logos/${logo.ticker}/image?type=logo` : undefined,
        mark_dark: logo.iconUrl ? `${baseUrl}/api/logos/${logo.ticker}/image?type=icon` : undefined,
      },
      updated: Date.now(),
    };

    res.json(formattedLogo);
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

    // Filter out tickers without market cap (invalid tickers, ADRs without data, etc.)
    const marketCaps = await marketCapService.getMarketCaps(tickerList);
    const validTickers = marketCaps.map(mc => mc.ticker);
    
    if (validTickers.length === 0) {
      return res.json([]);
    }

    const logos = await logoService.getLogos(validTickers);
    
    // Get base URL for proxy endpoints
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    
    // Transform to match CompanyLogo interface expected by earnings-web
    // Use our proxy endpoint instead of direct Polygon URLs
    const formattedLogos = logos.map(logo => ({
      ticker: logo.ticker,
      exchange: logo.exchange || '',
      name: logo.companyName,
      files: {
        logo_light: logo.logoUrl ? `${baseUrl}/api/logos/${logo.ticker}/image?type=logo` : undefined,
        mark_light: logo.iconUrl ? `${baseUrl}/api/logos/${logo.ticker}/image?type=icon` : undefined,
        logo_dark: logo.logoUrl ? `${baseUrl}/api/logos/${logo.ticker}/image?type=logo` : undefined,
        mark_dark: logo.iconUrl ? `${baseUrl}/api/logos/${logo.ticker}/image?type=icon` : undefined,
      },
      updated: Date.now(),
    }));
    
    res.json(formattedLogos);
  } catch (error: any) {
    console.error('[Logos API] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/logos/:ticker/image
 * Proxy logo image from Polygon (prevents exposing API key to frontend)
 */
router.get('/:ticker/image', async (req: Request, res: Response) => {
  try {
    const { ticker } = req.params;
    const { type = 'icon' } = req.query; // 'icon' or 'logo'
    
    if (!ticker) {
      return res.status(400).json({ error: 'Ticker is required' });
    }

    // Get logo data from our service
    const logoData = await logoService.getLogo(ticker);
    
    if (!logoData) {
      return res.status(404).json({ error: `Logo not found for ${ticker}` });
    }

    // Choose which URL to use
    const imageUrl = type === 'logo' ? logoData.logoUrl : logoData.iconUrl;
    
    if (!imageUrl) {
      return res.status(404).json({ error: `Image not available for ${ticker}` });
    }

    // Fetch image from Polygon with API key (server-side only)
    const imageResponse = await axios.get(`${imageUrl}?apiKey=${POLYGON_API_KEY}`, {
      responseType: 'arraybuffer',
      timeout: 5000,
    });

    // Set appropriate headers
    const contentType = imageResponse.headers['content-type'] || 'image/png';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=2592000'); // Cache for 30 days
    
    // Send image data
    res.send(imageResponse.data);
  } catch (error: any) {
    console.error('[Logos API] Error proxying image:', error.message);
    res.status(500).json({ error: 'Failed to fetch image' });
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

