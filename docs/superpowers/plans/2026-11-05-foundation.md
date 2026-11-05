# Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建团队协作平台的多租户地基——规范目录、Supabase 项目、organizations/members/profiles 基线 schema + RLS、认证与 workspace 成员、可登录的前端 shell——使后续子系统（看板、实时、视图等）都能在其上构建。

**Architecture:** 弃用现有 Express+SQLite 单用户后端。采用 Supabase（托管 Postgres + Auth + Realtime + Edge Functions/Deno）。多租户用共享 Postgres + `tenant_id` + RLS 隔离。前端从 JS/JSX 迁移到 React+TypeScript。本计划只产出地基：能注册/登录、自动创建个人 workspace、切换/列出 workspace、RLS 保证跨组织不可见。

**Tech Stack:** Supabase CLI（本地 `supabase start` 栈）、PostgreSQL 15+、pgTAP、Deno（Edge Functions）、React 18、TypeScript 5、Vite 5、Vitest、@testing-library/react、@supabase/supabase-js。

**Spec:** `docs/superpowers/specs/2026-11-05-team-pm-platform-design.md`

## Global Constraints

（源自 spec §3，逐条适用每个 task）
- 数据库 PostgreSQL 15+（经 Supabase）；所有租户级表带 `tenant_id` 列 + 复合索引。
- 多租户隔离用 RLS，每张租户级表有 `tenant_id` 策略；应用层不得作为唯一隔离。
- 认证用 Supabase Auth；弃用 Express+jsonwebtoken+bcryptjs。
- 字段命名：DB `snake_case`，API/前端 `camelCase`；转换在序列化层。
- 时间戳 `timestamptz`，ISO-8601 UTC。
- 错误响应：`{ "error": { "code": "ERROR_CODE", "message": "..." } }`。
- 前端 React 18 + Vite 5 + TypeScript；现有 JS/JSX 被替换。
- 目标量级几千用户，不做分库分表。
- 安全：CORS 白名单、密钥走环境变量、RLS 默认拒绝。

## Review Focus

（本计划代码隐含、但需显式测试的输入/失败模式）
1. **跨租户访问**：成员查询越过应用层直达其他组织行 → RLS 必须挡住。→ Task 2 pgTAP。
2. **未登录访问受保护资源**：前端直接访问 `/workspaces` → 重定向登录。→ Task 4。
3. **viewer 角色越权写**：viewer 调写操作 → 拒绝。→ Task 3。
4. **注册后无 workspace（孤立账号）**：新用户无组织 → 无法进入主界面。→ Task 3 signup 触发器。
5. **token 过期后仍发请求**：401 未清理会话 → 卡死。→ Task 4。

---

### Task 1: 规范目录与项目脚手架

**Files:**
- Create: `CLAUDE.md`
- Create: `.claude/rules/00-security.md`, `.claude/rules/01-coding-style.md`, `.claude/rules/10-api.md`, `.claude/rules/11-frontend.md`, `.claude/rules/12-backend.md`, `.claude/rules/20-testing.md`
- Create: `supabase/config.toml`（`supabase init` 生成后按需调整）
- Create: `supabase/migrations/`（目录占位，Task 2 起填入）
- Create: `supabase/functions/`（目录占位）
- Create: `supabase/tests/`（pgTAP 测试目录）
- Modify: `frontend/` → TypeScript（`tsconfig.json`, `tsconfig.node.json`，`src/**/*.{ts,tsx}`，`vite.config.ts`）
- Create: `frontend/vitest.config.ts`, `frontend/src/test/setup.ts`
- Modify: `frontend/package.json`（加 `typescript`、`vitest`、`@testing-library/react`、`@testing-library/jest-dom`、`jsdom`、`@supabase/supabase-js` dev/runtime deps）

**Interfaces:**
- Consumes: 现有 `docs/architecture.md`、`docs/api-contract.md`、`docs/db-schema.md`、`docs/decisions.md`（作为规范提炼来源）。
- Produces: `CLAUDE.md` 作为项目入口、`rules/` 作为分层规范、可运行的本地 Supabase 栈与 Vitest。后续 task 假定 `supabase start` 可用、`npm test`（vitest）可用。

