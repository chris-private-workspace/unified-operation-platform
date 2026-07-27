---
phase: W36-opco-budget-gate
plan_ref: ./plan.md
status: active           # draft | active | closed
last_updated: 2026-07-27
---

# W36 — Checklist

> 由 `plan.md` §3 deliverables + §4 acceptance 衍生。每項 ≤ 1-2h。
> ⚠️ **全部鎖住** —— plan 仍係 `draft`,等 Chris approve + 答 **OQ1** 先開工(PROCESS R1)。

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
- [ ] 🚧 **BLOCKED — `AuditLog` 寫入**:ADR-0016 **D6 同 ADR-0009 白名單機制唔兼容**(`AUDIT_ACTIONS` 冇 `ASSIGN` · `AuditTargetType` 冇 line item / ledger · `AUDIT_METADATA_KEYS` 只有 4 個 ⇒ `budgetOverride`/`allocated`/`assignedBefore` 會被 `pickAuditMetadata` **靜靜丟棄**)。**等 owner 揀 A/B/C**,見 progress Day 1
- [x] Override 成功 → `RequestEvent(ASSIGN)` message 標明(帶 `assignedBefore/allocated` + reason 原文),令 request timeline 睇得出 —— **唔受 audit blocker 影響**,因為 `RequestEvent` 唔行白名單
- [x] 被擋 → 零 `AuditLog`(**目前自然成立**,因為 audit 寫入未落);**H4:錯誤訊息同 log 都唔含 UPN**

## F3 — 前端 override 入口【🚧 **OQ1 未答前唔開工**】

- [ ] 🚧 **等 OQ1** —— 選項 A(做,~3.5h)/ 選項 B(留下一個 change)
- [ ] (A)用**既有** `dialog.tsx` + `input.tsx` 收理由,零新 primitive
- [ ] (A)非 ADMIN **完全睇唔到**入口(proactive gate,同 `canSeeAdminNav` 同 pattern)
- [ ] (A)唔填理由唔可以 submit(前端鏡像後端)
- [ ] (A)錯誤訊息實數同 CH-009 顯示嘅**一致**
- [ ] (A)H6:零新色 / 零新 primitive / **light + dark 實看** / 仍然一 view 一 primary;跑 `ui-design`

## F4 — Test(H5)

- [x] `assign.service.spec.ts`:未超放行 / 剛好用盡擋 / **最後一格放行**(off-by-one)/ row 缺擋 / 訊息帶實數
- [x] **撞預算時 `getSubscribedSkus` 零 call**(證 D5 位置,唔止證 400)
- [x] Override:ADMIN 成功 / **OPCO_IT 帶 reason 403** / **REGIONAL 帶 reason 403** / 純空白 reason 400 / timeline message 帶 reason
- [x] ➕ **override 唔繞過其他 gate**(spec 冇明列但係真風險):唔繞過 **tenant seat gate** · 唔繞過 **Phase 1 sync gate**
- [ ] 🚧 audit assertion —— 隨上面 audit blocker
- [x] Graph + ServiceNow **全 mock**,零真 tenant(§3.4)
- [x] api test **403 passed / 41 suites**(基線 390,+13)+ lint(api)**零 output**

## F5 — 部署前置

- [ ] 可重跑 SQL 落 `docs/05-usage/`:列 `assigned >= allocated` + overage + **SKU active 狀態**
- [ ] SQL 喺 dev 真跑,輸出對得返 plan §2(**22 total / 16 active**)
- [ ] Runbook 段:上線前跑 → 交操作員 → 講明出路(加 allocated / 具名 override)
- [ ] 🔴 寫明 **OQ2 流程斷點**:procurement 完成後仍要人手加 `allocated`,否則買咗都 assign 唔到

## Verification(phase 級)

- [ ] **live 只驗拒絕路徑** —— 造一個「剛好用盡」嘅格(scratch DB 或 dev PATCH **並還原 + 貼還原證據**),對照 ADMIN / OPCO_IT / REGIONAL 三個角色
- [ ] ⚠️ **絕不打真 Graph 完成 assign**(R6)—— 拒絕發生喺 Graph call 之前,所以 live 驗零 vendor 流量;assign 成功那半只靠 mock test
- [ ] `reconcile.service.ts` **diff 為空**(R5)
- [ ] ADR-0016 每個 Decision 逐條對過,冇靜靜偏離;有偏離 → plan changelog + 問 owner

## Cross-Cutting

- [ ] Daily commit 對應 `progress.md` Day-N(R2)
- [ ] Conventional Commits + scope(`feat(fulfilment):` / `test(fulfilment):` / `docs(deploy):`)
- [ ] **零 schema 改動** —— 若發現要改 → **STOP** 問 owner(H1 會重新觸發)
- [ ] **零新 dependency**(H2)
- [ ] `BACKLOG.md` 同步(R7)
- [ ] `RISK_REGISTER` —— 若 R1/R2 演化成真風險則登記
- [ ] `progress.md` closeout + status → `closed`

---

**Lifecycle reminder**:本 checklist 隨 plan 衍生。新項目必須先入 plan + changelog,再加落此。
