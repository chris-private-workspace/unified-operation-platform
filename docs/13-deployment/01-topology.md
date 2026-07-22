# 01 — Topology(Azure Container Apps 單一 origin)

> 決定來源:[ADR-0012](../adr/0012-azure-uat-deployment-topology.md)。此文件 = 架構圖 + 資源清單 + 網路/port/secrets 流向。

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

   Key Vault ◀── Managed Identity(uop-api 讀 secret)
   ACR       ◀── ACA 拉 image(uop-api / uop-web)
   Log Analytics ◀── ACA 兩個 container stdout/stderr
```

**重點**:對外只有 **一個** ingress hostname(掛喺 `uop-web`)。`uop-api` 用 **internal ingress**(唔對外),只俾 `uop-web` 嘅 nginx 同同一 ACA environment 內部叫。瀏覽器由頭到尾只見一個 origin → `SameSite=Strict` cookie work、零 CORS。

## 資源清單(UAT)

| 資源 | Azure 服務 | 用途 | 備註 |
|---|---|---|---|
| ACA environment | Azure Container Apps Environment | 兩個 container app 嘅 host | 綁 Log Analytics workspace |
| `uop-web` | Container App(external ingress) | nginx serve SPA + proxy `/api` | targetPort **8080** |
| `uop-api` | Container App(**internal** ingress) | NestJS API | targetPort **3000**(`PORT`) |
| DB | Azure Database for **PostgreSQL Flexible Server** | state layer(Prisma) | **private access**;version 16 對齊本地 |
| Secrets | Azure **Key Vault** | 全部 secret | container 經 **Managed Identity** 讀 |
| Images | Azure **Container Registry**(ACR) | `uop-api` / `uop-web` image | ACA 用 managed identity 拉 |
| Logs | **Log Analytics** workspace | container log | RCI 標準(PAR Appendix) |
| ~~Redis~~ | ~~Azure Cache for Redis~~ | — | **暫不開**:BullMQ 未 wired(只 `@nestjs/schedule` @Cron) |

## 網路 + port

| 由 | 到 | Protocol | Port | 備註 |
|---|---|---|---|---|
| Browser | `uop-web`(ACA external ingress) | HTTPS | 443 | ACA 自動 TLS |
| `uop-web` nginx | `uop-api`(ACA internal) | HTTP | 3000 | environment 內部;`API_UPSTREAM` env 指向 |
| `uop-api` | PostgreSQL Flexible | TCP(TLS) | 5432 | private access / VNet |
| `uop-api` | Key Vault | HTTPS | 443 | Managed Identity |
| `uop-api` | Microsoft Graph | HTTPS | 443 | outbound(app-only) |
| `uop-api` | ServiceNow Table API | HTTPS | 443 | outbound |
| `uop-api` | n8n webhook(**若** provider=n8n) | HTTPS | 443 | outbound;UAT 預設 `direct` 唔用 |
| n8n | `uop-api` `/requests/intake`(**若**啟用 inbound) | HTTPS | 443 | inbound;`X-Intake-Key` 保護 |

> 呢個表直接對應 RCI PAR「Communication protocol between each system components」欄位(見 `05-rci-par-process.md`)。

## Secrets 流向

```
Key Vault ──(Managed Identity)──▶ ACA secret ref ──▶ container env var ──▶ ConfigService.getOrThrow
```

- secret **唔落** env 檔、**唔入** image、**唔入** git。
- ACA 支援直接由 Key Vault reference 注入 secret 做 container env;`uop-api` 用 system-assigned Managed Identity + KV `get` 權限。
- 邊啲變數屬 secret → 見 [`02-environment-reference.md`](./02-environment-reference.md)。

## 認證(dev 帳密 / Azure SSO — dual-provider)

專案要求:**本地開發用帳密登入,Azure 環境用 Entra SSO**(ADR-0005 dual-provider,兩者並存)。

- **Azure UAT 主認證 = Entra SSO**:前端 MSAL redirect → login.microsoftonline.com → Bearer token → 同源 `/api`。後端設 `ENTRA_TENANT_ID` + `ENTRA_API_AUDIENCE`;前端 build 設 `VITE_ENTRA_*`。
- **Break-glass 本地 admin**:seed 用 `LOCAL_ADMIN_INITIAL_PASSWORD` 建一個本地 admin(`AUTH_JWT_SECRET` 簽 JWT,httpOnly + `SameSite=Strict` + `Secure` cookie),首登**強制改密**。用途:① SSO 首次 bootstrap(要先有 admin 先可 provision Entra users)② 緊急存取。
- **本地開發**:帳密登入(或 `AUTH_DEV_BYPASS` 捷徑)—— **絕不**帶入 Azure。
- **前置**:Entra SSO 需 UAT app registration(client/tenant id · API audience+scope · redirect URI = UAT hostname);未有時可先淨用 break-glass 本地 admin 起 UAT,SSO 後補。
- topology 對兩種認證都啱:Bearer 同源零 CORS;本地 cookie Strict 需同源 —— 都指向單一 origin。
