# Unified Operation Platform — 系統架構圖 Brief(Claude Design 輸入用)

> **用途**:呢份文件係**餵去 Claude Design(或任何 diagram 工具)嘅結構化輸入**,唔係人睇嘅設計文件。
> 每張圖獨立成節,含:目的 / 受眾 / 畫布 / 節點(**精確 label 文字**)/ 連線(含 label 同方向)/ 分組 / 圖例 / 視覺規範 / 禁止事項。
>
> **內容真相來源**:`docs/architecture.md` · `docs/02-architecture/licenseops/DESIGN.md` · `prisma/schema.prisma` · `apps/api/src/` · `apps/web/src/` · `docker-compose.yml` · `docs/adr/`。
> **版本**:1.0 · **日期**:2026-07-20 · **Owner**:Chris Lai

---

## 0. 全域視覺規範(四張圖共用)

呢節適用於下面每一張圖,唔好逐張重複問。

| 項目 | 規範 |
|---|---|
| **語言** | 圖上文字用**英文**(對齊 code identifier 同 UI 實際字眼);中文只出現喺 caption / 說明欄 |
| **主色(accent)** | **Ricoh red `#E60027`** —— 全圖**只有一個** accent 用途:標示「本平台自身」嘅邊界或核心元件。唔好用嚟裝飾 |
| **中性色** | 灰階(`#111827` 文字 / `#6B7280` 次要文字 / `#E5E7EB` 邊框 / `#F9FAFB` 底色) |
| **外部系統色** | 統一用中性藍灰 `#64748B` 系,**唔好**每個外部系統一隻色(避免彩虹圖) |
| **狀態語意色** | 只喺明確需要時用:成功 `#16A34A` · 警示 `#D97706` · 錯誤 `#DC2626` |
| **字型** | 無襯線(Geist / Inter / Helvetica 皆可);**識別碼、數字、endpoint 路徑一律等寬字(mono)** |
| **線條** | 實線 = 同步呼叫 / 主資料流;虛線 = 非同步 / 排程 / 未實作(planned);箭嘴指資料流向 |
| **主題** | 淺色底為主。若出雙版本,深色版只換底 / 文字,**accent 同結構唔變** |
| **禁止** | ❌ 漸層(除非明確要求)· ❌ 立體陰影 / 3D · ❌ 剪貼畫式 icon · ❌ 超過一隻 accent 色 · ❌ 交叉線纏繞(寧可加轉折點) |
| **標註慣例** | 未實作 / 未啟用元件一律加 `(planned)` 後綴 + 虛線邊框 + 50% 透明度。**唔可以**畫到好似已經有 |

---

## 1. 圖一 — 系統全景圖(四層地基 + 外部系統)

### 1.1 目的與受眾
- **目的**:一眼睇明「本平台係咩、邊度係佢嘅邊界、佢同外部系統點分工」。
- **受眾**:IT 管理層 + 新加入嘅工程師。呢張係整份 spec 嘅封面圖。
- **一句話訊息**:**ServiceNow 係 System of Record(誰申請、誰批、記錄);本平台係 System of Action(事情實際點被做完)。**

### 1.2 畫布
- 橫向(landscape),16:9 或 4:3。
- 版面:**上下分層**(四層地基由上而下)+ **左右分邊**(外部系統喺兩側)。

### 1.3 分組與節點

**中央容器(用 Ricoh red `#E60027` 邊框圈起,標題列)**
> 容器標題:`Unified Operation Platform` · 副題:`System of Action`

容器內由**上至下**四層,每層一條橫帶,層標題喺左邊:

**Layer 4 — `API + UI Layer`**
| 節點 label | 備註標籤 |
|---|---|
| `apps/web` — React SPA | `React 18 · Vite · TypeScript · Tailwind` |
| `REST API + OpenAPI` | `NestJS Swagger · /docs/api` |

> 層旁註記(細字):`OpenAPI contract = 未來 n8n / AI 嘅受控接入點`

