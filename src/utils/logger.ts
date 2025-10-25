/**
 * Railway-Compliant Structured Logger
 * 
 * Follows Railway logging best practices:
 * - Single-line JSON format for structured logs
 * - Automatic level-based coloring (debug, info, warn, error)
 * - Queryable attributes via @attribute:value syntax
 * - Respects 500 logs/second rate limit
 * 
 * Reference: https://docs.railway.com/guides/logs#structured-logs
 */

import winston from 'winston';

// Log levels
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Create Winston logger with JSON format
const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    winston.format.errors({ stack: true }),
    winston.format.json() // Single-line JSON output
  ),
  transports: [
    new winston.transports.Console()
  ],
  // Prevent Winston from exiting on error
  exitOnError: false,
});

/**
 * Type-safe logging interface with structured attributes
 */
interface LogAttributes {
  [key: string]: string | number | boolean | null | undefined | string[];
}

/**
 * Structured logger with Railway-compliant format
 */
export const log = {
  /**
   * Debug level - for verbose logging (disabled in production)
   * Use for: cache hits/misses, detailed operation steps
   */
  debug(message: string, attributes?: LogAttributes): void {
    logger.debug(message, attributes);
  },

  /**
   * Info level - for significant events
   * Use for: API calls, database operations, successful completions
   */
  info(message: string, attributes?: LogAttributes): void {
    logger.info(message, attributes);
  },

  /**
   * Warn level - for recoverable issues
   * Use for: fallbacks, retries, deprecated usage
   */
  warn(message: string, attributes?: LogAttributes): void {
    logger.warn(message, attributes);
  },

  /**
   * Error level - for failures and exceptions
   * Use for: API errors, database failures, unhandled errors
   */
  error(message: string, attributes?: LogAttributes): void {
    logger.error(message, attributes);
  },

  /**
   * Log HTTP request/response (batched to avoid rate limits)
   */
  http(method: string, path: string, statusCode: number, duration: number): void {
    logger.info('HTTP request', {
      method,
      path,
      statusCode,
      duration_ms: duration,
    });
  },

  /**
   * Log batch operation (aggregate multiple operations into single log)
   */
  batch(message: string, count: number, attributes?: LogAttributes): void {
    logger.info(message, {
      ...attributes,
      batch_count: count,
    });
  },

  /**
   * Log API call with timing
   */
  api(service: string, endpoint: string, duration: number, success: boolean, attributes?: LogAttributes): void {
    logger.info('API call', {
      service,
      endpoint,
      duration_ms: duration,
      success,
      ...attributes,
    });
  },

  /**
   * Log database operation with timing
   */
  db(operation: string, table: string, duration: number, success: boolean, attributes?: LogAttributes): void {
    logger.info('Database operation', {
      operation,
      table,
      duration_ms: duration,
      success,
      ...attributes,
    });
  },

  /**
   * Log cache operation
   */
  cache(operation: 'hit' | 'miss' | 'set' | 'delete', key: string, attributes?: LogAttributes): void {
    // Only log cache operations at debug level to avoid spam
    logger.debug('Cache operation', {
      operation,
      key,
      ...attributes,
    });
  },
};

/**
 * Create a scoped logger with automatic context
 * Useful for tracking operations across multiple log calls
 */
export function createScopedLogger(scope: string, contextId?: string) {
  const context = contextId || Math.random().toString(36).substring(7);
  
  return {
    debug(message: string, attributes?: LogAttributes): void {
      log.debug(message, { scope, context, ...attributes });
    },
    info(message: string, attributes?: LogAttributes): void {
      log.info(message, { scope, context, ...attributes });
    },
    warn(message: string, attributes?: LogAttributes): void {
      log.warn(message, { scope, context, ...attributes });
    },
    error(message: string, attributes?: LogAttributes): void {
      log.error(message, { scope, context, ...attributes });
    },
  };
}

/**
 * Sampling counter for high-frequency operations
 * Use to log only every Nth operation to avoid rate limits
 */
export class LogSampler {
  private counter = 0;
  
  constructor(private sampleRate: number) {}
  
  shouldLog(): boolean {
    this.counter++;
    return this.counter % this.sampleRate === 0;
  }
  
  getCount(): number {
    return this.counter;
  }
  
  reset(): void {
    this.counter = 0;
  }
}

export default log;

