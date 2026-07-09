---
phase: W{NN}-{phase-name-kebab}
name: "{Phase Descriptive Name}"
sprint_week: W{NN}
start_date: YYYY-MM-DD
end_date: YYYY-MM-DD          # planned, may slip with changelog log
status: draft                 # draft | active | closed
spec_refs:
  - {主 spec section}
prior_phase: W{NN-1}-{name}   # null if first phase
---

# Phase W{NN} — {Phase Name}

> **Plan version**:1.0(initial)
> **Owner**:{Tech Lead}
> **Approved by**:_(stakeholder name when status flips draft → active)_

## 1. Scope

{One paragraph 描述本 phase 要交咩、目標、為何 critical。}

## 2. Deliverables

### F1 — {Deliverable name}
- **Spec ref**:`{spec section}`
- **Dependencies**:{open question / 其他 phase / 外部}
- **Acceptance criteria**:
  - {concrete pass condition 1}
  - {concrete pass condition 2}
- **Effort estimate**:_h
- **Owner**:AI / {human}

### F2 — {Deliverable name}
- (same structure)

## 3. Success Criteria(Phase Gate)

| # | Criterion | Target | Measure | Block closeout? |
|---|---|---|---|---|
| G1 | {e.g. all endpoints registered} | {target} | {command / check} | Yes |
| G2 | | | | |

## 4. Risks(Phase-Specific)

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | ... | High / Med / Low | High / Med / Low | ... |

## 5. Day-by-Day Breakdown(rough)

| Day | Date | Focus | Deliverables targeted |
|---|---|---|---|
| D1 | YYYY-MM-DD | ... | F1, F2 |

## 6. Dependencies on Prior Phase

Carry-over from `W{NN-1}-{phase}/progress.md` retro:
- {item 1}

(if first phase:`N/A — first phase`)

## 7. Plan Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| YYYY-MM-DD | Initial plan | — | {Tech Lead} |

---

**Lifecycle reminder**:呢份 plan locked after status=active。重大 deviation 入第 7 節 changelog,小 detail 變動可直接 inline edit。
