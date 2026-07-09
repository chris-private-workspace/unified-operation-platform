# AGENTS.md — Unified Operation Platform Standing Instructions

> **第二個 AI agent(例 Codex / Cursor)嘅 standing instructions。** 有啲 agent runtime 讀 `AGENTS.md` 而唔係 `CLAUDE.md`。
> **落地方式 = 薄指針**:`CLAUDE.md` 係 canonical single source of truth;本檔只放身分卡 + 紅線摘要,完整指令一律去 `CLAUDE.md`。

---

## 0. Quick Identity Check

| 項目 | Value |
|---|---|
| Project | **Unified Operation Platform** — IT operation / support 的管理 + 操作平台(逐步引入 AI 功能) |
| Primary Spec(platform) | `docs/architecture.md` |
| Module 1 Spec | `docs/02-architecture/licenseops/DESIGN.md`(LicenseOps 決策 SSOT) |
| Decision Owner(architecture / scope) | **Chris Lai** |
| Strict Mode | **ON** |

## 1. 你要做嘅事

1. **每 session 開始先完整讀 [`CLAUDE.md`](./CLAUDE.md)** —— 佢係完整 standing instructions(§0-§14):behavioral baseline、document routing、coding conventions、hard constraints、session-start protocol、self-verification。
2. 跟 `docs/01-planning/PROCESS.md` 三軌工作流(Phase / Change / Bug);非 trivial 工作先開 approved pre-doc 先寫 code。

## 2. Hard Constraints 摘要(詳見 CLAUDE.md §5,遇到第一句就 STOP and ask)

- **H1** 架構變更(四層地基 / module 邊界 / Prisma schema / 已 lock 決策)
- **H2** Vendor / dependency 鎖定(加 dep / 換 vendor)
- **H3** Scope / Tier 邊界(平台只做 LicenseOps 模組;LicenseOps 排除項見 module spec §2)
- **H4** Security / PII(唔 log / commit secret;唔 hard-code credential)
- **H5** Test coverage(critical path 同步寫 test,Graph/ServiceNow mock)

---

**Sync reminder**:`CLAUDE.md` 嘅 §0 / §5 有變 → 同步更新本檔對應摘要。
