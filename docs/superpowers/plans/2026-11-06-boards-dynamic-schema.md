# Boards & Dynamic Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付 monday 式动态看板内核——boards/groups/columns/tasks/cells 五表（RLS 只读、RPC-only 写）、8 种列类型校验系统、版本化 `upsert_cell`、starter 看板、最小表格前端。

**Architecture:** 所有写经 SECURITY DEFINER RPC（内鉴权 + 校验 + 版本检查），表上无写策略（默认拒绝直接写）；RLS 读策略用 Foundation 的 `user_organization_ids()` helper；tenant_id 由 BEFORE-INSERT 触发器从父表派生。前端在 Foundation shell 上加看板列表 + 基础表格视图。

**Tech Stack:** Supabase CLI 本地栈（PostgreSQL 15 + pgTAP）、React 18 + TypeScript(strict) + Vite 5 + Vitest + @testing-library/react。

**Spec:** `docs/superpowers/specs/2026-11-05-boards-dynamic-schema-design.md`（子系统 spec，下称"spec"）；平台 spec `docs/superpowers/specs/2026-11-05-team-pm-platform-design.md` §3/§8/§9 为约束来源。

## Global Constraints

- 所有租户级表带 `tenant_id uuid` 列 + **包含 tenant_id 的复合索引**（spec §4）。
- RLS 默认拒绝；五新表**只设 SELECT 策略**，无 INSERT/UPDATE/DELETE 策略；所有写经 SECURITY DEFINER RPC（spec §5.1）。
- SECURITY DEFINER 函数一律 `SET search_path = public, pg_catalog`（00-security §2）。
- 读策略一律 `USING (tenant_id = ANY(SELECT user_organization_ids()))`，不直接 JOIN members（spec §5.6）。
- 错误码（RPC 内 errcode → 前端映射）：`FORBIDDEN` = `'42503'`；`VALIDATION_ERROR` = `'22023'`；`NOT_FOUND` = `'P0002'`；版本冲突**不抛异常**，返回 `ok=false` + 当前值（spec §5.4）。
- DB `snake_case`，API/前端 `camelCase`，转换只在 `frontend/src/api/` 层（DR-0001）。
- 时间戳 `timestamptz`，默认 `now()`；`updated_at` 用 `set_updated_at()` 触发器（0001 已建，复用）。
- 本子系统写操作**无 Edge Function**，客户端直调 RPC（spec §7.4）。
- TypeScript strict、无 `any`；测试红-绿；每 task 末尾 commit。
- 种子用户模式沿用 Foundation pgTAP：`INSERT INTO auth.users(...)` 触发 `handle_new_user` 自动建 profile+org+member(owner)。

## Review Focus

（spec §9 九条中，最可能咬人的五条 + 归属 task；其余四条由对应 task 测试覆盖）

1. **跨租户访问**：org A 成员查 org B 的 boards/columns/tasks/cells → 0 行；直接 INSERT 被拒。→ Task 1 pgTAP。
2. **版本冲突/静默重建**：过期 `expected_version` 或对已删 cell 的写 → `ok=false` + 当前 version/value，绝不静默重建。→ Task 3 pgTAP。
3. **角色越权**：viewer 任何写 RPC、member 删任务/删分组/改列结构 → 42503。→ Task 3/5/6 pgTAP。
4. **tenant_id 伪造**：插入时带假 tenant_id → 触发器覆盖为父表值。→ Task 1 pgTAP。
5. **position 碰撞**：相邻任务间距 < 1e-4 → `move_task` 重排后顺序稳定、无重复 position。→ Task 6 pgTAP。

其余四条覆盖处：主列不可删（Task 5）、跨看板挂 cell → 22023（Task 3）、列类型校验（Task 2）、archived 可见性（Task 4）。

---

### Task 1: 五表 Schema + tenant 触发器 + RLS 只读策略

**Files:**
- Create: `supabase/migrations/0003_boards_tables.sql`
- Test: `supabase/tests/boards_isolation.test.sql`

