---
change_id: CH-026
title: "Unlimited / 冇 seat 概念嘅 SKU 喺 Platform view 顯示成點"
status: draft
created: 2026-08-12
target_completion: TBD
affects_components: [apps/web, apps/api/license]
spec_refs:
  - docs/02-architecture/licenseops/DESIGN.md §5(三層 owned → allocated → assigned)
  - ADR-0008 D5(D365 一視同仁)
---

# CH-026 — Unlimited SKU 喺 Platform view 顯示成點

> **Spec version**:0.1(**draft** —— §5 三條 OQ 未決,**未可以 approve**)
> **Owner**:Chris Lai
> **分類**:Change,**但視乎 §5 OQ-2 點答,可能觸發 H1**(見 §4)

## 1. Context (Why)

Chris 2026-08-12:「有些 SKU catalog 其實應該是 unlimited 的數量的,但是現在顯示在 license assets → platform view 中,那些數量很奇怪。」

### 1.1 查證:確認係一個由頭到尾未處理過嘅情況

`graph.service.ts:89` —— `prepaidEnabled: s.prepaidUnits?.enabled ?? 0`。**Graph 畀乜就存乜,零詮釋。** 全 repo 搜「unlimited」只有 allocation gate 嘅「no unlimited by default」,同 SKU 數量無關。

### 1.2 🔴 真數據(本機 tenant snapshot,2026-08-10 sync,101 個 SKU)

**唔止一個哨兵值,係三個**:

| `prepaidEnabled` | SKU 數 | 例子(連實際用量) |
|---|---|---|
| **1000000** | 4 | `POWER_BI_STANDARD` (用緊 **3064**) · `STREAM` (25) · `FORMS_PRO` (23) · `WINDOWS_STORE` (0) |
| **50000** | 1 | `RIGHTSMANAGEMENT_ADHOC` (0) |
| **10000** | 17 | `FLOW_FREE` (用緊 **4525**) · `CCIBOTS_PRIVPREV_VIRAL` (157) · `MICROSOFT_BUSINESS_CENTER` (16) · 一堆 `*_viral_trial` |

⚠️ **我開頭推論係 `10000000`(一千萬),實際係 `1000000`(一百萬)。** 記低呢個:呢類「常見哨兵值」嘅記憶**唔可以當事實用嚟設計**,一定要查真數據。

**第二類,Chris 冇提但同樣會令人讀錯**:`prepaidEnabled = 0` **但真係有人用**

| SKU | owned | 實際用緊 |
|---|---|---|
| `POWER_BI_PRO` | 0 | **91** |
| `FLOW_PER_USER` | 0 | **67** |
| `DESKLESSPACK` | 0 | **52** |
| `VIVA` | 0 | **30** |

### 1.3 後果(兩個,一個顯示一個功能)

**① Grand total 已經冇意義。** 光係哨兵值就貢獻 `4×1000000 + 1×50000 + 17×10000` = **4,220,000**,而 tenant 最大嘅**真實**採購量係 `4502`(SPE_E5)。⇒ KPI card「Owned in M365」同表頂「All SKUs · total」顯示緊一個 **四百萬級**嘅數,入面 **99% 以上係哨兵值**。同一個 total 亦餵緊 `Unalloc.`。

**② 🔴 唔止顯示 —— assign gate 都受影響。** `assign.service.ts:322`:

```ts
if (!tenantSku || tenantSku.consumedUnits >= tenantSku.prepaidEnabled) { …擋… }
```

- 對**哨兵值** SKU:`3064 >= 1000000` 永遠 false ⇒ **永遠唔擋**(呢個結果啱,但係「啱得好彩」,唔係設計出嚟)
- 對 **`prepaidEnabled = 0`** SKU:`91 >= 0` 永遠 true ⇒ **永遠擋死**。`POWER_BI_PRO` / `FLOW_PER_USER` / `DESKLESSPACK` / `VIVA` **喺平台無論如何都派唔到**,而錯誤訊息會講「tenant seat 唔夠」—— 而實情係呢個 SKU 根本冇 prepaid 概念

⇒ **本單唔係純顯示。** 動個 read-model 就會動到 gate 讀嘅嘢,兩者要一齊諗。

## 2. 🔴 點解本單而家係 `draft` 唔係 `proposed`

因為最中心嗰條問題**冇一個安全嘅預設答案**:**平台點樣分辨「unlimited」同「真係買咗好多」?**

三條路,代價唔同,而且其中一條觸發 H1:

