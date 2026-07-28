---
phase: W40-ticket-update-provider
plan_ref: ./plan.md
status: active
last_updated: 2026-07-28
---

# W40 — Checklist

## D0 — Kickoff gate ✅ **已解除**(2026-07-28)

- [x] `git fetch --all --prune` + 掃晒所有 branch → **W40 未被佔**(只有 `main` / `feat/ch-008-ledger-empty-rows` / 本地 deployment branch;git history 零 `docs/01-planning/W4*`)—— 呢步係 BACKLOG 頂部「兩個 W36」事件之後嘅防再犯規則
- [x] 實讀 **2004 workflow JSON** 逐個 node(唔靠 ADR 轉述)→ 揪到**三處**同 D3 對唔上,其中落差 #1 係 blocking(plan §2.2)
- [x] 實讀 **1007** `Prepare SN Update` → 確認佢只 close **action item 類** RITM(plan §2.3)
- [x] 查 code 揪到 **命名衝突**(`DirectServiceNowProvider` 已被 W25 佔用)+ **第二個 `addWorkNote` caller**(plan §3.1 / §3.2)
- [x] 確認加 connector **必然改 schema**(H1)—— **事前**就知,因為 W39 把教訓寫入 ADR-0013 補註
- [x] 🔴 **§8 五個 OQ 拍板**(Chris Lai,全部跟建議)
- [x] 🔴 **H1 approve**:additive migration 兩個 nullable 欄
- [x] ⚠️ 拍板後自查揪到**事實錯誤**:ADR-0016 預算 gate **W36 已實作**,唔係「未實作」⇒ 已入 plan §8 + changelog(錯事實會令 F4 走錯方向)
- [x] plan `status: draft → active`

## F1 — `TicketUpdateProvider` 抽象 + `DirectTicketProvider` ✅ **完成**(2026-07-28)

- [x] `integration/ticket-update/ticket-update.provider.ts` —— abstract class 做 DI token(同 W38 `license-ops` 同一形狀)
- [x] 介面**只收兩個方法**:`markInProgress` · `closeComplete` —— 🔴 **OQ-A:`addWorkNote` 唔入**,理由逐條寫入檔頭
- [x] 正規化 outcome `{status:'updated', newState}` | `{status:'error', details}`;`newState` **必須有**,因為 OQ-C 講明 contract 係「兩邊去到同一個 state」,冇佢就冇嘢 assert
- [x] transport 失敗 **throw**,但 🔴 **刻意唔 wrap 成 503**(同 W38 有意識分別):本 seam 嘅 caller 按 ADR-0011 OD4 **一定** swallow + 入佇列,wrap 成 HTTP 語意只會製造一個永遠冒唔出去嘅 status。跟嘅係同一條原則,唔係同一個實作
- [x] `RITM_STATE` / `RITM_TABLE` 由 **2004 JSON 實讀**寫成常數;table **寫死 `sc_req_item`** 唔跟 `SERVICENOW_DEFAULT_TABLE` —— 2004 個 patchUrl 焗死咗表名,跟 config 會令兩條路徑喺有人改設定嗰日靜靜分叉
- [x] `DirectTicketProvider` + 6 條行為 spec(field map 逐字 assert · 兩個 transition 唔可以互溝 · transport throw · `newState` fallback)
- [x] boundary spec:OQ-A 介面形狀 + OQ-D `outbound-retry` 唔走 seam + table 唔跟 config
- [x] 🔴 **正面半邊捉到我一個真錯**:原本用 `getOwnPropertyNames(prototype)` 讀方法 —— TS `abstract` 方法**冇 runtime 存在**,只返 `["constructor"]` ⇒ negative assertion **永遠綠**。改成 match 宣告形式 `abstract X(`(避開 comment,W39 踩過)
- [x] **fails-before 實證**:介面加 `abstract addWorkNote` + `outbound-retry` 加 import → **兩條真紅**,而且 TS **額外**爆一層(`DirectTicketProvider` 冇實作)→ 還原,`grep` = **0**
- [x] 全套 **538 / 538**(528→538)· lint 0 · tsc 0

