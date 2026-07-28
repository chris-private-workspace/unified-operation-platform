---
bug_id: BUG-005
report_ref: ./report.md
checklist_ref: ./checklist.md
status: done
last_updated: 2026-07-28
---

# BUG-005 — Progress

## 2026-07-28 — Triage → Fix → Verify(同 BUG-004 同一批)

### 發現經過

W39 加 `n8n-license` 個 state 嗰陣,照抄咗 `n8nSelected()` 嘅寫法(`config.get()`)。**當時就察覺到唔對**,但明文冇修:修佢會同時改 `n8n-outbound` 嘅行為,超出該 phase 範圍(H3)。

W39 progress 寫低:「**一次過修兩行先係啱嘅做法**」。呢個就係嗰次。

### Root cause

W34 / ADR-0013 引入 DB-then-env resolver 時,改咗 **runtime 三個整合點**,冇改**報告狀態嗰個**。

兩邊各自實作同一個決定,而**冇嘢逼佢哋一致**:

```
runtime  requestSubmissionProviderFactory → connectorConfig.resolve()  ← DB-then-env
面板     IntegrationStatusService.n8nSelected() → config.get()          ← env only
```

佐證:`fulfilment.module.ts:96` 個 comment 仍然寫住「outbound provider picked by **env**」。**stale 咗兩個月**,而冇人察覺 —— 因為冇任何嘢對比過兩邊。

### 一個唔止係清理嘅決定

Fix 除咗加 `ConnectorConfigService`,仲**移走咗 `ConfigService`**。

發現佢移走之後**完全冇用** —— 呢個本身就係訊號:呢個 service 唯一用 env 嘅地方,就係嗰兩個唔應該讀 env 嘅位。

留住佢嘅話,「淨係讀一個值」離重新 drift 只差一行。而家**冇任何路徑**繞得過 resolver。

### 一個連帶影響,唔可以扮冇

移走 `ConfigService` 之後,原本嗰條 **G1 secret leak test 攞唔到 secret 去餵** —— 佢會變成 trivially pass。

⇒ 冇當佢仍然成立,而係**講清楚佢而家證緊咩**:
- 保證由「我哋檢查過 output」變成「**根本冇一條線通去 secret**」(更強)
- 條 test 保留,因為佢餵嘅**非機密值**(webhook URL / instance URL)**真係**經 resolver 入到 service,仍然唔可以被 echo
- 結構嗰半**另開一條** test:assert 個 service 冇 `@nestjs/config`

### fails-before 順帶揭到一條 test 唔夠敏感

令 `n8nSelected()` resolve 一個唔存在嘅 column → **3 failed / 13 passed**。

但 `a DB override back to the default also wins over env` **仍然綠** —— 佢 expect `inactive`,而壞咗嘅結果啱好都係 `inactive`。**結果啱,原因錯。**

呢個係 assert 單一 boolean 嘅固有限制:兩種壞法有一種會撞啱。冇過度處理(嗰條 test 仍然守住「反方向 override」呢個獨立行為),但記低 —— 下次寫呢類 test,值得驗埋 resolver **收到咩參數**,而唔止驗結果。

## Closeout

**Status**:✅ done。全套 **528 / 528** · lint 0 · tsc 0。

**同 BUG-004 共用一個教訓**:兩個都係「**兩處各自實作同一件事,而冇嘢逼佢哋一致**」——
BUG-004 係 comment 同 code 唔一致(承諾 vs 實作),BUG-005 係面板同 runtime 唔一致。

而呢一批入面,**四次**撞到手抄清單 / 重複實作嘅同一種病(W39 已數過三次)。共通解法都一樣:**由單一來源 derive,唔好各自維護一份**。
