# ADR-0010: 整合可觀測性 + 交付保證(connector 狀態 / test connection · n8n 回程 webhook · outbound retry)

**Date**: 2026-07-21
**Status**: **Proposed** —— 待 Chris 拍板 §OQ 三點(OQ-A / OQ-B / OQ-C)
**Approver**: Chris Lai(pending)

## Context

`audit-and-integration-observability.md §6` 嘅 rollout,item 1-3 已收官(ADR-0009 / W28 / W29)。本 ADR 覆蓋餘下三項:

| item | 內容 | 觸發 |
|---|---|---|
| **4** | Integration 狀態 + Test connection | 🟡 新 endpoint 面(輕度 H1)· **🔴 H4:絕不可回傳 secret** |
| **5** | n8n 回程 webhook(外部可推 stage) | **H1**(改 stage 推進來源)+ **外部阻塞** |
| **6** | Outbound 交付保證 / retry(解 RISK R3) | **H1 + H2**(啟用 BullMQ) |

### 現況查證(2026-07-21,全部有 code 佐證)

- `src/integration/` **零** `testConnection` / `healthCheck` / `ping` 實作(grep 無 match)。
- `settings.tsx:237-247` Integrations tab = allocation import + 一個 EmptyState,文案自認需要 integration-status API。
- `app.module.ts:12-23` 只有 `ScheduleModule.forRoot()` —— **BullMQ 完全未啟用**,Redis 得 docker-compose 起咗但無 app 用。

### 🔑 三個查證揭示嘅結構事實(重塑咗 item 4 嘅設計)

**1. 「connector 有冇配置好」對一半 connector 係恆真命題。**

`GraphService`(`graph.service.ts:37-46`)同 `ServiceNowService`(`servicenow.service.ts:22-33`)喺 **constructor** 用 `getOrThrow`;`IntakeKeyGuard`(`intake-key.guard.ts:24`)同樣,而佢喺 `fulfilment.module.ts:58` 嘅 `providers` 入面 → **bootstrap 就 instantiate**。

即係話:**呢三個缺 config 就 app 直頭 boot 唔起。** 你能夠打到 status endpoint,就已經證明佢哋配置咗。一個回傳 `configured: true` 嘅欄位喺呢度**冇資訊量**。

**2. n8n outbound 係唯一真正 optional 嘅。**
`requestSubmissionProviderFactory`(`fulfilment.module.ts:26-33`)只喺 `REQUEST_SUBMISSION_PROVIDER=n8n` 先 `new N8nWorkflowProvider`,所以未選中時 URL / key 可以完全唔存在。

**3. UI 承諾咗一個唔存在、而且 out-of-scope 嘅 connector。**
`settings.tsx:244` 文案寫「Microsoft Graph, ServiceNow and **DocuWare**」。但後端 grep **零** DocuWare,而 CLAUDE.md §5.3 明文列 DocuWare 為 LicenseOps 排除項(成本發票 → DocuWare,平台只記 `quoteRef`/`poRef`)。

## Decision

### D1 — 範圍:本 ADR 只解封 item 4;item 5 / 6 定原則唔開工

item 4 完全自足。item 5 卡外部合約(§7.1),item 6 要 owner 揀路線(OQ-C)。**一次過寫低三者嘅原則,但只有 item 4 即刻可以起 phase** —— 避免為咗湊夠一個 ADR 而擅自解封有阻塞嘅嘢。

### D2 — 🔴 status endpoint 絕不回傳 secret 值,連 masked 都唔回

只回 boolean / 派生 metadata。**唔做 `sk-••••1234` 呢類遮罩** —— 遮罩仍然洩漏長度同尾碼,而且會令「回傳咗 secret 嘅一部分」變成可接受嘅慣例。要知邊個 key 用緊,睇部署環境,唔係睇 API。

同 W29 一樣採 **allow-list**:回應 DTO 明文列出可回傳欄位,新增欄位係一個要 review 嘅決定。

### D3 — 唔講「configured?」,改講三態 + liveness

因應查證事實 1,`configured` 改成一個**誠實描述部署形態**嘅欄位:

| state | 意思 | 適用 |
|---|---|---|
| `required` | boot 時強制,行緊 = 一定配置咗 | Graph · ServiceNow · intake key |
| `active` | optional 且**當前選用中** | n8n outbound(`REQUEST_SUBMISSION_PROVIDER=n8n`) |
| `inactive` | optional 且未選用 | n8n outbound(預設 direct) |

**真正有資訊量嘅係 liveness**(D4 / D5),唔係 configuredness。呢個係本 ADR 對原 rollout 描述「已配置 ✓✗」嘅**修正**。

### D4 — 「最後成功時間」先由既有 domain timestamp 派生,唔開新 model

已經有真實信號可用:

| connector | 派生來源 |
|---|---|
| Graph | `max(SkuCatalog.lastSyncedAt)` · `max(TenantSkuSnapshot.capturedAt)` |
| ServiceNow | 最近一張有 `serviceNowSysId` 嘅 `Request` |
| n8n inbound | 最近一張 `origin` = intake 嘅 `Request`(ADR-0008) |

**零新 schema、零新寫入路徑、零迴歸面。** 代價係佢係**代理信號**(proxy):反映「最近一次成功用過」,唔係「最近一次探測通過」。UI 必須誠實標示(**唔可以叫佢 "Last health check"**)。

> **唔把整合結果寫入 `AuditLog`。** ADR-0009 個表答嘅係「邊個改咗乜」;connector 通唔通係另一回事,溝埋會污染 audit trail 同 P-B 嘅 PII 邊界推理。真要獨立健康史 → 見 OQ-B。

### D5 — Test connection = 唯讀探針,ADMIN-only,逐 connector 明文定義

