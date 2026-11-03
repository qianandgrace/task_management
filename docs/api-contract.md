# API 契约

> 任务管理 Web 应用 REST API 权威定义。前端与后端 Agent 必须严格遵循本文档。任何字段或端点变更须先在 `docs/decisions.md` 记录决策。

## 通用约定

- **Base Path**：`/api`
- **认证方式**：除 `/api/auth/register`、`/api/auth/login` 外，所有端点需 `Authorization: Bearer <token>` 头。
- **Content-Type**：`application/json; charset=utf-8`
- **时间戳**：所有时间字段为 ISO-8601 字符串（UTC，如 `2026-11-03T08:00:00.000Z`）。
- **字段命名**：请求与响应统一使用 **camelCase**（`userId`、`createdAt`、`dueDate`）。
- **统一错误响应**：所有非 2xx 响应体为：
  ```json
  { "error": { "code": "ERROR_CODE", "message": "人类可读说明" } }
  ```
- **任务状态枚举**：`todo` | `in_progress` | `done`

---

## 资源定义

### User

```json
{
  "id": 1,
  "email": "alice@example.com",
  "name": "Alice",
  "createdAt": "2026-11-03T08:00:00.000Z",
  "updatedAt": "2026-11-03T08:00:00.000Z"
}
```

- `id`: integer
- `email`: string
- `name`: string
- `createdAt`: string (ISO-8601)
- `updatedAt`: string (ISO-8601)
- 注：`password_hash` 永不出现在响应中。

### Task

```json
{
  "id": 1,
  "userId": 1,
  "title": "完成设计",
  "description": "架构与 API 契约",
  "status": "todo",
  "dueDate": null,
  "createdAt": "2026-11-03T08:00:00.000Z",
  "updatedAt": "2026-11-03T08:00:00.000Z"
}
```

- `id`: integer
- `userId`: integer
- `title`: string（非空，1–255 字符）
- `description`: string | null（最大 2000 字符）
- `status`: `"todo"` | `"in_progress"` | `"done"`
- `dueDate`: string (ISO-8601) | null
- `createdAt`: string (ISO-8601)
- `updatedAt`: string (ISO-8601)

---

## 端点详情

### 1. POST /api/auth/register

注册新用户并返回 JWT。

- 认证：不需要
- 请求体：
  ```json
  { "email": "alice@example.com", "password": "secret123", "name": "Alice" }
  ```
  | 字段 | 类型 | 必填 | 校验 |
  |------|------|------|------|
  | email | string | 是 | 合法邮箱格式 |
  | password | string | 是 | 长度 ≥ 6 |
  | name | string | 是 | 长度 1–100 |
- 响应 `201 Created`：
  ```json
  {
    "user": { "id": 1, "email": "alice@example.com", "name": "Alice", "createdAt": "...", "updatedAt": "..." },
    "token": "eyJhbGciOi..."
  }
  ```
- 错误：
  - `400 VALIDATION_ERROR` — 字段校验失败
  - `409 CONFLICT` — email 已注册

### 2. POST /api/auth/login

登录并返回 JWT。

- 认证：不需要
- 请求体：
  ```json
  { "email": "alice@example.com", "password": "secret123" }
  ```
- 响应 `200 OK`：
  ```json
  {
    "user": { "id": 1, "email": "alice@example.com", "name": "Alice", "createdAt": "...", "updatedAt": "..." },
    "token": "eyJhbGciOi..."
  }
  ```
- 错误：
  - `400 VALIDATION_ERROR` — 字段校验失败
  - `401 UNAUTHORIZED` — 邮箱或密码错误（消息统一为 "邮箱或密码错误"，不区分两者）

### 3. GET /api/tasks

获取当前用户的所有任务，支持按状态过滤。

- 认证：需要
- 查询参数：
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | status | enum | 否 | `todo` / `in_progress` / `done`，未传则返回全部 |
- 响应 `200 OK`：
  ```json
  {
    "tasks": [
      { "id": 1, "userId": 1, "title": "...", "description": "...", "status": "todo", "dueDate": null, "createdAt": "...", "updatedAt": "..." }
    ]
  }
  ```
  - `tasks`: Task 数组，按 `createdAt` 降序（最新优先）。
- 错误：
  - `401 UNAUTHORIZED` — 未登录或 token 无效
  - `400 VALIDATION_ERROR` — status 取值非法

