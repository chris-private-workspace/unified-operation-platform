---
phase: W07-fe-requests
name: "前端畫面 2 — Requests 列表 + Request detail(讀 + 寫操作:advance/assign/sync)"
sprint_week: W07
backlog_id: FE-2
start_date: 2026-07-09
end_date: 2026-07-16          # planned, may slip with changelog log
status: closed               # draft | active | closed — progress closed + checklist complete（2026-07-20 status 回填）
spec_refs:
  - docs/02-architecture/design-system.md（設計系統 SSOT + anti-drift）
  - design_handoff_licenseops/prototype/full-console.html（Requests list + Request detail 視覺真相 — browser render 已抽）
  - docs/02-architecture/licenseops/DESIGN.md（request 生命週期 / stage / sync gate 語意）
  - apps/api OpenAPI /docs/api（/fulfilment/requests* — service 實際 return 比 DTO 豐富:含 opco + lineItems + events）
  - CLAUDE.md §3.2 前端 conventions / §5 H6 Design Fidelity
prior_phase: W06-fe-overview-assets
---

# Phase W07(FE-2)— Requests 列表 + Request detail

> **Plan version**:1.0（draft）
> **Owner**:Chris Lai
> **Approved by**:Chris Lai(2026-07-09;**OD1 = B 讀+寫**;OD2/OD3 = default A)
> **H6 提醒**:token-only、唔 eyeball、light+dark、lucide-only、數字 mono;每 commit 前跑 `.claude/skills/ui-design`（DS-1~12）。**偏離設計 / 要新 primitive → 先確認(見 §2 註)。**

## 1. Scope

FE-1（Overview + SKU Catalog）完成。本 phase = **前端第二組畫面 = Requests**:

1. **Requests 列表**(`/requests`)—— filter tabs（All / Needs attention / My queue / Procurement / Blocked,**client 計數**）+ 表格（REQUEST · TARGET USER · OPCO · **LINE ITEMS 每 stage count badge** · STATUS · HANDLER · AGE）+ 分頁,對 prototype 1:1。
2. **Request detail**(`/requests/:id`)—— header（avatar / name / status / meta / SN chip）+ **sync-gate stepper**（account created → Azure synced,由 `accountCreatedAt`/`azureSyncedAt`）+ **request remark**（`rawRequestText`）+ **line items**（每 item stage stepper 短3點/採購6點 + status badge）+ **operational history timeline**（`events`）+ **AI Assist**（coming-soon,見 OD2）,對 prototype 1:1。
3. **寫操作**(OD1 = **B**)—— detail 嘅 action 按鈕 wire 到後端:**Advance stage**（`PATCH …/stage`,採購路徑逐步）· **Assign now**（`PATCH …/assign`,只喺 line item READY + request synced 時 enable;gate/seat 由後端 enforce,前端處理成功/錯誤 toast）· **Mark synced**（`PATCH …/sync`,未 sync 時開 sync gate）。全部 mutation → invalidate query + toast;錯誤 surface 後端 message。**唔做 intake（新 request）**（prototype 無 new-request 按鈕,requests 由 ServiceNow ingested)。

**關鍵利好(已核 service)**:`listRequests()` 實際 return 連 `opco` + `lineItems`;`getRequestDetail()` 連 `opco` + `lineItems{sku}` + **`events`**（完整時間線）—— 比 DTO 聲明豐富,detail 資料**足夠**砌 stepper + timeline。派生 status（In procurement / Blocked·sync / Ready to assign）+ line-item stage count = **client-side 由 lineItems + azureSyncedAt 計**（真數推導,非假數）。

**誠實資料原則(non-negotiable)**:只 bind 真數;缺 endpoint（handler name / AI parse）→ EmptyState / "—" / coming-soon,**絕不砌假數**。

### 1.1 後端資料現況(scope 根據 — 已核 service + schema)

