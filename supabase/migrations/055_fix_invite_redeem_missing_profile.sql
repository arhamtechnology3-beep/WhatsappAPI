-- ============================================================
-- 055_fix_invite_redeem_missing_profile.sql
--
-- Accepting a team invite raised "Caller has no profile" for a
-- freshly signed-up user (live: Shraddha, 2026-10-12).
--
-- Root cause
--   handle_new_user() inserts an `accounts` row. The AFTER trigger
--   sync_accounts_to_workspaces() then inserts `workspaces`, whose
--   AFTER trigger sync_workspaces_to_accounts() inserts back into
--   `accounts` without `owner_user_id` (NOT NULL). That statement
--   fails, the two triggers recurse, and handle_new_user() swallows
--   the exception. auth.users is committed with no profile and no
--   account. redeem_invitation() then raises 42501.
--
--   Even a successful profile move was incomplete after migration
--   040: the app resolves the session from workspace_members, which
--   redeem_invitation never wrote.
--
-- Fixes
--   1. Stop the account ↔ workspace sync from recursing, and supply
--      owner_user_id when a workspace insert creates an account.
--   2. Signup also writes workspaces + workspace_members, and no
--      longer hides bootstrap failures.
--   3. redeem_invitation attaches a profile-less caller straight
--      onto the invited account and always upserts workspace_members.
--
-- Idempotent — safe to run more than once.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Break the sync cycle
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_accounts_to_workspaces()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Depth 1 is the statement the user (or handle_new_user) issued.
  -- Depth 2+ is the other sync function writing back. Returning here
  -- stops accounts → workspaces → accounts from looping, and stops
  -- the reverse insert that omitted owner_user_id.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  INSERT INTO workspaces (id, name, default_currency, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.name,
    COALESCE(NEW.default_currency, 'USD'),
    COALESCE(NEW.created_at, NOW()),
    COALESCE(NEW.updated_at, NOW())
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    default_currency = EXCLUDED.default_currency,
    updated_at = EXCLUDED.updated_at;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.sync_accounts_to_workspaces() OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.sync_workspaces_to_accounts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  SELECT owner_user_id INTO v_owner FROM accounts WHERE id = NEW.id;
  IF v_owner IS NULL THEN
    v_owner := auth.uid();
  END IF;

  -- A brand-new workspace with no session user cannot satisfy
  -- accounts.owner_user_id. Update an existing row if one is there;
  -- otherwise leave the workspace without an accounts twin rather
  -- than failing the caller's insert.
  IF v_owner IS NULL THEN
    UPDATE accounts
    SET name = NEW.name,
        default_currency = COALESCE(NEW.default_currency, default_currency),
        updated_at = NOW()
    WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  INSERT INTO accounts (id, name, owner_user_id, default_currency, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.name,
    v_owner,
    COALESCE(NEW.default_currency, 'USD'),
    COALESCE(NEW.created_at, NOW()),
    COALESCE(NEW.updated_at, NOW())
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    default_currency = EXCLUDED.default_currency,
    updated_at = EXCLUDED.updated_at;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.sync_workspaces_to_accounts() OWNER TO postgres;

-- ------------------------------------------------------------
-- 2. Signup bootstrap: profile + workspace membership
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
  v_account_name TEXT;
  v_account_id UUID;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  v_account_name := COALESCE(NULLIF(v_full_name, ''), NEW.email, 'My account');

  INSERT INTO public.accounts (name, owner_user_id)
  VALUES (v_account_name, NEW.id)
  RETURNING id INTO v_account_id;

  -- The sync trigger usually inserts this row. Repeat it so a
  -- disabled trigger cannot leave the user without a workspace.
  INSERT INTO public.workspaces (id, name)
  VALUES (v_account_id, v_account_name)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (user_id, full_name, email, account_id, account_role)
  VALUES (NEW.id, v_full_name, COALESCE(NEW.email, ''), v_account_id, 'owner');

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_account_id, NEW.id, 'owner')
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

-- ------------------------------------------------------------
-- 3. Redeem: profile-less callers join the invited account
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_invitation(
  p_token_hash TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_inv account_invitations%ROWTYPE;
  v_profile profiles%ROWTYPE;
  v_old_account_id UUID;
  v_old_account_owner UUID;
  v_has_data BOOLEAN;
  v_email TEXT;
  v_full_name TEXT;
  v_ws_role TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv
  FROM account_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = '22023';
  END IF;
  IF v_inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invitation has already been redeemed'
      USING ERRCODE = '22023';
  END IF;
  IF v_inv.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = '22023';
  END IF;

  -- workspace_members has no agent/viewer. Agents and viewers both
  -- sit as member; profiles.account_role keeps the finer role.
  v_ws_role := CASE v_inv.role::text
    WHEN 'admin' THEN 'admin'
    WHEN 'owner' THEN 'owner'
    ELSE 'member'
  END;

  SELECT * INTO v_profile
  FROM profiles
  WHERE user_id = v_caller_id;

  IF NOT FOUND THEN
    -- Signup's trigger failed (see header). There is no personal
    -- account to clean up — attach this login to the invited account.
    SELECT u.email, COALESCE(u.raw_user_meta_data->>'full_name', '')
    INTO v_email, v_full_name
    FROM auth.users u
    WHERE u.id = v_caller_id;

    INSERT INTO profiles (user_id, full_name, email, account_id, account_role)
    VALUES (
      v_caller_id,
      COALESCE(v_full_name, ''),
      COALESCE(v_email, ''),
      v_inv.account_id,
      v_inv.role
    );

    INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
    VALUES (v_inv.account_id, v_caller_id, v_ws_role, NOW())
    ON CONFLICT (workspace_id, user_id) DO UPDATE
      SET role = EXCLUDED.role;

    UPDATE account_invitations
    SET accepted_at = NOW(),
        accepted_by_user_id = v_caller_id
    WHERE id = v_inv.id;

    RETURN v_inv.account_id;
  END IF;

  SELECT a.owner_user_id
  INTO v_old_account_owner
  FROM accounts a
  WHERE a.id = v_profile.account_id;

  v_old_account_id := v_profile.account_id;

  -- Profile row whose account was deleted out from under it.
  IF v_old_account_owner IS NULL THEN
    UPDATE profiles
    SET account_id = v_inv.account_id,
        account_role = v_inv.role
    WHERE user_id = v_caller_id;

    INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
    VALUES (v_inv.account_id, v_caller_id, v_ws_role, NOW())
    ON CONFLICT (workspace_id, user_id) DO UPDATE
      SET role = EXCLUDED.role;

    UPDATE account_invitations
    SET accepted_at = NOW(),
        accepted_by_user_id = v_caller_id
    WHERE id = v_inv.id;

    RETURN v_inv.account_id;
  END IF;

  IF v_old_account_id = v_inv.account_id THEN
    RAISE EXCEPTION 'You are already a member of this account'
      USING ERRCODE = '23505';
  END IF;

  IF v_old_account_owner <> v_caller_id THEN
    RAISE EXCEPTION 'You are already in a shared account; sign up with a different email to join this one'
      USING ERRCODE = '23505';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM contacts WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM conversations WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM broadcasts WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM automations WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM flows WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM pipelines WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM message_templates WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM tags WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM custom_fields WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM contact_notes WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM whatsapp_config WHERE account_id = v_old_account_id
    LIMIT 1
  ) INTO v_has_data;

  IF v_has_data THEN
    RAISE EXCEPTION 'Your account already contains data; sign up with a different email to join this one'
      USING ERRCODE = '23505';
  END IF;

  UPDATE profiles
  SET account_id = v_inv.account_id,
      account_role = v_inv.role
  WHERE user_id = v_caller_id;

  INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
  VALUES (v_inv.account_id, v_caller_id, v_ws_role, NOW())
  ON CONFLICT (workspace_id, user_id) DO UPDATE
    SET role = EXCLUDED.role;

  UPDATE account_invitations
  SET accepted_at = NOW(),
      accepted_by_user_id = v_caller_id
  WHERE id = v_inv.id;

  -- Drop the empty personal membership first so the next request
  -- does not see two workspace_members rows (maybeSingle errors).
  DELETE FROM workspace_members
  WHERE user_id = v_caller_id
    AND workspace_id = v_old_account_id;

  DELETE FROM accounts WHERE id = v_old_account_id;

  RETURN v_inv.account_id;
END;
$$;

ALTER FUNCTION public.redeem_invitation(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.redeem_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_invitation(TEXT) TO authenticated;
