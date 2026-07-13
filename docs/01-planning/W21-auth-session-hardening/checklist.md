---
phase: W21-auth-session-hardening
status: closed
---

# W21 — AUTH-4c-B — Checklist

> ADR-0006 §7。本地 session:localStorage Bearer → httpOnly cookie + rotating refresh token。Entra Bearer / dev-bypass 不變。
> 決策鎖定:cookie-parser(H2 approve) · access 15min/refresh 7d rotating · 前端存 non-sensitive profile · SameSite=Strict only · refresh = opaque random+SHA-256 hash · cookie path '/'。

## D1 — dep + schema + service 基建 ✅
- [x] 加 `cookie-parser` + `@types/cookie-parser`(H2,Chris approve) + `main.ts` `app.use(cookieParser())`
- [x] schema `RefreshToken`(id/userId+relation Cascade/tokenHash unique/expiresAt/revokedAt?/createdAt/@@index userId) + AppUser refreshTokens[] → migration `20260713152214_auth_refresh_token` + `prisma generate`
- [x] `auth/refresh-token.service.ts`(issue/rotate/revoke;randomBytes+SHA-256;只存 hash) — `revokeAllForUser` 唔實作(YAGNI:改密碼 revoke-all 屬 §5 決策「本 phase 唔加」,無 caller)
- [x] `auth/cookie.ts`(setAuthCookies/clearAuthCookies;httpOnly/sameSite Strict/secure=prod/path '/')
- [x] `LocalJwtService` EXPIRES_IN 8h → 15min
- [x] `RefreshTokenService` register 落 `auth.module` + build 0 驗 D1 compile

## D2 — 後端 endpoint + guard ✅
- [x] `POST /auth/login` 改:issue refresh + access → set cookie → body 回 `{ user }`(去 raw token)
- [x] `POST /auth/refresh`(@Public):讀 refresh cookie → rotate(revoke 舊+發新) → set cookie → `{ user }`;失敗 401+清 cookie
- [x] `POST /auth/logout`(@Public):讀 refresh → revoke(idempotent) → 清 cookie → 204
- [x] guard local 路改讀 `req.cookies.uop_access`(cookie-first → local;header Bearer → Entra;都無 401);Entra/dev-bypass/ensurePasswordChanged 不變
- [x] `AuthService` grantSession/refreshSession/logout/buildSessionUser + `SessionGrant` type;`login.dto` LoginResultDto→SessionResponseDto{ user }

## D3 — 前端 wiring ✅
- [x] `lib/auth/local-session.ts` → `local-profile.ts`(存 profile 無 token;get/set/clear/clearMustChangePassword)
- [x] `lib/api.ts`:全 fetch `credentials:'include'`(doFetch) · authHeader local 路去 Authorization · 401→refresh→retry once(single-flight tryRefresh)
- [x] `pages/login.tsx` onLocalLogin:apiPost 回 `{ user }`(SessionResponse) → setLocalProfile → navigate
- [x] `use-sign-out.ts` local 路 → POST /auth/logout → 清 profile → /login
- [x] `use-current-user.ts` / `require-auth.tsx` / `settings.tsx` / `force-password-change.tsx` / `change-password-form.tsx` 讀 getLocalProfile · api-types LoginResponse→SessionResponse

## D4 — tests(H5) ✅
- [x] api `refresh-token.service.spec`(issue · rotate 發新+revoke舊 · revoke · expire→拒 · revoked→拒 · unknown→拒)
- [x] api `auth.controller.spec`(新):login set-cookie · refresh rotate/no-cookie 401+clear/invalid clear+rethrow · logout revoke+清
- [x] api `auth.service.spec`(改):login 加 issue assert · 新 refreshSession(rotate/deactivated 401/invalid propagate) · logout(revoke/no-op)
- [x] api `jwt-auth.guard.spec`(改):cookie local 路 200 · force-change gate via cookie · Entra Bearer 不變 · 無 cookie+無 header 401 · dev-bypass 不變
- [x] web `api.test`(改):authHeader local→no header · refresh-retry(401→refresh→retry / refresh fail→clear / no-profile no-refresh) · web `local-profile.test`(round-trip 無 token/clearMustChange/corrupt)

## D5 — verify + closeout ✅
- [x] api build 0 + web build 0 + lint 0 + test green(api 140→**157** · web 40→**48**)
- [x] **live backend**(真 HTTP curl,inline env NODE_ENV=dev):login→**Set-Cookie httpOnly+SameSite=Strict**(access Max-Age 900 · refresh 604800)+body `{user}`無 raw token · cookie GET /me→**200** · 無 cookie→**401** · refresh→**rotate**(新 refresh≠舊)+新 access · 舊 refresh 重放→**401** · logout→**204+清cookie+revoke**→refresh後 **401** · force-change gate cookie transport(admin create→login→**403**→change 204→**200**)
- [x] **live FE**(browser,vite proxy /api→3100):login via proxy→**/me 200**(vite proxy Set-Cookie 轉發正常,§6 坑無問題)· UI 表單 login→**入 app path '/'**+profile set+**storageHasJwt false**(token 唔喺 localStorage)· app shell+Overview render(cookie round-trip 真數據)· sign-out effect→logout→**/me 401**+profile 清(真 UI dropdown 定位未成,底層 logout endpoint+wiring 已驗)
- [x] `ui-design` skill 自檢(login/app shell 無退化;純 plumbing 無新 UI)
- [x] progress retro · plan closed · BACKLOG · memory · commit(待指示)

## Phase Gate(plan §4)
- [x] G1 schema RefreshToken migration + cookie-parser wired
- [x] G2 login set httpOnly cookie + 前端存 profile + 入到 app(live curl + browser)
- [x] G3 refresh live(rotate:舊 refresh→新 access+新 refresh,舊重放 401)
- [x] G4 logout live(清 cookie+revoke→refresh 後 401 + FE sign-out effect)
- [x] G5 guard live(cookie local 200 / 無 cookie 401 / Entra Bearer+dev-bypass unit-test 綠)
- [x] G6 H4(httpOnly+SameSite=Strict+prod Secure · refresh 只存 SHA-256 hash · rotation revoke 舊 · 唔 log token · login/refresh body 無 raw token)
- [x] G7 H5 test(refresh service/rotate/revoke/expire · controller refresh/logout · guard cookie · FE refresh-retry)
- [x] G8 build 0 + lint 0 + test green(api 157 · web 48)
- [x] G9 H6(login/app shell UI 無退化 · 純 plumbing 無新 UI · ui-design 過)
- [x] G10 regression(force-change gate cookie transport live · dev-bypass/Entra guard unit-test 綠 · 4a/4b/4c-A test 綠)

## Cross-Cutting
- [x] 每 commit references progress Day-N(R2)
- [x] cookie-parser dep 加入 → commit 標(H2,Chris approve,ADR-0006 §7)
- [x] BACKLOG 同步(R7:AUTH-4c-B active → ✅;per-IP rate-limit / double-submit / 改密碼 revoke-all carry)
