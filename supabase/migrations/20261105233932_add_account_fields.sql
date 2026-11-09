ALTER TABLE accounts ADD COLUMN IF NOT EXISTS holder_name text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS institution text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS agency text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS account_number text;

-- Backfill: use existing name as institution for old accounts
UPDATE accounts SET institution = name WHERE institution IS NULL;
UPDATE accounts SET holder_name = '' WHERE holder_name IS NULL;
