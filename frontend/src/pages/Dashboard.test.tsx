import { screen, render, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as useAuthMod from '../hooks/useAuth';
import * as orgApi from '../api/organizations';
import { Dashboard } from '../pages/Dashboard';

vi.mock('../hooks/useAuth');
vi.mock('../api/organizations');

describe('Dashboard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders org name in h1 and empty kanban state', async () => {
    const mockUseAuth = vi.mocked(useAuthMod);
    mockUseAuth.useAuth.mockReturnValue({
      user: { id: 'user-1' } as any,
      loading: false,
      profile: { name: 'test user' },
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    } as any);

    const mockOrgs = vi.mocked(orgApi);
    mockOrgs.listMyOrganizations.mockResolvedValue([
      { id: 'org-1', name: 'My Workspace', role: 'owner', createdAt: '2026-01-01T00:00:00Z' },
    ]);

    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <Dashboard />
        </MemoryRouter>,
      );
    });

    // Wait for Dashboard effect to resolve listMyOrganizations and set org name
    await waitFor(
      () => {
        expect(document.querySelector('h1')?.textContent).toBe('My Workspace');
      },
      { timeout: 2000 },
    );

    // Assert org name appears in <h1> directly from Dashboard
    const h1 = document.querySelector('h1');
    expect(h1).not.toBeNull();
    expect(h1!.textContent).toBe('My Workspace');

    // Empty kanban state still visible
    expect(screen.getByText('暂无看板')).toBeInTheDocument();
  });
});
