-- ============================================================
-- tenant_isolation.test.sql — multi-tenant RLS isolation
-- Foundation Task 2 — pgTAP assertions
-- Adapted for Task 3 handle_new_user trigger: auth.users insert
-- auto-creates profile + personal org + member(owner).
-- No manual profile/org/member seeds needed.
-- ============================================================

BEGIN;

SELECT plan(6);

-- ----------------------------------------------------------
-- Setup: seed two auth.users as superuser (pgTAP runs as postgres,
-- which bypasses RLS). The handle_new_user trigger fires and
-- auto-creates: profile(id, email, name), personal org(name, owner_id),
-- member(org_id, profile_id, 'owner', tenant_id) for each.
-- Capture the trigger-created org ids BEFORE switching roles.
-- ----------------------------------------------------------

-- Seed p1 → trigger auto-creates profile + org(o1) + member(owner)
INSERT INTO auth.users (
  id, email, encrypted_password, aud, role,
  email_confirmed_at, instance_id,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'p1@example.com',
  crypt('password', gen_salt('bf')),
  'authenticated', 'authenticated',
  now(), '00000000-0000-0000-0000-000000000000',
  '{}'::jsonb, '{}'::jsonb,
  now(), now(), now()
);

-- Seed p2 → trigger auto-creates profile + org(o2) + member(owner)
INSERT INTO auth.users (
  id, email, encrypted_password, aud, role,
  email_confirmed_at, instance_id,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'p2@example.com',
  crypt('password', gen_salt('bf')),
  'authenticated', 'authenticated',
  now(), '00000000-0000-0000-0000-000000000000',
  '{}'::jsonb, '{}'::jsonb,
  now(), now(), now()
);

-- Capture trigger-created org ids (superuser, before role switches)
DO $$
DECLARE
    _o1 uuid; -- p1's personal org
    _o2 uuid; -- p2's personal org
BEGIN
    SELECT id INTO _o1 FROM public.organizations WHERE owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid LIMIT 1;
    SELECT id INTO _o2 FROM public.organizations WHERE owner_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid LIMIT 1;
    PERFORM set_config('test.p1_org_id', _o1::text, true);
    PERFORM set_config('test.p2_org_id', _o2::text, true);
END $$;

-- ----------------------------------------------------------
-- Test 1: p1 sees only its own org's member rows (count = 1)
-- ----------------------------------------------------------
SET LOCAL ROLE 'authenticated';
SET LOCAL REQUEST.JWT.CLAIMS TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

SELECT is(
    (SELECT count(*) FROM public.members),
    1::bigint,
    'p1 authenticated: members count = 1'
);

SELECT is(
    (SELECT count(*) FROM public.members WHERE organization_id = current_setting('test.p1_org_id', true)::uuid),
    1::bigint,
    'p1 authenticated: sees row from own org o1'
);

-- ----------------------------------------------------------
-- Test 2: anon sees ZERO rows on members
-- Must clear JWT claims inherited from previous authenticated context
-- ----------------------------------------------------------
SET LOCAL ROLE 'authenticated';
SET LOCAL REQUEST.JWT.CLAIMS TO '{"sub":"none","role":"authenticated"}';
SET LOCAL ROLE 'anon';
SET LOCAL REQUEST.JWT.CLAIMS TO '';

SELECT is(
    (SELECT count(*) FROM public.members),
    0::bigint,
    'anon: members count = 0'
);

-- ----------------------------------------------------------
-- Test 3: orgs isolation — p1 sees exactly one org (own org o1)
--         Exact count catches a broken policy (e.g. USING true would give 2)
-- ----------------------------------------------------------
SET LOCAL ROLE 'authenticated';
SET LOCAL REQUEST.JWT.CLAIMS TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

SELECT is(
    (SELECT count(*) FROM public.organizations),
    1::bigint,
    'p1: sees only own org o1 (exact count)'
);

-- ----------------------------------------------------------
-- Test 4 (boundary): p1 cannot see foreign org o2 on organizations table
-- ----------------------------------------------------------
SELECT is(
    (SELECT count(*) FROM public.organizations WHERE id = current_setting('test.p2_org_id', true)::uuid),
    0::bigint,
    'p1: cannot see foreign org o2'
);

-- ----------------------------------------------------------
-- Test 5 (boundary): p1 querying by o2's member id must return 0 rows
-- ----------------------------------------------------------
SELECT is(
    (SELECT count(*) FROM public.members WHERE organization_id = current_setting('test.p2_org_id', true)::uuid),
    0::bigint,
    'p1 boundary: filter by foreign org id returns 0 rows'
);

SELECT * FROM finish();

ROLLBACK;
