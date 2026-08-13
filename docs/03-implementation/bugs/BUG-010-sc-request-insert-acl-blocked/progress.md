---
bug_id: BUG-010
report_ref: ./report.md
checklist_ref: ./checklist.md
status: complete
last_updated: 2026-08-13
retro_filled: true        # 🔴 2026-08-13 追溯補寫 — 見「本檔性質」
---

# BUG-010 — Progress

> ## 🔴 本檔性質:**追溯補寫(retro-fill),2026-08-13**
>
> 下面個 timeline **唔係當日逐日寫落嚟**,係 2026-08-13 由既有記錄**推導**返出嚟。
> **每一格都標明來源**,冇來源嘅一律唔寫 —— 唔補「應該係咁」嘅細節。
>
> 真正嘅 during-execution log 喺 **`docs/01-planning/W43-onboarding-license-request/progress.md`**
> (BUG-010 嘅 fix = 嗰個 phase 嘅 `F1`)。

## Timeline

| 日期 | 事件 | 來源(可查證) |
|---|---|---|
| **2026-08-01** | **發現** —— CH-014 造 ServiceNow onboarding fixture 時,`POST /api/now/table/sc_request` 一律 **403 `ACL Exception Insert Failed`** | `report.md` frontmatter `reporter` |
| 2026-08-01 | **五項實測**收窄範圍:①完整 payload 403 ②**最小 payload(單一 `short_description`)一樣 403** ③帳號 **71 個 role**(含 `sn_request_write`)④同帳號 `sc_req_item` PATCH **200** ⑤catalog API `order_now` **200** | `report.md` §2 |
| 2026-08-01 | **Root cause 定性** —— #2 證明擋喺 **table level 唔係 field-level ACL**;#4 證明**唔係「冇寫權」,而係 insert 同 update 兩套 ACL** | `report.md` §2 |
| 2026-08-01 | **Triage:Chris 定 Sev3**(由 AI 初判 **Sev2 降級**)—— 初判漏咗 ADR-0008 D3 本身就有 fallback 而且**已經寫咗**(`N8nWorkflowProvider` + `fulfilment.module.ts:49` 選路 + `connectors.ts:176` enum)⇒ 唔係「功能冇得救」,係 **default 揀咗條死路** | `report.md` §6 · frontmatter `Triage approver` |
| 2026-08-01 | **決定唔即刻修** —— 冇人用緊「IT 喺平台開單」,停喺 `triaged` 合理 | `report.md` §7 尾 |
| **2026-08-03** | **W43 開單時決定順帶修** —— 原文「順帶會修 **BUG-010**(`sc_request` insert 403 ⇒ 改行 Service Catalog API,更新 ADR-0008 D3)」 | `BACKLOG.md` W43 開單行 |
| **2026-08-04** | **Fix 落 code(W43 `F1`,ADR-0025 D2)** —— `DirectServiceNowProvider` 由 Table API insert 改行 **Service Catalog API**(`order_now` 單行 / `add_to_cart`+`submit_order` 多行),即係 §2 #5 實測 200 嗰條路 | `W43/checklist.md` `F1-1`..`F1-9` · `report.md` v1.3 |
| 2026-08-04 | **Regression gate** —— 11 個 unit test(order_now / `number` fallback / 冇 request number / cart count / 空 cart / add_to_cart / 400 mandatory / 5xx)+ **boundary test 專項斷言 `createRecord` 零呼叫** | `W43/checklist.md` `F1-4` / `F1-5` |
| 2026-08-04 | 🔴 **刻意只轉 `verifying` 唔轉 `done`** —— 等真環境驗過先 | `W43/checklist.md` `F1-7` |
| **2026-08-04** | **G6 真 POST → `done`** —— Chris 批准後行 **production class**(唔另寫一段 SN 呼叫)真建一張:**`REQ0044071` / `RITM0047366` / `SCTASK0071831`**,剛好一張 `Execution Step` active task。獨立 read 覆核(唔用 script 自己 output):`cat_item` = O365 單 · `requested_for` = Chris Lai · `target_user` = requester sys_id · `license_type` 留空 | `report.md` 頂部 blockquote · `BACKLOG.md` W43 收官行 |
| **2026-08-12** | ⚠️ **BACKLOG 嗰行被標「🟢 approved 要修 · 待開 BUG doc」** —— 而 bug 已經 closed 咗 8 日 | `BACKLOG.md` BUG-010 row(本次修正前) |
| **2026-08-13** | **Doc sync(本次)** —— 補 `checklist.md` + `progress.md`(PROCESS §4.3),BACKLOG 行改成 ✅ closed | 本 commit |

## Closeout summary

**Fix 一句話**:唔再自己 insert `sc_request`,改為**叫 ServiceNow 自己落單**(Service Catalog API)。

**點解呢個 fix 好過「叫 SN owner 開 insert ACL」**(report §7 另一條路):
catalog API 一落單,**SN 自己嘅 workflow 就會行**,所以 REQ / RITM / **catalog task** 同真單
**同一個形狀**。手砌 `sc_request` insert 永遠做唔到呢件事 —— 而 ADR-0018 D3「揀唯一 `active=true`
嗰張 task」正正**靠呢個形狀**。⇒ 由「繞過一個 403」變成「行返 SN 本身嘅正路」。

## 🔴 教訓(2026-08-13 補,由本次 doc sync 撞出嚟)

**呢個 bug 修好之後,喺 BACKLOG 度「復活」咗 8 日。**

`BACKLOG.md` 嗰行嘅**狀態欄**喺 2026-08-12 被標成「approved 要修 · 待開 BUG doc」,
而同一格嘅**詳情欄**由頭到尾仍然係 **2026-08-01 triage 原文**,結尾仲寫住
「**而家唔使揀 —— 冇人用緊,停喺 triaged 合理**」。同一格入面,兩句相隔 11 日、互相矛盾。

⇒ **下一個 session 揀工作嗰陣,會揀中一個已經修好嘅 bug。**(2026-08-13 真係發生咗,
喺開工前用三份來源交叉對證先捉到:`report.md` frontmatter `status: done` · code 實查
`direct-servicenow.provider.ts` 已冇 `createRecord(..., 'sc_request')` · `BACKLOG.md` 自己
另一行寫住「PR #75 merged … F1 修 BUG-010」。)

**呢個係本項目記錄在案嘅同族形狀第五次** ——「**狀態寫兩個地方,一個冇跟住更新**」
(前四次見 CLAUDE.md §9 / `SESSION_SUMMARY.md`)。

**同前四次唔同嘅係成因**:呢次唔係「兩處各自維護同一份清單」(BUG-004 / BUG-005 嗰種),
而係 **一格入面「狀態」同「理由」由唔同日期嘅人寫,而更新狀態嗰次冇讀返下面嗰段理由**。
⇒ 修法唔係「derive 唔好抄」,係:**改一行嘅狀態欄之前,先讀完同一行嘅詳情欄**;
詳情欄若然帶住日期(「以下係 2026-08-01 triage」),就要問「呢段仲啱唔啱」。

**結構性緩解(已落實)**:BUG-010 個 BACKLOG 行而家**唔再複製 triage 內容**,
改成指返 `report.md` / `checklist.md` —— 少一份要跟住更新嘅副本,就少一個漂移點。
