# ADR-0033 — Tenant 可用 seat = `enabled + warning`，唔再只計 `enabled`

**Status**: **Proposed**(D1 / D2 方向 Chris 2026-08-12 已答;D4 待確認建議)
**Date**: 2026-08-12
**Deciders**: Chris Lai
**Supersedes / Amends**: **唔推翻** `ADR-0032` —— 佢處理「呢個 SKU 有冇 seat 概念」(curate),本 ADR 處理「有概念嗰啲,可用 seat 到底係幾多」(量度)。兩者正交
**Triggers**: **H1** ×3(`TenantSkuSnapshot` 加欄 = schema · `TenantSkuRowDto.owned` 語意改 = read-model · **ADR-0017 seam ② 契約 `TenantSkuSeats` 擴闊**)· **H5**(改 assign 個 tenant seat gate = critical path)

---

## Context

### 起因

Chris 2026-08-12 叫查 `CH-026` **OQ-5**(`prepaidEnabled = 0` 但有人用嗰批到底點嚟)。查嘅過程揭到一件比 OQ-5 大好多嘅事。

🔴 **`CH-026` spec 原文寫「呢條要查 tenant 側,唔係 code 答得到」—— 呢句係錯嘅。** 答案由頭到尾住喺**同一個 API 回應**:`graph.service.ts:89` 攞 `s.prepaidUnits?.enabled`,而 Graph 嘅 `subscribedSku.prepaidUnits` 一路畀緊**四個**數:

| 欄 | Microsoft 語意 |
|---|---|
| `enabled` | 可以派嘅 unit |
| `warning` | 訂閱**過期但喺寬限期** —— seat 仲用得,但唔再算 `enabled` |
| `suspended` | 訂閱**已取消**,喺資料保留期 |
| `lockedOut` | 已鎖,唔可以再用 |

**我哋由第一日起只讀第一個。**

### 🔴 真數據（2026-08-12 唯讀 `/subscribedSkus` probe，101 個 SKU）

**① `enabled = 0` 嗰 15 個,冇一個係「冇 seat」**

| 成因 | 數 | 例 |
|---|---|---|
| 訂閱過期(`warning > 0`) | **11** | `POWER_BI_PRO` warn=**790** · `CDS_DB_CAPACITY` 670 · `FLOW_PER_USER` 79 · `DESKLESSPACK` 51 |
| 訂閱取消(`capabilityStatus=Suspended` 兼 `suspended > 0`) | **4** | `VIVA` 50 · `Teams_Premium_(for_Departments)` 43 · `Power_Automate_per_process` 5 · `PROJECT_PLAN3_DEPT` 3 |

零例外。⇒ **`CH-026` 猜嘅三個成因(訂閱過期 / add-on 附帶 / trial 完)只有第一個中,而且係兩種訂閱狀態唔係三種來源。**

**② 影響面遠大過嗰 15 個**

`assign.service.ts` 個 `consumedUnits >= prepaidEnabled` **拒絕 32 / 101 個 SKU**,其中 **27 個 tenant 手上仲有 seat**:

| | |
|---|---|
| `enabled = 0` | 15(`ADR-0032 D2` 個 `noPrepaidSeats` 覆蓋到) |
| **`enabled > 0` 但 `consumed >= enabled`** | **17**(覆蓋唔到)—— **`SPE_E5` 4543/4502**(warn=242)· **`SPE_E3` 677 / `enabled=`**21**` 而 `warning=`**4477**`** · `MCOEV` 1007/20(warn=1382)· `INTUNE_A_VL` 329/110 · `STANDARDPACK` 388/301 |

📌 **CH-020 2026-08-03 真撞過** —— 當時 progress 記低「dev tenant `SPE_E5` consumed 4535 / prepaid 4502 = 超支 33,tenant seat gate 擋死」,結論係「換個 SKU 做 fixture」。**冇人問過點解一間公司會超支自己買嘅 seat。** 而家知:`warning=242`,即係嗰批 seat 過咗期但仲用緊。呢個 ADR 存在嘅理由,九日前就以一個「奇怪 fixture」嘅形式出現過。

### 🔴 一件未驗證嘅事（決定 D4 之前要知）

