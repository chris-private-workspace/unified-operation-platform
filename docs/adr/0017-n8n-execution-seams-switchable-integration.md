# ADR-0017: n8n 執行接縫化 —— license 操作與 ticket 狀態可切換執行器,inbound intake 加 adapter

**Date**: 2026-07-26
**Status**: Accepted
**Approver**: Chris Lai

## Context

觸發來源:Chris 2026-07-26 —— n8n 側已經完成兩批 workflow,並且**已經預先鋪好向平台發送 request 嘅路**,需要平台端規劃對應嘅接入架構。

### 兩個場景(Chris 原話拆解)

- **場景一(必然發生)**:onboarding request 由 n8n 送入平台。n8n 喺 AD 建好帳號(等待同步到 Azure)之後 push 入平台,平台等 Entra 見到帳號就執行 license assign。
- **場景二**:直接喺 UOP 建 request 表單 → 發到 ServiceNow license form 建單 → 再由 UOP 管理同處理 license 分配。

場景二嘅 outbound 建單面 **ADR-0008 Phase 乙/丙(W25/W26)已經做咗**(`RequestSubmissionProvider`,direct/n8n 可切換)。本 ADR 處理嘅係**其餘未接縫化嘅部分**:license portal(Graph)操作、ServiceNow 狀態回寫,以及場景一 intake 嘅實際合約落差。

### n8n 側現況(已讀畢全部 10 個 workflow JSON)

**Phase 1(`docs/06-reference/03-n8n-workflow/phase 1/`,AD onboarding,live)**

| WF | 角色 | 對本 ADR 嘅相關點 |
|---|---|---|
| 1001 AD Management(74 nodes) | 主編排:Outlook → AI Brain 分類 → 1004 驗證 → approval email → 排程衝突 → 即時/排程分流 | **已加 `WF1 - Prepare/Call/Resolve UOP Intake` 三個 node**;gate = `other_items` 有 `pending_license` 或 `/O365/i`;POST `$env.UOP_INTAKE_URL`(retry 3×);狀態四態 `sent`/`failed`/`pending_config`/`not_applicable` 併入同一封執行報告 |
| 1004 AD Validation Loop(58) | 人機迴圈:三型郵件(initial/retry/confirmation)+ n8n Form + Excel group 確認 | 產出 `validatedData`(username / sAMAccountName / department / domainGroups);callback 走 1001 `$execution.resumeUrl` |
| 1002 Azure sub-workflow(53) | AD 執行器 + `deptMapping`(OU/UPN domain/ABW/company/logonScript/office) | ⚠️ 現時**全部 LDAP + WinRM node DISABLED,行 STUB**(2026-07-23) |
| 1007 AI Hands Executor(22) | 執行 actionItems + 依賴檢查 | 🔴 **已經自己 PATCH ServiceNow RITM `state=3` + `close_notes`** —— 同本 ADR D3 有分工邊界問題 |
| 1005 Schedule Runner(22) | 每日 10:00 掃 `scheduled_jobs` DataTable | 鏡像版 UOP 分支,`Call` node 仍 **DISABLED** |
| 1009 Jobs Manager(33) | Dashboard SPA + jobs-api,Basic auth(SHA-256 DataTable) | 與平台無直接接口 |

**Phase 2(`phase 2 (with UOP)/`,4 條為 UOP 而設嘅 webhook,全部 `x-uop-secret` header)**

| WF | Path | 輸入 | 輸出詞彙 |
|---|---|---|---|
| 2002 License Counts | `/webhook/wf2-license-check` | `{mode:1}` / `{mode:2, skuId}` | mode1 = `subscribedSkus` 摘要;mode2 = 該 SKU 用戶清單(999/頁自動分頁 + 去重) |
| 2003 Assign License | `/webhook/wf3-assign-license` | `{upn, skuId, ritmId?, requestId?, usageLocation?}` | `success` / `not_synced` / `already_assigned` / `error`;內建 sync gate(Graph 404)+ 冪等 + usageLocation 補值(預設 HK) |
| 2004 SN RITM Update | `/webhook/wf4-sn-update` | `{ritmId, mode:0\|1, notes?}` | mode0 → `state=3` + `close_notes`;mode1 → `state=2` + `work_notes` |
| 2005 Sync Check | `/webhook/wf5-sync-check` | `{upn}` / `{upns[]}`(≤50) | `synced` / `not_synced` / `error` + 計數 |

2003 sticky note 已經寫低咗設計立場,同本 ADR 完全一致:**「UOP decides → n8n executes」**、**「Logging = UOP's audit log (single platform, decided 22 Jul)」**、**「On timeout UOP re-fires — idempotent」**。

### 平台側現況

- **已接縫化**:`RequestSubmissionProvider`(抽象 + DI token)/ `DirectServiceNowProvider` / `N8nWorkflowProvider`,選路 `connectorConfig.resolve('n8n-outbound','requestSubmissionProvider') ?? 'direct'`(DB-then-env,ADR-0013 Model C)。
- **未接縫化**:`GraphService`(`getSubscribedSkus` / `findUser` / `setUsageLocation` / `assignLicense`)被 `assign.service` / `catalog.service` / `reconcile.service` **直接 import**;ServiceNow 回寫 `snow.addWorkNote()` 亦由 `assign.service` 直接叫。
- Graph 方法同 Phase 2 workflow **一一對應**(見 D2 表),即係話唔使發明新 pattern,只需把既有 pattern 複製到多兩個接縫。

### 觸發嘅 hard constraint

