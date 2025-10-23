/**
 * Earnings DB API Server
 * Shared database and caching layer for earnings-web and earnings-mobile
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import logosRouter from './routes/logos';
import healthRouter from './routes/health';
import fundamentalsRouter from './routes/fundamentals';
import marketCapRouter from './routes/marketCap';
import earningsRouter from './routes/earnings';

// Load environment variables
dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
  'http://localhost:3000',
  'http://localhost:8081',
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// Routes
app.use('/health', healthRouter);
app.use('/api/logos', logosRouter);
app.use('/api/fundamentals', fundamentalsRouter);
app.use('/api/market-cap', marketCapRouter);
app.use('/api/earnings', earningsRouter);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'Earnings DB API',
    version: '1.0.0',
    description: 'Shared database and caching layer for earnings applications',
    endpoints: {
      health: '/health',
      healthDetailed: '/health/detailed',
      logos: {
        getSingle: '/api/logos/:ticker',
        getMultiple: '/api/logos?tickers=AAPL,MSFT',
        refresh: '/api/logos/:ticker/refresh (POST)',
      },
      fundamentals: {
        getSingle: '/api/fundamentals?ticker=AAPL',
        getMultiple: '/api/fundamentals?tickers=AAPL,MSFT',
      },
      marketCap: {
        getMultiple: '/api/market-cap?tickers=AAPL,MSFT',
      },
      earnings: {
        getRange: '/api/earnings?dateFrom=2025-01-01&dateTo=2025-01-31',
        getWithImportance: '/api/earnings?dateFrom=2025-01-01&dateTo=2025-01-31&importance=5',
      },
    },
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
  });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log('🚀 Earnings DB API Server');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 URL: http://localhost:${PORT}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('Available endpoints:');
  console.log(`  GET  /health`);
  console.log(`  GET  /health/detailed`);
  console.log(`  GET  /api/logos/:ticker`);
  console.log(`  GET  /api/logos?tickers=AAPL,MSFT`);
  console.log(`  POST /api/logos/:ticker/refresh`);
  console.log(`  GET  /api/fundamentals?ticker=AAPL`);
  console.log(`  GET  /api/fundamentals?tickers=AAPL,MSFT`);
  console.log(`  GET  /api/market-cap?tickers=AAPL,MSFT`);
  console.log(`  GET  /api/earnings?dateFrom=2025-01-01&dateTo=2025-01-31`);
  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

