---
phase: W18-auth-local-login
status: closed
---

# W18 — AUTH-4a — Progress

## Day 0 — 2026-07-13（kickoff）

**緣起**：真 SSO e2e（AUTH-2b）卡 IT app reg，本地只有 dev-bypass（非登入）。Chris 要本地帳號登入（dev + 永久，非 SSO-only）。

**架構決定（ADR-0005，Accepted 2026-07-13）**：本地密碼認證與 Entra 並存 —— dual-provider `AppUser`（entraOid nullable + passwordHash + authProvider）· argon2id · 本地簽發 JWT（HS256 + `AUTH_JWT_SECRET`）· guard dual-issuer · 前端 localStorage session · 分階段 4a（核心登入）/ 4b（user 管理）/ 4c（密碼生命週期）。3 sub-decision（localStorage · 8h HS256 · env 初始密碼）Chris sign-off。

**AskUserQuestion 拍板**：scope=完整本地 user 管理 · storage=passwordHash on AppUser · hashing=argon2（接受 Windows/proxy native-build 風險）。

**本 phase = AUTH-4a 核心登入**。**首閘 G1 = argon2 裝得成**（未過唔建其他，H7）。

**做咗**：ADR-0005 寫 + Accepted + index;plan（0 首閘 + scope + 7 gate）+ checklist + progress。status active。

**下一步**：D1 — 驗 `npm i argon2`（G1）→ schema migration → AUTH_JWT_SECRET + local-jwt helper。

---

## Day 1 — 2026-07-13（D1-D6 完成）

### Done
- **D1（首閘 G1 過）**：`npm i argon2` 裝成 + `require('argon2')` load + hash/verify round-trip（`$argon2id$v=` / correct true / wrong false）—— **Windows/proxy native-build 風險冇中**。schema migration `20260713100426_auth_local_provider`（`entraOid` → `String?`、加 `passwordHash String?`、加 `authProvider String @default("entra")`）。`local-jwt.service.ts`（LocalJwtService sign/verify，HS256 + `AUTH_JWT_SECRET` **lazy getOrThrow**，iss `uop-local`，8h）。
- **D2**：`dto/login.dto.ts`（LoginDto[IsEmail+password] / LoginResultDto[accessToken/expiresIn/user:MeDto]）· `auth.service.ts`（login：findUnique by email → active+local+hash gate → argon2.verify → sign → 回 me-shape 無 hash；失敗**通用 401**；H4 log userId+role 唔 log email/pw/token）· `auth.controller.ts`（`POST /auth/login` `@Public`）· `auth.module.ts` 加 provider/controller。
- **D3**：`jwt-auth.guard.ts` **dual-issuer**（decode 未驗讀 iss → `uop-local` HS256 verify + resolveLocalUser by sub[active+authProvider=local]；否則 Entra；**Entra config 改 optional**，無 provider fail-fast boot）· `seed.ts` 本地 admin（`admin@uop.local` ADMIN local，argon2(env `LOCAL_ADMIN_INITIAL_PASSWORD`)，upsert by email，未設 skip）。
- **D4（前端）**：`lib/auth/local-session.ts`（localStorage token+user+expiry）· `use-sign-out.ts`（local clear→/login / MSAL logout）· `api.ts` `authHeader` **local token 優先** · `use-current-user.ts`（local identity + `canSignOut`）· `require-auth.tsx`（local session=authed）· `login.tsx`（email/password form 接 `POST /auth/login`→setLocalSession→navigate;錯誤 danger-soft）· sidebar + top-bar sign-out 改 `useSignOut` + `canSignOut`（清 useMsal/msalConfigured orphan）。
- **D5 tests（H5）**：api `auth.service.spec`（5：成功無 hash+lastLoginAt / 錯密碼 401 不 sign / 非-local 401 / inactive 401 / 無帳 401）· `jwt-auth.guard.spec` 加 4（local resolve by sub / 壞 local 401 / Entra-not-configured 401 / no-provider fail-fast boot）+ 全 construction 加 localJwt · web `api.test`（+1 local token 優先分支）。
- **D6 verify**：見下。

### Decisions / 學習
- **argon2 native-build 冇踩坑**（首閘過）—— 直接 load 到,唔使流動網路 workaround。
- **LocalJwtService secret lazy**（getOrThrow 喺 sign/verify 唔喺 constructor）→ 無 `AUTH_JWT_SECRET` 嘅 dev-bypass/Entra-only 部署照 boot。
- **Entra config 改 optional + no-provider fail-fast**：令 local-only 部署 boot 到,但無任何 provider(dev-bypass/Entra/local secret)就 boot 即拋。
- **踩坑:root `npm install` 沖走 Prisma generated client**（重裝 @prisma/client → types revert 舊 schema → build TS2339 authProvider/passwordHash）→ **必 re-run `prisma generate`**。且 `npm --prefix apps/api install` 整咗 stray `apps/api/package-lock.json`（monorepo 應 root single lockfile）→ 刪 stray + root `npm install` reconcile（root lockfile 記 argon2）。
- **stale instance 霸 3100**（舊 dev-bypass build 令 /auth/login 404 + guarded 200 no-token）→ kill 晒 3100 listener + 等 log「successfully started」先 curl。

