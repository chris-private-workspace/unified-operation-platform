# ADR-0006: AUTH-4c — 密碼生命週期 + session hardening（嚴格 policy · force-change · lockout · admin-reset · refresh token + httpOnly cookie）

**Date**: 2026-07-13
**Status**: Accepted
**Approver**: Chris Lai（scope=完整 4c 減 email-reset · policy=嚴格 兩項 AskUserQuestion 2026-07-13 拍板;本 ADR 全文 + 分階段 4c-A(W20)/4c-B(W21)/4c-C(deferred) sequencing 2026-07-13 sign-off → Accepted，W20/W21 拆兩個 phase）

## Context

ADR-0005 交付本地密碼認證（4a 登入核心 + 4b user 管理），但**明確 defer 整個密碼生命週期到 4c**：自助改密碼 / admin 重設 / force-change-on-first-login / lockout / rate-limit / 嚴格 policy / email-based reset / refresh token / httpOnly cookie hardening。

**現時缺口**：
- **改唔到密碼** —— seed / admin-create 出嚟嘅密碼一世唔變（無 change / reset endpoint）。
- **admin 幫唔到忘密碼 user**（4b 只可 create，唔可 reset）。
- **無暴力破解保護**（login 無 lockout / rate-limit）。
- **8h 硬到期無 refresh**（到期要重新登入）。
- **token 喺 localStorage**（XSS 面 —— ADR-0005 已知 tradeoff，列 4c hardening）。
- **密碼只 floor 驗證**（min 8，無複雜度 / 唔可以同 email 一樣 / 改時新≠舊）。

**Chris 拍板（AskUserQuestion 2026-07-13）**：
1. **Scope = 完整 4c，減 email-reset**（email transport = SMTP / Graph `Mail.Send` 係另一未決 + IT-gated 決定；**admin-reset 已 cover「忘密碼」**，email self-service 拆後續 4c-C）。
2. **Password policy = 嚴格**（長度 + 複雜度）。

呢個觸發 hard constraints：**H1**（改 `AppUser` schema 加 lockout / force-change 欄 + 改 session 架構 localStorage→cookie + refresh）、**H4**（密碼儲存 / lockout / cookie / secret）。→ 用戶 approve 後寫本 ADR。

## Decision

**喺 ADR-0005 dual-provider 基礎上，加完整密碼生命週期 + session hardening，分三階段交付。**

### 1. 嚴格 password policy（H4 · 共用 validator，套 create / change / reset）
- **min 12 字** + **≥3 類字符**（小寫 / 大寫 / 數字 / 符號）+ **唔可以同 email 一樣**（含 local-part）+（改 / 重設時）**新 ≠ 舊**。
- 一個 pure helper `validatePassword(pw, { email, currentHash? })` 前後端共用邏輯（後端 class-validator custom + service 再驗；前端 mirror 即時 feedback）。後端係 source of truth。

### 2. Schema 加欄（H1 · additive migration，喺 ADR-0005 dual-provider AppUser 內）
- `mustChangePassword Boolean @default(false)` —— force-change-on-first-login（admin-create / admin-reset 設 true）。
- `failedLoginCount Int @default(0)` + `lockedUntil DateTime?` —— lockout tracking（**per-account，durable，零新 dep**；全喺 AppUser + login service）。
- `passwordChangedAt DateTime?` —— audit / 可見度。
- （4c-B）refresh token 儲存：`RefreshToken` 表（`id / userId / tokenHash / expiresAt / revokedAt / createdAt`）—— 只存 hash，rotation 時 revoke 舊。

### 3. 改自己密碼（4c-A · `PATCH /me/password`，已登入本地 user）
verify `currentPassword`（argon2）→ policy 驗 → hash 新 → update `passwordHash` + 清 `mustChangePassword` + stamp `passwordChangedAt`。只限 `authProvider='local'`（SSO 密碼喺 Entra）。H4：唔 log 密碼 / hash。

### 4. Admin 重設（4c-A · `POST /admin/users/:id/reset-password`，`@Roles(ADMIN)`）
admin 打新密碼（同 4b create 一致，admin-typed）→ policy 驗 → hash → update + **設 `mustChangePassword=true`**（user 下次登入必改 admin 設嘅 temp）。只限 local account。

### 5. Force-change-on-first-login（4c-A）
login 回應 + `/me` expose `mustChangePassword`。前端：若 true → **強制 change-password 畫面 gate 住 app**，改成功清 flag 先入 app。後端：`PATCH /me/password` 係 mustChangePassword 期間唯一放行嘅操作。

