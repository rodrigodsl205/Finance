/*
 * Fix remaining infinite recursion between financial_spaces and space_members.
 *
 * Root cause: circular dependency
 *   - financial_spaces SELECT policy queries space_members
 *   - space_members SELECT policy queries financial_spaces
 *
 * Fix: space_members SELECT should ONLY check user_id = auth.uid()
 * (no reference to financial_spaces). This breaks the cycle.
 * Users can always see their own membership rows. The financial_spaces
 * SELECT policy then safely queries space_members without recursion.
 */

-- Drop and recreate space_members SELECT policy (simpler, no recursion)
DROP POLICY IF EXISTS "select_memberships_as_member" ON space_members;

CREATE POLICY "select_memberships_as_member"
  ON space_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Also simplify DELETE and UPDATE to avoid financial_spaces reference
-- by adding owner_id check via a subquery that won't recurse (financial_spaces
-- DELETE/UPDATE don't reference space_members, only SELECT does)
-- Actually DELETE already uses financial_spaces which is fine since
-- financial_spaces DELETE doesn't query space_members. The recursion
-- only happens through SELECT chains. So we just need the SELECT fix above.