**`warning` 嗰批 seat 派唔派得到新 licence,冇試過。**

- **維持得住既有 assignment** 有強數據支持:`SPE_E3` `enabled` 得 **21** 而 **677 個人用緊** —— 如果 warning seat 唔算數,嗰 656 個人唔會有 licence
- **派新掂唔掂,係另一件事** —— 要真試(揀一個 `enabled=0 && warning>0` 嘅 SKU 真派一次,睇 Graph 收唔收)。⚠️ 咁做會喺**公司 tenant 真派一個 licence**,要 owner 批

呢個未知**唔阻止**本 ADR 落地(見 D4 個 fail-forward 論證),但決定咗操作員見到嘅失敗**長成點**。

---

## Decision

### D1 — `TenantSkuSnapshot` 存齊四個數（Chris 2026-08-12 答）

```prisma
model TenantSkuSnapshot {
  prepaidEnabled Int // prepaidUnits.enabled — 可以派
  suspendedUnits Int @default(0) // .suspended — 訂閱已取消
  warningUnits   Int @default(0) // .warning   — 過期寬限期,仲用得
  lockedOutUnits Int @default(0) // .lockedOut — 已鎖
  consumedUnits  Int
  // ...
}
```

🔴 **`prepaidEnabled` 個名唔改。** 佢一直**準確**對應 `prepaidUnits.enabled`;rename 會掃過 `catalog.service` / `tenant-owned.service` / seam ② 三個 provider / 十幾條 test,而佢本身冇講錯。**講錯嘅係「把佢當成 owned 全部」嗰個用法**,改用法唔改名。

**建議加多一個(唔喺 Chris 原答案,提出畀你剔)**:`capabilityStatus String @default("Enabled")` —— 佢係嗰 4 個 `Suspended` SKU 嘅**權威標記**,而由四個數字推返出嚟係第二份判斷(本 repo 反覆出現嗰個形狀)。**成本 = 一個欄**;唔要就 D5 靠 `suspended > 0` 推。

### D2 — `owned` = `enabled + warning`（Chris 2026-08-12 答）

read-model(`tenant-owned.service`)出嘅 `owned` 由 `prepaidEnabled` 改成 `prepaidEnabled + warningUnits`。

**點解 `warning` 計、`suspended` 唔計**:`warning` = 訂閱過期但**仲用得**(`SPE_E3` 677 個人就係活證據);`suspended` = 已取消,而 Microsoft 自己喺 `capabilityStatus` 標咗 `Suspended`。**把 tenant 明講「唔可以用」嘅嘢計入 owned,就係本 ADR 想修嗰個病嘅鏡像。**

🔴 **`TenantSkuRowDto.owned` 係語意改動唔係加欄** —— 同一個名同一個位置,由「買咗幾多」變「可用幾多」。**必須同時出 breakdown**(`ownedBreakdown: { enabled, warning, suspended, lockedOut }`),否則畫面永遠解釋唔到「點解 `SPE_E3` 由 21 變 4498」。

### D3 — seam ② 契約加 `assignableUnits`，唔洩漏 Graph 四欄結構

`TenantSkuSeats`(`license-ops.provider.ts:35`)加一個欄:

```ts
export interface TenantSkuSeats {
  skuId: string;
  prepaidEnabled: number;   // 不變
  consumedUnits: number;    // 不變
  /** 呢個 provider 認為而家真係派得嘅 seat 總數。Graph = enabled + warning。 */
  assignableUnits: number;
}
```

🔴 **唔把四個欄直接加落 seam ②。** 嗰個 interface 自己個 comment(`:32-34`)寫住「**deliberately narrower than Graph's SubscribedSku — 唔逼非 Graph 實作發明 `capabilityStatus` / `appliesTo`**」。`warning` / `suspended` / `lockedOut` 係**一模一樣**嘅 Graph 概念:`n8n-license.provider.ts:151` 由 n8n 回應讀數,而 n8n 側**冇送過**呢啲欄。

⇒ 每個 provider 詮釋自己嘅 vendor,seam 只收結論。**n8n provider 出 `assignableUnits = prepaidEnabled`**(佢冇更多資料)⇒ n8n 路行為**逐字不變**,唔使等 n8n workflow 改。

