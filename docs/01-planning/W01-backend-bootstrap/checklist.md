---
phase: W01-backend-bootstrap
plan_ref: ./plan.md
status: in-progress    # in-progress | complete
last_updated: 2026-07-09
---

# Phase W01 — Checklist

> Atomic checkbox(每 item ≤ 1–2 hour effort)。
> AI tick 完成嘅 item;唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。
> ⚠️ plan status 仲係 `draft` —— 等 Chris approve flip `active` 先正式開工(R1）。

## F1 — Build / tooling config

- [ ] 建 `package.json`(deps + scripts:start:dev / build / prisma:generate / prisma:migrate / seed / lint / test)
- [ ] 建 `tsconfig.json` + `tsconfig.build.json` + `nest-cli.json`
- [ ] 建 eslint + prettier config
- [ ] `npm install` resolve 成功
- [ ] verify:`npm run build` 0 error(G1)

## F2 — 檔案佈局歸位

- [ ] move `main.ts` → `src/main.ts`
- [ ] move `app.module.ts` → `src/app.module.ts`
- [ ] move `seed.ts` → `prisma/seed.ts`
- [ ] 修正 import 路徑,`src/integration/` 對得返

## F3 — PrismaModule + 空 module stubs

- [ ] `PrismaModule`(`@Global`)+ `PrismaService`(connect / shutdown hook)
- [ ] `LicenseModule` 空 shell
- [ ] `FulfilmentModule` 空 shell
- [ ] verify:`app.module.ts` compile 通過

## F4 — 本機 infra(docker-compose)

- [ ] `docker-compose.yml`(postgres + redis,對齊 `.env.example`)
- [ ] `docker compose up -d` → `pg_isready` + `redis-cli ping` OK
- [ ] verify:`npm run prisma:migrate` 建表成功
- [ ] verify:`npm run seed` → 23 OpCos + admin user(G3)

## F5 — Boot 驗證

- [ ] `npm run start:dev` boot 無 error
- [ ] verify:`curl -sf http://localhost:3000/docs/api` → 200(G2)
- [ ] verify:`npm run lint` clean(G4)

---

## Cross-Cutting

- [ ] All deliverables committed to git(⚠️ 需先 `git init` —— 見 CLAUDE.md §4）
- [ ] All open-question status changes reflected in decision tracker(R4)
- [ ] All architectural-adjacent decisions documented as ADR(per CLAUDE.md §5)
- [ ] Pending / next-candidate changes synced to `BACKLOG.md`(R7)
- [ ] `progress.md` retro section written
- [ ] `progress.md` frontmatter status flipped to `closed`
- [ ] Phase W02(module C）kickoff trigger noted in retro

---

**Lifecycle reminder**:呢份 checklist 隨 plan deliverables 衍生。新加 deliverable 必須先入 plan + changelog,然後再加 checklist item。
