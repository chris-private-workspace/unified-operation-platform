# ADR-0018: ServiceNow 履行完成改為 close catalog task,RITM 交返 SN 自己嘅 workflow 推

**Date**: 2026-07-29
**Status**: **Accepted**(2026-07-29 —— OQ-1 / OQ-2 兩個 gate 已答,見 §Open Questions)
**Approver**: Chris Lai

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

### D3 — 選 task 嘅規則:**該 RITM 底下唯一嗰張 `active=true` task**,否則 fail-closed

平台**絕不**「見到 active task 就全部 close」。

**規則(2026-07-29 實測定案,OQ-4)**:由 RITM sys_id 查 `sc_task`,取 `active=true` 嗰啲 ——

- **剛好 1 張** → 就係佢,PATCH
- **0 張 或 ≥2 張** → **唔 PATCH 任何嘢**,入 `OutboundFailure` 佇列(ADR-0011 pattern)+ 記 audit,由人手處理

**點解「唯一 active」夠用 —— 有反例檢查,唔係假設**:抽 800 筆 `sc_task` 覆蓋 **772 張 RITM**:

| 觀察 | 數字 |
|---|---|
| 每張 RITM 嘅 **總** task 數 | 1 張:**745** · 2 張:26 · 3 張:1 |
| 每張 RITM 嘅 **active** task 數 | 0 張:744 · **1 張:28** · **≥2 張:0** 🔴 |

⇒ **772 張入面冇一張有兩個或以上 active task。** 即係話「多張 task」呢個情況真實存在(27 張),但**唔會同時 active** —— 佢哋係順序行嘅。close 嗰刻要面對嘅永遠係一張。

**其他識別方式查過都冇用**:`sys_class_name` 全部 `sc_task`(冇 subclass)· `order` 全部空。`assignment_group` 有值但**唔需要用** —— 加咗只會令規則綁死一組 group id,SN 側改組織就爛。

⚠️ **`≥2 張` 嘅分支仍然要寫、要有 test。** 抽樣冇出現 ≠ 唔會發生;而嗰個 case 一旦發生,「揀第一個」就係 close 咗人哋張單。沿用 ADR-0017 D4 對 SKU resolve 嘅同一態度:**多過一個候選 = 唔准揀第一個**。

### D3b — close 寫 `state = '3'`,hold 寫 `state = '2'`(OQ-3)

`sys_choice` 就算用 admin 帳號都仍然 **403**(table-level 限制,唔係 role 問題),所以值域由**真數據反推**:

| state | 出現次數 | 其中 active=true |
|---|---|---|
| **3** | **595** | **0** |
| 7 | 151 | 0 |
| 1 | 24 | **24** |
| 4 | 24 | 0 |
| -5 | 4 | 3 |
| 2 | 2 | 1 |

`3` 係壓倒性主導嘅**終態**(595 筆全部 `active=false`),同 SN 預設 `3 = Closed Complete` 一致,亦同平台 / 1007 / 2004 一直對 RITM 用嘅值一致(`RITM_STATE.closedComplete`)。`2` 見到有 active 嘅,對應 Work in Progress。

⚠️ **呢個係推斷,唔係 instance 自己嘅 choice list 確認。** 信心高(終態分佈 + 三個現存實作都用 3),但 label 對應未經 SN owner 書面確認 —— 實作時 constant 要**寫明出處係經驗值域**,同 `RITM_STATE` 寫明出處係 2004 JSON 一樣。

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

## Open Questions

**全部已解決(2026-07-29)。** 前兩條係 Accept 嘅 gate,由 Chris 代 SN owner 答;後三條由 read-only 查證自行解決。

| OQ | 問題 | 答案 |
|---|---|---|
| **OQ-1** 🔴 | close 晒 catalog task 之後,RITM 會唔會自動 advance? | ✅ **Chris 2026-07-29**:「喺 UOP 只需要處理 **catalog task** 嘅狀態就足夠,**RITM 嘅狀態由 ServiceNow workflow 去處理**」⇒ **方案 B 成立**,fallback(方案 A)唔啟用 |
| **OQ-2** 🔴 | integration 帳號有冇 `sc_task` 寫權? | ✅ **有** —— Chris 確認該帳號係 **admin 權限**。⚠️ 見下面「權限觀察」 |
| OQ-3 | `sc_task.state` 值域 | ✅ 由真數據反推,見 **D3b**。`sys_choice` 即使 admin 帳號都仍然 403 ⇒ table-level 限制,唔係 role 問題 |
| OQ-4 | 多張 task 時認邊張 | ✅ **「唯一 active」**,772 張 RITM 零反例,見 **D3** |
| OQ-5 | RITM 個 `stage`(見到 `execution`)使唔使平台掂? | ✅ **唔使** —— 併入 OQ-1 嘅答案:`stage` 係 RITM 嘅屬性,而 RITM 整體交返 SN workflow |

### ⚠️ 權限觀察(唔阻住本 ADR,但要記低)

