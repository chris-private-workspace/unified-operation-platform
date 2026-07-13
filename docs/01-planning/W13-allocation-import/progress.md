---
phase: W13-allocation-import
status: active
---

# W13 — Allocation import — Progress

## Day 0 — 2026-07-13（kickoff）

**緣起**:DD-1(`allocatedQuantity` Excel import 未定)卡死 BE-ledger-read + FE-Assets 兩次。傾 DD-1 → Chris 定 import 方式。

**傾出嘅決定(AskUserQuestion × 4)**:
- 機制 = **admin CSV upload endpoint**(非 one-shot script)。
- 格式 = **CSV**(避 xlsx parser dep / H2)。
- Row scope = **curation-as-scope**(只 curate in-scope M365,D365/unmapped → skip+報)。
- Phase scope = **後端 endpoint + FE upload UI 一齊**。

**Audit 來源真相(O365 Excel `List` sheet)**:wide matrix 37 SKU × 23 OpCo + Grand Total;**OpCo 映射 solved**(欄標題 === seed `Opco.code` 逐字 1:1);**SKU 映射 = businessAlias curation**;**mixed-tier**(含 D365 Finance 120 / Sales 175 等 → curation-as-scope skip)。**H2 前置查**:`@nestjs/platform-express` 已在(multer 係其 transitive dep),且 default 用 raw-text body 避 multer。

**做咗**:寫 `plan.md`(scope / 7 gate / 4 OD / risks)→ Chris approve(OD1-4 全 default,OD2=ADMIN+REGIONAL confirmed)→ flip active + checklist + progress。

**下一步**:D1 ADR-0004(import 機制決定)→ D2 endpoint。

**環境備忘**:來源檔 `docs/06-reference/02-doc-sample/O365 License Summery FY26.xlsx`(D365 檔同層,H3 out-of-scope 唔掂)。本地 SkuCatalog 空(未對真 tenant sync)→ 機制用代表性 seed catalog 起 + H5 mock 測試;真 37-SKU curation = deploy ops step。

---
