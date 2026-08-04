# ADR-0024: Onboarding catalog task closure（UOP 存 n8n 畀嘅 task sys_id,assign 後直接 close）

**Date**: 2026-08-03
**Status**: Accepted — **部分 superseded by [ADR-0025](./0025-onboarding-license-request-creation.md)（2026-08-04）**
**Approver**: Chris Lai（2026-08-03）

> ### 🔴 2026-08-04 —— 本 ADR 一個**前提**被實測推翻,逐條講清楚邊部分仲有效
>
> **錯咗嘅前提**:以為 n8n 1001 把 WDA task 交畀 UOP 閂。實情係 **n8n 自己閂埋**(`close_notes = 'Closed & Handled by n8n'`,兩個 live 實例),而本 ADR 引用嘅 note-only 分支(1007)**由頭到尾冇跑過一次**(全 instance `Awaiting E5 licence` journal **0 行**)。
>
> **成因值得記低**:嗰個結論**唯一來源係 workflow JSON 嘅註釋同 sticky note**,由頭到尾冇打過真 SN 去對。**註釋係意圖,唔係行為證據。**
>
> | 本 ADR 嘅部分 | 之後點 |
> |---|---|
> | **D1** 兩個 task 欄(`serviceNowTaskSysId` / `serviceNowTaskNumber`) | **改用途做 traceability**(記低 n8n 幫呢條 line 處理過邊張 WDA task),**唔 drop column** —— nullable 欄成本零,對已部署嘅 UAT 做 drop migration 有風險冇收益 |
> | **D2** `mode` 分流 · **D3** adapter 重用 | **原封保留,一個字唔改** |
> | **D4** `TicketTarget` union · **D5** close 前必驗 `active=true` | **保留**,但 D5 個 rationale 要換 —— SCTASK0071807 唔係「被人手閂」,係 **UOP 自己喺 CH-020 驗證期間閂嘅**(見下) |
> | **D6 第一條** by-task close(task 優先於 RITM) | 🔴 **停用**(ADR-0025 D1)。留住佢會令每次 assign 都 PATCH 一張 n8n 已經閂咗嘅 task,被 `active` 閘正確拒絕,然後為一個唔存在嘅問題開一條 Delivery failure |
>
> 🔴 **D5 個 rationale 點解會記錯**:`SERVICENOW_USER === 'n8napiservice1'` —— **UOP 同 n8n 共用同一個 SN 帳號** ⇒ `sys_updated_by` / `assigned_to` 永遠分唔到邊個系統做,唯一指紋係 `close_notes`。呢個已入 `RISK_REGISTER` **R7**。
>
> 替代方案見 **ADR-0025**:UOP 自己建 + 閂一張 `O365 User License Maintenance Request`。

## Context

Chris 2026-08-03,經三輪查證後澄清:**n8n 1001 嘅 user onboarding workflow 會刻意把 Windows Domain Account 嗰張 catalog task 嘅 sys_id 送畀 UOP**,等 UOP 派完 default E5 licence 之後 close 佢,作為成張 request 嘅完結記錄。

呢個係實測確認嘅(讀 `docs/06-reference/03-n8n-workflow/phase 1/1001 - AD Management Workflow.json`),唔係推測:

```
WF1 - Prepare UOP Intake
  → WF1 - Resolve WDA Task    GET sc_task?request_item=<WDA RITM sys_id>&sysparm_limit=1
  → WF1 - Attach Task Id      摺入 serviceNowTaskSysId + serviceNowTaskNumber
  → IF - UOP needed?
  → WF1 - Call UOP Intake     POST /api/requests/intake
```

`Attach Task Id` 個註釋寫得好白:*「UOP hands this exact id back to 2004 (WF4) once the E5 licence is assigned.」*

### 實際 payload（1001 現行,flat mode-based）

