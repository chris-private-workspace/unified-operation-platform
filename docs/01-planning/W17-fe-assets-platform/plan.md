---
phase: W17-fe-assets-platform
name: "FE-Assets-platform — Platform mode tab (tenant Owned/Allocated/Assigned/Unalloc)"
sprint_week: W17
backlog_id: FE-Assets-platform
start_date: 2026-07-13
end_date: 2026-07-13
status: closed           # draft | active | closed — D1-D4 完成，G1-G6 全過（live：ADMIN Platform grouped table + over-allocated；OPCO_IT 403 restricted；light+dark）
spec_refs:
  - design_handoff_licenseops/prototype/full-console.html（License Assets → Platform mode：mode 切換 + Tenant licenses by SKU 表[Owned|Allocated|Assigned|Unalloc.|Status]按 category 分組 + subtotal + grand-total + recon tile[Owned/Allocated/Assigned]）
  - apps/api/src/license/dto/tenant-owned.dto.ts（W16：TenantSkuRowDto[owned/tenantConsumed/allocatedToOpcos/assignedToUsers/unallocated/overAllocated] / TenantSkuStatsDto）
  - docs/01-planning/W16-tenant-owned/（consume GET /license/tenant-skus + /tenant-skus/stats；ADMIN/REGIONAL only → OPCO_IT 403）
  - apps/web/src/pages/assets.tsx（W15 By-OpCo view，本 phase 加 mode 切換）
  - CLAUDE.md §5 H6（Design Fidelity）/ H3（Platform=admin/regional）
prior_phase: W16-tenant-owned
---

# Phase W17 — FE-Assets-platform（Assets Platform mode）

> **Plan version**：1.0 · **Owner**：Chris Lai
> **緣起**：W16 起咗 tenant 三層 read-model（`/license/tenant-skus` + `/stats`）→ Assets Platform mode 解封。本 phase 把 W16 灌落嘅 tenant Owned/Unalloc 數變成可見 UI，完成 Assets 畫面全貌。
> **本 phase = 純前端**：consume 既有 endpoint，**無新 endpoint、無 schema 改、無新 dep、無 ADR**。

## 1. Scope

### In
- **Mode 切換**（`pages/assets.tsx`）：`By OpCo` / `Platform` 2-mode segmented（**default By-OpCo** — 對所有 role work）。By-OpCo = W15 view（抽 component）；Platform = 新。token-styled neutral 切換（唔用 accent，DS-3）。
- **Platform view**（`components/assets/platform-view.tsx`，consume `useTenantSkus` + `useTenantSkuStats`）：
  - **recon tiles**（3）：Owned in M365（totalOwned）· Allocated to OpCos（totalAllocated，sub `${totalUnallocated} unallocated across tenant`）· Assigned to users（totalAssigned）+ over-alloc pill（skusOverAllocated>0）。
  - **表按 category 分組**（OD2）：grand-total 行「All SKUs · total」（stats）+ 每 category subheader + 行 + `Subtotal · {cat}`（category=null→「Uncategorized」）。欄 = SKU | Owned | Allocated | Assigned | Unalloc. | Status。SKU 名下 mini bar（allocated/assigned of owned）+ BASE badge（via `useCatalog` skuId→isBaseLicense lookup）。數字 mono。owned=null → 「—」+ Not synced 狀態。
  - **狀態**：overAllocated→danger「Over-allocated」· owned=null→neutral「Not synced」· unallocated===0（owned>0）→warn「Fully allocated」· else ok「Available」。
  - **SKU search**（filter）。**403 restricted state**（OPCO_IT）：honest EmptyState「Platform view restricted to platform admins」。honest note（allocation→Settings import；write actions omitted）。
- **Data**：api-types `TenantSkuRow`/`TenantSkuStats`；`useTenantSkus(enabled)`/`useTenantSkuStats(enabled)`（**lazy**：`enabled = mode==='platform'`，避 By-OpCo 用戶觸 403；**retry skip 403**）。`lib/tenant-skus.ts` 純 helper（`platformStatus`/`groupByCategory`）。
- **Tests**：`lib/tenant-skus.test.ts`（platformStatus 4 tone 含 owned=null · groupByCategory 分組/subtotal/null→Uncategorized）。

### Out（H3 / surgical）
- **Compare mode** —— out（prototype 第三 mode，W15 已標 future）。
- **Manage / Adjust 寫操作**（tenant count 調整）—— 無 endpoint，read-only；allocation 編輯喺 Settings import（W13）。
- **真 role gate（隱 tab）** —— AUTH-3b（卡 IT app reg）；本 phase OD1=tab 常顯 + 403 graceful。
- **新 endpoint / schema / dep / ADR** —— 無（純前端）。

