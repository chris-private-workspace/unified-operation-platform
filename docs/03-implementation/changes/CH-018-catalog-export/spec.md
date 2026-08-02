---
change_id: CH-018
title: "SKU Catalog 匯出 CSV — 令 allocation import 嘅 alias 睇得晒"
status: approved        # draft | proposed | approved | active | done | cancelled
created: 2026-08-02
target_completion: 2026-08-03
affects_components: [apps/web]
spec_refs:
  - ADR-0004(allocation import — curation-as-scope,alias 係 import 嘅 key)
  - W35 F2(allocation template 動態生成 — 本 CH 跟同一個 pattern)
---

# CH-018 — SKU Catalog 匯出

> **Spec version**:1.0(initial)
> **Owner**:Chris(提出)/ AI(起草)
> **Approved by**:**Chris Lai**(2026-08-02)

## 1. Context (Why)

Chris 2026-08-02:allocation import template 要填 `businessAlias`,但**冇任何路一次過睇齊 catalog 有咩 alias**。

查證(現況,唔係推測):

| 事實 | 出處 |
|---|---|
| Catalog 表 `PAGE_SIZE = 8`,91 個 active SKU ⇒ **要揭 12 頁** | `catalog.tsx:19` |
| 冇 search / filter / sort | `catalog.tsx`(整頁) |
| 冇任何 export | — |

### 🔴 但有一半問題其實已經解決咗(唔可以當佢唔存在)

W35 F2 已經有**動態生成嘅 template**(`allocation-template.ts`):column A 就係 curated alias、格仔已 pre-fill 現有 allocation、仲會列出未 curate 嘅 SKU part number。所以「填 template 嗰陣唔知有咩 alias」——**撳 Download template 就已經答到**。

⇒ 本 CH 唔係補嗰個洞。佢補嘅係**另一個**:template 只出「已 curate 且 active」嗰批,睇唔到 catalog 全貌(part number / skuId / category / base-flag),亦唔知**未 curate 嘅 SKU 叫咩名、值唔值得 curate**。要做呢件事今日只能揭 12 頁。

## 2. Scope (What)

### 2.1 Behavior Change

- **Before**:catalog 只能一頁 8 行咁揭。
- **After**:SKU Catalog 頁加一個 **Export CSV**,一鍵攞走成個 catalog(每個 SKU 一行,表上所有欄)。

### 2.2 做法:client-side 生成(跟 W35 F2 先例)

`allocation-template.ts` 已經確立咗呢個 pattern,連理由都寫低咗:「Client-side generation → zero new dependency, and nothing to keep in sync server-side」(`allocation-import.tsx:86-88`)。Catalog 前端本來就**已經全量載入**(`useCatalog()`,冇 server 分頁),所以:

- ❌ **唔開後端 endpoint**。多一個 `GET /license/catalog/export` 會製造第二個要同 read model 同步嘅地方,而換唔到嘢。
- ✅ 新 `apps/web/src/lib/catalog-export.ts` —— **純函數,唔掂 DOM**(同 `allocation-template.ts` 一樣,下載動作留喺 component)。

**共用 CSV escaping**:`allocation-template.ts` 有 `BOM` 同 `csvField`(RFC 4180)。抽去新 `apps/web/src/lib/csv.ts`,兩邊 import。理由唔係整潔 —— 係 **CSV escaping 寫錯會靜靜咁生出壞檔**,兩份實作各自漂移嘅代價遠高於抽一個 3 行函數。`allocation-template.ts` 只刪嗰兩個定義改 import,其餘一個字唔改。

### 2.3 欄位(= 表上八欄,少咗 Actions,多咗 Last synced)

```
Display name, Part number, SkuId, Business alias, Category, Base licence, Active, Last synced
```

- 順序:**同畫面一致** —— `skuPartNumber` 升冪(`catalog.service.ts:113` 已經係咁排,前端冇再排)。最少驚訝。
- Boolean 出 `Yes` / `No`(呢份嘢係畀人喺 Excel 睇,唔係餵機器)。
- `Last synced` 用前端既有 `formatDateTime`,同畫面顯示嘅字一樣。
- 空值出**空格**,唔出 `—`(嗰個 em-dash 係 UI 嘅 placeholder,入到 Excel 會變成要清嘅垃圾)。
- BOM 前置,同 template 一樣(alias 可能有非 ASCII,Excel 冇 BOM 會亂碼)。
- 檔名 `sku-catalog.csv`(跟 `license-allocation-template.csv` 慣例 —— **唔加日期**,重複下載直接覆蓋好過堆一地)。

### 2.4 🔴 只 export 得到 active SKU —— 而且要講出嚟

`catalog.service.ts:112` 嘅 `listCatalog()` 硬 `where: { active: true }` ⇒ **前端從來冇攞過 inactive SKU**。所以 client-side export 必然係 active-only。

呢個對本 CH 嘅 use case **足夠**:allocation import 本身都只讀 `active: true` 嘅 catalog(`allocation-import.service.ts:42-44`),即係話 inactive SKU 無論如何都填唔入 template。

**但唔可以靜靜當冇事** —— CH-016 §2.5 / CH-017 已經證實 inactive SKU 係真實痛點(佢哋嘅 ledger cell import 救唔返)。所以:

