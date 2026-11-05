# Boards & Dynamic Schema — 子系统设计文档

> 本文档是平台设计 `docs/superpowers/specs/2026-11-05-team-pm-platform-design.md`（下称"平台 spec"）第 ② 子系统的细化设计。平台 spec 已定的全局约束、角色矩阵（§9.3）、cell 写入路径（§9.4）、组织级可见（§9.1）、目录/规范约定不在本文重复；本文只记录本子系统在平台 spec 留给实现者（§6）处的细化决策与新增结构。实现计划据此论证。

## 1. Intent & Why

把平台的地基（组织/成员/认证/前端 shell）扩展出**产品核心**：monday 式动态看板——用户在一个看板内自定义列、每行每列一个值、拖拽重排、按角色控制谁能改结构谁能改数据。本子系统产出可工作可测的软件：能建看板、定义列、建任务行、改 cell，并在前端看到一个基础表格。

为什么现在做：地基已合并（commit b62f0b2），下一步产品价值在看板本身。

## 2. Goals / Non-Goals / Anti-Goals

**Goals**
- boards/groups/columns/cells/tasks 五表 + 多租户 RLS。
- 列类型系统：8 种类型，每种 `validate / serialize / render / compare`。
- 任务行 CRUD + `upsert_cell` 版本化写入（409 `CONFLICT_VERSION`）。
- 按角色矩阵（平台 spec §9.3）在 SECURITY DEFINER RPC 内鉴权（RLS 只读兜底）。
- 最小表格前端：看板列表、建看板、打开看板看基础表格（加列/建行/行内改 cell）。

**Non-Goals（本子系统不做）**
- `long_text` 列类型（→ 子系统 3 Realtime & CRDT，届时以 plain text 存储叠加 CRDT）。
- `dependency` 列类型（跨行引用 + 环检测，推迟到后续子系统）。
- 看板视图（按状态列分组的 kanban）、视图切换状态机（→ 子系统 4 Views）。
- 实时广播 / presence / CRDT 共写（→ 子系统 3）。
- 任务级 updates/comments/notifications（→ 子系统 5）。
- 搜索/过滤/排序（→ 子系统 6）。
- "项目"层（看板在组织下平铺，见 §5 my-call）。

**Anti-Goals（沿用平台 spec §2）**
- 跨租户数据泄漏（RLS 数据库层兜底）。
- 拖拽重排出现乱序/丢位。
- viewer 能改任何 cell/列结构/分组。
- cell 写入绕过版本检查或类型校验（脏写/后者覆盖前者）。

## 3. 范围决策（2026-11-05 头脑风暴）

### 3.1 列类型范围
**v1 本子系统交付 8 种自包含类型**：`text`、`status`、`date`、`person`、`number`、`select`、`multiselect`、`checkbox`。每种存储+校验+渲染自包含。
- `long_text` 推迟到子系统 3（其 CRDT 共写在该子系统实现；本子系统不建该列类型）。
- `dependency` 推迟到后续子系统（任务依赖图 + 环检测）。
**理由**：这两种各自拽入本子系统之外的复杂度；先做 8 种让看板闭环可用。

### 3.2 Starter 看板
新建看板自带：
- 一个**不可删的"任务名"文本主列**（行的标签，点击进详情；后续子系统加 updates 面板）。
- 一个"状态"列（`status`，三态：待处理 / 进行中 / 已完成，各带色）。
- 一个"默认分组"（`groups` 行，position=1）。
**理由**：首屏开箱即用，不是空表；与 monday 首屏一致。

### 3.3 前端范围
**后端 + 最小表格前端**。Dashboard 列看板 + 建看板 + 打开看板看到基础表格（加列、建行、行内改 cell）。看板视图 / 视图切换 / 高级表格功能留给子系统 4。
**理由**：每个子系统要产出可工作可测的软件；CRUD 需要一个 UI 才能验证。

## 4. Schema

