---
phase: W36-opco-budget-gate
plan_ref: ./plan.md
status: closed           # draft | active | closed
last_updated: 2026-07-27
---

# W36 — Checklist

> 由 `plan.md` §3 deliverables + §4 acceptance 衍生。每項 ≤ 1-2h。
> ✅ **CLOSED**(2026-07-27)—— F1–F5 全交付。唯一未閉環項已交接落 runbook 步 4(部署後檢查),見 Verification 段。

## F1 — Backend gate

- [x] `assign.service.ts`:gate 加喺 `usageLocation` 之後、**`getSubscribedSkus()` 之前**(D5)
- [x] 條件 `assigned + 1 > allocated`;**ledger row 唔存在 = allocated 0 ⇒ 擋**(D1)
- [x] 用 `+1` 而唔係 `+ lineItem.quantity`(既有 increment 行為**唔改**)
- [x] 400 message 帶實數 + 出路
- [x] 🔴 **`reconcile.service.ts` diff 為空**(`git diff --stat HEAD` 零 output 為證,R5)

## F2 — Override + audit

- [x] `AssignLineItemDto` 加 `budgetOverrideReason?: string` + `@MinLength(10)`;service 再 trim 擋純空白(DTO 擋唔到 10 個空格)
- [x] 非 ADMIN 帶該欄 → **403**(唔靜靜忽略)
- [x] `OPCO_IT` / `REGIONAL` 撞預算 → **一律 400,零 override 路徑**(D3)
- [x] ~~🚧 BLOCKED~~ **`AuditLog` 寫入 — 已解**(owner 揀 **選項 A**,2026-07-27):`audit-fields.ts` 加 action **`assign.budget_override`** + target **`RequestLineItem`**(白名單 `[]`)+ metadata key `budgetOverride`/`allocated`/`assignedBefore`;寫入喺 assign **同一個 transaction**(ADR-0009 D8.1)。偏離 ADR-0016 D6 已入 plan changelog(R3)
- [x] 「帶咗理由」≠「發生咗 override」:只有 `overBudget && reason` 先寫 audit / 標 timeline(否則 R4 嘅 override 次數會被非事件灌水)
- [x] Override 成功 → `RequestEvent(ASSIGN)` message 標明(帶 `assignedBefore/allocated` + reason 原文),令 request timeline 睇得出 —— **唔受 audit blocker 影響**,因為 `RequestEvent` 唔行白名單
- [x] 被擋 → 零 `AuditLog`(**目前自然成立**,因為 audit 寫入未落);**H4:錯誤訊息同 log 都唔含 UPN**

## F3 — 前端 override 入口【OQ1 = **選項 A**,已做】

- [x] **OQ1 已答 = A**(Chris 2026-07-27)
- [x] 用**既有** `dialog.tsx` + `input.tsx` + `button.tsx`,**零新 primitive / 零新 token**
- [x] 非 ADMIN **完全睇唔到**入口 —— 新 predicate `canOverrideBudget`(刻意唔複用 `canSeeAdminNav`,理由同 `canRepairOutbound` 一樣:兩個問題唔同,合併就會一改郁兩樣)
- [x] 入口**只喺冇 headroom 時**出現 —— 一個成日喺度嘅 override 就會變成日常派 license 嘅方法(R4)
- [x] 唔填理由唔可以 submit;`overrideReasonError` 鏡像後端兩條規則(`@MinLength(10)` + service `trim`)
- [x] **刻意唔 disable「Assign now」** —— `exhausted` 來自 cached ledger,用 client 數字擋正路 = stale 數字會封死一個合法 assign。錯咗最多多一粒掣,唔會錯 assign
- [x] 錯誤訊息:dialog 顯示 `assigned/allocated` → `assigned+1/allocated`,同 CH-009 同一組數(live 見 `0/0` → `1/0`)
- [x] Dialog 寫明 **OQ2 出路**(買 licence 唔會自動加 allocated → 去 License assets 改)
- [x] 失敗**唔閂 dialog**,理由保留(live 驗:400 之後 input 仍係原文)
- [x] H6 / `ui-design` 自檢:DS-1~10 + DS-12 ✅;**DS-11 部分**(prototype 冇 budget-override 畫面,同 CH-009 一樣;Dialog 本身係 handoff `feedback/Dialog.jsx` 重建)。**light + dark 都實看過**(截圖已交 owner)

