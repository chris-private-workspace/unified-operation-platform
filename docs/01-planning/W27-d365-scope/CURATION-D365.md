---
phase: W27-d365-scope
deliverable: D3
kind: deploy-time ops runbook
---

# D365 SKU Curation Runbook（deploy-time ops）

> **上位文件(2026-07-25,W35 F1)**:整體初始化流程(空 DB → 開放使用七步)見 **[`docs/05-usage/DATA-INITIALISATION.md`](../../05-usage/DATA-INITIALISATION.md)**。本文件 = 該流程**步 3(curation)嘅 D365 專門版**,兩者唔重複:通用步驟睇上位文件,D365 特定約定值同邊界睇本文件。

> **用途**:令 D365 license SKU 全流程參與 catalog / ledger / 對帳(方案甲）/ drift / assign。**ADR-0008 D5 已將 D365 license 納入 scope**;平台機制**早就 SKU-agnostic**(見 W27 grounding),所以「納入 D365」= **純 curation / data 動作,零 code 改**。真 skuId curation 一律 **deploy-time**(真 tenant sync 後),同 M365 curation(ADR-0004)一致。

## 0. 前提(點解只需 curation)
- `POST /license/catalog/sync` 由 tenant `subscribedSkus` 攞**全部** SKU(含 D365)入 `SkuCatalog` —— **冇 M365-only filter**(ADR-0004 明確 reject name-denylist)。
- 唯一 scope gate = **`businessAlias` 是否有值**,而且**只在 allocation-import 一處**生效;`reconcile`(drift)/ `tenant-owned`(總量)/ `assign` / `ledger` 全部只 filter `active`,SKU 一 sync 入就已包含。
- ∴ D365 SKU 被排除嘅唯一原因 = **未 curate**(純 data 狀態)。

## 1. Curation 步驟(每個要 track 嘅 D365 SKU)

1. **Sync**:跑 `POST /license/catalog/sync`(ADMIN)→ D365 SKU 以 `skuId`(GUID)入 `SkuCatalog`,`businessAlias=null`、`category=null`、`displayName=skuPartNumber`(placeholder)。
   - ⚠️ sync **永不覆寫** human-curated 欄位(`businessAlias`/`category`/`displayName`/`isBaseLicense`)—— 見 `catalog.service.ts` 註;curate 咗唔會被下次 sync 沖走。
2. **Curate**(**SKU Catalog 頁逐行 Edit** —— `PATCH /license/catalog/:id`,CH-003 已建;無需直改 DB)每個 D365 SKU:
   - **`category = "Dynamics 365"`** ← 本 phase 約定值(asset-list view 分組用;`category` 係自由 `String?`,非 enum);與現有 `"Base"`/`"Add-on"`/`"Power Platform"`/`"Security"` 並列。
   - **`businessAlias = <Excel/import label>`** ← **只在要行 allocation-import(CSV budget)時需要**,值 = O365 Summary CSV col-A 對應 D365 row 嘅 label(如 `"D365 Sales Sub Per User"`)。若唔經 CSV import(靠 assign +1 / PATCH ledger 建 ledger row),可留 null。
   - `displayName`:可改成 human-friendly 官方名(選）。
   - `isBaseLicense`:D365 一般 add-on,留 default `false`(UI hint,非 hard gate）。
3. **入 ledger(三選一,任何一條都得)**:
   - **CSV import**:`POST /license/ledger/import`(dry-run→commit)—— 只要 `businessAlias` 對到 CSV label,D365 row 就同 M365 一樣寫 `allocatedQuantity`。
   - **assign +1**:onboarding / 開單 assign D365 line item → `assignedQuantity +1`(自動建 ledger row）。
   - **手動 PATCH**:`PATCH /license/ledger/:id`(ADR-0007)手動 set allocated/assigned。

## 2. 自動生效(curate 後零額外動作)
- **對帳方案甲 / drift**:`reconcile` 逐個 active SKU 算 `Σ assignedQuantity vs tenant consumedUnits` → D365 SKU 自動參與、超出即 `DriftAlert`。
- **總量 owned**:`tenant-owned` 由 snapshot(sync 已寫)+ ledger 計 owned/allocated/assigned → D365 自動顯示。
- **assign**:D365 line item 經 `skuId` 直接 `graph.assignLicense`,**無類型 gate**;sync gate / 座位可用性 / usageLocation 等 gate 與 M365 一致。

## 3. 明確唔做(ADR-0008 D5 邊界)
- **D365-side provisioning**(security role / legal entity assignment)—— 喺 D365 admin,Graph 掂唔到,**永久 out**。本平台只做 **Entra license(subscribedSku)那層**。
- **D365 業務應用模組**(F&O 工作流等)—— future tier,非 license 層。
- **name-based auto-inclusion**:唔靠名 auto-curate;curation 係人 explicit 決定 track 邊啲 SKU(curation-as-scope 精神,ADR-0004 不變)。

## 4. 驗證(curate 後)
- `GET /license/catalog` 見 D365 SKU（active）。
- `POST /license/ledger/import` dry-run:D365 row 由 `skippedSkuLabels` 消失、變 `changes`。
- `POST /license/reconcile`:D365 SKU 出現喺 checked 計數;超出見 drift。
- `GET /license/tenant-owned`:D365 SKU 有 owned/allocated 數。

> **機制零改**:以上全部行既有 code path;本 runbook 只係 data 步驟。repo 側 parity 已由 W27 D1 test 鎖定(allocation-import / reconcile / assign / tenant-owned 各一 D365 case)。