**Interfaces:**
- Consumes: `user_organization_ids()`、`set_updated_at()`（0001 已建）。
- Produces: 表 `public.boards`、`public.groups`、`public.columns`、`public.tasks`、`public.cells`（列见 spec §4，全部含 `tenant_id`、`created_at`、`updated_at`）；触发器函数 `set_board_tenant_id_on_insert()`（tenant_id := organization_id）、`set_group_tenant_from_board()` / `set_column_tenant_from_board()` / `set_task_tenant_from_board()`（tenant_id := board.organization_id）、`set_cell_tenant_from_task()`（tenant_id := task.tenant_id）；FK：groups/columns/tasks → `boards(id) ON DELETE CASCADE`，cells → `tasks(id)`/`columns(id) ON DELETE CASCADE`，`tasks.group_id` → `groups(id)`（无 cascade，删分组前须移走任务，见 Task 5）；`cells UNIQUE(task_id, column_id)`、`cells.version int not null default 1`；`columns.type CHECK IN ('text','status','date','person','number','select','multiselect','checkbox')`；索引：`idx_boards_tenant(boards.tenant_id)`、`idx_groups_tenant_board(tenant_id, board_id)`、`idx_columns_tenant_board(tenant_id, board_id)`、`idx_tasks_tenant_board(tenant_id, board_id)`、`idx_tasks_tenant_group_pos(tenant_id, group_id, position)`、`idx_cells_tenant_task(tenant_id, task_id)`、`idx_cells_tenant_column(tenant_id, column_id)`；RLS 读策略：boards `USING (tenant_id = ANY(SELECT user_organization_ids()) AND archived_at IS NULL)`，其余四表 `USING (tenant_id = ANY(SELECT user_organization_ids()))`。

- [ ] **Step 1: 写失败的 pgTAP 测试**

`boards_isolation.test.sql`，`SELECT plan(8)`。种子沿用 Foundation 模式（p1/p2 两个 auth.users，触发器各自建 org）。以 superuser 建 o1 的 board b1 + group + column + task + cell（含正确 tenant_id）。断言：
1. p1（authenticated+JWT sub=p1）`SELECT count(*) FROM boards/groups/columns/tasks/cells` 各 = o1 内行数（=1）；
2. p1 显式 `WHERE board_id = b2`（o2 的行，superuser 预插）→ 0 行（五表逐个）；
3. p2 查 b1 相关 → 0 行；
4. anon 查五表 → 0 行；
5. p1 直接 `INSERT INTO public.boards (organization_id, name, created_by)` → throws_ok `'42501'`（无 INSERT 策略）；
6. p1 直接 `UPDATE public.cells SET value=...` → throws_ok `'42501'`；
7. superuser 插 board 时伪造 `tenant_id := o2 的 id` → 实际存 tenant_id = organization_id（触发器覆盖）；
8. boards 读策略不返回 archived 行：superuser 置 `archived_at = now()` → p1 `SELECT count(*) FROM boards WHERE id = b1` = 0。

- [ ] **Step 2: 确认失败**

Run: `supabase db reset && supabase db test`
Expected: FAIL（表不存在）。

- [ ] **Step 3: 实现 `0003_boards_tables.sql`**

按 Interfaces 全量建表 + 触发器 + `set_updated_at` 触发器（每表 `BEFORE UPDATE`）+ 索引 + RLS（`ENABLE ROW LEVEL SECURITY` + 上述 SELECT 策略，命名 `boards_read_via_helper` 等，沿用 0001 风格）。

- [ ] **Step 4: 确认通过**

