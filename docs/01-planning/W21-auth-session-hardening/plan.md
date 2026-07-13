---
phase: W21-auth-session-hardening
name: "AUTH-4c-B — refresh token + httpOnly cookie session hardening (rotating refresh · cookie access · /auth/refresh · /auth/logout · guard cookie 路)"
sprint_week: W21
backlog_id: AUTH-4c-B
start_date: 2026-07-13
end_date: 2026-07-14
status: closed           # draft | active | closed — D1-D5 完成,G1-G10 全過（api 140→157 · web 40→48;live curl 端到端 cookie 流程 + browser proxy 轉發/入app/sign-out）
spec_refs:
  - docs/adr/0006-password-lifecycle-session-hardening.md §7（session hardening — 本 phase = 4c-B slice；Accepted，架構方向已批）
  - docs/adr/0005-local-password-auth.md（本地認證 stack，session model 由此 defer）· 0002（Entra guard）· 0003（MSAL FE）
  - docs/01-planning/W20-auth-password-lifecycle/（4c-A — 本 phase 建喺其上）
  - apps/api/src/auth/{auth.service,auth.controller,local-jwt.service,jwt-auth.guard}.ts · main.ts · prisma/schema.prisma（加 RefreshToken）
  - apps/web/src/lib/{api.ts,auth/local-session.ts,auth/use-sign-out.ts,auth/use-current-user.ts} · components/auth/require-auth.tsx · pages/login.tsx
  - CLAUDE.md §5 H1（schema + session 架構）/ H2（cookie-parser dep）/ H4（cookie / refresh / secret）/ H5（refresh critical-path test）/ H6（無 UI 退化）
prior_phase: W20-auth-password-lifecycle
---

# Phase W21 — AUTH-4c-B（refresh token + httpOnly cookie session hardening）

> **Plan version**：1.1（closed）· **Owner**：Chris Lai · **ADR**：0006 §7（Accepted，架構方向已批；本 phase = §7 實作）
> **緣起**：4c-A 交付密碼生命週期,但 session 仍係 **localStorage Bearer + 8h 硬到期**（ADR-0005 明列 4c hardening tradeoff）。本 phase = ADR-0006 §7:本地 session 由 localStorage → **httpOnly + SameSite=Strict cookie**,加 **rotating refresh token**,收 XSS token 面 + 免 8h 硬登出。
> **範圍界線**:**只郁本地 session model**。**Entra Bearer 路不變**（MSAL 攞 token 落 Authorization header）、**dev-bypass 不變**。呢個係 working auth 嘅非-trivial refactor,故 ADR-0006 特意隔離做單獨 phase（W21）。

## 0. 前置 gate（未過唔 code）
- **ADR-0006 §7 已 Accepted**（架構方向 sign-off 2026-07-13）。✅
- **4 決策已拍板（AskUserQuestion 2026-07-13,見 §5）**：cookie-parser · 15min/7d · 存 profile · SameSite=Strict only。✅
- **plan approve**（Chris sign-off 本 plan scope + gates）→ 開 D1。**← 待**

## 1. Scope

