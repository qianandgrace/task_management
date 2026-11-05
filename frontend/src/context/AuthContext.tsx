import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabaseClient';
import * as authApi from '../api/auth';
import type { User } from '@supabase/supabase-js';

export interface AuthContextValue {
  user: User | null;
  profile: { name: string } | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  loading: true,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<{ name: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      setUser(data?.session?.user ?? null);
      setLoading(false);
    };

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) {
        setProfile(null);
        return;
      }
      try {
        const { data } = await supabase.from('profiles').select('name').eq('id', user.id).single();
        setProfile(data ?? null);
      } catch {
        setProfile(null);
      }
    };
    fetchProfile();
  }, [user?.id]);

  const fetchProfileFor = useCallback(async (userId: string): Promise<{ name: string } | null> => {
    try {
      const { data } = await supabase.from('profiles').select('name').eq('id', userId).single();
      return data ?? null;
    } catch {
      return null;
    }
  }, []);

  // signIn/signUp set user (and profile) directly from the auth response BEFORE
  // returning, so the post-signIn navigate('/dashboard') sees a non-null user
  // immediately. onAuthStateChange remains for token refresh / sign-out.
  const signIn = useCallback(
    async (email: string, password: string) => {
      const { user } = await authApi.signIn(email, password);
      setUser(user);
      setProfile(await fetchProfileFor(user.id));
    },
    [fetchProfileFor],
  );
  const signUp = useCallback(
    async (email: string, password: string, name: string) => {
      const { user } = await authApi.signUp(email, password, name);
      setUser(user);
      setProfile(await fetchProfileFor(user.id));
    },
    [fetchProfileFor],
  );
  const signOut = useCallback(() => authApi.signOut(), []);

  const value: AuthContextValue = {
    user,
    profile,
    loading,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
