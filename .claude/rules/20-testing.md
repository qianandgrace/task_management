---
globs:
  - "supabase/tests/**/*.sql"
  - "frontend/src/**/*.test.{ts,tsx}"
  - "frontend/src/test/**"
---
# 20-testing.md — 测试规范

> spec §3 全局约束、§9。每个子系统计划在 TDD 步骤中确定具体用例，遵守本文件。

## 1. TDD 红-绿

- 先写**失败测试**，跑确认失败（红）；再实现，跑确认通过（绿）；最后重构。
- 不先写实现再补测试；不写"永远通过"的空测试。

## 2. RLS / SQL 测试：pgTAP

- 用 pgTAP，经 `supabase db test` 运行；测试文件放 `supabase/tests/`。
- 每张租户级表的 RLS 必须有测试：**建多租户场景**（多 org / 多用户），断言跨租户不可见、不可写。
- 测试 `with check` 策略：尝试写入错误 `tenant_id` 必须失败。
- 测试 `SECURITY DEFINER` 引导函数：注册后无孤立账号（profile + org + member 齐全，spec §9.6）。

## 3. 前端测试：Vitest + Testing Library

- Vitest + `@testing-library/react`，jsdom 环境。
- 组件测试覆盖渲染、交互、可访问性基本断言；hooks 用 `@testing-library/react-hooks` 或 `renderHook`。
- mock Supabase client（不直连本地栈），单测保持快速隔离。

## 4. 集成测试

- 对本地 `supabase start` 栈：端到端跑 Edge Function → RPC → RLS 路径。
- 集成测试覆盖 spec §8 Review Focus：跨租户访问、并发写同一 cell（版本冲突返回 `CONFLICT_VERSION`）、viewer 越权写被拒。

## 5. 测试输出

- 测试输出须干净：无 stray warning、无 console 噪声。
- 失败时输出聚焦失败原因，不淹没在日志中。

## 6. Commit

- 每个 task 末尾必须 commit（见 CLAUDE.md）；不积压未提交改动跨 task。
- 测试与实现同提交；红-绿中间态不留 commit。
