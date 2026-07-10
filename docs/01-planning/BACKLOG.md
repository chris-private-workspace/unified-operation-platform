# Unified Operation Platform — 工作 Backlog(中央 dashboard 入口)

> **用途**:本項目**所有** pending 工作 / next-candidate 嘅**單一一覽入口**。AI 或用戶想知「而家有咩 pending、可以揀邊個做」→ 第一站睇呢度。
>
> **定位 = index 層,唔複製細節**:每行只記「任務 / 狀態 / 前置·阻塞 / 來源連結」,細節一律 link 去 source-of-truth(`adr/README.md` / `DEFERRED_REGISTER.md` / 對應 phase folder),避免雙重維護變 stale。
>
> **同步 = binding(PROCESS.md R7)**:phase kickoff / closeout、ADR Accept、defer/blocked 決定、新 candidate 被識別 → 必須同步本表,**唔可以 silent drift**。維護規則見文末。

**最後更新**:2026-07-10(**tech-debt 清理批次** — DS-flag ✅ resolved[Avatar tokenize `--accent-deep` 消硬 hex + design-system.md DS-7 加 Avatar 例外 + SKILL.md 同步];FE-vuln → **defer DD-2**[實跑證非-force `npm audit fix` 一個都清唔到,全繫 breaking major];新登 DEFERRED DD-1[allocation-import]/DD-2[npm-vuln]+ RISK R2[dev-bypass 誤帶 prod,🟢 Mitigated]。前:**AUTH-1 ✅**[W09 後端 Entra JWT 驗證 + `@Roles(ADMIN,REGIONAL)` guard 落 11 endpoint,ADR-0002 + dev-bypass,api 56 test,401/200 wiring live 驗];**FE-Assets 被 allocation-import 卡** → 轉咗 AUTH。下一個 = AUTH-2[FE SSO,前置 IT 開 SPA app reg] / AUTH-3[OPCO_IT scope] / FE-Assets[前置 allocation import 決定])

---

## 狀態 lifecycle
`候選`(已識別未規劃)→ `已規劃`(plan 建咗)→ `進行中` → `完成` / `defer`(實證或決定暫不做)/ `blocked`(卡外部·用戶決定)

分區按「可開工性」:**A 可立即開工** / **B 已設計·暫緩** / **C blocked on 外部** / **D 已實證 defer** / **E 持續技術債** / **F out-of-scope**。

---

## 進行中(Active — 當前處理中)

| ID | 任務 | 狀態 | 下一步 / 阻塞 | 來源 |
|---|---|---|---|---|
| W01 | Backend Bootstrap（monorepo `apps/api` + PrismaModule + docker-compose） | ✅ **完成**（2026-07-09；G1-G4 全 pass） | — | `W01-backend-bootstrap/`（retro 已寫） |
| W02 | **Module C:SKU Catalog 字典 + 總量層對帳 / drift**（純後端） | ✅ **完成**（2026-07-09；G1–G4 全 pass） | — | `W02-catalog-reconcile/`（retro 已寫） |
| W03 | **Module D-1:Request 生命週期骨架**（intake → line items → triage → stage machine;無 side-effect） | ✅ **完成**（2026-07-09；G1–G4 全 pass） | — | `W03-request-lifecycle/`（retro 已寫） |
| W04 | **Module D-2:履行動作**（sync gate → `assignLicense` → `assignedQuantity` +1 → 回寫 ServiceNow → `ASSIGNED`） | ✅ **完成**（2026-07-09；G1–G4 全 pass） | — | `W04-assign-fulfilment/`（retro 已寫） |
| W05 | **FE-scaffold**:`apps/web` app shell + token/theme（Vite+React+TS+Tailwind+shadcn;H6） | ✅ **完成**（2026-07-09；G1–G5 全 pass;light+dark 截圖驗） | — | `W05-fe-scaffold/`（retro 已寫） |
| FE-1 | **前端畫面 1**:Overview dashboard + **SKU Catalog**（首次接後端 `/license/*` `/fulfilment/*` via TanStack Query;OD 全 default = A。**2026-07-09 deviation**:第二個 screen License Assets → SKU Catalog,因 Assets 全靠 ledger 無 endpoint） | ✅ **完成**（2026-07-09；G1–G6 全 pass;light+dark 截圖驗;真數 seed 驗） | — | `W06-fe-overview-assets/`（retro 已寫） |

