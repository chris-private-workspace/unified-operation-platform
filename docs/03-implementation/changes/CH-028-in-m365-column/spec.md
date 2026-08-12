# CH-028 — Platform view 加一欄 `In M365`(`tenantConsumed`)

- **Status**:`proposed`(2026-08-12)— 🔴 **D2 / D3 未拍板,未可開工**
- **ADR**:暫時**唔需要**(理由見 §6;⚠️ 但 **D2 揀 B 就可能觸 H1**)
- **Owner**:Chris Lai
- **BACKLOG**:`ASSETS-IN-M365`(🟢 approved 2026-08-12)

## 1. 問題

Chris 2026-08-12 問「owned / allocated / assigned / unalloc. 呢啲數點嚟」。查證(`tenant-owned.service.ts:41-51`)揭到真正落差**唔係個名**:

> **`Assigned` 係平台自己嘅帳**(Σ `OpcoSkuLedger.assignedQuantity`),**唔係 M365 真實用量**。

M365 真實用量係同一筆 snapshot 嘅 `consumedUnits` —— API **一早出咗**做 `tenantConsumed`(`tenant-owned.dto.ts:79`),個表就係冇顯示。

⇒ 兩個數**從來冇並排出現過**,而佢哋差幾多正正就係 **Drift 頁存在嘅理由**。

## 2. Scope

### In

1. Platform view 表加一欄 **`In M365`** = `row.tenantConsumed`
2. category subtotal 加對應一格(`tenant-skus.ts` `groupByCategory`)
3. grand total 行嗰格點填(**D3**)
4. 「差咗點顯示」(**D2** —— BACKLOG 明文要求本 spec 答)
5. 表底 scope note 補一句:點解呢兩個數會唔同
6. test:subtotal + 顯示邏輯 + (若揀 D3-B)後端 stats 欄真係出到 API

### Out（明確唔做）

- ❌ **唔改 Drift 頁 / `reconcile` / `DriftAlert` 語義** —— 改佢 = **H1**(ADR-0008 D5)
- ❌ **唔令 Platform view 變成第二個 drift 真相**(見 D2)
- ❌ **唔加 live Graph call** —— `tenant-owned.service.ts:12` 明文 OD4「never calls Graph」,一個 GET 唔應該有副作用 / 唔應該喺 tenant 掛咗嗰陣爆。改佢 = **H1**
- ❌ **唔答 unlimited SKU 嘅 drift 語義** —— ADR-0032 §146 明文另開(⚠️ 呢條數唔細:`FLOW_FREE` 用緊 4525)
- ❌ **唔做「對回」/ 消除 delta** —— DESIGN §10 deferred

## 3. 設計

### D1 — 欄位位置

`In M365` 擺喺 **`Assigned` 之後、`Unalloc.` 之前**。對比對象就係 `Assigned`,隔開兩欄就冇咗對比。表由 **6 欄變 7 欄**(`overflow-x-auto` 已經喺度)。

### D2 🔴 — 「差咗點顯示」（**核心決定,要拍板**）

**先講一個查證出嚟嘅硬事實**:`In M365 − Assigned` **就係** `DriftAlert.delta` 嘅定義 —— 兩條 sum **逐字相同**(`tenant-owned.service.ts:41-51` vs `reconcile.service.ts:72-76`,都係 Σ `OpcoSkuLedger.assignedQuantity`)。

**但兩邊個 `tenantConsumed` 來源唔同:**

| 畫面 | `tenantConsumed` 來源 | 時點 |
|---|---|---|
| **Drift 頁** | **live Graph**(`reconcile.service.ts:50`,OD2 明文「fresh tenant totals, **not** a stored snapshot」) | reconcile 跑嗰刻 |
| **Platform view** | **stored `TenantSkuSnapshot`**(`tenant-owned.service.ts:89`,OD4 明文「never calls Graph」) | 上次 catalog sync |

⇒ **兩個畫面計出嚟嘅 delta 可以唔同,而個差係時間差,唔係邊個錯。** 仲有兩個細分別:reconcile 掃**全部 active SKU** 而 Platform view 只顯示「有 snapshot 或有 ledger」嘅(`tenant-owned.service.ts:71`);reconcile 攞唔到就 `?? 0`,Platform view 攞唔到就 `null`。

| 選項 | 做法 | 代價 |
|---|---|---|
| **A(推薦)** | **只並排,Platform view 唔計 delta**。Drift 頁維持**唯一** delta 真相 | 讀者要自己減。**換返嚟嘅係零「第二份清單」風險** |
| B | delta 做副行(同 `grace` 副行同款) | 🔴 **製造第二個 delta 數字**,而佢同 Drift 頁**可以唔同** ⇒「邊個啱」會變成新嘅 support 問題。呢個正正係本 repo 反覆嗰個形狀(`apiPatch` · BUG-011 · CH-023 文案 …)。**揀 B 就要同時答「兩個 delta 唔同點算」**,而嗰個答案掂到 drift 語義 ⇒ **可能觸 H1** |
| C | delta 塞入 Status badge | ❌ DS-8:status 只可以有一個真相,而 Status 欄已經有 6 個 label |

**⇒ 推薦 A。** 本 CH 個價值係「**令兩個數第一次並排**」,唔係「再計一次 drift」—— drift 一早有專頁。

### D3 🔴 — grand total 行（**「零後端改動」喺呢度失效,要拍板**）

grand total 行(`platform-view.tsx:230-261`)食 `stats.data`(`TenantSkuStatsDto`),而佢**冇 `totalConsumed`**。

