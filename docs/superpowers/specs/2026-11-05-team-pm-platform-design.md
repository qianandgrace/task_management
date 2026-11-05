# 团队项目协作平台 — 设计文档

> 本文档是把现有 task_management demo（单用户 SQLite 任务 CRUD）演进为 monday.com 风格的团队项目协作平台的设计权威。实现计划据此论证。

## 1. Intent & Why

把一个 ~20 元成本的单用户任务 CRUD demo，演进为**团队共享的项目协作平台**：以可自定义列的"看板"为核心，让团队对项目进展有共同可见性、让每个成员知道自己该干什么。对标 monday.com / 飞书任务。目标代码量 ~10 万行，承载几千用户量级。

为什么现在做：demo 已验证基础全栈链路；下一步的产品价值在协作与灵活看板，而非更多的单用户字段。

## 2. Goals / Non-Goals / Anti-Goals

**Goals**
- 多租户：workspace（组织）→ 项目/看板 → 任务（行），成员与角色权限。
- monday 式动态看板：列由用户定义，列类型系统驱动渲染/校验/过滤/排序。
- 实时协作：在线状态、cell 变更广播、长文本 CRDT 共写。
- 支撑几千用户 / 数百团队的共享 Postgres 多租户架构。

**Non-Goals（v1 明确先不做）**
- 自动化引擎、仪表盘 widget、第三方集成、表单、工时统计、workload 视图、mirror/formula 列、移动端。
- 甘特/时间线视图（v1 只做表格视图 + 看板视图）。

**Anti-Goals（即使技术上可行也算失败）**
- 跨租户数据泄漏（RLS 必须在数据库层兜底，不能只靠应用层 WHERE）。
- 单文件嵌入式数据库（SQLite）承载多用户并发写。
- 长文本共写出现"后者覆盖前者"的丢字现象。

## 3. Constraints（全局）

- **数据库**：PostgreSQL 15+（经 Supabase）。所有租户级表带 `tenant_id`（= organization id）列并建复合索引。
- **多租户隔离**：Row-Level Security，每张租户级表有 `tenant_id` 策略；应用层不得作为唯一隔离手段。
- **认证**：Supabase Auth（JWT、刷新、邮件验证）。弃用现有 Express + jsonwebtoken + bcryptjs 自建认证。
- **字段命名**：DB `snake_case`，API/前端 `camelCase`（沿用 DR-0001）。转换发生在 Supabase 客户端序列化层 / Edge Function 响应层。
- **时间戳**：`timestamptz`，ISO-8601 UTC。弃用 SQLite 的 TEXT 时间戳。
- **错误响应**（Edge Function / 自定义 RPC）：`{ "error": { "code": "ERROR_CODE", "message": "..." } }`（沿用 api-contract）。
- **前端**：React 18 + Vite 5，**迁移到 TypeScript**（10 万行级代码与动态列类型系统需要类型安全；现有 JS/JSX 代码被替换）。react-router-dom 6。
- **后端**：Supabase（Postgres + Auth + Realtime + Storage + Edge Functions/Deno）。现有 `backend/` Express 服务退役；服务端权威逻辑以 Edge Functions 形式保留在 `supabase/functions/`。
- **实时**：Supabase Realtime（presence + broadcast + `postgres_changes`）；长文本字段用 Yjs，以 Realtime broadcast 通道为传输层，文档快照持久化到 Postgres 表 + Edge Function。
- **目标量级**：几千用户 / 数百团队。单共享 Postgres + 只读副本即可；**不做分库分表**（超过 ~1 万组织再议）。
- **测试**：RLS/SQL 用 pgTAP（经 `supabase db test`）；前端用 Vitest + Testing Library；集成测试对本地 `supabase start` 栈。
- **安全基线**：CORS 白名单（沿用 DR-0003 思路，由 Supabase 配置）；密钥走环境变量不入库；RLS 默认拒绝。
- **数据迁移**：无（demo 无真实用户；现有 SQLite 数据不迁移）。

## 4. Approaches（关键分叉与决策）

### 4.1 数据模型内核
- **(A) monday 式动态列**：`columns` 表定义看板的列与类型，`cells`/`task_column_values` 表存每行每列的值。任务退化为"看板内一行 + 排序位置"。**选定。**
- (B) 固定 schema 任务（飞书式）：字段写死，靠加固定列扩展。**否决**：不满足"用户自定义看板列"的核心诉求。
- 权衡：A 引入元数据模型复杂度（列类型系统是代码量大头），但正是产品核心体验所在。

