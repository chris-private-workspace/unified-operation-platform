---
change_id: CH-010
spec_ref: ./spec.md
status: ready            # blocked | ready | in-progress | done
last_updated: 2026-07-29
---

# CH-010 — Checklist

> Atomic checkbox items derived from `spec.md §3` acceptance criteria。
> **Gate 0 已清**(2026-07-29)。剩返**一重** gate:本 spec 仍係 `proposed`,等 Chris approve(PROCESS R1.change)。
> ⇒ Implementation / Verification 區**仍然鎖住**,但唔再係「等答案」,係「等 approve」。

## Gate 0 — 開工前必須有嘅答案 ✅ 全部已解決

- [x] **OQ-1** 🔴 close 晒 catalog task 之後 RITM 會唔會自動 advance? → ✅ **Chris**:「UOP 只需處理 catalog task 嘅狀態就足夠,**RITM 由 ServiceNow workflow 處理**」⇒ **方案 B 成立**
- [x] **OQ-2** 🔴 帳號有冇 `sc_task` **寫**權? → ✅ **有**(admin 權限帳號)。⚠️ 順帶揭出 least-privilege 缺口 → 轉 **DEPLOY-harden**,唔喺本 change 做
- [x] **OQ-3** `sc_task.state` 值域 → ✅ 800 筆真數據反推:`3` ×595(**全 inactive**)· `7` ×151 · `1` ×24(**全 active**)· `4` ×24 · `-5` ×4 · `2` ×2 ⇒ **close 寫 `3`、hold 寫 `2`**。`sys_choice` 即使 admin 都 403 = table-level 限制
- [x] **OQ-4** 認邊張 task → ✅ **「唯一 `active=true` 嗰張」**。772 張 RITM:總 task 數 1/2/3 張分別係 745/26/1,但 **active task 數只有 0 或 1,零反例**。`sys_class_name` 全同、`order` 全空 ⇒ 兩者都做唔到識別;`assignment_group` 唔用(會綁死 group id)
- [x] **OQ-5** RITM `stage` 使唔使掂 → ✅ **唔使**,併入 OQ-1 答案
- [x] 答案寫入 `SERVICENOW-CONTRACT-ALIGNMENT.md` 🅖-2 + ADR-0018 §Open Questions
- [x] ADR-0018 `Proposed → Accepted`
- [ ] 🔴 **仍然要**:SN owner 指定一張**測試用** RITM fixture(A11 要用;**絕不掂真客戶單**)
- [ ] 🔴 **仍然要**:Chris approve 本 spec → `proposed → approved`

## Implementation

### Vendor 層 — RITM → task 反查(D2)
- [ ] `servicenow.service.ts` 加 query:`sc_task` where `request_item = <ritmSysId>` AND `active = true`
- [ ] **剛好 1 張**先返;**0 張 或 ≥2 張** → 返「認唔到」,**唔可以揀第一個**
- [ ] `TASK_STATE = { workInProgress: '2', closedComplete: '3' }`,註解**寫明出處係 800 筆經驗值域**(唔係 instance choice list —— `sys_choice` 403)
- [ ] `TASK_TABLE = 'sc_task'` hard-code(唔跟 `SERVICENOW_DEFAULT_TABLE`,理由同 `RITM_TABLE`);`RITM_TABLE` **保留**(work note 路徑仍然用)

### Seam ④ 兩個實作(D1 / D5)
- [ ] `direct-ticket.provider.ts`:`closeComplete` / `markInProgress` 改為先反查再 PATCH **task**;介面形狀、outcome 詞彙、transport throw 契約**一個字唔改**
- [ ] 認唔到 task → 回 `{status:'error'}`(唔 throw —— throw 係留畀 transport 失敗,見 `ticket-update.provider.ts` error contract)
- [ ] `n8n-ticket.provider.ts`:2004 未支援 task 之前 **fail-loud**;🔴 唔可以靜靜當成功,亦唔可以靜靜跌返 direct
- [ ] `ticket-update.provider.ts` 頭註更新:寫明寫入對象由 RITM 改為 task、點解、以及 2004 未同步嘅限制

### 失敗處理(沿用 ADR-0011,唔新發明)
- [ ] 認唔到 task 入 `OutboundFailure`(既有 `servicenow.ticket_update` kind + `transition`,**零新 kind**)
- [ ] `outbound-retry` 重發仍然走**當時選中嗰個 provider**(ADR-0017 W40 OQ-D),而且重發之後打嘅係 task

## Verification

- [ ] **A1** direct:PATCH 落 `sc_task`,**`sc_req_item` 一個 request 都冇發出**(斷言表名,唔係斷言「有 call 過」)
- [ ] **A2** `markInProgress` 同樣落 task —— 兩個方法唔可以一個落 task 一個落 RITM
- [ ] **A3** fail-closed 三態:**0 張** / **≥2 張** → **完全冇 PATCH** + `error` + 入佇列;**剛好 1 張** → 正常
      ⚠️ `≥2` 嗰條 test **一定要寫**,雖然 772 張 RITM 抽樣零反例 —— 抽樣冇出現 ≠ 唔會發生
- [ ] **A4** `assign.service` 既有 test 全綠(trigger 條件 / `ticketHeldAt` / 失敗唔令 assign 變失敗)
- [ ] **A5** `outbound-retry` repair 走對 provider 且打 task
- [ ] **A6** n8n 路徑 fail-loud
- [ ] **A7** `ticket-update.boundary.spec.ts` 加鎖:seam ④ 唔再直接寫 `sc_req_item`
- [ ] **A8** contract test:兩個 provider 同一組 case 同一 outcome
- [ ] **A9** api ≥ **433**,新 test 覆蓋 A1 / A3 三態 / A5 / A6
- [ ] **A10** lint(api)零 output · `npm run build` OK
- [ ] **A11** 🔴 live:用 **SN owner 指定嘅測試 RITM** 真 close 一次 task → 觀察 RITM 有冇自動推(實地驗 OQ-1)

## Cross-Cutting

- [ ] Each commit references `progress.md` Day-N entry(R2)
- [ ] Commit message 標 component tag(`feat(integration):`,標 CH-010)
- [x] **ADR-0018 已 Accepted**(2026-07-29);若實作中發現要改 schema → **STOP**,回頭問 owner(ADR-0018 宣告零 schema)
- [ ] n8n 側:2004 要加 task 支援 + sticky note 寫低分工邊界(**唔喺本 repo**,要 Chris 喺 n8n UI 做)
- [ ] `BACKLOG.md` 同步(R7)
- [ ] `progress.md` closeout summary written
- [ ] `progress.md` frontmatter status flipped to `done`

---

**Lifecycle reminder**:呢份 checklist 隨 spec acceptance criteria 衍生。新加 item 必須先入 spec + changelog,然後再加 checklist。