Run: `supabase db reset && supabase db test`
Expected: PASS（新 8 项 + Foundation 16 项全绿）。

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0003_boards_tables.sql supabase/tests/boards_isolation.test.sql
git commit -m "feat(db): boards/groups/columns/tasks/cells tables with read-only RLS + tenant triggers"
```

---

### Task 2: 列类型校验函数（SQL，安全权威）

**Files:**
- Create: `supabase/migrations/0004_column_validation.sql`
- Test: `supabase/tests/column_validation.test.sql`

**Interfaces:**
- Consumes: 无（纯函数）。
- Produces: `validate_text(p_value jsonb, p_config jsonb) RETURNS void` 等 8 个同签名函数（`person` 额外第三参 `p_org_id uuid`；为统一，全部 8 个签名 `validate_<type>(p_value jsonb, p_config jsonb, p_org_id uuid DEFAULT NULL)`）；派发函数 `validate_cell_value(p_type text, p_value jsonb, p_config jsonb, p_org_id uuid) RETURNS void`——非法时 `RAISE EXCEPTION 'VALIDATION_ERROR: <原因>' USING errcode = '22023'`，合法返回 void。校验规则：value 必须是 jsonb object；`text`: `text` 键为字符串且长度 ≤ 2000（允许空串=清空）；`status`: `label_id` ∈ config.labels[].id；`date`: `iso` 键非空且能 cast 为 timestamptz；`person`: `profile_id` 存在于 `members` 中 `organization_id = p_org_id` 的行；`number`: `num` 是 json number，config.min/max（若设）之内，小数位数 ≤ config.precision（未设则不限）；`select`: `option_id` ∈ config.options[].id；`multiselect`: `option_ids` 为数组且每个 ∈ options、无重复；`checkbox`: `checked` 是 boolean。

- [ ] **Step 1: 写失败的 pgTAP 测试**

`column_validation.test.sql`，`SELECT plan(16)`（8 类型 × 合法/非法各 1）。用 `SELECT throws_ok($$SELECT validate_cell_value('status', '{"label_id":"nope"}'::jsonb, <status config>, NULL)$$, '22023')` 断非法；`SELECT lives_ok(...)` 断合法。status config 用 Task 4 的三态 JSON（见其 Interfaces）。person 的合法例需先种 member（沿用 auth.users 种子）。

- [ ] **Step 2: 确认失败**

Run: `supabase db reset && supabase db test`
Expected: FAIL（函数不存在）。

- [ ] **Step 3: 实现 `0004_column_validation.sql`**

8 个 `validate_<type>` + `validate_cell_value` 派发（CASE p_type 分发，未知 type → 22023）。函数不必 SECURITY DEFINER（person 查 members 需要绕 RLS → 派发函数与 `validate_person` 标 `SECURITY DEFINER SET search_path = public, pg_catalog`，其余 SECURITY INVOKER 即可）。

- [ ] **Step 4: 确认通过**

Run: `supabase db reset && supabase db test`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0004_column_validation.sql supabase/tests/column_validation.test.sql
git commit -m "feat(db): column type validation functions (8 types, server-authoritative)"
```

---

### Task 3: `upsert_cell` + `rename_task` RPC

**Files:**
- Create: `supabase/migrations/0005_board_write_rpcs.sql`（本 task 只写其中两个函数 + 共享 guard，后续 task 追加同文件）

**Files (Test):** `supabase/tests/upsert_cell.test.sql`

**Interfaces:**
- Consumes: Task 1 表、Task 2 `validate_cell_value`。
- Produces（后续 task 依赖的精确签名）:
  - `board_write_guard(p_board_id uuid, p_allowed_roles text[]) RETURNS uuid` — 内部 helper：返回该 board 的 organization_id；caller 角色不在列表或非成员/anon → `RAISE EXCEPTION 'FORBIDDEN' USING errcode='42503'`；board 不存在 → `'P0002'`。`SECURITY DEFINER`。
  - `upsert_cell(p_task_id uuid, p_column_id uuid, p_value jsonb, p_expected_version int) RETURNS TABLE(ok boolean, cell_id uuid, version int, value jsonb)` — 语义：guard(task 的 board, ['owner','admin','member'])；`column.board_id ≠ task.board_id` → 22023；主列（`config->>'is_primary' = 'true'`）→ 42503；`validate_cell_value` → 22023；`p_expected_version = 0` → 仅创建（已存在 → `ok=false` + 现有 id/version/value）；`> 0` → 仅更新（行不存在或 version ≠ → `ok=false` + 当前值，行不存在时 value=null, version=null）；成功 → `ok=true`，version = expected+1（创建为 1），value = p_value。
  - `rename_task(p_task_id uuid, p_name text) RETURNS void` — guard(['owner','admin','member'])；p_name 非空且 ≤ 2000 字符（否则 22023）。

- [ ] **Step 1: 写失败的 pgTAP 测试**

