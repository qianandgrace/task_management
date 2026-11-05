import { createContext } from 'react';
import type { Organization } from '../types';

const STORAGE_KEY = 'taskmgmt_org_id';
const STORAGE_NAME_KEY = 'taskmgmt_org_name';

export function getStoredOrgId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getStoredOrgName(): string | null {
  try {
    return localStorage.getItem(STORAGE_NAME_KEY);
  } catch {
    return null;
  }
}

export function setStoredOrg(org: { id: string; name: string }): void {
  try {
    localStorage.setItem(STORAGE_KEY, org.id);
    localStorage.setItem(STORAGE_NAME_KEY, org.name);
  } catch {
    // ignore
  }
}

interface WorkspaceContextValue {
  /** Currently selected organisation id */
  organizationId: string | null;
  /** Set current organisation (id + name) */
  setOrganizationId: (orgId: string) => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue>({
  organizationId: getStoredOrgId(),
  setOrganizationId: () => {},
});
