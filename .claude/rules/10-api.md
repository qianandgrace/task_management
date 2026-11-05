---
globs:
  - "supabase/functions/**/*.ts"
  - "frontend/src/api/**/*.ts"
  - "supabase/migrations/**/*.sql"
---
# 10-api.md — API / Edge Function / RPC 规范

> Edge Function（Deno）与 Postgres RPC 的对外契约。沿用旧 `docs/api-contract.md` 错误形状，补充 Supabase 栈约定。spec §3、§9.4。

## 1. 错误响应统一形状

所有非 2xx 响应体：

```json
{ "error": { "code": "ERROR_CODE", "message": "人类可读说明" } }
```

- 绝不向客户端泄露堆栈或内部细节（生产模式）。
- Edge Function 用统一错误处理 helper 保证形状一致。

## 2. 状态码与错误码

| HTTP | code | 含义 |
|------|------|------|
| 400 | `VALIDATION_ERROR` | 请求体校验失败 |
| 401 | `UNAUTHORIZED` | 未登录 / JWT 无效或过期 |
| 403 | `FORBIDDEN` | 已登录但无权（如 viewer 越权写） |
| 404 | `NOT_FOUND` | 资源不存在 |
| 409 | `CONFLICT` | 唯一约束冲突 |
| 409 | `CONFLICT_VERSION` | 版本冲突（cell 乐观锁，spec §9.4） |
| 500 | `INTERNAL_ERROR` | 服务器内部错误 |

- `CONFLICT_VERSION` 用于 `upsert_cell` RPC：`expected_version` 不匹配时返回，客户端据此刷新/重试。

## 3. 字段与时间戳

- 请求/响应字段统一 **camelCase**（DR-0001）。
- 时间戳一律 ISO-8601 UTC（如 `2026-11-03T08:00:00.000Z`）；DB 层 `timestamptz`。

## 4. Edge Function（Deno）风格

- 放在 `supabase/functions/<name>/index.ts`，每个 function 一个目录。
- 用 Deno 标准 `Deno.serve`；从请求头读 JWT（`Authorization: Bearer <token>`），用 Supabase client 校验用户身份。
- 业务逻辑优先用 Postgres RPC（版本检查、原子写），Edge Function 只做鉴权 + 编排 + 响应整形。
- 函数命名 `kebab-case` 目录（如 `/realtime-authorize`），内部 TS 函数 `camelCase`。

## 5. Postgres RPC

- 用 Postgres function 暴露原子操作（如 `upsert_cell(board_id, task_id, column_id, value, expected_version)`，spec §9.4）。
- RPC 函数命名 `snake_case`，参数命名 `snake_case`。
- 需绕过 RLS 的 RPC 遵守 `.claude/rules/00-security.md` §2（`SECURITY DEFINER` + 固定 `search_path` + 最小权限 owner）。
- 返回值在 Edge Function 响应层转 camelCase。

## 6. 列表分页（为后续子系统预留）

- 查询参数：`?page=&pageSize=`（从 1 起）。
- 响应：`{ "items": [...], "total": <number> }`。
- 默认 `pageSize` 由各端点定义，最大上限 100。
