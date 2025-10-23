# Quick Start Guide

Get earnings-db running locally in 5 minutes!

## Prerequisites

- Node.js 20+
- Docker Desktop (for PostgreSQL and Redis)
- Polygon.io API key

## Option 1: Using Docker Compose (Easiest)

### 1. Create docker-compose.yml

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: earnings
      POSTGRES_PASSWORD: earnings
      POSTGRES_DB: earnings_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### 2. Start Services

```bash
docker-compose up -d
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```bash
DATABASE_URL="postgresql://earnings:earnings@localhost:5432/earnings_db"
REDIS_URL="redis://localhost:6379"
POLYGON_API_KEY=your_key_here
PORT=3001
NODE_ENV=development
```

### 4. Install Dependencies

```bash
npm install
```

### 5. Setup Database

```bash
npm run prisma:push
```

### 6. Start Server

```bash
npm run dev
```

✅ Server running at http://localhost:3001

## Option 2: Using Railway Services (Cloud)

### 1. Install Railway CLI

```bash
npm install -g @railway/cli
```

### 2. Login and Create Project

```bash
railway login
railway init
```

### 3. Add Services

In Railway dashboard:
- Add PostgreSQL
- Add Redis
- Copy connection strings

### 4. Configure Local Environment

```bash
cp .env.example .env
```

Add the Railway connection strings to `.env`

### 5. Install and Run

```bash
npm install
npm run prisma:push
npm run dev
```

## Testing the API

### Health Check

```bash
curl http://localhost:3001/health
```

### Get Logo

```bash
curl http://localhost:3001/api/logos/AAPL
```

### Get Multiple Logos

```bash
curl "http://localhost:3001/api/logos?tickers=AAPL,MSFT,GOOGL"
```

## Next Steps

1. **Deploy to Railway**: See [DEPLOYMENT.md](./DEPLOYMENT.md)
2. **Connect Web App**: Update `earnings-web` to use this API
3. **Connect Mobile App**: Update `earnings-mobile` to use this API

## Troubleshooting

### Can't connect to PostgreSQL

```bash
# Check if PostgreSQL is running
docker ps

# Restart PostgreSQL
docker-compose restart postgres
```

### Can't connect to Redis

```bash
# Check if Redis is running
docker ps

# Restart Redis
docker-compose restart redis
```

### Prisma errors

```bash
# Regenerate Prisma client
npm run prisma:generate

# Reset database
npm run prisma:push --force-reset
```

## Development Workflow

```bash
# Start services
docker-compose up -d

# Start dev server (with hot reload)
npm run dev

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Project Structure

```
earnings-db/
├── src/
│   ├── index.ts           # Main server
│   ├── routes/            # API routes
│   │   ├── health.ts      # Health checks
│   │   └── logos.ts       # Logo endpoints
│   ├── services/          # Business logic
│   │   └── logoService.ts # Logo service
│   └── utils/             # Utilities
│       ├── prisma.ts      # Prisma client
│       └── redis.ts       # Redis client
├── prisma/
│   └── schema.prisma      # Database schema
├── Dockerfile             # Docker config
├── railway.json           # Railway config
└── package.json           # Dependencies
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build TypeScript to JavaScript |
| `npm start` | Start production server |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:push` | Push schema to database |
| `npm run prisma:studio` | Open Prisma Studio (DB GUI) |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ | - | PostgreSQL connection string |
| `REDIS_URL` | ✅ | - | Redis connection string |
| `POLYGON_API_KEY` | ✅ | - | Polygon.io API key |
| `PORT` | ❌ | 3001 | Server port |
| `NODE_ENV` | ❌ | development | Environment |
| `ALLOWED_ORIGINS` | ❌ | localhost | CORS origins |

---

**Need Help?** Check [README.md](./README.md) for full documentation.

