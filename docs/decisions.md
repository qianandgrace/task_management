# 决策记录 (Decision Records)

> 当前后端 Agent 与前端 Agent 在接口上产生分歧或需要协商变更时，必须在本文件追加一条决策记录，说明背景、决策与原因。

## 模板

```markdown
## DR-NNNN — <标题>

- **日期**：YYYY-MM-DD
- **状态**：proposed | accepted | superseded
- **相关方**：<提出方 / 受影响方>

### 背景
<为什么需要做这个决策？遇到了什么问题？>

### 决策
<最终决定了什么？>

### 原因
<为什么选择这个方案？权衡了哪些备选？>

### 影响
<对前后端、文档、数据库的影响及需要同步修改的内容>
```

---

## DR-0001 — 字段命名风格：数据库 snake_case，API/前端 camelCase

- **日期**：2026-11-03
- **状态**：accepted
- **相关方**：前端 Agent、后端 Agent

### 背景
数据库传统使用 snake_case，而 JavaScript/React 生态习惯 camelCase，需明确转换边界以避免接口不一致。

### 决策
数据库列名使用 snake_case（`user_id`、`created_at`、`due_date`）；HTTP 请求/响应 JSON 与前端代码统一使用 camelCase（`userId`、`createdAt`、`dueDate`）。

### 原因
保持各层符合自身生态惯例；转换集中在后端序列化层，边界清晰、单一。

### 影响
后端在每个响应中负责 snake_case → camelCase 转换；前端始终使用 camelCase，无需感知数据库命名。

---

## DR-0002 — 任务状态更新使用独立 PATCH 端点

- **日期**：2026-11-03
- **状态**：accepted
- **相关方**：前端 Agent、后端 Agent

### 背景
任务状态标记是高频操作，需与整体更新（PUT）区分，避免误改其他字段。

### 决策
提供 `PATCH /api/tasks/:id/status`，请求体仅含 `status` 字段。`PUT /api/tasks/:id` 用于整体字段更新。

### 原因
语义清晰；前端状态切换操作只需传一个字段，降低出错概率；符合 REST 局部更新惯例。

### 影响
前端状态切换调用 PATCH 端点；编辑表单调用 PUT 端点。两者均返回完整 Task 资源。

---

## DR-0003 — CORS 收紧为白名单（origin 不再反射任意来源）

- **日期**：2026-11-03
- **状态**：accepted
- **相关方**：后端 Agent

### 背景
代码审查发现 `backend/src/app.js` 使用 `cors({ origin: true, credentials: true })`，即反射任意请求来源。配合 `credentials: true`，任意站点可携带凭据发起跨域请求，存在 CSRF / token 透传风险。`docs/architecture.md` 原规定生产环境应将 origin 限制为已知前端域名。

### 决策
收紧 CORS：origin 通过环境变量 `CORS_ORIGIN` 配置白名单（逗号分隔），缺省值为 `http://localhost:5173`。后端应实现为：

```js
const origins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',');
app.use(cors({
  origin(origin, cb) {
    if (!origin || origins.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
}));
```

### 原因
- 开发阶段已有 Vite proxy 转发 `/api`，前端实际同源请求，收紧 CORS 不影响开发体验。
- 反射任意 origin + credentials 在生产环境是真实攻击面；本地项目也应以安全姿势起步。
- 保留环境变量以便分离部署或预览环境扩展白名单，无需改代码。

### 影响
后端 `app.js` 修改 CORS 配置；`.env.example` 追加 `CORS_ORIGIN=http://localhost:5173`。前端无需改动（仍走 proxy）。
