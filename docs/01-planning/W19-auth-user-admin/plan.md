---
phase: W19-auth-user-admin
name: "AUTH-4b — local user administration (admin CRUD + role/opco-scope + Settings › Users & roles UI)"
sprint_week: W19
backlog_id: AUTH-4b
start_date: 2026-07-13
end_date: 2026-07-13
status: closed            # draft | active | closed — D1-D6 完成,G1-G8 全過（api 109→121 · web 25→35;live backend + FE browser light/dark + 403 restricted）
spec_refs:
  - docs/adr/0005-local-password-auth.md §6（AUTH-4b = admin 建/列/改/停用本地 user + role/opcoScope + Users&roles UI）
  - docs/01-planning/W18-auth-local-login/（AUTH-4a — 本地登入核心,本 phase 建喺其上）
  - apps/api/src/auth/auth.service.ts（argon2 · me-shape mapping）· jwt-auth.guard.ts（Entra upsert 唔碰 role/scope → SSO user 可管理）· opco-scope.ts
  - apps/web/src/pages/settings.tsx（Users & roles = coming-soon stub，本 phase 取代）
  - design_handoff_licenseops/design-system/components/feedback/Dialog.{jsx,d.ts}· forms/Select.d.ts（primitive 重建規格，H6）
  - CLAUDE.md §5 H4（密碼/secret/PII）/ H5（建 user·hash critical-path test）/ H6（Users&roles UI token-only）
prior_phase: W18-auth-local-login
---

# Phase W19 — AUTH-4b（本地 user 管理）

> **Plan version**：1.0 · **Owner**：Chris Lai · **ADR**：0005 §6（AUTH-4b，已 Accepted）
> **緣起**：AUTH-4a（W18）交付本地登入核心,但 Login 只認 seed 出嚟嘅本地 admin;**冇 admin UI 建/管其他本地 user**。本 phase = ADR-0005 第二個交付:admin 建/列/改/停用 user + 設 role / OpCo scope + Settings › Users & roles 真表(取代 coming-soon stub)。
> **紀律判定：本 phase 唔觸 H1/H2 STOP** —— `AppUser` schema 已有齊需要欄(`passwordHash`/`authProvider`/`role`/`opcoScopeId`/`active`),建/改 user = INSERT/UPDATE **無 migration**（同 AUTH-3a / W16 純 query/service-layer 先例）;argon2 W18 已加,**無新 dep**。ADR-0005 早已解鎖 auth 架構。H4 高度小心 · H5 寫 test · H6 前端 token-only。

## 0. 決策（AskUserQuestion 2026-07-13，Chris 拍板）
- **D-a 初始密碼 = admin 打**：Create 表單有密碼欄,admin 自己打 → argon2 hash 存;user 用佢登入。密碼欄設 min-length floor（class-validator）;**full policy / 改密碼 / 重設 / force-change 全屬 AUTH-4c**,本 phase 唔做。
- **D-b 表涵蓋全部 user（local + SSO）**：Users & roles 表列 local + Entra SSO user（顯 provider badge）;**Create + 設密碼只限 local**;**role / OpCo scope / active（停用）可改兩種 provider**。技術安全:guard upsert（`jwt-auth.guard.ts:180-184`）登入時只更新 email/displayName/lastLoginAt,**唔碰 role/opcoScopeId** → admin 改 SSO user 嘅 role/scope 唔會被下次登入覆寫。
- **D-c 停用非刪除（自行鎖,唔問）**：一律 `active=false` 停用,**絕不 hard-delete**（H4 唔永久刪資料 + FK 完整性:`Request.handledById` / `RequestEvent.actorId` 引用 AppUser）。
- **D-d `@Roles(ADMIN)` only（BACKLOG / ADR 已鎖）**：REGIONAL 睇唔到 / 管唔到 user。
- **D-e 安全閘（自行鎖）**：唔可以停用 / 降級自己;唔可以停用 / 降走「最後一個 active ADMIN」（免鎖死全部人）。

## 1. Scope

