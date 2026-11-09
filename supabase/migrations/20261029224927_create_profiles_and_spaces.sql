/*
# Create profiles, financial spaces, members, and invitations

1. Purpose
   This migration establishes the foundational identity and sharing layer for a couple's
   finance app. It creates user profiles, the concept of a "financial space" (which can be
   personal or shared between two people), space membership with roles, and a secure
   invitation system with signed tokens and expiry.

2. New Tables
   - `profiles` — one-to-one with auth.users, stores display_name and avatar
   - `financial_spaces` — a personal or shared financial workspace
   - `space_members` — association of users to spaces with roles (owner/member)
   - `invitations` — secure, token-based, single-use, expiring invitations to join a space

3. Indexes
   - space_members: unique on (space_id, user_id), index on user_id, index on space_id
   - invitations: index on token, index on (space_id, status)

4. Triggers
   - handle_new_user: auto-creates a profile when a new auth user signs up
   - create_personal_space: auto-creates a personal space + owner membership for each new profile
   - set_updated_at: auto-updates updated_at on profiles and financial_spaces

5. Security (RLS)
   - profiles: users can SELECT/UPDATE only their own row
   - financial_spaces: members can SELECT; owner can INSERT/UPDATE/DELETE
   - space_members: members can SELECT; space owner can INSERT; owner or self can DELETE
   - invitations: space members can SELECT; space owner can INSERT/UPDATE/DELETE
   - All SECURITY DEFINER functions have EXECUTE revoked from PUBLIC/anon

6. Notes
   - Tables are created first, then RLS and policies are applied, to avoid
     cross-table references in policies before referenced tables exist.
   - The handle_new_user trigger creates the profile automatically from auth.users,
     and create_personal_space trigger then creates a personal space automatically.
   - Money columns in future tables will use integer cents (bigint), never float.
*/

-- ============================================================
-- Create all tables first (no policies yet)
-- ============================================================

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS financial_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'personal' CHECK (kind IN ('personal', 'shared')),
  owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS space_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES financial_spaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS space_members_space_user_unique
  ON space_members (space_id, user_id);

CREATE INDEX IF NOT EXISTS space_members_user_id_idx
  ON space_members (user_id);

CREATE INDEX IF NOT EXISTS space_members_space_id_idx
  ON space_members (space_id);

CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES financial_spaces(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  invitee_email text NOT NULL,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invitations_token_idx ON invitations (token);
CREATE INDEX IF NOT EXISTS invitations_space_status_idx ON invitations (space_id, status);

-- ============================================================
-- Enable RLS on all tables
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE space_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Grants
-- ============================================================

GRANT SELECT, UPDATE ON profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_spaces TO authenticated;
GRANT SELECT, INSERT, DELETE ON space_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON invitations TO authenticated;

-- ============================================================
-- Policies — profiles
-- ============================================================

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- Policies — financial_spaces
-- ============================================================

DROP POLICY IF EXISTS "select_spaces_as_member" ON financial_spaces;
CREATE POLICY "select_spaces_as_member"
  ON financial_spaces FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM space_members
      WHERE space_members.space_id = financial_spaces.id
        AND space_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_space_as_owner" ON financial_spaces;
CREATE POLICY "insert_space_as_owner"
  ON financial_spaces FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "update_space_as_owner" ON financial_spaces;
CREATE POLICY "update_space_as_owner"
  ON financial_spaces FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "delete_space_as_owner" ON financial_spaces;
CREATE POLICY "delete_space_as_owner"
  ON financial_spaces FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);

-- ============================================================
-- Policies — space_members
-- ============================================================

DROP POLICY IF EXISTS "select_memberships_as_member" ON space_members;
CREATE POLICY "select_memberships_as_member"
  ON space_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM space_members sm
      WHERE sm.space_id = space_members.space_id
        AND sm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_member_as_space_owner" ON space_members;
CREATE POLICY "insert_member_as_space_owner"
  ON space_members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM financial_spaces fs
      WHERE fs.id = space_id
        AND fs.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "delete_member_as_owner_or_self" ON space_members;
CREATE POLICY "delete_member_as_owner_or_self"
  ON space_members FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM financial_spaces fs
      WHERE fs.id = space_id
        AND fs.owner_id = auth.uid()
    )
  );

-- ============================================================
-- Policies — invitations
-- ============================================================

DROP POLICY IF EXISTS "select_invitations_as_member" ON invitations;
CREATE POLICY "select_invitations_as_member"
  ON invitations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM space_members
      WHERE space_members.space_id = invitations.space_id
        AND space_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_invitation_as_owner" ON invitations;
CREATE POLICY "insert_invitation_as_owner"
  ON invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM financial_spaces fs
      WHERE fs.id = space_id
        AND fs.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_invitation_as_owner" ON invitations;
CREATE POLICY "update_invitation_as_owner"
  ON invitations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM financial_spaces fs
      WHERE fs.id = space_id
        AND fs.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM financial_spaces fs
      WHERE fs.id = space_id
        AND fs.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "delete_invitation_as_owner" ON invitations;
CREATE POLICY "delete_invitation_as_owner"
  ON invitations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM financial_spaces fs
      WHERE fs.id = space_id
        AND fs.owner_id = auth.uid()
    )
  );

-- ============================================================
-- Trigger functions
-- ============================================================

-- Generic updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Auto-create a profile when a new auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

-- Auto-create a personal financial space when a profile is created
CREATE OR REPLACE FUNCTION public.create_personal_space()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  space_id uuid;
BEGIN
  INSERT INTO public.financial_spaces (name, kind, owner_id)
  VALUES ('Pessoal', 'personal', NEW.id)
  RETURNING id INTO space_id;

  INSERT INTO public.space_members (space_id, user_id, role)
  VALUES (space_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;

-- ============================================================
-- Triggers
-- ============================================================

-- profiles updated_at
DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- financial_spaces updated_at
DROP TRIGGER IF EXISTS financial_spaces_updated_at ON financial_spaces;
CREATE TRIGGER financial_spaces_updated_at
  BEFORE UPDATE ON financial_spaces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-create personal space on profiles insert
DROP TRIGGER IF EXISTS on_profile_created_personal_space ON profiles;
CREATE TRIGGER on_profile_created_personal_space
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_personal_space();

-- Revoke EXECUTE on SECURITY DEFINER functions from public/anon
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_personal_space() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon;
