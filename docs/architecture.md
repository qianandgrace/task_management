# 系统架构文档

> 任务管理 Web 应用 — 架构权威定义。前端与后端 Agent 必须依据本文档并行开发，不得偏离接口契约。

## 1. 系统概览

单仓库多模块的任务管理应用，采用前后端分离架构：

- **前端**：React (Vite) 单页应用，负责用户界面与交互。
- **后端**：Node.js (Express) REST API，负责业务逻辑与数据持久化。
- **数据库**：SQLite (better-sqlite3)，嵌入式文件数据库。
- **认证**：JWT (JSON Web Token)，无状态会话。

应用支持：用户注册/登录、任务 CRUD、任务状态标记（todo / in_progress / done）。

## 2. 组件关系图

```
┌──────────────────────────────────────────────────────────┐
│                         浏览器                            │
│  ┌────────────────────────────────────────────────────┐  │
│  │            React (Vite) SPA  — :5173               │  │
│  │  /login  /register  /tasks  /tasks/:id             │  │
│  └───────────────────┬────────────────────────────────┘  │
└──────────────────────┼───────────────────────────────────┘
                       │  /api/* （Vite dev proxy）
                       ▼
┌──────────────────────────────────────────────────────────┐
│              Express API Server  — :4000                 │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  auth      │  │  tasks       │  │  middleware      │  │
│  │  routes    │  │  routes      │  │  - jwtVerify     │  │
│  │            │  │              │  │  - errorHandler  │  │
│  └─────┬──────┘  └──────┬───────┘  │  - cors          │  │
│        │                │          └──────────────────┘  │
│        └────────┬───────┘                                │
│                 ▼                                        │
│  ┌──────────────────────────────────────────────────┐    │
│  │           better-sqlite3  (data/app.db)          │    │
│  │     users  ◀── FK ──  tasks                      │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

## 3. 目录结构

```
task_management/
├── backend/                 # Node.js (Express) 服务
│   ├── src/
│   │   ├── db/
│   │   │   ├── index.js     # better-sqlite3 连接与初始化
│   │   │   └── schema.sql   # 建表 SQL（见 docs/db-schema.md）
│   │   ├── middleware/
│   │   │   ├── auth.js      # JWT 校验中间件
│   │   │   └── errorHandler.js
│   │   ├── routes/
│   │   │   ├── auth.js      # /api/auth/*
│   │   │   └── tasks.js     # /api/tasks/*
│   │   ├── controllers/     # 路由处理逻辑（可选拆分）
│   │   ├── utils/
│   │   │   ├── jwt.js       # 签发/验证 token
│   │   │   └── errors.js    # 错误码与工厂函数
│   │   └── server.js        # Express 入口
│   ├── data/                # SQLite 文件目录（运行时生成，.gitignore）
│   ├── package.json
│   └── .env.example
├── frontend/                # React (Vite) 应用
│   ├── src/
│   │   ├── components/       # 复用组件
│   │   ├── pages/            # Login / Register / Tasks
│   │   ├── api/              # 封装 fetch 调用
│   │   ├── hooks/            # 自定义 hooks（useAuth, useTasks）
│   │   ├── context/          # AuthContext
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── vite.config.js       # 含 /api 代理配置
│   └── package.json
├── docs/                    # 架构与契约文档（本目录）
│   ├── architecture.md
│   ├── api-contract.md
│   ├── db-schema.md
│   └── decisions.md
├── TASKS.md
└── prompt.md
```

## 4. 技术选型与版本

| 层 | 技术 | 版本 | 说明 |
|----|------|------|------|
| 前端框架 | React | ^18.3 | 函数组件 + Hooks |
| 前端构建 | Vite | ^5.x | 开发服务器与代理 |
| 前端路由 | react-router-dom | ^6.x | 客户端路由 |
| 后端框架 | Express | ^4.19 | REST API |
| 数据库驱动 | better-sqlite3 | ^11.x | 同步 API，性能优 |
| 认证 | jsonwebtoken | ^9.x | JWT 签发与验证 |
| 密码哈希 | bcryptjs | ^2.4 | 密码加密存储 |
| 参数校验 | （可选）zod / express-validator | latest | 请求体校验 |
| CORS | cors | ^2.8 | 跨域支持 |
| 环境变量 | dotenv | ^16.x | 加载 .env |

> 版本为推荐基线，后端 Agent 在 `package.json` 中以实际安装的兼容版本为准，但大版本不得低于上述。

## 5. 数据模型

### 5.1 User

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER (PK) | 自增主键 |
| email | TEXT (UNIQUE) | 登录邮箱 |
| password_hash | TEXT | bcrypt 哈希，不返回给客户端 |
| name | TEXT | 显示名称 |
| created_at | TEXT | ISO-8601 时间戳 |
| updated_at | TEXT | ISO-8601 时间戳 |

**客户端可见的 User JSON**（不含 password_hash）：

```json
{ "id": 1, "email": "alice@example.com", "name": "Alice", "createdAt": "2026-11-03T08:00:00.000Z", "updatedAt": "2026-11-03T08:00:00.000Z" }
```

### 5.2 Task

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER (PK) | 自增主键 |
| user_id | INTEGER (FK→users.id) | 所属用户，ON DELETE CASCADE |
| title | TEXT | 任务标题，非空 |
| description | TEXT | 任务描述，可空 |
| status | TEXT | 枚举：todo / in_progress / done，默认 todo |
| due_date | TEXT | ISO-8601 截止日期，可空 |
| created_at | TEXT | ISO-8601 创建时间 |
| updated_at | TEXT | ISO-8601 更新时间 |

**客户端 Task JSON**：

```json
{ "id": 1, "userId": 1, "title": "完成设计", "description": "架构与 API", "status": "todo", "dueDate": null, "createdAt": "2026-11-03T08:00:00.000Z", "updatedAt": "2026-11-03T08:00:00.000Z" }
```

> **字段命名约定**：数据库使用 snake_case（`user_id`、`created_at`）；API 返回与前端使用 camelCase（`userId`、`createdAt`）。后端在响应序列化时负责转换。

## 6. 认证流程

```
1. 注册    POST /api/auth/register {email, password, name}
   → 返回 { user, token }
