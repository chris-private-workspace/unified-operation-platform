# ADR-0016: OpCo 預算(`allocatedQuantity`)成為 assign 硬 gate,ADMIN 可具名 override

**Date**: 2026-07-26
**Status**: Proposed
**Approver**: Chris Lai

## Context

### 觸發

Chris 提出:「現在只是直接 assign 的操作在本項目設計了,而沒有任何先檢查 license 是否有足夠可用 / 可 assign 數量的流程存在。」

### 前提修正(查證後)

「冇任何檢查」**唔完全準確**。`assign.service.ts:127-132` 已經有一個 seat gate:讀 live Graph `getSubscribedSkus()`,`consumedUnits >= prepaidEnabled` → 400,而且喺打 Graph assign **之前**、fail-closed。

**但佢只睇 tenant 總量。** OpCo 層嘅 `allocatedQuantity`(預算)爆咗,平台今日**照 assign**、`assignedQuantity` 照 +1,結果變 over-allocated —— 前端事後顯示紅色,但攔唔住。本 ADR 補嘅係**呢一層**,唔係 tenant 層。

### 觸發嘅 hard constraint

**CLAUDE.md §5.1 H1** —— 改動 locked 決策「ledger 兩層數字」嘅語意。

### 🔴 必須分清嘅兩件事(唔分清會誤讀成動咗對帳方案甲)

`allocatedQuantity` 今日有**兩個**性質,本 ADR **只改一個**:

| 性質 | 出處 | 本 ADR |
|---|---|---|
| **① 不參與 drift 對帳** —— reconcile 只比 `sum(assignedQuantity)` vs tenant `consumedUnits` | `DESIGN.md §5 line 100` · `reconcile.service.ts:23` · ADR-0004 Consequences · AP-10 | **一個字都唔改** ✅ |
| **② 純顯示 / 不影響任何行為** | 同上(「→ 顯示/反映」) | **改** —— 升格為 assign 硬 gate |

> **對帳方案甲、`skuId` 主鍵、ledger 兩層數字嘅「邊個對帳」分工,全部原封不動。** `reconcile.service.ts` 本 ADR 零改動。若日後有人見到本 ADR 而以為 allocated 開始參與 drift —— **唔係**,請重讀本節。

### 現況數據(2026-07-26 dev DB 實查)

```
total 148 | alloc_zero 0 | alloc0_assigned_gt0 0 | at_or_over_budget 22 | strictly_over 20
```

⇒ **148 行入面 22 行已經 `assigned ≥ allocated`,其中 20 行嚴格超過。**

呢個數字改變咗本 ADR 嘅性質:硬 gate **唔係「防止將來超支」,而係即刻令呢 22 個 OpCo×SKU 組合再 assign 唔到**。最可能成因係 W35 `baseline:assigned`(ADR-0014)灌入真實 assigned 數字之後,`allocatedQuantity`(Excel 預算鏡像)本身舊咗未跟上 —— 即**數字唔啱嘅可能係 allocated 嗰邊**。

Chris 已就此拍板(見 D2)。

## Decision

### D1 — Gate 條件

喺 `assignLineItem` 加一個 gate:

```
若 (ledger.assignedQuantity + 1) > ledger.allocatedQuantity  →  拒絕
```

- **ledger row 唔存在** = 從未設過預算 ⇒ 當 `allocated = 0` ⇒ **擋**。
- **`allocated = 0`** 亦即「未設預算」⇒ **擋**。出路係 ADMIN 經 `PATCH /license/ledger/:id`(ADR-0007)設預算。
  > 🔗 呢點同 **CH-008**(0/0 空白行預設隱藏)+ **DD-3**(冇 ledger create endpoint)直接扣連:一個被隱藏咗嘅 0/0 格,喺本 ADR 之下等於「呢個 OpCo 唔准派呢個 SKU」。CH-008 個 toggle 因此由「方便」升級為**必需**。
- `+1` 而唔係 `+ lineItem.quantity`:因為既有 assign 每次只 `increment: 1`(`assign.service.ts:165`)。本 ADR **唔改**呢個既有行為。

### D2 — 既有 22 行超支:只擋「進一步惡化」(Chris 拍板)

**唔做 grandfather、唔加豁免欄。** 條件 `assigned + 1 > allocated` 自然涵蓋:已經超嘅 22 行,`+1` 必然更超 ⇒ 一樣擋;未超嘅 126 行照常。

語意講清楚:**我哋擋嘅係「再抽多一格」,唔係「懲罰歷史數據」**。

