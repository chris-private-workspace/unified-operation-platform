---
artifact: risk-register
version: 1.1
status: living
last_updated: 2026-07-15
---

# Unified Operation Platform — Risk Register(living)

> **用途**:項目風險嘅 living 登記。新風險 / status update 入呢度。
> **更新 trigger**:新風險識別 / bug postmortem 揭出新 pattern(PROCESS §4.4,Sev1/2)/ mitigation 狀態變 / 定期 review。

**狀態圖例**:🟢 Resolved · 🟡 Mitigating(部分緩解)· ⚠️ Open(未緩解)· ⚫ Accepted(接受風險,無 active 緩解)
**Severity 圖例**:🔴 Critical · 🟠 High · 🟡 Lower

---

## 1. Risk Index(at-a-glance)

| ID | Risk | Source | Likelihood | Impact | Mitigation | Status |
|---|---|---|---|---|---|---|
| R1 | 公司 proxy 阻擋 `binaries.prisma.sh`(Prisma engine CDN)→ generate/migrate/seed/boot 卡住 | W01 執行(2026-07-09) | High(已發生) | 🔴 High(阻 backend runtime) | **Workaround 已用**:流動網路跑一次 generate/migrate → engine cache 落 `node_modules`,返公司網即用本機 binary。長遠靠 IT allowlist `*.prisma.sh`。⚠️ clean reinstall(刪 node_modules)前需再轉流動網路。 | 🟡 Mitigating |
| R2 | `AUTH_DEV_BYPASS=true` 誤帶入 production → 繞過 JWT 驗證、注入 seed ADMIN(權限完全繞過) | W09 AUTH-1(2026-07-10) | Low | 🔴 High(權限繞過) | 預設 `false`;開啟時啟動打 warning log;prod path `getOrThrow(ENTRA_TENANT_ID/ENTRA_API_AUDIENCE)` 未設即 boot 失敗(fail-fast)。ADR-0002 記錄。部署時確保 `.env` 無此 flag。 | 🟢 Resolved(Mitigated) |
| R3 | n8n on-prem AD → Entra Connect sync 延遲:push 帶 `azureSyncedAt` 但平台即刻 `findUser(upn)` 仲搵唔到 → assign fail | W24 AGENDA A4(2026-07-15) | Med(on-prem 常態) | 🟡 Lower(assign 短暫 fail,可 retry) | assign 端唔純信 `azureSyncedAt` timestamp,以 `findUser` 真命中為 gate;命中前 retry / 留 queue(D2 approach)。DESIGN §7 sync 時序註。<br>⚠️ **校正(2026-07-21,W31)**:ADR-0010 §7.2 講 item 6「解 RISK R3」係**錯引用**。W31 / ADR-0011 解嘅係 **outbound 提交失敗**(`audit-and-integration-observability.md §2.4` 第 5 點「冇交付保證」),同呢條 sync 延遲致 assign fail **唔係同一件事** —— `OutboundFailure` 三個 kind 都唔涵蓋 assign 路徑。**本條完全不受 W31 影響。**<br>✅ **Mitigation 路線已定(2026-07-26)**:**ADR-0015 Accepted** —— 排程 sync sweep 主動向 Graph `findUser` 證實,命中即開 gate 並寫 `RequestEvent(SYNC)`。呢個係本條 mitigation 欄「命中前 retry / 留 queue(D2 approach)」嘅落實,但改為**平台主動輪詢**而唔係綁喺人手 retry 上(理由:本風險嘅本質係「唔知等幾耐」,retry 解唔到「幾時可以開始」)。副產品:`RequestEvent` timeline 會記錄實際 sync 延遲,可以答「Entra Connect 真實延遲幾耐」。 | 🟡 **Mitigating**(**W37 已實作 + live 驗證**,2026-07-27)—— `SyncSweepService` 每 10 分鐘主動 `findUser` 證實;live 用真 tenant 帳號驗到 gate 自動開(seed → 下一個 tick → `azureSyncedAt` 填 + `RequestEvent` 寫「verified against Microsoft Graph」),同輪其餘唔合資格嘅單冇被誤掃,kill switch A/B 亦驗過。**未完全 Resolved 嘅殘留**:① 平台仍然只係**輪詢**,最壞情況要等一個 10 分鐘週期(webhook = ADR-0015 明文保留嘅升級路徑,要新 ADR)② UPN 打錯 / 帳號已刪嘅單 30 日後放棄,之後仍要人手處理 ③ 多實例部署會重複跑(現 UAT 單實例;ADR 明文 YAGNI 唔預先解) |
| R4 | **`allocatedQuantity` 由「顯示數字」變成「會擋人嘅 gate」,但冇任何自動流程令佢跟上現實** —— 買咗 licence 唔會加 allocated ⇒ 完成採購之後 assign **仍然被擋**;操作員嘅最短路徑係搵 ADMIN override,而唔係改 allocated。長期演化 = override 變日常、allocated 完全失去意義、gate 名存實亡 | W36 / ADR-0016 上線(2026-07-27);plan §5 OQ2 + §6 R2/R4 | **Med-High**(唔係會唔會,係「幾時」——除非有人被指定負責) | 🟡 Med(gate 失效 = 退回 W36 之前嘅狀態,但多咗一堆 override audit 噪音) | ① runbook `OPCO-BUDGET-GATE-ROLLOUT.md` 明文寫死斷點 + 兩條出路,並指出「唔指定人就冇人做」 ② 前端 override dialog 直接寫住「買 licence 唔會加 allocation,請去 License assets 改」 ③ **監察手段 = `/admin/audit` filter `assign.budget_override`**(獨立 action 就係為咗呢個而設,ADR-0016 R4)—— **要定期睇,唔睇就等於冇** ④ 🔴 **三項全部係程序性,零技術強制** ⇒ 自動化 = **新 ADR**(會掂 ADR-0004 Excel↔平台 SSOT 未解張力),唔可以喺實作裡面偷偷加 | ⚠️ **Open**(mitigation 全屬程序性;要收窄需 ① 指定負責人 ② 定期查 override 次數 ③ 或解決 allocated SSOT) |

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
