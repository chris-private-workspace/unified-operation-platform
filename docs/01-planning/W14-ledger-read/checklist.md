---
phase: W14-ledger-read
status: done
---

# W14 — BE-ledger-read — Checklist

> Plan approved 2026-07-13（OD1=兩個 endpoint）。read endpoint 有 test（scope/派生/聚合）。

## D1 — DTO + service + controller ✅
- [x] `dto/ledger-read.dto.ts`:`LedgerRowDto`(opco/sku ref + allocated/assigned + headroom + overAllocated)+ `LedgerStatsDto`
- [x] `LedgerReadService`:`listLedger(actor)`(shared `where` = scopeWhere + active sku/opco + include + 派生)· `ledgerStats(actor)`(select 數字欄 + reduce)
- [x] `LicenseController` 加 `GET /license/ledger` + `GET /license/ledger/stats`(`@Roles(ADMIN,REGIONAL,OPCO_IT)` + `@CurrentUser`)
- [x] `LicenseModule` provider/export 加 `LedgerReadService`

## D2 — tests（H5,mock prisma）✅
- [x] scope:OPCO_IT `where.opcoId='opco-rhk'` · ADMIN 無 opcoId(assert where)
- [x] 派生:headroom = allocated−assigned(61 / −4)· overAllocated = assigned>allocated(false/true)
- [x] stats:totalAllocated 747/Assigned 610/Headroom 137 · skusTracked 2/opcosTracked 2 distinct · overAllocatedCount 1
- [x] empty ledger → 空 rows / 全 0 stats

## D3 — verify + closeout
- [x] api build 0 error + lint clean(--fix prettier)+ test green(92→**96**)
- [x] **live scoped round-trip**(真 HTTP:ADMIN → 4 行[RHK/RTH]+ stats totalAllocated 2371/opcosTracked 2;run-as OPCO_IT[/me RHK]→ **只 2 RHK 行** + stats 741/opcosTracked 1;headroom=allocated 因 assigned 0)
- [ ] progress retro · plan closed · BACKLOG(BE-ledger-read ✅ → FE-Assets/Overview KPI 解封)· memory · commit(待指示)

## Phase Gate（plan §4)
- [x] G1 兩 endpoint scoped live 驗(ADMIN 4/2-OpCo · OPCO_IT 2/自己)
- [x] G2 派生 + stats 聚合 test 實證(4 test)
- [x] G3 api build 0 + lint 0 + 96 test green
- [x] G4 無 schema / 無新 dep / 無 ADR(純 query-layer,同 AUTH-3a)

## Cross-Cutting
- [ ] 每 commit references progress Day-N(R2)
- [ ] (純 query-layer,無 ADR — H1 不觸發)
- [ ] BACKLOG 同步(R7:BE-ledger-read ✅)
- [ ] progress closeout + status closed
