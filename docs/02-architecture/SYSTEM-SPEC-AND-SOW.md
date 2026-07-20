# Unified Operation Platform — 系統規格暨交付範圍書

**System Specification & Statement of Work**

| 項目 | 內容 |
|---|---|
| **文件編號** | UOP-SPEC-001 |
| **版本** | 1.0 |
| **狀態** | Draft for review |
| **日期** | 2026-07-20 |
| **Owner / 決策人** | Chris Lai(架構 + scope/business 唯一 decision owner) |
| **第一個模組** | LicenseOps — M365 / D365 onboarding license 履行 |
| **Repository** | `chris-private-workspace/unified-operation-platform`(private) |

> **本文件定位**:呢份係**現況快照 + 交付範圍書**,唔取代既有 SSOT。
> 架構決策真相 → `docs/architecture.md`;LicenseOps 業務決策真相 → `docs/02-architecture/licenseops/DESIGN.md`;
> domain model 真相 → `apps/api/prisma/schema.prisma`;pending 工作真相 → `docs/01-planning/BACKLOG.md`。
> 本文件把上述內容**整合成可交付形式**,並補上**經 code 實證嘅現況查證**。
>
> **查證基準**:commit `a5126c7`(2026-07-20,branch `docs/audit-integration-planning`)。所有「已實作」陳述均經讀 source code 或執行測試確認。凡查證唔到嘅,一律標示 `未實作` / `planned` / `未驗證`,**唔以規劃文件嘅措辭當作已完成**。

---

## 目錄

**Part A — 系統規格**
1. 執行摘要
2. 業務背景與問題陳述
3. 系統定位
4. 範圍(In / Out of Scope)
5. 架構總覽
6. 技術棧
7. Domain Model
8. 核心業務邏輯
9. 整合層
10. 認證與授權
11. API 介面
12. 前端
13. 部署與環境

**Part B — 交付範圍書(SOW)**
14. 交付項目與完成狀態
15. 交付歷程
16. 驗收準則
17. 現況落差登記(Honest Gaps)
18. 待辦與 Roadmap
19. 假設、依賴與外部阻塞
20. 風險登記
21. 責任分工
22. 治理與變更控制

**附錄**
A. ADR 索引 · B. 術語表 · C. 文件地圖 · D. 查證方法

---

# Part A — 系統規格

## 1. 執行摘要

Unified Operation Platform 係一個**自建嘅 IT operation / support 管理與操作平台**,以「逐步引入 AI」為長期目標。第一個落地模組係 **LicenseOps** —— 處理 Microsoft 365 / Dynamics 365 license 由申請到指派嘅完整履行流程。

**要解決嘅核心問題**:Regional IT 目前用一份手動維護嘅 Excel(37 SKU × 24 entity)管理全 OpCo license 存量,同 M365 portal 之間靠人手同步;取得一個 license 要行**十步人手接力**。

**平台嘅答案**:把「live state(即時狀態)」同「action(受控執行)」收攏成一個系統 —— 呢兩樣正正就係將來畀 AI 接手所需嘅兩個前提。

**當前狀態**:後端與前端**主體功能已完成並可運行**。

| 指標 | 數值 | 查證方式 |
|---|---|---|
| REST endpoint | **34 個**(10 個 controller) | 逐個 controller 檔讀取確認 |
| Prisma model / enum | **11 / 5** | `schema.prisma` grep |
| 後端測試 | **223 個 / 30 suites + 1 snapshot,全綠** | 實際執行 `npx jest`(90 秒) |
| 前端測試 | **85 個 / 10 檔** | 檔案盤點 |
| 前端畫面(route) | **11 條** | `router.tsx` |
| 已通過階段 | W01–W27 + CH-001~004 + BUG-001~003(**W28 進行中**) | phase folder + git log |
| Accepted ADR | **9 份** | `docs/adr/` |

**未完成嘅主要事項**:生產部署未做;真 SSO 端到端未驗(卡外部);ServiceNow / n8n 對外合約仍屬代表性(representative)而非實際對齊;audit trail(ADR-0009)已拍板未落地;排程與背景佇列雖列入 locked stack 但**一行都未實作**。

---

## 2. 業務背景與問題陳述

### 2.1 現況

Regional IT 用一份手動 Excel 管理全 OpCo 嘅 license 存量,同 M365 portal 之間係 **Sync by Manual**;每個 OpCo 又各自留一份,碎片化嚴重。

### 2.2 現行十步人手接力

| 步 | 動作 |
|---|---|
| 1 | OpCo 申請 |
| 2 | Regional 查 Excel 夠唔夠 |
| 3 | 夠 → 開 ticket 直接指派;唔夠 → ServiceNow 開單 |
| 4 | Regional 向 vendor(Software One)報價 |
| 5 | Vendor 出 quote |
| 6–8 | 報價 / approval / 簽核喺 OpCo ↔ Regional ↔ vendor 之間 email 來回 |
| 9 | Vendor 採購完成 email 通知 |
| 10 | Regional 更新 Excel、指派、關單 |

### 2.3 痛點熱區

| 等級 | 痛點 | 平台點處理 |
|---|---|---|
| 🔴 | 查可用量靠人眼查 Excel | ledger + tenant 三層視圖取代 |
| 🔴 | Excel 手動 sync | Graph 自動拉 tenant 真相 + 總量層對帳 |
| 🔴 | 指派 + 更新手動 | 單一動作觸發 assign + ledger 更新 + 回寫 SN |
| 🔴 | 多份 list 碎片化 | 單一 DB 為內部帳真相 |
| 🟡 | 採購 email 接力(牽涉 vendor + DocuWare) | **本版不自動化**,只做 stage 追蹤 |

### 2.4 現行工具
Email · Teams · Excel · Azure M365 portal · ManageEngine · ServiceNow

---

## 3. 系統定位

呢一節係**整個項目最重要嘅約束**,所有 scope 爭議都回到呢度判。

| | 角色 | 擁有 |
|---|---|---|
| **ServiceNow** | System of Record | request intake · approval · SLA · audit —「誰申請、誰批、記錄」 |
| **本平台** | **System of Action** | live state · orchestration · 實際執行 · 人手介入 —「事情實際點被做完」 |

**三條衍生原則**

1. **Sync,唔複製** —— 平台消費 ServiceNow 嘅 request 當作業對象,執行完回寫狀態。
2. **Regional IT = reflector + executor,唔係 owner** —— license 數量嘅管理責任屬 OpCo(將來 self-service 交回)。
3. **「同 ServiceNow 唔同」同「作為 AI 基礎」係同一個屬性** —— AI 需要 (a) 可讀嘅即時狀態去 observe、(b) 受控嘅 action API 去 act,而 ServiceNow 嘅 ticket 層畀唔到呢兩樣。

**守邊界 rule of thumb**
> 係「requesting / approving / recording」→ 留 ServiceNow。
> 係「executing / monitoring / orchestrating live」→ 先入平台。

**刻意唔建(建咗就跌入 ServiceNow 重疊陷阱)**:ticket 申請表單 · 審批鏈 · SLA 管理 · service catalog · 把 CMDB 當 source of truth。

---

## 4. 範圍(In / Out of Scope)

### 4.1 In Scope — 平台層

- 四層地基(見 §5)+ integration layer
- **LicenseOps 模組**(模組一)
- LicenseOps 前端(`apps/web`),由 hifi 設計 handoff 還原

### 4.2 In Scope — LicenseOps 模組

| # | 項目 | 來源 |
|---|---|---|
| 1 | Onboarding 當下嘅 **M365 + D365** 加 license 需求 | DESIGN §2 · ADR-0008 |
| 2 | **獨立(非 onboarding)license request 建單** — IT 代開 → create ServiceNow `sc_request` / `sc_req_item`(thin action) | ADR-0008 |
| 3 | **n8n 雙向整合** — inbound 接 onboarding push + outbound 建單 | ADR-0008 |
| 4 | 消費 ServiceNow request、回寫狀態 | DESIGN §2 |
| 5 | Per-OpCo license ledger + 總量層對帳 + drift alert | DESIGN §5 |
| 6 | 指派 license(Graph `assignLicense`)、更新 ledger | DESIGN §2 |
| 7 | 手動 ledger 校正 + 對回機制 + audit | ADR-0007 |

> **D365 說明**:D365 = Entra `subscribedSku`,行同一條 Graph `assignLicense`;catalog / ledger / 對帳一視同仁。**呢度講嘅係 license SKU 層**;D365 作為**業務應用模組**(F&O 工作流等)仍屬未來 tier。

### 4.3 Out of Scope

**平台層(未 approve 前唔起)**
- 其他 IT ops 模組:offboarding / license 回收 · Cost Insights · D365 業務模組(F&O 工作流)· 其他 support 工作流

**LicenseOps 層(刻意排除)**
| 排除項 | 理由 |
|---|---|
| ticket 申請表單 / 審批鏈 / SLA 管理 / service catalog | 屬 ServiceNow 地盤,建咗即重疊 |
| 把 CMDB 當 source of truth | 同上 |
| license 成本 / 發票金額 | 走 DocuWare;平台只記 `quoteRef` / `poRef`,**唔記錢** |
| 日常 license change / 升級 / 加購 | 本版不做 |
| offboarding / license 回收 | 本版不做 |
| **D365-side provisioning**(security role / legal entity) | 喺 D365 admin,Graph 掂唔到(ADR-0008 D5) |

> **變更控制**:開以上任何一項前必須 STOP + owner approval + 平台級 ADR(對應 CLAUDE.md §5 H1 / H3)。

---

## 5. 架構總覽

### 5.1 四層地基

| 層 | 名稱 | 內容 | 實作狀態 |
|---|---|---|---|
| 4 | **API + UI Layer** | REST + OpenAPI(`/docs/api`)+ React SPA | ✅ 已建 |
| 3 | **Orchestration / Action Layer** | 執行 + 人手介入控制點 | ⚠️ **僅人手觸發**(見下) |
| 2 | **Integration Layer** | 對外唯一邊界:Graph + ServiceNow + n8n provider | ✅ 已建 |
| 1 | **State Layer** | PostgreSQL via Prisma —— entitlement / allocation ledger · request mirror | ✅ 已建 |

