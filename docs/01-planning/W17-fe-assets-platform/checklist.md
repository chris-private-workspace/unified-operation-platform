---
phase: W17-fe-assets-platform
status: closed
---

# W17 — FE-Assets-platform — Checklist

> Plan approved 2026-07-13（OD1 tab 常顯+403 graceful · OD2 category 分組+subtotal+grand-total）。純前端 consume 既有 endpoint，無 schema/dep/ADR。D1-D4 完成，G1-G6 全過。

## D1 — data layer ✅
- [x] `api-types.ts`：`TenantSkuRow`（sku ref + owned/tenantConsumed/unallocated `number|null` + allocatedToOpcos/assignedToUsers + overAllocated）+ `TenantSkuStats`
- [x] `hooks/queries.ts`：`useTenantSkus(enabled)` + `useTenantSkuStats(enabled)`（lazy enabled + retryUnless403 via ApiError.status）
- [x] `lib/tenant-skus.ts`：`platformStatus`（over/not-synced/fully/available）· `groupByCategory`（→ [{category, rows, subtotal}]，null→Uncategorized）

## D2 — mode 切換 + Platform view ✅
- [x] `pages/assets.tsx`：mode state（default byopco）+ neutral segmented 切換（唔用 accent）+ conditional ByOpcoView/PlatformView
- [x] `components/assets/by-opco-view.tsx`：W15 By-OpCo view（原封搬）
- [x] `components/assets/platform-view.tsx`：recon tiles（3 + over-alloc pill）· grouped table（grand-total + category subheader + subtotal）· SKU search · BASE via useCatalog · OwnedBar · owned=null「—」/Not synced · **403 restricted EmptyState** · honest note · states

## D3 — tests ✅
- [x] `lib/tenant-skus.test.ts`（7）：platformStatus（over→danger / owned=null→Not synced / unalloc 0→Fully warn / else Available ok）· groupByCategory（分組 + subtotal + null→Uncategorized + owned-null 當 0 + empty）

## D4 — verify + closeout ✅
- [x] lint 0（--fix prettier）+ build 0 + web test green（17→**24**）
- [x] **live DOM + 截圖**（真 HTTP，dev-bypass；臨時 seed snapshot 用完即刪）：ADMIN mode 切換 + Platform recon tiles（Owned 2100/Allocated 2371/Unalloc −271）+ grouped table（grand-total + Uncategorized + subtotal + e3 over-allocated + over-pill）；run-as OPCO_IT 點 Platform → **403 restricted state**（default By-OpCo 2 RHK 行 work）
- [x] **light + dark 都驗**（Platform 畫面取色：card 255→20 · danger bar/badge token swap）
- [x] `ui-design` skill 自檢（DS-1..12 全 ✅/N/A；neutral switcher；截圖對 prototype）
- [x] progress retro · plan closed · BACKLOG（FE-Assets-platform ✅）· memory · commit（待指示）

## Phase Gate（plan §4）
- [x] G1 mode 切換 work + Platform lazy fetch
- [x] G2 Platform recon + grouped table + 派生狀態 live 驗（ADMIN）
- [x] G3 403 restricted state（run-as OPCO_IT）live
- [x] G4 H6 fidelity + ui-design 自檢 + prototype 對照
- [x] G5 lint 0 + build 0 + web test green
- [x] G6 無 schema / 無 dep / 無 ADR（純前端）

## Cross-Cutting
- [x] 每 commit references progress Day-N（R2）— commit 待指示
- [x] （純前端，無 ADR — H1 不觸發）
- [x] BACKLOG 同步（R7：FE-Assets-platform ✅）
- [x] progress closeout + status closed
