---
doc_type: how-to
title: "OpCo 預算 assign gate 上線(ADR-0016)"
audience: 部署執行者 + 操作者(Regional IT / OpCo IT)
last_updated: 2026-07-27
---

# How to 上線 OpCo 預算 assign gate

> **對內** how-to。**來源**:W36 F5(`docs/01-planning/W36-opco-budget-gate/`)。規格 = **ADR-0016**(D1-D7)。
> 相關:ADR-0007(`PATCH /license/ledger/:id` = 加 allocated 嘅正路)· ADR-0004(allocation import)· ADR-0009(audit)· `DATA-INITIALISATION.md`(ledger 由零建起)。

## 呢個 gate 做咩

上線之後,`assignLineItem` 會**拒絕**任何令 OpCo 超出佢 `allocatedQuantity` 嘅派發:

```
assigned + 1 > allocated  →  400 Bad Request
```

- **冇 ledger row = allocated 0 ⇒ 一律拒絕**(D1)。**冇「預設無限」**。
- 拒絕**唔係警告**,係硬擋。訊息帶實數 + 出路。
- 只有 **ADMIN** 可以帶**必填理由**強制通過(D3);`OPCO_IT` / `REGIONAL` **完全冇** override 路徑。
- 🔴 **`allocatedQuantity` 仍然唔參與 drift 對帳** —— 本 gate 只改變佢「純顯示」嘅性質,方案甲原封(ADR-0016 Context / AP-10)。

---

## 為咩一定要上線前做呢一步

Gate 一開就即刻生效,而且**係靜默生效** —— 冇人會收到通知,只會喺落單嗰刻食一個 400。若唔事先跑下面條 SQL 並通知操作員,實際效果就係**無預警凍結若干 OpCo × SKU 組合**(W36 plan R1)。

---

## 步驟

### 步 1 — 喺**目標環境**跑 preflight SQL

```bash
# 已部署環境
psql "$DATABASE_URL" -f docs/05-usage/sql/opco-budget-gate-preflight.sql

# 本地 dev
docker exec -i uop-postgres psql -U uop -d platform \
  < docs/05-usage/sql/opco-budget-gate-preflight.sql
```

唯讀,幾時跑都得,跑幾多次都得。

⚠️ **一定要喺目標環境跑,唔可以引用其他環境嘅數字。** ledger 內容逐個環境完全唔同;dev 嗰份仲混住 seed / demo 數據(見下面「dev 實測」)。

四段輸出:

| 段 | 內容 | 點解要睇 |
|---|---|---|
| **[1] summary** | `at_or_over` / `at_or_over_active` / `strictly_over_active` / `zero_allocation_active` | 「呢次上線影響幾大」嘅一句話答案。**用 `at_or_over_active`**,唔好用 `at_or_over` |
| **[2] 會被擋嘅組合** | 逐行 opco × **skuId** × allocated / assigned / overage / 建議動作 | 交畀操作員嘅名單本體 |
| **[3] 完全冇 ledger row 但有 pending line item** | opco × skuId × 未完成嘅 line item 數 | 🔴 **[2] 睇唔到呢類**。冇 row = allocated 0 ⇒ **每一次** assign 都被擋,唔止「下一次」 |
| **[4] 一個 part number 有多過一個 catalog row** | partNumber × 幾多 row × 邊個 active | 有 row 返 = **part number 唔足以識別 SKU**,[2]/[3] 一定要用 `skuId` 讀 |

### 步 2 — 逐行決定點處理,然後至部署

[2] 每一行 `what_to_do` 已經寫咗建議。三種情況:

| 情況 | 出路 |
|---|---|
| `assigned > allocated`(已經超) | 把 `allocated` 調到**至少**等於 `assigned`,否則呢個組合下一次 assign 即擋 |
| `assigned = allocated`(啱啱用盡) | 唔使即刻做嘢,但**下一次** assign 就係第一個被擋嘅。列入通知名單 |
| `sku_active = f` | **呢個 `skuId`** 唔使處理(intake 拒 inactive SKU,永遠唔會有新 line item)。⚠️ 但先睇 [4] —— 同一個 part number 可能有另一個 **active** 嘅 row,嗰個要處理 |

[3] 每一行都要**建 ledger row 並設 allocated**,否則嗰啲 pending line item 一世 assign 唔到。

改 allocated 嘅正路(ADR-0007):

- **UI**:`License Assets` → By-OpCo → 該行 ✎ → 改 `Allocated` → Save(要填 reason,入 `LedgerAdjustment`)
- **API**:`PATCH /license/ledger/:id`
- **批量**:`POST /license/ledger/import`(ADR-0004;**只寫 `allocatedQuantity`**,唔會掂 `assignedQuantity`)

> 🚧 **DD-3**:目前**冇** ledger row 嘅 create endpoint。[3] 嗰批要靠 import(ADR-0004)建,或者由該 OpCo 第一次成功 assign 時 upsert 出嚟 —— 但 gate 一開就 assign 唔到,所以**只能靠 import**。上線前必須處理。

### 步 3 — 通知操作員

把 [2](active 部分)+ [3] 嘅名單交畀實際派 license 嘅人,講清三件事:

1. 呢啲組合下一次 assign 會**畀 400 擋住**,唔係 bug。
2. 正路 = **加 allocated**(上面步 2)。
3. 真係急 → 搵 ADMIN 用**具名 override**(下面「Override」一節)。

### 步 4 — 部署後第一項檢查(🔴 W36 唯一 live 驗唔到嘅嘢)

