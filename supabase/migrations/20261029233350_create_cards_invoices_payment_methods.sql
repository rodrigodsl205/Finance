/*
# Phase 6: Credit cards, invoices, payment methods, and transaction enhancements

1. Purpose
   Add credit card management with invoices, and a customizable
   payment methods system. Also enhance the transactions table with
   establishment and CPF/CNPJ fields, replacing the fixed account_id
   with a flexible payment_method_id.

2. New Table: `payment_methods`
   Customizable payment methods per space (PIX, Cartão, Dinheiro, etc).
   - id (uuid, PK)
   - space_id (uuid, FK → financial_spaces, ON DELETE CASCADE)
   - name (text, not null) — e.g. "PIX", "Cartão de crédito", "Dinheiro"
   - icon (text, nullable) — optional lucide icon name
   - is_default (boolean, default false) — shown first in lists
   - status (text, not null, default 'active') — 'active' | 'archived'
   - created_at, updated_at (timestamptz)
   - Unique constraint on (space_id, name)

3. Changes to `transactions`
   - establishment (text, nullable) — store/merchant name
   - cpf_cnpj (text, nullable) — optional tax ID of the establishment
   - payment_method_id (uuid, FK → payment_methods, nullable)
     Replaces account_id as the primary "how it was paid" field.
     account_id is kept for backwards compatibility but will be
     superseded by payment_method_id in the UI.
   - card_id (uuid, FK → cards, nullable) — which card was used (for credit)
   - invoice_item_id (uuid, FK → invoice_items, nullable) — links a
     credit card transaction to its invoice item

4. New Table: `cards`
   Credit cards with limit, closing day, and due day.
   - id (uuid, PK)
   - space_id (uuid, FK → financial_spaces, ON DELETE CASCADE)
   - name (text, not null) — e.g. "Visa Infinite", "Mastercard Black"
   - holder_name (text, nullable) — name printed on card
   - brand (text, nullable) — "Visa", "Mastercard", "Elo", etc
   - last_digits (text, nullable) — last 4 digits
   - limit_cents (bigint, not null, default 0) — total credit limit
   - closing_day (int, not null, CHECK 1–31) — statement closing day
   - due_day (int, not null, CHECK 1–31) — payment due day
   - owner_id (uuid, FK → profiles) — who owns the card
   - status (text, not null, default 'active') — 'active' | 'archived'
   - created_at, updated_at (timestamptz)

5. New Table: `invoices`
   Monthly credit card invoices.
   - id (uuid, PK)
   - card_id (uuid, FK → cards, ON DELETE CASCADE)
   - space_id (uuid, FK → financial_spaces, ON DELETE CASCADE)
   - period_start (date, not null) — billing period start
   - period_end (date, not null) — billing period end
   - closing_date (date, not null) — statement closing date
   - due_date (date, not null) — payment due date
   - total_cents (bigint, not null, default 0) — computed total
   - paid_cents (bigint, not null, default 0) — amount paid so far
   - status (text, not null, default 'open')
     'open' | 'closed' | 'paid' | 'partial' | 'overdue'
   - payment_method_id (uuid, FK → payment_methods, nullable) — how invoice was paid
   - notes (text, nullable)
   - created_at, updated_at (timestamptz)
   - Unique constraint on (card_id, period_start)

6. New Table: `invoice_items`
   Individual purchases that compose an invoice.
   - id (uuid, PK)
   - invoice_id (uuid, FK → invoices, ON DELETE CASCADE)
   - transaction_id (uuid, FK → transactions, nullable, ON DELETE SET NULL)
   - description (text, not null)
   - establishment (text, nullable)
   - amount_cents (bigint, not null) — installment amount for this month
   - installment_number (int, nullable) — current installment (e.g. 2 of 6)
   - installment_total (int, nullable) — total installments
   - category_id (uuid, FK → categories, nullable)
   - occurred_at (date, not null) — purchase date
   - created_at (timestamptz)

7. Indexes
   - payment_methods: (space_id)
   - cards: (space_id), (owner_id)
   - invoices: (card_id), (space_id), (status)
   - invoice_items: (invoice_id), (transaction_id)

8. Security (RLS)
   All new tables use space-membership-scoped RLS, TO authenticated only.
   Same pattern as existing tables: SELECT/INSERT/UPDATE/DELETE checked
   via EXISTS subquery on space_members.

9. Triggers
   - updated_at triggers for payment_methods, cards, invoices.
*/

