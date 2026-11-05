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

  const signIn = useCallback(
    (email: string, password: string) => authApi.signIn(email, password),
    [],
  );
  const signUp = useCallback(
    (email: string, password: string, name: string) => authApi.signUp(email, password, name),
    [],
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
