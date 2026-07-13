---
phase: W13-allocation-import
status: closed
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
| df3a7ac | feat(license): W13 D1-D5 allocation import endpoint + ADR-0004 |

---

## Day 1 — 2026-07-13（D6 FE upload UI + D7 verify）

### Done
- **D6 FE upload UI**:`components/settings/allocation-import.tsx`(`AllocationImportPanel`)——選檔 `file.text()` → dry-run preview(summary chips + changes 表 before→after/Δ tone + skipped-SKU note + unknown-opco note)→ commit → success card(baseline-not-touched)+ toast + Import-another。wire 入 Settings › Integrations(取代 coming-soon,保留 connector-status honest gap)。支撐:`apiPost` 加 optional body、`useAllocationImport` hook、api-types 加 `LedgerImport*`。
- **D7 verify**:
  - **Backend live(真 HTTP,dev-bypass + 代表性 seed catalog[test-e3/e1 businessAlias curated])**:dry-run → summary `{opcoColumns:2,skuRows:3,mappedSkuRows:2,changes:4}` + skippedSkuLabels `["D365 Sales Sub Per User"]` + unknownOpcoHeaders `[]`;commit → committed:4;re-dry-run → changes:0(**idempotent**)。
  - **FE live(DOM 量度,screenshot timeout → JS 讀 DOM)**:panel render(light 截圖)→ inject File(defineProperty getter,因 browser 封 `input.files` set)→ onChange 出 filename + Preview → click Preview → changes 表 4 行精準對後端 + skip D365 note + chips → click Commit → 「Imported 4 allocation changes」+ baseline note + toast → dark card bg `rgb(20,20,23)`↔light `rgb(255,255,255)` swap。
  - build/lint/test:api 92 · web 8 · 皆 exit 0;web app chunk 94→102KB(仍無 >500KB 警告)。

### Decisions
- **FE upload transport**:`apiPost` 由 no-body 擴為 optional body(mirror `apiPatch`),向後相容既有 caller(reconcile/catalog-sync);無新 dep。
- **Integrations tab** 保留 connector-status coming-soon(honest gap:integration-status API 未有),只加 allocation import panel。
- **delta tone**:>0 → `text-ok`、<0 → `text-warn`(allocation 增/減,非 drift danger)。

### Verify（真 tool output）
- api build 0 error · lint 0 · **92 test 綠**;web build 0 error · lint 0 · **8 test 綠**。
- Backend live 201:dry-run/commit/idempotent/curation-skip 全對;FE live DOM:upload→preview→commit→toast + light/dark swap 全對。

### Blockers
- 無。真 37-SKU 生產 curation = deploy ops step(需真 tenant catalog/sync;本地用 test-e3/e1 代表性 catalog 起 + H5 mock)。

### Effort
- Planned:~1 day;Actual:D1-D7 同日。

### Commits
| Hash | Subject |
|---|---|
| (待指示) | feat(web): W13 D6-D7 allocation import upload UI + verify |

---

## Closeout（status=closed）

### Acceptance verification（plan §4 gates）
| Gate | 結果 |
|---|---|
| G1 ADR-0004 Accepted | ✅ |
| G2 dry-run→commit round-trip + idempotent | ✅ 真 HTTP(4/4/0) |
| G3 allocatedQuantity-only invariant + H5 | ✅ 92 test |
| G4 ADMIN/REGIONAL · OPCO_IT 排除 | ✅ guard-enforced（live per-endpoint 403 未單獨跑,honest） |
| G5 FE upload preview+commit+toast · token-only light+dark | ✅ DOM 量度 + swap 驗 |
| G6 build/lint/test api+web green | ✅ |
| G7 無新 runtime dep | ✅ |

全 7 gate ✅（G4 誠實註明機制-enforced）。

### Lessons
- **來源 audit 先於 code 省大量猜測**:O365 Excel 一睇即知 OpCo 映射 = solved(header===Opco.code,seed 照此起)+ mixed-tier(D365 內含)→ curation-as-scope 天然邊界。
- **change=target≠before diff model** 令 idempotent / downgrade-to-0 / 新增 全部一條邏輯 cover,免特例。
- **allocatedQuantity-only invariant** 用專門 test(assigned baseline 存活)守住 drift baseline —— fidelity phase 之後最易被忽略嘅 correctness 線。
- **browser 封 `input.files` set** → file_upload host-path 亦已停用 → 用 `Object.defineProperty` getter 注入 File 驅動真 onChange;screenshot busy → JS DOM 量度(W08 pattern)。
- **本地驗需代表性 seed catalog**(SkuCatalog 空,未對真 tenant sync);臨時 script 放 `apps/api/prisma` resolve `@prisma/client`,用完即刪(未 commit)。

### Carry-overs
- **BE-ledger-read**(GET ledger read-model)= 解封,下一 phase 候選 → 之後 FE-Assets + Overview seat KPI。
- 真 37-SKU 生產 curation + 真 tenant catalog/sync = deploy ops step(隨 AUTH-2b IT 真連線)。
- FE upload UI 只 admin/regional;OPCO_IT live 403 per-endpoint 可補一個 e2e。

---

**End of W13 progress**