**Layer 3 — `Orchestration / Action Layer`**
| 節點 label | 備註標籤 |
|---|---|
| `Manual triggers` | `POST /license/catalog/sync` · `POST /license/reconcile` ← **實線,呢個係現時唯一真實嘅 orchestration** |
| `Scheduled jobs` | **`(planned)`** — `ScheduleModule` 已註冊但**零個 @Cron** ← 虛線 + 半透明 |
| `Redis + BullMQ` | **`(planned)`** — Redis container 已起,BullMQ **未入 package.json** ← 虛線 + 半透明 |

> ⚠️ **唔可以**把呢層畫到好似已經自動化。實情:對帳同 catalog 同步**淨係人手 POST 觸發**。

**Layer 2 — `Integration Layer`**
| 節點 label | 備註標籤 |
|---|---|
| `GraphService` | `Microsoft Graph client` |
| `ServiceNowService` | `Table API client` |
| `RequestSubmissionProvider` | `direct \| n8n(env-selected)` |

> 層旁註記(細字):`唯一對外邊界 —— domain 層唔可以直接 import vendor SDK`

**Layer 1 — `State Layer`**
| 節點 label | 備註標籤 |
|---|---|
| `PostgreSQL` | `Prisma ORM · domain model 真相` |

> 層旁註記(細字):`entitlement / allocation ledger · request mirror · audit`

**左側外部行動者(中性色,容器外)**
| 節點 label | 副題 |
|---|---|
| `Regional IT` | `ADMIN / REGIONAL` |
| `OpCo IT` | `OPCO_IT — 只見自己 OpCo` |

**右側外部系統(中性藍灰,容器外)**
| 節點 label | 副題 |
|---|---|
| `Microsoft Entra ID` | `SSO · app roles` |
| `Microsoft 365 / D365 tenant` | `subscribedSkus · assignLicense` |
| `ServiceNow` | `System of Record — sc_request / sc_req_item` |
| `n8n` | `on-prem 執行引擎(Phase 1)` |

**右下角獨立節點(灰、虛線、明確標 out of scope)**
| 節點 label | 副題 |
|---|---|
| `DocuWare` | `(out of scope)成本 / 發票` |

### 1.4 連線(方向 + label)

| 從 | 到 | 線型 | Label |
|---|---|---|---|
| `Regional IT` / `OpCo IT` | `apps/web` | 實線 | `HTTPS · Entra SSO 或本地密碼登入` |
| `apps/web` | `REST API + OpenAPI` | 實線 | `TanStack Query · httpOnly cookie / Bearer` |
| `Microsoft Entra ID` | `REST API + OpenAPI` | 實線(右→左) | `JWT 驗證(JWKS)` |
| `GraphService` | `Microsoft 365 / D365 tenant` | 雙向實線 | `讀 subscribedSkus · 寫 assignLicense` |
| `ServiceNowService` | `ServiceNow` | 雙向實線 | `讀 request · 回寫狀態 / work note · 建單` |
| `n8n` | `REST API + OpenAPI` | 實線(右→左) | `inbound intake: POST /requests/intake(X-Intake-Key)` |
| `RequestSubmissionProvider` | `n8n` | 虛線 | `outbound webhook(env 選路)` |
| Layer 之間 | 相鄰層 | 幼實線垂直箭嘴 | 無 label(表示層級依賴由上而下) |

### 1.5 圖例(必須畫出)
- Ricoh red 邊框 = 平台邊界
- 實線 = 同步呼叫
- 虛線 + 半透明 = planned / 未啟用
- 灰虛線框 = out of scope

### 1.6 額外註記(放圖底部,細字)
> `Monorepo:apps/api(NestJS modular monolith)+ apps/web(React SPA)—— ADR-0001`

---

## 2. 圖二 — Request 生命週期端到端資料流圖

### 2.1 目的與受眾
- **目的**:講清楚一張 license request 由邊度入、經過咩關卡、點樣完成、邊啲步驟係人手。
- **受眾**:工程師 + 業務 stakeholder。
- **一句話訊息**:**兩個入口、兩條路徑、一個硬 gate(Azure sync)、一個自動 side-effect(ledger +1 + 回寫 SN)。**

### 2.2 畫布
- 橫向,**由左至右**時間流。
- **用泳道(swimlane)**,由上至下四條:

| 泳道 | Label |
|---|---|
| 1 | `External systems`(n8n · ServiceNow · Microsoft Graph) |
| 2 | `Platform — API`(NestJS endpoints) |
| 3 | `Platform — Data`(Prisma / PostgreSQL) |
| 4 | `Human`(Regional IT 人手操作) |

### 2.3 流程節點(由左至右)

**A 段:入口(兩個,並列)**

| # | 泳道 | 節點 label | 形狀 |
|---|---|---|---|
| A1 | External | `n8n onboarding workflow` | 圓角矩形 |
| A2 | API | `POST /requests/intake` — `IntakeKeyGuard`(m2m,fail-closed) | 矩形 |
| A3 | Human | `IT 喺平台開單` — `/requests/new` | 圓角矩形 |
| A4 | API | `POST /requests` → `RequestSubmissionProvider` | 矩形 |
| A5 | External | `ServiceNow` — 建 `sc_request` + `sc_req_item` | 圓角矩形 |

> A1→A2 label:`inbound push(非阻塞)`;A2 標註 `origin = n8n-intake`
> A3→A4→A5 label:`outbound(SN-first,fail-closed)`;A4 標註 `origin = platform-created`
> A4 旁加分支註記:`provider = direct(預設)或 n8n webhook —— 由 env REQUEST_SUBMISSION_PROVIDER 選路`

**B 段:落地**

| # | 泳道 | 節點 label |
|---|---|---|
| B1 | Data | `Request` + `RequestLineItem`(two-level mirror) |
| B2 | Data | `RequestEvent` — 建立事件 |

> 註記:`status = OPEN · stage = REQUESTED · handledById = null(入 Regional queue,唔自動觸發)`

**C 段:分流(菱形判斷)**

| # | 泳道 | 節點 label | 形狀 |
|---|---|---|---|
| C1 | Human | `Triage — 有冇 budget / spare?` | **菱形** |

兩條出線:
- **上路(短路)** label `有 spare` → 直去 D 段
- **下路(procurement)** label `需加購` → 經 C2→C3→C4

| # | 泳道 | 節點 label | 備註 |
|---|---|---|---|
| C2 | Human | `QUOTING` | 人手推進 |
| C3 | Human | `OPCO_APPROVED` | 人手推進 |
| C4 | Human | `AWAITING_VENDOR` | 人手推進;只記 `quoteRef` / `poRef`,**唔記金額** |

> C2–C4 用同一個淺色「人手推進」背景帶圈住,加標籤 `人手推進 —— 平台只做 stage 追蹤`
> 旁加灰虛線出線去 `DocuWare (out of scope)`,label `成本 / 發票`

**D 段:履行前 gate(🔴 重點,要視覺突出)**

| # | 泳道 | 節點 label | 形狀 |
|---|---|---|---|
| D1 | Data | `READY` | 矩形 |
| D2 | API | **`Sync gate`** — `Request.azureSyncedAt` 有值? | **菱形,紅框強調** |
| D3 | External | `Microsoft Graph — findUser(upn)` | 圓角矩形 |

- D2 「否」出線 → 回 `等待 sync`(迴圈箭嘴回 D1),label `唔 assign`
- D2 「是」→ D3
- D3 回 `null` → 同樣唔 assign,label `Phase 1 sync gate 未過`
- **旁加紅色註記框**:`⚠️ 時序真相:n8n 建 on-prem AD → Azure AD Connect sync 落 Entra 有延遲。指派前以 findUser 真命中為準,唔淨係信 azureSyncedAt(RISK R3)`

**E 段:履行(自動 side-effect)**

| # | 泳道 | 節點 label |
|---|---|---|
| E1 | External | `Graph — setUsageLocation()` |
| E2 | External | `Graph — assignLicense()` |
| E3 | Data | `OpcoSkuLedger.assignedQuantity += 1` |
| E4 | External | `ServiceNow — 回寫狀態 / work note` |
| E5 | Data | `stage = ASSIGNED` + `RequestEvent` |

> E1 旁註記:`指派前 user 必須有 usageLocation;無空 seat 會失敗`
> E1→E5 用同一個底色帶圈住,標籤 **`自動執行(單一動作觸發)`**

**F 段:平行的對帳迴路(畫喺主流程下方,虛線框)**

