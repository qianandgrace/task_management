-- ============================================================
-- tenant_isolation.test.sql — multi-tenant RLS isolation
-- Foundation Task 2 — pgTAP assertions
-- ============================================================

BEGIN;

SELECT plan(6);

-- ----------------------------------------------------------
-- Setup: seed data as superuser (pgTAP runs as postgres,
-- which bypasses RLS). Two orgs + two profiles + two members.
-- Seed auth.users first so FK profiles.id → auth.users(id) is satisfied.
-- ----------------------------------------------------------

-- Auth users (required so profiles FK resolves; GoTrue-managed but seedable as superuser in tests)
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
), (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'p2@example.com',
  crypt('password', gen_salt('bf')),
  'authenticated', 'authenticated',
  now(), '00000000-0000-0000-0000-000000000000',
  '{}'::jsonb, '{}'::jsonb,
  now(), now(), now()
);

-- Organizations
INSERT INTO public.organizations (id, name, owner_id, created_at, updated_at, tenant_id)
VALUES ('00000000-0000-0000-0000-000000000001', 'Org One', NULL, now(), now(), '00000000-0000-0000-0000-000000000001');

INSERT INTO public.organizations (id, name, owner_id, created_at, updated_at, tenant_id)
VALUES ('00000000-0000-0000-0000-000000000002', 'Org Two', NULL, now(), now(), '00000000-0000-0000-0000-000000000002');

-- Profiles
INSERT INTO public.profiles (id, email, name, created_at, updated_at)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'p1@example.com', 'User One', now(), now());

INSERT INTO public.profiles (id, email, name, created_at, updated_at)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'p2@example.com', 'User Two', now(), now());

INSERT INTO public.members (organization_id, profile_id, role, created_at, updated_at, tenant_id)
VALUES ('00000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner', now(), now(), '00000000-0000-0000-0000-000000000001');

INSERT INTO public.members (organization_id, profile_id, role, created_at, updated_at, tenant_id)
VALUES ('00000000-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owner', now(), now(), '00000000-0000-0000-0000-000000000002');

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
    (SELECT count(*) FROM public.members WHERE organization_id = '00000000-0000-0000-0000-000000000001'),
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
    (SELECT count(*) FROM public.organizations WHERE id = '00000000-0000-0000-0000-000000000002'),
    0::bigint,
    'p1: cannot see foreign org o2'
);

-- ----------------------------------------------------------
-- Test 5 (boundary): p1 querying by o2's member id must return 0 rows
-- ----------------------------------------------------------
SELECT is(
    (SELECT count(*) FROM public.members WHERE organization_id = '00000000-0000-0000-0000-000000000002'),
    0::bigint,
    'p1 boundary: filter by foreign org id returns 0 rows'
);

SELECT * FROM finish();

ROLLBACK;
