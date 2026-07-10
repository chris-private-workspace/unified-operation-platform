---
phase: W09-auth-backend-guards
status: active
---

# W09（AUTH-1）— Checklist（daily tick）

> 對應 `plan.md` deliverables。approve 前唔 tick（R1）。

## D0 — ADR-0002 token 驗證策略（H2/R5）
- [x] `docs/adr/0002-entra-jwt-validation.md`（Context→Decision→Alternatives→Consequences→References;microsoft-docs 核實 v2.0 aud/iss/JWKS/RS256）
- [x] `docs/adr/README.md` index 加行;Status Accepted

## D5 — 新 dep（H2,已 approve）
- [x] `apps/api` 加 `jwks-rsa` ^4.1.0 + `jsonwebtoken` ^9.0.3（+ `@types/jsonwebtoken` ^9.0.10 dev）
- [x] lock 更新;ADR 記錄

## D1 — Auth module:JWT guard + AppUser resolution（H5）
- [x] `src/auth/` module scaffold（public/roles/current-user decorators + 2 guards + module）
- [x] `JwtAuthGuard`：Bearer → JWKS 驗簽 + iss/aud/exp → resolve/upsert `AppUser`（by entraOid,更新 lastLoginAt）→ `request.user`
- [x] 缺/壞 token → 401（UnauthorizedException）
- [x] Dev-bypass：`AUTH_DEV_BYPASS==='true'` → 注入 seed ADMIN（findFirst role=ADMIN,cache;無驗證 + 啟動 warning）
- [x] `@CurrentUser()` param decorator
- [x] config 經 `getOrThrow`（ENTRA_TENANT_ID / ENTRA_API_AUDIENCE;`AUTH_DEV_BYPASS` optional `get`）;H4 唔 log token/secret/entraOid（只 log flag + 失敗 reason）

## D2 — RolesGuard + decorators + 全域 wire
- [x] `@Roles(...Role[])` + `RolesGuard`（reflector metadata → request.user.role;唔夠 → 403）
- [x] `@Public()` decorator（skip JWT + role guard）
- [x] `app.module` 掛 `APP_GUARD`（JwtAuthGuard → RolesGuard 次序，via AuthModule）

## D3 — 落 controller + swagger public
- [x] `license.controller` + `fulfilment.controller` 加 `@Roles(ADMIN, REGIONAL)`（移除 `TODO(auth)`）
- [x] swagger `/docs/api` 天然唔經 guard chain（live 驗 200）;`main.ts` `.addBearerAuth()` + `@ApiBearerAuth()`

## D4 — 測試（H5）⭐
- [x] `JwtAuthGuard` spec（valid→upsert+user / missing·invalid·no-oid→401 / dev-bypass→ADMIN·no-admin→401 / @Public→skip）
- [x] `RolesGuard` spec（no-roles/role-match→pass / role-mismatch·無 user→403 / @Public→pass）
- [x] controller-guard regression（`controllers-guarded.spec`:兩 controller @Roles=[ADMIN,REGIONAL]）
- [x] 實證 fails-before（暫神經 missing-token throw → 「401 missing」test red → 還原）
- [x] api 全 suite 綠（42 → **56**）;JWKS/verify 一律 mock

## Phase Gate（plan §5）
- [x] G1 build（nest build 0 error）· G2 未授權→401（live:drift/requests/reconcile 無 token 401 · swagger 200）/wrong-role→403（unit）· G3 授權通過（bypass on 200）· G4 dev-bypass 令現有流程不破（drift 200 len1014 + 56 test）
- [x] G5 test（guard specs + fails-before,56 全綠）· G6 ADR-0002 Accepted · G7 H4（無敏感 log,config getOrThrow）· G8 lint clean

## Closeout
- [x] plan status → closed · progress retro · BACKLOG 同步（AUTH-1 完成 + AUTH-2/3 carry）
- [x] SESSION_SUMMARY + memory 更新（+ MEMORY.md index）
- [x] commit（`bd49dcc`）· **push 待用戶指示**
