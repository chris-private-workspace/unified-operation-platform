---
change_id: CH-010
spec_ref: ./spec.md
status: done             # blocked | ready | in-progress | done
last_updated: 2026-07-29
---

# CH-010 — Checklist

> Atomic checkbox items derived from `spec.md §3` acceptance criteria。
> ✅ **收官**(2026-07-29)。一項 🚧 未做且**唔喺本 repo**(n8n 2004),已標明理由 + target。

## Gate 0 — 開工前必須有嘅答案 ✅ 全部已解決

- [x] **OQ-1** 🔴 close 晒 catalog task 之後 RITM 會唔會自動 advance? → ✅ **Chris**:「UOP 只需處理 catalog task 嘅狀態就足夠,**RITM 由 ServiceNow workflow 處理**」⇒ **方案 B 成立**
- [x] **OQ-2** 🔴 帳號有冇 `sc_task` **寫**權? → ✅ **有**(admin 權限帳號)。⚠️ 順帶揭出 least-privilege 缺口 → 轉 **DEPLOY-harden**,唔喺本 change 做
- [x] **OQ-3** `sc_task.state` 值域 → ✅ 800 筆真數據反推:`3` ×595(**全 inactive**)· `7` ×151 · `1` ×24(**全 active**)· `4` ×24 · `-5` ×4 · `2` ×2 ⇒ **close 寫 `3`、hold 寫 `2`**。`sys_choice` 即使 admin 都 403 = table-level 限制
- [x] **OQ-4** 認邊張 task → ✅ **「唯一 `active=true` 嗰張」**。772 張 RITM:總 task 數 1/2/3 張分別係 745/26/1,但 **active task 數只有 0 或 1,零反例**。`sys_class_name` 全同、`order` 全空 ⇒ 兩者都做唔到識別;`assignment_group` 唔用(會綁死 group id)
- [x] **OQ-5** RITM `stage` 使唔使掂 → ✅ **唔使**,併入 OQ-1 答案
- [x] 答案寫入 `SERVICENOW-CONTRACT-ALIGNMENT.md` 🅖-2 + ADR-0018 §Open Questions
- [x] ADR-0018 `Proposed → Accepted`
- [x] 測試對象 → ✅ **Chris 授權 dev instance 自由揀 request 記錄**(G8 解除)。⚠️ 仍然:改前記低 before-state、改後報清楚改咗邊張;**close 未必還原得返**
- [x] Chris approve 本 spec → ✅ `proposed → approved`(2026-07-29)

## Implementation

### Vendor 層 — RITM → task 反查(D2)
- [x] `servicenow.service.ts` 加 query:`sc_task` where `request_item = <ritmSysId>` AND `active = true`
- [x] **剛好 1 張**先返;**0 張 或 ≥2 張** → 返「認唔到」,**唔可以揀第一個**
- [x] `TASK_STATE = { workInProgress: '2', closedComplete: '3' }`,註解**寫明出處係 800 筆經驗值域**(唔係 instance choice list —— `sys_choice` 403)
- [x] `TASK_TABLE = 'sc_task'` hard-code(唔跟 `SERVICENOW_DEFAULT_TABLE`)
- [x] ⚠️ **偏離**:`RITM_TABLE` 由「保留」改為 **刪除**。ADR-0018 D4 話「work note 路徑仲用緊佢」係錯 —— work note 走 `addWorkNote()` **冇傳 table**,用緊 `SERVICENOW_DEFAULT_TABLE`。CH-010 之後零 caller。已入 ADR 補註 ②

### Seam ④ 兩個實作(D1 / D5)
- [x] `direct-ticket.provider.ts`:`closeComplete` / `markInProgress` 改為先反查再 PATCH **task**;介面形狀、outcome 詞彙、transport throw 契約**一個字唔改**
- [x] 認唔到 task → 回 `{status:'error'}`(唔 throw —— throw 係留畀 transport 失敗,見 `ticket-update.provider.ts` error contract)
- [x] `n8n-ticket.provider.ts`:2004 未支援 task 之前 **fail-loud**;🔴 唔可以靜靜當成功,亦唔可以靜靜跌返 direct
- [x] `ticket-update.provider.ts` 頭註更新:寫明寫入對象由 RITM 改為 task、點解、以及 2004 未同步嘅限制

