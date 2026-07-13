---
phase: W20-auth-password-lifecycle
name: "AUTH-4c-A — password self-management (change-own · admin-reset · strict policy · force-change · lockout)"
sprint_week: W20
backlog_id: AUTH-4c-A
start_date: 2026-07-13
end_date: 2026-07-13
status: closed            # draft | active | closed — D1-D5 完成,G1-G10 全過（api 121→140 · web 35→40;live curl 端到端 + FE browser force-change/light-dark）
spec_refs:
  - docs/adr/0006-password-lifecycle-session-hardening.md（Proposed → 需 Accepted 先 code；本 phase = 4c-A slice）
  - docs/adr/0005-local-password-auth.md（本地認證 stack，4c 由此 defer）
  - docs/01-planning/W18-auth-local-login/ · W19-auth-user-admin/（4a/4b — 本 phase 建喺其上）
  - apps/api/src/auth/auth.service.ts（login，加 lockout）· user-admin.service.ts（加 admin-reset）· dto/
  - apps/web/src/pages/settings.tsx（account tab 加 change-password）· components/settings/users-panel.tsx（Edit dialog 加 reset）· pages/login.tsx（force-change gate）
  - CLAUDE.md §5 H1（schema 加欄）/ H4（密碼/lockout/secret）/ H5（密碼 critical-path test）/ H6（change-password UI）
prior_phase: W19-auth-user-admin
---

# Phase W20 — AUTH-4c-A（密碼自助管理）

> **Plan version**：0.1（draft）· **Owner**：Chris Lai · **ADR**：0006（**Proposed → 需 Accepted 先 code**）
> **緣起**：4a/4b 交付本地登入 + user 管理,但**改唔到密碼**（seed/create 出嚟一世唔變）、**admin 幫唔到忘密碼 user**、**無暴力破解保護**、**密碼只 min-8 floor**。本 phase = 4c 第一 slice：密碼自助管理核心。
> **緣起決策（AskUserQuestion 2026-07-13）**：完整 4c 減 email-reset · policy 嚴格。4c 拆 **4c-A（本 W20，un-blocked）/ 4c-B（W21 refresh+cookie 架構）/ 4c-C（deferred email-reset，🔴 IT-gated）**。
> **本 phase 觸 H1（additive schema）—— 由 ADR-0006 解鎖（待 Accepted）**。**唔郁 session model**（仍 localStorage/Bearer，架構改留 4c-B）→ 零架構風險。

## 0. 前置 gate（未過唔 code）
- **ADR-0006 由 Proposed → Accepted**（Chris sign-off）。schema 改 + 架構方向鎖定先開 D1。

## 1. Scope

### In（4c-A）
- **Schema**（H1 additive migration，ADR-0006 §2）：`AppUser` 加 `mustChangePassword Boolean @default(false)`、`failedLoginCount Int @default(0)`、`lockedUntil DateTime?`、`passwordChangedAt DateTime?`。
- **嚴格 policy**（H4，ADR-0006 §1）：pure helper `validatePassword(pw, {email, currentPassword?})` —— min 12 + ≥3 類（小/大/數/符）+ ≠email + 改/重設時新≠舊。前後端共用邏輯（後端 source of truth）。
- **改自己密碼**（`PATCH /me/password`）：verify currentPassword → policy → hash → update + 清 mustChangePassword + stamp passwordChangedAt。只限 local。
- **Admin 重設**（`POST /admin/users/:id/reset-password`，`@Roles(ADMIN)`）：admin 打新密碼 → policy → hash → update + 設 mustChangePassword=true。只限 local。
- **Force-change-on-first-login**：login 回應 + `/me` expose `mustChangePassword`；FE mustChangePassword=true → 強制 change-password 畫面 gate app。admin-create（4b）預設亦設 true（初次登入必改 admin 設嘅初始密碼）。
- **Lockout**（per-account）：login 失敗 failedLoginCount++；到 5 → lockedUntil=now+15min；鎖住通用 401；成功 reset。
- **前端**：Settings › Account 加「Change password」section（local session only）· 4b Edit dialog 加「Reset password」· Login 後 mustChangePassword gate（強制改）· policy 即時 feedback。
- **Tests（H5）**：見 §3。

### Out（→ 4c-B / 4c-C / 其他）
- **refresh token + httpOnly cookie**（**4c-B / W21**，ADR-0006 §7 架構改）。
- **email-based reset**（**4c-C**，🔴 IT-gated Graph Mail.Send / SMTP）。
- **per-IP rate-limit**（可日後 `@nestjs/throttler`；本 phase 只 per-account lockout）。
- 密碼歷史 / 過期輪換 policy（未要求）。

