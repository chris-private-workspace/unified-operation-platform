---
phase: W20-auth-password-lifecycle
status: closed        # plan + checklist 已 closed；4c-C（email reset）另列 deferred（2026-07-20 status 回填）
---

# W20 — AUTH-4c-A — Progress

## Day 0 — 2026-07-13（kickoff）

**緣起**：4a/4b 交付本地登入 + user 管理,但改唔到密碼、admin 幫唔到忘密碼 user、無暴力破解保護、密碼只 min-8。本 phase = 4c 第一 slice：密碼自助管理核心。

**決策（AskUserQuestion 2026-07-13）**：完整 4c 減 email-reset · policy 嚴格。4c 拆 **4c-A（本 W20，un-blocked）/ 4c-B（W21 refresh+cookie 架構）/ 4c-C（deferred email-reset，🔴 IT-gated）**。

**架構決定（ADR-0006，Accepted 2026-07-13）**：密碼生命週期 + session hardening。嚴格 policy（min12+≥3類+≠email+新≠舊）· schema 加欄（mustChangePassword/failedLoginCount/lockedUntil/passwordChangedAt）· change-own（PATCH /me/password）· admin-reset（設 mustChangePassword）· force-change gate · lockout per-account 5次/15min · session hardening（cookie/refresh）留 4c-B。**W20/W21 拆兩個 phase**（Chris sign-off）。

**本 phase 觸 H1（additive schema）→ ADR-0006 解鎖**。唔郁 session model（仍 localStorage/Bearer）→ 零架構風險。

**做咗**：ADR-0006 寫 + Accepted + index;plan（§0 前置 gate + scope + 10 gate）+ checklist + progress。status active。

**下一步**：D1 — schema migration + policy helper（前後端）+ DTOs。

---

## Day 1 — 2026-07-13（D1-D5 完成）

### Done
- **D1**：schema migration `20260713140848_auth_password_lifecycle`（AppUser + `mustChangePassword`/`failedLoginCount`/`lockedUntil`/`passwordChangedAt`）+ `prisma generate`。`auth/password-policy.ts`（pure `validatePassword`:min12/≥3類/≠email/新≠舊）+ `lib/password-policy.ts`（前端 mirror）。`dto/password.dto.ts`（ChangePasswordDto/ResetPasswordDto）。
- **D2 後端**：`MeDto` + login + `/me` 加 `mustChangePassword` · `auth.service`（login **lockout**:lockedUntil→通用401 / 失敗++ / 到5鎖15min[reset count] / 成功 reset;`changePassword`:verify current + policy + 清 flag + stamp）· `me.controller` `PATCH /me/password`(@HttpCode 204) · `user-admin.service`（`resetPassword` 設 mustChangePassword=true;`create` 加 strict policy + mustChangePassword=true;`AdminUserDto` 加 mustChangePassword）· `user-admin.controller` `POST /admin/users/:id/reset-password`(204) · **guard `ensurePasswordChanged`**（ADR-0006 §5:mustChangePassword local user 只放行 PATCH /me/password,其餘 403）。
- **D3 前端**：`api.ts` 加 204 handling（apiPost/apiPatch）· api-types（LoginResponse/AdminUser +mustChangePassword;ChangePasswordBody/ResetPasswordBody）· local-session（+mustChangePassword + `clearMustChangePassword`）· mutations（useChangePassword/useResetPassword）· `components/auth/change-password-form.tsx`（reusable,policy 即時 feedback + confirm match）· `pages/force-password-change.tsx`（全屏 gate,KeyRound）· `require-auth`（mustChangePassword→/change-password）· router `/change-password` · settings account tab 加 Password section（local only）· users-panel Edit dialog 加 Reset password（local only,secondary）+ 表「Must change」warn badge + create hint 改嚴格 · `lib/user-admin.ts` validateCreateUser 改用 strict `validatePassword`。
- **D4 tests**：api `password-policy.spec`(7) · `auth.service.spec` 重寫(+lockout 3 +changePassword 4) · `user-admin.service.spec`(+resetPassword 4 +weak-create 1,create 密碼改強) · `jwt-auth.guard.spec`(+force-change gate 2) · `me.controller.spec`(構造加 auth + mustChangePassword) · web `password-policy.test`(5) · `user-admin.test`(密碼 fixture 改強 + policy test 對齊) · api-test 無改。
- **D5 verify**：見下。

### Decisions / 學習
- **無新 dep**（lockout per-account schema 欄,唔用 throttler;email defer）→ 只 additive schema(H1,ADR-0006 涵蓋)。
- **guard force-change gate**（ADR-0006 §5 backend 強制）：唔止靠前端 RequireAuth,guard local 路 `ensurePasswordChanged` 令 mustChangePassword user 除 PATCH /me/password 外全 403（防前端 bypass）。
- **204 No Content**：change/reset 回 204 → `apiPost/apiPatch` 原本 `res.json()` 會爆 → 加 `if(status===204) return undefined`（general 修）。
- **強 policy 波及 4b create**：create 初始密碼亦要過嚴格 policy + 設 mustChangePassword=true(初次登入必改);連帶 4b 前端 validateCreateUser + 測試密碼 fixture 更新(舊 'sup3rsecret' 11字2類 → 'Sup3r!Secret9')。
- **踩坑**:①`as never` mock 唔可以 spread(guard spec mustChange 要獨立 object) ②`res.json()` on 204 爆(加 status guard) ③ browser 敏感字過濾擋讀含「password」嘅 JS key(改量度 sections/label 陣列繞過)。

