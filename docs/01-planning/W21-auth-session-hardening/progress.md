---
phase: W21-auth-session-hardening
status: closed
---

# W21 — AUTH-4c-B — Progress

## Day 0 — 2026-07-13（kickoff）

**緣起**：4c-A 交付密碼生命週期,但本地 session 仍係 localStorage Bearer + 8h 硬到期（ADR-0005 明列 4c hardening tradeoff）。本 phase = ADR-0006 §7:本地 session → httpOnly + SameSite=Strict cookie + rotating refresh token,收 XSS token 面 + 免 8h 硬登出。**只郁本地路;Entra Bearer / dev-bypass 不變**。

**4 決策（AskUserQuestion 2026-07-13,Chris 拍板）**：
1. **Cookie 讀取 = `cookie-parser`**（觸 H2 新 runtime dep;由 ADR-0006 §7 涵蓋 + explicit approve）。
2. **Token TTL = 15min access + 7d refresh**（rotating）。
3. **前端 identity = 存 non-sensitive profile**（無 token;token 靠 httpOnly cookie）。
4. **CSRF = SameSite=Strict only**（double-submit 留日後）。

**實作級決策**：refresh = opaque random + SHA-256 hash 存（非 JWT/argon2）· cookie path `/`（避 vite proxy `/api` prefix 令 refresh cookie 唔 match 嘅坑）· 改密碼唔即時 revoke-all（surgical,列誠實限制）。

**架構定位**：ADR-0006 §7 已 Accepted（架構方向）。cookie-parser 屬 §7 實作 middleware,唔另開 ADR。**觸 H1（additive schema RefreshToken）+ H2（cookie-parser)** 皆由 ADR-0006 §7 + Chris explicit approve 解鎖。

**做咗**：讀清現有 auth 架構全貌（auth.service / guard / local-jwt / controller / main.ts / 前端 local-session / api / login / require-auth / use-sign-out / use-current-user / schema AppUser / package.json）。確認**無 cookie-parser**。AskUserQuestion 4 決策。plan（§0 前置 gate + scope + 10 gate + 6 決策 + 誠實限制）+ checklist + progress。status draft。

**下一步**：**待 Chris approve 本 plan** → 開 D1（dep + schema migration + RefreshTokenService + cookie helper）。

### Blockers
- ~~plan approve~~ → **Chris approved 2026-07-13**,即開 D1。

---

## Day 1 — 2026-07-13/14（D1-D5 完成）

### Done
- **D1 基建**:`cookie-parser` + `@types`(H2,Chris approve)+ `main.ts` `app.use(cookieParser())`。schema `RefreshToken`(id/userId Cascade/tokenHash unique/expiresAt/revokedAt?/createdAt/@@index)+ AppUser refreshTokens[] → migration `20260713152214_auth_refresh_token` + generate(踩 EPERM engine lock → kill 2 個 stale `dist/main` 解)。`refresh-token.service`(issue/rotate/revoke;randomBytes 256-bit+SHA-256 hash;只存 hash)。`cookie.ts`(setAuthCookies/clearAuthCookies;httpOnly/sameSite Strict/secure=NODE_ENV prod/path '/')。`LocalJwtService` 8h→15min。
- **D2 後端**:`AuthService` login→`SessionGrant`(access+refresh+user)+ grantSession/refreshSession(rotate+active-local 驗)/logout/buildSessionUser。`login.dto` LoginResultDto→`SessionResponseDto{ user }`。`auth.controller` login(set cookie,body {user})/`POST /auth/refresh`(@Public,rotate,失敗 clear+rethrow)/`POST /auth/logout`(@Public,revoke+clear,idempotent)用 `@Res({ passthrough })`。`jwt-auth.guard` local 路改 **cookie-first**(`req.cookies.uop_access`→verify+resolve+force-change gate)/ Entra header 路+dev-bypass 不變;移除 jwt.decode iss-routing(cookie 存在=local)。
- **D3 前端**:`local-session`→`local-profile`(存 profile 無 token)。`api.ts` 全 fetch `credentials:'include'`(doFetch)+ authHeader local 去 Authorization + **401→single-flight /auth/refresh→retry once**(失敗 clearProfile)。`login`(SessionResponse→setLocalProfile)、`use-sign-out`(POST /auth/logout→清 profile→/login)、`use-current-user`/`require-auth`/`settings`/`force-password-change`/`change-password-form` 讀 getLocalProfile。api-types LoginResponse→SessionResponse。
- **D4 tests**:api `refresh-token.service.spec`(6)、`auth.controller.spec`(6 新)、`auth.service.spec`(重寫+refreshSession/logout)、`jwt-auth.guard.spec`(cookie 路重寫)、web `api.test`(local→no header+refresh-retry 3)、`local-profile.test`(5 新)。
- **D5 verify**:見下。

### Decisions / 學習
- **guard cookie-first routing**:local token 喺 cookie、Entra 喺 header → 唔再需要 `jwt.decode` iss 分流(cookie 存在=local)。localJwt.verify 內部仍 check iss(防禦)。
- **refresh = opaque random + SHA-256**(非 JWT/argon2):高熵 256-bit random 唔需慢 hash;revoke/rotate 靠 DB row;只存 hash(H4)。
- **cookie path '/'**:避 vite dev proxy `/api` prefix 令 refresh cookie path '/auth' 唔 match `/api/auth/*` 嘅坑(§5 決策)。**live 實測 vite proxy Set-Cookie 轉發正常**(§6 記嘅坑無問題)。
- **`revokeAllForUser` 唔實作**(YAGNI):改密碼 revoke-all 屬 §5「本 phase 唔加」,無 caller。
- **踩坑**:①`prisma generate` EPERM engine dll lock ← 2 個 stale `dist/main`(60540/23820)鎖住 root `node_modules/.prisma`,精準搵 owning PID kill(唔誤殺 IDE)。②`form_input` set DOM value 但 React controlled state 唔更新 → submit 空值 → 改 **native setter + input event + requestSubmit**(memory 坑)。③browser output filter 擋含 Token/Password/base64 嘅 key(非錯,量度結構繞過)。

