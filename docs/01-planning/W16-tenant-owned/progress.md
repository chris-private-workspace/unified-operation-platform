---
phase: W16-tenant-owned
status: closed
---

# W16 — BE-tenant-owned — Progress

## Day 0 — 2026-07-13（kickoff）

**緣起**：W15 FE-Assets honest gap = Platform mode 靠 tenant Owned/Unalloc，後端無 endpoint。

**查證（落 plan 前）**：
- **`TenantSkuSnapshot` 已存 `prepaidEnabled`（=prepaidUnits.enabled，M365 owned 總數）+ `consumedUnits`**（catalog sync 寫入，`graph.service.ts` SubscribedSku.prepaidEnabled）→ tenant-owned 數已喺 DB。
- `OpcoSkuLedger.groupBy` 可出每 SKU Σ allocated/assigned（全 OpCo）。
- 純 query-layer 無 schema 改 → **H1 不觸發、無 ADR**（同 W14 / AUTH-3a）。

**決定（AskUserQuestion，Chris approve）**：
- **OD1** = 後端 endpoint only（FE Platform mode 下一 phase，mirror W14→W15）。
- **OD2** = 兩個 endpoint（`/tenant-skus` rows + `/tenant-skus/stats`）。
- **OD3（決策非問）** = role ADMIN/REGIONAL，OPCO_IT 排除（prototype `showPlatformMode` 只 admin/regional；OPCO_IT 用 By-OpCo scoped）。
- **OD4（決策非問）** = owned 用已存 snapshot，唔喺 GET 打 Graph。

**做咗**：寫 plan（scope / 5 gate / OD）+ checklist + progress。status active。

**下一步**：D1 — DTO + `TenantOwnedService` + 2 GET + module。

---

## Day 1 — 2026-07-13（D1-D3 完成）

### Done
- **D1**：`dto/tenant-owned.dto.ts`（`TenantSkuRowDto`[sku ref + owned/tenantConsumed/unallocated `number|null` + allocatedToOpcos/assignedToUsers + overAllocated] / `TenantSkuStatsDto`）· `TenantOwnedService`（`rows()` shared：latest snapshot per SKU[JS first-seen desc] + `opcoSkuLedger.groupBy` _sum + active catalog 併派生，有 snapshot 或有 ledger 先出行；`listTenantSkus`/`tenantSkuStats`）· `LicenseController` 2 GET（**無 method @Roles → 繼承 controller `@Roles(ADMIN,REGIONAL)`**，OPCO_IT 排除；無 @CurrentUser）· `LicenseModule` provider/export。
- **D2**：`tenant-owned.service.spec.ts`（4）——latest-snapshot 揀選 + 派生（over-allocated）· owned=null（ledger 無 snapshot）· stats（owned null 當 0）· empty。
- **D3 verify**：api build 0 · lint 0（--fix prettier）· **test 96→100 綠**（15 suite）；**live**（見下）。

### Decisions
- **owned/tenantConsumed/unallocated = nullable**：SKU 有 ledger 無 snapshot（import 咗未 sync tenant）→ owned 未知，誠實 null（FE 顯示「—」），unallocated/overAllocated 派生守 null（H7）。
- **stats totalOwned = Σ(owned ?? 0)**：未知 owned 貢獻 0（誠實聚合）。
- **latest snapshot 用 JS first-seen（desc order）**：同 W14 stats JS reduce 一致，snapshots 細。
- **role = 繼承 controller ADMIN/REGIONAL**（唔加 method @Roles）：Platform view = 管理視圖，OPCO_IT 排除（prototype `showPlatformMode`），有別於 drift/catalog GET 放行 OPCO_IT。

### Verify（真 tool output）
- build 0 · lint 0 · **100 test**（15 suite；graph-unavailable ERROR log = 既有 test 故意觸發）。
- **live（真 HTTP，dev-bypass；臨時 seed TenantSkuSnapshot test-e3 owned 2000/consumed 1500 · test-e1 owned 100/consumed 90，驗完 --clean 刪 + 刪 script）**：
  - **ADMIN** `GET /license/tenant-skus` → **2 行**：**e3** owned 2000 / tenantConsumed 1500 / allocatedToOpcos **2285**（661+1624）/ assignedToUsers 0 / unallocated **−285** / **overAllocated true**（2285>2000 跨 OpCo 超額）· **e1** owned 100 / alloc 86（80+6）/ unallocated **14** / overAllocated false。`/stats` → `totalOwned 2100 / totalAllocated 2371 / totalAssigned 0 / totalUnallocated −271 / skusOverAllocated 1`。
  - **run-as OPCO_IT**（`AUTH_DEV_USER_EMAIL=opco.it.rhk@rapo.com.hk`；`/me` OPCO_IT/RHK）：`/tenant-skus` **403** · `/tenant-skus/stats` **403** · `/license/ledger` **200**（By-OpCo 仍放行）→ **role 邊界正確**（Platform=admin/regional，OPCO_IT 得 By-OpCo）。

### Blockers
- 無。

### Effort
- Planned：~half day；Actual：D0-D3 同日。

### Commits
| Hash | Subject |
|---|---|
| (待指示) | feat(license): W16 BE-tenant-owned — tenant-level owned/allocated per-SKU endpoints |

---

## Closeout（status=closed）

### Acceptance verification（plan §4 gates）
| Gate | 結果 |
|---|---|
| G1 兩 endpoint 派生 + stats live | ✅ ADMIN 2 行（e3 over-allocated / e1 unalloc 14）+ stats（真 HTTP，seed snapshot） |
| G2 owned=null 誠實處理 test | ✅ ledger-only SKU → owned/unallocated null · overAllocated false |
| G3 ADMIN 200 · OPCO_IT 403 live | ✅ tenant-skus/stats 403 · ledger 200（run-as） |
| G4 build 0 + lint 0 + test green | ✅ 100 test |
| G5 無 schema / 無 dep / 無 ADR | ✅ 純 query-layer（TenantSkuSnapshot 已存 prepaidEnabled） |

全 5 gate ✅。

### Lessons
- **tenant-owned 數一直喺 DB**：`TenantSkuSnapshot.prepaidEnabled`（catalog sync 寫）= M365 owned 總數 → 唔使改 schema / 唔使 GET 打 Graph，純 query-layer 就砌到 Platform view 數（W15 honest gap 嘅正解只係一個 read-model）。
- **read endpoint 唔打 Graph**（OD4）：owned 用已存 snapshot，GET 無 side-effect / 唔會 tenant unavailable 時 crash（BUG-002 教訓延伸）。
- **三層 over-allocated ≠ ledger over-allocated**：W16 overAllocated = allocatedToOpcos > owned（tenant 把 OpCo budget 超派過 M365 owned）；W15 overAllocated = assigned > allocated（OpCo 內超派）。兩個唔同層，都有意義。
- **method 無 @Roles → 繼承 controller @Roles**：新 endpoint 唔加 method-level 即自動 ADMIN/REGIONAL，OPCO_IT 排除，零額外 code。

### Carry-overs
- **FE Assets Platform mode tab**（BACKLOG 新 candidate）：consume `GET /license/tenant-skus` + `/stats`，Assets 加 Platform/By-OpCo mode 切換 + Owned/Allocated/Assigned/Unalloc 三層表 + 3 recon tile + over-allocated pill。= 下一 FE phase。
- **生產真 owned 數** = 真 tenant catalog sync（Graph）先有 snapshot；本地用 seed 驗派生。

---

**End of W16 progress**
