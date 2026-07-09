---
artifact: external-research
title: "{研究主題}"
date: YYYY-MM-DD
author: {AI / human}
question: "{研究問題}"
method: "{deep-research / 手動;fan-out N sources → M claims → confirmed/killed}"
---

# {研究主題} — External Research({YYYY-MM-DD})

> Deep-research / 外部資料調查(vendor 文檔、業界 best practice、標準)。同 analysis 區分:analysis 查**自己個系統**,research 查**外部知識**。
> 用途:落架構決定前收集外部佐證。得出決定 → 入 `adr/`。

## 1. 一句話結論(TL;DR)
{一句:研究問題嘅答案}

## 2. 研究問題
{想搞清楚咩?咩決定 depends on 呢個答案?}

## 3. 來源

| # | 來源 | 類型 | 可信度 | 票 / 反證 |
|---|---|---|---|---|
| S1 | {URL / 文檔} | 官方 / 業界 / 社群 | 高/中/低 | {3-0 支持 / 2-1 / 0-3 反證} |

## 4. 發現(逐子問題)
### Q: {子問題}
- **答**:{結論}
- **佐證**:{引 S1/S2…}
- **反證 / 分歧**:{有冇來源講相反 — 老實記}

## 5. 對本項目嘅意涵
- {外部知識點樣影響我哋嘅決定}
- {推翻咗邊個原本假設(重要 — 防照抄過時做法)}

## 6. Caveats / 限制(誠實交代)
- {domain mismatch / best-case framing / measurement ≠ fix / 樣本細 等局限}
- {邊啲結論係「暫時最佳理解」而非定論}

## 7. 建議
{基於 research 嘅建議 → link 觸發嘅 ADR / design doc}
