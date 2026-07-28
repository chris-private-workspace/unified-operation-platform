---
bug_id: BUG-004
report_ref: ./report.md
status: complete
last_updated: 2026-07-28
---

# BUG-004 — Checklist

## Investigate

- [x] Reproduce locally —— 跑 `graph-license.provider.spec`,Nest log 印出 `/users/sensitive.person@example.com`
- [x] Root cause:把**外部系統嘅 free-text error message** 當成安全內容直接 log。**信任邊界問題**,唔係手誤
- [x] 掃全 repo:**12 處** log raw error message(遠多過 report 登記時知道嘅)
- [x] 🔴 **劃線**:只修**直接處理 user identity** 嘅 vendor 呼叫 —— `graph-unavailable` · `sync-sweep` ×2 · `n8n-license`。其餘 8 處(ServiceNow write-back / token 拒絕 / connector 探針)嘅 vendor 呼叫**唔涉及特定 user**,同一 pattern **唔係同一風險**;明列喺 report §6 + test 註釋,**唔順手改**(§1.3)

## Fix

- [x] 新 `integration/scrub-pii.ts` —— **一個共用 helper**,唔好四處各寫一個 regex
- [x] regex 要求域名**至少一個點**,所以普通散文入面嘅 `@` 唔會被食
- [x] 四個 call site 全部改用 `scrubPii()`
- [x] `graph-unavailable.ts` 個 doc comment 由**聲稱**「never log the target UPN」改成講清楚點解要 scrub —— 嗰句原本係一個**佢做唔到嘅承諾**

## Regression test(fails before, passes after)

- [x] `scrub-pii.spec.ts` —— **兩半**:①真係擋到 email-shaped token ②**冇食走診斷內容**(AADSTS 碼 / HTTP status / GUID / correlation id)。第二半同樣重要 —— 一個食晒嘢嘅 scrubber 係「安全而無用」,而且冇人會察覺,直到下次真出事
- [x] `graph-unavailable.spec.ts` —— 🔴 **assert 個 logger 本身**。W38/W39 兩條既有 test 只 assert **exception message**(佢一直都乾淨),所以個洩漏喺 log 度躲咗成兩個 phase
- [x] **靜態守門**:assert 嗰三個 identity call site **冇** raw `${(err as Error).message}` **而且**真係 call `scrubPii(` —— 淨係負面斷言嘅話,「唔再 log vendor message」都會照綠,而嗰個係更差嘅結果
- [x] **fails-before 實證**:拆走 `graph-unavailable` 個 scrub → **2 failed / 16 passed** → 還原(`grep` = 0)
- [x] 更新 W38 `graph-license.provider.spec` 個 stale 註釋(佢描述緊一個而家已修好嘅缺陷)

## Verify

- [x] 全套 **528 / 528** · lint 0 · tsc 0
- [x] Re-run report §2 repro:同一條 test,log 而家出 `[redacted-email]`
- [x] Postmortem 已寫(Sev3 但 **recurring** —— BUG-001 同類)
