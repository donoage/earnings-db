-- Remove API keys from logo URLs in database
-- This will force them to be refetched with the new proxy-based system

UPDATE logos
SET 
  icon_url = REGEXP_REPLACE(icon_url, '\?apiKey=.*$', ''),
  logo_url = REGEXP_REPLACE(logo_url, '\?apiKey=.*$', '')
WHERE 
  icon_url LIKE '%?apiKey=%' OR 
  logo_url LIKE '%?apiKey=%';

-- Verify the update
SELECT COUNT(*) as cleaned_logos 
FROM logos 
WHERE icon_url NOT LIKE '%?apiKey=%' AND logo_url NOT LIKE '%?apiKey=%';

