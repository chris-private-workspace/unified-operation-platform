---
description: Pre-flight health check — 所有本地服務 — before any restart / eval / destructive op (per CLAUDE.md §10.3)
allowed-tools: PowerShell, Read
---

跑 `restart-stack` skill 嘅 **step 1 only**(read-only):

```powershell
& ".claude\skills\restart-stack\scripts\preflight.ps1" *> "<scratchpad>\preflight.out.txt"
```

用 **Read 工具**讀 output(唔靠 shell stdout,§5.8 H8),然後出 table:服務 | port | 狀態(✅/❌)| 備註。

判斷規則(詳見 skill):
- **以 endpoint reachability 為準,唔係 container health flag** —— warmup 期 `(unhealthy)` 但 endpoint 200 = timing artifact。
- 冷啟動係「慢,唔係 hang」——**唔好**單次 fail 就殺進程。
- 有服務連唔到 → 喺任何 destructive op 之前 surface 畀用戶,**唔好**自動重啟,建議跑 `/restart`。
- `[dev]` 進程數明顯偏多(健康值 ~10-16)= 有洩漏,建議 `/restart`。
