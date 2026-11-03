import { useState, useEffect, useCallback, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { getTasks, createTask, updateTask, updateTaskStatus, deleteTask } from '../api/tasks';
import { setToken } from '../api/token';
import TaskItem from '../components/TaskItem';
import TaskForm from '../components/TaskForm';

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'todo', label: 'Todo' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

export default function Tasks() {
  const { logout } = useContext(AuthContext);
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingTask, setEditingTask] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    try {
      setError('');
      const data = await getTasks(filter || undefined);
      setTasks(data.tasks || []);
    } catch (err) {
      if (err.status === 401) {
        // Token expired or invalid — clear and redirect
        setToken(null);
        window.location.href = '/login';
        return;
      }
      setError(err.message || 'Failed to load tasks.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Handle status change inline
  const handleStatusChange = async (id, newStatus) => {
    try {
      const result = await updateTaskStatus(id, newStatus);
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? result.task : t))
      );
    } catch (err) {
      alert(err.message || 'Failed to update status.');
    }
  };

  // Handle edit
  const handleEditStart = (task) => {
    setEditingTask(task);
    setShowCreate(false);
  };

  const handleEditCancel = () => {
    setEditingTask(null);
  };

  const handleEditSubmit = async (payload) => {
    try {
      const result = await updateTask(editingTask.id, payload);
      setTasks((prev) =>
        prev.map((t) => (t.id === editingTask.id ? result.task : t))
      );
      setEditingTask(null);
    } catch (err) {
      setError(err.message || 'Failed to update task.');
    }
  };

  // Handle create
  const handleCreateSubmit = async (payload) => {
    try {
      const result = await createTask(payload);
      setTasks((prev) => [result.task, ...prev]);
      setShowCreate(false);
    } catch (err) {
      setError(err.message || 'Failed to create task.');
    }
  };

  // Handle delete
  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    try {
      await deleteTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err.message || 'Failed to delete task.');
    }
  };

  return (
    <div className="tasks-page">
      <header className="page-header">
        <h1>Tasks</h1>
        <div className="header-actions">
          <button className="btn-primary" onClick={() => { setShowCreate(true); setEditingTask(null); }}>
            + New Task
          </button>
          <button onClick={logout}>Logout</button>
        </div>
      </header>

      {/* Filter bar */}
      <div className="filter-bar">
        <label htmlFor="status-filter">Filter:</label>
        <select
          id="status-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      {/* Error banner */}
      {error && <div className="form-error">{error}</div>}

      {/* Loading state */}
      {loading && !error && <div className="spinner">Loading tasks...</div>}

      {/* Create form */}
      {showCreate && (
        <section className="task-form-section">
          <h2>Create Task</h2>
          <TaskForm onSubmit={handleCreateSubmit} onCancel={() => setShowCreate(false)} />
        </section>
      )}

      {/* Edit form */}
      {editingTask && (
        <section className="task-form-section">
          <h2>Edit Task</h2>
          <TaskForm
            initialData={editingTask}
            onSubmit={handleEditSubmit}
            onCancel={handleEditCancel}
          />
        </section>
      )}

      {/* Task list */}
      {!loading && (
        <section className="task-list">
          {tasks.length === 0 ? (
            <p className="empty-state">
              {showCreate || editingTask ? 'Fill in the form above to add a task.' : 'No tasks yet. Click "+ New Task" to get started.'}
            </p>
          ) : (
            tasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                onEdit={handleEditStart}
                onDelete={handleDelete}
                onStatusChange={handleStatusChange}
              />
            ))
          )}
        </section>
      )}
    </div>
  );
}
