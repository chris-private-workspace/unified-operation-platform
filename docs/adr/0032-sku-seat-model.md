# ADR-0032 — SKU 有冇 seat 概念,由平台自己 curate

**Status**: **Accepted**(Chris Lai,2026-08-12)
**Date**: 2026-08-12
**Deciders**: Chris Lai
**Supersedes / Amends**: 擴充 `DESIGN.md §5` 三層模型(owned → allocated → assigned),**唔推翻** —— 加嘅係「呢一層對呢個 SKU 有冇意義」呢個維度
**Triggers**: **H1**(`SkuCatalog` 加欄 = schema 改動)· **H5**(改到 assign 嘅 tenant seat gate = critical path)

---

## Context

Chris 2026-08-12:「有些 SKU catalog 其實應該是 unlimited 的數量的,但是現在顯示在 license assets → platform view 中,那些數量很奇怪。」

### 平台今日點處理

`graph.service.ts:89` —— `prepaidEnabled: s.prepaidUnits?.enabled ?? 0`。**Graph 畀乜就存乜,零詮釋。** 全 repo 搜「unlimited」只有 allocation gate 嘅「no unlimited by default」,同 SKU 數量無關。

### 🔴 真數據（本機 tenant snapshot,2026-08-10 sync,101 個 SKU）

**哨兵值有三個,唔係一個**:

| `prepaidEnabled` | SKU 數 | 例子(連實際用量) |
|---|---|---|
| **1000000** | 4 | `POWER_BI_STANDARD` (用緊 **3064**) · `STREAM` (25) · `FORMS_PRO` (23) · `WINDOWS_STORE` (0) |
| **50000** | 1 | `RIGHTSMANAGEMENT_ADHOC` (0) |
| **10000** | 17 | `FLOW_FREE` (用緊 **4525**) · `CCIBOTS_PRIVPREV_VIRAL` (157) · 一堆 `*_viral_trial` |

⚠️ **起草時嘅推論係 `10000000`(一千萬),實測係 `1000000`(一百萬)。** 呢類「常見哨兵值」嘅記憶**唔可以當事實用嚟設計**,呢個 ADR 嘅每個數字都係查返本機 DB。

**第二類(Chris 冇提,但同樣令人讀錯)**:`prepaidEnabled = 0` **但真係有人用**

| SKU | owned | 實際用緊 |
|---|---|---|
| `POWER_BI_PRO` | 0 | **91** |
| `FLOW_PER_USER` | 0 | **67** |
| `DESKLESSPACK` | 0 | **52** |
| `VIVA` | 0 | **30** |

### 後果有兩個,一個顯示一個功能

**① Grand total 已經冇意義。** 光係哨兵值就貢獻 `4×1000000 + 1×50000 + 17×10000` = **4,220,000**,而 tenant 最大嘅**真實**採購量係 `4502`(`SPE_E5`)。⇒ KPI card「Owned in M365」同表頂「All SKUs · total」顯示緊一個四百萬級嘅數,**入面 99% 以上係哨兵值**;同一個 total 亦餵緊 `Unalloc.`。

**② 🔴 唔止顯示 —— assign 個 tenant seat gate 都受影響。** `assign.service.ts:322`:

```ts
if (!tenantSku || tenantSku.consumedUnits >= tenantSku.prepaidEnabled) { …擋… }
```

- 對**哨兵值** SKU:`3064 >= 1000000` 永遠 false ⇒ **永遠唔擋**。結果啱,但係**啱得好彩** —— 冇人設計過,係哨兵值夠大而已
- 對 **`prepaidEnabled = 0`** SKU:`91 >= 0` 永遠 true ⇒ **永遠擋死**,而錯誤訊息會講「tenant seat 唔夠」。⚠️ 呢個唔係假設:**ADR-0029 Context 已經記低 2026-08-07 真撞過** —— `POWER_BI_PRO` `prepaidEnabled=0` 擋住咗一次 assign,而當時 OpCo budget 係綠(`80/90`)

⇒ 本 ADR **唔係純顯示改動**。動 read-model 就會動到 gate 讀嘅嘢,兩者要一齊諗。

---

## Decision

### D1 — `SkuCatalog` 加一個 curated 欄 `seatModel`

```prisma
// 呢個 SKU 有冇「買咗幾多個 seat」呢個概念。
// 'prepaid'   = 有,`prepaidEnabled` 係一個真數字(預設)
// 'unlimited' = 冇,Graph 用哨兵值表達(實測 10000 / 50000 / 1000000 三個)
seatModel String @default("prepaid")
```

