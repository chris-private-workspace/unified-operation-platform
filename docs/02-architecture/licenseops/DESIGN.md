# Phase 2 — Unified Operation Platform · 設計與決策紀錄

> 這份文件是 Phase 2 到目前為止**所有設計決策的 single source of truth**。
> 配合 repo 內的 `prisma/schema.prisma`(domain model)與 `src/integration/`
> (integration layer)一起看。凡是我們在討論中拍板過的東西,這裡都有。
>
> 討論過程中畫過 5 張圖(目標流程、平台模組圖、ServiceNow 定位、技術棧架構、
> ERD),它們的內容都已用文字捕捉在下面對應章節,這份文件本身是自足的。

---

## 1. 定位 (Positioning) — 最重要,先守住這條

| | 角色 | 擁有 |
| --- | --- | --- |
| **ServiceNow** | System of Record | request intake、approval、SLA、audit trail —「誰申請、誰批、記錄」 |
| **本平台** | System of Action | live state、orchestration、實際執行、人手介入 —「事情實際怎樣被做完」 |

- 兩者 **sync,不複製**。平台**消費** ServiceNow 的 request(API 拿進來當作業對象),執行完**回寫**狀態。
- **Regional IT = reflector + executor,不是 owner**;license 數量的管理責任屬 OpCo(將來 self-service 交回)。
- 平台的獨特身份「live state + action layer」**同時就是引入 n8n / AI 的基礎**——AI 需要 (1) 可讀的即時狀態去 observe、(2) 受控的 action API 去 act,而 ServiceNow 的 ticket 層給不了這兩樣。所以「跟 ServiceNow 不同」和「作為 AI 基礎」是同一個屬性。

**守邊界 rule of thumb**:是「requesting / approving / recording」→ 留 ServiceNow;是「executing / monitoring / orchestrating live」→ 才進平台。

**刻意不建(建了就掉進 ServiceNow 重疊陷阱)**:ticket 申請表單、審批鏈、SLA 管理、service catalog、把 CMDB 當 source of truth。

---

## 2. Scope(本版)

**In scope**
- onboarding 當下的 M365 加 license 需求
- **獨立(非 onboarding)license request 建單** — IT 同事代開 → create ServiceNow `sc_request`/`sc_req_item`(thin action,不建 form/catalog/審批;ADR-0008)
- **M365 + D365** license — D365 = Entra `subscribedSku`,同一 Graph `assignLicense`;catalog / ledger / 對帳一視同仁(ADR-0008)
- **n8n 雙向整合** — inbound(接 onboarding push,帶 sync gate 狀態)+ outbound(建單,direct/n8n 兩路)(ADR-0008)
- 消費 ServiceNow request、回寫狀態
- per-OpCo license ledger + 總量層對帳 + drift alert
- 指派 license(Graph)、更新 ledger

**Out of scope(本版,將來再議)**
- 日常 license change / 升級 / 加購
- offboarding / license 回收
- **D365-side provisioning**(security role / legal entity,喺 D365 admin、Graph 掂唔到 — ADR-0008 D5:只做 Entra license 那層)
- license 成本 / 發票金額(走 DocuWare,見 §6)

> **ADR-0008(2026-07-15)更新**:原 out-of-scope「D365」「非 onboarding 的獨立 license request」已納入 in scope(見上)。此處 D365 指 **license SKU 層**;D365 作為**業務應用模組**(F&O 工作流等)仍屬未來 tier。

---

## 3. 現況背景(為什麼要做 Phase 2)

**中央資產表是手動維護的 Excel**:Regional IT 用一份 Excel 管理全 OpCo 的 license 存量(37 SKU × 24 entity 的 matrix),跟 M365 portal 之間是 **Sync by Manual**;每個 OpCo 又各留一份,碎片化嚴重。

**現行取得流程是 10 步人手接力**(痛點來源):
1. OpCo 申請 → 2. Regional 查 Excel 夠不夠 → 3. 夠就開 ticket 直接指派 / 不夠就 ServiceNow 開單 → 4. Regional 向 vendor(Software One)報價 → 5. vendor quote → 6~8. 報價 / approval / 簽核在 OpCo↔Regional↔vendor 之間 email 來回 → 9. vendor 採購完成 email 通知 → 10. Regional 更新 Excel、指派、關單。

**痛點熱區**:🔴 查可用量靠人眼查 Excel、🔴 Excel 手動 sync、🔴 指派+更新手動、🔴 多份 list 碎片化;🟡 採購 email 接力(牽涉 vendor + DocuWare,本版不自動化,只做 stage 追蹤)。