`upsert_cell.test.sql`，`SELECT plan(12)`。种子：p1(owner, org o1) + p3viewer(viewer of o1，复用 Foundation 种子手法) + superuser 预建 board b1（含主列 c_primary 与 status 列 c_status）+ task t1。以 p1 身份（`SET LOCAL ROLE 'authenticated'` + JWT claims，Foundation 模式）调：
1. `upsert_cell(t1, c_status, {label_id:doing}, 0)` → `ok=true, version=1`；
2. 再调 `expected_version=1` 合法值 → `ok=true, version=2`；
3. `expected_version=1`（过期）→ `ok=false` 且返回 version=2、value=刚才写入值；
4. `expected_version=5` 但 cell 不存在（新列 c_text）→ `ok=false, version IS NULL`（无静默重建：断言随后 `SELECT count(*) FROM cells WHERE column_id=c_text` = 0）；
5. 已存在 cell 用 `expected_version=0` → `ok=false`（非重建）；
6. viewer 调 → throws_ok '42503'；anon 调 → throws_ok '42503'；
7. 跨看板：superuser 建 b2 的列 c_other，p1 调 `upsert_cell(t1, c_other, ...)` → 22023；
8. 主列：`upsert_cell(t1, c_primary, {text:'x'}, 0)` → 42503；
9. 非法值：status 未知 label_id → 22023；
10. `rename_task(t1, '新名字')` 以 p1 → lives_ok 且 name 已改；
11. viewer `rename_task` → 42503；
12. p2（他组织 owner）调 `upsert_cell` → 42503。

- [ ] **Step 2: 确认失败**

Run: `supabase db reset && supabase db test`
Expected: FAIL（函数不存在）。

- [ ] **Step 3: 实现（写入 `0005_board_write_rpcs.sql`）**

`board_write_guard` 先行（`SELECT b.organization_id, user_role_in_org(b.organization_id)` 一次查询判断）；`upsert_cell` 用 `INSERT ... ON CONFLICT (task_id, column_id) DO UPDATE SET value=..., version=cells.version+1, updated_at=now() WHERE cells.version = p_expected_version RETURNING`，行返回为空时按创建/更新分支判 `ok=false` 并补查当前值。`rename_task` 直改 `tasks.name`。

- [ ] **Step 4: 确认通过**

Run: `supabase db reset && supabase db test`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0005_board_write_rpcs.sql supabase/tests/upsert_cell.test.sql
git commit -m "feat(db): upsert_cell versioned write path + rename_task with role guard"
```

---

### Task 4: 看板生命周期 RPC（starter 事务 + archive）

**Files:**
- Modify: `supabase/migrations/0005_board_write_rpcs.sql`（追加）
- Test: `supabase/tests/board_lifecycle.test.sql`

**Interfaces:**
- Consumes: `board_write_guard`。
- Produces:
  - `create_board_with_starter(p_organization_id uuid, p_name text) RETURNS TABLE(board_id uuid)` — guard 语义：caller 在该 org 角色 ∈ {owner,admin,member}（对 org 而非 board；member+ 可建，spec §5.8）。单事务内建：board(name=p_name, created_by=auth.uid())、group(name='默认分组', position=1)、主列（name='任务名', type='text', config='{"is_primary":true}'::jsonb, position=1）、状态列（name='状态', type='status', position=2, config=下方固定 JSON）、首任务（name='新任务', group=默认分组, position=1）。
  - 状态列 config 固定值：`{"labels":[{"id":"todo","label":"待处理","color":"#c9cdd4"},{"id":"doing","label":"进行中","color":"#f7b154"},{"id":"done","label":"已完成","color":"#3fb950"}],"default_label_id":"todo"}`
  - `list_boards(p_organization_id uuid) RETURNS TABLE(id uuid, name text, created_at timestamptz)` — caller 须为该 org 任意角色；仅非 archived。
  - `list_archived_boards(p_organization_id uuid)` 同形 — 仅 owner/admin。
  - `archive_board(p_board_id uuid)` / `restore_board(p_board_id uuid)` / `rename_board(p_board_id uuid, p_new_name text)` — `board_write_guard(p_board_id, ['owner','admin'])`。

- [ ] **Step 1: 写失败的 pgTAP 测试**

`board_lifecycle.test.sql`，`SELECT plan(9)`：
1. p1 调 `create_board_with_starter(o1,'项目看板')` → 返回 board_id 非空；
2. 断言五行齐现：board(name)/group('默认分组')/两列（'任务名' is_primary + '状态' 三态 config=固定 JSON）/task('新任务')，且各表 tenant_id = o1；
3. member（种 p4 为 o1 的 member）调 → 成功；
4. viewer 调 → 42503；anon 调 → 42503；
5. p2（他 org）调 `create_board_with_starter(o1,...)` → 42503；
6. `list_boards(o1)` 以 p1 → 含 2 个看板（starter 建 + 种子建）；
7. `archive_board` 以 member → 42503；以 p1(owner) → lives_ok 且 `list_boards` 不含它、`list_archived_boards` 含它；
8. viewer 调 `list_archived_boards` → 42503；
9. `restore_board` 以 owner → 回到 `list_boards`。

- [ ] **Step 2: 确认失败** — Run: `supabase db reset && supabase db test` → FAIL。

- [ ] **Step 3: 实现（追加至 0005）**

`create_board_with_starter` 对 org 的角色检查内联（`user_role_in_org(p_organization_id) IN (...)`，沿用 0002 rename_organization 模式）；五行 INSERT 在同一 plpgsql 事务体中，中途异常整体回滚。

- [ ] **Step 4: 确认通过** — Run: `supabase db reset && supabase db test` → PASS。

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0005_board_write_rpcs.sql supabase/tests/board_lifecycle.test.sql
git commit -m "feat(db): transactional board starter + archive/restore lifecycle RPCs"
```

