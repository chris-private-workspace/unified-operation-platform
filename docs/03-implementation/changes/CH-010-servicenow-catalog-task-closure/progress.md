---
change_id: CH-010
spec_ref: ./spec.md
checklist_ref: ./checklist.md
status: done           # blocked | in-progress | done
---

# CH-010 — Progress

> During-execution log + completion summary。每 commit 對應一個 Day-N entry(R2)。

---

## Day 0 — 2026-07-29:ADR-0018 + spec 開單(**proposed / blocked,未開工**)

**Action**:ADR-0018 起草 + CH-010 開單(PROCESS §3),**零 code 改動**。

### 觸發

Chris 2026-07-29:「除咗 requested item 之外,其實係要更新 **catalog task** 嘅狀況,先至可以令 request item close / completed。」

### 查證(SN dev `ricohapdev`,**只做 GET**)

呢次係 ServiceNow **第一次真正接通**。之前 probe 一直失敗,根因唔係憑證:公司 proxy **只 MITM `ricohapdev.service-now.com`,冇攔截 `graph.microsoft.com`**,而 Node 有自己一套 bundled CA store、唔讀 Windows 憑證庫 ⇒ `fetch` 死喺 `SELF_SIGNED_CERT_IN_CHAIN`。curl 用 schannel 所以同一條 URL 睇落又「通」,呢個唔一致最誤導。`--use-system-ca` 解決,已入 `restart-stack` skill(`12af8de`)。**同本 change 無關,但唔通就查唔到下面任何嘢。**

| 查證 | 結果 | 依據 |
|---|---|---|
| 平台 direct 寫咩 | 只 `sc_req_item` 嘅 `state`/`close_notes` | `direct-ticket.provider.ts:28-42` |
| n8n 2004 寫咩 | 一樣,patchUrl **焗死** `/api/now/table/sc_req_item/` | `Validate & Build Patch` node |
| n8n 1007 寫咩 | 一樣,`newState: '3'` | `Prepare SN Update` node |
| 全套 workflow 有冇掂 task | **`sc_task` / `catalog_task` 零命中** | grep 10 個 JSON |
| SN 真數據 | `RITM0042590 state=1 stage=execution active=true` ← 底下 `SCTASK0064121 state=-5 active=true` | read-only 查證 |

### 🔴 唔係「漏咗做」,係當初刻意唔做

2004 個 sticky note:

> RITM ONLY. 3 fields: state, work_notes, close_notes.
> **No stage, no tasks, no REQ — deliberate: hidden SN logic beneath them**

本 change **唔係推翻嗰個直覺** —— 恰恰相反:嗰段「hidden SN logic」先係應該負責 close RITM 嗰個,而平台一直繞過咗佢自己去改 RITM state。方案 B 係**唔繞過**,餵佢應該收到嘅輸入。

### 今日嘅失敗模式(點解值得做)

`ServiceNowService` 任何 2xx 就當成功,`DirectTicketProvider` 收 200 就回 `updated` ⇒ 就算張單因為 task 未完而實際冇 close:

- 平台照標記完成
- 唔會入 `OutboundFailure`(佢只接 throw)
- 冇任何 audit 講「其實冇 close 到」

**平台宣稱完成、SN 側張飛仲開住,兩邊都唔會嘈。** 呢個係最差嗰種失敗。

### 方案

Chris 揀 **B**:平台只 close 自己嗰張 catalog task,RITM 交返 SN workflow 推。否決 A(平台自己再 PATCH RITM —— 等於把 SN 狀態機規則複製入平台)同 C(當 SN 配置問題 —— 平台照樣靜靜報成功一樣係錯)。詳見 **ADR-0018**。

### 🔴 Blockers —— 兩重 gate,兩個都未過

1. **ADR-0018 仍係 `Proposed`**,因為 **OQ-1 唔係實作細節,係「揀邊個方案」**:
   若「close 晒 task 之後 RITM **唔會**自動推」,方案 B 會令張單**永遠唔 close**,比今日更差 ⇒ 要改揀方案 A。
   所以**唔會**因為方向已 approve 就標 Accepted,亦**唔會**「先做住可以做嘅部分」。
