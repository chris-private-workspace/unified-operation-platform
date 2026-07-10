---
phase: W10-auth-fe-sso
name: "AUTH-2 — 前端真 SSO (MSAL) + Login/Settings + token attach"
sprint_week: W10
backlog_id: AUTH（sub-phase AUTH-2）
start_date: 2026-07-10
end_date: TBD              # 🔴 blocked on IT SPA app registration（真 SSO e2e 前置）
status: active             # draft | active | closed
spec_refs:
  - docs/architecture.md §9（Auth / Security — SSO + 3 role）
  - CLAUDE.md §5 H2（vendor/dep lock — MSAL 新 dep 要 approval + ADR）· H4（token/secret 唔 log）· H6（Login/Settings UI 忠實還原 handoff）
  - docs/adr/0002-entra-jwt-validation.md（AUTH-1 後端 JWT 驗證 — audience 必對齊）
  - docs/adr/（本 phase 產出 ADR-0003 MSAL SSO 策略）
  - apps/web 觸點（Explore 2026-07-10）：api.ts L18/33/57 · App.tsx L18-22 · router.tsx · store/ui.ts · top-bar L42-51 · sidebar L126-144 · requests.ts L106-107
prior_phase: W09-auth-backend-guards
---

# Phase W10（AUTH-2）— 前端真 SSO (MSAL)

> **Plan version**:1.0（draft）
> **Owner**:Chris Lai
> **Approved by**:Chris Lai（2026-07-10 — OD 敲定見 §10 changelog;A=做 2a full · approve MSAL dep · redirect）
> **Kickoff（2026-07-10 已敲）**:IT SPA app registration 現況 = **未開始 / 仲傾緊**;第一步 = **plan-first + IT checklist**（唔即 code 空殼）。
> **🔴 前置 blocker**:AUTH-2 核心（真 sign-in → token → API 200）**繫死喺 IT app registration**。未 ready → 真 SSO e2e 驗唔到 → 本 plan **拆 2a（可即做,唔卡）/ 2b（卡 app reg）**,誠實標明,唔當空殼 = done（避 FE-Assets 覆轍 + H7）。
> **H2 提醒**:`@azure/msal-browser` + `@azure/msal-react` = 新 runtime dep → **STOP,需 Chris approve + 寫 ADR-0003**。approve 前唔 `npm i`。
> **H4 提醒**:access token / account claim（oid/email）**絕不 log plaintext**;`clientId` / `authority` / `scope` 一律經 `import.meta.env`（VITE_*),唔 hardcode。
> **H6 提醒**:Login / Settings 係新畫面 → 忠實還原 handoff（token-only,唔 eyeball）,commit 前跑 `ui-design` skill;新 pattern 先問。

## 1. Scope（AUTH-2 = 前端真 SSO,接 AUTH-1 後端）

**現狀**（Explore 2026-07-10）:`apps/web` 一 load 直入 shell,**無 login、無 auth gate、無真 identity**。`store/ui.ts` 個 `role: 'Regional' | 'RHK IT'` 係 **client-only mockup toggle**;sidebar user card（L126-144）+ topbar 由 `role` 硬派生假名（Alex Tan / May Wong）。api.ts 三個 fetch fn **零 token**。AUTH-1 後端已全域 `@Roles` guard,本地靠 `AUTH_DEV_BYPASS` 注入 ADMIN 先跑到。

**本 phase = 用真 Entra 登入取代 mockup**,令前端攞真 token、帶 Bearer 打後端、顯示真身份。

### 1.1 整合觸點（Explore report — 實作藍圖）
| # | 觸點 | 檔案 | 動作 |
|---|---|---|---|
| 1 | Bearer attach | `api.ts` L18/33/57（3 module-level fn） | 用 module-scoped msal `PublicClientApplication` singleton → `acquireTokenSilent({scopes,account})` → `Authorization: Bearer` |
| 2 | Provider wrap | `App.tsx` L18-22 | `<MsalProvider>` wrap（QueryClientProvider 外層） |
| 3 | Auth gate | `router.tsx` | login route + `AuthenticatedTemplate` / route guard（未登入 → Login） |
| 4 | Login 畫面 | 新 `pages/login.tsx` | 忠實還原 handoff login（MS sign-in button → `loginRedirect`/`Popup`） |
| 5 | 真 identity state | `store/ui.ts` | `role` mockup toggle → 由 msal account claim 派生真身份/角色（`AppUser.role` 來自後端 token） |
| 6 | Settings 畫面 | 新 `pages/settings.tsx` + `/settings` route | profile + sign-out + theme |
| 7 | Sign-out + 真身份 | `top-bar.tsx` L42-51 · `sidebar.tsx` L126-144 | user card 顯示真 account,加 sign-out |
| 8 | "My queue" 解封 | `requests.ts` L106-107 | 用真 current-user identity（註解已預留） |

