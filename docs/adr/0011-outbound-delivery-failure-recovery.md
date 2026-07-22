# ADR-0011: Outbound 交付失敗持久化 + 人手補救(`OutboundFailure`)

**Date**: 2026-07-21
**Status**: **Accepted**
**Approver**: Chris Lai(2026-07-21 拍板:**Q1 = F1+F2+F3 三種都做** · **Q2 = ADMIN + REGIONAL**)

## Context

觸發 **CLAUDE.md §5.1 H1** —— 新增 Prisma model + 改三條既有 outbound 路徑嘅失敗語意。

ADR-0010 **D8** 已定路線(OQ-C):item 6 行**人手 retry**,唔啟用 BullMQ,並誠實補註「零新 runtime 元件 ≠ 零 schema —— 仍觸發 H1,埋身時當架構改動處理」。本 ADR 就係嗰個埋身。

### 🔑 埋身查證揭示嘅事:D8 個模型只啱三分之一

D8 寫「持久化失敗嘅 outbound(payload + 錯誤 + 嘗試次數)」。但實際 code 有**三種性質完全唔同**嘅 outbound 失敗,而佢哋需要嘅補救動作**互不相容**:

| | 失敗點 | 資料狀態 | 用戶知唔知 | 正確補救 |
|---|---|---|---|---|
| **F1** | SN/n8n 建 ticket 失敗<br>`outbound-request.service.ts:79-87` | ✅ 乾淨 —— 本地零寫入(fail-closed) | ✅ 見 503「please retry」 | **重新提交** |
| **F2** | ticket 建咗、本地 mirror 失敗<br>`outbound-request.service.ts:123-131` | ❌ **SN 有、平台冇**(orphan ticket) | ⚠️ 見 500,但唔知 SN 已經有 ticket | **用已回傳嘅 sysId 補寫本地** |
| **F3** | SN work-note 回寫失敗<br>`assign.service.ts:197-203` | ⚠️ 平台已 assign、SN 無紀錄 | ❌ **完全無感**(明確 swallow) | **重發 work note**(冪等) |

三個發現值得寫落嚟:

1. **F1 其實痛得最少** —— 資料乾淨、用戶即刻見到、自己撳多次得。持久化佢嘅價值只係「唔使重新填表單」。
2. **F2 有個會製造真傷害嘅陷阱** —— 佢而家淨係 `logger.warn`,紀錄完全唔存在;而**對 F2 執「重試提交」係錯嘅**,會喺 ServiceNow 開**第二張** ticket。所以 model 唔可以淨係存 payload。
3. **F3 係靜默失敗** —— 設計上係 best-effort(OD4 刻意 swallow),但後果係 ServiceNow 嗰邊睇唔出平台 assign 過。

**如果照 D8 字面做,會解咗最唔痛嗰個,漏低兩個。** 故 Chris 拍板三種一齊做(Q1)。

### 順帶校正一個錯引用

ADR-0010 / `audit-and-integration-observability.md §7.2` 講 item 6「解 **RISK R3**」。但 `RISK_REGISTER.md:24` 嘅 R3 係「n8n on-prem AD → Entra Connect sync 延遲 → `findUser` 搵唔到 → assign fail」,**唔係** outbound 提交失敗。兩者都關於「失敗要能重試」但唔係同一件事。本 ADR 涵蓋嘅係 `audit-and-integration-observability.md §2.4` 第 5 點(「冇交付保證 —— outbound 失敗即 throw,無 retry、無 dead-letter」);R3 另行處理,唔混為一談。

## Decision

### D1 — 新 model `OutboundFailure`(additive,無 breaking migration)

```prisma
model OutboundFailure {
  id     String @id @default(cuid())
  kind   String // 'request.submit' | 'request.mirror' | 'servicenow.worknote'
  status String @default("open") // 'open' | 'resolved' | 'abandoned'

  // 重做嗰件事所需嘅輸入。逐 kind 形狀唔同,一律經白名單(D5)。
  payload Json

  // 已經發生咗嘅外部副作用 —— F2 靠佢先知「唔可以重 submit」(D3)。
  externalRef Json?

  lastError     String
  attemptCount  Int      @default(1)
  lastAttemptAt DateTime @default(now())

  requestId String?
  request   Request? @relation(fields: [requestId], references: [id])

  createdAt    DateTime  @default(now())
  resolvedAt   DateTime?
  resolvedById String?

  @@index([status, createdAt])
  @@index([kind, status])
}
```

