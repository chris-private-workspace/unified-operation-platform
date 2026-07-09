---
description: Pre-flight health check — 所有本地服務 — before any restart / eval / destructive op (per CLAUDE.md §10.3)
allowed-tools: Bash, Read
---

執行 pre-flight health check(落任何 restart / eval / destructive op 之前)。逐項跑,最後出一個 status table。

> **最重要嘅判斷規則:以 endpoint reachability 為準,唔係 container 嘅 health flag。** 好多服務 warmup 期間會顯示 `(unhealthy)` 但 endpoint 已經 200 —— 嗰個係 timing artifact,唔係 failure。

## 逐項跑
<!-- 按你項目嘅服務填。以下係常見結構: -->
1. **{服務 A,例 DB}**(預期 handshake OK):`{健康檢查命令}`
2. **{服務 B,例 backend}**(預期 HTTP 200;timeout 用 ≥10s —— 忙時短 timeout 會誤 FAIL):`{curl / health 命令}`
3. **{服務 C,例 storage}**(預期 TCP port 通):`{Test port 命令}`
4. **容器 / 進程**(context only):`{docker ps / ps 命令}`

## 詮釋規則
- Endpoint 200 / TCP 通 = healthy,**即使** container flag 寫 `(unhealthy)`。
- 服務 down 或慢:cold-start 可能係**慢,唔係 hang**(重度 contention 下更明顯)—— fail 時先睇進程 CPU 有冇郁,**唔好**單次 fail 就殺進程。
- 任何服務連唔到 → 喺**任何 destructive op 之前** surface 畀用戶(per CLAUDE.md「executing actions with care」)。**唔好**自動重啟,建議用 `/restart`。

最後出 table:服務 | port | 狀態(✅/❌)| 備註。