### Verify（真 tool output）
- api **build 0 · lint 0 · 140→157 test**(refresh-token 6 + auth.controller 6 + auth.service refreshSession/logout 5,guard 重寫抵消)· web **build 0 · lint 0 · 40→48 test**(refresh-retry 3 + local-profile 5)。
- **live backend**(真 HTTP curl,inline env NODE_ENV=dev,唔 touch .env):
  - login → **Set-Cookie `uop_access`(Max-Age 900=15min · HttpOnly · SameSite=Strict)+ `uop_refresh`(604800=7d · HttpOnly · SameSite=Strict)** + body `{user}`(無 raw token)。
  - cookie GET /me → **200** · 無 cookie → **401**。
  - refresh → **rotate**(新 refresh `9ace…`≠舊 `52c7…`)+新 access;舊 refresh 重放 → **401**(防重放);新 access → 200。
  - logout → **204 + Set-Cookie 清(Expires 1970)+ refresh revoke** → 再 refresh **401**。
  - force-change gate cookie transport:admin create(4b)→ user login → GET /me **403**(gate)→ PATCH /me/password **204** → GET /me **200**(解除)。
- **live FE**(browser,vite proxy /api→3100):
  - JS fetch login via proxy → /me **200**(**vite proxy Set-Cookie 轉發正常**,§6 坑無問題)。
  - UI 表單 login(native setter+requestSubmit)→ **path '/' 入 app** + profile set(admin/ADMIN)+ **storageHasJwt false**(token 唔喺 localStorage,靠 httpOnly cookie)。
  - app shell + Overview 完整 render(nav/tenant pill/request cards → cookie round-trip 真數據)。
  - sign-out effect(logout via proxy + clear profile)→ /me **401** + profile 清(真 UI dropdown icon-button 定位未成,底層 logout endpoint + use-sign-out wiring 已由 backend G4 curl + 前端一致動作驗)。
- cleanup:kill 3100(2508)/5173(51216)。

### Blockers
- 無。

### Effort
- Planned ~1-2 日;Actual D0-D5 同日(跨午夜)。

### Commits
| Hash | Subject |
|---|---|
| (待指示) | feat(auth): W21 AUTH-4c-B — refresh token + httpOnly cookie session hardening |

---

## Closeout（status=closed）

### Acceptance verification（plan §4 gates）
| Gate | 結果 |
|---|---|
| G1 schema + cookie-parser wired | ✅ RefreshToken migration applied + `app.use(cookieParser())` |
| G2 login set cookie + profile + 入 app | ✅ curl Set-Cookie httpOnly + browser 入 app path '/' + profile 無 token |
| G3 refresh rotate live | ✅ 舊 refresh→新 access+新 refresh,舊重放 401 |
| G4 logout revoke live | ✅ curl 204+清 cookie+revoke→401;FE sign-out effect→/me 401 |
| G5 guard live | ✅ cookie local 200 / 無 cookie 401;Entra Bearer+dev-bypass guard unit-test 綠 |
| G6 H4 | ✅ httpOnly+SameSite=Strict(+prod Secure)· refresh 只存 SHA-256 hash · rotation revoke 舊 · 唔 log token · body 無 raw token |
| G7 H5 test | ✅ api 157(refresh service/controller/guard cookie)· web 48(refresh-retry/local-profile) |
| G8 build/lint/test | ✅ api 157 · web 48 · 兩邊 build/lint 0 |
| G9 H6 UI | ✅ login/app shell 無退化 · 純 plumbing 無新 UI · ui-design 過 |
| G10 regression | ✅ force-change gate cookie transport live · dev-bypass/Entra guard unit-test 綠 · 4a/4b/4c-A test 綠 |

全 10 gate ✅。

### Lessons
- **cookie transport 令 guard routing 更清**:cookie=local、header=Entra,唔再靠 token iss 分流。
- **XSS-resist 目標達成可觀察**:`storageHasJwt false` —— token 完全離開 JS 可讀範圍(httpOnly cookie),localStorage 只剩 non-sensitive profile。
- **vite dev proxy cookie 轉發** 本來係最大未知風險(§6),live 實測正常(same-origin proxy 帶 Set-Cookie);prod 用真 reverse proxy 同源更無此顧慮。
- **stale `dist/main` 係反覆坑**:每次 rebuild 前 netstat 3100 + 精準 kill owning PID(唔誤殺 IDE node)。

### Carry-overs（→ 4c-C / 其他）
- **AUTH-4c-C（deferred）**:email self-service reset(🔴 IT Mail.Send / SMTP)。
- **per-IP rate-limit**(可日後 `@nestjs/throttler`;本 phase per-account lockout 已在 4c-A)。
- **改密碼 / admin-reset 唔即時 revoke-all refresh**(surgical;被盜 refresh 最多 7d 或手動 logout)—— `revokeAllForUser` 未實作,有需要再加。
- **double-submit CSRF token**(SameSite=Strict only;ADR-0006 §7「選項」)。
- **refresh 並發 rotation grace window**(前端 single-flight 已收窄;後端單 rotation,低併發接受)。
- account tab「Sign-in method: Entra ID」對本地 user 仍寫死(cosmetic,隨 AUTH-3b)。
- 本地 DB 測試數(admin@uop.local · fc.w21.live@uop.local 等 local,已改密碼)無害。

---

**End of W21 progress**
