const express = require('express');
const authMiddleware = require('../middleware/auth');
const db = require('../db');
const { rowToCamel } = require('../utils/transform');

const router = express.Router();
const VALID_STATUSES = ['todo', 'in_progress', 'done'];

// All routes require JWT authentication
router.use(authMiddleware);

// --- GET /api/tasks?status= ---
router.get('/', (req, res, next) => {
  try {
    const { status } = req.query;
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: '状态必须是 todo、in_progress 或 done 之一' } });
    }

    let tasks;
    if (status) {
      tasks = db.prepare(
        'SELECT * FROM tasks WHERE user_id = ? AND status = ? ORDER BY created_at DESC'
      ).all(req.user.id, status);
    } else {
      tasks = db.prepare(
        'SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC'
      ).all(req.user.id);
    }

    const serialized = tasks.map(rowToCamel);
    return res.status(200).json({ tasks: serialized });
  } catch (err) {
    next(err);
  }
});

// --- POST /api/tasks ---
router.post('/', (req, res, next) => {
  try {
    const { title, description, status, dueDate } = req.body;

    // Validate
    if (!title || typeof title !== 'string' || title.length < 1 || title.length > 255) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: '标题长度必须在 1-255 个字符之间' } });
    }
    if (description !== undefined && description !== null) {
      if (typeof description !== 'string' || description.length > 2000) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: '描述不能超过 2000 个字符' } });
      }
    }
    if (status !== undefined && status !== null && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: '状态必须是 todo、in_progress 或 done 之一' } });
    }
    if (dueDate !== undefined && dueDate !== null) {
      const d = new Date(dueDate);
      if (isNaN(d.getTime())) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: '截止日期必须为有效的 ISO-8601 时间' } });
      }
    }

    const taskStatus = status || 'todo';

    const stmt = db.prepare(
      `INSERT INTO tasks (user_id, title, description, status, due_date)
       VALUES (?, ?, ?, ?, ?)`
    );
    const result = stmt.run(req.user.id, title, description || null, taskStatus, dueDate || null);

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
    const serialized = rowToCamel(task);

    return res.status(201).json({ task: serialized });
  } catch (err) {
    next(err);
  }
});

// --- GET /api/tasks/:id ---
router.get('/:id', (req, res, next) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    if (isNaN(taskId)) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: '任务不存在' } });
    }

    const exists = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId);
    if (!exists) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: '任务不存在' } });
    }

    // Check ownership
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, req.user.id);
    if (!task) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: '无权访问该任务' } });
    }

    const serialized = rowToCamel(task);
    return res.status(200).json({ task: serialized });
  } catch (err) {
    next(err);
  }
});

// --- PUT /api/tasks/:id ---
router.put('/:id', (req, res, next) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    if (isNaN(taskId)) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: '任务不存在' } });
    }

    // Check existence & ownership
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, req.user.id);
    if (!task) {
      const exists = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId);
      if (exists) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: '无权访问该任务' } });
      }
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: '任务不存在' } });
    }

    const { title, description, status, dueDate } = req.body;

    // Validate title (required for PUT)
    if (!title || typeof title !== 'string' || title.length < 1 || title.length > 255) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: '标题长度必须在 1-255 个字符之间' } });
    }
    // Validate status (required for PUT)
    if (status === undefined || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: '状态必须是 todo、in_progress 或 done 之一' } });
    }
    // Validate description
    if (description !== undefined && description !== null) {
      if (typeof description !== 'string' || description.length > 2000) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: '描述不能超过 2000 个字符' } });
      }
    }
    // Validate dueDate
    if (dueDate !== undefined && dueDate !== null) {
      const d = new Date(dueDate);
      if (isNaN(d.getTime())) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: '截止日期必须为有效的 ISO-8601 时间' } });
      }
    }

    db.prepare(
      `UPDATE tasks SET title = ?, description = ?, status = ?, due_date = ? WHERE id = ?`
    ).run(title, description || null, status, dueDate || null, taskId);

    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    const serialized = rowToCamel(updated);

    return res.status(200).json({ task: serialized });
  } catch (err) {
    next(err);
  }
});

// --- PATCH /api/tasks/:id/status ---
router.patch('/:id/status', (req, res, next) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    if (isNaN(taskId)) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: '任务不存在' } });
    }

    // Check existence & ownership
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, req.user.id);
    if (!task) {
      const exists = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId);
      if (exists) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: '无权访问该任务' } });
      }
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: '任务不存在' } });
    }

    const { status } = req.body;
    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: '状态必须是 todo、in_progress 或 done 之一' } });
    }

    db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, taskId);

    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    const serialized = rowToCamel(updated);

    return res.status(200).json({ task: serialized });
  } catch (err) {
    next(err);
  }
});

// --- DELETE /api/tasks/:id ---
router.delete('/:id', (req, res, next) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    if (isNaN(taskId)) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: '任务不存在' } });
    }

    // Check existence & ownership
    const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?').get(taskId, req.user.id);
    if (!task) {
      const exists = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId);
      if (exists) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: '无权访问该任务' } });
      }
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: '任务不存在' } });
    }

    db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);

    return res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
