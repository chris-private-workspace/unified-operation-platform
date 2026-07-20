---
artifact: design-analysis
title: "平台可稽核性 + 整合可觀測性 — 現況 map、gap 分析、rollout 提案"
date: 2026-07-20
status: accepted          # proposed | accepted | superseded — OQ-1/OQ-2 已由 Chris 拍板(2026-07-20)→ ADR-0009 Accepted
author: AI(draft)/ Chris Lai(decision)
supersedes: —
---

# 平台可稽核性 + 整合可觀測性

> **本文角色**:pre-ADR 分析文件(同 `allocation-editing-and-drift-correction.md` 同一角色)。
> **唔係決定** —— 決定落 ADR-0009(audit)+ 將來 ADR-0010(integration)。本文負責:把現況查證清楚、把 gap 攤開、把 options 同 trade-off 擺上檯,令 Chris 有得揀。
> **觸發**:Chris 2026-07-20 提出三條問題(n8n 接口 / integration UI / audit 需求)。

---

## 1. Context — 點解而家要處理

三條問題表面上唔相干,實際上指向**同一個結構性缺口**:

> 平台已經有能力**做**好多嘢(assign license、改 ledger、改用戶角色、開 request),但**冇能力交代自己做過咩、同外部系統之間發生緊咩**。

- **對內**(問題 3):將來要應付 audit / compliance,而家一半操作**零留痕**。
- **對外**(問題 1、2):同 n8n / ServiceNow / Graph 之間係單程、無狀態、無 UI 可見度 —— 出事時冇人知邊度斷。

兩者都係「平台自我可觀測性」,所以放同一份文件分析、分兩個 ADR 決定。

---

## 2. 現況 Map(全部經 code 查證,2026-07-20)

### 2.1 已有嘅留痕能力

| Model | 檔案:行號 | 覆蓋範圍 | 有 actor? |
|---|---|---|---|
| `RequestEvent` | `schema.prisma:283` | `STAGE_CHANGE` / `ASSIGN` / `SYNC` / `RECONCILE` / `NOTE`,綁 `requestId`(+ optional `lineItemId`) | ✅ `actorId` |
| `LedgerAdjustment` | `schema.prisma:135` | ledger **逐格**手改,`field` / `beforeValue` / `afterValue` / `reason` | ✅ `actorId` |

兩者都係 **domain-specific**、各有既有 UI 消費、各有 business 語意。**本提案唔動佢哋**(理由見 §4.2)。

### 2.2 完全零留痕嘅寫入操作

| 操作 | 所在 service | 稽核敏感度 |
|---|---|---|
| 建立 / 修改 / 停用**用戶帳號** | `auth/user-admin.service.ts` | 🔴 高 |
| 改**用戶角色 / OpCo scope** | `auth/user-admin.service.ts` | 🔴 **最高**(權限變更) |
| Admin **重設密碼** | `auth/user-admin.service.ts` | 🔴 高 |
| 登入成功 / 失敗 / 鎖戶 / 解鎖 | `auth/*` | 🟡 中(安全事件) |
| 建立 / 修改 **OpCo** | `opco/opco.service.ts`(CH-004) | 🟡 中 |
| 編輯 **SKU catalog**(alias/category/base-flag) | `license/catalog.service.ts`(CH-003) | 🟡 中(影響對帳對映) |
| Allocation **import**(一次改成百行 ledger) | `license/*`(ADR-0004) | 🟡 中(有 import summary,但唔入 audit) |
| Drift alert **resolve** | `license/*` | 🟡 中 |

### 2.3 RBAC 現況

- **Role** = Prisma enum 三個值,`schema.prisma:29-33`:`ADMIN` / `REGIONAL` / `OPCO_IT`。
- **冇 permission table** —— 權限 100% 由 `@Roles()` decorator hardcode 喺 controller。
- **冇任何地方**(DB 或文件)記錄「呢個 role 做到咩」。要答稽核員,唯一辦法係開 9 個 controller 逐個數。

**由 code 抽出嚟嘅實際權限矩陣**(`@Roles` grep,2026-07-20):

