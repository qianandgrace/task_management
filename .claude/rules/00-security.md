---
globs:
  - "**/*"
---
# 00-security.md — 安全规则（全局）

> 所有子系统、所有 task 必须遵守。权威来源：spec §3 全局约束、§9 builder-check 决议。

## 1. 多租户隔离：Row-Level Security

- **RLS 默认拒绝**：每张租户级表必须 `ENABLE ROW LEVEL SECURITY`，无显式策略即不可访问。
- **`tenant_id` 列**：每张租户级表必须带 `tenant_id uuid` 列（= organization id）并建包含 `tenant_id` 的复合索引。
- **应用层不得作唯一隔离手段**：跨租户隔离由数据库 RLS 兜底，应用层 `WHERE tenant_id = ...` 只是优化、不是安全边界。即使应用层漏过滤，RLS 也必须阻止跨租户读写。
- 写策略必须带 `with check`，确保新行/更新后的行归属正确租户。

## 2. 触发器 / RPC 函数绕过 RLS

- 触发器或 RPC 函数若需在 RLS 之下引导数据（如 `handle_new_user` 在 `auth.users` insert 时建 `profiles` + `organizations` + `members`），必须：
  - 声明 `SECURITY DEFINER`；
  - 固定 `search_path`（如 `SET search_path = public`），防 search_path 劫持；
  - 以最小权限 role 作为 owner，不用 superuser/service role（见 spec §9.6 `handle_new_user` 与 §9.5 Realtime 鉴权；RLS bypass 仅限受控 bootstrap，pre-flight R1/R2 裁定）。
- 此类函数仅用于注册引导等受控路径，不得泛化为绕过 RLS 的通用通道。

## 3. 认证

- 认证走 **Supabase Auth（JWT + 刷新）**。明文密码绝不入库、绝不进日志；密码哈希由 Supabase Auth 托管（bcrypt），应用层不接触。
- 弃用旧 Express + jsonwebtoken + bcryptjs 自建认证。
- **v1 关闭邮件验证**（验证期提速，spec §9.6）：`handle_new_user()` 在 `auth.users` insert 时即建 `profiles` + 个人 `organizations` + `members(owner)`，保证注册后无孤立账号。正式上线前在 Supabase Auth 配置开启邮件验证。

## 4. CORS 白名单

- CORS origin 收紧为白名单（沿用 DR-0003 思路），由 Supabase 配置（`supabase/config.toml` 或 Edge Function 中间件）实现，不反射任意来源。
- 本地开发缺省白名单 `http://localhost:5173`；生产环境白名单通过环境变量配置。

## 5. 密钥与环境变量

- 所有密钥（Supabase service role key、Anon key 视场景、第三方 secret、JWT secret）走环境变量，**绝不入库、绝不进前端 bundle**。
- 仅非敏感公钥可用 `VITE_` 前缀暴露给前端（如 Supabase Anon key + Project URL）；`VITE_` 前缀不得用于任何敏感值。
- `.env` 不入库；`.env.example` 仅含占位符。

## 6. Realtime 频道授权（安全敏感，spec §9.5）

Supabase broadcast / presence **不受 RLS 保护**，必须显式鉴权：

- **频道命名约定**：`board:{board_id}`、`org:{organization_id}`。
- **join 鉴权**：Edge Function `/realtime-authorize` 校验 JWT + 该用户 `members` 属此 board 的组织，否则拒绝加入。
- **presence**：走一张 RLS 保护的 `presence` 表（`profile_id`、`channel`、`last_seen`），**不**用裸 broadcast presence。
- **cell 数据广播**：用 `postgres_changes`（RLS 兜底），**不**用裸 broadcast 传业务数据。

跨租户频道泄漏是 Anti-Goal（spec §2），Realtime 授权是重点 review 项。
