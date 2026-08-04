---
artifact: risk-register
version: 1.1
status: living
last_updated: 2026-07-31
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
| R5 | **外部系統回傳嘅字串被當成安全內容記錄** —— vendor(Graph / ServiceNow / n8n)嘅 error message、response body、echo 返嘅 payload,內容**唔喺我哋 code 入面睇得到**,所以 code review 幫唔到手;而平台已知會送 UPN 出去(outbound create 個 `short_description`、Graph `/users/{upn}` path)⇒ 一旦 vendor 喺錯誤訊息裡面引用返請求,PII 就靜靜入咗 plaintext log | **BUG-007 postmortem 觸發點**(2026-07-28)—— BUG-004 postmortem 明文寫「**若果第三次出現同類洩漏,就應該升級成 register 一條『外部字串處理』嘅 risk**」。數:BUG-001(自己格式化)→ BUG-004(Graph message)→ BUG-007(SN response body)= **第三次** | **Med**(已發生三次;每次都係新接一個 vendor / 新一條路徑時重犯) | 🟡 Med(H4 policy violation;log 可能被轉發 / 備份 / 畀冇必要知嘅人睇。唔係外洩畀第三方) | ① **共用 `scrubPii()`**(唔准每處自寫 regex)—— 已用喺 4 個 Graph identity 路徑 + `ServiceNowService.request()` ② **凡 assert「冇 PII」嘅 test 必須 spy logger**,唔可以只 assert exception message(BUG-004 就係咁匿咗 18 日) ③ **接新 vendor / 加新 log 點嗰陣要逐個 caller 查證 path 同 payload**,唔可以憑「呢類唔涉及 user」呢種斷言劃線(BUG-007 正正揭穿 BUG-004 呢個劃線理由唔準確) ④ 🔴 **已知未覆蓋**:`scrubPii()` 只捉 email 形狀;非 email 格式嘅識別碼(員工編號 / 電話 / sys_id 對應嘅人)冚唔到,而**刻意唔擴闊 regex** —— 會食走 AADSTS 碼呢啲我哋 log 呢段文字嘅唯一原因 | ⚠️ **Open**(技術緩解只覆蓋 email 形狀 + 已知路徑;結構性傾向仍在 —— 每次接新 vendor 都要人記得) |
| R4 | **`allocatedQuantity` 由「顯示數字」變成「會擋人嘅 gate」,但冇任何自動流程令佢跟上現實** —— 買咗 licence 唔會加 allocated ⇒ 完成採購之後 assign **仍然被擋**;操作員嘅最短路徑係搵 ADMIN override,而唔係改 allocated。長期演化 = override 變日常、allocated 完全失去意義、gate 名存實亡 | W36 / ADR-0016 上線(2026-07-27);plan §5 OQ2 + §6 R2/R4 | **Med-High**(唔係會唔會,係「幾時」——除非有人被指定負責) | 🟡 Med(gate 失效 = 退回 W36 之前嘅狀態,但多咗一堆 override audit 噪音) | ① runbook `OPCO-BUDGET-GATE-ROLLOUT.md` 明文寫死斷點 + 兩條出路,並指出「唔指定人就冇人做」 ② 前端 override dialog 直接寫住「買 licence 唔會加 allocation,請去 License assets 改」 ③ **監察手段 = `/admin/audit` filter `assign.budget_override`**(獨立 action 就係為咗呢個而設,ADR-0016 R4)—— **要定期睇,唔睇就等於冇** ④ 🔴 **三項全部係程序性,零技術強制** ⇒ 自動化 = **新 ADR**(會掂 ADR-0004 Excel↔平台 SSOT 未解張力),唔可以喺實作裡面偷偷加 | ⚠️ **Open**(mitigation 全屬程序性;要收窄需 ① 指定負責人 ② 定期查 override 次數 ③ 或解決 allocated SSOT) |
| R6 | **平台寫落 ServiceNow catalog task 嘅 work note 係 write-only** —— `work_notes` 係 journal input field,Table API GET 永遠返空,真正內容喺 `sys_journal_field`,而 integration account 對嗰張表**一行都讀唔到**(2026-07-31 實測:唔限 element_id 都返 0 行)。同一個 PATCH 送 `state` + `work_notes` + `assigned_to`,ServiceNow 完全做得到**收 state 而靜靜 drop work_notes**(field-level ACL),兩種情況喺平台睇嚟一模一樣:同一個 200、同一個 `updated`、`ticketHeldAt` 照寫、`OutboundFailure` 佇列照樣 0 行 | **REQ0044038 HOLD 路徑 live 驗證**(2026-07-31)—— 驗 note 內容時發現讀唔到,再 probe 先知係 ACL 而唔係「冇寫」 | **未知(冇能力量度)** —— 呢個就係風險本身:唔係「大機會出事」,係「出咗事都唔會有人知」 | 🟡 Lower-Med(**state 先係語意載體**,SN 流程靠 state 推進,已獨立驗到真係 1→2;note 係畀人讀嘅上下文 ⇒ 丟失唔會令流程停,但人手接手時會見到 task 變咗 In Progress / Closed 而**冇任何原因**。CLOSE 路徑影響大過 HOLD:「licence 已 assign」呢句冇咗,下手會以為冇做過) | ① 🔴 **目前零技術緩解** ② 唯一驗證途徑 = **人手開 SN 望** ③ ops script `intake-from-servicenow.ts --notes` 已加 **readability probe**:空結果之下會再問一次「呢張表畀唔畀讀」,所以佢**唔會**幫你確認 note 寫咗,佢嘅唯一價值係**阻止把「讀唔到」誤讀成「冇寫」**(第一次跑就差啲中招)④ **defer 追 journal read 權限**(要 ServiceNow admin,同 n8n 三接縫嗰批接線一齊開較有效率)⑤ ⚠️ **`N8nTicketProvider` 路徑同樣中招,而且更盲** —— workflow 2004 用 `neverError`,SN 拒絕都返 200<br>🔴 **⬆️ 2026-08-04 加一個 consumer(W43 / ADR-0026 D2)**:gate ② 開閘時寫嘅 `target_user` 更正 note 行**同一條路**,所以同樣中招。⚠️ 順帶校正一句話:ADR-0026 講 work note 路徑「**已證實寫得到**」—— 精確講,CH-010 證實嘅係**個 PATCH 唔會 403**(對比 `sc_item_option` 一定 403),**唔係**「note 一定 land」。本條就係嗰個分別。即使如此,選 work note 仍然係啱嘅:一條**可能**寫得到嘅路,好過一條**已證實一定唔得**嘅路 | ⚠️ **Open**(同 R5 / DD-4 同族:平台側信號全綠 ≠ 對面真係收到) |
| R7 | **UOP 同 n8n 共用同一個 ServiceNow integration account(`n8napiservice1`)** —— ⇒ `sys_updated_by` / `assigned_to` **永遠分唔到邊個系統做過乜**。後果唔止「查唔到」:CH-020 / ADR-0024 **D5 個 rationale 就係咁記錯**(以為 SCTASK0071807 被人手閂,實情係 UOP 自己喺驗證期間閂嘅),而嗰個誤判一路傳到成份 ADR 嘅前提。唯一可靠指紋係 **`close_notes` 文字**,而佢係**慣例唔係機制** —— 兩邊改一改 wording 就冇咗 | W43 F0 調查(2026-08-03)—— 實測 `SERVICENOW_USER === 'n8napiservice1'` = true | **High(已係現況)** | 🟡 Med —— 唔影響功能正確性,影響**事後查證同歸因**。而歸因錯咗會令架構決定建喺錯前提上(ADR-0024 就係活例) | ① 目前唯一手段 = **`close_notes` 指紋**,UOP 側文案要保持同 n8n 唔同(`… assigned via platform.` vs `Closed & Handled by n8n`)② 🔴 **查 SN 側「邊個做」嗰陣一律唔可以信 `sys_updated_by`**,要睇 `close_notes` / journal ③ 正解 = **同 SN admin 開一個 UOP 專屬 account**,同 ADR-0018 OQ-2 嗰個 least-privilege 缺口、同 DD-5 嘅 `sc_item_option` 寫權**一齊傾**(三件都係「同 SN admin 要嘢」)④ 未攞到之前,凡靠 SN 側痕跡推論行為嘅結論,**必須寫明個指紋係咩** | ⚠️ **Open**(零技術緩解;靠慣例) |

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
