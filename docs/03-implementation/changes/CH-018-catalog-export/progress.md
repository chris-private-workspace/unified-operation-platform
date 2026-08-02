---
change_id: CH-018
spec_ref: ./spec.md
checklist_ref: ./checklist.md
status: closed          # in-progress | closed
---

# CH-018 — Progress

> Day-N entries during execution + 結尾 closeout summary。
> 每 commit 必須對應一個 Day-N entry mention(R2 binding rule per PROCESS.md §5)。

---

## Day 1 — 2026-08-02

### Done

F1~F11 + V1~V5。SKU Catalog 頁加 `Export CSV`,client-side 生成,零後端 / 零新 dep / 零 schema。
web **253 / 28 files**(CH-017 收官 237)· repo lint exit 0。

### 起草階段就要講清楚嘅一件事

Chris 提嘅痛點係「template 要填 businessAlias,但冇路匯出 catalog」。查證之後發現**有一半已經解決咗**:W35 F2 嘅 `buildAllocationTemplate()` 生出嚟嘅檔,column A 就係 curated alias、格仔仲 pre-fill 咗現有 allocation。

⇒ 如果照字面「加個匯出」就做落去,交付咗都幫唔到手(佢已經有嗰半)。真正未補嘅係**另一半**:template 只出「已 curate 且 active」嗰批,睇唔到 catalog 全貌(part number / skuId / category / base-flag),亦唔知**未 curate** 嘅 SKU 叫咩、值唔值得 curate。而呢件事今日真係只能揭 12 頁(`PAGE_SIZE = 8`,99 個 SKU)。

本 CH 補嘅係後者。呢個分辨寫入 spec §1,免得下手以為 template 冇用。

### Decisions

- **只做純 export,唔做 round-trip**(Chris 2026-08-02 拍板)。批量 curate alias 會掂 ADR-0004 curation-as-scope —— curation 決定咩 SKU 入得到 ledger,一份 CSV 改晒等於一次過拉闊 / 收緊 scope,要 dry-run + audit,係另一張單。
- **唔開後端 endpoint**。Catalog 前端本來就全量載入(冇 server 分頁),而 `allocation-template.ts` 已經確立咗 client-side 生成呢個 pattern 連理由(「zero new dependency, nothing to keep in sync server-side」)。多一個 `GET /license/catalog/export` 只會製造第二個要同 read model 同步嘅地方。
- **抽 `csvField` / `BOM` 去共用 `csv.ts`**。呢個係本 CH 唯一掂既有檔嘅改動,理由唔係整潔:CSV escaping 寫錯**唔會爆**,只會靜靜生出一個 Excel 開錯欄嘅檔。兩份各自實作嘅漂移代價,遠高於共用一個三行函數。既有 10 條 template test 就係迴歸網(F9)。
- **`Active` 欄照出,值永遠 `Yes`**。睇落多餘,但一份寫住 `Active: Yes` 嘅檔同一份冇呢欄嘅檔,對讀嘅人講唔同嘢 —— 前者明確話畀你聽「呢度只有 active」。

### 🔴 只 export 得到 active SKU —— 唔係取捨,係前端根本冇嗰啲資料

`catalog.service.ts:112` 嘅 `listCatalog()` 硬 `where: { active: true }`,所以 `useCatalog()` 從來冇攞過 inactive SKU。

對本 CH 嘅 use case **足夠**(allocation import 本身都只讀 active catalog ⇒ inactive SKU 無論如何填唔入 template)。但 CH-016 §2.5 / CH-017 已經證實 inactive SKU 係真痛點,所以唔可以靜靜當冇事:掣底下 Info 句 + 每次匯出嘅 toast **兩處都明寫 active**。

要連 inactive 一齊 = 改 read model(加 `?includeInactive`,跟 `/license/ledger?includeEmpty` 慣例),會連帶影響 Assets / template 幾個 consumer ⇒ spec §2.6 明文 out-of-scope。

### 順帶觀察(唔改,§1.3)

Catalog 表個 `Active` 欄有 inactive 樣式(`bg-neutral` 灰點),但因為 `listCatalog()` 過濾咗 ⇒ **嗰個灰點永遠唔會 render**。既有 dead branch,同上一段同源,spec §2.7 記低。

### 🔴 驗證方法本身錯過一次(值得記低)

V3 第一次量 BOM,用 `blob.text()` 之後 `charCodeAt(0)` —— 量到 `hasBom: false`。

**唔係 code 錯,係量度方法錯**:`Blob.text()` 行 UTF-8 decode,而 `TextDecoder` 預設會 **strip 開頭嘅 BOM**。改用 `arrayBuffer()` 睇 raw bytes → 頭三個 byte = `EF BB BF`,BOM 一直都喺。

同類:toast 有 2.6s auto-dismiss,靠 click 之後即刻讀係撞彩(試咗兩次都撞唔到)。改為先 stub `window.setTimeout` 令 2600ms 嗰個唔生效,再撳 —— 一次就穩定捉到。**「驗唔到」同「唔存在」係兩回事,分唔清就會改一段本來啱嘅 code。**

### Deviations

冇。

### Blockers

冇。

---

## Closeout — 2026-08-02

**交付**:SKU Catalog → `Export CSV`(secondary,Sync 仍係唯一 primary),一鍵攞走 99 個 active SKU 嘅八個欄。

**驗證強度**:web 253 全綠(含既有 template 10 條)· repo lint exit 0 · browser 攔截 Blob 逐項對(**100 行 = 99 + header**、欄序逐字、排序同畫面一致、BOM raw bytes `EF BB BF`)· light + dark 都截圖 · toast 文案凍結咗嚟驗。

**留低嘅 pending**(唔屬本 CH,想要就開新單):
- 連 inactive SKU 一齊 export → 要改 `listCatalog()` 加 `?includeInactive`(spec §2.6)
- 批量 curate alias(round-trip)→ 掂 ADR-0004 curation-as-scope
- Catalog 頁 search / filter / `PAGE_SIZE` —— export 之後已經冇咁痛,但 13 頁分頁仍然喺度
