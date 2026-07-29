---
bug_id: BUG-006
report_ref: ./report.md
status: complete
last_updated: 2026-07-28
---

# BUG-006 — Checklist

## Investigate

- [x] Root cause:`addWorkNote(sysId, note, table)` 三個參數,**sys_id 有兩個來源而 table 只寫死一個**,但兩者本來要一齊變
- [x] 確認 REQ 真係住喺 `sc_request` —— `DirectServiceNowProvider.submit()` 就係 `createRecord(..., 'sc_request')` 開佢
- [x] 確認 **W40 令佢由「偶然」變「必然」**:W40 之前有 RITM 嘅 line item 行同一句(傳 RITM sysId + `sc_req_item` = 啱);W40 之後有 RITM 改行 `closeComplete` ⇒ 剩返嘅唯一情況就係錯嗰半

## Fix

- [x] fallback 傳 `'sc_request'`
- [x] 🔴 **table 名寫成一個 local const 再用兩次**(呼叫 + queued payload)—— retry 會 **replay 個 payload**,兩個 literal 就係兩樣要各自記得改嘅嘢,而且互相睇唔到(AP-13)
- [x] 有 RITM 走 `closeComplete` 嘅路徑**零改動**

## Regression test

- [x] **fails-before 天然實證**:改完 code 即刻跑 → **2 條既有 test 紅**(happy path + `never closes the parent REQ`)⇒ 呢個位一直有守門,只係守住咗一個錯嘅值
- [x] 兩條 assertion 改成 `'sc_request'`
- [x] 🔴 **順手改埋個 comment** —— 原本寫住「still targeting the sc_req_item table (two-level, ADR-0008)」,即係**一個錯誤意圖被寫成 spec**。test 同 comment 一直互相印證,而兩者都冇同 ServiceNow 對過(AP-13 子型 ②)
- [x] ➕ 新 assertion:queued payload 個 `table` 必須同真正 call 嗰個一致 —— 唔一致嘅話,**每次 retry 都會用同一個錯值失敗,永遠**

## Verify

- [x] `assign.service` **49 / 49**;全套 **599 / 599** · lint 0 · tsc 0
- [x] ⚠️ **明標未 live 驗證**:冇真 ServiceNow(UAT placeholder / dev mock),「PATCH 錯表會 404」係依 Table API 語意嘅推論
