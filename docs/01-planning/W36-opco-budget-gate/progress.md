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

**Commit**:`845863c` — `feat(fulfilment): W36 F1+F2 — OpCo 預算 assign gate + ADMIN 具名 override(ADR-0016)`

---

## Day 2 — 2026-07-27:**audit blocker 解除(owner 揀 A)** · F2 收齊

Chris 揀 **選項 A** ⇒ 擴 ADR-0009 白名單。呢個係 **ADR-0009 Decision 5 範圍內嘅 privacy decision**,所以要 owner 批,已批。

### 白名單改咗咩(`audit-fields.ts`,三處)

| 位置 | 加入 | 為咗 |
|---|---|---|
| `AUDIT_ACTIONS` | `ASSIGN_BUDGET_OVERRIDE: 'assign.budget_override'` | **獨立 action** 係 `/admin/audit` filter「所有 override」嘅唯一手段 = ADR-0016 **R4** 唯一監控面。boolean 埋喺一個繁忙 action 嘅 metadata 裡面唔算監控面 |
| `AuditTargetType` + 白名單 | `RequestLineItem: []` | **event-only,跟 `OutboundFailure` 先例**。line item 掛住嘅 request 帶 target UPN,複製入 audit 等於把 PII 搬去一個**唔同讀權限**嘅表(audit 係 ADMIN-only) |
| `AUDIT_METADATA_KEYS` | `budgetOverride` · `allocated` · `assignedBefore` | 令 audit row 自己答得出「超幾多」,唔使 join 返一個讀嘅時候已經變咗嘅 ledger。三個**全部非 PII**(一 boolean + 兩個 seat 數) |

**偏離 ADR-0016 D6 已入 plan changelog(R3)** —— ADR Accepted 唔改內容(§6),所以修正記喺 plan + 本 log + code 註釋三處。

### 寫入位置 = assign **同一個 transaction**

`this.audit.log(tx, …)`,唔係 `prisma`。ADR-0009 **D8.1**:audit row 同佢描述嘅操作要一齊成功一齊失敗,「做咗但冇紀錄」正正係整個 audit trail 存在嘅理由。有一條 test 專門 assert 收到嘅 handle **`toBe(tx)`** 而 **`not.toBe(prisma)`** —— 呢個唔係形式主義,傳錯 handle 係一個完全睇唔出嚟嘅 bug。

### 順手揪出一個我 Day 1 寫錯嘅語意

Day 1 版本用 `overrideReason ?` 判斷要唔要標 override。但 **ADMIN 可以喺完全未超預算嘅 assign 帶理由** —— 咁樣 timeline 會報一個從未發生過嘅 override,而 **R4 靠嘅「override 用得幾密」會被非事件灌水**。改成 `budgetOverridden = overBudget && !!overrideReason`,timeline + audit 兩邊共用。加咗 test。

另外補咗 D6 明文要求嘅 **被擋 `logger.warn`**(H4:只有 ids + counts,**零 UPN**)。

### 最重要嘅一條 test

`every field survives the ADR-0009 whitelist` —— 把 service **實際傳出去**嘅 metadata 餵落**真嘅** `pickAuditMetadata`,assert 四個 key 全部生還。

理由:呢個 blocker 嘅本質係「payload 完全正確,但被白名單靜靜丟棄」。若只 assert `audit.log` 收到咩 args,test **會全綠而 DB 裡面只有 `reason`** —— 即係我 Day 1 差啲 commit 出去嘅嗰個狀態。呢條 test 就係嗰個坑嘅回歸網。

### Gate(真 output)

| | 結果 |
|---|---|
| api test | **410 passed / 41 suites**(Day 1 = 403,基線 390 ⇒ **+20**) |
| `assign.service.spec.ts` | **41 test**(Day 1 = 34) |
| api lint | **零 output**(先紅過一次,純 prettier 換行,已修) |
| 🔴 `reconcile.service.ts` | **diff 仍然為空**(R5 守住) |

⚠️ 一個 false alarm 記落嚟:`npx jest` 喺 **repo root** 跑會撞 root babel config ⇒ `import type` 直接 SyntaxError。**唔係 code 壞**,係 cwd 錯。要喺 `apps/api` 跑。

**未做**:F3 前端 override 入口(OQ1 = A 已批)· F5 部署 runbook + SQL · live 拒絕路徑驗。

