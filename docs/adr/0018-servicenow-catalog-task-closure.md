# ADR-0018: ServiceNow 履行完成改為 close catalog task,RITM 交返 SN 自己嘅 workflow 推

**Date**: 2026-07-29
**Status**: **Proposed** —— 🔴 **OQ-1 / OQ-2 未有答案之前唔可以 Accept**(理由見 §Open Questions)
**Approver**: Chris Lai(方案方向 2026-07-29 已 approve;細節待 SN owner 答完 OQ)

## Context

### 觸發

Chris 2026-07-29:「**除咗 requested item 之外,其實係要更新 catalog task 嘅狀況,先至可以令 request item close / completed**。」

即係話 ADR-0017 D3 落地之後平台做緊嘅嘢(直接 PATCH `sc_req_item.state = 3`),喺 Ricoh 嘅 instance **未必真係令張單 close**。

### 查證(2026-07-29,SN dev `ricohapdev` 真連,**只做 GET**)

呢次係 ServiceNow **第一次真正接通**(之前 probe 一直失敗,根因係公司 proxy MITM 咗 SN host 而 Node 唔讀 Windows 憑證庫 —— 同本 ADR 無關,已另行處理)。

**① 三邊實作完全一致:全部只寫 `sc_req_item`,冇一個掂 task**

| 邊 | 寫咩 | 出處 |
|---|---|---|
| 平台 direct | `sc_req_item` 嘅 `state` / `work_notes` / `close_notes` | `direct-ticket.provider.ts:28-42` · `RITM_TABLE = 'sc_req_item'`(**刻意 hard-code**,`ticket-update.provider.ts:136-141`) |
| n8n 2004 | 同上,patchUrl 焗死 `/api/now/table/sc_req_item/` | `Validate & Build Patch` node |
| n8n 1007(AD 類) | 同上,`newState: '3'` | `Prepare SN Update` node |

全套 10 個 workflow JSON **`sc_task` / `catalog_task` 零命中**。

**② 2004 個 sticky note 講明係刻意嘅**

> RITM ONLY. 3 fields: state, work_notes, close_notes.
> **No stage, no tasks, no REQ — deliberate: hidden SN logic beneath them**, same rationale as 1007.

⇒ 呢個唔係「漏咗做」,係當初**有意識決定唔掂 task**,理由係「底下有隱藏 SN 邏輯」。本 ADR 唔係推翻嗰個直覺 —— **恰恰相反**:嗰段隱藏邏輯先係應該負責 close RITM 嗰個,而平台一直繞過咗佢,自己去改 RITM 個 state。

**③ SN dev 真實數據支持 Chris 講法**

```
sc_task 可讀(78 欄),關鍵欄位:
  request_item(→ RITM 嘅 reference)· parent · request · state · active
  · close_notes · work_notes · closed_at · closed_by

真實樣本:
  RITM0042590   state=1  stage=execution  active=true
    └─ SCTASK0064121  state=-5  active=true
```

即 RITM 停喺 `execution` 而底下 task 仲開住 —— 正正係 Chris 描述嘅形狀。

### 今日嘅失敗模式(點解要即刻處理)

`ServiceNowService` 任何 2xx 就當成功,而 `DirectTicketProvider` 收到 200 就回 `{status:'updated'}`。所以就算 SN 收咗個 PATCH 但**張單實際上因為 task 未完而冇 close**,平台一樣會:

- 標記 line item 已完成
- 唔會入 `OutboundFailure` 佇列(佢只接 throw)
- 唔會有任何 audit 講「其實冇 close 到」

⇒ **平台宣稱完成、SN 側張飛實際仲開住,而且冇任何一邊會嘈。** 呢個係最差嗰種失敗:靜靜地唔一致,要等人手對數先發現。

### 觸發嘅 hard constraint

- **§5.1 H1** —— seam ④ 由「只寫 `sc_req_item`」擴到「寫 `sc_task`」,係新 vendor 寫入面;`RITM_TABLE` 個 hard-code 有明文理由,改佢必須有 ADR。
- **§5.3 H3** —— 「推 RITM 狀態」同「推 task 狀態」係兩件唔同嘅事,唔可以當 refactor 順手做。

## Decision

### D1 — 🔴 平台只 close **catalog task**,唔再自己推 RITM 狀態

履行完成時,平台 PATCH 嘅對象由 `sc_req_item` 改為該 RITM 底下**平台負責嗰張 `sc_task`**。RITM 由 **ServiceNow 自己嘅 workflow** 因應 task 完成而推進。

**點解揀呢個而唔係「兩張都 PATCH」(方案 A)**:

1. **唔同 SN 狀態機打交。** RITM 幾時 close、要唔要全部 task 完先 close、close 之後仲有冇 approval / stage 要行 —— 呢啲係 SN 側配置,會變,而且唔喺我哋手上。平台一旦自己推 RITM,就等於**喺平台 code 入面複製咗一份 SN 嘅業務規則**,SN 一改就靜靜失效。
2. **同 D0 同源。** ADR-0017 D0 講「只換執行器,唔換決策者」。喺 SN 狀態機呢件事上,**決策者係 SN**,平台唔應該做佢個決策。
3. **2004 個 sticky 嘅顧慮反而由呢個方案解決。** 佢驚「hidden SN logic beneath」—— 方案 B 就係**唔繞過**嗰段邏輯,而係餵佢應該收到嘅輸入。

