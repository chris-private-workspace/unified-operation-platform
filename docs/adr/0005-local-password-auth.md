# ADR-0005: 本地密碼認證,與 Entra SSO 並存（dual-provider AppUser · argon2 · 本地簽發 JWT · dual-issuer guard）

**Date**: 2026-07-13
**Status**: Accepted
**Approver**: Chris Lai（scope=完整 / storage=passwordHash on AppUser / hashing=argon2 三項 AskUserQuestion 拍板；ADR 全文 + 3 sub-decision[localStorage · 8h HS256 · env 初始密碼]2026-07-13 sign-off → Accepted）

## Context

現時平台 auth **綁死 Entra**：
- `AppUser.entraOid` 是 **required + unique**（必須有 Entra object id），且**無任何密碼欄** —— identity 本質上只能來自 Entra SSO token。
- `JwtAuthGuard`（ADR-0002）只驗 Entra v2.0 JWT（RS256 via tenant JWKS + aud/iss/exp）→ 由 `oid` upsert AppUser；否則 dev-bypass 注入 seed 用戶（無登入）。
- Locked stack（`docs/architecture.md`）：**Auth = Entra ID SSO + app roles**。
- 前端（ADR-0003 / AUTH-2a）：MSAL SSO；Login 畫面的 email/password form 一直 **stub 未接**。

**問題**：真 SSO e2e（AUTH-2b）**卡死於 IT 未開 SPA app registration**，本地開發只有 dev-bypass（auto-inject，非「登入」）。Chris 要求：**本地開發需要真正的登入方式**，而且**即使日後（生產）也必須有本地帳號登入，不可只提供 SSO**。

這觸發 hard constraints：**H1**（改 `AppUser` domain model + 改 auth 架構）、**H2**（加 password hashing runtime dep）、**H4**（儲 password hash + 本地簽名 secret + 攻擊面）。→ 用戶 approve 後寫本 ADR。

**拍板的三項（AskUserQuestion 2026-07-13）**：
1. **Scope = 完整本地 user 管理**（admin CRUD + 密碼重設 + Users&roles UI + lockout/policy）—— 分階段交付。
2. **儲存 model = `AppUser` 加 nullable `passwordHash`**（+ `entraOid` 改 nullable + `authProvider` 欄），單表，重用 role/scope。
3. **Hashing = argon2**（argon2id；Chris 接受 Windows/proxy native-build 風險）。

## Decision

**加一條與 Entra 並存的本地密碼認證路徑,重用既有 role / opco-scope / guard / `/me` stack。**

### 1. Domain model（H1 · Prisma migration）
`AppUser` 改為 dual-provider：
- `entraOid String? @unique` —— 由 required 改 **nullable**（本地帳號 = null；Postgres unique 容許多個 NULL，無衝突）。
- `passwordHash String?` —— 本地帳號的 argon2id hash；SSO 帳號 = null。**絕不外露**（DTO / log / API response 一律排除）。
- `authProvider String` —— `'entra' | 'local'`（顯式,免靠推斷；default 依 seed）。
- `email @unique` 維持 = 兩種 provider 共同的登入識別。role / opcoScope / active / lastLoginAt 照舊。

### 2. Password hashing（H2 · argon2id）
新 runtime dep **`argon2`**（argon2id，OWASP 現代首選）。參數用 lib 安全 default（memoryCost / timeCost / parallelism）。**首個實作步驟 = 驗 `npm i argon2` 喺本機 Windows/proxy 裝得成並 load 到**（native build；若被 proxy 封 prebuilt → 流動網路 workaround，同 Prisma engine R1；真裝唔到才 fallback 傾 bcryptjs）——**未驗成功前唔建其他嘢**（H7）。

### 3. 本地登入 + 本地簽發 JWT（H4）
- **`POST /auth/login`**（`@Public`，body = email + password）→ 查 active 且 `authProvider='local'` 的 AppUser → `argon2.verify(hash, password)` → 成功簽發**本地 JWT**：`HS256`，secret = env **`AUTH_JWT_SECRET`**（強隨機、只在 env、**絕不 commit**，缺則本地登入功能 fail-fast）；claims = `{ sub: AppUser.id, iss: 'uop-local', role, exp }`；MVP 效期 ~8h（一個工作天），到期重新登入（refresh token 留 4c）。失敗 → 401 通用訊息（不透露帳號是否存在）。**H4：password / hash / token / secret 一律不 log**，只 log 結果（success/fail + userId）。

### 4. Guard dual-issuer（H1）
`JwtAuthGuard` 收兩種 token：先 decode（未驗）看 `iss` —— `iss==='uop-local'` → **HS256 驗 `AUTH_JWT_SECRET`** → 由 `sub` 取 AppUser；否則行現有 **Entra RS256/JWKS** 路 → 由 `oid` upsert。dev-bypass 不變。`@Roles` / `opco-scope` / `/me` / `@CurrentUser` **零改動**。