```jsonc
{
  "mode": 1,
  "targetUpn": "…", "targetDisplayName": "…", "opcoCode": "RHK|RAPO",
  "requesterEmail": "…", "source": "1001-immediate",
  "requestId": "REQ00xxxxx",                  // REQ NUMBER,唔係 sysId
  "serviceNowTaskSysId": "<sc_task.sys_id>",  // ← catalog task
  "serviceNowTaskNumber": "SCTASK00xxxxx"
}
```

### 🔴 兩邊已經漂移咗,而且冇人發現

`n8n-native-intake.dto.ts:17` 寫住呢個 DTO 描述「the envelope n8n workflow **1001/1005 actually POST**」。但 1001 個 jsCode 而家第一行就係「**flat mode-based** UOP intake payload (contract 26 Jul 2026)」,並註明「Previous version (Option A **nested** payload …) — see red sticky」。

⇒ n8n 由 nested 改成 flat、又改咗打 canonical route,而 UOP 個 adapter 仍然為舊嗰個 nested 形狀而建。**今日 1001 打過嚟一定 400**(canonical DTO 兩個 required 欄 `serviceNowSysId` / `lineItems` 佢都冇送),而 `serviceNowTaskSysId` 等欄喺任何 UOP DTO 都唔存在,會被 `whitelist:true` 靜靜剝走。

### 就算接通咗個欄,close 都仲係唔會 work

`RequestLineItem.serviceNowSysId` 一路被當成 **RITM** sys_id(`schema.prisma:273-277` 明文),而 `DirectTicketProvider.pickTask()` 跑嘅係 `sc_task WHERE request_item=<id>^active=true`。餵一個 **task** sys_id 落去 = 問「邊啲 task 嘅 parent 係呢個 task」→ 永遠 0 row → fail closed。

⇒ 語意上兩邊各有一套模型,互相矛盾:UOP 要 RITM 自己搵 task;n8n 畀 task 預期交返 2004。而 ADR-0018 已經把 `n8n-ticket` 掣鎖死 `direct`(2004 未同步改),所以 n8n 嗰條路兩頭都未通。

### 點解係 H1

改 Prisma schema · 改 locked canonical intake route 嘅收貨行為 · 繞過 ADR-0018 D3 嘅「唯一 active task」保護 · 改 ADR-0017 seam ④ 嘅 provider 契約。四項任何一項都夠。

## Decision

### D1 — Schema:`RequestLineItem` 加兩個 nullable 欄

```prisma
serviceNowTaskSysId  String?  // sc_task sys_id — 平台 assign 後要 close 嗰張
serviceNowTaskNumber String?  // e.g. SCTASK0071807
```

**放 line item 唔放 request**:close 係喺 assign 一條 line 之後發生,而 assign 讀嘅就係 `item.*`。放 line item 令「邊條 line 負責 close 邊張 task」明文化,亦天然避免同一張 task 被兩條 line 各 close 一次。今日 onboarding 經 ADR-0020 注入**剛好一條** line,所以係 1:1。

### D2 — Route 共用,**contract 唔放寬**

Chris 2026-08-03 拍板「n8n 零改動」⇒ `POST /requests/intake` 要同時收兩種形狀。但**唔係**放寬 canonical DTO:

- payload **有** `mode` → 綁新 `N8nFlatIntakeDto`,行 flat 路
- payload **冇** `mode` → 綁今日隻 `N8nIntakeRequestDto`,**一個字唔改**,所有既有保證原封不動

⇒ ADR-0008 D6 嘅 locked contract 對「講緊佢嘅 caller」仍然係 locked。被共用嘅只係 URL,唔係 contract。呢個係本 ADR 同「放寬 contract」之間嘅關鍵分別。

`mode` 只認 `1`,其他值 fail-closed(唔估)。

### D3 — Flat 路重用既有 adapter 能力,唔另起爐灶

n8n flat payload 需要嘅三件事,`IntakeAdapterService` 已經有:

