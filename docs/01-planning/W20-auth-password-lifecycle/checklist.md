---
phase: W20-auth-password-lifecycle
status: closed
---

# W20 — AUTH-4c-A — Checklist

> ADR-0006 Accepted。密碼自助管理:改自己密碼 + admin 重設 + 嚴格 policy + force-change + lockout。
> 決策鎖定:嚴格 policy(min12+≥3類+≠email+新≠舊) · lockout per-account 5次/15min 通用401 · admin-reset 設 mustChangePassword · 唔郁 session model(cookie/refresh 留 4c-B/W21)。

## D1 — schema + policy helper
- [x] schema migration `auth-password-lifecycle`（AppUser 加 mustChangePassword / failedLoginCount / lockedUntil / passwordChangedAt）+ `prisma generate`
- [x] 後端 `auth/password-policy.ts`（pure `validatePassword(pw,{email,currentPassword?})` — min12/≥3類/≠email/新≠舊）
- [x] 前端 `lib/password-policy.ts`（mirror 同規則）
- [x] DTOs：ChangePasswordDto（currentPassword/newPassword）· ResetPasswordDto（newPassword）

## D2 — 後端
- [x] `PATCH /me/password`（@CurrentUser，local only，verify current + policy + hash + 清 mustChangePassword + stamp passwordChangedAt）
- [x] `POST /admin/users/:id/reset-password`（@Roles(ADMIN)，policy + hash + 設 mustChangePassword=true，local only）
- [x] `auth.service.login` 加 lockout（查 lockedUntil→通用401 · 失敗++ · 到5鎖15min · 成功 reset）+ 回 mustChangePassword
- [x] `/me` + login 回應 expose mustChangePassword · 4b create 設 mustChangePassword=true

## D3 — 前端
- [x] `components/settings/change-password.tsx`（account tab，local session only）+ policy 即時 feedback
- [x] users-panel Edit dialog 加「Reset password」（admin，設 temp）
- [x] force-change gate：mustChangePassword=true → 強制 change 畫面 gate app（route guard）
- [x] login 後讀 mustChangePassword;local-session/use-current-user 帶 flag

## D4 — tests（H5）
- [x] api password-policy（各規則:<12 / <3類 / =email / 新=舊 / pass）
- [x] api change-password（verify current 錯→401 · policy 拒 · 成功清 flag+stamp · 非-local 拒）
- [x] api admin-reset（設 mustChangePassword · policy · @Roles ADMIN · local only）
- [x] api **lockout**（失敗++ · 第5次鎖 · 鎖住通用401 · lockedUntil 後解 · 成功 reset count）
- [x] web validatePassword 單元 + change form gate

## D5 — verify + closeout
- [x] api build 0 + web build 0 + lint 0 + test green（api 121→N · web 35→N）
- [x] **live**：改密碼 round-trip · admin-reset→force-change · lockout 5次鎖15min · policy 拒弱 · dev-bypass/Entra/4a-login/4b-CRUD regression
- [x] `ui-design` skill 自檢（change/force-change UI）
- [x] progress retro · plan closed · BACKLOG · memory · commit（待指示）

## Phase Gate（plan §4）
- [x] G1 schema migration + policy helper 前後端一致
- [x] G2 改自己密碼端到端 live
- [x] G3 admin-reset→force-change live
- [x] G4 lockout live（5次鎖/解/reset）
- [x] G5 嚴格 policy 拒弱 + 前端 feedback
- [x] G6 H4（不 log 密碼/hash · 回應無 hash · lockout 不洩帳號 · me-password local-only）
- [x] G7 H5 test（change/admin-reset/lockout/policy + validatePassword）
- [x] G8 build 0 + lint 0 + test green
- [x] G9 H6（change/force-change UI token-only · 一 primary · light+dark · ui-design 過）
- [x] G10 regression（dev-bypass/Entra/4a/4b 唔破）

## Cross-Cutting
- [x] 每 commit references progress Day-N（R2）
- [x] ADR-0006 Accepted（H1/H4 已解鎖）
- [x] BACKLOG 同步（R7：AUTH-4c-A active → ✅；4c-B/4c-C carry）
