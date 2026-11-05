import '@testing-library/jest-dom';
import { vi } from 'vitest';

vi.mock('../lib/supabaseClient', () => {
  let listeners: Set<(event: string, session: any) => void> = new Set();

  const supabase = {
    auth: {
      signInWithPassword: async () => ({ data: null, error: null }),
      signUp: async () => ({ data: null, error: null }),
      signOut: async () => {
        listeners.forEach((fn) => fn('SIGNED_OUT', null));
        return { data: null, error: null };
      },
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: (cb: (event: string, session: any) => void) => {
        listeners.add(cb);
        return {
          data: { subscription: { unsubscribe: () => listeners.delete(cb) } },
        };
      },
    },
    rpc: async () => ({ data: null, error: null }),
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: null, error: null }) }),
      }),
    }),
    functions: { invoke: async () => ({ data: null, error: null }) },
  };

  return { supabase };
});
