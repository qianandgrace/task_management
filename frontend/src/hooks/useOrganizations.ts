import { useContext } from 'react';
import { WorkspaceContext } from '../context/WorkspaceContext';

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