### 5. 前端（本地 session）
Login 畫面把 stub 的 email/password form 接 `POST /auth/login` → 存本地 access token（**localStorage** — 內部工具、跨 reload 便利；XSS 面已知,cookie/httpOnly 屬 4c hardening）→ `authHeader()` 加分支：**有本地 token → 帶本地 Bearer；否則行 MSAL 路**。sign-out 清本地 token。SSO button 保留（Entra 路不變）。

### 6. 分階段交付（Scope=完整,但一次一 phase）
- **AUTH-4a（W18,本 ADR 首個 phase）= 本地登入核心**：schema migration + argon2 + `POST /auth/login` + 本地 JWT + guard dual-issuer + seed 一個本地 admin（初始密碼由 env `LOCAL_ADMIN_INITIAL_PASSWORD`,非 hardcode）+ 前端 Login form 接 + 本地 session。**critical path → H5 test**（verify 成功/錯密碼 401、dual-issuer guard、guard resolve by sub、hash 不外露）。交付即有「本地帳號端到端登入」。
- **AUTH-4b（W19）= 本地 user 管理**：admin endpoint 建/列/改/停用本地 user + 設 role/opcoScope + Settings › Users&roles UI（取代 coming-soon stub）。
- **AUTH-4c（W20）= 密碼生命週期**：自助改密碼、admin 重設、lockout / rate-limit、密碼 policy。**密碼重設 via email 需 email transport 決定(SMTP / SendGrid / Graph sendMail = 另一 H2 sub-decision)** → 到 4c 再拍板；4a/4b 初始密碼由 admin/seed 設,不阻塞。

## Alternatives Considered

- **維持 SSO-only,靠 IT 開 app reg** — rejected：AUTH-2b 已卡 IT，本地開發 / 測試無真登入路徑，且違 Chris「不可只有 SSO」要求。
- **本地登入 dev-only（生產 SSO-only）** — rejected：Chris 明確要生產也有本地帳號（break-glass / 非 tenant 用戶）。
- **`bcryptjs`（純 JS,無 native build）** — 呈報為 Windows/proxy 零踩坑選項,但 **Chris 揀 argon2**（argon2id 抗 GPU 更強）→ Chosen = argon2,接受 native-build 風險（首步驗裝成功）。
- **分開 `LocalCredential` 表（1:1）** — rejected：Chris 揀單表 `passwordHash` on AppUser（最簡、一表、role/scope 直接重用）。
- **本地 JWT 用 RS256（自管一對密鑰）** — rejected：HS256 + 單一 env secret 對本地簽發已足夠且最簡；RS256 增密鑰管理無得益（非給第三方驗）。
- **httpOnly cookie session（非 Bearer）** — 更防 XSS,但要 CSRF 處理 + 改 guard 讀 cookie；MVP 用 localStorage + Bearer（與現有 Entra Bearer 流程一致）,cookie 列 4c hardening 選項。

## Consequences

- **Positive**：解 IT-app-reg 卡死 —— 本地即有真登入流程可端到端測（login → token → guard → identity → role → scope），不等 Entra；提供永久非-SSO 路徑（break-glass / 非 tenant 用戶）；**完全重用** role/opco-scope/guard/`/me`,dual-issuer 只加一分支；dev-bypass 仍可作更快捷徑。
- **Negative**：引入密碼儲存攻擊面（hash、lockout、policy → 4c）；**argon2 native-build 在 Windows/公司 proxy 有裝機風險**（同 Prisma engine R1,首步必驗）；多一個簽名 secret `AUTH_JWT_SECRET` 要管理（H4）；`entraOid` 改 nullable 是一次 migration；「完整」scope = 多 phase 工程（4a/4b/4c）。
- **Neutral**：Entra 仍是真實用戶的主路徑,本地帳號補 dev / break-glass / 非 tenant；密碼重設 email transport 是未決 sub-decision（4c）；本 ADR 只解鎖架構,各 phase 各自 plan-first + H5 test。

## References

- `docs/adr/0002-entra-jwt-validation.md`（Entra JWT guard,dual-issuer 由此擴充）· `0003-msal-frontend-sso.md`（前端 SSO,本地 session 與之並存）
- `apps/api/src/auth/jwt-auth.guard.ts`（現有 guard）· `prisma/schema.prisma`（`AppUser` / `Role`）
- `docs/01-planning/W18-auth-local-login/`（AUTH-4a plan,待建）· `docs/01-planning/BACKLOG.md`（AUTH-4a/b/c）
- CLAUDE.md §5 H1（domain model + auth 架構改）/ H2（argon2 新 dep）/ H4（密碼 / secret / PII）/ H5（登入 critical-path test）
- OWASP Password Storage Cheat Sheet（argon2id 參數）· `AUTH_DEV_BYPASS` / `AUTH_DEV_USER_EMAIL`（本地既有捷徑,不受影響）
