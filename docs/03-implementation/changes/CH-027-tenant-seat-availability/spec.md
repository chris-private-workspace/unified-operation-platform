---
change_id: CH-027
title: "Tenant 可用 seat 計埋寬限期 —— owned / assign gate 唔再只睇 enabled"
status: proposed
created: 2026-08-12
target_completion: 2026-08-13
affects_components: [apps/api/integration, apps/api/license, apps/api/fulfilment, apps/web, prisma]
spec_refs:
  - ADR-0033(決策 SSOT · **Accepted** 2026-08-12)
  - ADR-0032(seat model · 正交,unlimited 仍然完全跳過本 gate)
  - ADR-0017(seam ② `LicenseOperationsProvider` 契約)
  - docs/02-architecture/licenseops/DESIGN.md §5(三層 owned → allocated → assigned)
---

# CH-027 — Tenant 可用 seat 計埋寬限期

> **Spec version**:1.0
> **Owner**:Chris Lai
> **Approved by**:_(待填)_
> **決策 SSOT**:**`ADR-0033`**(**Accepted** 2026-08-12 —— D1 連 `capabilityStatus` · D2 · **D4 揀 B**)
> **分類**:Change,**觸發 H1 ×3**(schema · read-model 語意 · **seam ② 契約**)**+ H5**(assign 個 tenant seat gate)

## 1. Context (Why)

`graph.service.ts:89` 由第一日起只讀 `prepaidUnits.**enabled**`,而 Graph 一路畀緊**四個**數。後果(2026-08-12 唯讀 probe,101 個 SKU 實測):

- **assign gate 拒絕 32 / 101 個 SKU,其中 27 個 tenant 手上仲有 seat**
- 唔係邊緣 SKU:**`SPE_E5` 4543/4502**(warn=242)· **`SPE_E3` 677 而 `enabled=21`、`warning=4477`** · `MCOEV` 1007/20 · `INTUNE_A_VL` 329/110
- `CH-026` 個 `noPrepaidSeats` 只覆蓋到其中 15 個

📌 **CH-020 2026-08-03 真撞過**(「dev tenant `SPE_E5` 超支 33,gate 擋死」→ 換 fixture 收場)。全套背景 + 否決過嘅方案見 **`ADR-0033`**,本 spec 唔重複。

## 2. Scope

### 2.1 In Scope

**A — Graph 攞齊（`src/integration/graph`）**
- `SubscribedSku` 加 `suspendedUnits` / `warningUnits` / `lockedOutUnits`;`capabilityStatus` **一早已經攞緊**(`:91`),唔使改
- `getSubscribedSkus()` map 多三個欄

**B — schema（H1,ADR-0033 D1）**
- `TenantSkuSnapshot` 加 `suspendedUnits` / `warningUnits` / `lockedOutUnits`(`Int @default(0)`)+ `capabilityStatus`(`String @default("Enabled")`)
- 🔴 **`prepaidEnabled` 個名唔改**(D1)
- migration **只加欄**;🔴 **零 data migration**(D6 —— 舊 snapshot 冇量度過,填任何值都係捏造)

**C — 寫入（`catalog.service.syncFromTenant`）**
- `tenantSkuSnapshot.create` 存齊新欄

**D — seam ② 契約（H1,ADR-0033 D3）**
- `TenantSkuSeats` 加 `assignableUnits: number`
- `graph-license.provider` → `prepaidEnabled + warningUnits`
- `n8n-license.provider` → `prepaidEnabled`(佢冇更多資料)⇒ **n8n 路行為逐字不變**
- 🔴 **唔把四個欄加落 seam** —— `license-ops.provider.ts:32-34` 已經為同一個問題畫過同一條線

**E — read-model（H1,ADR-0033 D2）**
- `owned` = `prepaidEnabled + warningUnits`
- 🔴 **必須同時出 `ownedBreakdown`**(四個數 + `capabilityStatus`)—— `SPE_E3` 會由 `21` 變 `4498`,冇 breakdown 冇人解釋得到
- stats 跟住走(`totalOwned` 仍然只計 prepaid seat model)