### D4 — assign gate 用 `assignableUnits`（🔴 **本 ADR 唯一要你落嘅決定**）

```ts
if (!tenantSku || tenantSku.consumedUnits >= tenantSku.assignableUnits) { …擋… }
```

**實測對照(101 個 SKU)**:

| 式 | 拒絕 | 仲擋住邊啲 |
|---|---|---|
| **A** `enabled`(今日) | **32** | 包括 `SPE_E5` / `SPE_E3` / `MCOEV` —— 全部主力 |
| **B** `enabled + warning`(**建議**) | **11** | 6 個**真係用晒**(`Teams_Rooms_Basic` 22/22 · `VISIO_PLAN2_DEPT` 2/2 · `M365_F1_COMM` 26/1 …)+ **5 個 `Suspended`**(`VIVA` · `Teams_Premium` ×2 · `Power_Automate_per_process` · `PROJECT_PLAN3_DEPT`) |
| **C** `+ suspended` | **6** | 只剩真係用晒嗰批 |

🟢 **建議 B**,兩個理由:

1. **B 之下仲擋住嘅 11 個,每一個都講得出理由** —— 6 個真係用晒/超支,5 個訂閱已取消。**冇一個係誤擋。** A 之下有 27 個講唔出。
2. **C 會放行 `capabilityStatus = Suspended` 嘅 SKU** —— 即係 Microsoft 明講唔可以用,我哋照派。B 同 C 只差嗰 5 個,而嗰 5 個正正係唯一應該擋嘅一批。

⚠️ **B 有一個 fail-forward 代價,要接受先揀得**:如果 `warning` seat 其實派唔到新(未驗證),失敗會由「pre-flight `seats` gate 擋住、零副作用、訊息受我哋控制」變成「`assign` step 被 Graph 拒絕、訊息係 vendor 原文」。⇒ **配套(建議一齊做)**:當 `assignableUnits` 主要靠 `warning` 撐起嗰陣,`seats` step 即使 `ok` 都帶一句 `detail`:「N seats are in the expiry grace period」。ADR-0029 個 `AssignStep.detail` 本來就容得下,零契約改動。

### D5 — `noPrepaidSeats` 跟住 `owned` 重新定義

`ADR-0032 D2` 個 derived flag 由 `enabled === 0 && consumed > 0` 改成 **`owned === 0 && consumed > 0`**(即 `enabled` 同 `warning` 都係 0)⇒ 由今日嘅 **15 個**收窄到**真正冇可用 seat 嗰批**。

**label 亦要跟**:`No seats enabled` → 建議 **`Subscription suspended`**(因為收窄之後,剩返嗰批就係 `Suspended`)。⚠️ 呢個要 D1 個 `capabilityStatus` 或者 `suspended > 0` 撐,唔可以靠估。

### D6 — 遷移：新欄 default 0 ⇒ re-sync 之前零行為改變

migration 只加欄。舊 snapshot 三個新欄 = `0` ⇒ `owned = enabled + 0` = **今日嘅值**。行為喺**下一次 catalog sync** 之後先變。

🔴 **唔寫 data migration 去「補返」舊 snapshot** —— 嗰啲數當時冇攞過,填任何值都係捏造一個從來冇量度過嘅歷史(同 `ADR-0032 D5` 同一條線)。

### D7 — 顯示（Platform view）

- `Owned` 欄照出 `owned`(而家係可用 seat),**hover / 副行出 breakdown**
- `warning > 0` 嘅 SKU 要有視覺標示 —— 佢個數字係「靠緊過期訂閱」,同一個乾淨嘅 `enabled` 唔同質
- ⚠️ **KPI `Prepaid seats` 個名要重諗**:`ADR-0032 D3` 改咗做呢個名,而 D2 之後佢已經唔止 prepaid。建議 `Available seats`

---

## Alternatives Considered

### A — 咩都唔改，只喺 UI 加註腳解釋

**否決**:解決唔到 32 個 SKU 派唔到 licence,亦解決唔到 `SPE_E5` / `SPE_E3` 呢啲主力被擋。而且註腳要解釋嘅嘢(「呢個數唔係全部 seat」)本身就係一個應該修嘅 bug,唔係一個應該解釋嘅設計。