### In（4c-B）
- **Dep（H2,Chris approve）**：`cookie-parser`（runtime）+ `@types/cookie-parser`（dev）。ADR-0006 §7 cookie 讀取實作。`main.ts` `app.use(cookieParser())`。
- **Schema（H1 additive migration）**：`RefreshToken` 表（`id` cuid / `userId` + relation AppUser onDelete Cascade / `tokenHash` unique / `expiresAt` / `revokedAt?` / `createdAt`,`@@index([userId])`）。AppUser 加 `refreshTokens RefreshToken[]`。**只存 hash,絕不存 raw token**（H4）。
- **Token 策略（Chris:15min / 7d）**：access = 15min HS256（改 `LocalJwtService` EXPIRES_IN）;refresh = 7d,opaque high-entropy random（`crypto.randomBytes(32)`,node 內建）,**SHA-256 hash 存**（高熵 random 唔需 argon2 慢 hash）,**rotating**（refresh 時 revoke 舊發新）。
- **Cookie**：`uop_access`（httpOnly / SameSite=Strict / `secure` = prod only / path `/` / maxAge 15min）· `uop_refresh`（同上,path `/`,maxAge 7d）。**dev localhost http 唔可 Secure**（browser 拒）→ `secure` 依 `NODE_ENV==='production'`。寫 cookie 用 express 內建 `res.cookie()`（`@Res({ passthrough:true })`）。
- **後端 endpoint**（`auth.controller` + 新 `RefreshTokenService`）：
  - `POST /auth/login`（改）：驗證不變 → **set `uop_access`+`uop_refresh` cookie** → response body 改回 `{ user }`（**唔再回 raw accessToken/expiresIn**;token 只落 cookie,前端存 profile）。
  - `POST /auth/refresh`（@Public,新）：讀 `uop_refresh` cookie → `RefreshTokenService.rotate`（查 hash 未 revoke 未過期 → revoke 舊 → 發新 refresh + 新 access）→ set 兩 cookie → `{ user }`（refresh 失敗 → 401 + 清 cookie）。
  - `POST /auth/logout`（@Public,新）：讀 `uop_refresh` → revoke（即使過期 / 缺失都 idempotent）→ 清兩 cookie → 204。
  - `RefreshTokenService`：`issue(userId)` / `rotate(rawToken)` / `revoke(rawToken)` / `revokeAllForUser(userId)`（改密碼時可全 revoke — 見 §5 決策）。
- **Guard（`jwt-auth.guard`）**：local 路改讀 `req.cookies.uop_access`（Entra `Authorization: Bearer` 路**不變**、dev-bypass **不變**）。routing:**先睇 access cookie → local 路**（verify + `ensurePasswordChanged` + resolveLocalUser）;**否則 header Bearer → Entra 路**;都無 → 401。
- **前端**：
  - `lib/auth/local-session.ts` → **`local-profile.ts`**（存 non-sensitive `LocalProfile`:id/email/displayName/role/opcoScopeId/mustChangePassword,**無 token / expiresAt**;session lifetime 靠 cookie）。`clearMustChangePassword` 保留（改 profile）。
  - `lib/api.ts`：全 fetch 加 `credentials:'include'`;`authHeader` local 路**唔再加 Authorization**（cookie 自動帶）,Entra 路不變;**401 → `POST /auth/refresh` → 成功 retry once**,失敗清 profile + 去 login（一個 refresh-retry wrapper,單次 retry 防 loop）。
  - `pages/login.tsx`：`onLocalLogin` → apiPost login 回 `{ user }` → `setLocalProfile(user)` → navigate（mustChangePassword → require-auth gate 照舊）。
  - `use-sign-out.ts`：local 路 → `POST /auth/logout` → 清 profile → /login（Entra 路 MSAL 不變）。
  - `use-current-user.ts` / `require-auth.tsx`：讀 `getLocalProfile()`（取代 `getLocalSession`）。
- **Tests（H5）**：見 §3 D4。

### Out（→ 4c-C / 其他）
- **per-IP rate-limit**（`@nestjs/throttler`,日後;本 phase per-account lockout 已在 4c-A）。
- **double-submit CSRF token**（Chris:SameSite=Strict only;ADR-0006 §7「選項」,可日後）。
- **email-based reset**（4c-C,🔴 IT Mail.Send）。
- **Entra session 改動**（維持 MSAL Bearer;本 phase 只郁本地路）。
- **refresh 並發 rotation grace window**（低併發內部工具接受單 rotation;誠實限制 §6）。

