import { useState, useEffect } from 'react';

export default function TaskForm({ initialData, onSubmit, onCancel }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState('todo');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title || '');
      setDescription(initialData.description || '');
      // Convert ISO date string to HTML input value (YYYY-MM-DD)
      if (initialData.dueDate) {
        setDueDate(initialData.dueDate.split('T')[0]);
      } else {
        setDueDate('');
      }
      setStatus(initialData.status || 'todo');
    } else {
      setTitle('');
      setDescription('');
      setDueDate('');
      setStatus('todo');
    }
    setError('');
  }, [initialData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Title is required.');
      return;
    }

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      status,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
    };

    setSubmitting(true);
    try {
      await onSubmit(payload);
      onCancel();
    } catch (err) {
      setError(err.message || 'Failed to save task.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="task-form" onSubmit={handleSubmit}>
      {error && <div className="form-error">{error}</div>}
      <div className="form-group">
        <label htmlFor="task-title">Title *</label>
        <input
          id="task-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title"
          required
        />
      </div>
      <div className="form-group">
        <label htmlFor="task-desc">Description</label>
        <textarea
          id="task-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          rows={3}
        />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="task-due">Due Date</label>
          <input
            id="task-due"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="task-status">Status</label>
          <select
            id="task-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="todo">Todo</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
          </select>
        </div>
      </div>
      <div className="form-actions">
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : 'Save'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
