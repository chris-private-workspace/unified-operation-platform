---
bug_id: BUG-{NNN}
title: "{Brief symptom}"
severity: Sev3          # Sev1 | Sev2 | Sev3 | Sev4 (per PROCESS.md §4.4)
status: triaged         # triaged | investigating | fixing | verifying | done | wont-fix
reported: YYYY-MM-DD
reporter: "{Chris / End-user / Auto-detected}"
affects_components: [{component}]
spec_refs:
  - {spec section that defines correct behavior}
---

# BUG-{NNN} — {Title}

> **Report version**:1.0(initial)
> **Triage approver**:_(name when status flips triaged → investigating)_

## 1. Symptom
{User-facing description of what's wrong — observable behavior}

## 2. Reproduction Steps
1. {Step 1 — concrete action}
2. {Step 2}
3. {Observed broken behavior}

**Reproduction reliability**:Always / Often (>50%) / Sometimes (<50%) / Rare
**Environment**:{local dev / staging / production / specific browser}

## 3. Expected vs Actual
- **Expected**:{what should happen — cite spec section if applicable}
- **Actual**:{what happens — observable evidence}

## 4. Impact
- **Affected users / scenarios**:{who hits this, how often}
- **Workaround available?**:Yes / No;{describe if yes}
- **Data loss / corruption?**:Yes / No
- **Security implication?**:Yes / No

## 5. Severity Justification
Why **Sev{N}** per `PROCESS.md §4.4`:
{Explanation matching scale criteria}

## 6. Initial Diagnosis（updated as investigation progresses）
- **Initial hypothesis**(at triage):{guess based on symptom}
- **(投查中)**:{updated finding + date}
- **(Root cause confirmed)**:{final finding + date}

## 7. Acceptance for Fix
- [ ] Reproduction confirmed locally
- [ ] Root cause identified
- [ ] Fix implemented
- [ ] Regression test added（fails before fix, passes after）
- [ ] Verified in env（re-run §2 repro steps）

## 8. Report Changelog
| Date | Change | Reason | Approver |
|---|---|---|---|
| YYYY-MM-DD | Initial triage | — | {Tech Lead} |

---

**Lifecycle reminder**:Sev1/Sev2 → `postmortem.md` mandatory（per `PROCESS.md §4.4`）。
**Gate reminder**:AI 起草 report,**用戶 confirm repro + severity 先開始投查**（PROCESS R1.bugfix）。
