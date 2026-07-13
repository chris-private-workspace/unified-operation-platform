---
phase: W13-allocation-import
status: active
---

# W13 — Allocation import — Checklist

> Plan approved 2026-07-13(OD1-4 default)。逐 D 一項;critical path(ledger write)必同步 test(H5)。

## D1 — ADR-0004（import 機制決定)
- [ ] 寫 `docs/adr/0004-allocation-import-mechanism.md`(Context → Decision[admin CSV upload + dry-run + businessAlias + curation-as-scope + allocatedQuantity-only] → Alternatives[one-shot script / xlsx-native / import-all-mapped] → Consequences → References)
- [ ] `docs/adr/README.md` index 加 ADR-0004(status Accepted)

## D2 — BE endpoint（`POST /license/ledger/import`)
- [ ] DTO:import body(csv string + dryRun flag)+ response(counts + per-row mapped/skipped + delta)
- [ ] controller method `@Roles(ADMIN, REGIONAL)` + `@CurrentUser`(OD2;OPCO_IT 唔加)
- [ ] wire 入 `LicenseController` / module(reuse 既有 LicenseModule)

## D3 — BE parse + map
- [ ] zero-dep CSV parse(wide matrix:R1 OpCo header / col A SKU / int 格;防禦性 quote handle)
- [ ] unpivot 每非空格 → OpCo(`code` exact)+ SKU(`businessAlias` active)對映
- [ ] 分類 mapped / skipped(unmapped-sku | unknown-opco | empty | grand-total)+ 計 allocatedQuantity delta(before→after)

## D4 — BE commit（invariant)
- [ ] dry-run(default)唔寫 DB,只回 preview
- [ ] commit:`$transaction` upsert on `@@unique([opcoId, skuCatalogId])`,**只寫 allocatedQuantity**
- [ ] idempotent:re-import 同檔 = 零 delta

## D5 — BE tests（H5,catalog mock)
- [ ] 對映正確(OpCo code + SKU businessAlias)
- [ ] unmapped-sku / unknown-opco / empty / Grand-Total 全 skip + 報
- [ ] **allocatedQuantity-only invariant**:commit 後 assignedQuantity 不變(專門 assert)
- [ ] dry-run 唔寫 · commit 寫 · idempotent re-import
- [ ] scope:OPCO_IT → 403

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
