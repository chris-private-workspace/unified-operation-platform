# ADR-0025: Onboarding licence request creation（UOP 建 O365 單 + 雙同步 gate；部分 supersede ADR-0024）

**Date**: 2026-08-03
**Status**: **Accepted**
**Approver**: **Chris Lai（2026-08-04）** —— ADR Accepted · W43 plan 轉 active · **分批做，由批 A 開始**（F0+F1+F2）。四條 OQ 全部按建議 default 執行。

## Context

### 起因：Chris 更正流程（2026-08-03，ADR-0024 落地同日）

> 1. Phase 1 嘅 n8n user onboarding request 會喺 AD account creation 完成之後，同時把 request 內容傳到 UOP 建 request 記錄，而 **n8n 側會同時 close 掉整個 request 嘅 catalog task**，觸發 request complete。
> 2. UOP 收到之後，用相關資料**另建一張 ServiceNow form —— `O365 User License Maintenance Request`**。
> 3. 呢張 request 會處於**唔可以操作**嘅狀態，直至兩個檢查點都通過：① 用戶帳號已同步到 Azure ② 用戶帳號已同步至 ServiceNow。

### 🔴 ADR-0024 建基於一個錯誤前提，而個錯誤有明確成因

ADR-0024 認定「n8n 刻意留低 Windows Domain Account（WDA）task 畀 UOP 派完 E5 之後 close」。呢個結論**唯一嘅來源係 workflow JSON 入面嘅註釋同 sticky note**：

- `1001` sticky `🔴 WF1 - WDA task id (29 Jul)`：*"Rule A: Phase 2 closes ONLY the Windows Domain Account task, and only once the E5 licence is assigned."*
- `1007` `Prepare SN Update`（REWRITTEN 29 Jul 2026）：`MODE_BY_CATEGORY.new_hire_domain_account = 'note'`，配 `WDA_NOTE = 'AD account created. Awaiting E5 licence assignment. Handled by n8n'`

**打真 ServiceNow 查證，呢個描述從未生效**（2026-08-03，read-only probe）：

| 查詢 | 結果 |
|---|---|
| `sc_task` where `close_notes LIKE 'Handled by n8n'` | **11 張**，當中 **2 張係 `Creation - Windwos Domain Account`**（SCTASK0071709 30/07 · SCTASK0071713 29/07），連同 ABW / MDM / SERVICENOW / Internet Email |
| `sys_journal_field` where `value LIKE 'Awaiting E5 licence'` | **0 行**（全 instance） |
| 1007 Rule A rewrite 日期 vs 最後一次閂 WDA | rewrite **29 Jul**，而 **30 Jul 仍然照閂** |

⇒ **n8n 閂埋 WDA task，onboarding REQ 自己 complete。Chris 講嘅先係現實。**

🔴 **成因值得寫低**：workflow JSON 嘅註釋 / sticky note 係**意圖**，唔係**行為證據**。ADR-0024 個 Context 三次引用嗰句 `"UOP hands this exact id back to 2004"` 當成已確立事實，而由頭到尾冇打過真 SN 去對。呢個同 `no-fabricated-tool-results` 記低嘅**第二類**同源：唔係作 tool 輸出，係由真 output 過度推論。

### 🔴 附帶揭到：`sys_updated_by` 分唔到 UOP 定 n8n

實測 `SERVICENOW_USER === 'n8napiservice1'` = **true** —— **UOP 同 n8n 共用同一個 SN service account**。所以 `sys_updated_by` / `assigned_to` 永遠答唔到「邊個系統改咗呢張單」。唯一可靠指紋係 `close_notes`：

| 寫者 | `close_notes` |
|---|---|
| n8n | `Closed & Handled by n8n` |
| UOP | `License <SKU> assigned via platform.` |