**Commit**:`8534452` — `feat(audit): W36 F2 — budget override 入 AuditLog(擴 ADR-0009 白名單,owner approved)`

---

## Day 3 — 2026-07-27:**F3 前端 override 入口完成 + live 拒絕路徑驗**

### 設計上三個唔顯然嘅決定

| | 決定 | 點解 |
|---|---|---|
| **入口只喺冇 headroom 時出現** | `mayOverride && canAssign && budget.exhausted` | 一個成日喺度嘅 override 掣,就係「派 license 嘅第二個正常方法」—— 正正係 **R4** 講嗰件事 |
| **刻意唔 disable「Assign now」** | 正路照舊可撳 | `exhausted` 來自 **cached** ledger。用 client 數字擋正路 = 一個 stale 數字可以封死一個合法 assign;而 `capacity.ts` 檔頭本身寫住「backend 係唯一權威」。判斷錯最多多一粒掣,唔會錯 assign |
| **新 predicate `canOverrideBudget`** | 唔複用 `canSeeAdminNav`(今日同值) | 跟 `canRepairOutbound` 已立嘅先例:「可唔可以開 admin console」同「可唔可以超支」係兩個問題,夾埋一個就會一改郁兩樣 |

Dialog 另外寫咗 **OQ2 出路**(買 licence 唔會自動加 allocated → 去 License assets 改)。唔寫嘅話,啱啱行完 procurement 嘅人只會學識「撳 override」,永遠唔知要改嘅係 allocation。

### Live 驗證 —— 意外收穫:唔使造格

原本 plan 寫「dev PATCH 造一個剛好用盡嘅格再還原」。查 dev DB 之後發現**唔使**:已經有兩條 READY line item **完全冇 ledger row**(allocated 0 ⇒ D1 必擋)。⇒ **零 DB 改動、零還原風險**。

| 驗證 | 真 output |
|---|---|
| ADMIN + `"urgent"` | **400** `budgetOverrideReason must be longer than or equal to 10 characters`(DTO) |
| ADMIN + 12 個空格 | **400** `cannot be blank — the reason is what makes the override auditable`(**證 DTO 擋唔到、service `trim` 先擋到**) |
| **REGIONAL + 合法理由** | **403** `Only an admin may override the OpCo budget` |
| **REGIONAL 同一 endpoint 唔帶該欄** | **400**(findUser)⇒ **403 真係嚟自 override 規則,唔係 endpoint 權限**。冇呢個對照組,上面條 403 咩都證明唔到 |
| Browser A/B(同一條 line item) | ADMIN → `Assign now` + `Override budget`;**REGIONAL → 只有 `Assign now`**,全頁零 Override 掣 |
| 三路判別 | 有 headroom(36/43)→ 冇 Override · 冇 allocation 但唔係 READY → 冇 Override · 冇 allocation + READY → **有** Override |
| Dialog | 空 → Confirm disabled · `urgent` → 仍 disabled +「At least 10 characters」· 合法 → enabled;`0/0` → `1/0` mono;**light + dark 都睇過** |
| 端到端 | Confirm → PATCH **400** → toast 逐字顯示 backend 訊息 → **dialog 冇閂、理由保留** |
| 事後 DB | line item 仍 `READY` · `assignedAt` 空 · `assign.budget_override` audit **0 行** · 無新 ledger row ⇒ **零副作用** |

`/me` 兩次都真驗過(run-as 生效 = `REGIONAL`,還原後 = `ADMIN`)—— memory 記低過 inactive user 會**靜靜 fallback 去 ADMIN**,唔驗 `/me` 就會攞住一個假對照組落結論。run-as 只傳 shell env,**冇改 `.env`**(§4.4)。

### 🚧 一個驗唔到嘅嘢,唔當佢驗到

**budget gate 本身嘅 400 喺 dev live 驗唔到。** D5 把 gate 放喺 `graph.findUser` **之後**,而 seed 嘅 UPN 唔存在於真 tenant ⇒ 永遠停喺「Target user not found」,行唔到落去。

用真人 UPN 硬闖係做得到嘅,但**唔做**:嗰個做法一旦 gate 有 bug,就會**真派一個 licence 畀一個真人** —— 即係 R6 本體。⇒ 呢半截依賴 F4 嘅 mock test,並**移入 F5 runbook 做部署後第一項檢查**(UAT 有真 synced user)。

