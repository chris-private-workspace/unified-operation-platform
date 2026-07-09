---
phase: W02-catalog-reconcile
name: "Module C — SKU Catalog 字典 + 總量層對帳 / drift"
sprint_week: W02
start_date: 2026-07-09
end_date: 2026-07-16          # planned, may slip with changelog log
status: active               # draft | active | closed
spec_refs:
  - docs/02-architecture/licenseops/DESIGN.md §5 State 模型 & Reconciliation
  - docs/02-architecture/licenseops/DESIGN.md §6 Domain Model
  - docs/02-architecture/licenseops/DESIGN.md §11 Roadmap（C）
  - docs/architecture.md §3 四層地基（Orchestration / Action layer）
  - apps/api/prisma/schema.prisma（SkuCatalog / OpcoSkuLedger / TenantSkuSnapshot / DriftAlert）
  - apps/api/src/integration/graph/graph.service.ts（getSubscribedSkus → SubscribedSku[]）
prior_phase: W01-backend-bootstrap
---

# Phase W02 — Module C：SKU Catalog + 總量層對帳

> **Plan version**:1.0（draft）
> **Owner**:Chris Lai
> **Approved by**:Chris Lai(2026-07-09)

## 1. Scope

W01 令後端跑得起,但 `LicenseModule` 仲係空殼(`@Module({})`)。本 phase = **Module C 第一個實作** —— 把 M365 tenant 嘅 `subscribedSkus` 灌成 **SKU 字典**(`SkuCatalog`,`skuId` GUID 為主鍵),記錄 **tenant 總量快照**(`TenantSkuSnapshot`),並實作 **方案甲總量層對帳**:`sum(所有 OpCo assignedQuantity)` vs `tenant consumedUnits`,對唔上就開 `DriftAlert`。對外用**手動 trigger endpoint** + 讀取 endpoint 曝露,全部行為由 H5 test 覆蓋。

呢個係前端 License Assets / Drift / Catalog 三個畫面同 Module D(assign 後更新 ledger、觸發 drift)嘅**數據地基**。

**對齊 spec 嘅語意(DESIGN §5)**:
- **M365 tenant = 總量唯一真相**;`skuId`(GUID)= 唯一主鍵,唔信 Excel 名(`businessAlias` 只作對照)。
- **兩層數字分開**:`allocatedQuantity`(budget,**不對帳**)/ `assignedQuantity`(baseline,**只有呢個對帳**)。
- **偵測只喺 SKU 總量層**;差異落喺邊個 OpCo(對回機制)= **DESIGN §10 deferred,本 phase 唔做**。

## 2. 明確 out-of-scope(H3 — 唔可以順手做)

| 排除項 | 理由 / 去向 |
|---|---|
| **對回機制**(drift 差異落邊個 OpCo、點協助同步) | DESIGN §10 明列 deferred,另設計 |
| **`allocatedQuantity`(Excel budget)import** | 無數據源 / 無 UI;屬另一件事,本 phase 唔掂 ledger 寫入 |
| **實際 assign / 更新 `assignedQuantity`** | 屬 Module D(W03/04);本 phase 只**讀** ledger 做對帳 |
| **auth guard** | 另一 phase(AUTH);endpoint 暫 unguarded + 標 `// TODO(auth): @Roles` |
| **前端** | backend-first 路線,前端 phase 另起 |

## 3. Open Decisions(✅ 2026-07-09 敲定:全照 default)

| # | 決策 | 決定(= default) |
|---|---|---|
| **OD1** | 本 phase 要唔要 daily `@Cron` 自動對帳? | **Defer** — 本 phase 只做 manual trigger endpoint(simplicity first §1.2);daily `@Cron` 留 orchestration phase。architecture §3 有講 `@Cron daily reconcile`,但唔阻核心邏輯正確性 |
| **OD2** | `reconcile()` 攞 tenant `consumedUnits` 用邊個源? | **Live** — `reconcile()` 內部 call `getSubscribedSkus()` 攞 fresh 值;`TenantSkuSnapshot` 只作 `sync` 時嘅歷史記錄,唔做對帳輸入(避免 stale) |
| **OD3** | catalog sync 遇到 tenant 已消失嘅 SKU | **軟刪** `active=false`,唔硬 `delete`(保住 ledger / snapshot / drift 嘅 FK 同歷史) |

## 4. Deliverables

### F1 — LicenseModule 接線
- **Spec ref**:`docs/architecture.md §3`、`apps/api/src/license/license.module.ts`
- **Dependencies**:W01(PrismaModule `@Global`、IntegrationModule/GraphService)
- **Acceptance criteria**:
  - `LicenseModule` import `IntegrationModule`(取 `GraphService`);register `CatalogService` / `ReconcileService` / `LicenseController`。
  - `PrismaService` inject 得(`@Global` 已 available)。
  - `npm run build` 0 error;boot 後 `LicenseController` route 出現喺 `/docs/api`。
- **Effort**:1.5h · **Owner**:AI

