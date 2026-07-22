# 05 — RCI PAR 治理流程 + Section 1 輸入 pack

> 來源:`RCI Project Authorization Request Process v1.9.docx`(Ricoh RIT,2025-08-07)。
> **RCI** = Regional Cloud Infrastructure,AP 區 MS Azure 資料中心(內外部客戶共用,套用 ITIL / ISMS / Azure best practice)。**開資源前必經 PAR**。

## PAR 流程(一般需 1-2 週)

```
① Requestor 填 Section 1 → 交 RIT
② RIT 核實資料(必要時要求補件 → Requestor 儘快回)
③ RIT 出系統設計 + 成本估算(填 Section 2)
④ Requestor 覆核設計/成本 → 取得 Project Sponsor 批准 → 回 RIT
⑤ RIT Infrastructure Manager + Security Manager endorse
⑥ GM RIT approve PAR
⑦ 按議定 schedule 開始 provision
```

> **時機建議**(docx §1):PAR 需時,應喺開發早期就 engage RIT。我哋而家（W32 部署準備完成）正係 engage 嘅時點。

**Section 3 簽核人**:Reg. Cloud Infra & Workspace Manager · Reg. Information & Security Manager · G.M. CISO IT · Project Sponsor · Chief Digital Officer。

## Section 1 輸入 pack（本系統對應）

> ✅ = 技術上已定，可直接填；🔲 = **待 Chris / RIT 填**（業務/命名/數量）。

### Basic Information
| 欄位 | 值 |
|---|---|
| Project Name | ✅ Unified Operation Platform — LicenseOps 模組（M365/D365 license 履行）|
| Project Objective | ✅ IT operation「System of Action」:live state + orchestration + 人手介入 + 逐步引入 AI（見 `docs/architecture.md §1`）|
| Requester / Department / Sponsor / PM / Technical contact | 🔲 待 Chris |
| Opcos | 🔲 待 Chris（涵蓋 23 OpCo;主用 RAPO / RHK …）|
| Expected Implementation Date | 🔲 待定（PAR 批 + build 綠燈後）|

### System Component Specification
| 欄位 | 值 |
|---|---|
| Hosted on | ✅ **RCI1 — Azure Hong Kong Datacenter**（`eastasia`,離 AP 最近）|
| VM | ✅ **無**（全 PaaS / 容器,零 VM）|
| **Other Resources**（PAR 明列欄）| |
| ├ Azure Container Apps | ✅ `uop-api`(NestJS · internal ingress · targetPort 3000)、`uop-web`(nginx SPA + `/api` proxy · external ingress · targetPort 8080)|
| ├ Key Vault | ✅ 存全部 secret（清單見 `02-environment-reference.md`）|
| ├ Azure Container Registry | ✅ Required = **Yes**（存兩個 image）|
| ├ PostgreSQL（Other PaaS）| ✅ Azure Database for **PostgreSQL Flexible Server** v16，Burstable，private access |
| ├ Log Analytics | ✅ container log（RCI 標準）|
| ├ AKS / Blob / Azure OpenAI / Event Grid | ✅ **暫無**（Redis/BullMQ 未 wired;AI 屬未來 tier）|

### Communication protocol between components
（直接取自 `01-topology.md` 網路表）

| Source | Destination | Protocol | Port |
|---|---|---|---|
| Browser | `uop-web`(external ingress) | HTTPS | 443 |
| `uop-web` nginx | `uop-api`(internal) | HTTP | 3000 |
| `uop-api` | PostgreSQL Flexible | TCP/TLS | 5432 |
| `uop-api` | Key Vault | HTTPS | 443 |
| `uop-api` | Microsoft Graph（outbound） | HTTPS | 443 |
| `uop-api` | ServiceNow Table API（outbound） | HTTPS | 443 |
| `uop-api` ↔ n8n（若啟用） | HTTPS | 443 | UAT 預設 direct，暫唔用 |

### Integration with existing system? → **Yes**
| 系統 | 方式 |
|---|---|
| Microsoft 365（Graph app-only） | outbound HTTPS，讀 subscribedSkus / 指派 license |
| ServiceNow（Table API） | outbound HTTPS,建/更新 `sc_req_item` |
| n8n（若啟用） | webhook 雙向（inbound `X-Intake-Key` / outbound `X-N8n-Key`）|

### User Access / Authentication
| 欄位 | 值 |
|---|---|
| Administrator(s) | ✅ 平台 admin;access via **Browser**;from **Internet + VPN**;Log-in = **Window ID / O365 Account**(Entra SSO);Authentication = **MFA**(經 Entra Conditional Access)。另有 **break-glass 本地 admin**(New account + Password,緊急/bootstrap 用)|
| Internal User(s) | ✅ OpCo IT（OPCO_IT role,per-OpCo scope);Browser;Log-in = **O365 Account**(SSO);數量 🔲 待 Chris;location = 各 OpCo |
| External User(s) | ✅ **無**（O365 tenant 外 OpCo 若算 external → 🔲 待確認）|
| RPO / RTO | 🔲 待 RIT（RCI 預設 daily 備份,見下）|

> **認證註記**:專案要求 = **本地開發帳密 / Azure Entra SSO**(dual-provider ADR-0005)。Azure UAT 主認證 = **O365 SSO**;另留一個 break-glass 本地 admin 做 bootstrap（要先有 admin 先可 provision SSO users）+ 緊急存取。**前置**:UAT Entra app registration(uop-api + uop-web,即 AUTH-2b)—— 用戶已有 Azure 存取,部署時提供。

## Section 2 / Appendix（RIT 填,供參考）

- **Security requirements** 勾選（RIT 定,建議至少）:TLSv1.2 · Data Encryption · MFA · WAF/App Gateway（若對 Internet 曝露）。
- **Backup**（RCI 預設）:Daily incremental 7 天 / weekly full 4 週 / monthly full 12 月。→ rollback 依賴此（`04-deploy-runbook.md §7`)。
- **Log**：送 Log Analytics，retention 180 天。
- **ROC 支援時段**:Mon–Fri 08:00–24:00（5×16）。

## 待辦

- [ ] Chris 填齊 🔲 欄（業務資料 + 資源命名 + 用戶數）
- [x] 認證方式已定 = **Azure Entra SSO**（O365 account）+ break-glass 本地 admin（2026-07-22 owner 釐清）→ 需 UAT Entra app registration（AUTH-2b）
- [ ] 向 RIT 提交 PAR Section 1