## 2. 🔑 拆解:AUTH-2a（可即做,唔卡 IT）/ AUTH-2b（卡 app reg）

> **誠實原則**:冇 app reg,真 SSO flow **驗唔到**。以下明確分「而家驗得到」vs「必須真 app reg」。

| | AUTH-2a — 唔卡 IT（驗得到） | AUTH-2b — 卡 IT app reg（真值先驗到） |
|---|---|---|
| **內容** | MSAL dep + config scaffold（env placeholder）· `MsalProvider` wrap · Login/Settings **UI 視覺** · token-attach **機制 code** · **dev-bypass 前端相容**（MSAL 未 config → fallback,現有 FE 不破） | 真 `clientId`/`audience`/`scope` 填入 · 真 sign-in redirect flow · token acquire + Bearer + 後端 200 · 真 account identity 顯示 · sign-out flow |
| **可驗** | build · Login/Settings 對 prototype（light+dark,ui-design）· token-attach 邏輯 unit · 現有流程不破 | **真 login round-trip live**：登入 → 攞 token → API 200 → identity 顯示 → 登出 |
| **Gate** | G1–G6, G8 | **G7（依賴 app reg,未 ready 標 pending,唔當已驗）** |

## 3. Open Decisions（✅ 2026-07-10 敲定 — 見 §10 changelog）

| # | 決策 | 選項 / proposal |
|---|---|---|
| OD1 | **MSAL dep（H2）** | Approve `@azure/msal-browser` + `@azure/msal-react` + 寫 **ADR-0003**?（proposal:官方 React wrapper,microsoft-docs 核實） |
| OD2 | **2a timing** | **A** 而家做 AUTH-2a full（scaffold + Login/Settings UI + token 機制）· **B** 只做最小 scaffold（dep + config + provider,唔郁 UI）· **C（建議）** plan 定案,**唔即 code**,等 IT ready 一次過做 2a+2b。理由:Login button 冇真 flow = 空殼撳落無反應,UI 先行有返工風險（FE-Assets 教訓） |
| OD3 | **Sign-in UX** | redirect 定 popup?（doc:popup 保持 app state,redirect 用於 popup 被 block;SPA 常用 redirect + `handleRedirectPromise`） |
| OD4 | **dev-bypass 前端相容** | MSAL gate 點同 `AUTH_DEV_BYPASS` 共存?（proposal:env `VITE_AUTH_DEV_BYPASS` → 跳 login gate + 唔 attach token,配後端 bypass;令本地開發者免真登入） |
| OD5 | **Login 視覺來源** | handoff 有冇完整 Login screen mockup?（design system 有 login brand gradient + MS 4-square,需確認 prototype 有無整頁）→ 有 = 1:1 還原;無 = STOP 問 owner（H6 新 pattern） |

## 4. Deliverables（等 IT ready 時完整實作藍圖）

### D0 — ADR-0003 MSAL SSO 策略 ⭐（H2）
- **Acceptance**:`docs/adr/0003-msal-frontend-sso.md`（Context → Decision → Alternatives → Consequences → References）+ README index。記:dep 選型（`@azure/msal-browser`+`react`）· redirect/popup · token-attach（silent + interactive fallback）· dev-bypass 相容 · audience 對齊 ADR-0002。Status: Accepted。
- **Effort**:1h

### D1 — MSAL config + provider（AUTH-2a）
- **Acceptance**:`src/lib/auth/msal.ts` — `msalConfig`（env-driven:`VITE_ENTRA_CLIENT_ID`/`VITE_ENTRA_TENANT_ID`/`VITE_ENTRA_API_SCOPE`/`VITE_ENTRA_REDIRECT_URI`）→ `PublicClientApplication` **module singleton**（api.ts 亦可 import）。`App.tsx` `<MsalProvider>` wrap。缺 env → 明確 fallback（配 OD4 dev-bypass）。
- **Effort**:2h