**否決咗嘅兩個做法**(見 Alternatives):加 `budgetGateExemptUntil` 欄位做 grandfather、以及「先修完數據先開 gate」。

### D3 — 硬擋 + ADMIN 具名 override(Chris 拍板)

| 角色 | 撞到預算上限 |
|---|---|
| `OPCO_IT` | **一律擋,永遠冇 override** |
| `REGIONAL` | **擋**(冇 override —— 未經 Chris 授權擴大,保守 fail-closed) |
| `ADMIN` | 可 override,**但必須具名寫理由** |

**Override 形狀 —— 建議 body 帶理由,而唔係 `?override=1`**:

```ts
// AssignLineItemDto(既有,只加一欄)
budgetOverrideReason?: string;   // ADMIN only, 必須非空白, 建議 min 10 char
```

理由:① `override=1` 寫落 audit 等於冇資訊,`"RHK 急單,預算下週補"` 先有價值 ② 打字有摩擦力,防止順手撳 ③ 非 ADMIN 帶呢個欄 → **403**(唔係靜靜忽略)。

> ⚠️ 呢點**偏離**咗選項 preview 入面嘅 `?override=1` 形狀。語意(ADMIN-only + 寫 audit)完全一致,只係換成更有 audit 價值嘅載體。**請確認接受**,唔接受就退回 query flag。

### D4 — 拒絕用邊個 status code

用 **400 BadRequest**,同隔離一行嘅既有 tenant seat gate(`assign.service.ts:129`)一致。

> ⚠️ 亦**偏離** preview 嘅 `403`。理由:403 語意係「你冇權做呢件事」,但 OPCO_IT 撞預算唔係權限問題 —— 佢有權 assign,只係冇額。同一個 method 入面兩個相鄰嘅「額度不足」gate 用兩個唔同 code 會好難解釋。
> **例外**:非 ADMIN **帶 `budgetOverrideReason`** → 呢個真係權限問題 ⇒ **403**。

Message 要 actionable,帶實數:
`OpCo budget exceeded for SPE_E5: 120 assigned of 120 allocated. Raise the allocation or ask an admin to override.`

### D5 — Gate 位置:tenant seat gate **之前**

次序改成:… → `usageLocation` → **OpCo 預算(本 ADR,本地 DB)** → tenant seat(Graph) → Graph assign。

理由:本地查詢平過 Graph call;撞預算就唔使打 `getSubscribedSkus()`。兼且 OpCo 預算對操作員更 actionable。

### D6 — Audit

- Override 成功 → `AuditLog`,`action = ASSIGN`(既有)+ `metadata: { budgetOverride: true, reason, allocated, assignedBefore }`,`actorType: 'user'`。跟 ADR-0009 白名單原則,**reason 係人手輸入 → 當作可含 PII 處理**(ADR-0009 OQ-2 = P-B 已容許白名單含 PII)。
- 被擋 → **唔寫 AuditLog**(冇狀態改變),只 `logger.warn`(H4:唔 log UPN)。
- `RequestEvent(ASSIGN)` 嘅 message 喺 override 時要標明,令 request timeline 睇得出。

### D7 — 明文唔做