- **§5.1 H1**:新增兩層 provider 抽象、改動 `assign.service` 呢條 critical path 嘅依賴、新增 intake adapter endpoint。
- **§5.2 H2**:n8n 由「outbound 建單其中一條路」擴大為「license 操作 + ticket 狀態嘅可選執行器」,職責面明顯擴大。
- **§5.3 H3**:D3 把 RITM 回寫由「只加 work note」擴到「close / 標記採購中」,係**新行為**,唔係純 refactor。

## Decision

### D0 — 不變式:只換執行器,唔換決策者 🔴

所有 gate 永遠留喺平台,無論行邊條路:OpCo scope(AUTH-3a)、line item stage、Phase 1 sync gate、座位檢查、ledger 兩層數字(ADR-0004/0007/0014 invariant)、audit(ADR-0009)、預算 gate(ADR-0016)。

n8n 只執行「呢一個動作」,唔做任何決策。呢條係本 ADR 嘅根:一旦違反,「切換執行器」就退化成「換咗個系統」,兩條路徑行為唔再等價,ledger invariant 亦冇人守得住。

### D1 — 三接縫模型,逐接縫獨立選路(Chris 拍板:逐接縫 3 個掣)

```
   n8n 1001/1005 ──POST──► ③ InboundIntakeAdapter(必然,不可切換)──► IntakeService(既有)
                                          │
   ┌──────────────────────────────────────┴───────────────────────────────┐
   │            平台保留全部 gate 與決策(D0)                              │
   └──┬───────────────────────┬────────────────────────┬──────────────────┘
      ▼                       ▼                        ▼
 ① RequestSubmissionProvider   ② LicenseOperationsProvider   ④ TicketUpdateProvider
   (已存在,本 ADR 不改)            【新】graph │ n8n              【新】direct │ n8n
   direct │ n8n                  GraphService │ 2002/2003/2005   SNService │ 2004
```

否決「一個總掣切晒」(冇彈性:例如 SN 憑證 ACL 只喺 n8n 側嘅情況就死症)同「逐 operation 切」(配置爆炸,組合測試做唔完)。代價:3 × 2 = 8 種組合,需要記錄支援矩陣,但每個接縫內部行為一致,測試可以 per-seam 做。

### D2 — `LicenseOperationsProvider`(graph | n8n)

新抽象放 `apps/api/src/integration/license-ops/`,兩個實作:

| 抽象方法 | `GraphLicenseProvider`(預設) | `N8nLicenseProvider` |
|---|---|---|
| `listTenantSkus()` | `graph.getSubscribedSkus()` | 2002 mode 1 |
| `findUser(upn)` | `graph.findUser()` | 2005 單筆 |
| `checkSync(upns[])` | N × `findUser` | 2005 batch(≤50) |
| `assignLicense(upn, skuId, opts)` | `graph.assignLicense()` + `setUsageLocation()` | 2003 |
| `listUsersBySku(skuId)` | **新增** Graph `$filter=assignedLicenses/any(...)` + 分頁 | 2002 mode 2 |

**🔴 正規化 outcome 詞彙(本 ADR 最核心嘅設計功夫)**:`graph.assignLicense()` 係 throw / void,2003 係返 `already_assigned` / `not_synced` 呢啲**成功形狀嘅結果**。兩者必須 map 入同一詞彙,否則切換 = 靜默行為改變:

```ts
type AssignOutcome =
  | { status: 'assigned' }
  | { status: 'already_assigned' }        // 冪等重放
  | { status: 'not_synced' }              // Graph 404 / 2003 not_synced
  | { status: 'no_seats' }
  | { status: 'error'; details: string }; // 唔含 PII
```

`GraphLicenseProvider` 負責把 Graph 例外(現時經 `graphUnavailable()` wrap)同前置座位檢查 map 入呢個詞彙。**H5 主戰場 = 同一組 case 餵兩個 provider,必須得出同一 outcome。**

`assign.service` 依然自己做座位檢查(先 `listTenantSkus()`),唔可以因為 2003 內建 gate 就省掉 —— 見 D0。

### D3 — `TicketUpdateProvider`(direct | n8n),並擴充至 close / WIP(Chris 拍板:擴)

| 抽象方法 | `DirectServiceNowProvider`(預設) | `N8nTicketProvider` |
|---|---|---|
| `addWorkNote(sysId, note)` | `snow.addWorkNote()` | 2004 mode 1 |
| `markInProgress(sysId, note)` | `snow.updateRecord({state:'2', work_notes})` | 2004 mode 1 |
| `closeComplete(sysId, note)` | `snow.updateRecord({state:'3', close_notes})` | 2004 mode 0 |

`markInProgress` = 「license 未夠、採購中」語意,同 ADR-0016 預算 gate 場景接得返。

**🔴 RITM 分工邊界(硬規矩,違反即 SN 狀態打交)**:
- n8n **1007** 只 close **AD 類 RITM**(來自 `phase1_items` 嘅 action items)。
- 平台只 close **license 類 RITM**(來自 `other_items` / `pending_license`,即 intake 帶入嘅 `RequestLineItem.serviceNowSysId`)。
- 兩邊**永不**掂對方嘅 RITM。呢條要同時寫入 n8n 側 sticky note 同平台側 code comment。

沿用 ADR-0011:close/WIP 失敗 = 非致命,入 `OutboundFailure` 佇列,唔可以令一個已成功嘅 assign 變成失敗(OD4 不變)。

### D4 — 場景一 inbound intake:平台側 adapter(Chris 拍板:平台加 adapter endpoint)

