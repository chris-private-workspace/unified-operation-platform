---
phase: W08-fe-drift-harden
name: "前端畫面 3 — Drift Alerts（接真數）+ 後端 Graph-error harden（BE-graph-harden：reconcile/catalog）"
sprint_week: W08
backlog_id: FE-3
start_date: 2026-07-10
end_date: 2026-07-14          # planned, may slip with changelog log
status: closed               # draft | active | closed
spec_refs:
  - docs/02-architecture/design-system.md（設計系統 SSOT + anti-drift）
  - design_handoff_licenseops/prototype/full-console.html（DRIFT ALERTS section 視覺真相）
  - docs/02-architecture/licenseops/DESIGN.md §5（方案甲 = 總量層對帳，delta = tenantConsumed − sum(assignedQuantity)）
  - apps/api OpenAPI /docs/api（GET /license/drift · POST /license/reconcile）
  - docs/03-implementation/bugs/BUG-002-assign-graph-error-crashes-api/report.md（graphUnavailable pattern 先例）
  - CLAUDE.md §3.2 前端 conventions / §5 H5 Test coverage / §5 H6 Design Fidelity
prior_phase: W07-fe-requests
---

# Phase W08（FE-3）— Drift Alerts + Graph-error harden

> **Plan version**:1.0（draft）
> **Owner**:Chris Lai
> **Approved by**:Chris Lai（2026-07-10）— **OD1 = A（只做 Drift Alerts）**;**OD2 = A（FE-3 內順手修 reconcile/catalog Graph crash）**（2026-07-10 kickoff 已敲）
> **H6 提醒**:token-only、唔 eyeball、light+dark、lucide-only、數字 mono;每 commit 前跑 `.claude/skills/ui-design`（DS-1~12）。**偏離設計 / 要新 primitive → 先確認。**
> **H5 提醒**:reconcile / drift 偵測 = critical path;harden 改動必須同步 regression test（Graph mock）。

## 1. Scope

FE-2（Requests 讀+寫）完成。本 phase = **一個前端畫面 + 一段後端 harden**,兩者用同一個 Graph 邊界串起:

1. **前端 Drift Alerts 畫面**（`/drift`,現係 `<Placeholder>`）—— 對帳 drift 警報頁,首次接 `GET /license/drift` 真數:
   - **Reconciliation 頂欄卡**:標題 + 副標（last run + summary）+ **Run reconciliation now** primary 按鈕（`POST /license/reconcile`）。
   - **Drift 表格卡**:每列 SKU（displayName + part number mono）· Ledger sum（mono）· Tenant used（mono）· **Delta**（mono pill,`delta>0`→danger / `<0`→warn,DS-8）· Detected（relative mono）。真數 by `useDrift`。
   - **All-clear empty state**:綠勾 + 「No open drift alerts」+ last-run 文案 + Run reconciliation now（EmptyState primitive）。
   - loading / error 狀態（沿用 feedback-states）。
   對 prototype `======= DRIFT ALERTS =======` section 1:1（light+dark）。

2. **後端 Graph-error harden（BE-graph-harden，OD2=A）**—— 把 BUG-002 只 scope 到 assign 嘅修法，補到其餘兩條呼 `getSubscribedSkus` 嘅 POST-trigger:
   - `reconcile.service.reconcile()`（`:36`）+ `catalog.service.syncFromTenant()`（`:32`）wrap `getSubscribedSkus` → clean `ServiceUnavailableException`（503）。
   - **抽共用**:BUG-002 嘅 `graphUnavailable` 由 assign private method → 抽成 `integration/graph/graph-unavailable.ts` free helper（H4:唔 log UPN/secret,只 action + message）;reconcile / catalog import 用;assign 亦改用同一 helper（BUG-002 test 保護,行為不變,消除重複）。
   - **fail-closed 不變**:Graph 失敗 → 唔寫 DB（reconcile 唔開 alert / catalog 唔 upsert）。

**誠實資料原則（non-negotiable）**:只 bind 真數;缺 endpoint 一律 drop / 標明,**絕不砌假數**。

### 1.1 後端資料現況（scope 根據 — 已核 controller + DTO + service）

