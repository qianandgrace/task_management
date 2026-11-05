-- ============================================================
-- auth_workspace.test.sql — handle_new_user + list_my_organizations + rename_organization
-- Foundation Task 3 — pgTAP assertions
-- Auth-scoped queries use pre-created wrapper functions.
-- All seeding at superuser level.
-- ============================================================

-- ----------------------------------------------------------
-- Helper functions for auth context injection
-- These set JWT claims via set_config, then call target functions
-- Created BEFORE BEGIN so they persist across statement boundaries
-- ----------------------------------------------------------

DROP FUNCTION IF EXISTS __list_as_p1__() CASCADE;
CREATE OR REPLACE FUNCTION __list_as_p1__()
RETURNS TABLE(id uuid, name text, role text, created_at timestamptz)
SECURITY DEFINER SET search_path = pg_catalog, public
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","role":"authenticated"}', true);
    RETURN QUERY SELECT * FROM list_my_organizations();
END;
$$;

DROP FUNCTION IF EXISTS __list_as_outsider__() CASCADE;
CREATE OR REPLACE FUNCTION __list_as_outsider__()
RETURNS TABLE(id uuid, name text, role text, created_at timestamptz)
SECURITY DEFINER SET search_path = pg_catalog, public
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('request.jwt.claims', '{"sub":"dddddddddddddddddddddddddddddddd","role":"authenticated"}', true);
    RETURN QUERY SELECT * FROM list_my_organizations();
END;
$$;

DROP FUNCTION IF EXISTS __rename_as_viewer__(uuid, text) CASCADE;
CREATE OR REPLACE FUNCTION __rename_as_viewer__(p_org_id uuid, p_name text)
RETURNS void
SECURITY DEFINER SET search_path = pg_catalog, public
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('request.jwt.claims', '{"sub":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","role":"authenticated"}', true);
    PERFORM rename_organization(p_org_id, p_name);
END;
$$;

BEGIN;

SELECT plan(7);

-- ----------------------------------------------------------
-- Test Group 1: handle_new_user trigger — no-orphan-account
-- Review Focus #4: inserting into auth.users fires handle_new_user
-- ----------------------------------------------------------

SELECT lives_ok(
    $$ INSERT INTO auth.users (id, email, encrypted_password, aud, role, email_confirmed_at, instance_id)
       VALUES ('cccccccccccccccccccccccccccccccc', 'newuser@example.com',
               crypt('pass', gen_salt('bf')), 'authenticated', 'authenticated', now(), '00000000-0000-0000-0000-000000000000') $$,
    'insert into auth.users does not error (superuser seed)'
);

SELECT is(
    (SELECT count(*) FROM public.profiles WHERE id = 'cccccccccccccccccccccccccccccccc'::uuid)::text,
    '1',
    'Test 1a: profiles has 1 row for new user'
);

SELECT is(
    (SELECT count(*) FROM public.organizations WHERE owner_id = 'cccccccccccccccccccccccccccccccc'::uuid)::text,
    '1',
    'Test 1b: organizations has 1 row owned by new user'
);

-- ----------------------------------------------------------
-- SEEDING for Tests 2 & 3 (all as superuser)
-- Only seed p1 — we do NOT seed another auth.user because
-- handle_new_user would auto-create their org which complicates isolation tests.
-- We create a standalone profile/membership for the "outsider" user.
-- ----------------------------------------------------------

-- Seed p1 → triggers handle_new_user (auto-creates profile + org + member)
INSERT INTO auth.users (
  id, email, encrypted_password, aud, role,
  email_confirmed_at, instance_id,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'p1@example.com',
  crypt('password', gen_salt('bf')),
  'authenticated', 'authenticated',
  now(), '00000000-0000-0000-0000-000000000000',
  '{"name":"User One"}'::jsonb, '{"name":"User One"}'::jsonb,
  now(), now(), now()
);

