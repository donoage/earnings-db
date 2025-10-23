# Deployment Guide - Railway

This guide walks you through deploying earnings-db to Railway with PostgreSQL and Redis services.

## Prerequisites

- Railway account (https://railway.app)
- Railway CLI installed (`npm install -g @railway/cli`)
- Git repository

## Step 1: Create Railway Project

```bash
# Login to Railway
railway login

# Create new project
railway init

# Name it: earnings-db
```

## Step 2: Add PostgreSQL Service

1. Go to Railway dashboard
2. Click your `earnings-db` project
3. Click "New" → "Database" → "PostgreSQL"
4. Railway will automatically create the database and set `DATABASE_URL`

## Step 3: Add Redis Service

1. In the same project, click "New" → "Database" → "Redis"
2. Railway will automatically create Redis and set `REDIS_URL`

## Step 4: Configure API Service

### Add Environment Variables

In Railway dashboard, go to your API service and add:

```bash
POLYGON_API_KEY=your_polygon_api_key_here
PORT=3001
NODE_ENV=production
ALLOWED_ORIGINS=https://your-web-app.railway.app,https://your-mobile-app.railway.app
```

### Railway will automatically set:
- `DATABASE_URL` (from PostgreSQL service)
- `REDIS_URL` (from Redis service)

## Step 5: Deploy

```bash
# Make sure you're in the earnings-db directory
cd /path/to/earnings-db

# Link to Railway project (if not already linked)
railway link

# Deploy
railway up
```

## Step 6: Run Database Migrations

After deployment, run Prisma migrations:

```bash
# Push schema to database
railway run npm run prisma:push

# Or run migrations (if you have migration files)
railway run npm run prisma:migrate
```

## Step 7: Verify Deployment

### Check Health

```bash
# Get your Railway URL
railway domain

# Test health endpoint
curl https://your-app.railway.app/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-10-23T12:00:00.000Z",
  "uptime": 123.456
}
```

### Check Detailed Health

```bash
curl https://your-app.railway.app/health/detailed
```

Expected response:
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

### Test Logo API

```bash
curl https://your-app.railway.app/api/logos/AAPL
```

## Architecture on Railway

```
┌─────────────────────────────────────────┐
│         Railway Project: earnings-db    │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  Service 1: PostgreSQL          │   │
│  │  - Auto-provisioned             │   │
│  │  - DATABASE_URL set             │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  Service 2: Redis               │   │
│  │  - Auto-provisioned             │   │
│  │  - REDIS_URL set                │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  Service 3: API Server          │   │
│  │  - Dockerfile build             │   │
│  │  - PORT: 3001                   │   │
│  │  - Connects to DB & Redis       │   │
│  └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

## Connecting from Web/Mobile Apps

### Update Web App

In `earnings-web/.env.local`:
```bash
NEXT_PUBLIC_API_URL=https://your-earnings-db.railway.app
```

### Update Mobile App

In `earnings-mobile` config:
```typescript
const API_URL = 'https://your-earnings-db.railway.app';
```

## Monitoring

### View Logs

```bash
railway logs
```

### View Metrics

Go to Railway dashboard → Your service → Metrics

## Troubleshooting

### Database Connection Issues

```bash
# Check DATABASE_URL is set
railway variables

# Test database connection
railway run npx prisma db pull
```

### Redis Connection Issues

```bash
# Check REDIS_URL is set
railway variables

# Test Redis in your app logs
railway logs --filter "Redis"
```

### Build Failures

```bash
# Check build logs
railway logs --deployment

# Rebuild
railway up --detach
```

## Updating Deployment

```bash
# Make changes to code
git add .
git commit -m "Your changes"
git push

# Railway will auto-deploy on push
# Or manually trigger:
railway up
```

## Scaling

### Vertical Scaling (More Resources)

1. Go to Railway dashboard
2. Select your API service
3. Settings → Resources
4. Adjust CPU/Memory

### Horizontal Scaling (Multiple Instances)

Railway Pro plan supports replicas:
1. Settings → Replicas
2. Set number of instances

## Cost Estimation

Railway pricing (as of 2025):

| Service | Free Tier | Starter | Pro |
|---------|-----------|---------|-----|
| **PostgreSQL** | 512MB RAM | $5/month | Usage-based |
| **Redis** | Not available | $5/month | Usage-based |
| **API Server** | $5 credit/month | $5/month | Usage-based |

**Estimated Monthly Cost**: ~$15-20/month for all services

## Security

### Environment Variables

Never commit `.env` files. Always use Railway's environment variable management.

### CORS

Update `ALLOWED_ORIGINS` to include only your production domains:

```bash
railway variables set ALLOWED_ORIGINS=https://earnings-web.railway.app,https://earnings-mobile.railway.app
```

### Database

Railway PostgreSQL includes:
- Automatic backups
- SSL connections
- Private networking

## Backup Strategy

### Database Backups

Railway automatically backs up PostgreSQL daily.

Manual backup:
```bash
railway run pg_dump $DATABASE_URL > backup.sql
```

### Redis Backups

Redis data is cache-only, no backups needed. Data can be regenerated from PostgreSQL.

## Support

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- GitHub Issues: Create issue in your repo

---

**Last Updated**: October 23, 2025

