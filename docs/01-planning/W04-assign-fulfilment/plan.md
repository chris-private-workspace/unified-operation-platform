---
phase: W04-assign-fulfilment
name: "Module D-2 — 履行動作（sync gate → assign → ledger → 回寫 ServiceNow）"
sprint_week: W04
start_date: 2026-07-09
end_date: 2026-07-16          # planned, may slip with changelog log
status: active               # draft | active | closed
spec_refs:
  - docs/02-architecture/licenseops/DESIGN.md §5 State 模型 & Reconciliation（ledger assignedQuantity）
  - docs/02-architecture/licenseops/DESIGN.md §7 Request 生命週期（→ASSIGNED / sync gate）
  - docs/02-architecture/licenseops/DESIGN.md §8 Integration Layer（findUser / assignLicense / addWorkNote）
  - apps/api/prisma/schema.prisma（RequestLineItem.assignedAt / OpcoSkuLedger.assignedQuantity / Request.azureSyncedAt）
  - apps/api/src/integration/graph/graph.service.ts · servicenow/servicenow.service.ts
  - apps/api/src/fulfilment/stage.service.ts（aggregateRequestStatus — forward-compat COMPLETED）
prior_phase: W03-request-lifecycle
---

# Phase W04 — Module D-2：履行動作

> **Plan version**:1.0（draft）
> **Owner**:Chris Lai
> **Approved by**:Chris Lai(2026-07-09)

## 1. Scope

W03（D-1）起咗 request 生命週期骨架,但**刻意唔掂任何 external side-effect**。本 phase = D-2 = 履行動作,把一條 **`READY`** line item 真正 assign 出去:過 **Phase 1 sync gate** → **Graph `assignLicense`** → line item `→ASSIGNED` → **`OpcoSkuLedger.assignedQuantity` +1**（同 W02 對帳直接扣返）→ **回寫 ServiceNow**。

呢個係全 LicenseOps 最硬 critical path:首次寫 ledger、首次掂真 M365 tenant（`assignLicense` 會實際改動 seat）。所有邏輯由 H5 test 覆蓋,**一律 mock,唔打真 tenant**（§3.4 / H5）。

**對齊 spec 嘅語意**:
- **Phase 1 sync gate**（DESIGN §7 / CLAUDE.md §13）:assign 前 `Request.azureSyncedAt` 必須有值 **且** `findUser(targetUpn)` 唔 null —— 兩者任一未過就唔 assign。
- **只有 `assignedQuantity` 動**（DESIGN §5）:assign = ledger `assignedQuantity` +1;`allocatedQuantity`（budget）唔郁。
- **stage 掛 line item**:`→ASSIGNED` 只推該條 line item;`Request.status` 由 `aggregateRequestStatus` 聚合（可能 → `COMPLETED`）。
- **ServiceNow = mirror**:回寫 work note 係反映,唔擁有;回寫失敗唔 rollback 已成功嘅 assign。

## 2. 明確 out-of-scope（H3 — 唔可以順手做）

| 排除項 | 去向 |
|---|---|
| **對回機制**（drift 差異落邊個 OpCo） | DESIGN §10 deferred |
| **Excel `allocatedQuantity` import** | 另議（無數據源） |
| **offboarding / license 回收 / 撤銷 assign** | out-of-scope（DESIGN §2） |
| **auth guard** | AUTH phase;endpoint 暫 unguarded + `// TODO(auth): @Roles` |
| **自動 assign（一 approve 就自動履行）** | 本 phase 人手 trigger;自動化留 orchestration phase |
| **前端** | backend-first,前端 phase 另起 |

## 3. Open Decisions（✅ 2026-07-09 敲定:全照 default）

| # | 決策 | 決定（= default） |
|---|---|---|
| **OD1** | assign 掂真 tenant 點測 | **全 mock,唔打真 tenant**（同 W02/W03;`assignLicense` 實際改動 → test 一律 mock GraphService）;真 assign 屬 operational |
| **OD2** | assign 後 domain writes 一致性 | **用 `$transaction`**（Graph assign 成功**後**開 tx,一次過寫 line item `ASSIGNED` + ledger +1 + `ASSIGN` event + status；任一 fail 全 rollback）。落實 W03 carry-over 技術債 |
| **OD3** | assign 前 seat 可用量檢查 | **查**（`getSubscribedSkus` 揾該 SKU,`consumedUnits < prepaidEnabled` 先 assign;無空 seat → 明確拒,避免 Graph fail）DESIGN §8 |
| **OD4** | ServiceNow 回寫時機 | assign + ledger 成功**後** `addWorkNote`;**回寫失敗唔 rollback**（assign 已成功,SN 只 mirror）→ log warning。真回寫對齊 OD5(W03) SN table/field |
| **OD5** | `usageLocation` 來源 | user 現有優先 → 否則 DTO 提供（傳俾 `assignLicense` options,佢內建 set）→ 都無 → 明確拒（`assignLicense` 會 fail） |
| **OD6** | Phase 1 sync gate 點開閘（本機無真 n8n） | 加 `PATCH .../sync` endpoint 模擬 Phase 1 回寫（set `azureSyncedAt` + `accountCreatedAt` + `SYNC` event）,令 assign flow 可 end-to-end 行到 |

## 4. Deliverables