| Controller | Path | 允許 role |
|---|---|---|
| `opco.controller.ts:16` | `opcos` | ADMIN · REGIONAL · OPCO_IT |
| `opco-admin.controller.ts:31` | `admin/opcos` | ADMIN · REGIONAL |
| `fulfilment.controller.ts:23` | `fulfilment/requests` | ADMIN · REGIONAL · OPCO_IT |
| `outbound-request.controller.ts:23` | `requests` | ADMIN · REGIONAL · OPCO_IT |
| `license.controller.ts:35` | `license`(class default) | ADMIN · REGIONAL |
| `license.controller.ts` 5 處 method-level override | `catalog` · `drift` · `ledger` · `ledger/stats`(GET)+ **`ledger/:id`(PATCH)** | + OPCO_IT |
| `license.controller.ts:92` | `ledger/import`(POST) | ADMIN · REGIONAL |
| `user-admin.controller.ts:30` | `admin` | **ADMIN only** |
| `auth.controller.ts:24` | `auth` | (public — login/refresh/logout) |
| `me.controller.ts:17` | `me` | (any authenticated) |
| `intake.controller.ts:19` | `requests/intake` | **m2m** — `@Public()` + `IntakeKeyGuard` |

> ⚠️ 呢張表而家**只存在於本文件**。冇 test 保證佢同 code 同步 —— item 2 就係要解決呢點。
>
> 🔴 **實證(2026-07-20,W28 F0 spike)**:本表初版**已經抄錯** —— 原本寫「個別 **GET** + OPCO_IT」,但 runtime metadata 顯示嗰 5 個 override 入面 `updateLedger` 係 **`PATCH ledger/:id`**,即 OPCO_IT 可以**寫**自己 OpCo 嘅 ledger(ADR-0007 決定,service 層 `assertOpcoScope` 保護),唔止讀。
> 錯咗一日都未夠,已經證明「人手抄 `@Roles` 必然 drift」。**完整權威矩陣由 W28 F1 `GET /admin/permissions` 產出,本表只作背景。**

### 2.4 整合現況

**已有嘅管道**

| 方向 | 實作 | 認證 | 合約 |
|---|---|---|---|
| n8n → 平台 | `POST /requests/intake`(`intake.controller.ts:23`) | `X-Intake-Key` + `IntakeKeyGuard`(`intake-key.guard.ts:24`),`@Public()` 繞過 JWT | `W24-request-intake/CONTRACT.md` |
| 平台 → n8n | `N8nWorkflowProvider.submit()`(`n8n-workflow.provider.ts:45`) | `X-N8n-Key` header | `W26-request-n8n-outbound/CONTRACT-OUTBOUND.md` |
| 平台 → ServiceNow | `DirectServiceNowProvider` / `servicenow.service.ts` | basic auth | ADR-0008 |
| 平台 → Graph | `graph.service.ts` | client credentials | — |
| 選路 | `fulfilment.module.ts` factory 按 env 揀 direct / n8n | — | ADR-0008 D3 |

outbound 有 4 條 fail-closed 規則(`n8n-workflow.provider.ts:66-101`):non-2xx / 缺 REQ sysId / 行數唔夾 / 每行缺 RITM sysId → 一律 throw,唔寫本地 mirror。

**Env vars(全部 config-only,無 UI、無 DB)**

`GRAPH_TENANT_ID` · `GRAPH_CLIENT_ID` · `GRAPH_CLIENT_SECRET` · `SERVICENOW_INSTANCE_URL` · `SERVICENOW_USER` · `SERVICENOW_PASSWORD` · `N8N_OUTBOUND_WEBHOOK_URL` · `N8N_OUTBOUND_WEBHOOK_KEY` · `INTAKE_API_KEY`

**缺**

1. **冇回程 webhook** —— m2m 面只有一條 intake endpoint。n8n 跑到中途想回寫「批咗 / quote 好咗 / 完成咗」→ 無路可行。stage 推進目前**只能靠平台 UI 人手撳**。
2. **合約仲係 representative** —— `n8n-workflow.provider.ts:22-28` 自己寫明 URL / fields / auth 係 REPRESENTATIVE,真值 pending n8n owner。
3. **冇任何 health / test-connection** —— `src/integration/` 全目錄無 `health` / `ping` / `testConnection` 實作。
4. **UI 零可見度** —— `settings.tsx:232-242` Integrations tab 只有 allocation import + 一個 EmptyState,文案自認「Connector status coming soon … needs the integration-status API」。
5. **冇交付保證** —— outbound 失敗即 throw,無 retry、無 dead-letter。**BullMQ 喺 locked stack(H2)但完全未啟用** —— `app.module.ts:14` 只有 `ScheduleModule.forRoot()`,Redis 目前只係 docker-compose 起咗但冇 app 用。

