---
bug_id: BUG-006
title: "Assign 寫 work note 落 parent REQ 時,用 REQ 嘅 sys_id 去 PATCH sc_req_item 表"
severity: Sev3          # Sev1 | Sev2 | Sev3 | Sev4 (per PROCESS.md §4.4)
status: triaged         # triaged | investigating | fixing | verifying | done | wont-fix
reported: 2026-07-28
reporter: "Auto-detected — W40 F4 接 close trigger 嗰陣睇到"
affects_components: [fulfilment/assign]
spec_refs:
  - docs/adr/0008-request-intake-d365.md D6(two-level REQ / RITM mirror)
  - docs/01-planning/W24-request-intake/CONTRACT.md §4
---

# BUG-006 — work note fallback 用 REQ sys_id 打 RITM 表

> **Report version**:1.0(initial)
> **Triage approver**:待 Chris 確認 severity

## 1. Symptom

`assign.service` 喺 assign 成功之後寫 ServiceNow work note。當呢條 line item **冇** per-line RITM 時,佢 fallback 去 parent REQ 嘅 sys_id —— 但**表名照舊寫死 `'sc_req_item'`**。

```ts
// W40 之前
const snTarget = item.serviceNowSysId ?? request.serviceNowSysId;
await this.snow.addWorkNote(snTarget, note, 'sc_req_item');
```

REQ 住喺 **`sc_request`**(`DirectServiceNowProvider.submit()` 就係用 `createRecord(..., 'sc_request')` 開佢)。用 REQ 個 sys_id 去 PATCH `sc_req_item/{sysId}` = 喺 RITM 表搵一個唔存在嘅 record。

## 2. Reproduction Steps

1. 一張 request,其 line item **冇** `serviceNowSysId`(legacy row,或者 user-facing intake 冇 per-line RITM)
2. 該 request **有** `serviceNowSysId`(parent REQ)
3. assign 該 line item
4. 平台 PATCH `sc_req_item/{REQ_sys_id}`

**Reproduction reliability**:結構上必然 —— 只要行到 fallback 分支
**Environment**:任何有真 ServiceNow 嘅環境

## 3. Expected vs Actual

- **Expected**:work note 寫落佢實際住嗰張 record —— REQ 就用 `sc_request`。
- **Actual**:永遠傳 `'sc_req_item'`,即使 sys_id 係一張 REQ。

## 4. Impact

- **Affected users / scenarios**:任何**冇 per-line RITM** 嘅 line item 嘅 assign 寫回。
- **⚠️ W40 令佢由「偶然」變成「必然」**:W40 之前,有 RITM 嘅 line item 行同一句 `addWorkNote`,傳嘅係 RITM sys_id + `sc_req_item` = **啱**。W40 之後,有 RITM 改行 `closeComplete`,所以**呢句 `addWorkNote` 剩返嘅唯一情況就係 fallback**,即係只剩錯嗰半。
- **Workaround available?**:No
- **Data loss / corruption?**:No —— 冇嘢寫錯地方,係**乜都冇寫到**
- **Security implication?**:No

## 5. Severity Justification

**Sev3**(minor feature degraded / specific impact):

- 唔係 outage、冇資料損壞、assign 本身照樣成功(ADR-0011 OD4:寫回失敗係非致命)
- 但**寫回靜靜地永遠失敗**,而且每次都會產生一條 `OutboundFailure` 佇列記錄 ⇒ 運維會見到一堆修唔到嘅失敗
- 唔到 Sev2(冇擋住任何人做嘢),唔係 Sev4(唔係 cosmetic —— 有一個功能完全冇兌現)

## 6. Initial Diagnosis

- **Root cause**:`addWorkNote(sysId, note, table)` 三個參數入面,**sys_id 揀咗兩個來源,而 table 只寫死一個**。兩者本來要一齊變。
- **點解一直冇人發現**:W40 之前呢句嘅**主要**路徑(有 RITM)係啱嘅,錯嗰半只喺 legacy 資料出現,而 dev / UAT 都係 mock ServiceNow ⇒ 冇人見過真 404。

## 7. Acceptance for Fix

- [ ] Fix:fallback 去 parent REQ 時傳 `'sc_request'`
- [ ] Regression test(**fails before**):冇 per-line RITM → assert `addWorkNote` 收到 `'sc_request'`
- [ ] 既有「有 RITM 走 close」嘅行為零改動
- [ ] ⚠️ **明標未 live 驗證** —— 冇真 ServiceNow,「PATCH 錯表會 404」係推論(依 Table API 語意),唔係實證

## 8. Report Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-28 | Initial triage(Sev3) | W40 F4 揪到;當時明文唔喺該 phase 修(超出範圍),留做 follow-up | — |
