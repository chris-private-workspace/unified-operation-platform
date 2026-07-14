---
phase: W22-auth-frontend-role
name: "AUTH-3b — 前端全站真 role scope (consume /me · 退假 role toggle · role 顯示 · proactive gating · My queue)"
sprint_week: W22
backlog_id: AUTH-3b
start_date: 2026-07-14
end_date: 2026-07-14
status: closed           # draft | active | closed — D1-D5 完成,G1-G10 全過(web 48→63;live ADMIN vs OPCO_IT gating 對照)
spec_refs:
  - docs/01-planning/W11-*/plan.md §1（Out — AUTH-3a 後端 scope 已建,前端真 role 列 Out → 本 phase）
  - apps/api/src/auth/me.controller.ts（GET /me → 真 { id,email,displayName,role,opcoScopeId,opcoScope,mustChangePassword }）
  - apps/web/src/lib/auth/use-current-user.ts（現 drop role/opcoScope — 主 seam）· store/ui.ts（假 role toggle,退場）
  - apps/web/src/components/shell/{top-bar,sidebar}.tsx · pages/{assets,requests,settings,overview}.tsx · lib/requests.ts · components/assets/*
  - CLAUDE.md §5 H3（AUTH sprint 內,無新 module）/ H5（role gating/filter 純函數 test）/ H6（role 顯示/gating UI token-only）
prior_phase: W21-auth-session-hardening
---

# Phase W22 — AUTH-3b（前端全站真 role scope）

> **Plan version**：1.1（closed）· **Owner**：Chris Lai · **ADR**：無（純前端 display/gating + identity-hook,唔觸 H1/H2;AUTH-3a 後端 scope 已建）
> **緣起**:AUTH-3a(W11)後端已 per-OpCo fail-closed scope + `GET /me` 回真 role,但**前端零 consumer** —— 仲用 `store/ui.ts` 假 role toggle(`'Regional'|'RHK IT'`,淨驅動 top-bar 一個 subtitle 字串)。W18 本地登入 + W21 session 令真 role 到手(login→profile.role),**唔再全卡 IT SSO**。本 phase 接真 role 落全站顯示 + gating,退假 toggle。
> **本質**:純 **display/gating + identity-hook** —— **資料 filtering 唔改**(後端 session scoping 已 cover,見 W11);前端無 role-driven query。零架構風險。
> **決策(AskUserQuestion 2026-07-14)**:真 role source = **統一 `GET /me` query(SSOT)** + profile initialData 免閃 · My queue **本 phase 做** · gating = **Platform + admin nav 都 proactive**。

## 0. 前置 gate（未過唔 code）
- **plan approve**（Chris sign-off scope + gates）→ 開 D1。**← 待**

## 1. Scope

### In（AUTH-3b）
- **真 role hook（SSOT）**:新 `useMe()` TanStack Query(`apiGet('/me')` → `MeResponse`)統一攞真 role/opcoScope —— local(cookie)/ Entra(Bearer)/ dev-bypass 皆 work。`use-current-user` 加 `role`/`opcoScope`(source useMe;local `profile.role` 作 **initialData** 免 loading 閃)。`api-types` `MeResponse`。
- **退假 toggle**:`store/ui.ts` 刪 `Role`/`role`/`setRole`(淨低 theme/sidebar)。`top-bar.tsx` 移除 `SegmentedControl` + `ROLES`,subtitle 改真 role/scope。
- **真 role 顯示**:subtitle(ADMIN "Admin — all OpCos" / REGIONAL "Regional — all OpCos" / OPCO_IT "{opcoScope.code} — {opcoScope.displayName} only")· user menu / sidebar user card / Settings › Account 加真 role badge(`roleLabel`/`roleTone` 重用 `lib/user-admin.ts`)。
- **Proactive gating**(後端 403 仍係最終防線):
  - **Platform mode**(`assets.tsx`):OPCO_IT **唔見** Platform tab(ADMIN/REGIONAL 可見)—— 唔靠 `platform-view` 403 reactive。
  - **sidebar admin nav**(`sidebar.tsx` Users&roles / Integrations):**ADMIN-only** 顯示(REGIONAL/OPCO_IT 隱藏)。
- **My queue filter**(`requests.tsx` + `lib/requests.ts`):加 "My queue" tab,client-side filter `handledById === me.id`(真 user id from useMe;list 已有 handledById,**唔使後端改**)。
- **Tests(H5)**:見 §3。

### Out（→ 其他）
- **真 OPCO_IT SSO e2e**(🔴 隨 **AUTH-2b**,卡 IT SPA app reg)—— 本 phase code 用統一 /me,**本地登入 + dev-bypass run-as 驗真 role**(ADMIN vs OPCO_IT 對照);Entra 真 SSO e2e 待 app reg。
- **後端改動**(無 —— scope/gating 資料層已 AUTH-3a 完成)。
- **account tab「Sign-in method」cosmetic**(隨顯示層,若順手可清 W21 carry;非核心)。
- **role-driven data query param**(無 —— server session scoping SSOT)。

## 2. Approach
- **`useMe()` hook**(`hooks/queries.ts`):`useQuery(['me'], () => apiGet<MeResponse>('/me'), { initialData: profileAsMe() })` —— local profile(role/opcoScopeId/id/email/displayName)組 initialData 令 local session **即時有真 role 免閃**;Entra/dev-bypass 無 profile → 首次 fetch(短暫 undefined,gating 期間**保守**:role 未知 → 唔顯示 admin nav / Platform,fail-safe)。
- **`use-current-user`**:consume `useMe()` → 加 `role`/`opcoScope`;name/email 仍 local profile / MSAL account / dev-bypass label(honest)。變 async-aware(role 可能 pending)。
- **top-bar subtitle**:`useCurrentUser().role`/`opcoScope` → 純函數 `roleScopeLabel(role, opcoScope)`(可測)。移除 useUiStore role。
- **gating**:一個細 helper `canSeePlatform(role)` = role !== 'OPCO_IT';`canSeeAdminNav(role)` = role === 'ADMIN'(pure,可測)。`assets.tsx` / `sidebar.tsx` 用。role pending → false(fail-safe 隱藏)。
- **My queue**:`lib/requests.ts` `RequestFilter` 加 `'mine'`;`matchesFilter` 簽名加 `meId?`(mine → `r.handledById === meId`);`requests.tsx` FILTERS 加 "My queue" tab(needs meId from useMe)。
- **驗證**:build/lint/test + **live** 本地登入 ADMIN vs OPCO_IT(dev run-as `AUTH_DEV_USER_EMAIL`)對照顯示/gating/My queue + 假 toggle 消失。

## 3. Deliverables
- **D1** — `useMe()` query + `MeResponse` type + `use-current-user` 加 role/opcoScope(initialData 免閃)。
- **D2** — 退假 toggle(`store/ui.ts` + `top-bar`)+ 真 role 顯示(subtitle `roleScopeLabel` + user menu/sidebar/Settings role badge)。
- **D3** — proactive gating(`canSeePlatform`/`canSeeAdminNav` → `assets.tsx` Platform tab + `sidebar.tsx` admin nav)+ My queue filter(`lib/requests.ts` + `requests.tsx`)。
- **D4** — tests(H5):`roleScopeLabel`(3 role)· `canSeePlatform`/`canSeeAdminNav`(role matrix)· `matchesFilter` mine(handledById===meId)· useMe/use-current-user role(initialData / fallback)。
- **D5** — verify(build/lint/test + **live** ADMIN vs OPCO_IT 對照:subtitle/role badge/Platform gate/admin nav gate/My queue + 假 toggle 消失 + dev-bypass regression)+ ui-design 自檢 + closeout。

## 4. Phase Gates
- **G1** `useMe()` SSOT:local/dev-bypass live 攞真 role(cookie/bypass);local profile initialData 免 loading 閃。
- **G2** 假 toggle 消失:`store/ui.ts` 無 Role/role/setRole;top-bar 無 Regional/RHK IT pill;subtitle 改真 role/scope。
- **G3** 真 role 顯示:subtitle(3 role 正確)+ user menu/sidebar/Settings role badge(真 role,token-only)。
- **G4** Platform gate live:OPCO_IT 唔見 Platform tab;ADMIN/REGIONAL 見(後端 403 仍防線)。
- **G5** admin nav gate live:非 ADMIN 唔見 Users&roles/Integrations sidebar link。
- **G6** My queue live:tab filter `handledById===me.id`(對照 ADMIN vs OPCO_IT 各自 own)。
- **G7** H5 test:roleScopeLabel · canSeePlatform/canSeeAdminNav · matchesFilter mine · useMe role。
- **G8** build 0 + lint 0 + test green(api 157 不動 · web 48→+N)。
- **G9** H6:role 顯示/gating UI token-only · lucide · light+dark · ui-design 過 · 一 primary 不變。
- **G10** regression:dev-bypass(ADMIN)/ 現有 Overview/Requests/Assets/Catalog/Settings/Login/force-change 唔破;role pending fail-safe(唔閃 admin nav)。

## 5. Decisions（AskUserQuestion 2026-07-14）
1. **真 role source = 統一 `GET /me` query(SSOT)** + local profile initialData 免閃。一致(local/Entra/dev-bypass 皆真 role);Entra 真 e2e 隨 AUTH-2b,local/dev-bypass 即驗。
2. **My queue 本 phase 做** —— client-side `handledById===me.id`(真 user id from /me),唔使後端改。
3. **Gating = Platform + admin nav 都 proactive** —— OPCO_IT 隱 Platform tab · ADMIN-only admin nav;backend 403 仍最終防線。

**實作級**:role pending(Entra/dev-bypass useMe 首 fetch)→ gating **fail-safe 隱藏**(唔閃無權嘅嘢);subtitle pending → 中性 fallback。

## 6. Risks / 誠實限制
- **真 OPCO_IT SSO e2e 卡 IT**(app reg)—— 本地登入 + dev run-as(`AUTH_DEV_USER_EMAIL=opco.it.rhk@rapo.com.hk`)驗真 role scope;Entra 真 token e2e 待 AUTH-2b。
- **role pending 短窗**(Entra/dev-bypass 首 fetch,local 有 initialData 無此窗)→ fail-safe 隱藏 admin/Platform(寧收窄唔誤開)。
- **gating 係 UX layer**:後端 fail-closed 403 先係權限真相(前端隱藏唔等於安全,只係唔顯示無權入口)。
- account tab「Sign-in method: Entra ID」對本地 user 仍寫死(W21 carry;若順手清)。

## 7. Changelog
- 0.1（2026-07-14）— draft;3 決策拍板(統一 /me SSOT · My queue 本 phase · Platform+admin nav gate)。等 plan approve 開 D1。
- 1.0（2026-07-14）— active;**plan approved（Chris sign-off）**。開 D1(useMe query + MeResponse + use-current-user 加 role)。
- 1.1（2026-07-14）— closed;D1-D5 同日完成,G1-G10 全過。**純前端 display/gating,無 schema/dep/ADR**。web 48→63 test。live ADMIN vs OPCO_IT gating 對照(subtitle/admin nav/Platform switcher/My queue + backend RHK scoping 仍 work)。**deviation**:順手修 W21 carry(settings sign-in method 按 session;plan §1 Out 允許)。carry-over 真 OPCO_IT SSO e2e(🔴 隨 AUTH-2b)。