| 前端要 | 來源 | 狀態 |
|---|---|---|
| Requests 列表（+ opco + lineItems） | `GET /fulfilment/requests`（service include opco+lineItems） | ✅ 有（比 DTO 豐富） |
| Request detail（+ lineItems{sku} + events） | `GET /fulfilment/requests/:id` | ✅ 有（含完整 event timeline） |
| 派生 status / line-item stage counts | client 由 lineItems + azureSyncedAt 計 | ✅ 真數推導 |
| sync-gate stepper（account/azure） | request `accountCreatedAt` / `azureSyncedAt` | ✅ 有 |
| request remark | request `rawRequestText` | ✅ 有 |
| **handler name** | list `include` 只 opco+lineItems,**冇 handledBy user** | ❌ name 未 expose → "—"（honest gap;需 users endpoint / 加 include） |
| **AI Assist parse（信心分數）** | `rawRequestText` **唔 auto-parse**（DESIGN §6） | ❌ 無 → coming-soon card,**唔砌假 parse**（OD2） |
| **寫操作 advance / assign / mark synced** | `PATCH …/stage`、`…/assign`、`…/sync` | ✅ **in scope（OD1=B）** — 前端 wire + 錯誤處理;gate/seat 邏輯後端 enforce（W04 已測） |
| **intake（新 request）** | `POST /fulfilment/requests` | ❌ out（prototype 無 new-request UI;requests 由 SN ingested） |

## 2. 明確 out-of-scope（H3 / H6）

| 排除項 | 去向 |
|---|---|
| **後端改動**（加 handledBy include / users endpoint / AI parse） | 純 `apps/web`;vite proxy,唔掂 apps/api |
| **intake（新 request）UI** | prototype 無;requests 由 ServiceNow ingested → 未來 phase 若需 |
| **assign usageLocation picker** | OD1=B 先叫後端自行 resolve（DTO usageLocation optional);resolve fail → 錯誤 surface。專門 picker 留 enhancement |
| **AI Assist 真 parse** | 未來 AI 功能（DESIGN §6 rawRequestText 唔 auto-parse）;本 phase coming-soon |
| **License Assets / Drift 專頁 / Settings / Login** | FE-Assets（待 BE-ledger-read）/ FE-3 |
| **改 token / 加新色 / handoff 以外 primitive** | STOP（H6）先確認 |

> **註（Stepper / Tabs primitive）**:兩者屬 **handoff component inventory**（design-system.md §2,`components/navigation/{Stepper,Tabs}.jsx` + `.prompt.md`）—— 只係「未 wire 入現有畫面」,唔係 handoff 以外嘅新發明。按其 spec 重建 = 允許（同 FE-1 補 StatCard/Card 一樣),唔觸 H6「新 primitive STOP」。

## 3. Open Decisions（✅ 2026-07-09 敲定）

| # | 決策 | 決定 |
|---|---|---|
| **OD1** | 本 phase 讀 vs 寫 | **B — 讀 + 寫**。wire advance stage / assign now / mark synced 到 PATCH;assign gate/seat 由後端 enforce（W04 已測),前端處理成功/錯誤 toast。usageLocation 叫後端 resolve（見 §2） |
| **OD2** | AI Assist card | **A** — render coming-soon card（purple,對 prototype「Preview/coming soon」,**唔砌假 parse 數**） |
| **OD3** | Handler 欄（name 未 expose） | **A** — 顯示 "—"（honest gap,handler name 待後端 include / users endpoint） |

## 4. Deliverables（按 OD1-A 只讀 draft;OD1-B 選中則加寫操作 sub-tasks）

### F1 — types + hooks（擴充 read model）
- **Acceptance**:`api-types.ts` 加 `RequestLineItem`（含 stage timestamps + quoteRef/poRef + optional `sku`）、`RequestEvent`（type/fromStage/toStage/message/createdAt）、`EventType`/擴 `OnboardingRequest`（+ opco + lineItems）+ `RequestDetail`。`hooks/queries.ts` 加 `useRequest(id)`（`GET /fulfilment/requests/:id`）。
- **Effort**:2.5h

