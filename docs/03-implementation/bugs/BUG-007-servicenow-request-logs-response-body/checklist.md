---
bug_id: BUG-007
report_ref: ./report.md
status: complete
last_updated: 2026-07-28
---

# BUG-007 — Checklist

## Investigate

- [x] 逐個查 `request()` 嘅 **5 個** caller(唔係憑估):`getRecord` / `getRecordByNumber` / `query` / `createRecord` / `updateRecord`
- [x] **path 側乾淨** —— `query(sysparmQuery)` 把任意字串放入 path,但**唯一 caller**(`integration-probe`)傳空字串。⇒ 同 BUG-004 相反(嗰次洩漏正正喺 path `/users/{upn}`)
- [x] 🔴 **payload 側唔乾淨** —— `DirectServiceNowProvider.submit()` 送 `short_description: 'M365/D365 license request — ${targetUpn}'`
- [x] ⚠️ **明確標記未實證**:平台冇真 ServiceNow,「SN 會 echo 返 payload」係推論,唔係觀察。同 BUG-004(test 輸出**真係見到** UPN)有本質分別

## Fix

- [x] `text` 經 **`scrubPii()`**(BUG-004 建嘅同一個 helper)—— **唔另寫 regex**
- [x] `method` / `path` / `status` 保持原樣:佢哋係 log 呢行嘅唯一原因,而且上面逐個 caller 查證過唔含 PII

## Regression test(fails before, passes after)

- [x] 🔴 **assert LOGGER,唔係 exception** —— 條既有 test `throws when ServiceNow returns a non-ok status` 正正係 BUG-004 匿咗 18 日嘅同一個形狀:exception message 係我哋自己寫嘅,一直乾淨
- [x] 餵一個帶 email 嘅 SN 回應 body → assert log 冇 `sensitive.person@example.com`、有 `REDACTED`(**import 常數,唔手抄字串**)
- [x] 同時 assert **三個 triage 事實冇被 scrub 走**(`400` / path / `POST`)
- [x] ➕ **over-scrub 都係 failure**:`'User Not Authorized'` 要原封保留 —— 佢係分辨「帳號冇權限」同「record 有問題」嘅唯一線索
- [x] **fails-before 實證**:移走 `scrubPii()` → 條新 test 真紅 → 還原,`grep` = 0

## Doc / RISK

- [x] 🔴 **更正 BUG-004 postmortem 個劃線理由**(保留原文 + 加註,唔改寫)—— 「其餘 8 處**唔涉及特定 user**」對 `ServiceNowService` 唔成立;真正理由係「**當時冇逐個 caller 查證**」
- [x] 🔴 **`RISK_REGISTER` 加 R5**「外部系統回傳嘅字串被當成安全內容記錄」—— 呢個係 **BUG-004 postmortem 明文承諾嘅觸發點**(第三次同類就升級)
- [x] R5 明列**已知未覆蓋**:`scrubPii()` 只捉 email 形狀,而**刻意唔擴闊 regex**(會食走 AADSTS 碼呢啲 log 呢段文字嘅唯一原因)

## Verify

- [x] `servicenow.service` **5 / 5**;全套 **599 / 599** · lint 0 · tsc 0