場景一**必然發生、不可切換**,所以唔用 provider pattern。但**現時兩邊合約對唔上**,呢個係場景一嘅實質 blocker:

| 平台 `N8nIntakeRequestDto` 要 | n8n `WF1 - Prepare UOP Intake` 實際送 | 處理 |
|---|---|---|
| `serviceNowSysId`(REQ sysId,必填,`@unique` 冪等鍵) | `request.requestId`(REQ **number**);只有 `licenseItems[].ritmSysId` | adapter 用既有 `getRecordByNumber(number, 'sc_request')` **反查 sysId**(Chris 拍板) |
| `lineItems[].skuId`(GUID) | `licenseItems[].licenseCode`(如 "E3") | adapter 經 `SkuCatalog.businessAlias` / `skuPartNumber` resolve 成 GUID |
| `opcoCode`(必填) | 冇;只有 `request.department` / Job Function(如 "RAPO ASPC") | adapter 經 department → OpCo 對照 resolve |
| `targetUpn`(必填) | `targetUser.email`(由 jobFunction 推 domain) | 直接對應,空值即 fail |
| `lineItems[].quantity` | 冇(每 RITM 隱含 1) | 預設 1 |
| 平鋪欄位 | `{event, idempotencyKey, sentAt, request:{}, targetUser:{}, licenseItems:[]}` | adapter 攤平 |

**做法**:新增 `POST /requests/intake/n8n`(同一個 `IntakeKeyGuard`),接 n8n 原生信封 → resolve → 轉成 canonical DTO → 交畀**完全不變**嘅 `IntakeService`。

**點解 mapping 放平台唔放 n8n**:mapping 真相(`SkuCatalog` / `Opco`)本來就喺平台,複製落 n8n code node 會令 SKU 一改就漂移;而且平台 resolve 先做得到 fail-closed + 清晰 log。既有 `POST /requests/intake` canonical 合約(W24 CONTRACT SSOT)**一個字都唔改**。

**Fail-closed**:任何一項 resolve 唔到(REQ number 查唔到 / licenseCode 對唔到 SKU / department 對唔到 OpCo)→ 唔建 mirror,記入失敗佇列(ADR-0011 pattern)並回 4xx,由 n8n 側 `WF1 - Resolve UOP Status` 顯示 `failed`。**絕不**用估嘅值建單。

**🔴 本決定就係 `N8N-INTAKE-HANDOFF.md` 要求嘅嗰個 ADR**:該文件 §0 明寫「平台側要加一層 name→GUID resolve 就係改 LOCKED 合約(需 owner approve + ADR),**唔可以靜靜做**」,並喺 §7 落差 #1 標為 🔴 blocking。本 ADR = owner(Chris)approve + 成文記錄,故**唔屬「靜靜 map」**;而且 canonical 合約 `CONTRACT.md` 本身一個字唔改,adapter 係**另一條 route**,LOCKED 合約嘅嚴格性對其他 caller 完全保留。落差 #1 由「blocking,等 n8n 交 GUID」改為「由平台 adapter 解決」,`N8N-INTAKE-HANDOFF.md` §0/§7 需相應更新(戊階段 doc-sync 項)。

**⚠️ resolve 失敗 ≠ 名對得含糊就照收**:handoff §0 已實證 catalog 有兩個「E5」(`SPE_E5` vs `Microsoft_365_E5_(no_Teams)`),所以 adapter 嘅 licenseCode→skuId **必須要求唯一命中**;多過一個候選 = fail-closed,唔可以揀第一個。呢條係 CLAUDE.md「SKU 一律 `skuId` GUID,唔靠名」喺 adapter 層嘅具體落實。

### D5 — 配置:沿用 ADR-0013 Model C,零新機制

`connectors.ts` 加兩個 entry:

| connector | 可編輯(非機密,DB-then-env) | 機密(env only) | 可否 probe |
|---|---|---|---|
| `n8n-license` | `licenseOperationsProvider` = `graph`\|`n8n` · webhook base URL | `N8N_LICENSE_WEBHOOK_KEY` | ✅ **可以** —— 2002 mode 1 唯讀 |
| `n8n-ticket` | `ticketUpdateProvider` = `direct`\|`n8n` · webhook URL | `N8N_TICKET_WEBHOOK_KEY` | ❌ 2004 會真改單 |

預設(unset)一律係現行行為:`graph` / `direct` —— 部署咗都唔會改變任何嘢,要人手揀先切。選路 factory 同 `requestSubmissionProviderFactory` 同一形狀,只構造被選中嗰個實作,所以 n8n env 只喺真係揀咗 n8n 時先需要。`PROBEABLE` 照舊 data-driven,唔畀 controller 靜靜長出一個唔應該有嘅探針。

### D6 — Audit 降級聲明(ADR-0009)

走 n8n 路徑時,真正嘅 Graph / SN 呼叫喺 n8n 執行,平台 `AuditLog` 只記「委派 + 正規化結果」。2003 已宣告 n8n 唔另外 log(「single platform」),所以**平台必須**記低 request/response 摘要(H4:唔含 secret、唔含 UPN 等 PII),否則走 n8n 就等於冇 audit。ADR-0009 嘅 `/admin/audit` ADMIN-only 限制不變。

### D7 — 明確唔做(守 H3 界線)

