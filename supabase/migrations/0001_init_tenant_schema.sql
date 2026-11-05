-- ============================================================
-- 0001_init_tenant_schema.sql — multi-tenant base schema + RLS
-- Foundation Task 2
-- Tables: profiles, organizations, members
-- Functions: set_updated_at(), user_organization_ids()
-- Triggers: updated_at auto-refresh, tenant_id population
-- RLS: all three tables, using SECURITY DEFINER helper (R2)
-- ============================================================

-- ----------------------------------------------------------
-- Function: set_updated_at()
-- Triggered on BEFORE UPDATE to refresh updated_at column
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = pg_catalog, public
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

-- ----------------------------------------------------------
-- Function: set_org_tenant_id_on_insert()
-- BEFORE INSERT on organizations: ensures tenant_id = id
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_org_tenant_id_on_insert()
RETURNS TRIGGER
SET search_path = pg_catalog, public
LANGUAGE plpgsql AS $$
BEGIN
    NEW.tenant_id := NEW.id;
    RETURN NEW;
END;
$$;

-- ----------------------------------------------------------
-- Function: set_member_tenant_id_on_insert()
-- BEFORE INSERT on members: ensures tenant_id = organization_id
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_member_tenant_id_on_insert()
RETURNS TRIGGER
SET search_path = pg_catalog, public
LANGUAGE plpgsql AS $$
BEGIN
    NEW.tenant_id := NEW.organization_id;
    RETURN NEW;
END;
$$;

-- ----------------------------------------------------------
-- Table: profiles
-- Auth-linked user profiles. pk = auth.users.id
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id         uuid PRIMARY KEY, -- REFERENCES auth.users(id) — validated by handle_new_user (Task 3)
    email      text NOT NULL,
    name       text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------
-- Table: organizations
-- Multi-tenant orgs. tenant_id = own id (trigger-enforced)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL,
    owner_id   uuid REFERENCES profiles(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    tenant_id  uuid NOT NULL DEFAULT gen_random_uuid()
);

CREATE TRIGGER orgs_set_tenant_id
BEFORE INSERT ON organizations
FOR EACH ROW EXECUTE FUNCTION set_org_tenant_id_on_insert();

CREATE TRIGGER orgs_set_updated_at
BEFORE UPDATE ON organizations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------
-- Table: members
-- Cross-ref between profiles and organizations.
-- tenant_id = organization_id
-- Unique constraint: one role per profile per org
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.members (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    profile_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role            text NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    tenant_id       uuid NOT NULL DEFAULT gen_random_uuid(),
    UNIQUE (organization_id, profile_id)
);

CREATE TRIGGER members_set_tenant_id
BEFORE INSERT ON members
FOR EACH ROW EXECUTE FUNCTION set_member_tenant_id_on_insert();

CREATE TRIGGER members_set_updated_at
BEFORE UPDATE ON members
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------
-- Function: user_organization_ids()
-- SECURITY DEFINER helper for RLS using clauses (R2 ruling).
-- Returns the organization_ids for the currently authenticated user.
-- Created AFTER members table exists (required by parser in strict mode).
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_organization_ids()
RETURNS TABLE(organization_id uuid)
SECURITY DEFINER
SET search_path = pg_catalog, public
LANGUAGE sql AS $$
    SELECT organization_id FROM public.members WHERE profile_id = auth.uid()
$$;

-- ----------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_members_tenant ON public.members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_members_org_profile ON public.members(organization_id, profile_id);
CREATE INDEX IF NOT EXISTS idx_orgs_owner ON public.organizations(owner_id);

-- ----------------------------------------------------------
-- RLS: profiles
-- ----------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_read_own ON public.profiles
    FOR SELECT
    USING (id = auth.uid());

CREATE POLICY profiles_write_own ON public.profiles
    FOR ALL
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- ----------------------------------------------------------
-- RLS: organizations
-- Read via user_organization_ids helper (R2).
-- Insert unrestricted — Task 3 handle_new_user bypasses RLS.
-- ----------------------------------------------------------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY orgs_read_via_helper ON public.organizations
    FOR SELECT
    USING (id = any(SELECT user_organization_ids()));

CREATE POLICY orgs_insert_no_rls ON public.organizations
    FOR INSERT
    WITH CHECK (true);

-- ----------------------------------------------------------
-- RLS: members
-- Read/write via user_organization_ids helper (R2).
-- Explicit deny_all blocks anon/unauthenticated completely.
-- ----------------------------------------------------------
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

-- Anon/unauth: deny everything (explicit gate)
CREATE POLICY deny_all_anon_members ON public.members
    FOR ALL TO anon
    USING (false);

CREATE POLICY members_read_via_helper ON public.members
    FOR SELECT
    USING (organization_id = any(SELECT user_organization_ids()));

CREATE POLICY members_write_via_helper ON public.members
    FOR ALL
    USING (organization_id = any(SELECT user_organization_ids()))
    WITH CHECK (organization_id = any(SELECT user_organization_ids()));