---

### Task 5: 列与分组结构 RPC

**Files:**
- Modify: `supabase/migrations/0005_board_write_rpcs.sql`（追加）
- Test: `supabase/tests/structural_crud.test.sql`

**Interfaces:**
- Consumes: `board_write_guard`、`validate_cell_value`（config 自检复用规则）。
- Produces:
  - `create_column(p_board_id uuid, p_name text, p_type text, p_config jsonb DEFAULT '{}'::jsonb) RETURNS uuid` — guard ['owner','admin']；p_type ∈ 8 值；config 自检：status/select/multiselect 需非空 labels/options（每项有 id+label，color 可缺省），否则 22023；position = 该 board 现有 max(position)+1。
  - `update_column(p_column_id uuid, p_name text DEFAULT NULL, p_config jsonb DEFAULT NULL) RETURNS void` — guard ['owner','admin']；**不可改 type**；不可把主列 `is_primary` 置 false/移除（22023）；config 走同上自检。
  - `delete_column(p_column_id uuid) RETURNS void` — guard ['owner','admin']；主列 → 42503；级联清 cells（FK cascade 已保证）。
  - `reorder_columns(p_board_id uuid, p_column_ids uuid[]) RETURNS void` — guard ['owner','admin']；数组必须恰含该 board 全部列 id（否则 22023）；按数组序 `position = generate_series(1..n)`。
  - `create_group(p_board_id uuid, p_name text) RETURNS uuid` — guard ['owner','admin','member']；position = max+1。
  - `update_group(p_group_id uuid, p_name text) RETURNS void` — guard ['owner','admin','member']。
  - `delete_group(p_group_id uuid) RETURNS void` — guard ['owner','admin']；**组内仍有任务 → 22023**（不级联删任务；须先移走，spec §4.4 tasks.group_id 无 cascade）。

- [ ] **Step 1: 写失败的 pgTAP 测试**

`structural_crud.test.sql`，`SELECT plan(11)`：
1. owner `create_column` text 列 → 返回 id 且列入表；
2. member `create_column` → 42503；viewer → 42503；
3. `create_column` status 列但 config 空 labels → 22023；
4. `update_column` 改名 → lives_ok；尝试改 type（p_name 相同但直接 UPDATE 不可达——跳过；改 config 把主列 is_primary 移除）→ 22023；
5. owner `delete_column` 普通列 → lives_ok 且其 cells 级联清空（先种 1 cell 断言 0）；
6. `delete_column` 主列 → 42503；
7. `reorder_columns` 乱序数组 → 断言 position 按数组序 1..n；数组缺一列 → 22023；
8. member `create_group` → 成功；viewer → 42503；
9. member `update_group` → 成功；
10. member `delete_group` → 42503；owner 删空组 → 成功；
11. owner 删含任务的组 → 22023。

- [ ] **Step 2: 确认失败** — Run: `supabase db reset && supabase db test` → FAIL。

- [ ] **Step 3: 实现（追加至 0005）** — 按 Interfaces 逐函数；column 定位 board 用 `SELECT board_id FROM columns WHERE id=...` 再 guard。