## 2. Approach
- api-types 加 `TenantSkuRow`（含 sku ref + owned/tenantConsumed/unallocated `number|null` + allocatedToOpcos/assignedToUsers + overAllocated）+ `TenantSkuStats`。
- `queries.ts` 加 `useTenantSkus(enabled)`/`useTenantSkuStats(enabled)`：`enabled` gate + `retry:(n,e)=>!(e instanceof ApiError && e.status===403) && n<2`（403 唔 retry）。
- `lib/tenant-skus.ts`：`platformStatus(row)`（{label,tone}）· `groupByCategory(rows)`（→ [{category, rows, subtotal}]，null→'Uncategorized'）。可測。
- `assets.tsx` 重構：mode state（default byopco）+ neutral segmented 切換 + 抽 `ByOpcoView`（現 W15 內容原封搬）+ `<PlatformView/>`。
- `PlatformView`：recon tiles + grouped table（grand-total + subheader + subtotal）+ BASE via `useCatalog` map + mini bar + 403 restricted state + states + honest note。
- **唔加新 primitive**：組合 Card/StatCard/Badge/EmptyState/feedback-states + table pattern。

## 3. Deliverables
- **D1** — data：api-types（TenantSkuRow/Stats）+ queries（useTenantSkus/Stats，lazy+retry-skip-403）+ `lib/tenant-skus.ts`。
- **D2** — `assets.tsx` mode 切換 + 抽 `ByOpcoView` + `platform-view.tsx`（recon tiles + grouped table + 403 state + note）。
- **D3** — `lib/tenant-skus.test.ts`（platformStatus + groupByCategory）。
- **D4** — verify（lint + build + web tests + **live DOM**：ADMIN Platform recon tiles + grouped table + over-allocated + grand-total/subtotal；mode 切換；run-as OPCO_IT Platform → **403 restricted state**；light+dark）+ ui-design 自檢 + closeout。

## 4. Phase Gates
- **G1** mode 切換 work（By-OpCo ↔ Platform）；Platform 只喺切去先 fetch（lazy）。
- **G2** Platform recon tiles + grouped table（grand-total + category subheader + subtotal）+ 派生狀態正確 —— live（ADMIN，seed snapshot）。
- **G3** **403 restricted state**（run-as OPCO_IT 點 Platform → graceful，非白畫/crash）—— live。
- **G4** H6 fidelity：token-only、lucide、light+dark、數字 mono、一 view ≤1 primary、對 prototype Platform mode；跑 `ui-design` skill。
- **G5** lint 0 + build 0 + web test green（17→+N）。
- **G6** 無 schema / 無新 dep / 無 ADR（純前端）。

## 5. Decisions / OD（Chris approve 2026-07-13）
- **OD1** = **Platform tab 常顯 + 403 graceful restricted state**（零 FE-role 依賴，唔牽 AUTH-3b）。
- **OD2** = **按 category 分組 + subtotal + grand-total**（貼 prototype；null→Uncategorized）。
- **決策（非問）**：mode default = **By-OpCo**（對所有 role work）；Platform query **lazy**（enabled=platform mode，避 By-OpCo 用戶觸 403）；BASE badge via `useCatalog` lookup（tenant-skus DTO 無 isBaseLicense）。

## 6. Risks / 誠實限制
- 本地 owned 數 = 臨時 seed snapshot（W16 驗法，用完即刪）；生產真 owned 需 tenant catalog sync。over-allocated / fully-allocated 現場靠 seed exercise + unit test。
- 403 detection 靠 `ApiError.status`；lazy + retry-skip-403 避 OPCO_IT 頁載觸 403 noise。
- BASE badge 依賴 catalog loaded（gracefully degrade 無 badge）。

## 7. Changelog
- 1.0（2026-07-13）— active；Chris approve OD1（tab 常顯+403 graceful）/ OD2（category 分組）。開 D1。
- 1.1（2026-07-13）— closed；D1-D4 同日完成，G1-G6 全過（web 17→24 test；live ADMIN Platform grouped table[grand-total/subtotal/e3 over-allocated]+ 截圖對 prototype；OPCO_IT 403 restricted state；light+dark）。Assets 兩 mode（By-OpCo W15 + Platform W17）齊，Compare 仍 future。
