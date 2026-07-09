---
description: Run the §10.3 AI Session Start Protocol — load active-phase context + git state, then surface blockers before any implementation
argument-hint: "(optional) 'compact' to force a full post-/compact re-read"
allowed-tools: Bash, Read, Glob, Grep
---

你正在(重新)開始一個工作 session。請**按順序**執行 CLAUDE.md §10.3 AI Session Start Protocol,完成前**唔好**落手 implement。

## Live state（已預先抓取）

Active phase folder（最近修改的 W*/）:
!`ls -dt docs/01-planning/W*/ 2>/dev/null | head -1`

Git working tree:
!`git status --short`

Recent commits:
!`git log --oneline -5`

## 順序執行
1. 讀 `docs/12-ai-assistant/01-prompts/session-start.md`(詳版 onboarding + 當前座標)。
2. 讀 active phase `plan.md`(scope + acceptance)。
3. 讀 active phase `checklist.md`(搵 next unchecked item)。
4. 讀 active phase `progress.md` 最近 3 個 Day-N entry(context + blockers + carry-overs)。
5. 對照上面 git state。
6. 有疑問 / acceptance 模糊 → **STOP and ask**,先至回覆用戶第一句。

$ARGUMENTS

> 若 argument = `compact`:呢個係 /compact 之後,standing-instruction retention 跌到 ~60%,**必須** re-read 步驟 1-4。
