---
phase: W10-auth-fe-sso
status: active
---

# W10（AUTH-2）— Checklist（daily tick）

> 對應 `plan.md` deliverables。**approve 前唔 tick（R1）**。🔴 = 卡 IT app registration。

## D0 — ADR-0003 MSAL SSO 策略（H2）
- [x] `docs/adr/0003-msal-frontend-sso.md`（Context→Decision→Alternatives→Consequences→References）
- [x] `docs/adr/README.md` index；Status Accepted

## D1 — MSAL config + provider（2a）
- [x] dep `@azure/msal-browser` ^5.17.0 + `@azure/msal-react` ^5.5.2（H2 approved + ADR-0003）
- [x] `src/lib/auth/msal.ts` — env-driven `msalConfig` + `PublicClientApplication` module singleton + `initMsal()`（initialize + handleRedirectPromise）
- [x] `App.tsx` `<MsalProvider>` wrap（最外層）+ `main.tsx` init-before-render（dev-bypass 相容 finally render）
- [x] 缺 env → fallback（placeholder clientId/`common` authority 令 MSAL constructible;`msalConfigured` gate 真用;`initMsal` no-op）
- 驗:build 1826 modules 0 error（+158 = MSAL）。⚠️ bundle 568KB > 500KB warning（ADR-0003 預期,技術債:之後 code-split）

## D2 — Login 畫面 + auth gate（2a 視覺 / 2b flow）
- [x] `pages/login.tsx` 忠實還原 handoff §0 two-panel — **render 驗 light+dark**（DOM + screenshot 對 §0）
- [x] `router.tsx` `/login` + `RequireAuth` gate（dev-bypass skip;否則未登入→/login）
- [x] sign-in button → `loginRedirect`（OD3 redirect;未 config disabled + note,誠實唔造假 flow）
- [x] 新 primitive `checkbox.tsx` + `--gradient-brand` token（mid stop reuse `--accent-deep`）;MS 4-square logo（DS-6 exception）
- 驗:build 1829 modules 0 error;`--gradient-brand` resolved 正確;email/password/Sign in disabled（唔造收密碼假 form）;dark form panel token swap OK

## D3 — api.ts token attach（2a 機制 / 2b e2e）
- [x] api.ts 3 fn → `authHeader()` → `acquireTokenSilent` → `Authorization: Bearer`
- [x] silent fail（`InteractionRequiredAuthError`）→ `acquireTokenRedirect`
- [x] H4 唔 log token；dev-bypass / 未 config / 未登入 → 無 header（後端 bypass 或 401）
- 驗:build 1826 modules 0 error（compile-verified）。runtime 邏輯 = D8 unit;真 token e2e = G7 卡 app reg

## D4 — 真 identity + sign-out
- [x] `lib/auth/use-current-user.ts`（msal account → name/email;dev-bypass → 誠實 "Developer/Local dev-bypass",唔造假 user）
- [x] sidebar user card 真 name/email 取代硬派生假名 + 移除 sidebar unused role（§1.3 surgical）
- [x] sign-out（`logoutRedirect`;非 dev-bypass + configured 先顯示）
- 驗:build 573KB 0 error（compile）。honest gap:後端無 /me role endpoint → role 顯示留 AUTH-3;topbar user-menu avatar（README §1）defer（sidebar 已提供 sign-out）

## D5 — Settings 畫面
- [x] `pages/settings.tsx`（4-tab Account/Preferences/Users&roles/Integrations）+ `/settings` route + sidebar Administration nav + top-bar title map
- [x] Account:profile 真 identity disabled + SSO note + sign-out（dev-bypass honest note）· Preferences:theme SegmentedControl 真 · Users&roles/Integrations:coming-soon EmptyState（無 endpoint,誠實）
- 驗:build 578KB 0 error;**render DOM 驗**（4 tabs / Account disabled profile / dev-bypass note / Preferences theme control / tab 切換 / top-bar title "Settings"）。Settings = 既有 primitive 組合;screenshot renderer busy → DOM 驗結構（Login 已有 light+dark 視覺驗）

## D6 — "My queue" 解封（honest 略去 — 後端 blocker）
- [x] 查證:list 冇 handler expose + detail `handledById` 係 AppUser.id（前端 useCurrentUser 只 msal account,無 AppUser.id 可 match）→ **仍做唔到**,honest 略去（唔造假 "my" filter）
- [x] requests.ts comment 精確化 blocker（AUTH-2 identity 到咗,仲差 list handler-read + /me endpoint）→ 真正解封留後端 mini-phase

## D7 — dev-bypass 前端相容（2a）⭐
- [x] `VITE_AUTH_DEV_BYPASS=true` → RequireAuth skip gate + authHeader 唔 attach token（配後端）
- [x] 現有畫面照跑（bypass on → shell render,sidebar dev identity,nav/Settings work）
- 驗:**live 驗**（bypass on:route `/` 冇 redirect + shell render + sidebar "Developer/Local dev-bypass" + 無 sign-out;bypass off[之前]:未登入→/login）

## D8 — 測試（H5 auth-adjacent）
- [ ] token-attach 邏輯 unit（mock msal:silent→header / fail→interactive / bypass→無 token）
- [ ] config parse + dev-bypass 分支；現有 web test 綠
- [ ] 🔴 真 login round-trip live（2b,等 app reg）

## Phase Gate（plan §5）
- [ ] G1 build 0 error
- [ ] G2 Login/Settings 視覺對 prototype（light+dark,ui-design skill）
- [ ] G3 token-attach 邏輯 unit
- [ ] G4 現有流程不破（dev-bypass on,4 畫面照跑）
- [x] G5 ADR-0003 Accepted
- [ ] G6 H4（無敏感 log,config env）
- [ ] 🔴 G7 真 SSO e2e（真 sign-in→token→API 200→identity→sign-out）— **卡 app reg,未 ready 標未驗**
- [ ] G8 lint clean

## Closeout
- [ ] plan status → closed（或 2a-done + 2b-pending）· progress retro · BACKLOG 同步
- [ ] SESSION_SUMMARY + memory 更新
- [ ] commit · push（待用戶指示）
