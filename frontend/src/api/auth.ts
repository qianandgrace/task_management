import { supabase } from '../lib/supabaseClient';
import type { User } from '@supabase/supabase-js';

export interface SignInResult {
  user: User;
}

export interface SignUpResult {
  user: User;
}

export async function signIn(email: string, password: string): Promise<SignInResult> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.user) throw new Error('Sign-in failed: no user returned');
  return { user: data.user };
}

export async function signUp(email: string, password: string, name: string): Promise<SignUpResult> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });
  if (error) throw error;
  // email verification is OFF (spec §9.6) → session/user present immediately
  if (!data.user) throw new Error('Sign-up failed: no user returned');
  return { user: data.user };
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