> 🔴 **Layer 3 現況查證(重要落差)**:`ScheduleModule.forRoot()` 已喺 `app.module.ts` 註冊,`@nestjs/schedule` 亦係 dependency,**但全 repo grep `@Cron` / `@Interval` / `@Timeout` / `BullModule` / `@Processor` / `bullmq` 結果為零**。BullMQ **完全唔喺 `package.json` 入面**。
> 即係話:**catalog 同步同對帳現時淨係靠人手 POST 觸發**(`POST /license/catalog/sync` · `POST /license/reconcile`)。`license.controller.ts` 內有明文註解把 daily `@Cron` 延後至 orchestration phase。
> **影響**:Layer 3 現時實質上係「一組可被人手或外部系統呼叫嘅 action endpoint」,而唔係一個自動化編排層。呢個係**已知且刻意嘅延後**,唔係缺陷,但規劃部署時必須計入。

### 5.2 Monorepo 結構(ADR-0001)

```
unified-operation-platform/
├── apps/
│   ├── api/                  NestJS modular monolith(後端)
│   │   ├── prisma/schema.prisma
│   │   └── src/{prisma,integration,auth,license,fulfilment,opco}/
│   └── web/                  React SPA(前端)
│       └── src/{pages,components,hooks,lib,store}/
├── docs/                     全部規格 / 規劃 / ADR
├── design_handoff_licenseops/   hifi 設計參考(read-only)
└── docker-compose.yml        postgres + redis
```

### 5.3 後端模組地圖

`app.module.ts` 匯入次序:`ConfigModule`(global)→ `ScheduleModule` → `PrismaModule` → `IntegrationModule` → `AuthModule` → `LicenseModule` → `FulfilmentModule` → `OpcoModule`。

| Module | 職責 | 主要 service |
|---|---|---|
| `prisma` | `@Global` 單一 DB 存取點 | `PrismaService` |
| `integration` | **對外唯一邊界**;domain 層唔可以直接 import vendor SDK | `GraphService` · `ServiceNowService` |
| `auth` | 雙 provider 認證(Entra Bearer / 本地 cookie JWT)+ 註冊兩個全域 guard + admin user console + **權限矩陣 derive**(W28) | `AuthService` · `LocalJwtService` · `RefreshTokenService` · `UserAdminService` · `derivePermissions()`(純函數) |
| `license` | **Module C** — SKU catalog 字典 · 總量層對帳 · ledger 讀寫匯入 · tenant-owned 視圖 | `CatalogService` · `ReconcileService` · `AllocationImportService` · `LedgerReadService` · `LedgerWriteService` · `TenantOwnedService` |
| `fulfilment` | **Module D** — request 生命週期(intake → stage → assign)· n8n m2m inbound · outbound 建單 | `RequestService` · `StageService` · `AssignService` · `IntakeService` · `OutboundRequestService` |
| `opco` | OpCo picker + OpCo 管理 console(CH-004) | `OpcoService` |

**Provider 選路(ADR-0008 Phase 丙)**:`requestSubmissionProviderFactory` 依 env `REQUEST_SUBMISSION_PROVIDER` 揀 `N8nWorkflowProvider`(值為 `n8n`)或 `DirectServiceNowProvider`(預設)。抽象 `RequestSubmissionProvider` 係 DI token —— 換 provider 時上游 consumer 零改動。

---

## 6. 技術棧(Locked)

> 呢張表受 **CLAUDE.md §5 H2** 保護:加新 runtime dependency 或換 vendor = 觸發 STOP + approval + ADR。例外:純 utility lib / type stub / dev dependency。

| 層 | 選型 | 實作狀態 |
|---|---|---|
| 後端 | **NestJS**(modular monolith)· TypeScript · Node 20+ | ✅ 運行中(本機 Node v22) |
| DB | **PostgreSQL 16** + **Prisma** | ✅ 運行中 |
| 背景工作 | **Redis + BullMQ** · 排程 `@nestjs/schedule` | ⚠️ Redis container 已起;**BullMQ 未入 package.json**;`@Cron` 零實作 |
| 對外 API | **REST + OpenAPI**(NestJS Swagger) | ✅ `/docs/api` |
| Auth | **Entra ID SSO + app roles** | ✅ 後端驗證已建;真 SSO e2e 未驗(卡外部) |
| 本地 auth | argon2id + 本地簽發 JWT + rotating refresh token(ADR-0005 / 0006) | ✅ 已建 |
| 前端 | **React 18 + Vite 5 + TypeScript 5.7 + Tailwind 3.4 + shadcn/ui 慣例** | ✅ 已建 |
| Monorepo | `apps/api` + `apps/web`(ADR-0001) | ✅ |
| 部署 | **Docker Compose**(app + postgres + redis) | ⚠️ 本地 infra 已有;**生產部署未做** |
| Integration vendors | Microsoft Graph · ServiceNow Table API · n8n | ✅ client 已建;真合約待對齊 |

### 6.1 前端 runtime dependencies(11 個)

| Package | 版本 | 用途 |
|---|---|---|
| `react` / `react-dom` | ^18.3.1 | — |
| `react-router-dom` | ^6.28.1 | routing |
| `@tanstack/react-query` | ^5.62.7 | server state |
| `zustand` | ^5.0.2 | UI state |
| `@azure/msal-browser` / `@azure/msal-react` | ^5.17.0 / ^5.5.2 | Entra SSO |
| `lucide-react` | ^0.468.0 | icon(stroke-only) |
| `class-variance-authority` · `clsx` · `tailwind-merge` | — | 樣式組合 |

> **注意**:雖然有 `components.json`(shadcn schema),但 **dependencies 內無任何 `@radix-ui/*`** —— UI primitives 係照 shadcn 慣例(CVA + `cn()` + tailwind-merge)**手寫重建**,唔係 CLI 產出。呢個係刻意選擇,對齊設計 handoff。

---

## 7. Domain Model

真相來源:`apps/api/prisma/schema.prisma`。**11 個 model · 5 個 enum**(2026-07-20 查證)。

### 7.1 Enums

| Enum | 值 |
|---|---|
| `Role` | `ADMIN` · `REGIONAL` · `OPCO_IT` |
| `DriftStatus` | `OPEN` · `RESOLVED` |
| `RequestStatus` | `OPEN` · `IN_PROGRESS` · `COMPLETED` · `CANCELLED` |
| `LineItemStage` | `REQUESTED` · `QUOTING` · `OPCO_APPROVED` · `AWAITING_VENDOR` · `READY` · `ASSIGNED` · `CANCELLED` |
| `EventType` | `STAGE_CHANGE` · `ASSIGN` · `SYNC` · `RECONCILE` · `NOTE` |

### 7.2 Models

#### 身分與租戶

**`AppUser`** — `id` · `entraOid?` U · `email` U · `displayName` · `passwordHash?`(argon2id)· `authProvider`(預設 `entra`)· `mustChangePassword` · `failedLoginCount` · `lockedUntil?` · `passwordChangedAt?` · `role` **Role**(預設 `REGIONAL`)· `opcoScopeId?` · `active` · `lastLoginAt?`
關聯:`opcoScope → Opco?` · `handledRequests` · `events` · `refreshTokens` · `ledgerAdjustments`

**`RefreshToken`** — `id` · `userId` FK(cascade)· `tokenHash` U(SHA-256,**只存 hash**)· `expiresAt` · `revokedAt?`

**`Opco`** — `id` · `code` U · `displayName` · `company` · `costCenter?` · `active`

#### License 狀態(核心)

**`SkuCatalog`** — `id` · **`skuId` U**(M365/D365 GUID,**唯一主鍵真相**)· `skuPartNumber` · `displayName` · `businessAlias?` · `category?` · `isBaseLicense` · `active` · `lastSyncedAt?`

**`OpcoSkuLedger`** — `id` · `opcoId` FK · `skuCatalogId` FK · **`allocatedQuantity`** · **`assignedQuantity`** · `updatedAt` · `@@unique([opcoId, skuCatalogId])`

**`LedgerAdjustment`**(ADR-0007)— `id` · `ledgerId` FK(cascade)· `field`(`allocatedQuantity` \| `assignedQuantity`)· `beforeValue` · `afterValue` · `reason?` · `actorId?` FK

**`TenantSkuSnapshot`** — `id` · `skuCatalogId` FK · `prepaidEnabled` · `consumedUnits` · `capturedAt`

**`DriftAlert`** — `id` · `skuCatalogId` FK · `ledgerAssignedSum` · `tenantConsumed` · `delta` · `status` **DriftStatus** · `note?` · `detectedAt` · `resolvedAt?`

#### Request 履行

**`Request`** — `id` · `serviceNowSysId?` U(parent REQ)· `serviceNowNumber?` · `serviceNowStatus?` · `rawRequestText?` · **`origin`**(預設 `onboarding-intake`)· `requesterEmail?` · `targetUpn` · `targetDisplayName?` · `opcoId` FK · `status` **RequestStatus** · `handledById?` FK · `accountCreatedAt?` · **`azureSyncedAt?`** · `closedAt?`

**`RequestLineItem`** — `id` · `requestId` FK(cascade)· `skuCatalogId` FK · `quantity` · `procurementRequired` · **`stage`** **LineItemStage** · `serviceNowSysId?` / `serviceNowNumber?`(RITM 層)· `quoteRef?` · `poRef?` · `quotedAt?` · `opcoApprovedAt?` · `vendorOrderedAt?` · `readyAt?` · `assignedAt?` · `note?`

**`RequestEvent`** — `id` · `requestId` FK(cascade)· `lineItemId?` FK · `type` **EventType** · `fromStage?` / `toStage?` · `message?` · `actorId?` FK

### 7.3 四個關鍵建模決策