**工具**:Email、Teams、Excel、Azure M365 portal、ManageEngine、ServiceNow。

---

## 4. 架構 (Architecture)

### 4.1 Phase 1 vs Phase 2 分工(不是二選一)
- **n8n = on-prem 執行引擎**(LDAP / WinRM / file server)= Phase 1,維持不變。
- **本平台 = cloud/M365 層 + UI + 狀態管理** = Phase 2。
- Phase 2 **不做成 n8n workflow**,因為它是 stateful、human-in-the-loop、multi-role 的**管理問題**(application/portal),不是 deterministic execution。
- 將來全自動時,平台去 call n8n(平台是大腦,n8n 是其中一隻手)。

### 4.2 平台是自建的完整 admin portal
自建取其最大自由度與 AI 基礎的可塑性;不走 Power Platform,也不做簡單版。

### 4.3 四層地基
1. **State layer** — 平台真相:live M365(Graph)、AD/sync 狀態、entitlement/allocation ledger
2. **Integration layer** — connectors:Graph、ServiceNow、n8n 的統一讀寫介面(✅ 已建)
3. **Orchestration / Action layer** — 執行與人手介入的控制點;n8n 今天、AI 明天都接這裡
4. **API + UI layer** — ops console 與將來給 OpCo 的 role-based 介面

### 4.4 技術棧(決策:方案甲 = 前後端分開)
| 層 | 選型 | 理由 |
| --- | --- | --- |
| 前端 | **React + Vite + Tailwind + shadcn/ui** | 對接 Claude Design 產出的 idiom,mockup → component 幾乎零翻譯 |
| 後端 | **NestJS(modular monolith)** | module 結構跟四層地基 1:1;內建 schedule/queue;Claude Code 友善 |
| DB | **PostgreSQL + Prisma** | entity 純關聯式;Prisma schema 即 domain model 的程式碼 |
| 背景工作 | **Redis + BullMQ** | orchestration 底盤:對帳、drift、sync poll、retry |
| Auth | **Entra ID SSO + app roles** | Regional 看全部 / OpCo 看自己,不自造權限輪子 |
| 對外 API | **REST + OpenAPI(NestJS Swagger)** | 這條就是 n8n / AI 未來插入的受控接口 |
| 部署 | **Docker Compose 自架**(app + postgres + redis) | 跟現有 n8n 同一套 ops model |

---

## 5. State 模型 & Reconciliation

- **M365 tenant = 總量的唯一 source of truth**(單一 tenant,`subscribedSkus` 給 `prepaidUnits.enabled` vs `consumedUnits`)。
- **初始化流程**:上線前 → 建 per-OpCo ledger → 跟 M365 實際總數比對 → 把差異**全部清乾淨**建立 baseline → 才開始用。
- **SKU 唯一主鍵 = `skuId`(GUID)**。需要一張字典 `skuId ⇄ skuPartNumber ⇄ 業務別名`。**別信 Excel 的名稱、也別信記憶中的 part number**;初始化時直接從 tenant 拉真實 `subscribedSkus` 反向對業務名。(Excel 的名稱是同事網上找的 friendly name,對不上 API。)
- **對帳方式 = 方案甲**:平台維護 per-OpCo 手動 ledger(onboarding +1 並同時 assign);偵測只在**每個 SKU 的總量層**:`sum(所有 OpCo 的 assignedQuantity) vs M365 tenant consumedUnits`,對不上就 `DriftAlert`。差異落在哪個 OpCo 要人去查 —— **對回機制 = 手動編輯 by-OpCo `assignedQuantity`(ADR-0007 / W23-A activated;配 `LedgerAdjustment` audit)**。
- **兩層數字分開**(By-OpCo 內部帳 = 人手管理;寫入路徑見 ADR-0007):
  - `allocatedQuantity` = OpCo budget / 擁有(對應 Excel 格子,OpCo 自己管)→ **顯示/反映**,不參與 drift。**寫入**:allocation import(W13)+ 手動逐格編輯(W23-A `PATCH /license/ledger/:id`)。
  - `assignedQuantity` = 實際已指派 baseline → **只有這個**拿去對帳。**寫入**:fulfilment assign 自動 +1(W04)+ **手動校正 / 對回**(W23-A,ADR-0007)。對帳邏輯不變 —— 手動編輯正是把 drift 差異對回落某 OpCo。