所有表租户级，带 `tenant_id uuid`（= organization id）+ 复合索引 + RLS。**RLS 仅读策略**（见 §5.1）：所有写经 SECURITY DEFINER RPC，表上不设 INSERT/UPDATE/DELETE 策略，默认拒绝直接写。读策略用 Foundation 的 `user_organization_ids()` / `user_role_in_org()` helper（不直接 JOIN members，避免 RLS-on-RLS 递归）。时间戳 `timestamptz`。`tenant_id` 由 BEFORE-INSERT 触发器从父表派生（见 §5.3），不可由调用者设置。

### 4.1 boards
- `id uuid PK default gen_random_uuid()`
- `organization_id uuid`（= tenant_id）→ `organizations(id)`
- `name text not null`
- `created_by uuid` → `profiles(id)`
- `archived_at timestamptz null`（软删除标记，见 §5）
- `created_at`、`updated_at timestamptz`
- RLS 读：`USING (organization_id = ANY(SELECT user_organization_ids()) AND archived_at IS NULL)`（archived 看板仅 owner/admin 经 `list_archived_boards` RPC 可见，见 §7）。

### 4.2 groups
- `id uuid PK`
- `board_id uuid` → `boards(id) on delete cascade`
- `name text not null`
- `position double precision not null`
- `color text`
- `tenant_id uuid`（触发器派生自 board.organization_id）
- timestamps
- RLS 读：`USING (tenant_id = ANY(SELECT user_organization_ids()))`。

### 4.3 columns
- `id uuid PK`
- `board_id uuid` → `boards(id) on delete cascade`
- `name text not null`
- `type text not null check (type in ('text','status','date','person','number','select','multiselect','checkbox'))`
- `config jsonb not null default '{}'`（类型设置，见 §6）
- `position double precision not null`
- `tenant_id uuid`（触发器派生自 board）
- timestamps
- RLS 读：组织成员可读。
- 主列约束：每个 board 恰好一个 `type='text'` 且 `config.is_primary=true` 的列，不可删（见 §6.1）。由 `create_board_with_starter` 与 `create_column` RPC 共同维护。

### 4.4 tasks
- `id uuid PK`
- `board_id uuid` → `boards(id) on delete cascade`
- `group_id uuid` → `groups(id)`
- `name text not null`（主列值，即行标签）
- `position double precision not null`（组内排序）
- `tenant_id uuid`（触发器派生自 board）
- timestamps
- RLS 读：组织成员可读。写经 RPC（`create_task` / `rename_task` / `move_task` / `delete_task`），RPC 内按角色矩阵鉴权：**member 不能删任务行**（仅 owner/admin，平台 spec §9.3）；viewer 全只读。

### 4.5 cells
- `id uuid PK`
- `task_id uuid` → `tasks(id) on delete cascade`
- `column_id uuid` → `columns(id) on delete cascade`
- `value jsonb not null`
- `version integer not null default 1`（乐观锁）
- `updated_at timestamptz`
- UNIQUE(`task_id`, `column_id`)
- `tenant_id uuid`（触发器派生自 task）
- RLS 读：组织成员可读。**写唯一经 `upsert_cell` RPC**（见 §7.1），表上无写策略 → 无法绕过版本检查与类型校验。

> 主列（"任务名"）的值存在 `tasks.name`，不进 `cells`，避免主列删除导致的空行标签。其余列的值全部进 `cells`。

## 5. My-calls（实现者决议，含 builder-check 决议，标注备查）

### 5.1 写路径：RPC-only，RLS 只读（builder-check Q1）
boards/groups/columns/tasks/cells 五表的 RLS **只设读策略**，不设 INSERT/UPDATE/DELETE 策略（默认拒绝直接写）。所有写经 SECURITY DEFINER RPC（`upsert_cell`、`rename_task`、`create_board_with_starter`、`create_column`/`update_column`/`delete_column`/`reorder_columns`、`create_group`/`update_group`/`delete_group`、`create_task`/`delete_task`/`move_task`、`archive_board`/`rename_board`）。RPC 内做鉴权 + 校验 + 版本检查。**理由**：任何直接写策略都会让客户端 `supabase.from('cells').update(...)` 绕过版本检查与类型校验，正是平台 spec §9.4 RPC 要防的脏写。

