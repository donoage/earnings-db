/**
 * Clear all logo cache from Redis
 * Run with: node scripts/clear-logo-cache.js
 */

const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function clearLogoCache() {
  const redis = new Redis(REDIS_URL);
  
  try {
    console.log('🔍 Scanning for logo cache keys...');
    
    const keys = await redis.keys('logo:*');
    console.log(`📦 Found ${keys.length} logo cache entries`);
    
    if (keys.length > 0) {
      console.log('🗑️  Deleting logo cache...');
      await redis.del(...keys);
      console.log('✅ Successfully cleared all logo cache!');
    } else {
      console.log('✅ No logo cache to clear');
    }
    
    redis.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    redis.disconnect();
    process.exit(1);
  }
}

clearLogoCache();