## F2 — `N8nTicketProvider` + connector 註冊 ✅ **完成**(2026-07-28)

> 🔴 **R3 deviation**:原 plan 把 connector 註冊放 F3。做唔到 —— `resolve()` 第一個參數係 typed `ConnectorKey`,`'n8n-ticket'` 未入 `CONNECTORS` 之前 provider **編譯唔過**。註冊 + schema + `list()` 提前落 F2(plan §7 changelog)。

- [x] `POST {base}/wf4-sn-update` + header `x-uop-secret`,body `{ ritmId, mode, notes }`;trailing slash 唔會變 double slash
- [x] 🔴 `secret()` 喺 `try` **之外**求值(W39 踩過);兩條 test 分別釘死「key 未設」同「URL 未設」**唔可以**報成 n8n unavailable,而且 `fetch` 從未被呼叫
- [x] 🔴 **workflow-level error ≠ HTTP error**:2004 用 `neverError: true` PATCH,所以 SN 拒絕(row-ACL)會係 **HTTP 200 + `status:'error'`**。有獨立一條 test 釘死呢個 case
- [x] `details` **唔傳遞**(W39 OQ-2 / H4);test 餵一個帶 UPN 嘅 workflow `details`,assert outcome 序列化後**唔含**佢,但**保留 `httpStatus`**(數字,冚唔到 PII,而佢係分辨 ACL 失敗同錯 sys_id 嘅唯一線索)
- [x] mode 對照有**獨立**一條 test(0/1 相鄰而語意相反,逐方法 assert 會把同一個錯抄入兩邊)
- [x] secret 硬紅線:三條失敗路徑逐條走一次,assert shared key 零洩漏
- [x] `connectors.ts` 加 entry + `CONNECTOR_CONFIG` + `PROBEABLE` = **不可探**(2004 淨係識改真單,冇唯讀 mode 可借)
- [x] schema 兩個 nullable 欄 + migration `20260728084915_w40_n8n_ticket_connector`(**純 additive**,SQL 兩行)+ **DB 實查 14 欄**確認兩個新欄存在且 nullable
- [x] `integration-status.list()` 加 row + `n8nTicketSelected()`(**經 resolver**,唔係 env —— BUG-005 嘅規矩)
- [x] ➕ **順帶修一個既有 AP-13 缺口**:G1 leak test 個 env fixture 係**手抄清單**,加咗守門 test 令佢由 `CONNECTOR_CONFIG` derive ⇒ 揭穿 **4 個從來未被驗過**嘅 key(`GRAPH_TENANT_ID` / `GRAPH_CLIENT_ID` / `SERVICENOW_DEFAULT_TABLE` / `SERVICENOW_USER`),連同 W40 三個一齊補齊
- [x] **fails-before 實證**:刪走 `list()` 個 row + 抽走 leak fixture 一個 key → **5 failed / 15 passed**;🔴 而且 **TS 一句都冇投訴**少一個 row,證實 W39 個病確實可以靜靜發生 → 還原,`grep` = 0
- [x] 全套 **555 / 555**(538→555)· lint 0 · tsc 0

## F3 — 選路 factory + module wire ✅ **完成**(2026-07-28)

- [x] `ticketUpdateProviderFactory` **exported**(唔跟 seam ② 個 inline 寫法)—— 因為 fail-safe 方向係本 seam 唯一值得單獨 test 嘅性質:寫反咗**乜都唔會爆**,只會靜靜開始經第三方 close 真單
- [x] wire 落 `IntegrationModule`(seam ② 隔籬),DI token 綁抽象 + `exports` 加 `TicketUpdateProvider`
- [x] factory spec 9 條:unset / `'direct'` / `'n8n'` + **6 個 near-miss**(`N8N` · ` n8n` · `n8n ` · `nn8n` · `true` · `''`)—— 個值嚟自 admin 打入 DB 嘅欄,大小寫同空格唔係天方夜譚
- [x] ⚠️ **更正本 checklist 一項寫錯**:原寫「n8n 選咗但 URL 未配置 → **boot 失敗**(同 outbound factory 一致)」。**唔應該咁做** —— `N8nTicketProvider` 同 `N8nLicenseProvider` 一樣係 **per-call resolve** URL,boot 再 resolve 一次就係兩處各自維護同一件事(AP-13)。URL 缺失喺 per-call 報,已由 F2 一條 test 蓋住
- [x] **fails-before 實證**:把 `choice === 'n8n'` 改成 `choice ?`(truthy —— fail-safe 搞反嘅**真實形狀**)→ **6 failed / 3 passed**,`'direct'` 同全部 near-miss 一齊紅 → 還原,`grep` = 0
- [x] 全套 **564 / 564**(555→564)· lint 0 · tsc 0

