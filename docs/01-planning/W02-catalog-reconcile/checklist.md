---
phase: W02-catalog-reconcile
plan_ref: ./plan.md
status: complete    # draft | in-progress | complete
last_updated: 2026-07-09
---

# Phase W02 — Checklist

> Atomic checkbox（每 item ≤ 1–2 hour effort）。
> ✅ plan approved（status active,2026-07-09）;OD1–OD3 全照 default（cron defer / reconcile live / 軟刪）。
> AI tick 完成嘅 item;唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。

## F1 — LicenseModule 接線

- [x] `LicenseModule` import `IntegrationModule`（取 `GraphService`）+ register `CatalogService` / `ReconcileService` / `LicenseController`
- [x] confirm `PrismaService` inject（`@Global` 已 available）
- [x] verify:`npm run build` 0 error;boot log map `LicenseController {/license}` + 4 route（G1/G3）

## F2 — CatalogService（SKU 字典 + tenant 快照）

- [x] `syncFromTenant()`:`getSubscribedSkus()` → upsert `SkuCatalog` by `skuId`（update 只掂 `skuPartNumber`/`active`/`lastSyncedAt`,唔覆蓋 `businessAlias`/`category`/`displayName`/`isBaseLicense`）
- [x] 消失 SKU 標 `active=false`（OD3;`updateMany notIn liveIds`）
- [x] 每次 sync 寫 `TenantSkuSnapshot`（prepaidEnabled / consumedUnits / capturedAt）
- [x] `listCatalog()` 返 active SkuCatalog
- [x] verify（H5）:`catalog.service.spec` — 新建 / 既有更新保留 businessAlias / snapshot 寫入 / 消失標 inactive（Graph mock）✓

## F3 — ReconcileService（方案甲總量層 drift）⭐ critical path

- [x] `reconcile()`:攞 live consumedUnits（OD2）+ `sum(assignedQuantity)` per SKU + `delta`
- [x] `delta≠0` 無 OPEN → create DriftAlert;已 OPEN → update（唔重複開,detectedAt 保留）
- [x] `delta=0` → resolve 現有 OPEN（RESOLVED + resolvedAt）
- [x] `listDrift()` 返 OPEN alerts（include sku ref）
- [x] verify（H5,critical path）:`reconcile.service.spec` — delta>0 / delta<0 / null-sum=0 / 已 OPEN 唔重複 / delta=0 resolve / no-op（Graph mock + ledger fixture）✓ 8 test 全綠

## F4 — Controller + DTO + OpenAPI

- [x] `POST /license/catalog/sync` + `GET /license/catalog` + `POST /license/reconcile` + `GET /license/drift`
- [x] `@ApiTags('license')` + `@ApiOkResponse` DTO;controller 標 `// TODO(auth): @Roles(ADMIN, REGIONAL)`
- [x] verify:boot → 4 route 現 OpenAPI（`/docs/api-json`）;兩條 GET 回 200（body `[]`）✓

## F5 — Test 收尾 + lint

- [x] `npm run test` 全綠（2 suites / 8 test;Graph/Prisma mock,唔打真 tenant）✓
- [x] `npm run lint` clean（`--fix` 修 prettier line-wrap 後 exit 0）✓

---

## Cross-Cutting

- [x] All deliverables committed to git（closeout commit — R2）
- [x] OD1–OD3 resolved → 決策同步 plan §3 + progress（R4）
- [x] Architectural-adjacent decision → ADR（R5;**無** — Module C 屬既定 spec 執行:方案甲 / skuId 主鍵 / 兩層 ledger;OD1–OD3 屬 spec 內實作選擇,非架構改動）
- [x] Pending / next-candidate synced to `BACKLOG.md`（R7;W02 → 完成、W03 候選）
- [x] `progress.md` retro section written
- [x] `progress.md` frontmatter status flipped to `closed`
- [x] Phase W03（Module D）kickoff trigger noted in retro

---

**Lifecycle reminder**:呢份 checklist 隨 plan deliverables 衍生。新加 deliverable 必須先入 plan + changelog,然後再加 checklist item。