| # | 決策 | 理由 |
|---|---|---|
| 1 | **`stage` 掛喺 `RequestLineItem`,唔係 `Request`** | 一張單裡唔同 SKU 可以喺唔同 stage(E3 即時 assign、Copilot 仲喺 procurement)。`Request.status` 係聚合結果 |
| 2 | **ledger 兩個數字分開** | `allocatedQuantity` = OpCo budget(**唔參與對帳**);`assignedQuantity` = 已指派 baseline(**只有呢個對帳**) |
| 3 | **`SkuCatalog` 以 `skuId` GUID 為真相** | Excel 嘅名係同事網上搵嘅 friendly name,對唔上 API。`businessAlias` 只係舊名對照 |
| 4 | **`Request.azureSyncedAt` = Phase 1 sync gate** | assign 前必須檢查 |

### 7.4 刻意排除

| 排除 | 理由 |
|---|---|
| 成本 / 發票金額 | DocuWare 地盤;平台只記 `quoteRef` / `poRef` 指標 |
| ServiceNow priority / category 鏡像 | v1 用唔上 |

### 7.5 `AuditLog` —— 已拍板,**未落地**

ADR-0009(**Accepted**,2026-07-20,Chris Lai 拍板)定義咗一個通用 `AuditLog` model,與 `RequestEvent` / `LedgerAdjustment` **共存而非取代**。

**但 `schema.prisma` 內目前無此 model** —— 屬待實作(BACKLOG `AUDIT-3`)。詳見 §17 落差登記。

---

## 8. 核心業務邏輯

### 8.1 State 模型與對帳(方案甲)

**基本前提**
- **M365 tenant = 總量嘅唯一 source of truth**(單一 tenant;`subscribedSkus` 提供 `prepaidUnits.enabled` vs `consumedUnits`)
- **SKU 唯一主鍵 = `skuId` GUID**;需要一張 `skuId ⇄ skuPartNumber ⇄ 業務別名` 字典。**唔信 Excel 名稱、唔信記憶中嘅 part number**

**初始化流程**:上線前 → 建 per-OpCo ledger → 同 M365 實際總數比對 → 把差異全部清乾淨建立 baseline → 先開始用。

**對帳方式 = 方案甲**

```
偵測層級:每個 SKU 嘅「總量層」
判斷式:  Σ(所有 OpCo 的 assignedQuantity)  vs  M365 tenant consumedUnits
對唔上  →  建立 DriftAlert
```

差異落喺邊個 OpCo 要人去查。**對回機制**(ADR-0007 已啟動):手動編輯 by-OpCo `assignedQuantity`(`PATCH /license/ledger/:id`),每次必記 `LedgerAdjustment`(who / when / field / before→after / reason)。

**分層真相**

| 層 | 數字 | 來源 | 維護方式 |
|---|---|---|---|
| **Platform**(tenant) | `owned` = `prepaidEnabled` · `consumed` = `consumedUnits` | Graph | 自動、**唯讀** |
| **By-OpCo**(內部帳) | `allocatedQuantity` · `assignedQuantity` | 平台 DB | **人手維護** |

> 點解 By-OpCo 靠人手:**Graph 唔知 OpCo 劃分**。呢個係方案甲嘅根本前提。

**兩個數字嘅寫入路徑**

| 欄位 | 寫入來源 |
|---|---|
| `allocatedQuantity` | allocation import(W13,CSV)+ 手動逐格編輯(W23-A) |
| `assignedQuantity` | fulfilment assign 自動 +1(W04)+ **手動校正 / 對回**(W23-A) |

**baseline vs in-flight**:baseline(已 assign)要 reconcile 到準;在途(報價 / 等批 / 等 vendor / ready 未 assign)係浮動 overlay,由 request line item 狀態算出,**唔落入 ledger baseline**。兩層分開。

### 8.2 Request 生命週期

**兩個入口**

| 入口 | 路徑 | `origin` | 認證 |
|---|---|---|---|
| **Inbound**(n8n onboarding push) | `POST /requests/intake` | `n8n-intake` | m2m — `X-Intake-Key` header,**fail-closed** |
| **Outbound**(IT 喺平台開單) | `POST /requests` → provider → ServiceNow | `platform-created` | 一般 JWT |

> Inbound 建立後:`status = OPEN` · `stage = REQUESTED` · `handledById = null` → **入 Regional queue 等人手認領,非自動觸發**。
> Outbound:**SN-first,fail-closed** —— ServiceNow 建單失敗就唔建本地 mirror。

**兩條路徑**

| 路徑 | Stage 序列 |
|---|---|
| **短路**(有 budget / spare) | `REQUESTED → READY → ASSIGNED` |
| **Procurement**(需加購,人手推進) | `REQUESTED → QUOTING → OPCO_APPROVED → AWAITING_VENDOR → READY → ASSIGNED` |

Stage 喺**每條 line item** 上獨立推進。採購段(quote / approval / vendor)係**人手更新狀態**,平台只做追蹤,**唔記金額**。

**Phase 1 sync gate**

疊喺上面嘅係 Phase 1 帳號流程:`account created → synced`(`azureSyncedAt`)。指派**必須等 synced** 先做。

> 🔴 **時序真相(RISK R3)**:n8n 建**on-prem AD** → 經 Azure AD Connect sync 落 Entra **有延遲**。所以 push 帶嘅 `azureSyncedAt`(n8n 聲稱)**唔等於** Graph 即刻見到。
> **實作規則**:指派前以 `findUser(upn)` **真命中**為準,唔淨係信 timestamp;未命中要 retry。

### 8.3 履行動作(單一觸發,多個 side-effect)

```
1. 檢查 sync gate（azureSyncedAt + findUser 真命中）
2. Graph setUsageLocation()      ← 指派前必須有 usageLocation
3. Graph assignLicense()          ← 無空 seat 會失敗，要先查可用量
4. OpcoSkuLedger.assignedQuantity += 1
5. 回寫 ServiceNow（狀態 / work note）
6. stage = ASSIGNED + 寫 RequestEvent
```

---

## 9. 整合層

**唯一對外邊界**。Domain / orchestration 層**唔可以直接 import Graph / ServiceNow SDK**(CLAUDE.md §3.1)。

### 9.1 `GraphService`

| 方法 | 用途 | 已知硬坑 |
|---|---|---|
| `getSubscribedSkus()` | 拉 live 總量(purchased / consumed),供初始化 + 對帳 | — |
| `findUser(upn)` | 搵唔到回 `null` —— **同時就係 Phase 1 sync gate** | — |
| `setUsageLocation()` | 設定使用地 | **指派前必須有,否則 assign 失敗** |
| `assignLicense()` | 實際指派 | **無空 seat 會失敗** —— 要先查可用量 |

**錯誤處理**:`graph-unavailable.ts` 共用 helper 把 Graph 拋出嘅錯誤包成 **503**,避免 process crash(BUG-002 / BE-graph-harden 修復)。

**Entra 權限(app-only,需 admin consent)**:`Organization.Read.All` · `Directory.Read.All` · `User.ReadWrite.All`

### 9.2 `ServiceNowService`

Table API 讀寫:`getRecord` · `getRecordByNumber` · `query` · `updateRecord` · `addWorkNote` · `createRecord`

> ⚠️ 型別故意 generic。**table 名同欄位名要對齊 Phase 1 實際設定** —— `sc_req_item` / `work_notes` 只係預設值。對齊 checklist 已備:`docs/05-usage/SERVICENOW-CONTRACT-ALIGNMENT.md`。

### 9.3 n8n

| 方向 | 機制 | 狀態 |
|---|---|---|
| **Inbound** | n8n → `POST /requests/intake`,header `X-Intake-Key`,`IntakeKeyGuard` fail-closed(env 未設 → app boot 失敗) | ✅ 已建 |
| **Outbound** | 平台 → n8n webhook,header `X-N8n-Key`,同步回 response | ✅ code 已建;**合約仍屬 representative** |

> ⚠️ `n8n-workflow.provider.ts` 內部明文自認 URL / fields / auth 係 **REPRESENTATIVE**。真合約待同 n8n owner 對齊(`CONTRACT-OUTBOUND.md` §6)。

---

## 10. 認證與授權

### 10.1 雙 provider 並存

| Provider | 機制 | ADR |
|---|---|---|
| **Entra ID SSO** | MSAL auth code + PKCE(redirect)→ Bearer token → 後端 JWKS 驗 JWT | ADR-0002 / 0003 |
| **本地密碼** | argon2id → 本地簽發 HS256 JWT → **httpOnly + SameSite=Strict cookie** | ADR-0005 / 0006 |

後端 guard **dual-issuer**:`iss = uop-local` → HS256 依 `sub` 解析;否則走 Entra 路徑。Guard 對本地 session 係 **cookie-first**;Entra header 路徑不變。

### 10.2 Session(ADR-0006 §7)

| 項目 | 設定 |
|---|---|
| Access token | 15 分鐘 |
| Refresh token | 7 日,**rotating**(用完即換,防重放) |
| 儲存 | `RefreshToken.tokenHash` = SHA-256,**只存 hash**;原 token 256-bit `randomBytes` |
| 傳輸 | httpOnly + SameSite=Strict cookie |
| 前端 | **零 token 落 localStorage**;只存非敏感 profile(`uop.localProfile`);401 → single-flight refresh + 重放一次 |

### 10.3 密碼政策(ADR-0006,前後端共用邏輯)

| 規則 | 值 |
|---|---|
| 最短長度 | 12 |
| 字元類別 | ≥ 3 類 |
| 禁止 | 等於 email · 新密碼等於舊密碼 |
| Force change | 首次登入 / admin 重設後強制;後端 `ensurePasswordChanged` **硬 gate 403**(只放行 `PATCH /me/password`) |
| Lockout | per-account 5 次失敗 / 鎖 15 分鐘 |

### 10.4 角色與 scope

| 角色 | 範圍 |
|---|---|
| `ADMIN` | 全部 + admin console(users / opcos) |
| `REGIONAL` | 看全部 OpCo,無 user 管理 |
| `OPCO_IT` | **只見自己 OpCo**,後端強制 |

**OPCO_IT scope 執行點**(`auth/opco-scope.ts`):`scopeWhere` 用於 read filter;`assertOpcoScope` 用於 write 面 —— **fail-closed 403**。

