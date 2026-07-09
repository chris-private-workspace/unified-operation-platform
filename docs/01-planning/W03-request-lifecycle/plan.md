---
phase: W03-request-lifecycle
name: "Module D-1 — Request 生命週期骨架（intake → triage → stage 推進）"
sprint_week: W03
start_date: 2026-07-09
end_date: 2026-07-16          # planned, may slip with changelog log
status: active               # draft | active | closed
spec_refs:
  - docs/02-architecture/licenseops/DESIGN.md §6 Domain Model（Request / RequestLineItem / RequestEvent）
  - docs/02-architecture/licenseops/DESIGN.md §7 Request 生命週期
  - docs/02-architecture/licenseops/DESIGN.md §8 Integration Layer（ServiceNowService）
  - docs/architecture.md §3 四層地基（Orchestration / Action layer）
  - apps/api/prisma/schema.prisma（Request / RequestLineItem / RequestEvent / LineItemStage / RequestStatus / EventType）
  - apps/api/src/integration/servicenow/servicenow.service.ts
prior_phase: W02-catalog-reconcile
---

# Phase W03 — Module D-1：Request 生命週期骨架

> **Plan version**:1.0（draft）
> **Owner**:Chris Lai
> **Approved by**:Chris Lai(2026-07-09)

## 1. Scope

Module D 履行流程好大,本 phase 取**前半 = 純 internal state machine**:由 ServiceNow onboarding request 建 `Request` + 人手拆 `RequestLineItem` + triage（短路 / procurement）+ **stage 推進**（procurement 段人手推進,每步寫 `RequestEvent`）+ `Request.status` 聚合。全部行為由 H5 test 覆蓋。

**刻意唔掂任何 external side-effect** —— 唔 call Graph `assignLicense`、唔寫 `OpcoSkuLedger.assignedQuantity`、唔真回寫 ServiceNow、唔行 `ASSIGNED` transition。呢啲全部歸 **W04 = D-2**（掂真 M365 / ledger / SN 回寫,最硬 critical path,同 W02 對帳扣返一齊）。

**對齊 spec 嘅語意**:
- **stage 掛喺 `RequestLineItem`,唔係 `Request`**（DESIGN §6）—— 一張單不同 SKU 可以喺唔同 stage;`Request.status` 係聚合。
- **兩條路徑**（DESIGN §7）:短路 `REQUESTED → READY`;procurement `REQUESTED → QUOTING → OPCO_APPROVED → AWAITING_VENDOR → READY`。**`→ ASSIGNED` 留 D-2**（因為 assign 掂 Graph + ledger）。
- **`rawRequestText` 唔自動 parse**（DESIGN §6:人手判讀 → 未來 AI 抽結構化清單）—— line item 由 operator 經 API 手動加。
- **`RequestEvent` = 平台自己 operational 歷史**（stage 轉換 / note）,唔同 ServiceNow ITSM audit。

## 2. 明確 out-of-scope（H3 — 唔可以順手做,全歸 W04 = D-2 或其他 phase）

| 排除項 | 去向 |
|---|---|
| **sync gate check + Graph `assignLicense`** | W04 = D-2 |
| **更新 `OpcoSkuLedger.assignedQuantity`（+1 on assign）** | W04 = D-2（同 W02 對帳扣返） |
| **回寫 ServiceNow（`updateRecord` / `addWorkNote` 真寫）** | W04 = D-2 |
| **`ASSIGNED` stage transition + `Request.status = COMPLETED`** | W04 = D-2 |
| **自動 poll ServiceNow 新單** | orchestration phase（`@Cron`） |
| **free-text remark 自動抽 SKU 清單** | 未來 AI（DESIGN §11 🔮） |
| **auth guard** | AUTH phase;endpoint 暫 unguarded + `// TODO(auth): @Roles` |
| **前端** | backend-first,前端 phase 另起 |

## 3. Open Decisions（✅ 2026-07-09 敲定:D-1 拆法 + 全照 default）

