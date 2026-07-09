---
change_id: CH-{NNN}
spec_ref: ./spec.md
checklist_ref: ./checklist.md
status: in-progress     # in-progress | closed
---

# CH-{NNN} — Progress

> Day-N entries during execution + 結尾 closeout summary。
> 每 commit 必須對應一個 Day-N entry mention(R2 binding rule per PROCESS.md §5)。

---

## Day 1 — YYYY-MM-DD

### Done
- {atomic checklist items completed,each maps to checklist tick}

### Decisions
- {Design choice / trade-off made,trace to ADR if applicable}

### Blockers
- {Blocker description + escalation owner + ETA}

### Effort
- Planned:{h};Actual:{h};Variance:{±h}

### Commits
| Hash | Subject |
|---|---|

---

## Day 2 — YYYY-MM-DD

(same structure)

---

## Closeout(填於 status=closed)

### Acceptance verification
{All §3 acceptance criteria from spec.md verified ✅ / partial ⚠️ / failed ❌}

### Effort summary
| Day | Planned (h) | Actual (h) | Variance |
|---|---|---|---|

### Lessons
- What worked
- What didn't / unexpected friction
- Carry-overs(if any deferred to other tasks)

### Component design note status updates
- C{NN}:`v{n}-{stage}` → `v{n+1}-{stage}`(reason)

---

**End of CH-{NNN} progress**
