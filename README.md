# Earnings DB API

Shared database and caching layer for earnings-web and earnings-mobile applications.

## Architecture

```
┌─────────────────────────────────────────┐
│         Railway Infrastructure          │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────┐      ┌─────────────┐  │
│  │ PostgreSQL  │      │    Redis    │  │
│  │ (Primary DB)│◄────►│  (Cache)    │  │
│  └─────────────┘      └─────────────┘  │
│        │                     │          │
│        │                     │          │
│  ┌─────▼─────────────────────▼──────┐  │
│  │     Earnings DB API Server       │  │
│  └──────────────────────────────────┘  │
│        │                     │          │
└────────┼─────────────────────┼──────────┘
         │                     │
    ┌────▼────┐           ┌────▼────┐
    │   Web   │           │  Mobile │
    │  App    │           │   App   │
    └─────────┘           └─────────┘
```

## Features

- **Logo Service**: Fetch and cache company logos from Polygon.io
- **Three-tier caching**: Redis → PostgreSQL → Polygon API
- **Shared data**: Single source of truth for web and mobile apps
- **Fast lookups**: O(1) logo retrieval with Redis cache
- **Automatic refresh**: Stale data detection and updates

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL (via Prisma ORM)
- **Cache**: Redis (via ioredis)
- **API**: Polygon.io

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set up Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required variables:
- `DATABASE_URL`: PostgreSQL connection string (from Railway)
- `REDIS_URL`: Redis connection string (from Railway)
- `POLYGON_API_KEY`: Your Polygon.io API key
- `PORT`: Server port (default: 3001)

### 3. Set up Database

```bash
# Generate Prisma client
npm run prisma:generate

# Push schema to database (for Railway)
npm run prisma:push

# Or run migrations (for local development)
npm run prisma:migrate
```

### 4. Start Development Server

```bash
npm run dev
```

Server will start on `http://localhost:3001`

## API Endpoints

### Health Checks

#### `GET /health`
Basic health check

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-23T12:00:00.000Z",
  "uptime": 123.456
}
```

#### `GET /health/detailed`
Detailed health check with database and Redis status

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-23T12:00:00.000Z",
  "uptime": 123.456,
  "services": {
    "database": "ok",
    "redis": "ok"
  }
}
```

### Logos

#### `GET /api/logos/:ticker`
Get logo for a single ticker

**Example:**
```bash
curl http://localhost:3001/api/logos/AAPL
```

**Response:**
```json
{
  "ticker": "AAPL",
  "iconUrl": "https://api.polygon.io/.../icon.jpeg?apiKey=...",
  "logoUrl": "https://api.polygon.io/.../logo.svg?apiKey=...",
  "companyName": "Apple Inc.",
  "exchange": "stocks"
}
```

#### `GET /api/logos?tickers=AAPL,MSFT,GOOGL`
Get logos for multiple tickers (comma-separated)

**Example:**
```bash
curl "http://localhost:3001/api/logos?tickers=AAPL,MSFT,GOOGL"
```

**Response:**
```json
[
  {
    "ticker": "AAPL",
    "iconUrl": "...",
    "logoUrl": "...",
    "companyName": "Apple Inc.",
    "exchange": "stocks"
  },
  {
    "ticker": "MSFT",
    "iconUrl": "...",
    "logoUrl": "...",
    "companyName": "Microsoft Corporation",
    "exchange": "stocks"
  }
]
```

#### `POST /api/logos/:ticker/refresh`
Force refresh logo from Polygon API (bypasses cache)

**Example:**
```bash
curl -X POST http://localhost:3001/api/logos/AAPL/refresh
```

## Deployment to Railway

### 1. Create New Project

```bash
# Login to Railway
railway login

# Create new project
railway init
```

### 2. Add PostgreSQL Service

In Railway dashboard:
1. Click "New" → "Database" → "PostgreSQL"
2. Copy the `DATABASE_URL` connection string

### 3. Add Redis Service

In Railway dashboard:
1. Click "New" → "Database" → "Redis"
2. Copy the `REDIS_URL` connection string

### 4. Add API Service

```bash
# Link to Railway project
railway link

# Add environment variables
railway variables set POLYGON_API_KEY=your_key_here
railway variables set PORT=3001
railway variables set NODE_ENV=production

# Deploy
railway up
```

### 5. Run Database Migrations

```bash
railway run npm run prisma:push
```

## Database Schema

### Logos Table
```sql
CREATE TABLE logos (
  ticker VARCHAR(10) PRIMARY KEY,
  icon_url TEXT,
  logo_url TEXT,
  company_name VARCHAR(255),
  exchange VARCHAR(20),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Earnings Table
```sql
CREATE TABLE earnings (
  id VARCHAR(50) PRIMARY KEY,
  ticker VARCHAR(10),
  date DATE,
  time VARCHAR(10),
  -- ... other fields
  INDEX idx_ticker_date (ticker, date),
  INDEX idx_date_importance (date, importance)
);
```

### Fundamentals Table
```sql
CREATE TABLE fundamentals (
  ticker VARCHAR(10) PRIMARY KEY,
  company_name VARCHAR(255),
  market_cap BIGINT,
  -- ... other fields
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## Caching Strategy

### Logo Lookup Flow:

1. **Redis Cache** (TTL: 24h)
   - O(1) lookup
   - Sub-millisecond response

2. **PostgreSQL** (if cache miss)
   - Indexed lookup
   - ~10ms response
   - Updates Redis cache

3. **Polygon API** (if not in DB)
   - HTTP request
   - ~100-500ms response
   - Stores in PostgreSQL
   - Updates Redis cache

## Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:push` - Push schema to database (no migrations)
- `npm run prisma:studio` - Open Prisma Studio (database GUI)

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Yes | - |
| `REDIS_URL` | Redis connection string | Yes | - |
| `POLYGON_API_KEY` | Polygon.io API key | Yes | - |
| `PORT` | Server port | No | 3001 |
| `NODE_ENV` | Environment (development/production) | No | development |
| `ALLOWED_ORIGINS` | CORS allowed origins (comma-separated) | No | localhost:3000,localhost:8081 |

## License

ISC