### F1 — Sync 標記（模擬 Phase 1 回寫）
- **Spec ref**:DESIGN §7（sync gate）;`Request.azureSyncedAt` / `accountCreatedAt`
- **Dependencies**:W03（Request / RequestEvent）
- **Acceptance criteria**:
  - `markSynced(requestId)`:set `azureSyncedAt` + `accountCreatedAt`（若空）+ 寫 `RequestEvent(SYNC)`。
  - **Test（H5）**:set 時間戳 + event;request 不存在 → NotFound。
- **Effort**:1.5h · **Owner**:AI

### F2 — AssignService.assignLineItem ⭐⭐ critical path
- **Spec ref**:DESIGN §5 / §7 / §8;`GraphService.findUser/assignLicense`;`OpcoSkuLedger`
- **Acceptance criteria**:
  - 前置 gate（順序,任一 fail 明確拒,唔改 state）:① line item `stage === READY` ② `request.azureSyncedAt` 有值 ③ `findUser(targetUpn)` 唔 null ④ seat 可用（OD3）⑤ `usageLocation` resolve（OD5）。
  - Graph `assignLicense(targetUpn, sku.skuId, { usageLocation })` 成功後,**`$transaction`**（OD2）:line item `→ASSIGNED` + `assignedAt`;`OpcoSkuLedger` upsert（`opcoId_skuCatalogId`）`assignedQuantity` +1;`RequestEvent(ASSIGN)`;recompute `Request.status`（`aggregateRequestStatus`,可能 `COMPLETED`）。
  - assign 後 `addWorkNote` 回寫（OD4,non-fatal）。
  - **H4**:唔 log target UPN（PII）;唔 log Graph secret。
  - **Test（H5,critical path）**:happy path（ledger +1 / stage ASSIGNED / event / status→COMPLETED / SN 回寫）;每個 gate 失敗（非 READY / 未 sync / user null / 無 seat / 無 usageLocation）拒且唔改 state;`assignLicense` throw → 唔開 tx、唔改 ledger;SN 回寫 throw → assign 仍成功。GraphService / ServiceNowService / Prisma 全 mock。
- **Effort**:5h · **Owner**:AI

### F3 — Controller + DTO + OpenAPI
- **Acceptance criteria**:
  - `PATCH /fulfilment/requests/:id/sync`、`PATCH /fulfilment/requests/:id/line-items/:lineItemId/assign`（body 可選 `usageLocation`）。
  - `@ApiTags('fulfilment')` + response DTO;`// TODO(auth): @Roles`。
  - **Acceptance**:boot → route 現 `/docs/api`。
- **Effort**:2h · **Owner**:AI

### F4 — Test 收尾 + lint
- **Acceptance criteria**:
  - `assign.service.spec.ts`（+ sync）全綠;GraphService / ServiceNowService / Prisma mock,**唔打真 tenant**（H5 / §3.4）。
  - `npm run test` 全綠;`npm run lint` clean。
- **Effort**:1.5h · **Owner**:AI

## 5. Success Criteria（Phase Gate）

| # | Criterion | Target | Measure | Block closeout? |
|---|---|---|---|---|
| G1 | Build passes | 0 error | `npm run build` | Yes |
| G2 | H5 tests pass（assign critical path + 每 gate 失敗覆蓋） | 全綠 | `npm run test` | Yes |
| G3 | Endpoints serve | route 現 `/docs/api` | boot + `curl` | Yes |
| G4 | Lint clean | 0 warning | `npm run lint` | No |

## 6. Risks（Phase-Specific）

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | `assignLicense` 掂真 tenant（實際改動 seat） | — | High | **一律 mock**（H5）;真 assign 屬 operational,非本 phase gate（H4：唔 log secret/UPN） |
| R2 | Graph assign 成功但 DB tx fail → 已 assign 但 ledger 冇 +1 | Low | Med | `$transaction`（OD2）保 DB 側原子;Graph↔DB 之間裂縫 → **W02 reconcile 會偵測到 drift**（安全網）;log warning |
| R3 | SN 回寫 fail | Med | Low | non-fatal（OD4）,唔 rollback assign,log warning |
| R4 | user 無 `usageLocation` 且 DTO 冇提供 | Med | Med | 明確拒（OD5）+ 清楚 error;`assignLicense` 內建 set（若提供） |
| R5 | SN table/field 未對齊 Phase 1（承 W03 OD5） | High | Low | 回寫用預設 + mock;真回寫對齊屬 operational |

## 7. Day-by-Day Breakdown（rough）

| Day | Date | Focus | Deliverables |
|---|---|---|---|
| D1 | 2026-07-09 | Sync 標記 + AssignService gate 鏈 + Graph assign | F1, F2（部分） |
| D2 | 2026-07-10 | `$transaction`（ledger +1 + event + status）+ SN 回寫 + test（critical path） | F2 |
| D3 | 2026-07-11 | Controller/DTO + test 收尾 + gates | F3, F4, G1–G4 |

## 8. Dependencies on Prior Phase

W01（Graph/ServiceNow client）+ W02（`OpcoSkuLedger` / reconcile 安全網）+ W03（`RequestLineItem` `READY` / `aggregateRequestStatus` / `RequestEvent`）。全部就緒。

## 9. Plan Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-09 | Initial draft（D-2 履行動作） | W03 D-1 完成,W04 = D-2 kickoff | Chris Lai |
| 2026-07-09 | Approved → status active;OD1–OD6 全照 default（mock / $transaction / seat check / SN non-fatal / usageLocation / markSynced） | Chris approve 開工 | Chris Lai |

---

**Lifecycle reminder**:plan locked after status=active。重大 deviation → 第 9 節 changelog + progress Day-N;approve 前唔 code（R1）。
