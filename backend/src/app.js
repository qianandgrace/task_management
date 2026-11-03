const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const tasksRoutes = require('./routes/tasks');
const errorHandler = require('./middleware/error');

const app = express();
const PORT = process.env.PORT || 4000;

// CORS — whitelist via CORS_ORIGIN env (DR-0003); default allows the Vite dev server
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',');
app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
}));

// Parse JSON bodies
app.use(express.json());

// Request logging (simple)
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Routes — mounted under /api
app.use('/api/auth', authRoutes);
app.use('/api/tasks', tasksRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Global error handler (must be last)
app.use(errorHandler);

// Express app assembly (do not call .listen here — do it in index.js)
module.exports = app;
