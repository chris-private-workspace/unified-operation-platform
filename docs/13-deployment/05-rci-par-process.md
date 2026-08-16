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

> 🔴 **填表原則(Chris 拍板 2026-07-30):寫 as-built,同時列明 hardening 目標。**
>
> 公司網 proxy 只放行 management plane、擋晒 data-plane,令四樣嘢同原藍圖唔同(secret 存法 / DB 網路 / ACR 認證 / SSO)。本 pack **一律填實際會 deploy 嘅嘢**,後面用「⚠️ 目標:…」標出 hardening 方向。
>
> **點解唔填目標架構**:流程 ⑤ 有 **Reg. Information & Security Manager endorse**、⑥ 有 **GM CISO IT approve** —— 佢哋 endorse 嘅係一個**網路 / secret 態勢**。填「private access」而實際 `--public-access 0.0.0.0`,等於向治理機構描述咗一個唔存在嘅態勢;而列一條唔存在嘅 `uop-api → Key Vault` 連線,會令防火牆審批開一條唔需要嘅通道。
>
> 完整對照(四項 × 現況/目標/點解未做)見 [`01-topology.md`](./01-topology.md)「as-built vs hardening 目標」;逐項 checklist 見 [`06-prod-hardening-checklist.md`](./06-prod-hardening-checklist.md)。

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
| ├ Key Vault | ⚠️ **已 provision,但未接線** —— secret 現時存喺 **ACA native secureString**(經 ARM securestring 傳入,encrypted at rest)。KV data-plane（`vault.azure.net`）喺公司網被 SSL-MITM 擋,所以連唔到。**⚠️ 目標:遷 KV + Managed Identity**。secret 清單見 `02-environment-reference.md` |
| ├ Azure Container Registry | ✅ Required = **Yes**（存兩個 image）|
| ├ PostgreSQL（Other PaaS）| ✅ Azure Database for **PostgreSQL Flexible Server** v16，Burstable。🔴 網路 = **`--public-access 0.0.0.0`**(Azure portal 顯示為「Allow public access from any Azure service within Azure to this server」)—— **唔係** private access。ACA 要靠佢連得到 DB。**⚠️ 目標:private access / VNet integration**。呢欄直接關乎安全審查,**唔可以只寫 private access** |
| ├ Log Analytics | ✅ container log（RCI 標準）|
| ├ AKS / Blob / Azure OpenAI / Event Grid | ✅ **暫無**（Redis/BullMQ 未 wired;AI 屬未來 tier）|

### Communication protocol between components
（直接取自 `01-topology.md` 網路表）

| Source | Destination | Protocol | Port | 備註 |
|---|---|---|---|---|
| Browser | `uop-web`(external ingress) | HTTPS | 443 | |
| `uop-web` nginx | `uop-api`(internal) | HTTP | 3000 |
| `uop-api` | PostgreSQL Flexible | TCP/TLS | 5432 |
| ~~`uop-api`~~ | ~~Key Vault~~ | ~~HTTPS~~ | ~~443~~ | 🔴 **唔好填呢行** —— secret 由 ACA 直接注入,container 從來唔會去 KV 攞。遷 KV(hardening)之後先加返,否則會令防火牆開一條唔需要嘅通道 |
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

## 🔲 Chris 填呢七格就夠(2026-08-16 整理)

> **點解有呢一段**:全份 Section 1 得 **6 個 🔲 marker**(`:39` `:40` `:41` `:80` `:81` `:82`),但 `:39` 一行入面實情有 5 個 sub-field ⇒ 實際係 **9 格**,其中 **2 格唔使你填**(見 B)。
>
> ⚠️ **唔使而家填。** 呢一段係**備料唔係待辦** —— 只有喺確認咗真係要交 PAR 之後先有用。而「要唔要交」本身**仲未答**(見 `11-azure-openai-infra-request.md` `Q0`),兼且有一個反例:**`RG-RAPO-UOP-DEV` 本身就係喺我哋一份 PAR 都未交嘅情況下,infra 2026-08-04 開畀我哋嘅。**
>
> ⚠️ **本段係內部填表準備,唔屬提交內容。** 上面 Section 1 各表嘅**已申報值一個字冇改** —— `BACKLOG` `PAR-as-built` 嗰句「**05 係要提交畀 RCI 治理嘅申請文件,唔應該由我單方面改**」仍然成立,所以下面凡係我有意見嘅地方一律寫成問題,唔會代你改。

### A —— 要你答嘅七格

