---
phase: W07-fe-requests
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: closed    # in-progress | closed
---

# Phase W07(FE-2)— Progress

> Daily progress + 結尾 retro。
> 每 commit 必須對應一個 Day-N entry mention（R2 binding rule per PROCESS.md §5）。

---

## Day 0 — 2026-07-09: Kickoff

**Action**:Phase W07（FE-2）kickoff —— Requests 列表 + Request detail。

- **H6 對齊 + prototype ground**:browser render prototype（本地靜態 server serve `design_handoff .../prototype/`，claude-in-chrome 唔食 file://）抽 **Requests list** + **Request detail** 兩個畫面。
  - **list**:filter tabs（All/Needs attention/My queue/Procurement/Blocked + count）+ 表格（REQUEST·TARGET USER·OPCO·LINE ITEMS[每 stage count badge]·STATUS[派生 label]·HANDLER·AGE）+ 分頁。
  - **detail**:header + **sync-gate stepper** + **request remark** + **line items**（每 item stepper 短3/採購6 + status + action 按鈕）+ **operational history timeline** + **AI Assist**（標明 Preview/coming soon,parse 數係 demo 假數）。
- **後端 ground（已核 service + schema）**:`listRequests()` 實際 include **opco + lineItems**;`getRequestDetail()` 連 **lineItems{sku} + events**（完整 timeline）—— 比 DTO 豐富,detail 資料足夠砌 stepper + timeline。派生 status / stage counts = client 由 lineItems + azureSyncedAt 計（真數推導）。
  - ⚠️ **缺口**:handler **name** 未 expose（list include 冇 handledBy user）→ "—"（OD3）;**AI parse** 無 endpoint（rawRequestText 唔 auto-parse,DESIGN §6）→ coming-soon（OD2,唔砌假數）;**寫操作**（advance/assign/sync/intake）endpoint 存在但掂 critical path → **OD1**（讀 vs 寫）。
- **primitive**:需補 **Stepper + Tabs**（屬 handoff inventory,非新發明 → 按 spec 重建允許,見 plan §2 註）。
- `plan.md` 填好,status=`draft`（**等 Chris approve + 定 OD1–OD3**）。
- `checklist.md` derived（F1–F6）。
- Carry-over:FE-1 data layer / primitive / feedback-states / format 可重用;2 flag（Avatar / npm vuln）未郁;License Assets 待 BE-ledger-read。

**Commit**:_(pending — kickoff 待 approve 後連 code 一併 closeout)_

**下一步**:Chris review plan → 定 OD1（讀 vs 寫)/OD2/OD3 → approve flip `active` → 由 F1 開工。

---

## Day 1 — 2026-07-09

**Chris approve plan → status `active`;OD1 = B（讀 + 寫）、OD2/OD3 = default A。** phase 放大:加 F5 寫層（advance/assign/sync mutations + 錯誤處理 + G3b round-trip gate）。deliverables 變 F1–F7。

- **同步**:plan §1/§1.1/§2/§3/§4/§5/§9、checklist（F4 action wire、加 F5 寫層、renumber F6/F7）、BACKLOG。

### Done（F1–F7 一日內完成）
- **F1 ✓**:`api-types.ts` 擴（`RequestLineItem`/`RequestEvent`/`EventType`/`OpcoRef`/`LineItemSkuRef` + 擴 `OnboardingRequest`[+opco+lineItems] + `RequestDetail`）;`queries.ts` 加 `useRequest(id)`。
- **F2 ✓**:`Stepper`（短3/採購6 點,current ring-accent,對 handoff `Stepper.jsx`）+ `Tabs`（filter + count pill,對 `Tabs.jsx`）。`lib/requests.ts`（stage steps/tone/label + `deriveStatus` + `stageCounts` + `matchesFilter`）。
- **F3 ✓** Requests 列表（`/requests`）:Tabs filter（All/Needs attention/Procurement/Blocked,**client 計數**;**My queue 略去** — 需 current-user/AUTH,honest gap）+ 表格（REQUEST mono·target+upn·opco code·**stage count badges**·**派生 status**+dot·handler·age mono）+ 分頁 + row→detail。
- **F4 ✓** Request detail（`/requests/:id`）:header（brand avatar + status + meta + SN chip）+ **sync-gate**（account/azure,by timestamps）+ remark + **line items**（BASE badge via `useCatalog` lookup、短3/採購6 stepper、status badge、action 按鈕）+ **operational timeline**（events,dot tone by type）+ **AI coming-soon**（OD2,唔砌假 parse）。
- **F5 ✓** 寫操作（`hooks/mutations.ts`:`useAdvanceStage`/`useAssignLineItem`/`useMarkSynced`,各 invalidate + per-call toast;`api.ts` 加 `apiPatch`,錯誤 surface 後端 message）。Assign 只 READY+synced enable;否則「Blocked · sync」。
- **F6 ✓** routing（`/requests` + `/requests/:id`;shell 感知 nested route:top-bar title「Request detail」+ sidebar active startsWith）+ Query 狀態（loading/error/「Request not found」EmptyState）。
- **F7 ✓** DS 自檢 + lint + build（見下）。

