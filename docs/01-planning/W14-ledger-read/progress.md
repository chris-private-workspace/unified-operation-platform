---
phase: W14-ledger-read
status: closed
---

# W14 — BE-ledger-read — Progress

## Day 0 — 2026-07-13（kickoff）

**緣起**:W13 令 `allocatedQuantity` 有得灌 + DD-1 close → BE-ledger-read（FE-1 OD1-A carry）解封。

**決定（AskUserQuestion）**:OD1 = **兩個 endpoint**（`GET /license/ledger` rows + `GET /license/ledger/stats` 聚合），皆 opco-scoped。純後端 mini-phase。

**查證**:無既有 ledger GET（ledger 只喺 import/assign 寫入面）；`scopeWhere(actor)`（AUTH-3a）直接可套 ledger query（scope field = `opcoId`）。純 query-layer 無 schema 改 → **H1 不觸發、無 ADR**（同 AUTH-3a）。

**做咗**:寫 plan（scope/4 gate/3 OD）+ checklist + progress。status active（Chris approve OD1）。

**下一步**:D1 — DTO + `LedgerReadService` + 2 GET + module。

---

## Day 1 — 2026-07-13（D1-D3 完成）

### Done
- **D1**:`dto/ledger-read.dto.ts`(`LedgerRowDto`[opco/sku ref + allocated/assigned + headroom + overAllocated]/ `LedgerStatsDto`)· `LedgerReadService`(shared `where(actor)` = `scopeWhere` + active sku/opco;`listLedger` include + map 派生;`ledgerStats` select 數字欄 + reduce,`overAllocatedCount` per-row JS)· `LicenseController` 2 GET(`@Roles(ADMIN,REGIONAL,OPCO_IT)` + `@CurrentUser`)· `LicenseModule` provider。
- **D2**:`ledger-read.service.spec.ts`(4)——scope(assert where opcoId)· 派生 · stats 聚合 · empty。
- **D3 verify**:api build 0 error · lint 0(--fix prettier)· **test 92→96 綠**;**live scoped round-trip**(見下)。

### Decisions
- **utilization % 唔喺後端計**(allocated 可 0 → 除零)→ 後端只出 raw + headroom + overAllocated,%/bar 留 FE(plan OD/Risk)。
- **stats 用 JS reduce 而非 SQL aggregate**:`overAllocatedCount` 需 per-row `assigned>allocated` 比較,SQL `_sum` 做唔到;ledger 細,fetch+reduce 簡單正確。
- **active-only**(OD2):`where` 加 `sku:{active:true}` + `opco:{active:true}`,soft-deactivated SKU 唔入 assets view。

### Verify（真 tool output）
- build 0 · lint 0 · **96 test**(14 suite)。
- **live(真 HTTP,dev-bypass,ledger = W13 browser commit 咗嘅 test-e3/e1 × RHK/RTH)**:
  - **ADMIN** `GET /license/ledger` → **4 行**(RHK×SPE_E3 661 / RHK×STANDARDPACK 80 / RTH×SPE_E3 1624 / RTH×STANDARDPACK 6;headroom=allocated 因 assigned 0;overAllocated false)· `/stats` → `totalAllocated 2371 / totalAssigned 0 / totalHeadroom 2371 / skusTracked 2 / opcosTracked 2 / overAllocatedCount 0`。
  - **run-as OPCO_IT**(`AUTH_DEV_USER_EMAIL=opco.it.rhk@rapo.com.hk`;`/me` role OPCO_IT scope RHK)→ `GET /license/ledger` **只 2 RHK 行** · `/stats` `totalAllocated 741 / opcosTracked 1` → **scope fail-closed 正確**。

### Blockers
- 無。

### Effort
- Planned:~half day;Actual:D0-D3 同日。

### Commits
| Hash | Subject |
|---|---|
| (待指示) | feat(license): W14 BE-ledger-read — ledger rows + stats endpoints |

---

## Closeout（status=closed）

### Acceptance verification（plan §4 gates）
| Gate | 結果 |
|---|---|
| G1 兩 endpoint scoped live | ✅ ADMIN 4/2-OpCo · OPCO_IT 2/自己(真 HTTP) |
| G2 派生 + stats 聚合 test | ✅ 4 test |
| G3 build 0 + lint 0 + test green | ✅ 96 |
| G4 無 schema / 無 dep / 無 ADR | ✅ 純 query-layer(同 AUTH-3a) |

全 4 gate ✅。

### Lessons
- **AUTH-3a `scopeWhere` 直接 reuse**:ledger scope field = `opcoId`,一個 spread 就 scoped read,零新機制。
- **stats overAllocatedCount 逼 JS reduce**(SQL aggregate 做唔到 per-row 比較)→ ledger 細,fetch scoped 數字欄 reduce 最簡單。
- **live 用 W13 import 咗嘅測試數**(test-e3/e1 × RHK/RTH,assigned 0)驗到 rows/stats/scope;真 allocated 生產數仍需 deploy curation。

### Carry-overs
- **FE-Assets 畫面**(consume `GET /license/ledger` rows + utilization bar/headroom/over-allocated)= 下一個 **FE phase 候選**。
- **Overview seat KPI wiring**(consume `/ledger/stats`)= 同 FE-Assets 或獨立小改。
- 真 allocated 生產數 = deploy curation(真 tenant catalog/sync + 37-SKU businessAlias)。

---

**End of W14 progress**
