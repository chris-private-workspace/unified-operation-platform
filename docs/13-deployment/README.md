# 13 — Deployment(Azure UAT)

> Unified Operation Platform 部署文件集。**目標環境 = Ricoh RCI**(AP 區 MS Azure 資料中心)。
> 架構決定 = **[ADR-0012](../adr/0012-azure-uat-deployment-topology.md)**;執行計劃 = **[W32 plan](../01-planning/W32-deploy-uat/plan.md)**。

## 狀態

**✅ UAT live**(首次上線 W33 / 2026-07-22,`rcitest` sub)—— break-glass admin 登入驗證通過。現行 image **`uat-1bc7cdb`**(api revision `--0000006` / web `--0000005`,BUG-008 修復後),已含 W35 → CH-011 全部功能。實際環境見 [`07-uat-as-built.md`](./07-uat-as-built.md)。
> **實際部署路徑同 W32 原藍圖有大出入**(公司 proxy 擋所有 data-plane → 手寫 ARM / self-migrate / ACA native secret)—— [`04-deploy-runbook.md`](./04-deploy-runbook.md) 已更新為 **as-built 可行路徑**,請以佢為準。
>
> 🔴 **講 env 狀態要分清「template」同「running container」兩本帳** —— 日常部署走 `--image` 唔碰 template,env 亦可以直接設落 container,所以由 template 推論唔到 container。**一律 `az containerapp show` 實測。**(呢批文件曾經寫錯「container 只有 16 個 env / email 唔會 work」,實測係 **19 個**,ACS 兩個早已設,email 一直寄得出。)
>
> email / 密碼重設配置已齊(container 實測三個 env + template 已接線 **CH-012**)。剩低嘅係端到端**真寄真收**做證據 —— ACS 冇 probe,sender domain 唔對會收貨但唔送達而 API 仍返 `Succeeded`。詳見 [`02-environment-reference.md`](./02-environment-reference.md)「可選功能」同 CH-012 §8。

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
| 實際部署逐步(as-built:constraints→provision→ARM deploy→smoke) | [`04-deploy-runbook.md`](./04-deploy-runbook.md) |
| 走 RCI 授權流程(PAR)+ 填表輸入 | [`05-rci-par-process.md`](./05-rci-par-process.md) |
| 上線前安全自檢 | [`06-prod-hardening-checklist.md`](./06-prod-hardening-checklist.md) |
| **實際跑緊嘅 UAT 環境**(資源名 / URL / deferred) | [`07-uat-as-built.md`](./07-uat-as-built.md) |
| **要 n8n 真係推到單入平台**(平台側前置 + n8n 三項接線 + SEC-001 rotate) | [`08-n8n-integration-go-live.md`](./08-n8n-integration-go-live.md) |
| 🔴 **實際跑緊嘅 DEV 環境**(`RG-RAPO-UOP-DEV` —— **真正接得通企業網絡嗰個**;部署史 / B1-B9 樽頸 / raw ARM PATCH 繞路) | [`09-dev-as-built.md`](./09-dev-as-built.md) |
| **喺公司網撳一次收晒三個 phase 嘅尾**(W44 `F6-5`/`F6-6`/`F9-8` · W45 `F4-4b` · CH-023 `F3-5`) | [`10-dev-live-verification-runbook.md`](./10-dev-live-verification-runbook.md) |

## 文件

- `RCI Project Authorization Request Process v1.9.docx` —— Ricoh RIT 官方 PAR 流程文件(治理來源;摘要見 `05-rci-par-process.md`)。
- `Azure UAT 部署流程 v1.0.docx` —— 把本目錄嘅 runbook 整合成一份可交付 / 離線閱讀嘅文件(封面 / 目錄 / topology 同流程 diagram / 環境變數表 / 文件核對結果)。**由 `docx-source/` 生成,唔好手改 .docx** —— rebuild 步驟見該目錄 README。

## 硬規矩(貫穿全部文件)

- **絕不**將真 secret 寫入任何文件 / image / git —— 一律 Key Vault + 佔位(CLAUDE.md §5 H4)。
- prod **必 HTTPS**(`NODE_ENV=production` → cookie `Secure`)。
- dev-bypass(`AUTH_DEV_BYPASS` / `VITE_AUTH_DEV_BYPASS`)prod **必 OFF**。
- 本地開發仍用 `docker-compose.yml`(postgres + redis)—— **未被取代**,ADR-0012 只 supersede「雲部署都用 compose」。