| 前端要 | 來源 | 狀態 |
|---|---|---|
| Drift 表格（SKU / ledger / tenant / delta / note / detected） | `GET /license/drift` → `DriftAlertDto[]`（含 `sku{skuId,partNumber,displayName}`） | ✅ 有（`useDrift` + `DriftAlert` type 已建於 FE-1） |
| delta pill 顏色 | 後端已算 `delta = tenantConsumed − ledgerAssignedSum` | ✅ 真數（前端只決 tone） |
| Run reconciliation now | `POST /license/reconcile` → `ReconcileResultDto`（checked/opened/updated/resolved/drift） | ✅ 有（呼 Graph;OD2 harden 令失敗回 clean 503） |
| **Scope 欄（Tenant/RVN/RTH…）** | 方案甲 = **總量層**對帳,DriftAlert **冇 per-OpCo scope**（DESIGN §5/§10 WHICH-OpCo deferred） | ❌ 無 → 欄標一律 **「Tenant」**（honest;唔砌假 per-OpCo） |
| **每列 Resolve 按鈕** | **無 manual resolve endpoint**（下次 reconcile 對回自動 `RESOLVED`） | ❌ 無 → **移除**該按鈕（drift 由 reconcile 自動平);列尾唔擺假動作 |
| **Regional/OpCo scope 過濾** | 無 AUTH / 無 current-user role | ❌ 無 → 一律 show all OPEN（AUTH phase 再加 scope 過濾） |
| sidebar Drift Alerts count | 現 hardcode `3` | ⚠️ 本 phase 接 `useDrift().data.length`（honest;requests count 唔郁 — 不屬本 phase） |

### 1.2 後端 harden 現況（已核 source）

| 呼 `getSubscribedSkus` 的地方 | 現狀 | 本 phase |
|---|---|---|
| `assign.service.ts:111` | ✅ 已 wrap（BUG-002） | 改用共用 helper（行為不變） |
| `reconcile.service.ts:36` | ❌ 未 wrap → Graph throw crash | wrap → 503 + regression test |
| `catalog.service.ts:32` | ❌ 未 wrap → Graph throw crash | wrap → 503 + regression test |

## 2. 明確 out-of-scope（H3 / H6）

| 排除項 | 去向 |
|---|---|
| **Settings 畫面** | OD1=A defer;前置 AUTH（Account/Users/Role）+ BE-ledger-read/OpCo-read endpoint（OpCos）+ integration 狀態 endpoint。大量 section 無 endpoint → 遲做 |
| **Login 畫面** | OD1=A defer;AUTH phase 一齊做真 SSO（唔先砌之後要拆嘅假登入殼） |
| **每列 Resolve / manual dismiss** | 無 endpoint（reconcile 自動平）;若日後要 manual resolve → 後端加 endpoint 先 |
| **per-OpCo scoped drift** | DESIGN §10 WHICH-OpCo deferred（方案甲總量層）;需 ledger 歸屬機制 |
| **reconcile @Cron 自動排程** | orchestration phase（OD1 已 defer）;本 phase 只手動 trigger 按鈕 |
| **sidebar requests count 接真數** | 不屬本 phase（FE-2 未做,留後）;只郁 drift count |
| **改 token / 加新色 / handoff 以外 primitive** | STOP（H6）先確認 |

> **註（無新 primitive）**:Drift 畫面全部用既有 primitive 砌 —— Card + 手砌 table（同 `catalog.tsx` pattern）、Badge（delta pill,tone by sign）、Button（Run reconciliation）、EmptyState（all-clear）、feedback-states（loading/error）。**唔需新 primitive** → 唔觸 H6「新 primitive STOP」。

## 3. Open Decisions（✅ 2026-07-10 kickoff 敲定）

| # | 決策 | 決定 |
|---|---|---|
| **OD1** | FE-3 三畫面 scope | **A — 只做 Drift Alerts**。Settings/Login defer（大量假殼 / AUTH-dependent,見 §2） |
| **OD2** | reconcile「Run now」的 Graph latent crash | **A — FE-3 內順手修**（reconcile + catalog wrap `getSubscribedSkus` → 503 + 抽共用 helper + regression test;清 BE-graph-harden carry-over） |
| OD3 | harden helper 抽法 | 共用 free helper `graph-unavailable.ts`;assign 亦改用（BUG-002 test 保護;若實作時覺郁已測 code 不值 → 退為 reconcile/catalog 用共用、assign inline 不郁,changelog 記） |

## 4. Deliverables