**gate 嘅 400 本身喺 dev live 驗唔到。** D5 把 gate 放喺 `graph.findUser` **之後**,而 dev 嘅 seed UPN 唔存在於真 tenant ⇒ 永遠停喺 `Target user not found in Azure AD`,行唔到落 gate。W36 冇用真人 UPN 硬闖 —— 嗰個做法一旦 gate 有 bug 就會**真派一個 licence 畀一個真人**(W36 R6)。

⇒ **部署到有真 synced user 嘅環境之後,呢個係第一件要驗嘅事**:

1. 揀一個 **真 synced** 嘅 request line item(`azureSyncedAt` 有值、target 喺 tenant 搵得到)。
2. 確認佢個 OpCo × SKU **冇 headroom**(用步 1 條 SQL,或睇 request detail 顯示嘅 `assigned/allocated`)。
3. 以 **OPCO_IT 或 REGIONAL** 撳 Assign。

**預期**:400,訊息 =

```
OpCo budget exceeded for <partNumber>: <n> assigned of <m> allocated.
Raise the allocation or ask an admin to override.
```

**驗完即刻查**:該 line item 仍係 `READY`、`assignedAt` 仍然空、`AuditLog` 冇新 `assign.budget_override` row、tenant 冇多咗一個 assignment。任何一項唔對 = **即刻回滾,唔好繼續派**。

---

## Override(ADMIN 專有)

| | |
|---|---|
| 邊個 | **只有 ADMIN**。`OPCO_IT` / `REGIONAL` 帶 `budgetOverrideReason` → **403**(唔係靜靜忽略,D3/D4) |
| 點做 | Request detail → 冇 headroom 嗰條 line item 旁邊嘅 **`Override budget`** → 填理由 → `Assign with override` |
| 理由 | **必填,至少 10 個字元,唔可以純空白**。理由本身就係 audit 價值:`override=1` 只記錄「有人破咗規矩」,`"RHK 急單,下週補 allocation"` 先記錄**點解** |
| 留低咩痕跡 | ① `AuditLog` `action = assign.budget_override`(`/admin/audit` 可以直接 filter,**ADMIN-only**)② 該 request timeline 一條 `ASSIGN` event,帶 `assigned/allocated` + 理由原文 |
| 被擋(冇 override)嗰次 | **唔寫 AuditLog**(冇狀態改變),只有一條 `logger.warn`(H4:只有 id 同數字,**冇 UPN**) |

🔴 **Override 唔係「加 allocation 嘅快捷方式」。** 佢淨係處理「真係要即刻派」嘅個案;數字本身冇改,下一次一樣會擋。ADR-0016 **R4** 明文把「override 變成日常操作」列為風險,`/admin/audit` filter `assign.budget_override` 就係監察手段 —— **定期睇**。

Override **唔會**放行任何其他 gate:tenant 座位不足、Phase 1 sync gate 未過、line item 未 `READY`、OPCO_IT 跨 OpCo —— 全部照擋。

---

## 🔴 買咗 licence 都 assign 唔到(必讀)

**買 licence 唔會令 `allocatedQuantity` 自動增加。**

所以完整流程係:

```
預算爆 → 行 procurement path 買 licence → line item 推到 READY
       → assign 仍然撞同一個 gate ⇐ 因為 allocated 冇變
       → 要有人手動加 allocated(ADR-0007 正路)
```

呢個斷點係**刻意唔自動化**嘅(會掂 ADR-0004「Excel 定平台先係 allocated 嘅 SSOT」尚未解決嘅張力)。要自動化 = **新 ADR**,唔可以喺實作裡面偷偷加。

前端 override dialog 已經寫咗呢句提示,但**操作流程上仍然要有人負責喺採購完成後更新 allocated** —— 唔指定人,呢步就會冇人做,然後大家學識用 override 頂住,直到 allocated 完全失去意義。

---

## dev 實測(2026-07-27,只作**格式**參考,唔可以當目標環境數字)

```
ledger_rows 148 | at_or_over 22 | at_or_over_active 10
strictly_over_active 9 | zero_allocation_active 0
```

外加 [3] 三個組合(全部 PFU-Asia)完全冇 ledger row,合共 4 條 pending line item 會被擋。

⚠️ 兩點要留意,兩個都係跑真 SQL 先揪到嘅:

1. **W36 plan §2 原本寫「22 行、其中 6 行 inactive ⇒ 16 個 active 組合」,係錯嘅。** 實際 inactive 有 **12** 行 ⇒ active **10** 個。原本嘅點算只當 `VISIO_PLAN1` / `WIN_DEF_ATP` 係 inactive,漏咗 `SPE_E3` / `STANDARDPACK` 都各有一個 inactive 嘅 row。
2. 嗰兩個 inactive 嘅 `SPE_E3` / `STANDARDPACK` 嘅 `skuId` 係 **`test-e3` / `test-e1`** = dev 測試 fixture,唔係真 legacy 訂閱。**所以 dev 嗰 22 行入面有 6 行係假數** —— 更加證明點解一定要喺目標環境自己跑。

---

## 相關

- SQL:[`sql/opco-budget-gate-preflight.sql`](./sql/opco-budget-gate-preflight.sql)
- ledger 由零建起 / assigned baseline:[`DATA-INITIALISATION.md`](./DATA-INITIALISATION.md)
- 決策全文:`docs/adr/0016-opco-budget-assign-gate.md`
- 實作:`apps/api/src/fulfilment/assign.service.ts`(gate + override)· `apps/web/src/pages/request-detail.tsx`(override 入口)