### D2 — 兩個 transition 都落 task,唔淨係 close

`markInProgress`(ADR-0016 預算 gate 擋 = 採購中)一樣改為寫 task。

理由:如果 close 落 task 而 hold 仍然落 RITM,同一個 seam 兩個方法寫兩張唔同嘅單,語意會極難解釋,而且 hold 咗 RITM 之後 SN workflow 可能再推唔郁。**一個 seam 一個對象。**

### D3 — 選 task 嘅規則:平台只掂**自己嗰張**,一張都揀唔到就 fail-closed

一張 RITM 可以有多過一張 catalog task(SN 常見:approval task + fulfilment task)。平台**絕不**「見到 active task 就全部 close」。

具體識別規則 **⇒ OQ-4**,未有答案之前唔可以實作。

**Fail-closed**:揀唔到唯一一張 task → **唔 PATCH 任何嘢**,入 `OutboundFailure` 佇列(ADR-0011 pattern)+ 記 audit,由人手處理。沿用 ADR-0017 D4 對 SKU resolve 嘅同一態度:**多過一個候選 = 唔准揀第一個**。

### D4 — `sc_task` 加入 seam ④ 嘅寫入面,`RITM_TABLE` 保留

新增 `TASK_TABLE = 'sc_task'`。`RITM_TABLE` **唔刪** —— 佢仲有 caller(work note 路徑仍然直連 `ServiceNowService` 寫 RITM,見 ADR-0017 W40 OQ-A)。

⚠️ `RITM_TABLE` 個註解寫住「hard-code 係為咗兩條路唔會分岔」,呢個理由對 `TASK_TABLE` **一樣成立**,所以同樣 hard-code,唔跟 `SERVICENOW_DEFAULT_TABLE`。

### D5 — D0 不變

平台仍然係決策者:幾時算履行完成、幾時算採購中,全部由平台判斷。改變嘅只係**我哋把呢個決定寫落 SN 邊一張 record**。

### D6 — 🔴 n8n 2004 必須同步改,而佢唔喺本 repo

2004 個 patchUrl 焗死 `sc_req_item`。ADR-0017 **D0 要求兩條路做同一件事** ⇒ 平台改咗而 2004 冇改,`ticketUpdateProvider = 'n8n'` 就會**同 direct 路徑做緊唔同嘅事**。

**⇒ 喺 2004 改好之前,`n8n-ticket` 掣唔可以切去 `n8n`。** 呢個限制要同時寫入平台 code comment 同 n8n 側 sticky note。

（實際影響有限:ADR-0017 辛已聲明 n8n 路徑「真切換未經任何 live 驗證」,前置一直未通。）

### D7 — 明確唔做(守 H3)

- **唔掂 `sc_request`(REQ)** —— 沿用 ADR-0017 W40 嘅判斷:REQ 唔係 RITM,其他 line 可能仲開住。
- **唔掂 1007 嘅 AD 類 task** —— RITM 分工邊界(ADR-0017 D3)照舊,只係而家多咗一層 task 要守同一條線。
- **唔改** ledger invariant / `reconcile` / stage machine / 預算 gate。
- **唔做** 「close 完再查返 RITM 有冇真係 close」嘅輪詢確認 —— 想做嘅話係另一個 change(而且大機會要等 SN 側 async workflow 跑完,唔係即時可讀)。
- **唔改** work note 路徑(仍然直連 `ServiceNowService` 寫 RITM,ADR-0017 W40 OQ-A 已拍板)。

## Open Questions（🔴 前兩條係 Accept 嘅 gate)

| OQ | 問題 | 點解 blocking | 問邊個 |
|---|---|---|---|
| **OQ-1** 🔴 | **close 晒 catalog task 之後,RITM 會唔會自動 advance 到 Closed Complete?** | **方案 B 嘅整個前提就係呢句。** 如果唔會自動推,平台 close 咗 task 但冇人 close RITM ⇒ 張單**永遠唔會 close**,比今日更差(今日至少 RITM 個 state 係 3)。答案係「唔會」的話,本 ADR 要改揀方案 A | SN owner / Andy |
| **OQ-2** 🔴 | **integration 帳號有冇 `sc_task` 寫權?** | 讀係實測到嘅(78 欄),**寫冇測** —— 測一次就要真改一張真客戶單,唔可以為咗探路而做。而且 2004 個 sticky 已警告 `n8napiservice1` 有 **row-level ACL**,「睇得到 ≠ 改得到」 | SN owner / Andy |
| OQ-3 | `sc_task.state` 嘅值域係咩?close 應該寫邊個值? | `sys_choice` 返 **403**,integration 帳號讀唔到值域。實測見到 `-5` 同 `1`。SN 預設係 `-5 Pending / 1 Open / 2 WIP / 3 Closed Complete / 4 Closed Incomplete / 7 Cancelled`,但**喺呢個 instance 未經證實**,唔可以照抄 | SN owner |
| OQ-4 | 一張 RITM 有多張 task 嗰陣,平台應該認邊張?(`assignment_group`? `short_description`? `sys_class_name`? 定係「唯一 active 嗰張」?) | D3 fail-closed 規則要有具體判斷條件先寫得出 | SN owner |
| OQ-5 | RITM 個 `stage`(見到 `execution`)需唔需要平台掂? | 樣本 RITM 停喺 `execution`。若 stage 要人手推,方案 B 一樣唔完整 | SN owner |

