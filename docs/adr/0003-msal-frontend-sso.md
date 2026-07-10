# ADR-0003: 前端 Entra ID SSO 策略（MSAL — AUTH-2）

**Date**: 2026-07-10
**Status**: Accepted
**Approver**: Chris Lai

## Context

ADR-0002 已定**後端** Entra JWT 驗證（`apps/api` 當 protected web API,驗 v2.0 access token,`aud` = `ENTRA_API_AUDIENCE`,全域 role guard）。但**前端 `apps/web` 仍係 mockup**:`store/ui.ts` 個 `role: 'Regional' | 'RHK IT'` 係 client-only toggle,sidebar user card / topbar 由 `role` 硬派生假名,`api.ts`（`apiGet`/`apiPost`/`apiPatch`）三個 fetch fn **零 token**。現時全靠後端 `AUTH_DEV_BYPASS` 放行先跑到。

W10（AUTH-2）要真 SSO:前端登入 Entra → 攞 **access token** → attach `Authorization: Bearer` 打後端 → 後端 ADR-0002 驗。呢個牽涉:
- **H2（vendor/dep lock）**:前端無現成 SSO 能力,要**加新 runtime dependency**（MSAL）→ 觸發 H2,Chris approve（W10 OD1）後必寫本 ADR。
- **架構級決定（R5）**:前端 auth 策略 = 安全地基,必記 ADR。

**本地限制**（同 ADR-0002 一致）:**真 SPA app registration 未開**（IT 仲傾緊）→ 前端攞唔到真 token,真 SSO 端到端驗唔到 → 需 dev-bypass 前端相容 + 拆 2a/2b。

## Decision

**1. Library** —— **`@azure/msal-browser` + `@azure/msal-react`**（Microsoft 官方 React wrapper）:
- `PublicClientApplication` 做 **module-level singleton**（`src/lib/auth/msal.ts`）—— 因為 `api.ts` 三個 fetch fn 係 **non-component**（唔喺 React context 內,唔 call 到 hook),要 import 同一個 instance `acquireTokenSilent`（microsoft-docs:context 外只可 silent,唔可 call interactive）。
- `<MsalProvider>` wrap 喺 `App.tsx`（QueryClientProvider 外層）→ 提供 `useMsal` / `useIsAuthenticated` / `AuthenticatedTemplate` / `UnauthenticatedTemplate`。

**2. Flow** —— OAuth 2.0 **Authorization Code Flow + PKCE**（SPA 標準,msal-browser 預設,唔用 implicit)。Sign-in = **`loginRedirect`**（W10 OD3;`handleRedirectPromise` on load 處理 callback)。

**3. Token acquisition + attach** —— `api.ts` 打 request 前 `acquireTokenSilent({ scopes: [VITE_ENTRA_API_SCOPE], account })` → `Authorization: Bearer <token>`;silent 失敗（`InteractionRequiredAuthError`,常因第三方 cookie 限制阻 hidden iframe）→ fallback `acquireTokenRedirect`（microsoft-docs pattern)。scope = `api://<api-client-id>/access_as_user`,其 **audience 必對齊 ADR-0002 `ENTRA_API_AUDIENCE`**（對唔上 = 後端 401）。

**4. Config（env-driven,H4）** —— `VITE_ENTRA_CLIENT_ID` / `VITE_ENTRA_TENANT_ID`（authority `https://login.microsoftonline.com/{tid}`)/ `VITE_ENTRA_API_SCOPE` / `VITE_ENTRA_REDIRECT_URI`;**絕不** hardcode clientId/tenant,**絕不 log** access token / account claim（oid/email）plaintext。

**5. Dev-bypass 前端相容（local only）** —— env **`VITE_AUTH_DEV_BYPASS`**(預設無/`false`):`true` → **跳 login gate + 唔 attach token**（配後端 `AUTH_DEV_BYPASS`),令本地開發者 + 現有 4 畫面 + 手測**零改動照跑**。prod build 一律唔設。

