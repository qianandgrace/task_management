import { supabase } from '../lib/supabaseClient';

export async function apiFetch(
  url: string,
  init?: RequestInit,
): Promise<Response | never> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token ?? null;

  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, { ...init, headers });

  if (response.status === 401) {
    await supabase.auth.signOut();
    window.location.href = '/login';
    throw new Error('UNAUTHORIZED');
  }

  return response;
}
