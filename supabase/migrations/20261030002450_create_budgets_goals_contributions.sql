/*
# Phase 7: Budgets, goals, and goal contributions

1. Purpose
   Add budget management (monthly per-category spending limits),
   financial goals (savings targets with deadlines and contributors),
   and goal contributions (individual deposits toward a goal).

2. New Table: `budgets`
   Monthly budget per category within a space.
   - id (uuid, PK)
   - space_id (uuid, FK → financial_spaces, ON DELETE CASCADE)
   - category_id (uuid, FK → categories, ON DELETE CASCADE) — which category
   - period_month (date, not null) — first day of the month (YYYY-MM-01)
   - limit_cents (bigint, not null) — spending limit for this category/month
   - notes (text, nullable)
   - created_by (uuid, FK → profiles)
   - created_at, updated_at (timestamptz)
   - Unique on (space_id, category_id, period_month)

3. New Table: `goals`
   Financial savings goals.
   - id (uuid, PK)
   - space_id (uuid, FK → financial_spaces, ON DELETE CASCADE)
   - name (text, not null) — e.g. "Viagem para Europa"
   - description (text, nullable)
   - target_cents (bigint, not null) — total amount needed
   - current_cents (bigint, not null, default 0) — accumulated so far
   - target_date (date, nullable) — deadline
   - status (text, not null, default 'active') — 'active' | 'completed' | 'cancelled'
   - responsible_id (uuid, FK → profiles, nullable) — who owns the goal
   - created_by (uuid, FK → profiles)
   - created_at, updated_at (timestamptz)

4. New Table: `goal_contributions`
   Individual contributions toward a goal.
   - id (uuid, PK)
   - goal_id (uuid, FK → goals, ON DELETE CASCADE)
   - amount_cents (bigint, not null)
   - contributed_by (uuid, FK → profiles) — who contributed
   - contributed_at (date, not null)
   - notes (text, nullable)
   - created_at (timestamptz)

5. Indexes
   - budgets: (space_id), (category_id), (space_id, period_month)
   - goals: (space_id), (status)
   - goal_contributions: (goal_id)

6. Security (RLS)
   All new tables use space-membership-scoped RLS, TO authenticated only.

7. Triggers
   - updated_at triggers for budgets, goals.
*/

-- ============================================================
-- budgets
-- ============================================================
CREATE TABLE IF NOT EXISTS budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES financial_spaces(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  limit_cents bigint NOT NULL CHECK (limit_cents >= 0),
  notes text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS budgets_space_cat_period_unique
  ON budgets (space_id, category_id, period_month);

CREATE INDEX IF NOT EXISTS budgets_space_idx ON budgets (space_id);
CREATE INDEX IF NOT EXISTS budgets_period_idx ON budgets (space_id, period_month);

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON budgets TO authenticated;

DROP POLICY IF EXISTS "select_budgets_as_member" ON budgets;
CREATE POLICY "select_budgets_as_member"
  ON budgets FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM space_members WHERE space_id = budgets.space_id AND user_id = auth.uid()));

DROP POLICY IF EXISTS "insert_budget_as_member" ON budgets;
CREATE POLICY "insert_budget_as_member"
  ON budgets FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM space_members WHERE space_id = budgets.space_id AND user_id = auth.uid()));

DROP POLICY IF EXISTS "update_budget_as_member" ON budgets;
CREATE POLICY "update_budget_as_member"
  ON budgets FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM space_members WHERE space_id = budgets.space_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM space_members WHERE space_id = budgets.space_id AND user_id = auth.uid()));

DROP POLICY IF EXISTS "delete_budget_as_member" ON budgets;
CREATE POLICY "delete_budget_as_member"
  ON budgets FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM space_members WHERE space_id = budgets.space_id AND user_id = auth.uid()));

-- ============================================================
-- goals
-- ============================================================
CREATE TABLE IF NOT EXISTS goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES financial_spaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  target_cents bigint NOT NULL CHECK (target_cents >= 0),
  current_cents bigint NOT NULL DEFAULT 0,
  target_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  responsible_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS goals_space_idx ON goals (space_id);
CREATE INDEX IF NOT EXISTS goals_status_idx ON goals (space_id, status);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON goals TO authenticated;

DROP POLICY IF EXISTS "select_goals_as_member" ON goals;
CREATE POLICY "select_goals_as_member"
  ON goals FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM space_members WHERE space_id = goals.space_id AND user_id = auth.uid()));

DROP POLICY IF EXISTS "insert_goal_as_member" ON goals;
CREATE POLICY "insert_goal_as_member"
  ON goals FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM space_members WHERE space_id = goals.space_id AND user_id = auth.uid()));

DROP POLICY IF EXISTS "update_goal_as_member" ON goals;
CREATE POLICY "update_goal_as_member"
  ON goals FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM space_members WHERE space_id = goals.space_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM space_members WHERE space_id = goals.space_id AND user_id = auth.uid()));

DROP POLICY IF EXISTS "delete_goal_as_member" ON goals;
CREATE POLICY "delete_goal_as_member"
  ON goals FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM space_members WHERE space_id = goals.space_id AND user_id = auth.uid()));

-- ============================================================
-- goal_contributions
-- ============================================================
CREATE TABLE IF NOT EXISTS goal_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  contributed_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contributed_at date NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contributions_goal_idx ON goal_contributions (goal_id);

ALTER TABLE goal_contributions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON goal_contributions TO authenticated;

DROP POLICY IF EXISTS "select_contributions_as_member" ON goal_contributions;
CREATE POLICY "select_contributions_as_member"
  ON goal_contributions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM goals
      JOIN space_members ON space_members.space_id = goals.space_id
      WHERE goals.id = goal_contributions.goal_id
        AND space_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_contribution_as_member" ON goal_contributions;
CREATE POLICY "insert_contribution_as_member"
  ON goal_contributions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM goals
      JOIN space_members ON space_members.space_id = goals.space_id
      WHERE goals.id = goal_contributions.goal_id
        AND space_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_contribution_as_member" ON goal_contributions;
CREATE POLICY "update_contribution_as_member"
  ON goal_contributions FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM goals
      JOIN space_members ON space_members.space_id = goals.space_id
      WHERE goals.id = goal_contributions.goal_id
        AND space_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM goals
      JOIN space_members ON space_members.space_id = goals.space_id
      WHERE goals.id = goal_contributions.goal_id
        AND space_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "delete_contribution_as_member" ON goal_contributions;
CREATE POLICY "delete_contribution_as_member"
  ON goal_contributions FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM goals
      JOIN space_members ON space_members.space_id = goals.space_id
      WHERE goals.id = goal_contributions.goal_id
        AND space_members.user_id = auth.uid()
    )
  );

-- ============================================================
-- Triggers: updated_at
-- ============================================================
DROP TRIGGER IF EXISTS budgets_updated_at ON budgets;
CREATE TRIGGER budgets_updated_at
  BEFORE UPDATE ON budgets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS goals_updated_at ON goals;
CREATE TRIGGER goals_updated_at
  BEFORE UPDATE ON goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
