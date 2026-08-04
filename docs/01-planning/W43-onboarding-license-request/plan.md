---
phase: W43-onboarding-license-request
name: "UOP 建 O365 User License Maintenance Request + 雙同步 gate"
sprint_week: W43
start_date: 2026-08-03
end_date: TBD
status: active                # draft | active | closed
spec_refs:
  - docs/adr/0025-onboarding-license-request-creation.md（**本 phase 產出**，Proposed）
  - docs/adr/0024-onboarding-task-closure.md（**部分被 0025 supersede** — D2/D3 保留、D1 改用途、D6① 停用）
  - docs/adr/0015-sync-gate-scheduled-sweep.md D2/D5/D6/D7（sweep 形狀 · 唔可以 throw · vendor traffic 跟真實量）
  - docs/adr/0018-servicenow-catalog-task-closure.md D3（唯一 active task，fail-closed）
  - docs/adr/0011-outbound-failure-queue.md D3/OD4（`request.mirror` 絕不重新提交 · SN 寫入失敗 non-fatal）
  - docs/adr/0008-request-creation-n8n-d365-scope.md D3（outbound 寫入路徑，被 0025 更新）/ D6（REQ/RITM 兩層）
  - docs/03-implementation/bugs/BUG-010-sc-request-insert-acl-blocked/report.md
prior_phase: W42-onboarding-default-sku
---

# Phase W43 — Onboarding licence request creation + 雙同步 gate

> **Plan version**：1.0（**active**）
> **Owner**：AI（Claude）
> **Approved by**：**Chris Lai（2026-08-04）** —— ADR-0025 **Accepted** · plan 轉 active · **分批做，由批 A 開始**（F0+F1+F2）· 四條 OQ 全部按建議 default 執行。
> **前置 gate**：✅ **ADR-0025 Accepted**（R1 + H1 已過）。

## 0. 起因（Chris 原話，2026-08-03）

CH-020 收官同日，Chris 更正流程：

1. n8n phase 1 喺 AD account creation 完成後把 request 內容傳到 UOP，**而 n8n 側同時 close 掉 catalog task**，觸發 onboarding request complete。
2. UOP 用嗰啲資料**另建一張 `O365 User License Maintenance Request`**。
3. 呢張新 request **唔可以即時操作**，直至兩個檢查點通過：① 帳號已同步到 Azure ② 帳號已同步至 ServiceNow。

⇒ **CH-020（ADR-0024）建基於相反嘅前提**。實測已確認 Chris 講嘅先啱（見 ADR-0025 Context），本 phase 把流程改返正確方向。

## 1. Scope

| | Deliverable | 觸發 hard constraint |
|---|---|---|
| **F0** | 止血：停用 by-task close | 無（ADR-0025 D1 已授權） |
| **F1** | BUG-010：`DirectServiceNowProvider` 改行 Service Catalog API | **H1** → ADR-0025 D2（改 ADR-0008 D3 已 lock 嘅寫入路徑） |
| **F2** | Onboarding intake → 建 O365 單 | **H1** → ADR-0025 D2/D3/D7/D8 |
| **F3** | Gate ② schema + sweep 擴展 + `target_user` 回填 | **H1** → ADR-0025 D4（Prisma schema） |
| **F4** | Assign 雙 gate | **H1** → ADR-0025 D5（locked sync gate）+ **H5**（critical path） |
| **F5** | 前端：兩個 gate 狀態可見 | **H6**（token-only，跑 `ui-design`） |
| **F6** | Close 路徑驗證（零新 code，但要 test + live） | **H5** |
| **F7** | Doc sync + closeout | R4 / R7 |

### 1.1 唔做（H3 邊界）

- ❌ **唔碰 canonical CONTRACT**（W24 LOCKED）—— `N8nIntakeRequestDto` 同 `POST /requests/intake` 分流邏輯一個字唔改（ADR-0025 D1 保留 ADR-0024 D2）。
- ❌ **唔 drop** ADR-0024 加嗰兩個 schema 欄（ADR-0025 D1：改用途做 traceability，drop migration 有風險冇收益）。
- ❌ **唔做 48-choice `license_type` 完整對照表** —— 實測 `mandatory=false`，best-effort 填（D7），完整對照 defer BACKLOG。
- ❌ **唔做 n8n callback**（ADR-0025 OQ-1）—— 兩張單無需要互相知。
- ❌ **唔碰 offboarding / licence 回收 / un-assign** —— H3 明確排除項。
- ❌ **唔改 `reconcile` / drift / ledger 任何一個字**。
- ❌ **唔郁 2004 / `n8n-ticket` 解封** —— ADR-0018 仍然鎖死 `direct`，本 phase 唔動。

