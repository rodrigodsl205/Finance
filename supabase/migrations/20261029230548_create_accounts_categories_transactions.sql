/*
# Create accounts, categories, and transactions tables

1. Purpose
   This migration adds the core financial data tables for Phase 3:
   - `accounts` — financial accounts (checking, digital, savings, cash, etc.)
   - `categories` — editable expense/income categories
   - `transactions` — manual income/expense entries with separate date fields

2. New Tables

   `accounts`
   - id (uuid, PK)
   - space_id (uuid, FK → financial_spaces) — which space this account belongs to
   - name (text, not null) — e.g. "Conta Itaú", "Carteira"
   - type (text, not null) — 'checking' | 'digital' | 'savings' | 'cash' | 'other'
   - owner_id (uuid, FK → profiles) — who created/owns the account
   - initial_balance_cents (bigint, not null, default 0) — starting balance in cents
   - reference_date (date, not null) — date the initial balance refers to
   - status (text, not null, default 'active') — 'active' | 'archived'
   - created_at, updated_at (timestamptz)

   `categories`
   - id (uuid, PK)
   - space_id (uuid, FK → financial_spaces) — which space this category belongs to
   - name (text, not null) — e.g. "Moradia", "Supermercado"
   - kind (text, not null) — 'expense' | 'income'
   - icon (text, nullable) — optional icon name
   - color (text, nullable) — optional color hex
   - status (text, not null, default 'active') — 'active' | 'archived'
   - created_at, updated_at (timestamptz)
   - Unique constraint on (space_id, name, kind)

   `transactions`
   - id (uuid, PK)
   - space_id (uuid, FK → financial_spaces)
   - type (text, not null) — 'income' | 'expense' | 'transfer'
   - description (text, not null)
   - amount_cents (bigint, not null) — total amount in cents (always positive; type determines direction)
   - category_id (uuid, FK → categories, nullable) — null for transfers
   - account_id (uuid, FK → accounts, nullable) — which account this affects
   - responsible_id (uuid, FK → profiles, nullable) — who is responsible
   - payer_id (uuid, FK → profiles, nullable) — who actually paid/received
   - occurred_at (date, not null) — date of realization (the expense/income happened)
   - due_date (date, nullable) — expected payment/receipt date
   - paid_at (date, nullable) — actual payment/receipt date (null = pending)
   - status (text, not null, default 'pending') — 'pending' | 'paid' | 'partial' | 'cancelled'
   - notes (text, nullable)
   - split_type (text, not null, default 'individual') — 'individual' | 'equal' | 'percent' | 'custom'
   - version (integer, not null, default 1) — optimistic concurrency control
   - created_by (uuid, FK → profiles) — who created this transaction
   - created_at, updated_at (timestamptz)

3. Indexes
   - accounts: (space_id), (owner_id)
   - categories: (space_id), (space_id, kind)
   - transactions: (space_id), (space_id, occurred_at), (space_id, due_date),
     (space_id, paid_at), (category_id), (account_id), (status)

4. Security (RLS)
   All three tables use the same pattern: users can only access rows in spaces
   where they are a member (checked via space_members). All CRUD is scoped
   TO authenticated. No anon access (this app requires sign-in).

   - SELECT: user must be a member of the transaction's/account's/category's space
   - INSERT: user must be a member of the target space
   - UPDATE: user must be a member of the row's space
   - DELETE: user must be a member of the row's space

5. Notes
   - Money is stored as integer cents (bigint), never float.
   - occurred_at is mandatory (date of realization); due_date and paid_at are
     separate nullable fields — this is the core rule of the app.
   - version column on transactions enables optimistic concurrency: when
     updating, the client sends the version it read; if it doesn't match,
     the update affects 0 rows and the UI can detect a conflict.
   - split_type allows future per-person division (Phase 5); for now it
     defaults to 'individual'.
*/

-- ============================================================
-- accounts
-- ============================================================
CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES financial_spaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('checking', 'digital', 'savings', 'cash', 'other')),
  owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  initial_balance_cents bigint NOT NULL DEFAULT 0,
  reference_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS accounts_space_id_idx ON accounts (space_id);
CREATE INDEX IF NOT EXISTS accounts_owner_id_idx ON accounts (owner_id);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON accounts TO authenticated;

DROP POLICY IF EXISTS "select_accounts_as_member" ON accounts;
CREATE POLICY "select_accounts_as_member"
  ON accounts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM space_members
      WHERE space_members.space_id = accounts.space_id
        AND space_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_account_as_member" ON accounts;
