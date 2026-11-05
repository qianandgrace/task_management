---
globs:
  - "supabase/migrations/**/*.sql"
  - "supabase/functions/**/*.ts"
---
# 12-backend.md — 后端规范

> Supabase（Postgres + Auth + RLS + Realtime + Edge Functions/Deno）。spec §3、§5、§9。旧 `backend/` Express 服务退役。

## 1. 迁移

- 迁移放 `supabase/migrations/`，文件顺序编号：`0001_<name>.sql`、`0002_<name>.sql`，幂等可重放。
- 建表用 `CREATE TABLE IF NOT EXISTS`；改表用 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 等。
- 经 `supabase db push` 应用；schema 权威由迁移文件累积，不手改库。

## 2. 租户级表

- 每张租户级表带 `tenant_id uuid`（= organization id）列，并建**包含 `tenant_id` 的复合索引**（查询必先按租户过滤）。
- 时间戳列用 `timestamptz`，默认 `now()`；`created_at`、`updated_at` 列标配。
- `updated_at` 用触发器自动更新（见 §4），不用应用层维护。

## 3. RLS

- 每张租户级表 `ENABLE ROW LEVEL SECURITY`，默认拒绝。
- 读/写策略基于 `tenant_id` 与 `members`（用户属此 org 的成员关系）。
- 写策略必须带 `with check`，确保新行/更新行归属正确租户。
- 角色权限矩阵（spec §9.3）由 RLS 策略与 Edge Function 鉴权共同执行：owner/admin 全权、member 有限写、viewer 全只读。

## 4. 触发器与函数命名

- `snake_case`，语义前缀：
  - `handle_<event>`（如 `handle_new_user`：`auth.users` insert 时建 `profiles` + `organizations` + `members(owner)`，spec §9.6）。
  - `set_updated_at`：AFTER UPDATE 自动刷新 `updated_at`。
  - `user_organization_ids`、`<entity>_ids` 等辅助函数：返回当前用户可访问的组织 id 集合，供 RLS 策略调用。
- 需绕过 RLS 的触发器/函数遵守 `.claude/rules/00-security.md` §2（`SECURITY DEFINER` + 固定 `search_path` + 最小权限 owner）。

## 5. Edge Functions（Deno）

- 放 `supabase/functions/<name>/index.ts`，每 function 一个目录。
- Deno TypeScript；从请求头读 JWT 校验身份；业务逻辑优先委托 Postgres RPC。
- 错误响应遵循 `.claude/rules/10-api.md`。

## 6. 时间戳

- 一律 `timestamptz`，默认 `now()`，ISO-8601 UTC。
- 弃用旧 SQLite 的 TEXT 时间戳。

## 7. Supabase 项目布局

```
supabase/
├── config.toml          # 本地栈配置（含 CORS、Auth、Realtime）
├── migrations/          # 0001_*.sql 顺序迁移
├── functions/           # Edge Functions（<name>/index.ts）
└── tests/               # pgTAP 测试（见 20-testing.md）
```