-- Seed outsider as auth.user (triggers handle_new_user → auto-creates profile/org/member)
-- We immediately clean up those auto-created rows so outsider has NO membership
INSERT INTO auth.users (
  id, email, encrypted_password, aud, role,
  email_confirmed_at, instance_id,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'dddddddddddddddddddddddddddddddd', 'outsider@example.com',
  crypt('password', gen_salt('bf')),
  'authenticated', 'authenticated',
  now(), '00000000-0000-0000-0000-000000000000',
  '{}'::jsonb, '{}'::jsonb,
  now(), now(), now()
);

-- Clean up rows auto-created by handle_new_user for outsider (keep profile, remove org+member
-- so they have JWT claims but NO membership in any org)
DELETE FROM public.members WHERE profile_id = 'dddddddddddddddddddddddddddddddd';
DELETE FROM public.organizations WHERE owner_id = 'dddddddddddddddddddddddddddddddd';

-- Create a separate viewer identity (eee...) who HAS a membership in p1's org (for Test Group 3).
-- This is distinct from the outsider (ddd...) used for isolation tests (Test Group 2).
INSERT INTO auth.users (
  id, email, encrypted_password, aud, role,
  email_confirmed_at, instance_id,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', 'viewer@example.com',
  crypt('password', gen_salt('bf')),
  'authenticated', 'authenticated',
  now(), '00000000-0000-0000-0000-000000000000',
  '{}'::jsonb, '{}'::jsonb,
  now(), now(), now()
);

-- Clean up eee's auto-created org+member (keep profile for FK)
DELETE FROM public.members WHERE profile_id = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
DELETE FROM public.organizations WHERE owner_id = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

-- Insert eee as viewer in p1's org (for Test Group 3: viewer cannot rename)
DO $$
DECLARE _org uuid;
BEGIN
    SELECT id INTO _org FROM public.organizations WHERE owner_id = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'::uuid LIMIT 1;
    IF _org IS NOT NULL THEN
        INSERT INTO public.members (organization_id, profile_id, role, tenant_id)
        VALUES (_org, 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', 'viewer', _org)
        ON CONFLICT (organization_id, profile_id) DO NOTHING;
    END IF;
END $$;

-- Capture p1's primary org id for reuse in tests 2b & 3
DO $$
DECLARE _oid text := (SELECT id::text FROM public.organizations WHERE owner_id = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'::uuid LIMIT 1);
BEGIN
    PERFORM set_config('test.p1_org_id', _oid, true);
END $$;

-- ----------------------------------------------------------
-- Test Group 2: list_my_organizations isolation
-- ----------------------------------------------------------

-- Test 2a: p1 sees their own org with exact match
SELECT is(
    (SELECT count(*) FROM __list_as_p1__() WHERE id = current_setting('test.p1_org_id', true)::uuid AND role = 'owner')::text,
    '1',
    'Test 2a: p1 list_my_organizations returns their own org with role owner'
);

-- Test 2b: outsider cannot see p1's org (outsider has NO membership in any org)
SELECT is(
    (SELECT count(*) FROM __list_as_outsider__() WHERE id = current_setting('test.p1_org_id', true)::uuid)::text,
    '0',
    'Test 2b: outsider cannot see p1''s org in list_my_organizations'
);

-- Test 2c: outsider sees ZERO orgs total (no memberships at all)
SELECT is(
    (SELECT count(*) FROM __list_as_outsider__())::text,
    '0',
    'Test 2c: outsider sees zero orgs — no memberships'
);

-- ----------------------------------------------------------
-- Test Group 3: viewer cannot rename_organization → FORBIDDEN
-- outsider (viewer) tries to rename p1's org → throws 42503
-- ----------------------------------------------------------

SELECT throws_ok(
    $$ SELECT __rename_as_viewer__((SELECT current_setting('test.p1_org_id', true)::uuid), 'Evil Corp') $$,
    42503,
    'FORBIDDEN',
    'Test 3: viewer cannot rename_organization — throws FORBIDDEN 42503'
);

SELECT * FROM finish();

ROLLBACK;