- [ ] **Step 4: 确认通过** — Run: `supabase db reset && supabase db test` → PASS。

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0005_board_write_rpcs.sql supabase/tests/structural_crud.test.sql
git commit -m "feat(db): column/group structural RPCs with role matrix + primary column guard"
```

---

### Task 6: 任务行 CRUD + `move_task` 重排

**Files:**
- Modify: `supabase/migrations/0005_board_write_rpcs.sql`（追加）
- Test: `supabase/tests/task_crud.test.sql`

**Interfaces:**
- Consumes: `board_write_guard`。
- Produces:
  - `create_task(p_board_id uuid, p_group_id uuid, p_name text) RETURNS TABLE(task_id uuid, position double precision)` — guard ['owner','admin','member']；p_group_id 属于该 board（否则 22023）；name 非空 ≤ 2000；position = 组内 max(position)+1。
  - `delete_task(p_task_id uuid) RETURNS void` — guard ['owner','admin']（**member 不可删**，spec §5/§9.3）。
  - `move_task(p_task_id uuid, p_target_group_id uuid, p_new_position double precision) RETURNS void` — guard ['owner','admin','member']；目标组属同 board（否则 22023）；更新 position；若组内出现 |相邻差| < 1e-4 或重复 → 整组重排：`SELECT id ORDER BY id FOR UPDATE` 锁序（防死锁），按现有 position+id 稳定排序后 `position = row_number()`（步长 1）。

- [ ] **Step 1: 写失败的 pgTAP 测试**

`task_crud.test.sql`，`SELECT plan(8)`：
1. member `create_task` → 成功且 position = max+1；
2. viewer `create_task` → 42503；跨 board 的 group_id → 22023；
3. member `delete_task` → 42503（Review Focus #3 核心断言）；
4. owner `delete_task` → lives_ok；
5. member `move_task`（普通移动到中间）→ 成功、顺序符合预期；
6. 碰撞重排：预种 3 任务 position 1/1.00005/2（人为逼近），move 第 4 个到 1.00001 → 断言全组 position 恰为 1,2,3,4（`array_agg(position ORDER BY position)` 与 `array_agg(position ORDER BY position)` 无重复，用 `SELECT count(DISTINCT position)=count(*)` 且按 position 排的 id 顺序与业务预期一致）；
7. 重复 position（两任务同 position）再 move → 重排后无重复；
8. 跨 board move（目标组属 b2）→ 22023。

- [ ] **Step 2: 确认失败** — Run: `supabase db reset && supabase db test` → FAIL。

- [ ] **Step 3: 实现（追加至 0005）** — 重排算法：更新后检测 `SELECT count(*) FROM (SELECT position, lag(position) OVER (ORDER BY position, id) AS prev FROM tasks WHERE group_id=... ) t WHERE prev IS NOT NULL AND position - prev < 1e-4` > 0 或 `EXISTS duplicate` → 执行整组 row_number 重排。

- [ ] **Step 4: 确认通过** — Run: `supabase db reset && supabase db test` → PASS（此时累计 pgTAP 全绿）。

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0005_board_write_rpcs.sql supabase/tests/task_crud.test.sql
git commit -m "feat(db): task CRUD + move_task with collision-safe group rebalance"
```

---

### Task 7: 前端类型注册表 + API 层

**Files:**
- Create: `frontend/src/types/board.ts`
- Create: `frontend/src/lib/columnTypes/index.ts`（注册表）+ `text.ts`、`status.ts`、`date.ts`、`person.ts`、`number.ts`、`select.ts`、`multiselect.ts`、`checkbox.ts`
- Create: `frontend/src/api/boards.ts`、`frontend/src/api/columns.ts`、`frontend/src/api/groups.ts`、`frontend/src/api/tasks.ts`、`frontend/src/api/cells.ts`
- Test: `frontend/src/lib/columnTypes/columnTypes.test.ts`、`frontend/src/api/cells.test.ts`

