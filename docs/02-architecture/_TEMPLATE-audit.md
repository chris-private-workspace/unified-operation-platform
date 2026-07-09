---
artifact: audit
title: "{Audit topic — e.g. code vs spec at W{NN} closeout}"
status: draft            # draft | active | closed
audit_date: YYYY-MM-DD
spec_baseline: "{對照嘅 spec version / section}"
code_baseline: "{對照嘅 commit hash / branch}"
auditor: {AI / human}
method: "{grep / 逐檔 / 跑測試 / walkthrough}"
---

# {Audit Topic} — Audit Report

> 週期性 / closeout 時核對「實作 vs spec / 設計意圖」,揪出 drift。**Living governance doc**。
> Findings 若需修 → 開對應 bug / change + 入 BACKLOG(R7)。

## 0. Executive Summary

- **Overall verdict**:{✅ Aligned / ⚠️ Minor drift / 🚨 Major drift}
- **Drift count**:

| Severity | Count |
|---|---|
| 🚨 Major | {n} |
| ⚠️ Minor | {n} |
| 🟢 Positive(實作超前 spec) | {n} |
| ✅ Aligned | {n} |

- **Top drifts**:{一兩句最需要注意嘅}

## 1. Audit Scope
{範圍 + 對照基準(見 frontmatter spec_baseline / code_baseline)}

## 2. Findings

| # | Finding | Class | Severity | Spec/Design ref | Follow-up |
|---|---|---|---|---|---|
| 1 | {實作同 spec 邊度唔一致} | code-ahead / spec-ahead / both-drift / positive | 🚨/⚠️/🟢 | `{§}` | {BUG-NNN / CH-NNN / ADR-NNNN / accept} |

## 3. Drift 分類說明
- **code-ahead** — 實作超出 / 偏離 spec(spec 未追上)。
- **spec-ahead** — spec 寫咗但實作未做。
- **both-drift** — 兩邊都偏,需 reconcile。
- **positive** — 實作超前 spec 且係好嘅方向(spec 應追認)。

## 4. Resolution
- 每個 Major → 決定:修 code / 改 spec(經 ADR)/ accept(記理由)。
- 產生嘅 follow-up 全部入 BACKLOG。

## 5. Methodology & Limitations
- **Method**:{見 frontmatter}
- **Limitations**:{呢次 audit 冇 cover 到咩、盲點}
- **Re-audit cadence**:{幾時再審 — 每 phase closeout / 季度 / 大改後}

## 6. Sign-off
- **Reviewed by**:{owner} · **Date**:YYYY-MM-DD
