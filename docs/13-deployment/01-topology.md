# 01 — Topology(Azure Container Apps 單一 origin)

> 決定來源:[ADR-0012](../adr/0012-azure-uat-deployment-topology.md)。此文件 = 架構圖 + 資源清單 + 網路/port/secrets 流向。
>
> 🔴 **本文件描述 as-built(實際跑緊嘅嘢),唔係目標架構。** 公司 proxy 擋 data-plane,令四樣嘢同 W32 原藍圖唔同(secret 存法 / DB 存取 / ACR 認證 / SSO)。**四樣都係 hardening 目標而非現況** —— 一覽見下面「[as-built vs hardening 目標](#as-built-vs-hardening-目標)」,清單見 [`06-prod-hardening-checklist.md`](./06-prod-hardening-checklist.md)。
>
> 呢份文件曾經**把目標當成現況**寫(2026-07-30 修正):資源清單寫住 secret 喺 Key Vault、DB private access、ACR 用 Managed Identity —— 三樣都未做。照住嗰個版本理解會誤判 secret 已受 KV 保護。

## 架構圖

```
                       ┌─────────────────────────────────────────────┐
   Browser ──HTTPS──▶  │  ACA external ingress(單一對外 hostname)     │
   (操作員)            │                                             │
                       │   /            ┌──────────────────────────┐ │
                       │   ├──────────▶ │ uop-web(nginx:alpine)    │ │
                       │   │            │  · serve SPA static       │ │
                       │   │            │  · /api/* → 反向代理       │ │
                       │   /api/*       └────────────┬─────────────┘ │
                       │                             │ internal        │
                       │                ┌────────────▼─────────────┐  │
                       │                │ uop-api(NestJS)          │  │
                       │                │  · internal ingress only  │  │
                       │                └────────────┬─────────────┘  │
                       └─────────────────────────────┼────────────────┘
                                                      │ 5432 (private)
                                        ┌─────────────▼──────────────┐
                                        │ PostgreSQL Flexible Server  │
                                        │ (managed · private access)  │
                                        └─────────────────────────────┘

   ACA native secret ──▶ container env(secretRef)   ※ Key Vault 已建但未接線
   ACR           ◀── ACA 拉 image(admin credentials,非 Managed Identity)
   Log Analytics ◀── ACA 兩個 container stdout/stderr
```

**重點**:對外只有 **一個** ingress hostname(掛喺 `uop-web`)。`uop-api` 用 **internal ingress**(唔對外),只俾 `uop-web` 嘅 nginx 同同一 ACA environment 內部叫。瀏覽器由頭到尾只見一個 origin → `SameSite=Strict` cookie work、零 CORS。

## 資源清單(UAT)

| 資源 | Azure 服務 | 用途 | 備註 |
|---|---|---|---|
| ACA environment | Azure Container Apps Environment | 兩個 container app 嘅 host | 綁 Log Analytics workspace |
| `uop-web` | Container App(external ingress) | nginx serve SPA + proxy `/api` | targetPort **8080** |
| `uop-api` | Container App(**internal** ingress) | NestJS API | targetPort **3000**(`PORT`) |
| DB | Azure Database for **PostgreSQL Flexible Server** | state layer(Prisma) | version 16 對齊本地。⚠️ **`--public-access 0.0.0.0`**(= allow Azure services,令 ACA 到到);private access / VNet 係 hardening 目標 |
| Secrets | **ACA native secureString**(經 ARM params 檔傳) | 全部 secret | ⚠️ **唔係 Key Vault** —— KV data-plane 被公司 proxy 擋。KV 已建但**未接線**,遷 KV + Managed Identity 係 hardening 目標 |
| Images | Azure **Container Registry**(ACR) | `uop-api` / `uop-web` image | ⚠️ ACA 用 **admin credentials** 拉(`--admin-enabled true`,密碼經 ARM 落 secret);改 Managed Identity 係 hardening 目標 |
| Logs | **Log Analytics** workspace | container log | RCI 標準(PAR Appendix) |
| ~~Redis~~ | ~~Azure Cache for Redis~~ | — | **暫不開**:BullMQ 未 wired(只 `@nestjs/schedule` @Cron) |

## 資源清單(DEV)—— `RG-RAPO-UOP-DEV`(2026-08-13 補,W44 `F8-2`)

> **細節唔喺呢度** —— DEV 嘅完整 as-built(含每個 blocker 點解封)住喺 **`09-dev-as-built.md`**;本段只講**同 UAT 結構上唔同嘅嘢**,免得兩份各自漂移。
> 🔴 **「Azure UAT」係誤名** —— 上面 UAT 嗰個**唔係企業 UAT**,只係一個自建測試環境(自建 RG / ACR / ACA env,**冇 VNet 整合**,住喺公網),**同企業網絡零連繫** ⇒ 兩個方向都接唔通 n8n。**DEV 先至係真正接得通企業網絡嗰個。**

| 項 | UAT(上面) | **DEV** | 點解要緊 |
|---|---|---|---|
| ACA environment | 自建,公網 | **企業共用 `acaen-rapo-dev`**,住喺**另一個 RG**(`RG-RAPO-ContainerAPP-DEV`) | ⇒ 我哋個 SP 冇 `managedEnvironments/join/action` ⇒ `az deployment group create` 撞 **`LinkedAuthorizationFailed`** |
| VNet | 冇 | **`vnetConfiguration.internal = true`**,`staticIp = 10.160.71.70`(私有 IP) | ⇒ **ACA 預設 FQDN 靠 private DNS zone,而嗰個 zone 冇 link 到企業網 ⇒ 呢條路行唔通** |
| 對外 hostname | ACA 預設 FQDN | **`rapo-uop-web-dev.rci-t.com`**(custom domain,infra 綁 SNI cert + 企業 DNS A record) | ⇒ **唯一可達路徑**;`ENTRA_REDIRECT_URI` 亦係佢 |
| Ingress 佈局 | web external + api external | **ADR-0027 Option A:api 收返 internal,對外淨係得 web 一個 hostname** | ⇒ api 靠 `/api` prefix。🔴 **`/docs/api` 會畀 SPA fallback 食咗返 HTML,真路徑係 `/api/docs/api`** —— 最易誤判成「api 唔通」嗰個位 |
| PostgreSQL | public access(`0.0.0.0`) | **private endpoint**(hub VNet PE) | ⇒ 由 ACA 入面先連得到;`B3` 已證(19 個 migration 真跑過) |
| ACR | 自建 | **共用 `acrrci3ailanding1`** | ⇒ ACA 由 VNet 內 pull(已證);⚠️ push 側行緊一台**唔喺公司網**嘅 build host,**繞開公司 proxy,唔係長期方案** |
| 部署方式 | `az deployment group create` | 🔴 **raw ARM PATCH**(`az rest --method patch`,body **唔含 `environmentId`**) | ⇒ CLI(`containerapp update` / `registry set`)做 read-modify-write 會連 `environmentId` 一齊送 ⇒ **一樣 403**。腳本 `deploy/azure/patch-deploy-dev.ps1`。🟢 PATCH 比 full PUT 安全:**唔 unset 冇送嘅 property** ⇒ infra 配嘅 `customDomains`+SNI / `workloadProfileName` 掂唔到(已對數) |
| 可達性 | 公網 | **只喺企業網 / 特定出口可達** | 🔍 **公網打唔到係功能正常嘅表現,唔係故障** —— 開呢個環境正正就係為咗「只喺企業網內可達 + 打得入 n8n」 |

## as-built vs hardening 目標

四樣嘢同 W32 原藍圖唔同。**全部唔係設計妥協,而係公司網 proxy 只放行 management plane、擋晒 data-plane 嘅後果**(見 `04-deploy-runbook.md §0`)。喺唔受限網路部署,四樣都可以直接做原本嗰套。

| # | 項目 | **as-built(而家)** | **hardening 目標** | 點解未做 |
|---|---|---|---|---|
| 1 | Secret 存法 | ACA native secureString(ARM params 檔傳入) | Key Vault + Managed Identity | KV data-plane(`vault.azure.net`)被 SSL-MITM 擋。KV **已建**,只係未接線 |
| 2 | DB 存取 | `--public-access 0.0.0.0`(allow Azure services) | Private access / VNet | 收窄之後 operator 更加連唔到 DB;不過容器自行 migrate 嘅設計仍然成立,所以呢個可以做 |
| 3 | ACR 認證 | Admin credentials(`--admin-enabled true`) | Managed Identity | 部署當時求最短路徑;冇環境阻礙,可以做 |
| 4 | 使用者認證 | Break-glass 本地 admin(帳密 + httpOnly cookie) | Entra SSO 為主、break-glass 為後備 | 卡 UAT Entra app registration —— 現行 SP 冇權建,要 IT 配合 |

> 🔴 **1 同 2 有安全含意,唔好當佢哋只係「未做嘅 nice-to-have」**:secret 現時以明文存喺 owner 本機嘅 params 檔(雖然 gitignored + ACA 側 encrypted at rest),而 DB 對「所有 Azure 服務」開放。上 production 之前必須處理 —— 逐項見 [`06-prod-hardening-checklist.md`](./06-prod-hardening-checklist.md)。

## 網路 + port

| 由 | 到 | Protocol | Port | 備註 |
|---|---|---|---|---|
| Browser | `uop-web`(ACA external ingress) | HTTPS | 443 | ACA 自動 TLS |
| `uop-web` nginx | `uop-api`(ACA internal) | HTTP | 3000 | environment 內部;`API_UPSTREAM` env 指向 |
| `uop-api` | PostgreSQL Flexible | TCP(TLS) | 5432 | `?sslmode=require`;⚠️ 現時 public-access(allow Azure services),private access / VNet 係 hardening 目標 |
| ~~`uop-api`~~ | ~~Key Vault~~ | ~~HTTPS~~ | ~~443~~ | ⚠️ **呢條連線現時唔存在** —— secret 由 ACA 直接注入,container 唔會去 KV 攞。遷 KV 之後先會有 |
| `uop-api` | Microsoft Graph | HTTPS | 443 | outbound(app-only) |
| `uop-api` | ServiceNow Table API | HTTPS | 443 | outbound |
| `uop-api` | n8n webhook(**若** provider=n8n) | HTTPS | 443 | outbound;UAT 預設 `direct` 唔用 |
| n8n | `uop-api` `/requests/intake`(**若**啟用 inbound) | HTTPS | 443 | inbound;`X-Intake-Key` 保護 |

> 呢個表直接對應 RCI PAR「Communication protocol between each system components」欄位(見 `05-rci-par-process.md`)。

## Secrets 流向

**As-built**(KV data-plane 被公司 proxy 擋,所以行呢條):

```
gitignored params 檔 ──▶ ARM securestring ──▶ ACA native secret ──▶ container env(secretRef)
   (owner 本地保管)          az deployment          (encrypted at rest)      └─▶ ConfigService
```

- secret **唔落** env 檔、**唔入** image、**唔入** git。真值只喺 `deploy/azure/aca.params.uat.json`(**gitignored**,`.gitignore` 有 `deploy/azure/*.params.*.json`),repo 只收無值範本。
- 該檔 = 該環境 deployment secret 嘅 **single source of truth**,persist 唔會隨 session 清 → 重部署直接重用,唔使重生成、唔會漏(詳見 `04-deploy-runbook.md §4`)。
- ⚠️ **走全量 ARM 之前要確認 params 檔齊料** —— 宣告式 template 會覆寫 container 現有 env;走 `az containerapp update --image` 則唔碰 env。
- 邊啲變數屬 secret → 見 [`02-environment-reference.md`](./02-environment-reference.md)。

**Hardening 目標**(未做):

```
Key Vault ──(Managed Identity)──▶ ACA secret ref ──▶ container env var
```

ACA 支援直接由 Key Vault reference 注入 secret;`uop-api` 用 system-assigned Managed Identity + KV `get` 權限。**做唔到嘅原因唔係設計,係環境** —— KV data-plane(`vault.azure.net`)喺公司網被 SSL-MITM 擋。喺唔受限網路部署就用得。

## 認證(dev 帳密 / Azure SSO — dual-provider)

> 🔴 **2026-08-13 更正(W44 `F8-2`):本節嘅 SSO 描述已被 `ADR-0028` 取代。原文保留喺下面。**
>
> **`ADR-0003`(MSAL SPA)已 superseded**。而家行 **server-side authorization code exchange**:前端只負責把用戶送去 Entra、再交返個 `code`;**API 用 client secret 喺 server 側換 token** → 驗 `id_token` → upsert `AppUser` → 發**平台自己**嘅 httpOnly cookie ⇒ **SSO 同 break-glass 由嗰一點開始完全一樣**(`auth.service.grantSession`)。
>
> 🔴 **連帶:`VITE_ENTRA_*` 已經全部消失**(vite 會把佢哋烘死落 bundle)。四個 `ENTRA_TENANT_ID` / `ENTRA_CLIENT_ID` / `ENTRA_CLIENT_SECRET` / `ENTRA_REDIRECT_URI` 而家由 **API 嘅 runtime env** 讀 ⇒ **改 Entra 配置唔使重 build web image**(見 `apps/api/.env.example` 認證段)。⇒ 下面原文寫「啟 SSO 要重 build web image」**已經唔啱**。
>
> 🟢 **scope 只用 `openid profile email`** ⇒ **唔再需要 Application ID URI / 自訂 scope** —— 嗰兩樣正正係三輪往返都攞唔到、卡住 `B9` 嗰啲。⇒ 下面原文寫「卡 Entra app registration」對 **DEV 已經唔成立**。
>
> **DEV 現況(2026-08-13 實測)**:`GET /api/auth/sso/status` → **`{"enabled":true}`**(四個 env 真係落咗)· break-glass 登入 **200 + role `ADMIN`** 已驗(`F6-6`)· 🚧 **真人 SSO 登入仍未驗** —— 要 Chris 本人做 Entra 互動登入 + MFA,AI 做唔到。

專案要求:**本地開發用帳密登入,Azure 環境用 Entra SSO**(ADR-0005 dual-provider,兩者並存)。

- **Entra SSO = 設計上嘅主認證,但 UAT 現時未啟**:前端 MSAL redirect → login.microsoftonline.com → Bearer token → 同源 `/api`。後端設 `ENTRA_TENANT_ID` + `ENTRA_API_AUDIENCE`;前端 build 設 `VITE_ENTRA_*`。
  ⚠️ **現況 = break-glass 本地 admin** —— 卡喺 UAT Entra app registration(現行 SP 冇權建 app reg,要 IT 配合)。`aca.json` 亦冇 `ENTRA_*` parameter,而 `VITE_ENTRA_*` 係 **build-time** 烘死,所以啟 SSO 要重 build web image。
- **Break-glass 本地 admin**:seed 用 `LOCAL_ADMIN_INITIAL_PASSWORD` 建一個本地 admin(`AUTH_JWT_SECRET` 簽 JWT,httpOnly + `SameSite=Strict` + `Secure` cookie),首登**強制改密**。用途:① SSO 首次 bootstrap(要先有 admin 先可 provision Entra users)② 緊急存取。
- **本地開發**:帳密登入(或 `AUTH_DEV_BYPASS` 捷徑)—— **絕不**帶入 Azure。
- **前置**:Entra SSO 需 UAT app registration(client/tenant id · API audience+scope · redirect URI = UAT hostname);未有時可先淨用 break-glass 本地 admin 起 UAT,SSO 後補。
- topology 對兩種認證都啱:Bearer 同源零 CORS;本地 cookie Strict 需同源 —— 都指向單一 origin。
