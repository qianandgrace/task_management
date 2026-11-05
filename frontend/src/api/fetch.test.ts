import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiFetch } from './fetch';

describe('apiFetch 401 auto-logout', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  const origLocation = window.location;

  beforeEach(() => {
    // Ensure clean state
    delete (window as unknown as Record<string, unknown>).location;

    // Set safe location for redirect assertion
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
      configurable: true,
    });

    // Mock global fetch to return 401
    fetchSpy = vi.fn(async () => ({ ok: false, status: 401 }) as Response);
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', {
      value: origLocation,
      writable: true,
      configurable: true,
    });
  });

  it('calls signOut + redirects to /login on 401 response', async () => {
    // Access the globally-mocked supabase module's signOut directly
    const mod = await import('../lib/supabaseClient') as { supabase: SupabaseClient };
    const signOutSpy = vi.spyOn(mod.supabase.auth, 'signOut' as never);

    // Call apiFetch — trigger fetch → receives mocked 401 → triggers signOut + redirect
    await expect(apiFetch('https://example.com/api/data')).rejects.toThrow('UNAUTHORIZED');

    // Assert auth signOut was called (core 401 auto-logout behavior)
    expect(signOutSpy).toHaveBeenCalledOnce();

    // Assert redirect happened
    expect((window as { location: { href: string } }).location.href).toBe('/login');
  });
});