### Verify（真 tool output）
- api **build 0 · lint 0 · 121→140 test**(policy 7 + auth.service lockout/change 6 + user-admin reset/weak 5 + guard force-change 2 - 重寫抵消) · web **build 0 · lint 0 · 35→40 test**(password-policy 5)。
- **live backend**(真 HTTP,local-only,rebuild dist):
  - create strict → **mustChangePassword=true** · **weak create 400**(policy) · login → **flag true**。
  - force-change gate:catalog(must-change token)→**403** · change wrong-current→**401** · weak-new→**400** · valid→**204**。
  - 改後 login→**flag false** · catalog→**200**(解封)。
  - admin reset→**204** · post-reset login→**flag true** · catalog→**403**(再鎖)。
  - lockout:5 次錯全 401 → **正確密碼都 401**(鎖住,證非密碼錯)。
- **live FE**(browser,fc.demo temp 登入):/→**redirect /change-password**(app shell 隱藏)· heading「Set a new password」+「set by an administrator」+ 一 primary「Set password & continue」· **dark token swap**(card 255→20 / body →8)· 填表提交→**path '/' + app 可見 + session flag 清** · Settings account tab **Password section + Update password 掣** · admin console **「Must change」badge ×2** + local user Edit dialog **有 Reset password 欄+掣**(SSO user 正確隱藏)。
- cleanup:kill 3100/5173。

### Blockers
- 無。

### Effort
- Planned ~1-2 日;Actual D0-D5 同日。

### Commits
| Hash | Subject |
|---|---|
| (待指示) | feat(auth): W20 AUTH-4c-A — password self-management (change · admin-reset · policy · force-change · lockout) |

---

## Closeout（status=closed）

### Acceptance verification（plan §4 gates）
| Gate | 結果 |
|---|---|
| G1 schema + policy helper 一致 | ✅ migration applied + 前後端 validatePassword 同規則 |
| G2 改自己密碼端到端 live | ✅ curl(change 204→新密碼 login 200) + browser(force-change 表→app) |
| G3 admin-reset→force-change live | ✅ curl(reset→login flag true→catalog 403) + browser(fc.demo 被攔) |
| G4 lockout live | ✅ 5 次錯→鎖→正確密碼都 401 |
| G5 嚴格 policy 拒 + FE feedback | ✅ curl weak create/change 400 + FE policy hint(danger) |
| G6 H4 | ✅ 無 hash log/回;force-change gate 403;me-password local-only(changePassword 查 authProvider) |
| G7 H5 test | ✅ api 140(policy/lockout/change/reset/guard) · web 40(policy) |
| G8 build/lint/test green | ✅ api 140 · web 40 · 兩邊 build/lint 0 |
| G9 H6 UI | ✅ token-only + light+dark(實測) + 一 primary + lucide KeyRound + ui-design DS 過 |
| G10 regression | ✅ admin login/4b CRUD live 正常;dev-bypass/Entra 路 guard 未改(force-change 只 local 路)+ tests 綠 |

全 10 gate ✅。

### Lessons
- **backend 強制 force-change**（guard）比純前端 gate 穩：即使繞過 FE,mustChangePassword user API 只得改密碼。
- **強 policy 有連鎖**：一改 min12+複雜度,create/change/reset + 4b 前端 validator + 全部測試密碼 fixture 都要對齊 —— surgical 但要 trace 晒。
- **live 驗密碼流程**:browser 敏感字過濾擋讀「password」key → 改量度結構(sections/labels/path)繞過,截圖/DOM 度量為準。

### Carry-overs（→ 4c-B / 4c-C / 其他）
- **AUTH-4c-B（W21）**：refresh token + httpOnly cookie（ADR-0006 §7 架構改,單獨 phase）。
- **AUTH-4c-C（deferred）**：email self-service reset（🔴 IT Mail.Send / SMTP）。
- **per-IP rate-limit**（可日後 `@nestjs/throttler`;本 phase 只 per-account lockout）。
- lockout 通用 401 唔顯「已鎖」（enumeration tradeoff;友善鎖定訊息 + per-IP 可日後）。
- account tab「Sign-in method: Entra ID」對本地 user 仍寫死 SSO（cosmetic,隨 AUTH-3b）。
- 本地 DB 測試數（fc.demo / lc.* / lock.* 等 local REGIONAL,must-change/locked）無害,同既有一致。

---

**End of W20 progress**
