-- ============================================================
-- 0002_auth_workspace.sql — handle_new_user trigger + list_my_organizations + rename_organization
-- Foundation Task 3
-- R1: handle_new_user MUST be SECURITY DEFINER to bootstrap first org+member
--     for a new user who has no members row yet (RLS would block insert).
-- ============================================================

-- ----------------------------------------------------------
-- Function: handle_new_user()
-- Triggered on auth.users INSERT to auto-create profile, organization, member.
-- SECURITY DEFINER required (R1): new user has no members row → RLS blocks
-- their own insert. Superuser bypass bootstraps.
-- Owned by postgres/supabase_admin.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_catalog
LANGUAGE plpgsql AS $$
DECLARE
    org_id uuid;
    org_name text;
BEGIN
    -- Build display name from raw metadata or derive from email
    org_name := coalesce(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));

    -- Create profile (id is PK; ON CONFLICT DO NOTHING makes idempotent)
    INSERT INTO public.profiles (id, email, name)
    VALUES (NEW.id, NEW.email, org_name)
    ON CONFLICT (id) DO NOTHING;

    -- Create personal organization — wrapped in EXCEPTION block so pre-seeded
    -- orgs do not abort the transaction. SECURITY DEFINER bypasses RLS for bootstrap.
    BEGIN
        INSERT INTO public.organizations (name, owner_id)
        VALUES (org_name, NEW.id)
        RETURNING id INTO org_id;
    EXCEPTION WHEN OTHERS THEN
        -- Pre-seeded org (e.g., Task 2 seed) exists → ignore, org_id stays null
        org_id := NULL;
    END;

    -- Create membership only if we got a new org
    IF org_id IS NOT NULL THEN
        INSERT INTO public.members (organization_id, profile_id, role, tenant_id)
        VALUES (org_id, NEW.id, 'owner', org_id)
        ON CONFLICT (organization_id, profile_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

-- ----------------------------------------------------------
-- Trigger: fire handle_new_user after every auth.users insert
-- ----------------------------------------------------------
DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------
-- Function: list_my_organizations()
-- Returns all organizations the current user belongs to, with role.
-- SECURITY DEFINER so callers don't need direct table access;
-- internal auth.uid() check enforces isolation.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_my_organizations()
RETURNS TABLE (
    id uuid,
    name text,
    role text,
    created_at timestamptz
)
SECURITY DEFINER
SET search_path = public, pg_catalog
LANGUAGE sql AS $$
    SELECT o.id, o.name, m.role, o.created_at
    FROM public.organizations o
    JOIN public.members m ON m.organization_id = o.id
    WHERE m.profile_id = auth.uid()
$$;

-- ----------------------------------------------------------
-- Function: rename_organization(p_org_id uuid, p_new_name text)
-- Renames an organization. Requires caller to be owner or admin.
-- SECURITY DEFINER: internal role check via auth.uid(), raises 42503 FORBIDDEN.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rename_organization(p_org_id uuid, p_new_name text)
RETURNS void
SECURITY DEFINER
SET search_path = public, pg_catalog
LANGUAGE plpgsql AS $$
DECLARE
    v_role text;
BEGIN
    -- Check if the caller is a member of this org
    SELECT m.role INTO v_role
    FROM public.members m
    WHERE m.organization_id = p_org_id
      AND m.profile_id = auth.uid();

    -- If not a member at all → FORBIDDEN
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN' USING errcode = '42503';
    END IF;

    -- Only owner/admin can rename
    IF v_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'FORBIDDEN' USING errcode = '42503';
    END IF;

    UPDATE public.organizations
    SET name = p_new_name
    WHERE id = p_org_id;
END;
$$;
