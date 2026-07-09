# Unified Operation Platform — Session Summary(SessionStart hook 自動注入 · slim)

> **角色**:精簡即時摘要,由 SessionStart hook 每 session 自動注入。詳版 → `session-start.md`;憲法 → `CLAUDE.md`。
> 此處只補當前座標 + runtime 實況。**維護**:每個 phase closeout doc-sync 一併更新。

**身份**:Unified Operation Platform,spec `docs/architecture.md`,IT operation / support 管理 + 操作平台(逐步引入 AI);第一個模組 LicenseOps(M365 onboarding license 履行)。

**當前座標(2026-07-09)**:git 連 GitHub **private**(`chris-private-workspace`,`main`)。**W01-backend-bootstrap 完成**(G1-G4 全 pass):monorepo `apps/api`(NestJS)跑得起、`/docs/api` 200、DB seeded(23 OpCos + admin)。`apps/web` = placeholder。
**下一個 phase**:Chris **未揀** —— W02 = module C(catalog + 對帳)**或** 第一個前端 phase(app shell + token/theme)。module C/D 業務邏輯 + AUTH guard 未做。詳見 `BACKLOG.md`。前端受 H6 保護 —— 見 [[ui-design-fidelity]]。

**提醒(完整見 CLAUDE.md §5)**:掂 H1-H6 第一句 **STOP+ask**(H1 架構 / H2 vendor / H3 scope / H4 security / H5 test / H6 UI design fidelity)。**繁中回覆**。非 trivial 工作先 pre-doc gate(R1)。

**Runtime 實況(避坑,CLAUDE.md 冇)**:
- **起後端**:`docker compose up -d`(postgres **5433** + redis)→ `apps/api/.env`(gitignored)→ root `npm run start:dev` → `http://localhost:3100/docs/api`。
- ⚠️ **Prisma engine CDN(`binaries.prisma.sh`)俾公司 proxy 封(503)**:clean reinstall(刪 node_modules)後要**轉流動網路**跑一次 `npm run prisma:generate` + `prisma migrate` cache engine。其他 TLS 用 `NODE_EXTRA_CA_CERTS=C:/Users/CLai03/ricoh-ca.pem`。
- ⚠️ **Port**:3000 俾 Langfuse 佔 → 用 `PORT=3100`;5432 俾既有 Postgres 佔 → docker postgres host 5433。
- **SKU 一律用 `skuId`(GUID)唔靠名**;assign 前必過 `azureSyncedAt` sync gate(`findUser` null = 未 sync)。
- **UI**:token-only,唔 hardcode / eyeball;寫前跑 `.claude/skills/ui-design`;視覺真相 `design_handoff_licenseops/`。
- **git push**:upstream 已設,直接 `git push`;public→已轉 private,唔好 push 真實 secret(`.env` 已 ignore)。

**Detail on-demand**:`session-start.md`(詳版)· active phase folder(hook 自動注入)· `docs/02-architecture/design-system.md`(UI)· memory `MEMORY.md`。
