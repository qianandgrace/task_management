import { useContext } from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AuthProvider, AuthContext } from './AuthContext';

describe('AuthContext', () => {
  it('transitions from loading to loaded; signOut callable', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(
      () => {
        const ctx = useContext(AuthContext);
        return {
          user: ctx.user,
          signIn: ctx.signIn,
          signOut: ctx.signOut,
          loading: ctx.loading,
        };
      },
      { wrapper },
    );

    // First render must show loading
    expect(result.current.loading).toBe(true);

    // Wait for initial getSession to resolve (supabaseClient stub returns null session)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.user).toBeNull();

    // Verify signOut is callable without errors
    await act(async () => {
      await result.current.signOut();
    });
  });

  it('shows loader before session check completes', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(
      () => {
        const ctx = useContext(AuthContext);
        return { loading: ctx.loading, user: ctx.user };
      },
      { wrapper },
    );

    // Initial render must show loading
    expect(result.current.loading).toBe(true);
  });
});