| FE-2 | **前端畫面 2**:Requests 列表 + Request detail（讀 + **寫操作** advance/assign/sync;OD1=B）——首個寫操作 UI,接 `/fulfilment/requests*` | ✅ **完成**（2026-07-09；G1–G6 pass;advance/mark-synced round-trip 端到端驗;light+dark） | — | `W07-fe-requests/`（retro 已寫） |
| FE-3 | **前端畫面 3**:Drift Alerts（接 `GET /license/drift` 真數 + `POST /license/reconcile`;OD1=A 只 Drift,Settings/Login 隨 AUTH defer）——含 **BE-graph-harden**（reconcile/catalog `getSubscribedSkus` wrap→503,OD2=A） | ✅ **完成**（2026-07-10；G1–G7 全 pass;light+dark 對 prototype;harden round-trip[503 toast + API 唔 crash] live 驗;api 42 test 綠） | — | `W08-fe-drift-harden/` |

> **開發路線（2026-07-10）**:W02 C ✅ → W03 D-1 ✅ → W04 D-2 ✅（後端業務層）→ **W05 FE-scaffold ✅ → FE-1 ✅**（W06）→ **FE-2 ✅**（W07）→ **FE-3 ✅**（W08,Drift + BE-graph-harden）→ **AUTH-1 ✅**（W09,後端 JWT 驗證 + role guard）。**路線調整**:原打算 FE-Assets,但 discovery 揭 **FE-Assets 被 allocation-import[deferred Excel data 決定]卡死**（seed 唔播 ledger、`allocatedQuantity`=0 → owned/utilization 無真數）→ Chris 轉做 AUTH。下一個:**AUTH-2**（FE SSO,前置 IT 開 SPA app reg）→ **AUTH-3**（OPCO_IT scope）/ **FE-Assets**（前置 allocation import 決定）→ Settings/Login（隨 AUTH-2）→ DEPLOY。**BUG-002 ✅ / BE-graph-harden ✅ / AUTH-1 ✅**。

---

## A — 可立即開工

