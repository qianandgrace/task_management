---
globs:
  - "**/*.{ts,tsx,sql}"
---
# 01-coding-style.md — 编码风格（全局）

> 适用于前端 TypeScript、Edge Function（Deno TS）、SQL 迁移。spec §3 全局约束。

## 1. TypeScript strict

- 前端与 Edge Function 一律 TypeScript，`tsconfig` 启用：
  - `"strict": true`
  - `"noImplicitAny": true`
  - `"strictNullChecks": true`
- 不允许 `any`；确需放宽时用 `unknown` + 类型守卫，并注释原因。
- 不用 `// @ts-ignore`；如必须抑制，用 `// @ts-expect-error` 并附原因。

## 2. 命名约定（DR-0001 沿用）

| 层 | 风格 | 示例 |
|----|------|------|
| 数据库（表/列/函数/触发器） | `snake_case` | `tenant_id`、`created_at`、`handle_new_user` |
| API 请求/响应 JSON 字段 | `camelCase` | `userId`、`createdAt`、`dueDate` |
| 前端变量/函数 | `camelCase` | `useTasks`、`fetchTasks` |
| 类型 / 接口 / React 组件 | `PascalCase` | `Task`、`BoardCard`、`ProtectedRoute` |

- snake_case → camelCase 转换发生在 Supabase 客户端序列化层 / Edge Function 响应层，边界单一、不在组件内手转。

## 3. 文件组织

- 文件单一职责、小而聚焦；一个文件一个主要导出（组件/hooks/类型 可有附属导出）。
- 前端目录分层见 `.claude/rules/11-frontend.md`；后端目录见 `.claude/rules/12-backend.md`。
- 不为"将来可能用到"创建空文件或占位模块。

## 4. YAGNI / DRY

- 不写未用代码：不提前抽象、不实现 spec/brief 未要求的特性。
- 重复逻辑提炼到 `lib/`（前端）或共享 helper（Edge Function），但仅在确有第二处调用时提炼。
- 注释解释"为什么"，不解释"是什么"（代码本身应可读）。

## 5. 其他

- 不留 `console.log` 调试输出在提交代码中（Edge Function 用结构化日志除外）。
- 文件末尾保留一个换行；行尾不留空格。
- import 顺序：外部依赖 → 内部模块 → 相对路径，分组间空行。