---

## 3. 一個必須先講清楚嘅架構前提

`docs/architecture.md:17` 寫明:

> **ServiceNow** = System of Record — request intake / approval / SLA / **audit**「誰申請、誰批、記錄」

即係話:**「誰申請、誰批」嗰半邊 audit 一直當咗 ServiceNow 負責。**

但 §2.2 列嘅缺口,**ServiceNow 一件都唔知**(改角色、改 ledger、改 OpCo、改 catalog、登入失敗)。

**所以本提案唔係「補返漏做嘅嘢」,而係平台要多承擔一塊 ServiceNow 唔覆蓋嘅 audit 責任 —— 呢個係架構定位擴展,必須經 ADR。**

建議喺 ADR-0009 明確寫低分工:

| 稽核問題 | 由邊個答 |
|---|---|
| 邊個申請、邊個批、SLA 幾耐 | **ServiceNow**(不變) |
| 平台入面邊個改咗權限 / 數字 / 配置 | **平台 AuditLog**(新) |
| license 實際點解 assign 咗畀邊個 | **平台 RequestEvent**(既有,不變) |

---

## 4. ⚠️ 呢個提案同一個既有決定衝突

`allocation-editing-and-drift-correction.md:193`(W23-A / ADR-0007 前置分析)明確寫住:

> Audit 用 generalize `RequestEvent` → 通用 `AuditLog` —— **rejected(至少現階段)**:大改、影響現有 request 歷史;新 `LedgerAdjustment` surgical

Chris 而家提出嘅需求 = **重啟呢個 rejected alternative**。

### 4.1 當時 reject 嘅理由今日仲成唔成立?

| 當時理由 | 今日評估 |
|---|---|
| 「大改」 | ⚠️ 仍然成立 —— 要 hook 進 6+ 個 service |
| 「影響現有 request 歷史」 | ✅ **唔再成立** —— 只要唔 generalize `RequestEvent`,而係**新增並存**嘅 `AuditLog`,request 歷史零影響 |

**關鍵洞察:當時 reject 嘅係「generalize `RequestEvent`」,唔係「有一張通用 audit 表」。** 兩者唔同。

### 4.2 因此建議「共存」而唔係「取代」

```
RequestEvent      → request 生命週期(既有 UI 用緊)            不動
LedgerAdjustment  → ledger 逐格手改(ADR-0007 決定)            不動
AuditLog（新）    → 上述兩者唔覆蓋嘅所有 write（§2.2 全表）      新增
```

**好處**:零 breaking migration、零 UI 迴歸、ADR-0007 決定完整保留、當時 reject 嘅真正理由被繞開。
**代價**:三張表,查「呢個 request 全部歷史」要 union 兩張表(可接受 —— 各自語意本來就唔同)。

---

## 5. AuditLog 設計提案(細節留 ADR-0009 決定)

### 5.1 Model 草案

```prisma
model AuditLog {
  id         String   @id @default(cuid())
  actorId    String?          // AppUser id;null = system / cron / m2m
  actorType  String           // 'user' | 'system' | 'm2m'
  action     String           // 'user.role_change' | 'opco.update' | 'catalog.update' | …
  targetType String           // 'AppUser' | 'Opco' | 'SkuCatalog' | 'OpcoSkuLedger' | …
  targetId   String
  before     Json?            // 白名單欄位 only(見 §5.3)
  after      Json?
  metadata   Json?            // reason / correlationId / 來源
  createdAt  DateTime @default(now())

  @@index([targetType, targetId, createdAt])
  @@index([actorId, createdAt])
  @@index([action, createdAt])
}
```

Additive model,**唔改任何現有欄位** → 無 breaking migration。

### 5.2 🔴 H4 關鍵風險 — 唔可以 dump 成個 object

如果實作時求方便寫 `before: user`(成個 Prisma object),就會**把 `passwordHash` 寫入 audit table**。呢個係災難級 H4 violation。