-- ============================================================
-- payment_methods
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES financial_spaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text,
  is_default boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_methods_space_name_unique
  ON payment_methods (space_id, name);

CREATE INDEX IF NOT EXISTS payment_methods_space_idx ON payment_methods (space_id);

ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON payment_methods TO authenticated;

DROP POLICY IF EXISTS "select_payment_methods_as_member" ON payment_methods;
CREATE POLICY "select_payment_methods_as_member"
  ON payment_methods FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM space_members WHERE space_id = payment_methods.space_id AND user_id = auth.uid()));

DROP POLICY IF EXISTS "insert_payment_method_as_member" ON payment_methods;
CREATE POLICY "insert_payment_method_as_member"
  ON payment_methods FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM space_members WHERE space_id = payment_methods.space_id AND user_id = auth.uid()));

DROP POLICY IF EXISTS "update_payment_method_as_member" ON payment_methods;
CREATE POLICY "update_payment_method_as_member"
  ON payment_methods FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM space_members WHERE space_id = payment_methods.space_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM space_members WHERE space_id = payment_methods.space_id AND user_id = auth.uid()));

DROP POLICY IF EXISTS "delete_payment_method_as_member" ON payment_methods;
CREATE POLICY "delete_payment_method_as_member"
  ON payment_methods FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM space_members WHERE space_id = payment_methods.space_id AND user_id = auth.uid()));

-- ============================================================
-- cards
-- ============================================================
CREATE TABLE IF NOT EXISTS cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES financial_spaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  holder_name text,
  brand text,
  last_digits text,
  limit_cents bigint NOT NULL DEFAULT 0,
  closing_day int NOT NULL CHECK (closing_day >= 1 AND closing_day <= 31),
  due_day int NOT NULL CHECK (due_day >= 1 AND due_day <= 31),
  owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cards_space_idx ON cards (space_id);
CREATE INDEX IF NOT EXISTS cards_owner_idx ON cards (owner_id);

ALTER TABLE cards ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON cards TO authenticated;

DROP POLICY IF EXISTS "select_cards_as_member" ON cards;
CREATE POLICY "select_cards_as_member"
  ON cards FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM space_members WHERE space_id = cards.space_id AND user_id = auth.uid()));

DROP POLICY IF EXISTS "insert_card_as_member" ON cards;
CREATE POLICY "insert_card_as_member"
  ON cards FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM space_members WHERE space_id = cards.space_id AND user_id = auth.uid()));

DROP POLICY IF EXISTS "update_card_as_member" ON cards;
CREATE POLICY "update_card_as_member"
  ON cards FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM space_members WHERE space_id = cards.space_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM space_members WHERE space_id = cards.space_id AND user_id = auth.uid()));

DROP POLICY IF EXISTS "delete_card_as_member" ON cards;
CREATE POLICY "delete_card_as_member"
  ON cards FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM space_members WHERE space_id = cards.space_id AND user_id = auth.uid()));

-- ============================================================
-- invoices
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  space_id uuid NOT NULL REFERENCES financial_spaces(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  closing_date date NOT NULL,
  due_date date NOT NULL,
  total_cents bigint NOT NULL DEFAULT 0,
  paid_cents bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'paid', 'partial', 'overdue')),
  payment_method_id uuid REFERENCES payment_methods(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS invoices_card_period_unique
  ON invoices (card_id, period_start);

CREATE INDEX IF NOT EXISTS invoices_card_idx ON invoices (card_id);
CREATE INDEX IF NOT EXISTS invoices_space_idx ON invoices (space_id);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices (space_id, status);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON invoices TO authenticated;

DROP POLICY IF EXISTS "select_invoices_as_member" ON invoices;
CREATE POLICY "select_invoices_as_member"
  ON invoices FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM space_members WHERE space_id = invoices.space_id AND user_id = auth.uid()));

DROP POLICY IF EXISTS "insert_invoice_as_member" ON invoices;
CREATE POLICY "insert_invoice_as_member"
  ON invoices FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM space_members WHERE space_id = invoices.space_id AND user_id = auth.uid()));