- 唔實作 ADR-0015 sync sweep(2005 batch 啱用,但屬另一個已 Accepted 未實作嘅 ADR,只留 hook,唔順手做)。
- 唔改任何 ledger invariant、唔改 `reconcile`(ADR-0016 紅線同理)。
- 唔做 auto-assign orchestration(W24 A2 = 人手 queue,維持)。
- 唔把 n8n 嘅 AD / onboarding 能力(1002/1004/1007)搬入平台 —— 嗰邊仍然係 n8n 主場。
- 唔改既有 `POST /requests/intake` canonical 合約。

### Rollout(接 ADR-0008 甲乙丙丁,續天干)

| 階段 | 內容 | 可獨立驗收 |
|---|---|---|
| **戊** | D4 inbound adapter(場景一打通)—— 最高優先,因為係唯一 blocker | n8n 真 push → 平台建 mirror;resolve 失敗 fail-closed |
| **己** | D2 `LicenseOperationsProvider` + `GraphLicenseProvider`(**純重構,零行為改變**)+ 正規化 outcome + 雙向 H5 test | 全部既有 test 綠;`assign.service` 行為不變 |
| **庚** | `N8nLicenseProvider`(2002/2003/2005)+ `n8n-license` connector + probe | 兩個 provider 同一組 case 同一 outcome |
| **辛** | D3 `TicketUpdateProvider` 雙實作 + close/WIP 擴充 + 1007 分工邊界文件化 | RITM 狀態正確,無雙重 close |

## 實作補註(implementation notes)

> **性質**:落地時查證 code 揪出、而寫本 ADR 嗰陣冇嘅資訊。上面已 Accepted 嘅決定**一個字都冇改** —— 呢度只係**收緊**同**補時序空白**(做法沿用 ADR-0009 Decision 5)。要推翻上面任何一條,寫新 ADR。

### 己 — W38(2026-07-27,Chris Lai 拍板四項)

**① D2 個表列 5 個方法,實際只收 3 個。**

| D2 方法 | W38 | 理由 |
|---|---|---|
| `listTenantSkus` / `findUser` / `assignLicense` | ✅ 收 | assign 路徑真有 caller |
| `checkSync(upns[])` · `listUsersBySku(skuId)` | ❌ 唔收 | 全 repo **零 caller**。介面加方法係 additive,有真 caller 嗰陣先加唔會令庚返工 |

⚠️ 連帶:上面 **Consequences → Positive** 嗰句「`listUsersBySku` 補上平台一直缺嘅 per-SKU 用戶清單」**W38 未兌現**,順延至真有 caller 嗰陣。

**② D2 只覆蓋 assign 路徑。** 查證發現 `getSubscribedSkus()` 有 **4 個** consumer,唔止 assign。另外三個**明文留喺 vendor 直連**,並由 `license-ops.boundary.spec.ts` 靜態鎖死(理由逐條寫入 test 名):

- `reconcile.service` —— drift 係平台自己對現實嘅斷言。經可切換 seam 會令**對帳基準取決於當時 config 咗邊個 provider**;D0 講明決策者留平台。
- `integration-probe` —— 佢報告嘅係 **Graph connector** 健唔健康(ADR-0010)。經 seam 就變成探 n8n 而標籤寫住 Graph。
- `catalog.service` —— SKU 字典 sync,本 ADR 從來冇 scope 過。

**③ 🔴 `sync-sweep.findUser` 永不經 seam —— 補一個時序空白。**

本 ADR **2026-07-26** Accepted,而 `sync-sweep.service.ts` **2026-07-27**(W37 / ADR-0015)先存在 ⇒ D2 個表寫嗰陣佢**根本未有**。

ADR-0015 嘅整個重點係 `azureSyncedAt` 由「**n8n 聲稱**」升級為「**平台證實**」。經 2005 去證實 = n8n 再一次話畀平台聽「sync 咗」= **直接推翻 ADR-0015**。⇒ 永遠直接 `GraphService`,同樣由 boundary spec 鎖死。

**④ Error 契約:transport 失敗 throw,唔入 `AssignOutcome`。**

D2 寫「把 Graph 例外(現時經 `graphUnavailable()` wrap)map 入呢個詞彙」。但 `graphUnavailable()` wrap 嘅係網絡 / auth / throttle —— 「vendor 掛咗」**唔係呢次 assign 嘅結果,係冇結果**,caller 應該重試而唔係詮釋。照字面做會逼 `assign.service` 人手複製一個逐字相同嘅 503 message,一個字唔同就係行為改變。

⇒ **transport 失敗 throw 503(各實作自己 wrap);`error` variant 收窄成「provider 答咗,但答案係失敗語意」**(例:2003 返 `{result:'failed'}`)。

### 庚 — W39(2026-07-28,Chris Lai 拍板五項 + 一項 H1)

#### 🔴 D2 個表同真 workflow 有四處對唔上(實讀 JSON 先發現)

寫本 ADR 嗰陣係按 workflow **描述**落筆;W39 落手前逐個 node 讀返 `phase 2 (with UOP)/*.json`,發現:

| # | 本 ADR D2 講 | workflow 真係 | 處理 |
|---|---|---|---|
| 1 | outcome `assigned` | 2003 `Build Response` 出 **`success`** | 純 mapping,provider 內部轉 |
| 2 | outcome 有 `no_seats` | 2003 **完全唔檢查座位** | **好事,同 D0 一致** —— 座位係平台決策。但即係 **`no_seats` 兩個 provider 都產生唔到**,已寫入 test 註釋免得下手以為漏咗 |
| 3 | 一種 response 形狀 | **兩種** —— `already_assigned`/`not_synced` 由 `Route Status` **直接 respond**(`Evaluate User` 形狀),只有真 assign 完先行 `Build Response` | provider 兩種都 handle |
| 4 | `error.details` 唔含 PII | 兩個 code node 都係 `JSON.stringify(b.error \|\| b).substring(0,500)` —— **原封塞 Graph error body** | 🔴 見 OQ-2 |

