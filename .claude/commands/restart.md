---
description: Full-stack restart — 所有服務。"重啟服務" 永遠指全部,唔係淨係其中一個
argument-hint: "(optional) 單一服務名只重啟嗰個;留空 = 全部"
---

**「重啟服務」= 重啟全 stack,唔係淨係其中一個。** 只重啟部分服務,可能令其他服務 stale(例:只重 backend 令 frontend 攞到舊 state)。

> ⚠️ 呢個 command 可能含 destructive op(殺進程 / wipe cache)。每步用工具執行時跟正常 permission flow。**先行 `/preflight`** 了解現狀。

按順序重啟,每步驗 ready 先去下一步:
> ⚠️ scaffolding 階段:docker-compose.yml / package.json 未建前呢個 command 未生效(見 docs/setup.md)。

### 1. 基礎設施(Postgres + Redis 容器)
- 確認 up:`docker compose ps`;唔 up → `docker compose up -d`。
- 驗:`docker compose exec -T postgres pg_isready` + `docker compose exec -T redis redis-cli ping`。

### 2. DB schema(如有 migration 未 apply)
- `npm run prisma:migrate` —— 確認 schema 對得上 `prisma/schema.prisma`。

### 3. Backend(NestJS)
- 啟動:`npm run start:dev`(port 3000)。
- env:`.env` 要有 Graph / ServiceNow / `DATABASE_URL`(見 `docs/05-usage/INTEGRATION_SETUP.md`)。
- 啟動**慢 ≠ hang**:cold-start 可能要一陣 —— 只輪詢 `/docs/api`(timeout ≥10s),**唔好**碰進程。

### 4. Frontend
- 未落本 repo(另一 deliverable)—— 暫無。

### 5. 重啟後必驗
- 打 `curl -sf http://localhost:3000/docs/api` 確認 OpenAPI UI up。
- 若已 seed catalog:試一個 license endpoint 確認有 data。

$ARGUMENTS

> 若 argument 指定咗單一服務名 → 只重啟嗰個(但提醒用戶「重啟服務」通常指全部)。

最後出 table:服務 | port | 狀態(ready/failed)| 備註。
