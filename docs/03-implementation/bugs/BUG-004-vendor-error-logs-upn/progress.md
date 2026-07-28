---
bug_id: BUG-004
report_ref: ./report.md
checklist_ref: ./checklist.md
status: done
last_updated: 2026-07-28
---

# BUG-004 — Progress

## 2026-07-27 — 發現(W39 途中,冇順手修)

W39 寫 `graph-license.provider.spec` 個 H4 test 嗰陣,test **通過**咗,但跑起嘅 Nest log 印住:

```
[GraphLicenseProvider] Microsoft Graph unavailable while trying to
look up the target user: Request failed for /users/sensitive.person@example.com
```

即刻做咗兩件事,**冇修**:
1. 把條 test 描述由「no PII escapes through the error path」**收窄**成「the 503 **MESSAGE** never carries the target UPN」—— 原名會被讀成「呢條路徑守住咗」,但佢只證到一半
2. 登 BUG 候選 —— 修佢要改 log 行為,會撞爛 W38「純重構」嘅前提

## 2026-07-28 — Triage → Fix → Verify

### 範圍比 report 登記時大

掃全 repo:**12 處** log raw error message。

**劃線**(report §6 記低):只修**直接處理 user identity** 嘅 vendor 呼叫。

| 修 | 唔修 |
|---|---|
| `graph-unavailable`(5 個 caller 共用) | ServiceNow write-back |
| `sync-sweep` ×2(**佢個 vendor 呼叫就係 findUser**) | JWT token 拒絕 |
| `n8n-license`(n8n 會轉發 Graph 嘅文字) | connector 探針(唔涉及特定 user) |

⚠️ **`sync-sweep` 原本唔喺 report 範圍**(佢冇用 `graphUnavailable`,自己直接 log)。佢**最高危** —— 呢個 sweep 存在嘅唯一目的就係逐個 UPN 去查 Graph。

### Fix

一個共用 `scrubPii()`,四處用。regex 要求域名至少一個點,所以 `retry @ 3 attempts` 呢類散文唔會被食。

順手改咗 `graph-unavailable.ts` 個 doc comment —— 佢原本寫住 `H4: never log the target UPN`,而**佢做唔到**。一句做唔到嘅承諾比冇承諾更差,因為下手會信。

### 條 test 要 assert 咩,先係重點

W38/W39 兩條既有 test 一直綠,因為佢哋 assert **exception message**,而嗰度一直乾淨 —— 洩漏喺 **log line**,冇嘢望住。

⇒ 新 test **直接 assert 個 logger**。`graphUnavailable(logger, ...)` 收 logger 做參數,所以佢天生易測;另外兩處靠**靜態守門**(assert 冇 raw pattern **兼且**真係 call `scrubPii(`)。

**fails-before**:拆走 scrub → **2 failed / 16 passed** → 還原。

### ⚠️ 一個刻意留低嘅限制

`scrubPii` 係**網,唔係保證**。佢捉 email-shaped token,所以捉唔到 `CN=jdoe,OU=Users` 呢類。**已寫成一條 test**,免得下手由 regex 自己推斷。

BUG-001 嗰條規矩(**唔好自己攞 identifier 砌 log 字串**)仍然成立 —— 呢個 helper 係處理**外來**字串,兩者互補唔互相取代。

## Closeout

**Status**:✅ done。api 499 → **528**(+29,含 BUG-005)· lint 0 · tsc 0。

**Postmortem 已寫** —— Sev3 但 **recurring**(BUG-001 同類),`PROCESS.md §4.4` 講明呢種情況要寫。
