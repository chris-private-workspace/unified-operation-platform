---
phase: W10-auth-fe-sso
deliverable: AUTH-2b (G7 live e2e)
status: blocked-on-it-app-reg   # 前端 code 全就緒(AUTH-2a);G7 卡 IT app registration
readiness_verified: 2026-07-15  # web build + 85 test 綠;msal.ts / api.ts wiring 確認就緒
---

# AUTH-2b — 真 SSO e2e Run Runbook（IT handoff + config + G7 驗證）

> **定位**:AUTH-2b = W10 最後一個 gate（G7:真 sign-in → token → API 200 → identity → sign-out）。**前端 code 100% 已交付**(AUTH-2a);**唯一 blocker = IT 未開 Entra app registration**。本 runbook = ①可直接交 IT 的 app-reg handoff ②值到後的 config 步驟 ③live-run + G7 驗證清單。值齊後全程約 10 分鐘。
> **誠實(H7)**:app reg 未 ready 前,G7 **未驗 = 未 done**;唔當空殼 = 完成。
> **兩件必須人手做**(AI 做唔到):**創建/consent app registration**(Azure 權限操作)+ **真實 sign-in 輸入帳密**(絕不代入 credential)。AI 可配非-secret env、驗 wiring、sign-in 後驗 round-trip 結果。

---

## Part A — IT app registration handoff（交 IT;可直接複製）

> 需開/確認 **兩個** app registration。**關鍵:② SPA 攞 token 的 audience 必須 = ① Web API 的 client ID**(對唔上 = 後端 401,ADR-0002)。

### ① Web API app registration（`uop-api`）
- **Expose an API** → set Application ID URI = `api://<uop-api-client-id>`
- **Add a scope**:`access_as_user`（Who can consent = Admins **and** users）→ 完整 scope = `api://<uop-api-client-id>/access_as_user`
- 🔑 回傳 **Application (client) ID** → 後端 env `ENTRA_API_AUDIENCE`（必對齊 ADR-0002）

### ② SPA app registration（`uop-web`）— 新建
- **Authentication → Add platform → Single-page application (SPA)**（Authorization Code + PKCE）
- **Redirect URI**:`http://localhost:5173`（dev）＋ 之後 prod URL（待定）
- **唔剔** implicit grant（access token / ID token 兩個都唔剔 — SPA 用 auth-code+PKCE）
- **API permissions** → Add a permission → My APIs → ① `uop-api` → delegated `access_as_user` → **Grant admin consent**
- 🔑 回傳 **Application (client) ID** → 前端 `VITE_ENTRA_CLIENT_ID`

### 需要 IT 回傳的 5 個值
| 值 | 去邊 |
|---|---|
| `uop-web` client ID | `VITE_ENTRA_CLIENT_ID` |
| Tenant (directory) ID | `VITE_ENTRA_TENANT_ID`（authority `https://login.microsoftonline.com/<tenant-id>`） |
| `api://<uop-api-client-id>/access_as_user` | `VITE_ENTRA_API_SCOPE` |
| Redirect URI（登記值,逐字） | `VITE_ENTRA_REDIRECT_URI`（dev = `http://localhost:5173`） |
| `uop-api` client ID | 後端 `ENTRA_API_AUDIENCE`（= scope 的 audience） |

> 全部**非 secret**（client/tenant ID 係公開識別碼;SPA PKCE 無 client secret）—— 可平文放 `.env`(仍 gitignored,唔 commit)。

---

## Part B — Config（值到後）

1. **前端** `apps/web/.env`(copy `.env.example`)填 4 個 `VITE_ENTRA_*`,並 **`VITE_AUTH_DEV_BYPASS=false`**（或移除）→ `msalConfigured` 變 true,啟真 SSO。
2. **後端** `apps/api/.env`:`ENTRA_API_AUDIENCE` = `uop-api` client ID;關 **`AUTH_DEV_BYPASS`**（false/移除)→ 後端真驗 JWT。
3. 確認 redirect URI 三處一致:app reg 登記值 = `VITE_ENTRA_REDIRECT_URI` = 實際 dev URL（`http://localhost:5173`）。

---

## Part C — Live run + G7 驗證清單

> 起前端 `npm run dev`(apps/web,port 5173)+ 後端(port 3100)。**真 sign-in 由人手做**(輸入帳密);AI 可喺各步後驗結果。

| # | 步驟 | 驗證(G7) |
|---|---|---|
| 1 | 開 `http://localhost:5173` | 未登入 → 見 **Login 畫面**(`UnauthenticatedTemplate` gate) |
| 2 | 撳 MS sign-in → **`loginRedirect`** → Microsoft 登入頁 → **人手輸入帳密 + consent** | redirect 返 app,`handleRedirectPromise` set active account |
| 3 | 入到 app shell | topbar / sidebar 顯示**真** name/email(msal account claim);role 來自後端 token |
| 4 | 任一數據畫面(Overview/Requests…)load | Network:request 帶 `Authorization: Bearer <token>`;API **200**(後端驗 v2.0 token,audience 對齊) |
| 5 | 觀察 backend log | 無 401;`@Roles` 放行對應角色 |
| 6 | Sign-out(`logoutRedirect`) | 清 session → 返 Login;再 call API 無 token → gate 擋 |

**G7 pass 條件**:1-6 全綠(真 token round-trip 端到端）。pass 後 → W10 status `active → closed`,BACKLOG AUTH-2b 🔴→✅。

---

## Part D — Readiness 驗證（2026-07-15,已做）

> app reg 未到,但**前端 wiring 已確認就緒**,值一到即可跑 Part C:

- `apps/web/src/lib/auth/msal.ts`:env-driven config（`VITE_ENTRA_*`)+ `msalConfigured` gate（clientId 有值先啟真 flow)+ `initMsal` 處理 redirect + dev-bypass fallback + H4 logger drop PII。✅
- `apps/web/src/lib/api.ts` `authHeader`:local-cookie / dev-bypass / unconfigured → 無 header;否則 `acquireTokenSilent({scopes:[API_SCOPE]})→Bearer`;`InteractionRequiredAuthError`→`acquireTokenRedirect`;H4 唔 log token。✅
- `apps/web/.env.example`:新增,列齊 5 個 key（本 runbook 交付）。✅
- **web build ✓（tsc + vite,msal-vendor chunk 254KB « CH-001 split）· vitest 85 綠**（含 authHeader 分支）。✅

## Part E — 常見坑（ADR-0003 §Consequences 風險）
- **scope/audience format 錯 → 真 token 先爆 401**:scope 必 `api://<uop-api-id>/access_as_user`,audience 必 = 後端 `ENTRA_API_AUDIENCE`。
- **SPA 第三方 cookie 限制 → silent 攞 token fail**:已有 `acquireTokenRedirect` fallback(api.ts);若 silent 頻 fail 屬預期,行 redirect。
- **dev-bypass 誤帶落 prod**（RISK R2):prod build 一律 `VITE_AUTH_DEV_BYPASS` 不設 + 後端 `AUTH_DEV_BYPASS` off。
- **redirect URI 唔逐字對** → AADSTS50011:三處(app reg / env / 實際 URL)必完全一致。
