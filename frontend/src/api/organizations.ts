import type { Organization, InviteMemberResponse } from '../types';
import { supabase } from '../lib/supabaseClient';

export async function listMyOrganizations(): Promise<Organization[]> {
  const { data, error } = await supabase.rpc('list_my_organizations');
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    name: row.name as string,
    role: row.role as string,
    createdAt: row.created_at as string,
  }));
}

export async function inviteMember(
  organizationId: string,
  email: string,
  role: string,
): Promise<InviteMemberResponse> {
  const { error } = await supabase.functions.invoke('invite-member', {
    body: { organizationId, email, role },
  });
  if (error) throw error;
  return { ok: true };
}
