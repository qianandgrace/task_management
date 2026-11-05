# CLAUDE.md — Team Project Management Platform

本项目是 monday.com 风格的团队项目协作平台，由现有单用户 SQLite 任务 CRUD demo 演进而来。多租户（组织→看板→任务行）、动态列看板、实时协作，目标承载几千用户 / 数百团队。

## 技术栈

- **后端**：Supabase（PostgreSQL 15+ / Auth / Row-Level Security / Realtime / Storage / Edge Functions·Deno）。旧 `backend/` Express + JWT 自建认证已退役。
- **前端**：React 18 + Vite 5 + TypeScript（strict），react-router-dom 6。
- **实时**：Supabase Realtime（presence + broadcast + `postgres_changes`）；长文本字段用 Yjs CRDT，以 broadcast 通道传输、快照持久化到 Postgres。
- **测试**：RLS/SQL 用 pgTAP（`supabase db test`）；前端用 Vitest + Testing Library；集成测试对本地 `supabase start` 栈。

> 权威设计文档：`docs/superpowers/specs/2026-11-05-team-pm-platform-design.md`。

## 目录结构总览

```
task_management/
├── CLAUDE.md                  # 本文件（项目入口概述）
├── .claude/rules/             # 全局规范（见下方索引）
│   ├── 00-security.md         # 安全：RLS、CORS、密钥、JWT、Realtime 授权
│   ├── 01-coding-style.md     # 编码风格：TS strict、命名、文件组织
│   ├── 10-api.md              # API / Edge Function / RPC 规范
│   ├── 11-frontend.md         # 前端：React+TS、分层、Supabase 客户端
│   ├── 12-backend.md          # 后端：迁移、RLS、Edge Function、命名
│   └── 20-testing.md          # 测试：pgTAP、Vitest、集成测试
├── supabase/                  # config.toml、migrations/、functions/、tests/
├── frontend/src/              # {api,components,hooks,context,pages,views,lib}/
└── docs/                      # 旧 demo 文档（architecture/api-contract/db-schema/decisions）+ 新 spec
```

## 规范索引

所有编码约定集中在 `.claude/rules/`，开始任何 task 前先读对应文件：

- 安全规则 → `.claude/rules/00-security.md`
- 编码风格 → `.claude/rules/01-coding-style.md`
- API / Edge Function / RPC → `.claude/rules/10-api.md`
- 前端 → `.claude/rules/11-frontend.md`
- 后端 → `.claude/rules/12-backend.md`
- 测试 → `.claude/rules/20-testing.md`

## 本地开发命令

```bash
# 启动本地 Supabase 栈（Postgres + Auth + Realtime + Storage）
supabase start

# 运行数据库迁移并启动前端
supabase db push
cd frontend && npm run dev

# 测试
supabase db test          # pgTAP：RLS / SQL 测试
npx vitest                # 前端单元/组件测试
```

前端开发服务器 `http://localhost:5173`；Supabase 本地栈端口见 `supabase status`。

## 子系统拆分（实现计划顺序）

1. Foundation（规范目录 + Supabase 初始化 + 多租户基线 + 认证 + 前端 shell）
2. Boards & Dynamic Schema（看板/分组/列/cells + 列类型系统）
3. Realtime & CRDT（presence / cell 广播 / Yjs 长文本）
4. Views（表格视图 / 看板视图 / 切换状态机）
5. Updates, Comments & Notifications
6. Search, Filter & Sort

每个 task 末尾必须 commit。
