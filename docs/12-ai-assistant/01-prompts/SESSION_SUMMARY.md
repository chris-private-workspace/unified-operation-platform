# Unified Operation Platform — Session Summary(SessionStart hook 自動注入 · slim)

> **角色**:精簡即時摘要,由 SessionStart hook 每 session 自動注入。詳版 → `session-start.md`;憲法 → `CLAUDE.md`。
> 此處只補當前座標 + runtime 實況。**維護**:每個 phase closeout doc-sync 一併更新。

**身份**:Unified Operation Platform,spec `docs/architecture.md`,IT operation / support 管理 + 操作平台(逐步引入 AI);第一個模組 LicenseOps(M365 onboarding license 履行)。

**當前座標(2026-07-09)**:dev-framework 流程 + 設計系統剛落地;git 已連 GitHub **private**(`chris-private-workspace`,branch `main`)。
最近 phase **W01-backend-bootstrap**(**active-draft** — plan `draft`,**等 Chris approve flip active 先開工**):建 monorepo(ADR-0001:`apps/api` + `apps/web`)+ 令後端跑得起 + 後端遷入 `apps/api`。前端(`apps/web`)由 hifi handoff 還原,受 H6 保護 —— 見 [[ui-design-fidelity]]。
**剩餘候選**:module C(catalog+對帳)/ D(request 履行)/ AUTH(Entra guard)/ 前端 build phases;詳見 `BACKLOG.md`。
**Gates**:W01 G1 build / G2 boot+`/docs/api` 200 / G3 migrate+seed / G4 lint —— 全部 pending。

**提醒(完整見 CLAUDE.md §5)**:掂 H1-H6 第一句 **STOP+ask**(H1 架構 / H2 vendor / H3 scope / H4 security / H5 test / H6 UI design fidelity)。**繁中回覆**。非 trivial 工作先 pre-doc gate(R1)。

**Runtime 實況(避坑,CLAUDE.md 冇)**:
- ⚠️ **未 runnable**:未有 `package.json` / docker-compose;W01 之後先跑得起(`npm run start:dev` → port 3000 → `/docs/api`;`docker compose up -d` 起 postgres+redis)。
- **SKU 一律用 `skuId`(GUID)唔靠名**;assign 前必過 `azureSyncedAt` sync gate(`findUser` null = 未 sync)。
- **UI**:token-only,唔 hardcode / eyeball;寫前跑 `.claude/skills/ui-design`;視覺真相 `design_handoff_licenseops/`。
- **git push**:upstream 已設,直接 `git push`;public→已轉 private,唔好 push 真實 secret(`.env` 已 ignore)。

**Detail on-demand**:`session-start.md`(詳版)· active phase folder(hook 自動注入)· `docs/02-architecture/design-system.md`(UI)· memory `MEMORY.md`。
