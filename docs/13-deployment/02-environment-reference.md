# 02 — Environment Reference

> **每個變數都對得返 code 呼叫點**(grep 佐證,非記憶)。**Secret** 欄 = 必須入 Key Vault、絕不落 git/image/log(H4)。
> UAT 認證 = **Entra SSO 主 + break-glass 本地 admin**(dual-provider,ADR-0012 D2)→ 兩套認證變數都設。`REQUEST_SUBMISSION_PROVIDER=direct`(預設),故 **n8n outbound 變數唔需要**。

## 後端(`uop-api`)

### Boot-required —— 缺任何一個 app 唔 boot(`ConfigService.getOrThrow`)

| 變數 | Secret | Code 呼叫點 | UAT 值指引 |
|---|:---:|---|---|
| `GRAPH_TENANT_ID` | | `integration/graph/graph.service.ts:43` | Entra tenant(app-only) |
| `GRAPH_CLIENT_ID` | | `graph.service.ts:44` | app registration client id |
| `GRAPH_CLIENT_SECRET` | 🔴 | `graph.service.ts:45` | **Key Vault** |
| `SERVICENOW_INSTANCE_URL` | | `integration/servicenow/servicenow.service.ts:24` | UAT-tier SN instance |
| `SERVICENOW_USER` | | `servicenow.service.ts:26` | 整合服務帳號 |
| `SERVICENOW_PASSWORD` | 🔴 | `servicenow.service.ts:27` | **Key Vault** |
| `INTAKE_API_KEY` | 🔴 | `fulfilment/intake-key.guard.ts:24` | **Key Vault**;強隨機。即使唔用 n8n inbound 都 boot-required |
| `AUTH_JWT_SECRET` | 🔴 | `auth/local-jwt.service.ts:30` | **Key Vault**;本地登入簽名 key,強隨機 ≥32 bytes。UAT 用本地登入 → **必需** |
| `DATABASE_URL` | 🔴 | Prisma datasource(`prisma/schema.prisma`) | **Key Vault**;含 DB 密碼,指向 PostgreSQL Flexible(`?sslmode=require`) |

> ⚠️ Graph / ServiceNow 喺 constructor `getOrThrow` → **即使 UAT 唔實測整合都要有值先 boot**。要真整合 = 填 UAT-tier 真憑證;淨係要 app 起身 = 合格式佔位(同本地 dev 一樣)。

### 條件式 —— 只喺特定模式先需要

| 變數 | Secret | Code 呼叫點 | 幾時需要 |
|---|:---:|---|---|
| `ENTRA_TENANT_ID` | | `auth/jwt-auth.guard.ts:62` | **Azure UAT = 設**(Entra SSO 主認證)。值 = UAT app registration tenant |
| `ENTRA_API_AUDIENCE` | | `jwt-auth.guard.ts:63` | **Azure UAT = 設**。= api app registration audience(`api://<uop-api-client-id>`) |
| `N8N_OUTBOUND_WEBHOOK_URL` | | `fulfilment/n8n-workflow.provider.ts:41` | **只**`REQUEST_SUBMISSION_PROVIDER=n8n` 時(否則唔 getOrThrow) |
| `N8N_OUTBOUND_WEBHOOK_KEY` | 🔴 | `n8n-workflow.provider.ts:42` | 同上 → **Key Vault** |

> 🔒 guard 硬規則(`jwt-auth.guard.ts:74-79`):**Entra 同本地至少要一個**,否則 boot fail。Azure UAT = **兩個都設**(Entra SSO + break-glass 本地 admin,dual-provider)。

### 設定 / 行為(非 getOrThrow,有預設)

| 變數 | 預設 | UAT 建議 | 備註 |
|---|---|---|---|
| `NODE_ENV` | — | **`production`** | → cookie `Secure`（`auth/cookie.ts:22`）→ **必 HTTPS** |
| `PORT` | `3000`（`main.ts:28`） | `3000` | ACA `uop-api` targetPort 要對齊 |
| `SERVICENOW_DEFAULT_TABLE` | `sc_req_item` | 對齊 UAT SN | |
| `REQUEST_SUBMISSION_PROVIDER` | `direct` | **`direct`** | `n8n` 先需 N8N_* 兩個變數 |
| `LOCAL_ADMIN_INITIAL_PASSWORD` | （未設則 seed skip 建 admin） | 🔴 **Key Vault**（seed-time） | seed 建本地 admin 密碼;首登強制改 |
| `AUTH_DEV_BYPASS` | 未設 | **絕不設 / `false`** | 設 `true` = 零認證全 ADMIN（`jwt-auth.guard.ts:50`）。prod 禁 |
| `AUTH_DEV_USER_EMAIL` | 未設 | 唔設 | dev-bypass 專用扮 user |