## F4 — Test(H5)

- [x] `assign.service.spec.ts`:未超放行 / 剛好用盡擋 / **最後一格放行**(off-by-one)/ row 缺擋 / 訊息帶實數
- [x] **撞預算時 `getSubscribedSkus` 零 call**(證 D5 位置,唔止證 400)
- [x] Override:ADMIN 成功 / **OPCO_IT 帶 reason 403** / **REGIONAL 帶 reason 403** / 純空白 reason 400 / timeline message 帶 reason
- [x] ➕ **override 唔繞過其他 gate**(spec 冇明列但係真風險):唔繞過 **tenant seat gate** · 唔繞過 **Phase 1 sync gate**
- [x] audit assertion:action/target/actor · **captured metadata 過真 `pickAuditMetadata` 唔被丟棄**(呢條就係 blocker 本身嘅回歸網)· `before`/`after` 為空(零 PII 擴大)· **收 `tx` 唔收 `prisma`**(D8.1)· 被擋零 audit · 平常 assign 零 audit · 未超預算帶 reason 零 audit
- [x] Graph + ServiceNow **全 mock**,零真 tenant(§3.4)
- [x] api test **410 passed / 41 suites**(基線 390,**+20**)+ lint(api)**零 output**
- [x] F3 前端 test:`overrideReasonError` 6 條(空 / 純空白 / 太短 / **剛好 10 同 9 兩邊界** / trim 後量度)· `canOverrideBudget` 3 條(含 **REGIONAL 刻意排除**)· **PATCH body 形狀** 3 條(平常 assign 仍然**冇 body** / 帶 reason / 兩者並存)—— body 嗰組守嘅係:一個「永遠帶住」嘅欄會令**每個 OPCO_IT assign 403**
- [x] web test **180 passed / 21 files**(F2 前 167 → **+13**)+ lint(web)零 output + `tsc --noEmit && vite build` 過

## F5 — 部署前置

- [x] 可重跑 SQL:`docs/05-usage/sql/opco-budget-gate-preflight.sql`(唯讀,四段:summary / 會被擋嘅組合 / **冇 ledger row 但有 pending line item** / **重複 part number**)
- [x] SQL 喺 dev 真跑 —— **對唔返 plan §2,而係捉到 plan 錯咗**:22 total ✅ 但 inactive 係 **12 唔係 6** ⇒ active **10 唔係 16**。已修正 §2 + changelog(R3)
- [x] ➕ SQL 一律輸出 **`skuId` GUID**(§13)—— 因為 dev 實測 `SPE_E3` / `STANDARDPACK` **各有兩個 catalog row**;淨睇 part number 會讀成「E3 唔使理」,但其實有另一個 active 嘅 E3
- [x] ➕ 第 [3] 段:**冇 ledger row 但有 pending line item**(plan 完全冇計過嘅一類,D1 之下最嚴重 —— 每次 assign 都擋)
- [x] Runbook `docs/05-usage/OPCO-BUDGET-GATE-ROLLOUT.md`:上線前跑 → 逐行點處理 → 交操作員 → 兩條出路(加 allocated / 具名 override)+ override 唔係捷徑 + override 唔放行任何其他 gate
- [x] 🔴 寫明 **OQ2 流程斷點**:procurement 完成後仍要人手加 `allocated`,否則買咗都 assign 唔到;並明講「唔指定人就冇人做」
- [x] 🔴 Runbook 步 4 = **部署後第一項檢查**(接住 F3 驗唔到嗰半:UAT 有真 synced user 先驗得到 gate 嘅 400 + 事後零副作用抽查)
- [x] Runbook 明講**唔可以引用 dev 數字**,並老實標明 dev 22 行入面有 6 行係 `test-e3`/`test-e1` 測試 fixture

