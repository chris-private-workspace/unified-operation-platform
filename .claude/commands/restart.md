---
description: Full-stack restart — 所有服務。"重啟服務" 永遠指全部,唔係淨係其中一個
argument-hint: "(optional) 單一服務名只重啟嗰個;留空 = 全部"
---

用 `restart-stack` skill 執行(SOP + 腳本 + 坑都喺 `.claude/skills/restart-stack/`)。

**「重啟服務」= 重啟全 stack**,唔係淨係其中一個 —— 只重 backend 會令 frontend 攞到 stale state。

$ARGUMENTS

> 若 argument 指定咗單一服務名 → `start-detached.ps1 -ApiOnly` / `-WebOnly`(但提醒用戶「重啟服務」通常指全部)。

收尾出 table:服務 | port | 狀態(ready/failed)| 備註(pid / 冷啟秒數)。