2. **spec 仍係 `proposed`**,等 Chris approve(PROCESS R1.change)。

### 五條 OQ 交 SN owner

| OQ | 問題 |
|---|---|
| **1** 🔴 | close 晒 catalog task 之後,RITM 會唔會自動 advance 到 Closed Complete? |
| **2** 🔴 | integration 帳號有冇 `sc_task` **寫**權?(讀權已實測 78 欄;寫權**唔可以**靠試 —— 試一次就改真單。而且 2004 sticky 已警告 `n8napiservice1` 有 row-level ACL) |
| 3 | `sc_task.state` 值域?(`sys_choice` 返 **403**,讀唔到;實測見到 `-5` 同 `1`,SN 預設係 `-5 Pending / 1 Open / 2 WIP / 3 Closed Complete`,**但喺呢個 instance 未經證實**) |
| 4 | 一張 RITM 多張 task 嗰陣認邊張? |
| 5 | RITM 個 `stage`(見到 `execution`)使唔使平台掂? |

### 唔喺本 repo 手上嘅前置

- **n8n 2004 要加 task 支援** —— 佢個 patchUrl 焗死 `sc_req_item`。ADR-0017 **D0 要求兩條路做同一件事** ⇒ 2004 未改之前,`n8n-ticket` 掣**唔可以**切去 `n8n`。
- SN 側 `sc_task` 寫權開通(OQ-2)。
- A11 要嘅**測試 RITM fixture**。

**Commit**:`<hash>` — `docs(adr): ADR-0018 + CH-010 開單`

---

## Day 1 — 2026-07-29:五條 OQ 全部解決,ADR-0018 轉 Accepted(**仍未開工**)

### Chris 答咗兩條 gate

| OQ | 答案 |
|---|---|
| **OQ-1** 🔴 | 「喺 UOP **只需要處理 catalog task 嘅狀態就足夠**,RITM 嘅狀態由 ServiceNow workflow 去處理」⇒ **方案 B 成立**,方案 A fallback 唔啟用 |
| **OQ-2** 🔴 | **有寫權** —— 因為呢個係 **admin 權限**嘅帳號 |

### 餘下三條由 read-only 查證自解(唔使再等一轉)

**OQ-3 — `state` 值域**:`sys_choice` **即使 admin 帳號都仍然 403** ⇒ 係 table-level 限制,唔係 role 問題。改用 800 筆真數據反推:

| state | 次數 | active=true |
|---|---|---|
| **3** | **595** | **0** |
| 7 | 151 | 0 |
| 1 | 24 | 24 |
| 4 | 24 | 0 |
| -5 | 4 | 3 |
| 2 | 2 | 1 |

`3` = 壓倒性主導嘅終態,同 SN 預設、同平台/1007/2004 對 RITM 一直用嘅值三方一致 ⇒ close 寫 `3`、hold 寫 `2`。
⚠️ **仍係推斷,唔係 instance choice list 確認** —— constant 要寫明出處。

**OQ-4 — 認邊張 task**(本日最有價值嘅發現):抽 800 筆覆蓋 **772 張 RITM**

| | |
|---|---|
| 總 task 數 | 1 張:**745** · 2 張:26 · 3 張:1 |
| **active** task 數 | 0 張:744 · **1 張:28** · **≥2 張:0** 🔴 |

⇒ 「多張 task」真實存在(27 張 RITM),但**佢哋唔會同時 active** —— 順序行。close 嗰刻永遠只面對一張。
**「唯一 active」呢條規則有 772 個樣本、零反例。**

其他識別方式查過都冇用:`sys_class_name` 全部 `sc_task`、`order` 全部空。`assignment_group` 有值但**刻意唔用** —— 綁死 group id 之後 SN 側改組織就爛。

⚠️ 但 `≥2` 嘅分支**照樣要寫要有 test**:抽樣冇出現 ≠ 唔會發生,而嗰個 case 一旦發生,「揀第一個」= close 咗人哋張單。

**OQ-5 — RITM `stage`**:併入 OQ-1 答案 —— `stage` 係 RITM 屬性,整個 RITM 交返 SN workflow。

