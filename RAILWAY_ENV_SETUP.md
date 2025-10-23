# Railway Environment Variables Setup

## Issue
Market cap data is not being fetched from Polygon API in production because the `POLYGON_API_KEY` environment variable is not set in Railway.

## Required Environment Variables

The following environment variables must be set in the Railway dashboard for the `earnings-db` service:

### 1. POLYGON_API_KEY
```
POLYGON_API_KEY=S08ktzv3Ip5XAMeu6FewW37BJ_2YOIsn
```

### 2. Other Variables (should already be set)
- `DATABASE_URL` - PostgreSQL connection string (auto-set by Railway)
- `REDIS_URL` - Redis connection string (auto-set by Railway)
- `PORT` - Server port (defaults to 3001)
- `NODE_ENV` - Set to `production`

## How to Set Environment Variables in Railway

1. Go to https://railway.app
2. Select the `earnings-db` project
3. Click on the `earnings-db` service
4. Go to the "Variables" tab
5. Click "New Variable"
6. Add:
   - Variable name: `POLYGON_API_KEY`
   - Value: `S08ktzv3Ip5XAMeu6FewW37BJ_2YOIsn`
7. Click "Add"
8. The service will automatically redeploy with the new environment variable

## Verification

After setting the environment variable, verify it works:

```bash
curl "https://earnings-db-production.up.railway.app/api/market-cap?tickers=BA" | jq '.'
```

Expected output:
```json
{
  "marketCaps": [
    {
      "ticker": "BA",
      "marketCap": 164282820815.69998,
      "updatedAt": "2025-10-23T..."
    }
  ]
}
```

## Impact

Once the `POLYGON_API_KEY` is set:
- Market cap data will be fetched from Polygon for all tickers
- Weekly calendar view will correctly sort companies by market cap
- Boeing (BA), McDonald's (MCD), and other companies will display in the correct order

