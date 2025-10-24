/**
 * Logo API Routes
 * Note: Logo metadata is served via /api/logo-and-market-cap
 * This route only handles image proxying and refresh operations
 */

import { Router, Request, Response } from 'express';
import axios from 'axios';
import { logoService } from '../services/logoService';

const router = Router();
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';

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

