---
phase: W01-backend-bootstrap
plan_ref: ./plan.md
status: complete    # in-progress | complete
last_updated: 2026-07-09
---

# Phase W01 — Checklist

> Atomic checkbox(每 item ≤ 1–2 hour effort)。
> AI tick 完成嘅 item;唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。
> ⚠️ plan status 仲係 `draft` —— 等 Chris approve flip `active` 先正式開工(R1）。

## F1 — Build / tooling config

- [x] 建 `package.json`(deps + scripts:start:dev / build / prisma:generate / prisma:migrate / seed / lint / test)
- [x] 建 `tsconfig.json` + `tsconfig.build.json` + `nest-cli.json`
- [x] 建 eslint + prettier config
- [x] `npm install` resolve 成功(767 pkgs)
- [x] verify:`npm run build` 0 error(G1 ✓,`dist/main.js` 產出)

## F2 — 遷入 monorepo `apps/api`(ADR-0001)

- [x] root 設 workspace(`apps/*`);`apps/web` 留 placeholder
- [x] move `main.ts` / `app.module.ts` / `src/integration/` → `apps/api/src/`
- [x] move `seed.ts` → `apps/api/prisma/seed.ts`;`prisma/schema.prisma` → `apps/api/prisma/`
- [x] 修正 import 路徑 + `nest-cli.json` root,`app.module.ts` import 生效(build 通過為證)

## F3 — PrismaModule + 空 module stubs

- [x] `PrismaModule`(`@Global`)+ `PrismaService`(connect / shutdown hook)
- [x] `LicenseModule` 空 shell
- [x] `FulfilmentModule` 空 shell
- [x] verify:`app.module.ts` compile 通過(build ✓)

## F4 — 本機 infra(docker-compose)

- [x] `docker-compose.yml`(postgres + redis;postgres host port 5433 避開既有 5432)
- [x] `docker compose up -d` → `pg_isready` + `redis-cli ping` OK(兩容器 healthy)
- [x] verify:`prisma migrate dev --name init` 建表成功(9 domain 表;engine 流動網路 cache 後)
- [x] verify:`npm run seed` → 23 OpCos + admin user(G3 ✓,DB 實查確認)

## F5 — Boot 驗證

- [x] `node dist/main.js` boot 無 error(Prisma 連到 DB)
- [x] verify:`curl -sf http://localhost:3100/docs/api` → 200(G2 ✓,驗 3 次;3000 俾 Langfuse 佔 → PORT=3100)
- [x] verify:`npm run lint` clean(G4 ✓)

---

## Cross-Cutting

- [x] All deliverables committed to git(scaffold `6ca5e0c` + closeout commit)
- [x] All open-question status changes reflected in decision tracker(R4;本 phase 無 OQ 變動)
- [x] All architectural-adjacent decisions documented as ADR(ADR-0001 已存在;本 phase 純執行,無新 ADR)
- [x] Pending / next-candidate changes synced to `BACKLOG.md`(R7)
- [x] `progress.md` retro section written
- [x] `progress.md` frontmatter status flipped to `closed`
- [x] Phase W02(module C)kickoff trigger noted in retro

---

**Lifecycle reminder**:呢份 checklist 隨 plan deliverables 衍生。新加 deliverable 必須先入 plan + changelog,然後再加 checklist item。
