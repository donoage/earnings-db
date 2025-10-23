# Railway Setup Checklist for earnings-db

## ✅ Completed Steps

1. ✅ Created GitHub repository: https://github.com/donoage/earnings-db
2. ✅ Created Railway project: `earnings-db`
3. ✅ Added PostgreSQL database service
4. ✅ Added Redis database service
5. ✅ Fixed Dockerfile to use `npm install` instead of `npm ci`
6. ✅ Pushed code to GitHub (Railway auto-deploys from GitHub)

## 🔄 In Progress

Railway is currently deploying the API service from GitHub.

## ⏳ Remaining Steps

### 1. Wait for Deployment to Complete

Check the Railway dashboard to see when the build completes successfully.

### 2. Configure Environment Variables

Once the API service is deployed, add these environment variables in Railway:

#### In the API Service (earnings-db):

1. Click on the **earnings-db** service (not PostgreSQL or Redis)
2. Go to **Variables** tab
3. Add these variables:

```bash
# Database Connection (Reference from PostgreSQL service)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Redis Connection (Reference from Redis service)
REDIS_URL=${{Redis.REDIS_URL}}

# Polygon API Key
POLYGON_API_KEY=S08ktzv3Ip5XAMeu6FewW37BJ_2YOIsn

# Port (Railway will override this, but good to have)
PORT=3001
```

**How to reference services:**
- Type `${{` and Railway will show autocomplete for available services
- Select `Postgres.DATABASE_URL` for database
- Select `Redis.REDIS_URL` for Redis

### 3. Enable Public Networking

1. In the API service, go to **Settings** tab
2. Scroll to **Networking** section
3. Click **Generate Domain** to create a public URL
4. Copy the generated URL (e.g., `https://earnings-db-production.up.railway.app`)

### 4. Set Health Check (Optional but Recommended)

1. In **Settings** tab
2. Scroll to **Health Check** section
3. Set **Health Check Path**: `/health`
4. Set **Health Check Timeout**: `10` seconds

### 5. Run Prisma Migrations

After the service is deployed and environment variables are set:

1. Go to the API service
2. Click on **Deployments** tab
3. Click on the latest successful deployment
4. Click **View Logs**
5. You should see the service starting up

If you need to run migrations manually:
```bash
railway run npx prisma migrate deploy
```

Or use the Railway CLI:
```bash
cd ~/Projects/earnings-db
railway link
railway run npx prisma migrate deploy
```

### 6. Update earnings-web Environment Variables

Once the API service has a public URL:

#### Local Development (.env.local):
```bash
EARNINGS_DB_URL=https://your-earnings-db.up.railway.app
NEXT_PUBLIC_EARNINGS_DB_URL=https://your-earnings-db.up.railway.app
```

#### Production (Railway earnings-web service):
1. Go to earnings-web service in Railway
2. Add/update these variables:
```bash
EARNINGS_DB_URL=https://your-earnings-db.up.railway.app
NEXT_PUBLIC_EARNINGS_DB_URL=https://your-earnings-db.up.railway.app
```

### 7. Test the Integration

#### Test earnings-db directly:
```bash
# Health check
curl https://your-earnings-db.up.railway.app/health

# Test logos endpoint
curl "https://your-earnings-db.up.railway.app/api/logos?tickers=AAPL,MSFT"
```

#### Test through earnings-web:
```bash
# Local
curl "http://localhost:3000/api/logos?tickers=AAPL,MSFT"

# Production
curl "https://your-earnings-web.up.railway.app/api/logos?tickers=AAPL,MSFT"
```

Check the logs to verify it's using earnings-db:
```
[Logos API] Retrieved 2/2 logos from earnings-db
```

## 📊 Architecture Overview

```
┌─────────────────────────────────────────────────┐
│          Railway Project: earnings-db           │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────────┐  ┌──────────────┐            │
│  │  PostgreSQL  │  │    Redis     │            │
│  │   Database   │  │    Cache     │            │
│  └──────┬───────┘  └──────┬───────┘            │
│         │                 │                     │
│         │   DATABASE_URL  │  REDIS_URL          │
│         │                 │                     │
│  ┌──────▼─────────────────▼───────┐            │
│  │      earnings-db API            │            │
│  │  (Express + Prisma + Redis)     │            │
│  │  https://earnings-db.up...      │            │
│  └─────────────────────────────────┘            │
│                                                 │
└─────────────────────────────────────────────────┘
                    │
                    │ HTTPS
                    ▼
┌─────────────────────────────────────────────────┐
│       Railway Project: earnings-web             │
│  (Next.js app consuming earnings-db API)        │
└─────────────────────────────────────────────────┘
```

## 🔍 Monitoring

### Check Service Status

```bash
cd ~/Projects/earnings-db
railway status
```

### View Logs

```bash
railway logs
```

Or in the Railway dashboard:
1. Click on the API service
2. Go to **Observability** → **Logs**

### Key Log Messages to Look For

**Successful startup:**
```
✓ Connected to PostgreSQL
✓ Connected to Redis
Server is running on port 3001
```

**Successful logo fetch:**
```
[Logo Service] Fetching logos for 10 tickers
[Logo Service] Cache miss for 10 tickers, fetching from Polygon
[Logo Service] Successfully stored 10 logos in database
```

## 🐛 Troubleshooting

### Build fails with "npm ci" error
✅ **Fixed** - Updated Dockerfile to use `npm install`

### "Cannot connect to database"
- Check DATABASE_URL is set correctly
- Verify PostgreSQL service is running
- Check service references: `${{Postgres.DATABASE_URL}}`

### "Cannot connect to Redis"
- Check REDIS_URL is set correctly
- Verify Redis service is running
- Check service references: `${{Redis.REDIS_URL}}`

### "Prisma Client not generated"
- Redeploy the service (Dockerfile runs `npx prisma generate`)
- Or run manually: `railway run npx prisma generate`

## 📚 Related Documentation

- [README.md](./README.md) - API documentation
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Detailed deployment guide
- [QUICKSTART.md](./QUICKSTART.md) - Local development setup
- [PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md) - Project overview

## 🎯 Success Criteria

- [ ] All 3 services running (PostgreSQL, Redis, API)
- [ ] API service has public URL
- [ ] Health check returns `{"status":"ok"}`
- [ ] Logos endpoint returns data
- [ ] earnings-web successfully fetches logos from earnings-db
- [ ] Logs show cache hits after first fetch