## 2. Approach
- **Migration**：`schema.prisma` 加 RefreshToken → `migrate dev --name auth-refresh-token` → `prisma generate`。
- **RefreshTokenService**（新,`auth/refresh-token.service.ts`）：`crypto.randomBytes(32).toString('hex')` = raw;`crypto.createHash('sha256')` = 存 hash。issue 寫 row（expiresAt = now+7d）;rotate = 查（tokenHash + revokedAt null + expiresAt>now）→ 揾唔到 throw 401 → revoke 舊（set revokedAt）+ issue 新。**H4**:唔 log raw / hash。
- **cookie helper**（`auth/cookie.ts`）：`setAuthCookies(res, access, refresh)` / `clearAuthCookies(res)`,集中 cookie opts（httpOnly/sameSite/secure/path/maxAge）。
- **auth.controller**：login / refresh / logout 用 `@Res({ passthrough:true })` set/clear cookie;login 沿用 `auth.service.login`（回 user + 內部發 access）改為 controller orchestrate（login → issue refresh + access → set cookie）。
- **guard**：新增 `extractAccessCookie(req)`;canActivate routing 調整（cookie-first for local,header for Entra）。`local-jwt.verify` 不變（access 仍 HS256 + iss）。
- **前端**：`local-profile.ts` mirror 舊 API surface（`getLocalProfile`/`setLocalProfile`/`clearLocalProfile`/`clearMustChangePassword`）減少 call-site 改動;`api.ts` 加 `withRefresh` retry;login/sign-out/use-current-user/require-auth 換 import。
- **驗證**：build/lint/test + **live**（登入 set cookie → 15min access → refresh rotate → logout revoke → guard cookie 路 + Entra/dev-bypass regression）。**vite proxy cookie 轉發坑**（changeOrigin + Set-Cookie path/domain）live 驗（memory 已記 proxy 坑）。

## 3. Deliverables
- **D1** — dep（cookie-parser）+ schema migration（RefreshToken）+ `RefreshTokenService` + cookie helper。
- **D2** — 後端：login set-cookie + `POST /auth/refresh`（rotate）+ `POST /auth/logout`（revoke）+ guard cookie 路。
- **D3** — 前端：`local-profile` + api `credentials:'include'` + 401 refresh-retry + login/sign-out/use-current-user/require-auth wiring。
- **D4** — tests（H5）：api（RefreshTokenService issue/rotate/revoke/expire · login set-cookie · refresh endpoint rotate+revoke舊 · logout revoke+清 · guard:cookie local 路 200 / Entra Bearer 不變 / 無 cookie+無 header 401 / dev-bypass 不變）· web（api 401→refresh→retry once · local-profile · sign-out 打 logout）。
- **D5** — verify（build/lint/test + **live**:cookie 登入 · access 過期 refresh rotate · logout revoke · guard 路 · Entra/dev-bypass/4a/4b/4c-A regression）+ ui-design 自檢（login/settings 無退化）+ closeout。

## 4. Phase Gates
- **G1** schema RefreshToken migration applied + cookie-parser wired（`app.use`）。
- **G2** login **live**:set `uop_access`+`uop_refresh`（httpOnly,devtools 見）+ 前端存 profile + 入到 app。
- **G3** refresh **live**:access 過期（或人手清 access cookie）→ 前端 401 → `POST /auth/refresh` → **rotate**（舊 refresh revoke,新 refresh 發）→ 新 access → 請求成功。
- **G4** logout **live**:`POST /auth/logout` → 清兩 cookie + refresh row revokedAt → 再 call 受保護 → 401。
- **G5** guard **live**:local cookie 路 200 · Entra Bearer 路不變 · 無 cookie 無 header 401 · dev-bypass 不變。
- **G6** H4:cookie httpOnly + SameSite=Strict（+prod Secure）· refresh **只存 SHA-256 hash** · rotation revoke 舊 · 唔 log token/cookie/hash · login body 無 raw token。
- **G7** H5 test:RefreshTokenService（issue/rotate/revoke/expire）· refresh/logout endpoint · guard cookie 路 · 前端 refresh-retry。
- **G8** build 0 + lint 0 + test green（api 140→+N · web 40→+N）。
- **G9** H6:login/sign-out/force-change/settings UI 無視覺退化（本 phase 幾乎純 plumbing,無新 UI）· token-only 不涉 · ui-design 自檢過。
- **G10** regression:dev-bypass · Entra · 4a login · 4b CRUD · 4c-A change/reset/force-change/lockout 全部唔破。