**前端 role gating**(`lib/roles.ts`):`canSeePlatform()`(ADMIN / REGIONAL)· `canSeeAdminNav()`(僅 ADMIN)。`role === undefined` → **fail-safe 無權限**。role 真相一律來自 `GET /me`。

> **權限唯一真相 = `@Roles` decorator**。ADR-0009 Decision 8.5 明確**唔起 permission table** —— 兩處真相必然 drift。權限矩陣應由 code derive 成文件 + drift test 保證同步(BACKLOG `AUDIT-2`,未做)。

### 10.5 Guard 執行鏈

全域註冊兩個 `APP_GUARD`:`JwtAuthGuard` → `RolesGuard`。

| 情況 | 行為 |
|---|---|
| `@Public()` | 兩個 guard 都短路 |
| 有 method-level `@Roles` | 覆蓋 class-level |
| **完全無 `@Roles`** | **任何已認證用戶皆可** |

### 10.6 開發旁路(⚠️ 生產風險)

`AUTH_DEV_BYPASS=true`(後端)+ `VITE_AUTH_DEV_BYPASS=true`(前端)= 免登入,注入 seed ADMIN。`AUTH_DEV_USER_EMAIL` 可扮特定用戶(例如 OPCO_IT)。

**緩解**(RISK R2,狀態 🟢 Mitigated):預設 `false` · 開啟時打 warning log · 生產路徑 `getOrThrow(ENTRA_TENANT_ID / ENTRA_API_AUDIENCE)` 未設即 **boot 失敗**(fail-fast)。
**部署義務**:生產 `.env` **必須無此 flag**。

---

## 11. API 介面

**34 個 endpoint · 10 個 controller**。無全域 prefix,路徑皆 root-level。OpenAPI UI:`/docs/api`。全域 `ValidationPipe({ whitelist: true, transform: true })` + `cookie-parser`。

### 11.1 Auth(`/auth`)— 全部 `@Public()`

| Method | 路徑 | 說明 |
|---|---|---|
| POST | `/auth/login` | 本地密碼登入 → 設 cookie(200) |
| POST | `/auth/refresh` | 換發 access + rotate refresh(200) |
| POST | `/auth/logout` | 撤銷 refresh + 清 cookie(204) |

### 11.2 Me(`/me`)— 任何已認證用戶

| Method | 路徑 | 說明 |
|---|---|---|
| GET | `/me` | 身分 SSOT(role / opcoScope) |
| PATCH | `/me/password` | 改自己密碼(204) |

### 11.3 Admin — Users(`/admin`)— `@Roles(ADMIN)`

| Method | 路徑 |
|---|---|
| GET | `/admin/users` |
| POST | `/admin/users` |
| PATCH | `/admin/users/:id` |
| POST | `/admin/users/:id/reset-password`(204) |

### 11.4 Admin — 權限矩陣(`/admin/permissions`)— `@Roles(ADMIN)`

| Method | 路徑 | 說明 |
|---|---|---|
| GET | `/admin/permissions` | **由 `@Roles` metadata live derive 嘅 role × endpoint 矩陣**(W28 F1) |

> ADMIN-only 嘅理由:佢會列舉全 app 每一條 route —— 正正就係唔應該交畀低權限帳號嘅地圖。
> ⚠️ 呢個矩陣答嘅係「邊個 role 可以**呼叫**邊個 endpoint」,**唔表達 row-level scope** —— OPCO_IT 額外受 `opco-scope.ts` 限制喺自己 OpCo(AUTH-3a),矩陣顯示唔到呢層。

### 11.5 Admin — OpCos(`/admin/opcos`)— `@Roles(ADMIN, REGIONAL)`

| Method | 路徑 | 說明 |
|---|---|---|
| GET | `/admin/opcos` | 支援 `?includeInactive=true` |
| POST | `/admin/opcos` | 建立(201);`code` 唯一,重複回 409 |
| PATCH | `/admin/opcos/:id` | 修改;**`code` immutable** |

### 11.6 License(`/license`)— class `@Roles(ADMIN, REGIONAL)`

| Method | 路徑 | 有效角色 |
|---|---|---|
| POST | `/license/catalog/sync` | ADMIN, REGIONAL |
| GET | `/license/catalog` | **+ OPCO_IT** |
| PATCH | `/license/catalog/:id` | ADMIN, REGIONAL |
| POST | `/license/reconcile` | ADMIN, REGIONAL |
| GET | `/license/drift` | **+ OPCO_IT** |
| POST | `/license/ledger/import` | ADMIN, REGIONAL |
| GET | `/license/ledger` | **+ OPCO_IT** |
| GET | `/license/ledger/stats` | **+ OPCO_IT** |
| PATCH | `/license/ledger/:id` | **+ OPCO_IT**(service 內 `assertOpcoScope`) |
| GET | `/license/tenant-skus` | ADMIN, REGIONAL |
| GET | `/license/tenant-skus/stats` | ADMIN, REGIONAL |

> Platform(tenant)視圖刻意排除 OPCO_IT —— 屬管理視圖。

### 11.7 Fulfilment(`/fulfilment/requests`)— `@Roles(ADMIN, REGIONAL, OPCO_IT)`

| Method | 路徑 |
|---|---|
| POST | `/fulfilment/requests` |
| GET | `/fulfilment/requests` |
| GET | `/fulfilment/requests/:id` |
| POST | `/fulfilment/requests/:id/line-items` |
| PATCH | `/fulfilment/requests/:id/line-items/:lineItemId/stage` |
| PATCH | `/fulfilment/requests/:id/sync` |
| PATCH | `/fulfilment/requests/:id/line-items/:lineItemId/assign` |

### 11.8 Requests — intake / outbound(`/requests`)

| Method | 路徑 | 認證 |
|---|---|---|
| POST | `/requests/intake` | **`@Public()` + `IntakeKeyGuard`**(header `x-intake-key`) |
| POST | `/requests` | `@Roles(ADMIN, REGIONAL, OPCO_IT)` |

### 11.9 OpCos(`/opcos`)

| Method | 路徑 | 用途 |
|---|---|---|
| GET | `/opcos` | picker 用,`@Roles(ADMIN, REGIONAL, OPCO_IT)` |

### 11.10 API 層面已知缺口

- ❌ **無 health / readiness endpoint** —— 部署前需補(容器編排與監控需要)
- ❌ 全 API **無 `DELETE` / `PUT`** —— 停用一律用 `active` flag(刻意設計,非缺陷)

---

## 12. 前端

### 12.1 Routes(11 條)

`src/router.tsx`(`createBrowserRouter`,集中定義,**無 lazy loading**)。掛載鏈:`main.tsx` → `App.tsx`(`MsalProvider` → `QueryClientProvider` → `RouterProvider`)。

| Path | 檔案 | 功能 |
|---|---|---|
| `/login` | `pages/login.tsx` | 雙欄登入 —— Entra SSO + 本地密碼 |
| `/change-password` | `pages/force-password-change.tsx` | 強制改密碼 gate |
| `/`(layout) | `components/shell/app-shell.tsx`(外包 `require-auth.tsx`) | 已驗證外殼 |
| `/`(index) | `pages/overview.tsx` | 儀表板 |
| `/requests` | `pages/requests.tsx` | 請求清單 |
| `/requests/new` | `pages/new-request.tsx` | 建立獨立 license request |
| `/requests/:id` | `pages/request-detail.tsx` | 請求詳情 + stage 推進 + assign |
| `/assets` | `pages/assets.tsx` | License 資產(Platform / By-OpCo 雙模式) |
| `/drift` | `pages/drift.tsx` | Drift 告警 + 手動 reconcile |
| `/catalog` | `pages/catalog.tsx` | SKU 目錄 + 同步 + 編輯 |
| `/settings` | `pages/settings.tsx` | 設定(5 個 tab) |

> ❌ **無 404 / catch-all route** —— 建議補。

### 12.2 主要畫面內容

**Overview** — KPI 四卡(Open requests · In procurement · Open drift alerts · Licenses assigned)+ Needs-attention 列表 + Drift summary。
**Requests** — filter chips(all / mine / attention / procurement / blocked,含計數)+ 分頁表(8/頁)。`mine` 依 `handledById === me.id` 客戶端過濾。
**Request detail** — header + **Azure sync gate**(Account created → Synced)+ line items stepper(Advance stage / Assign now)+ 操作歷史時間軸。
**Assets** — 兩個 mode:*By-OpCo*(誠實表:allocated / assigned / available / utilization bar,**支援 inline row 編輯**)· *Platform*(tenant 三層 owned / allocated / assigned / unallocated,按 category 分組 + 小計 + 總計)。OPCO_IT 完全睇唔到 Platform 切換器;若直接觸發後端 403 → graceful restricted state。
**Settings** — 5 個 tab(`?tab=` 驅動):`account` · `preferences` · `users` · `opcos` · `integrations`(CSV allocation import:選檔 → dry-run 預覽 → commit)。

### 12.3 App shell

| 元件 | 規格 |
|---|---|
| `sidebar.tsx` | 248px(收合 64px);分節 OPERATIONS / CATALOG / ADMINISTRATION / ROADMAP;ADMINISTRATION 由 `canSeeAdminNav()` 閘控(僅 ADMIN),深連結去 `/settings?tab=…` |
| `top-bar.tsx` | 56px;側欄切換 · 頁標題 + 角色 scope 副標 · 搜尋框 · 主題切換 · 租戶指示燈 · UserMenu |

### 12.4 UI primitives(17 個,`components/ui/`)

`avatar` · `badge` · `button` · `card` · `checkbox` · `dialog` · `empty-state` · `feedback-states` · `icon-button` · `input` · `nav-item` · `segmented-control` · `select` · `stat-card` · `stepper` · `toast` + `cn()` 工具

### 12.5 狀態管理

| 類型 | 實作 |
|---|---|
| Server state | **TanStack Query** — 13 個 query hook(`hooks/queries.ts`)+ 14 個 mutation(`hooks/mutations.ts`);共用 `retryUnless403`(403 為權威,唔重試) |
| UI state | **Zustand** — 單一 store `useUiStore`:`theme` · `sidebarCollapsed` |