### B1 — 後端 Graph-error harden（BE-graph-harden）⭐ critical path
- **Spec ref**:BUG-002 report `graphUnavailable` pattern;DESIGN §5 reconcile 語意（唔改對帳邏輯,只 wrap error）
- **Acceptance**:
  - 新 `apps/api/src/integration/graph/graph-unavailable.ts` — free helper `graphUnavailable(logger, action, err): ServiceUnavailableException`（H4:唔 log UPN/secret,只 action + message）。
  - `reconcile.service.reconcile()`:wrap `getSubscribedSkus` → helper。對帳循環、DriftAlert create/update/resolve 邏輯**一行唔改**。
  - `catalog.service.syncFromTenant()`:wrap `getSubscribedSkus` → helper。catalog upsert / snapshot / 軟刪邏輯不改。
  - `assign.service`:3 個 `graphUnavailable(...)` call 改用共用 free helper（private method 移除;行為不變）。
- **H5**:
  - `reconcile.service.spec.ts` 加 regression:`graph.getSubscribedSkus` reject → `reconcile()` throw `ServiceUnavailableException`（**唔** raw crash）+ 冇 DB 寫入（fail-closed）。
  - `catalog.service.spec.ts` 加 regression:同上 for `syncFromTenant()`。
  - **實證 fails-before**（暫還原 wrap → 新 test red → 改返）。
  - api 全 suite 綠（現 40 test → +2）。
- **Effort**:3h

### F1 — types + hooks（reconcile mutation）
- **Acceptance**:`api-types.ts` 加 `ReconcileResult`（checked/opened/updated/resolved/drift;mirror `ReconcileResultDto`）。`hooks/mutations.ts` 加 `useReconcile()`（`POST /license/reconcile` → `ReconcileResult`;onSuccess invalidate `['license','drift']`;caller 附 toast:成功 summary / 失敗 surface 後端 503 message）。`useDrift`（已存在）沿用。
- **Effort**:1.5h

### F2 — Drift Alerts 畫面（`src/pages/drift.tsx`,DS-4/8/11）⭐
- **Spec ref**:prototype `======= DRIFT ALERTS =======`（頂欄卡 + 表格 + empty state）
- **Acceptance**:
  - **Reconciliation 頂欄卡**:左標題「Reconciliation」+ 副標（last run 由最新 `detectedAt` / 或 static「Manual trigger」+ `openDriftCount + ' alerts · ' + catalogCount + ' SKUs'` summary,只用真數,缺就簡化文案);右 **Run reconciliation now** primary（`useReconcile`,pending spin,一 view 一 primary DS-3）。
  - **Drift 表格**（Card + table,同 catalog.tsx pattern）:欄 **SKU**（displayName + partNumber mono `--fg-subtle`）· **Scope**（一律「Tenant」badge neutral,§1.1 honest）· **Ledger sum**（右,mono）· **Tenant used**（右,mono）· **Delta**（右,mono pill:`>0`→danger-soft `+N` / `<0`→warn-soft `−N`,DS-8）· **Detected**（relative mono）。**無 Resolve 欄**（§2）。
  - **All-clear empty state**（`data.length===0`）:EmptyState 綠勾 +「No open drift alerts」+ 副文 + Run reconciliation now。
  - light+dark 對 prototype 1:1。
- **Effort**:4h

### F3 — routing + 狀態 + sidebar count
- **Acceptance**:`router.tsx` `/drift` `<Placeholder>` → `<Drift />`;loading（spinner）/ error（LoadError）/ empty（all-clear）齊全,**無假數 / 無 crash**。`top-bar.tsx` `/drift` → title「Drift Alerts」（若未有）。`sidebar.tsx` Drift Alerts count 由 hardcode `3` → `useDrift().data?.length`（0 則唔顯示 badge;tone 保持 danger when >0）。
- **Effort**:2h

### F4 — DS 自檢 + gate
- **Acceptance**:`.claude/skills/ui-design` DS-1~12 全 ✅（DS-8 delta→tone、DS-5 mono 數字/count、DS-3 一 view 一 primary、DS-11 對 prototype、DS-4 light+dark);lint clean;build 0 error。
- **Effort**:1.5h

## 5. Success Criteria（Phase Gate）

