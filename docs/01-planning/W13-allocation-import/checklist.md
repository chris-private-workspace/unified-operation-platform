---
phase: W13-allocation-import
status: active
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

## D6 — FE upload UI（Settings › Integrations)
- [ ] 取代 coming-soon EmptyState → 檔案選擇(`file.text()`)→ dry-run POST
- [ ] preview table:mapped N / skipped + reason / allocatedQuantity delta
- [ ] confirm → commit POST → success toast
- [ ] token-only · light+dark · lucide · ui-design DS 自檢(H6)

## D7 — Verify + closeout
- [ ] api build 0 error + lint clean + test green(81→+N)
- [ ] web build 0 error + lint clean + test green(8→+N)
- [ ] **live dry-run→commit round-trip**(真 O365-derived CSV 對 seeded/代表性 catalog;preview 分類正確 → commit → ledger allocatedQuantity 對到格 → re-import 零 delta)
- [ ] FE upload UI live 驗(light+dark;preview 對真數)
- [ ] progress retro · BACKLOG(DD-1 close + BE-ledger-read 解封)· DEFERRED_REGISTER DD-1 → Close · memory · commit(待指示)

## Phase Gate（plan §4)
- [ ] G1 ADR-0004 Accepted
- [ ] G2 dry-run→commit live round-trip 通 + idempotent
- [ ] G3 allocatedQuantity-only invariant test 實證 + H5 全 green
- [ ] G4 scope ADMIN/REGIONAL import · OPCO_IT 403(test + live)
- [ ] G5 FE upload UI dry-run preview + commit + toast · token-only light+dark H6
- [ ] G6 build 0 error + lint clean + api/web test green
- [ ] G7 無新 runtime dep

## Cross-Cutting
- [ ] 每 commit references progress Day-N(R2)
- [ ] ADR-0004 written(R5)
- [ ] DD-1 → Close(DEFERRED_REGISTER)+ BACKLOG 同步(R7)
- [ ] progress closeout + status closed