### 12.6 設計系統約束(CLAUDE.md §5 H6)

前端必須忠實還原 `design_handoff_licenseops/` hifi 設計。以下屬違反:

- hardcode 色 / 字 / 間距 / 半徑 / 陰影值(唔用 token CSS var)
- 憑感覺 eyeball token 數值
- 引入 handoff 以外嘅 accent 色 / gradient / 陰影美學 / icon set(accent 只有 Ricoh red `#E60027`;icon 只有 lucide stroke;唯一 gradient = login)
- 一個 view 多過一個 primary action
- 只做 light 或只做 dark(**兩個都要**)

---

## 13. 部署與環境

### 13.1 本地 infra(`docker-compose.yml`)

| 服務 | Image | Port | 備註 |
|---|---|---|---|
| `uop-postgres` | `postgres:16-alpine` | host **5433** → container 5432 | volume `pgdata`;healthcheck `pg_isready` |
| `uop-redis` | `redis:7-alpine` | 6379 | healthcheck `redis-cli ping`;**BullMQ 未使用** |
| backend | 本機 `npm run start:dev` | **3100**(預設 3000) | 未容器化 |

> Port 偏移原因:本機 3000 被 Langfuse 佔、5432 被既有 Postgres 佔。

### 13.2 環境變數(**只列名,絕不入 git**)

| 組別 | 變數 |
|---|---|
| Graph | `GRAPH_TENANT_ID` · `GRAPH_CLIENT_ID` · `GRAPH_CLIENT_SECRET` |
| ServiceNow | `SERVICENOW_INSTANCE_URL` · `SERVICENOW_USER` · `SERVICENOW_PASSWORD` · `SERVICENOW_DEFAULT_TABLE` |
| Database | `DATABASE_URL` |
| Integration m2m | `INTAKE_API_KEY` · `REQUEST_SUBMISSION_PROVIDER` · `N8N_OUTBOUND_WEBHOOK_URL` · `N8N_OUTBOUND_WEBHOOK_KEY` |
| Auth | `AUTH_JWT_SECRET` · `LOCAL_ADMIN_INITIAL_PASSWORD` · `AUTH_DEV_BYPASS` · `AUTH_DEV_USER_EMAIL` |
| 前端 | `VITE_ENTRA_CLIENT_ID` · `VITE_ENTRA_TENANT_ID` · `VITE_ENTRA_API_SCOPE` · `VITE_ENTRA_REDIRECT_URI` · `VITE_AUTH_DEV_BYPASS` |

**Fail-fast 行為**:`INTAKE_API_KEY` 未設 → app boot 失敗;`REQUEST_SUBMISSION_PROVIDER=n8n` 但 webhook 變數未設 → boot 失敗。

### 13.3 建置

| App | 指令 | 產物 |
|---|---|---|
| `apps/api` | `npm run build` | Node 可執行 |
| `apps/web` | `tsc --noEmit && vite build` | static assets;`manualChunks` 拆 `react-vendor` / `msal-vendor` / `query-vendor`(CH-001,最大 chunk 254KB) |

Dev proxy:`/api` → `http://localhost:3100`(可用 `API_PROXY_TARGET` 覆寫,rewrite 去掉 `/api` 前綴)。

### 13.4 已知環境約束

| # | 約束 | 緩解 |
|---|---|---|
| 1 | `binaries.prisma.sh` 被公司 proxy 封 → `prisma generate` / `migrate` 503 失敗 | 轉流動網路跑一次 cache engine 落 `node_modules`;長遠靠 IT allowlist `*.prisma.sh`(RISK R1) |
| 2 | 其他 TLS | `NODE_EXTRA_CA_CERTS` |
| 3 | Port 衝突 | 3100 / 5433 |

### 13.5 生產部署缺口

| 缺口 | 影響 |
|---|---|
| Backend 未容器化(無 Dockerfile 納入 compose) | 部署需補 |
| 無 health / readiness endpoint | 編排與監控 |
| 無 CI/CD pipeline | 全人手 |
| 無 load balancer / 多副本設計 | 單點 |
| 生產真數 curation 未做 | 見 §19 |

---

# Part B — 交付範圍書(SOW)

## 14. 交付項目與完成狀態

### 14.1 已交付

| # | 交付項目 | 狀態 | 證據 |
|---|---|---|---|
| D1 | Monorepo 骨架 + Docker infra + DB migration + seed | ✅ | W01 |
| D2 | Integration layer(Graph + ServiceNow client + 錯誤包裝) | ✅ | `src/integration/` · BUG-002 · BE-graph-harden |
| D3 | Module C — SKU catalog 字典 + 總量層對帳 + drift alert | ✅ | W02 |
| D4 | Module D-1 — Request 生命週期骨架(intake → line items → triage → stage machine) | ✅ | W03 |
| D5 | Module D-2 — 履行動作(sync gate → assignLicense → ledger +1 → 回寫 SN) | ✅ | W04 |
| D6 | Allocation import(CSV dry-run + commit) | ✅ | W13 · ADR-0004 |
| D7 | Ledger 讀取 API + tenant-owned 三層視圖 | ✅ | W14 · W16 |
| D8 | Ledger 手動管理 + `LedgerAdjustment` audit + 對回機制 | ✅ | W23-A · ADR-0007 |
| D9 | 認證 — Entra JWT 驗證 + role guard | ✅ | W09 · ADR-0002 |
| D10 | 認證 — 前端 MSAL scaffold | ✅ code | W10 · ADR-0003(**e2e 未驗**) |
| D11 | 授權 — OPCO_IT per-OpCo scope 後端強制 | ✅ | W11 |
| D12 | 認證 — 本地密碼登入 + user 管理 + 密碼生命週期 + session hardening | ✅ | W18–W21 · ADR-0005 / 0006 |
| D13 | 授權 — 前端真 role scope / gating | ✅ | W22 |
| D14 | 前端 — 全部 11 條 route(8 個實畫面 + login + 改密碼 + 開單) | ✅ | W05–W08 · W15 · W17 · W25 |
| D15 | 前端 — 設計 fidelity 對齊 | ✅ | W12 · CH-002 |
| D16 | Request 建單 rollout 四階段(inbound intake / outbound direct / n8n outbound / D365 納入) | ✅ | W24–W27 · ADR-0008 |
| D17 | SKU Catalog 編輯 | ✅ | CH-003 |
| D18 | OpCo 管理(CRUD + settings tab) | ✅ | CH-004 |
| D19 | 前端 bundle 拆分 | ✅ | CH-001 |
| D20 | 文件體系(平台 spec · module spec · 9 份 ADR · BACKLOG · PROCESS · RISK) | ✅ | `docs/` |

### 14.2 未交付(已識別)

| # | 項目 | 狀態 | 阻塞 |
|---|---|---|---|
| P1 | **生產部署** | 候選 | owner 決定時機 + 真數 curation |
| P2 | **真 SSO 端到端驗證** | 🔴 blocked | IT 未開 SPA app registration |
| P3 | **Audit trail 落地**(ADR-0009) | 候選 | ADR 已 Accepted,可開工 |
| P4 | **權限矩陣 derive + drift test** | 🚧 **進行中(W28)** | F0 / F1 / F3 ✅ 完成;**餘 F2 唯讀矩陣 UI** |
| P5 | **Integration 狀態 + Test connection UI** | 候選 | 需輕度 ADR |
| P6 | **n8n 回程 webhook**(外部推 stage) | 🔴 blocked | 需同 n8n owner 對真合約;另觸發 H1 |
| P7 | **Outbound 交付保證 / retry** | 候選 | 需 ADR;啟用 BullMQ = H1 架構決定 |
| P8 | **排程 / 背景佇列** | 未實作 | 見 §17 |
| P9 | Email self-service reset | 🔴 deferred | 需 IT 授 Graph `Mail.Send` 或改 SMTP(新 dep) |
| P10 | npm dev-chain 漏洞清理 | deferred | 需 breaking major 升級 |

---

## 15. 交付歷程

### 15.1 階段(Phase)

| 階段 | 內容 | 完成 |
|---|---|---|
| W01 | Backend bootstrap(monorepo + Prisma + docker-compose) | 2026-07-09 |
| W02 | Module C — catalog + 對帳 | 2026-07-09 |
| W03 / W04 | Module D-1 生命週期 / D-2 履行動作 | 2026-07-09 |
| W05–W08 | 前端 scaffold → Overview + Catalog → Requests → Drift(+ Graph harden) | 2026-07-09 ~ 07-10 |
| W09–W11 | AUTH-1 後端 guard → AUTH-2a 前端 SSO → AUTH-3a OPCO_IT scope | 2026-07-10 |
| W12 | 全站 UI fidelity audit + harden | 2026-07-11 |
| W13–W17 | Allocation import → ledger read → FE Assets → tenant-owned → Platform mode | 2026-07-13 |
| W18–W22 | 本地登入 → user 管理 → 密碼生命週期 → session hardening → 前端真 role | 2026-07-13 ~ 07-14 |
| W23-A / W23-B | Ledger 手動管理(backend + audit)/ Assets inline edit | 2026-07-14 |
| W24–W27 | ADR-0008 rollout 四階段:甲 inbound → 乙 outbound direct → 丙 n8n outbound → 丁 D365 納入 | 2026-07-15 |
| **W28** | **權限矩陣 derive + drift test**(audit rollout item 2) | 🚧 **進行中**(kickoff 2026-07-20) |

### 15.2 變更(Change)與缺陷(Bug)