| # | 欄位 | 出處 | 我可唔可以代答 |
|---|---|---|---|
| 1 | **Requester + Department** | `:39` | ❌ 純業務 |
| 2 | **Project Sponsor** | `:39` | ❌ 純業務。⚠️ 佢係流程 ④ 嘅簽核人(`:12`),唔係一個 informational 欄 |
| 3 | **PM** | `:39` | ❌ 純業務 |
| 4 | **Technical contact** | `:39` | 🟡 應該係你 —— 但要你確認,唔想代你把自己填落一份治理文件 |
| 5 | 🔴 **Opcos** | `:40` | ⚠️ **三個唔同數字,睇你講緊邊個** —— 見下面 A5 |
| 6 | **Internal user 數量** | `:80` | ❌ 純業務。⚠️ 平台 seed 得 2 個真用戶(你 + 一個 RHK `OPCO_IT`),所以 DB 答唔到呢條 —— 佢問嘅係**將來會開幾多個**,唔係今日有幾多個 |
| 7 | **Expected Implementation Date** | `:41` | ⚠️ 依賴 `11-azure-openai-infra-request.md` 個 `Q0` —— **PAR 流程本身寫住一般需 1–2 週**(`:6`),所以呢格填之前最好知道要唔要行 |

#### 🔴 A5 —— 「幾多個 OpCo」呢條有三個都啱嘅答案,而 `:40` 寫嗰個唔喺其中

`:40` 今日寫住「涵蓋 **23** OpCo」。實測 `apps/api/prisma/seed.ts`:

| 數 | 係咩 | 點嚟 |
|---|---|---|
| **24** | **平台嘅 `Opco` row 數**(= 權限 scope 單位) | `seed.ts` `OPCOS` array 實測 24 行 |
| **18** | **唔同公司數** | distinct `company` 值實測 18 個 |
| ~~23~~ | ❓ **對唔返任何一個** | — |

**分別喺 RAPO 拆咗 7 行**(`RAPO/APTC` · `RAPO/ASPC` · `RAPO/FNA` · `RAPO/IT` · `RAPO/IT (RBS)` · `RAPO/IT (RDC2)` · `RAPO/SCM`)—— 平台用 cost centre 做 scope 單位,而 PAR 問「Opcos」通常係**業務意義嘅公司**。

⇒ **要你決定填邊個,兼順手更正 `:40` 嗰個 `23`。** 我冇代改,因為呢個係申報值。

### B —— 唔使你填嘅兩格

| # | 欄位 | 出處 | 狀況 |
|---|---|---|---|
| 8 | **External User(s)** | `:81` | 🟢 **技術側我答得到,但最後一句仍然要你講。** 實測 `entra-sso.service.ts:236-242`:issuer **釘死** `ENTRA_TENANT_ID` 兩個 form,JWKS 亦只讀該 tenant ⇒ **唔喺公司 tenant 嘅人結構上登入唔到**。⚠️ **但如果 IT 把外部 OpCo 用戶邀請做 guest(B2B)**,佢哋簽出嚟嘅 token 就係公司 tenant 嘅 ⇒ **入得到**。所以「算唔算 external」係一個**身份治理定義**,唔係平台答得到嘅嘢 |
| 9 | **RPO / RTO** | `:82` | 🟢 **RIT 填**(`:82` 本身已經咁寫),RCI 預設見 `:89` |

### 📋 填空(填完交返,我幫你併入 Section 1)

```
Requester                  : ______________________________________
Department                 : ______________________________________
Project Sponsor            : ______________________________________
PM                         : ______________________________________
Technical contact          : ______________________________________
                             (建議 = Chris Lai,要你確認)

Opcos —— 揀一個講法 + 更正 :40 個「23」:
  [ ] 24  = 平台 Opco row(含 RAPO 7 個 cost centre)
  [ ] 18  = 唔同公司
  [ ] 其他: _____________________________________

Internal user 數量(預期)   : ______________________________________
                             (今日 seed 得 2 個;呢格問將來)

Expected Implementation Date: ______________________________________
                             (⚠️ 見 11-azure-openai-infra-request Q0;
                              PAR 一般需 1–2 週)

External Users —— 一句就夠:
  [ ] 冇 —— 所有用戶都喺公司 tenant 內
  [ ] 有 —— 外部 OpCo 用戶會做 guest(B2B)入嚟,數量約 __________
```

## 待辦

- [ ] Chris 填齊上面七格(+ 更正 `:40` 個 OpCo 數)
- [x] 認證方式已定 = **Azure Entra SSO**(O365 account)+ break-glass 本地 admin(2026-07-22 owner 釐清)。🟢 **`AUTH-2b` 2026-08-13 closed** —— SSO 由 Chris 本人測試確認登入得到,break-glass 由 AI tool 驗(W44 `F6-6`)
- [ ] 向 RIT 提交 PAR Section 1
- [ ] 🆕 **W46 Azure OpenAI** —— `:54` 申報咗「Azure OpenAI 暫無」,而 W46 要開一個 ⇒ **`11-azure-openai-infra-request.md` `Q0` 就係問呢件事點行**。若答案係「要行 PAR」,嗰份請求嘅 `Q1`–`Q4` 回覆逐格對得返 Section 1(對照表喺該文件 Part A)
