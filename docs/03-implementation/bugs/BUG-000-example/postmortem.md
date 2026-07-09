---
bug_id: BUG-000
report_ref: ./report.md
progress_ref: ./progress.md
written: 2026-01-12
author: "AI"
sign_off: signed
---

# BUG-000 — Postmortem

> ⚠️ 範例實例。Sev2 mandatory。**Blameless**。

## 1. Incident Timeline

| Time | Event |
|---|---|
| 2026-01-10 | CH-000 filter feature merged |
| 09:15 | Reported by end-user（active filter 夾雜 archived）|
| 09:20 | First investigation start |
| 09:25 | Hypothesis「filter 冇 apply」— 驗 param validation OK（排除）|
| 09:30 | Root cause identified（handler 收 param 但 query 冇用）|
| 09:40 | Fix implemented |
| 09:50 | Regression test added + verified |
| 10:00 | Verified resolved |
| **Total**:~45 分鐘 from report → fix | |

## 2. Root Cause（detailed）
CH-000 handler 接咗 `status` param 並寫咗 validation（422 test 有覆蓋),但 repository query 冇引用嗰個 param → filter 靜默失效。

**Why didn't this surface earlier?**
CH-000 acceptance「`status=active` 只回 active」嘅 test 只寫**正向斷言**（assert active items 在結果),冇寫**反向斷言**（assert archived items **唔**在結果）。正向過關,反向漏網。

## 3. Impact Assessment
- **Users affected**:所有用 status filter 嘅查詢。
- **Duration of impact**:~2 日（merge → 發現）。
- **Data loss / corruption**:No。
- **Workarounds used**:Yes — client-side 再 filter（正正係 CH-000 想消除嘅）。
- **Cost impact**:無。

## 4. What Worked
- 用戶 repro 清晰,10 分鐘定位。
- Fix surgical（一行 where clause）。

## 5. What Didn't Work / Was Slow
- 冇 —— 但根本問題係 CH-000 test 唔夠 tight,先至有呢個 bug。

## 6. Surprises
- 「有 validation test（422 過)」畀咗虛假安全感 —— validation 對 ≠ filter 對。

## 7. Action Items

| # | Action | Owner | Due | Component(s) | Status |
|---|---|---|---|---|---|
| 1 | Filter 類 test 一律加「排除斷言」（回 X 亦 assert 唔回 not-X）| AI | 即時 | C08 | Open |
| 2 | Acceptance criteria review:篩選類 feature 明確要求正+反斷言 | Chris | 下個 change | — | Open |

## 8. Risk Register Update
- New risk added to `../../../01-planning/RISK_REGISTER.md`:**R-n**「filter 類 feature 只寫正向 test → 漏反向」（if pattern is new）。

## 9. Component Design Note Updates
- `02-architecture/components/C08-*.md`:N/A（範例項目未建 catalog;真實項目喺度記 edge case）。

---

**Sign-off**:AI | Date:2026-01-12
**Reviewed by**:Chris | Date:2026-01-12