### F2 — primitive:Stepper + Tabs（+ timeline compose）（DS-1/6/8）
- **Spec ref**:handoff `components/navigation/{Stepper,Tabs}.jsx` + `.prompt.md`（inline-style spec,唔照抄,重建 1:1）
- **Acceptance**:**Stepper**（`steps current`:短 3 點 / 採購 6 點,current 帶 `--ring-accent`,已完成填 accent）;**Tabs**（filter tabs + count）;operational-history timeline 用既有 primitive + token 組合（dot tone by event type）。全 token;icon lucide。
- **Effort**:4h

### F3 — Requests 列表（`/requests`,DS-4/11）⭐
- **Acceptance**:filter tabs（All/Needs attention/My queue/Procurement/Blocked,client 計數 by lineItems+status）;表格 REQUEST(mono)·TARGET USER(name+upn mono)·OPCO(code)·**LINE ITEMS**(每 stage count Badge,stage→tone)·**STATUS**(派生 label + dot)·HANDLER(OD3)·AGE(relative mono);client 分頁;row→`/requests/:id`。light+dark;對 prototype 1:1。
- **Effort**:5h

### F4 — Request detail（`/requests/:id`,DS-4/11）⭐
- **Acceptance**:header（Avatar brand + name + status Badge + meta[OpCo/Handler/Request mono] + SN chip 外連）;sync-gate stepper（account created / azure synced,由 timestamps;done→ok）;remark card（rawRequestText 引言式）;line items（每 item:name+BASE+×qty / path 標籤 / status Badge / **stage stepper**[短3/採購6,by stage] / action 按鈕[F5 wire]);operational history timeline（events,dot tone by type,mono 時間）;AI Assist coming-soon card（OD2）。light+dark;對 prototype 1:1。
- **Effort**:5h

### F5 — 寫操作（mutations + action 按鈕,OD1=B）⭐ critical path
- **Spec ref**:`assign.service.ts` / `stage.service.ts` gate 語意;DESIGN sync gate
- **Acceptance**:
  - `hooks/mutations.ts`:`useAdvanceStage(requestId)`（`PATCH …/:lineItemId/stage` {toStage}）· `useAssignLineItem(requestId)`（`PATCH …/:lineItemId/assign`）· `useMarkSynced()`（`PATCH …/:id/sync`）—— 各 onSuccess invalidate（detail + list + 若 assign 埋 `/license/drift`）+ toast;onError → toast 後端 message。
  - **Advance stage**:toStage = 由 stage 序推下一步（短:REQUESTED→READY;採購:REQUESTED→QUOTING→OPCO_APPROVED→AWAITING_VENDOR→READY);只採購路徑 / 未到 READY 顯示。
  - **Assign now**:只喺 line item `stage===READY` **且** request `azureSyncedAt` 有值時 enable（否則「Blocked · sync」）;click→assign;成功→line item ASSIGNED（invalidate);錯誤（seat/user/usageLocation/gate）→ toast 後端 message,**唔崩畫面**。
  - **Mark synced**:request `azureSyncedAt` 空時提供;click→sync→gate stepper 更新。
  - button pending 態（spin / disable）;一 view 一 primary（DS-3:主 primary = 該 line item 的 Assign now,其餘 secondary）。
- **H5**:前端 mutation = thin wrapper（無 business logic;gate/seat 邏輯後端 enforce,W04 已測 12 test）→ 前端無 critical-path 邏輯需 unit test;**改以真後端 round-trip 實測**（G3-write:advance 一個採購 item、assign 一個 ready+synced item 見 line item→ASSIGNED + ledger +1、mark synced 開 gate）。
- **Effort**:5h

### F6 — routing + Query 狀態
- **Acceptance**:`/requests/:id` route;list/detail 各 loading（spinner）/ error（LoadError）/ empty（EmptyState:no requests / request not found）;**無假數 / 無 crash**。
- **Effort**:2h

