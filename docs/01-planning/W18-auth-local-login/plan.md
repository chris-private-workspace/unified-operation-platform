---
phase: W18-auth-local-login
name: "AUTH-4a — local password login core (dual-provider AppUser · argon2 · local JWT · dual-issuer guard)"
sprint_week: W18
backlog_id: AUTH-4a
start_date: 2026-07-13
end_date: 2026-07-13
status: closed           # draft | active | closed — D1-D6 完成,G1-G7 全過（argon2 首閘過;api 100→109 · web 24→25;live login 端到端 backend+FE + dev-bypass regression）
spec_refs:
  - docs/adr/0005-local-password-auth.md（Accepted — 本 phase = 首個交付 AUTH-4a）
  - docs/adr/0002-entra-jwt-validation.md（Entra guard，dual-issuer 由此擴充）· 0003-msal-frontend-sso.md（前端 SSO，本地 session 與之並存）
  - apps/api/src/auth/jwt-auth.guard.ts（現有 guard）· prisma/schema.prisma（AppUser / Role）
  - apps/web/src/pages/login.tsx（stub email/password form）· lib/api.ts（authHeader）
  - CLAUDE.md §5 H1（schema + auth 架構）/ H2（argon2）/ H4（密碼/secret/PII）/ H5（登入 critical-path test）
prior_phase: W17-fe-assets-platform
---

# Phase W18 — AUTH-4a（本地密碼登入核心）

> **Plan version**：1.0 · **Owner**：Chris Lai · **ADR**：0005（Accepted）
> **緣起**：真 SSO e2e（AUTH-2b）卡 IT app reg，本地只有 dev-bypass（非登入）。Chris 要本地帳號登入（dev + 永久，非 SSO-only）→ ADR-0005。本 phase = ADR 首個交付：**本地帳號端到端登入**，重用既有 role/scope/guard stack。
> **本 phase 觸 H1/H2/H4 —— 已由 ADR-0005 解鎖**。scope = 核心登入；user 管理（4b）/ 密碼生命週期（4c）另 phase。

## 0. 第一風險閘（G1，未過唔建其他嘢 — H7）
- **`npm i argon2` 喺本機（Windows + 公司 proxy）裝得成 + `require('argon2')` load 到 + hash/verify round-trip 通**。若被 proxy 封 prebuilt / native build fail → 流動網路 workaround（同 Prisma R1）；真裝唔到 → STOP 返嚟傾 fallback（bcryptjs）。**驗成功先做 D2+**。

## 1. Scope

### In
- **Schema migration**（H1）：`AppUser` — `entraOid` 由 required → **`String? @unique`**；加 `passwordHash String?`；加 `authProvider String @default("entra")`（existing rows → 'entra'）。`prisma migrate dev`。
- **argon2**（H2）：新 runtime dep；`argon2id`（lib 安全 default）。
- **`POST /auth/login`**（`@Public`）：body = { email, password } → 查 active 且 `authProvider='local'` AppUser by email → `argon2.verify` → 簽**本地 JWT**（HS256 · `AUTH_JWT_SECRET`（`getOrThrow`，缺 fail-fast）· claims `{ sub, iss:'uop-local', role, exp ~8h }`）→ 回 `{ accessToken, expiresIn, user(me shape，**無 passwordHash**) }`。失敗（無此人/錯密碼/非 local/inactive）→ **401 通用訊息**（不透露帳號存在與否）。H4：password/hash/token/secret 不 log。
- **Guard dual-issuer**（H1）：`JwtAuthGuard` decode（未驗）看 `iss` — `'uop-local'` → HS256 驗 `AUTH_JWT_SECRET` → resolve by `sub`（AppUser.id）；否則現有 Entra RS256/JWKS 路。dev-bypass 不變。
- **Seed 本地 admin**：`seed.ts` 建一個 `authProvider='local'` ADMIN（email e.g. `admin@local`，`passwordHash` = argon2(`LOCAL_ADMIN_INITIAL_PASSWORD` env)）；env 未設 → skip + log 提示（**不 hardcode 密碼**，H4）。
- **前端**：Login `email/password` form 接 `POST /auth/login` → 存 local token（localStorage）+ user → `authHeader()` 分支（有 local token → 帶 local Bearer；否則 MSAL 路）→ 入 app；sign-out 清 local token。SSO button 保留。
- **Tests（H5）**：login verify 成功 / 錯密碼 401 / 非-local·inactive 401 / 回應無 passwordHash；guard dual-issuer（local token resolve by sub · Entra 路仍通 · 壞 local token 401）；authHeader 本地分支（FE unit）。