### 4. POST /api/tasks

创建任务。

- 认证：需要
- 请求体：
  ```json
  { "title": "完成设计", "description": "架构与 API", "dueDate": "2026-11-05T00:00:00.000Z" }
  ```
  | 字段 | 类型 | 必填 | 校验 |
  |------|------|------|------|
  | title | string | 是 | 1–255 字符 |
  | description | string | 否 | 最大 2000 字符，缺省为 null |
  | status | string | 否 | 缺省 `todo`（创建时一般不传） |
  | dueDate | string | 否 | ISO-8601，缺省 null |
- 响应 `201 Created`：
  ```json
  { "task": { "id": 1, "userId": 1, "title": "...", "description": "...", "status": "todo", "dueDate": "...", "createdAt": "...", "updatedAt": "..." } }
  ```
- 错误：
  - `400 VALIDATION_ERROR` — 字段校验失败
  - `401 UNAUTHORIZED`

### 5. GET /api/tasks/:id

获取单个任务详情。

- 认证：需要
- 路径参数：`id` (integer)
- 响应 `200 OK`：
  ```json
  { "task": { "id": 1, "userId": 1, "title": "...", "description": "...", "status": "todo", "dueDate": null, "createdAt": "...", "updatedAt": "..." } }
  ```
- 错误：
  - `401 UNAUTHORIZED`
  - `403 FORBIDDEN` — 任务存在但不属于当前用户
  - `404 NOT_FOUND` — 任务不存在

### 6. PUT /api/tasks/:id

整体更新任务（替换式）。未提供的可空字段将被置为 null/默认。

- 认证：需要
- 路径参数：`id` (integer)
- 请求体：
  ```json
  { "title": "更新后的标题", "description": "新描述", "status": "in_progress", "dueDate": "2026-11-10T00:00:00.000Z" }
  ```
  | 字段 | 类型 | 必填 | 校验 |
  |------|------|------|------|
  | title | string | 是 | 1–255 字符 |
  | description | string | 否 | 最大 2000 字符，缺省 null |
  | status | string | 是 | 枚举值之一 |
  | dueDate | string | 否 | ISO-8601，缺省 null |
- 响应 `200 OK`：
  ```json
  { "task": { ...更新后的完整 Task } }
  ```
- 错误：
  - `400 VALIDATION_ERROR`
  - `401 UNAUTHORIZED`
  - `403 FORBIDDEN`
  - `404 NOT_FOUND`

### 7. PATCH /api/tasks/:id/status

仅更新任务状态（部分更新）。

- 认证：需要
- 路径参数：`id` (integer)
- 请求体：
  ```json
  { "status": "done" }
  ```
  | 字段 | 类型 | 必填 | 校验 |
  |------|------|------|------|
  | status | string | 是 | `todo` / `in_progress` / `done` |
- 响应 `200 OK`：
  ```json
  { "task": { ...更新后的完整 Task } }
  ```
- 错误：
  - `400 VALIDATION_ERROR` — status 缺失或非法
  - `401 UNAUTHORIZED`
  - `403 FORBIDDEN`
  - `404 NOT_FOUND`

### 8. DELETE /api/tasks/:id

删除任务。

- 认证：需要
- 路径参数：`id` (integer)
- 响应 `204 No Content`：无响应体
- 错误：
  - `401 UNAUTHORIZED`
  - `403 FORBIDDEN`
  - `404 NOT_FOUND`

---

## 端点速查表

| 方法 | 路径 | 认证 | 成功状态 | 说明 |
|------|------|------|----------|------|
| POST | /api/auth/register | 否 | 201 | 注册 |
| POST | /api/auth/login | 否 | 200 | 登录 |
| GET | /api/tasks?status= | 是 | 200 | 列表（可过滤） |
| POST | /api/tasks | 是 | 201 | 创建 |
| GET | /api/tasks/:id | 是 | 200 | 详情 |
| PUT | /api/tasks/:id | 是 | 200 | 整体更新 |
| PATCH | /api/tasks/:id/status | 是 | 200 | 状态更新 |
| DELETE | /api/tasks/:id | 是 | 204 | 删除 |

## 关键字段速查

- 认证响应：`{ user, token }`
- 任务集合：`{ tasks: Task[] }`
- 单任务：`{ task: Task }`
- 删除：无响应体（204）
- 错误：`{ error: { code, message } }`
