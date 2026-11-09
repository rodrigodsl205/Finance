ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'expense';
ALTER TABLE payment_methods ALTER COLUMN kind SET NOT NULL;