### F2 — CatalogService(SKU 字典 + tenant 快照)
- **Spec ref**:DESIGN §5 / §6;`SkuCatalog` / `TenantSkuSnapshot` schema;`getSubscribedSkus()`
- **Acceptance criteria**:
  - `syncFromTenant()`:`getSubscribedSkus()` → 逐 SKU **upsert `SkuCatalog` by `skuId`**(新增則建;既有則更新 `skuPartNumber` / `lastSyncedAt`,**唔覆蓋**人手欄 `businessAlias` / `category` / `displayName` / `isBaseLicense`);tenant 唔再返嘅 active SKU 標 `active=false`(OD3)。
  - 每次 sync 為每個 SKU 寫一筆 `TenantSkuSnapshot`(`prepaidEnabled` / `consumedUnits` / `capturedAt`)。
  - `listCatalog()`:返 `active` SkuCatalog(俾 read endpoint)。
  - **Test(H5)**:新 SKU create、既有 SKU update 保留 `businessAlias`、snapshot 寫入、消失 SKU 標 inactive;`GraphService` mock。
- **Effort**:3h · **Owner**:AI

### F3 — ReconcileService(方案甲總量層 drift)⭐ critical path
- **Spec ref**:DESIGN §5(方案甲);`OpcoSkuLedger` / `DriftAlert` schema
- **Acceptance criteria**:
  - `reconcile()`:攞 live `consumedUnits`(OD2);對每個 `active` SKU 計 `ledgerAssignedSum = sum(OpcoSkuLedger.assignedQuantity)`、`delta = consumedUnits - ledgerAssignedSum`。
  - `delta ≠ 0`:若該 SKU **無 OPEN `DriftAlert`** → create(`ledgerAssignedSum` / `tenantConsumed` / `delta`,`status=OPEN`);若已有 OPEN → **update** 數字(唔重複開)。
  - `delta = 0`:把該 SKU 現有 OPEN alert `RESOLVED`(`resolvedAt`)。
  - `listDrift()`:返 OPEN alerts(俾 read endpoint)。
  - **Test(H5,critical path)**:`delta>0` create、`delta<0` create、已 OPEN 唔重複 create(改為 update)、`delta=0` resolve;`GraphService` mock + `OpcoSkuLedger` fixture。
- **Effort**:3.5h · **Owner**:AI

### F4 — Controller + DTO + OpenAPI
- **Spec ref**:`docs/architecture.md §3`(API/UI layer)、`main.ts` DocumentBuilder
- **Acceptance criteria**:
  - `POST /license/catalog/sync`(對齊 `docs/setup.md` 已記 smoke test)、`GET /license/catalog`、`POST /license/reconcile`、`GET /license/drift`。
  - `@ApiTags('license')` + response DTO(class-validator/transformer,行 global `ValidationPipe`);每 controller 標 `// TODO(auth): @Roles`(未 guard)。
  - **Acceptance**:boot 後 4 條 route 現喺 `/docs/api`;兩條 `GET` 回 200。
- **Effort**:2h · **Owner**:AI

### F5 — Test 收尾 + lint
- **Acceptance criteria**:
  - `CatalogService.spec.ts` + `ReconcileService.spec.ts` 全綠(`npm run test`);`GraphService` / Prisma mock,**唔打真 tenant**(H5 / §3.4)。
  - `npm run lint` clean。
- **Effort**:1.5h · **Owner**:AI

## 5. Success Criteria(Phase Gate)

| # | Criterion | Target | Measure | Block closeout? |
|---|---|---|---|---|
| G1 | Build passes | 0 error | `npm run build` | Yes |
| G2 | H5 tests pass(catalog + reconcile 覆蓋 critical path) | 全綠 | `npm run test` | Yes |
| G3 | Endpoints serve | 4 route 現 `/docs/api`;GET 200 | boot + `curl` | Yes |
| G4 | Lint clean | 0 warning | `npm run lint` | No |

## 6. Risks(Phase-Specific)

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Prisma engine CDN(承 W01 RISK R1) | Low | Med | engine 已 cache;clean reinstall 前轉流動網路 |
| R2 | 本機無真 Graph creds → `POST sync/reconcile` 手動打會 fail | High | Low | **預期**;邏輯正確性由 mock test(G2)驗,唔靠真 tenant。真 tenant 對齊屬 operational,非本 phase gate |
| R3 | reconcile 數據源語意(OD2)未定 | Med | Med | approve 時 lock OD2;default = live Graph call |
| R4 | 本機 seed 未有 `OpcoSkuLedger` 列 → 手動 reconcile 出「全 drift」 | Med | Low | 屬初始化前預期狀態(§5 baseline 未建);test 用 fixture 驗邏輯,唔靠 seed |

## 7. Day-by-Day Breakdown(rough)

| Day | Date | Focus | Deliverables |
|---|---|---|---|
| D1 | 2026-07-09 | LicenseModule 接線 + CatalogService + test | F1, F2 |
| D2 | 2026-07-10 | ReconcileService（方案甲 drift）+ test（critical path） | F3 |
| D3 | 2026-07-11 | Controller/DTO/OpenAPI + test 收尾 + gates | F4, F5, G1–G4 |

## 8. Dependencies on Prior Phase

W01 交付:`PrismaService`(`@Global`)、`GraphService.getSubscribedSkus()`、migrated schema、Jest infra。全部就緒,無 blocker。

## 9. Plan Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-09 | Initial draft | backend-first 路線敲定,W02 = Module C kickoff | Chris Lai |
| 2026-07-09 | Approved → status active;OD1–OD3 全照 default（cron defer / reconcile live / 軟刪 active=false） | Chris approve 開工 | Chris Lai |

---

**Lifecycle reminder**:plan locked after status=active。重大 deviation → 第 9 節 changelog + progress Day-N;小 detail 可 inline edit。approve 前唔 code(R1)。