`kind` / `status` 用 `String` + 常數表,唔用 Prisma enum —— 跟 `AuditLog`(ADR-0009 D3)已建立嘅慣例,加新 kind 唔使 migration。

**冇 `opcoId` 欄位**:權限係 ADMIN + REGIONAL(D4),兩者都見全部 OpCo,所以而家用唔著。將來若要 opco-scope,F2/F3 可經 `requestId → Request.opcoId` join,F1 靠 `payload.opcoCode`。**刻意唔預先加**(§1.2)—— 但後果寫喺 Consequences。

### D2 — `kind` 決定補救動作,唔係一條 generic「retry」

UI 同 service 都要按 `kind` 分流:

| kind | 補救動作 | 冪等性 |
|---|---|---|
| `request.submit` | 用 `payload` 重行 `provider.submit()` + 建本地 mirror | 安全 —— 第一次冇建成 |
| `request.mirror` | **只**用 `externalRef` 入面已有嘅 sysId 建本地 mirror | 安全 —— 零外部寫入 |
| `servicenow.worknote` | 重發 work note | 安全 —— 重複只係多條 note |

**一條 generic retry button 係錯嘅設計**,因為 `request.mirror` 撳落去唔可以掂 ServiceNow。

### D3 — 🔴 `request.mirror` 絕不重新提交

呢條係本 ADR 最重要嘅單一約束。F2 發生時 ServiceNow **已經有一張真 ticket**;重 submit 會開第二張,而且平台唔會知邊張先啱。

**實作義務**:`request.mirror` 嘅補救路徑**絕不可以**呼叫 `provider.submit()` / `createRecord`。要有 test 鎖死(同 W30 G2「跑晒探針 assert `createRecord` 從未被呼叫」同一手法)。

### D4 — 讀取 + 補救權限 = **ADMIN + REGIONAL**【Chris Q2】

outbound 失敗係**營運問題**唔係稽核問題,REGIONAL 係實際跟進嘅 operator。

**點解唔算擴大 PII 面**:表入面嘅 PII(`targetUpn`)REGIONAL 本來就經 `GET /requests` 見到同一批。呢個同 `AuditLog` 唔同 —— audit 含帳號 / 權限變更紀錄,所以 ADMIN-only(ADR-0009 Decision 7 連帶義務 ①,**不受本 ADR 影響**)。

### D5 — H4:`payload` / `externalRef` 一律白名單,絕不存 secret

沿用 ADR-0009 Decision 5 嘅做法:**白名單喺 service 一處做,call site 唔可以自己砌 payload**。

- ✅ 可存:`targetUpn` · `opcoCode` · `requesterEmail` · line items(skuId / partNumber / quantity)· remark · SN sysId / number
- ❌ 絕不存:`SERVICENOW_PASSWORD` · `N8N_OUTBOUND_WEBHOOK_KEY` · 任何 header / auth 內容 · vendor 原始 response body
- `lastError` **只存訊息文字**,唔存 vendor 原始 response(可能含 instance URL / 內部欄位)—— 原始嘢照舊只入 log(同 ADR-0010 D2 同一原則)

要有 test 餵假 secret assert 唔會出現喺 persisted row(同 W30 G1 同一手法)。

### D6 — 寫失敗紀錄本身係 best-effort,而且**唔可以**同主 transaction 綁

同 ADR-0009 Decision 8.1(audit 同主操作同一 transaction)**刻意相反**,理由:

- **F2 嘅失敗原因就係本地 write 失敗。** 如果把 failure 紀錄放入同一個 transaction,佢會一齊 rollback —— 即係最需要紀錄嗰刻反而寫唔低。
- 所以 failure 紀錄**獨立寫**,唔 join caller 個 tx。

**誠實上限**:若連 failure 紀錄都寫唔入(DB 真係 down),就只剩 log。呢個係本方案嘅天花板,唔假裝解決咗。實務上 F2 更常見嘅成因(constraint violation / 資料問題 / transaction timeout)DB 仍然可用,寫得入。

### D7 — F2 之後仍然 throw,但錯誤訊息要改

而家 `outbound-request.service.ts:130` 直接 `throw err`(可能係 Prisma error,對操作員無意義)。改為:先寫 failure 紀錄,再 throw 一個講清楚**「ServiceNow ticket 已經開咗,但平台未記低」**嘅訊息 —— 因為呢個資訊直接決定操作員應該做乜(唔好再撳一次提交)。

