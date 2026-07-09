---
change_id: CH-{NNN}
title: "{Brief title}"
status: draft           # draft | proposed | approved | active | done | cancelled
created: YYYY-MM-DD
target_completion: YYYY-MM-DD
affects_components: [{component}]
spec_refs:
  - {spec section}
---

# CH-{NNN} — {Title}

> **Spec version**:1.0(initial)
> **Owner**:{Chris / AI}
> **Approved by**:_(name when status flips draft → approved)_

## 1. Context (Why)
What triggered this change? What problem does it solve? Who requested?

## 2. Scope (What)

### 2.1 Behavior Change
- **Before**:{current behavior — cite spec section if applicable}
- **After**:{new behavior — concrete description}

### 2.2 In Scope
- {Concrete change item 1}

### 2.3 Out of Scope（explicit）
- {What WON'T change — to prevent scope creep}

## 3. Acceptance Criteria
Verifiable list of "done" conditions:
- [ ] {Pass condition 1 — concrete + observable}
- [ ] {Verification command:`<command>`}

## 4. Risks
| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | ... | High / Med / Low | High / Med / Low | ... |

## 5. Effort Estimate
{N hours / days}

## 6. Dependencies
- External work / open-question resolution / other components that must be ready

## 7. Spec Changelog（deviation log）
| Date | Change | Reason | Approver |
|---|---|---|---|
| YYYY-MM-DD | Initial draft | — | {Tech Lead} |

---

**Lifecycle reminder**:呢份 spec locked after status=approved。重大 deviation → §7 changelog。
**Gate reminder**:status 由 AI 標 `proposed`,**用戶 review + approve 先可以 `approved` + 開始 code**(PROCESS R1.change)。
