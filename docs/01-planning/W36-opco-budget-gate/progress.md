---
phase: W36-opco-budget-gate
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: draft           # draft | active | closed
---

# W36 — Progress

> Daily log + retro。每 commit 對應一個 Day-N entry(R2)。

---

## Day 0 — 2026-07-27:Phase 開單(**draft**,等 approve + OQ1)

**Action**:ADR-0016 Accepted(2026-07-26)後開 phase。plan / checklist / progress 三件齊,**全部鎖住**,等 Chris approve 並答 **OQ1**(前端 override 入口做唔做)。

### Grounding — 重量目標環境(ADR-0016 明文要求)

```
total 148 | alloc_zero 0 | at_or_over 22 | strictly_over 20
```

同 ADR 起草時**一致**。但逐行核對 22 個組合之後有一個**精確化**:

| | 數 |
|---|---|
| `assigned >= allocated` | **22** |
| 其中 SKU `active = false`(`VISIO_PLAN1` ×3 · `WIN_DEF_ATP` ×3) | **6** |
| ⇒ **真正會被凍結嘅 active 組合** | **16** |

理由:`intake.service.ts:57-60` 拒 inactive SKU ⇒ 嗰 6 個組合永遠唔會有新 line item 要 assign,撞唔到本 gate。**ADR-0016 寫「22 行」係上界,實際影響面 16。** 呢個唔改 ADR(Accepted 唔改內容),但 F5 runbook 要按 16 講。

Overage 最大 8(`RTMAP/POWERAUTOMATE_ATTENDED_RPA` 36→44 · `RKR/STANDARDPACK` 89→97 · `PFU-HK/SPE_E3` 108→116 · `RCN/Microsoft_365_Copilot` 51→59);最小 0(`RKR/Microsoft_365_Copilot` 38/38 = 剛好用盡,下一次 assign 就會係第一個被擋嘅)。

### 🔴 Grounding 揪出一個 ADR 冇處理嘅流程斷點(OQ2)

預算爆 → 操作員行 procurement path 買 licence → stage 推到 READY → **assign 仍然撞同一個 gate**,因為 `allocatedQuantity` 冇因為「買咗」而增加。

⇒ **「買咗都 assign 唔到」**,除非 ADMIN 手動 `PATCH /license/ledger/:id` 加 allocated(ADR-0007 正路)。

本 phase **唔自動化**(會掂 ADR-0004 嘅「Excel 定平台係 allocated SSOT」未解張力),但**必須喺 F5 runbook + F3 錯誤訊息寫明出路**,唔可以留一個 dead end 畀操作員自己撞。已入 plan §5 OQ2 + §6 R2。

### F3 係 OQ 嘅原因

ADR-0016 **完全冇講前端**。若只做 F1+F2,ADMIN 嘅 override 只能經 `/docs/api` ⇒ 實務上等於冇 override,而 ADR D3 反對「完全冇出口」嘅理由(逼人繞過平台直接用 Graph → 平台 ledger 同 audit 一齊斷)就會部分重現。⇒ 建議選項 A(做),但係 owner 嘅 scope 決定。

### Branch 決定

Branch `docs/w36-budget-gate` **off `feat/ch-009-assign-capacity`**(唔係 main)—— 因為 F3(若做)會改同一個 `request-detail.tsx`,而 CH-009 PR #29 仍 open。CH-009 merge 之後 rebase 落 main。

### Blockers

- **plan 未 approve**(`draft`)→ 依 R1,一行 code 都唔寫
- **OQ1 未答** → F3 scope 未定(phase 估算 8.5h[不含 F3] vs 12h[含])

**Commit**:`095aa8e` — `docs(planning): W36 plan — ADR-0016 落地(OpCo 預算 gate)`

---

## Day 1 — 2026-07-27:plan approved(OQ1 = A)· **F1 + F2(非 audit)+ F4 gate test 完成** · 🔴 audit blocker

Chris 答 **OQ1 = 選項 A**(前端 override 入口做)⇒ plan `draft → active`。

### 完成

| | 內容 |
|---|---|
| **F1** | `assign.service.ts` OpCo 預算 gate,位置喺 `usageLocation` 之後、**`getSubscribedSkus()` 之前**(D5);`assigned + 1 > allocated` → 400 帶實數 + 出路;ledger row 缺 = allocated 0 ⇒ 擋(D1) |
| **F2**(非 audit) | `AssignLineItemDto` 加 `budgetOverrideReason`(`@MinLength(10)` + service trim 擋純空格);非 ADMIN 帶欄 → **403**;`RequestEvent` message 帶 `assignedBefore/allocated` + reason 原文 |
| **F4**(gate 部分) | `assign.service.spec.ts` **21 → 34 test** |