呢個係**既有行為改動**,故明文列入本 ADR。

### D8 — 人手補救動作要落 audit

撳「重試」係一個人手操作,會產生外部副作用(F1/F3)或改資料(F2)。故加 audit action:`outbound.retry`(targetType `OutboundFailure`),沿用 ADR-0009 `AuditService`。

同時 `abandoned`(操作員判斷唔使補)都要落 audit —— 「決定唔做」同「做咗」一樣要有紀錄。

### D9 — 延續 ADR-0010 D8 嘅兩條:唔啟 BullMQ、唔重用 `AuditLog`

- **唔啟用 BullMQ**(H2 元件已 lock 但從未用)—— 要自動 retry 另寫 ADR。
- **唔重用 `AuditLog` 做失敗佇列** —— audit 係唯讀事實紀錄,唔應該變成有狀態工作佇列(要記 attempt 次數 / 已解決未)。`OutboundFailure` 有狀態、會被更新;`AuditLog` 永不更新。兩者性質相反。

## Alternatives Considered

- **A. 只做 F1(D8 字面)** — rejected(Chris Q1):解咗最唔痛嗰個,F2 orphan ticket 繼續淨係 `logger.warn`、F3 繼續無聲。交出去之後「outbound 有冇交付保證」實際上仲係答唔到。
- **B. 一條 generic retry(唔分 kind)** — rejected(D2/D3):對 `request.mirror` 執重新提交會喺 ServiceNow 開第二張 ticket。呢個唔係邊界情況,係 F2 嘅**預設**後果。
- **C. 重用 `AuditLog` 做失敗佇列** — rejected(D9,承 ADR-0010 D8 同一判斷):唯讀事實紀錄 vs 有狀態工作佇列。
- **D. 啟用 BullMQ 自動 retry** — rejected(ADR-0010 D8 / OQ-C 已拍板):「自動 retry 但冇人知試過幾多次」比冇 retry 更差;要先令失敗變成可見、可查嘅事。
- **E. failure 紀錄同主 transaction 綁**(照抄 ADR-0009 D8.1)— rejected(D6):F2 場景下會一齊 rollback,最需要紀錄嗰刻寫唔低。
- **F(Chosen). 單一 `OutboundFailure` model + `kind` 分流補救 + 獨立寫入** — 三種失敗一個入口,補救動作各自正確,零新 runtime 元件。

## Consequences

- **Positive**:`§2.4` 第 5 點(冇交付保證)首次有答案;**F2 orphan ticket 由「只喺 log」變成可查可補**,而且補救路徑結構性禁止重複開 ticket(D3 + test);F3 靜默失敗變可見;零新 dependency、零新 runtime 元件。
- **Negative**:多一張有狀態表要維護;`payload` 含 PII → 要 access control(D4)+ 將來 retention 要一併考慮(同 `AuditLog` 一樣,見 `audit-retention` candidate);三處 catch block 要改,其中 `assign.service` 屬 **critical path**(H5:要有 test,Graph/SN 一律 mock);D7 係既有行為改動。
- **Neutral**:對帳方案甲 / ledger 兩層數字 / stage 掛 line item / sync gate / ADR-0008 provider 選路 / ADR-0009 audit **全部不受影響**。`AuditLog` ADMIN-only 不受本 ADR 影響(D4 只講 `OutboundFailure`)。
- **刻意留低嘅後果**:`OutboundFailure` **冇 `opcoId`**(D1)。將來若要開放 OPCO_IT 見自己 OpCo 嘅失敗,要靠 join 或補欄位 —— 同 `AuditLog` 冇 opcoId 係同一類取捨,寫低免得將來當成疏忽。

## References

- **ADR-0010 D8**(OQ-C 拍板人手 retry + 「唔等於零 schema」補註)—— 本 ADR 係其埋身落實
- ADR-0008(`RequestSubmissionProvider` direct/n8n 選路 · sc_request/sc_req_item 兩級)
- ADR-0009(`AuditService` 白名單一處做 · Decision 8.1 transaction 綁定 —— 本 ADR D6 刻意相反)
- `docs/02-architecture/audit-and-integration-observability.md` §2.4 第 5 點 · §7.2
- 現況查證(2026-07-21):`outbound-request.service.ts:79-131` · `assign.service.ts:131-204` · `direct-servicenow.provider.ts:28-42` · `n8n-workflow.provider.ts:66-101` · `RISK_REGISTER.md:24`
