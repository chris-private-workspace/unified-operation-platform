# Unified Operation Platform — Local Dev Setup

> 本地開發環境 setup。CLAUDE.md §2 routing 由「setup local dev」指過嚟。

> **狀態(2026-07-09)**:W01 完成 —— monorepo 後端跑得起、DB seeded。佈局 = `apps/api`(NestJS)+ `apps/web`(placeholder,ADR-0001)。

## 前置

- **Node 20+**(本機 v22;ServiceNow client 用 global `fetch`)
- **Docker**(Postgres + Redis)· npm

## 步驟

1. Clone + 入資料夾。
2. `npm install`(root workspace,一次裝 `apps/*`)。
3. `docker compose up -d` —— 起 Postgres(host **5433**)+ Redis(6379)。
4. `apps/api/.env`:copy `apps/api/.env.example` 做 `apps/api/.env`,填 Graph / ServiceNow(boot 可用佔位值)+ `DATABASE_URL`(已對齊 5433)。**唔好 commit `.env`**;Graph 權限見 `docs/05-usage/INTEGRATION_SETUP.md`。
   - **Auth env(ADR-0005 / AUTH-4a)**:本地登入需 `AUTH_JWT_SECRET`(本地 JWT HS256 簽名 secret,強隨機、**絕不 commit**;缺則本地登入 fail)。`seed` 建本地 admin 需 `LOCAL_ADMIN_INITIAL_PASSWORD`(未設則 skip)。純本地捷徑仍可用 `AUTH_DEV_BYPASS=true`(免登入,注入 seed ADMIN;`AUTH_DEV_USER_EMAIL` 扮特定 user)。三者皆 inline / `.env`,**唔入 git**。無 dev-bypass 時登入 `admin@uop.local`(= `LOCAL_ADMIN_INITIAL_PASSWORD`)。
5. `npm run prisma:generate` → `npm run prisma:migrate`(建表)→ `npm run seed`(23 OpCos + admin + 本地 admin(若設 env))。
   - ⚠️ 若 `binaries.prisma.sh` 回 **503**(公司 proxy 封 Prisma engine CDN):轉**流動網路**跑一次 generate/migrate cache engine(見「常見坑」)。
6. `npm run start:dev` → OpenAPI UI(本機 `PORT=3100`,見下)`http://localhost:3100/docs/api`。

## 首個 smoke test

```
# 用真實 tenant subscribedSkus 灌 SKU catalog(需 module C + Graph env,W01 之後):
curl -X POST http://localhost:3100/license/catalog/sync
```

## 本機服務清單

| 服務 | port | 起法 | 備註 |
|---|---|---|---|
| backend(NestJS) | **3100** | `npm run start:dev` | 預設 3000;本機俾 Langfuse 佔 → `PORT=3100`(`apps/api/.env`) |
| PostgreSQL(docker) | **5433** | `docker compose up -d` | 預設 5432;本機俾既有 Postgres 佔 → host 5433 |
| Redis(docker) | 6379 | `docker compose up -d` | |

## 常見坑

- **🔴 Prisma engine CDN 被公司 proxy 封**:`binaries.prisma.sh` 回 503 → `prisma generate`/`migrate` 失敗。**解**:轉流動網路跑一次 `npm run prisma:generate` + `cd apps/api && npx prisma migrate dev`,engine cache 落 `node_modules` 後返公司網即用本機 binary。其他 TLS 用 `NODE_EXTRA_CA_CERTS=C:/Users/CLai03/ricoh-ca.pem`。RISK R1。
- **Port 衝突**:3000(Langfuse)/ 5432(既有 Postgres)本機已佔 → 用 3100 / 5433。
- **Graph `assignLicense`**:指派前 user 必須有 `usageLocation`;無空 seat 會失敗 —— 先查可用量。詳見 `docs/05-usage/INTEGRATION_SETUP.md`。
- **Phase 1 sync gate**:`findUser` 回 `null` = user 未 sync 落 Azure AD,唔好 assign。
- **ServiceNow table/field**:`sc_req_item` / `work_notes` 係預設,要對齊 Phase 1 實際 instance。

## 啟用 git hooks(可選)

```
git config core.hooksPath scripts/hooks
```
