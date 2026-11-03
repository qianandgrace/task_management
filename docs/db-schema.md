# 数据库 Schema (SQLite)

> 任务管理应用数据库建表 SQL。后端 Agent 在 `backend/src/db/` 中据此初始化 `data/app.db`。

## 启用外键约束

SQLite 默认不启用外键，每次连接后必须执行：

```sql
PRAGMA foreign_keys = ON;
```

## 建表 SQL

```sql
-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    name          TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 任务表
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
```

## 索引

```sql
-- 登录按 email 查询（UNIQUE 约束已自动创建索引，此处显式声明以保持清晰）
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- 列表按 user_id 过滤、按 created_at 排序
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks (user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id_created ON tasks (user_id, created_at);

-- 状态过滤
CREATE INDEX IF NOT EXISTS idx_tasks_user_id_status ON tasks (user_id, status);
```

## 时间戳说明

- 所有时间戳字段为 `TEXT` 类型，存储 **ISO-8601 UTC 字符串**（如 `2026-11-03T08:00:00.000Z`）。
- 默认值使用 `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')` 生成 UTC 时间。
- `updated_at` 在每次 UPDATE 时由应用层（后端）显式更新为当前 UTC 时间，或在触发器中处理（可选）。

## 可选：updated_at 自动更新触发器

```sql
CREATE TRIGGER IF NOT EXISTS trg_tasks_updated_at
AFTER UPDATE ON tasks
FOR EACH ROW
BEGIN
    UPDATE tasks SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_users_updated_at
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
    UPDATE users SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = OLD.id;
END;
```

> 后端 Agent 可选择使用触发器或在应用层更新 `updated_at`，二选一，保持一致即可。

## 字段与 API 映射

数据库（snake_case）→ API/前端（camelCase）：

| 数据库字段 | API 字段 |
|------------|----------|
| id | id |
| user_id | userId |
| password_hash | （不返回） |
| created_at | createdAt |
| updated_at | updatedAt |
| due_date | dueDate |

后端在序列化响应时负责转换命名风格。

## 初始化注意事项

- `backend/data/` 目录需加入 `.gitignore`，数据库文件 `app.db` 不入库。
- 首次启动时由 `backend/src/db/index.js` 执行上述 SQL 建表（`CREATE TABLE IF NOT EXISTS`）。
- 密码使用 `bcryptjs` 哈希后存入 `password_hash`，明文绝不入库。
