---
phase: W13-allocation-import
name: "Allocation import — O365 Excel → OpcoSkuLedger.allocatedQuantity（admin CSV upload + dry-run + commit）+ FE upload UI"
sprint_week: W13
backlog_id: DD-1 / BE-ledger-read（前置解封）
start_date: 2026-07-13
end_date: TBD
status: closed          # draft | active | closed — D1-D7 完成,G1-G7 全過(G4 guard-enforced 誠實註),live round-trip + FE upload UI light+dark 驗;DD-1 close
spec_refs:
  - docs/02-architecture/licenseops/DESIGN.md §5（ledger 兩層數字 · 初始化 · 方案甲）· §6（OpcoSkuLedger / SkuCatalog.businessAlias）· §10（open items）
  - docs/01-planning/DEFERRED_REGISTER.md DD-1（allocation import 恢復條件 = Chris 決 import 方式 → 本 phase）
  - docs/06-reference/02-doc-sample/O365 License Summery FY26.xlsx（真實來源結構,已 audit）
  - CLAUDE.md §5 H1（新 API surface → ADR）/ H3（D365 out-of-scope）/ H4（ADMIN-only）/ H5（ledger write test）/ H6（FE token-only）
prior_phase: W12-fe-fidelity-harden
adr: ADR-0004（import 機制決定,本 phase D1 寫）
---

# Phase W13 — Allocation import（O365 Excel → ledger allocatedQuantity）

> **Plan version**:1.0（draft）· **Owner**:Chris Lai
> **緣起**:DD-1（`allocatedQuantity` Excel import 未定）卡死 BE-ledger-read + FE-Assets 兩次。2026-07-13 Chris 決:**admin CSV upload endpoint + dry-run preview + commit**,格式 **CSV**,mixed-tier row 用 **curation-as-scope**,phase 含 **FE upload UI**。
> **本 phase = 建 import 機制,把手動 O365 Excel matrix 灌入 `OpcoSkuLedger.allocatedQuantity`**,解封後續 BE-ledger-read / FE-Assets。

## 0. 已 audit 的來源真相（O365 Excel）
- 單 sheet `List`,**wide matrix**:37 SKU（row）× 23 OpCo（col B-X）+ Grand Total（col Y）。格 = 整數 owned seat,空 = 0。
- **OpCo 映射 = solved**:欄標題與 seed `Opco.code` 逐字 1:1 同 order（seed 本就照此 Excel 起）→ `header === Opco.code` exact match,零 fuzzy。
- **SKU 映射 = curation 工作**:37 friendly name → skuId,經 `SkuCatalog.businessAlias`（schema 註明「old Excel label — for mapping」）。
- **mixed-tier**:含 D365 Finance/Sales/Marketing、Copilot Studio、Dataverse、Power Platform → **curation-as-scope**:只 curate in-scope M365 的 businessAlias,其餘（含 D365）unmapped → skip + 報。

## 1. Scope

### In
- **D1 — ADR-0004**:import 機制決定（admin CSV upload endpoint + dry-run + businessAlias 對映 + curation-as-scope + allocatedQuantity-only）+ alternatives（one-shot script / xlsx-native / import-all-mapped）+ consequences。
- **D2 — BE endpoint**:`POST /license/ledger/import`（`@Roles(ADMIN, REGIONAL)`;**非 OPCO_IT** — 全 OpCo 中央操作,OD2）。body = CSV 文字（OD1 raw-text,避 multer）。兩模式:**dry-run（default,唔寫 DB）** + **commit**（`{ dryRun: false }`）。
- **D3 — BE parse + map**:zero-dep CSV parse(wide matrix)→ unpivot 每個非空格 → OpCo（code exact）+ SKU（businessAlias）對映 → 分類 `mapped` / `skipped(unmapped-sku | unknown-opco | empty | grand-total)` → 計 allocatedQuantity delta（before → after）。
- **D4 — BE commit**:`$transaction` upsert on `@@unique([opcoId, skuCatalogId])`,**只寫 `allocatedQuantity`,絕不掂 `assignedQuantity`**（H5 硬 invariant）;idempotent（re-import 同檔 = 零 delta）。
- **D5 — BE tests（H5,catalog mock）**:對映正確 / unmapped-skip / **allocatedQuantity-only（assert assignedQuantity 不變）** / dry-run 唔寫 / commit 寫 / empty + Grand-Total skip / unknown-opco skip / idempotent re-import / scope 403（OPCO_IT）。
- **D6 — FE upload UI**:Settings › Integrations（取代現 coming-soon EmptyState）→ 檔案選擇（`file.text()` → dry-run POST）→ **preview table**(mapped N / skipped + reason / allocatedQuantity delta)→ confirm → commit POST → success toast。token-only、light+dark、lucide、H6。
- **D7 — Verify + closeout**:build/lint/test green;**live dry-run→commit round-trip**（真 O365-derived CSV 對 seeded/mock catalog）;FE preview 對真數;retro/BACKLOG/DD-1 close/memory。

### Out（H3 / surgical）
- **D365 tier**（獨立 D365 Excel + D365 licenses tracking）— curation-as-scope 自然 skip;要 track = 未來 tier,STOP + 平台級 ADR。
- **`assignedQuantity` / drift 任何改動** — import 絕不掂 baseline（方案甲命脈）。
- **SKU 名 auto/fuzzy/AI 對映** — businessAlias 由人手 curate,唔估。
- **BE-ledger-read endpoint 本身 + FE-Assets 畫面** — 係本 phase 解封的**下一批** phase;W13 只灌數 + 提供 import/preview。
- **成本 / 發票金額**（DocuWare 地盤）。
- **xlsx 原生解析**（Chris export CSV;避 H2 parser dep）。

