---
guide_page: "{NN-page-name}"
title: "{對外標題}"
audience: 終端用戶
last_updated: YYYY-MM-DD
code_synced: YYYY-MM-DD   # 出廠值 / 預設值同 code 核對嘅日期
---

# {對外標題}

> **對外** 用戶手冊。呢層係「答用戶操作問題」嘅 first stop —— AI 唔應該憑記憶推導旋鈕值,應查呢層。
> **關鍵維護規則**:若某 ADR 改咗預設 / 出廠值 → 必須同步更新呢頁對應數字(否則誤導用戶)。

## 概覽
{呢頁講咩、幫用戶做到咩}

## 內容
{按頁主題組織 — 以下係常見 user-guide 頁類型結構參考:}

<!-- 若係 overview 頁:平台係咩 + 核心概念 + 導航 -->
<!-- 若係 configuration-reference 頁:逐個旋鈕 = 名 + 作用 + 出廠值 + 建議範圍 + 影響 -->
<!-- 若係 troubleshooting 頁:症狀 → 原因 → 解法 表 -->
<!-- 若係 how-to / setup 頁:step-by-step + 截圖 + 驗證 -->

### {Section}
{內容}

## 出廠值對照（若係 config 類頁）
| 設定 | 出廠值 | 建議範圍 | 影響 | Code 位置 |
|---|---|---|---|---|
| {旋鈕} | {值} | {範圍} | {影響} | `{settings 路徑}` |

> ⚠️ 上表數字必須同 code 一致。改 default 嘅 ADR 落地時,一齊更新此表 + `code_synced` 日期。