### 5.2 校验在 RPC 内，不在 EF（builder-check Q2）
8 个 `validate_<type>(value jsonb, config jsonb)` SQL 函数在迁移中定义，由 `upsert_cell`（SECURITY DEFINER）内部调用。客户端按平台 spec §9.4"比 Edge-Function 中转更轻"**直接调 RPC**（`supabase.rpc('upsert_cell', …)`），故校验必须在服务端；EF 不参与写。pgTAP 直接打 RPC 验校验。前端 TS 的 `validate` 是同一契约的镜像（仅用于即时反馈），**不作为安全边界**。

### 5.3 tenant_id 触发器（builder-check Q3）
groups/columns/tasks/cells 各加 `BEFORE INSERT … set_<table>_tenant_id_on_insert` 触发器，从父表派生 tenant_id（groups/columns/tasks ← board.organization_id；cells ← task.tenant_id）。调用者不能设置 tenant_id。pgTAP 测：伪造 tenant_id 的插入被拒 / 被覆盖为正确值。沿用 Foundation `set_*_tenant_id_on_insert` 模式（0001 已建）。

### 5.4 `upsert_cell` 语义（builder-check Q5/Q8）
- `expected_version = 0` → **仅创建**（cell 已存在则 409 `CONFLICT_VERSION`）。
- `expected_version > 0` → **仅更新**（cell 不存在或 `version ≠ expected` 则 409）。杜绝"对已删 cell 的过期写静默重建"。
- 409 返回 `{ cell_id, version, value }`（含当前值，一步恢复，省一次 refetch）。
- RPC 校验 `column.board_id = task.board_id`（不符 → 400 `VALIDATION_ERROR`），防跨看板挂 cell。
- 签名 `upsert_cell(p_task_id, p_column_id, p_value, p_expected_version)`（board_id 从 task 派生，不进签名）。
- 主列（`config.is_primary`）拒走此路径 → 403，改走 `rename_task`。

### 5.5 Starter 看板 = 单事务 RPC（builder-check Q6）
`create_board_with_starter(p_name)` SECURITY DEFINER RPC：一个事务内建 board + 默认 group + 主列（text, is_primary）+ 状态列（status, 三态 config）+ 首任务行（空 name 占位或首行），返回 `board_id`。pgTAP 断言五行齐现、原子性（中途失败全回滚）。无独立 `create_board` 空看板 RPC（v1 starter 即默认）。

### 5.6 RLS 读策略用 helper（builder-check Q7）
所有新表读策略 `USING (tenant_id = ANY(SELECT user_organization_ids()))`（或 archived 分支），不直接 JOIN members。沿用 Foundation 模式，避免 RLS-on-RLS 递归。

### 5.7 position 重排（builder-check Q9）
浮点 `position`（平台 spec §5）。`move_task` 内：仅当相邻间距 < 阈值（1e-4）时，**同步**重排该 group 全部 tasks，归一化到步长 1；按 task-id 顺序加锁避免死锁。group 超 ~1000 任务再议异步/lexorank。pgTAP 测重排后顺序正确、无重复 position。

### 5.8 其他
- **`cells.value` 用 jsonb**：8 种异构类型共用一列；校验在类型系统层（RPC 内），不在 DB 约束。
- **`columns.config` 用 jsonb**：存类型设置（status 的 labels+colors、select/multiselect 的 options、number 的 precision/decimal、date 的 with_time 等）。
- **`person` 列存单个 `profile_id`**（v1 不做 multiperson）。
- **不加"项目"层**：看板在组织下平铺（平台 spec §7/§9 均无 projects）。后续若需要，加 `projects` 表是纯增量。
- **看板软删除**：`archived_at` 标记，monday 式归档，仅 owner/admin 可 archive/restore；v1 不做硬删除。
- **建看板权限**：member 可建看板（经 `create_board_with_starter`，role 检查允许 member+）；删看板（archive）仅 owner/admin。
- **409 冲突 UX**（本子系统无实时）：前端据 409 返回的当前 value 提示"他人已修改"，用户基于最新值重试。子系统 3 加实时后改为推送刷新。
- **本子系统写操作无 EF**：全 RPC 直调（平台 spec §9.4 倾向如此）。EF 仅在未来出现"需 service-role 编排且不宜进 RPC"的场景才引入。
- **列类型 config 精确边界**（status 色板取值、number 精度/范围默认、select 选项上限、date with_time 默认）留给计划 TDD 步骤确定。

