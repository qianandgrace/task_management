import request from './fetch';

/**
 * Fetch all tasks for the current user.
 * @param {string} [status] - Optional filter: todo | in_progress | done
 */
export async function getTasks(status) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const queryString = params.toString();
  return request(`/api/tasks${queryString ? `?${queryString}` : ''}`);
}

/**
 * Create a new task.
 * @param {object} payload - { title, description?, dueDate?, status? }
 */
export async function createTask(payload) {
  return request('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Get a single task by ID.
 */
export async function getTask(id) {
  return request(`/api/tasks/${id}`);
}

/**
 * Update a task fully (PUT).
 */
export async function updateTask(id, payload) {
  return request(`/api/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

/**
 * Partially update only the status of a task (PATCH).
 */
export async function updateTaskStatus(id, status) {
  return request(`/api/tasks/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

/**
 * Delete a task.
 */
export async function deleteTask(id) {
  return request(`/api/tasks/${id}`, {
    method: 'DELETE',
  });
}
