const path = require('path');
const Database = require('better-sqlite3');

const DB_DIR = path.resolve(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DB_DIR, 'tasks.db');

// Ensure data directory exists
const fs = require('fs');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable foreign-key constraints
db.pragma('foreign_keys = ON');

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

/**
 * Execute all schema statements (idempotent via IF NOT EXISTS).
 */
function initSchema() {
  db.exec(`
    -- User table
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      name          TEXT    NOT NULL,
      created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    -- Task table
    CREATE TABLE IF NOT EXISTS tasks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      title       TEXT    NOT NULL CHECK (length(title) BETWEEN 1 AND 255),
      description TEXT    CHECK (description IS NULL OR length(description) <= 2000),
      status      TEXT    NOT NULL DEFAULT 'todo'
                        CHECK (status IN ('todo', 'in_progress', 'done')),
      due_date    TEXT,
      created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
    CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks (user_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_user_id_created ON tasks (user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_user_id_status ON tasks (user_id, status);

    -- Updated-at trigger for tasks
    CREATE TRIGGER IF NOT EXISTS trg_tasks_updated_at
    AFTER UPDATE ON tasks
    FOR EACH ROW
    BEGIN
      UPDATE tasks SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = OLD.id;
    END;

    -- Updated-at trigger for users
    CREATE TRIGGER IF NOT EXISTS trg_users_updated_at
    AFTER UPDATE ON users
    FOR EACH ROW
    BEGIN
      UPDATE users SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = OLD.id;
    END;
  `);
}

initSchema();

module.exports = db;
