---
phase: W01-example
name: "Foundation — project skeleton + first vertical slice"
sprint_week: W01
start_date: 2026-01-05
end_date: 2026-01-09
status: closed                # ← 範例展示完整生命週期
spec_refs:
  - architecture.md §6.1 W01 row
prior_phase: null
---

# Phase W01 — Foundation

> ⚠️ **範例 phase(EXAMPLE)**,鏡射「保留一個 reference」pattern。展示 `_templates/phase/` 點填。真實項目由你自己嘅 W01 開始。
> **Plan version**:1.0 · **Owner**:{Tech Lead} · **Approved by**:Chris(2026-01-05)

## 1. Scope
建起項目地基:repo skeleton + CI + 一條最薄嘅 vertical slice(一個 endpoint 由入到出通),證明 stack 接得通。

## 2. Deliverables

### F1 — Repo skeleton + CI green
- **Spec ref**:`architecture.md §4`
- **Acceptance criteria**:
  - `ci` workflow green(lint + test 跑到)
  - `docs/` 13 層就位
- **Owner**:AI

### F2 — 第一條 vertical slice(health + 一個 CRUD endpoint)
- **Spec ref**:`architecture.md §4.1`
- **Acceptance criteria**:
  - `GET /health` 回 200
  - `GET /items` 回 list(可空)
  - test 覆蓋兩個 endpoint
- **Owner**:AI

## 3. Success Criteria(Phase Gate)
| # | Criterion | Target | Measure | Block closeout? |
|---|---|---|---|---|
| G1 | CI green | pass | `ci` workflow | Yes |
| G2 | health + items endpoint 通 | 2/2 | `pytest` | Yes |

## 4. Risks
| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | 環境 setup 卡住(deps / 平台坑) | Med | Med | 早日試 setup,坑入 `docs/setup.md` |

## 5. Day-by-Day
| Day | Date | Focus | Deliverables |
|---|---|---|---|
| D1 | 2026-01-05 | repo skeleton + CI | F1 |
| D2 | 2026-01-06 | vertical slice | F2 |

## 6. Dependencies on Prior Phase
N/A — first phase。

## 7. Plan Changelog
| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-01-05 | Initial plan | — | Chris |

---

**Lifecycle reminder**:plan locked after status=active。重大 deviation 入 §7 changelog。