**同 `businessAlias` / `category` / `isBaseLicense` 一樣走 curation-as-scope(ADR-0004)** —— 人手決定、由 CH-019 個批量 import 路一次填晒 22 個、export CSV 帶埋佢。

🔴 **點解唔用 Prisma enum**:同 ADR-0031 D1 同一理由 —— enum 會製造第二份清單(schema 一份、TS 一份),而呢個值將來好可能要加第三種。用 `String` + 一個 const 清單守住。

🔴 **點解唔用 `isUnlimited Boolean`**:Boolean 表達到「unlimited」,表達唔到將來可能出現嘅第三種 seat model;而 rename 一個 Boolean 欄比加一個 String 值貴。

### D2 — `prepaidEnabled = 0` 嗰批**唔** curate,由 read-model 自己識別

呢類**唔係一種 seat model,係一個狀態**(訂閱過期 / add-on 附帶 / trial 完咗 —— **成因未查證,ADR 唔猜**)。佢係客觀事實:`prepaidEnabled = 0 && consumedUnits > 0`,平台自己睇得出,**唔應該要人手維護**。

⇒ read-model 出一個 derived flag,顯示成第三種樣(見 D3)。**呢個係 OQ-3「要本單一齊收」嘅落地方式** —— 一齊收嘅係**顯示同 gate 訊息**,唔係第二個 curate 欄。

### D3 — 顯示（Chris OQ-1 / OQ-4）

| 情況 | `Owned` | `Unalloc.` | Status badge |
|---|---|---|---|
| `seatModel = 'prepaid'`(常態) | 數字 | `owned − allocated` | 照舊 |
| `seatModel = 'unlimited'` | **`Unlimited`** | **`—`** | 唔會 over-allocated |
| `prepaid` 但 `owned = 0` 而 `consumed > 0` | `0` + 標示 | `—` | 自己一個 state |

- **`—` 唔係 `0`** —— `—` 喺呢個 codebase 一路代表「呢個問題冇答案」,而 `0` 係一個答案。分別喺 unlimited 呢度好緊要:`Unalloc. 0` 會讀成「用晒」
- **唔用 `∞` 符號** —— 呢欄係 mono 數字欄,`∞` 對唔齊,而且 screen reader 讀唔出

**Grand total(OQ-4)**:剔走 `unlimited` 嘅 SKU,而 KPI card 由 **「Owned in M365」改名「Prepaid seats」** —— 一個剔走咗兩成 SKU 嘅總和唔應該再叫「M365 擁有嘅」。

### D4 — assign 個 tenant seat gate 講返真話

| `seatModel` | 行為 |
|---|---|
| `unlimited` | **明確跳過** tenant seat gate(唔再靠哨兵值夠大)。OpCo budget gate **一個字唔改**,佢仍然係 allocation 嘅權威 |
| `prepaid`,`prepaidEnabled = 0` | 仍然**擋**,但訊息由「seat 唔夠」改成講真相:呢個 SKU 喺 tenant 冇 prepaid seat |

🔴 **`prepaid` 而 `owned = 0` 照擋,唔放行** —— 本 ADR 只改「點講」,唔改「擋唔擋」。要放行係另一個決定(要先答「呢啲 SKU 到底點嚟」),而喺未答之前放行 = 靠估派 licence。

🔴 **H5**:呢條係 critical path,改動要同步寫 test(unlimited 過閘 / `owned=0` 仍然擋兼訊息啱 / 常態 SKU 行為逐字不變)。

### D5 — 遷移:唔猜,但畀一個 one-off 對照

migration 只加欄 + default `'prepaid'` ⇒ **零行為改變**。跟住由**人手**經 CH-019 批量 import 把 22 個哨兵值 SKU 標做 `unlimited`。

🔴 **唔寫「自動把 `prepaidEnabled >= 10000` 標做 unlimited」嘅 data migration** —— 咁做等於偷偷實施咗被否決嘅 Alternative A,而且將來冇人記得個 threshold 曾經跑過。**要畀方便就畀一份查詢結果**(本 ADR Context 個表就係),唔好畀一個會自己跑嘅規則。

---

## Alternatives Considered

### A — Threshold（`prepaidEnabled >= N` 就當 unlimited）

