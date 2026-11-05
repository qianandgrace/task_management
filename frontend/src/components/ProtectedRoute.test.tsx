import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as useAuthMod from '../hooks/useAuth';
import { ProtectedRoute } from './ProtectedRoute';

vi.mock('../hooks/useAuth');

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('redirects to /login when unauthenticated', async () => {
    const mockUseAuth = vi.mocked(useAuthMod);
    mockUseAuth.useAuth.mockReturnValue({
      user: null,
      loading: false,
      profile: null,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    } as any);

    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route path="/login" element={<h1>Login Page</h1>} />
            <Route element={<ProtectedRoute />}>
              <Route path="dashboard" element={<div data-testid="child">protected</div>} />
            </Route>
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('renders children when authenticated', () => {
    const mockUser = { id: '123' } as any;
    const mockUseAuth = vi.mocked(useAuthMod);
    mockUseAuth.useAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      profile: null,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    } as any);

    render(
      <MemoryRouter>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="" element={<div data-testid="child">protected</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByText('protected')).toBeInTheDocument();
  });

  it('shows loader while loading', () => {
    const mockUseAuth = vi.mocked(useAuthMod);
    mockUseAuth.useAuth.mockReturnValue({
      user: null,
      loading: true,
      profile: null,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    } as any);

    // Render ProtectedRoute outside router — it returns <Loader /> on loading
    render(<ProtectedRoute />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
