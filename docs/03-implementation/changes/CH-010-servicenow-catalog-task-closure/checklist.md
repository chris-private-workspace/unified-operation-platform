---
change_id: CH-010
spec_ref: ./spec.md
status: blocked          # blocked | in-progress | done
last_updated: 2026-07-29
---

# CH-010 — Checklist

> Atomic checkbox items derived from `spec.md §3` acceptance criteria。
> 🔴 **全部 item 鎖住** —— 兩重 gate 未過:
> 1. **ADR-0018 仍係 `Proposed`**(等 OQ-1 / OQ-2)
> 2. 本 spec 仍係 `proposed`(等 Chris approve)
>
> ⚠️ **OQ-1 唔係實作細節,係「揀邊個方案」** —— 若答案係「close 晒 task 之後 RITM 唔會自動推」,
> 本 change 要整份重寫做方案 A(平台 close task 之後自己再 PATCH RITM)。所以**唔好**喺答案返嚟之前
> 「先做住可以做嘅部分」。

## Gate 0 — 開工前必須有嘅答案(唔屬實作,但冇佢就唔可以開始)

- [ ] **OQ-1** 🔴 close 晒 catalog task 之後,RITM 會唔會自動 advance 到 Closed Complete?(答「唔會」→ 改方案 A)
- [ ] **OQ-2** 🔴 integration 帳號有冇 `sc_task` **寫**權?(讀權已實測;寫權**唔可以**靠試,試一次就改真單)
- [ ] **OQ-3** `sc_task.state` 值域 —— close 寫邊個值?(`sys_choice` 返 403,讀唔到)
- [ ] **OQ-4** 一張 RITM 多張 task 嗰陣,平台認邊張?(`assignment_group` / `short_description` / `sys_class_name` / 「唯一 active」?)
- [ ] **OQ-5** RITM 個 `stage`(見到 `execution`)使唔使平台掂?
- [ ] SN owner 指定一張**測試用** RITM fixture(A11 要用;🔴 絕不掂真客戶單)
- [ ] 上述答案寫入 `docs/05-usage/SERVICENOW-CONTRACT-ALIGNMENT.md` + ADR-0018 §Open Questions
- [ ] ADR-0018 `Proposed → Accepted`(或改揀方案 A → 改寫 ADR + 本 spec)

## Implementation

### Vendor 層 — RITM → task 反查(D2)
- [ ] `servicenow.service.ts` 加「由 RITM sys_id 攞平台負責嗰張 `sc_task`」query(規則 = OQ-4 答案)
- [ ] **唯一命中**先返;零命中 / 多過一個 → 返「認唔到」,**唔可以揀第一個**
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
- [ ] **A3** fail-closed 三態:零命中 / 多命中 → **完全冇 PATCH** + `error` + 入佇列;唯一命中 → 正常
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
- [ ] **ADR-0018 已 Accepted 先開工**;若實作中發現要改 schema → **STOP**,回頭問 owner(ADR-0018 宣告零 schema)
- [ ] n8n 側:2004 要加 task 支援 + sticky note 寫低分工邊界(**唔喺本 repo**,要 Chris 喺 n8n UI 做)
- [ ] `BACKLOG.md` 同步(R7)
- [ ] `progress.md` closeout summary written
- [ ] `progress.md` frontmatter status flipped to `done`

---

**Lifecycle reminder**:呢份 checklist 隨 spec acceptance criteria 衍生。新加 item 必須先入 spec + changelog,然後再加 checklist。
