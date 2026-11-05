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

  it('renders org name and empty kanban state', async () => {
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

    // Wait for WorkspaceSwitcher effect to resolve listMyOrganizations
    await waitFor(() => {
      expect(screen.getByText('My Workspace')).toBeInTheDocument();
    }, { timeout: 2000 });

    expect(screen.getByText('暂无看板')).toBeInTheDocument();
  });
});