**Gate(真 output)**:api **403 passed / 41 suites**(基線 390,+13)· api lint **零 output** · 🔴 **`reconcile.service.ts` diff 為空**(`git diff --stat HEAD` 零 output = R5 守住,對帳方案甲原封)。

### 兩個 spec 冇明列但我加咗嘅 test

`override 唔繞過 tenant seat gate` + `override 唔繞過 Phase 1 sync gate`。理由:override 係**淨係**畀 OpCo 預算用嘅;一個會順手放行 sync gate 或 seat gate 嘅 override,比佢解決嗰個問題**更嚴重**。

### 既有 test 撞爛 → 修法

加 gate 之後既有 21 條紅咗 11 條,成因唔係邏輯錯而係 **mock prisma 冇 `opcoSkuLedger`**(`TypeError: undefined.findUnique`)。修:mock 加 `opcoSkuLedger.findUnique` + `arrangeHappy` 餵一個有 headroom 嘅 row + 三個 actor 加 `role`(override 靠 role 判斷,原本 actors 冇呢個欄)。修完 21/21 回復,再加 13 條新嘅。

### 🔴 BLOCKER — ADR-0016 **D6 同 ADR-0009 白名單機制唔兼容**

逐字核對 `audit-fields.ts` 之後發現 D6 三個假設全部唔成立:

| D6 假設 | 實情 |
|---|---|
| `action = ASSIGN`「既有」 | ❌ `AUDIT_ACTIONS` **根本冇** `ASSIGN`(只有 user./auth./opco./catalog./allocation.import/drift.resolve/outbound./connector.) |
| target 可以係 line item | ❌ `AuditTargetType` 冇 `RequestLineItem` / `OpcoSkuLedger` |
| `metadata: { budgetOverride, reason, allocated, assignedBefore }` | ❌ `AUDIT_METADATA_KEYS` 只有 `reason`/`correlationId`/`source`/`emailAttempted` ⇒ 其餘三個會被 `pickAuditMetadata` **靜靜丟棄** |

⇒ 照 D6 字面寫,結果係 **audit 只留低 `reason`,其餘無聲消失** —— 正正係 `audit-fields.ts` 檔頭設計要防嘅「白名單 = 唯一 enforcement point」。呢個係我起草 ADR-0016 時冇逐字核對 audit 契約造成。

**三個選項(等 owner 揀)**:

| | 做法 | 代價 |
|---|---|---|
| **A(建議)** | 擴白名單:`AUDIT_ACTIONS` 加 `ASSIGN_BUDGET_OVERRIDE: 'assign.budget_override'` · `AuditTargetType` 加 `RequestLineItem`(白名單 **`[]`** = event-only,跟 `OutboundFailure` 先例,唔複製 UPN 入 audit)· `AUDIT_METADATA_KEYS` 加 `budgetOverride`/`allocated`/`assignedBefore` | 掂 ADR-0009 Decision 5,而 `audit-fields.ts` 檔頭明文「adding a line here is a **privacy decision**」⇒ **要 owner 批**。但加嘅三個 key **全部係非 PII 嘅數字 / boolean**,實質 privacy 風險為零 |
| B | 只用既有 `reason` key,把數字塞入字串(`"[budget override 12/12] RHK urgent hire…"`) | 零白名單改動,但數字**查唔到**、污染 `reason` 語意 |
| C | 唔寫 `AuditLog`,只靠已實作嘅 `RequestEvent` | 違 ADR-0016 D6 明文,而且 `/admin/audit` **查唔到 override** |

**我建議 A**,決定性理由:`assign.budget_override` 做獨立 action,`/admin/audit` 先可以 filter 出「所有 override」—— 而呢個正正係 ADR-0016 **R4(override 被當日常操作)** 唯一嘅監控手段。B / C 都令「查所有 override」做唔到。

**未做**:F2 audit(blocked)· F3 前端 · F5 runbook。

**Commit**:`<hash>` — F1 + F2(非 audit)+ F4 gate test

---

## Retro(填於 closed)

_(待實作)_
