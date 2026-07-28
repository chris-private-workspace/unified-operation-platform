---
bug_id: BUG-005
report_ref: ./report.md
status: complete
last_updated: 2026-07-28
---

# BUG-005 — Checklist

## Investigate

- [x] Reproduce:`build({ REQUEST_SUBMISSION_PROVIDER: 'direct' }, { requestSubmissionProvider: 'n8n' })` → 面板返 `inactive`,而 runtime factory 同一組輸入會揀 n8n
- [x] Root cause:W34 / ADR-0013 引入 resolver 時**改咗 runtime 三個整合點,冇改 status service**
- [x] 佐證:`fulfilment.module.ts:96` 個 comment 仍寫住「picked by **env**」—— **stale 咗成兩個月冇人察覺**,因為冇嘢對比過兩邊
- [x] 確認 `n8nSelected()` 冇外部 caller(全部喺同一個 service 內)⇒ 改 async 安全

## Fix

- [x] `IntegrationStatusService` 注入 `ConnectorConfigService`,兩個 selection 一次過改用 `resolve()`
- [x] 🔴 **移走 `ConfigService`** —— 唔係順手清理:兩者並存嘅話,「淨係讀一個值」離重新 drift 只差一行。而家呢個 service **冇任何路徑**繞過 resolver
- [x] `list()` 把兩個 selection 併入既有 `Promise.all`,唔加額外 round-trip
- [x] 修 `fulfilment.module.ts:96` 個 stale comment,並註明佢就係同一個錯誤假設嘅另一個副本
- [x] 確認 `ConnectorStatus` 形狀 / controller 契約**零改動**

## Regression test(fails before, passes after)

- [x] mock 由「env bag」改成**真 DB-then-env resolver**,而且用**production 同一份** `CONNECTOR_CONFIG` 做 env-key mapping —— 手寫多一份 mapping 就係本 bug 嘅同一種病
- [x] 四條:DB 講 n8n(outbound)· DB 講 n8n(license)· **DB 反方向覆蓋 env** · DB 冇 override 時仍 fallback env
- [x] **結構守門**:assert 個 service **完全冇** `@nestjs/config` —— 將來有人「淨係加返 ConfigService 讀一個值」就會紅
- [x] **fails-before 實證**:令 `n8nSelected()` resolve 一個唔存在嘅 column → **3 failed / 13 passed** → 還原(`grep` = 0)
- [x] ⚠️ **fails-before 順帶揭到一條 test 唔夠敏感**:`a DB override back to the default also wins over env` **壞咗都照綠**,因為佢 expect `inactive` 而壞嘅結果啱好都係 `inactive` —— **結果啱,原因錯**。呢個係 assert 單一 boolean 嘅固有限制,已記低

## Verify

- [x] 全套 **528 / 528** · lint 0 · tsc 0
- [x] G1 leak test 語意已更新 —— 佢而家守嘅係**非機密值唔外洩**;secret 側已變成**結構性保證**(冇 wire),另有一條專門 test
