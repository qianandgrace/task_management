---
globs:
  - "frontend/src/**/*.{ts,tsx}"
---
# 11-frontend.md — 前端规范

> React 18 + Vite 5 + TypeScript。spec §3、§5。旧 `frontend/` JS/JSX 代码被替换为 TS/TSX。

## 1. 组件与 Hooks

- React 18 **函数组件 + Hooks**，无 class 组件。
- TypeScript strict（见 `.claude/rules/01-coding-style.md`）。
- props 显式标注类型，用 `interface` 或 `type`；不用 `React.FC`（避免隐式 children）。
- react-router-dom 6；受保护路由统一用 `ProtectedRoute` 组件包裹，未登录重定向 `/login`。

## 2. 目录分层（`frontend/src/`）

| 目录 | 职责 |
|------|------|
| `api/` | Supabase 数据访问封装（查询/RPC/订阅），返回类型化结果 |
| `components/` | 可复用 UI 组件 |
| `hooks/` | 自定义 hooks（`useTasks`、`useAuth` 等），消费 `api/` |
| `context/` | React Context（如 `AuthContext`） |
| `pages/` | 路由级页面（`Login`、`Register`、`Dashboard`） |
| `views/` | 看板/表格等业务视图（非路由级） |
| `lib/` | 单例客户端、工具函数、类型定义 |

## 3. Supabase 客户端

- 单例：`lib/supabaseClient.ts` 导出唯一 `SupabaseClient` 实例（用 `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` 初始化）。
- 数据访问封装在 `api/` 与 `hooks/`：**组件不直连 Supabase**，只通过 props/hooks 拿数据。
- snake_case → camelCase 转换集中在 Supabase 客户端序列化层 / `api/` 封装层，组件只见 camelCase。

## 4. 认证与会话

- 会话来自 Supabase Auth（`supabase.auth.getSession()`），存于 `AuthContext`。
- 401 自动登出：`api/fetch.ts`（或 Supabase client 拦截）捕获 401，清会话并跳转 `/login`。
- token 由 Supabase SDK 管理（含刷新），不在应用层手存 `localStorage`。

## 5. 状态管理

- **服务端状态**优先用 Supabase 查询 / `postgres_changes` 订阅，配合 `hooks/` 缓存。
- **本地 UI 状态**用 `useState` / `useReducer` / 自定义 hook。
- 不引入额外全局状态库（Redux 等）除非有明确需求（YAGNI）。

## 6. 其他

- 样式方案由各子系统计划定（v1 可用 CSS Modules / Tailwind），保持一致即可。
- 表单校验在前端先做（字段必填、长度、格式），后端/Edge Function 再兜底。
- 路由懒加载用 `React.lazy` + `Suspense`，按 `pages/` 维度切分。