### Verify（真 tool output）
- **G1** argon2 round-trip ✅。migration applied + client regen。
- api **build 0 · lint 0 · 100→109 test**（+5 auth.service +4 guard）· web **build 0 · lint 0 · 24→25 test**（+authHeader local）。（jest「worker force exited」= argon2 native handle teardown leak,非 test fail,109 全過。）
- **live backend（真 HTTP,local-only mode:`AUTH_JWT_SECRET` 有 / 無 dev-bypass / 無 Entra）**：
  - no-token guarded `/license/catalog` → **401** · wrong-pw login → **401**。
  - `POST /auth/login`（admin@uop.local / DevLocal!23）→ `accessToken`（HS256 `{"alg":"HS256"}`,iss=uop-local/sub/role ADMIN/exp）+ expiresIn 28800 + user **無 passwordHash**。
  - local token → `GET /me` = Local Admin identity(resolve by sub) · `GET /license/catalog` → **200**（dual-issuer 收 local）。
- **live FE（browser,無 dev-bypass）**：`/` → redirect `/login`（form enabled）→ 填 admin@uop.local+DevLocal!23 → Sign in → navigate `/` + localSession=Local Admin → app shell render + identity「Local Admin」+ **Overview 載真數(Open requests 6，證 local token→authHeader→guarded 200)** → **sign-out** → `/login` + session cleared。錯密碼 → 留 /login + **「Invalid email or password.」** danger-soft error。截圖對 prototype 忠實（brand panel + form + error + 一 primary）。
- **G4 regression**：restart `AUTH_DEV_BYPASS=true` → guarded `/license/catalog` → **200**（dual-issuer 無破 dev-bypass）；Entra 路 guard test 全綠 + Entra-not-configured 401。

### Blockers
- 無。

### Effort
- Planned：~1-2 日；Actual：D0-D6 同日。

### Commits
| Hash | Subject |
|---|---|
| (待指示) | feat(auth): W18 AUTH-4a — local password login (dual-provider · argon2 · dual-issuer guard) |

---

## Closeout（status=closed）

### Acceptance verification（plan §4 gates）
| Gate | 結果 |
|---|---|
| G1 argon2 裝成 + round-trip | ✅ load + hash/verify（native-build 冇踩坑） |
| G2 本地登入端到端 live | ✅ backend curl（login→token→/me→guarded 200）+ FE browser（form→app→identity→真數→sign-out） |
| G3 錯密碼/非-local/inactive 401 + 無 hash | ✅ curl 401 + FE error;login 回應/log 無 passwordHash/token |
| G4 Entra/dev-bypass regression | ✅ dev-bypass 200 live + guard tests + Entra-not-configured 401 |
| G5 H5 test（login+guard+authHeader） | ✅ api 109（auth.service 5 + guard +4）· web 25（authHeader local） |
| G6 build 0 + lint 0 + test green | ✅ api 109 · web 25 · 兩邊 build/lint 0 |
| G7 H4（secret env · 不 log · 不回 raw AppUser） | ✅ AUTH_JWT_SECRET inline/env 不 commit · log userId/role only · login/me map me-shape |

全 7 gate ✅。

### Lessons
- **本地登入解 IT-app-reg 卡死**：而家本地有真登入流程（無 dev-bypass 都入到 app），唔使等 Entra；dual-issuer 令 local + Entra + dev-bypass 三路並存,零改 @Roles/scope/me。
- **root `npm install` 沖走 Prisma client** = 大坑（build 突然 TS2339）→ 加 dep 後必 `prisma generate`;`npm --prefix <workspace> install` 會整 stray lockfile → 用 root install reconcile。
- **argon2 native-build 在本機 OK**（首閘過,冇中 Windows/proxy 風險）—— 但 root reinstall 會 rebuild,注意時間。

### Carry-overs（→ AUTH-4b / 4c）
- **AUTH-4b**（W19）：admin 建/管本地 user + role/scope 設定 + Settings › Users&roles UI（現 coming-soon stub）。
- **AUTH-4c**（W20）：自助改密碼 / admin 重設 / lockout / rate-limit / policy;**密碼重設 email transport = 另一 H2 sub-decision**;refresh token;httpOnly cookie hardening。
- **jest teardown leak**（argon2 native handle）：可加 `--forceExit` / `--detectOpenHandles`,非 blocking。
- **env 設定**：`AUTH_JWT_SECRET` + `LOCAL_ADMIN_INITIAL_PASSWORD` 要落各人 `.env`（doc: `setup.md` step 4；本 session 用 inline 驗）。

---

**End of W18 progress**
