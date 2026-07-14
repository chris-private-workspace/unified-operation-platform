---
phase: W23-assets-manual-ledger
name: "W23-A(backend + audit) — OpCo ledger 手動管理:PATCH endpoint + LedgerAdjustment audit + 對回機制啟動"
sprint_week: W23
backlog_id: LEDGER-MANUAL (W23-A backend / W23-B frontend)
start_date: 2026-07-14
end_date: TBD
status: closed           # draft → active → closed(D1–D5 同日完成,gates 全過,api 157→165)
adr: ADR-0007 (Accepted)
spec_refs:
  - docs/adr/0007-opco-ledger-manual-management.md（架構解鎖記錄,Accepted）
  - docs/02-architecture/licenseops/DESIGN.md §5(對帳/兩層數字)·§6(LedgerAdjustment 預留)·§10(對回機制 deferred)
  - CLAUDE.md §5.1 H1(ledger 語意/寫入路徑 locked)·§5.5 H5(critical path test)·§5.4 H4(audit 唔 log PII)
  - apps/api/src/license/{ledger-read,allocation-import,tenant-owned}.service.ts（現有 read/寫入路徑）
  - apps/api/src/fulfilment/assign.service.ts:150-163（assigned +1 語意,不動）
  - apps/api/src/auth/opco-scope.ts（scopeWhere / assertOpcoScope）
prior_phase: W22-auth-frontend-role
---

# Phase W23-A — OpCo ledger 手動管理(backend + audit)