**Interfaces:**
- Consumes: `supabase`（`lib/supabaseClient`）；Foundation 的类型风格（`types/index.ts`）。
- Produces（Task 8 依赖的精确签名）:
  - `types/board.ts`：`ColumnType`（8 值联合）、`StatusLabel { id; label; color }`、`SelectOption { id; label; color }`、`ColumnConfig { isPrimary?: boolean; labels?: StatusLabel[]; defaultLabelId?: string; withTime?: boolean; precision?: number; min?: number; max?: number; options?: SelectOption[] }`、`BoardSummary { id; name; createdAt }`、`BoardColumn { id; boardId; name; type: ColumnType; config: ColumnConfig; position: number }`、`TaskGroup { id; boardId; name; position: number; color: string | null }`、`BoardTask { id; boardId; groupId; name; position: number }`、`CellValue`（`{ text?: string } | { labelId?: string } | { iso?: string } | { profileId?: string } | { num?: number } | { optionId?: string } | { optionIds?: string[] } | { checked?: boolean }`）、`Cell { id; taskId; columnId; value: CellValue; version: number }`。
  - `columnTypes`：`interface ColumnTypeDef { type: ColumnType; validate(value: CellValue, config: ColumnConfig): string | null; render(value: CellValue | null, config: ColumnConfig): string }`；`getColumnTypeDef(type: ColumnType): ColumnTypeDef`（8 类型全注册，未知 type throw）。render 语义：null/空值 → ''；status/select/multiselect → 对应 label 文本（逗号连接）；person → profileId 原样（Task 8 由 board 数据解析为名字）；number → String(num)；checkbox → '是'/'否'；date → iso 字符串；text → text。validate 镜像 Task 2 规则（返回错误文案或 null；**仅即时反馈，非安全边界**——spec §5.2）。
  - `api/boards.ts`：`listBoards(organizationId: string): Promise<BoardSummary[]>`、`createBoard(organizationId: string, name: string): Promise<string>`（返回 board_id）、`archiveBoard(boardId: string): Promise<void>`、`restoreBoard(boardId: string): Promise<void>`、`renameBoard(boardId: string, newName: string): Promise<void>`。
  - `api/columns.ts`：`createColumn(boardId: string, name: string, type: ColumnType, config?: ColumnConfig): Promise<string>`、`updateColumn(columnId: string, patch: { name?: string; config?: ColumnConfig }): Promise<void>`、`deleteColumn(columnId: string): Promise<void>`、`reorderColumns(boardId: string, columnIds: string[]): Promise<void>`。
  - `api/groups.ts`：`createGroup(boardId: string, name: string): Promise<string>`、`updateGroup(groupId: string, name: string): Promise<void>`、`deleteGroup(groupId: string): Promise<void>`。
  - `api/tasks.ts`：`createTask(boardId: string, groupId: string, name: string): Promise<{ taskId: string; position: number }>`、`renameTask(taskId: string, name: string): Promise<void>`、`deleteTask(taskId: string): Promise<void>`、`moveTask(taskId: string, targetGroupId: string, newPosition: number): Promise<void>`。
  - `api/cells.ts`：`interface UpsertCellResult { ok: boolean; cellId: string | null; version: number | null; value: CellValue | null }`；`upsertCell(taskId: string, columnId: string, value: CellValue, expectedVersion: number): Promise<UpsertCellResult>`；RPC 错误（errcode 消息含 VALIDATION_ERROR/FORBIDDEN 等）→ throw `Error`，message 保留 code 前缀。
  - 所有 api 函数做 snake→camel 映射（仅此层，规范 11-frontend §3）。

- [ ] **Step 1: 写失败的测试**

`columnTypes.test.ts`：注册表遍历 8 类型断言 `getColumnTypeDef` 非 throw；表驱动每类型 1 合法 + 1 非法 validate（status 未知 labelId → 非 null 错误文案；合法 → null；text 超 2000 → 错误；checkbox 无 checked 键 → 错误）；render 三个代表断言（status → '进行中'；multiselect 两项 → 'A, B'；空值 → ''）。
`cells.test.ts`：mock supabaseClient 的 `rpc` —— ok=true 路径返回映射后的 `UpsertCellResult`；`ok=false` 路径（409 冲突）返回当前 version/value 不 throw。

- [ ] **Step 2: 确认失败**

Run: `cd frontend && npx vitest run src/lib/columnTypes src/api/cells.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现全部文件**

按 Interfaces 精确签名；mock 基建复用 `__mocks__/supabaseClientStub.ts` 手法（vitest `vi.mock`）。

- [ ] **Step 4: 确认通过 + tsc**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: 全 PASS，无类型错误。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/board.ts frontend/src/lib/columnTypes/ frontend/src/api/
git commit -m "feat(frontend): column type registry + boards/columns/groups/tasks/cells api layer"
```

---

### Task 8: 看板列表页 + 基础表格视图（行内编辑 + 409 处理）