**🔴 絕不可有副作用。** 逐個定死:

| connector | 探針 | 點解 |
|---|---|---|
| Graph | `GET /subscribedSkus`(既有 `getSubscribedSkus`) | 已經係唯讀,零新 scope |
| ServiceNow | `GET` 表 + `sysparm_limit=1` | **絕不可 `createRecord`** |
| n8n outbound | **只驗配置存在,唔打 webhook** | webhook = **建真 ticket**(ADR-0008 乙/丙),「測試」一下就開咗張單係不可接受嘅副作用 |
| n8n inbound | **不適用** —— 方向係外部推入嚟,平台無得主動測 | |

`@Roles(ADMIN)`(同 W28/W29 一致)。探針失敗一律轉成結構化結果(沿用既有 `graph-unavailable.ts` 503 wrap 手法),**唔可以把 vendor 原始 error 直接吐畀前端** —— 佢可能含 instance URL / 帳號提示。

### D6 — 唔起 DocuWare connector;改正 UI 文案

DocuWare 屬 H3 排除項。item 4 **唔可以**因為 EmptyState 寫咗就順手起一個 row —— 反而要**修正文案**,唔好向用戶承諾一個刻意唔做嘅整合。

### D7 — item 5(n8n 回程 webhook)原則:唔可以繞過 stage machine

開放外部推 stage **會改寫入來源**,而「stage 掛 line item」+ stage 推進係 **locked 決策**(CLAUDE.md §5.1)。原則:

1. 回程 webhook **只可以經既有 stage machine**,唔可以直接 `update` line item stage 欄位;
2. 每個外部推進要落 audit(actorType `m2m`,ADR-0009 已支援);
3. 合約要同 n8n owner 對真值先做 —— 否則重蹈 `n8n-workflow.provider.ts:22-28` 個 REPRESENTATIVE 覆轍(§7.1)。

**本 ADR 唔解封 item 5**,待 OQ-D(合約會)。

### D8 — item 6(retry)原則:先解「睇得見 + 撳得返」,自動化係第二步

無論行邊條路,**失敗必須先變成一件可見、可查嘅事**。「自動 retry 但冇人知試過幾多次」比冇 retry 更差。路線選擇 = **OQ-C**。

## Alternatives Considered

- **A. status endpoint 回 masked secret** — rejected(D2):遮罩仍洩漏長度/尾碼,且令「回一部分 secret」變成慣例。
- **B. 開 `IntegrationHealth` model 記每次探測** — 暫緩(D4):新 schema + 新寫入路徑,而 domain timestamp 已足夠答「最近成功用過未」。留 OQ-B,量夠痛先做。
- **C. 把整合成敗寫入 `AuditLog`** — rejected(D4 註):混淆兩種 concern,污染 ADR-0009 嘅 PII 邊界推理。
- **D. Test connection 真打 n8n webhook** — rejected(D5):會建真 ticket。
- **E. item 4/5/6 一次過解封** — rejected(D1):5 有外部阻塞、6 未揀路線,綁埋只會令可做嘅嘢等埋唔做得嘅。

## Consequences

- **Positive**:Integrations tab 首次有真內容;`configured` 語意誠實(唔講恆真廢話);零新 dependency、零新 schema(D4)→ item 4 風險低;DocuWare 文案矛盾順手修正;item 5/6 原則先寫低,將來唔會臨場亂決定。
- **Negative**:D4 係代理信號,答唔到「而家通唔通」(要撳 Test connection);n8n outbound 無得真測(D5),只驗到配置;item 5/6 仍然 pending。
- **Neutral**:ADR-0008 provider 選路 / ADR-0009 audit / 對帳方案甲 / ledger 兩層數字 / sync gate 全部不受影響。

## Open Questions(要 Chris 答)

| # | 問題 | 影響 |
|---|---|---|
| **OQ-A** | Test connection 容唔容許**主動打真 tenant / 真 SN instance**(唯讀 D5)?定係只准報派生狀態,唔主動出站? | blocking item 4 嘅 Test connection 掣。容許 = 有真 liveness;唔容許 = tab 只得 D4 代理信號 |
| **OQ-B** | 「最後成功時間」行 **D4 派生**(零 schema),定係開 `IntegrationHealth` model 記真探測史? | blocking item 4 資料模型。派生 = 快而輕;新 model = H1 + 真歷史 |
| **OQ-C** | item 6 行 **人手 retry**(失敗記錄 + UI 重試掣,零新 runtime 元件)定 **BullMQ 自動 retry**(H2 啟用已 lock 但從未用嘅元件)? | blocking item 6 |
| **OQ-D** | 幾時同 n8n owner 開合約對齊會? | blocking item 5(外部,唔喺我哋手上) |

> OQ-A / OQ-B 拍板即可開 item 4 phase(W30)。OQ-C / OQ-D 唔 block item 4。

## References

- `docs/02-architecture/audit-and-integration-observability.md` §2.4(整合現況)· §6(rollout)· §7(hard constraint 逐項)· §7.1 / §7.2
- ADR-0008(n8n 雙向 / provider 選路 / intake)· ADR-0009(audit trail;D4 註解點解唔溝埋)
- `CLAUDE.md` §5.1 H1 · §5.2 H2 · §5.3 H3(DocuWare 排除)· §5.4 H4
- `RISK_REGISTER.md` R3(outbound 無交付保證)
- 現況查證(2026-07-21):`graph.service.ts:37-46` · `servicenow.service.ts:22-33` · `intake-key.guard.ts:24` · `fulfilment.module.ts:26-33,58` · `app.module.ts:12-23` · `settings.tsx:237-247` · DocuWare grep 零 match