| # | 泳道 | 節點 label |
|---|---|---|
| F1 | Human | `POST /license/reconcile`(**人手觸發 —— 現時無排程**) |
| F2 | External | `Graph — getSubscribedSkus()` |
| F3 | API | 比對 `Σ assignedQuantity(所有 OpCo)` vs `tenant consumedUnits` |
| F4 | Data | `DriftAlert` |
| F5 | Human | 手動對回 — `PATCH /license/ledger/:id` + `LedgerAdjustment` audit |

> 框標籤:`對帳迴路(方案甲)—— 只喺每個 SKU 嘅總量層偵測`
> F3→F4 label:`對唔上`

### 2.4 圖例
- 菱形 = 判斷 / gate
- 紅框菱形 = 硬 gate(唔過就唔執行)
- 底色帶 = 自動執行段 vs 人手推進段
- 虛線框 = 平行 / 排程迴路

---

## 3. 圖三 — Domain Model / ERD

> 真相來源:`apps/api/prisma/schema.prisma`(2026-07-20 查證)。**11 個 model · 5 個 enum**。

### 3.1 目的與受眾
- **目的**:資料模型真相,畀工程師同 DBA 睇。
- **受眾**:工程師。
- **一句話訊息**:**stage 掛喺 line item 唔係 request;ledger 兩個數字分開;SKU 主鍵一律 `skuId` GUID。**

### 3.2 畫布
- 直向或橫向皆可,**用分組(cluster)**,唔好一堆表散開。

### 3.3 分組(cluster)

| Cluster | 顏色 | Models(共 11) |
|---|---|---|
| `Identity & Tenancy` | 中性灰 | `AppUser` · `RefreshToken` · `Opco` |
| `License State` | Ricoh red 淺底(核心) | `SkuCatalog` · `OpcoSkuLedger` · `LedgerAdjustment` · `TenantSkuSnapshot` · `DriftAlert` |
| `Request Fulfilment` | 中性藍灰淺底 | `Request` · `RequestLineItem` · `RequestEvent` |

> ⚠️ **`AuditLog` 唔好畫入主 ERD** —— ADR-0009 已 Accepted 但**未落地**(schema 內冇呢個 model)。
> 若要表達,只可以畫喺右下角一個**獨立虛線框**,標題 `AuditLog (ADR-0009 — accepted, not yet implemented)`,半透明,**唔連任何關聯線**。

### 3.4 各 model 主要欄位(照畫,唔使加減)

| Model | 必畫欄位 |
|---|---|
| `AppUser` | 🔑`id` · `entraOid?` U · `email` U · `displayName` · `passwordHash?` · `authProvider` · `role` **Role** · `opcoScopeId?` FK · `mustChangePassword` · `failedLoginCount` · `lockedUntil?` · `active` |
| `RefreshToken` | 🔑`id` · `userId` FK · `tokenHash` U · `expiresAt` · `revokedAt?` |
| `Opco` | 🔑`id` · `code` U · `displayName` · `company` · `costCenter?` · `active` |
| `SkuCatalog` | 🔑`id` · `skuId` U · `skuPartNumber` · `displayName` · `businessAlias?` · `category?` · `isBaseLicense` · `active` · `lastSyncedAt?` |
| `OpcoSkuLedger` | 🔑`id` · `opcoId` FK · `skuCatalogId` FK · **`allocatedQuantity`** · **`assignedQuantity`** · `updatedAt` · `@@unique([opcoId, skuCatalogId])` |
| `LedgerAdjustment` | 🔑`id` · `ledgerId` FK · `field` · `beforeValue` · `afterValue` · `reason?` · `actorId?` FK |
| `TenantSkuSnapshot` | 🔑`id` · `skuCatalogId` FK · `prepaidEnabled` · `consumedUnits` · `capturedAt` |
| `DriftAlert` | 🔑`id` · `skuCatalogId` FK · `ledgerAssignedSum` · `tenantConsumed` · `delta` · `status` **DriftStatus** · `detectedAt` · `resolvedAt?` |
| `Request` | 🔑`id` · `serviceNowSysId?` U · `serviceNowNumber?` · `origin` · `rawRequestText?` · `targetUpn` · `opcoId` FK · `status` **RequestStatus** · `handledById?` FK · `accountCreatedAt?` · **`azureSyncedAt?`** |
| `RequestLineItem` | 🔑`id` · `requestId` FK · `skuCatalogId` FK · `quantity` · `procurementRequired` · **`stage`** **LineItemStage** · `serviceNowSysId?` · `quoteRef?` · `poRef?` · 各 stage 時戳 |
| `RequestEvent` | 🔑`id` · `requestId` FK · `lineItemId?` FK · `type` **EventType** · `fromStage?` · `toStage?` · `actorId?` FK |