**強制設計**:每個 `targetType` 有一張**白名單欄位表**,只有白名單內嘅欄位可以入 `before`/`after`;`passwordHash` / `tokenHash` / 任何 secret **永久 blacklist**,並用 test 鎖死。

### 5.3 PII 張力(要 Chris 決定 — OQ-2)

`LedgerAdjustment` 個 schema comment(`schema.prisma:133`)特登寫住「actor is an AppUser id, **never PII**(no email / UPN)」。

但 audit 一個「改咗用戶 email」嘅事件,唔記舊 email 就等於冇記到。**兩個目標有真實張力:**

| 選項 | 做法 | 得 | 失 |
|---|---|---|---|
| **P-A** | 一律只存 id,唔存任何 email / displayName | H4 最乾淨 | 「改咗乜」答唔到,audit 價值大減 |
| **P-B**(建議) | actor / target 存 id;`before`/`after` 白名單**可以含** email / displayName,因為呢啲正正就係被改嘅嘢 | audit 真正有用 | audit table 含 PII → 要 access control + 將來 retention |
| **P-C** | 存 hash / masked 值 | 折衷 | 稽核員睇唔到實值,實用性存疑 |

> H4 原文係「唔好 log 落 **plaintext file**」。DB table + role gate ≠ log file,所以 **P-B 唔算違反 H4 字面** —— 但屬 H4-adjacent,必須 Chris 明確拍板,唔可以我自己揀。

### 5.4 其他要決定嘅點

| OQ | 問題 | 我嘅建議 |
|---|---|---|
| **OQ-1** | 記唔記 before/after,定只記「邊個幾時做過咩」 | **記**(白名單)—— 唔記嘅話稽核員問「改成點」就答唔到 |
| **OQ-2** | PII 策略(§5.3) | **P-B** |
| **OQ-3** | audit 寫入失敗,主操作要唔要一齊 rollback | **同一 transaction(fail together)** —— compliance 場景寧可整個操作失敗,都好過「做咗但冇記錄」 |
| **OQ-4** | 邊個睇得到 audit | **ADMIN only** 起步;REGIONAL / OPCO_IT 將來再議 |
| **OQ-5** | 保留期 / 清理 | **先唔做 retention**,靠 index;量大先加(過早優化) |
| **OQ-6** | 補唔補歷史 | **唔補** —— 冇來源。audit 由上線嗰日起計,文件寫明起始日 |

---

## 6. Rollout(Chris 已 approve 呢個順序,2026-07-20)

| # | 項目 | 類型 | Gate | 預估 |
|---|---|---|---|---|
| **1** | **ADR-0009 平台 audit 定位** — 解 §5 全部 OQ + §3 分工 + §4 共存決定 | ADR | **H1,必須先 accepted** | 半日 |
| **2** | **權限矩陣** — 由 `@Roles` derive 成文件 + 唯讀 UI + **drift test**(code 改咗矩陣冇改 → test 紅) | Phase | 低 —— 純 derive,零行為改動 | 1 日 |
| **3** | **AuditLog 落地** + Audit UI(篩 actor / 時間 / 對象 / action) | Phase | 跟 ADR-0009 | 2-3 日 |
| **4** | **Integration 狀態 + Test connection**(secret 照留 env) | Phase | 中 —— 🔴 endpoint **絕不可**回傳 secret 值,只回 boolean「有冇設定」 | 1-1.5 日 |
| **5** | **n8n 回程 webhook**(外部可推 stage) | Phase | **H1 + 外部阻塞** — 見 §7 | 1-2 日 |
| **6** | **Outbound 交付保證 / retry** | Phase | **H1** — 啟用 BullMQ,見 §7 | 1 日 |

**Rolling JIT**:本文只開 item 1 嘅 ADR。item 2 埋身先開 phase folder;item 4-6 埋身先寫 ADR-0010。**唔預建 folder**(PROCESS §8)。

---

## 7. Hard Constraint 評估(逐項)

