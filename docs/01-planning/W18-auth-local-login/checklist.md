---
phase: W18-auth-local-login
status: closed
---

# W18 — AUTH-4a — Checklist

> ADR-0005 Accepted。本地密碼登入核心。G1 argon2 install 首閘過。D1-D6 完成,G1-G7 全過。

## D1 — 首閘 + schema + config ✅
- [x] **G1**：`npm i argon2` 裝成 + load + hash/verify round-trip（native-build 冇踩坑）
- [x] schema migration `20260713100426_auth_local_provider`（entraOid→String? · +passwordHash · +authProvider default entra）
- [x] `AUTH_JWT_SECRET`（inline/env 驗,不 commit；setup.md 文件化）+ LocalJwtService getOrThrow lazy
- [x] `local-jwt.service.ts`（HS256 + iss uop-local + 8h）

## D2 — login endpoint ✅
- [x] `LoginDto` / `LoginResultDto`
- [x] `auth.service.login()`（active+local+hash gate → argon2.verify → sign → me-shape 無 hash;失敗通用 401）
- [x] `POST /auth/login`（`@Public`）+ AuthModule wiring

## D3 — guard dual-issuer + seed ✅
- [x] `JwtAuthGuard` dual-issuer（iss uop-local → HS256 + resolve by sub;否則 Entra;Entra optional + no-provider fail-fast）
- [x] seed 本地 admin（admin@uop.local，env `LOCAL_ADMIN_INITIAL_PASSWORD`，未設 skip）
- [x] H4 audit：login/me map me-shape，無 endpoint 回 raw AppUser（passwordHash 排除）

## D4 — 前端 ✅
- [x] `lib/auth/local-session.ts`（localStorage）+ `use-sign-out.ts`
- [x] `login.tsx` form 接 `POST /auth/login`→setLocalSession→navigate;錯誤 danger-soft
- [x] `authHeader()` local token 優先
- [x] `use-current-user`(local identity+canSignOut) / sign-out(sidebar+top-bar useSignOut) / `require-auth`(local session=authed)

## D5 — tests（H5）✅
- [x] api `auth.service.spec`（5：成功無hash / 錯密碼401 / 非-local401 / inactive401 / 無帳401）
- [x] api `jwt-auth.guard.spec` +4（local resolve by sub · 壞 local 401 · Entra-not-configured 401 · no-provider fail-fast）
- [x] web `api.test` +1（local token 優先分支）

## D6 — verify + closeout ✅
- [x] api build 0 + web build 0 + lint 0 + test green（api 100→**109** · web 24→**25**）
- [x] **live**（真 HTTP + browser）：local-only mode → login（admin@uop.local）→ token → guarded 200 → /me → sign-out;**錯密碼 401 + FE error**;dev-bypass 200 regression
- [x] progress retro · plan closed · BACKLOG（AUTH-4a ✅ + 4b/4c）· memory · commit（待指示）

## Phase Gate（plan §4）
- [x] G1 argon2 裝成 + round-trip
- [x] G2 本地登入端到端 live（backend + FE）
- [x] G3 錯密碼/非-local/inactive 401 + 無 hash 外露
- [x] G4 Entra/dev-bypass regression
- [x] G5 H5 test（login + guard + authHeader）
- [x] G6 build 0 + lint 0 + test green
- [x] G7 H4（AUTH_JWT_SECRET env · 不 log secret/hash · 不回 raw AppUser）

## Cross-Cutting
- [x] 每 commit references progress Day-N（R2）— commit 待指示
- [x] ADR-0005 Accepted（H1/H2/H4 已解鎖）
- [x] BACKLOG 同步（R7：AUTH-4a ✅ + 4b/4c）
- [x] progress closeout + status closed
