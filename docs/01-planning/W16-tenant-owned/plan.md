---
phase: W16-tenant-owned
name: "BE-tenant-owned — tenant-level owned/allocated/assigned per-SKU read-model (Platform mode data)"
sprint_week: W16
backlog_id: BE-tenant-owned
start_date: 2026-07-13
end_date: 2026-07-13
status: closed           # draft | active | closed — D1-D3 完成，G1-G5 全過（live：ADMIN e3 over-allocated/e1 unalloc 14 + stats；OPCO_IT 403）
spec_refs:
  - design_handoff_licenseops/prototype/full-console.html（License Assets → Platform mode：Tenant licenses by SKU 表 Owned|Allocated|Assigned|Unalloc. + recon tile；`showPlatformMode` 只 admin/regional）
  - docs/02-architecture/licenseops/DESIGN.md §5（三層：M365 owned=prepaidUnits.enabled / OpCo allocated=budget / user assigned）
  - prisma/schema.prisma（TenantSkuSnapshot.prepaidEnabled + consumedUnits — 已存，catalog sync 寫入；OpcoSkuLedger allocated/assigned）
  - apps/api/src/integration/graph/graph.service.ts（SubscribedSku.prepaidEnabled = prepaidUnits.enabled）
  - docs/01-planning/W15-fe-assets/（honest-gap carry-over：Platform tenant-Owned view）
  - CLAUDE.md §5 H1（純 query-layer 不觸發，無 ADR，同 W14/AUTH-3a）/ H5（read test）/ H3（Platform=admin/regional）
prior_phase: W15-fe-assets
---

# Phase W16 — BE-tenant-owned（後端 tenant 級 read-model）

> **Plan version**：1.0 · **Owner**：Chris Lai
> **緣起**：W15 FE-Assets 嘅 honest gap = prototype Platform mode 靠 tenant「Owned/Unalloc」三層數，當時後端無 endpoint。查證發現 **`TenantSkuSnapshot` 已存 `prepaidEnabled`（=prepaidUnits.enabled，M365 owned/prepaid 總數）+ `consumedUnits`**（catalog sync 寫入）→ tenant-owned 數已喺 DB。
> **本 phase = 純後端 mini-phase**：expose 每 SKU tenant 級 owned/allocated/assigned/unallocated + 聚合 stats。**無 schema 改、無新 dep、無 ADR**（同 W14 / AUTH-3a 純 query-layer）。**OD1 = 後端 only**（FE Platform mode tab = 下一 FE phase）。

## 1. Scope

### In
- **`GET /license/tenant-skus`** — per-SKU tenant 級行，`@Roles(ADMIN, REGIONAL)`（**OPCO_IT 排除**，見 §5 決策）。每行 = sku ref（skuId/partNumber/displayName/category）+ **owned**（latest `TenantSkuSnapshot.prepaidEnabled`，無 snapshot→null）+ **tenantConsumed**（snapshot.consumedUnits，null）+ **allocatedToOpcos**（Σ `OpcoSkuLedger.allocatedQuantity` 全 OpCo）+ **assignedToUsers**（Σ assignedQuantity）+ **unallocated**（owned≠null ? owned−allocatedToOpcos : null）+ **overAllocated**（owned≠null && allocatedToOpcos>owned）。只計 active SKU；行 = 有 snapshot 或有 ledger allocation 嘅 active SKU。
- **`GET /license/tenant-skus/stats`** — 聚合：`totalOwned`（Σ owned??0）/ `totalAllocated`（Σ allocatedToOpcos）/ `totalAssigned`（Σ assignedToUsers）/ `totalUnallocated`（totalOwned−totalAllocated，可負=tenant-wide over-alloc）/ `skusOverAllocated`（overAllocated 行數）。
- **Tests（H5，mock prisma）**：latest-snapshot-per-SKU 揀選 · 派生 unallocated/overAllocated（含 owned=null）· stats 聚合 · empty · ledger-only SKU（owned null）。

### Out（H3 / surgical）
- **FE Assets Platform mode tab**（mode 切換 + Owned/Unalloc 三層表 + recon tile）—— 下一 FE phase（OD1）。
- **Live Graph call on GET** —— 唔喺 read endpoint 打 Graph；owned 用**已存 snapshot**（catalog sync 寫嘅 persisted tenant state）。live-refresh 由既有 catalog sync 負責。
- **schema 改 / 新 dep / ADR** —— 無（純 query-layer）。
- **per-category grouping / subtotal 計算** —— 展示層留 FE；後端 rows 平出，order by category→partNumber。

