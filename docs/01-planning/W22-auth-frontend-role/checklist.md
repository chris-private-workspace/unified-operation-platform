---
phase: W22-auth-frontend-role
status: closed
---

# W22 — AUTH-3b — Checklist

> 前端全站真 role scope。純 display/gating + identity-hook,資料 filtering 唔改(後端 session scoping 已 cover)。
> 決策:統一 `GET /me` query(SSOT)+ profile initialData · My queue 本 phase 做 · Platform+admin nav 都 proactive gate。
> role→gating:ADMIN(Platform✅/admin nav✅)· REGIONAL(Platform✅/admin nav❌)· OPCO_IT(Platform❌/admin nav❌);My queue 全 role own。

## D1 — 真 role hook（SSOT）✅
- [x] `api-types` `MeResponse`(id/email/displayName/role/opcoScopeId/opcoScope/mustChangePassword)
- [x] `hooks/queries.ts` `useMe()`(apiGet('/me') + local profile 組 initialData 免閃)
- [x] `use-current-user.ts` 加 `role`/`opcoScope`(source useMe;name/email 仍 profile/MSAL/dev-bypass label)+ web build 0 驗 D1

## D2 — 退假 toggle + 真 role 顯示 ✅
- [x] `store/ui.ts` 刪 `Role`/`role`/`setRole`(淨 theme/sidebar)
- [x] `top-bar.tsx` 移除 `SegmentedControl`+`ROLES` pill;subtitle 改真 `roleScopeLabel(role,opcoScope)` 純函數(lib/roles.ts)
- [x] user menu + sidebar user card + Settings › Account 加真 role badge(重用 `lib/user-admin.ts` roleLabel/roleTone)+ **順手修 W21 carry**:Settings sign-in method 按 session(local/Entra)

## D3 — proactive gating + My queue ✅
- [x] `canSeePlatform(role)`=ADMIN/REGIONAL · `canSeeAdminNav(role)`=role==='ADMIN'(pure helper lib/roles.ts,role pending→false fail-safe)
- [x] `assets.tsx` Platform tab gate(OPCO_IT/pending 隱 switcher,強制 By-OpCo)
- [x] `sidebar.tsx` admin nav(Users&roles/Integrations)ADMIN-only 隱(canSeeAdminNav)
- [x] `lib/requests.ts` RequestFilter 加 'mine' + matchesFilter(meId) · `requests.tsx` "My queue" tab(meId from useMe)

## D4 — tests(H5)✅
- [x] `roles.test.ts` `roleScopeLabel`(ADMIN/REGIONAL/OPCO_IT+scope/pending fallback)
- [x] `roles.test.ts` `canSeePlatform`/`canSeeAdminNav`(role matrix + pending→false fail-safe)
- [x] `requests.mine.test.ts` `matchesFilter` mine(handledById===meId / 別人 / 未派 / meId 缺 / all 不受影響)
- [~] `useMe`/`use-current-user` role hook → 靠 build + live(hook wiring 簡單 me.data?.role;pure gating/filter 邏輯已 test) — 誠實標唔造 hook render test

## D5 — verify + closeout ✅
- [x] api 157 不動 + web build 0 + lint 0 + test green(web 48→**63**)
- [x] **live**(本地登入 admin + 建 OPCO_IT local user 對照):**ADMIN** subtitle "Admin — all OpCos"/Administration+Users&roles+Integrations 見/Platform 見 vs **OPCO_IT** subtitle "RHK — RHK only"/admin nav 隱/Platform 隱;My queue tab render(All=1 scoped/My queue=0);backend RHK scoping 仍 work(OPCO_IT All=1)
- [x] `ui-design` skill 自檢(role badge = 既有 Badge+roleTone DS-8 map/subtitle token/gating 純隱藏,無新 primitive)
- [x] progress retro · plan closed · BACKLOG · memory · commit(待指示)

## Phase Gate(plan §4)
- [x] G1 useMe SSOT(local /me 真 role + profile initialData 免閃;live admin/opcoit 真 role)
- [x] G2 假 toggle 消失(store/ui 無 role/setRole + top-bar 無 Regional/RHK IT pill)
- [x] G3 真 role 顯示(subtitle 3 role live 對照 + role badge user menu/sidebar/settings)
- [x] G4 Platform gate live(ADMIN 見 By OpCo+Platform / OPCO_IT switcher 全隱)
- [x] G5 admin nav gate live(ADMIN Administration 見 / OPCO_IT 隱)
- [x] G6 My queue live(tab render + matchesFilter handledById===me.id)
- [x] G7 H5 test(roles.test roleScopeLabel/canSee* + requests.mine.test matchesFilter mine)
- [x] G8 build 0 + lint 0 + test green(api 157 · web 63)
- [x] G9 H6(role badge 既有 Badge token-only/lucide 不變/ui-design 過)
- [x] G10 regression(app render 正常/backend RHK scoping 仍 work/role pending fail-safe 隱)

## Cross-Cutting
- [x] 每 commit references progress Day-N(R2)
- [x] BACKLOG 同步(R7:AUTH-3b active → ✅;真 OPCO_IT SSO e2e 隨 AUTH-2b carry)
- [x] 無 H1/H2/ADR(純前端 display/gating,無 schema/dep/架構改)
