---
bug_id: BUG-{NNN}
report_ref: ./report.md
checklist_ref: ./checklist.md
status: in-progress     # in-progress | closed
---

# BUG-{NNN} — Progress

> Investigation → fix → verify timeline。
> 每 commit 必須對應一個 Day-N entry mention(R2 binding rule per PROCESS.md §5)。

---

## Day 1 — YYYY-MM-DD

### Done
- {Investigation step / fix attempt / regression test added / etc}

### Diagnosis update
- {Hypothesis evolution from `report.md §6`}

### Decisions
- {Design choice for fix approach,trace to ADR if applicable}

### Blockers
- {Blocker description + escalation}

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

### Root Cause(final)
{Concise technical explanation — what was wrong + why it manifested as the symptom}

### Fix Summary
{What changed,affected files,affected behavior — keep <5 sentences}

### Regression Test
{Test name + path:`tests/.../test_name.py::test_function`}
{What it verifies + how it would have caught the bug originally}

### Lessons
- What worked in investigation(tools / approaches that helped)
- What slowed us down(friction points)
- Patterns to watch for(would catch similar in future)

### Component design note status updates
- C{NN}:`v{n}-{stage}` → `v{n+1}-{stage}`(reason — usually "edge case discovered, design enriched")

---

**End of BUG-{NNN} progress**