**ADR-0024 D5 個 rationale 就係咁記錯**：寫住 SCTASK0071807「喺導入之後被人閂咗（state 3，assigned 畀一個真人）」，實測係 **UOP 自己喺 CH-020 驗證期間閂嘅**（03/08 10:28，`close_notes = "License Microsoft_365_E5_(no_Teams) assigned via platform."`，`assigned_to = n8napiservice1`）。D5 個**結論**（patch 前驗 `active` fail-closed）仍然企得住 —— 但唔可以再引用嗰個「防人手閂」理由。

### 目標單嘅真實形狀（實測，非推測）

catalog item **`efe38adedbef6f80a98e75868c961936`** = `O365 User License Maintenance Request`（CH-014 已經用佢經 `order_now` 真係落過單）。

```
REQ ──► RITM ──► 剛好一張 sc_task「Execution Step」（assignment group「O365 Support」）
```

實測 8 張近期 RITM 全部 1:1（RITM0047363→SCTASK0071828 · RITM0047331→SCTASK0071802 · …）。**1 RITM : 1 task 正正係 ADR-0018 D3「唯一 active task」設計嗰個形狀**，所以「派完 licence 閂返自己張單」**唔需要新 code**。

Variable 定義（實測，`item_option_new`）：

| variable | type | mandatory | 真單存 |
|---|---|---|---|
| `requester_name` | Reference → `sys_user` | **true** | sys_id |
| `target_user` | Reference → `sys_user` | **true** | sys_id |
| `target_users_email` | Email | **true** | email |
| `target_user_opcos` | SelectBox | **true** | `rapo` / `rhk`（小寫） |
| `action_type` | SelectBox | false | `new_license_assignment` |
| `license_type` | SelectBox | false | 48 choice |
| `wso_license_applied` / `mobile_device_info` | — | false | — |

🔴 **`target_user` 係 mandatory reference**，收 `sys_user` sys_id，唔收 email —— 而 Gate ② 講緊嗰個人**未同步到 SN 就冇 sys_id**。呢個係本 ADR 最核心嘅時序矛盾。
✅ 反過嚟，`license_type` **唔係 mandatory** ⇒ 48-choice 對照表唔阻塞建單。

### 點解係 H1

改 Prisma schema（Gate ② 兩個欄）· 改 assign gate（`azureSyncedAt` 單閘 → 雙閘，屬 CLAUDE.md §5 H1 明列嘅 locked 決策）· 部分 supersede ADR-0024 · 修 BUG-010 而嗰個屬 ADR-0008 D3 已 lock · 令平台第二次成為 SN 單嘅**發起方**。任何一項都夠。

## Decision

### D1 — 部分 supersede ADR-0024

| ADR-0024 | 本 ADR |
|---|---|
| **D2** `mode` 分流（有 `mode` → `N8nFlatIntakeDto`；冇 → W24 canonical 一個字唔改） | ✅ **原封保留** — n8n 照樣咁送 |
| **D3** flat 路重用 `resolveReqSysId()` / `applyDefaultSku()` | ✅ **原封保留** |
| **D1** `RequestLineItem.serviceNowTaskSysId` / `serviceNowTaskNumber` | ⚠️ **改用途**：由「要 close 嗰張」變成**純 traceability**（記低 n8n 處理咗邊張 WDA task）。**唔 drop column** —— nullable 欄留低零成本，drop migration 有風險冇收益 |
| **D6** close 優先次序第 ① 條（`item.serviceNowTaskSysId` → by-task close） | ❌ **停用** — 嗰張 task n8n 自己閂咗，打過去只會撞 D5 個 `active=false` 閘，白白生 Delivery failure |
| **D4** `TicketTarget` union · **D5** patch 前驗 `active` | ✅ **保留** — 新流程一樣要 close task，union 令 seam 更明確；D5 保留但**理由更新**（防重複 close / 防 race，唔再係「防人手閂」） |

### D2 — UOP 建 `O365 User License Maintenance Request`，走 Service Catalog API

