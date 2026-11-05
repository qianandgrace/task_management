import { createContext } from 'react';

const STORAGE_KEY = 'taskmgmt_org_id';

export function getStoredOrgId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredOrgId(orgId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, orgId);
  } catch {
    // ignore
  }
}

interface WorkspaceContextValue {
  organizationId: string | null;
  setOrganizationId: (orgId: string) => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue>({
  organizationId: getStoredOrgId(),
  setOrganizationId: () => {},
});
