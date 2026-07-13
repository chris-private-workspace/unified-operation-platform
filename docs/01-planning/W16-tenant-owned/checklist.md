---
phase: W16-tenant-owned
status: closed
---

# W16 — BE-tenant-owned — Checklist

> Plan approved 2026-07-13（OD1 後端 only · OD2 兩個 endpoint）。純 query-layer（TenantSkuSnapshot 已存 prepaidEnabled），無 schema/dep/ADR。D1-D3 完成，G1-G5 全過。

## D1 — DTO + service + controller + module ✅
- [x] `dto/tenant-owned.dto.ts`：`TenantSkuRowDto`（sku ref + owned/tenantConsumed/unallocated `number|null` + allocatedToOpcos/assignedToUsers + overAllocated）+ `TenantSkuStatsDto`（totalOwned/Allocated/Assigned/Unallocated + skusOverAllocated）
- [x] `TenantOwnedService`：`listTenantSkus()`（latest snapshot per SKU[JS first-seen desc] + ledger groupBy _sum + 派生）· `tenantSkuStats()`（reduce）
- [x] `LicenseController` 加 `GET /license/tenant-skus` + `GET /license/tenant-skus/stats`（繼承 controller `@Roles(ADMIN,REGIONAL)`，無 @CurrentUser）
- [x] `LicenseModule` provider/export 加 `TenantOwnedService`

## D2 — tests（H5，mock prisma）✅
- [x] latest-snapshot-per-SKU：兩 snapshot 同 SKU 揀最新（2000 非 999）
- [x] 派生：owned 2000 / allocated 2285 → unallocated −285 / overAllocated true；owned 100 / allocated 86 → unallocated 14 / false
- [x] owned=null（SKU 有 ledger 無 snapshot）→ owned/tenantConsumed/unallocated null · overAllocated false
- [x] stats：totalOwned 2100/Allocated 2371/Assigned 0/Unallocated −271/skusOverAllocated 1
- [x] empty（無 SKU）→ 空 rows / 全 0 stats

## D3 — verify + closeout ✅
- [x] api build 0 + lint clean（--fix prettier）+ test green（96→**100**）
- [x] **live**（真 HTTP，dev-bypass；臨時 seed snapshot test-e3 owned 2000 / test-e1 owned 100 用完 --clean 刪 + 刪 script）：ADMIN `/tenant-skus` → 2 行（e3 owned 2000/alloc 2285/**over-allocated** · e1 owned 100/alloc 86/unalloc 14）· `/stats`（totalOwned 2100/Allocated 2371/Unallocated −271/skusOverAllocated 1）
- [x] **role**：ADMIN 200 · **run-as OPCO_IT → 403**（tenant-skus/stats；ledger 仍 200）
- [x] progress retro · plan closed · BACKLOG（BE-tenant-owned ✅ → FE Platform mode 解封）· memory · commit（待指示）

## Phase Gate（plan §4）
- [x] G1 兩 endpoint 派生 + stats live 驗
- [x] G2 owned=null 誠實處理 test 實證
- [x] G3 ADMIN/REGIONAL 200 · OPCO_IT 403 live
- [x] G4 api build 0 + lint 0 + test green
- [x] G5 無 schema / 無 dep / 無 ADR（純 query-layer）

## Cross-Cutting
- [x] 每 commit references progress Day-N（R2）— commit 待指示
- [x] （純 query-layer，無 ADR — H1 不觸發）
- [x] BACKLOG 同步（R7：BE-tenant-owned ✅ + FE Platform mode 新 candidate）
- [x] progress closeout + status closed
