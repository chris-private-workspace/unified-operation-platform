# Unified Operation Platform — Session Summary(SessionStart hook 自動注入 · slim)

> **角色**:精簡即時摘要,由 SessionStart hook 每 session 自動注入。詳版 → `session-start.md`;憲法 → `CLAUDE.md`。
> 此處只補當前座標 + runtime 實況。**維護**:每個 phase closeout doc-sync 一併更新。

**身份**:Unified Operation Platform,spec `docs/architecture.md`,IT operation / support 管理 + 操作平台(逐步引入 AI);第一個模組 LicenseOps(M365 onboarding license 履行)。

**當前座標(2026-07-09)**:git 連 GitHub **private**(`chris-private-workspace`,`main`)。**W01-backend-bootstrap 完成**(G1-G4 全 pass):monorepo `apps/api`(NestJS)跑得起、`/docs/api` 200、DB seeded(23 OpCos + admin)。`apps/web` = placeholder。
**開發路線(2026-07-09)= backend-first → 前端**;後端業務層完成(**W02 C / W03 D-1 / W04 D-2 ✅**,39 test,`/license/*`+`/fulfilment/*` 13 endpoint)、**W05 FE-scaffold ✅**、**FE-1 ✅**(W06 = Overview dashboard + **SKU Catalog**;首次接後端真數 via TanStack Query + vite proxy `/api`→3100;兩畫面對 prototype 1:1、light+dark 驗、真數 seed 驗;G1–G6 全 pass)。**⚠️ FE-1 deviation**:原第二 screen = License Assets,但對 prototype ground 後發現佢**成個畫面靠 ledger 數量(無 read endpoint)**,只可砌空殼 → Chris 拍板換 **SKU Catalog**(100% 對 `/license/catalog`);License Assets 移未來 phase,配 **BE-ledger-read** endpoint + allocation import。**FE-2 ✅**(W07 = Requests 列表 + Request detail,**讀 + 寫**:OD1=B)——list(filter tabs + 派生 status/stage counts,client 計)、detail(sync-gate stepper + remark + line item 短3/採購6 stepper + operational timeline + AI coming-soon)、寫操作(advance stage / assign / mark synced,mutation + 錯誤 toast);**advance + mark-synced round-trip 端到端驗**,assign 前端 fail-closed(成功路徑需真 Graph,W04 覆蓋)。新 primitive Stepper/Tabs(handoff inventory 重建)。**⚠️ FE-2 揭出後端 crash bug BUG-002**:assign 時 `findUser` throw Graph error 未 wrap → invalid status(-1)→ NestJS process crash(critical path robustness;候選,等 owner 定即修)。**下一個 = FE-3(Drift/Settings/Login)或 BUG-002 插隊**→ FE-Assets(待 BE-ledger-read)→ AUTH → deploy。**未做**:FE-3、License Assets、AUTH guard、BUG-002、🚩 2 flag(Avatar `#8a0018` gradient DS-7 / npm dev vulns)。**誠實資料原則**:缺 endpoint(handler name / AI parse / My queue)一律 EmptyState/coming-soon/略去,絕不砌假數。前端 = **H6 保護**,token-only 唔 eyeball,**寫前對 prototype render 睇**(computed 查證,唔靠畫面名估),跑 `ui-design` skill,vite dev 5173 —— 見 [[ui-design-fidelity]]。

**提醒(完整見 CLAUDE.md §5)**:掂 H1-H6 第一句 **STOP+ask**(H1 架構 / H2 vendor / H3 scope / H4 security / H5 test / H6 UI design fidelity)。**繁中回覆**。非 trivial 工作先 pre-doc gate(R1)。

**Runtime 實況(避坑,CLAUDE.md 冇)**:
- **起後端**:`docker compose up -d`(postgres **5433** + redis)→ `apps/api/.env`(gitignored)→ root `npm run start:dev` → `http://localhost:3100/docs/api`。
- ⚠️ **Prisma engine CDN(`binaries.prisma.sh`)俾公司 proxy 封(503)**:clean reinstall(刪 node_modules)後要**轉流動網路**跑一次 `npm run prisma:generate` + `prisma migrate` cache engine。其他 TLS 用 `NODE_EXTRA_CA_CERTS=C:/Users/CLai03/ricoh-ca.pem`。
- ⚠️ **Port**:3000 俾 Langfuse 佔 → 用 `PORT=3100`;5432 俾既有 Postgres 佔 → docker postgres host 5433。
- **SKU 一律用 `skuId`(GUID)唔靠名**;assign 前必過 `azureSyncedAt` sync gate(`findUser` null = 未 sync)。
- **UI**:token-only,唔 hardcode / eyeball;寫前跑 `.claude/skills/ui-design`;視覺真相 `design_handoff_licenseops/`。
- **git push**:upstream 已設,直接 `git push`;public→已轉 private,唔好 push 真實 secret(`.env` 已 ignore)。

**Detail on-demand**:`session-start.md`(詳版)· active phase folder(hook 自動注入)· `docs/02-architecture/design-system.md`(UI)· memory `MEMORY.md`。
