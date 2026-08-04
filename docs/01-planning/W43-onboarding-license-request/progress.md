---
phase: W43-onboarding-license-request
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: in-progress    # in-progress | closed
---

# Phase W43 — Progress

> Daily progress + 結尾 retro。
> 每 commit 必須對應一個 Day-N entry mention（R2 binding rule per PROCESS.md §5）。

---

## Day 0 — 2026-08-03: Kickoff（pre-doc 出稿，**未開工**）

**Action**：Phase W43 pre-doc 出稿

- `{NN}` 揀號：跑咗 PROCESS §2.1 嗰條掃描（`git fetch --all` + 掃**所有 remote branch** 嘅 `docs/01-planning/`），最大 = **W42** ⇒ 揀 **W43**
- `plan.md` 填好，status = **`draft`**（**未** active — 等 Chris approve）
- `checklist.md` 由 plan deliverables 衍生（F0–F7 + G1–G10 + cross-cutting），**零項預先 tick**
- `progress.md` init Day 0
- ADR-0025 出稿，status = **`Proposed`**

**🔴 未開工，因為 R1 + H1**：ADR-0025 未 Accepted、plan 未 active ⇒ **一行 code 都唔寫**。

**Carry-over from CH-020 closeout**：
- 🔴 UAT migration 未獨立驗證（公司網連唔到 UAT DB）—— 結論性檢查 = 開一次 UAT Requests 頁
- Chris 個 account 有一個 V5d 派落去嘅 Power BI Free licence，要去 Entra portal 收（平台冇 un-assign 路徑，H3）
- dev DB 留低：RHK × `POWER_BI_STANDARD` ledger `0/1` · REQ0044068 mirror 已改到唔似原本 · SCTASK0071829/0071830 兩張 fixture task 都閂咗

**Commit**：（待 approve 後一併 commit）

### 本日調查發現（全部真 tool output，read-only probe）

1. **n8n 真係閂埋 WDA task** —— `close_notes LIKE 'Handled by n8n'` 11 行，含 2 張 `Creation - Windwos Domain Account`（SN 側串錯字，所以查 `Windows` 會 miss）。
2. **1007 個 note-only 分支從未跑過** —— `sys_journal_field` where `value LIKE 'Awaiting E5 licence'` = **0 行**（全 instance）。
3. 🔴 **UOP 同 n8n 共用 `n8napiservice1`** —— `sys_updated_by` / `assigned_to` 永遠分唔到邊個系統做，唯一指紋係 `close_notes`。
4. **ADR-0024 D5 個 rationale 記錯** —— SCTASK0071807 唔係「被人手閂」，係 **UOP 自己喺 CH-020 驗證期間閂嘅**（03/08 10:28，`close_notes = "License Microsoft_365_E5_(no_Teams) assigned via platform."`）。D5 結論企得住，理由要換。
5. **O365 單形狀** = REQ → RITM → 剛好一張 `Execution Step` task（grp `O365 Support`），實測 8 張近期 RITM 全部 1:1 ⇒ ADR-0018 D3 原封啱用，**F6 零新 code**。
6. **真正 mandatory variable 得 4 個** —— `license_type` / `action_type` 都係 `mandatory=false` ⇒ **48-choice 對照表唔阻塞建單**，scope 因此細咗一截。
7. 🔴 **`target_user` 係 mandatory reference → `sys_user`**，收 sys_id 唔收 email ⇒ 本 phase 最核心嘅時序矛盾，靠 D3 requester placeholder + gate ② 回填解。

### Decisions / Open-Questions

- **Chris 拍板 ①**：`target_user` placeholder 用 **requester**（否決 integration account）。
- **Chris 拍板 ②**：**即刻建單**（否決「等 gate ② 通過先建」）。
- ADR-0025 開咗 4 條 OQ（callback / 兩張 REQ 點放 / 多 line 幾張單 / email 對 `sys_user` 唔 unique），全部有建議 default。

### Blockers

- 🔴 **G1 — ADR-0025 未 Accepted**（硬阻塞）
- ⚠️ G6/G7/G8 live 驗證需要 Chris 明示批准真 POST（SN 刪唔到單）

