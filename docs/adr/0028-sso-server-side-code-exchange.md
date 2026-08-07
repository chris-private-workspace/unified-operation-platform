# ADR-0028: SSO 改用 server-side authorization code exchange

**Date**: 2026-08-07
**Status**: **Accepted**(Chris Lai,2026-08-07)
**Approver**: Chris Lai

> **Supersedes ADR-0003**(MSAL 前端 SSO)。ADR-0002(Entra JWT 驗證)**唔推翻** —— 佢定嘅 JWKS / issuer / audience 驗證邏輯照用,只係使用點由「每個 request 嘅 guard」變成「一個 callback endpoint」。

## Context

**ADR-0003 定嘅係 MSAL browser + PKCE**:前端喺瀏覽器攞 Entra **access token**,逐個 request 用 `Authorization: Bearer` 打**獨立**嘅 NestJS API。呢個設計對 app registration 有三個硬需求:

1. platform = **Single-page application**(唔係 Web)
2. **Application ID URI**(`api://…`)
3. 一個 **delegated scope**(`access_as_user`),令 access token 個 `aud` 指得返我哋個 API

**W44 B9 實測:infra 交嘅 app registration 三樣都冇**(`08fa14bf-03f7-4a1a-9c48-da31da9c47e3`,tenant `d1ea071a-…`)。全部有錯誤碼:

| 檢查 | 結果 |
|---|---|
| `<client-id>/access_as_user` | `AADSTS65005: scope 'access_as_user' that doesn't exist` |
| 對照:`<client-id>/definitely_not_real` | **同一個錯** ⇒ 測試有區分度,結果可信 |
| `api://<client-id>/.default` | `AADSTS500011: resource principal not found` |
| device code flow(public client) | `AADSTS7000218: must contain client_assertion or client_secret` |

**而佢有嘅嘢,啱啱好係另一種 flow 嘅完整配置**:

| infra 已配 | 對 MSAL SPA 嚟講 | 對 server-side code exchange 嚟講 |
|---|---|---|
| client **secret**(exp 2028-07-28) | 用唔着(PKCE 唔要 secret) | **必需** ✅ |
| redirect URI `https://rapo-uop-web-dev.rci-t.com` | 需要,但要喺 SPA platform 下 | **必需** ✅ |
| **冇**開 public client flows | ⇒ 唔似 SPA platform | **正常**(confidential client) |
| **冇** Application ID URI / scope | 🔴 **缺** | **唔需要** ✅ |

🔴 **三輪往返都攞唔到 Application ID URI** —— infra 分別答咗「web portal 網址」、「OAuth authorization endpoint」、「Application ID(client id)」。呢個唔係態度問題,係 **"Application ID URI" 呢個詞好容易被理解成「應用程式嘅網址」**。繼續要求佢哋把配置改成 ADR-0003 嘅形狀,成本同不確定性都高。

**而同一間公司另一個已上線嘅內部系統**(`ai-it-project-process-management-webapp`)用 **NextAuth.js + AzureAD provider**,行嘅正正係 server-side code exchange —— 所以佢**從來唔需要** Application ID URI。呢個係一個現成嘅、喺同一個 tenant 行得通嘅先例。

⚠️ **觸發 CLAUDE.md §5 H1**(改認證主流程 = 架構改動)⇒ 本 ADR + owner 拍板,先落 code。

## Decision

**SSO 改行 authorization code flow,由 API 喺 server 側換 token,然後發平台自己嘅 session cookie。**

### Flow

1. 用戶撳「Continue with Microsoft Entra ID」→ 前端 `GET /auth/entra/start`
2. **API** 生成 `state` + PKCE `code_verifier`,寫入一個 **short-lived httpOnly cookie**,返回 Entra authorize URL(scope = **`openid profile email`**,全部係標準 scope)
3. 前端 `window.location` 去嗰個 URL → 用戶喺 Entra 登入
4. Entra redirect 返 `https://rapo-uop-web-dev.rci-t.com/?code=…&state=…`
5. 前端讀 URL 嘅 `code` + `state`,`POST /auth/entra/callback`
6. **API**:比對 `state` → 用 **client secret + code_verifier** 打 Entra token endpoint 換 token → 驗 `id_token`(JWKS / issuer / audience,沿用 ADR-0002 邏輯)→ upsert `AppUser`(by `oid`)→ **簽發平台自己嘅 httpOnly cookie**(完全沿用 ADR-0006 §7 機制)
7. 之後所有 request 走嗰個 cookie —— **同 break-glass 一模一樣嘅路徑**

### 明確嘅設計約束

