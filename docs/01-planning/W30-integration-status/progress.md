---
phase: W30-integration-status
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: in-progress    # in-progress | closed
---

# Phase W30 — Progress

> Daily progress + 結尾 retro。
> 每 commit 必須對應一個 Day-N entry mention(R2 binding rule per PROCESS.md §5)。

---

## Day 0 — 2026-07-21: Kickoff

**Action**:Phase W30 kickoff(整合 rollout **item 4** / BACKLOG `INTEG-1`)

- Templates copied from `_templates/phase/`
- `plan.md` filled,status=**`draft`**(**未 active** —— 待 Chris approve §9 三點,R1 gate)
- `checklist.md` derived from plan deliverables(F0 gate + F1 read-model + F2 endpoint + F3 前端 + Verify)
- Branch:待開工時由 `main`(`3b77793`)開出

**前置**:

- **ADR-0010 Accepted**(2026-07-21;OQ-A 容許唯讀主動探針 · OQ-B 派生既有 timestamp · OQ-C item 6 人手 retry)—— PR #12 已 merge
- W29 收官,audit rollout item 1-3 完成;本 phase 係 item 4

**本 phase 定位 —— 風險比 W29 低一級**:

W29 改咗 6 個既有 service 嘅 transaction 邊界。**本 phase 純新增讀取面** —— 新 endpoint + 新 UI panel,零 schema、零 dependency、唔改任何既有寫入路徑。接近 W28 嘅風險等級。

**兩條硬紅線(G1 / G2)**:

1. **回應絕不含 secret / env 值** —— 連 masked 都唔回(ADR-0010 D2)。做法 = DTO **allow-list 明文列欄位,唔用 spread** + 一條餵假 secret 嘅 test 鎖死。
2. **探針零副作用** —— SN 只可 GET(**絕不 `createRecord`**),n8n **絕不打 webhook**(佢會建**真 ticket**)。test 明文斷言兩者從未被呼叫。

**取證確認可重用嘅嘢**(降低風險):`GraphService.getSubscribedSkus()` · `ServiceNowService.query(q, table, 1)` · `graph-unavailable.ts` wrap helper —— **探針零新 vendor 方法**。

**規劃階段已發現一處 ADR 冇預見到嘅嘢**(plan §8):

ADR-0010 D4 個表列咗 n8n inbound 有派生來源,但實際上**派生唔到** —— `Request.origin` 個 default 就係 `'onboarding-intake'`(`schema.prisma:200`),W03 seed 出嚟嘅單同真 n8n intake 完全分唔開。plan 嘅處理係**交白卷**(標「無法從既有資料區分」)而唔係揀個近似值:一個睇落合理但實際錯嘅時間戳,比「唔知」更危險 —— 運維會照住佢判斷 connector 死咗未。屬實作層修正,唔改 ADR 方向,closeout 補註。

**Commit**:`<pending>` — `chore(planning): kickoff W30 integration-status`

**⏸️ 等 Chris approve plan §9 三點先開 F1**(R1)。

---

## Day 1 — 2026-07-21

(待填)

---

## Day 2 — 2026-07-22

(待填)

---

## Retro(填於 phase 結束)

### What worked
- _(待填)_

### What didn't work / unexpected friction
- _(待填)_

### Surprises / discoveries
- _(待填)_

### Carry-overs to W31
- _(待填)_
- 預期:**ADR-0010 補註** —— n8n inbound 派生落空(plan §8)
- 候選下一個:**INTEG-3** 人手 retry(⚠️ 要新 model = H1)/ **FE-activity**(⚠️ 受 `/admin/audit` ADMIN-only 限制,見 ADR-0009 Decision 7)/ **AUTH-2b**(🔴 卡 IT app reg)/ **DEPLOY**

### ADR triggers
- 預期**無新 ADR** —— ADR-0010 已完整涵蓋 item 4

### Phase Gate result
- G1–G9:_(待填)_

### Phase status
- Closeout commit:_(待填)_
- Frontmatter status flipped to `closed`
- BACKLOG synced(R7)
- Phase W31 kickoff trigger:_(待定)_

---

**End of W30 progress**
