# MEMORY.md — {PROJECT_NAME} 記憶索引(種子)

> **呢份係 memory 系統嘅索引種子 + 使用說明。** 落地時:
> 1. 把本檔 copy 去 AI agent 嘅 per-project memory 目錄做 `MEMORY.md`。
> 2. 刪走下面「使用說明」部分(§A/§B/§C),只留「索引」部分。
> 3. 之後每寫一個 memory 檔,喺索引加一行。

---

## 索引(每個 memory 一行:標題 + 一句 hook)

<!-- 落地後呢度會逐漸長出真索引,例:
- [回覆要中文為主](feedback_chinese_primary.md) — 對答繁中為主,英文只限 code/檔名/API
- [X 功能 blocked 喺外部 credential](project_x_blocked_cred.md) — 等 IT 批 → 未能上線
-->

_(空 — 頭幾個 session 開始沉澱)_

---
---

# 以下係使用說明(落地時刪走,只留上面索引)

## §A. Memory 系統係咩

一個 **repo 外、per-project** 嘅檔案式記憶庫。每個 memory 係一個 `.md` 檔,存一個「唔應該再解釋第二次」嘅事實。AI 每 session 會載入 `MEMORY.md` 索引,按需展開相關 memory。

**點解 repo 外**:memory 記嘅係協作過程(踩過嘅環境坑、用戶糾正過嘅做法、項目當前狀態),唔係 codebase 一部分,唔應該入 git。

**位置慣例**(Claude Code):`~/.claude/projects/<project-slug>/memory/`。

## §B. 檔案格式

檔名:`{type}_{slug}.md`(例 `feedback_chinese_primary.md`、`project_auth_blocked.md`)。

每個檔:
```markdown
---
name: <short-kebab-slug>
description: <一句摘要 — AI 用嚟判斷相關性,寫得準先召得返>
metadata:
  type: user | feedback | project | reference | principle
---

<事實本體。>

<!-- feedback / project 類跟埋呢兩行: -->
**Why:** <點解要記 / 背景>
**How to apply:** <下次點用>

<!-- 用雙括號 link 相關記憶(即使對方未存在都得,marks 值得寫): -->
相關:[[其他-memory-slug]]
```

## §C. 五類 type

| type | 記咩 | 例 |
|---|---|---|
| **user** | 用戶係邊個(角色 / 專長 / 偏好) | 「用戶係技術 lead,偏好簡潔直接嘅回覆」 |
| **feedback** | 用戶畀過嘅工作指引(糾正或確認做法),含 why | 「重啟服務 = 重啟全部,唔好順手跑 eval / 改 config」 |
| **project** | 進行中工作 / 目標 / 約束(code + git 睇唔到嘅) | 「X 模組 blocked 喺外部 credential,等 IT」 |
| **reference** | 外部資源指針 | 「監控 dashboard 喺 <url>;工單系統 <url>」 |
| **principle** | 項目確立嘅根本準則(北極星) | 「還原度優先於美觀 — 用戶 <日期> 確立」 |

## §D. 紀律(避免 memory 腐化)

- **一個檔一個事實**,唔好塞。
- **存之前查重**:有相近檔就更新,唔好開新;發現錯咗就刪。
- **唔好存 code / git 已記錄嘅嘢**(架構、過往修復、CLAUDE.md 內容)。用戶叫你記呢類 → 問返「當中邊樣係非顯而易見」,記嗰樣。
- **相對日期轉絕對**(「上星期」→ 實際日期)。
- 寫完檔即刻喺 `MEMORY.md` 加一行指針:`- [標題](file.md) — hook`。
- 召回嘅 memory 反映嘅係「寫入嗰陣嘅事實」—— 若佢提到某 file / function / flag,用之前先 verify 仲存唔存在。

## §E. 完整範例

檔案 `feedback_restart_means_all.md`:
```markdown
---
name: restart-means-all-services
description: 叫「重啟服務」= 純起齊全部服務 + 驗 ready 就停,唔好加做嘢
metadata:
  type: feedback
---

用戶叫「重啟 / 啟動所有服務」= 純起齊所有服務(infra + backend + frontend)+ 驗 ready 就停。

**Why:** 用戶 <日期> 明確 feedback:試過幾次「叫重啟但順手跑 eval / 修 bug / 改 config / 開 plan」,做多咗嘢。
**How to apply:** 收到「重啟」指令 → 只起服務 + 逐個驗 ready → 停,唔好自作主張加工作。

相關:[[full-service-restart-procedure]]
```

對應 `MEMORY.md` 索引行:
```
- [重啟 = 重啟全部(但只起服務)](feedback_restart_means_all.md) — 叫重啟唔好順手做多嘢
```