intake 收貨之後**即刻**建（Chris 拍板 (a)）。走 `POST /api/sn_sc/servicecatalog/items/{sys_id}/order_now`，**唔走 Table API insert** —— 後者係 BUG-010（`sc_request` insert **403 table-level**，連單 field payload 都 403）。

⇒ 順帶修 **BUG-010**：`DirectServiceNowProvider` 由 Table API insert 改行 catalog API。呢個係 ADR-0008 D3 已 lock 嘅決定，本 ADR 正式更新佢。CH-014 個 ops script 已經實證呢條路行得通（`seed-servicenow-onboarding.ts`），但**唔係搬 script 入 production** —— script 走自己嘅 `fetch`，production 要行 `ServiceNowService`。

### D3 — `target_user` 填 **requester**，Gate ② 通過後回填真人

Chris 2026-08-03 拍板（否決 integration account）。

| 時刻 | `target_user` | `target_users_email` |
|---|---|---|
| 建單（即刻） | **requester 嘅 `sys_user` sys_id** | ✅ 真新用戶 email |
| Gate ② 通過 | **PATCH 成新用戶真 sys_id** | 不變 |

**點解 requester 唔係 integration account**：語意上「呢張單邊個發起」有意義，而 audit 上睇得出係邊個部門；integration account 會令所有單睇落一模一樣。

🔴 **`target_users_email` 由頭到尾承載「呢張單為邊個開」** —— `target_user` 喺回填之前係 placeholder，**任何邏輯都唔可以靠佢認人**。

requester 解析不到（`requesterEmail` 空 / SN 搵唔到嗰個人）⇒ **fail-closed 唔建單**，落 ADR-0011 failure queue。唔用 fallback 帳號頂上：一個認唔到發起人嘅單，人手 triage 好過靜靜建咗。

### D4 — Gate ②：`serviceNowUserSyncedAt` + `serviceNowUserSysId`，擴既有 sweep

Schema（additive、兩個 nullable、零 backfill）：

```prisma
model Request {
  // Phase 1 (n8n) linkage — assign is GATED on azureSyncedAt (gate ①)
  accountCreatedAt        DateTime?
  azureSyncedAt           DateTime?
  // ADR-0025 gate ② — the target user must also exist in ServiceNow before
  // assign, because that is what makes the O365 RITM operable.
  serviceNowUserSyncedAt  DateTime?
  serviceNowUserSysId     String?    // sys_user sys_id — also backfills target_user (D3)
}
```

**擴 `SyncSweepService`，唔開第二個 `@Cron`**：同一批 candidate、同一張 request、同一個 round。開第二個 cron 等於兩次掃同一批 row，而兩個 gate 問嘅係同一個人。

- Candidate 條件由 `azureSyncedAt: null` 放寬成**任一 gate 未通**
- Gate ① 照舊 `graph.findUser`；Gate ② `snow.query('sys_user', 'email=<targetUpn>')`
- 🔴 **兩個 gate 各自獨立 try/catch** —— Graph 掛咗唔可以拖跨 SN 側，反之亦然。維持 D6「abort 嗰個 vendor 嘅 round，唔 abort 成個 round」
- Gate ② 開閘嗰刻**順手攞到 `sys_id`** ⇒ 同一個 transaction 內寫低，再 PATCH RITM 個 `target_user`（D3）。兩件事天然合一，唔使查兩次
- On-demand 版跟 `SyncCheckService`（CH-015）嘅 cooldown pattern

### D5 — Assign 由單閘變雙閘

`assign.service.ts:135` 今日：

```ts
if (!request.azureSyncedAt) throw new BadRequestException('Phase 1 sync gate not passed: azureSyncedAt is null');
```

加第二閘，**兩個訊息分開**（operator 要知等緊邊一邊）：

```
gate ① 未通 → 'Phase 1 sync gate not passed: azureSyncedAt is null'   （逐字不變）
gate ② 未通 → 'ServiceNow sync gate not passed: the target user is not in ServiceNow yet'
```