### ⚠️ 順帶揭出一個唔屬本 change 嘅問題

OQ-2 嘅答案係「**因為係 admin 權限帳號**」。即係平台對 SN 嘅寫入面,技術上遠闊過實際需要(只需要讀寫 `sc_req_item` / `sc_task` 三個欄)。

唔係本 change 造成,亦唔阻住本 change —— 但係 **least-privilege 缺口**:平台任何一個 bug 嘅爆炸半徑,由「改錯一張單」變成「admin 做得到嘅任何嘢」。⇒ 轉 **DEPLOY-harden**(H3,唔喺本 change 順手做),已記入 BACKLOG + ADR-0018。

### 狀態變化

- **ADR-0018**:`Proposed → Accepted`;D3 由「待 OQ-4」寫成具體規則 + 反例數據;新增 **D3b**(state 值)
- **CH-010 spec**:D2/D3 填實;**R1/R2 消解**,R3 降到 Low(有 772 樣本)、R4 降到 Low;§7 changelog 記低「**scope 冇擴,只係把待定項填實**」
- **checklist**:`blocked → ready`,Gate 0 七項打勾

### 仍然未開工 —— 剩返兩件

1. 🔴 **Chris approve 本 spec**(`proposed → approved`,PROCESS R1.change)
2. 🔴 **SN owner 畀一張測試 RITM**(A11 要真 close 一次;**絕不掂真客戶單**)

**Commit**:`<hash>` — `docs(adr): ADR-0018 Accepted + CH-010 五條 OQ 全解`

---

## Day 2 — 2026-07-29:實作 + live 驗證 + 收官

### 開工次序刻意調轉:先做 live 實驗,再寫 code

方案 B 成敗全繫於「close task → RITM 自動推」。Chris 口頭答咗,但**未驗**。照住未驗嘅前提寫晒實作,錯咗就成份拆返。所以先做實驗。

結果證明呢個決定係啱嘅 —— **頭兩次實驗都冇得出預期結果**:

| # | 對象 | 結果 |
|---|---|---|
| 1 | `SCTASK0027606` → `RITM0023203`(2023 年 AD onboarding 單) | task close 成功,但 **RITM 60 秒都冇郁** |
| 2 | `SCTASK0071510` → `RITM0046999`(license 類) | **403 —— business rule `Validate "Assigned to" before close`** |
| **3** | `SCTASK0071496` → `RITM0046984`(license 類,補 assigned_to) | ✅ **5 秒內 RITM state 1→3 · stage execution→complete · active→false** |

⇒ 方案 B **成立**,但有兩個 ADR 冇預見嘅前置條件(見下)。若當初直接寫 code,實驗 #1 嗰個「冇郁」會喺實作完之後先出現,而嗰陣好難分辨係 code 錯定係前提錯。

### 🔴 兩個實測揪出、寫進 ADR 補註嘅嘢

**① `assigned_to` 係 close 嘅前置條件。** 同一張 task:`{state:'3'}` → 403;`{assigned_to, state:'3'}` → 200。Chris 拍板 = integration 帳號 + **只喺空值時填**。

🔴 **絕不覆蓋已有 assignee** —— 覆蓋等於把人哋張單嘅負責人改走,而且**兩種情況 close 都會成功,所以完全睇唔見**。呢個係本次最易靜靜做錯嘅位,已有專門 test。

順帶解釋咗之前查唔明嘅現象:**點解咁多 RITM 被直接 close 而 task 留住開** —— close task 會被擋,close RITM 唔會。

**② Day 1 講嘅「772 張零反例」已經有反例。** `RITM0047290` 有兩張同時 active 嘅 task,而且係 **`D365 User License Maintenance Request`** —— 正正係本 seam 會收到嗰類單。規則唔變(唯一 active + fail-closed),但**理由由「防禦未見過嘅情況」變成「已知會發生」**。抽樣得出嘅規律唔係規律。

### 實作

