/**
 * Vitest automatic-mock for src/lib/supabaseClient.ts.
 * Provides a minimal but realistic supabase client for tests.
 * signOut triggers onAuthStateChange callbacks so that AuthProvider's
 * user state correctly transitions to null — enabling 401-auto-logout tests.
 */

type Listener = (event: string, session: any) => void;

let listeners: Set<Listener> = new Set();

export const supabase = {
  auth: {
    signInWithPassword: async () => ({ data: null, error: null }),
    signUp: async () => ({ data: null, error: null }),
    signOut: async () => {
      // Trigger onAuthStateChange so components using onAuthStateChange see SIGNED_OUT
      listeners.forEach((fn) => fn('SIGNED_OUT', null));
      return { data: null, error: null };
    },
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: (cb: Listener) => {
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