## Verification(phase 級)

- [x] **live 只驗拒絕路徑** —— **唔使造格**:dev DB 已有兩條 READY line item **冇 ledger row**(allocated 0 ⇒ D1 必擋),所以**零 DB 改動、零還原風險**
  - [x] ADMIN + 太短理由 → **400**(DTO `@MinLength`)
  - [x] ADMIN + 12 個空格 → **400**「cannot be blank」(證 DTO 擋唔到、service `trim` 先擋到)
  - [x] **REGIONAL + 合法理由 → 403「Only an admin may override the OpCo budget」**,而**同一 actor 同一 endpoint 唔帶該欄 → 400** ⇒ 403 真係嚟自 override 規則,唔係 endpoint 權限
  - [x] Browser A/B:同一條 line item,**ADMIN 見 `Assign now` + `Override budget`;REGIONAL 只見 `Assign now`**(全頁零 Override 掣)
  - [x] Dialog:空理由 Confirm **disabled** → 打 `urgent` 仍 disabled + 顯示「At least 10 characters」→ 合法理由 **enabled**;light + dark 都睇過
  - [x] 端到端 wire:Confirm → PATCH **400** → toast 逐字顯示 backend 訊息 → **dialog 冇閂、理由保留**
  - [x] 事後 DB 抽查:line item 仍 `READY`、`assignedAt` 空、`assign.budget_override` audit **0 行**、無新 ledger row ⇒ **零副作用**
- [x] 🚧→✅ **budget gate 本身嘅 400 喺 dev live 驗唔到**,**已交接**:D5 把 gate 放喺 `graph.findUser` **之後**,而 seed 嘅 UPN 唔存在於真 tenant ⇒ 永遠停喺「Target user not found」。**唔用真人 UPN 硬闖**(一旦 gate 有 bug 就會真派 licence 畀真人 = R6 本體)。⇒ 依賴 F4 mock test,**已寫入 runbook 步 4 做部署後第一項檢查**(含事後零副作用抽查 + 唔對就回滾)
- [x] ⚠️ **絕不打真 Graph 完成 assign**(R6)—— 全程零 `assignLicense`;只有 `findUser` 讀取(read-only,而且返 not-found)
- [x] `reconcile.service.ts` **diff 為空**(R5)
- [x] **ADR-0016 D1–D7 逐條核對完成**(見 progress Day 5 表)—— **一處偏離 = D6**,已 owner approved + plan changelog;其餘六條逐字相符

## Cross-Cutting

- [x] Daily commit 對應 `progress.md` Day-N(R2)—— Day 0/1/2/3/4/5 各有 hash
- [x] Conventional Commits + scope(`feat(fulfilment)` / `feat(audit)` / `feat(web)` / `docs(deploy)` / `docs(planning)`)
- [x] **零 schema 改動** —— `apps/api/prisma/schema.prisma` 全 phase diff **0**
- [x] **零新 dependency**(H2)—— 三個 `package.json` 全 phase diff **0**
- [x] `BACKLOG.md` 同步(R7)—— W36 行 + `Budget-gate` 收官 + CH-008 R1 升級 + 路線更新 + **TD-1** 技術債登記
- [x] `RISK_REGISTER` —— **新增 R4**:`allocated` 由顯示數字變成會擋人嘅 gate,但**冇任何自動流程令佢跟上現實** ⇒ 最短路徑係 override 而唔係改數字,長期會令 gate 名存實亡。三項 mitigation **全屬程序性、零技術強制**,故 status ⚠️ Open。**R3 狀態不變**(仍 ⚠️ Open,mitigation = ADR-0015 未實作)
- [x] `progress.md` closeout + status → `closed`

---

**Lifecycle reminder**:本 checklist 隨 plan 衍生。新項目必須先入 plan + changelog,再加落此。
