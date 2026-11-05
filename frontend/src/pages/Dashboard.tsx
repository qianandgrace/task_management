import { listMyOrganizations } from '../api/organizations';
import { WorkspaceSwitcher } from '../components/WorkspaceSwitcher';

export function Dashboard() {
  return (
    <WorkspaceSwitcher>
      <div>
        <h1>Dashboard</h1>
        <p>暂无看板</p>
      </div>
    </WorkspaceSwitcher>
  );
}