- **唔改** `reconcile.service.ts`(見 Context 🔴 節)。
- **唔改** allocation import(ADR-0004 invariant #5 原封)。
- **唔加** schema 欄位 —— 全部靠既有 `allocatedQuantity` / `assignedQuantity` + DTO 一個 optional string。
- **唔做**「預算唔夠自動轉 procurement path」。stage machine 已有 `REQUESTED → QUOTING → OPCO_APPROVED → AWAITING_VENDOR → READY`(`stage.service.ts:25-46`),但幾時行呢條路係**人手 triage 決定**,自動化係另一個 scope(H3)。

## Alternatives Considered

- **Option A:Grandfather 既有 22 行**(加 `budgetGateExemptUntil` 之類) — rejected(Chris)。要加 schema 欄(H1 範圍變大),而且豁免冇到期機制 → 實務上會變永久技術債,亦冇人知幾時該解除。
- **Option B:先修完數據,gate 之後至上** — rejected(Chris)。穩陣但要多一輪工;而且 D1 條件本身已經唔會因為歷史數據唔準而擋住未超嘅格,風險冇想像中大。**唔完全丟棄** —— 22 行 over-budget 仍然值得查成因(見 Consequences「後續」)。
- **Option C:只警告唔擋**(response 帶 warning) — rejected(Chris)。等同今日行為加可見度,唔係要求嘅 gate。優點係零 H1,但唔解決問題。
- **Option D:硬擋,完全冇 override** — rejected(Chris)。真實 onboarding 有急單;完全冇出口會令人繞過平台直接用 Graph / admin center 派 licence,**咁反而失去帳**(平台 ledger 同 audit 一齊斷),比受控 override 差。
- **Chosen:D1-D7** — 硬擋 + ADMIN 具名 override,零 schema,只擋進一步惡化。

## Consequences

- **Positive**
  - OpCo 預算首次成為**可執行嘅控制**,唔再係一個事後先睇到嘅紅字。
  - 超支變成一個**要人具名批准**嘅決定,而唔係一個冇人為意就發生嘅副作用。
  - 同 tenant seat gate 疊成兩層(OpCo 額 + tenant 座位),語意清晰:一個係「你哋部門有冇份額」,一個係「公司整體有冇位」。
  - 零 schema 改動 ⇒ 唔使 migration,rollback = 移走 gate 即可。

- **Negative**
  - 🔴 **上線即刻凍結 22 個 OpCo×SKU 組合**(dev DB 數字;UAT/prod 要重新量)。呢個係已知且已接受嘅代價,但**部署前必須先量目標環境嘅數字並通知操作員**,唔可以靜靜上。
  - **Race condition 未解**:gate check 喺 Graph assign 之前、DB transaction 之外。兩個操作員同一秒對同一 OpCo×SKU 派最後一格,兩個都可能過 gate → 超出 1 格。**刻意唔解**(§1.2 simplicity):窗口係數百 ms、要求同 OpCo 同 SKU 同時操作、後果係超 1 格而唔係數據損壞、而且既有 drift 偵測會捉到。若日後真係發生,再處理。
    > ⚠️ 唔可以「喺 transaction 內 re-check 然後 throw」—— Graph assign 喺 transaction **之前**已經執行,rollback DB 會造成「licence 派咗但 ledger 冇 +1」嘅真 drift,**比 race 本身更差**。
  - `allocated` 由「純顯示」變成「會擋人」⇒ 佢嘅**準確度**由「好睇啲」升級為**營運要求**。Excel↔平台 SSOT 嗰個未解嘅張力(`allocation-editing-and-drift-correction.md` §4.2)因此**變得更逼切**,但本 ADR 唔解決佢。
  - 文檔債:`DESIGN.md §5 line 100`「→ 顯示/反映」同 `allocation-editing-and-drift-correction.md` 多處「純顯示」講法,喺本 ADR Accepted 後會變 stale ⇒ **必須同步更新**(見 References)。

- **Neutral**
  - 對 n8n inbound / outbound 合約零影響。
  - 對 CH-008 嘅影響係**加強咗佢嘅必要性**,唔係衝突。
  - 對 ADR-0015(sync sweep)正交 —— 兩個都係 assign 前置條件,但一個關「用戶 ready 未」,一個關「有冇額」。

- **後續(唔屬本 ADR scope,但由佢揭出)**
  - 22 行 over-budget 應該查成因:係 allocated 舊,定真係超派?→ 建議獨立 data review,唔混入本實作。

## References

- 觸發:Chris 2026-07-26 提出「問題 2」後半(assign 前檢查可用量);拍板 **既有超支 = 只擋進一步惡化** · **硬擋 + ADMIN override**
- Locked 決策:`CLAUDE.md §5.1 H1`(ledger 兩層數字)
- `allocated` 語意原文:`docs/02-architecture/licenseops/DESIGN.md §5`(line 100)· `apps/api/prisma/schema.prisma:122-123`
- 現況實作:`assign.service.ts:127-132`(tenant seat gate)· `:148-187`(原子寫入)· `stage.service.ts:25-46`(procurement path)
- 相關 ADR:**ADR-0004**(allocation import;invariant 不變)· **ADR-0007**(ledger 手動管理 = override 之外嘅正路)· **ADR-0009**(audit 契約)· **ADR-0014**(assigned baseline —— 22 行超支嘅可能來源)
- 姊妹 ADR:**ADR-0015**(sync sweep)
- 扣連:**CH-008**(0/0 隱藏)· **DD-3**(冇 ledger create endpoint)
- **Accepted 後必須同步**:`DESIGN.md §5` line 100 · `docs/02-architecture/licenseops/allocation-editing-and-drift-correction.md`(多處「純顯示」)· `SYSTEM-SPEC-AND-SOW.md` §311
