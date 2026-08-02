# Unified Operation Platform — Session Summary(SessionStart hook 自動注入 · slim)

> **角色**:精簡即時摘要,由 SessionStart hook 每 session 自動注入。詳版 → `session-start.md`;憲法 → `CLAUDE.md`。
> 此處只補當前座標 + runtime 實況。**維護**:每個 phase closeout doc-sync 一併更新。

**身份**:Unified Operation Platform,spec `docs/architecture.md`,IT operation / support 管理 + 操作平台(逐步引入 AI);第一個模組 LicenseOps(M365 onboarding license 履行)。

**當前座標(2026-08-02)**:git 連 GitHub **private**(`chris-private-workspace`,`main`)。Backend `apps/api`(NestJS)、`/docs/api` 200、DB seeded(**24** OpCos + admin + catalog SKU)。`apps/web` = **約 10 個實畫面**(Overview / SKU Catalog / Requests + detail + new[開單] / Drift / License Assets / Settings / **Audit log** / **Delivery failures** / Login)。**api ~746 test(64 suites)· web ~237 test(27 files)**。ADR 到 **0022** · CH 到 **017**。
> 🔴 **Ledger 有兩個 reset,名近似而風險唔同級**(CH-016 / CH-017,對照表 → `CH-017-ledger-full-reset/spec.md §2.2`):`POST /license/ledger/allocation/reset`(ADMIN+REGIONAL)只清 `allocatedQuantity`,**重新 import 救得返**;`POST /license/ledger/reset`(**ADMIN only** + 打字確認)連 `assignedQuantity` 一齊清,**任何 import 都救唔返**(ADR-0004 #5),只能重跑 `npm run baseline:assigned`。改任何一個之前先睇清楚係邊個。
> ⚠️ **dev DB 現況**:`150 rows | alloc 41 | assigned 5971 | adjustments 14` —— RTW 一個 OpCo 已被 CH-017 驗證 full reset 過(其餘 23 個完好)。全平台清空係 Chris 自己撳,順序見 `CH-017/progress.md` closeout。
> 🟢 **前端驗證唔再係死結** —— 2026-08-02 起 **Playwright MCP** 行得通(`mcp__plugin_playwright_playwright__*`),AI 自己 render 得到、light/dark 都截到圖。memory `ui-verification-route` 記錄嘅「最後一哩路要人手」已經唔再成立。⚠️ 但佢會喺 **repo root** 掉低截圖同 `.playwright-mcp/`(`filename` 唔收 repo 以外嘅路徑),**收工要清**。

> 🔴 **`apps/api/.env` 喺主 checkout(`C:\Users\CLai03\unified-operation-platform`)係有嘅,而且入面係真憑證**(真 `ricohapdev` ServiceNow + 真 Graph tenant + 真 ACS)。2026-07-31 實證:live 打真 SN / 真 Graph 完全做得到。⚠️ 之前呢度寫住「本 worktree 冇 `.env`」—— 嗰句只對**另一個 worktree** 成立,喺主 checkout 讀會令你以為做唔到 live 驗證。**開工前自己確認一次係邊個 checkout。**
> 🔴 **port 3100 跑緊嘅唔一定係本 worktree** —— 驗證前**必查 process ancestry**(AP-11,W36 同 W38 各中過一次)。
> ⚠️ **維護**:呢段同 `CLAUDE.md §0/§9` 每次 closeout 一齊掃 —— 兩份都係無條件注入每個 session,過時 = 下一個 session 用錯前提開工(2026-07-31 實犯)。

**開發路線全鏈完成(詳細歷史 → `BACKLOG.md` + memory `MEMORY.md`,此處唔重複)**:
- **後端業務層**:W02 C(catalog+對帳)/ W03 D-1(intake)/ W04 D-2(assign+ledger)✅ · **前端全鏈**:W05 scaffold / W06 FE-1(Overview+Catalog)/ W07 FE-2(Requests+detail 讀寫)/ W08 FE-3(Drift + BE-graph-harden)✅ · **BUG-002 ✅**(Graph error wrap→503)。
- **AUTH 全鏈 ✅**:W09 AUTH-1(後端 Entra JWT + `@Roles` guard,ADR-0002)→ W10 AUTH-2a(FE MSAL scaffold + Login/Settings + token attach,ADR-0003)→ W11 AUTH-3a(OPCO_IT 後端 per-OpCo scope)→ W18-21 AUTH-4a/b/c(本地登入 / user 管理 / 密碼生命週期 / session hardening,ADR-0005/0006)→ W22 AUTH-3b(FE 真 role scope)。
- **FE-Assets 鏈 ✅**:W13-17(allocation import[ADR-0004 curation-as-scope]+ ledger read/write + By-OpCo inline edit[ADR-0007])。
- **ADR-0008 request 建單 rollout 全 4 階段 ✅**(2026-07-15):W24 **甲** inbound intake(n8n→平台 `POST /requests/intake` m2m)/ W25 **乙** outbound direct(平台→SN + 前端 `/requests/new`)/ W26 **丙** n8n outbound(`N8nWorkflowProvider` env 選路)/ W27 **丁** D365 scope(平台早 SKU-agnostic → confirm+test+doc)。

**當前 pending(rolling JIT,待 Chris 揀)**:🔴 **AUTH-2b**(真 SSO e2e — 前端全就緒[readiness ✅ 2026-07-15]、**卡 IT 開 Entra SPA app reg**;handoff+runbook `W10/AUTH-2b-RUNBOOK.md`)· **DEPLOY**(生產部署 + 真數 curation)· honest-gap 三項(activity feed / Drift Resolve / AI-Assist)· 🟡 AUTH-4c-C(email reset)/ DD-2(npm vuln)。
**Deploy-time carry(非 repo)**:真 SN/n8n 建單合約對齊(`docs/05-usage/SERVICENOW-CONTRACT-ALIGNMENT.md` 🅐–🅙 待 SN owner 填)· 真 D365 SKU curation(`W27/CURATION-D365.md` runbook)。

**誠實資料原則**:缺 endpoint(handler name / AI parse / My queue …)一律 EmptyState/coming-soon/略去,絕不砌假數。前端 = **H6 保護**,token-only 唔 eyeball,**寫前對 prototype render 睇**(computed 查證,唔靠畫面名估),跑 `ui-design` skill,vite dev 5173 —— 見 [[ui-design-fidelity]]。

**提醒(完整見 CLAUDE.md §5)**:掂 H1-H8 第一句 **STOP+ask**(H1 架構 / H2 vendor / H3 scope / H4 security / H5 test / H6 UI design fidelity / **H7 tool-result integrity**:絕不作 tool 輸出 · send tool 即收口 · 講 pass/done/rendered 前 trace 一個真 tool_result,見 `docs/03-implementation/incidents/INC-001` / **H8 tool-usage discipline**:讀檔/搜尋用 Read/Grep/Glob 唔用 bash cat/grep · 唔 echo 拼裝 · 單一重定向)。**繁中回覆**。非 trivial 工作先 pre-doc gate(R1)。

**Runtime 實況(避坑,CLAUDE.md 冇)**:
- **起後端**:`docker compose up -d`(postgres **5433** + redis)→ `apps/api/.env`(gitignored)→ root `npm run start:dev` → `http://localhost:3100/docs/api`。
- ⚠️ **Prisma engine CDN(`binaries.prisma.sh`)俾公司 proxy 封(503)**:clean reinstall(刪 node_modules)後要**轉流動網路**跑一次 `npm run prisma:generate` + `prisma migrate` cache engine。其他 TLS 用 `NODE_EXTRA_CA_CERTS=C:/Users/CLai03/ricoh-ca.pem`。
- ⚠️ **Port**:3000 俾 Langfuse 佔 → 用 `PORT=3100`;5432 俾既有 Postgres 佔 → docker postgres host 5433。
- **Auth(AUTH 鏈完成)**:controllers 全域 guard(`@Roles`);後端 Entra JWT(AUTH-1)+ FE MSAL(AUTH-2a)+ OPCO_IT per-OpCo scope(AUTH-3a/3b)+ 本地登入/密碼/session(AUTH-4a-c)。**本地要 `AUTH_DEV_BYPASS=true`**(api `.env`)+ **`VITE_AUTH_DEV_BYPASS=true`**(web)否則 `/api` 401 / FE gate 去 login。扮 OPCO_IT 加 `AUTH_DEV_USER_EMAIL=opco.it.rhk@rapo.com.hk`。**真 SSO token e2e = AUTH-2b(卡 IT 開 SPA app reg;前端已就緒,見 `W10/AUTH-2b-RUNBOOK.md`)**。ADR-0002/0003/0005/0006。
- **Request 建單(ADR-0008)**:inbound intake `POST /requests/intake`(m2m `X-Intake-Key`,`INTAKE_API_KEY`);outbound `POST /requests` provider 由 **`REQUEST_SUBMISSION_PROVIDER=direct|n8n`** 選(default direct→SN Table API / n8n→webhook `N8N_OUTBOUND_WEBHOOK_URL`+`_KEY`)。**代表性合約**,真上線待 `docs/05-usage/SERVICENOW-CONTRACT-ALIGNMENT.md`。
- **Demo harness**:`apps/api/scripts/demo-harness/`(npm `demo:mock-sn`/`demo:mock-n8n`/`demo:cleanup`)—— dev-bypass + mock 底下 live 跑 ADR-0008 request 雙向閉環(甲/乙/丙 + assign 回寫),零新 dep;runbook 見該 folder README。
- **SKU 一律用 `skuId`(GUID)唔靠名**;assign 前必過 `azureSyncedAt` sync gate(`findUser` null = 未 sync)。
- **UI**:token-only,唔 hardcode / eyeball;寫前跑 `.claude/skills/ui-design`;視覺真相 `design_handoff_licenseops/`。
- **git push**:upstream 已設,直接 `git push`;public→已轉 private,唔好 push 真實 secret(`.env` 已 ignore)。

**Detail on-demand**:`session-start.md`(詳版)· active phase folder(hook 自動注入)· `docs/02-architecture/design-system.md`(UI)· memory `MEMORY.md`。