⇒ **凡涉及平台送出 / 解析嘅嘢,workflow JSON 係 SSOT,唔可以照抄本 ADR 嘅轉述。**

#### 五個 OQ 拍板

| OQ | 拍板 | 理由 |
|---|---|---|
| **1** | `already_assigned` **一視同仁照 +1** | 見下段 |
| **2** | provider **唔傳遞** n8n 個 `details` | 落差 #4 係 **H4 問題唔係 mapping 問題**。只留 status + 平台自己寫嘅安全描述;vendor 細節留喺 n8n execution log(嗰邊本來就係 n8n owner 範圍)。代價 = 排查要開 n8n,**細過**把 UPN 寫入平台 log/audit(BUG-004 已證呢類洩漏好耐冇人察覺) |
| **3** | `ritmId` **唔入**介面 | 2003 收佢做 matching,但平台自己有 ADR-0009 audit(2003 sticky 自己都寫「Logging = UOP's audit log」)。加咗就係畀介面帶一個 **Graph 實作永遠用唔着**嘅參數 |
| **4** | 未配置 → **`inactive`** 唔係 `error` | 同 ADR-0010 三態語意一致:`state` 講**部署形狀**唔講健康。配置咗但打唔通先叫 error |
| **5** | **唔加** `listUsersBySku`(2002 mode 2) | 沿用己 OQ-3:workflow 有 mode 2 ≠ 平台需要佢。零 caller |

#### 🔴 H1 — 加 connector 要改 schema(本 ADR D5 冇預見)

D5 講「沿用 ADR-0013 配置機制」,但 **`ConnectorConfig` 係具名 column model** ⇒ 加 `n8n-license` 必然要 `ALTER TABLE`。Chris approve additive migration(兩個 nullable 欄)。詳見 **ADR-0013 實作補註**。

**掣嘅預設方向**:任何非 `'n8n'` 字串(unset / typo / 半完成配置)一律 resolve 落 **Graph**。唔完整嘅配置絕不可以靜靜把真 licence 派發路由去第三方。

#### probe:只探 2002 mode 1

`PROBEABLE['n8n-license'] = null`(可探),但 **只准 2002 mode 1**。2003 **會真派 licence**;2005 雖然唯讀但要真 UPN,喺健康檢查塞同事個 UPN 正正係 H4 要防嘅習慣。三條負面斷言 + fails-before 鎖住。

⚠️ **probe 注入嘅係具體 `N8nLicenseProvider`,唔係抽象** —— 注入抽象會令「測試 n8n connector」實際探緊當前選中嗰個(預設 = Graph),即係喺 n8n 標籤下面報 Graph 嘅健康。`license-ops.boundary.spec.ts` 已為此**收緊**(明文禁抽象 import,舊版嘅字串檢查從來冇真正 assert 過呢點)。

#### 🚧 誠實邊界:庚完成 ≠ 可以真切換

n8n 側三個前置**全部未通**,而且唔喺本 repo 手上:`x-uop-secret` 仍 `CHANGE_ME_SHARED_SECRET`(見本檔附錄 #2)· n8n UAT ↔ 平台環境未接通 · 平台未部署上 UAT。

⇒ 庚交付嘅係「**code + test 齊,預設值零改變**」。**真切換未經任何 live 驗證**,唔可以當佢通過。

#### ✅ rollout 表嗰個庚驗收標準:已達成

`license-ops.contract.spec.ts` —— **7 個 case 各寫兩次**(一次 Graph 語言、一次 n8n 語言)再 assert 兩邊結果相等。**令兩個 arrangement 意思相同就係呢條 test 嘅真功夫**,亦係 mistranslation 唯一會匿埋嘅地方。

兩樣**刻意唔 assert**,因為要求佢哋相同反而係錯:

1. **error message 唔要求相同。** vendor 掛咗嗰陣運維要知係**邊個**掛 ⇒「Microsoft Graph is unavailable」同「n8n is unavailable」兩句都啱而且**必須**唔同。contract 係**失敗類別**(兩邊都 503),唔係字眼。
2. **replay 唔要求相同**(見下段)—— 所以呢條 test 寫成「**除咗 replay 之外**相等」,而 replay 本身**獨立釘死**:有人日後「統一」佢哋(Graph 側加 probe / 抹走 n8n 嘅分辨)就會紅,逼佢返去睇 OQ-1 而唔係靜靜推翻。

`no_seats` 亦有獨立一條 test 釘住「兩個 provider 都產生唔到」 —— union 有個成員冇實作返過,唔解釋就似漏咗。

**fails-before 實證**:令 n8n 個 `not_synced` 返 non-null(= 最痛嗰個分岔,會令 sync gate 個 400 唔再觸發、未 sync 嘅 user 被當成已 sync)→ 只有嗰條紅,其餘全綠。

### 🔴 replay 不對稱 —— W38 提出,**W39 OQ-1 已拍板**(唔准靜靜改)

`GraphLicenseProvider` **只產生得到 `assigned`**:`not_synced`/`no_seats` 由 caller 喺入 provider **之前**攔截(移入嚟 = provider 變決策者,違反 D0);`already_assigned` **Graph 根本分唔到**(POST 冪等且唔報告)。

⇒ **同一個 replay,Graph 講 `assigned`,n8n 講 `already_assigned`。** 呢個係真嘅 cross-provider 行為差異,**唔係漏咗嘅 mapping**。

**W39 OQ-1 拍板 = 一視同仁**:`assign.service` 收到 `already_assigned` **完全當 `assigned` 處理,ledger 照 +1**。

三個理由:

1. **保持兩條路徑行為一致係 D0 核心。** 一揀 n8n 就連 ledger 語意都跟住變,就唔再係「只換執行器」。
2. **重複計數風險今日已經存在。** Graph 分唔到 replay,一直當新 assign。喺庚**偷偷修一邊**,等於令「切 provider」順帶夾帶一個 ledger 語意改動。
3. 真要修就**另開 change,兩條路一齊修**。

⚠️ **代價要講明**:`already_assigned` 意思正正係「tenant 側本來已經有呢個 seat」,所以嗰一 +1 **確實會**令平台數字比 tenant 真實多一個(製造 drift)。**n8n 路徑明知有更準嘅資訊,而平台刻意唔用。** 呢個係有意識嘅取捨,Chris 2026-07-28 明確接受。

**唔可以喺 Graph 側靜靜加個 probe「補返」呢個差異**(每單多一個 round-trip),亦**唔可以喺 n8n 路徑靜靜唔 +1**。兩樣都係喺切 provider 時夾帶行為改動。

### 辛 — W40(2026-07-28,Chris Lai 拍板三項 + 一項 H1)

#### 🔴 D3 個表同真 workflow 有三處對唔上,其中一處係 blocking

同庚一樣,落手前逐個 node 讀返 `2004`。

| # | 本 ADR D3 講 | workflow 真係 | 處理 |
|---|---|---|---|
| **1** | `addWorkNote(sysId, note)` → **2004 mode 1** | mode 1 **一定** `state:'2'`;2004 **冇任何** mode 係「加 note 而唔改 state」 | 🔴 **OQ-A** —— 見下 |
| 2 | notes 就係我哋送嘅字 | 唔含 `generated by n8n` 就**自動 append** `'Handled & generated by n8n.'`;control char → space;**截 3900** | contract test **唔** assert 文字(OQ-C) |
| 3 | notes 必填 | **optional**,各 mode 有 default 文案 | 平台一律自己給 |

#### OQ-A(拍板:`addWorkNote` **唔入**介面)

平台今日 assign 成功之後只加一條 work note,**唔掂 state**。照 D3 個表 map 落 mode 1 =

```
direct 路徑：assign 成功 → 加 note，state 不變
n8n    路徑：assign 成功 → 加 note + 張單被標成 Work in Progress
```

⇒ 切一個掣就靜靜改變咗平台對外做嘅事(**違反 D0**),而且語意仲要係**相反**嘅。2004 個 sticky 自己寫住「RITM ONLY. 3 fields ... deliberate」,即係 n8n 側**刻意**唔提供 note-only 能力。

**⇒ `TicketUpdateProvider` 只收 `markInProgress` + `closeComplete`,比 D3 個表窄。** 同 W38 收窄 D2(5 個方法收 3 個)同一判斷:**vendor 冇對應能力,就唔好喺介面度假裝有。** work note 路徑維持直連 `ServiceNowService`。

#### 命名:`DirectServiceNowProvider` 個名 W25 已經用咗

D3 表列嘅 direct 實作叫 `DirectServiceNowProvider`,但呢個名 **W25 / ADR-0008 乙**(`RequestSubmissionProvider` 嘅建單實作)已經佔咗。

⇒ 實際命名 `TicketUpdateProvider` / `DirectTicketProvider` / `N8nTicketProvider`,落 `integration/ticket-update/`(對齊 W38 `license-ops/`)。

#### OQ-E — 邊個 code path 有權 close / hold(D3 冇定義過)

D3 定義咗兩個方法,但**冇講邊個叫佢哋**。拍板 = 兩個 trigger 都接:

| trigger | 條件 |
|---|---|
| `closeComplete` | line item assign 成功 **且** 佢有 per-line RITM |
| `markInProgress` | ADR-0016 預算 gate 擋咗 |

**🔴 「全部 line item 完成」呢個條件唔存在。** 查 schema 揭 `RequestLineItem.serviceNowSysId` = 「THIS line's RITM」(ADR-0008 D6 兩層)⇒ **一個 line item = 一張 RITM**,所以條件就係「呢個 line ASSIGNED → close 佢自己嗰張」。

**🔴 close 唔 fallback 去 parent REQ。** 既有 work note 寫 `item.serviceNowSysId ?? request.serviceNowSysId`;close **冇**照抄:REQ 係 `sc_request` 而 seam ④ 只寫 `sc_req_item`(2004 patchUrl 焗死表名),而且 close 一張 REQ ≠ close 一張 RITM(其他 line 可能仲開住)。冇 per-line RITM → 維持 work note。

#### 🔴 H1 — 兩個 schema 改動

**① 加 `n8n-ticket` connector 必然 `ALTER TABLE`**(`ConnectorConfig` 係具名 column)。呢個**唔係新發現** —— W39 撞完就寫咗入 ADR-0013 補註,W40 事前就知。

**② `RequestLineItem.ticketHeldAt`(additive nullable)。**

需要佢嘅原因係一個 D3 冇預見嘅問題:預算 gate 擋 = throw,而操作員會**不斷重試**被擋嘅 assign(加 allocation、再試、搵 admin、再試)。冇呢個 flag,每一次都會 PATCH 一次真客戶單。

⚠️ 只喺**寫入成功之後**先記 flag。失敗寧可下次再試(state 2→2 冪等),都好過標住「已 hold」而其實冇。

**對照:`closeComplete` 唔需要同等守門** —— stage gate(`stage !== READY` → 400)已經保證一個 line item 只會成功 assign 一次。呢個係查證得出,唔係假設。

#### OQ-D 收窄 —— 一個**放寬**咗嘅守門,理由要留低

W40 F1 把 OQ-D 實作成「`outbound-retry` **完全唔可以** import seam」並用靜態 test 鎖住。F4 證明呢個**闊過**個決定本身:

- **work note** retry:payload 記低嘅係一個 **direct call** 失敗咗,重發 = 做返同一件事 ⇒ 直連係啱
- **ticket state** retry:嗰個失敗係**當時選中嗰個 provider** 產生嘅 ⇒ 直連重發 = 用 Table API 修一個 n8n close ⇒ **必須**走 seam

⚠️ 同 W39 嗰次(boundary test 捉到 probe import → **收緊**)方向相反,所以冇靜靜改:靜態嗰條收窄成「work note 仍然直連」,而**真正嘅保證**(邊個 repair kind 去邊個系統)改由 `outbound-retry.service.spec` 嘅**行為** test 守 —— 兩條路都 import 咗之後,靜態檢查根本分唔到佢哋。

#### 失敗佇列:一個新 kind,唔係兩個

`servicenow.ticket_update` 帶 `transition: 'close'|'hold'`。兩個 kind 會有兩份講同一件事嘅 whitelist。`kind` 係 string 常數 ⇒ **零 schema**。

retry 按 `transition` 分派,**唔認識就 fail-loud** —— close 一張只應 hold 嘅單係唔可逆嘅。

#### ⚠️ ADR-0016 D6 有一句唔再字面成立

D6 寫「a block **changes no state**, so it writes no AuditLog」。W40 之後,一個被擋嘅 assign 會寫 `ticketHeldAt` 並 PATCH 一次 SN。

**ADR-0016 已 Accepted,內容一個字唔改**(要推翻寫新 ADR)。實情係:**冇 AuditLog 呢部分不變**,而「changes no state」要理解成**佢原本要保護嘅嘢** —— 冇 licence 郁,冇 ledger 數字郁。`assign.service` 個 code comment 已經標明。

#### 🔴 1007 分工邊界:結構上驗證,唔係聲明

D3 講「1007 只 close AD 類、平台只 close license 類」。1007 **已經自己 PATCH `state=3`**,所以呢個必須查得實。實讀 1001 `Prepare Approval Data`:

```
actionItems  ← phase1Items only —— create_user / add_user_to_group /
               setup_abw_folder 三個全部 .find()/.filter() 自 phase1Items，
               帶住 1007 之後 close 嗰啲 ritmSysId。other_items 一次都冇入過。
licenseItems ← other.filter(status === 'pending_license' || /O365/i)
               —— 即 other_items only，亦即平台 RequestLineItem.serviceNowSysId
               嘅來源。
```

⇒ **兩套 sys_id 來自同一份 AI Brain output 嘅兩條互斥分支。**

⚠️ 但呢個保證**冇任何自動守門** —— 一個 RITM sys_id 兩邊長得一模一樣,平台分唔出。所以 `ticket-update.provider.ts` 個 comment 除咗寫結論,仲寫明「一旦 n8n 側改咗,呢個 comment 會係第一樣唔再成立嘅嘢,而平台偵測唔到」。**D3 要求嘅 n8n 側 sticky note 仍然要 Chris 喺 n8n UI 加。**

#### 🚧 誠實邊界:辛完成 ≠ 可以真切換(同庚)

n8n 側前置**全部未通**,而且唔喺本 repo 手上:2004 個 `x-uop-secret` 仍 `CHANGE_ME_SHARED_SECRET`(附錄 #2)· 2004 `patchUrl` hardcode **DEV host**(附錄 #3)· credential `n8napiservice1` 有 **row-level ACL**,sticky 明寫 fixture RITM 要加 credential 或者 deploy 時換 · UAT 未接通 · 平台未部署。

⇒ 辛交付嘅係「**code + test 齊,預設值零改變**」。**真切換未經任何 live 驗證。**

---

## Alternatives Considered

- **一個總掣切晒(全平台 / 全 n8n)** — rejected:冇彈性。實際情境已經出現需要混搭嘅理由(SN 憑證 row-level ACL 掛喺 n8n 嗰個 `n8napiservice1` 帳號,而 Graph app permission 兩邊都有),硬綁一個掣會直接卡死。
- **逐 operation 獨立選路** — rejected:配置爆炸、組合測試做唔完,而且冇實際需求要求 assign 同查 SKU 分別走唔同路。
- **n8n 側改 payload 去啱平台現有 DTO(平台零改動)** — rejected(Chris 拍板 adapter):要喺 n8n code node 維護 licenseCode→GUID 同 department→OpCo 兩張對照表,同平台 `SkuCatalog`/`Opco` 重複,SKU 一改就漂移;而且撞正 CLAUDE.md「SKU 一律 `skuId` GUID,唔靠名」嘅精神 —— resolve 應該喺有真相嗰邊做。
- **放寬 `serviceNowSysId` @unique,改用 n8n `idempotencyKey`** — rejected:改冪等鍵語意 = 額外 H1 + schema 改動,而 `getRecordByNumber` 已經存在,零 schema 就解到。
- **RITM 維持只 `addWorkNote` 唔擴** — considered,Chris 選擇擴:閉環唔完整(履行完張單一直開住),而且 2004 兩個 mode 已經寫好。代價 = 新行為面 + 要同 1007 嚴格分工,已寫入 D3 做硬規矩。
- **直接喺 `assign.service` 加 `if (useN8n)` 分支(唔做抽象)** — rejected:critical path 塞條件分支,兩條路徑會慢慢分叉;而且平台已經有 `RequestSubmissionProvider` 先例,唔跟等於同一個 repo 兩種做法。
- **Chosen**:三接縫 + 逐接縫選路 + 平台側 intake adapter + 沿用 ADR-0013 配置機制 —— 因為完全複用已驗證嘅 pattern(零新機制)、保住 D0 不變式、每階段可獨立驗收,而且預設值等同現行行為(部署即無感)。

## Consequences

- **Positive**:場景一終於打得通(現時 payload 一 push 入去必 400);license 執行路徑可以喺「平台直連 Graph」同「n8n workflow」之間切換,對應唔同環境嘅權限/網絡限制(參考 Azure UAT 公司 proxy 擋 data-plane 嘅經驗);n8n license 路徑終於有嘢可以 probe(2002 mode 1 唯讀);`listUsersBySku` 補上平台一直缺嘅 per-SKU 用戶清單;RITM 閉環完整。
- **Negative**:測試面翻倍,每個接縫要寫「兩邊同詞彙」contract test,而 n8n 路徑喺 CI 只能 mock;n8n code node 可以隨時改(low-code 嘅好處同時係風險),平台 mock 唔會察覺 —— 緩解 = workflow JSON 版本化入 repo(已開始)+ webhook response 帶 `contractVersion`;走 n8n 時 audit 降級為「委派 + 結果」(D6 已聲明);8 種組合需要記錄支援矩陣。
- **Neutral**:預設值 = 現行行為,唔揀就零改變;`RequestSubmissionProvider` 一個字唔改;`IntakeService` 一個字唔改;ledger invariant / `reconcile` / 定位守則(ServiceNow 仍係 SoR)全部不變;schema 零改動(REQ sysId 走反查,唔改 `@unique`)。

## References

- `docs/06-reference/03-n8n-workflow/phase 1/`(1001/1002/1004/1005/1007/1009)· `phase 2 (with UOP)/`(2002/2003/2004/2005)
- ADR-0008(n8n 雙向啟用 · `RequestSubmissionProvider` · REQ/RITM 兩層)—— 本 ADR **擴展**其 D2/D3,唔 supersede
- ADR-0013(Model C connector 配置 · DB-then-env · secret 留 env)—— D5 完全沿用
- ADR-0010(connector 三態 · `PROBEABLE` data-driven · 唯讀探針)—— D5 probe 規則
- ADR-0011(outbound 失敗佇列 · 🔴 `request.mirror` 絕不重新提交)—— D3/D4 失敗處理
- ADR-0009(audit trail · `/admin/audit` ADMIN-only)—— D6 降級聲明
- ADR-0015(sync sweep,未實作)· ADR-0016(預算 gate,未實作)—— D7 明確唔掂
- ADR-0004 / 0007 / 0014(ledger invariant)—— D0 保護對象
- `docs/01-planning/W24-request-intake/CONTRACT.md`(intake canonical 合約 SSOT,本 ADR 不改)· `N8N-AGENDA.md`(B1 GUID / B2 Opco.code / B3 REQ+RITM 原始拍板)
- `docs/05-usage/N8N-INTAKE-HANDOFF.md` §0(兩個「E5」歧義實證 · 「唔可以靜靜 map」)· §7 落差 #1(🔴 blocking → 本 ADR D4 解決,需 doc-sync)· 落差 #5(intake 唔檢查 OpCo `active`,adapter 應順帶收緊)· `N8N-INTEGRATION-SETUP.md`
- `apps/api/src/fulfilment/fulfilment.module.ts`(`requestSubmissionProviderFactory` = D1/D5 嘅形狀樣板)· `assign.service.ts`(D0/D2 改動對象)· `integration/graph/graph.service.ts` · `integration/servicenow/servicenow.service.ts` · `integration/connectors.ts`
- CLAUDE.md §5.1 H1 · §5.2 H2 · §5.3 H3 · §5.4 H4 · §5.5 H5

---

## 附:與本 ADR 無關但同批發現嘅待辦(唔屬本 ADR 決策)

1. 🔴 **H4**:`phase 1/1002 - Azure sub-workflow - AD.json` 嘅 disabled node `Execute Command (Setup ABW Share Folder) (PRD)2` 內含**明文 WinRM 服務帳號密碼**。該目錄現時 **untracked 且未被 gitignore**(`git status` = `?? docs/06-reference/03-n8n-workflow/`),即係下次 `git add .` 就會入 history。commit 前必須 scrub;帳號建議照 rotate。
2. Phase 2 四條 workflow 全部仍係 `EXPECTED = 'CHANGE_ME_SHARED_SECRET'` hardcoded,UAT 前要換 `$env`(各 workflow sticky 自己已標 TODO)。
3. 2004 hardcode 咗 `ricohapdev.service-now.com`(DEV host),deploy 前要換。
4. 1005 嘅 `WF1 - Call UOP Intake` 仍 **DISABLED** —— 場景一嘅**排程路徑**未通,只有即時路徑通。戊階段驗收要涵蓋兩條。
5. 1002 全部 LDAP / WinRM node 現時 DISABLED 行 STUB —— 唔影響平台,但代表 n8n 端 e2e 未係真 AD。
