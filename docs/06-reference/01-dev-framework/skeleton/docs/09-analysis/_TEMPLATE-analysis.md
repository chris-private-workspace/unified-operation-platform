---
artifact: analysis
title: "{調查主題}"
date: YYYY-MM-DD
author: {AI / human}
trigger: "{咩觸發呢次調查}"
basis: "{對照嘅 commit / 系統狀態}"
---

# {調查主題} — Analysis({YYYY-MM-DD} 快照)

> 一次性調查 / 診斷 / review 報告。**係某時間點嘅快照**(同 02-architecture 持久真理區分)。
> 若得出架構決定 → 入 `adr/`;若識別 pending 工作 → 入 BACKLOG(R7)。

## 0. 摘要與總判斷(先睇呢段)
- **核心結論**:{一兩句}
- **跨主題總表**(若審多個面向):

| 面向 | 判斷 | 最需要 action |
|---|---|---|

## 1. 觸發 / 問題
{咩問題 / 需求觸發呢次調查?想答咩?}

## 2. 方法
{點查 — code 核對 / 實驗 / 資料分析 / grep / 跑 eval}

## 3. 發現(strengths + risks 兩面)

**做得好 / 可靠嘅地方**:
- {正面發現 — 審系統時唔淨係搵問題}

**風險 / 問題**:

| # | 發現 | 級別 | 證據(code / trace / 數據) | 建議 |
|---|---|---|---|---|
| F1 | {發現} | 🔴高/🟠中/🟡低 | {佐證} | {建議 action} |

## 4. 分析 / 討論
{深入 — 根因、trade-off、反證咗嘅假設(記低防重複試)}

## 5. 結論 / 建議
- {結論 + 衍生 action → link CH/BUG/ADR/BACKLOG}

## 6. Follow-up
{識別出嘅 candidate 入 BACKLOG 邊區,狀態}

---

**評估人**:{author} · **快照日期**:YYYY-MM-DD · **基礎**:{見 frontmatter basis}