### 6. Lockout（4c-A · per-account）
login 失敗 → `failedLoginCount++`；到 **threshold 5** → 設 `lockedUntil = now + 15min`。鎖住期間 login 一律**通用 401**（唔透露鎖定狀態，免 enumeration；server-side log 記鎖定）。成功 → reset `failedLoginCount` + 清 `lockedUntil`。**Per-account durable（AppUser 欄）**；per-IP rate-limit 唔喺本 scope（可日後 `@nestjs/throttler` 補）。

### 7. Session hardening（4c-B · H1 architectural）
- 本地 session 由 **localStorage Bearer → httpOnly + Secure + SameSite=Strict cookie**（存 access token）。
- 加 **refresh token**（rotating，server 存 hash，長效期 e.g. 7d）+ `POST /auth/refresh`（refresh cookie → 發新 access + rotate refresh）+ `POST /auth/logout`（清 cookie + revoke refresh）。
- **Guard** 本地路改讀 cookie（Entra Bearer 路不變；dev-bypass 不變）。CSRF 靠 SameSite=Strict（+ 選項 double-submit token）。
- **前端** 移除 localStorage token，靠 cookie 自動帶（`fetch` `credentials:'include'`）；401 → refresh → retry；sign-out 打 `/auth/logout`。
- **呢個係架構改，delivered as 4c-B（W21），單獨隔離風險。**

### 分階段交付（scope=完整 4c 減 email，一次一 phase）
- **4c-A（W20）**：policy + schema（mustChangePassword / lockout / passwordChangedAt）+ change-own + admin-reset + force-change + lockout。**唔郁 session model**（仍 localStorage / Bearer，ADR-0005）→ 零架構風險，即出價值。**critical path → H5 test**（verify current / policy / lockout 計數 / force-change gate）。
- **4c-B（W21）**：refresh token + httpOnly cookie（本 §7）。session 架構改，最大 surface，單獨 phase。
- **4c-C（deferred，🔴 IT-gated）**：email-based reset —— Graph `Mail.Send`（重用已 locked Graph vendor，但需 IT 授 `Mail.Send` app permission，同 AUTH-2b app-reg 一類 blocker）或 SMTP（新 dep）。**admin-reset 已 cover「忘密碼」**，故 email self-service 非必需，拆到 transport + IT 授權確定先做。

## Alternatives Considered

- **Lockout 用 `@nestjs/throttler`（新 dep）** — rejected（4c-A）：schema per-account tracking durable（survive restart）、per-account（非只 per-IP）、零新 dep。Throttler 可日後補 per-IP rate-limit。
- **Password policy NIST length-only（唔逼複雜度）** — 呈報過（現代建議長度優先），但 **Chris 揀嚴格**（長度 + 複雜度）。
- **維持 localStorage（skip cookie）** — rejected：Chris 要 hardening，XSS 面係 ADR-0005 明列要收嘅 tradeoff。
- **email-based reset 即做** — deferred：email transport IT-gated / 未決；admin-reset 已 cover 需求。
- **4c 一次過一個 phase** — rejected（建議）：4c-B cookie/refresh 係 working auth 嘅非-trivial refactor（guard / api.ts / CSRF），同 4c-A 混做會放大風險 → 拆 W20 / W21，un-blocked 價值先出，架構風險隔離。

## Consequences

- **Positive**：真密碼生命週期（user / admin 管密碼）· 暴力破解保護 · admin 設 temp 強制輪換 ·（4c-B）XSS-resistant session + 無 8h 硬登出。
- **Negative**：一次 additive migration（4c-A）+ 一次 session 架構 migration（4c-B）；login 加 lockout 分支；4c-B 係 working session model 嘅 refactor（guard / api.ts / CSRF）—— 隔離到 W21 收窄風險。
- **Neutral**：email self-service reset 仍缺（admin-reset cover）；per-IP rate-limit 唔喺 scope（per-account lockout only）；本 ADR 只解鎖架構，各 phase 各自 plan-first + H5 test。

## References

- `docs/adr/0005-local-password-auth.md`（本地認證，4c 由此 defer 而來）· `0002-entra-jwt-validation.md`（guard）· `0003-msal-frontend-sso.md`
- `apps/api/src/auth/`（auth.service / jwt-auth.guard / local-jwt.service / user-admin.service）· `apps/web/src/lib/api.ts`（authHeader）· `lib/auth/local-session.ts` · `pages/login.tsx`
- `docs/01-planning/W20-auth-password-lifecycle/`（4c-A plan，待建）· `BACKLOG.md`（AUTH-4c）
- CLAUDE.md §5 H1（schema + session 架構）/ H4（密碼 / lockout / cookie / secret）/ H5（密碼 critical-path test）
- OWASP Authentication / Password Storage / Session Management Cheat Sheets · NIST 800-63B（policy 參考）