- [ ] **Step 1: 写规范文件**

  从现有 `docs/` 提炼，补充 Supabase/RLS/TS 新约定：
  - `CLAUDE.md`：项目概述（产品形态、技术栈、目录结构、规范索引指向 `rules/`、本地开发用 `supabase start` + `npm run dev`）。
  - `rules/00-security.md`：RLS 默认拒绝、`tenant_id` 策略、CORS 白名单、密钥走 env、Supabase Auth JWT、明文密码绝不入库。
  - `rules/01-coding-style.md`：TypeScript strict、文件单一职责、DB `snake_case`/前端 `camelCase`、命名约定。
  - `rules/10-api.md`：Edge Function/RPC 错误形状 `{error:{code,message}}`、状态码、camelCase、ISO-8601、分页约定。
  - `rules/11-frontend.md`：`src/{api,components,hooks,context,pages,views,lib}` 分层、Supabase 客户端单例、hooks 封装数据访问。
  - `rules/12-backend.md`：迁移幂等、`tenant_id` 全表、RLS 每表、Edge Function Deno 风格、触发器/函数命名。
  - `rules/20-testing.md`：pgTAP（`supabase db test`）测 RLS、Vitest 测前端、集成测试对本地栈、TDD 红-绿。

- [ ] **Step 2: 校验规范文件存在且 CLAUDE.md 引用 rules/**

  Run: `ls CLAUDE.md .claude/rules/00-security.md .claude/rules/01-coding-style.md .claude/rules/10-api.md .claude/rules/11-frontend.md .claude/rules/12-backend.md .claude/rules/20-testing.md`
  Expected: 全部存在。再 `grep -c "rules/" CLAUDE.md` → ≥1。

- [ ] **Step 3: 初始化 Supabase 项目**

  Run: `supabase init`（在仓库根）。生成 `supabase/config.toml`、`supabase/migrations/`、`supabase/functions/`。保留默认，确认 `supabase/tests/` 存在（无则建）。

- [ ] **Step 4: 前端迁移到 TypeScript + 装 Vitest**

  `frontend/` 加 `tsconfig.json`（strict）、`tsconfig.node.json`；现有 `.jsx` 改 `.tsx` 并补类型（本步只搭骨架，业务组件类型在 Task 4 细化）。`package.json` 加依赖：`typescript`、`@supabase/supabase-js`、dev：`vitest`、`@testing-library/react`、`@testing-library/jest-dom`、`jsdom`、`@types/react`、`@types/react-dom`。建 `vitest.config.ts`（environment: jsdom）与 `src/test/setup.ts`（import '@testing-library/jest-dom'）。`npm install`。

- [ ] **Step 5: 校验栈可运行**

  Run: `supabase start`（需本地 Docker；若在阿里云构建参见 China mirrors 记忆，本步为本地开发）→ 堆栈健康。
  Run: `cd frontend && npx tsc --noEmit && npx vitest run`
  Expected: tsc 无错误（空测试集也算通过）；vitest 退出码 0。

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md rules/ supabase/ frontend/
git commit -m "chore: scaffold Supabase project, TypeScript frontend, rules/ conventions"
```

---

### Task 2: 多租户基线 Schema + RLS（organizations / members / profiles）

**Files:**
- Create: `supabase/migrations/0001_init_tenant_schema.sql`
- Create: `supabase/tests/tenant_isolation.test.sql`（pgTAP）

**Interfaces:**
- Consumes: Task 1 的 Supabase 栈。
- Produces: 表 `public.profiles`（`id uuid PK ↔ auth.users.id`、`email text`、`name text`、`created_at/updated_at timestamptz`）、`public.organizations`（`id uuid PK default gen_random_uuid()`、`name text`、`owner_id uuid → profiles.id`、`created_at timestamptz`）、`public.members`（`id uuid PK`、`organization_id uuid → organizations.id`、`profile_id uuid → profiles.id`、`role text CHECK in ('owner','admin','member','viewer')`、`created_at timestamptz`，UNIQUE(`organization_id`,`profile_id`)）。每张租户级表含 `tenant_id`（= `organization_id`）并启用 RLS。后续子系统计划假定这些表与 `tenant_id` 约定存在。

- [ ] **Step 1: 写失败的 pgTAP 测试**

  `supabase/tests/tenant_isolation.test.sql`：建两个组织 o1/o2，各一个 owner profile p1/p2，各插一条 `members`。以 p1 身份（`set local role` + `request.jwt.claims` 注入 `sub=p1`）查询 `members` → 只见 o1 的行，不见 o2。断言 `assert_eq(1, count)` 且该行 `organization_id=o1`。再以未登录（anon）查询 → 0 行。

- [ ] **Step 2: 运行测试确认失败**

  Run: `supabase db reset && supabase db test`
  Expected: FAIL（表不存在 / RLS 未启用 → 跨组织行可见或报错）。

- [ ] **Step 3: 实现迁移 `0001_init_tenant_schema.sql`**

  建 `profiles`、`organizations`、`members` 三表（字段如 Interfaces）；`members` 与后续所有租户级表加 `tenant_id uuid` 列 + `CHECK(tenant_id is not null)`；建索引 `idx_members_tenant on members(tenant_id)` 等；启用 `alter table ... enable row level security`；策略：
  - `members`：`using ( organization_id in ( select organization_id from members m2 where m2.profile_id = auth.uid() ) )` with check 同。
  - `organizations`：`using ( id in ( select organization_id from members where profile_id = auth.uid() ) )`。
  - `profiles`：`using ( id = auth.uid() )`（用户只读自己 profile）。
  加 `updated_at` 触发器函数 `set_updated_at()`（沿用现有触发器思路，timestamptz 版）。

- [ ] **Step 4: 运行测试确认通过**

  Run: `supabase db reset && supabase db test`
  Expected: PASS（p1 只见 o1 行；anon 0 行）。

- [ ] **Step 5: 加 Review Focus #1 的边界测试**

  在测试文件追加：以 p1 身份 `select * from organizations` → 只见 o1；`select * from members where organization_id = o2` → 0 行（即使显式查别家）。断言 `assert_eq(0, ...)`。

- [ ] **Step 6: 运行全部测试**

  Run: `supabase db test`
  Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0001_init_tenant_schema.sql supabase/tests/tenant_isolation.test.sql
git commit -m "feat(db): multi-tenant base schema with RLS isolation"
```

---

### Task 3: 认证与 Workspace 成员（注册自动建组织 + 邀请）

**Files:**
- Create: `supabase/migrations/0002_auth_workspace.sql`（触发器 + RPC）
- Create: `supabase/tests/auth_workspace.test.sql`（pgTAP）
- Create: `supabase/functions/invite-member/index.ts`（Deno Edge Function）

**Interfaces:**
- Consumes: Task 2 的 `profiles`/`organizations`/`members`。
- Produces:
  - 触发器：新 `auth.users` 插入后自动建 `profiles` 行 + 一个个人 `organizations` 行 + `members(role='owner')` 行。
  - SQL RPC `list_my_organizations()` → 返回当前用户所属组织（camelCase 经视图序列化）。
  - Edge Function `POST /invite-member` `{ organizationId, email, role }` → 在目标组织内创建/关联 member；调用者须为该组织 owner/admin（RPC 内校验 + RLS 兜底）。
  后续子系统假定 `auth.uid()` 与 `members` 可解析当前用户在选中组织的角色。

- [ ] **Step 1: 写失败的测试**

  `supabase/tests/auth_workspace.test.sql`：
  - 插入 `auth.users`（测试用 `insert into auth.users(id, email)` 模拟）→ 断言 `profiles` 有一行、`organizations` 有一行且 `owner_id`=该用户、`members` 有一行 `role='owner'`（Review Focus #4：注册后无孤立账号）。
  - 邀请：以 owner 身份调 `list_my_organizations()` → 含其组织；以另一用户 p2 调 `list_my_organizations()` → 不含 o1（Review Focus #1 兜底）。
  - 角色越权：把 p2 作为 viewer 加入 o1，再以 p2 调一个写 RPC（如 `rename_organization(o1, 'x')`，仅 owner/admin 可调）→ 抛权限错误（Review Focus #3）。

- [ ] **Step 2: 运行测试确认失败**

  Run: `supabase db reset && supabase db test`
  Expected: FAIL（触发器/RPC 不存在）。

- [ ] **Step 3: 实现迁移 `0002_auth_workspace.sql`**

  - 函数 `handle_new_user()`：`insert into profiles(id,email) values(new.id, new.email)`；建 organization（name = name or email's local-part）；建 member(owner)。
  - 触发器 `on auth.users after insert execute handle_new_user()`。
  - `list_my_organizations()`：`select o.id, o.name, o.created_at from organizations o join members m on m.organization_id=o.id where m.profile_id=auth.uid()`（security definer 或靠 RLS）。
  - `rename_organization(org_id uuid, new_name text)`：内部 `select 1 from members where organization_id=org_id and profile_id=auth.uid() and role in ('owner','admin')`，无则 `raise exception 'FORBIDDEN'`；有则 update。viewer 调用抛错。

- [ ] **Step 4: 运行测试确认通过**

  Run: `supabase db reset && supabase db test`
  Expected: PASS。

- [ ] **Step 5: 实现 Edge Function `invite-member/index.ts`**

  Deno：从 `Authorization: Bearer` 取 JWT；用 `supabase-admin`（service role 仅限校验调用者角色）查调用者在 `organizationId` 的 role；须 owner/admin；否则返回 `{ "error": { "code": "FORBIDDEN", "message": "无权邀请成员" } }`，HTTP 403。校验通过则 `insert into members`（若目标用户不存在则先建 profile 占位 / 或返回待接受邀请，本计划简化为：用户须已注册）。
  - 校验 `role` ∈ 四值；`email` 合法；返回 `{ member }` camelCase 或错误形状。

- [ ] **Step 6: 加 Edge Function 集成测试（手动 / curl 脚本）**

  Run: `supabase functions serve`；用两个测试 JWT（owner、 outsider）各调一次 `POST /invite-member`。
  Expected: owner 调 → 200 + `{member}`；outsider 调 → 403 + 错误形状。

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0002_auth_workspace.sql supabase/tests/auth_workspace.test.sql supabase/functions/invite-member/
git commit -m "feat(auth): auto workspace on signup + invite-member with role enforcement"
```

---

### Task 4: 前端 Shell（TS + Supabase 客户端 + 认证 + Workspace 切换）

**Files:**
- Modify: `frontend/src/main.tsx`、`frontend/src/App.tsx`
- Create: `frontend/src/lib/supabaseClient.ts`
- Create: `frontend/src/context/AuthContext.tsx`、`frontend/src/hooks/useAuth.ts`
- Create: `frontend/src/api/auth.ts`、`frontend/src/api/organizations.ts`
- Create: `frontend/src/components/ProtectedRoute.tsx`（TS 重写）
- Create: `frontend/src/pages/Login.tsx`、`frontend/src/pages/Register.tsx`、`frontend/src/pages/Dashboard.tsx`
- Create: `frontend/src/components/WorkspaceSwitcher.tsx`
- Test: `frontend/src/context/AuthContext.test.tsx`、`frontend/src/components/ProtectedRoute.test.tsx`、`frontend/src/pages/Dashboard.test.tsx`

**Interfaces:**
- Consumes: Task 3 的 Supabase Auth、`list_my_organizations()` RPC、Edge Function。
- Produces: `supabaseClient`（单例，读 `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`）；`AuthContext` 提供 `{ user, profile, loading, signIn, signUp, signOut }`；`useAuth()`；`ProtectedRoute`；`WorkspaceSwitcher`（列出组织、切换当前 `organizationId`）。后续子系统计划假定 `useAuth()` 与当前 `organizationId` 可用。

- [ ] **Step 1: 写失败的 ProtectedRoute 测试**

  `ProtectedRoute.test.tsx`：渲染 `<ProtectedRoute><div>secret</div></ProtectedRoute>`，`useAuth()` 返回 `loading:false, user:null` → 断言不渲染 `secret` 且 `Navigate` 到 `/login`（Review Focus #2：未登录访问受保护资源）。

- [ ] **Step 2: 运行测试确认失败**

  Run: `cd frontend && npx vitest run src/components/ProtectedRoute.test.tsx`
  Expected: FAIL（组件不存在）。

- [ ] **Step 3: 实现 `supabaseClient.ts` 与 `AuthContext.tsx`**

  `supabaseClient`：`createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)`。
  `AuthContext`：`onAuthStateChange` 订阅；`user`/`profile`（profile 经 RPC/表查）；`signIn(email,password)`→`supabase.auth.signInWithPassword`；`signUp`→`signUp`；`signOut`。监听到 `SIGNED_OUT` 清状态。**Review Focus #5**：封装一个 fetch 拦截——所有 `api/*` 经统一封装，遇 401 自动 `signOut` 并跳 `/login`（在 `api/fetch.ts` 实现）。

- [ ] **Step 4: 实现 `ProtectedRoute.tsx`**

  `const { user, loading } = useAuth(); if (loading) return <Loader/>; if (!user) return <Navigate to="/login" replace/>; return children;`

- [ ] **Step 5: 运行 ProtectedRoute 测试确认通过**

  Run: `cd frontend && npx vitest run src/components/ProtectedRoute.test.tsx`
  Expected: PASS。

- [ ] **Step 6: 写 AuthContext 401 测试并实现 `api/fetch.ts`**

  `AuthContext.test.tsx`：mock supabase 客户端；模拟一次 api 调用返回 401 → 断言 `signOut` 被调用、状态清空（Review Focus #5）。
  实现 `api/fetch.ts`：包装 `fetch`，附加 `Authorization`，401 时调 `supabase.auth.signOut()` 并 `window.location='/login'`。

- [ ] **Step 7: 运行测试确认通过**

  Run: `cd frontend && npx vitest run`
  Expected: PASS。

- [ ] **Step 8: 实现 Login / Register / Dashboard / WorkspaceSwitcher**

  - `Login`/`Register`：调 `useAuth().signIn/signUp`，成功后 `/dashboard`。
  - `organizations.ts`：`listMyOrganizations()` → RPC `list_my_organizations`。
  - `WorkspaceSwitcher`：列出组织，`onChange` 设置当前 `organizationId`（存 localStorage + context）。
  - `Dashboard`：受保护页，显示当前 workspace 名 + 空状态"暂无看板"（看板在下一子系统计划实现）。

- [ ] **Step 9: 写 Dashboard 测试**

  `Dashboard.test.tsx`：mock `useAuth` 返回已登录 + 一个组织 → 断言渲染组织名与"暂无看板"空状态。

- [ ] **Step 10: 运行测试 + tsc**

  Run: `cd frontend && npx tsc --noEmit && npx vitest run`
  Expected: 全 PASS，无类型错误。

- [ ] **Step 11: 手动冒烟**

  Run: `supabase start`（已起）+ `supabase functions serve` + `cd frontend && npm run dev`。浏览器注册 → 自动进 dashboard 见个人 workspace → 切换 workspace（只有一个也可见 UI）。
  Expected: 流程通畅。

- [ ] **Step 12: Commit**

```bash
git add frontend/
git rm -r --cached frontend/src/App.jsx frontend/src/main.jsx 2>/dev/null || true
git commit -m "feat(frontend): TS shell with Supabase auth, workspace switcher, protected routes"
```

---

## 执行说明

本计划是 6 个子系统计划的第 1 个（见 spec §7）。完成并合并后，再依次编写并执行：Boards & Dynamic Schema、Realtime & CRDT、Views、Updates/Comments/Notifications、Search/Filter/Sort。