### Out（→ 4b / 4c）
- admin 建/管本地 user + role/scope 設定 + Users&roles UI（**AUTH-4b**）。
- 自助改密碼 / admin 重設 / lockout / rate-limit / 密碼 policy / **密碼重設 email transport**（**AUTH-4c**，另 H2 sub-decision）。
- refresh token（4c）· httpOnly cookie hardening（4c）。

## 2. Approach
- **Migration**：改 `schema.prisma` → `migrate dev --name auth-local-provider`。
- **`AUTH_JWT_SECRET`**：`.env`（gitignored）加 dev 值；`ConfigService.getOrThrow` when local auth used；**絕不 commit**。
- **`local-jwt.ts`** helper / service：sign（HS256 + claims）。`auth.service` `login()`：查用戶 + argon2.verify + sign。
- **`auth.controller`**：`POST /auth/login`（`@Public`，`LoginDto` class-validator）。
- **Guard**：加 `iss` 分岔（decode `jwt.decode` 未驗 → 讀 iss）；`verifyLocal`（HS256）+ `resolveLocalUser(sub)`。
- **H4 audit**：確保無任何 endpoint 回傳 raw AppUser（含 passwordHash）；login/me 一律 map me-shape。
- **前端**：`lib/auth/local-session.ts`（localStorage get/set/clear token+user）；`login.tsx` form onSubmit → `apiPost('/auth/login')` → set session → navigate；`authHeader()` 先查 local session token；`use-current-user` / sign-out 認 local session；`require-auth` 認 local session 為已登入。

## 3. Deliverables
- **D1** — argon2 install-verify（G1）+ schema migration + `AUTH_JWT_SECRET` config + `local-jwt` sign helper。
- **D2** — `POST /auth/login`（DTO + `auth.service.login` argon2.verify + sign）+ AuthModule wiring。
- **D3** — `JwtAuthGuard` dual-issuer（iss 分岔 + verifyLocal + resolve by sub）+ seed 本地 admin。
- **D4** — 前端 Login form 接 + `local-session` + `authHeader` 分支 + sign-out + require-auth/identity 認 local。
- **D5** — tests（api：login 4 case + guard dual-issuer 3 case + hash 不外露；web：authHeader local 分支）。
- **D6** — verify（build/lint/test + **live**：本地登入 → token → guarded 200 → /me local user → sign-out；錯密碼 401；Entra/dev-bypass 路 regression）+ closeout。

## 4. Phase Gates
- **G1** argon2 裝成 + hash/verify round-trip 通（首閘）。
- **G2** 本地登入端到端（login → local JWT → guarded endpoint 200 → /me 顯本地 user → sign-out）—— live。
- **G3** 錯密碼 / 非-local / inactive → 401；回應 + log 無 passwordHash/token（H4）。
- **G4** Entra 路 + dev-bypass regression（dual-issuer 唔破現有）—— live（dev-bypass 200）+ guard test（Entra token 仍 resolve）。
- **G5** H5 test：login verify + guard dual-issuer（api）+ authHeader 本地分支（web）。
- **G6** api build 0 + web build 0 + lint 0 + test green（api 100→+N · web 24→+N）。
- **G7** H4：`AUTH_JWT_SECRET` from env（`.env` 不 commit）· 密碼/hash/token/secret 不 log · 無 endpoint 回 raw AppUser。

## 5. Decisions（ADR-0005，已 approve）
- dual-provider `AppUser`（entraOid nullable + passwordHash + authProvider）· argon2id · 本地 JWT HS256 + `AUTH_JWT_SECRET` · ~8h 效期（refresh 留 4c）· 前端 localStorage · seed admin 初始密碼 env `LOCAL_ADMIN_INITIAL_PASSWORD`。

## 6. Risks / 誠實限制
- **argon2 native-build**（Windows/proxy）= 首閘風險（G1）；裝唔到 → 流動網路 / fallback 傾。
- localStorage token = XSS 面（內部工具接受，cookie hardening 留 4c）。
- ~8h 無 refresh → 到期重新登入（4c 加 refresh）。
- 本 phase 只核心登入,user 管理 / 改密碼 UI 仍缺（4b/4c）—— Login 只認 seed 出嚟嘅本地 admin。

## 7. Changelog
- 1.0（2026-07-13）— active；ADR-0005 Accepted。G1 argon2 install-verify 為首閘。開 D1。
- 1.1（2026-07-13）— closed；D1-D6 同日完成,G1-G7 全過。argon2 首閘過（native-build 冇踩坑）;api 100→109 · web 24→25 test;live login 端到端（backend curl + FE browser：login→token→guarded 200→/me→sign-out;錯密碼 401 + FE error）+ dev-bypass regression 200。踩坑：root `npm install` 沖走 Prisma client → 必 `prisma generate`;stray apps/api lockfile → root reconcile。carry-over AUTH-4b（user 管理）/ 4c（密碼生命週期）登 BACKLOG。
