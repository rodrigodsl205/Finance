/*
# Show all space members to each other + member removal helpers

1. Problem
- The SELECT policy on `space_members` only allowed each user to see their own
  membership row (`user_id = auth.uid()`). Because viewing the member list of a
  shared space requires seeing OTHER members' rows, every user only saw
  themselves in Settings. The inviter could not see the invitee and vice versa.
- The `profiles` SELECT policy only allowed reading your own profile, so even
  with visible membership rows, other members' names would come back empty.
- There was no safe way for a member to leave a space or for the owner to
  delete the whole shared space with all of its data.

2. New Functions (SECURITY DEFINER, fixed search_path)
- `is_space_member(p_space_id uuid)` — returns whether the current user is a
  member of the given space. Runs as the function owner so policies can check
  membership WITHOUT creating a recursive policy loop on `space_members`
  (which broke this table before).
- `delete_shared_space(p_space_id uuid)` — allows the space OWNER to delete a
  space and ALL of its data (transactions, splits, invoice items, invoices,
  cards, payment methods, categories, accounts, budgets, goals, contributions,
  settlements, invitations, memberships). Raises an error if the caller is not
  the owner. Data is permanently removed.

3. Security changes (policies)
- `space_members` SELECT: rewritten to `is_space_member(space_id)` — all
  members of a space can now see the full member list of that space; nobody
  else can. Insert/update/delete policies unchanged.
- `profiles` SELECT: widened so a user can also read the basic profile
  (display name, avatar) of people who share a space with them. Own profile
  still fully readable; no other access added.
- EXECUTE on both new functions granted only to `authenticated`.
*/

CREATE OR REPLACE FUNCTION public.is_space_member(p_space_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM space_members
    WHERE space_id = p_space_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.delete_shared_space(p_space_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT owner_id INTO v_owner FROM financial_spaces WHERE id = p_space_id;
  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Somente o proprietário pode excluir o espaço.';
  END IF;

  UPDATE transactions SET invoice_item_id = NULL WHERE space_id = p_space_id;
  DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE space_id = p_space_id);
  DELETE FROM transaction_splits WHERE transaction_id IN (SELECT id FROM transactions WHERE space_id = p_space_id);
  DELETE FROM transactions WHERE space_id = p_space_id;
  DELETE FROM invoices WHERE space_id = p_space_id;
  DELETE FROM settlements WHERE space_id = p_space_id;
  DELETE FROM goal_contributions WHERE goal_id IN (SELECT id FROM goals WHERE space_id = p_space_id);
  DELETE FROM goals WHERE space_id = p_space_id;
  DELETE FROM budgets WHERE space_id = p_space_id;
  DELETE FROM cards WHERE space_id = p_space_id;
  DELETE FROM payment_methods WHERE space_id = p_space_id;
  DELETE FROM categories WHERE space_id = p_space_id;
  DELETE FROM accounts WHERE space_id = p_space_id;
  DELETE FROM invitations WHERE space_id = p_space_id;
  DELETE FROM space_members WHERE space_id = p_space_id;
  DELETE FROM financial_spaces WHERE id = p_space_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_space_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_shared_space(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_space_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_shared_space(uuid) TO authenticated;

DROP POLICY IF EXISTS "select_memberships_as_member" ON space_members;
CREATE POLICY "select_memberships_as_member"
ON space_members FOR SELECT
TO authenticated
USING (public.is_space_member(space_id));

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile"
ON profiles FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM space_members sm
    WHERE sm.user_id = profiles.id
      AND public.is_space_member(sm.space_id)
  )
);