## 5. Decisions（4 決策 · AskUserQuestion 2026-07-13 · ADR-0006 §7 實作）
1. **Cookie 讀取 = `cookie-parser`（H2,Chris approve）** —— 觸 H2 新 runtime dep;由 ADR-0006 §7 架構方向涵蓋 + Chris explicit 拍板,commit 標 dep 加入,唔另開 ADR（§7 已係架構決定,cookie-parser 係實現 middleware）。
2. **Token TTL = 15min access + 7d refresh（rotating）** —— OWASP 標準;access 短命窗口細,refresh 7 日內免重登。
3. **前端 identity = 存 non-sensitive profile** —— login 存 user profile（無 token）落 localStorage,UI 唔閃;token 已離 JS（httpOnly cookie）達 XSS-resist 目標。
4. **CSRF = SameSite=Strict only** —— 同源內部工具,double-submit 留日後（ADR「選項」）。

**實作級決策（唔觸 constraint,plan 記錄）**：
- **refresh token = opaque random + SHA-256 hash 存**（非 JWT,非 argon2）—— 高熵 random 唔需慢 hash,revoke/rotate 靠 DB row。
- **cookie path = `/`**（access + refresh 都 `/`）—— 避 vite dev proxy `/api` prefix 令 refresh cookie path `/auth` 唔 match `/api/auth/*` 嘅坑;收窄 path 留待 proxy cookiePathRewrite 日後。誠實 tradeoff:refresh cookie 每 request 帶（httpOnly+Strict 保護）。
- **改密碼時 revoke 全 refresh?** —— **本 phase 唔加**（4c-A changePassword 唔郁 refresh;保持 surgical,session 唔因改密碼即時全登出）。列 §6 誠實限制,可日後。

## 6. Risks / 誠實限制
- **dev localhost http → 唔可 Secure cookie**:`secure` 依 `NODE_ENV`（prod true）;dev 靠 httpOnly + SameSite=Strict（無 Secure）—— 本地驗接受,prod 必 Secure。
- **vite dev proxy cookie 轉發**:`changeOrigin:true` + Set-Cookie domain/path,dev 經 5173→3100,需 live 驗 cookie 帶得到（memory 記 proxy 坑;必要時 proxy 加 cookieDomainRewrite）。
- **refresh 並發 rotation**:低併發內部工具,單 rotation 接受（並發兩個 refresh 可能一個失敗 → 前端 retry / 重登）;grace window 留日後。
- **改密碼 / admin-reset 唔即時 revoke 既有 refresh**:本 phase 唔加（surgical）;被盜 refresh 最多存活 7d 或到手動 logout。列 carry-over。
- **localStorage profile 仍在**:non-sensitive（email/role,無 token）,XSS 攞唔到 token（已達目標）;profile 洩漏低敏,接受。
- **enumeration**:refresh 失敗一律 401 + 清 cookie（唔透露原因）。

## 7. Changelog
- 0.1（2026-07-13）— draft;ADR-0006 §7 Accepted + 4 決策拍板（cookie-parser · 15min/7d · profile · SameSite=Strict）。等 plan approve 開 D1。
- 1.0（2026-07-13）— active;**plan approved（Chris sign-off）**。開 D1（dep + schema migration + RefreshTokenService + cookie helper + access TTL 15min）。
- 1.1（2026-07-14）— closed;D1-D5 同日完成（跨午夜）,G1-G10 全過。additive schema（RefreshToken）+ **1 新 dep（cookie-parser,H2 approve,ADR-0006 §7 實作）**。api 140→157 · web 40→48 test。live:backend curl 端到端（login set httpOnly cookie · rotate 防重放 · logout revoke · force-change gate cookie transport）+ FE browser（**vite proxy Set-Cookie 轉發正常** · UI login 入 app · storageHasJwt false · sign-out effect 401）。**deviation 無**（全依 plan/ADR;`revokeAllForUser` 依 §5 決策 YAGNI 未做 → carry-over）。carry-over 4c-C(email🔴IT)/per-IP rate-limit/改密碼 revoke-all/double-submit CSRF 登 BACKLOG。
