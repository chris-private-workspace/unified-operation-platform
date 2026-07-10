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
- [ ] `store/ui.ts` role mockup → msal account + 後端 role 派生
- [ ] sidebar user card（L126-144）+ topbar（L42-51）顯示真 name/email
- [ ] sign-out（`logoutRedirect`）

## D5 — Settings 畫面
- [ ] `pages/settings.tsx` + `/settings` route + sidebar nav 項
- [ ] profile + sign-out + theme（H6 忠實還原）

## D6 — "My queue" 解封
- [ ] `requests.ts` L106-107 用真 current-user identity（無 expose → honest 略去 + progress 標）

## D7 — dev-bypass 前端相容（2a）⭐
- [ ] `VITE_AUTH_DEV_BYPASS=true` → 跳 login gate + 唔 attach token（配後端）
- [ ] 現有 4 畫面 + 手測零改動照跑

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