| 檔 | 改動 |
|---|---|
| `ticket-update.provider.ts` | 加 `TASK_TABLE` / `TASK_STATE`(註明出處係經驗值域);**刪 `RITM_TABLE`**;`RITM_STATE` 保留 |
| `servicenow.service.ts` | 加 `getIntegrationUserSysId()`(lazy + cache,唔喺 boot 做);`request()` 加 `logPath` —— 因為新 caller 個 query string 帶住 `SERVICENOW_USER`,而 error log 本來會原文印 path(H4) |
| `direct-ticket.provider.ts` | 重寫:查 task → 唯一 active → 補 assigned_to(只喺空值)→ PATCH `sc_task` |
| `n8n-ticket.provider.ts` | 兩個方法 throw;**刪走** W40 個 2004 client |

**`RITM_TABLE` 刪咗** —— ADR D4 話「work note 路徑仲用緊」係錯:work note 走 `addWorkNote()` 冇傳 table,用緊 `SERVICENOW_DEFAULT_TABLE`。已入 ADR 補註 ②。

**n8n client 刪而唔係留低休眠**:留低就係冇 caller 到達得到、因此測唔到嘅 code。跟 W38 收窄 D2 同一原則。重新啟用 = 對住 2004 新 mode 重寫,唔係 revert。

### 驗證

- **api 599 / 55 suites 全綠**,lint 零 output,build OK
- 我改嘅四個 spec:direct **5→14**、boundary 4→5、contract 9→9、n8n **13→7**(減嗰 6 條係跟住被刪嘅 2004 client 走,唔係放棄覆蓋)
- 🔴 **A11 行真 code path**:造一個 `OutboundFailure`(kind `servicenow.ticket_update`)→ `POST /admin/outbound-failures/:id/retry` → HTTP 200、`open → resolved`;`SCTASK0071391` state 1→3 + assigned_to 由空變有值 + close_notes = 平台嗰句;**`RITM0046766` state 1→3 · stage execution→complete,而平台完全冇掂過佢**。順帶亦證實 ADR-0017 W40 **OQ-D**(ticket state repair 必須走 seam)喺新寫入對象下仍然成立
- fixture 已刪,`ch010_rows_left = 0`

### 我改動咗嘅 dev SN 記錄(完整交代)

| 記錄 | 改咗咩 | 連帶 |
|---|---|---|
| `SCTASK0027606` | state 2→3 | RITM0023203 **冇郁** |
| `SCTASK0071496` | assigned_to + state 1→3 | **RITM0046984 自動 close** |
| `SCTASK0071510` | 試過但 403,**零改動** | — |
| `SCTASK0071391` | assigned_to + state 1→3(經平台) | **RITM0046766 自動 close** |

全部係 dev instance,Chris 已授權。RITM 一旦被 workflow 推走就**還原唔到**。

### 紀律自檢

**H1** ✅ 零 schema(`schema.prisma` diff 0)· **H2** ✅ 零新 dep · **H3** ✅ 冇掂 REQ / 1007 AD task / ledger / reconcile / stage machine · **H4** ✅ 新增 `logPath` 就係為咗唔畀 `SERVICENOW_USER` 入 log;實驗腳本全程唔印憑證 / 人名 · **H5** ✅ critical path 覆蓋(fail-closed 兩個分支、assigned_to 三個分支、error contract)· **H7** ✅ 每個結論都有真 output · **H8** ✅ 全程 Read/Grep/Glob,無 bash 讀檔

**Commit**:`<hash>` — `feat(integration): CH-010 — 履行完成改為 close catalog task`

---

## Completion summary

**Status**:✅ done(2026-07-29)。

平台之前 PATCH RITM state 收到 200 就當成功,但喺 Ricoh instance 嗰張單**根本冇 close** —— 而且唔會入失敗佇列、冇 audit,兩邊都唔嘈。而家改為 close catalog task,RITM 交返 SN workflow 推,已 live 證實。

**唔可以忘記嘅兩件**:

1. 🔴 **`n8n-ticket` 掣鎖死 `direct`** —— 2004 未支援 task 之前揀 n8n 會逐張單 throw(入失敗佇列,寫明點解同點解決)
2. 🔴 **assigned_to 只填空值** —— 覆蓋人哋嘅 assignee 係唯一一個「做錯咗但完全睇唔見」嘅失敗模式
