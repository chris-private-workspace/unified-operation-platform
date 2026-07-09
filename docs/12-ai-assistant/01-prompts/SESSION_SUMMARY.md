# Unified Operation Platform — Session Summary(SessionStart hook 自動注入 · slim)

> **角色**:精簡即時摘要,由 SessionStart hook 每 session 自動注入。詳版 → `session-start.md`;憲法 → `CLAUDE.md`。
> 此處只補當前座標 + runtime 實況。**維護**:每個 phase closeout doc-sync 一併更新。

**身份**:Unified Operation Platform,spec `docs/architecture.md`,IT operation / support 管理 + 操作平台(逐步引入 AI);第一個模組 LicenseOps(M365 onboarding license 履行)。

**當前座標(2026-07-09)**:git 連 GitHub **private**(`chris-private-workspace`,`main`)。**W01-backend-bootstrap 完成**(G1-G4 全 pass):monorepo `apps/api`(NestJS)跑得起、`/docs/api` 200、DB seeded(23 OpCos + admin)。`apps/web` = placeholder。
**開發路線(2026-07-09)= backend-first → 前端**;後端業務層完成(**W02 C / W03 D-1 / W04 D-2 ✅**,39 test,`/license/*`+`/fulfilment/*` 13 endpoint)、**W05 FE-scaffold ✅**、**FE-1 ✅**(W06 = Overview dashboard + **SKU Catalog**;首次接後端真數 via TanStack Query + vite proxy `/api`→3100;兩畫面對 prototype 1:1、light+dark 驗、真數 seed 驗;G1–G6 全 pass)。**⚠️ FE-1 deviation**:原第二 screen = License Assets,但對 prototype ground 後發現佢**成個畫面靠 ledger 數量(無 read endpoint)**,只可砌空殼 → Chris 拍板換 **SKU Catalog**(100% 對 `/license/catalog`);License Assets 移未來 phase,配 **BE-ledger-read** endpoint + allocation import。**下一個 = FE-2**(Requests 列表 + detail + 首個寫操作 UI)→ FE-3 → FE-Assets → AUTH → deploy。**未做**:FE-2/3、License Assets(待 ledger read model)、AUTH guard、🚩 2 flag(Avatar `#8a0018` gradient DS-7 / npm dev vulnerabilities)。**誠實資料原則**:缺 endpoint 一律 EmptyState,絕不砌假數。前端 = **H6 保護**,token-only 唔 eyeball,**寫前對 prototype render 睇**(computed 查證,唔靠畫面名估),跑 `ui-design` skill,vite dev 5173 —— 見 [[ui-design-fidelity]]。

**提醒(完整見 CLAUDE.md §5)**:掂 H1-H6 第一句 **STOP+ask**(H1 架構 / H2 vendor / H3 scope / H4 security / H5 test / H6 UI design fidelity)。**繁中回覆**。非 trivial 工作先 pre-doc gate(R1)。

**Runtime 實況(避坑,CLAUDE.md 冇)**:
- **起後端**:`docker compose up -d`(postgres **5433** + redis)→ `apps/api/.env`(gitignored)→ root `npm run start:dev` → `http://localhost:3100/docs/api`。
- ⚠️ **Prisma engine CDN(`binaries.prisma.sh`)俾公司 proxy 封(503)**:clean reinstall(刪 node_modules)後要**轉流動網路**跑一次 `npm run prisma:generate` + `prisma migrate` cache engine。其他 TLS 用 `NODE_EXTRA_CA_CERTS=C:/Users/CLai03/ricoh-ca.pem`。
- ⚠️ **Port**:3000 俾 Langfuse 佔 → 用 `PORT=3100`;5432 俾既有 Postgres 佔 → docker postgres host 5433。
- **SKU 一律用 `skuId`(GUID)唔靠名**;assign 前必過 `azureSyncedAt` sync gate(`findUser` null = 未 sync)。
- **UI**:token-only,唔 hardcode / eyeball;寫前跑 `.claude/skills/ui-design`;視覺真相 `design_handoff_licenseops/`。
- **git push**:upstream 已設,直接 `git push`;public→已轉 private,唔好 push 真實 secret(`.env` 已 ignore)。

**Detail on-demand**:`session-start.md`(詳版)· active phase folder(hook 自動注入)· `docs/02-architecture/design-system.md`(UI)· memory `MEMORY.md`。