2. 登录    POST /api/auth/login {email, password}
   → 返回 { user, token }
3. 鉴权请求 GET /api/tasks
   Header: Authorization: Bearer <token>
   → 中间件校验 JWT，注入 req.user = { id, email }
4. 过期/无效 → 401 { error: { code: "UNAUTHORIZED", message: "..." } }
```

- JWT payload：`{ id, email }`，签发有效期 7 天。
- 前端将 token 存储于 `localStorage`（key: `taskmgmt_token`），并在每次请求通过拦截器附加 `Authorization` 头。
- 401 时前端清除 token 并跳转登录页。

## 7. 错误处理约定

统一错误响应格式（所有非 2xx 响应必须遵循）：

```json
{ "error": { "code": "ERROR_CODE", "message": "人类可读说明" } }
```

错误码约定：

| code | HTTP | 含义 |
|------|------|------|
| `VALIDATION_ERROR` | 400 | 请求体校验失败 |
| `UNAUTHORIZED` | 401 | 未登录或 token 无效 |
| `FORBIDDEN` | 403 | 无权访问该资源 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `CONFLICT` | 409 | 唯一约束冲突（如邮箱已注册） |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |

- 后端使用统一的 `errorHandler` 中间件捕获错误，确保响应格式一致。
- 后端绝不向客户端泄露堆栈或内部细节（仅 production 模式）。

## 8. CORS 与开发代理策略

### 8.1 开发环境（推荐方案）

前端通过 Vite dev proxy 把 `/api` 请求转发到后端，避免跨域：

**`frontend/vite.config.js`**：

```js
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
```

- 前端开发服务器：`http://localhost:5173`
- 后端 API 服务器：`http://localhost:4000`
- 前端所有请求使用相对路径 `/api/...`，由 proxy 转发。

### 8.2 CORS（后端兜底）

即使开发阶段用 proxy，后端仍应启用 CORS 以支持分离部署：

```js
import cors from 'cors';
app.use(cors({ origin: true, credentials: true }));
```

- 生产环境应将 `origin` 限制为已知前端域名。

## 9. 端口与启动约定

| 服务 | 端口 | 启动命令 |
|------|------|----------|
| 后端 Express | 4000 | `cd backend && npm run dev` |
| 前端 Vite | 5173 | `cd frontend && npm run dev` |

后端监听端口通过 `PORT` 环境变量可覆盖，默认 4000。