## F4 — `assign.service` 接 trigger ✅ **完成**(2026-07-28,🔴 OQ-E:close + WIP 兩個都做)

- [x] ⚠️ **更正一個 plan 假設**:OQ-E 寫「一張 RITM 嘅**全部** line item 都完成 → close」,但查 schema 揭 `RequestLineItem.serviceNowSysId` = **THIS line's RITM**(ADR-0008 D6 兩層)⇒ **一個 line item = 一張 RITM**。所以條件簡化成「呢個 line item ASSIGNED → close 佢自己嗰張」
- [x] `closeComplete` trigger:assign 成功 + 有 per-line RITM → close(close_notes 承載原本 work note 嘅文字)
- [x] 🔴 **唔 fallback 去 parent REQ** —— REQ 係 `sc_request` 而 seam ④ 只寫 `sc_req_item`(2004 patchUrl 焗死);而且 close 一張 REQ ≠ close 一張 RITM(其他 line 可能仲開住)。冇 per-line RITM → 維持既有 work note
- [x] `markInProgress` trigger:預算 gate 擋 → 標「採購中」
- [x] 🔴 **重複寫入已擋**:新欄 `RequestLineItem.ticketHeldAt`(H1 approved)+ migration `20260728135856_w40_ticket_held_at`。只喺**成功寫入之後**先記,所以失敗會下次再試
- [x] 🔴 **close 唔使額外守門** —— stage gate(`item.stage !== READY` → 400)保證一個 line item 只會成功 assign 一次。查證得出,唔係假設
- [x] 失敗 = 非致命入佇列:新 kind **`servicenow.ticket_update`** 帶 `transition`(**一個** kind 唔係兩個 —— 兩個會有兩份講同一件事嘅 whitelist,AP-13)。`kind` 係 string 常數 ⇒ **零 schema**
- [x] retry 走 seam(OQ-B 拍板):`repairTicketUpdate` 按 `transition` 分派;**唔認識就 fail-loud**(close 一張只應 hold 嘅單唔可逆)
- [x] ➕ 順帶修 `pickFailurePayload` 一個 `kind !== 'servicenow.worknote'` 手抄判斷 —— 「除咗嗰個」會令**將來每個** kind 自動 opt-in;改成正面清單 `KINDS_WITH_LINE_ITEMS`(AP-13)
- [x] ⚠️ **偏離 checklist 一項**:原寫「spec 唔 mock provider,wire 真 `DirectTicketProvider`」。**冇跟** —— W38 嗰個手法係為咗保住 raw→503 wrap 喺測試鏈入面,而 seam ④ 冇同等嘢(兩個實作已經返同一詞彙,各自有 spec)。呢度 mock 抽象係啱嘅層次
- [x] **H5** 8 條新 test:close vs work note 二選一 · **唔** close parent REQ · hold 一次 · **第二次唔再 PATCH** · 失敗唔記 flag · 冇擋就唔 hold · close 失敗 assign 仍成功(OD4)· `error` outcome 同 throw 一視同仁
- [x] **fails-before 實證**:拆走 `ticketHeldAt` 守門 + 令 close fallback 去 REQ → **4 failed / 45 passed**(兩條新守門 + **兩條既有** test 一齊捉到)→ 還原,`grep` = 0
- [x] 全套 **575 / 575**(564→575)· lint 0 · tsc 0

