/*
# Add transfer destinations, transaction splits, and settlements

1. Purpose
   Phase 5: enable expense splitting between members and inter-person
   settlement tracking. Also improve the transfer type to support
   transfers between accounts (own) and transfers to another person.

2. Changes to `transactions`
   - destination_account_id (uuid, FK → accounts, nullable)
     When type='transfer' and this is set, it represents a transfer
     FROM account_id TO destination_account_id.
   - destination_member_id (uuid, FK → profiles, nullable)
     When type='transfer' and this is set, it represents a transfer
     from the logged-in user TO another member (e.g. "minha para ela").
   - No existing columns are dropped or renamed.

3. New Table: `transaction_splits`
   Records how a single transaction is divided among space members.
   - id (uuid, PK)
   - transaction_id (uuid, FK → transactions, ON DELETE CASCADE)
   - member_id (uuid, FK → profiles) — who shares this portion
   - share_cents (bigint, not null) — amount this member is responsible for
   - share_percent (numeric, nullable) — percentage (0–100), for reference
   - created_at (timestamptz)

   Unique constraint on (transaction_id, member_id) — one split per person
   per transaction.

4. New Table: `settlements`
   Records settlements (acertos) between two members of a space.
   - id (uuid, PK)
   - space_id (uuid, FK → financial_spaces, ON DELETE CASCADE)
   - from_member_id (uuid, FK → profiles) — who owes
   - to_member_id (uuid, FK → profiles) — who is owed
   - amount_cents (bigint, not null) — settled amount
   - status (text, not null, default 'pending') — 'pending' | 'paid' | 'cancelled'
   - paid_at (date, nullable)
   - notes (text, nullable)
   - created_by (uuid, FK → profiles)
   - created_at, updated_at (timestamptz)

5. Indexes
   - transaction_splits: (transaction_id), (member_id)
   - settlements: (space_id), (from_member_id), (to_member_id), (status)

6. Security (RLS)
   - transaction_splits: scoped to space membership through the parent
     transaction's space_id.
   - settlements: scoped to space membership directly.
   Both TO authenticated only.

7. Triggers
   - settlements_updated_at trigger for updated_at.
*/

-- ============================================================
-- Add transfer destination columns to transactions
-- ============================================================
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS destination_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS destination_member_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS transactions_dest_account_idx ON transactions (destination_account_id);
CREATE INDEX IF NOT EXISTS transactions_dest_member_idx ON transactions (destination_member_id);

-- ============================================================
-- transaction_splits
-- ============================================================
CREATE TABLE IF NOT EXISTS transaction_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  share_cents bigint NOT NULL CHECK (share_cents >= 0),
  share_percent numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS splits_tx_member_unique
  ON transaction_splits (transaction_id, member_id);

CREATE INDEX IF NOT EXISTS splits_transaction_idx ON transaction_splits (transaction_id);
CREATE INDEX IF NOT EXISTS splits_member_idx ON transaction_splits (member_id);

ALTER TABLE transaction_splits ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON transaction_splits TO authenticated;

-- Policy: user can access splits for transactions in spaces they belong to
DROP POLICY IF EXISTS "select_splits_as_member" ON transaction_splits;
CREATE POLICY "select_splits_as_member"
  ON transaction_splits FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM transactions t
      JOIN space_members sm ON sm.space_id = t.space_id
      WHERE t.id = transaction_splits.transaction_id
        AND sm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_split_as_member" ON transaction_splits;
CREATE POLICY "insert_split_as_member"
  ON transaction_splits FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM transactions t
      JOIN space_members sm ON sm.space_id = t.space_id
      WHERE t.id = transaction_splits.transaction_id
        AND sm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_split_as_member" ON transaction_splits;
CREATE POLICY "update_split_as_member"
  ON transaction_splits FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM transactions t
      JOIN space_members sm ON sm.space_id = t.space_id
      WHERE t.id = transaction_splits.transaction_id
        AND sm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM transactions t
      JOIN space_members sm ON sm.space_id = t.space_id
      WHERE t.id = transaction_splits.transaction_id
        AND sm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "delete_split_as_member" ON transaction_splits;
CREATE POLICY "delete_split_as_member"
  ON transaction_splits FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM transactions t
      JOIN space_members sm ON sm.space_id = t.space_id
      WHERE t.id = transaction_splits.transaction_id
        AND sm.user_id = auth.uid()
    )
  );

-- ============================================================
-- settlements
-- ============================================================
CREATE TABLE IF NOT EXISTS settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES financial_spaces(id) ON DELETE CASCADE,
  from_member_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  to_member_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  paid_at date,
  notes text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS settlements_space_idx ON settlements (space_id);
CREATE INDEX IF NOT EXISTS settlements_from_idx ON settlements (from_member_id);
CREATE INDEX IF NOT EXISTS settlements_to_idx ON settlements (to_member_id);
CREATE INDEX IF NOT EXISTS settlements_status_idx ON settlements (space_id, status);

ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON settlements TO authenticated;

DROP POLICY IF EXISTS "select_settlements_as_member" ON settlements;
CREATE POLICY "select_settlements_as_member"
  ON settlements FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM space_members
      WHERE space_members.space_id = settlements.space_id
        AND space_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_settlement_as_member" ON settlements;
CREATE POLICY "insert_settlement_as_member"
  ON settlements FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM space_members
      WHERE space_members.space_id = settlements.space_id
        AND space_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_settlement_as_member" ON settlements;
CREATE POLICY "update_settlement_as_member"
  ON settlements FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM space_members
      WHERE space_members.space_id = settlements.space_id
        AND space_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM space_members
      WHERE space_members.space_id = settlements.space_id
        AND space_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "delete_settlement_as_member" ON settlements;
CREATE POLICY "delete_settlement_as_member"
  ON settlements FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM space_members
      WHERE space_members.space_id = settlements.space_id
        AND space_members.user_id = auth.uid()
    )
  );

-- ============================================================
-- Trigger: settlements updated_at
-- ============================================================
DROP TRIGGER IF EXISTS settlements_updated_at ON settlements;
CREATE TRIGGER settlements_updated_at
  BEFORE UPDATE ON settlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
