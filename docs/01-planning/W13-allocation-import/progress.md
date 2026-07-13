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

## Day 1 — 2026-07-13（D1 ADR + D2-D5 後端）

### Done
- **D1 ADR-0004**:`docs/adr/0004-allocation-import-mechanism.md`(Accepted)+ README index。決定 = admin CSV upload + dry-run + businessAlias 對映 + curation-as-scope + allocatedQuantity-only;alternatives = one-shot script / xlsx-native / import-all-mapped / denylist / multipart。
- **D2 endpoint**:`POST /license/ledger/import`(`@Roles(ADMIN,REGIONAL)`,OPCO_IT 排除)+ DTO(`dto/ledger-import.dto.ts`)+ wire `LicenseModule`。
- **D3 parse+map**:`csv.ts`(zero-dep parser)+ `allocation-import.service.ts`(header→Opco.code exact / col-A→businessAlias / unpivot / 分類 changes·skippedSkuLabels·unknownOpcoHeaders / before-diff delta)。
- **D4 commit**:`$transaction` upsert `opcoId_skuCatalogId`,**只寫 allocatedQuantity**(create 省 assignedQuantity → schema default 0;update 只 `{allocatedQuantity}`);dry-run default;idempotent。
- **D5 tests(H5)**:`csv.spec.ts`(6)+ `allocation-import.service.spec.ts`(5)——對映 / curation-skip(D365)/ unknown-opco / **allocatedQuantity-only invariant(assigned 存活)** / dry-run-no-write / commit / idempotent / blank→0 downgrade。

### Decisions
- **無 audit 表 → import 唔取 `@CurrentUser` actor**(DESIGN §6 刻意排除 LedgerAdjustment;keep minimal,§1.2)。future audit = follow-up。
- **change model = target≠before diff**:自然 cover 新增/加減/blank→0 downgrade;target===before(含 0===0)= no-op → idempotent 免費。
- **OD1 raw-text body 落實**(csv string,無 multer)。

### Verify（真 tool output）
- api **build 0 error**(nest build exit 0)· **lint exit 0**(--fix 12 prettier reflow)· **test 81→92 綠**(2 新 suite 11 test;full suite 13 suite 92 pass;"worker exit" = 既有 Jest teardown 雜訊非失敗)。

### Blockers
- 無。live dry-run→commit round-trip(G2)留 D7,需代表性 seed catalog(businessAlias curated)。

### Effort
- Planned:—;Actual:~1 day D1-D5。

### Commits
| Hash | Subject |
|---|---|
| 77c7915 | chore(planning): kickoff W13 allocation-import |
| (待指示) | feat(license): W13 D1-D5 allocation import endpoint + ADR-0004 |

---