## F5 — Contract test + 1007 分工邊界文件化 ✅ **完成**(2026-07-28)

- [x] 3 個 case **各寫兩次**(一次 ServiceNow 語言、一次 n8n 語言)再 assert 結果相等:close · hold · **冇 echo state 時兩邊都 fallback 到 requested**
- [x] 🔴 **三樣刻意唔 assert**,理由逐條寫入檔頭:①**notes 文字**(2004 必然 append 簽名 + 截 3900,而呢個係好事 —— 單上睇得出邊條路寫)②**error message**(vendor 掛咗要知係邊個掛)③**refusal shape** = 真不對稱,獨立釘死
- [x] 🔴 **真不對稱獨立釘死**:SN 拒絕 PATCH 時 direct **throw** 而 n8n 返 **`error` outcome**(2004 用 `neverError:true`)。兩個都啱,**共通點係兩者都唔可以被當成成功** —— 有人日後「統一」佢哋就會紅
- [x] 負面斷言:direct **從未**打 webhook · n8n **從未**掂 Table API · table 各自用得着嘅方式 assert(direct 名 `sc_req_item`;n8n 名 RITM + mode —— 表名喺 2004 個 patchUrl 入面,平台根本冇送)
- [x] ⚠️ **收窄咗一條 test 名**:原本叫 `both target sc_req_item`,但 n8n 嗰半 assert 唔到表名 ⇒ 名闊過 assert(BUG-004 教訓)。改成 `direct names sc_req_item; n8n names the RITM and the mode`
- [x] ➕ 刪走一句冗餘 assertion(`toBe('error')` 之後再 `not.toBe('updated')`)
- [x] 🔴 **1007 分工邊界結構上驗證,唔係 assume**(plan §5 R1)—— 實讀 1001 `Prepare Approval Data`:三個 actionItem **全部由 `phase1Items` 造**(`create_user` / `add_user_to_group` / `setup_abw_folder`),`other_items` **完全冇**入 actionItems;而平台側 `lic = other.filter(status === 'pending_license' || /O365/i)` ⇒ **兩套 sys_id 來自同一份 AI Brain output 嘅兩條互斥分支**
- [x] 證據 + 「一旦 n8n 側改咗,呢個 comment 會係第一樣唔再成立嘅嘢,而平台偵測唔到(RITM sys_id 兩邊長得一模一樣)」寫入 `ticket-update.provider.ts` 檔頭
- [x] **fails-before 實證**:令 n8n `read()` 當 HTTP 200 就係成功(**真實錯誤形狀**:「`call()` 已經檢查咗 `res.ok`」)→ **3 failed**(contract 1 + provider spec 2)→ 還原,`grep` = 0
- [x] ⚠️ **記低一個分層事實**:`assign.service` 嗰條「queues an error outcome」**冇**紅,因為 F4 mock 咗抽象 ⇒ assign 側守唔到 provider 側嘅 mapping bug。呢個係正常分工,但唔可以當佢有雙重保險
- [x] 全套 **588 / 588**(575→588)· lint 0 · tsc 0

## F6 — doc-sync

- [ ] ADR-0017 **實作補註** 加「辛 — W40」節(落差 #1 / 命名 / 兩個 caller / OQ-E trigger 定義 / OQ-D 收窄)
- [ ] ⚠️ **ADR-0016 D6 一句唔再字面成立** —— 佢寫「a block changes no state」,而 W40 個 hold 會寫 `ticketHeldAt` + PATCH 一次 SN。ADR 已 Accepted **唔改內容**,喺 ADR-0017 補註講清楚(code comment 已標)
- [ ] BACKLOG `N8N-SEAMS-己庚辛` row 更新 + 最後更新段
- [ ] runbook `docs/13-deployment/08-n8n-integration-go-live.md` 加 n8n 側前置(2004 secret · DEV host · credential row-ACL)
- [ ] 🚧 **誠實邊界照寫**:真切換零 live 驗證(同庚)