> **Plan version**:1.0(**active** — Chris approve 2026-07-14)· **Owner**:Chris Lai · **ADR**:ADR-0007(Accepted)
> **緣起**:Microsoft tenant 只有 tenant 層總量真相(owned+consumed,Graph 自動),唔知內部 OpCo 劃分;採購唔喺平台走。故 By-OpCo 層 allocated+assigned 需人手管理。啟動 DESIGN 兩個預留擴展點(§10 對回機制 · §6 LedgerAdjustment audit)。
> **拆階段(§5 #3 決策)**:**W23-A = backend + audit(本 plan)**,落完可 curl 端到端驗;**W23-B = frontend Assets inline edit**(closeout 後另 kickoff)。

## 0. 前置 gate — ✅ 已過
- ADR-0007 Proposed → **Accepted**(Chris,2026-07-14)✅
- 本 plan draft → **active**(Chris approve)✅
- 五個設計決策拍板(見 §5)✅ → 開 D1。

## 1. Scope

### In(W23-A)
- **Schema(additive)**:新 `LedgerAdjustment` model(ledgerId/field/before→after/reason/actorId/createdAt)+ relation(`OpcoSkuLedger.adjustments`、`AppUser.ledgerAdjustments`)+ migration。**無改現有欄位**。
- **Backend 單筆 write** `PATCH /license/ledger/:id`(set `allocatedQuantity` / `assignedQuantity` 絕對值,各欄獨立、可只改一欄):
  - scope:ADMIN/REGIONAL 全部;OPCO_IT `assertOpcoScope` 只改自己 OpCo(**fail-closed 403**)。
  - invariant:非負整數(同 import `toQuantity`);over-allocation **flag 不 block**。
  - 每個變動欄寫一筆 `LedgerAdjustment`(before→after + actorId + reason),同 update 喺**一個 transaction**。
- **`GET /license/ledger` row 加 `id`**(frontend inline edit target 需要;純加欄,不改語意)。
- **DESIGN.md** §5/§6/§10 更新(對回機制 activated · LedgerAdjustment 落地 · assigned 語意擴展)。
- **Tests(H5)**:見 §4 G5。

### Out(→ W23-B 或明確唔做)
- **Frontend Assets inline edit UI** → **W23-B**(下一 phase)。
- Platform mode 唯讀性質(owned/consumed = Graph 真相,維持唯讀)。
- fulfilment assign 邏輯(W04 assign +1 不動)。
- 對帳/drift 演算法(Σ assigned vs consumed 不變)。
- over-allocation 硬 gate / 審批鏈(H3 out)。
- ledger row 新增/刪除(本 phase 只 edit 已存在 row 數量)。

## 2. Approach

- **新 service** `ledger-write.service.ts`:`updateLedgerRow(actor, id, dto)` → load row(404 if 冇)→ `assertOpcoScope(actor, row.opcoId)` → 逐欄 diff(只處理 dto 有畀嘅欄)→ `$transaction`(update ledger + 每個變動欄插 `LedgerAdjustment`)。回更新後 row(含 headroom/overAllocated,重用 ledger-read 映射)。
- **DTO** `ledger-write.dto.ts`:`allocatedQuantity?` / `assignedQuantity?`(`@IsInt @Min(0) @IsOptional`)+ `reason?`(`@IsString @IsOptional @MaxLength`)。service 層驗「至少一欄」。
- **Controller**:`license.controller.ts` 加 `@Patch('ledger/:id')`,`@Roles(ADMIN, REGIONAL, OPCO_IT)`(OPCO_IT 靠 service `assertOpcoScope` 收窄,唔喺 role layer 排除 —— 佢要改自己 OpCo)。
- **驗證**:build/lint/test + **live curl** ADMIN 改任意 OpCo、OPCO_IT 改自己 200 / 改別人 403、adjustment 有記錄、各欄獨立、over-alloc flag 正確、非負 invariant。

## 3. Deliverables
- **D1** — schema `LedgerAdjustment` + relations + migration;`GET /license/ledger` row 補 `id`。
- **D2** — `ledger-write.service` + `ledger-write.dto` + `PATCH /license/ledger/:id` + module 註冊。
- **D3** — H5 tests(§4 G5)。
- **D4** — DESIGN.md §5/§6/§10 更新。
- **D5** — verify(build/lint/test + live curl 對照)+ BACKLOG/memory 同步 + progress retro + plan closed + **W23-B kickoff carry**。

## 4. Phase Gates
- **G1** schema:`LedgerAdjustment` migrate 成功;現有 ledger 數據不動(additive);`GET /license/ledger` row 有 `id`。
- **G2** write live:ADMIN set allocated/assigned 絕對值成功;各欄可獨立只改一欄;回更新後 row。
- **G3** scope fail-closed:OPCO_IT 改自己 OpCo 200;改**別人** 403;ADMIN/REGIONAL 全部可。
- **G4** audit:每個變動欄產生一筆 `LedgerAdjustment`(before→after + actorId + reason);import/assign 不受影響。
- **G5** H5 test:write service(scope 403 / 非負 invariant / adjustment 寫入 / 各欄獨立 / 唔碰另一欄 / 至少一欄 / 404)+ 端到端;**api 157→+N** 全綠。
- **G6** 對帳不破:改 assigned 後 `Σ assigned vs consumed` drift 正確反映;Platform tenant-skus 加總隨之。
- **G7** over-allocation:兩個 flag 正確跳,**不 block** 寫入;非負 invariant 擋負數。
- **G8** regression:import/assign 仍 work;ledger-read 加 id 不破 W22 前端;dev-bypass regression。

## 5. 設計決策(Chris 拍板 2026-07-14)— 全 locked
1. **手動 assigned = set 絕對值**,fulfilment assign 繼續自動 +1 並存。✅
2. **over-allocation flag 不 block**(誠實呈現,唔硬 gate);寫入只擋負數。✅
3. **拆階段:W23-A(backend+audit)/ W23-B(frontend inline edit)**。✅
4. **`LedgerAdjustment` 只記逐格人手編輯**(import/assign 唔入此表,各有自己 audit)。✅
5. **Platform 措辭修正**:doc/UI 統一「Platform = tenant 真相 owned+consumed(自動);By-OpCo = 內部帳 allocated+assigned(手動)」。✅

## 6. Risks / 誠實限制
- **assigned 可信度**:人手可改後唔再係純自動衍生;靠 `LedgerAdjustment` audit + 對帳 drift 兜返準確性。
- **OPCO_IT 首次有 ledger 寫能力**(之前 import 喺 role layer 完全排除佢)→ `assertOpcoScope` 必守實,H5 必覆蓋改別人 OpCo 403。
- **over-allocation 不 block**:可能出現 Σ allocated > owned;靠 flag 呈現(設計選擇 §5.2)。

## 7. Changelog
- 0.1(2026-07-14)— draft;ADR-0007 起草(Proposed)+ plan 起草(backend+frontend 一份)。
- 1.0(2026-07-14)— **active**;Chris approve(ADR→Accepted · plan→active · 五決策拍板)。**拆 W23-A(本 plan,backend+audit)/ W23-B(frontend,後續)**;frontend deliverable 移出 → W23-B。開 D1。
- 1.1(2026-07-14)— **closed**;D1–D5 同日完成,G1–G8 全過(G6 邏輯論證)。`LedgerAdjustment` + `PATCH /license/ledger/:id`(scope 403 · invariant · audit · 各欄獨立)。api 157→**165** test;live curl 端到端 + DB audit 驗。DESIGN §5/§6/§10 更新。**carry → W23-B**(frontend inline edit)。commit 待指示。
