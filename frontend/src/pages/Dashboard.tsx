import { useEffect, useState } from 'react';
import { listMyOrganizations } from '../api/organizations';
import { getStoredOrgId } from '../context/WorkspaceContext';
import { WorkspaceSwitcher } from '../components/WorkspaceSwitcher';

export function Dashboard() {
  const [orgName, setOrgName] = useState<string>('');

  useEffect(() => {
    listMyOrganizations().then((orgs) => {
      const currentId = getStoredOrgId();
      const found = currentId ? orgs.find((o) => o.id === currentId) : orgs[0];
      setOrgName(found?.name ?? '');
    }).catch(() => setOrgName(''));
  }, []);

  return (
    <WorkspaceSwitcher>
      <div>
        <h1>{orgName || 'Dashboard'}</h1>
        <p>暂无看板</p>
      </div>
    </WorkspaceSwitcher>
  );
}
