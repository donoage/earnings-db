/**
 * Redis client configuration
 */

import Redis from 'ioredis';
import log from './logger';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError(err) {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      // Only reconnect when the error contains "READONLY"
      return true;
    }
    return false;
  },
});

redis.on('connect', () => {
  log.info('Redis connected', { service: 'Redis' });
});

redis.on('error', (err) => {
  log.error('Redis error', { service: 'Redis', error: err.message, stack: err.stack });
});

// Cache TTLs
export const CACHE_TTL = {
  LOGO: 24 * 60 * 60, // 24 hours
  EARNING: 1 * 60 * 60, // 1 hour
  FUNDAMENTAL: 24 * 60 * 60, // 24 hours
};

// Helper functions
export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error: any) {
    log.error('Error getting cached data', { 
      service: 'Redis',
      operation: 'get',
      key,
      error: error.message 
    });
    return null;
  }
}

export async function setCached<T>(key: string, value: T, ttl: number): Promise<void> {
  try {
    await redis.setex(key, ttl, JSON.stringify(value));
  } catch (error: any) {
    log.error('Error setting cached data', { 
      service: 'Redis',
      operation: 'set',
      key,
      ttl,
      error: error.message 
    });
  }
}

export async function deleteCached(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (error: any) {
    log.error('Error deleting cached data', { 
      service: 'Redis',
      operation: 'delete',
      key,
      error: error.message 
    });
  }
}

export async function getCachedMany<T>(keys: string[]): Promise<(T | null)[]> {
  if (keys.length === 0) return [];
  
  try {
    const values = await redis.mget(...keys);
    return values.map(v => v ? JSON.parse(v) : null);
  } catch (error: any) {
    log.error('Error getting multiple cached values', { 
      service: 'Redis',
      operation: 'mget',
      key_count: keys.length,
      error: error.message 
    });
    return keys.map(() => null);
  }
}