### 3.5 繪製規範
- 每個 entity 畫成表格:**表名(粗體)+ 上表欄位**。
- 關聯用 crow's foot,標明 `1..N` / `0..1`。
- **FK 欄位加 `FK` 標記**;PK 加 🔑;`@unique` 加 `U`;**粗體欄位** = 決策關鍵,要視覺加重。
- Cascade 刪除關係(`RefreshToken→AppUser`、`LedgerAdjustment→OpcoSkuLedger`、`RequestLineItem→Request`、`RequestEvent→Request`)喺線上加細字 `cascade`。

### 3.6 必須突出標註嘅四個決策(用紅色註記氣泡指住對應欄位)

1. 指住 `RequestLineItem.stage` → `stage 掛喺 line item,唔係 Request。一張單裡唔同 SKU 可以喺唔同 stage;Request.status 係聚合`
2. 指住 `OpcoSkuLedger` 嘅兩個數量欄 → `allocatedQuantity = OpCo budget(唔參與對帳)· assignedQuantity = 已指派 baseline(只有呢個對帳)`
3. 指住 `SkuCatalog.skuId` → `唯一主鍵 = skuId GUID。businessAlias 只係 Excel 舊名對照,唔可以當 key`
4. 指住 `Request.azureSyncedAt` → `Phase 1 sync gate —— assign 前檢查`

### 3.7 額外標註
- `LedgerAdjustment` 旁註:`ADR-0007 —— 逐格人手改 ledger 必記 who / when / field / before→after / reason`
- `RequestEvent` 旁註:`平台自己嘅 operational 歷史,唔同於 ServiceNow 嘅 ITSM audit`
- `TenantSkuSnapshot` 旁註:`Graph subscribedSkus 嘅時間序快照 —— tenant 總量真相`

### 3.8 Enum 清單(畫喺角落一個獨立方框)

標題 `Enums`,以 code block 樣式列出,**照抄**:

```
Role            ADMIN · REGIONAL · OPCO_IT
DriftStatus     OPEN · RESOLVED
RequestStatus   OPEN · IN_PROGRESS · COMPLETED · CANCELLED
LineItemStage   REQUESTED · QUOTING · OPCO_APPROVED · AWAITING_VENDOR · READY · ASSIGNED · CANCELLED
EventType       STAGE_CHANGE · ASSIGN · SYNC · RECONCILE · NOTE
```

### 3.9 禁止
- ❌ 唔好畫 join table 嘅每一個欄位
- ❌ 唔好把 ServiceNow / Graph 畫成 entity(佢哋係外部系統,唔喺 ERD)
- ❌ 唔好畫 `AuditLog` 落主圖(見 §3.3 註)

---

## 4. 圖四 — 部署 / 元件拓撲圖

### 4.1 目的與受眾
- **目的**:講清楚實際跑起上嚟有咩 process、點連、邊度係網路邊界、secret 點入。
- **受眾**:負責部署嘅工程師 / IT infra。
- **一句話訊息**:**Docker Compose 自架三個 container,對外只經 HTTPS 同兩條 outbound 整合線。**

### 4.2 畫布
- 橫向。**用三個同心 / 並列嘅邊界框**表示網路信任邊界。

### 4.3 邊界與節點

**邊界 1 — `Client`(最左,無框或幼灰框)**
- `Browser — React SPA`(副題 `apps/web build → static assets`)

**邊界 2 — `Self-hosted host(Docker Compose)`(中央,Ricoh red 實線框)**

| 節點 label | 副題 / 標籤 |
|---|---|
| `apps/api` — NestJS | `Node 20+ · PORT 3100(本機;預設 3000)` |
| `uop-postgres` | `postgres:16-alpine · host 5433 → container 5432 · volume: pgdata` |
| `uop-redis` | `redis:7-alpine · 6379` + **`(provisioned,BullMQ 未啟用)`** ← 半透明 |