| 需要 | 既有實作 |
|---|---|
| REQ **number** → REQ **sysId**(idempotency key) | `resolveReqSysId()`（ADR-0017 D4 OQ-3 先例） |
| 冇 licence line → 注入 default SKU | `applyDefaultSku()`（ADR-0020） |
| Job Function → OpCo | **唔需要** — flat payload 自己送 `opcoCode` |

⇒ idempotency **不變**:仍然係 `Request.serviceNowSysId` 呢個 `@unique`,只係由 client 提供改成 server 反查。冇新 key、冇新 unique constraint。

`source` 記入 `rawRequestText` 或棄用(D7 OQ-2)。

### D4 — Seam ④ 契約:target 由 bare string 升級為 discriminated union

```ts
type TicketTarget =
  | { kind: 'ritm'; sysId: string }   // 今日行為:自己搵底下唯一 active task
  | { kind: 'task'; sysId: string };  // 新:已知 task,直接 patch
```

- `DirectTicketProvider` 兩種都實作
- `N8nTicketProvider` `ritm` 維持今日行為;`task` 回 `error` outcome(**唔 throw**)並講明 2004 未支援 —— 反正 ADR-0018 已經把佢鎖死 `direct`,呢個只係把「未通」講出嚟而唔係假裝支援

### D5 — 🔴 Close 前必驗 `active=true`,唔係就 fail closed

Chris 2026-08-03 拍板。Patch 之前先 GET 嗰張 task:

- 搵唔到 → `error`「task 不存在」
- `active=false` → `error`「task 已經閂咗,平台唔會重開或覆蓋」
- `active=true` → 照舊補 `assigned_to`(空先補)+ patch `state=3` + `close_notes`

**點解一定要**:D4 `kind:'task'` 由構造上就繞過咗 ADR-0018 D3 嗰個「唯一 active task」保護 —— 嗰條規矩存在嘅原因係「唔好閂人哋張 task」。而呢個唔係假想風險:**REQ0044049 就係活例** —— SCTASK0071807 喺導入之後被人閂咗(state 3,assigned 畀一個真人),冇呢道閘,平台就會去 re-close 一張人哋做完嘅 AD task,而且之後會顯示成功。

代價 = 每次 close 多一個 GET。收貨。

### D6 — Assign 嘅優先次序

`assign.service.ts` 現有兩個分支之上加一層:

```
1. item.serviceNowTaskSysId  → close BY TASK（D4 kind:'task' + D5 active 閘）
2. item.serviceNowSysId      → 今日行為（RITM → pickTask → close）
3. request.serviceNowSysId   → 今日行為(parent REQ work note)
```

既有兩條路**一個字唔改**。實測證實佢哋 work(REQ0044038 → SCTASK0071802 / REQ0044067 → SCTASK0071828,兩張都係 1 張 active task,close 會成功),所以冇理由動佢哋。

失敗仍然 **non-fatal**(ADR-0011 OD4):licence 已經派咗、ledger 已經郁咗,寫唔到 SN 只落 Delivery failures,唔會把成功嘅 assign 變成失敗。

## Alternatives Considered

- **n8n 改送 RITM sys_id,UOP 維持今日 close 邏輯** — UOP 側幾乎零改動(只需接個欄),而且 close 路徑實測已 work。**被 Chris reject**,理由:要 n8n 側改,而目標係「先把整體流程打通」,直接喺 UOP 連 M365 + ServiceNow 更快。本 ADR 記低呢個係**被時序 reject 而唔係被質素 reject** —— 若日後 2004 更新,呢條仍然係較乾淨嘅終態。
- **UOP 存 task sys_id 但交返 2004 close**(n8n 原設計) — reject:2004 未改,`n8n-ticket` 被 ADR-0018 鎖死 `direct`,三邊都要郁先通。
- **放寬 canonical DTO 令 `serviceNowSysId` / `lineItems` 變 optional** — reject:`serviceNowSysId` 係 `@unique` idempotency key,變 optional 等於整張 contract 嘅重複保護冇咗。D2 個 `mode` 分流達到同樣效果而 canonical caller 零影響。
- **開第三條 intake route** — reject:ADR-0017 D4 OQ-3 明文揀「one caller, one trust boundary, one secret to rotate」;而且 n8n 一樣要改 URL,成本同「改打 native route」一樣,卻多一個長期入口。
- **Close 唔驗 active** — reject,見 D5。