### 4.2 实时协作
- **(A) WebSocket + 离散 cell 用 LWW（last-write-wins，服务端串行化）+ 长文本用 Yjs CRDT**。**选定。**
- (B) 无实时，纯请求-响应。**否决**：不是 monday 体验。
- (C) 全量 CRDT。**否决**：离散 cell（状态/日期/负责人）用 CRDT 是过度工程。
- 权衡：两套机制，但各自匹配其数据形态；LWW 的并发冲突靠服务端权威 + 版本号兜底。

### 4.3 后端平台
- **(A) Supabase（Postgres+Auth+RLS+Realtime+Storage）+ Yjs 挂 broadcast 通道**。**选定。**
- (B) 自建 Postgres + Express + ws + Yjs server。**否决**：重造 Supabase 已提供的能力，代码量与运维都更重。
- (C) SQLite-per-tenant。**否决**：目标量级下无 HA、并发写受限、无内置 realtime。
- 权衡：BaaS 锁定与出口流量成本，但覆盖认证/实时/存储/RLS 四大需求，让 10 万行预算投向产品核心。验证期用云托管，迁阿里云自托管后再控成本。

### 4.4 多租户模型
- **(A) 共享 Postgres，全表 `tenant_id`，RLS 隔离**。**选定。**
- (B) Database-per-tenant。**否决**：数百团队量级下运维开销不划算。
- (C) 分库分表 sharding。**否决**：几千用户量级过度工程。
- 权衡：A 在一台像样机器上可扛数千组织；超过 ~1 万组织再引入 sharding。

## 5. 已定的 How（实现方决策）

- **目录结构（规范）**：根目录 `CLAUDE.md`（项目概述）+ `.claude/rules/`：
  - `.claude/rules/00-security.md`（安全规则全局：RLS、CORS、密钥、JWT）
  - `.claude/rules/01-coding-style.md`（编码风格全局：TS、命名、文件组织）
  - `.claude/rules/10-api.md`（API/Edge Function/RPC 规范：错误形状、camelCase、状态码）
  - `.claude/rules/11-frontend.md`（前端规范：React+TS、组件/hooks/api 分层、Supabase 客户端）
  - `.claude/rules/12-backend.md`（后端规范：迁移、RLS、Edge Function、命名）
  - `.claude/rules/20-testing.md`（测试规范：pgTAP、Vitest、集成测试对本地栈）
  从现有 `docs/`（architecture/api-contract/db-schema/decisions）提炼，并补充 Supabase/RLS/TS 新约定。
- **Supabase 项目布局**：`supabase/`（`config.toml`、`migrations/`、`functions/` Edge Functions、`tests/` pgTAP）。
- **前端布局**：`frontend/src/{api,components,hooks,context,pages,views,lib}/`，TS。
- **列类型系统**（v1 首批）：`text`、`long_text`(CRDT)、`status`、`date`、`person`、`number`、`select`、`multiselect`、`checkbox`、`dependency`。每种类型有 `validate(value)`、`serialize`、`render`、`compare`。
- **看板内分组**：`groups` 表（monday 的 section），任务属于某 group 且有 `position`（浮点排序，支持拖拽重排）。

## 6. 留给实现者

- 列类型的具体校验规则细节、Yjs 文档快照的存储格式（二进制 bytea vs 增量）、Edge Function 的具体错误码枚举，由各子系统计划在 TDD 步骤中确定，遵守全局约束。
- 视图切换（表格/看板）的前端状态机设计留给"视图"子系统计划。

## 7. 子系统拆分（实现计划顺序）

每个子系统一份独立计划，各自产出可工作可测的软件：

1. **Foundation**：规范目录（CLAUDE.md+rules）、Supabase 项目初始化、多租户基线 schema（organizations/members/profiles）+ RLS、认证与 workspace 成员、前端 shell。**（本设计文档对应的第一个计划）**
2. **Boards & Dynamic Schema**：boards/groups/columns/cells 表 + 列类型系统 + 任务（行）CRUD。
3. **Realtime & CRDT**：presence、cell 广播、Yjs 长文本共写与持久化。
4. **Views**：表格视图、看板视图（按状态列分组）、视图切换状态机。
5. **Updates, Comments & Notifications**：任务级 updates 流、@提及、站内+邮件通知。
6. **Search, Filter & Sort**：看板级过滤/排序/搜索。

## 8. Review Focus（计划须覆盖的隐含输入/失败模式）