### Actual vs Planned Effort

| Deliverable | Planned (h) | Actual (h) | Variance |
|---|---|---|---|
| Pre-doc（ADR-0025 + plan + checklist + progress） | — | ~1.5（含 4 輪 read-only SN probe） | — |

### Commits

- （待 approve 後 commit）

---

## Day 1 — 2026-08-04

### Done

- **G1 / G1b 過**：Chris Accept ADR-0025 · plan `draft → active` · **分批做，由批 A 開始**（F0+F1+F2）· 四條 OQ 全部按建議 default。
- Branch **`feat/w43a-o365-request-creation`**（唔喺 `main` 直接做，跟 §4.1）。
- **F0 止血完成**（F0-1 ~ F0-5 全剔）：
  - `ticketTarget()` 唔再讀 `serviceNowTaskSysId`，剩返 `RITM → 冇`；順帶由佢同 `holdTicket()` 嘅 param type 移走嗰個欄（§1.3：自己改動製造嘅 orphan 要清）
  - `TicketTarget` union 同 `openTask()` / D5 `active` 閘 **保留**（ADR-0025 D1）
  - schema + DTO 註釋改寫成 **TRACEABILITY ONLY**，兩個 column **冇 drop**
  - 3 個 test 斷言**反轉**（fails-before：舊 code 會傳 `{kind:'task'}`，新 code 傳 `{kind:'ritm'}` 或者根本唔 close）

### Decisions / Open-Questions Resolved

- **OQ-1 ~ OQ-4 全部按 ADR 建議 default 執行**（Chris 2026-08-04）：唔做 n8n callback · `Request.serviceNowSysId` 維持 = onboarding REQ 而 UOP 建嗰張落 line item 層 · 一條 line 一張 RITM（走 cart）· email 對 `sys_user` **≥2 命中 fail-closed**。（R4）
- **行為改變、已記低**：批 A 期間 ADR-0020 注入嗰條 line 冇 RITM ⇒ assign 只寫 parent REQ work note，**唔 close 任何 task**。呢個係 CH-020 之前嘅行為，喺 F2 畀佢一張自己嘅 RITM 之後就會補返。test `does not close a handed-over catalog task when the line has no RITM` 明文釘住咗呢個中間態。
- 🔴 **順帶發現（未決）**：`TicketTarget` 個 `kind: 'task'` 分支而家**冇 production caller** —— ADR-0025 D1 保留佢嘅理由係「新流程一樣要 close task」，但 D6 實際上係經 `RITM → pickTask` 揀 task，唔會直接畀 task sys_id。批 C 收官時要重新判斷：keep 定 remove。**唔喺批 A 自作主張改**。

### Blockers

- 無（F1/F2 唔依賴外部）。⚠️ G6/G7/G8 live 驗證仍然要 Chris 明示批准真 POST。

### Actual vs Planned Effort

| Deliverable | Planned (h) | Actual (h) | Variance |
|---|---|---|---|
| F0 止血 | ~1 | ~0.7 | — |

- **F1 完成**（BUG-010，F1-1 ~ F1-9）：`DirectServiceNowProvider` 由 Table API insert 重寫成 **Service Catalog API**。api **837 → 861**（+24），68 suites。

### 🔴 F1 途中揭到三件 ADR-0025 冇覆蓋嘅嘢

