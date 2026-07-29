---
bug_id: BUG-007
title: "ServiceNowService.request() 把回應 body 原封 log,而 outbound create 個 payload 帶 UPN"
severity: Sev3          # Sev1 | Sev2 | Sev3 | Sev4 (per PROCESS.md §4.4)
status: triaged         # triaged | investigating | fixing | verifying | done | wont-fix
reported: 2026-07-28
reporter: "Auto-detected — W40 F1 睇 ServiceNowService 嗰陣見到"
affects_components: [integration/servicenow]
spec_refs:
  - CLAUDE.md §5.4 H4(絕不 log PII)
  - docs/03-implementation/bugs/BUG-001-graph-logs-upn-pii/
  - docs/03-implementation/bugs/BUG-004-vendor-error-logs-upn/(**同源,而本 bug 揭穿佢個劃線判斷唔準確**)
---

# BUG-007 — `ServiceNowService.request()` 原封 log 回應 body

> **Report version**:1.0(initial)
> **Triage approver**:待 Chris 確認 severity + RISK 升級

## 1. Symptom

```ts
// servicenow.service.ts:69-75
if (!res.ok) {
  const text = await res.text().catch(() => '');
  this.logger.error(`ServiceNow ${method} ${path} -> ${res.status}: ${text}`);
  throw new Error(`ServiceNow request failed (${res.status})`);
}
```

`text` 係 ServiceNow 嘅回應 body,**原封**入 log。呢個係 BUG-004 一模一樣嘅信任邊界問題,只係換咗個 vendor。

## 2. 🔴 呢個 bug 最重要嘅一半:BUG-004 個劃線基於一個唔準確嘅判斷

BUG-004 postmortem「唔做嘅嘢」寫住:

> **冇**把全部 12 處 raw-message log 一次過改 —— 其餘 8 處嘅 vendor 呼叫**唔涉及特定 user**,同一 pattern 唔係同一風險(§1.3)

**呢句對 `ServiceNowService` 嚟講唔成立。** `DirectServiceNowProvider.submit()` 開 REQ 嗰陣:

```ts
short_description: `M365/D365 license request — ${payload.targetUpn}`,
```

⇒ **outbound create 個 payload 確確實實帶住 UPN**,而佢正正經呢個 `request()` 出去。

當時嘅收窄本身係啱嘅做法(§1.3 唔順手改),但**個理由寫錯咗** —— 唔係「唔涉及 user」,而係「當時冇逐個 caller 查證」。

## 3. Expected vs Actual

- **Expected**:log 足夠 triage(邊個 method、邊條 path、HTTP status),但唔會夾帶外部系統塞畀我哋、內容我哋控制唔到嘅字串。
- **Actual**:整段回應 body 照抄。

## 4. Impact

### 查證過嘅範圍(唔係憑估)

`request()` **5 個** caller,逐個查過:

| caller | path 有冇 PII | payload 有冇 PII |
|---|---|---|
| `getRecord(sysId)` | ❌ sys_id | — |
| `getRecordByNumber(number)` | ❌ REQ/RITM number | — |
| `query(sysparmQuery)` | ❌ **唯一 caller 傳空字串**(`integration-probe`) | — |
| `createRecord(fields)` | ❌ 表名 | 🔴 **`short_description` 帶 targetUpn** |
| `updateRecord(sysId, fields)` | ❌ sys_id | ❌ note + state |

⇒ **path 側乾淨**(呢點同 BUG-004 唔同 —— 嗰次洩漏正正喺 path `/users/{upn}`)。

⇒ 風險只喺 **`text`**:ServiceNow 回應 body 會唔會 echo 返 request payload。

### ⚠️ 誠實邊界:未實證

平台**冇真 ServiceNow**(UAT 仍係 placeholder,dev 用 mock)。「SN 400 回應會 echo 返 payload」**係推論,唔係觀察**。

呢個同 BUG-004 有本質分別 —— 嗰個係喺 test 輸出**真係見到** UPN。

- **Workaround available?**:No(除咗唔睇 log)
- **Security implication?**:**潛在** —— 一個冇設防嘅信任邊界,而已知有一條路徑會送 UPN 出去

## 5. Severity Justification

**Sev3**,同 BUG-001 / BUG-004 一致:

- H4 policy 面嘅缺口 ⇒ 唔可以當 Sev4 cosmetic
- 但未實證真有洩漏,亦唔係外洩畀第三方 ⇒ 唔到 Sev2

## 6. 🔴 RISK 升級 —— 呢個係 BUG-004 postmortem 預先承諾嘅觸發點

BUG-004 postmortem 尾段寫:

> **唔加新 risk。** 呢個係一次過嘅實作缺陷 + 一個已經修好嘅測試盲點…**若果第三次出現同類洩漏,就應該升級成 register 入面一條「外部字串處理」嘅 risk**。

數:BUG-001(自己格式化嘅字串)→ BUG-004(Graph 塞畀我哋嘅 message)→ **本 bug(ServiceNow 塞畀我哋嘅 body)= 第三次**。

⇒ **`RISK_REGISTER` 加 R5**:「外部系統回傳嘅字串被當成安全內容記錄」。呢個唔係要再修一次同一個 bug,而係承認佢係一個**結構性**傾向而唔係三次獨立手誤。

## 7. Acceptance for Fix

- [ ] Fix:`text` 經 `scrubPii()` 先入 log(沿用 BUG-004 建嘅同一個 helper,**唔另寫一個 regex**)
- [ ] Regression test(**fails before**):餵一個帶 email 嘅回應 body,assert logger 收到嘅係 redacted
- [ ] 保留 method / path / status —— 佢哋係 triage 嘅唯一原因,而且查證過唔含 PII
- [ ] **更正 BUG-004 postmortem 嗰句劃線理由**(唔改佢個決定,改佢個**理由**)
- [ ] `RISK_REGISTER` 加 R5
- [ ] ⚠️ 明標未 live 驗證

## 8. Report Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-28 | Initial triage(Sev3)+ 提出 RISK 升級 | W40 揪到;查證 5 個 caller 之後發現 BUG-004 個劃線**理由**唔準確 | — |