| ID | 內容 | 狀態 |
|---|---|---|
| CH-001 | 前端 bundle 拆分(587KB → 最大 254KB) | ✅ 2026-07-13 |
| CH-002 | 跨 4 畫面 fidelity 對齊 | ✅ 2026-07-16 |
| CH-003 | SKU Catalog 編輯 | ✅ 2026-07-16 |
| CH-004 | OpCo 管理 CRUD + settings tab | ✅ 2026-07-16 |
| BUG-001 | `GraphService` log 咗 UPN(PII 違反 H4) | ✅ Sev3 |
| BUG-002 | `findUser` throw 未包 → NestJS process crash | ✅ Sev2 |
| BUG-003 | Outbound 建單失敗 → opaque 500(應為 503) | ✅ Sev3 |
| INC-001 | AI agent 腦補 tool 結果事件 → 促成 CLAUDE.md §5.7 H7 | 已記錄 |

### 15.3 測試演進

| 階段 | api | web |
|---|---|---|
| W09 AUTH-1 | 56 | — |
| W11 AUTH-3a | 81 | — |
| W18 AUTH-4a | 109 | 25 |
| W21 session hardening | 157 | 48 |
| W23 ledger 手動管理 | 165 | 75 |
| W27 D365 收官 | 201 | 85 |
| CH-003 / CH-004 | 213 | **85** |
| W28 F1+F3 權限矩陣 | **223** | 85 |

---

## 16. 驗收準則

### 16.1 通用 Gate(每個階段適用)

| Gate | 準則 |
|---|---|
| G1 | 對應 spec section 明確;scope 未越界(H3) |
| G2 | Build 通過(`tsc --noEmit` + build) |
| G3 | Linter 零 warning |
| G4 | 測試全綠;critical path 有對應 test(H5) |
| G5 | Live 端到端驗證(curl 或 browser),**貼真實輸出** |
| G6 | 前端:light + dark 兩個主題都驗;token-only 無 hardcode(H6) |
| G7 | 架構級改動 → ADR 已寫 |
| G8 | 文件同步:phase checklist / progress / BACKLOG(R2 / R7) |

### 16.2 Critical Path 測試覆蓋(H5 強制)

以下 path 改動**必須**同步有 test,否則任務未完:

- `assignLicense` 履行流程
- Ledger `assignedQuantity` 更新
- SKU 總量層對帳 / drift 偵測
- Request stage 推進 / sync gate

Graph / ServiceNow **一律 mock**,唔打真 tenant。

### 16.3 現時測試實況

| 項目 | 數值 | 備註 |
|---|---|---|
| 後端 suites / tests | **30 / 223 + 1 snapshot**,全綠(實跑 90 秒驗證) | 全部係 colocated unit spec |
| 後端 e2e | **0** | 無 `*.e2e-spec.ts`、無 supertest |
| 前端 tests | **85 / 10 檔** | 9/10 係 `lib/` 純函式;唯一 component test 係 sidebar render smoke |
| 前端 page / hook test | **0** | |
| 端到端(跨系統) | **0 自動化** | 全部靠人手 curl / browser 驗證 |

> **判斷**:單元層覆蓋充分,**整合與端到端層係空白**。生產部署前建議至少補 API e2e smoke(登入 → 讀 → 寫 → 對帳)。

### 16.4 生產上線建議驗收清單(尚未執行)

- [ ] 真 tenant catalog sync,確認 SKU 字典正確(GUID ⇄ part number ⇄ 業務別名)
- [ ] 真 37-SKU × 24-entity allocation import,dry-run 對數
- [ ] 初始化對帳:清乾淨差異,建立 baseline
- [ ] 真 SSO 端到端(登入 → token → API 200 → 身分 → 登出)
- [ ] ServiceNow 合約對齊(table / 欄位 / 狀態值 / work note / idempotency)
- [ ] n8n inbound + outbound 真合約對齊
- [ ] 生產 `.env` 確認**無** `AUTH_DEV_BYPASS`
- [ ] Health endpoint + 監控接入
- [ ] 備份 / 還原演練(Postgres volume)

---

## 17. 現況落差登記(Honest Gaps)

> 呢一節係**刻意寫出嚟**嘅。項目有一條原則:寧可標明「未做」,都唔造假象。以下每項都經 code 查證。

### 17.1 架構層

| # | 落差 | 詳情 | 影響 |
|---|---|---|---|
| A1 | **排程 / 背景佇列零實作** | `ScheduleModule` 已註冊但零個 `@Cron`;BullMQ 唔喺 `package.json` | 對帳 / catalog 同步淨係人手觸發;outbound 失敗無自動 retry |
| A2 | **`AuditLog` 未落地** | ADR-0009 Accepted(2026-07-20)但 schema 無此 model | 用戶 CRUD / 角色變更 / 密碼重設 / 登入成敗 / OpCo CRUD / catalog 編輯 / import / drift resolve **全部零留痕** |
| A3 | ~~**權限矩陣無可查證形式**~~ | ✅ **已解決(W28 F1+F3,2026-07-20)** —— `GET /admin/permissions` live derive + snapshot drift test。`@Roles` 仍係唯一真相,矩陣係 derived view | 餘下:唯讀 UI(W28 F2)未做 |
| A4 | **無 health / readiness endpoint** | 全 API 無 | 阻礙容器編排與監控 |
| A5 | **後端未容器化** | `docker-compose.yml` 只有 postgres + redis | 生產部署需補 |

### 17.2 整合層

| # | 落差 | 詳情 |
|---|---|---|
| B1 | **ServiceNow 合約屬 representative** | table / 欄位 / cat_item 為預設值;`skuId` 目前係 placeholder。對齊 checklist 已備待填 |
| B2 | **n8n outbound 合約屬 representative** | provider 檔內明文自認;URL / fields / auth 待同 owner 對齊 |
| B3 | **n8n 回程 webhook 唔存在** | m2m 面**只有** inbound intake 一條;stage 推進只能靠平台 UI 人手撳 |
| B4 | **真 SSO 端到端未驗** | 前端 wiring 已就緒 + runbook 已備;卡 IT 開 SPA app registration |
| B5 | **生產真數 curation 未做** | 真 tenant catalog / 37-SKU businessAlias 對映 = deploy-time ops step |

### 17.3 前端

| # | 落差 | 詳情 |
|---|---|---|
| C1 | Overview「Recent activity」係 placeholder | 需 events / audit endpoint(由 A2 解封) |
| C2 | Overview「Analytics」tab 係 placeholder | 未規劃 |
| C3 | Overview ROADMAP 區塊係**寫死常數** | 非 API 資料 |
| C4 | Request detail「AI Assist」係 placeholder | 屬 Roadmap 項目 |
| C5 | Settings connector status 係 placeholder | 由 P5 解封 |
| C6 | Sidebar「Requests」badge 硬編碼 `count: 6` | 假數;只有 Drift badge 係真數 |
| C7 | TopBar 搜尋框**無功能** | 有 `⌘K` 鍵帽但無 handler、無 command palette |
| C8 | Drift「Resolve」/ per-OpCo 對回 UI 未做 | 對回機制設計已定但 UI 未建 |
| C9 | Assets「Compare」mode 未做 | 原設計三層之一 |
| C10 | 無 404 route | |
| C11 | 主題唔持久化 | Zustand 無 persist;亦唔讀系統 `prefers-color-scheme` |
| C12 | `login.tsx` 註解過時 | 寫住表單「never wired」,但實際已接 `POST /auth/login` |
| C13 | Catalog sync mutation 寫喺頁面內 | 唯一冇集中入 `hooks/mutations.ts` 嘅 mutation |

### 17.4 測試

| # | 落差 |
|---|---|
| T1 | 後端 **0 個 e2e test** |
| T2 | 前端 **0 個 page / hook test**;覆蓋偏向 `lib/` 純函式 |
| T3 | 跨系統端到端全靠人手驗證,無自動化 |
| T4 | 後端 jest 執行時報 "A worker process has failed to exit gracefully"(teardown leak,非失敗) |

### 17.5 文件

| # | 落差 |
|---|---|
| E1 | `docs/architecture.md` §3 仍寫「後端待遷入 `apps/api`、缺 module」—— 呢個 scaffold 註記已過時(W01 早已收尾) |
| E2 | `docs/architecture.md` §6 仍寫「下一步候選:(C)/(D),建議先 C」—— C 同 D 早已完成 |
| E3 | `docs/setup.md` 狀態註記停喺 2026-07-09 W01,寫住 `apps/web` = placeholder |
| E4 | DESIGN.md §11 Roadmap 仍把三大 UI 模組列為「🔮 Later」—— 實際已建 |
| E5 | `docs/architecture.md` §9 仍寫「guard 層未建、controllers 現時 unguarded」—— 實際 AUTH-1~4 全鏈已完成 |

> **建議**:E1–E5 皆屬 stale 敘述(規劃當時嘅措辭未隨進度更新),可一次過 doc-sync。內容決策本身冇錯,只係狀態描述落後。
>
> **已於本次查證期間確認同步嘅項目**:`docs/adr/README.md` 對 ADR-0009 嘅狀態已更新為 `Accepted`(commit `81dc99b`),**無落差**。

---

## 18. 待辦與 Roadmap

依「可開工性」分區(對齊 `BACKLOG.md`)。

### 18.1 A 區 — 可立即開工

| ID | 任務 | 前置 |
|---|---|---|
| `AUDIT-2` | 權限矩陣 —— backend derive + drift test ✅ 完成;**餘唯讀 UI(F2)** | 🚧 **進行中 — Phase W28**(見 §18.6) |
| `AUDIT-3` | `AuditLog` 落地 + Audit UI | ADR-0009 已 Accepted → 可開工(預期為 W29)。🔴 白名單欄位必須 test 鎖死(防 `passwordHash` 入 audit) |
| `INTEG-1` | Integration 狀態 + Test connection | 輕度 ADR;🔴 endpoint **絕不可回傳 secret 值**,只回 boolean |
| `FE-activity` | Overview activity feed | 由 `AUDIT-3` 解封 |
| `Assets-cat-group` | By-OpCo 表按 category 分組 | 需 ledger row 帶 category |
| `DEPLOY` | 生產部署 + 真數 curation | owner 決定時機 |

### 18.2 B 區 — 已設計,等 driver