| ID | 任務 | 狀態 | 前置 / 下一步 | 來源 |
|---|---|---|---|---|
| INIT | `git init` + 首個 baseline commit（框架落地基線） | 完成（`5ff2cae`,main） | — | CLAUDE.md §4 |
| BUG-001 | **H4:`GraphService` log 咗 UPN（PII）**（assignLicense + findUser 錯誤） | ✅ 完成（2026-07-09；Sev3;fix + regression test,實證 fails-before） | — | `docs/03-implementation/bugs/BUG-001-graph-logs-upn-pii/` |
| BUG-002 | **後端 assign crash**:`findUser` throw Graph/MSAL error（非 return null）未 wrap → invalid status(-1)→ **NestJS process crash**（critical path robustness;FE-2 assign 測試揭出） | ✅ **完成**（2026-07-09;Sev2;3 個 Graph await wrap → 503 + regression test,實證 fails-before;api 40 test 綠） | — | `docs/03-implementation/bugs/BUG-002-assign-graph-error-crashes-api/` |
| BE-graph-harden | **catalog sync / reconcile 呼 `getSubscribedSkus` 相同 latent crash**（Graph throw 未 wrap）——BUG-002 carry-over | ✅ **完成**（2026-07-10,W08 OD2=A;新 `graph-unavailable.ts` 共用 helper,reconcile/catalog wrap→503 + regression test,assign 改用同 helper;live 驗 reconcile/catalog 皆 clean 503 + API 唔 crash） | — | `W08-fe-drift-harden/` · `integration/graph/graph-unavailable.ts` |
| DS-flag | **Avatar brand gradient `#8a0018`**:handoff 用非 token gradient,衝突 design-system.md DS-7「唯一 gradient=login」 | ✅ **完成**（2026-07-10;Chris 揀保留 hifi → tokenize `--accent-deep`[index.css]消硬 hex + DS-7 明文加 Avatar 例外 + SKILL.md 同步） | — | `apps/web/.../ui/avatar.tsx` · `index.css` · design-system.md DS-7 |
| FE-vuln | **npm dev/build-chain vulnerabilities**（monorepo root 32:apps/web 7[vite/vitest/esbuild/js-yaml/picomatch]+ apps/api 側 uuid/webpack/nest CLI;**全 dev-only 唔入 production bundle**） | 🚧 **defer → DD-2**（2026-07-10;實跑證非-force `npm audit fix`[root+`-w`]一個都清唔到,全繫 breaking major） | vite@8 生態 stabilize → 專門 phase 一次過升 + revalidate（H2,需 ADR） | `DEFERRED_REGISTER.md` DD-2 |
| FE-bundle-split | **前端 bundle > 500KB warning**（AUTH-2a 引入 MSAL 後 578KB;ADR-0003 已知） | 候選（低優先,唔阻功能） | `build.rollupOptions.manualChunks` 拆 vendor / dynamic import Login+MSAL chunk;非架構,一個小 chore | `docs/adr/0003-msal-frontend-sso.md`（Consequences） |
| BE-ledger-read | **後端 read-model:per-OpCo ledger + SKU 用量 stats endpoint**（FE-1 OD1-A carry — **License Assets 前端整個畫面** + Overview seat KPI 需此） | 候選（FE-1 kickoff 產生） | 後端 mini-phase:`GET /license/ledger`（每 OpCo 每 SKU owned/allocated/assigned）+ stats 聚合;注意 prepaid `allocatedQuantity` import 仍 deferred（utilization 需埋佢） | `W06-fe-overview-assets/plan.md §1.1` |
| FE-Assets | **前端 License Assets 畫面**（owned/allocated/assigned ledger 數量表 + utilization bar + Headroom/Over-allocated + Manage）—— FE-1 deviation 移出 | 候選（等 BE-ledger-read） | **前置 BE-ledger-read**（+ allocation import 先有 allocated/utilization 真數）→ 之後一個前端 phase 砌,對 prototype License Assets view | `design_handoff .../full-console.html`（License Assets view） |

---

## B — 已設計 / Accepted,用戶主動暫緩(等 driver,非技術阻塞)

| ID | 任務 | 狀態 | 解封條件 | 來源 |
|---|---|---|---|---|
| MOD-C | Module C：SKU Catalog 字典 + 總量層對帳 / drift | ✅ 完成（W02,2026-07-09） | — | `W02-catalog-reconcile/` |
| MOD-D | Module D：Request 履行 —— **D-1 生命週期 ✅（W03）+ D-2 履行動作 ✅（W04）= 全完** | ✅ 完成 | — | `W03-request-lifecycle/` · `W04-assign-fulfilment/` |
| AUTH-1 | **後端 Entra JWT 驗證 + role guard**（`@Roles(ADMIN,REGIONAL)` 落 license/fulfilment,關 unguarded gap;dev-bypass 本地） | ✅ **完成**（2026-07-10,W09;ADR-0002;api 56 test;401/200 wiring live 驗） | — | `W09-auth-backend-guards/` · `docs/adr/0002-entra-jwt-validation.md` |
| AUTH-2a | **前端 SSO scaffold + Login/Settings + token attach**（MSAL provider + `authHeader` acquireTokenSilent→Bearer + Login/Settings 畫面 + 真 identity/sign-out + dev-bypass 相容） | ✅ **完成**（2026-07-10,W10;ADR-0003;8 deliverable + G1-G6/G8 過;web 8 test 綠[含 authHeader 6 分支]） | — | `W10-auth-fe-sso/` · `docs/adr/0003-msal-frontend-sso.md` |
| AUTH-2b | **真 SSO e2e 驗證**（真 sign-in → token → API 200 → identity → sign-out,G7） | 🔴 **blocked on IT app reg**（見 C 區） | **前置:IT 開 SPA app registration** → 填 `VITE_ENTRA_*` env → 一條 live round-trip 驗 G7 → close W10 | `W10-auth-fe-sso/plan.md §7`（IT checklist） |
| AUTH-3 | **OPCO_IT per-OpCo scope 過濾**（REGIONAL 睇全部 / OPCO_IT 只睇自己 OpCo） | 候選（隨 OpCo self-service） | query 層加 opcoScope 過濾 + FE role 切換;DESIGN §10 WHICH-OpCo | `W09-*/plan.md §1.1` · `AppUser.opcoScopeId` |
| FE | LicenseOps 前端（`apps/web`；React+TS+Tailwind+shadcn；滾動 build order：app shell→theme→Overview→License Assets→Requests→Request detail→Drift→Catalog→Settings→Login） | 已設計（hifi handoff + 設計系統就緒；ADR-0001 已定 in-repo；H6 已生效） | 前置 `apps/web` scaffold（W01 monorepo 之後）；每段一滾動 phase | `docs/02-architecture/design-system.md` · `design_handoff_licenseops/` |