> 框內註記:`docker-compose.yml —— healthcheck:pg_isready / redis-cli ping`

**邊界 3 — `External(internet / corporate)`(最右,中性藍灰虛線框)**

| 節點 label |
|---|
| `Microsoft Entra ID`(`login.microsoftonline.com`) |
| `Microsoft Graph`(`graph.microsoft.com`) |
| `ServiceNow instance`(Table API) |
| `n8n`(on-prem webhook) |

### 4.4 連線

| 從 | 到 | 線型 | Label |
|---|---|---|---|
| `Browser` | `apps/api` | 實線 | `HTTPS · httpOnly SameSite=Strict cookie(本地 session)或 Bearer(Entra)` |
| `Browser` | `Microsoft Entra ID` | 實線 | `MSAL auth code + PKCE(redirect)` |
| `apps/api` | `uop-postgres` | 實線 | `Prisma · DATABASE_URL` |
| `apps/api` | `uop-redis` | 虛線 | `(planned)BullMQ` |
| `apps/api` | `Microsoft Entra ID` | 實線 | `JWKS 取公鑰驗 JWT` |
| `apps/api` | `Microsoft Graph` | 實線 | `app-only client credentials` |
| `apps/api` | `ServiceNow instance` | 實線 | `Table API basic auth` |
| `apps/api` | `n8n` | 虛線 | `outbound webhook(X-N8n-Key,env 選路)` |
| `n8n` | `apps/api` | 實線 | `POST /requests/intake(X-Intake-Key)` |

### 4.5 側欄:設定與 secret(畫成一個獨立清單框,**唔好**連線)

框標題:`Configuration(env — 絕不入 git)`

分四組列出**變數名稱**(⚠️ 只列名,唔可以出現任何值 / 範例值):

- **Graph**:`GRAPH_TENANT_ID` · `GRAPH_CLIENT_ID` · `GRAPH_CLIENT_SECRET`
- **ServiceNow**:`SERVICENOW_INSTANCE_URL` · `SERVICENOW_USER` · `SERVICENOW_PASSWORD` · `SERVICENOW_DEFAULT_TABLE`
- **Database**:`DATABASE_URL`
- **Integration m2m**:`INTAKE_API_KEY` · `REQUEST_SUBMISSION_PROVIDER` · `N8N_OUTBOUND_WEBHOOK_URL` · `N8N_OUTBOUND_WEBHOOK_KEY`
- **Auth**:`AUTH_JWT_SECRET` · `LOCAL_ADMIN_INITIAL_PASSWORD` · `AUTH_DEV_BYPASS` · `AUTH_DEV_USER_EMAIL`

> 框底紅字註記:`⚠️ AUTH_DEV_BYPASS 誤帶入 production = 完全繞過權限驗證(RISK R2)。生產 .env 必須無此 flag`

### 4.6 已知環境約束(畫喺圖底,細字 note 列表)
- `binaries.prisma.sh` 被公司 proxy 封 → Prisma engine 需先 cache(RISK R1)
- 本機 port 3000 / 5432 已被佔用 → 改用 3100 / 5433
- Entra app registration(SPA)未開 → 真 SSO 端到端未驗(blocker)

### 4.7 禁止
- ❌ 唔好畫 load balancer / Kubernetes / 多副本 —— **現時無**
- ❌ 唔好畫 CI/CD pipeline —— **現時無**
- ❌ 唔好把 secret 值畫出嚟,連 placeholder 都唔好

---

## 5. 交付格式建議

| 圖 | 建議格式 | 用途 |
|---|---|---|
| 圖一 全景 | SVG + PNG(1920px) | spec 封面 · 簡報首頁 |
| 圖二 資料流 | SVG(可放大) | spec 內文 · 工程 onboarding |
| 圖三 ERD | SVG | 工程參考 |
| 圖四 部署 | SVG + PNG | 部署交接 |

**四張圖必須睇落一套** —— 同一字型、同一 accent、同一線條語彙、同一圖例慣例。

---

**End of Diagram Brief**
