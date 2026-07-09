---
bug_id: BUG-000
report_ref: ./report.md
checklist_ref: ./checklist.md
status: closed
---

# BUG-000 — Progress

> ⚠️ 範例實例。

---

## Day 1 — 2026-01-12

### Done
- Triage（Sev2,用戶 confirm repro）→ 本地 3-item reproduce → 定位 root cause → fix + regression test → 驗證 resolved。

### Diagnosis update
- Hypothesis:filter 冇 apply。驗:param validation OK（422 test 過)→ 收窄到 handler 收 `status` 但 query 冇用 → confirmed。

### Decisions
- Fix 用最小改動（where clause 補一條）,唔 refactor 周邊（§1.3 surgical）。

### Blockers
- 無。

### Effort
- Planned:2h;Actual:1.5h;Variance:−0.5h

### Commits
| Hash | Subject |
|---|---|
| `e5f6g7h` | `fix(api): BUG-000 wire status filter (C08)` |

---

## Closeout（status=closed）

### Root Cause（final）
CH-000 filter feature 嘅 handler 接咗 `status` param（validation 有,422 test 有覆蓋),但 repository query 冇用嗰個 param —— 「接參數」同「用參數」係兩件事。

### Fix Summary
`list_items()` where clause 補 `status` 條件（`e5f6g7h`）;只改一行,無 breaking。

### Regression Test
`tests/api/test_items_filter.py::test_active_filter_excludes_archived`
驗「active filter 唔回 archived」;原本只有正向斷言，呢個反向斷言就係 CH-000 漏咗嘅。

### Lessons
- What worked:用戶 repro 清晰,10 分鐘定位。
- What slowed us down:無。
- Patterns to watch:filter 類 test 要正+反斷言齊（接參數 ≠ 用參數）。

### Component design note status updates
- C08:N/A（範例項目未建 catalog）

---

**End of BUG-000 progress**