### Gate(真 output)

web **180 passed / 21 files**(F2 後 167 → **+13**)· web lint 零 output · `tsc --noEmit && vite build` 過 · `reconcile.service.ts` diff 仍為空。

**未做**:F5 runbook + SQL · ADR-0016 Decision 逐條 closeout 核對。

**Commit**:`e796c80` — `feat(web): W36 F3 — ADMIN 前端 budget override 入口(ADR-0016 D3,OQ1 = A)`

---

## Day 4 — 2026-07-27:**F5 preflight SQL + rollout runbook** · SQL 真跑捉到 plan 自己錯

交付兩件:`docs/05-usage/sql/opco-budget-gate-preflight.sql`(唯讀,可重跑)+ `docs/05-usage/OPCO-BUDGET-GATE-ROLLOUT.md`。

### 🔴 「SQL 真跑要對得返 §2」呢條 acceptance 做到嘢 —— 佢捉到嘅係 plan

| | plan §2 寫 | SQL 真跑 |
|---|---|---|
| `assigned >= allocated` | 22 | **22** ✅ |
| 其中 inactive | 6 | **12** ❌ |
| ⇒ active 影響面 | 16 | **10** ❌ |

成因:Day 0 點算時只當 `VISIO_PLAN1` / `WIN_DEF_ATP` 係 inactive,漏咗 `SPE_E3` / `STANDARDPACK` **各自都有一個 inactive 嘅 catalog row**。

⇒ 順藤摸到更根本嗰件事:**`skuPartNumber` 唔係唯一鍵**。dev 有兩個 `SPE_E3`、兩個 `STANDARDPACK`(各一 active 一 inactive,唔同 `skuId`)。正正係 CLAUDE.md **§13「一律 `skuId` GUID,唔信 part number」**嗰條規矩,而我第一版 SQL 就係只出 part number ⇒ 一個操作員讀到「SPE_E3 — inactive,唔使理」會**漏咗處理另一個 active 嘅 E3**。已改成一律出 `skuId`,並加多一段 [4] 專門列出「一個 part number 幾多個 catalog row」。

老實補一筆:嗰兩個 inactive 嘅 `skuId` 係 **`test-e3` / `test-e1`** = dev 測試 fixture,唔係真 legacy 訂閱 ⇒ **dev 嗰 22 行入面有 6 行係假數**。所以 runbook 明文寫死「唔可以引用 dev 數字,一定要喺目標環境自己跑」。

### 第二個發現:plan 完全冇計過嘅一類

原本 grounding 只掃**已存在**嘅 ledger row。但 D1 之下,**完全冇 ledger row** 嗰啲組合先係最嚴重 —— allocated 0 ⇒ **每一次** assign 都擋,唔止「下一次」。dev 有 3 個組合(全部 PFU-Asia)、共 4 條 pending line item 中招,而佢哋喺原本嘅 22 行名單裡面**完全隱形**。已入 SQL 第 [3] 段。

呢個同 **DD-3**(冇 ledger create endpoint)扣埋一齊就係一個死結:gate 一開就 assign 唔到,而 assign 正正係唯一會 upsert 出 ledger row 嘅路徑 ⇒ **只能靠 import 建**。runbook 步 2 已寫死。

### Runbook 內容

四步:目標環境跑 SQL → 逐行決定點處理(三種情況各有出路)→ 通知操作員 → **部署後第一項檢查**。

最後一步就係接住 Day 3 驗唔到嗰半:gate 嘅 400 要有**真 synced user** 先驗得到,所以寫成部署後動作,連「驗完即刻查:仍 READY / `assignedAt` 空 / 零 audit row / tenant 冇多咗 assignment,任何一項唔對即回滾」都寫埋。

另外兩段刻意寫得重:**override 唔係加 allocation 嘅捷徑**(R4,並指明 `/admin/audit` filter `assign.budget_override` 要定期睇)· **買咗 licence 唔會自動加 allocated**(OQ2;並明講「唔指定人負責,呢步就會冇人做,然後大家學識用 override 頂住,直到 allocated 完全失去意義」)。

**未做**:ADR-0016 Decision 逐條 closeout 核對 · BACKLOG 同步 · phase closeout。

**Commit**:`<hash>` — F5 preflight SQL + rollout runbook

---

## Retro(填於 closed)

_(待實作)_