| 選項 | 做法 | 代價 |
|---|---|---|
| A | grand total 嗰格留 `—` | 零後端改動,但**一個欄喺 total 行空白**會令人問點解 —— 而個答案係「我哋冇計」,唔係一個好答案 |
| **B(推薦)** | `TenantSkuStatsDto` 加 `totalConsumed` | 後端一個 reduce。⚠️ 見下面陷阱 |

🔴 **揀 B 就要記住 BUG-011 個形狀**:加咗欄落 read-model **唔等於出到 API**(controller 逐個欄砌、明文唔 spread —— ADR-0013 D2 刻意設計),而三層 test 可以全綠(service spec 打 service · UI test 自砌 fixture · **DTO 冇宣告嗰個欄所以 tsc 唔返佢完全合法**)。⇒ 必須 **service + DTO + 一條真打 controller 嘅 assert**,三樣齊。

⚠️ **`totalConsumed` 個 scope**:`totalOwned` 係 **prepaid-only**(ADR-0032 D3),而 `totalAllocated` / `totalAssigned` 係 **all rows**。`totalConsumed` 應該**跟後者** —— unlimited SKU 上面 `consumed` 係真數(`FLOW_FREE` 用緊 4525),剔走佢就會令 total 行同下面 subtotal 對唔上。**呢個 scope 差異要喺 DTO description 寫明**,唔可以靠讀者估。

### D4 — null 顯示

`tenantConsumed === null`(從未 sync)→ **`—`**,行返既有 `numOr`。⚠️ **唔可以顯示 `0`** —— 同 ADR-0032 D3 同一個理由:`0` 係一個答案,而且係錯嗰個。

### D5 — subtotal scope

`groupByCategory` subtotal 加 `consumed`,**跟 `assigned` 個 scope(all rows)**,唔跟 `owned`(prepaid-only)。理由同 D3。⚠️ 呢個令 subtotal 一行入面有兩種 scope —— 現時**已經係咁**(`tenant-skus.ts:101-105` 明文寫住),而佢安全嘅唯一原因係 `unlimited` 那格會講出嚟。

### D6 — 文案

欄名 **`In M365`**(BACKLOG 用字)。表底 scope note 補一句,講明佢係**上次 sync 嗰刻**嘅 M365 用量,同 `Assigned`(平台自己嘅帳)唔同源;差額喺 **Drift** 頁跟進。⚠️ Voice 跟 DS-10:短、Sentence case。

## 4. Acceptance

| # | 準則 | 點驗 |
|---|---|---|
| A1 | 表出到 `In M365` 欄,值 = `row.tenantConsumed`,位置喺 `Assigned` 同 `Unalloc.` 之間 | UI test |
| A2 | `tenantConsumed === null` → `—`(唔係 `0`) | UI test |
| A3 | category subtotal 有對應一格,scope = all rows(unlimited 都計) | `tenant-skus.test.ts`,**要有一個 unlimited row 嘅 fixture** 先算數 |
| A4 | grand total 行按 D3 決定填(A:`—` / B:`totalConsumed`) | UI test |
| A5 | (只限 D3-B)`totalConsumed` **真係離開得到 API** | 🔴 打 controller 嗰層嘅 assert,唔可以只打 service(BUG-011) |
| A6 | Drift 頁**一個字唔變** | `git diff --numstat` — `drift.tsx` / `reconcile.service.ts` **0 changed** |
| A7 | 表底 scope note 講到兩個數唔同源 | 人眼 + UI test 對字串 |
| A8 | H6:light + dark 都真 render 過,數字 mono(DS-5),零 hardcode 色值(DS-1) | `ui-design` skill 逐條 + 截圖 |
| A9 | 既有 test 一條唔跌;api / web tsc 0;root lint 0 | 本機跑 |

🔴 **A6 唔係形式** —— 本 CH 最大風險就係喺 Platform view 度養出第二個 drift 真相,而 `numstat` 係唯一硬證據。

## 5. Effort

**0.5 日**(D3 揀 A)/ **0.5–1 日**(D3 揀 B,多咗後端 + controller 層 test)。

## 6. Dependencies

- 🟢 `ASSETS-IN-M365` **approved**(Chris 2026-08-12)
- 🔴 **D2 / D3 要拍板先開工**
- 🟢 **row-level 零後端改動** —— `tenantConsumed` 一早喺 `GET /license/tenant-skus` 回應
- **要唔要 ADR?** 唔使 —— 加一個 read-model 欄同顯示一個既有欄,唔掂四層地基 / module 邊界 / Prisma schema / 任何 locked 決策。⚠️ **例外:D2 揀 B**(Platform view 自己計 delta)= 喺 drift 以外多開一個 delta 真相 ⇒ 掂到 drift 語義,**要先 STOP 傾,可能要 ADR**

## 7. 已知代價

- 表由 6 欄變 7 欄,窄螢幕更易橫向捲(`overflow-x-auto` 已在,但要 light+dark 都睇過)
- **`In M365` 同 Drift 頁個數可以唔同**(時間差)—— D6 條 note 就係為咗呢個;揀 D2-A 之後呢個代價只影響一個數字,唔會變成兩個 delta 互相打架
- 加完之後畫面會**第一次公開展示**「平台帳 vs M365 實況」嘅落差 —— 呢個係本 CH 嘅**目的**,唔係副作用,但要有心理準備條數可能好核突(CH-020 就撞過 dev tenant 超支 33)

## 8. Spec Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-08-12 | Initial draft(`proposed`) | `ASSETS-IN-M365` approved;開工前查證揭到兩件 BACKLOG 冇提嘅事(D2 兩個 `tenantConsumed` 唔同源 · D3「零後端改動」對 grand total 唔成立) | — |

---

**Lifecycle reminder**:spec locked after status=approved。重大 deviation → §8 changelog。
