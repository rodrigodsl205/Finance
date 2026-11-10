/*
# Add payment distribution columns to transactions

1. Purpose
   Support tracking who paid how much in shared expenses, enabling
   automatic settlement (acerto) generation between space members.
   The existing `responsible_id` and `payer_id` columns already
   identify who is responsible and who primarily paid, but we need
   amount breakdowns for "both paid" scenarios.

2. Changes to `transactions`
   - payer_amount_cents (bigint, nullable) — how much payer_id actually paid.
     Null means payer_id paid the full amount (default behavior).
   - secondary_payer_id (uuid, FK → profiles, nullable) — the other
     person who also contributed to the payment (for "Ambos" mode).
   - secondary_payer_amount_cents (bigint, nullable) — how much
     secondary_payer_id paid.

   These columns are all nullable so existing transactions are
   unaffected. They are populated only for shared expenses where
   payment distribution needs to be tracked.

3. Indexes
   - transactions_secondary_payer_idx on (secondary_payer_id)

4. Security
   No new RLS policies needed — transactions already has full
   space-membership-scoped CRUD policies. The new columns inherit
   those policies automatically. No new grants needed since
   authenticated already has INSERT/UPDATE on all columns of
   transactions.
*/

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS payer_amount_cents bigint,
  ADD COLUMN IF NOT EXISTS secondary_payer_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS secondary_payer_amount_cents bigint;

CREATE INDEX IF NOT EXISTS transactions_secondary_payer_idx ON transactions (secondary_payer_id);