- **分層真相(ADR-0007)**:Platform 層 = tenant 真相(`owned`=prepaidEnabled + `consumed`=consumedUnits,Graph 自動、唯讀);By-OpCo 層 = 內部管理帳(上述兩數,人手維護)。Graph 唔知 OpCo 劃分,故 By-OpCo 靠人手。
- **baseline vs in-flight**:baseline(已 assign)要 reconcile 到準;在途(報價 / 等批 / 等 vendor / ready 未 assign)是浮動 overlay,由 request 的 line item 狀態算出來,不落進 ledger baseline。兩層分開。

---

## 6. Domain Model(對應 `prisma/schema.prisma`,v1)

**10 個 model**:`AppUser`、`Opco`、`SkuCatalog`、`OpcoSkuLedger`、`TenantSkuSnapshot`、`DriftAlert`、`Request`、`RequestLineItem`、`RequestEvent`,加 enums(`Role` / `DriftStatus` / `RequestStatus` / `LineItemStage` / `EventType`)。

**關鍵建模決策**
- **stage 掛在 `RequestLineItem`,不是 `Request`** — 一張單裡不同 SKU 可以在不同 stage(E3 即時 assign、Copilot 還在 procurement);`Request.status` 是聚合。
- **ledger 兩個數字分開**(見 §5)。
- **`SkuCatalog` 以 `skuId` 為真相**,`businessAlias` 只是 Excel 舊名對照。
- **ServiceNow 欄位只是 mirror**(`serviceNowSysId/Number/Status`);`rawRequestText` 存原始 remark(人手判讀 → 未來 AI 抽結構化清單的入口)。
- **Phase 1 sync gate** = `Request.azureSyncedAt`;assign 動作檢查它有值才執行。
- **`RequestEvent`** = 平台自己的 operational 歷史(stage 轉換 / assign / reconcile),不同於 ServiceNow 的 ITSM audit。

**欄位增補(對著 ops portal 實際需要)**:`SkuCatalog.category`、`SkuCatalog.lastSyncedAt`、`Request.requesterEmail`、`Request.handledById`(+relation)、`RequestLineItem.quoteRef/poRef`、`AppUser.lastLoginAt`。保留 `isBaseLicense`(驅動 triage UI 預設,非硬 gate)。

**刻意排除(守 scope)**:成本/發票金額(DocuWare 的地盤,平台只記 `quoteRef`/`poRef` 指標,不記錢)、ServiceNow priority/category 鏡像(v1 用不上)。
> **已補(W23-A / ADR-0007)**:`LedgerAdjustment` model 已加 —— 逐格人手編輯 ledger(`PATCH /license/ledger/:id`)必記 who/when/field/before→after/reason;import(W13)/ assign(W04)仍靠 import summary / `RequestEvent`,不入此表。

---

## 7. Request 生命週期

- **有 budget / spare(短路)**:`REQUESTED → READY → ASSIGNED`
- **需加購(procurement,人手推進)**:`REQUESTED → QUOTING → OPCO_APPROVED → AWAITING_VENDOR → READY → ASSIGNED`
- **疊 Phase 1**:`account created → synced`(`azureSyncedAt`),指派要等 synced 才做。
- stage 在**每條 line item** 上獨立推進;採購段(quote/approval/vendor)是**人手更新狀態**,以便往下一個 stage,直至完成。
- **n8n inbound intake(來源,ADR-0008 Phase 甲)**:onboarding 由 n8n workflow 跑(建 AD),AD 建好後 **non-blocking push** 入平台建 `Request` + line item mirror(status OPEN / stage REQUESTED / `handledById`=null → 入 Regional queue 人手認領後先 assign,**非自動觸發**)。sync gate 時序真相:n8n 建 **on-prem AD** → 經 Azure AD Connect sync 落 Entra **有延遲**,故 push 帶嘅 `azureSyncedAt`(n8n 聲稱)**唔等於** Graph 即刻見到;指派前仍以 `findUser(upn)` 真命中為準,必要時 retry(見 RISK R3)。

---

## 8. Integration Layer(✅ 已建,`src/integration/`)

**GraphService**(`graph/graph.service.ts`)
- `getSubscribedSkus()` — 拉 live 總量(purchased / consumed),供初始化 + 對帳。
- `findUser(upn)` — 找不到回 `null`,**同時就是 Phase 1 sync gate**。
- `setUsageLocation()` / `assignLicense()` — 內建處理兩個硬坑:**指派前必須有 usageLocation**、**無空 seat 會失敗**(要先查可用量)。

**ServiceNowService**(`servicenow/servicenow.service.ts`)
- `getRecord / getRecordByNumber / query / updateRecord / addWorkNote` — Table API 讀寫。
- 型別故意 generic;**table 名與欄位名要對齊 Phase 1 的實際設定**(`sc_req_item` / `work_notes` 只是預設)。