### D2 — Login 畫面 + auth gate（AUTH-2a 視覺 / 2b flow）
- **Acceptance**:`pages/login.tsx` 忠實還原 handoff（H6;OD5）。`router.tsx` 加 `/login` + gate（`UnauthenticatedTemplate`→Login / `AuthenticatedTemplate`→shell,或 route guard）。sign-in button → `loginRedirect`/`Popup`（OD3）。**2a 驗視覺;2b 驗真 flow**。
- **Effort**:3h

### D3 — api.ts token attach（AUTH-2a 機制 / 2b e2e）
- **Acceptance**:api.ts 3 fn 打 request 前 `acquireTokenSilent({scopes:[API_SCOPE],account})` → `Authorization: Bearer`。silent fail（`InteractionRequiredAuthError`）→ `acquireTokenRedirect`（doc pattern）。401 處理。**H4**:唔 log token。dev-bypass → 唔 attach。
- **Effort**:2h

### D4 — 真 identity（store/topbar/sidebar）+ sign-out
- **Acceptance**:`store/ui.ts` `role` mockup → 由 msal account + 後端回嘅 `AppUser.role` 派生（AUTH-3 先做 per-OpCo scope,本 phase 顯示身份 + 角色即可）。sidebar user card（L126-144）+ topbar（L42-51）顯示真 name/email + **sign-out**（`instance.logoutRedirect`）。
- **Effort**:2h

### D5 — Settings 畫面
- **Acceptance**:`pages/settings.tsx` + `/settings` route（sidebar nav 加項）— profile（真 account）· sign-out · theme。忠實還原 handoff（H6;OD5）。
- **Effort**:2h

### D6 — "My queue" 解封
- **Acceptance**:`requests.ts` L106-107 "My queue" filter 用真 current-user identity（handler name 若後端有 expose）。無 expose → 續 honest 略去,progress 標明。
- **Effort**:1h

### D7 — dev-bypass 前端相容（AUTH-2a）⭐
- **Acceptance**:`VITE_AUTH_DEV_BYPASS=true` → 跳 login gate + 唔 attach token（配後端 `AUTH_DEV_BYPASS`）。令本地開發者 + 現有手測 + 現有 FE 畫面 **零改動照跑**（G4）。
- **Effort**:1h

### D8 — 測試 + e2e（H5 於 auth-adjacent）
- **Acceptance**:**2a** — token-attach 邏輯 unit（mock msal instance:silent success → header;fail → interactive)、config parse、dev-bypass 分支;現有 web test 綠。**2b** — 真 login round-trip live 驗（等 app reg）。
- **Effort**:2h

## 5. Success Criteria（Phase Gate）
| # | Criterion | Target | Measure | 卡 IT? |
|---|---|---|---|---|
| G1 | Build | 0 error | `npm run build -w @uop/web` | No |
| G2 | Login/Settings 視覺 | 對 prototype 1:1,light+dark | ui-design skill + 截圖/DOM 驗 | No |
| G3 | Token-attach 邏輯 | silent→header / fail→interactive / dev-bypass→無 token | unit test（mock msal） | No |
| G4 | 現有流程不破 | dev-bypass on → 現有 4 畫面 + 手測照跑 | 起 FE 驗 `/drift` 等讀到數 | No |
| G5 | ADR | ADR-0003 Accepted + index | 檔存在 + README 行 | No |
| G6 | H4 | 無 token/account-claim plaintext log;config 全 env | grep + review | No |
| G7 | **真 SSO e2e** ⭐ | 真 sign-in → token → **API 200** → identity 顯示 → sign-out | **live round-trip**（真 app reg） | 🔴 **Yes（pending app reg,未 ready 標未驗,唔當 done）** |
| G8 | Lint | 0 warning | `npm run lint -w @uop/web` | No |