### 1.2 建議分批（Chris 可揀）

| 批 | Deliverable | 可獨立交付？ |
|---|---|---|
| **A** | F0 + F1 + F2 | ✅ 建到單就有價值（單處於未可操作狀態，靠人手判斷） |
| **B** | F3 + F4 + F5 | ✅ gate 令「未可操作」由人手判斷變成平台強制 |
| **C** | F6 + F7 | 收官 |

⚠️ 批 A 單獨上線 = **建咗單但冇 gate**，operator 可以喺用戶未同步時就撳 assign（會被既有 gate ① 擋，但 gate ② 未有）。可接受但要講清楚。

## 2. 現況調查（全部實測 / code-traced，唔係推測）

### 2.1 n8n 實際行為（打真 SN，2026-08-03）

| 查詢 | 結果 |
|---|---|
| `sc_task` where `close_notes LIKE 'Handled by n8n'` | 11 張，**含 2 張 `Creation - Windwos Domain Account`**（SN 側串錯字） |
| `sys_journal_field` where `value LIKE 'Awaiting E5 licence'` | **0 行** ⇒ 1007 個 note-only 分支從未跑過 |

### 2.2 🔴 `sys_updated_by` 分唔到 UOP 定 n8n

`SERVICENOW_USER === 'n8napiservice1'` = **true**（UOP 同 n8n 共用帳號）。唯一指紋係 `close_notes`：n8n = `Closed & Handled by n8n`；UOP = `License <SKU> assigned via platform.`
⇒ **F6 驗收唔可以靠 `sys_updated_by`**，一定要睇 `close_notes`。

### 2.3 目標單形狀（實測 8 張近期 RITM）

```
REQ ──► RITM ──► 剛好一張 sc_task「Execution Step」（grp「O365 Support」）
```
1 RITM : 1 task ⇒ **ADR-0018 D3 原封啱用，F6 零新 code**。

### 2.4 Mandatory variable（實測 `item_option_new`）

真正 mandatory 得 **4 個**：`requester_name`（Ref→`sys_user`）· `target_user`（Ref→`sys_user`）· `target_users_email`（Email）· `target_user_opcos`（SelectBox，小寫 opco code）。
`license_type` / `action_type` / `wso_license_applied` / `mobile_device_info` **全部 `mandatory=false`**。

### 2.5 既有可重用資產

| 要做嘅嘢 | 已有 |
|---|---|
| 建 SN 單 | `OutboundRequestService` + `RequestSubmissionProvider` seam（W25）· CH-014 script 實證 catalog API 落單 |
| 定時檢查同步 | `SyncSweepService`（`@Cron` EVERY_10_MINUTES，4 個 candidate 條件，fail-soft） |
| 即時檢查同步 | `SyncCheckService`（CH-015，cooldown map） |
| 開閘寫入 | `openSyncGate()` shared helper + `SYNC_GATE_MESSAGE` |
| Close task | `DirectTicketProvider.pickTask()` → `RITM → 唯一 active task → state=3` |
| 失敗佇列 | `OutboundFailureService` + `OutboundRetryService` + `outbound-failure-fields.ts` allowlist |

⇒ **F3 唔使新 vendor / 新 pattern（H2 唔觸發）**，F6 唔使新 code。

### 2.6 🔴 assign 有第三道閘，live 驗證會撞

`assign.service.ts:211` **tenant seat gate**（`consumedUnits >= prepaidEnabled`）喺 OpCo budget gate 之後、close 路之前，而 `budgetOverrideReason` **override 唔到佢**。dev tenant `SPE_E5` 超支 33 ⇒ **E5 一個都派唔到**。
⇒ F6 live 驗證**揀 SKU 之前一定要查 `TenantSkuSnapshot` 最新一行**（CH-020 用咗 `POWER_BI_STANDARD`）。

## 3. Deliverables

### F0 — 止血：停用 by-task close