### 失敗處理(沿用 ADR-0011,唔新發明)
- [x] 認唔到 task 入 `OutboundFailure`(既有 `servicenow.ticket_update` kind + `transition`,**零新 kind**)
- [x] `outbound-retry` 重發仍然走**當時選中嗰個 provider**(ADR-0017 W40 OQ-D),而且重發之後打嘅係 task

## Verification

- [x] **A1** direct:PATCH 落 `sc_task`,**`sc_req_item` 一個 request 都冇發出**(斷言表名,唔係斷言「有 call 過」)
- [x] **A2** `markInProgress` 同樣落 task —— 兩個方法唔可以一個落 task 一個落 RITM
- [x] **A3** fail-closed 三態:**0 張** / **≥2 張** → **完全冇 PATCH** + `error` + 入佇列;**剛好 1 張** → 正常
      ⚠️ `≥2` 嗰條 test **一定要寫**,雖然 772 張 RITM 抽樣零反例 —— 抽樣冇出現 ≠ 唔會發生
- [x] **A4** `assign.service` 既有 test 全綠(trigger 條件 / `ticketHeldAt` / 失敗唔令 assign 變失敗)
- [x] **A5** `outbound-retry` repair 走對 provider 且打 task
- [x] **A6** n8n 路徑 fail-loud
- [x] **A7** `ticket-update.boundary.spec.ts` 加鎖:seam ④ 唔再直接寫 `sc_req_item`
- [x] **A8** contract test —— ⚠️ **意思改咗**:兩個 provider 而家**唔再**做同一件事(2004 跟唔到 task),所以 spec 由「同一 outcome」改為斷言「分歧係刻意、而且被擋住」(n8n throw · 唔 call 2004 · 唔跌返 direct)。原本嘅 equivalence 形狀等 2004 支援 task 先回復
- [x] **A9** api **599 / 55 suites** 全綠(⚠️ spec 原寫「≥433」係 CH-008 branch 嘅數,`main` +50 commits 後唔可比);direct spec **5→14** 條,覆蓋 A1 / A3 兩個 fail-closed 分支 / assigned_to 三態 / error contract
- [x] **A10** lint(api)零 output · `npm run build` OK
- [x] **A11** 🔴 live **行真 code path**(唔係手動 curl):`OutboundFailure` → `POST /admin/outbound-failures/:id/retry` → retry service → seam → direct provider → 真 SN。`SCTASK0071391` state 1→3 + assigned_to 由空變有值 + close_notes = 平台嗰句;**`RITM0046766` state 1→3 · stage execution→complete,而平台完全冇掂過佢**
- [x] 🔴 **前置實驗**(寫 code 之前做):實驗 #1 close 咗 2023 年 AD 單嘅 task 但 **RITM 冇郁**;實驗 #2 **403 business rule**;實驗 #3 補 assigned_to 先成功 ⇒ 方案 B 成立但有兩個 ADR 冇預見嘅前置條件

## Cross-Cutting

- [x] Each commit references `progress.md` Day-N entry(R2)
- [x] Commit message 標 component tag(`feat(integration):`,標 CH-010)
- [x] **ADR-0018 已 Accepted**(2026-07-29);若實作中發現要改 schema → **STOP**,回頭問 owner(ADR-0018 宣告零 schema)
- [ ] 🚧 **未做,唔喺本 repo**:n8n 側 2004 要加 task 支援 + sticky note 寫低分工邊界(要 Chris 喺 n8n UI 做)。**唔阻住本 change 收官** —— 平台已經 fail-loud,`n8n-ticket` 掣鎖死 `direct`。target = 2004 更新嗰陣
- [x] `BACKLOG.md` 同步(R7)
- [x] `progress.md` closeout summary written
- [x] `progress.md` frontmatter status flipped to `done`

---

**Lifecycle reminder**:呢份 checklist 隨 spec acceptance criteria 衍生。新加 item 必須先入 spec + changelog,然後再加 checklist。
