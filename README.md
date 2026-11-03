# 任务管理 Web 应用

React + Node.js + SQLite 的任务管理应用。支持用户注册登录、任务 CRUD、任务状态标记。

由 3 人 Agent 团队协作开发：架构师（Opus，设计架构与 API 契约）、前端（Fable，React）、后端（Fable，Node.js），架构师最终审查。

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + Vite（端口 5173） |
| 后端 | Node.js + Express + better-sqlite3（端口 4000） |
| 数据库 | SQLite |
| 认证 | JWT（Bearer token，7 天有效期）+ bcrypt |

## 目录结构

```
task_management/
├── backend/        # Express + SQLite 服务
├── frontend/       # React + Vite 应用
├── docs/           # 架构与 API 契约（开发依据）
│   ├── architecture.md
│   ├── api-contract.md
│   ├── db-schema.md
│   └── decisions.md
├── TASKS.md        # 共享任务列表与状态日志
└── README.md       # 本文件
```

## 快速开始

### 1. 启动后端

```bash
cd backend
npm install
cp .env.example .env      # 按需修改 JWT_SECRET
npm start                 # 监听 http://localhost:4000
```

环境变量（见 `backend/.env.example`）：
- `PORT` — 后端端口，默认 4000
- `JWT_SECRET` — JWT 签名密钥（生产必须设置强随机值）
- `CORS_ORIGIN` — 允许的前端来源（逗号分隔），默认 `http://localhost:5173`

### 2. 启动前端

```bash
cd frontend
npm install
npm run dev               # 打开 http://localhost:5173
```

前端通过 Vite proxy 把 `/api` 代理到 `http://localhost:4000`，无需额外配置即可联调。

## API 速查

认证端点无需 token；任务端点需 `Authorization: Bearer <token>`。

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/auth/register` | 否 | 注册，返回 `{user, token}`（201） |
| POST | `/api/auth/login` | 否 | 登录，返回 `{user, token}`（200） |
| GET | `/api/tasks?status=` | 是 | 任务列表，可按 `todo/in_progress/done` 过滤（200） |
| POST | `/api/tasks` | 是 | 创建任务（201） |
| GET | `/api/tasks/:id` | 是 | 任务详情（200） |
| PUT | `/api/tasks/:id` | 是 | 整体更新（200） |
| PATCH | `/api/tasks/:id/status` | 是 | 仅更新状态（200） |
| DELETE | `/api/tasks/:id` | 是 | 删除（204） |

统一错误格式：`{ "error": { "code", "message" } }`，错误码 `VALIDATION_ERROR(400)` / `UNAUTHORIZED(401)` / `FORBIDDEN(403)` / `NOT_FOUND(404)` / `CONFLICT(409)` / `INTERNAL_ERROR(500)`。

完整契约见 `docs/api-contract.md`，数据模型见 `docs/db-schema.md`。

## 文档

- `docs/architecture.md` — 系统架构、组件关系、目录结构、认证流程
- `docs/api-contract.md` — 端点完整定义（唯一真相源）
- `docs/db-schema.md` — SQLite 建表 SQL
- `docs/decisions.md` — 决策记录（DR-0001~0003）

## 已知限制（非阻塞，见 `docs/decisions.md` 与架构师审查记录）

- 无 `GET /api/auth/me`：刷新页面后登录态不保留（token 仍在 localStorage，但需重新登录才能恢复用户信息）。
- `JWT_SECRET` 缺省有开发回退值，生产环境必须设置。
- `?status=`（空字符串）会返回 400；前端不会触发。