零 schema、即刻可用。**否決**:佢係一個**會隨時間失效嘅假設**。今日 tenant 最大真實值係 `4502`,threshold 10000 安全;萬一將來真係買夠 10000 個 seat,嗰個 SKU 就會**靜靜變成「Unlimited」**,而且冇任何訊號。⇒ 一個會自己出錯而且唔會嘈嘅規則。

### B — 已知哨兵值集合（只認 `10000 / 50000 / 1000000`）

零 schema、唔會誤判真實採購量。**否決**:Microsoft 加一個新哨兵值我哋就漏咗,而漏咗嘅表現同 A 一樣係靜默 —— 個 SKU 會顯示一個七位數,冇人知係漏咗 curate 定係真係買咗咁多。

🔴 **A 同 B 共同嘅問題**:兩個都係**喺 code 入面發明一條 Microsoft 從來冇承諾過嘅規則**。呢個形狀本 repo 撞過 —— **ADR-0004 當年就係為同一個理由否決咗 name-denylist**(靠名判斷 SKU),而 `businessAlias` 存在嘅原因正正係「唔可以信名」。

### C — curate 欄（採納）

貴啲(schema + 22 個 SKU 要人手標一次),但**唔靠猜**:一個 SKU 有冇 seat 概念係一件**人知道而平台唔知道**嘅事,同 `category` / `isBaseLicense` 完全同一種。而 CH-019 個批量 import 路令「填 22 個」係一次貼上,唔係 22 次開 dialog。

### D — 唔做,只喺 UI 加註腳解釋大數字

**否決**:解決唔到 grand total 冇意義,亦解決唔到 `prepaidEnabled = 0` 嗰批派唔到 licence(D4 ②)。

---

## Consequences

### 🟢 好

- **Platform view 講得返真話**:`Unlimited` 唔會扮成一個 seat 數;`Prepaid seats` 總和入面每個數都係真嘅
- **assign 拒絕訊息指返去啱嘅人**:「呢個 SKU 冇 prepaid seat」同「seat 用晒」係兩個唔同嘅下一步
- **unlimited 唔再靠哨兵值夠大**:今日 `3064 < 1000000` 所以過到閘,但呢個從來冇人設計過

### 🔴 代價 / 風險

- **22 個 SKU 要人手標一次**,而且**新同步入嚟嘅 SKU 預設 `prepaid`** ⇒ 一個新 unlimited SKU 會先顯示成七位數,直到有人 curate。⚠️ 呢個係 curation-as-scope 一路以來嘅代價(同 `businessAlias` 一樣),唔係本 ADR 新增
- **`seatModel` 係字串,打錯字唔會即刻爆** —— 要 DTO 層 validate 落已知值,並且 import 路一樣要驗(同 ADR-0023 個 alias 閘同款)
- **Drift 計算未掂**:`ledgerAssignedSum` vs `tenantConsumed` 對 unlimited SKU 意味住乜,本 ADR **明文唔答**(CH-026 §3.2 out of scope)。⚠️ 揀 `FLOW_FREE`(用緊 4525)做例就知呢條數唔細,要另開
- **`prepaidEnabled = 0` 嗰批仍然派唔到 licence**,只係而家會講返真相。**成因未查證** —— 要答「佢哋到底點嚟」先決定放唔放行

### 唔改嘅嘢（明文）

- `OpcoSkuLedger` 兩層數字(`allocatedQuantity` / `assignedQuantity`)語意 —— 已 lock
- OpCo budget gate —— 一個字唔改,佢仍然係 allocation 嘅權威
- Graph 攞數據嘅方式 —— `prepaidEnabled` 照存原值,詮釋喺 read-model
- By OpCo view —— 佢由頭到尾唔顯示 tenant owned

---

## References

- `docs/03-implementation/changes/CH-026-unlimited-sku-display/spec.md`(落地)
- `ADR-0004` — curation-as-scope;否決 name-denylist 嘅先例
- `ADR-0023` — CH-019 批量 curation import(本 ADR 靠佢令「填 22 個」變一次貼上)
- `ADR-0029` Context — 2026-08-07 `POWER_BI_PRO` `prepaidEnabled=0` 真撞過一次 assign 被擋
- `ADR-0031 D1` — 用 `String` 唔用 Prisma enum 避免第二份清單
- `apps/api/src/license/tenant-owned.service.ts` · `apps/api/src/fulfilment/assign.service.ts:322` · `apps/api/src/integration/graph/graph.service.ts:89`