| # | 決策 | 決定（= default） |
|---|---|---|
| **OD1** | Module D 拆法 | **拆兩個**:W03 = D-1（本 plan,無 side-effect）、W04 = D-2（assign + ledger + 回寫）。理由 = 隔離 internal state machine vs external side-effect,critical path 集中、可測。**vs** 一個 phase 做晒 |
| **OD2** | Request intake 來源 | **by SN number 手動拉**（`getRecordByNumber`）**+ 手動 payload 建**（唔靠真 SN;無真 creds → mock test）;自動 poll defer 到 orchestration phase |
| **OD3** | Line item 由邊嚟 | operator **經 API 手動加**（揀 `skuCatalogId` + `quantity` + `procurementRequired`）;`rawRequestText` 唔自動 parse（DESIGN §6） |
| **OD4** | `Request.status` 聚合規則 | 由 line items stage 算:全 `CANCELLED` → `CANCELLED`;全 `REQUESTED` → `OPEN`;有任何 in-flight（QUOTING…READY）→ `IN_PROGRESS`;（`COMPLETED` 待 D-2 有 `ASSIGNED` 先算） |
| **OD5** | ServiceNow table/field 對齊 | 用預設 `sc_req_item` / `number` / `work_notes`（DESIGN §10 未對齊 Phase 1 實際）→ mock test,commit 標「depends on OQ default」 |

## 4. Deliverables

### F1 — FulfilmentModule 接線
- **Spec ref**:`docs/architecture.md §3`、`fulfilment.module.ts`
- **Dependencies**:W01（PrismaModule `@Global`、IntegrationModule/ServiceNowService）
- **Acceptance criteria**:
  - `FulfilmentModule` import `IntegrationModule`（取 `ServiceNowService`）;register `RequestService` / `StageService` / `FulfilmentController`。
  - `npm run build` 0 error;boot 後 controller route 現 `/docs/api`。
- **Effort**:1.5h · **Owner**:AI

### F2 — RequestService（intake + line item + triage）
- **Spec ref**:DESIGN §6 / §7;`Request` / `RequestLineItem` schema;`ServiceNowService.getRecordByNumber`
- **Acceptance criteria**:
  - `intake()`:由 SN number（`getRecordByNumber`,map `serviceNowSysId/Number/Status` + `rawRequestText` + `requesterEmail` + `targetUpn` + `opcoId`）**或**手動 payload → 建 `Request`（`status=OPEN`）。SN 唔存在 → 明確錯誤,唔建空 Request。
  - `addLineItem()`:為 Request 加 `RequestLineItem`（`skuCatalogId` + `quantity` + triage `procurementRequired`;`stage=REQUESTED`）;寫 `RequestEvent(NOTE)` 記 intake。
  - `listRequests()` / `getRequestDetail()`（含 line items + events + opco + sku ref）。
  - **Test（H5）**:intake mapping（SN record → Request 欄位）、SN 不存在錯誤、addLineItem triage flag;`ServiceNowService` mock。
- **Effort**:3.5h · **Owner**:AI

### F3 — StageService（stage 推進 state machine）⭐ critical path
- **Spec ref**:DESIGN §7;`LineItemStage` / `RequestStatus` / `RequestEvent` schema
- **Acceptance criteria**:
  - `advanceStage(lineItemId, toStage)`:enforce **合法 transition matrix** —— 短路 `REQUESTED→READY`;procurement `REQUESTED→QUOTING→OPCO_APPROVED→AWAITING_VENDOR→READY`;任何 → `CANCELLED`。**拒 `→ASSIGNED`（D-2）** + 拒非法跳轉（e.g. `REQUESTED→OPCO_APPROVED`）。
  - 每次 transition 寫 `RequestEvent(STAGE_CHANGE, fromStage, toStage)` + set 對應 timestamp（`quotedAt` / `opcoApprovedAt` / `vendorOrderedAt` / `readyAt`）。
  - transition 後 recompute `Request.status`（OD4 規則）。
  - **Test（H5,critical path）**:合法路徑逐步、**非法跳轉被拒**、`→ASSIGNED` 被拒、CANCELLED、event + timestamp 寫入、status 聚合。
