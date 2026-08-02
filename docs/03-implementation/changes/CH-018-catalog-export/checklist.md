---
change_id: CH-018
spec_ref: ./spec.md
status: done            # in-progress | done
last_updated: 2026-08-02
---

# CH-018 — Checklist

> Atomic checkbox items derived from `spec.md §3` acceptance criteria。每 item ≤ 1-2h effort。
> AI tick 完成嘅 item;唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。

## Implementation

- [x] **F1** 新 `apps/web/src/lib/csv.ts` — `BOM` + `csvField`(由 `allocation-template.ts` **純搬**,一個字唔改)
- [x] **F2** `allocation-template.ts` 改用共用 `csv.ts`;其餘一個字唔改(diff = 加一行 import、刪兩個定義)
- [x] **F3** 新 `apps/web/src/lib/catalog-export.ts` — `buildCatalogCsv()`,**純函數唔掂 DOM**(同 template 一樣)
- [x] **F4** 八個欄 + 次序(§2.3)· Boolean `Yes`/`No` · 空值出**空格唔出 `—`** · BOM 前置
- [x] **F5** 排序同畫面一致 —— **唔再排序**(後端 `listCatalog()` 已 `skuPartNumber` 升冪,再排一次只會令檔同畫面對唔上)
- [x] **F6** `catalog.tsx` 加 `Export CSV`,**`secondary` variant** · `Download` icon · `rows.length === 0` → disabled
- [x] **F7** 匯出說明兩處:底部 Info 句(持久)+ toast(每次匯出都講)。兩處都明寫 **active**
- [x] **F8** Test — **16 條**(欄序 / 行數 / 逐欄值 / 逗號·引號·換行 escape / 空值唔出 em-dash / invalid timestamp / Boolean / 保持原序 / BOM / 檔名 / 空 catalog)
- [x] **F9** 🔴 **既有 template test 10 條全綠**(F2 純搬嘅迴歸網)
- [x] **F10** `cd apps/web && npm test` — **253 passed / 28 files**(CH-017 收官係 237)
- [x] **F11** `ui-design` 跑過,**零 violation**
      · **DS-2 特別查咗**(CH-016/CH-017 連續兩次喺新尺寸中招):`gap-[10px]` / `mt-[2px]` 兩個都 grep 證實係既有值,冇開新數值
      · DS-1 ✅ token-only · DS-3 ✅ **browser 實測** Export = `border-border bg-card`(無 accent)、Sync = `bg-accent`(唯一 primary)· DS-4 ✅ light+dark 都截圖 · DS-6 ✅ `Download` lucide(`allocation-import.tsx` 已用同一個)· DS-7/9/10 ✅ · DS-5/8/11/12 N/A

## Verification

- [x] **V1** Browser:Export 掣 render,class **唔含 `bg-accent`**;Sync 仍係唯一 primary
- [x] **V2** 真撳一次,攔截 Blob 驗內容:檔名 `sku-catalog.csv` · **100 行 = 99 SKU + header** · header 欄序逐字對
- [x] **V3** 內容對得返畫面:畫面 footer `1–8 of 99` / toolbar `99 SKUs` ⇒ **99 對 99** · 排序 `AAD_PREMIUM_P2 → AX7_USER_TRIAL → … → WINDOWS_STORE`(partNumber 升冪,同畫面一致)· 空 alias/category 出空格 · timestamp 因含逗號而被正確 quote
      · 🔴 **BOM 要睇 raw bytes 先算數**:`blob.text()` 會靜靜 strip BOM(TextDecoder 預設),第一次量到 `hasBom: false` 係量度方法錯。改用 `arrayBuffer()` → 頭三 byte = **`EF BB BF`** ✅
- [x] **V4** light + dark 都截圖,dark 零爆;toast「**Exported 99 active SKUs to sku-catalog.csv**」render 到(2.6s auto-dismiss 靠 stub `setTimeout` 凍結先影到 —— 唔靠 timing 撞彩)
- [x] **V5** 收工已清 browser 留低嘅 repo root 污染(兩張 PNG + `.playwright-mcp/`)

## Cross-Cutting

- [x] Each commit references `progress.md` Day-N entry(R2)
- [x] Commit message 標對應 component tag
- [x] ADR:**唔觸發 H1**(零後端 / 零 schema / 零新 dep;跟 W35 F2 已確立嘅 client-side 生成 pattern)
- [x] 🔴 **`npm run lint`(repo root,CI 同一條)exit 0**
- [x] Spec deviation:冇
- [x] Pending changes synced to `BACKLOG.md`(R7)
- [x] `CLAUDE.md §0` + `SESSION_SUMMARY.md` 座標掃過(§14)
- [x] `progress.md` closeout summary written + status flipped

---

**Lifecycle reminder**:呢份 checklist 隨 spec acceptance criteria 衍生。新加 item 必須先入 spec + changelog,然後再加 checklist。