| ID | 任務 |
|---|---|
| `Drift-resolve` | Drift 逐條 resolve + per-OpCo 對回 UI(對回機制已定,UI 未建) |
| `AI-Assist` | AI 抽 free-text remark 成結構化 license 清單 —— **項目「逐步引入 AI」嘅首個落點**;入口 = `Request.rawRequestText` |
| `Assets-compare` | Assets Compare mode |

### 18.3 C 區 — 卡外部

| ID | 阻塞 |
|---|---|
| `AUTH-2b` | IT 未開 SPA app registration(redirect URI + Expose an API scope + audience 對齊)。Runbook 已備,值到約 10 分鐘跑完 |
| `INTEG-2` | 需同 n8n owner 對真合約;另 **觸發 H1** —— 開放外部推 stage = 改寫入來源(stage 掛 line item 係 locked 決策) |
| `AUTH-4c-C` | 需 IT 授 Graph `Mail.Send` 或改 SMTP(新 dep)。**admin-reset 已 cover 忘密碼**,故非必需 |

### 18.4 D 區 — 已實證 defer

| ID | 內容 | 恢復條件 |
|---|---|---|
| `DD-2` | npm dev/build-chain 漏洞(全 dev-only,**唔入 production bundle**);實跑證非-force `npm audit fix` 一個都清唔到 | 等 vite@8 生態 stabilize → 專門升級 phase(H2,需 ADR) |

### 18.5 未來 Tier(需 approval + 平台級 ADR)

其他 IT ops 模組:offboarding / license 回收 · Cost Insights · **D365 業務模組(F&O 工作流)** · 其他 support 工作流。

### 18.6 當前進行中 — Phase W28(權限矩陣)

**狀態**:`in-progress`(kickoff 2026-07-20;Day 1 已完成)· **定位**:audit rollout item 2 · **預期無新 ADR**(ADR-0009 Decision 8.5 已覆蓋)

**核心約束 —— 零行為改動**:唔加唔改任何現有權限,純粹令現有 `@Roles` 變成**可查證**(derived view + drift test)。

| 交付 | 內容 | 狀態 |
|---|---|---|
| F0 | Spike:`Reflect.getMetadata` 攞唔攞到 route path / method / `@Roles` / `@Public` | ✅ 完成 —— **可以攞到全部**,風險 R1 解除,行 runtime derive 無需 fallback |
| F1 | Backend:`DiscoveryService` runtime derive → `GET /admin/permissions` | ✅ **完成** —— live 200,34 route / 10 controller 全覆蓋,**零 unguarded** |
| F2 | Frontend:唯讀矩陣頁 | 🚧 待做 |
| F3 | **Drift test**:glob `*.controller.ts` 自動列舉,code 改咗矩陣冇改 → test 紅 | ✅ **完成** —— `permissions.spec.ts` 10 test + snapshot(api 213 → **223**) |

**F1 五種標示**:`roles` / `public` / `m2m` / `authenticated` / `unguarded`。
`unguarded` = 冇 `@Roles` 且唔喺 `REVIEWED_AUTHENTICATED` 白名單 —— 因為喺全域 guard 之下,「冇 `@Roles`」唔等於無保護,而係「任何已登入用戶可用」;真正風險係「**應該限 role 但漏咗**」。**白名單加一行 = 一個 security decision**。
`POST /requests/intake` 正確報 `m2m` + `guards: ["IntakeKeyGuard"]`,**唔會**誤判成 `public`。

**F3 fails-before 雙實證(G4)**:① `opco.controller` 移走 OPCO_IT → snapshot 紅,diff 精確指出該行;② `MeController` 加一條無 `@Roles` 嘅 route → unguarded test 紅,報出 controller.handler。兩者已還原。
既有 `controllers-guarded.spec.ts` **保留** —— 佢 assert **意圖**(「呢個應該係 ADMIN-only」),新 spec lock **現況**(全部 route 而家係咁),兩者答唔同問題。

**F0 spike 三個子測試結論**

| Spike | 問題 | 結果 |
|---|---|---|
| A | `Reflect.getMetadata` 取得 route metadata? | ✅ 全部取得 |
| B | test 內 `import AppModule` + `DiscoveryService` 列舉? | ❌ 失敗 —— `jwks-rsa` → `jose` 係 ESM,jest 唔 transform `node_modules` |
| C | 改用 glob `*.controller.ts` + `require`? | ✅ 9 檔 / 9 class,零 failure |

**由此得出嘅設計(D1)**:F1 同 F3 用**唔同方式**取得 controller 清單,但**共用同一個 derive 純函數** ——
production build 後 `.controller.ts` 變 `.js`,runtime glob 搵唔到 → F1 必須用 `DiscoveryService`;
jest 內 AppModule 起唔到 → F3 必須用 glob。
**額外好處**:兩條路殊途同歸,runtime 矩陣同 test 矩陣唔一致本身就係 bug signal。

**🔴 W28 揭出嘅一個實例(印證本項目價值)**

2026-07-20 手寫嘅權限矩陣分析文件把 `license.controller.ts` 五個 method-level override 全部寫成「個別 GET」——
**錯**:其中 `updateLedger` 係 **`PATCH ledger/:id`**,唔係 GET。即係 OPCO_IT 可以**寫** ledger(ADR-0007 決定,service 層 `assertOpcoScope` 保護),唔止讀。

> **教訓**:人手抄 `@Roles` 一定會出錯,而**錯咗嘅稽核文件比冇文件更危險**。呢個正正就係 F3 drift test 要解決嘅問題。

**已識別風險 R4**:矩陣答嘅係「邊個 role 掂到邊個 endpoint」,**唔答**「掂到之後見到幾多 row」(OPCO_IT per-OpCo scope 係另一層)。頁面必須明文註記,否則稽核語境會撈亂。

---

## 19. 假設、依賴與外部阻塞

### 19.1 假設

| # | 假設 |
|---|---|
| A1 | **單一 M365 tenant** —— 對帳邏輯建基於此 |
| A2 | M365 tenant `subscribedSkus` 係總量嘅唯一真相 |
| A3 | Graph 唔知 OpCo 劃分 → By-OpCo 帳必須人手維護(方案甲根本前提) |
| A4 | 採購段(quote / approval / vendor)維持人手,平台只追蹤 |
| A5 | 成本 / 發票留喺 DocuWare,平台只記 `quoteRef` / `poRef` |
| A6 | n8n 繼續負責 on-prem 執行(Phase 1);平台唔取代佢 |

### 19.2 外部依賴

| # | 依賴方 | 需要提供 | 現況 |
|---|---|---|---|
| X1 | **公司 IT** | Entra SPA app registration(redirect URI · Expose an API scope · audience) | 🔴 未提供 → 卡真 SSO 驗證 |
| X2 | **公司 IT** | Graph app-only 權限 admin consent(`Organization.Read.All` · `Directory.Read.All` · `User.ReadWrite.All`) | 需確認 |
| X3 | **公司 IT** | Proxy allowlist `*.prisma.sh` | 未做,目前靠 workaround |
| X4 | **ServiceNow owner** | 實際 table / 欄位 / 狀態值 / work note 欄 / cat_item / idempotency 規則 | 🔴 未對齊(checklist 已備待填) |
| X5 | **n8n owner**(Chris 本人) | inbound / outbound webhook 真合約 | 🔴 未對齊 |
| X6 | **OpCo / Regional IT** | 真實 37-SKU × 24-entity allocation 資料 + 業務別名對映 | deploy-time |
| X7 | **Owner** | ADR-0009 之後嘅 audit rollout 優先級 | 已 Accepted,待排期 |

### 19.3 開放問題(影響預設行為)

| # | 問題 | 現時預設 |
|---|---|---|
| OQ1 | 成本可見度 —— 要唔要喺平台至少「睇到」每單花幾多(即使人手填) | 唔記錢(現在補仲來得及) |
| OQ2 | `isBaseLicense` 去留 | 保留(驅動 triage UI 預設,非硬 gate) |
| OQ3 | 對帳「自動協助同步」機制(而非純人手對回) | 人手對回已啟動;自動化 later |
| OQ4 | OpCo self-service 開放時機 | model 已支援,未定 |

---

## 20. 風險登記

| ID | 風險 | 可能性 | 影響 | 緩解 | 狀態 |
|---|---|---|---|---|---|
| **R1** | 公司 proxy 阻擋 `binaries.prisma.sh` → generate / migrate / seed / boot 卡住 | High(已發生) | 🔴 High | 流動網路跑一次 cache engine;長遠靠 IT allowlist。⚠️ clean reinstall 前需再轉流動網路 | 🟡 Mitigating |
| **R2** | `AUTH_DEV_BYPASS=true` 誤帶入 production → 完全繞過權限 | Low | 🔴 High | 預設 false · 開啟打 warning · 生產路徑 `getOrThrow` fail-fast · 部署確認 `.env` 無此 flag | 🟢 Mitigated |
| **R3** | n8n on-prem AD → Entra Connect sync 延遲:push 帶 `azureSyncedAt` 但 `findUser` 仲搵唔到 → assign fail | Med(on-prem 常態) | 🟡 Lower | assign 以 `findUser` 真命中為 gate,唔純信 timestamp;未命中 retry / 留 queue | ⚠️ Open(待 retry 實作) |

### 20.1 本文件識別嘅補充風險(建議納入登記)

| ID | 風險 | 影響 | 建議緩解 |
|---|---|---|---|
| R4(新) | **無 audit trail** —— 用戶 / 角色 / 密碼 / OpCo / catalog / import 操作全部零留痕 | 🔴 稽核失敗 | `AUDIT-3` 落地(ADR-0009 已 Accepted) |
| R5(新) | **無 e2e / 整合測試** —— 跨系統迴歸靠人手 | 🟠 迴歸風險隨功能增長 | 補 API e2e smoke |
| R6(新) | **Outbound 建單無交付保證** —— 失敗即失敗,無 retry、無失敗記錄 | 🟠 request 可能靜靜漏咗 | `INTEG-3`(先做失敗記錄 + 人手 retry 掣) |
| R7(新) | **無 health endpoint / 無監控** | 🟠 故障察覺延遲 | 部署前補 |

---

## 21. 責任分工

