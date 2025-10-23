/**
 * Cache TTL Constants (in seconds)
 * Using long TTLs to minimize API calls and maximize cache hits
 */
export const CACHE_TTL = {
  LOGO: 30 * 24 * 60 * 60,           // 30 days - logos rarely change
  FUNDAMENTALS: 7 * 24 * 60 * 60,    // 7 days - financial data updates quarterly
  MARKET_CAP: 24 * 60 * 60,          // 24 hours - market cap changes daily
  EARNINGS_PAST: 90 * 24 * 60 * 60,  // 90 days - past earnings are historical (won't change)
  EARNINGS_UPCOMING: 5 * 60,         // 5 minutes - upcoming earnings may get updates (time changes, etc)
};

/**
 * Database update thresholds (in milliseconds)
 * If data is older than this, fetch fresh data from API
 */
export const UPDATE_THRESHOLD = {
  LOGO: 90 * 24 * 60 * 60 * 1000,        // 90 days - logos very rarely change
  FUNDAMENTALS: 7 * 24 * 60 * 60 * 1000, // 7 days - refresh weekly
  MARKET_CAP: 24 * 60 * 60 * 1000,       // 24 hours - refresh daily
  EARNINGS_PAST: 90 * 24 * 60 * 60 * 1000,    // 90 days - past earnings are stable
  EARNINGS_UPCOMING: 5 * 60 * 1000,            // 5 minutes - upcoming earnings need frequent updates
};