**Entra 權限(app-only)**:`Organization.Read.All`、`Directory.Read.All`、`User.ReadWrite.All`(需 admin consent)。細節見 `docs/INTEGRATION_SETUP.md`。

---

## 9. 已鎖定的決策清單(快速回顧)

1. 平台 = System of Action;ServiceNow = System of Record;sync 不重複。
2. Regional = reflector + executor,非 owner。
3. Phase 2 不做成 n8n workflow;自建完整 admin portal。
4. 技術棧:NestJS(後端)+ React/Vite/Tailwind/shadcn(前端)分開;Postgres+Prisma;Redis+BullMQ;Entra SSO;Docker Compose;REST+OpenAPI。
5. Scope:onboarding **+ 獨立 license request 建單**(thin action;ADR-0008);**M365 + D365** license(D365 = Entra subscribedSku,同一 Graph `assignLicense`;catalog/ledger/對帳一視同仁);不含 change/offboarding;不含 D365-side provisioning。〔ADR-0008 更新原「M365 only」〕
6. M365 tenant = 總量真相;SKU 主鍵 = `skuId` GUID;需 SKU 字典;不信 Excel 名稱。
7. 對帳 = 方案甲(手動 ledger + SKU 總量層 drift + alert)。
8. ledger 兩層:`allocatedQuantity`(budget,不對帳)/ `assignedQuantity`(baseline,對帳)。
9. stage 掛 line item;短路 vs procurement 兩條路徑;procurement 人手推進。
10. 指派前檢查 `azureSyncedAt`(Phase 1 sync gate);指派用 Graph `assignLicense`(direct)。
11. 成本/發票走 DocuWare,不進平台。

---

## 10. 待決 / 開放項(Open items)

- **成本可見度**:要不要在平台上至少「看到」每單花多少(哪怕人手填)?若要,需補回幾個欄位(現在補還來得及)。
- **`isBaseLicense`**:保留中;若確認 base/add-on 界線不需進資料模型,可移除。
- **ServiceNow 實際 table / field**:要對齊 Phase 1(table 名、狀態欄、work note 欄)。
- **Reconciliation 對回機制**:差異落到哪個 OpCo —— **W23-A(ADR-0007)activated**:手動編輯 by-OpCo `assignedQuantity`(`PATCH /license/ledger/:id`)把差異對回,配 `LedgerAdjustment` audit。「怎樣**自動協助**同步(而非純人手對回)」仍 later。
- **OpCo self-service 開放時機**:role-based scoping 已在 model(`AppUser.role` + `opcoScope`),但何時對外開放未定。

---

## 11. Roadmap / 下一步

**✅ Done**
- 定位、scope、現況理解
- 架構 + 四層地基 + 技術棧(方案甲)
- Domain model(`prisma/schema.prisma`,欄位定稿)
- Integration layer(Graph + ServiceNow client)

**⏭️ Next(二選一,建議先 C)**
- **(C) Catalog 初始化 + 對帳服務** — 用 `getSubscribedSkus()` 灌 `SkuCatalog`(建 SKU 字典),寫總量層 drift 偵測進 `DriftAlert`。實作「初始化對照 → 清差異 → baseline」。
- **(D) Request 履行 use case** — request → 拆 line items → triage(短路/procurement)→ stage 推進 → `findUser` 過 sync gate → `assignLicense` → 更新 ledger + 回寫 ServiceNow。

**🔮 Later**
- Overview dashboard / License assets / Request console 三大 UI 模組
- 採購 stage 追蹤 UI
- OpCo IT self-service 開放
- AI 抽 free-text remark 成結構化 license 清單
- D365 **業務應用模組**(F&O 工作流等) — 註:D365 **license** 已由 ADR-0008 納入 in-scope(§2 / §9 #5),此處僅指業務模組

---

## 12. Artifact index(這個 package 有什麼)

```
phase2-platform/
├── DESIGN.md                                  ← 本文件(所有決策的 single source of truth)
├── .env.example                               ← 環境變數範本
├── prisma/
│   └── schema.prisma                          ← domain model(10 models,v1 定稿)
├── src/integration/
│   ├── integration.module.ts                  ← 統一 export 兩個 client
│   ├── graph/graph.service.ts                 ← Graph:subscribedSkus / findUser / assignLicense
│   └── servicenow/servicenow.service.ts       ← ServiceNow Table API 讀寫
└── docs/
    └── INTEGRATION_SETUP.md                    ← 套件 / Entra 權限 / ServiceNow / runtime 坑
```
