---
bug_id: BUG-{NNN}
report_ref: ./report.md
progress_ref: ./progress.md
written: YYYY-MM-DD
author: "{Name}"
sign_off: pending     # pending | signed
---

# BUG-{NNN} — Postmortem

> **Mandatory for Sev1 / Sev2;encouraged for recurring patterns**(per `PROCESS.md §4.4`)。
> **Blameless** — focus on system,not person。

## 1. Incident Timeline

| Time | Event |
|---|---|
| HH:MM | Reported by {who} |
| HH:MM | First investigation start |
| HH:MM | Hypothesis A tested(failed)|
| HH:MM | Root cause identified |
| HH:MM | Fix implemented |
| HH:MM | Regression test added + verified |
| HH:MM | Deployed / verified resolved |
| **Total**:{N hours from report → fix} | |

## 2. Root Cause(detailed)

{Detailed technical explanation — code path / data flow / config / external trigger}

**Why didn't this surface earlier?**
{e.g. "Test coverage gap on edge case" / "Production-only data shape" / "Race condition" / "External dep change unannounced"}

## 3. Impact Assessment

- **Users affected**:{count / percentage / scenarios}
- **Duration of impact**:{minutes / hours / days}
- **Data loss / corruption**:{Yes / No;quantify}
- **Workarounds used during incident**:{Y / N — describe}
- **Cost impact**:{$ if known}

## 4. What Worked

- {Tool / process / person that helped move quickly}
- {Detection that caught it early}

## 5. What Didn't Work / Was Slow

- {Friction point that delayed resolution}
- {Tooling gap}

## 6. Surprises

- {Things that were unexpected — calibration for future}

## 7. Action Items

| # | Action | Owner | Due | Component(s) | Status |
|---|---|---|---|---|---|
| 1 | {Process improvement} | ... | YYYY-MM-DD | C{NN} | Open |
| 2 | {Code refactor / test add} | ... | ... | ... | Open |
| 3 | {Monitoring / alerting} | ... | ... | ... | Open |

## 8. Risk Register Update

- New risk added to `../../../01-planning/RISK_REGISTER.md`:**R{N}**(if pattern is new)
- Existing risk severity / probability updated:R{N}(if confirmed by this incident)

## 9. Component Design Note Updates

- `02-architecture/components/C{NN}-*.md`:edge case section enriched;status bump if material

---

**Sign-off**:{Author} | Date:YYYY-MM-DD
**Reviewed by**:{Tech Lead / SME} | Date:YYYY-MM-DD
