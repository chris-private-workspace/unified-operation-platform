---
bug_id: BUG-009
title: "ConnectorConfig 嘅 audit 白名單漏咗 5 個 column,W39/W40/CH-011 嘅配置改動 before/after 一直被靜靜 drop"
severity: Sev3          # Sev1 | Sev2 | Sev3 | Sev4 (per PROCESS.md §4.4)
status: triaged         # triaged | investigating | fixing | verifying | done | wont-fix
reported: 2026-07-31
reporter: "Auto-detected — W42 加 defaultOnboardingSkuId 落白名單嗰陣發現"
affects_components: [audit, integration/connector-config]
spec_refs:
  - docs/adr/0009-audit-trail.md D4(per-target allow-list;「Adding a line here is a privacy decision」)
  - docs/adr/0013-connector-config-ui-management.md D2(secret 唔落 DB/API/audit)
---

# BUG-009 — ConnectorConfig audit 白名單唔完整

> **Report version**:1.0(initial)
> **Triage approver**:**Chris Lai(2026-07-31)** —— W42 報告後拍板開單

## 1. Symptom

ADMIN 喺 Settings › Integrations 改一個 connector 嘅非機密設定,**audit 行有寫**(`connector.config_update`),但嗰行嘅 **`before` / `after` 係空**,睇唔出改咗咩、由咩改成咩。

只影響**部分** column:W34 當初登記嗰 6 個正常,之後三個 phase 加嘅 5 個全部靜默。

## 2. Root Cause

`apps/api/src/audit/audit-fields.ts` 嘅 `AUDIT_FIELD_WHITELIST.ConnectorConfig` 係**手寫清單**,而 `ConnectorConfig` 表嘅 column 由 W34 之後加咗 5 個,冇人同步。

`pickAuditFields()` 對唔喺白名單嘅 key **靜靜 drop**(冇 warning、冇 throw),所以呢個失效**冇任何外部症狀**,直到有人特登去睇 audit 行內容。

| ConnectorConfig column | 加入時期 | 喺白名單? |
|---|---|---|
| `graphTenantId` / `graphClientId` | W34 | ✅ |
| `serviceNowInstanceUrl` / `serviceNowDefaultTable` | W34 | ✅ |
| `requestSubmissionProvider` / `n8nOutboundWebhookUrl` | W34 | ✅ |
| **`licenseOpsProvider`** | W39 | ❌ |
| **`n8nLicenseBaseUrl`** | W39 | ❌ |
| **`ticketUpdateProvider`** | W40 | ❌ |
| **`n8nTicketWebhookUrl`** | W40 | ❌ |
| **`acsSenderAddress`** | CH-011 | ❌ |
| `defaultOnboardingSkuId` | W42 | ✅(本次順帶加咗) |

🔴 **最值得留意嗰兩個係 provider 選路**(`licenseOpsProvider` / `ticketUpdateProvider`)—— 佢哋決定「licence 由 Graph 定 n8n 派」同「ticket 由平台直寫定 n8n 改」。**呢兩個掣一撳就換咗執行器**,而 audit 恰恰記唔到由咩換成咩。

## 3. Reproduction Steps

1. `PATCH /admin/integrations/n8n-license/config`,body `{"values":{"licenseOpsProvider":"n8n"}}`
2. `GET /admin/audit?limit=1`
3. 見到一行 `connector.config_update` / `targetType=ConnectorConfig` / `targetId=n8n-license`
4. **但 `before` 同 `after` 都係空**

對照:同樣操作改 `graphTenantId`,`before`/`after` 有值。

**Reproduction reliability**:Always
**Environment**:所有環境(UAT 尤其相關 —— 嗰邊改 env 要經 Azure,所以 UI 改 DB 先係正路,見 BUG-005)

## 4. Expected vs Actual

- **Expected**:改任何**非機密** connector 設定,audit 記得到由咩值改成咩值。ADR-0013 D2 已經保證 secret 唔會係 ConnectorConfig 嘅 column,所以呢張表**冇機密可洩**。
- **Actual**:5 個 column 嘅改動只留一行「有人改過呢個 connector」,改咗咩完全查唔到。

## 5. Severity 判斷 = Sev3

唔係 Sev2:**冇資料損壞、冇功能壞、冇洩漏** —— 反方向(記少咗)。
唔係 Sev4:呢兩個 provider 掣係 ADR-0017 三接縫嘅切換點,**「邊個幾時把 licence 派發由 Graph 轉去 n8n」係審計上最想答到嘅問題之一**,而家答唔到。

## 6. 🔴 Recurring pattern(第六次)

同 W39 postmortem 數過嗰三次、BUG-004、BUG-005 **同一個 pattern**:

> **兩處各自維護同一份清單,而冇嘢逼佢哋一致。**

呢次係 `ConnectorConfig` 嘅 column 清單 vs audit 白名單。之前:probe G2 手抄 4 個 key · `list()` 手寫陣列 · leak test fixture 手抄清單 · comment vs code(BUG-004)· 面板 vs runtime(BUG-005)。

⚠️ 修正時**唔好只加 5 行** —— 咁只係把第七次推遲。既有解法一律係「**由單一來源 derive**」,而 `connectors.ts` 個 `CONNECTOR_CONFIG` **已經係**每個 connector 有邊啲 editable column 嘅 SSOT。

同時參考 W42 實測到嘅一個現成先例:`integration-status.service.spec.ts` 有條 test 由 `CONNECTOR_CONFIG` derive 出所有 env key,**逼 leak fixture 保持完整** —— 加 `DEFAULT_ONBOARDING_SKU_ID` 嗰陣即刻被佢捉住。同樣手法可以令白名單再唔會漏。

## 7. 🔴 修正前必答(privacy gate)

`audit-fields.ts` 該處註解明文寫住:

> `Adding a line here is a privacy decision — it widens what gets stored.`

所以**唔可以純機械 derive 就算**,要明確確認:`CONNECTOR_CONFIG` 嘅 editable 欄**按定義**全部非機密(ADR-0013 D2 = secret 只喺 env、唔係 column),因此「全部 editable column 都可入 audit」呢個推導成唔成立。

W42 冇擅自做呢個判斷,所以只加咗自己嗰一個 column。

## 8. Fix 建議(未實作)

1. `AUDIT_FIELD_WHITELIST.ConnectorConfig` 改為由 `CONNECTOR_CONFIG` 嘅 `editable[].column` derive
2. 加一條 test:白名單 ≡ 所有 connector 嘅 editable column 集合(漏一個即紅)
3. 加一條 test:白名單**唔包含**任何 `secrets[].envKey`(反向守門)
4. 補 `defaultOnboardingSkuId` 以外 5 個 column 嘅 live 驗證各一次

## 9. References

- `apps/api/src/audit/audit-fields.ts` — `AUDIT_FIELD_WHITELIST.ConnectorConfig`
- `apps/api/src/integration/connectors.ts` — `CONNECTOR_CONFIG`(建議嘅 SSOT)
- `apps/api/src/integration/connector-config.service.ts` — `update()` 呼叫 `audit.logChange`
- `docs/01-planning/W42-onboarding-default-sku/progress.md` — 發現經過
- BUG-004 / BUG-005 — 同一 recurring pattern 嘅前兩次