| Item | H1 架構 | H2 vendor | H3 scope | H4 安全 | H5 test | H6 design |
|---|---|---|---|---|---|---|
| 1 ADR | **✅ 觸發** — 新 model + 跨 module + 改 §3 分工 | 否 | 平台級,非 LicenseOps 排除項 | §5.2/5.3 要決 | — | — |
| 2 權限矩陣 | 否 — 純 derive | 否 | 否 | 否 | ✅ drift test | 唯讀頁,token-only |
| 3 AuditLog | 跟 ADR-0009 | 否 | 否 | **🔴 §5.2 白名單** | ✅ 白名單 + transaction test | Audit 頁 |
| 4 Integration 狀態 | 🟡 新 endpoint 面 — 輕度,可歸 ADR-0010 | 否 | 否 | **🔴 唔可以回傳 secret** | ✅ | 補 `settings.tsx` EmptyState |
| 5 n8n callback | **✅ 觸發** — **stage 掛 line item + stage 推進係 locked 決策**;開放外部推 stage = 改寫入來源 | 否 | 否 | m2m key | ✅ critical path | — |
| 6 retry | **✅ 觸發** — **啟用 BullMQ**(stack 已 lock 但從未用,§2.4)= 新 runtime 元件 + 改 outbound 同步語意 | 否(已 lock) | 否 | 否 | ✅ | — |

### 7.1 Item 5 有外部阻塞

n8n 回程合約要同 **n8n owner 對真值**,否則又係做多一層 representative(重蹈 §2.4 第 2 點)。**性質同 AUTH-2b 卡 IT app registration 一樣 —— 唔喺我哋手上。**

> 建議:item 1-4 照做(全部自足);行到 item 5 之前,Chris 要先同 n8n owner 開一次合約對齊會。

### 7.2 Item 6 有個更輕嘅替代

啟用 BullMQ 之前,值得考慮:**先做「失敗記錄 + 人手 retry 掣」**(把失敗嘅 outbound 記低,UI 畀操作員撳重試)。零新 runtime 元件、解到 R3 大部分痛,而且 audit 順便有記錄。真正需要自動 retry 先啟 BullMQ。→ 留 ADR-0010 決。

---

## 8. Open Questions(要 Chris 答先開工)

| # | 問題 | 狀態 |
|---|---|---|
| ~~OQ-1~~ | audit 記唔記 before/after?(§5.4) | ✅ **resolved 2026-07-20 — 記(白名單)** → ADR-0009 Decision 6 |
| ~~OQ-2~~ | PII 策略 P-A / P-B / P-C?(§5.3) | ✅ **resolved 2026-07-20 — P-B**(白名單可含 email·displayName)→ ADR-0009 Decision 7 + 4 條連帶義務 |
| **OQ-3** | audit 寫入失敗 → 主操作 rollback? | ✅ 隨 ADR-0009 Decision 8.1 定案(同一 `$transaction`) |
| **OQ-4** | audit 睇得到嘅 role? | ✅ 隨 ADR-0009 Decision 8.2 定案(ADMIN-only;**因採 P-B 唔可放寬**) |
| **OQ-5** | item 6 行「人手 retry」定「BullMQ 自動」?(§7.2) | ⚪ 未決 — blocking item 6,留 ADR-0010 |
| **OQ-6** | item 5 之前,幾時同 n8n owner 對合約?(§7.1) | ⚪ 未決 — blocking item 5(外部) |

> **OQ-1 / OQ-2 已拍板**(Chris,2026-07-20)→ ADR-0009 flip **Accepted**,item 2-3 解封。
> 餘下 OQ-5 / OQ-6 只 block item 5-6,唔影響 item 2-4。

---

## 9. References

- `CLAUDE.md` §5.1 H1 / §5.4 H4 / §5.5 H5
- `docs/architecture.md:17`(ServiceNow = System of Record,含 audit)
- `docs/02-architecture/licenseops/allocation-editing-and-drift-correction.md:193`(通用 AuditLog 當時被 reject)
- ADR-0007(`LedgerAdjustment`)· ADR-0008(n8n 雙向 / intake)· ADR-0004(allocation import)
- `docs/01-planning/W24-request-intake/CONTRACT.md` · `W26-request-n8n-outbound/CONTRACT-OUTBOUND.md`
- 現況查證(2026-07-20):`schema.prisma` · `intake.controller.ts` · `n8n-workflow.provider.ts` · `settings.tsx` · `app.module.ts` · 全部 `@Roles` grep
