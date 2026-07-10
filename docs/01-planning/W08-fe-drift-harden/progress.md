---
phase: W08-fe-drift-harden
---

# W08（FE-3）— Progress（daily + retro）

## Day 0 — 2026-07-10（kickoff / discovery / plan draft）

**做咗**:
- Discovery（對 prototype `full-console.html` 逐 view 核）:三個原定畫面（Drift Alerts / Settings / Login）盤點真數 vs 假殼。
  - **Drift Alerts** = 唯一有紮實真 endpoint（`GET /license/drift` + `POST /license/reconcile`）→ ~表格全真數。
  - **Settings** = 幾乎全靠 AUTH（Account/Users/Role）/ out-of-scope（user mgmt）/ 無 endpoint（OpCos read / integration 狀態 / n8n）→ 做 = 大量假殼。
  - **Login** = 純 UI 殼,AUTH backend 未做,signIn 只切 state。
- Kickoff OD 敲定:**OD1 = A（只做 Drift Alerts）**、**OD2 = A（FE-3 內順手修 reconcile/catalog Graph crash = BE-graph-harden）**。
- 核後端:`reconcile.service.ts:36` + `catalog.service.ts:32` `getSubscribedSkus` 未 wrap（BUG-002 只 scope 到 assign）;`assign.service` `graphUnavailable` helper 可抽共用。
- 核前端:`/drift` 現 `<Placeholder>`;`useDrift`/`DriftAlert` type 已建;sidebar drift count hardcode `3`。
- 寫 W08 三件套 draft（plan / checklist / progress）。

**誠實 gap（plan §1.1,用 FE-1/FE-2 同套手法）**:Scope 欄 → 一律「Tenant」（方案甲總量層,無 per-OpCo）;Resolve 掣 → 移除（無 manual resolve endpoint,reconcile 自動平）。

**下一步**:等 owner approve plan → active → D1 後端 harden（B1）+ types/hooks（F1）。

**紀律**:H1 harden 只 wrap error 唔改對帳邏輯（總量層 lock 不動);H5 reconcile/catalog critical path 配 regression;H6 Drift 畫面 token-only + 對 prototype。**無新 ADR**（純執行 + error-handling harden,唔改架構/vendor/schema）。

## Day 1 — 2026-07-10（後端 harden + 前端 Drift + 全 gate live 驗）

**做咗（B1 + F1–F4）**:
- **B1 後端 harden**:新 `integration/graph/graph-unavailable.ts` free helper;`reconcile.service` / `catalog.service` wrap `getSubscribedSkus` → 503;`assign.service` 3 個 call 改用共用 helper（private method 移除）;reconcile/catalog spec 加 regression（throw → 503 + fail-closed）。
- **F1 types/hooks**:`api-types.ts` `ReconcileResult`;`mutations.ts` `useReconcile()`（onSuccess invalidate drift;caller 經 `mutate(vars,{onSuccess/onError})` 附 toast）。
- **F2/F3 前端 Drift**:`pages/drift.tsx`（Reconciliation 卡 + Run reconciliation now + drift 表格真數 + all-clear empty state）;router `/drift` 拆 Placeholder;sidebar drift count 接真數。

**Live 驗證（真跑真 trace,非口述）**:
- 起 api(3100) + web(5173) + prototype static server(4599);dev DB 已有 3 筆 OPEN DriftAlert（+3 / −2 / +1,兩 tone 齊）供 G3。
- **G2**:browser render `/drift` light + dark,對 prototype `full-console.html` DRIFT ALERTS view 逐張截圖對照 → 結構一致。
- **G3**:表格打 `GET /license/drift` 真 JSON（289/292/+3、49/47/−2、23/24/+1）;sidebar count=3 真數;summary「3 open alerts · 10 active SKUs」真數。
- **G3b harden round-trip**:撳 Run reconciliation now → 前端 clean 503 toast「Microsoft Graph is unavailable…」+ 後端單一 `[ReconcileService] ERROR`（無 BUG-002 式 `RangeError`/crash stack）+ `GET /license/drift` 仍 200（**API 冇 crash**）;`POST /license/catalog/sync` 亦 clean 503。
- **G6**:`npm test -w @uop/api` → 6 suites / 42 pass（含 reconcile/catalog throw→503 regression）。**G1** web build 1668 modules 0 error;**G7** web + api eslint clean。

**捉到 + 修咗 1 個 quality finding（DS/reuse）**:`drift.tsx` 原本 reinvent 一個 local `Toast`（樣式紅框、無 auto-dismiss、comment「until a global toast host lands」過時），但 shared `@/components/ui/toast`（tone-dot,catalog.tsx 用緊）已存在 → **改用 shared primitive + catalog 式 flash auto-dismiss**;DOM 重驗:tone-dot span `bg-danger`、實際色 `rgb(200,30,30)`（token,非 hardcode）、503 message 正確、2.6s auto-dismiss 生效。build/lint/tsc 重跑綠。

**誠實 gap（記低,唔當已驗）**:
- **empty-state（all-clear）** 只 code-verified（EmptyState 分支 + proven primitive）—— seed 有 3 OPEN drift,冇為咗睇空態而清 seed（清咗要真 Graph 先開得返,本地做唔到）。
- reconcile **success** toast 路徑（`Reconciliation complete · checked…`）靠 tsc 對 `ReconcileResult` 型別驗,冇 live 跑（成功需真 Graph seats,同 W04 覆蓋一致）。
- **Scope=Tenant / 無 Resolve 欄 / partNumber 副行**：對 prototype 三個 intentional honest 差異（plan §1.1/§2,非 drift）。

**工具實況**:claude-in-chrome `Page.captureScreenshot` 喺 reconcile 後（spin/pending 期）多次 30s 凍結 → toast(auto-dismiss 2.6s)截唔到 → 轉 `javascript_tool` 讀 DOM deterministic 驗（見上）。**無腦補任何 tool 結果**（H7）。

**下一步**:commit 批 B（W08 code）→ plan status closed + BACKLOG 同步 + SESSION_SUMMARY/memory 更新 → 停背景 server。