## 6. Risks
| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R-A | app reg 未開 → G7 e2e 驗唔到 | High | High | 拆 2a/2b;G7 明標 pending;**唔當空殼 = done**（H7 誠實） |
| R-B | MSAL config 錯（scope/audience format）等真 token 先爆 | Med | High | 對照 microsoft-docs;**audience 對齊 ADR-0002 `ENTRA_API_AUDIENCE`**;scope = `api://<api-id>/access_as_user` |
| R-C | dev-bypass 前端相容差 → 本地開發者登唔到又冇 bypass | Med | Med | OD4/D7 明確設計 `VITE_AUTH_DEV_BYPASS` |
| R-D | Login handoff 視覺來源不明（H6） | Med | Med | OD5 先確認 prototype;無整頁 mockup → STOP 問 owner |
| R-E | SPA 第三方 cookie 限制 → silent 攞 token fail 頻繁 | Med | Med | doc pattern:silent fail → `acquireTokenRedirect` fallback;測 iframe/redirect |
| R-F | msal + StrictMode / redirect 重入問題 | Low | Med | `handleRedirectPromise` on load;singleton 只 init 一次 |

## 7. IT app registration 需求 checklist（前置 — 交 IT）
> 交 IT 開/確認,攞返🔑值。**② API audience 必須 = 後端 ADR-0002 `ENTRA_API_AUDIENCE`**。

**① Web API app registration（`uop-api`)** — 確認/建立:
- Expose an API → Application ID URI `api://<api-client-id>`
- Add a scope `access_as_user`（admins + users consent）→ full `api://<api-client-id>/access_as_user`
- 🔑 API **Application (client) ID** → 後端 `ENTRA_API_AUDIENCE`
- 🔑 **Tenant ID** → 後端 `ENTRA_TENANT_ID` + 前端 authority

**② SPA app registration（`uop-web`)** — 新建:
- Platform → **Single-page application (SPA)**（auth code + PKCE）
- Redirect URI `http://localhost:5173`（dev）+ prod URL（待定）
- **唔剔** implicit grant（ID/access token）
- API permissions → add ① scope（delegated）+ **grant admin consent**
- 🔑 SPA **Application (client) ID** → 前端 `VITE_ENTRA_CLIENT_ID`

**前端最終需要值**:`clientId`（②）· `authority=https://login.microsoftonline.com/<tenant-id>` · `redirectUri` · `scopes=['api://<api-id>/access_as_user']`

## 8. Day-by-Day（rough — 視 OD2 決定）
| 段 | Focus | Deliverables | 卡 IT? |
|---|---|---|---|
| 2a-D1 | ADR + dep + MSAL config + provider + dev-bypass 相容 | D0, D1, D7 | No |
| 2a-D2 | Login/Settings UI（handoff 視覺）+ auth gate + token-attach 機制 + unit | D2, D3, D5, D8(2a) | No |
| 2a-D3 | 真 identity wiring（store/topbar/sidebar/sign-out）+ "My queue" | D4, D6 | No（但無真 account 驗唔到顯示） |
| **2b** | 真值填入 → 真 sign-in → token e2e → identity → sign-out **live 驗** | D8(2b) / G7 | 🔴 **Yes** |

## 9. Dependencies on Prior Phase
AUTH-1 後端 JWT 驗證（ADR-0002;**audience 必對齊**）· api.ts / App.tsx / router.tsx / store/ui.ts（Explore 觸點）· `ui-design` skill + design-system SSOT（Login/Settings H6）· handoff login 視覺（OD5 待確認）· 後端 `AUTH_DEV_BYPASS`（前端相容配對）。

## 10. Plan Changelog
| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-10 | Initial draft（AUTH-2 前端 SSO;拆 2a 可即做 / 2b 卡 app reg;5 個 OD 待敲;IT checklist 收錄） | AUTH-1 完成後續;IT app reg 未開 → plan-first 避空殼 | Chris Lai（待 approve） |
| 2026-07-10 | **Approved → active**;OD 敲定:OD1=**approve MSAL dep + ADR-0003**、OD2=**A（而家做 AUTH-2a full）**、OD3=**redirect**、OD4=dev-bypass env（proposal default）、OD5=Login 視覺待確認 handoff（下述查證） | Chris approve 推進度;知情接受 2a UI 空殼風險（真 flow 卡 IT） | Chris Lai |

---

**Lifecycle reminder**:plan locked after status=active。deviation → §10 changelog + progress。**approve 前唔 code（R1）**。**H2**:MSAL dep 需 approve + ADR-0003 先裝。**H4**:token/account-claim 唔 log,config 全 env。**H6**:Login/Settings 忠實還原 handoff,跑 ui-design,新 pattern 先問。**誠實**:真 SSO e2e（G7）卡 app reg,未 ready 一律標未驗,唔當 done。
