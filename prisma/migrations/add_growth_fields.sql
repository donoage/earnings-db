-- Add revenue and earnings growth fields to fundamentals table
ALTER TABLE fundamentals 
ADD COLUMN IF NOT EXISTS revenue_growth DECIMAL(10, 4),
ADD COLUMN IF NOT EXISTS earnings_growth DECIMAL(10, 4);

