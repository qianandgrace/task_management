const express = require('express');
const auth = require('../middleware/auth');
const db = require('../db');
const bcrypt = require('bcryptjs');
const { signToken } = require('../utils/jwt');
const { rowToCamel } = require('../utils/transform');

const router = express.Router();

// --- POST /api/auth/register ---
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    // Validate input
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: '邮箱格式不正确' } });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: '密码长度至少为 6 个字符' } });
    }
    if (!name || typeof name !== 'string' || name.length < 1 || name.length > 100) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: '名称长度必须在 1-100 个字符之间' } });
    }

    // Check unique email
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: { code: 'CONFLICT', message: '邮箱已注册' } });
    }

    // Hash password & insert
    const passwordHash = await bcrypt.hash(password, 10);
    const stmt = db.prepare(
      'INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)'
    );
    const result = stmt.run(email, passwordHash, name);

    // Fetch created user (without password_hash)
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    const serialized = rowToCamel(user);
    delete serialized.passwordHash;

    const token = signToken(serialized.id, serialized.email);

    return res.status(201).json({ user: serialized, token });
  } catch (err) {
    next(err);
  }
});

// --- POST /api/auth/login ---
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: '邮箱不能为空' } });
    }
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: '密码不能为空' } });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '邮箱或密码错误' } });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '邮箱或密码错误' } });
    }

    const serialized = rowToCamel(user);
    delete serialized.passwordHash;

    const token = signToken(serialized.id, serialized.email);

    return res.status(200).json({ user: serialized, token });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