## 6. 列类型系统

每种类型实现四个函数（前端 TS 与后端 SQL 校验共享同一契约；后端 `validate_<type>` SQL 函数是安全权威，前端镜像仅即时反馈）：

| 类型 | value 结构 | validate（RPC 内权威） | config |
|------|-----------|----------|--------|
| `text` | `{ "text": "..." }` | 非空、长度上限（如 2000） | `{ is_primary?: bool }`（仅主列） |
| `status` | `{ "label_id": "..." }` | label_id ∈ config.labels | `{ labels: [{id,label,color}], default_label_id }` |
| `date` | `{ "iso": "2026-11-05..." }` | 合法 ISO-8601 | `{ with_time: bool }` |
| `person` | `{ "profile_id": "..." }` | profile_id ∈ 本组织 members | `{}` |
| `number` | `{ "num": 123.45 }` | 数字、精度/范围按 config | `{ precision: int, min, max }` |
| `select` | `{ "option_id": "..." }` | option_id ∈ config.options | `{ options: [{id,label,color}] }` |
| `multiselect` | `{ "option_ids": [...] }` | 每个 ∈ config.options | `{ options: [...] }` |
| `checkbox` | `{ "checked": bool }` | bool | `{}` |

### 6.1 主列
每个 board 恰好一个 `type='text'` 且 `config.is_primary=true` 的列（"任务名"）。该列：
- 不可删（`delete_column` RPC 对主列返回 403 `FORBIDDEN`）。
- 其值实际存 `tasks.name`，前端把它渲染为表格第一列（行标签，点击进详情）。`cells` 表不为该列建行。
- 建看板时由 `create_board_with_starter` 自动创建。

### 6.2 类型注册
前端 `lib/columnTypes/` 下每个类型一个模块，导出 `{ validate, serialize, render, compare, editor }`，统一注册表 `columnTypeRegistry.ts`。后端 `validate_<type>` SQL 函数是同一契约的安全权威实现（防客户端绕过）。

## 7. 写入路径与鉴权

### 7.1 upsert_cell RPC（平台 spec §9.4，细化见 §5.4）
```sql
upsert_cell(p_task_id uuid, p_column_id uuid, p_value jsonb, p_expected_version int)
-- SECURITY DEFINER, search_path = public, 最小权限 owner
--   1. 校验 caller 是该 task 组织的成员且 role ∈ {owner,admin,member}（viewer→403 FORBIDDEN）
--   2. 校验 column.board_id = task.board_id（不符→400 VALIDATION_ERROR）
--   3. 主列（config.is_primary）→ 403 FORBIDDEN（走 rename_task）
--   4. validate_<type>(p_value, column.config) → 不通过 400 VALIDATION_ERROR
--   5. expected_version=0 → 仅创建（已存在→409 CONFLICT_VERSION，返回现有 version+value）
--      expected_version>0 → 仅更新（缺失或 version≠expected →409，返回当前 version+value）
--   6. 成功 → version=expected+1（创建时 version=1），返回 { cell_id, version } （409 时多带 value）
```

### 7.2 主列写入
`rename_task(p_task_id, p_name)` RPC（owner/admin/member 可调，viewer 拒绝），`UPDATE tasks SET name=$1`。