## 2. Approach
- **CSV**:O365 `List` sheet export 成 CSV（wide matrix:R1=OpCo header、col A=SKU name、格=int）。parser zero-dep,防禦性處理 quoted field（SKU 名有 `()` 無 `,`,值係 int → 安全,但仍 handle quote）。
- **Transport（OD1）**:raw-text body（`Content-Type: text/csv` 或 `{ csv: string }`)→ 無 multer / 無 `@types/multer`,最 surgical。（multipart FileInterceptor 係後備,multer 已隨 platform-express 有。）
- **Mapping**:OpCo `header===Opco.code`;SKU `col-A===SkuCatalog.businessAlias`(active)。skip Grand Total 欄 + 空格 + 未 curate SKU + 未知 OpCo,全部落 `skipped` 報表。
- **Dry-run first**:default 唔寫 DB,回 preview（counts + per-row mapped/skipped + delta）。commit 要 explicit flag → human-in-the-loop scope 閘。
- **Write invariant**:`$transaction` 內只 `update/create { allocatedQuantity }`;既有 row 只覆蓋 allocatedQuantity,assignedQuantity 原封。
- **businessAlias curation（data dep,見 Risks R1）**:in-scope SkuCatalog entry 設 `businessAlias = Excel 名`;真數要先對真 tenant 跑 `catalog/sync`,本地用代表性 seed catalog 起測試。

## 3. Deliverables
D1 ADR-0004 · D2 endpoint · D3 parse+map · D4 commit(invariant) · D5 tests · D6 FE upload UI · D7 verify+closeout。逐 D 一 checklist 項。

## 4. Phase Gates
- **G1** ADR-0004 Accepted（機制 + alternatives + consequences)。
- **G2** dry-run→commit **live round-trip** 通:真 O365-derived CSV → preview 分類正確 → commit 後 ledger `allocatedQuantity` 對到 Excel 格;re-import 零 delta（idempotent）。
- **G3** **allocatedQuantity-only invariant** 有 test 實證（commit 後 assignedQuantity 不變）;H5 全套 green。
- **G4** scope:ADMIN/REGIONAL 可 import,OPCO_IT → 403（test + live）。
- **G5** FE upload UI:dry-run preview 對真數、confirm→commit→toast;**token-only、light+dark、lucide、H6 過**。
- **G6** build 0 error + lint clean + api/web test green（api 81→+N;web 8→+N）。
- **G7** 無新 runtime dep（CSV raw-text;`@types/multer` 若用僅 dev/type-stub = H2 豁免,plan 內 default 唔用）。

## 5. Decisions / OD（kickoff 時 confirm）
- **OD1** transport = **raw-text body**（避 multer）vs multipart FileInterceptor。**default raw-text。**
- **OD2** import role = **ADMIN + REGIONAL**（Regional IT owns Excel),**排除 OPCO_IT**（中央全-OpCo 操作)。confirm。
- **OD3** businessAlias curation 來源:真 tenant `catalog/sync` 後人手對 37 名;本地代表性 seed catalog 起測試。**真數 curation = deploy-time ops step**（非 code)。
- **OD4** dry-run default + explicit commit flag(`{ dryRun:false }`)。

## 6. Risks / 誠實限制
| # | Risk | 緩解 |
|---|---|---|
| R1 | businessAlias curation 需真 tenant sync 先有真 skuId → 本地無真 catalog | 機制用 mock/代表性 seed catalog build + test（H5 mock,唔打真 tenant);真 curation = deploy ops step,plan 標明 |
| R2 | CSV quoting / 隱藏空白 / SKU 名 typo 令 unmapped | 防禦性 parse + **dry-run preview** 落 commit 前照晒 mapped/skipped;skip 理由逐行報 |
| R3 | **誤寫 assignedQuantity → corrupt drift baseline** | $transaction 只寫 allocatedQuantity + **專門 invariant test**（assert 不變)+ code review;G3 gate |
| R4 | Excel 有 D365/mixed row 滲入 in-scope | curation-as-scope（只 curate M365)+ preview human 閘;D365 uncurated → skip |

## 7. 誠實限制
- W13 灌 `allocatedQuantity` 真數,但 UI 顯示（Overview seat KPI / FE-Assets utilization）= **後續 BE-ledger-read + FE-Assets phase**;W13 可見成果 = import capability + dry-run preview。
- 真 37-SKU curation 依賴真 tenant sync（未有 IT 真連線前,本地用代表性 catalog 起機制 + 測試）。

## 8. Changelog
- 1.0（2026-07-13)— draft;來源 Excel 已 audit(OpCo 映射 solved / mixed-tier 確認);4 個 OD 待 kickoff confirm;待 approve 開 D1(ADR-0004)。
- 1.0 → active（2026-07-13)— Chris approve;OD1=raw-text / OD2=ADMIN+REGIONAL(排除 OPCO_IT) / OD3=deploy-time curation + 本地代表性 catalog / OD4=dry-run default,全 confirmed。開 D1 ADR-0004 → D2。