### Gates
- **G1 build ✓**（1667 modules;CSS 18.74kB）· **G6 lint ✓**（`--fix` + react-hooks warning 修）。
- **G2 render light+dark ✓**:list + detail 兩 theme（截圖對 prototype 1:1;派生 status 完全對得上 prototype 各 row）。
- **G3 真數流通（讀）✓**:seed 擴 5 request / 10 line item / 12 event;list + detail render 真數（stepper/timeline/派生邏輯）。
- **G3b 寫 round-trip ✓（部分）**:**Advance stage 端到端通**（Copilot QUOTING→OPCO_APPROVED:stepper 2/6→3/6 + timeline 加 STAGE_CHANGE event + list 反映「approved」）;**Mark synced 端到端通**（REQ-2048:sync gate 開綠剔 + status Blocked·sync→Triage + Blocked tab count 1→0 + timeline 加 SYNC event）。**Assign 成功路徑本地驗唔到**（呼真 Graph,placeholder creds → findUser fail;成功邏輯 W04 12 test 覆蓋）。
- **G5 誠實狀態 ✓**:loading/error/「Request not found」;handler「Unassigned」;AI coming-soon;My queue 略去。**Assign 前端 fail-closed 正確**（line item 冇變 state,畫面冇崩）。

### 🔴 FE-2 測試揭出後端 bug（BUG-002 候選,非 FE-2 修）
- **現象**:click Assign now（本地 placeholder Graph creds）→ 後端 `GraphService.findUser` throw MSAL error（`AADSTS700038 not a valid application identifier`)→ 該 error **未被 wrap 成 HttpException**,帶住 invalid status(-1)傳到 Express → **NestJS process crash**（`RangeError: Invalid status code: -1` @ `ExceptionsHandler.handleUnknownError`）。
- **根因**:`assign.service.ts` gate 假設 `findUser` **return null**,但 Graph auth/transient error 係 **throw**;未 catch → 崩。W04 test 全 mock findUser（return value）故無覆蓋 throw 路徑。
- **影響**:critical path robustness —— 生產環境 Graph 出錯（throttle/timeout/auth 過期）會令整個 API crash。
- **歸屬**:**後端 bug,非 FE-2**（前端已正確 fail-closed + 會 toast）。已交 owner 定（BUG-002 候選,BACKLOG）。**未擅改**（符合 surgical + scope:FE-2 = 前端;critical-path 後端修需獨立 BUG + H5 test）。

### DS 自檢（DS-1~12）
- DS-1 token-only ✅（stepper ring = `shadow-[0_0_0_3px_var(--accent-soft)]` 引 token var,非 hardcode 色）· DS-2 唔 eyeball ✅（Stepper/Tabs 對 handoff .jsx 重建 + prototype 對照）· DS-3 單一 accent ✅（一 view 一 primary:synced→Assign now / 未 synced→Mark synced;**1 note**:多個 ready+synced item 會多個 Assign primary,同 prototype 一致,罕見）· DS-4 light+dark ✅ · DS-5 mono ✅（id/upn/GUID/time/step count）· DS-6 lucide ✅ · DS-7 平面 ✅ · DS-8 semantic ✅（stage/status/event 全走 6 tint）· DS-9 motion ✅（只 spin）· DS-10 voice ✅ · DS-11 對 prototype ✅（list+detail 1:1;派生 status 對得上）· DS-12 唔捏 logo ✅。**0 hard flag**（Avatar gradient = W05 承前 flag）。

**Commit**:_(pending — 待 Chris approve commit+push)_

**下一步**:Chris approve → closeout commit + push;BUG-002 定係咪即修。W07 closed 後下一個 = FE-3 或 BUG-002。

---

**End of W07 progress（Day 1）**
