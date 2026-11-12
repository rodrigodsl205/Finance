/*
# Make invitations viewable and acceptable by the invitee

1. Problem
- The `invitations` table RLS only allows members of the space to read invitations.
  The invited person is NOT yet a member, and may not even be logged in, so the
  invite link always returned "Convite não encontrado ou inválido".
- Accepting an invite required the invitee to INSERT into `space_members` and
  UPDATE the invitation, both restricted to the space owner — impossible for the
  invitee.

2. New Functions (SECURITY DEFINER, fixed search_path)
- `get_invitation_by_token(p_token uuid)` — public lookup for the invite page.
  Returns only non-sensitive fields: space name/kind, inviter display name,
  invitee email, status, expiry and whether the invite is still valid.
- `accept_invitation(p_token uuid)` — accepts an invite atomically:
  * requires an authenticated user;
  * invitation must exist, be pending and not expired (auto-marks expired);
  * the logged-in user's email must match the invitee email (case-insensitive);
  * inserts the membership (idempotent if already a member) and marks the
    invitation accepted with timestamp and user id.
  Returns a short status code the frontend maps to friendly messages.

3. Security changes
- No new tables or columns. Existing RLS on `invitations`, `space_members` and
  `financial_spaces` is unchanged.
- Both functions are SECURITY DEFINER so the invitee can complete the join flow
  without direct access to the underlying tables; all authorization checks are
  performed inside the function (token knowledge + email match).
- EXECUTE granted only to `anon` and `authenticated`; revoked from PUBLIC.
  `get_invitation_by_token` exposes only the fields needed to show the invite,
  gated by possession of the secret token.
*/

CREATE OR REPLACE FUNCTION public.get_invitation_by_token(p_token uuid)
RETURNS TABLE (
  space_name text,
  space_kind text,
  inviter_name text,
  invitee_email text,
  status text,
  expires_at timestamptz,
  is_valid boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    fs.name,
    fs.kind,
    p.display_name,
    i.invitee_email,
    i.status,
    i.expires_at,
    (i.status = 'pending' AND i.expires_at > now()) AS is_valid
  FROM invitations i
  JOIN financial_spaces fs ON fs.id = i.space_id
  LEFT JOIN profiles p ON p.id = i.invited_by
  WHERE i.token = p_token;
$$;

CREATE OR REPLACE FUNCTION public.accept_invitation(p_token uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv invitations%ROWTYPE;
  v_uid uuid := auth.uid();
  v_email text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'not_authenticated';
  END IF;

  SELECT coalesce(auth.email(), '') INTO v_email;

  SELECT * INTO inv FROM invitations WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF inv.status = 'accepted' THEN
    RETURN 'already_accepted';
  END IF;

  IF inv.status <> 'pending' THEN
    RETURN 'invalid_status';
  END IF;

  IF inv.expires_at <= now() THEN
    UPDATE invitations SET status = 'expired' WHERE id = inv.id;
    RETURN 'expired';
  END IF;

  IF lower(trim(inv.invitee_email)) <> lower(trim(v_email)) THEN
    RETURN 'email_mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM space_members
    WHERE space_id = inv.space_id AND user_id = v_uid
  ) THEN
    INSERT INTO space_members (space_id, user_id, role)
    VALUES (inv.space_id, v_uid, 'member')
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE invitations
  SET status = 'accepted', accepted_at = now(), accepted_by = v_uid
  WHERE id = inv.id;

  RETURN 'accepted';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_invitation_by_token(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_invitation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invitation(uuid) TO anon, authenticated;
