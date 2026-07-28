---
bug_id: BUG-005
title: "Integrations 面板嘅 provider 選路只讀 env,睇唔到 UI 改咗嘅 DB override"
severity: Sev3          # Sev1 | Sev2 | Sev3 | Sev4 (per PROCESS.md §4.4)
status: triaged         # triaged | investigating | fixing | verifying | done | wont-fix
reported: 2026-07-28
reporter: "Auto-detected — W39 加 n8n-license 個 state 嗰陣發現"
affects_components: [integration/integration-status]
spec_refs:
  - docs/adr/0013-connector-config-ui-management.md D3(非機密欄 DB-then-env)
  - docs/adr/0010-integration-observability.md D3(state 講部署形狀,唔講健康)
---

# BUG-005 — Integrations 面板嘅 provider 選路只讀 env,睇唔到 DB override

> **Report version**:1.0(initial)
> **Triage approver**:**Chris Lai(2026-07-28)**

## 1. Symptom

ADMIN 喺 Settings › Integrations **用 UI 改咗 provider 選路**(ADR-0013 Model C 嘅整個賣點),但**同一個面板仍然顯示 `inactive`**。

即係:**面板話「未啟用」,而平台其實已經行緊 n8n。**

## 2. Reproduction Steps

1. `POST/PATCH /admin/integrations/n8n-outbound`,把 `requestSubmissionProvider` 設成 `n8n`(**唔改 env**)
2. 重啟(ADR-0013 C2 = restart 生效)
3. 開單 → 實際**真係經 n8n** 出去(`requestSubmissionProviderFactory` 用 `connectorConfig.resolve()` = DB-then-env)
4. `GET /admin/integrations` → `n8n-outbound` 個 `state` 仍然係 **`inactive`**

**Reproduction reliability**:Always(只要用 DB override 而唔改 env)
**Environment**:任何環境;**UAT 最容易中**,因為嗰邊改 env 要經 Azure,所以 UI 改 DB 先係正路

## 3. Expected vs Actual

- **Expected**:`state` 反映**平台實際行緊邊條路**,同 runtime factory 同一個真相來源(ADR-0013 D3:非機密欄一律 DB-then-env)。
- **Actual**:`IntegrationStatusService` 用 `config.get()` = **env only**,而 runtime factory 用 `connectorConfig.resolve()` = **DB-then-env**。兩個各有各答。

```
runtime  requestSubmissionProviderFactory → connectorConfig.resolve()  ← DB-then-env
面板     IntegrationStatusService.n8nSelected() → config.get()          ← env only
```

## 4. Impact

- **Affected users / scenarios**:ADMIN 睇 Integrations 面板。**兩行都中**:`n8n-outbound`(W26 起)同 `n8n-license`(W39 起)。
- **Workaround available?**:Yes —— 睇 Configure 面嗰個欄位值,唔好信 state badge。
- **Data loss / corruption?**:No
- **Security implication?**:No。但**運維判斷會出錯**:面板話冇行緊 n8n,人就唔會去 n8n 側查問題。

## 5. Severity Justification

**Sev3**(minor feature degraded / specific impact):

- 冇資料損壞、冇安全問題、有 workaround ⇒ 唔到 Sev2
- 但佢**係一個報告錯事實嘅監控面板** —— ADR-0010 建呢個面板就係為咗畀運維判斷 connector 狀態,而佢喺最關鍵嗰格講錯嘢 ⇒ 唔係 Sev4 cosmetic

## 6. Initial Diagnosis

- **Root cause**(2026-07-28 confirmed):W34 / ADR-0013 引入 DB-then-env resolver 時,**改咗 runtime 三個整合點,冇改 status service**。
- 佐證:`fulfilment.module.ts:96` 個 comment 仍然寫住「outbound provider picked by **env**」—— 呢句喺 W34 之後就已經 stale,而**冇人察覺**,因為冇 test 對比過兩邊。
- W39 加 `n8n-license` 時**照抄咗同一個 pattern**(`n8nLicenseSelected()` 用 `config.get()`),當時已經**明文標記唔順手修**(H3:修佢會同時改 `n8n-outbound` 行為,超出該 phase 範圍)⇒ 就係本 bug。

## 7. Acceptance for Fix

- [ ] Reproduction confirmed locally
- [ ] Root cause identified
- [ ] Fix:`IntegrationStatusService` 改用 `ConnectorConfigService.resolve()`,**兩行一次過**
- [ ] 修 `fulfilment.module.ts:96` 個 stale comment
- [ ] Regression test:env 講 `direct` 但 DB 講 `n8n` → state 必須 `active`(**fails before**)
- [ ] 確認 `GET /admin/integrations` 回應形狀不變(controller 契約唔郁)
- [ ] Verified in env(re-run §2 repro steps)

## 8. Report Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-28 | Initial triage(Sev3) | W39 明文延後嘅 follow-up;「一次過修兩行」係當時就寫低嘅正確做法 | **Chris Lai** |

---

**Lifecycle reminder**:Sev3 ⇒ postmortem optional。**但同 BUG-004 共用一個教訓**(見 BUG-004 postmortem):兩個都係「**兩處各自實作同一件事,冇嘢逼佢哋一致**」。