- **`state` 必驗**(CSRF)。**PKCE 照用**,即使 confidential client 唔強制 —— 佢防 code interception,成本近乎零。
- **id_token 個 `aud` = client id**(`08fa14bf-…`),呢個係 id_token 嘅標準行為,**唔需要任何自訂 scope**。
- **client secret 只喺 server 側**,永遠唔入 bundle、唔入 log(H4)。
- **`AUTH_JWT_SECRET` / break-glass 完全保留** —— ADR-0005 dual-provider 不變。SSO 出事仍然入得返去。
- **guard 現有嘅 Entra Bearer 路徑保留唔刪** —— 佢有 test、冇成本,而且 ADR-0002 仍然成立。新路徑係**加**一條,唔係換走一條。
- 🔴 **配置由 build-time 變 runtime** —— 前端唔再需要 `VITE_ENTRA_*`(嗰啲係 vite 編譯期烘死落 image)。client id / tenant / redirect URI 全部由 **API 嘅 env** 讀,即 **改配置唔使重 build image**。

### Cookie 邊界

`state` cookie 喺步驟 6 先被讀,而步驟 6 係 **same-origin fetch**(web 個 nginx 已經 proxy `/api/*`,ADR-0027 Option A)⇒ `SameSite=Strict` 行得通,唔使為咗 OAuth redirect 而放寬。步驟 4 個 top-level navigation 只係載入靜態 SPA,唔涉及 cookie。

## Alternatives Considered

- **Option A — 維持 ADR-0003,要求 infra 補三樣**(SPA platform + Application ID URI + scope)— **rejected**:三輪往返攞唔到答案;要 infra 改一個佢哋已經配好嘅 app 成另一種形狀;而且 `VITE_ENTRA_API_SCOPE` 係 build-time 烘死,估錯一次就要重 build(每次 ~10 分鐘)。**堅持呢條路嘅成本已經超過改設計嘅成本。**
- **Option B — 前端攞 `id_token` 直接送畀 API 換 cookie**(implicit-ish)— **rejected**:id_token 經瀏覽器 URL / JS 流轉,要自己處理 `nonce` replay 防護;而且 Entra 對 implicit flow 嘅支援正逐步收窄。Code flow 用 secret 喺 server 換,安全性嚴格較好。
- **Option C — 唔做 SSO,長期只用 break-glass** — **rejected**:break-glass 係應急路徑,唔係給全體用戶嘅登入方式;而且 AUTH-2b 嘅目標就係真 SSO。
- **Option D(chosen)— server-side authorization code exchange** — 因為佢**同 infra 已經配好嘅嘢完全匹配**(secret + redirect URI + confidential client),唔需要對方再做任何嘢;而且順手統一咗 session 機制、把配置由 build-time 降做 runtime。

## Consequences

- **Positive**
  - **唔再依賴 infra 補嘢** —— 現有 app registration 直接用得。
  - **SSO 同 break-glass 統一一套 session**(而家係兩套:Bearer + cookie),guard、前端 auth gate、logout 全部只需要處理一種。
  - **配置由 build-time 變 runtime** ⇒ 改 client id / tenant / redirect URI **唔使重 build web image**。呢個直接消除 W44 一直擔心嘅「估錯 scope 要重 build」風險。
  - **client secret 留喺 server**,比前端持有 token 嘅模型更穩陣。
  - 前端唔使再處理 `acquireTokenSilent` / interaction-required / token 刷新 —— 嗰啲係 ADR-0003 明文列過嘅複雜度來源。
  - 可以移除 `@azure/msal-browser` 依賴(**bundle 細 254 KB**,實測 build output)。
- **Negative**
  - **推翻 ADR-0003**,要改前端 login 流程 + 加 API endpoint(估 ~半日)。
  - 多咗一個 server 側嘅 secret 要管(但 infra 本來就畀咗,而且 R8 已登記到期日)。
  - 平台自己成為 session 嘅簽發者 ⇒ session 生命週期由我哋負責(但 ADR-0006 已經定咗呢套,唔係新嘢)。
- **Neutral**
  - ADR-0002 嘅驗證邏輯**照用**,只係由 guard 移去 callback endpoint。
  - guard 嘅 Bearer 路徑保留 —— 將來若有 machine-to-machine 需要 Entra token,唔使重寫。
  - 本 ADR **唔改 UAT**:UAT 一直行 break-glass,冇 MSAL 用戶要遷移。

## References

- **Supersedes**: `docs/adr/0003-msal-frontend-sso.md`
- `docs/adr/0002-entra-jwt-validation.md`(驗證邏輯,仍然有效)
- `docs/adr/0005-local-password-auth.md`(dual-provider,break-glass 保留)
- `docs/adr/0006-password-lifecycle-session-hardening.md` §7(cookie session 機制)
- `docs/adr/0027-azure-dev-deployment-topology.md`(api internal + web 同源 proxy,令 same-origin cookie 行得通)
- `docs/13-deployment/09-dev-as-built.md` — **B9**(三樣缺失嘅實測記錄)
- `docs/01-planning/W44-azure-dev-deploy/` — **F9**;plan 附錄 C 第四輪
- 先例:`ai-it-project-process-management-webapp`(NextAuth + AzureAD provider,同一 tenant 已上線)
