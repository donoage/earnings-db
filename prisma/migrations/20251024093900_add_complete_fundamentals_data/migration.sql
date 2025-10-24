-- Add complete fundamentals data fields
-- This migration adds all missing fields from Polygon APIs to support full financial statements

-- Add market data fields
ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "average_volume" DECIMAL(20,2);

-- Add valuation ratio fields
ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "price_to_cash_flow" DECIMAL(10,4);
ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "price_to_free_cash_flow" DECIMAL(10,4);
ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "enterprise_value" DECIMAL(20,2);
ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "ev_to_sales" DECIMAL(10,4);
ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "ev_to_ebitda" DECIMAL(10,4);

-- Add profitability fields
ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "gross_margin" DECIMAL(10,4);

-- Add liquidity ratio fields
ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "quick_ratio" DECIMAL(10,4);
ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "cash_ratio" DECIMAL(10,4);

-- Add income statement fields
ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "revenue" DECIMAL(20,2);
ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "gross_profit" DECIMAL(20,2);
ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "operating_income" DECIMAL(20,2);
ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "net_income" DECIMAL(20,2);
ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "ebitda" DECIMAL(20,2);
ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "earnings_per_share" DECIMAL(10,4);

-- Add balance sheet fields (already added in previous migration, but adding IF NOT EXISTS for safety)
ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "total_assets" DECIMAL(20,2);
ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "current_assets" DECIMAL(20,2);
ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "total_liabilities" DECIMAL(20,2);
ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "current_liabilities" DECIMAL(20,2);
ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "total_equity" DECIMAL(20,2);
ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "cash" DECIMAL(20,2);
ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "long_term_debt" DECIMAL(20,2);

-- Add cash flow statement fields (already added in previous migration, but adding IF NOT EXISTS for safety)
ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "operating_cash_flow" DECIMAL(20,2);
ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "investing_cash_flow" DECIMAL(20,2);
ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "financing_cash_flow" DECIMAL(20,2);
ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "capex" DECIMAL(20,2);

