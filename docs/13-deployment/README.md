# 13 — Deployment(Azure UAT)

> Unified Operation Platform 部署文件集。**目標環境 = Ricoh RCI**(AP 區 MS Azure 資料中心)。
> 架構決定 = **[ADR-0012](../adr/0012-azure-uat-deployment-topology.md)**;執行計劃 = **[W32 plan](../01-planning/W32-deploy-uat/plan.md)**。

## 狀態

**W32 = 部署準備(pre-deploy)** —— 出齊文件、build artifacts、治理流程。**未** provision / deploy;實際落雲屬 W33(待 **RCI PAR** 批准 + 用戶落令)。

## 一頁 topology 摘要

```
Internet ─HTTPS─▶ ACA ingress(單一 hostname · 對外只此一個)
                   ├─ /        ▶ uop-web  container(nginx:serve SPA static + proxy /api)
                   └─ /api/*    ▶ uop-api  container(NestJS · internal ingress)
                                   └─▶ Azure Database for PostgreSQL Flexible Server(managed)
Secrets ─────────▶ Azure Key Vault(container 經 Managed Identity 讀)
Images ──────────▶ Azure Container Registry(ACR)
Logs ────────────▶ Log Analytics workspace
認證:Azure = Entra SSO 主 + break-glass 本地 admin(dual-provider)· dev = 帳密 · Redis:暫不開(BullMQ 未 wired)
```

**單一 origin 係硬需求**:本地 session 用 `SameSite=Strict` httpOnly cookie,跨 origin 唔會帶 → web 同 api 必須同一 hostname(nginx 前置反向代理 `/api`)。詳見 ADR-0012。

## 讀者路線

| 你想做 | 讀邊份 |
|---|---|
| 明白整體架構 / 資源清單 / 網路 | [`01-topology.md`](./01-topology.md) |
| 設定 / 對照環境變數(邊個係 secret) | [`02-environment-reference.md`](./02-environment-reference.md) |
| 明白兩個 Dockerfile 點 build | [`03-build-images.md`](./03-build-images.md) |
| 實際部署逐步(provision→deploy→migrate→smoke) | [`04-deploy-runbook.md`](./04-deploy-runbook.md) |
| 走 RCI 授權流程(PAR)+ 填表輸入 | [`05-rci-par-process.md`](./05-rci-par-process.md) |
| 上線前安全自檢 | [`06-prod-hardening-checklist.md`](./06-prod-hardening-checklist.md) |

## 文件

- `RCI Project Authorization Request Process v1.9.docx` —— Ricoh RIT 官方 PAR 流程文件(治理來源;摘要見 `05-rci-par-process.md`)。

## 硬規矩(貫穿全部文件)

- **絕不**將真 secret 寫入任何文件 / image / git —— 一律 Key Vault + 佔位(CLAUDE.md §5 H4)。
- prod **必 HTTPS**(`NODE_ENV=production` → cookie `Secure`)。
- dev-bypass(`AUTH_DEV_BYPASS` / `VITE_AUTH_DEV_BYPASS`)prod **必 OFF**。
- 本地開發仍用 `docker-compose.yml`(postgres + redis)—— **未被取代**,ADR-0012 只 supersede「雲部署都用 compose」。
