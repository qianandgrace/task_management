import { useEffect, useState } from 'react';
import {
  WorkspaceContext,
  getStoredOrgId,
  setStoredOrg,
} from '../context/WorkspaceContext';
import { listMyOrganizations } from '../api/organizations';
import type { Organization } from '../types';

export function WorkspaceSwitcher({ children }: { children: React.ReactNode }) {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [selected, setSelected] = useState<string | null>(getStoredOrgId());

  useEffect(() => {
    listMyOrganizations()
      .then(setOrgs)
      .catch(() => {});
  }, []);

  const handleChange = (orgId: string) => {
    const org = orgs.find((o) => o.id === orgId);
    if (org) setStoredOrg(org);
    setSelected(orgId);
  };

  const currentOrg = orgs.find((o) => o.id === selected);

  return (
    <WorkspaceContext.Provider value={{ organizationId: selected, setOrganizationId: handleChange }}>
      <nav data-testid="workspace-switcher" style={{ marginBottom: '1rem' }}>
        <select
          value={selected ?? ''}
          onChange={(e) => handleChange(e.target.value)}
          disabled={orgs.length === 0}
        >
          {orgs.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
        {currentOrg && (
          <span data-testid="current-org-name" style={{ marginLeft: '0.5rem' }}>
            {currentOrg.name}
          </span>
        )}
      </nav>
      {children}
    </WorkspaceContext.Provider>
  );
}
