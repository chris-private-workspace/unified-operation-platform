---
change_id: CH-000
spec_ref: ./spec.md
checklist_ref: ./checklist.md
status: closed
---

# CH-000 — Progress

> ⚠️ 範例實例。Day-N entries + closeout summary。

---

## Day 1 — 2026-01-10

### Done
- AI 分類 = Change → 起草 spec.md（proposed）→ 用戶 approve → approved。
- 實作 `status` param + server-side filter + test。

### Decisions
- 用 Pydantic `Literal["active","archived"]` 令無效值自動 422,唔使手寫 validation（trace: 無 ADR,非架構級）。

### Blockers
- 無。

### Effort
- Planned:4h;Actual:3h;Variance:−1h

### Commits
| Hash | Subject |
|---|---|
| `a1b2c3d` | `feat(api): CH-000 status filter (C08)` |

---

## Closeout（status=closed）

### Acceptance verification
All §3 acceptance criteria verified ✅（4/4:active 篩選 / 無 param 向後兼容 / 422 / 驗證命令）。

### Effort summary
| Day | Planned (h) | Actual (h) | Variance |
|---|---|---|---|
| D1 | 4 | 3 | −1 |

### Lessons
- What worked:Pydantic `Literal` 一次過搞掂 validation + 422。
- What didn't:acceptance 只寫正向斷言（後來由 BUG-000 揭出漏反向）。
- Carry-overs:無。

### Component design note status updates
- C08:N/A（範例項目未建 component catalog;真實項目喺度 bump design note status）

---

**End of CH-000 progress**