CREATE POLICY "insert_account_as_member"
  ON accounts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM space_members
      WHERE space_members.space_id = accounts.space_id
        AND space_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_account_as_member" ON accounts;
CREATE POLICY "update_account_as_member"
  ON accounts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM space_members
      WHERE space_members.space_id = accounts.space_id
        AND space_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM space_members
      WHERE space_members.space_id = accounts.space_id
        AND space_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "delete_account_as_member" ON accounts;
CREATE POLICY "delete_account_as_member"
  ON accounts FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM space_members
      WHERE space_members.space_id = accounts.space_id
        AND space_members.user_id = auth.uid()
    )
  );

-- ============================================================
-- categories
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES financial_spaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('expense', 'income')),
  icon text,
  color text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS categories_space_name_kind_unique
  ON categories (space_id, name, kind);

CREATE INDEX IF NOT EXISTS categories_space_id_idx ON categories (space_id);
CREATE INDEX IF NOT EXISTS categories_space_kind_idx ON categories (space_id, kind);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON categories TO authenticated;

DROP POLICY IF EXISTS "select_categories_as_member" ON categories;
CREATE POLICY "select_categories_as_member"
  ON categories FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM space_members
      WHERE space_members.space_id = categories.space_id
        AND space_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_category_as_member" ON categories;
CREATE POLICY "insert_category_as_member"
  ON categories FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM space_members
      WHERE space_members.space_id = categories.space_id
        AND space_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_category_as_member" ON categories;
CREATE POLICY "update_category_as_member"
  ON categories FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM space_members
      WHERE space_members.space_id = categories.space_id
        AND space_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM space_members
      WHERE space_members.space_id = categories.space_id
        AND space_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "delete_category_as_member" ON categories;
CREATE POLICY "delete_category_as_member"
  ON categories FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM space_members
      WHERE space_members.space_id = categories.space_id
        AND space_members.user_id = auth.uid()
    )
  );

-- ============================================================
-- transactions
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES financial_spaces(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  description text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  responsible_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  payer_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  occurred_at date NOT NULL,
  due_date date,
  paid_at date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'partial', 'cancelled')),
  notes text,
  split_type text NOT NULL DEFAULT 'individual' CHECK (split_type IN ('individual', 'equal', 'percent', 'custom')),
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transactions_space_id_idx ON transactions (space_id);
CREATE INDEX IF NOT EXISTS transactions_space_occurred_idx ON transactions (space_id, occurred_at);
CREATE INDEX IF NOT EXISTS transactions_space_due_idx ON transactions (space_id, due_date);
CREATE INDEX IF NOT EXISTS transactions_space_paid_idx ON transactions (space_id, paid_at);
CREATE INDEX IF NOT EXISTS transactions_category_idx ON transactions (category_id);
CREATE INDEX IF NOT EXISTS transactions_account_idx ON transactions (account_id);
CREATE INDEX IF NOT EXISTS transactions_status_idx ON transactions (space_id, status);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON transactions TO authenticated;

DROP POLICY IF EXISTS "select_transactions_as_member" ON transactions;
CREATE POLICY "select_transactions_as_member"
  ON transactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM space_members
      WHERE space_members.space_id = transactions.space_id
        AND space_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_transaction_as_member" ON transactions;
CREATE POLICY "insert_transaction_as_member"
  ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM space_members
      WHERE space_members.space_id = transactions.space_id
        AND space_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_transaction_as_member" ON transactions;
CREATE POLICY "update_transaction_as_member"
  ON transactions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM space_members
      WHERE space_members.space_id = transactions.space_id
        AND space_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM space_members
      WHERE space_members.space_id = transactions.space_id
        AND space_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "delete_transaction_as_member" ON transactions;
CREATE POLICY "delete_transaction_as_member"
  ON transactions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM space_members
      WHERE space_members.space_id = transactions.space_id
        AND space_members.user_id = auth.uid()
    )
  );

-- ============================================================
-- Triggers: updated_at for all new tables
-- ============================================================

DROP TRIGGER IF EXISTS accounts_updated_at ON accounts;
CREATE TRIGGER accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS categories_updated_at ON categories;
CREATE TRIGGER categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS transactions_updated_at ON transactions;
CREATE TRIGGER transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Auto-increment version on transactions update
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_transaction_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_version_bump ON transactions;
CREATE TRIGGER transactions_version_bump
  BEFORE UPDATE ON transactions
  FOR EACH ROW
  WHEN (NEW.version = OLD.version)
  EXECUTE FUNCTION public.increment_transaction_version();

REVOKE EXECUTE ON FUNCTION public.increment_transaction_version() FROM PUBLIC, anon;