- 掣旁邊 / 匯出說明**明文寫住**「Active SKUs only」+ 數量。
- **`Active` 欄照出**(值永遠 `Yes`),唔為咗「反正都係 Yes」而刪 —— 一份寫住 `Active: Yes` 嘅檔,同一份冇呢欄嘅檔,對讀嘅人講唔同嘢。
- 要連 inactive 一齊 export = **out of scope**,見 §2.6。

### 2.5 UI

Catalog 頁 toolbar 現時右邊得一個 `Sync catalog from tenant`(**primary**)。加 Export:

- **`secondary` variant** —— 一個 view 一個 primary(H6),primary 仍然係 Sync。
- 位置:Sync 左邊,同一個 flex row。
- Icon `Download`(lucide,`allocation-import.tsx` 已用同一個)。
- `catalog.data` 未到 / 空 → disabled。
- 匯出後行為同 template 一樣:`URL.createObjectURL` → `<a download>` → revoke。

### 2.6 Out of Scope（explicit）

- ❌ **唔加後端 endpoint**(§2.2)。
- ❌ **唔做 round-trip / 批量 curate** —— Chris 2026-08-02 拍板「只睇」。要批量改 alias 係另一個 CH,而且掂 ADR-0004 curation-as-scope(curation 決定咩 SKU 入得到 ledger,批量改會一次過拉闊或收緊 scope),要 dry-run + audit。
- ❌ **唔加 inactive SKU** —— 要改 `listCatalog()` 加 `?includeInactive`(跟 `/license/ledger?includeEmpty` 慣例)。技術上好平,但佢改嘅係 read model 而唔係加個匯出掣,而且會連帶影響 Assets / template 幾個 consumer。想要就開 CH-019。
- ❌ **唔加 search / filter / 改 `PAGE_SIZE`** —— 揭 12 頁係真痛點,但 export 之後已經唔使靠揭頁去搵 alias。改分頁 / 加搜尋係獨立嘅 UX 改動,唔喺呢張單順手做。

### 2.7 順帶觀察(唔改,只記低)

Catalog 表個 `Active` 欄有 inactive 樣式(`bg-neutral` 灰點,`catalog.tsx:288`),但因為 `listCatalog()` 過濾咗 ⇒ **嗰個灰點永遠唔會 render**。屬既有 dead branch,唔喺本 CH 改(§1.3),但同 §2.4 同源,一併記低。

## 3. Acceptance Criteria

- [ ] SKU Catalog 頁見到 `Export CSV`,`secondary` variant(**Sync 仍然係唯一 primary**)
- [ ] 撳落去下載到 `sku-catalog.csv`,行數 = catalog 行數 + 1(header)
- [ ] 八個欄齊、次序同 §2.3、排序同畫面一致
- [ ] 含逗號 / 引號 / 換行嘅 alias 正確 escape(RFC 4180),Excel 開得返
- [ ] 空 alias / category / lastSyncedAt → **空格**,唔係 `—`
- [ ] BOM 在,Excel 開非 ASCII alias 唔亂碼
- [ ] 匯出說明有寫 **Active SKUs only** + 數量
- [ ] `catalog.data` 未到 → 掣 disabled
- [ ] `allocation-template.ts` 改用共用 `csv.ts` 之後,**既有 template test 全綠**(行為零改變)
- [ ] `cd apps/web && npm test` 全綠 · `npm run lint`(repo root)exit 0
- [ ] `ui-design` skill 跑過,零 violation(**特別留意 DS-2** —— 連續兩個 CH 喺 select / 尺寸新數值上中招)
- [ ] Browser 驗:light + dark · 真下載一次 · 內容對得返畫面

## 4. Risks

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | 用戶以為呢份檔改完可以傳返上去 | **Med** | Med | 匯出說明明寫「read-only reference」;round-trip 係 §2.6 明文 out-of-scope |
| R2 | 用戶以為 export 咗就係 catalog 全部,但 inactive 唔喺度 | Med | Med | §2.4 —— 掣旁明文 + `Active` 欄照出 |
| R3 | 抽 `csvField` 令 template 行為變咗 | Low | **High** | 純搬,一個字唔改;既有 template test 就係迴歸網(acceptance 有一條專門守) |
| R4 | 順手擴去做 search / 分頁 / bulk curate | Med | Med | §2.6 明文 |

## 5. Effort Estimate

**~0.5 日**(lib + test ~0.2 · UI ~0.1 · browser 驗 ~0.2)。

## 6. Dependencies

冇。零後端改動、零新 dependency、零 schema。

## 7. Spec Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-08-02 | Initial draft(proposed) | Chris 指出 template 要 alias 但冇路匯出 catalog | — |
| 2026-08-02 | 一項拍板:**只做純 export,唔做 round-trip 批量 curate**(否決 round-trip / 分兩步) | 起草前提問,即場定案 | Chris |

---

**Lifecycle reminder**:呢份 spec locked after status=approved。重大 deviation → §7 changelog。
**Gate reminder**:status 而家係 `proposed` —— **Chris review + approve 先可以 `approved` + 開始 code**(PROCESS R1.change)。