1. **`order_now` / `submit_order` 只返 REQ number，唔返 RITM** —— 而 `SubmittedRequest` 要每條 line 嘅 RITM sys_id。所以落單後一定要**反查**。用 `getRecordByNumber` + `query(...^ORDERBYsys_created_on)`，**冇用** `ServiceNowLookupService`（佢會順帶查每個 RITM 嘅 active task，對建單嚟講係多餘 GET）。
2. **RITM 順序唔保證等於 payload 順序** ⇒ index zip 會**靜默配錯**。兩道閘頂住：讀返嚟按 `sys_created_on` 排（= 入 cart 次序），而且 **count 唔等就 fail-closed**。副作用：若 `sysparm_quantity > 1` 令 SN 建多張 RITM，會 fail-closed 而唔係靜靜錯 —— 未實測，live 先知。
3. 🔴 **D365 分流冇可靠數據源**（Chris 揀「兩個 item 都接」之後先發現）：`SkuCatalog.category` 實測係 `Base`/`Add-on`/`Power Platform`/`Voice` —— **licence 角色分類，唔係產品家族**，而 30 個 Dynamics SKU **全部** `category = null`。⇒ 只可以睇 part number 前綴。實測 99 個 active SKU 分得乾淨（30 個 Dynamics 全部 `D365`/`DYN365`/`Dynamics` 開頭，其餘冇一個係），但**佢係 heuristic，失效模式係開錯一張真單**，所以做成 `SERVICENOW_D365_SKU_PREFIXES` env 可改而唔使 deploy。**混合 O365+D365 line 一律 fail-closed**（一個 request 得一個 `serviceNowSysId`，split 冇處可記）。

### 仲未做、已 flag

- **`license_type` 一個字冇送**（D7：`mandatory=false`，48 choice 冇 mapping，送個估好過唔送 —— 錯）。後果係 **O365 Support 收到張單唔知要邊隻 licence**。可以落單後 PATCH 一個 work note 講明 SKU（一行 code），但 ADR 冇要求，**唔自己擴 scope** → 交 Chris 判斷。
- 有個 `O365 User License Maintenance Request (New)` catalog item 都係 active，但最近 40 張 licence RITM **冇一張**用佢 ⇒ 暫時唔轉，記低。

### Commits

- `f6ec471` — `chore(planning): kickoff W43 + ADR-0025 onboarding licence request creation`
- `9afc5c3` — `refactor(fulfilment): W43 F0 — 停用 by-task close，兩個 task 欄改做 traceability`（F0-1..F0-5）
- `1a29240` — `feat(integration): W43 F1 — 平台開單改行 Service Catalog API（修 BUG-010）`（F1-1..F1-9）

---

## Day 2 — 2026-08-04（同日，接住做）

### Done

- **F2 完成**（F2-1 ~ F2-13）：onboarding intake 收貨之後**即刻**建 `O365 User License Maintenance Request`，新 RITM 寫落對應 line item。api **861 → 866**，68 suites，lint exit 0。

### 兩個實作決定（ADR 冇明講，記低理由）

1. **Hook 喺 `IntakeAdapterService.intakeFlat`，唔喺 canonical `IntakeService`**。plan §1.1 講「唔碰 canonical CONTRACT」係其一，但真正理由更硬：**ADR-0021 `import-from-servicenow` 都行 `IntakeService`**，而嗰條路係「由一張**已經存在**嘅 SN REQ 導入」—— 喺嗰度建單會為一張已有嘅單再開多一張。
2. **catalog item id 行 env 唔行 `ConnectorConfig`**。ADR-0013 精神係非機密配置落 DB 可 UI 改，但 ADR-0025 **冇授權** `ConnectorConfig` 加 column，而加 column = schema = H1。env 零 schema、可逆；要 UI 可改就批 C 另開。

### 🔴 F2 最重要嗰個 guard

`intakeFlat` **本身係 idempotent**（重推返同一個 Request）。所以「建單」如果冇 once-guard，**n8n 每重推一次就開多一張真飛**，而且平台側完全睇唔出有問題。Guard 用 line item 自己嘅 `serviceNowSysId`：呢條路佢一定係 null（1001 唔送 RITM），而**只有呢個 method 會填佢**。有專項 test 釘住。

### Actual vs Planned Effort

| Deliverable | Planned (h) | Actual (h) | Variance |
|---|---|---|---|
| F1 BUG-010 | ~3 | ~2.5 | — |
| F2 建單 | ~3 | ~1.5 | 少咗，因為 F1-8 已經做起 requester 解析 |

### Commits

---

## Retro（填於 phase 結束）

### What worked

### What didn't work / unexpected friction

### Surprises / discoveries

### Carry-overs to W44

### ADR triggers

### Phase Gate result

### Phase status

---

**End of W43 progress**
