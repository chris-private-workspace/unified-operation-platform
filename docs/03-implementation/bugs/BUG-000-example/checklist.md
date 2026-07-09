---
bug_id: BUG-000
report_ref: ./report.md
status: done
last_updated: 2026-01-12
---

# BUG-000 — Checklist

> ⚠️ 範例實例。

## Investigation
- [x] Reproduce locally per `report.md §2`（3 items,active filter 回 3）
- [x] Identify root cause（handler 收 `status` 但冇 pass 落 query）
- [x] Confirm hypothesis with concrete evidence（422 test 過 → param 有讀到 → query 冇用）
- [x] Update `report.md §6` with confirmed root cause

## Fix
- [x] Implement minimal fix（`list_items()` where clause 加 `status`,只改一行）
- [x] Refactor adjacent code ONLY if needed — N/A
- [x] Update affected `components/C08-*.md` design note — N/A（範例項目未建 catalog）

## Regression Test
- [x] Add test that **fails before fix, passes after**（`test_active_filter_excludes_archived`）
- [x] Run full test suite
- [x] Manual smoke test of related features

## Verification
- [x] Re-run `report.md §2` repro → active filter 只回 2
- [x] Confirm related features still work（無 param / archived filter 都驗）
- [x] （user-facing）Manual UI verify

## Closeout
- [x] `progress.md` closeout summary
- [x] （Sev2）Write `postmortem.md`（mandatory）
- [x] Update `RISK_REGISTER.md`（「param 接咗但漏 wire」新 pattern）
- [x] Pending changes synced to `BACKLOG.md`（R7）
- [x] `report.md` status flipped to `done`
- [x] `progress.md` status flipped to `closed`

---

## Cross-Cutting
- [x] Each commit references `progress.md` Day-N entry（R2）
- [x] Commit message 標 component tag（`fix(api): BUG-000 wire status filter (C08)`）
- [x] （if architectural fix）ADR — N/A
- [x] Open-question status sync — N/A