| 角色 | 職責 | 現時擔任 |
|---|---|---|
| **架構決策 owner** | 四層地基 / module 邊界 / vendor / storage layout / locked 決策嘅唯一拍板人 | **Chris Lai** |
| **Scope / business owner** | in / out of scope · tier 邊界 · 優先級 | **Chris Lai** |
| **實作** | 依 spec 實作;觸發 hard constraint 即 STOP + ask | AI coding agent(Claude Code)+ Chris |
| **驗證** | live 端到端驗證(curl / browser);**可驗證嘅優先由 owner 親跑** | Chris Lai |
| **ServiceNow 合約** | table / 欄位 / 狀態值定義 | ServiceNow owner(外部) |
| **n8n 合約** | webhook URL / payload / auth | Chris Lai(n8n owner) |
| **Entra app registration** | SPA app reg + Graph 權限 consent | 公司 IT(外部) |
| **真數 curation** | 37-SKU × 24-entity allocation + 業務別名 | Regional IT |

---

## 22. 治理與變更控制

### 22.1 Strict Mode Hard Constraints

項目採 **Strict Mode** —— 以下八條 violate 即視為 broken。觸發時必須 **STOP and ask**,唔可以單方面推進。

| ID | 約束 | 觸發即需 |
|---|---|---|
| **H1** | **架構變更** — 改四層地基 / module 邊界 / vendor / storage layout / Prisma schema / 已 lock 決策(對帳方案甲 · `skuId` 主鍵 · ledger 兩層數字 · stage 掛 line item · `azureSyncedAt` sync gate) | STOP → 說明 → approval → **寫 ADR** |
| **H2** | **Vendor / Dependency** — 加新 runtime dependency 或換 vendor | STOP → approval → ADR。例外:pure utility / type stub / dev dependency |
| **H3** | **Scope / Tier** — 加超出當前 scope 嘅 feature | STOP → 說明屬邊個未來 tier → approval。**模糊 → 預設 out-of-scope** |
| **H4** | **Security / Privacy** — 絕不 log / commit secret;絕不 hardcode tenant / client id / secret;PII 謹慎 | 高度小心;唔確定即 STOP |
| **H5** | **Test Coverage** — critical path 寫 code 必須同步寫 test | 冇對應 test = 任務未完 |
| **H6** | **Design Fidelity**(前端)— token-only · 一 view 一 primary action · lucide stroke icon · light + dark 都要 | 偏離設計 → STOP → 確認 |
| **H7** | **Tool Result Integrity** — 絕不生成扮 tool 輸出嘅文字;結果類陳述必須 trace 到真實輸出 | 違反 = 破壞信任,比功能 bug 更嚴重(見 INC-001) |
| **H8** | **Tool Usage Discipline** — 讀檔 / 搜尋用專用工具,唔用 shell `cat`/`grep`;唔用 `echo` 拼裝輸出 | 零容忍 |

### 22.2 ADR 流程

`Proposed`(起草)→ `Accepted`(owner 拍板)→ `Superseded by ADR-MMMM`

- 一旦 `Accepted` **唔改內容**;要推翻 → 寫新 ADR,舊嗰個 status 改埋
- 檔位 `docs/adr/NNNN-short-title.md`;每寫一份必須喺 `docs/adr/README.md` index 加一行
- 格式:`Context → Decision → Alternatives Considered → Consequences → References`

### 22.3 工作流程

| 工作類型 | 流程 |
|---|---|
| Multi-day phase | `docs/01-planning/W{NN}-{name}/` — `plan.md`(locked 後改要 changelog)+ `checklist.md`+ `progress.md` |
| Change(< 3 日) | `docs/03-implementation/changes/CH-{NNN}-{kebab}/` |
| Bug fix | `docs/03-implementation/bugs/BUG-{NNN}-{kebab}/` |

**Binding rules**:R1 multi-day 前必有 approved pre-doc · R2 daily commit 對應 progress entry · R3 deviation 必 log changelog(**唔可以 silent drift**)· R4 open question resolved 即同步文件 · R5 架構級決定必寫 ADR · R7 pending 變動必反映 `BACKLOG.md`

### 22.4 Git 規範

- Branch:`main`(protected)· `feat/` · `fix/` · `chore/` · `docs/` · `adr/`
- Commit:Conventional Commits `<type>(<scope>): <description>`
- PR:one feature per PR;pre-merge — tests pass · coverage 不降 · no linter warning · ADR updated
- **絕不 touch**:`.git/` · `.env*` · 任何含 credential 嘅檔 · `design_handoff_licenseops/`(read-only)· spec 嘅 content-locked section

---

# 附錄

## 附錄 A — ADR 索引

| ADR | 標題 | 狀態 | 日期 |
|---|---|---|---|
| 0001 | 前端納入本 repo,採 monorepo(`apps/api` + `apps/web`) | Accepted | 2026-07-09 |
| 0002 | 後端 Entra ID JWT 驗證策略(`jwks-rsa` + `jsonwebtoken` · 全域 guard · dev-bypass) | Accepted | 2026-07-10 |
| 0003 | 前端 Entra ID SSO 策略(MSAL · auth code PKCE · redirect) | Accepted | 2026-07-10 |
| 0004 | Allocation import 機制(admin CSV + dry-run + `businessAlias` 對映 + curation-as-scope) | Accepted | 2026-07-13 |
| 0005 | 本地密碼認證,與 Entra SSO 並存(dual-provider · argon2 · dual-issuer guard) | Accepted | 2026-07-13 |
| 0006 | 密碼生命週期 + session hardening(policy · force-change · lockout · refresh + httpOnly cookie) | Accepted | 2026-07-13 |
| 0007 | OpCo ledger 手動管理(逐格校正 · `LedgerAdjustment` audit · 對回機制啟動) | Accepted | 2026-07-14 |
| 0008 | 獨立 request 建單 + n8n 雙向整合 + D365 完整納入 scope | Accepted | 2026-07-15 |
| 0009 | 平台 audit trail(通用 `AuditLog` 共存 · 白名單 before/after · 權限矩陣 code-derive) | **Accepted** | 2026-07-20 |

> ⚠️ 見 §17.5 E1 —— `docs/adr/README.md` index 對 0009 嘅狀態未同步。

## 附錄 B — 術語表

| 詞 | 意思 |
|---|---|
| **OpCo** | Operating Company —— 集團旗下營運公司(現時 23 個 seed) |
| **SKU** | M365 / D365 授權產品;主鍵 = `skuId` GUID |
| **Ledger** | 平台維護嘅 per-OpCo 授權帳(allocated / assigned 兩個數字) |
| **Drift** | `Σ assignedQuantity` 同 tenant `consumedUnits` 對唔上 |
| **對帳方案甲** | 只喺每個 SKU 嘅**總量層**偵測差異;差異落邊個 OpCo 靠人手對回 |
| **Sync gate** | 指派前必須確認用戶已 sync 落 Entra(`azureSyncedAt` + `findUser` 真命中) |
| **RITM / REQ** | ServiceNow `sc_req_item`(項目)/ `sc_request`(母單) |
| **Line item** | 一張 request 內嘅單一 SKU 需求;**stage 掛喺呢層** |
| **Curation** | 由真 tenant SKU 反向對業務名,決定平台管理範圍 |
| **System of Record / Action** | 記錄系統(ServiceNow)/ 行動系統(本平台) |
| **Honest gap** | 刻意記錄嘅「未做 / 假數 / placeholder」,唔造假象 |

## 附錄 C — 文件地圖

| 想知 | 讀邊份 |
|---|---|
| 有咩 pending / 揀下一個 task | `docs/01-planning/BACKLOG.md` |
| 平台級架構 / 定位 / 四層地基 / locked stack | `docs/architecture.md` |
| LicenseOps 業務決策(SSOT) | `docs/02-architecture/licenseops/DESIGN.md` |
| Domain model 真相 | `apps/api/prisma/schema.prisma` |
| 設計系統(SSOT)/ 視覺真相 | `docs/02-architecture/design-system.md` / `design_handoff_licenseops/` |
| Phase / change / bug 流程 | `docs/01-planning/PROCESS.md` |
| 架構決定記錄 | `docs/adr/` |
| 風險 | `docs/01-planning/RISK_REGISTER.md` |
| 反覆「暫時唔做」 | `docs/01-planning/DEFERRED_REGISTER.md` |
| 本地開發 setup | `docs/setup.md` |
| Graph / ServiceNow 設定 | `docs/05-usage/INTEGRATION_SETUP.md` |
| ServiceNow 合約對齊 | `docs/05-usage/SERVICENOW-CONTRACT-ALIGNMENT.md` |
| AI agent standing instructions | `CLAUDE.md` |
| **架構圖生成 brief** | `docs/02-architecture/DIAGRAM-BRIEF.md` |

## 附錄 D — 查證方法

本文件所有「已實作」陳述嘅查證方式:

| 陳述類型 | 查證方式 |
|---|---|
| Endpoint 清單 / 角色 | 逐個 controller 檔案讀取,確認 `@Controller` / `@Roles` / `@Public` decorator |
| Model / enum 數目與欄位 | `schema.prisma` 直接讀取 + regex 掃 `^(model\|enum)` |
| 後端測試數 | **實際執行** `npx jest`,取 summary 輸出(`30 passed / 223 passed / 1 snapshot`,89.7 秒) |
| 前端測試數 | 逐個 `*.test.ts(x)` 檔案盤點 |
| 排程 / queue | 全 repo grep `@Cron` · `@Interval` · `@Timeout` · `BullModule` · `@Processor` · `bullmq` —— **結果為零** |
| Route / 畫面 | `router.tsx` + 各 page 檔案讀取 |
| Dependencies | `package.json` 直接讀取 |
| 部署設定 | `docker-compose.yml` + `.env.example` 直接讀取 |
| 階段歷程 | `BACKLOG.md` + phase folder + `git log` |

**未經查證嘅事項一律標明** —— 見 §17 落差登記。

---

**文件結束** · UOP-SPEC-001 v1.0 · 2026-07-20 · Chris Lai