### In
- **後端**（入現有 `auth` module,`@Roles(ADMIN)`；無新 module 邊界、無 schema 改）：
  - `GET /admin/users` — 列全部 AppUser（id / email / displayName / role / opcoScope / authProvider / active / lastLoginAt）—— **一律無 passwordHash**（重用 me-shape 排除）。
  - `POST /admin/users` — 建 local user：body = { email, displayName, role, opcoScopeId?, initialPassword } → 驗（OPCO_IT 必須有 opcoScopeId;ADMIN/REGIONAL 不可有;email 重複 → 409;initialPassword min-length）→ argon2 hash → insert `authProvider='local'`。回 me-shape（無 hash）。
  - `PATCH /admin/users/:id` — 改 role / opcoScopeId / active（兩種 provider 皆可）。含 D-e 安全閘。**唔含改密碼（4c）**。
  - `GET /admin/opcos` — { id, code, displayName }（active OpCo）俾 create 表單 selector（**現時無此 endpoint**）。
- **前端**（Settings › Users & roles）：
  - 真 user 表:email / displayName / role / OpCo scope / provider badge（Local / SSO）/ status（Active / Disabled）/ lastLoginAt。數字/識別碼 mono（DS-5）。
  - 「**Add user**」= 該 view 唯一 primary（Ricoh red，DS-3）→ 開 Dialog 表單（Role = SegmentedControl;OpCo = Select,只 OPCO_IT 顯);錯誤 danger-soft toast。
  - Row actions:改 role / 改 OpCo scope / 停用·重新啟用（PATCH mutation + invalidate）。
  - **非-ADMIN 靠 403 graceful**（queries 403 → restricted EmptyState,同 W17 Platform mode）—— 唔靠未做嘅 AUTH-3b 真 role gating,唔造假數。
  - Primitive:由 handoff 規格重建 `Dialog` + `Select`（token-only;precedent = FE-2 重建 Stepper/Tabs）。
- **Tests（H5）**：見 §3 D2 / D5。

### Out（→ AUTH-4c / 其他）
- 自助改密碼 / admin 重設密碼 / force-change-on-first-login / lockout / rate-limit / 密碼 policy（**AUTH-4c**）。
- 密碼重設 email transport（4c,另一 H2 sub-decision）· refresh token · httpOnly cookie（4c）。
- 前端全站真 role gating（**AUTH-3b**;本 phase 只靠後端 `@Roles` + 403 graceful）。
- hard-delete user（永不做,D-c）。

## 2. Approach
- **後端** 全部落現有 `apps/api/src/auth`：`user-admin.controller.ts` + `user-admin.service.ts` + `dto/`（CreateUserDto / UpdateUserDto / AdminUserDto / AdminOpcoDto）;wire 入 `auth.module.ts`（加 UserAdminService provider + UserAdminController）。
- **argon2 hash** 重用（W18 已 dep）;service `hash(initialPassword)` → 存 `passwordHash`。H4:**唔 log 密碼/hash**,只 log 結果 + actorId + 新 userId。
- **me-shape mapping** 抽一個 `toAdminUser(user, opco?)` helper（絕不外露 passwordHash;類似 auth.service 已有做法）。
- **安全閘**（D-e）：PATCH 時若 `active:false` 或 `role != ADMIN` 作用喺「最後一個 active ADMIN」或「自己」→ 400/403 拒絕。
- **前端** `hooks/queries.ts` 加 `useAdminUsers` / `useAdminOpcos`（lazy `enabled`）+ mutations `useCreateUser` / `useUpdateUser`（onSuccess invalidate `admin-users`）;`lib/api-types.ts` 加型;`pages/settings.tsx` users tab 重寫;新 `components/ui/dialog.tsx` + `select.tsx`（handoff 重建);`components/settings/users-panel.tsx` 承載表 + Add dialog + row actions。
- **403 graceful**：query `retry` 遇 403 唔 retry（同 W17 tenant-skus 做法）;isError && 403 → restricted EmptyState。