---

## C — Blocked on 外部(IT / 用戶決定 / 第三方)

| ID | 任務 | 狀態 | Blocker | 來源 |
|---|---|---|---|---|
| AUTH-2b | **真 SSO e2e 驗證**（AUTH-2a 已交前端全部;剩真 token round-trip G7） | 🔴 blocked | **IT 未開 SPA app registration**（redirect URI + Expose an API scope + audience 對齊 ADR-0002）。ready 後填 `VITE_ENTRA_CLIENT_ID/TENANT_ID/API_SCOPE/REDIRECT_URI` → live 驗 | `W10-auth-fe-sso/plan.md §7`（IT checklist,可直接交 IT） |

---

## D — 已實證 defer(不重開,除非新 driver)

> 細節 + 恢復條件全部喺 `DEFERRED_REGISTER.md`,本表只做指標。

| DD | 類別 | 狀態 |
|---|---|---|
| DD-1 | Prepaid `allocatedQuantity` Excel import 未定 → 卡 FE-Assets / ledger utilization 真數 | defer（等 Chris 決 import 方式） |
| DD-2 | npm dev/build-chain vulns 需 breaking major 先清（全 dev-only 唔入 production） | defer（等 vite@8 生態 stabilize + 專門升級 phase） |

---

## E — 持續性技術債(對應模組再動時順帶補)

| ID | 類別 | 解封條件 |
|---|---|---|
| _(空)_ | | |

---

## F — 明確 out-of-scope(記錄防混入)

開以下任何一項前必須 STOP + approval + 平台級 ADR(H1/H3):

- **其他 IT ops 模組**:offboarding / license 回收、Cost Insights、D365 Licenses、其他 support 工作流 —— 未來 tier(`docs/architecture.md §11`)。
- **LicenseOps 排除項**:ticket 申請表單 / 審批鏈 / SLA 管理 / service catalog / CMDB 當 source of truth / 成本發票金額(→ DocuWare,只記 `quoteRef`/`poRef`)/ 非 onboarding 的獨立 license request(`docs/02-architecture/licenseops/DESIGN.md §2`)。

---

## 維護規則(對應 CLAUDE.md §10 R7 / PROCESS.md R7)

1. **新 candidate 被識別**(分析 / 討論 / ADR Accept / phase retro carry-over / 用戶提出)→ 加一行,狀態 `候選`,填來源連結。
2. **phase kickoff**(plan 建)→ 對應項改 `進行中`(或新增做 `已規劃`)。
3. **phase closeout** → 對應項改 `完成`;若產生**反覆 / 結構性** deferral → 同步 `DEFERRED_REGISTER.md` 加 DD-N,本表 D/E 區加指標行。
4. **defer / blocked 決定** → 改對應狀態 + link DD-N 或阻塞源。
5. **single source 原則** — 本表唔複製細節,只 link;細節改去 source-of-truth,本表只更新「狀態 + 一句摘要」。
6. **更新即改「最後更新」日期** + 必要時喺對應 phase `progress.md` Day-N entry mention(per R2)。

> **與 `DEFERRED_REGISTER.md` 分工**:BACKLOG = **全部** pending 嘅 dashboard(含可開工 / 候選 / blocked);DEFERRED_REGISTER = **recurring deferred-debt** 嘅 close 條件細節庫。BACKLOG 嘅 D/E 區只指向 DEFERRED_REGISTER,唔重複內容。