🔴 **既有嗰行一個字唔改**，只喺後面加一段 —— 佢有 test 掛住（`assign.service.spec.ts:406` / `:619`），而 gate ① 嘅語意本身冇變。
🔴 **`budgetOverrideReason` override 唔到任何一個 gate**（同 tenant seat gate 一樣）—— sync gate 唔係預算問題，冇「知情繞過」呢回事。

### D6 — Close：重用既有 `RITM → pickTask → close`，零新 code

派完 licence 之後閂嘅係 **UOP 自己建嗰張 O365 RITM 底下嗰張 `Execution Step` task**。而 `RequestLineItem.serviceNowSysId` 本來就係「呢條 line 嘅 RITM」，建單時填返新 RITM 就自然行到 ADR-0024 D6 第 ② 條路（實測 work：REQ0044038→SCTASK0071802 · REQ0044067→SCTASK0071828）。

⇒ **ADR-0018 D3「唯一 active task」保護原封啱用**（1 RITM : 1 task）。`close_notes` 維持 `License <SKU> assigned via platform.` —— 呢個而家係**分辨 UOP vs n8n 嘅唯一指紋**（見 Context），唔可以改成同 n8n 撞。

### D7 — `license_type` best-effort，唔阻塞

實測 `mandatory=false` ⇒ 對唔到就**留空照落單**，唔 fail。有 mapping（`skuPartNumber` → 48 choice 之一）就填。完整對照表（含已 inactive 嘅舊值 `"e3"`）**defer 落 BACKLOG**，唔喺本 ADR 決定。

`action_type` 固定 `new_license_assignment`（實測真單值）。`target_user_opcos` 由 `opcoCode` 轉小寫。

### D8 — 失敗處理沿用 ADR-0011，唔新發明

建單失敗 = 外部世界**未變** ⇒ 記 `request.submit` kind、repair 係 plain re-submit。
建單成功但本地 mirror 失敗 = 外部世界**已變** ⇒ 記 `request.mirror` + `externalRef`。🔴 **`request.mirror` 絕不重新提交**（會開多張真飛，ADR-0011 D3）。

## Alternatives Considered

- **等 Gate ② 通過先建單** — reject（Chris 拍板 (a)）。UOP Request 會有一段時間冇對應 SN 單，期間 SN 側完全睇唔到呢個需求存在；而且「幾時建」會變成一個要人手盯嘅隱形狀態。
- **`target_user` 填 integration account** — reject（Chris 拍板用 requester，見 D3）。
- **`target_user` 直接填 email 字串靠 SN auto-resolve** — 未 reject 但**唔採用**：要真 POST 一張單先驗得到，而 SN 刪唔到單（CH-014 OQ-2 已有 3 張未 cancel 嘅測試單）。requester placeholder 唔使賭。若日後證實 catalog API 收 display value，可以簡化 D3。
- **開第二個 `@Cron` 做 Gate ②** — reject，見 D4。
- **drop 咗 ADR-0024 D1 嗰兩個 schema 欄** — reject：drop column migration 有風險（UAT 已部署），而留一個 nullable 欄成本係零，仲有 traceability 價值。
- **完全 revert CH-020** — reject：D2 `mode` 分流係 n8n **今日真係咁送**（實測 payload 得 7 個欄，`serviceNowSysId` 30 Jul 已被移除），冇咗佢 intake 一定 400。

## Consequences

- **Positive**：流程對返 Chris 描述嘅真實業務；UOP 由「閂一張唔屬於佢嘅 task」變成「開自己嘅單、閂自己嘅單」，跨系統交接消失；D6 零新 code；Gate ② 令「派唔到」由 assign 時嘅 400 提早變成畫面上睇得到嘅狀態；順帶修 BUG-010。
- **Negative**：Prisma schema 再加兩個欄；`SyncSweepService` 由單一 vendor 變成兩個 vendor（複雜度真實上升，靠 D4 兩個獨立 try/catch 壓住）；平台第二次成為 SN 單嘅發起方，**多咗一個開真飛嘅路徑**；`target_user` 有一段時間係 placeholder，任何靠佢認人嘅下游邏輯都會錯（D3 已標紅）。
- **Neutral**：唔掂 ledger / reconcile / drift；唔掂 canonical CONTRACT（W24 LOCKED）；ADR-0018 對 `kind:'ritm'` 那條路完全不變；offboarding / licence 回收仍然 out-of-scope（H3）。

