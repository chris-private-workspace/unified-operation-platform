# LicenseOps — Entra ID App Registration Request（交 IT）

> **提出人**：Chris Lai · **日期**：2026-07-10 · **狀態**：等待 IT 建立 / 確認
> **用途**：LicenseOps 前端（single-page app）要用 **Entra ID 做 SSO**，登入後攞 access token 呼叫後端 API。後端 JWT 驗證已上線，等前端接真 token。
> **完成後請回傳下方「④ 需回傳的 4 個值」**，我哋填入設定即可上線驗證。

---

## 背景（30 秒）

- LicenseOps = Ricoh APAC IT 內部 M365 license 履行平台。
- 架構：前端 SPA（React，跑喺 `localhost:5173`，稍後有正式部署 URL）＋ 後端 REST API（NestJS）。
- 後端已實作 **Entra JWT 驗證**（驗簽 + audience + issuer + expiry），只接受 audience 正確的 token。
- 所以需要**兩個 app registration**：一個代表 **Web API**（token 的接收方 / audience），一個代表 **SPA**（token 的請求方）。

## ⚠️ 最關鍵要求

**SPA 攞到的 access token，其 audience 必須 = Web API 的 Application ID URI / client ID。**
若兩者對唔上，後端會一律回 `401 Unauthorized`。（下方 ① 的 scope 與 ② 的 API permission 就係為咗保證呢點。）

---

## ① Web API app registration（建議名 `uop-api`）— 確認或建立

| 設定項 | 值 / 動作 |
|---|---|
| **Expose an API → Application ID URI** | `api://<api-client-id>` |
| **Add a scope** | Scope name = `access_as_user`；Who can consent = **Admins and users**；scope 全名 = `api://<api-client-id>/access_as_user` |
| **Admin consent display name / description** | 例如 `Access LicenseOps API as the signed-in user` |

> 若貴司已有一個代表此 API 的 registration，沿用即可，只需確認上面 Expose an API scope 存在。

## ② SPA app registration（建議名 `uop-web`）— 新建

| 設定項 | 值 / 動作 |
|---|---|
| **Platform 類型** | **Single-page application (SPA)**（Authorization Code Flow + PKCE） |
| **Redirect URI** | `http://localhost:5173`（開發用）＋ 正式部署 URL（**待定，稍後補上**） |
| **Implicit grant / hybrid flows** | **不要勾選** ID token / access token（SPA 用 auth-code + PKCE，不用 implicit） |
| **API permissions** | Add a permission → My APIs → 選 ① `uop-api` → **Delegated** → `access_as_user` → **Grant admin consent** |

---

## ③ 安全 / 合規備註

- 呢個係公司內部 line-of-business app，僅組織內帳戶（single tenant）登入即可。
- 唔需要 client secret（SPA 用 PKCE，屬 public client）。
- 前端 config 全部經環境變數注入，程式碼**唔會 hardcode 任何 tenant / client / secret**。

---

## ④ 需回傳的 4 個值（IT 填妥後交回）

| # | 值 | 從邊度攞 | 我哋用途 |
|---|---|---|---|
| 1 | **Tenant ID** | Entra tenant overview | 前端 authority + 後端驗證 |
| 2 | **SPA Application (client) ID** | ② `uop-web` overview | 前端 `VITE_ENTRA_CLIENT_ID` |
| 3 | **API scope 全名** `api://<api-client-id>/access_as_user` | ① `uop-api` Expose an API | 前端請求的 scope |
| 4 | **API Application (client) ID**（即 audience） | ① `uop-api` overview | 後端 `ENTRA_API_AUDIENCE` |

**回填表：**

```
Tenant ID              : ______________________________________
SPA client ID (uop-web): ______________________________________
API scope 全名          : api://__________________/access_as_user
API client ID (uop-api): ______________________________________
正式部署 Redirect URI    : ______________________________________ (若已知)
```

---

## ⑤ 收到值之後（我方負責，供參考）

1. 填入前端 `.env`（`VITE_ENTRA_TENANT_ID` / `VITE_ENTRA_CLIENT_ID` / `VITE_ENTRA_API_SCOPE` / `VITE_ENTRA_REDIRECT_URI`）＋ 後端 `.env`（`ENTRA_TENANT_ID` / `ENTRA_API_AUDIENCE`）。
2. 跑一條 live round-trip 驗證：真 sign-in → 攞 token → API 回 200 → 顯示登入身份 → sign-out。
3. 驗證通過即完成 SSO 上線。

> 有任何疑問（例如貴司已有現成 API registration、命名規範、consent 政策），請直接聯絡 Chris Lai。
