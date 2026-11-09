/*
 * Fix infinite recursion in space_members RLS policy.
 *
 * The SELECT policy "select_memberships_as_member" queries space_members
 * to check membership, which causes infinite recursion. Fix: use
 * financial_spaces.owner_id = auth.uid() OR user_id = auth.uid() instead
 * of a self-referential subquery.
 *
 * Also add a missing UPDATE policy for space_members (owner can update
 * member roles), and REVOKE all privileges from anon on every table
 * (the anon role should never have access to this app's data).
 */

-- ============================================================
-- Fix space_members SELECT policy (infinite recursion)
-- ============================================================
DROP POLICY IF EXISTS "select_memberships_as_member" ON space_members;

CREATE POLICY "select_memberships_as_member"
  ON space_members FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM financial_spaces fs
      WHERE fs.id = space_members.space_id AND fs.owner_id = auth.uid()
    )
  );

-- Add UPDATE policy for space_members (owner can update roles)
DROP POLICY IF EXISTS "update_member_as_owner" ON space_members;
CREATE POLICY "update_member_as_owner"
  ON space_members FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM financial_spaces fs
      WHERE fs.id = space_members.space_id AND fs.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM financial_spaces fs
      WHERE fs.id = space_members.space_id AND fs.owner_id = auth.uid()
    )
  );

-- ============================================================
-- Revoke ALL privileges from anon on every table
-- ============================================================
REVOKE ALL ON accounts FROM anon;
REVOKE ALL ON budgets FROM anon;
REVOKE ALL ON cards FROM anon;
REVOKE ALL ON categories FROM anon;
REVOKE ALL ON financial_spaces FROM anon;
REVOKE ALL ON goal_contributions FROM anon;
REVOKE ALL ON goals FROM anon;
REVOKE ALL ON invitations FROM anon;
REVOKE ALL ON invoice_items FROM anon;
REVOKE ALL ON invoices FROM anon;
REVOKE ALL ON payment_methods FROM anon;
REVOKE ALL ON profiles FROM anon;
REVOKE ALL ON settlements FROM anon;
REVOKE ALL ON space_members FROM anon;
REVOKE ALL ON transaction_splits FROM anon;
REVOKE ALL ON transactions FROM anon;