`assign.service.ts` 個 `ticketTarget()` 停止讀 `item.serviceNowTaskSysId`（優先次序剩返 RITM → REQ）。兩個欄**保留**做 traceability。
**點解先做**：UAT 而家每次 assign 都會打向一張 n8n 已閂嘅 task，撞 D5 `active=false` 生 Delivery failure 噪音。呢個係純減法，唔等 F1-F2。

### F1 — BUG-010：`DirectServiceNowProvider` 改行 Service Catalog API

`ServiceNowService` 加 catalog 落單能力（`order_now` / `add_to_cart`+`submit_order`），provider 由 Table API insert 改用。
🔴 **唔係搬 CH-014 個 script 入 production** —— script 走自己嘅 `fetch`，production 要行 `ServiceNowService`（連 connector config / TLS / 錯誤處理）。script 保留唔刪。

### F2 — Onboarding intake → 建 O365 單

- intake 收貨後即刻建（ADR-0025 D2）
- `requester_name` / `target_user` = **requester 嘅 `sys_user` sys_id**（D3）；解析不到 → **fail-closed 唔建單** + `request.submit` failure
- `target_users_email` = 真新用戶 email（**由頭到尾承載「為邊個開」**）
- `target_user_opcos` = `opcoCode` 轉小寫；`action_type` = `new_license_assignment`；`license_type` best-effort
- 新 RITM sys_id / number 寫落 `RequestLineItem.serviceNowSysId` / `serviceNowNumber`（OQ-2）
- 多條 line → cart（OQ-3）
- 失敗處理沿用 ADR-0011（D8）

### F3 — Gate ②：schema + sweep + 回填

- Migration：`Request` 加 `serviceNowUserSyncedAt` / `serviceNowUserSysId`（additive、nullable、零 backfill）
- `SyncSweepService` candidate 條件放寬成「任一 gate 未通」；**兩個 gate 各自 try/catch**
- Gate ② = `snow.query('sys_user', 'email=<targetUpn>')`；**≥2 命中 fail-closed**（OQ-4）
- 開閘同時攞 `sys_id` → 寫 DB → **PATCH RITM 個 `target_user`**（D3 回填）
- `SyncCheckService` 加 on-demand 版（跟既有 cooldown pattern）

### F4 — Assign 雙 gate

`assign.service.ts:135` 之後加第二閘，**既有嗰行逐字不變**。兩個訊息分開，operator 睇得出等緊邊一邊。`budgetOverrideReason` override 唔到（D5）。

### F5 — 前端：兩個 gate 狀態可見

Request detail 顯示兩個 check point 狀態（已通 / 等緊）。用既有 Badge + semantic tone，**唔加新 pattern**。一個 view 一個 primary action。light + dark 都驗。

### F6 — Close 路徑驗證（零新 code）

確認 `RITM → pickTask → close` 對新建嗰張 O365 RITM work。要 test + **live 驗**（睇 `close_notes` 指紋，唔睇 `sys_updated_by`；同時睇兄弟 task 冇郁）。

### F7 — Doc sync + closeout

ADR-0024 status 標註部分 superseded · ADR README 加 0025 · BUG-010 report 標 fixed · CLAUDE.md §0/§9 座標 · `SESSION_SUMMARY.md` · BACKLOG（R7）· `07-uat-as-built.md`（**開工第一步先 `az containerapp revision list` 實測**，唔信文件）

## 4. 驗收 Gate

| # | Gate | 判定 |
|---|---|---|
| **G1** | ADR-0025 **Accepted** | 冇 → 唔開工（R1） |
| **G2** | api test 全綠且**數目上升**（今日 837 / 68 suites） | `npm test -w @uop/api` |
| **G3** | root `npm run lint` exit 0（CI 真正 gate 嗰條） | — |
| **G4** | tsc api + web 各 0 error | — |
| **G5** | migration 喺 **scratch DB** apply + rollback 驗過 | 唔碰 dev DB |
| **G6** | **live**：真建一張 O365 單，SN 側見到 REQ+RITM+task | ⚠️ 需 Chris 明示批准（SN 刪唔到單） |
| **G7** | **live**：gate ② 由未通 → 通，`target_user` 真係由 requester 變成新用戶 | — |
| **G8** | **live**：assign 後嗰張 `Execution Step` task 閂咗，`close_notes` = UOP 指紋，**兄弟 task 冇郁** | — |
| **G9** | 前端 light + dark 都驗，`ui-design` skill 跑過 | H6 |
| **G10** | UAT 部署後抽 running OpenAPI **實搜**新契約（唔靠 tag 推論） | — |