DROP POLICY IF EXISTS "update_invoice_as_member" ON invoices;
CREATE POLICY "update_invoice_as_member"
  ON invoices FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM space_members WHERE space_id = invoices.space_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM space_members WHERE space_id = invoices.space_id AND user_id = auth.uid()));

DROP POLICY IF EXISTS "delete_invoice_as_member" ON invoices;
CREATE POLICY "delete_invoice_as_member"
  ON invoices FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM space_members WHERE space_id = invoices.space_id AND user_id = auth.uid()));

-- ============================================================
-- invoice_items
-- ============================================================
CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  description text NOT NULL,
  establishment text,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  installment_number int,
  installment_total int,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  occurred_at date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_items_invoice_idx ON invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS invoice_items_transaction_idx ON invoice_items (transaction_id);

ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON invoice_items TO authenticated;

DROP POLICY IF EXISTS "select_invoice_items_as_member" ON invoice_items;
CREATE POLICY "select_invoice_items_as_member"
  ON invoice_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoices
      JOIN space_members ON space_members.space_id = invoices.space_id
      WHERE invoices.id = invoice_items.invoice_id
        AND space_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_invoice_item_as_member" ON invoice_items;
CREATE POLICY "insert_invoice_item_as_member"
  ON invoice_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoices
      JOIN space_members ON space_members.space_id = invoices.space_id
      WHERE invoices.id = invoice_items.invoice_id
        AND space_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_invoice_item_as_member" ON invoice_items;
CREATE POLICY "update_invoice_item_as_member"
  ON invoice_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoices
      JOIN space_members ON space_members.space_id = invoices.space_id
      WHERE invoices.id = invoice_items.invoice_id
        AND space_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoices
      JOIN space_members ON space_members.space_id = invoices.space_id
      WHERE invoices.id = invoice_items.invoice_id
        AND space_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "delete_invoice_item_as_member" ON invoice_items;
CREATE POLICY "delete_invoice_item_as_member"
  ON invoice_items FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoices
      JOIN space_members ON space_members.space_id = invoices.space_id
      WHERE invoices.id = invoice_items.invoice_id
        AND space_members.user_id = auth.uid()
    )
  );

-- ============================================================
-- Add new columns to transactions
-- ============================================================
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS establishment text,
  ADD COLUMN IF NOT EXISTS cpf_cnpj text,
  ADD COLUMN IF NOT EXISTS payment_method_id uuid REFERENCES payment_methods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS card_id uuid REFERENCES cards(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoice_item_id uuid REFERENCES invoice_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS transactions_payment_method_idx ON transactions (payment_method_id);
CREATE INDEX IF NOT EXISTS transactions_card_idx ON transactions (card_id);

-- ============================================================
-- Triggers: updated_at for new tables
-- ============================================================
DROP TRIGGER IF EXISTS payment_methods_updated_at ON payment_methods;
CREATE TRIGGER payment_methods_updated_at
  BEFORE UPDATE ON payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS cards_updated_at ON cards;
CREATE TRIGGER cards_updated_at
  BEFORE UPDATE ON cards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS invoices_updated_at ON invoices;
CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Function: auto-seed default payment methods for new spaces
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_default_payment_methods()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO payment_methods (space_id, name, is_default) VALUES
    (NEW.id, 'PIX', true),
    (NEW.id, 'Dinheiro', false),
    (NEW.id, 'Cartão de débito', false),
    (NEW.id, 'Cartão de crédito', false),
    (NEW.id, 'Transferência bancária', false),
    (NEW.id, 'Boleto', false)
  ON CONFLICT (space_id, name) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seed_default_payment_methods() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_default_payment_methods() TO authenticated;

-- Seed for existing spaces
INSERT INTO payment_methods (space_id, name, is_default)
SELECT fs.id, pm.name, pm.is_default
FROM financial_spaces fs
CROSS JOIN (VALUES
  ('PIX', true),
  ('Dinheiro', false),
  ('Cartão de débito', false),
  ('Cartão de crédito', false),
  ('Transferência bancária', false),
  ('Boleto', false)
) AS pm(name, is_default)
ON CONFLICT (space_id, name) DO NOTHING;

-- Trigger on financial_spaces insert
DROP TRIGGER IF EXISTS seed_payment_methods_on_space_create ON financial_spaces;
CREATE TRIGGER seed_payment_methods_on_space_create
  AFTER INSERT ON financial_spaces
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_payment_methods();
