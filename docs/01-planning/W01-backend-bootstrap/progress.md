---
phase: W01-backend-bootstrap
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: closed    # in-progress | closed
---

# Phase W01 — Progress

> Daily progress + 結尾 retro。
> 每 commit 必須對應一個 Day-N entry mention(R2 binding rule per PROCESS.md §5)。

---

## Day 0 — 2026-07-09: Kickoff

**Action**:框架落地 + Phase W01 kickoff
- dev-framework skeleton 落地 repo 根(CLAUDE.md / docs 13 層 / .claude / AGENTS.md / CI / hooks 已填)。
- `DESIGN.md` → `docs/02-architecture/licenseops/DESIGN.md`(module 1 spec);`docs/architecture.md` 建平台級 spec。
- Templates copied from `_templates/phase/`;`plan.md` 填好,status=`draft`(**等 Chris approve flip active**)。
- `checklist.md` derived from plan deliverables。
- Carry-over:N/A(first phase)。

**Commit**:`5ff2cae` — `chore: initial baseline — dev-framework onboarding + LicenseOps scaffold`(git init + baseline,含本 phase planning docs)。

**下一步**:Chris approve plan → status `active` → 由 F1 開工。

---

## Day 1 — 2026-07-09

**Chris approve plan → status `active`。開始 F1/F2/F3 scaffold。**
本機工具鏈確認:node v22.21.0 / npm 10.9.4 / docker 29.5.3 + compose v5.1.4 / npm registry 連到 → G1-G4 可本機真實驗證。

### Done
- **F1 build/tooling ✓**:root workspace `package.json`(`apps/*`)+ `apps/api` package.json(deps + scripts)+ tsconfig / tsconfig.build / nest-cli / .eslintrc / .prettierrc。`npm install`(767 pkgs)。
- **F2 monorepo ✓**:後端 `git mv` 遷入 `apps/api/`(`src/` + `prisma/`);`apps/web` placeholder(package.json + README)。import 路徑生效(build 通過為證)。
- **F3 modules ✓**:`PrismaModule`(@Global)+ `PrismaService`(connect/shutdown hook)+ `LicenseModule` / `FulfilmentModule` 空殼。`app.module` compile 通過。
- **F4 infra(部分)✓**:`docker-compose.yml`(postgres+redis);兩容器 **healthy**(postgres 改 host port **5433** 避開既有 5432;redis PONG)。
- **Gate G1 build ✓**:`npm run build` 0 error,`apps/api/dist/main.js` 產出。
- **Gate G4 lint ✓**:`eslint` 通過(修咗 graph.service.ts 一個 prettier 格式)。

### Decisions / Open-Questions Resolved
- Node runtime:本機 v22(≥20 滿足);`engines >=20`。
- Env 位置:`.env.example` 遷入 `apps/api/`(monorepo 慣例,api 自己讀 cwd `.env`)。
- Postgres host port **5433**(避開機器既有 5432)→ `DATABASE_URL` 對齊。
- TLS:公司 SSL inspection → 用 `NODE_EXTRA_CA_CERTS=C:/Users/CLai03/ricoh-ca.pem`(安全,對公司 CA 驗證,非關 TLS)。

### Blockers 🚧 → ✅ 已解決
- **Prisma engine CDN 阻擋**:Chris 轉**流動網路**跑一次 `prisma generate` + `migrate dev --name init` + `seed` + `start:dev` —— engine 成功 download 並 cache 落 `node_modules`(query + migration engine 都有)。返公司網後用本機 cache,唔再掂 CDN。
  - RISK R1 → 🟡 Mitigating(workaround = engine 已 cache;但將來 clean reinstall 仍會撞,長遠靠 IT allowlist)。

### Done(續)—— G2/G3 unblock 後
- **F4 migrate + seed ✓ (G3)**:migration `20260709070246_init` 建咗 9 個 domain 表;seed 出 **23 OpCos + admin**(`chris.lai@rapo.com.hk`/ADMIN)。DB 實查確認。
- **F5 boot ✓ (G2)**:`node dist/main.js` boot 成功、`GET /docs/api → HTTP 200`(驗 3 次)。本機 3000 俾 Langfuse 佔 → `apps/api/.env` 設 `PORT=3100`(machine-specific,gitignored)。
- Prisma client 由 stub(3989 B)變完整(712 KB);native engine cached。

### Commits
- (下面 scaffold commit)

---

## Retro(填於 phase 結束)

### What worked
- `git mv` 保留歷史;`app.module.ts` 原有 import 路徑啱啱對準 `src/` 佈局,遷入 `apps/api/src` 後零改動即 compile。
- Gate 分層:build/lint 唔靠網絡先過(G1/G4),隔離出 Prisma engine 先係唯一 blocker。

### What didn't work / unexpected friction
- **公司 SSL inspection + proxy 封 `binaries.prisma.sh`**:先 self-signed cert(靠 `ricoh-ca.pem` + `NODE_EXTRA_CA_CERTS` 解決),後 503 硬封(只能轉流動網路繞)。
- **Port 3000 俾 Langfuse 佔** + **5432 俾既有 Postgres 佔** → 分別改 `PORT=3100`、postgres host `5433`。
- git-bash background redirect 擷取 boot log 唔穩(唔影響驗證,靠 curl 200 為證)。

### Surprises / discoveries
- 本機已有另一個 Postgres(5432)+ Langfuse(3000)長駐 → 之後 phase 要留意 port。
- Prisma 需要**兩個** engine(query + migration),兩個都要喺流動網路 cache。

### Carry-overs to 下一個 phase
- **RISK R1**(🟡):Prisma engine CDN 長遠靠 IT allowlist;clean reinstall 前提醒轉流動網路。
- Auth guard 未做(controllers unguarded);module C/D 業務邏輯未做 —— 見 BACKLOG。
- `apps/web` 得 placeholder。

### ADR triggers
- 無新 ADR(monorepo 決定早喺 ADR-0001;本 phase 純執行)。

### Phase Gate result
- **G1 build:Pass**(`nest build` → `dist/main.js`)
- **G2 boot + `/docs/api` 200:Pass**(HTTP 200 ×3)
- **G3 migrate + seed:Pass**(9 表 + 23 OpCos + admin)
- **G4 lint:Pass**(eslint exit 0)

### Phase status
- Frontmatter status → `closed`。
- BACKLOG synced(W01 → 完成)。
- 下一個 phase kickoff trigger:Chris 揀 **W02 = module C(catalog + 對帳)** 定 **第一個前端 phase(app shell + token/theme)**。

---

**End of W01 progress**