1. **跨租户访问**：成员查询/看板查询越过 RLS 直达其他组织数据 → 必须不可见。pgTAP 固定。
2. **并发改同一 cell**：两人同时改同一 cell，LWW + 版本号 → 不出现脏写/丢失广播。
3. **长文本并发共写丢字**：两人同改描述 → CRDT 合并不丢任何一方输入。
4. **拖拽重排的 position 碰撞**：相邻任务 position 接近或相等 → 重排稳定、不乱序。
5. **viewer 越权写**：viewer 角色对看板发起写操作（改 cell/建任务/改分组）→ 按 §9 角色矩阵拒绝。（v1 不做私有看板，见 §9；原"私有看板"语义改为组织级 viewer 只读。）

## 9. Builder-check 决议（2026-11-05）

Opus builder-check 通读 spec 后提了 6 个问题。决议如下（前 3 条为用户产品决策，后 3 条为 builder my-call）：

### 9.1 看板可见性模型（用户决策）
**v1 组织级可见**：org 内所有成员可见所有看板；不做私有看板（`board_members` ACL 表推迟到后续子系统）。"私有"语义在 v1 等同于 viewer 角色组织级只读。Review Focus #5 据此改为 viewer 越权写。
**影响**：boards/cells 的 RLS 只需 join `members`（org 成员），无需 board 级 ACL，复杂度降低。

### 9.2 v1 生产部署目标（用户决策）
**分阶段**：验证期 Supabase Cloud，正式用户接入前迁阿里云自托管控成本。本地 `supabase start` 栈作为开发与集成测试的代理环境；自托管构建遵守 China mirrors 约束（见相关 memory）。
**影响**：不依赖 Cloud-only 托管特性；邮件验证、Edge Function、Realtime、Storage 均以"自托管可用"为约束设计。

### 9.3 角色权限矩阵（用户决策，默认矩阵）
| 角色 | 看板 | 列结构 | 分组 | 任务行/cell |
|------|------|--------|------|-------------|
| owner/admin | 删看板 | 增删改列 | 增删改分组 | 改任意 cell、删任务行 |
| member | — | 不能改列结构 | 增改分组（不能删？见下） | 建任务、改任意 cell、拖拽重排 |
| viewer | 全只读 | 全只读 | 全只读 | 全只读 |

> member 删分组：v1 允许 member 增改分组但不删分组（删分组影响他人任务归属，留 owner/admin）。后续可调。
**影响**：boards/columns/cells/groups 每条写 RLS 策略与 Edge Function 鉴权均据此矩阵。

### 9.4 cell 写入路径（builder my-call）
离散 cell 写入走 **Postgres RPC `upsert_cell(board_id, task_id, column_id, value, expected_version)`**：内部 `UPDATE cells SET value=$1, version=version+1, updated_at=now() WHERE id=$2 AND version=$3 RETURNING *`，版本不匹配返回 `409 CONFLICT_VERSION`。**广播走 `postgres_changes`（RLS 兜底）**。
**理由**：RPC 的原子版本检查即"服务端串行化"，满足 spec §4.2 的 LWW+版本号；`postgres_changes` 是 Supabase 惯用广播，受 RLS 保护。比 Edge-Function 中转更轻，冲突通过版本号显式返回客户端。
**影响**：Realtime 子系统的 cell 广播用 `postgres_changes` 订阅 `cells` 表；冲突 UX 由客户端据 409 处理。

### 9.5 Realtime 频道授权（builder my-call，安全敏感）
Supabase broadcast/presence 不受 RLS 保护。模型：
- **频道命名约定**：`board:{board_id}`、`org:{organization_id}`。
- **join 鉴权**：Edge Function `/realtime-authorize` 校验 JWT + 该用户 `members` 属此 board 的 org，否则拒绝加入。
- **presence**：走一张 RLS 保护的 `presence` 表（`profile_id`、`channel`、`last_seen`），而非裸 broadcast presence。
- **cell 数据广播**：用 `postgres_changes`（RLS 兜底），不用裸 broadcast 传业务数据。
**理由**：堵住跨租户频道泄漏，直接对齐 Anti-Goal。
**影响**：Realtime 子系统计划（Opus 编写）须细化 Edge Function join 鉴权与 presence 表，并作为重点 review 项。

### 9.6 邮件验证（builder my-call）
**v1 关闭邮件验证**（验证期提速）。`handle_new_user()` 触发器在 `auth.users` insert 时即建 `profiles` + 个人 `organizations` + `members(owner)`，保证 Review Focus #4"注册后无孤立账号"。
**理由**：验证期不卡流程；正式上线前在 Supabase Auth 配置开启邮件验证，届时把触发器改为 `after email confirmed`（或保留 insert 但 org 标记 `pending_confirmation`，确认后激活）。
**影响**：Foundation 计划的注册冒烟测试 register→dashboard 直通。