## Open Questions

| # | 問題 | 建議 default |
|---|---|---|
| **OQ-1** | n8n 側點知 UOP 已經建咗單？今日 1001 送完 intake 就完，冇 callback。 | **唔做 callback**。n8n 個 REQ 自己 complete，兩張單本來就無需要互相知。若日後要 trace，用 `rawRequestText` 記低來源 REQ number。 |
| **OQ-2** | 新建嗰張 O365 REQ 嘅 `serviceNowSysId` 要放邊？`Request.serviceNowSysId` 今日係 n8n 送嚟嗰張 REQ 嘅 `@unique` idempotency key。 | **`Request.serviceNowSysId` 保持 = onboarding REQ**（idempotency 不變），新建嗰張 REQ/RITM 落 **line item 層**（`RequestLineItem.serviceNowSysId` = 新 RITM）。⚠️ 呢個令 `Request.serviceNowNumber` 同 line item 指向兩張唔同嘅 REQ —— 要喺 schema 註釋寫死，否則下手一定撈亂。 |
| **OQ-3** | 一張 request 有多條 line（多個 SKU）時，建一張 O365 單定 N 張？ | **一條 line 一張 RITM**（走 cart / `add_to_cart`+`submit_order`，CH-014 `--shape=multi` 已實證），因為 close 係 per-line 發生。 |
| **OQ-4** | Gate ② 用 `email` 對 `sys_user`，但 SN 側 email 唔一定 unique / 唔一定等於 UPN。 | 先用 `email=<targetUpn>`；**≥2 命中 fail-closed 唔開閘**（跟 ADR-0018 D3 「唯一先算」嘅一貫取態）。 |

## References

- **實測 probe**（2026-08-03，read-only，H4 credential 從不輸出）：`close_notes` 指紋 11 行 · `Awaiting E5` journal 0 行 · O365 item variable 定義 · 真 RITM 存值形狀
- [ADR-0024](0024-onboarding-task-closure.md) —— **本 ADR 部分 supersede**（D1 改用途 / D6① 停用；D2/D3/D4/D5 保留）
- [ADR-0008](0008-request-creation-n8n-d365-scope.md) D3（outbound 建單，本 ADR 更新其寫入路徑）/ D6（REQ/RITM 兩層鏡像）
- [ADR-0011](0011-outbound-failure-queue.md) D3 / OD4（`request.mirror` 絕不重新提交 · SN 寫入失敗 non-fatal）
- [ADR-0015](0015-sync-gate-scheduled-sweep.md) D2 / D5 / D6 / D7（sweep candidate 條件 · env knobs · 唔可以 throw · vendor traffic 跟真實量）
- [ADR-0017](0017-n8n-execution-seams-switchable-integration.md) D0（只換執行器唔換決策者）
- [ADR-0018](0018-servicenow-catalog-task-closure.md) D3（唯一 active task，fail-closed）
- [BUG-010](../03-implementation/bugs/BUG-010-sc-request-insert-acl-blocked/report.md)（`sc_request` insert 403 table-level）
- CH-014 `apps/api/scripts/seed-servicenow-onboarding.ts`（catalog API 落單實證 · `CAT_ITEM_O365` · variable 真值來源）
- `apps/api/src/fulfilment/sync-sweep.service.ts` · `sync-check.service.ts` · `assign.service.ts:135` · `outbound-request.service.ts` · `direct-servicenow.provider.ts`
- CLAUDE.md §5 H1（schema + locked sync gate + locked ADR-0008 D3）/ H5（assign = critical path）
- 落地 = **W43**
