---
change_id: CH-026
title: "Unlimited / 冇 seat 概念嘅 SKU 喺 Platform view 顯示成點"
status: approved
created: 2026-08-12
target_completion: 2026-08-13
affects_components: [apps/web, apps/api/license, apps/api/fulfilment, prisma]
spec_refs:
  - ADR-0032(決策 SSOT · **Accepted** 2026-08-12)
  - docs/02-architecture/licenseops/DESIGN.md §5(三層 owned → allocated → assigned)
  - ADR-0004(curation-as-scope)
  - ADR-0023(CH-019 批量 curation import)
---

# CH-026 — Unlimited SKU 喺 Platform view 顯示成點

> **Spec version**:1.1(§5 四條 OQ **全部由 Chris 2026-08-12 答咗**;同日 approved)
> **Owner**:Chris Lai
> **Approved by**:**Chris Lai**(2026-08-12)
> **決策 SSOT**:**`ADR-0032`**(**Accepted** 2026-08-12,H1)
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
| **H1** | `SkuCatalog` 加 `seatModel` 欄 = schema 改動 | 🟢 **`ADR-0032` Accepted**(2026-08-12,Chris)—— 閘已過 |
| **H5** | §3.1 E 改到 assign 個 tenant seat gate = critical path | test 必須同步:`unlimited` 過閘 / `owned=0` 仍然擋兼訊息啱 / **常態 SKU 行為逐字不變** |

## 5. Open Questions

**四條全部由 Chris 2026-08-12 答咗**(見 §2),記錄喺 `ADR-0032`。

新開一條:

- ~~**OQ-5** — `prepaidEnabled = 0` 但有人用嗰批**到底點嚟**?~~ ✅ **2026-08-12 答咗**(Chris 叫查)—— 見 §5.1。

### 5.1 OQ-5 —— 已答（2026-08-12 唯讀 Graph probe）

🔴 **我原本寫「呢條要查 tenant 側,唔係 code 答得到」—— 呢句係錯嘅,而錯法值得記。** 答案由頭到尾住喺**同一個 API 回應**入面:`graph.service.ts:89` 只攞 `prepaidUnits.enabled`,而 Graph 同一筆 `subscribedSku` 一路畀緊**四個**數(`enabled` / `suspended` / `warning` / `lockedOut`)。⇒ **唔係 Graph 冇講,係我哋冇聽。**

**方法**:唯讀 `GET /subscribedSkus`(scratchpad script,零寫入),印全部四個欄 + `capabilityStatus`。

**答案 —— `enabled = 0` 嗰批(共 15 個)冇一個係「冇 seat」**:

| 成因 | 數 | 例 |
|---|---|---|
| **訂閱過期(`warning > 0`)** | **11** | `POWER_BI_PRO` warn=**790** · `CDS_DB_CAPACITY` warn=670 · `FLOW_PER_USER` warn=79 · `DESKLESSPACK` warn=51 |
| **訂閱取消 / 暫停(`capabilityStatus=Suspended` 兼 `suspended > 0`)** | **4** | `VIVA` susp=50 · `Teams_Premium_(for_Departments)` susp=43 · `Power_Automate_per_process` susp=5 · `PROJECT_PLAN3_DEPT` susp=3 |

**零例外**(11 + 4 = 15)。⇒ 唔係 add-on 附帶、唔係 trial 完 —— **係訂閱狀態**。

### 5.2 🔴 順帶揭到一個大過 OQ-5 嘅嘢（**唔喺本單 scope**）

同一次 probe 順手數:**`assign.service.ts` 個 `consumedUnits >= prepaidEnabled` 會拒絕 32 / 101 個 SKU**,而其中 **27 個 tenant 手上其實仲有 seat**(喺 `warning` / `suspended`,兩個我哋一個都冇讀)。

| | |
|---|---|
| `enabled = 0` | 15(= 本單 `noPrepaidSeats` 覆蓋嗰批) |
| **`enabled > 0` 但 `consumed >= enabled`** | **17** —— 包括 **`SPE_E5` 4543/4502**、**`SPE_E3` 677/`enabled=21`(warn=4477)**、`MCOEV` 1007/20(warn=1382)、`INTUNE_A_VL` 329/110、`STANDARDPACK` 388/301 |

⚠️ **唔係 32 個都係誤擋** —— `Microsoft_Teams_Rooms_Basic` 22/22、`MCOCAP` 19/19 係**真係用晒**。分界線係 `warning + suspended > 0`(27 個)。

⚠️ **仲有一件事未驗證,唔可以當已知**:`warning` 嗰批 seat **維持得住既有 assignment** 呢點有數據支持(`SPE_E3` 677 個人用緊而 `enabled` 得 21),但**派新 licence 掂唔掂,冇試過**。呢個決定咗係「放行」定「照擋但講清楚」,要真試先知。

📌 **本單刻意唔跟落去**:改 `owned` 嘅定義 = 動 read-model 語意 + 可能動 assign gate = **另一個 ADR**。本單只做一件事 —— **把已知講錯咗嘅字改返**(assign 拒絕訊息 + badge `No prepaid seats` → `No seats enabled`),因為嗰啲字係本單今日先寫落去嘅。落地追蹤見 `BACKLOG` **`TENANT-SEAT-WARNING`**。

## 6. Effort Estimate

**約 1 日**(schema + migration ≈ 1h · curation 兩條路 + validate ≈ 2h · read-model + 顯示 ≈ 2h · assign gate + test ≈ 2h · 驗證 + doc-sync ≈ 1h)。⚠️ 唔含「人手 curate 嗰 22 個 SKU」—— 嗰個係 Chris 落 UI 做。

## 7. Spec Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-08-12 | Initial **draft** + 本機真數據 | Chris 第四點 review | — |
| 2026-08-12 | **四條 OQ 全部答咗** → 升 `proposed`;scope 具體化;寫 **ADR-0032**(H1) | Chris:OQ-1 `Unlimited`+`Unalloc. —` · OQ-2 **C(curate 欄)** · OQ-3 一齊收 · OQ-4 改名 `Prepaid seats` | Chris Lai |
| 2026-08-12 | **兩道閘齊過** → `ADR-0032` `Accepted` + 本 spec `approved`,開始實作 | Chris 明示 approve | Chris Lai |

---

**Gate reminder**:🟢 **兩道閘 2026-08-12 齊過**:①`ADR-0032` `Accepted`(H1)②本 spec `approved`(PROCESS R1.change)。實作進度見 `checklist.md`。
