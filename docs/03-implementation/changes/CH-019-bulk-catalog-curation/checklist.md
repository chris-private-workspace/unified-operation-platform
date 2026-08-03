# CH-019 Checklist — SKU Catalog 批量 curation

> 對應 `spec.md`(status `approved`,2026-08-03)。ADR-0023 = **Accepted**。
> 規矩:唔可以刪未勾項 —— 只可以 `[ ]` → `[x]`,或者加 🚧 + 理由 + target。

## G — Gate(開工前)

- [x] G1 ADR-0023 status → `Accepted`(Chris approve,2026-08-03)+ OQ-1 決議記低
- [x] G2 `spec.md` status → `approved`(2026-08-03)
- [x] G3 ADR README 加 0023 一行
- [x] G4 BACKLOG 加 CH-019 一行(R7)

## B — 後端

- [x] B1 `license/catalog-csv.ts` —— header 按名對應(唔按位置)、`SkuId` 必需、三個可寫欄至少一個
- [x] B2 空白 `SkuId` 行 = spacer 跳過(跟 `matrix-csv.ts:79`)
- [x] B3 `Base licence` parse:`Yes/No/True/False/1/0` case-insensitive;**空白 = 唔改**;無法辨識 → 錯
- [x] B4 `Display name` / `Part number` / `Active` / `Last synced` 照收無視 → `unknownColumns`
- [x] B5 `dto/catalog-import.dto.ts` —— `csv` / `dryRun` / `confirmClears` + result DTO(§2.6 形狀)
- [x] B6 `catalog-import.service.ts` —— GUID Map(trim + case-insensitive),對唔到 → `skippedSkuIds`,**絕不 create**
- [x] B7 三個欄共用 `catalog.service.ts` 個 `normalizeOptional`(唔另寫一份)
- [x] B8 檔內同一 `SkuId` 出現兩次 → 400
- [x] B9 **重複 alias 閘**:算「套用後」全 active catalog 嘅 alias 全集 → 撞就 400,零寫入,列 `collisions`
- [x] B10 **clear 閘**:有 `clearsAlias` 而冇 `confirmClears: true` → 400,零寫入
- [x] B11 `dryRun` default `true`;寫入要 explicit `false`
- [x] B12 一個 `$transaction`:updates + 每 SKU `CATALOG_UPDATE` + 一條 `CATALOG_BULK_CURATE`
- [x] B13 `audit-fields.ts` 加 `CATALOG_BULK_CURATE` + targetType + allowlist
- [x] B14 `license.controller.ts` 加 `POST catalog/import`(class default role = ADMIN + REGIONAL)+ OpenAPI
- [x] B15 `license.module.ts` 註冊 provider
- [x] B16 **OQ-1**:抽 `license/alias-collision.ts`,**批量同單筆 `PATCH catalog/:id` call 同一個**;PATCH 撞 → 400 唔寫

## T — 後端測試(H5:curation = ledger scope gate)

- [x] T1 CH-018 export 原封重傳 → `changes: 0`
- [x] T2 改一行 alias → 只有嗰個 SKU 出現,before/after 正確
- [x] T3 `dryRun: true` 零 DB 寫入
- [x] T4 未知 `SkuId` → `skippedSkuIds`,catalog 行數不變
- [x] T5 欄調位 / 多餘欄 → 行為不變
- [x] T6 `Base licence` 空白 = 唔改;無法辨識 → 400
- [x] T7 檔內重複 `SkuId` → 400 零寫入
- [x] T8 重複 alias(檔內兩行撞)→ 400 零寫入
- [x] T9 **重複 alias(新 alias 撞到檔入面冇出現過嘅 SKU)→ 400 零寫入** ← 最易寫漏嗰條
- [x] T10 clear 冇 confirm → 400;加 confirm → 寫得入且 alias 變 null
- [x] T11 audit:每個改動一條 `CATALOG_UPDATE` + 一條 summary
- [x] T12 `OPCO_IT` → 403
- [x] T13 **OQ-1**:`PATCH catalog/:id` 改到會撞嘅 alias → 400 唔寫
- [x] T14 **OQ-1**:`PATCH` 改到唔撞嘅 alias → 照樣成功(閘門冇矯枉過正)
- [x] T15 **OQ-1**:`PATCH` **清空** alias → 唔被擋(null 唔算撞)
- [x] T16 `apps/api npm test` 全綠(≥746)

## F — 前端

- [x] F1 `catalog-import.tsx` inline panel(**唔用 Dialog** —— `dialog.tsx:47,60` body 冇 scroll)
- [x] F2 `catalog.tsx` 加 `Import CSV` **secondary**,Export 隔籬;Sync 仍然係唯一 primary(H6)
- [x] F3 Panel 插喺 toolbar 同 table 之間
- [x] F4 `api-types.ts` 型別 · `mutations.ts` `useCatalogImport`
- [x] F5 揀檔 → `file.text()` → `Preview import`
- [x] F6 Preview 兩區:普通改動 / **清空 alias**
- [x] F7 清空區 checkbox,文案講明「ledger 舊數會留低、之後每次 import 都 skip」
- [x] F8 400 結構化 detail render 得出(撞邊個 alias / 邊幾個 SKU)
- [x] F9 Apply 成功 → `invalidateQueries(['license','catalog'])` + toast
- [x] F10 長 preview 有 cap + 「+N more」(跟 `allocation-import.tsx` `MAX_ROWS`)
- [x] F11 token-only、lucide、數字 / GUID mono(DS-1/5/6)
- [x] F12 `apps/web npm test` 全綠(≥253)

## V — 驗收

- [x] V1 `npm run lint`(repo root)exit 0
- [x] V2 `ui-design` skill 跑過 —— **捉到 3 條**(DS-2 三個 sole-use 數值 / DS-3 panel 開住時兩個 primary / DS-7 有色邊框全 repo 冇先例),全部改咗,重掃零 violation(詳見 `progress.md`)
- [x] V3 Browser light 截圖 · V4 dark 截圖
- [x] V5 真上傳一次:改 3 個 SKU 嘅 alias + category + base,表即刻反映
- [x] V6 真撞一次 alias → 睇到 400 detail,DB 一個字冇變
- [x] V7 真清一次 alias → checkbox gate 擋到,剔咗先寫得入
- [x] V8 原封重傳 export → 0 changes
- [x] V9 Audit log 頁(`/audit`)真 render 到 `catalog.bulk_curate` + `catalog.update` 兩種 row + actor

## S — 收官

- [ ] S1 `progress.md` Day-N 寫齊,commit hash 對得返(R2)
- [x] S2 ADR-0023 → Accepted;OQ-1 決議(=都做)寫入 ADR D5 + Open Questions
- [x] S3 BACKLOG 更新(CH-019 closed + 新開 LINT-web)· `SESSION_SUMMARY.md` + `CLAUDE.md` §0 座標掃咗