**F — assign gate（**H5**,ADR-0033 D4)**
- `consumedUnits >= tenantSku.assignableUnits`
- **配套**:`assignableUnits` 主要靠 `warning` 撐起嗰陣,`seats` step 即使 `ok` 都帶 `detail`:「N seats are in the expiry grace period」(ADR-0029 `AssignStep.detail` 容得下,零契約改動)

**G — `noPrepaidSeats` 收窄（ADR-0033 D5）**
- 由 `enabled === 0 && consumed > 0` 改成 **`owned === 0 && consumed > 0`**
- badge `No seats enabled` → **`Subscription suspended`**,🔴 **由 `capabilityStatus` 直接讀,唔靠 `suspended > 0` 推**

**H — Platform view（ADR-0033 D7）**
- breakdown 睇得到(hover / 副行)
- `warning > 0` 嘅 SKU 有視覺標示 —— 佢個數字靠緊過期訂閱,同乾淨 `enabled` 唔同質
- KPI `Prepaid seats` → **`Available seats`**(D2 之後佢已經唔止 prepaid)

### 2.2 Out of Scope（explicit）

- ❌ **真試 `warning` seat 派唔派得新 licence** —— 會喺公司 tenant 真派一個 licence,**要 owner 另外批**。⚠️ 本單係 fail-forward(ADR-0033 D4),配套 detail 就係為咗呢個未知而存在
- ❌ **`reconcile` / drift** —— 已查證兩邊都唔掂 `owned`,零影響
- ❌ **`OpcoSkuLedger` 兩層數字 / OpCo budget gate** —— 一個字唔改
- ❌ **追溯補舊 snapshot**(D6)
- ❌ **`ADR-0032` 個 `seatModel` 機制** —— 正交,`unlimited` 仍然完全跳過本 gate
- ❌ **n8n 側送 `warning`** —— 要改 n8n workflow,唔喺平台

## 3. Acceptance Criteria

- [ ] **A1** `getSubscribedSkus()` 出四個 unit 數 + `capabilityStatus`;test 用真實形狀 fixture(`prepaidUnits` 四個 key)
- [ ] **B1** migration **只加欄**,`git diff` 見到零 `UPDATE` / 零 `INSERT`
- [ ] **B2** 🔴 舊 snapshot(新欄 = 0)之下 `owned` **同今日逐字一樣** —— 行為喺下次 sync 先變
- [ ] **C1** sync 之後 snapshot 四個數 + status 對得返 Graph 回應
- [ ] **D1** `TenantSkuSeats` 加 `assignableUnits`;**graph** = `enabled + warning`
- [ ] **D2** 🔴 **n8n provider `assignableUnits === prepaidEnabled`**,而且 n8n 路既有 test **一條都唔使改**
- [ ] **D3** seam ② **冇** `warning` / `suspended` / `lockedOut` / `capabilityStatus` 任何一個欄(契約唔洩漏 Graph 結構)
- [ ] **E1** `owned = enabled + warning`;`SPE_E3` 形狀嘅 fixture(`enabled=21, warning=4477`)出 `4498`
- [ ] **E2** `ownedBreakdown` 四個數 + `capabilityStatus` 出到 API(🔴 **DTO 要宣告** —— BUG-011 個縫)
- [ ] **F1** **`enabled=0, warning=790, consumed=91`**(`POWER_BI_PRO` 真形狀)→ **過閘**
- [ ] **F2** **`enabled=0, suspended=50, warning=0, consumed=30`**(`VIVA` 真形狀)→ **仍然擋**
- [ ] **F3** **`enabled=22, warning=0, consumed=22`**(`Teams_Rooms_Basic`)→ **仍然擋**(真係用晒)
- [ ] **F4** `seats` step 喺靠 `warning` 撐起嗰陣帶 grace-period `detail`;唔靠嗰陣**冇**呢句
- [ ] **F5** 🔴 `unlimited`(ADR-0032)**行為逐字不變** —— 仍然 `skipped`、仍然唔打 Graph
- [ ] **G1** `noPrepaidSeats` 收窄:`POWER_BI_PRO` 形狀 **false**、`VIVA` 形狀 **true**
- [ ] **G2** badge 出 `Subscription suspended`,而且**由 `capabilityStatus` 讀**(拆走 `capabilityStatus` ⇒ test 真紅)
- [ ] **H1** Platform view 出 breakdown;`warning > 0` 有標示;KPI = `Available seats`
- [ ] **T1** api test 全綠 · **T2** web test 全綠(pre-existing 6 條唔計)
- [ ] **T3** api lint 0 · web tsc 0
- [ ] **T4** 🔴 **Falsification ×2**:①gate 改回 `prepaidEnabled` ⇒ **F1 必須真紅** ②`capabilityStatus` 改成由 `suspended > 0` 推 ⇒ **G2 必須真紅**
- [ ] **H6** 跑 `ui-design`;**light + dark 真 render**
- [ ] **V1** 🚧 真環境:sync 一次 → `SPE_E3` 個 `owned` 由 `21` 變 `4498`(要本地 stack)