## Consequences

- **Positive**:onboarding 全鏈打通 —— n8n 建戶 → UOP 收 task id → 派 E5 → 閂返嗰張 catalog task;n8n **零改動**;canonical contract 對既有 caller 零影響;既有兩條 close 路徑原封保留;D5 令「閂錯人哋 task」由可能變成擋得住。
- **Negative**:`/requests/intake` 由一條 contract 變成兩條(靠 `mode` 分流)—— 讀 code 嘅人要知呢件事,所以 controller 同 CONTRACT.md 都要明寫。Seam ④ 個 signature 改咗,兩個 provider + 其 test 都要跟。每次 by-task close 多一個 GET。
- **Neutral**:唔掂 ledger / reconcile / drift;唔改 ADR-0020 注入邏輯本身(只係注入嗰條 line 而家會多帶一個 task id);ADR-0018 對 `kind:'ritm'` 嗰條路完全不變。

## Open Questions

| # | 問題 | 建議 default |
|---|---|---|
| **OQ-1** | n8n 個 `Resolve WDA Task` query **冇 `^active=true`** 兼 `limit=1`,可以攞到一張已閂嘅 task 送過嚟(REQ0044049 實例)。UOP 側 D5 會擋住,但根源喺 n8n。 | UOP 照擋(D5),**同時**把呢點交返 n8n 側修。唔喺 UOP 補 n8n 嘅漏。 |
| **OQ-2** | `mode` / `source` 兩個欄 UOP 要唔要保存? | **唔存**。`mode` 係分流用,`source`(`'1001-immediate'`)屬 n8n 內部追蹤。要 trace 有 audit + `serviceNowNumber`。 |
| **OQ-3** ✅ **RESOLVED** | 個 HTTP node 用 credential「n8n Academy API Key」,workflow JSON 睇唔到佢送咩 header。若唔係 `X-Intake-Key`,連 401 都過唔到。 | **Chris 2026-08-03 確認 n8n 側已經送緊。** 風險 R4 由 🔴 High/High 降為已解。⚠️ 平台側仍然**驗證唔到**呢件事(header 名喺 n8n credential 入面,UOP 睇唔到)—— 若日後 intake 突然全部 401,呢度係第一個要查嘅位。 |

## References

- `docs/06-reference/03-n8n-workflow/phase 1/1001 - AD Management Workflow.json`（節點 `WF1 - Prepare UOP Intake` / `Resolve WDA Task` / `Attach Task Id` / `Call UOP Intake`;⚠️ 目錄 gitignored,見 SEC-001）
- [ADR-0008](0008-request-creation-n8n-d365-scope.md) D6（canonical contract LOCKED · 兩層 REQ/RITM）
- [ADR-0017](0017-n8n-execution-seams-switchable-integration.md) D3/D4（seam ④ · 另開 route 而唔改 canonical 嘅 pattern）
- [ADR-0018](0018-servicenow-catalog-task-closure.md) D3/D4（close catalog task · 唯一 active task 保護 · `n8n-ticket` 鎖死 direct）
- [ADR-0020](0020-default-onboarding-sku-injection.md)（onboarding 無 licence line 時注入 default SKU）
- [ADR-0011](0011-outbound-failure-queue.md) OD4（SN 寫入失敗 non-fatal）
- `apps/api/prisma/schema.prisma:263-288` · `assign.service.ts:315-375` · `direct-ticket.provider.ts` · `intake-adapter.service.ts`
- CLAUDE.md §5 H1（schema + 契約 + 保護機制）/ H5（assign = critical path)
- 落地 = **CH-020**