## 2. Approach
- `TenantOwnedService`（LicenseModule）：
  - **latest snapshot per SKU**：`tenantSkuSnapshot.findMany({ orderBy:{capturedAt:'desc'}, select })` → JS first-seen map（snapshots 細，同 W14 stats 用 JS reduce 一致）。
  - **ledger sums**：`opcoSkuLedger.groupBy({ by:['skuCatalogId'], _sum:{allocatedQuantity,assignedQuantity} })` → map。
  - active `skuCatalog.findMany` → 對每 SKU 併 snapshot + ledger sum → 派生欄（有 snapshot 或有 ledger 先出行）。
  - `tenantSkuStats` = 同一 rows reduce。
- Controller：2 GET 落 `LicenseController`，`@Roles(ADMIN, REGIONAL)`（**無 `@CurrentUser`** — tenant-wide 無 scope，role guard 已限）。
- DTO：`TenantSkuRowDto` / `TenantSkuStatsDto`（`dto/tenant-owned.dto.ts`；owned/tenantConsumed/unallocated = `number | null`）。

## 3. Deliverables
- **D1** — DTO + `TenantOwnedService`（2 method）+ controller 2 GET + module provider/export。
- **D2** — tests（latest-snapshot / 派生含 null / stats / empty / ledger-only）。
- **D3** — verify（build/lint/test + **live**：seed 臨時 snapshot[test-e3 owned 2000 / test-e1 owned 100]→ 驗 rows[e3 over-allocated:alloc 2285>owned 2000 / e1 unalloc 14]+ stats + ADMIN 200 / OPCO_IT 403）+ closeout。

## 4. Phase Gates
- **G1** 兩 endpoint 出正確 tenant 行 + 派生（owned/allocated/assigned/unallocated/overAllocated）+ stats 聚合 —— live 驗（seed snapshot）。
- **G2** owned=null（SKU 有 ledger 無 snapshot）誠實處理（unallocated null / overAllocated false）—— test 實證。
- **G3** role：ADMIN/REGIONAL 200 · **OPCO_IT 403**（Platform=管理視圖，排除；prototype `showPlatformMode`）—— live 驗。
- **G4** api build 0 + lint clean + test green（96→+N）。
- **G5** 無 schema 改 / 無新 dep / 無 ADR（純 query-layer）。

## 5. Decisions / OD
- **OD1** = **後端 endpoint only**（FE Platform mode 下一 phase，mirror W14→W15）—— Chris approve。
- **OD2** = **兩個 endpoint**（`/tenant-skus` rows + `/tenant-skus/stats`）—— Chris approve，mirror W14。
- **OD3（決策，非問）** = **role = ADMIN/REGIONAL，OPCO_IT 排除**。理由：prototype Platform mode `showPlatformMode` 只 admin/regional（管理/規劃視圖，非 OPCO_IT 操作數據）；OPCO_IT 用 By-OpCo（W15，scoped）。有別於 drift/catalog GET 放行 OPCO_IT（嗰啲係 operational/reference tenant-total）。
- **OD4（決策，非問）** = owned 用**已存 snapshot** 唔喺 GET 打 Graph（read endpoint 唔應有 side-effect / 唔應慢 / 唔應 crash）。

## 6. Risks / 誠實限制
- **本地無 TenantSkuSnapshot**（Graph placeholder，catalog sync 會 503）→ live 驗需**臨時 seed snapshot**（放 `apps/api/prisma` resolve `@prisma/client`，用完即刪，同 W13/W14）。
- **owned=null（SKU 有 ledger 無 snapshot）**：真實可能（allocation import 咗但未 sync tenant）→ DTO owned/unallocated nullable，FE 顯示「—」；stats totalOwned 把 null 當 0（誠實：未知 owned 貢獻 0）。
- 生產真 owned 數 = 真 tenant catalog sync（Graph）先有 snapshot；本地用 seed 數驗派生邏輯。

## 7. Changelog
- 1.0（2026-07-13）— active；Chris approve OD1（後端 only）/ OD2（兩個 endpoint）。開 D1。
- 1.1（2026-07-13）— closed；D1-D3 同日完成，G1-G5 全過（api 96→100 test；live ADMIN e3 over-allocated[alloc 2285>owned 2000]/e1 unalloc 14 + stats totalUnallocated −271；OPCO_IT 403）。carry-over：FE Assets Platform mode tab 登 BACKLOG 新 candidate。
