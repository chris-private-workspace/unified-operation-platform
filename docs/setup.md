# Unified Operation Platform — Local Dev Setup

> 本地開發環境 setup。CLAUDE.md §2 routing 由「setup local dev」指過嚟。

## ⚠️ 當前 build 現狀(2026-07 · 未 runnable)

本 repo 目前係 **scaffolding 階段**,以下步驟係**目標介面**,要先補以下缺件先跑得起:

- **未有** `package.json` / `tsconfig.json` / `nest-cli.json` / `docker-compose.yml`。
- **entry 檔位置**:`main.ts` / `app.module.ts` / `seed.ts` 喺 repo root,但 import 假設喺 `src/`;要歸位(`src/main.ts`、`src/app.module.ts`、`prisma/seed.ts`)。
- **缺 module**:`app.module.ts` 引用嘅 `PrismaModule`(`@Global`)/ `LicenseModule`(C)/ `FulfilmentModule`(D)未存在;只有 `src/integration/`。
- **未有 auth**:controllers 預期 unguarded 到 Entra guard 建成(找 `TODO: @Roles`)。

呢啲追蹤喺 `docs/01-planning/BACKLOG.md`(scaffolding 收尾工作)。

## 前置

- **Node 20+**(ServiceNow client 用 global `fetch`)
- **Docker**(Postgres + Redis)
- npm

## 步驟(package.json 補齊後)

1. Clone + 入資料夾。
2. `npm install`
3. `docker compose up -d` —— 起 Postgres + Redis。
4. Copy env:`cp .env.example .env`,填 Graph / ServiceNow / `DATABASE_URL`(**唔好 commit `.env`**;Graph 權限見 `docs/05-usage/INTEGRATION_SETUP.md`)。
5. `npm run prisma:generate` → `npm run prisma:migrate`(建表)→ `npm run seed`(23 OpCos + admin user)。
6. `npm run start:dev` → http://localhost:3000 · OpenAPI UI `/docs/api`。

## 首個 smoke test

```
# 用真實 tenant subscribedSkus 灌 SKU catalog(需 Graph env):
curl -X POST http://localhost:3000/license/catalog/sync
```

## 本機服務清單

| 服務 | port | 起法 |
|---|---|---|
| backend(NestJS) | 3000 | `npm run start:dev` |
| PostgreSQL | 5432 | `docker compose up -d` |
| Redis | 6379 | `docker compose up -d` |

## 常見坑

- **Graph `assignLicense`**:指派前 user 必須有 `usageLocation`;無空 seat 會失敗 —— 先查可用量。詳見 `docs/05-usage/INTEGRATION_SETUP.md`。
- **Phase 1 sync gate**:`findUser` 回 `null` = user 未 sync 落 Azure AD,唔好 assign。
- **ServiceNow table/field**:`sc_req_item` / `work_notes` 係預設,要對齊 Phase 1 實際 instance。

## 啟用 git hooks(可選)

```
git config core.hooksPath scripts/hooks
```
