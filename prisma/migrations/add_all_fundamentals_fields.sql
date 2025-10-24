-- Add all missing fundamentals fields to fundamentals table
-- This migration adds comprehensive financial data fields

-- Market data fields
ALTER TABLE fundamentals 
ADD COLUMN IF NOT EXISTS week_52_high DECIMAL(12, 4),
ADD COLUMN IF NOT EXISTS week_52_low DECIMAL(12, 4),
ADD COLUMN IF NOT EXISTS current_price DECIMAL(12, 4),
ADD COLUMN IF NOT EXISTS shares_outstanding DECIMAL(20, 2),
ADD COLUMN IF NOT EXISTS average_volume DECIMAL(20, 2);

-- Company info fields (if not exists)
ALTER TABLE fundamentals 
ADD COLUMN IF NOT EXISTS sector VARCHAR(100),
ADD COLUMN IF NOT EXISTS industry VARCHAR(100),
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS website VARCHAR(255),
ADD COLUMN IF NOT EXISTS exchange VARCHAR(20);

-- Income statement fields (if not exists)
ALTER TABLE fundamentals 
ADD COLUMN IF NOT EXISTS revenue DECIMAL(20, 2),
ADD COLUMN IF NOT EXISTS net_income DECIMAL(20, 2),
ADD COLUMN IF NOT EXISTS operating_income DECIMAL(20, 2),
ADD COLUMN IF NOT EXISTS gross_profit DECIMAL(20, 2),
ADD COLUMN IF NOT EXISTS ebitda DECIMAL(20, 2),
ADD COLUMN IF NOT EXISTS earnings_per_share DECIMAL(10, 4);

-- Cash flow fields (if not exists)
ALTER TABLE fundamentals 
ADD COLUMN IF NOT EXISTS operating_cash_flow DECIMAL(20, 2),
ADD COLUMN IF NOT EXISTS investing_cash_flow DECIMAL(20, 2),
ADD COLUMN IF NOT EXISTS financing_cash_flow DECIMAL(20, 2),
ADD COLUMN IF NOT EXISTS capex DECIMAL(20, 2),
ADD COLUMN IF NOT EXISTS free_cashflow DECIMAL(20, 2);

-- Balance sheet fields (if not exists)
ALTER TABLE fundamentals 
ADD COLUMN IF NOT EXISTS total_assets DECIMAL(20, 2),
ADD COLUMN IF NOT EXISTS current_assets DECIMAL(20, 2),
ADD COLUMN IF NOT EXISTS total_liabilities DECIMAL(20, 2),
ADD COLUMN IF NOT EXISTS current_liabilities DECIMAL(20, 2),
ADD COLUMN IF NOT EXISTS total_equity DECIMAL(20, 2),
ADD COLUMN IF NOT EXISTS cash DECIMAL(20, 2),
ADD COLUMN IF NOT EXISTS long_term_debt DECIMAL(20, 2);

-- Valuation ratios (if not exists)
ALTER TABLE fundamentals 
ADD COLUMN IF NOT EXISTS price_to_earnings DECIMAL(10, 4),
ADD COLUMN IF NOT EXISTS price_to_book DECIMAL(10, 4),
ADD COLUMN IF NOT EXISTS price_to_sales DECIMAL(10, 4),
ADD COLUMN IF NOT EXISTS price_to_cash_flow DECIMAL(10, 4),
ADD COLUMN IF NOT EXISTS price_to_free_cash_flow DECIMAL(10, 4),
ADD COLUMN IF NOT EXISTS enterprise_value DECIMAL(20, 2),
ADD COLUMN IF NOT EXISTS ev_to_sales DECIMAL(10, 4),
ADD COLUMN IF NOT EXISTS ev_to_ebitda DECIMAL(10, 4);

-- Profitability ratios (if not exists)
ALTER TABLE fundamentals 
ADD COLUMN IF NOT EXISTS return_on_assets DECIMAL(10, 4),
ADD COLUMN IF NOT EXISTS return_on_equity DECIMAL(10, 4),
ADD COLUMN IF NOT EXISTS profit_margin DECIMAL(10, 4),
ADD COLUMN IF NOT EXISTS operating_margin DECIMAL(10, 4),
ADD COLUMN IF NOT EXISTS gross_margin DECIMAL(10, 4);

-- Liquidity ratios (if not exists)
ALTER TABLE fundamentals 
ADD COLUMN IF NOT EXISTS debt_to_equity DECIMAL(10, 4),
ADD COLUMN IF NOT EXISTS current_ratio DECIMAL(10, 4),
ADD COLUMN IF NOT EXISTS quick_ratio DECIMAL(10, 4),
ADD COLUMN IF NOT EXISTS cash_ratio DECIMAL(10, 4),
ADD COLUMN IF NOT EXISTS dividend_yield DECIMAL(10, 4);

