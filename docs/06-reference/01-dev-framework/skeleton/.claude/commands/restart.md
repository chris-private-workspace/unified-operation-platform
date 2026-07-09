---
description: Full-stack restart — 所有服務。"重啟服務" 永遠指全部,唔係淨係其中一個
argument-hint: "(optional) 單一服務名只重啟嗰個;留空 = 全部"
---

**「重啟服務」= 重啟全 stack,唔係淨係其中一個。** 只重啟部分服務,可能令其他服務 stale(例:只重 backend 令 frontend 攞到舊 state)。

> ⚠️ 呢個 command 可能含 destructive op(殺進程 / wipe cache)。每步用工具執行時跟正常 permission flow。**先行 `/preflight`** 了解現狀。

按順序重啟,每步驗 ready 先去下一步:

### 1. {基礎設施,例 DB / 容器}
- {確認 up 嘅命令};唔 up → {啟動命令}。

### 2. {儲存 / 中介服務}
- {啟動命令 + 任何項目特定 caveat}。

### 3. {Backend}
- 啟動:`{命令}`。
- {env 注意事項}。
- 啟動**慢 ≠ hang**:cold-start 可能要一陣 —— 只輪詢 health endpoint(timeout ≥10s),**唔好**碰進程。
- {若有 dual-process / 進程辨認坑,喺度寫}。

### 4. {Frontend}(若有)
- **先 kill 殘留進程**(認得係本項目嗰啲先殺)。
- **Wipe build cache**(若框架有 cache 損壞問題)。
- 啟動 + 驗證:唔只等「Ready」,實際打 `/` 確認冇 500,再隔幾秒 re-check 仲 LISTEN。

### 5. 重啟後必驗
- {打一個關鍵 endpoint 確認有 data / 正常}。
- {response shape / 常見誤判提醒}。

$ARGUMENTS

> 若 argument 指定咗單一服務名 → 只重啟嗰個(但提醒用戶「重啟服務」通常指全部)。

最後出 table:服務 | port | 狀態(ready/failed)| 備註。