| # | Criterion | Target | Measure | Block? |
|---|---|---|---|---|
| G1 | Build | 0 error | `npm run build -w @uop/web` | Yes |
| G2 | Drift 畫面 render（light+dark） | 表格 + 頂欄卡 + empty state 對 prototype 一致 | dev + 截圖 | Yes |
| G3 | 真數流通（讀） | drift 表格打 `GET /license/drift` 收真 JSON、render（delta pill tone 正確） | 後端起 + seed drift + proxy | Yes |
| G3b | **harden round-trip（本地可驗）** | 撳「Run reconciliation now」→ 本地 Graph（placeholder creds）失敗 → **clean 503 toast + API process 唔 crash**（仍可再 `GET /license/drift`） | 後端起 + 撳掣實測 | Yes |
| G4 | ui-design DS 自檢 | DS-1~12 全 ✅ | skill 逐條 | Yes（H6） |
| G5 | 誠實狀態 + 錯誤處理 | loading/error/empty + Scope 一律 Tenant + 無 Resolve 假掣 + reconcile 錯誤 toast 唔崩;無假數 | 斷後端 / 空 drift / 撳 reconcile 試 | Yes |
| G6 | **後端 harden test** | reconcile + catalog spec regression（getSubscribedSkus throw → 503 + fails-before）綠;api 全 suite 綠（42 test） | `npm test -w @uop/api` | Yes（H5） |
| G7 | Lint | 0 warning | `npm run lint -w @uop/web` + api | No |

## 6. Risks

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | harden wrap 改到 reconcile 對帳邏輯（H1 lock:方案甲總量層） | Low | High | **只 wrap error,對帳循環/DriftAlert 讀寫一行唔改**;regression test 證行為不變 |
| R2 | 抽共用 helper 郁到 assign 已測 code（BUG-002） | Low | Med | 行為完全一樣（同一 message/status）;BUG-002 3 個 wrap test 保護;跑全 suite 確認綠 |
| R3 | Drift 畫面偏離 prototype（H6） | Med | High | browser render prototype 對照;G4 DS-11;delta pill tone 用 design-system.md map |
| R4 | seed 無 OPEN drift → G3 驗唔到表格 | Med | Med | 本地 seed 加幾筆 OPEN DriftAlert（by skuCatalogId,dev DB,唔 commit） |
| R5 | Scope 欄 / Resolve 掣手多照 prototype 砌（假數 / 假動作） | Med | Med | 守 §1.1:Scope 一律 Tenant、Resolve 移除;誠實原則 |

## 7. Day-by-Day（rough）

| Day | Focus | Deliverables |
|---|---|---|
| D1 | 後端 harden（helper + reconcile/catalog wrap + assign 改用 + test）+ types/hooks | B1, F1 |
| D2 | Drift 畫面 + routing/狀態/sidebar count + DS 自檢 + gates | F2, F3, F4 |

## 8. Dependencies on Prior Phase

FE-1 data layer（api.ts `apiPost` / queries.ts `useDrift` / api-types.ts `DriftAlert` / vite proxy）+ primitive（Card/Badge/EmptyState/StatCard）+ feedback-states（Loading/LoadError）+ format helper（relativeTime）。BUG-002 `graphUnavailable` pattern（抽共用來源）。後端 `/license/drift` + `/license/reconcile` 在線 + 本地 seed（加 OPEN drift）供 G3。

## 9. Plan Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-10 | Initial draft（Drift Alerts 接真數 + BE-graph-harden reconcile/catalog;OD1=A 只 Drift、OD2=A 順手修） | FE-2 完;discovery 揭 Settings/Login 大量假殼 → 收窄 scope + 清 harden carry-over | Chris Lai（待 approve） |
| 2026-07-10 | Approved → active（scope + harden OD 已敲,無改動） | Chris approve 開工 | Chris Lai |
| 2026-07-10 | **Closed** — B1 + F1–F4 完成,G1–G7 全 pass（light+dark + harden round-trip live 驗,api 42 test 綠）。1 deviation:`drift.tsx` toast 由 local reinvent 改用 shared `@/components/ui/toast`（reuse + DS-11 一致性,owner 拍板即修,DOM 重驗 bg-danger token）。honest gap:empty-state code-verified only（seed 有 3 OPEN,冇清 seed render 空態） | FE-3 gate 達成 | Chris Lai |

---

**Lifecycle reminder**:plan locked after status=active。deviation → §9 changelog + progress;approve 前唔 code（R1）。**H1**:harden 只 wrap error,唔改對帳邏輯（總量層 lock 不動）。**H5**:reconcile/catalog harden 必配 regression test。**H6**:偏離設計 → 先確認。**誠實資料**:Scope 一律 Tenant、Resolve 移除、缺 endpoint 不砌假數。
