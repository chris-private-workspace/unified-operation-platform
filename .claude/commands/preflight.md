---
description: Pre-flight health check — 所有本地服務 — before any restart / eval / destructive op (per CLAUDE.md §10.3)
allowed-tools: Bash, Read
---

執行 pre-flight health check(落任何 restart / eval / destructive op 之前)。逐項跑,最後出一個 status table。

> **最重要嘅判斷規則:以 endpoint reachability 為準,唔係 container 嘅 health flag。** 好多服務 warmup 期間會顯示 `(unhealthy)` 但 endpoint 已經 200 —— 嗰個係 timing artifact,唔係 failure。

## 逐項跑
> ⚠️ scaffolding 階段:未有 docker-compose / package.json 前呢啲會 fail —— 屬預期(見 docs/setup.md)。
1. **PostgreSQL**(預期 handshake OK,port 5432):`docker compose exec -T postgres pg_isready` 或 `pg_isready -h localhost -p 5432`
2. **Redis**(預期 PONG,port 6379):`docker compose exec -T redis redis-cli ping`
3. **Backend(NestJS)**(預期 HTTP 200;timeout ≥10s —— 忙時短 timeout 會誤 FAIL):`curl -sf -m 10 http://localhost:3000/docs/api -o /dev/null && echo OK`
4. **容器**(context only):`docker compose ps`

## 詮釋規則
- Endpoint 200 / TCP 通 = healthy,**即使** container flag 寫 `(unhealthy)`。
- 服務 down 或慢:cold-start 可能係**慢,唔係 hang**(重度 contention 下更明顯)—— fail 時先睇進程 CPU 有冇郁,**唔好**單次 fail 就殺進程。
- 任何服務連唔到 → 喺**任何 destructive op 之前** surface 畀用戶(per CLAUDE.md「executing actions with care」)。**唔好**自動重啟,建議用 `/restart`。

最後出 table:服務 | port | 狀態(✅/❌)| 備註。