### 7.3 结构性 CRUD（全 RPC，SECURITY DEFINER，内鉴权）
- `create_board_with_starter(p_name)`：member+ 可调（§5.8）；事务内建 board+group+主列+状态列+首任务行，返回 board_id。
- `archive_board(p_board_id)` / `restore_board` / `rename_board`：仅 owner/admin。
- `list_boards()` / `list_archived_boards()`：组织内可见 / owner/admin。
- `create_column` / `update_column` / `delete_column` / `reorder_columns`：仅 owner/admin；主列拒删。
- `create_group` / `update_group`：owner/admin + member 可调；`delete_group`：仅 owner/admin（平台 spec §9.3）。
- `create_task` / `rename_task` / `move_task`：owner/admin/member；`delete_task`：**仅 owner/admin（member 不可删任务行）**。
- 邀请等已由 Foundation 的 `invite-member` EF 覆盖。

### 7.4 Edge Functions
本子系统写操作无 EF（客户端直调 RPC，平台 spec §9.4）。若后续出现需 service-role 编排且不宜进 RPC 的场景再引入，遵守规范 10-api。

## 8. 前端

- `pages/Boards.tsx`（或 Dashboard 扩展）：列当前组织的非 archived 看板、建看板入口（调 `create_board_with_starter`）。
- `pages/Board.tsx`：打开看板 → 基础表格视图（列头 = columns 顺序；行 = tasks；每格 = 该 task 的 cell，按列类型 render；第一列固定为主列 tasks.name）。
- 行内编辑：点 cell → 按 type 弹对应编辑器 → 调 `upsert_cell` / `rename_task`；409 时用返回的当前 value 提示并预填。
- 加列、建行、删行（owner/admin）、加分组、拖拽重排（前端乐观、调 RPC）。
- `lib/columnTypes/`：类型注册表 + 每类型 validate/render/editor。
- `api/boards.ts`、`api/columns.ts`、`api/tasks.ts`、`api/cells.ts`：封装 RPC/查询，返回类型化结果。
- 路由：`/boards`（列表）、`/boards/:boardId`（看板表格）。
- 仍用 Foundation 的 `useAuth()` + 当前 `organizationId`。
- 样式：v1 用 CSS Modules 或 Tailwind（与子系统 4 统一），保持一致即可。

## 9. Review Focus（本子系统覆盖）

引自平台 spec §8，本子系统需显式测试的：

1. **跨租户访问**（#1）：以 org A 成员查 org B 的 boards/columns/tasks/cells → 0 行；pgTAP。
2. **position 碰撞**（#4）：相邻任务 position 逼近/相等 → `move_task` 重排稳定不乱序、无重复 position；pgTAP。
3. **viewer 越权写**（#5）：viewer 调 `upsert_cell` / `create_column` / `create_task` / `delete_group` / `delete_task` → 403；pgTAP。
4. **主列不可删**：`delete_column` 对主列 → 403。
5. **cell 版本冲突**：`upsert_cell` 用过期 `expected_version` → 409 `CONFLICT_VERSION`，返回当前 version+value；对已删 cell 的过期写（expected>0 但行不存在）→ 409 而非静默重建。
6. **列类型校验**：每种类型喂非法 value → 400 `VALIDATION_ERROR`（status 未知 label、person 非 org 成员、number 超精度等）。
7. **软删除可见性**：archived 看板不出现在默认列表，owner/admin 经 `list_archived_boards` 可见、可 restore。
8. **tenant_id 伪造**（builder-check Q3）：伪造 tenant_id 的插入被触发器拒/覆盖；跨看板挂 cell（column.board_id ≠ task.board_id）→ 400。
9. **member 不可删任务行**（builder-check Q4）：member 调 `delete_task` → 403。

（平台 spec §8 #2 并发改同一 cell、#3 长文本共写 → 子系统 3。）

## 10. 留给实现者

- 列类型 config 的精确边界（status 色板取值、number 精度/范围默认、select 选项上限、date with_time 默认）在计划 TDD 步骤确定。
- 拖拽重排的前端交互库选择（dnd-kit 或原生）由计划定，遵守前端规范。
- 表格视图的虚拟化（大行数）推迟到子系统 4/6（搜索过滤时再议）；本子系统行数不大，不做虚拟化。