### B — `owned = enabled`，但 gate 改成「唔擋,交畀 Graph 判斷」

拆走 tenant seat gate,派唔派得由 Graph 講。**否決**:`assign-step.ts` 明文寫住 `budget` 同 `seats` 唔可以合併,因為兩個 remedy 唔同(「買 seat」vs「加 OpCo allocation」)—— 拆走 `seats` 就係把其中一個 remedy 由畫面上刪走,而 2026-08-07 DEV 實測兩層都真係撞過。

### C — `owned = enabled + warning + suspended`

**否決**,見 D4 表:會放行 5 個 `capabilityStatus = Suspended` 嘅 SKU,即係 Microsoft 明講唔可以用。

### D — 把四個欄直接加落 seam ② `TenantSkuSeats`

**否決**,見 D3:`license-ops.provider.ts:32-34` 個 comment 已經為同一個問題(`capabilityStatus` / `appliesTo`)畫過同一條線,而 n8n provider 送唔到呢啲數。

---

## Consequences

### 🟢 好

- **27 個 SKU 由「喺平台永遠派唔到」變返派得到**,包括 `SPE_E5` / `SPE_E3` 兩個主力
- **`owned` 講返一件有意義嘅事** —— 「而家派得幾多」,而唔係「帳面買咗幾多(而其中一半已經過期)」
- **`CH-020` 嗰個「dev tenant 超支」之謎有答案**,而且以後唔會再以「換個 fixture」收場

### 🔴 代價 / 風險

- **`TenantSkuRowDto.owned` 係語意改動** —— 任何讀緊佢嘅嘢(前端 / 將來 API consumer)睇到嘅數會變。`SPE_E3` 由 `21` 變 `4498`。**冇 breakdown 就冇人解釋得到**,所以 D2 把 breakdown 列做必須
- 🔴 **`warning` seat 派唔派得新,未驗證** —— B 係 fail-forward(見 D4)。要收窄呢個風險就要真試一次,而真試 = 喺公司 tenant 真派一個 licence
- **Drift 唔受影響但要講明**:`reconcile` 比 `ledgerAssignedSum` vs `tenantConsumed`,**兩邊都唔掂 `owned`**(已查證:`prepaidEnabled` 全部觸及點列喺 D3 上面,冇一個喺 `reconcile.service.ts`)⇒ 本 ADR 零 drift 影響
- **n8n provider 嘅 `assignableUnits` = `prepaidEnabled`** ⇒ 如果將來真係切去 n8n seam,**呢個 gate 會靜靜退返做今日嘅行為**。⚠️ 呢個係刻意(唔捏造 n8n 冇送過嘅數),但要記住佢係一個**會隨 provider 改變嘅行為差異** —— 屬 `R9`(監控面講嘅嘢同 runtime 做緊嘅唔同)同一族
- **`ADR-0032` 個 `Prepaid seats` KPI 名同 `noPrepaidSeats` label 都要跟住改**(D5 / D7)—— 一個 ADR 落地咗一日就要改字,呢個成本值得記:`CH-026` 個文案係喺**只讀過四個欄之一**嘅前提下寫嘅

### 唔改嘅嘢（明文）

- `prepaidEnabled` 欄名 / seam ② 既有三個欄 / n8n 路行為
- `OpcoSkuLedger` 兩層數字語意 · OpCo budget gate
- `reconcile` / drift 計算
- `ADR-0032` 個 `seatModel` curate 機制 —— 正交,`unlimited` 仍然完全跳過本 gate

---

## References

- `CH-026` spec §5.1 / §5.2(OQ-5 答案 + 本 ADR 起因)· `ADR-0032`(seat model,正交)
- `ADR-0017` seam ② `LicenseOperationsProvider` / `license-ops.provider.ts:32-42`(D3 條線嘅先例)
- `ADR-0029`(`AssignStep.detail`,D4 配套靠佢)· `ADR-0016 D5`(budget gate 行喺 Graph read 之前)
- `graph.service.ts:89` · `catalog.service.ts:92` · `tenant-owned.service.ts:25,77` · `assign.service.ts:351,375`
- `CH-020 progress.md`(2026-08-03 `SPE_E5` 4535/4502 —— 本 ADR 個症狀第一次出現)
