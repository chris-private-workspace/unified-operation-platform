# ADR-0004: Allocation import 機制（admin CSV upload + dry-run + businessAlias 對映 + curation-as-scope）

**Date**: 2026-07-13
**Status**: Accepted
**Approver**: Chris Lai

## Context

`OpcoSkuLedger.allocatedQuantity`（OpCo budget / owned，對應手動 Excel 格子，DESIGN §5/§6）一直 = 0：seed 唔播 ledger，import 方式未定。此 gap 登記為 **DD-1**，已兩次卡死 License Assets 前端與 BE-ledger-read（FE-1 deviation W06、AUTH pivot W09）。

來源是 Regional IT 手動維護的 `O365 License Summery FY26.xlsx`（DESIGN §4 描述的「37 SKU × 24 entity matrix，Sync by Manual」）。audit 後確認結構：單 sheet wide matrix，37 SKU（row）× 23 OpCo（col）+ Grand Total，格 = 整數 owned seat。

「新增一條寫入 ledger 的 import 機制 + 新 API surface」屬架構-adjacent 決定（CLAUDE.md §5 H1 邊界 / R5）→ 用戶 approve 後寫本 ADR 記錄。相關硬約束：**H3**（Excel 含 D365 等 out-of-scope tier）、**H4**（全-OpCo 中央操作 → ADMIN 級）、**H5**（掂 ledger write = critical-path adjacent，必 test）。

兩個來源真相決定了對映策略：
- **OpCo 對映已 solved**：Excel 欄標題與 seed `Opco.code` 逐字 1:1 同 order（seed 本就照此 Excel 起）→ exact match，零 fuzzy。
- **SKU 對映不可信名稱**（DESIGN §93：Excel 是同事網上找的 friendly name，對不上 API）→ 必須經 `SkuCatalog.businessAlias`（schema 註明「old Excel label — for mapping」）人手 curate。

## Decision

建 **`POST /license/ledger/import`** 端點（LicenseModule 內，`@Roles(ADMIN, REGIONAL)`，排除 OPCO_IT）：

1. **輸入 = CSV 文字**（O365 `List` sheet export；raw-text body，避 multipart/multer）。
2. **對映**：OpCo `header === Opco.code`（exact）；SKU `col-A === SkuCatalog.businessAlias`（active）。
3. **Curation-as-scope**：只為 in-scope M365 SKU curate `businessAlias`；未 curate 的 row（含 D365 / Copilot Studio / Dataverse / Power Platform）一律歸 `skipped(unmapped-sku)`，不入 ledger。curation set 即 scope 邊界。
4. **Dry-run first**：default `dryRun: true`，唔寫 DB，回 preview（mapped / skipped[分類 reason] / allocatedQuantity delta before→after）。commit 要 explicit `dryRun: false` → human-in-the-loop 閘。
5. **Write invariant**：commit 在 `$transaction` 內 upsert on `@@unique([opcoId, skuCatalogId])`，**只寫 `allocatedQuantity`，絕不掂 `assignedQuantity`**（後者是方案甲 drift baseline）。idempotent：re-import 同檔 = 零 delta。
6. **FE**：Settings › Integrations 提供 CSV upload UI（`file.text()` → dry-run preview 表 → confirm → commit）。

真數 curation（37 名 → 真 skuId）依賴真 tenant `catalog/sync`，屬 **deploy-time ops step**；機制本身以 mock / 代表性 seed catalog build + H5 測試（不打真 tenant）。

## Alternatives Considered

- **One-shot seed / CLI script**（parse 檔 → upsert，開發時手動 run）— rejected：最快解封但無 preview/無自助，Regional IT 每次 re-import 要 dev 介入；Chris 要 product-grade 的可重複自助路徑。
- **原生 .xlsx 直讀**（endpoint 收 xlsx）— rejected：要加 `exceljs`/`xlsx` runtime dep（觸 H2 + SheetJS `xlsx` 有 CVE 史）；CSV 由 Chris export 即可，零新 runtime dep。
- **Import-all-mapped**（凡對到 subscribedSkus 的 row 都入，包括碰巧在 tenant 的 D365）— rejected：模糊 H3（平台開始 track D365 allocation）；curation-as-scope 用「只 curate 想要的」達到同效果且邊界清晰。
- **Hard-exclude D365/Dataverse by name denylist** — rejected：多寫 code、名一改就脆；curation-as-scope（uncurated → skip）已同效果。
- **Multipart FileInterceptor（multer）上傳** — 後備可行（multer 隨 `@nestjs/platform-express` 已在），但 raw-text body 更 surgical（無 `@types/multer`、FE `file.text()` 直接 POST）→ **Chosen = raw-text**。
- **Chosen**：admin CSV upload endpoint + dry-run + businessAlias 對映 + curation-as-scope + allocatedQuantity-only write — 因為它同時滿足 product-grade 可重複自助、零新 runtime dep、H3 邊界清晰、H5 baseline 不受污染。

## Consequences

- **Positive**：解封 DD-1 → BE-ledger-read / FE-Assets 有真 `allocatedQuantity`；dry-run preview 令每次 import 前 human 可審 scope；OpCo 對映零 fuzzy（code exact）；`allocatedQuantity`-only invariant 保護 drift baseline；零新 runtime dep。
- **Negative**：SKU businessAlias 需一次性人手 curate（37 名，且要真 tenant sync 才有真 skuId）；CSV 要 Chris 每次由 Excel export（非自動 sync）；W13 本身不點亮 seat KPI / utilization UI（那是後續 BE-ledger-read + FE-Assets phase）。
- **Neutral**：Excel 仍是 budget 的 SSOT，平台做鏡像；`allocatedQuantity` 不參與 drift（純顯示/反映，DESIGN §96）；未來若要自助 D365 或自動 sync 屬新 tier / 新 ADR。

## References

- `docs/02-architecture/licenseops/DESIGN.md` §4（現況 Excel matrix）· §5（ledger 兩層 / 初始化 / 方案甲）· §6（`OpcoSkuLedger` / `SkuCatalog.businessAlias`）· §93/§96
- `docs/01-planning/W13-allocation-import/`（plan / checklist / progress）
- `docs/01-planning/DEFERRED_REGISTER.md` DD-1（本 ADR = 恢復條件）
- `docs/06-reference/02-doc-sample/O365 License Summery FY26.xlsx`（來源，已 audit）
- CLAUDE.md §5 H1（新 API surface）/ H3（D365 out-of-scope）/ H4（ADMIN-only）/ H5（ledger write test）/ H6（FE token-only）
