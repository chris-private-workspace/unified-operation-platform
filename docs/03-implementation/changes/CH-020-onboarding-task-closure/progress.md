# CH-020 Progress — Onboarding catalog task closure

> 對應 `spec.md`(approved)+ `checklist.md`。R2:每個 commit 對應返呢度一個 Day-N entry。

## Day 1 — 2026-08-03(實作)

**做咗**:G1-G4 gate → S1-S3 schema → I1-I7 intake 分流 → P1-P7 seam ④ → A1-A4 assign → T1-T15 test → V1-V4 + V6。**V5(live)未做。**

### Commit

| Hash | Subject | Checklist |
|---|---|---|
| (見下) | `feat(fulfilment): CH-020 onboarding catalog task closure` | S1-S3 / I1-I7 / P1-P7 / A1-A4 / T1-T15 / V1-V4 / V6 |

### 數字

| | 前 | 後 |
|---|---|---|
| `apps/api` test | 797(67 suites) | **837**(68 suites) |
| `npm run lint`(root) | exit 0 | exit 0 |
| tsc api / web | 0 / 0 | 0 / 0 |
| Migration | 17 | 18(`20260803060106_ch020_line_item_task_ref`) |

### 落 code 期間三個判斷(spec 冇寫死,記低點解)

**① Task ref 行 `IntakeService.intake(dto, taskRef?)` 第二個參數,唔加落 `N8nIntakeLineItemDto`。**
spec §2.3 只講「注入嗰條 line 寫入」冇講點入。加落 canonical line item DTO 係較短嘅路,但咁樣**任何** canonical caller 都可以送 task sys_id,而帶 task sys_id 嘅 line 會行 by-task close —— 嗰條路由構造上繞過 ADR-0018 D3 嘅「唯一 active task」保護。第二個參數令只有 flat 路(真係收到 1001 畀嘅 task)去到嗰度,爆炸半徑細一格,亦逐字守住 D2「canonical DTO 一個字唔改」。`intake.controller.spec.ts` 有一條 test 專門守呢樣。

**② Failure payload 加 `targetKind`(spec 冇提,係 D4 嘅必然後果)。**
`servicenow.ticket_update` 個 payload 一直只存 `snTarget` 一個 string。seam 收 union 之後,repair 冇咗 kind 就只能靠估;估錯就會 `request_item=<task sys_id>` 查詢,**永遠 0 row**,而且原因喺 queue row 上面睇唔出。所以 allowlist 加咗 `targetKind`。⚠️ 呢個係 widen 一個 privacy allowlist —— 值只有 `'ritm'|'task'`,非 PII 非 secret,已喺 `outbound-failure-fields.ts` 寫明。舊 row 冇呢個 key,讀成 `'ritm'`(佢哋本來就係)。

**③ `active` 檢查用 `snow.query('sys_id=…')` 而唔用 `snow.getRecord()`。**
`getRecord` 個 catch 吞晒 error 返 `null`(`servicenow.service.ts:117`),即係「SN 連唔到」同「task 唔存在」返同一個答案。seam ④ 嘅 error contract 明文要求 transport failure **throw**,所以行 `query`(佢會 throw)。順帶亦同 `pickTask` 用同一個 method。

### 順帶記低

- **`ticket-update.provider.ts` header 有句過時咗嘅話**:「The interface did not change: both methods still take the RITM sys_id」—— CH-020 令佢直接同事實相反,已改。呢種「CH-N 嘅註解被 CH-N+1 推翻」係 spec drift 嘅最早訊號。
- **Prettier 把 `TicketTarget` 個 union 摺埋一行**。原本寫成兩行對齊比較好讀,但 `--fix` 話事,冇對抗。
- `apps/web` **一個字冇改** —— 本 CH 純後端。`LINT-web` 嗰 25 個 prettier error 仍然喺度(root `lint` 只 gate api),同本 CH 無關。

## Day 1(續)— V5 live 驗證

**做法**:成條鏈拆兩半分開驗,因為中間嗰下 `assignLineItem` 會**真派一個 E5 落真 tenant**。兩半各自行**真 code path、真 ServiceNow**;唔係 mock。用 CH-014 造嘅 `[UOP TEST]` fixture **REQ0044068**(2 個 RITM,各 1 張 active task)。

### V5a — intake 半(只寫本機 DB;intake 從來唔 patch SN)

`POST /requests/intake`,body = 1001 嘅 flat 形狀 + REQ0044068 + SCTASK0071829 真 sys_id:

| 驗到 | 結果 |
|---|---|
| HTTP | **201** |
| `serviceNowSysId` | `b27e6dbf3b5ac790ed49b9cc73e45aec` —— **server 反查**返嚟,唔係 client 送嘅 number ⇒ D3「唔換 key」成立 |
| line item | 1 條,SPE_E5(ADR-0020 注入),`serviceNowSysId: null`(冇 RITM) |
| **task ref** | **`serviceNowTaskSysId=5f7eadbf…` / `serviceNowTaskNumber=SCTASK0071829`** ⇐ 本 CH 個重點 |
| sync gate | `accountCreatedAt` / `azureSyncedAt` 都係 `null` |
| idempotency | 再 POST 一次 → **同一個 request id** `cmscv7k4q0001…`,冇建第二張 |
| OQ-2 | response 全文搵唔到 `mode` / `1001-immediate` |

**Guard / 分流同場驗**:無 key → **401**(canonical 同 flat 兩種 body 都係)· canonical 缺 `serviceNowSysId` → **400 validation**(`serviceNowSysId must be longer than or equal to 1 characters`)· canonical 空 `lineItems` → **400** · canonical 完整 → **400 但係嚟自 `IntakeService`**(`SKU 'guid-does-not-exist' not found or inactive`)⇒ 佢**過晒 validation 去到真 writer**,contract 冇被放寬 · `mode` = `2`/`0`/`"1"`/`true` → 全部 **400 `mode must be one of the following values: 1`** · `mode:1` + 唔存在嘅 REQ → **400 `ServiceNow request 'REQ0000000' was not found`**(即係真係打咗 SN)。

### V5b — close 半(真 SN 寫入)

走 **Delivery-failures retry**(`OutboundRetryService` → seam ④ → `DirectTicketProvider` → 真 SN),即係 CH-010 當日驗自己嗰條路。⚠️ **人工嘅只有個 queue row**(seed 咗一行 `targetKind:'task'`);由 retry endpoint 開始之後每一步都係 production code。

| | 之前 | 之後 |
|---|---|---|
| **SCTASK0071829**(target) | state **1** · active **true** · assigned_to 空 | state **3** · active **false** · assigned_to = integration 帳號 |
| **SCTASK0071830**(兄弟) | state 1 · active true · 空 | **一模一樣,一個字冇郁** |

兄弟嗰行係關鍵 —— 佢證實平台閂咗**指定嗰張**,唔係「REQ 底下搵到嘅第一張」。

### V5c — D5 兩個拒絕分支(真 SN)

| 情境 | 結果 |
|---|---|
| 同一張 task(**而家已閂**)再閂 | **400** `ServiceNow does not report catalog task SCTASK0071829 as open, so the platform will not reopen or overwrite it.` — **冇 patch** |
| 唔存在嘅 task sys_id | **400** `The catalog task handed over at intake does not exist in ServiceNow, so the platform has nothing to close.` |

兩行 failure 都**維持 `open`**、`attemptCount` 由 1 升到 2(ADR-0011 I2:失敗嘅 repair 唔可以扮成功)。第一個情境正正就係 **REQ0044049 嗰個活例**重現。

驗完三行 seed 都刪返(佢哋唔係真 failure,唔應該留喺 queue)。**REQ0044068 個 mirror 留低** —— 佢鏡住一張真 `[UOP TEST]` REQ,而且係 V5a 嘅證據。

### 🔴 V5d 未做 —— 兩半中間嗰下 assign

`assignLineItem` 個 target 選擇(task > RITM > work note)**只有 unit test 守住**,冇 live 跑過。要 live 跑就要:真 tenant 一個**真 synced user** + **真派一個 E5**(`findUser` 返 null 就會卡喺 sync gate,乜都試唔到)。

**未經 Chris 明確指示唔會撳。** 現成候選仍然係 **REQ0044038**(SPE_E5 / READY / SCTASK0071802 仍 active),但佢個 target user 係真人。

### 🔴 仍然係 code 修唔到嘅前提

**OQ-3(R4,High/High)**:1001 個 HTTP node 用 credential「n8n Academy API Key」,workflow JSON 睇唔到佢送咩 header。若唔係 `X-Intake-Key`,n8n 打過嚟連 **401** 都過唔到 —— 上面所有 live 證據都係我自己帶住正確 key 打嘅,**證明唔到 n8n 帶得啱**。要 Chris / Jerry 喺 n8n 側開個 credential 望一眼。

### 🚧 延後(唔屬本 CH scope,已喺 spec §2.7 列明)

- 🚧 **OQ-1** —— n8n `Resolve WDA Task` 個 query 冇 `^active=true` 兼 `limit=1`,會送已閂 task(REQ0044049 實例)。UOP 側 D5 擋住,**根源交返 n8n**,唔喺 UOP 補 n8n 個漏。
- 🚧 **2004 / `n8n-ticket` 解封** —— ADR-0018 嗰條鎖唔動;本 CH 只係令 `task` target 誠實回 error 而唔係扮支援。
