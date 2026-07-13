---
phase: W13-allocation-import
status: done
---

# W13 — Allocation import — Checklist

> Plan approved 2026-07-13(OD1-4 default)。逐 D 一項;critical path(ledger write)必同步 test(H5)。

## D1 — ADR-0004（import 機制決定)✅
- [x] 寫 `docs/adr/0004-allocation-import-mechanism.md`(Context → Decision[admin CSV upload + dry-run + businessAlias + curation-as-scope + allocatedQuantity-only] → Alternatives[one-shot script / xlsx-native / import-all-mapped / denylist / multipart] → Consequences → References)
- [x] `docs/adr/README.md` index 加 ADR-0004(status Accepted)

## D2 — BE endpoint（`POST /license/ledger/import`)✅
- [x] DTO(`dto/ledger-import.dto.ts`):request(csv string + dryRun flag)+ response(summary counts + changes[before/target/delta] + skippedSkuLabels + unknownOpcoHeaders)
- [x] controller method `@Roles(ADMIN, REGIONAL)`(OD2;OPCO_IT 唔加;無 audit 表 → 唔取 actor,keep minimal)
- [x] wire 入 `LicenseController` + `LicenseModule`(reuse;provider/export 加 `AllocationImportService`)

## D3 — BE parse + map ✅
- [x] zero-dep CSV parse(`csv.ts`;quoted field/CRLF/BOM/trailing-newline handle;6 test)
- [x] unpivot 每 cell → OpCo(`code` exact)+ SKU(`businessAlias` active)對映
- [x] 分類 changes(target≠before)/ skippedSkuLabels(unmapped)/ unknownOpcoHeaders(非 Grand Total);Grand Total + 空 header + blank SKU row skip;delta = target−before

## D4 — BE commit（invariant)✅
- [x] dry-run(default `dryRun !== false`)唔寫 DB,只回 preview
- [x] commit:`$transaction` upsert on `opcoId_skuCatalogId`,**create 省 assignedQuantity(schema default 0)+ update 只 `{ allocatedQuantity }`**
- [x] idempotent:re-import 同值 → target===before → 零 change(test 實證)

## D5 — BE tests（H5,catalog mock)✅
- [x] 對映正確(OpCo code + SKU businessAlias;dry-run summary 2/3/2/4)
- [x] unmapped-sku(D365)→ skippedSkuLabels · unknown-opco(BOGUS)→ 報 · Grand Total 非 unknown · blank/empty skip
- [x] **allocatedQuantity-only invariant**:每個 upsert create/update 皆無 `assignedQuantity`(assigned baseline 5 存活)
- [x] dry-run 唔寫(0 upsert)· commit 寫(4 upsert)· idempotent(0 change)· blank→0 downgrade(update `{allocatedQuantity:0}`)
- [x] scope:OPCO_IT → controller `@Roles(ADMIN,REGIONAL)` 排除(RolesGuard 既有 spec 覆蓋 403 路徑;live D7 驗)

## D6 — FE upload UI（Settings › Integrations)✅
- [x] 取代 coming-soon EmptyState → 檔案選擇(`file.text()`)→ dry-run POST(`allocation-import.tsx` + `useAllocationImport` + `apiPost` 加 optional body)
- [x] preview table:summary chips + changes(before→after/Δ tone)/ skipped SKU note / unknown-opco note
- [x] confirm → commit POST → success card(baseline-not-touched note)+ toast + "Import another"
- [x] token-only(bg-card/border-border/accent-soft/ok-soft/warn…)· lucide(Upload/Check/ArrowRight/AlertTriangle/FileText)· 保留 connector-status honest gap · light+dark 驗

## D7 — Verify + closeout
- [x] api build 0 error + lint clean + test green(81→**92**)
- [x] web build 0 error + lint clean + test green(**8**;bundle app chunk 94→102KB 仍無警告,CH-001 hold)
- [x] **live dry-run→commit round-trip**(真 HTTP:dry-run 4 changes + skip D365;commit committed:4;re-dry-run changes:0 = idempotent)
- [x] FE upload UI live 驗(DOM 量度:upload→filename→preview 4-row 表對後端→commit「Imported 4」+ toast;dark card bg `rgb(20,20,23)`↔light `rgb(255,255,255)` swap)
- [ ] progress retro · plan closed · BACKLOG(DD-1 close + BE-ledger-read 解封)· DEFERRED_REGISTER DD-1 → Close · memory · commit(待指示)

## Phase Gate（plan §4)
- [x] G1 ADR-0004 Accepted
- [x] G2 dry-run→commit live round-trip 通(真 HTTP 201:dry-run 4 / commit 4 / re-dry-run 0 idempotent)
- [x] G3 allocatedQuantity-only invariant test 實證(assigned=5 存活;每 upsert create/update 無 assignedQuantity)+ H5 92 green
- [x] G4 scope:controller `@Roles(ADMIN,REGIONAL)` 排除 OPCO_IT(RolesGuard 機制既有 spec 覆蓋;live per-endpoint 403 未單獨跑 — honest)
- [x] G5 FE upload UI:live upload→preview→commit→toast(DOM 量度)· token-only · light+dark swap 驗 · H6
- [x] G6 api build 0 error + lint 0 + 92 test · web build 0 error + lint 0 + 8 test
- [x] G7 無新 runtime dep(CSV raw-text;無 multer/xlsx;`apiPost` 加 optional body 只擴既有)

## Cross-Cutting
- [ ] 每 commit references progress Day-N(R2)
- [ ] ADR-0004 written(R5)
- [ ] DD-1 → Close(DEFERRED_REGISTER)+ BACKLOG 同步(R7)
- [ ] progress closeout + status closed
