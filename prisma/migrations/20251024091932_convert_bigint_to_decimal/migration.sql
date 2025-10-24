-- Convert BIGINT columns to DECIMAL in earnings table
-- This migration converts revenue-related columns from BIGINT to DECIMAL(20,2)
-- to properly handle large revenue values with decimal precision
ALTER TABLE "earnings" 
  ALTER COLUMN "revenue_estimate" TYPE DECIMAL(20,2),
  ALTER COLUMN "revenue_actual" TYPE DECIMAL(20,2),
  ALTER COLUMN "revenue_prior" TYPE DECIMAL(20,2),
  ALTER COLUMN "revenue_surprise" TYPE DECIMAL(20,2);

-- Convert BIGINT columns to DECIMAL in fundamentals table
-- This migration converts financial metrics from BIGINT to DECIMAL(20,2)
-- to properly handle large values with decimal precision
ALTER TABLE "fundamentals"
  ALTER COLUMN "market_cap" TYPE DECIMAL(20,2),
  ALTER COLUMN "shares_outstanding" TYPE DECIMAL(20,2),
  ALTER COLUMN "free_cashflow" TYPE DECIMAL(20,2);