- **Effort**:4h · **Owner**:AI

### F4 — Controller + DTO + OpenAPI
- **Acceptance criteria**:
  - `POST /fulfilment/requests`（intake）、`POST /fulfilment/requests/:id/line-items`、`PATCH /fulfilment/requests/:id/line-items/:lineItemId/stage`、`GET /fulfilment/requests`、`GET /fulfilment/requests/:id`。
  - request-body DTO（class-validator,行 global `ValidationPipe`）+ `@ApiTags('fulfilment')` + response DTO;controller 標 `// TODO(auth): @Roles`。
  - **Acceptance**:boot → route 現 `/docs/api`;`GET` 回 200。
- **Effort**:2.5h · **Owner**:AI

### F5 — Test 收尾 + lint
- **Acceptance criteria**:
  - `request.service.spec.ts` + `stage.service.spec.ts` 全綠（`npm run test`;`ServiceNowService` / Prisma mock,唔打真 SN）。
  - `npm run lint` clean。
- **Effort**:1.5h · **Owner**:AI

## 5. Success Criteria（Phase Gate）

| # | Criterion | Target | Measure | Block closeout? |
|---|---|---|---|---|
| G1 | Build passes | 0 error | `npm run build` | Yes |
| G2 | H5 tests pass（stage machine + intake 覆蓋 critical path） | 全綠 | `npm run test` | Yes |
| G3 | Endpoints serve | route 現 `/docs/api`;GET 200 | boot + `curl` | Yes |
| G4 | Lint clean | 0 warning | `npm run lint` | No |

## 6. Risks（Phase-Specific）

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | ServiceNow table/field 未對齊 Phase 1（OD5） | High | Med | 用預設 `sc_req_item` + mock;intake 邏輯正確性由 test 驗,真對齊屬 operational（DESIGN §10） |
| R2 | Stage machine 合法路徑遺漏 / 非法跳轉冇擋 | Med | High | transition matrix 顯式定義 + H5 test 覆蓋合法逐步 + 非法被拒 + `→ASSIGNED` 被拒 |
| R3 | 本機無真 SN creds → intake by-number 手動打 fail | High | Low | 預期;test 用 mock,唔靠真 tenant（同 W02 R2） |
| R4 | 承 W01 stale 3100 instance / Prisma engine | Low | Low | 驗前 `Get-NetTCPConnection -LocalPort 3100` 清 stale;engine 已 cache |

## 7. Day-by-Day Breakdown（rough）

| Day | Date | Focus | Deliverables |
|---|---|---|---|
| D1 | 2026-07-09 | FulfilmentModule 接線 + RequestService（intake / line item / triage）+ test | F1, F2 |
| D2 | 2026-07-10 | StageService（transition matrix + events + status 聚合）+ test（critical path） | F3 |
| D3 | 2026-07-11 | Controller/DTO/OpenAPI + test 收尾 + gates | F4, F5, G1–G4 |

## 8. Dependencies on Prior Phase

W01（PrismaService、ServiceNowService、schema、Jest）+ W02（`SkuCatalog` 已可 sync — line item `skuCatalogId` FK 指向佢）。全部就緒。

## 9. Plan Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-09 | Initial draft（D-1 拆法） | W02 完成,W03 = Module D kickoff;拆 D-1/D-2 隔離 side-effect | Chris Lai |
| 2026-07-09 | Approved → status active;OD1 = 拆兩個（D-1 now / D-2=W04）,OD2–OD5 全照 default | Chris approve 開工 | Chris Lai |

---

**Lifecycle reminder**:plan locked after status=active。重大 deviation → 第 9 節 changelog + progress Day-N;approve 前唔 code（R1）。
