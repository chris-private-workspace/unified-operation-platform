---
phase: W01-backend-bootstrap
name: "Backend Bootstrap — 令 LicenseOps 後端跑得起"
sprint_week: W01
start_date: 2026-07-09
end_date: 2026-07-16          # planned, may slip with changelog log
status: draft                 # draft | active | closed
spec_refs:
  - docs/architecture.md §4 Application Architecture
  - docs/02-architecture/licenseops/DESIGN.md §12 Artifact index
  - docs/setup.md 當前 build 現狀
prior_phase: null             # first phase
---

# Phase W01 — Backend Bootstrap

> **Plan version**:1.0(initial)
> **Owner**:Chris Lai
> **Approved by**:_(status draft → active 時填)_

## 1. Scope

依家 repo 有 integration layer(`src/integration/`)、Prisma schema、seed 同 entry 檔,但**跑唔起**:冇 `package.json` / build config、entry 檔位置同 import 路徑唔一致、`app.module.ts` 引用嘅 `PrismaModule` / `LicenseModule` / `FulfilmentModule` 未存在。本 phase 目標 = **建立 monorepo(ADR-0001)+ NestJS build/run 工具鏈 + 把後端遷入 `apps/api`,令 `npm run start:dev` 真正 boot、Prisma migrate、seed、OpenAPI UI serve**。呢個係之後所有 module 工作(C / D)同前端(`apps/web`)嘅前置,unblock 全部後續開發。

> **ADR-0001 影響**:採 monorepo `apps/api`(NestJS)+ `apps/web`(React,本 phase 唔起,只預留)。後端由 repo root 遷入 `apps/api/`;root 設 workspace。前端 scaffold 屬後續 phase。

**明確 out-of-scope(H3)**:唔實作 module C(catalog + 對帳)/ module D(request 履行)嘅業務邏輯;`LicenseModule` / `FulfilmentModule` 本 phase 只建**空 stub**令 app compile,實際 service 留 W02+。唔加 auth guard(另一 phase)。

## 2. Deliverables

### F1 — Build / tooling config
- **Spec ref**:`docs/setup.md`
- **Dependencies**:無
- **Acceptance criteria**:
  - `package.json` 齊 deps(NestJS 核心、`@nestjs/config`、`@nestjs/schedule`、`@nestjs/swagger`、Prisma、`@microsoft/microsoft-graph-client`、`@azure/identity`、class-validator/transformer)+ scripts(`start:dev` / `build` / `prisma:generate` / `prisma:migrate` / `seed` / `lint` / `test`)。
  - `tsconfig.json` + `nest-cli.json` + eslint/prettier 就位。
  - `npm install` resolve 成功;`npm run build`(tsc)0 error。
- **Effort estimate**:3h
- **Owner**:AI / Chris

### F2 — 遷入 monorepo `apps/api`(ADR-0001)
- **Spec ref**:`docs/setup.md` 現狀 · ADR-0001 · `docs/architecture.md §4`
- **Acceptance criteria**:
  - root 設 workspace(`apps/*`);`apps/web` 先留空 placeholder。
  - `main.ts` → `apps/api/src/main.ts`;`app.module.ts` → `apps/api/src/app.module.ts`;`src/integration/` → `apps/api/src/integration/`;`seed.ts` → `apps/api/prisma/seed.ts`;`prisma/schema.prisma` → `apps/api/prisma/`。
  - import 路徑 + `nest-cli.json` root 對得返;`app.module.ts` import 生效。
- **Effort estimate**:1.5h
- **Owner**:AI

### F3 — PrismaModule + 空 module stubs
- **Spec ref**:`prisma/schema.prisma`、`docs/architecture.md §4`
- **Acceptance criteria**:
  - `PrismaModule`(`@Global`)+ `PrismaService`(`onModuleInit` connect / `enableShutdownHooks`)。
  - `LicenseModule` / `FulfilmentModule` 空 shell(`@Module({})`),令 `app.module.ts` compile。
- **Effort estimate**:2h
- **Owner**:AI

### F4 — 本機 infra(docker-compose)
- **Spec ref**:`docs/setup.md`
- **Acceptance criteria**:
  - `docker-compose.yml`(postgres + redis,對齊 `.env.example` 嘅 `DATABASE_URL`)。
  - `docker compose up -d` → `prisma:migrate` 建表成功 → `seed` 出 23 OpCos + admin user。
- **Effort estimate**:2h
- **Owner**:AI / Chris

### F5 — Boot 驗證
- **Acceptance criteria**:
  - `npm run start:dev` boot 無 error;`GET /docs/api` → 200(OpenAPI UI)。
- **Effort estimate**:1h
- **Owner**:AI

## 3. Success Criteria(Phase Gate)

| # | Criterion | Target | Measure | Block closeout? |
|---|---|---|---|---|
| G1 | Build passes | 0 error | `npm run build` | Yes |
| G2 | App boots + OpenAPI serves | HTTP 200 | `curl -sf http://localhost:3000/docs/api` | Yes |
| G3 | DB migrate + seed | 23 OpCos + admin | `npm run prisma:migrate && npm run seed` | Yes |
| G4 | Lint clean | 0 warning | `npm run lint` | No |

## 4. Risks(Phase-Specific)

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Dependency 版本不相容(Nest / Graph SDK / Prisma) | Med | Med | Node 20 + 各套件 latest stable;鎖 lockfile |
| R2 | Prisma ↔ Postgres 連線 / migration config | Med | Med | 先 `prisma migrate dev` 本機驗;`.env` DATABASE_URL 對齊 compose |
| R3 | 加新 dep 觸發 H2 | Low | Low | package.json 內 deps 屬 bootstrap 既定 stack(DESIGN §4.4 已 lock),非新 vendor;超出 lock 表先 STOP+ADR |

## 5. Day-by-Day Breakdown(rough)

| Day | Date | Focus | Deliverables targeted |
|---|---|---|---|
| D1 | 2026-07-09 | package.json + tsconfig + nest-cli + 佈局歸位 | F1, F2 |
| D2 | 2026-07-10 | PrismaModule + stubs + docker-compose | F3, F4 |
| D3 | 2026-07-11 | migrate + seed + boot 驗證 + lint | F4, F5, G1-G4 |

## 6. Dependencies on Prior Phase

N/A — first phase。

## 7. Plan Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-09 | Initial plan | 框架落地首個 phase | Chris Lai |
| 2026-07-09 | 併入 monorepo:後端遷入 `apps/api`(F2 改)+ scope 提及 `apps/web` 預留 | ADR-0001(前端入 repo)approved,W01 需對準 monorepo 佈局免起錯 | Chris Lai |

---

**Lifecycle reminder**:呢份 plan locked after status=active。重大 deviation 入第 7 節 changelog,小 detail 變動可直接 inline edit。