## 4. Hard-constraint 判斷

| | 觸發 | 狀態 |
|---|---|---|
| **H1** ① | `TenantSkuSnapshot` 加四個欄 | 🟢 `ADR-0033 D1` Accepted |
| **H1** ② | `TenantSkuRowDto.owned` **語意改動** | 🟢 `ADR-0033 D2` Accepted;配 breakdown 做必須 |
| **H1** ③ | **seam ② `TenantSkuSeats` 契約擴闊** | 🟢 `ADR-0033 D3` Accepted;揀 `assignableUnits` 唔洩漏 Graph 結構 |
| **H5** | assign 個 tenant seat gate | test 見 §3 F1-F5 + T4 |

## 5. Risks

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | **`warning` seat 派唔到新 licence** ⇒ 失敗由「pre-flight 擋住」變「Graph 拒絕」 | **Med** | **Med** | ADR-0033 D4 明文接受呢個 fail-forward;F4 個 grace-period detail 令操作員**撳之前**就知。真答案要另外批一次真試 |
| R2 | `owned` 語意改動令讀緊佢嘅嘢誤讀 | Med | High | E2 breakdown 做**必須**唔係 nice-to-have;H1 畫面標示 |
| R3 | 新欄加咗但唔流出 API(BUG-011 個縫) | Med | Med | E2 明文要 DTO 宣告;controller 已查證係直返 service |
| R4 | n8n 路被連累 | Low | High | D2 訂死「既有 test 一條都唔使改」做驗收條件 |
| R5 | 改到 `ADR-0032` 個 `unlimited` 路 | Low | High | F5 專門一條 |

## 6. Effort Estimate

**約 1 日**(A+B+C ≈ 2h · D ≈ 1.5h · E ≈ 1.5h · F ≈ 1.5h · G+H ≈ 1.5h · 驗證 + doc-sync ≈ 1h)。⚠️ 唔含 V1(要本地 stack)。

## 7. Open Questions

- **OQ-1** — `warning` seat 派唔派得新 licence?**要真派一次先答得到**(要 owner 批)。本單唔靠佢(fail-forward + 提示),但答咗就決定得到 F4 嗰句提示要唔要升級做 warning tone
- **OQ-2** — `lockedOut` 今日全 tenant **得一個 SKU 非零**(`Microsoft_Teams_Rooms_Pro` locked=5)。本單只**存**唔**用**佢。將來要唔要納入判斷,等有第二個樣本先講

## 8. Spec Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-08-12 | Initial draft(由 `ADR-0033` Accepted 落地) | Chris 剔 D4=B + ADR approved + 加 `capabilityStatus` | — |

---

**Gate reminder**:`ADR-0033` **已 Accepted**(H1 三個都過)。**淨低本 spec 要由 `proposed` → `approved`**(PROCESS R1.change)先可以寫第一行 code。
