---
artifact: risk-register
version: 1.0
status: living
last_updated: YYYY-MM-DD
---

# {PROJECT_NAME} — Risk Register(living)

> **用途**:項目風險嘅 living 登記。新風險 / status update 入呢度。
> **更新 trigger**:新風險識別 / bug postmortem 揭出新 pattern(PROCESS §4.4,Sev1/2)/ mitigation 狀態變 / 定期 review。

**狀態圖例**:🟢 Resolved · 🟡 Mitigating(部分緩解)· ⚠️ Open(未緩解)· ⚫ Accepted(接受風險,無 active 緩解)
**Severity 圖例**:🔴 Critical · 🟠 High · 🟡 Lower

---

## 1. Risk Index(at-a-glance)

| ID | Risk | Source | Likelihood | Impact | Mitigation | Status |
|---|---|---|---|---|---|---|
| R1 | _(空)_ | | High/Med/Low | High/Med/Low | | ⚠️ Open |

<!-- 範例:
| R1 | 某外部服務單點故障 | BUG-0XX postmortem | Med | High | 加 fallback + 熱切換(ADR-00XX) | 🟡 Mitigating |
| R2 | 依賴 X 有 license risk | 設計審查 | Low | High | 只讀 reference,唔 copy(H-參考) | 🟢 Resolved |
| R3 | 規模化前唔做 sharding | 團隊決定 | Low | Med | 接受;規模到再處理 | ⚫ Accepted |
-->

## 2. Risk Detail(逐條明細,重要風險先展開)

### R1 — {Risk name}
- **First observed**:YYYY-MM-DD
- **Description**:{風險係咩}
- **Trigger / Recurrence**:{幾時會發生 / 有冇 recurrence log}
- **Mitigation**:{做緊咩}
- **Status**:{emoji}

## 3. Review Cadence
- 每個 phase closeout 掃一次:有冇新風險?狀態有冇變?
- Sev1/Sev2 bug postmortem → 檢視有冇對應風險要加/升級。

## 4. Maintenance Protocol

| Operation | How |
|---|---|
| Add risk | Index 加一行 + 重要嘅展開 §2 明細;commit `docs(risk): add R-n` |
| Status change | 改 Index status emoji + 明細;commit `docs(risk): R-n status → X` |
| Resolve | 改 🟢,**保留 entry 做 audit trail**(唔刪) |
| New pattern from postmortem | 加新 R-n + link postmortem |
