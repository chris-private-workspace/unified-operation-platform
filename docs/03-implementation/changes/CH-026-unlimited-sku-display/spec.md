---
change_id: CH-026
title: "Unlimited / 冇 seat 概念嘅 SKU 喺 Platform view 顯示成點"
status: proposed
created: 2026-08-12
target_completion: 2026-08-13
affects_components: [apps/web, apps/api/license, apps/api/fulfilment, prisma]
spec_refs:
  - ADR-0032(決策 SSOT · 🔴 待 accept)
  - docs/02-architecture/licenseops/DESIGN.md §5(三層 owned → allocated → assigned)
  - ADR-0004(curation-as-scope)
  - ADR-0023(CH-019 批量 curation import)
---

# CH-026 — Unlimited SKU 喺 Platform view 顯示成點

> **Spec version**:1.0(§5 四條 OQ **全部由 Chris 2026-08-12 答咗**)
> **Owner**:Chris Lai
> **決策 SSOT**:**`ADR-0032`**(🔴 **Proposed —— accept 咗先可以落 code**,H1)
> **分類**:Change,**觸發 H1**(`SkuCatalog` 加欄)**+ H5**(改到 assign 個 tenant seat gate)

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

## 2. 決策（Chris 2026-08-12 全部答咗 → `ADR-0032`）

| OQ | 答案 |
|---|---|
| **OQ-1 顯示** | **`Unlimited` + `Unalloc. —`**(ADR-0032 D3) |
| **OQ-2 點識別** | **C —— `SkuCatalog` 加 curate 欄**(ADR-0032 D1)⇒ **H1**,ADR 已寫 |
| **OQ-3 `prepaid=0` 嗰批** | **本單一齊收**(ADR-0032 D2 / D4)—— ⚠️ 收嘅方式係 **read-model 自動識別 + 顯示 + gate 訊息**,唔係第二個 curate 欄:佢係**狀態唔係 seat model**,而且係客觀事實(`owned=0 && consumed>0`),唔應該要人手維護 |
| **OQ-4 grand total** | **剔走 unlimited,KPI 由「Owned in M365」改名「Prepaid seats」**(ADR-0032 D3) |

否決咗嘅 A(threshold)/ B(已知哨兵值集合)同理由,見 `ADR-0032 §Alternatives`。一句總結:**兩者都係喺 code 入面發明一條 Microsoft 冇承諾過嘅規則**,同 ADR-0004 否決 name-denylist 同源。

## 3. Scope

### 3.1 In Scope

- **A — schema**:`SkuCatalog.seatModel String @default("prepaid")` + migration。🔴 **migration 零行為改變**(全部 SKU 落 default),`unlimited` 靠人手 curate(ADR-0032 D5:**唔寫自動 data migration**,咁做等於偷偷實施咗被否決嘅 threshold)
- **B — curation 兩條路**:單筆 `PATCH /license/catalog/:id` + CH-019 批量 import 都要收 `seatModel`;export CSV 帶埋佢。🔴 **值要 validate**(只准 `prepaid` / `unlimited`),兩條路都要 —— 同 ADR-0023 個 alias 閘同款
- **C — read-model**:`tenant-owned.service.ts` 出 `seatModel` **同**一個 derived flag(`prepaid` 但 `owned = 0 && consumed > 0`);grand total **剔走 unlimited**
- **D — Platform view**:`Unlimited` / `Unalloc. —` / KPI 改名 **`Prepaid seats`** / `owned=0 有人用` 自己一個 state
- **E — 🔴 assign gate**(H5):`unlimited` **明確跳過** tenant seat gate;`prepaid` 而 `owned=0` **仍然擋但改訊息**
- **F — SKU Catalog 頁**:要睇得到同改得到 `seatModel`(否則 curate 唔到)

### 3.2 Out of Scope（explicit）

- ❌ 改 Graph 攞數據嘅方式 / 加新 Graph call —— `prepaidEnabled` 照存原值,詮釋喺 read-model
- ❌ 改 `OpcoSkuLedger` 嘅語意(allocated / assigned 兩層數字唔郁 = 已 lock 決策)
- ❌ **OpCo budget gate** —— 一個字唔改,佢仍然係 allocation 嘅權威
- ❌ **放行 `prepaid` 而 `owned = 0` 嘅 assign** —— 🔴 本單只改「點講」唔改「擋唔擋」(ADR-0032 D4)。放行要先答「呢啲 SKU 到底點嚟」,未答之前放行 = 靠估派 licence
- ❌ **Drift 計算**(`ledgerAssignedSum` vs `tenantConsumed`)對 unlimited SKU 意味住乜 —— ⚠️ 呢條數唔細(`FLOW_FREE` 用緊 4525),但佢係獨立一個問題,要另開
- ❌ By OpCo view —— 佢由頭到尾唔顯示 tenant owned
- ❌ 自動把 `prepaidEnabled >= N` 標做 unlimited 嘅 data migration(ADR-0032 D5)

## 4. Hard-constraint 判斷

| | 觸發 | 狀態 |
|---|---|---|
| **H1** | `SkuCatalog` 加 `seatModel` 欄 = schema 改動 | 🔴 **`ADR-0032` 已寫,`Proposed`** —— **accept 咗先可以落 code** |
| **H5** | §3.1 E 改到 assign 個 tenant seat gate = critical path | test 必須同步:`unlimited` 過閘 / `owned=0` 仍然擋兼訊息啱 / **常態 SKU 行為逐字不變** |

## 5. Open Questions

**四條全部由 Chris 2026-08-12 答咗**(見 §2),記錄喺 `ADR-0032`。

新開一條:

- **OQ-5** — `prepaidEnabled = 0` 但有人用嗰批**到底點嚟**?(訂閱過期 / add-on 附帶 / trial 完咗?)**本單唔答亦唔靠佢**(D4 照擋,只改訊息),但答咗先決定得到將來放唔放行。⚠️ 呢條要查 tenant 側,唔係 code 答得到。

## 6. Effort Estimate

**約 1 日**(schema + migration ≈ 1h · curation 兩條路 + validate ≈ 2h · read-model + 顯示 ≈ 2h · assign gate + test ≈ 2h · 驗證 + doc-sync ≈ 1h)。⚠️ 唔含「人手 curate 嗰 22 個 SKU」—— 嗰個係 Chris 落 UI 做。

## 7. Spec Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-08-12 | Initial **draft** + 本機真數據 | Chris 第四點 review | — |
| 2026-08-12 | **四條 OQ 全部答咗** → 升 `proposed`;scope 具體化;寫 **ADR-0032**(H1) | Chris:OQ-1 `Unlimited`+`Unalloc. —` · OQ-2 **C(curate 欄)** · OQ-3 一齊收 · OQ-4 改名 `Prepaid seats` | Chris Lai |

---

**Gate reminder**:🔴 **兩道閘,兩道都未過**:①`ADR-0032` 要由 `Proposed` → `Accepted`(H1)②本 spec 要由 `proposed` → `approved`(PROCESS R1.change)。**兩者齊咗先可以寫第一行 code。**