OQ-2 嘅答案係「**因為呢個係 admin 權限嘅帳號**」。即係話平台今日對 ServiceNow 嘅寫入面,**技術上遠闊過佢實際需要嘅範圍**(需要嘅只係:讀 `sc_req_item` / `sc_task`,寫該兩張表嘅 `state` / `work_notes` / `close_notes`)。

呢個唔係本 ADR 造成,亦唔阻住本 ADR —— 但係一個 **least-privilege 缺口**:平台任何一個 bug 嘅爆炸半徑,由「改錯一張單」變成「admin 做得到嘅任何嘢」。

⇒ 建議喺 **DEPLOY-harden** 順帶處理(換一個 scoped 嘅 integration role),**唔喺本 change 做**(H3)。已記入 BACKLOG。

## 實作補註(implementation notes)

> **性質**:CH-010 落地時實測揪出、而寫本 ADR 嗰陣冇嘅資訊。上面已 Accepted 嘅決定**一個字都冇改** —— 呢度只係**補前置條件**同**更正一個講錯咗嘅事實**。要推翻上面任何一條,寫新 ADR。

### 🔴 ① close 一張 task 需要 `assigned_to` —— 本 ADR 完全冇預見

Ricoh instance 有 business rule **`Validate "Assigned to" before close`**:冇 assignee 就 **HTTP 403**。同一張 task 對照實測(2026-07-29):

```
{state:'3'}                    → 403 Operation ... aborted by Business Rule
{assigned_to, state:'3'}       → 200
```

**Chris 拍板**:assignee = **integration 帳號本身**(事實正確 —— 的確係平台做),而且 **只喺欄位為空時先填**。

🔴 **絕不覆蓋已有 assignee**:覆蓋 = 把人哋張單嘅負責人改走,而且**完全睇唔見** —— close 兩種情況都會成功。呢個係本次最容易靜靜做錯嘅位。

順帶解釋咗一個之前查唔明嘅現象:**點解咁多 RITM 被直接 close 而 task 留住開** —— close task 會被 business rule 擋,close RITM 唔會,所以大家繞過咗。

### ② D4 講「`RITM_TABLE` 唔刪」係錯,已刪

D4 寫「佢仲有 caller(work note 路徑)」。實情:work note 走 `snow.addWorkNote(sysId, note)` **冇傳 table**,即係用 `SERVICENOW_DEFAULT_TABLE`,同 `RITM_TABLE` 無關。CH-010 之後零 caller ⇒ 刪咗,加 `TASK_TABLE`。`RITM_STATE` 保留(n8n provider 仍然引用)。

### 🔴 ③ D3 引用嘅「772 張零反例」**已經有反例**

寫 D3 嗰陣抽 800 筆得出「冇一張 RITM 有 ≥2 個 active task」。落地時再查,揾到 **`RITM0047290` 有兩張同時 active** —— 而且佢係 **`D365 User License Maintenance Request`,正正係本 seam 會收到嗰類單**。

**結論唔變**(規則仍然係「唯一 active」+ fail-closed),但**理由改變**:`≥2` 唔再係「防禦一個未見過嘅情況」,而係**已知會發生**。抽樣得出嘅規律唔係規律 —— 呢句已寫入 `direct-ticket.provider.ts` 同 test。

### ④ n8n 側:2004 client 係**刪咗**,唔係留低休眠

D6 講「2004 未改之前 `n8n-ticket` 掣鎖死 `direct`」。落地方式 = `N8nTicketProvider` **兩個方法都 throw**,並且**移除**咗 W40 個 2004 client(webhook 呼叫 / `x-uop-secret` / 兩種 response 形狀 / `details` 唔傳遞規則)。

理由:留低就係**冇任何 caller 到達得到、因此測唔到**嘅 code。跟返 W38 收窄 D2 嘅同一原則(「seam 唔應該扮 vendor 做得到佢做唔到嘅嘢」)。重新啟用 n8n = 對住 2004 **新嘅** task-capable mode 重寫,唔係 revert。舊 client 喺 git history。

**per-call throw 而唔係 boot 時 throw**:每個 caller 都會把失敗入 `OutboundFailure`(ADR-0011 OD4),所以掣揀錯會變成一條寫明原因嘅失敗紀錄 —— 可補救、睇得見,而唔係成個 app 起唔到。

### ⑤ Live 驗證(A11)—— 行真 code path,唔係手動 curl

```
POST /admin/outbound-failures/:id/retry   (kind=servicenow.ticket_update, transition=close)
  → OutboundRetryService.repairTicketUpdate → TicketUpdateProvider → DirectTicketProvider
SCTASK0071391  state 1→3 · active→false · assigned_to (空)→(有值) · close_notes = 平台嗰句
  ↓ 平台完全冇掂過 RITM
RITM0046766    state 1→3 · stage execution→complete · active→false
```

同時證實咗 ADR-0017 W40 **OQ-D**(ticket state 嘅 repair 必須走 seam)喺新寫入對象下仍然成立。

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
