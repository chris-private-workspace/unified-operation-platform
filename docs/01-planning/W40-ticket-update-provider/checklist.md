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

## F3 — 選路 factory + module wire

- [ ] 選路 factory 同 `requestSubmissionProviderFactory` 同一形狀;**非 `'n8n'` 一律落 `direct`**
- [ ] wire 落 `FulfilmentModule`(或 `IntegrationModule`)+ DI token 綁 `TicketUpdateProvider`
- [ ] factory 單元 test:unset / `'direct'` / typo → `DirectTicketProvider`;只有 `'n8n'` → `N8nTicketProvider`
- [ ] n8n 選咗但 URL 未配置 → boot 失敗(同 outbound factory 一致)

## F4 — `assign.service` 接 trigger(🔴 OQ-E:close + WIP 兩個都做)

- [ ] `closeComplete` trigger:一張 RITM 嘅**全部** line item 都完成 → close
- [ ] `markInProgress` trigger:預算 gate 擋 → 標「採購中」
- [ ] 🔴 **重複寫入必須擋**(plan §8 衍生問題):操作員可以不斷重試被擋嘅 assign ⇒ 唔可以每次都 PATCH 真單。只喺**狀態轉變**時寫
- [ ] 🔴 **同一張 RITM 只 close 一次** —— 平台側擋,唔靠 SN 容忍
- [ ] 失敗 = 非致命,入 `OutboundFailure` 佇列(ADR-0011,OD4:唔可以令已成功嘅 assign 變失敗)
- [ ] **H5**:critical path 有 test —— 呢個係 assign 路徑,`assignLicense` / stage 推進兩個 critical path 都掂到
- [ ] spec **唔 mock provider**,wire 真 `DirectTicketProvider` 包住既有 `snow` mock(W38 G2 手法:mock 走 provider 會令 wrap 跌出測試鏈)
- [ ] fails-before 實證

## F5 — Contract test + 1007 分工邊界文件化

- [ ] 同一組 case 兩個 provider → **同一 state**(OQ-C:**唔** assert notes 文字)
- [ ] 負面斷言:`addWorkNote` 從未經 seam · direct 路徑從未打 webhook · n8n 路徑從未直接 PATCH SN
- [ ] 🔴 **1007 分工邊界寫入 code comment**:1007 只 close AD 類 RITM(`create_user`/`add_user_to_group`/`setup_abw_folder`),平台只 close license 類(`RequestLineItem.serviceNowSysId`)
- [ ] ⚠️ **驗證「唔重疊」唔係 assume** —— 實讀 1001 分流 gate(`phase1_items` vs `other_items`)並記錄結果(plan §5 R1)
- [ ] fails-before 實證

## F6 — doc-sync

- [ ] ADR-0017 **實作補註** 加「辛 — W40」節(落差 #1 / 命名 / 兩個 caller / OQ-E trigger 定義)
- [ ] BACKLOG `N8N-SEAMS-己庚辛` row 更新 + 最後更新段
- [ ] runbook `docs/13-deployment/08-n8n-integration-go-live.md` 加 n8n 側前置(2004 secret · DEV host · credential row-ACL)
- [ ] 🚧 **誠實邊界照寫**:真切換零 live 驗證(同庚)