## 3. Deliverables
- **D1** — 後端:DTOs + `UserAdminService`（list / create[argon2] / update[+安全閘] / listOpcos）+ `UserAdminController`（`@Roles(ADMIN)`;GET/POST/PATCH `/admin/users` + GET `/admin/opcos`）+ `auth.module` wiring。
- **D2** — 後端 tests（H5）:create → hash 存 + role/scope 正確 + **回應無 passwordHash**;OPCO_IT 冇 scope → 400;email 重複 → 409;update role/active;**D-e 安全閘**（停自己 / 停最後 ADMIN → 拒）;非-ADMIN → controller guard 403;**round-trip:create local user → auth.service.login 成功 → 停用後 login 401**。
- **D3** — 前端 primitive:`dialog.tsx` + `select.tsx`（handoff `Dialog.jsx` / `Select.d.ts` 重建,token-only,light+dark，Esc/overlay 關,focus trap 基本）。
- **D4** — 前端 Users & roles:`api-types` + queries/mutations + `users-panel.tsx`（表 + Add dialog + row actions + 403 restricted）;settings users tab 接。
- **D5** — 前端 tests（web）:純 helper 單元（provider/scope/status 顯示 + create 表單 validation gate，如 OPCO_IT 需 scope）—— match 現有 `lib/*.test.ts` 風格。
- **D6** — verify（build/lint/test + **live**:admin create local user → 新 user `POST /auth/login` 登入 → token → guarded 200 拎到**對應 role/scope** 嘅數 → 改 role / 停用 → 停用後登入 401;非-ADMIN 403 graceful;light+dark）+ `ui-design` 自檢 + closeout。

## 4. Phase Gates
- **G1** admin CRUD 三 endpoint 通 + `@Roles(ADMIN)` 強制（非-ADMIN → 403）。
- **G2** create local user 端到端 **live**:admin 建 → 新 user 登入 → token → guarded 200 + 正確 role/scope。
- **G3** H4:無 endpoint 回 passwordHash;密碼/hash 不 log;create/list/update 皆 me-shape。
- **G4** 安全 + 驗證:D-e 安全閘（停自己 / 停最後 ADMIN 拒）· OPCO_IT 需 opcoScope · email 重複 409。
- **G5** H5 test:service（create/update/安全閘）+ controller guard 403 + hash 不外露 + 停用-blocks-login round-trip。
- **G6** api build 0 + web build 0 + lint 0 + test green（api 109→+N · web 25→+N）。
- **G7** H6:Users&roles UI token-only（唔 hardcode/eyeball）· Dialog/Select 由 handoff 重建 · 一 primary（Add user）· lucide · light+dark · `ui-design` skill 過。
- **G8** 前端 403 graceful:非-ADMIN 見 restricted state,**唔造假數**（同 W17 誠實 gap 做法）。

## 5. Decisions（§0 + ADR-0005 §6）
D-a admin 打初始密碼 · D-b 表涵蓋 local+SSO（create/密碼限 local，role/scope/active 兩者可改）· D-c 停用非刪除 · D-d `@Roles(ADMIN)` only · D-e 安全閘（唔停自己 / 唔停最後 ADMIN）。

## 6. Risks / 誠實限制
- **前端未有全站真 role**（AUTH-3b 未做）→ Users tab 靠後端 `@Roles` + 403 graceful,唔靠 FE role gating。誠實:非-ADMIN 開 tab 見 restricted,唔係「見唔到 tab」。
- **首個 modal / dropdown primitive**（Dialog / Select）—— 必須忠實重建 handoff 規格（H6）,唔自創美學;`ui-design` 自檢把關。
- **本地 user login round-trip** 依賴本地 `.env` 有 `AUTH_JWT_SECRET`（同 W18）。
- 初始密碼由 admin 打 + 無 force-change（4c）→ admin 要 out-of-band 傳俾 user;本 phase 誠實限制,登 §6 + 4c carry-over。
- 改密碼 / 重設 / lockout 全缺（4c）—— user 唔記得密碼要 4c 或 admin 重建。

## 7. Changelog
- 1.0（2026-07-13）— active;ADR-0005 §6。2 決策 AskUserQuestion 鎖定（admin 打密碼 · 表涵蓋 local+SSO）。開 D1。
- 1.1（2026-07-13）— closed;D1-D6 同日完成,G1-G8 全過。無 schema/dep（純 query/service-layer，H1/H2 不觸發）。api 109→121（user-admin.service 11 + guarded 1）· web 25→35（user-admin 10）。live:backend curl 端到端（create→login→OPCO_IT scoped ledger 200 · 無 hash · 409/400×3 · 非-admin 403 · last-admin 400）+ FE browser（admin 4 行真數 · Add/Edit Dialog + Select · light+dark #E60027 sole primary · OPCO_IT 403 restricted 誠實無造假）。順手修 settings account tab sign-out（MSAL-only → useSignOut，清 W18 orphan;R3 note）。踩坑:5173 vite stale（tab cached 但 server 死）→ fresh 起。carry-over AUTH-4c/3b/account-provider-label 登 BACKLOG。
