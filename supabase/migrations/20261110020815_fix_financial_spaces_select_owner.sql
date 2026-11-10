/*
# Fix financial_spaces SELECT to allow owners to see their own spaces

## Problem
The existing SELECT policy on `financial_spaces` only allows seeing spaces
where the user is in `space_members`. If a space exists with `owner_id` set
but no corresponding `space_members` row exists for that owner, the owner
cannot see their own space — a chicken-and-egg problem that makes the
active space selector appear empty.

## Fix
Replace the SELECT policy with one that allows access if EITHER:
- The user is the owner of the space (`owner_id = auth.uid()`), OR
- The user is a member of the space (exists in `space_members`)

This ensures spaces created via the frontend auto-create flow (which inserts
into `financial_spaces` first, then `space_members`) are immediately visible
to the owner.

## Security
- RLS remains enabled on `financial_spaces`.
- Only the SELECT policy is changed; INSERT/UPDATE/DELETE policies are untouched.
- No grants are changed.
*/

DROP POLICY IF EXISTS "select_spaces_as_member" ON financial_spaces;

CREATE POLICY "select_spaces_as_owner_or_member"
ON financial_spaces FOR SELECT
TO authenticated
USING (
  auth.uid() = owner_id
  OR EXISTS (
    SELECT 1 FROM space_members
    WHERE space_members.space_id = financial_spaces.id
    AND space_members.user_id = auth.uid()
  )
);
