---
change_id: CH-008
spec_ref: ./spec.md
checklist_ref: ./checklist.md
status: in-progress    # in-progress | done
---

# CH-008 — Progress

> During-execution log + completion summary。每 commit 對應一個 Day-N entry(R2)。

---

## Day 0 — 2026-07-25:Spec drafted(**proposed,未 approve**)

**Action**:CH-008 開單(PROCESS §3)
- Templates copied from `_templates/change/`
- `spec.md` filled,status=**`proposed`** —— 等 Chris review + approve 先可以 flip `approved` 並開工(R1.change)
- `checklist.md` 由 spec §3 acceptance 衍生,**全部 item 鎖住**

### 觸發本 change 嘅 grounding

Chris 問:「某 OpCo 某種 license 冇數量了,記錄改成 0 之後仍然存在,唔知係唔係應該咁。」逐條查 code:

| 查證 | 結果 | 依據 |
|---|---|---|
| 有冇 DELETE 路徑 | **冇**;`OpcoSkuLedger` 亦冇 `active` 欄 | `license.controller.ts` 全查 · `schema.prisma:116-128` |
| read-model 有冇零值過濾 | **冇** | `ledger-read.service.ts:19-42` |
| 前端有冇 | **冇**(只 filter OpCo + 搜尋字) | `by-opco-view.tsx:257-267` |
| stats 會唔會虛報 | **會** —— `skusTracked`/`opcosTracked` 係 distinct count over rows,而該數字**印喺 Allocated tile 副標** | `ledger-read.service.ts:74-75` · `by-opco-view.tsx:334` |
| ADR-0007 有冇講過刪除 | **完全冇** ⇒ 從未決策,唔係刻意設計 | ADR-0007 grep 零命中 |

### 🔴 額外揪到嘅顯示 bug(Chris 冇問)
`assetStatus()` 判斷次序係 over-allocated → `allocated>0 && headroom===0` → **否則綠色 `Headroom`**。
⇒ **0/0 row 會顯示成綠色「Headroom」+ utilization 0%**,讀落係「有剩餘容量」,實際係乜都冇。呢個比「row 唔消失」更誤導,所以一併納入本 change(`lib/ledger.ts:34-41`)。

### 為何唔做真刪除(兩個決定性理由)
1. **`LedgerAdjustment.ledger` 帶 `onDelete: Cascade`**(`schema.prisma:139`)⇒ 硬刪一行 ledger 會**連帶靜靜刪埋佢全部 ADR-0007 audit trail**。
2. 平台一貫 **soft-deactivate、從不硬刪**(`SkuCatalog` 明文「FK 必須完整」· `Opco` CH-004 deactivate · `AppUser` active)—— ledger 開硬刪會係全 domain 唯一一個。

∴ 問題唔在保留資料,而在**無條件顯示 + 顯示成綠色**。Chris 揀**選項 A(顯示層解決)**。

### 現況數據(dev DB 實查)
`SELECT` 結果:**148 行**;`0/0` = **0 行**;`assigned=0 AND allocated>0` = **21 行**(= 有預算未派人,**真資訊,唔屬目標**)。
⇒ 問題今日未浮現,但路徑真實:手動 edit 改到 0/0、或 import 把某格由 120 改成空白。

### 影響面盤點(改之前先數清 consumer)
- `useLedger` → by-opco-view(表)+ **allocation-import**(F2 範本)⇒ 範本對缺 row 已 `?? 0` fallback,內容不變(A8 驗)
- `useLedgerStats` → by-opco-view stat tiles + **overview.tsx:178**(只用 `totalAssigned`)⇒ **Overview 一個數字都唔會動**(0 對總數貢獻 0)
- `platform-view.tsx` 用 `/tenant-skus/stats`(另一個 service)⇒ 不受影響
- 既有 `assetStatus` 3 個 test 全部用 `allocatedQuantity: 10` ⇒ **冇一條 assert 0/0 → Headroom**,加分支唔會撞爛舊 test

### 五個設計決定(spec §2.2)
**D1** empty = `allocated===0 && assigned===0`(`allocated>0, assigned=0` 明確唔算)· **D2** 過濾落 read-model 而唔止前端(否則 tile 副標同表自相矛盾),param 鏡射 CH-004 `?includeInactive` · **D3** toggle 用既有 `checkbox.tsx` · **D4** `assetStatus` 加 `Empty`/neutral 且**排喺 `overAllocated` 之後** · **D5** 零 schema、零新 endpoint ⇒ 唔觸發 H1。

### Blockers
- **spec 未 approve**(`proposed`)→ 依 R1.change,一行 code 都唔寫
- ⚠️ **R1 要 Chris 特別留意**:隱藏之後,因為冇 create endpoint(**DD-3**),用戶會冇路徑把該格由 0 調返非零 ⇒ toggle 係**必需品而非裝飾**。若 Chris 覺得呢個 trade-off 唔可接受,應該考慮連 DD-3 一次過做(即 spec §2.3 講嘅「留返 `Drift-resolve`」)

**Commit**:`40105a8` — `docs(changes): CH-008 spec — ledger 空白行預設隱藏 + 修正誤導狀態`

---

## Day 1 — 2026-07-26:**Spec approved**,gate 解除

**Chris approve**(spec 內容零改動)⇒ `status: proposed → approved`,checklist 解鎖,可以開工。

Chris 明確接受 §4 **R1** 嘅 trade-off:隱藏之後因為冇 create endpoint(**DD-3**),用戶要靠 toggle 搵返該格 ⇒ toggle 係**必需品而唔係裝飾**。DD-3 本身仍然未解(留 `Drift-resolve`)。

### ⚠️ 開工前必讀 —— 同 CH-009 嘅交互(同日 approve)

CH-009(assign 前可用量可見度)靠**同一個** `GET /license/ledger` 做 `(opco, sku)` lookup。本 change 令該 endpoint **預設排除 0/0** ⇒ CH-009 嘅 lookup 對 0/0 格會落空。

**兩者結論一致**(落空 = `allocated = 0` = 「未設預算」),所以唔需要為對方改任何嘢。但 **唔可以**為圖方便而喺 request detail 傳 `?includeEmpty=true` —— 咁會令本 change 嘅預設失效。詳見 CH-009 spec **§2.4**;CH-009 **A4** 專門守呢點。

> 三者一致:本 change 隱藏 0/0 → CH-009 顯示「未設預算」→ **ADR-0016**(同日 Accepted)擋 assign。同一個狀態,三個層面講同一件事。

**Commit**:`<hash>` — approve gate flip + ADR-0015/0016 Accepted + 文檔同步

---

## Completion summary(填於 done)

_(待實作)_