### 可選功能 —— 用 `get` 而非 `getOrThrow`(唔設唔會阻 boot)

> 🔴 **講 env 狀態必須分清兩本帳:「template 有冇」同「running container 有冇」。** 日常部署走 `az containerapp update --image`,完全唔碰 template;env 亦可以直接設落 container。所以由「`aca.json` 冇某個 parameter」**推論唔到**「container 冇嗰個 env」。**一律實測,唔信文件**:
> ```bash
> az containerapp show -g <rg> -n ca-uop-api --query "properties.template.containers[0].env[].{name:name,secretRef:secretRef}" -o table
> ```
>
> **狀態(2026-07-30 實測)**:
> - `ACS_CONNECTION_STRING`(secretRef)· `ACS_SENDER_ADDRESS` · `APP_BASE_URL` —— **container 實測已設**(前兩者 2026-07-29 由 owner 直接設落 container;設 `APP_BASE_URL` 前係 18 個,現 **19 個 env**)。**即 email 配置齊、寄得出。** template 亦已接線(CH-012)。
> - `SYNC_SWEEP_*` —— **刻意唔接線**(CH-012 §2.2 out):三個都有 default 而現行 default 就係想要嘅值。要臨時調用 `az containerapp update --set-env-vars`。
>
> ⚠️ **CH-012 嘅價值係防 regression,唔係「令 email work」** —— email 本來就 work。但 template 當時冇呢三個 parameter,一旦有人走全量 ARM(`az deployment group create`),宣告式 template 就會**抹走**手設落 container 嘅 env,email 靜靜死掉。接線後兩本帳對齊,風險消除。
>
> 🔴 全部用 `get` 而非 `getOrThrow`(ADR-0019 D4),所以**漏咗 / 填錯都唔會有任何 boot error 提示你**。

| 變數 | Secret | Code 呼叫點 | 唔設嘅後果 |
|---|:---:|---|---|
| `ACS_CONNECTION_STRING` | 🔴 | `integration/email/acs-email.service.ts:115`(定義 `integration/connectors.ts:242`) | email 功能唔開放。整條字串含 accesskey,等同「用本機構身份寄信」→ **env-only,永遠唔入 DB / API 回應 / audit / log**(ADR-0013 D2/D5) |
| `ACS_SENDER_ADDRESS` | | `acs-email.service.ts:54`(定義 `connectors.ts:238`) | 冇寄件地址 → 寄唔出。**必須係 ACS 上已驗證嘅 sender domain**,否則 ACS 收貨但唔送達而 API 仍返 `Succeeded`(CH-011 R1)。ADMIN 可喺 Settings › Integrations 覆寫(DB 蓋 env) |
| `APP_BASE_URL` | | `auth/auth.controller.ts:115` | ⚠️ **靜默失敗** —— 密碼重設 token 照發、`POST /auth/forgot-password` 照返 204,用戶永遠收唔到信,只有 api log 一行 error。**凡開放本地登入嘅環境都應該設** |
| `SYNC_SWEEP_ENABLED` | | `fulfilment/sync-sweep.service.ts:52` | default 開。**只有明文 `false` 先會停** —— 唔設 / 打錯字 = 繼續跑。Graph 出事時嘅營運急救手段(ADR-0015) |
| `SYNC_SWEEP_BATCH` | | `sync-sweep.service.ts:53` | default 50(每輪最多查幾多張) |
| `SYNC_SWEEP_MAX_AGE_DAYS` | | `sync-sweep.service.ts:55` | default 30。防殭屍單:UPN 打錯 / 帳號已刪嘅單永遠 sync 唔到,冇 cutoff 就會世世代代佔住 batch |

**走全量 ARM 部署之前**:確認 gitignored `aca.params.uat.json` 有 `acsConnectionString` 真值、`appBaseUrl` 仍係現行 web FQDN —— 否則會抹走 container 現有嘅值。走 `--image` 則唔碰 env,無此風險。

**而「配置齊」仍然唔等於「信寄得出」**:呢個 connector **冇 probe**,sender domain 唔對嗰陣 ACS 會收貨但唔送達而 API 仍返 `Succeeded`(CH-011 R1)。漏 `APP_BASE_URL` 更深一層 —— audit 會寫 `reason:'issued'` 而信一封都冇寄,連 audit 都答唔到「為咩收唔到信」。⇒ **唯一證據係收件人真係收到。**

## 前端(`uop-web`,build-time `VITE_*`)

