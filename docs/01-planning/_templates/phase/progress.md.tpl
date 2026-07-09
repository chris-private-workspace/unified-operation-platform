---
phase: W{NN}-{phase-name-kebab}
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: in-progress    # in-progress | closed
---

# Phase W{NN} — Progress

> Daily progress + 結尾 retro。
> 每 commit 必須對應一個 Day-N entry mention(R2 binding rule per PROCESS.md §5)。

---

## Day 0 — YYYY-MM-DD: Kickoff

**Action**:Phase W{NN} kickoff
- Templates copied from `_templates/phase/`
- `plan.md` filled,status=`active`
- `checklist.md` derived from plan deliverables
- Carry-over from W{NN-1} retro:{list}

**Commit**:`<hash>` — `chore(planning): kickoff W{NN} {phase-name}`

---

## Day 1 — YYYY-MM-DD

### Done
- {What got done,each item ideally maps to one or more checklist tick}

### Decisions / Open-Questions Resolved
- {Decision A;trace to ADR if applicable}
- OQ-{N}:resolved → {summary;synced to decision tracker}(R4)

### Blockers
- {Blocker description + escalation owner + ETA}

### Actual vs Planned Effort
| Deliverable | Planned (h) | Actual (h) | Variance |
|---|---|---|---|

### Commits
- `<hash>` — `<commit subject>`

---

## Day 2 — YYYY-MM-DD

(same structure)

---

## Day N — YYYY-MM-DD

(same structure)

---

## Retro(填於 phase 結束)

### What worked
- {Item 1}

### What didn't work / unexpected friction
- {Item 1}

### Surprises / discoveries
- {Item 1}

### Carry-overs to W{NN+1}
- {Item 1}(deferred from this phase,reason)
- {Item 2}(new context for next phase planning)

### ADR triggers
- {Decision X 屬 architectural-adjacent → ADR-NNNN created}
- {Decision Y 屬 process-only → no ADR needed}

### Phase Gate result
- G1:Pass / Fail(measure value)
- G2:Pass / Fail

### Phase status
- Closeout commit:`<hash>`
- Frontmatter status flipped to `closed`
- BACKLOG synced(R7)
- Phase W{NN+1} kickoff trigger:{date / blocker}

---

**End of W{NN} progress**
