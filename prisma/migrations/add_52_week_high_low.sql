-- Add 52-week high and low fields to fundamentals table
ALTER TABLE fundamentals 
ADD COLUMN IF NOT EXISTS week_52_high DECIMAL(12, 4),
ADD COLUMN IF NOT EXISTS week_52_low DECIMAL(12, 4);