> ⚠️ **只有 `VITE_` 前綴會 bundle 入前端 JS → 絕不放 secret**(SPA 無 client secret)。以下係 **build-arg**,喺 `docker build` / `az acr build` 時決定,烘死落 bundle。

| 變數 | UAT 值 | Code 呼叫點 | 備註 |
|---|---|---|---|
| `VITE_API_BASE_URL` | 唔設（用預設 `/api`） | `lib/api.ts:14` | 單一 origin → `/api` 由 nginx proxy,**唔使覆寫** |
| `VITE_AUTH_DEV_BYPASS` | **唔設 / `false`** | `lib/auth/msal.ts:17` | `true` = 跳 login gate（`require-auth.tsx:19`）。prod 禁 |
| `VITE_ENTRA_CLIENT_ID` | **Azure UAT = 設** | `lib/auth/msal.ts:10` | uop-web SPA app registration client id。**build-time 烘死** |
| `VITE_ENTRA_TENANT_ID` | **Azure UAT = 設** | `msal.ts:11` | tenant id |
| `VITE_ENTRA_API_SCOPE` | **Azure UAT = 設** | `msal.ts:14` | `api://<uop-api-client-id>/access_as_user`,audience 對齊後端 `ENTRA_API_AUDIENCE` |
| `VITE_ENTRA_REDIRECT_URI` | **Azure UAT = 設** | `msal.ts:29` | = **UAT hostname**(`https://<uop-web-fqdn>`),非 localhost;必與 app registration 逐字相同 |

> `msalConfigured` 需 Entra 三個值齊先 true → Azure UAT 設齊 → 前端行 **SSO redirect flow**。呢四個 `VITE_*` 係 **build-time** 烘落 `uop-web` bundle(見 `03-build-images.md` build-arg)→ image 對特定 UAT tenant/hostname specific。**非 secret**(SPA 無 client secret)。break-glass 本地 admin 唔靠呢啲(走 cookie flow,`api.ts:26`)。

## nginx（`uop-web` runtime）

| 變數 | 用途 |
|---|---|
| `API_UPSTREAM` | nginx 反向代理 `/api` 嘅目標（`uop-api` internal 位址，如 `http://uop-api:3000` 或 ACA internal FQDN）。`nginx.conf.template` envsubst 渲染 |

## UAT 最小變數清單（Entra SSO + break-glass 本地 admin + direct provider）

**後端 secret（Key Vault）**:`GRAPH_CLIENT_SECRET` · `SERVICENOW_PASSWORD` · `INTAKE_API_KEY` · `AUTH_JWT_SECRET`（break-glass）· `DATABASE_URL` · `LOCAL_ADMIN_INITIAL_PASSWORD`（seed-time break-glass）
**後端非 secret**:`GRAPH_TENANT_ID` · `GRAPH_CLIENT_ID` · `SERVICENOW_INSTANCE_URL` · `SERVICENOW_USER` · `SERVICENOW_DEFAULT_TABLE` · `NODE_ENV=production` · `PORT=3000` · `REQUEST_SUBMISSION_PROVIDER=direct` · **`ENTRA_TENANT_ID` · `ENTRA_API_AUDIENCE`**(SSO)
**前端 build-arg（非 secret,烘死落 bundle）**:`VITE_ENTRA_CLIENT_ID` · `VITE_ENTRA_TENANT_ID` · `VITE_ENTRA_API_SCOPE` · `VITE_ENTRA_REDIRECT_URI`
**明確唔設**:`AUTH_DEV_BYPASS` · `N8N_OUTBOUND_*` · `VITE_AUTH_DEV_BYPASS`
**nginx**:`API_UPSTREAM`
**container 實測已設 + template 已接線(CH-012)**:`ACS_CONNECTION_STRING`(🔴 必填,未接可用非空 placeholder)· `ACS_SENDER_ADDRESS` · `APP_BASE_URL`
**刻意唔接線**:`SYNC_SWEEP_*`(有 default,現行值就係想要嘅)· `N8N_OUTBOUND_*`(provider 寫死 `direct`)

> **前置**:`ENTRA_*` + `VITE_ENTRA_*` 需 UAT Entra **app registration**(uop-api + uop-web,即 AUTH-2b)。若部署當刻未有 → 暫時淨設 break-glass 本地(`AUTH_JWT_SECRET` + `LOCAL_ADMIN_INITIAL_PASSWORD`,唔設 `ENTRA_*`/`VITE_ENTRA_*`),SSO 後補(dual-provider 容許,唔使重 deploy 後端,但 `VITE_ENTRA_*` 屬 build-time → 前端要重 build)。
