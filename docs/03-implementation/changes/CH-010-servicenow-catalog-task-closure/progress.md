---
change_id: CH-010
spec_ref: ./spec.md
checklist_ref: ./checklist.md
status: blocked        # blocked | in-progress | done
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

## Completion summary(填於 done)

_(未開工)_
