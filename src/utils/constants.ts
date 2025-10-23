/**
 * Cache TTL Constants (in seconds)
 * Using long TTLs to minimize API calls and maximize cache hits
 */
export const CACHE_TTL = {
  LOGO: 30 * 24 * 60 * 60,                    // 30 days - logos rarely change
  FUNDAMENTALS: 7 * 24 * 60 * 60,             // 7 days - financial data updates quarterly
  MARKET_CAP: 24 * 60 * 60,                   // 24 hours - market cap changes daily
  EARNINGS_HISTORICAL: 365 * 24 * 60 * 60,    // 1 year - historical earnings never change (cache forever)
  EARNINGS_UPCOMING: 0,                       // 0 seconds - don't cache upcoming earnings (always fresh)
};

/**
 * Database update thresholds (in milliseconds)
 * If data is older than this, fetch fresh data from API
 */
export const UPDATE_THRESHOLD = {
  LOGO: 90 * 24 * 60 * 60 * 1000,             // 90 days - logos very rarely change
  FUNDAMENTALS: 7 * 24 * 60 * 60 * 1000,      // 7 days - refresh weekly
  MARKET_CAP: 24 * 60 * 60 * 1000,            // 24 hours - refresh daily
  EARNINGS_HISTORICAL: 365 * 24 * 60 * 60 * 1000,  // 1 year - historical earnings are final (never update)
  EARNINGS_UPCOMING: 0,                            // 0 - always fetch fresh for upcoming earnings
};

