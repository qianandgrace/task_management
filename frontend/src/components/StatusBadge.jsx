/**
 * Small colored badge for task status.
 */
export default function StatusBadge({ status }) {
  const label = status === 'todo' ? 'Todo' : status === 'in_progress' ? 'In Progress' : 'Done';
  const colorClass = status === 'todo' ? 'badge-todo' : status === 'in_progress' ? 'badge-in_progress' : 'badge-done';
  return <span className={`status-badge ${colorClass}`}>{label}</span>;
}
