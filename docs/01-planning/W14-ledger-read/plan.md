---
phase: W14-ledger-read
name: "BE-ledger-read — per-OpCo ledger rows + stats aggregate (opco-scoped)"
sprint_week: W14
backlog_id: BE-ledger-read
start_date: 2026-07-13
end_date: TBD
status: closed           # draft | active | closed — D1-D3 完成,G1-G4 全過(live scoped round-trip:ADMIN 4/2-OpCo · OPCO_IT 2/自己);FE-Assets/Overview KPI 解封
spec_refs:
  - docs/02-architecture/licenseops/DESIGN.md §5（ledger 兩層數字:allocatedQuantity=owned / assignedQuantity=baseline）· §6（OpcoSkuLedger）
  - docs/01-planning/BACKLOG.md（A 區 BE-ledger-read — 後端 mini-phase）
  - apps/api/src/auth/opco-scope.ts（AUTH-3a scopeWhere — 本 phase read scope）
  - CLAUDE.md §5 H1（純 query-layer 不觸發，無 ADR，同 AUTH-3a）/ H5（read test）
prior_phase: W13-allocation-import
---

# Phase W14 — BE-ledger-read（後端 read-model）

> **Plan version**:1.0 · **Owner**:Chris Lai
> **緣起**:W13 令 `allocatedQuantity` 有得灌 → DD-1 close。BE-ledger-read（FE-1 OD1-A carry）解封 —— 建 read-model endpoint 通去 FE-Assets + Overview seat KPI。
> **本 phase = 純後端 mini-phase**：expose ledger（owned/allocated/assigned + 派生）+ 聚合 stats，opco-scoped。**無 schema 改、無 ADR**（同 AUTH-3a 純 query-layer）。

## 1. Scope

### In
- **`GET /license/ledger`** — per-(OpCo,SKU) 行，`@Roles(ADMIN,REGIONAL,OPCO_IT)`，**opco-scoped**（`scopeWhere(actor)`；OPCO_IT 只見自己 OpCo）。只計 active SKU + active OpCo。行 = opco ref（code/displayName）+ sku ref（skuId/partNumber/displayName/category）+ `allocatedQuantity` + `assignedQuantity` + **派生** `headroom`（=allocated−assigned）+ `overAllocated`（=assigned>allocated）。
- **`GET /license/ledger/stats`** — scoped 聚合：`totalAllocated` / `totalAssigned` / `totalHeadroom` / `skusTracked`（distinct sku）/ `opcosTracked`（distinct opco）/ `overAllocatedCount`。
- **Tests（H5,mock prisma）**：scope filter（OPCO_IT 只見自己 · ADMIN 見全）· 派生 headroom/overAllocated 正確 · stats 聚合正確 · empty ledger。

### Out（H3 / surgical）
- **FE-Assets 畫面 + Overview KPI wiring** —— 下一個 **FE phase**（本 phase 純後端）。
- **schema 改 / 新 dep / ADR** —— 無（純 query-layer）。
- **生產 allocated 真數** —— deploy curation（本地用 W13 import 咗嘅測試數驗）。
- **utilization %/bar 計算** —— 派生語意留 FE 展示層（後端只出 raw + headroom/overAllocated）。

## 2. Approach
- `LedgerReadService`（LicenseModule）：`listLedger(actor)` = `opcoSkuLedger.findMany({ where: { ...scopeWhere(actor), sku:{active:true}, opco:{active:true} }, include:{opco,sku} })` → map 派生欄。`ledgerStats(actor)` = fetch scoped 數字欄 → reduce（overAllocatedCount 需 per-row 比較，JS reduce 而非 SQL aggregate）。
- Controller：2 GET method 落 `LicenseController`（read，同 catalog/drift GET 放行 OPCO_IT）。
- DTO：`LedgerRowDto` / `LedgerStatsDto`（`dto/ledger-read.dto.ts`）。

## 3. Deliverables
- **D1** — DTO + `LedgerReadService`（2 method）+ controller 2 GET + module provider。
- **D2** — tests（scope / 派生 / stats / empty）。
- **D3** — verify（build/lint/test + **live scoped round-trip**:run-as OPCO_IT 只見自己 · ADMIN 見全 · 派生對）+ closeout。

## 4. Phase Gates
- **G1** 兩 endpoint scoped 正確（OPCO_IT 只見自己 OpCo · ADMIN 見全）—— live 驗（run-as `AUTH_DEV_USER_EMAIL`）。
- **G2** 派生 headroom/overAllocated + stats 聚合有 test 實證。
- **G3** api build 0 error + lint clean + test green（92→+N）。
- **G4** 無 schema 改 / 無新 dep / 無 ADR（純 query-layer）。

## 5. Decisions / OD
- **OD1** = **兩個 endpoint**（`/ledger` rows + `/ledger/stats`）—— Chris approve。
- **OD2** = 只計 **active SKU + active OpCo**（soft-deactivated SKU 唔入 assets view）。default。
- **OD3** = 只出**現存 ledger 行**（sparse，唔為每個 OpCo×SKU 補 0 行）；FE 展示「已 track」。

## 6. Risks / 誠實限制
- 本地 allocated 真數 = W13 import 咗嘅測試數（test-e3/e1 × RHK/RTH）；生產真數需 deploy curation。
- utilization % 唔喺後端計（allocated 可為 0 → 除零風險）；後端只出 raw + headroom + overAllocated flag，%/bar 留 FE。

## 7. Changelog
- 1.0（2026-07-13）— active;Chris approve（OD1=兩個 endpoint）。開 D1。