**Files:**
- Create: `frontend/src/hooks/useBoard.ts`
- Create: `frontend/src/pages/Boards.tsx`、`frontend/src/pages/Board.tsx`
- Create: `frontend/src/components/board/CellEditor.tsx`（按 type 分发编辑器：text/number 输入框、status/select 下拉、multiselect 多选、date `<input type="datetime-local">`、person 成员下拉、checkbox 勾选）
- Modify: `frontend/src/App.tsx`（加 `<Route path="/boards">` 与 `<Route path="/boards/:boardId">`，仍包 `ProtectedRoute`；`/dashboard` 保留并可加"进入看板"链接）
- Test: `frontend/src/pages/Boards.test.tsx`、`frontend/src/pages/Board.test.tsx`

**Interfaces:**
- Consumes: Task 7 全部 api/columnTypes/types；Foundation `useAuth`、`useOrganizations`（取当前 org 的 role，用于按角色隐藏写按钮：role==='viewer' 隐藏一切写入口；role==='member' 隐藏删任务/删分组/改列结构/归档）、`WorkspaceContext.organizationId`。
- Produces:
  - `useBoard(boardId: string | undefined): { data: BoardData | null; loading: boolean; error: string | null; reload: () => void }`，`BoardData { columns: BoardColumn[]; groups: TaskGroup[]; tasks: BoardTask[]; cells: Cell[] }`——四个 `.select()` 直查（RLS 读放行），按 position 排序，cells 以 `Map<taskId, Map<columnId, Cell>>` 便于取格（导出 helper `cellsByTask(cells): ReadonlyMap<string, ReadonlyMap<string, Cell>>`）。
  - 路由 `/boards`（看板列表：卡片列当前 org 看板 + "新建看板"输入框按钮 + owner/admin 的归档按钮）与 `/boards/:boardId`（表格）。

- [ ] **Step 1: 写失败的组件测试**

`Boards.test.tsx`：mock api/boards —— 渲染两个看板名；点"新建"调 `createBoard` 后 `reload`；viewer 角色不渲染归档按钮。
`Board.test.tsx`：mock `useBoard` 返回固定 `BoardData`（主列+status+number 列，2 任务 2 cell）—— 断言列头按 position 序、主列显示 task.name、status 格显示 '进行中'、number 格显示 '42'、空 cell 显示 ''；行内编辑：点击 text 格变输入框，提交调 `upsertCell` mock 成功后局部更新；`upsertCell` mock 返回 `ok=false`（version=2）→ 显示提示"他人已修改，已载入最新值"且格值更新为返回 value；viewer 不渲染"加列/删行/上移下移"按钮。

- [ ] **Step 2: 确认失败**

Run: `cd frontend && npx vitest run src/pages`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 实现 `useBoard` 与两页**

拖拽重排 v1 用**上移/下移按钮**（不引 dnd 库，spec §10 决策：kanban 拖拽归子系统 4）：上移 = `moveTask(taskId, groupId, (前邻 position + 本 position)/2)`，组顶 = 前邻 position - 1；下移对称。409（ok=false）处理按 Interfaces：提示 + 用返回 version/value 更新本地。

- [ ] **Step 4: 确认通过 + tsc + 全量**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: 全 PASS（Foundation 7 项 + 新增全绿）。

- [ ] **Step 5: 手动冒烟**

Run: `supabase db reset && supabase start`（已起则跳过）→ `cd frontend && npm run dev`。浏览器：登录 → /boards → 新建看板 → 进入看到任务名/状态两列 + 默认分组 + 首任务 → 加 number 列 → 建任务 → 改名、改状态、改 number → 刷新数据仍在。
Expected: 流程通畅；viewer 账号登录无写按钮。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useBoard.ts frontend/src/pages/ frontend/src/components/board/ frontend/src/App.tsx
git commit -m "feat(frontend): boards list + table view with inline editing and conflict handling"
```

---

## 执行说明

- 模型分工（用户 2026-11-06 指定）：**Opus 统领全局**（架构/安全 review、最终 whole-branch review），**Fable 逐 task 实现**；非安全 task review 与 fix-loop 升级可用 Sonnet（沿用 Foundation 分工，用户升级了 Fable）。
- 顺序依赖：Task 1→2→3 严格串行（表→校验→写路径）；Task 4/5/6 依赖 1-3；Task 7 依赖后端 RPC 名（可与 4-6 并行开发但需在 6 合并后联调）；Task 8 最后。
- 全部完成后的 whole-branch review 用 Opus（SDD final-review），再走 finishing-a-development-branch。