### F7 — DS 自檢 + gate
- **Acceptance**:`.claude/skills/ui-design` DS-1~12 全 ✅（DS-8 stage→tone、DS-5 mono id/time、DS-3 一 view 一 primary、DS-11 對 prototype);lint clean;build 0 error。
- **Effort**:1.5h

## 5. Success Criteria（Phase Gate）

| # | Criterion | Target | Measure | Block? |
|---|---|---|---|---|
| G1 | Build | 0 error | `npm run build -w @uop/web` | Yes |
| G2 | 兩畫面 render（light+dark） | list + detail 對 prototype 一致 | dev + 截圖 | Yes |
| G3 | 真數流通（讀） | list + detail 打後端收真 JSON、render（含 stepper/timeline） | 後端起 + seed（含 line items + events）+ proxy | Yes |
| G3b | **寫 round-trip** | advance stage / assign / mark synced 真後端成功 + 畫面更新（assign 見 line item→ASSIGNED + ledger +1） | 後端 + seed（ready+synced item）實測 | Yes |
| G4 | ui-design DS 自檢 | DS-1~12 全 ✅ | skill 逐條 | Yes（H6） |
| G5 | 誠實狀態 + 錯誤處理 | loading/error/empty + handler "—" + AI coming-soon + assign 錯誤 toast 唔崩;無假數 | 斷後端 / 空 detail / assign 失敗 試 | Yes |
| G6 | Lint | 0 warning | `npm run lint -w @uop/web` | No |

## 6. Risks

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | 派生 status / stage-count 邏輯錯（stage→label map） | Med | Med | 對 DESIGN stage 語意 + prototype 對照;stage→tone 用 design-system.md map |
| R2 | Stepper 步數（短3/採購6）對唔正 stage | Med | Med | 由 `procurementRequired` 決 3 vs 6;current index by stage order（LEGAL_TRANSITIONS 序） |
| R3 | detail 畫面偏離 prototype（H6） | Med | High | browser render prototype 對照;G4 DS-11 |
| R4 | seed 未含 line items + events → G3 驗唔到 stepper/timeline | Med | Med | 擴 seed（本地 dev DB,唔 commit）加 line items + events |
| R5 | 手多做埋寫操作（scope creep OD1） | Med | Med | 守 OD1 決定;A 則 action 按鈕 disabled,唔 wire PATCH |

## 7. Day-by-Day（rough）

| Day | Focus | Deliverables |
|---|---|---|
| D1 | types + hooks + Stepper/Tabs primitive | F1, F2 |
| D2 | Requests 列表（filter tabs + 表格 + 派生 status）+ Request detail 讀 | F3, F4 |
| D3 | 寫操作（advance/assign/sync mutations + 錯誤處理）+ routing/狀態 + DS 自檢 + gates | F5, F6, F7 |

## 8. Dependencies on Prior Phase

FE-1 data layer（api.ts / queries.ts / api-types.ts / vite proxy）+ primitive（Card/Badge/EmptyState/StatCard）+ feedback-states（Loading/LoadError）+ format helper。後端 `/fulfilment/requests*` 在線 + 本地 seed（擴 line items + events）供 G3。

## 9. Plan Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-09 | Initial draft（FE-2 Requests list + detail,只讀 default） | FE-1 完,前端第二組畫面 | Chris Lai |
| 2026-07-09 | Approved → active;**OD1 = B（讀+寫）**（加 F5 寫層:advance/assign/sync mutations + 錯誤處理 + G3b round-trip gate);OD2/OD3 = A。intake 仍 out | Chris 揀 B | Chris Lai |

---

**Lifecycle reminder**:plan locked after status=active。deviation → §9 changelog + progress;approve 前唔 code（R1）。**H6**:偏離設計 → 先確認。**誠實資料**:缺 endpoint 一律 EmptyState/coming-soon,絕不砌假數。