⚠️ **OQ-1 唔係「實作細節」,係「本 ADR 揀邊個方案」。** 所以本 ADR 停喺 **Proposed**,唔會因為方向已 approve 就標 Accepted。

## Alternatives Considered

- **A — 平台 close task,然後自己再 PATCH RITM `state=3`** — rejected(Chris 2026-07-29 揀 B):做得到而且「保證」張單 close,但等於把 SN 嘅狀態機規則複製入平台。SN 側改咗(加多張 task、加 approval、改 stage 流程)平台唔會知,而且會出現「平台強推 close 但 SN workflow 仲以為喺 execution」呢類更難查嘅狀態。**保留為 OQ-1 答「唔會自動推」時嘅 fallback。**
- **C — 當係 SN 側配置問題,平台不變** — rejected:今日嘅行為係「宣稱完成但實際未 close 而且冇人知」。就算最後真係要 SN 側改配置,平台呢邊靜靜報成功都係錯,起碼要偵測到唔一致。
- **D — close 晒該 RITM 底下所有 active task** — rejected:會 close 埋唔屬於平台責任嗰啲(例如 approval task、其他組嘅 fulfilment task),直接違反 ADR-0017 D3 分工邊界嘅精神。
- **Chosen: B** — 平台只 close 自己嗰張 catalog task,RITM 交返 SN workflow 推。順住 SN 原生設計,唔同佢打交;而且 2004 sticky 當初避開 task 嘅理由(「hidden SN logic beneath」)喺呢個方案下面反而係支持而唔係反對。

## Consequences

- **Positive**:平台唔再繞過 SN 自己嘅狀態機 ⇒ SN 側改流程唔會靜靜令平台失效;「履行完成」呢個訊號送到正確嘅 record;fail-closed 令「認唔出應該掂邊張 task」變成一個**看得見**嘅失敗而唔係靜靜做錯。
- **Negative**:平台失去「PATCH 完就知張單 state 係 3」呢個即時確認 —— RITM 由 SN async 推,平台只知 task 已 close;真正確認要另開 change(D7 明確唔做)。多咗一個 vendor 寫入面(`sc_task`)⇒ 多一組權限要求(OQ-2)。**n8n 2004 未改之前,`n8n-ticket` 掣鎖死喺 `direct`**(D6)。
- **Neutral**:ADR-0017 **D0 / 三接縫模型 / RITM 分工邊界一個字都冇改**;`TicketUpdateProvider` 個抽象形狀(兩個方法、outcome 詞彙、transport throw)不變 —— 改嘅係實作寫邊張 record;ledger / reconcile / stage machine / 預算 gate 零改動;**零 schema 改動**(平台唔需要記 task sys_id —— 每次由 RITM 反查,見 CH-010)。

## References

- **ADR-0017** D0(只換執行器唔換決策者)· D3(seam ④ + RITM 分工邊界)· W40 辛實作補註(OQ-A `addWorkNote` 唔入介面 · OQ-E 邊個 trigger close/hold · `ticketHeldAt`)—— 本 ADR **修改 D3 嘅寫入對象**,其餘**不 supersede**
- ADR-0008 D6(REQ / RITM 兩層 · 一個 line item 一張 RITM)
- ADR-0011(outbound 失敗佇列 · 失敗唔可以令已成功嘅 assign 變失敗)—— D3 fail-closed 走同一條路
- ADR-0016 D6(預算 gate 擋 = `markInProgress` 嘅 trigger)
- ADR-0009(audit)· ADR-0013(connector 配置,本 ADR 零新配置)
- `apps/api/src/integration/ticket-update/`(`ticket-update.provider.ts` = 契約 · `direct-ticket.provider.ts` · `n8n-ticket.provider.ts`)
- `docs/06-reference/03-n8n-workflow/phase 2 (with UOP)/PROJ-002 2004 - SN Request Item Update (UOP).json`(sticky「RITM ONLY … deliberate」· patchUrl 焗死表名)· `phase 1/1007 - AI Hands Executor.json`
- `docs/05-usage/SERVICENOW-CONTRACT-ALIGNMENT.md`(交 SN owner 嘅對齊清單 —— OQ-1~5 應併入)
- CLAUDE.md §5.1 H1 · §5.3 H3 · §5.5 H5