## 5. Risk

| # | Risk | L/I | 對策 |
|---|---|---|---|
| **R1** | 真建單會喺 SN 留低刪唔到嘅單（CH-014 OQ-2 已有 3 張未 cancel） | H/M | G6 需 Chris 明示批准；單標 `[UOP TEST]`；用完即 cancel |
| **R2** | `requester_name` / `target_user` 解析不到 → 建唔到單 | M/M | D3 fail-closed + failure queue，唔用 fallback 帳號 |
| **R3** | Sweep 由一個 vendor 變兩個，Graph 掛拖跨 SN（或反之） | M/H | D4 兩個獨立 try/catch，逐 vendor abort |
| **R4** | `target_user` placeholder 期間有下游邏輯靠佢認人 | L/H | ADR-0025 D3 標紅 + schema 註釋寫死；code review 專項檢查 |
| **R5** | 🔴 **UOP 同 n8n 共用 SN 帳號** ⇒ audit 追唔到邊個系統改單 | H/M | 本 phase **唔修**（要 IT 開新 account，同 DEPLOY-harden 同源）→ 入 RISK_REGISTER |
| **R6** | tenant seat gate 令 live assign 驗證派唔到 | H/L | §2.6 —— 揀 SKU 前先查 `TenantSkuSnapshot` |
| **R7** | UAT migration 驗唔到（公司網連唔到 UAT DB） | M/M | 沿用 CH-020 結論：部署後開一次 UAT Requests 頁做結論性檢查 |

## 6. 依賴 / 阻塞

- 🔴 **ADR-0025 未 Accepted** —— 硬阻塞（G1）
- ⚠️ **G6/G7/G8 需要 Chris 明示批准真 POST**
- ✅ 唔依賴 IT app registration（AUTH-2b / DEPLOY-harden 卡住嗰個同本 phase 無關）
- ✅ 唔依賴 n8n 側任何改動（ADR-0025 OQ-1：唔做 callback）

## 7. Changelog

| 日期 | 版本 | 改動 |
|---|---|---|
| 2026-08-03 | 1.0 | 初稿（draft）。等 ADR-0025 Accepted + Chris approve plan。 |
| 2026-08-04 | 1.1 | Chris Accept ADR-0025 + plan 轉 active + **分批做由批 A 開始**。**R3 deviation log**：F1 加兩個 checklist item —— **F1-8** `findUserSysIdByEmail()`（ADR-0025 D3 requester 解析同 D4 gate ② 問嘅係同一件事，做一個共用 helper 好過兩份）、**F1-9** catalog item 分流 + 三個 env key（D2 只講「走 catalog API」，冇講落邊張單）。兩者都係既有 Decision 嘅必然實作，冇擴 scope。 |
| 2026-08-04 | 1.2 | **R3 deviation log — F5 加 F5-6，範圍由「Request detail」擴到 `deriveStatus`**（因而順帶影響 Requests 列表 + Blocked tab）。§3 F5 只寫「Request detail 顯示兩個 check point」，但 `deriveStatus` **detail 頁自己都用緊**（header badge）⇒ 唔加 gate ② 就會**同一個版面自相矛盾**：badge 講「Ready to assign」、assign 掣講「Blocked · sync」。既然一定要改，順帶令列表唔會為一張 backend 保證 400 嘅單寫「Ready to assign」。**兩個 gate 共用一個 label**，令 `matchesFilter('blocked')` 零改動就接住（分開 label 要同步改 filter，漏咗會靜靜喺 Blocked tab 消失）。冇加新 pattern / 新色 / 新 dep。 |
| 2026-08-04 | 1.1 | **實作揭到三件 ADR 冇覆蓋嘅嘢**（詳見 progress Day 1）：① catalog API 只返 REQ number，落單後必須反查先攞到 RITM ② RITM 順序唔保證 ⇒ 按 `sys_created_on` 讀 + **count 唔等 fail-closed** ③ 🔴 **D365 分流冇可靠數據源** —— `SkuCatalog.category` 實測係 licence 角色分類（`Base`/`Add-on`/…）而唔係產品家族，30 個 Dynamics SKU 全部冇 category，所以只能靠 part number 前綴（env 可改，混合 line fail-closed）。 |