| | 做法 | 代價 |
|---|---|---|
| **A** | **Threshold**:read-model 層當 `prepaidEnabled >= N`(例如 10000)= unlimited | 零 schema。🔴 **但係一個會隨時間失效嘅假設** —— 今日 tenant 最大真實值 `4502`,萬一將來真係買夠 10000 seat,佢就會靜靜變成「unlimited」而冇人知 |
| **B** | **已知哨兵值集合**:只認 `10000 / 50000 / 1000000` 三個確切值 | 零 schema,唔會誤判真實採購量。🔴 **但 Microsoft 加一個新哨兵值我哋就漏咗**,而且漏咗嘅表現同 A 一樣係靜默 |
| **C** | **`SkuCatalog` 加一個 curate 欄**(例如 `seatModel: 'prepaid' \| 'unlimited'`) | 🔴 **schema 改動 = H1,要 ADR**。但係**唯一一個唔靠猜嘅做法** —— 同 `businessAlias` / `category` / `isBaseLicense` 一樣行 curation-as-scope(ADR-0004 同款),而 CH-019 已經有批量 import 路可以一次過填 22 個 |

⚠️ **A 同 B 都係喺 code 入面發明一條 Microsoft 冇承諾過嘅規則。** 呢個形狀本 repo 撞過:ADR-0004 當年**拒絕**咗 name-denylist,理由一模一樣。

## 3. Scope 草稿（等 §5 答完先 lock）

### 3.1 In Scope（初步）

- **A** — read-model(`tenant-owned.service.ts`)識別「呢個 SKU 有冇 prepaid seat 概念」,並喺 DTO 出一個**明確嘅欄**(唔係靠前端估數字大細)
- **B** — Platform view 對呢類 SKU 顯示「**Unlimited**」(或 `∞`)而唔係一個七位數;`Unalloc.` 對佢哋顯示 `—`(冇意義,唔係 0)
- **C** — **Grand total 要講清楚佢加咗啲乜** —— 至少要把 unlimited SKU 剔出總和,否則個 KPI 永遠係四百萬
- **D** — 🔴 **`prepaidEnabled = 0` 但 `consumedUnits > 0` 呢類要有自己嘅講法**,唔可以同「真係得 0 個 seat」撈埋一齊
- **E** — 🔴 **assign gate 對應處理** —— 至少要令「呢個 SKU 冇 prepaid 概念」同「seat 用晒」出唔同嘅拒絕訊息

### 3.2 Out of Scope（初步）

- ❌ 改 Graph 攞數據嘅方式 / 加新 Graph call
- ❌ 改 `OpcoSkuLedger` 嘅語意(allocated / assigned 兩層數字唔郁 = 已 lock 決策)
- ❌ Drift 計算(`ledgerAssignedSum` vs `tenantConsumed`)—— 除非 §5 OQ-3 答「要」
- ❌ By OpCo view —— 佢由頭到尾唔顯示 tenant owned

## 4. H1 判斷

- 揀 **A 或 B** ⇒ 純 read-model + 顯示層 ⇒ **唔係 H1**,Change workflow 行得
- 揀 **C** ⇒ `SkuCatalog` 加欄 = **schema 改動 = H1** ⇒ **STOP,要 ADR**(可以喺同一輪傾)

⚠️ 無論揀邊個,**§3.1 E(assign gate)都會改到一條 critical path** ⇒ **H5 適用**:一定要同步寫 test。

## 5. 🔴 Open Questions（答完先可以 `proposed`）

- **OQ-1 — 顯示成點?** `Unlimited` 文字 / `∞` 符號 / 「N/A」?而 `Unalloc.` 對佢哋應該係 `—` 定係照計?(我建議 `Unlimited` + `Unalloc. —`,因為 `∞` 喺 mono 表入面對唔齊,而 `—` 喺呢個 codebase 一直代表「呢個問題冇答案」)
- **OQ-2 — 點識別?** A(threshold)/ B(已知哨兵值)/ C(curate 欄,**H1**)。我建議 **C**,理由 §2 —— 但佢係三個入面最貴,而且要 ADR
- **OQ-3 — `prepaidEnabled = 0` 但有人用嗰批點算?** 佢哋同 unlimited **唔係同一件事**(可能係已到期訂閱、可能係 add-on)。要唔要本單一齊收,定係另開?
- **OQ-4 — Grand total 點計?** 剔走 unlimited 之後個「Owned in M365」係咪應該改名(例如「Prepaid seats」)?而家個名對住一個剔走咗一半 SKU 嘅數字會誤導

## 6. Effort Estimate

**未估得**(視乎 OQ-2)。粗略:A/B 路 ≈ 半日;C 路 ≈ 一日 + ADR。

## 7. Spec Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-08-12 | Initial **draft** + 本機真數據 | Chris 第四點 review | — |

---

**Gate reminder**:本單係 `draft`,**§5 四條 OQ 全部答完先可以升 `proposed`**。⚠️ OQ-2 揀 C 要先過 **H1**(ADR)。
