---
bug_id: BUG-{NNN}
report_ref: ./report.md
status: in-progress     # in-progress | done
last_updated: YYYY-MM-DD
---

# BUG-{NNN} — Checklist

> Atomic checkbox per investigation / fix / regression / verify stages。
> AI tick 完成嘅 item;唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。

## Investigation

- [ ] Reproduce locally per `report.md §2`
- [ ] Identify root cause(via logs / trace / debugger)
- [ ] Confirm hypothesis with concrete evidence(trace? failing test? code path?)
- [ ] Update `report.md §6` with confirmed root cause

## Fix

- [ ] Implement minimal fix(per CLAUDE.md §1.3 surgical — touch only what's necessary)
- [ ] Refactor adjacent code ONLY if needed for fix correctness
- [ ] Update affected `02-architecture/components/Cn-*.md` design note + bump status(if design changed)

## Regression Test

- [ ] Add test that **fails before fix, passes after**(critical:proves fix actually fixes)
- [ ] Run full test suite(or affected subset)
- [ ] Manual smoke test of related features(per CLAUDE.md "executing actions with care")

## Verification

- [ ] Re-run `report.md §2` repro steps in fixed env → expect §3 expected behavior
- [ ] Confirm related features still work(no regression introduced)
- [ ] (if user-facing)Manual UI verify

## Closeout

- [ ] `progress.md` closeout summary(timeline + root cause + lessons)
- [ ] (if Sev1/Sev2)Write `postmortem.md`(per PROCESS.md §4.4)
- [ ] Update `RISK_REGISTER.md` if pattern is new
- [ ] Pending changes synced to `BACKLOG.md`(R7)
- [ ] `report.md` status flipped to `done`
- [ ] `progress.md` status flipped to `closed`

---

## Cross-Cutting

- [ ] Each commit references `progress.md` Day-N entry(R2)
- [ ] Commit message 標對應 component tag(`fix(scope): description (Cn)`)
- [ ] (if architectural fix)ADR + tag affected component(s)(R5)
- [ ] Open-question status sync(if applicable)(R4)
