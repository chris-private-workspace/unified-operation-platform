---
phase: W23-assets-manual-ledger
status: closed
---

# W23-A — OpCo ledger 手動管理(backend + audit) — Progress

## Day 0（2026-07-14）— kickoff + D1–D5 同日完成
- **Approve**:ADR-0007 Proposed → **Accepted**(Chris);plan draft → **active**。拆 W23-A(backend+audit)/ W23-B(frontend,後續)。五決策拍板(plan §5)。
- **D1**:schema `LedgerAdjustment`(additive)+ relations;migration `20260714104258_add_ledger_adjustment` applied + generate;`GET /license/ledger` row 已有 `id`(W14,唔使改)。
- **D2**:`ledger-write.dto`(allocatedQuantity?/assignedQuantity? @Min(0)/reason?)+ `ledger-write.service`(load→assertOpcoScope→逐欄 diff→$transaction[update + LedgerAdjustment×N];no-op/404/400)+ `PATCH /license/ledger/:id` `@Roles(ADMIN,REGIONAL,OPCO_IT)` + module 註冊。
- **D3**:`ledger-write.service.spec`(8 test:各欄獨立 · 對回 assigned · 兩欄→2 audit · OPCO_IT 自己 200/別人 403 · 空 body 400 · 404 · no-op)。
- **D4**:DESIGN §5(assigned 語意擴展 + 對回 + 分層真相)/ §6(LedgerAdjustment 落地)/ §10(對回機制 activated)。
- **D5**:build 0 · lint 0(--fix)· **test 157→165**;live curl(set assigned=5→200 headroom 656 · 負數 400 · 空 body 400 · LedgerAdjustment DB 記錄 · seed 復原)。

## Closeout（status=closed）

### Acceptance verification（plan §4 gates）
| Gate | 結果 |
|---|---|
| G1 schema migrate + row id | ✅ migration applied;additive 不動舊數據;row 已有 id |
| G2 write live(絕對值/各欄獨立) | ✅ live PATCH set assigned=5→200;各欄獨立 test 驗 |
| G3 scope 403 fail-closed | ✅ test:OPCO_IT 改別人 403,無寫;ADMIN 全部 |
| G4 audit LedgerAdjustment | ✅ live DB(field/before→after/actor)+ test |
| G5 H5 test green | ✅ api 165(+8) |
| G6 對帳不破 | 〜 reconcile 邏輯不變;Σ assigned 隨手動編輯自然反映;既有 reconcile spec 覆蓋(未 live 跑 reconcile — Graph 未配 503) |
| G7 over-alloc flag 不 block/負數擋 | ✅ over-alloc 唔擋;負數 400 |
| G8 regression | ✅ import/assign/opco-scope spec 全 PASS;ledger-read 加 id 不破 |

全 gate 過(G6 邏輯論證 + 既有覆蓋)。

### Lessons
- **DESIGN 預留擴展點值錢**:§10 對回機制 + §6 LedgerAdjustment 早已明文預留,今次只係 activate,ADR 敘事順、無推翻 locked 決策。
- **row id 已在**:W14 當時已 return `id`,frontend inline edit(W23-B)嘅 target 免補。
- **live + unit 分工**:happy/invariant/audit 用 live curl 即證;scope 403 / 各欄獨立 / no-op 用 unit(mock prisma)覆蓋 —— 唔靠估。

### Carry-overs → W23-B(frontend,另 kickoff)
- Assets **By-OpCo** 表 inline edit(受控 cell + 一個 primary Save + `useUpdateLedger` mutation `apiPatch` + toast/refetch);OPCO_IT 只見/改自己行(W22 useMe role gating);light+dark;H6。
- consume 已有 `PATCH /license/ledger/:id`(回更新後 row,frontend 直接 refetch ledger + tenant-skus query)。
- Platform mode 維持唯讀(owned/consumed = Graph 真相)。

---

**End of W23-A progress**
