---
phase: W01-backend-bootstrap
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: in-progress    # in-progress | closed
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

### Blockers 🚧
- **🔴 Prisma engine download 被公司 proxy 阻擋**:`binaries.prisma.sh` 回 **503**(curl 亦建立唔到 secure connection),native query/schema engine download 唔到。試過 ~10 次 + npmmirror mirror 均失敗。
  - **影響**:`prisma generate`(完整 client)/ `prisma migrate`(G3)/ `seed`(G3)/ `start:dev` boot(G2,PrismaService `$connect` runtime 需 engine)全部**卡住**。
  - **需外部處理**:IT allowlist `binaries.prisma.sh`,或用可達 `PRISMA_ENGINES_MIRROR`,或喺無 SSL-inspection 網絡跑一次 `npm run prisma:generate`。engine 一到手,migrate/seed/boot 應即通(scaffold 已就緒)。
  - 已登記 `RISK_REGISTER.md`(R1)。

### Commits
- (下面 scaffold commit)

---

## Retro(填於 phase 結束)

(待填)

---

**End of W01 progress**