## 2. Approach
- **Migration**：改 `schema.prisma` → `migrate dev --name auth-password-lifecycle`。
- **Policy helper**：後端 `auth/password-policy.ts`（pure `validatePassword`）+ 前端 `lib/password-policy.ts`（mirror，共規則）。後端 DTO custom validator + service 再驗（source of truth）。
- **auth.service.login**：加 lockout 分支（查 lockedUntil → 通用 401；失敗 ++count / 到閾值鎖；成功 reset）+ 回 mustChangePassword。**H5 critical path**。
- **me.controller / auth**：`PATCH /me/password`（`@CurrentUser`，local only，verify current + policy + update）。
- **user-admin.service**：`resetPassword(actor, id, newPassword)` + controller `POST /admin/users/:id/reset-password`。4b create 改設 mustChangePassword=true。
- **前端**：`components/settings/change-password.tsx`（account tab，local session only）· users-panel Edit dialog 加 reset · `require-auth` / app gate 認 mustChangePassword → redirect 強制改畫面（`pages/force-password-change.tsx` 或 reuse change-password component）· login 後讀 mustChangePassword。

## 3. Deliverables
- **D1** — schema migration + policy helper（前後端）+ DTO。
- **D2** — 後端：`PATCH /me/password` + `POST /admin/users/:id/reset-password` + login lockout + mustChangePassword 傳遞 + 4b create 設 flag。
- **D3** — 前端：Change password（account tab）+ admin Reset（Edit dialog）+ force-change gate + policy feedback。
- **D4** — tests（H5）：api（policy 各規則 · change verify-current/policy/清 flag · admin-reset 設 flag · **lockout 計數/閾值/鎖/reset** · me-password local-only）· web（validatePassword 單元 + change form gate）。
- **D5** — verify（build/lint/test + **live**：改密碼 round-trip · admin-reset → force-change · lockout 5 次鎖 15min · policy 拒弱密碼 · dev-bypass/Entra regression）+ ui-design 自檢 + closeout。

## 4. Phase Gates
- **G1** schema migration applied + policy helper 前後端一致。
- **G2** 改自己密碼端到端 **live**：verify current → policy → 新密碼登入到。
- **G3** admin-reset **live**：admin 設 → user force-change → 改後正常登入。
- **G4** lockout **live**：5 次錯 → 鎖 → 通用 401 → lockedUntil 後解 / 成功 reset count。
- **G5** 嚴格 policy 拒（<12 / <3 類 / =email / 新=舊）+ 前端即時 feedback。
- **G6** H4：密碼/hash 不 log · 回應無 hash · lockedUntil 唔洩帳號存在 · me-password local-only。
- **G7** H5 test：change / admin-reset / **lockout** / policy（api）+ validatePassword（web）。
- **G8** build 0 + lint 0 + test green（api 121→+N · web 35→+N）。
- **G9** H6：change-password / force-change UI token-only · 一 primary · light+dark · ui-design 過。
- **G10** regression：dev-bypass / Entra / 現有 4a 登入 / 4b CRUD 唔破。

## 5. Decisions（ADR-0006）
嚴格 policy（min12 + ≥3類 + ≠email + 新≠舊）· lockout per-account 5次/15min 通用401 · admin-reset 設 mustChangePassword · force-change gate app · 唔郁 session model（cookie/refresh 留 4c-B）。

## 6. Risks / 誠實限制
- **lockout enumeration tradeoff**：per-account 通用 401（唔顯「已鎖」）→ 合法 user 被鎖只見「invalid」需等/搵 admin（內部工具接受;per-IP + 友善鎖定訊息可日後）。
- **force-change gate** 要確保 mustChangePassword 期間除改密碼外 app 全 gate（前端 route guard + 後端只放行 /me/password）。
- session 仍 localStorage（XSS 面）—— 收窄留 **4c-B**（誠實：本 phase 唔掂 session 架構）。
- email self-service reset 仍缺（admin-reset cover）—— **4c-C**（🔴 IT Mail.Send）。

## 7. Changelog
- 0.1（2026-07-13）— draft;ADR-0006 Proposed。2 決策鎖定（完整4c減email · 嚴格policy）+ 拆 4c-A/B/C。等 ADR-0006 Accepted + plan approve。
- 1.0（2026-07-13）— active;**ADR-0006 Accepted + plan approved + W20/W21 拆兩個 phase**（Chris sign-off）。開 D1（schema migration + policy helper）。
- 1.1（2026-07-13）— closed;D1-D5 同日完成,G1-G10 全過。additive schema migration（4 欄）· 無新 dep。api 121→140 · web 35→40 test。live:backend curl 端到端（create mustChange · weak 400 · force-change gate catalog 403 · change 204→解封 · admin-reset→再鎖 · lockout 5次→正確密碼都401）+ FE browser（temp login→/change-password gate→改→app · Settings password section · admin Must-change badge + local Edit reset 欄 · dark token swap）。**guard `ensurePasswordChanged` = ADR-0006 §5 backend force-change 強制**（honor ADR,非純 FE gate）。**deviation 無**（全依 plan/ADR;連帶 4b create 套嚴格 policy + mustChangePassword）。carry-over 4c-B（refresh+cookie）/ 4c-C（email，🔴 IT）/ per-IP rate-limit 登 BACKLOG。
