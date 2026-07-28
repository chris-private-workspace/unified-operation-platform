---
bug_id: BUG-004
title: "Vendor error message 原封入 log,而 Graph 404 body 帶 UPN"
severity: Sev3          # Sev1 | Sev2 | Sev3 | Sev4 (per PROCESS.md §4.4)
status: triaged         # triaged | investigating | fixing | verifying | done | wont-fix
reported: 2026-07-27
reporter: "Auto-detected — W39 F2 個 H4 test 跑起嗰陣喺 log 見到"
affects_components: [integration/graph, fulfilment/sync-sweep, license/catalog, license/reconcile]
spec_refs:
  - CLAUDE.md §5.4 H4(絕不 log PII;user UPN / email 唔好落 plaintext log)
  - docs/03-implementation/bugs/BUG-001-graph-logs-upn-pii/(同類,已修過一次)
---

# BUG-004 — Vendor error message 原封入 log,而 Graph 404 body 帶 UPN

> **Report version**:1.0(initial)
> **Triage approver**:**Chris Lai(2026-07-28)** —— severity Sev3 確認,fix 方向 = **scrub email pattern**

## 1. Symptom

平台 log 入面出現真實用戶 UPN。

`graph-unavailable.ts` 把 vendor 拋出嚟嘅 `err.message` **原封**寫入 `logger.error`,而 Microsoft Graph 嘅 404 / 400 回應**慣常喺 message 裡面引用 request path**,path 入面就係 UPN。

呢個檔自己個 doc comment 仲寫住:

> `H4: never log the target UPN or any secret; the action + message is enough to triage.`

**佢做唔到自己聲稱嘅嘢。**

## 2. Reproduction Steps

1. 跑 `npm test -w @uop/api -- --testPathPattern=graph-license`
2. 睇 test 輸出嘅 Nest log(嗰條 test 特登餵一個含 UPN 嘅 vendor error)
3. 觀察:

```
[Nest] ERROR [GraphLicenseProvider] Microsoft Graph unavailable while trying to
look up the target user: Request failed for /users/sensitive.person@example.com
```

**Reproduction reliability**:Always
**Environment**:local dev(任何環境只要 Graph 返一個帶 UPN 嘅錯誤都會)

亦可用 W39 個 3200 live 驗證重現 —— 當時真 Graph 返 `AADSTS900021`,如果換成一個 404,UPN 就會入 log。

## 3. Expected vs Actual

- **Expected**:log 有足夠嘢 triage(邊個動作失敗、係 401 定 404 定 throttle、AADSTS 碼),但**冇 UPN / email**(H4)。
- **Actual**:整段 vendor message 照抄,包括 request path 入面嘅 UPN。

## 4. Impact

- **Affected users / scenarios**:任何 Graph 失敗路徑 —— assign 前置查 user(最常見)、catalog sync、reconcile、sync sweep。
- **Workaround available?**:No(除咗唔睇 log)
- **Data loss / corruption?**:No
- **Security implication?**:**Yes** —— PII(UPN = 公司 email)落 plaintext log。log 可能被轉發、備份、或者畀冇必要知道嗰個人嘅人睇。

## 5. Severity Justification

**Sev3**(minor feature degraded / specific impact),同 **BUG-001 一致**:

- 唔係 outage、唔係 data loss、唔係外洩畀第三方 ⇒ 唔到 Sev1/Sev2
- 但係 **H4 policy violation**,而且係**第二次**(BUG-001 同類)⇒ 唔可以當 Sev4 cosmetic

⚠️ **同 BUG-001 嘅分別要講清楚**(否則會以為當時修漏咗):

| | BUG-001 | BUG-004 |
|---|---|---|
| 洩漏來源 | **我哋自己**格式化嘅字串(`\`... ${upn}\``) | **vendor 塞畀我哋**嘅 message |
| 修法 | 唔好寫 UPN 落去 | 唔可以信任外來字串 |

⇒ BUG-001 個 fix **冚唔到**呢個 —— 唔係當時做漏,係另一條路徑。

## 6. Initial Diagnosis

- **Initial hypothesis**(triage):`graphUnavailable()` 一個檔。
- **投查後(2026-07-28)—— 範圍比登記時大**:

| 位置 | 情況 |
|---|---|
| `graph-unavailable.ts:19-23` | `logger.error(...${err.message})` —— 5 個 caller 共用 |
| `sync-sweep.service.ts:106-110` | **冇用** `graphUnavailable`,但自己 `logger.warn(...${(err as Error)?.message})` ⇒ **同一個病,登記時漏咗** |

`graphUnavailable()` 實際 caller(`grep` 確認):`graph-license.provider` ×3 · `catalog.service` · `reconcile.service`。

- **Root cause**:把外部系統嘅 free-text error message 當成安全內容直接 log。**信任邊界問題**,唔係手誤。

## 7. Acceptance for Fix

- [ ] Reproduction confirmed locally
- [ ] Root cause identified
- [ ] Fix implemented(**scrub email pattern**,Chris 2026-07-28 拍板)
- [ ] `sync-sweep` 同一問題一齊修(**共用同一個 helper**,唔好兩處各寫一個 regex)
- [ ] Regression test added(**fails before fix, passes after**)—— 要 **spy logger**,唔可以只 assert exception message
- [ ] 收窄 W38/W39 兩條「只宣稱 message 乾淨」嘅 test 描述(fix 之後佢哋可以講得更闊)
- [ ] Verified in env(re-run §2 repro steps)

## 8. Report Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-28 | Initial triage(Sev3)+ fix 方向拍板 = scrub email pattern | 三個選項對比:全部唔 log(失去 AADSTS 碼,排查要靠 Graph 側 log 而我哋未必有 access)/ 只 log 結構化欄位(要逐個 vendor 摸清錯誤物件形狀)/ **scrub**(保留診斷力,已知風險 = regex 冚唔到非 email 格式嘅識別碼) | **Chris Lai** |

---

**Lifecycle reminder**:Sev3 ⇒ postmortem 🟡 encouraged if recurring。**呢個係第二次**(BUG-001 同類)⇒ 收官時寫。