**6. 拆 2a / 2b（誠實,H7）** —— app reg 未開 → 真 SSO e2e（登入 → token → API 200 → identity → 登出）**驗唔到** → 分 **AUTH-2a**（MSAL scaffold + Login/Settings UI + token-attach 機制 + dev-bypass 相容;可驗:build/視覺/邏輯 unit/現有不破）同 **AUTH-2b**（真值 → 真 flow;卡 app reg)。**唔當空殼 = done**。

## Alternatives Considered

- **`@azure/msal-browser` only（無 `@azure/msal-react`）** — 可行,但要自管 React context（account state / `inProgress` / 條件 render / redirect 重入),明顯更多樣板。`@azure/msal-react` 官方提供 `MsalProvider` + hooks + `Authenticated/UnauthenticatedTemplate`,底層一樣係 msal-browser。**rejected** 只因 wrapper 慳 context 樣板,差異微（api.ts non-component 部分仍直接用 msal-browser singleton,兩者並存）。
- **`react-aad-msal` / MSAL v1** — **rejected**:deprecated,microsoft-docs 明言 migrate 去 `@azure/msal-react` + `@azure/msal-browser`。
- **自寫 OAuth 2.0 PKCE（無 library）** — **rejected**:reinvent 安全敏感 code（PKCE challenge / token cache / silent renew / hidden iframe / redirect 處理),風險高、無官方維護。
- **`@azure/msal-angular` 或其他框架 wrapper** — N/A（本前端係 React）。
- **Chosen**:**`@azure/msal-browser` + `@azure/msal-react`** — Microsoft 官方、React-first、PKCE 內建、silent+interactive fallback、hooks/template 齊,同 ADR-0002 後端 v2.0 驗證天然對齊。

## Consequences

- **Positive**:官方支援 + auth code PKCE + silent/interactive fallback + React hooks/template;audience 對齊 ADR-0002 即通;`api.ts` singleton 模式令 non-component 都攞到 token;dev-bypass 令本地/現有流程唔破。
- **Negative**:新 runtime dep（msal-browser bundle 唔細,首屏 JS ↑）—— 緩解:只 apps/web、tree-shake、對 SSO 屬必要;**真 token 端到端本 phase 驗唔到**（無 app reg)→ 明劃 AUTH-2b,唔當已驗（H7）。
- **Neutral / 風險**:①SPA 第三方 cookie 限制 → silent 攞 token 可能頻 fail → redirect fallback（microsoft-docs pattern);②`VITE_AUTH_DEV_BYPASS` 誤帶落 prod（對應後端 RISK R2）→ 預設 false、prod build 唔設;③config `scope`/`audience` format 錯 = 401,緩解:對照 microsoft-docs + IT checklist 對齊 ADR-0002;④OPCO_IT per-OpCo scope 過濾 = **AUTH-3**（本 phase 只顯示身份 + 角色,唔做 per-OpCo 資料隔離)。

## References

- `docs/adr/0002-entra-jwt-validation.md`（後端 JWT 驗證 — **audience 必對齊**）
- `docs/architecture.md §9`（Auth / Security)· CLAUDE.md §5.2 **H2**（dep lock,本 ADR 觸發)· §5.4 **H4**（token/PII)· §5.6 **H6**（Login/Settings UI fidelity）
- `docs/01-planning/W10-auth-fe-sso/plan.md`（觸發 phase;OD1 dep / OD2 timing / OD3 redirect / §7 IT checklist）
- Microsoft Learn — Get started with MSAL React:<https://learn.microsoft.com/entra/msal/javascript/react/getting-started>
- Microsoft Learn — SPA: Acquire a token to call an API:<https://learn.microsoft.com/entra/identity-platform/scenario-spa-acquire-token>
- Microsoft Learn — SPA: Call a web API:<https://learn.microsoft.com/entra/identity-platform/scenario-spa-call-api>
- Microsoft Learn — Configure an app to expose a web API（scope / audience）:<https://learn.microsoft.com/entra/identity-platform/quickstart-configure-app-expose-web-apis>
- apps/web 觸點（Explore 2026-07-10）:`api.ts` L18/33/57 · `App.tsx` L18-22 · `store/ui.ts` · `top-bar.tsx` · `sidebar.tsx`
