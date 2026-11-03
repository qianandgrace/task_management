import StatusBadge from './StatusBadge';

export default function TaskItem({ task, onEdit, onDelete, onStatusChange }) {
  return (
    <div className="task-item" data-status={task.status}>
      <div className="task-header">
        <h3 className="task-title">{task.title}</h3>
        <StatusBadge status={task.status} />
      </div>
      {task.description && <p className="task-description">{task.description}</p>}
      {task.dueDate && <p className="task-due">Due: {task.dueDate}</p>}
      <div className="task-actions">
        <select
          value={task.status}
          onChange={(e) => onStatusChange(task.id, e.target.value)}
          aria-label="Change status"
        >
          <option value="todo">Todo</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>
        <button onClick={() => onEdit(task)}>Edit</button>
        <button className="btn-danger" onClick={() => onDelete(task.id)}>
          Delete
        </button>
      </div>
    </div>
  );
}
