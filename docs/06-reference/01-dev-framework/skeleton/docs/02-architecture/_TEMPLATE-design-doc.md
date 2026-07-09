---
artifact: design-doc
title: "{Design topic}"
status: draft            # draft | active | superseded
created: YYYY-MM-DD
spec_refs: [{spec §}]
affects_components: [Cn]
---

# {Design Topic} — Design Document

> 跨 component / 較大嘅設計方案(唔屬單一 component design note,亦未落到 ADR decision)。
> 用途:落 code 前把方案想清楚 + 畀用戶 review。設計拍板後,關鍵決定沉澱入 `adr/`,本檔留做佐證。

## 0. TL;DR(一頁睇晒)
{3-5 句:要解咩問題、方案核心、影響範圍、Tier / ADR 觸發}

## 1. Problem / Motivation
{咩問題觸發呢個設計?現狀點解唔夠?}

## 2. As-Built / 現況(防重造既有嘢)
{呢個範圍已經有咩 —— 組件 / 機制 inventory。避免重造已存在嘅嘢}

| 已有 | 喺邊 | 可唔可以 reuse |
|---|---|---|
| {既有機制} | `{path / Cn}` | {yes / 要改} |

## 3. Goals / Non-Goals
- **Goals**:{要達到咩}
- **Non-Goals**:{明確唔做咩(防 scope 蔓延)}

## 4. Proposed Design
{方案細節 — 資料流 / 介面 / 演算法}
```
{ASCII 圖(若有)}
```

## 5. Schema / 資料模型變更

| 變更 | File / table | Migration / re-index? | Breaking? |
|---|---|---|---|
| {加欄 / 改 schema} | `{path}` | {要 / 唔要} | {是 / 否} |

(若無 schema 改動:`N/A`)

## 6. Alternatives Considered
- **Option A**:{描述} — trade-off
- **Option B**:{描述} — trade-off
- **Chosen**:{揀邊個 + 點解}

## 7. Impact
- **Affected components**:{Cn}
- **Migration / re-index / breaking change?**:{有/冇}
- **Hard constraint 觸發?**:{H-架構 / H-vendor?→ 需 ADR}

## 8. Open Questions & Risks
- **Open Q**:{未定嘅點 → 需用戶決定}
- **Risks**:{link RISK_REGISTER + 狀態}

## 9. Rollout Plan
{點分階段落地 — 對應邊啲 phase / change}

## 10. References
- spec section / 相關 ADR / 外部 link / 觸發嘅 phase folder
