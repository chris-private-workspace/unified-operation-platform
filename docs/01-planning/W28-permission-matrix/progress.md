---
phase: W28-permission-matrix
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: in-progress    # in-progress | closed
---

# Phase W28 — Progress

> Daily progress + 結尾 retro。
> 每 commit 必須對應一個 Day-N entry mention(R2 binding rule per PROCESS.md §5)。

---

## Day 0 — 2026-07-20: Kickoff

**Action**:Phase W28 kickoff(rollout item 2)

- Templates copied from `_templates/phase/`
- `plan.md` filled,status=`active`
- `checklist.md` derived from plan deliverables(F0 spike + F1 backend + F2 frontend + F3 drift test + Verify)
- **前置背景**(唔係嚟自 W27 retro,而係 2026-07-20 audit 規劃):
  - Chris 提三問(n8n 接口 / integration UI / audit 需求)→ 查證 → pre-ADR 分析 `02-architecture/audit-and-integration-observability.md`
  - **ADR-0009 Accepted**(Chris 拍板 OQ-1 = 記白名單 before/after · OQ-2 = P-B)
  - Chris 批 6 項 rollout 順序;本 phase = **item 2**,經確認「開,唔使等 ADR」(item 2 唔受 OQ-1/OQ-2 影響,因 Decision 8.5 已定「唔起 permission table」)

**本 phase 定位**:**零行為改動** —— 唔加唔改任何現有權限,純粹令現有 `@Roles` 變成可查證(derived view + drift test)。

**已識別嘅兩個主要風險**(plan §4):
- **R1** `DiscoveryService` 可能攞唔到 path metadata → D1 先 spike,有 fallback
- **R4** 矩陣答「邊個 role 掂到邊個 endpoint」,**唔答**「掂到之後見到幾多 row」(OPCO_IT per-OpCo scope 係另一層)→ 頁面必須明文註記,否則稽核語境會撈亂

**Commit**:`<pending>` — `chore(planning): kickoff W28 permission-matrix`

---

## Day 1 — 2026-07-20

### Done
- _(執行中)_

### Decisions / Open-Questions Resolved
- _(待填)_

### Blockers
- _(待填)_

### Actual vs Planned Effort
| Deliverable | Planned (h) | Actual (h) | Variance |
|---|---|---|---|
| F1 | 3 | | |
| F2 | 2.5 | | |
| F3 | 1.5 | | |

### Commits
- _(待填)_

---

## Retro(填於 phase 結束)

### What worked
- _(待填)_

### What didn't work / unexpected friction
- _(待填)_

### Surprises / discoveries
- _(待填)_

### Carry-overs to W29
- _(待填)_

### ADR triggers
- 預期**無新 ADR** —— 純 derive,ADR-0009 Decision 8.5 已覆蓋
- 若 F0 spike 失敗改 fallback(手寫 const map)→ 屬 plan deviation,入 plan §7 changelog(R3),仍非 ADR 級

### Phase Gate result
- G1–G7:_(待填)_

### Phase status
- Closeout commit:_(待填)_
- Frontmatter status flipped to `closed`
- BACKLOG synced(R7)
- Phase W29 kickoff trigger:預期 = **AUDIT-3**(`AuditLog` 落地)

---

**End of W28 progress**
