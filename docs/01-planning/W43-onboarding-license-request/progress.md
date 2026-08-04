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

### ✅ G6 live 驗證通過（Chris 2026-08-04 批准真 POST）

驗法：**行 production class**（`ServiceNowService` + `DirectServiceNowProvider`，只 stub `ConfigService`/`ConnectorConfigService` 令佢唔使 DB），**唔另寫一段 SN 呼叫** —— 嗰樣只會再證一次 BUG-010 §2 #5 已知嘅嘢，證唔到出貨嘅 code。Dry-run 先行，`--post` 至寫。

| | |
|---|---|
| REQ | **REQ0044071** · `request_state=Approved` · `requested_for=Chris Lai` |
| RITM | **RITM0047366** · `cat_item = O365 User License Maintenance Request`（唔係 D365）· `[UOP TEST]` 已標 |
| Task | **SCTASK0071831** · `Execution Step` · `O365 Support` · **剛好 1 張 active** |

**獨立 read 覆核**（唔用 script 自己嘅 output，直接查 SN）：`target_user` = requester sys_id ✅（D3 placeholder 真係生效）· `target_users_email` = 新人地址 ✅ · `license_type` **留空** ✅（D7）· `opcos` / `target_user_opcos` = `rapo` 小寫 ✅ · `action_type = new_license_assignment` ✅

⇒ **BUG-010 → `done`** · **ADR-0025 D6「close 零新 code」得到實證**：1 RITM : 1 task 正正係 ADR-0018 D3 要求嗰個形狀。

一次性 script **跑完即刪**（hardcode 咗 requester email，而且係 gate 驗證唔係持續工具；造 SN fixture 嘅需要 CH-014 script 已經覆蓋）。

🔴 **順帶揭到、影響 production**：SN 個 **integration account 冇 email address**。CH-014 script 靠直接畀 sys_id 所以無事，但 production 靠 email 反查 ⇒ **integration account 做唔到 requester**。連帶：onboarding 路徑嘅 `requesterEmail` 係 n8n 由 **Outlook sender** 帶落嚟，唔保證係某個 `sys_user` 嘅 email；搵唔到就按 D3 fail-closed 唔建單（設計上正確，但命中率要 live 先知）—— plan **R2** 兌現。

⚠️ **REQ0044071 要人手 cancel**（SN 刪唔到），同 CH-014 OQ-2 嗰 3 張一齊處理。

### 批 B — F3 gate ② + F4 雙閘完成

api **866 → 874**，68 suites，lint exit 0。migration `20260804032725_w43_gate2_sn_user_sync`。

**設計上最重要嗰兩點**：

1. 🔴 **一個 vendor 一個 abort flag**（`graphDown` / `snowDown`）。兩個 gate 問同一個人，但 Graph outage 同 ServiceNow 無關。共用一個 flag 會令一邊掛低就**靜靜**停低另一邊 —— 而 round 仍然返成功，冇任何嘢睇得出。有兩個對稱 test 釘住（SN 掛 Graph 照開 / Graph 掛 SN 照開）。
2. 🔴 **≥2 命中唔等於 SN 掛咗**。新 `AmbiguousServiceNowUserError` 分辨兩者：撞名係**嗰一個 request** 嘅問題，gate 關住但**唔可以 abort vendor**，否則全部其他 onboarding 被一個重複目錄記錄拖住。

**順帶修咗一個測試陷阱（F4-5，非計劃內）**：`readyItem` 個 `...over` 本來喺 `request` 之後，所以 `over.request` 係**整個取代**預設值。以前得一個 gate 所以無害;加咗第二個之後，「關 gate ②」會連 gate ① 一齊抹走 —— 我兩個新 test 就係咁**因為錯嘅原因而紅**，先揭到。修完 `request` 移去 `...over` 之後，變成真 merge。

**未做、已標 🚧**：
- **F3-2 / G5** scratch DB apply + rollback —— 批 B 收尾做
- **F3-9** `SyncCheckService` on-demand gate ② —— sweep 每 10 分鐘已覆蓋，on-demand 純 UX 便利，唔影響 gate 正確性。target 批 C / BACKLOG
- **F5** 前端未開

⚠️ **未證實嘅假設**：`updateCatalogVariable` 要寫 `sc_item_option`，而**呢個帳號有冇寫權未驗過** —— BUG-010 已經示範咗 insert 同 update 喺呢個 instance 係兩套 ACL。所以回填做成 non-fatal，gate 唔會因為佢失敗而重新關上。要驗就要真 PATCH 一張單（G7）。

### 批 B — F5 前端：兩個 gate 狀態可見

web **265 → 281** test（31 files），tsc web 0 error。改 4 個檔 + 加 2 個 test 檔，**零新 dep、零新 pattern、零新色**。

**做咗啲乜**：Request detail 個 check-point row 由兩個變三個（`Account created → Synced to Azure AD → Known to ServiceNow`，同一個 `SyncStep` primitive）。Assign 掣、掣上面個 title、header badge 三樣一齊跟兩個 gate 走。

**三個決定，每個都有反例**：

1. 🔴 **gate ② 未通嗰陣，右邊刻意得文字冇掣**（`Waiting on ServiceNow · checked automatically`）。`Check now` 問嘅係 **Graph** —— 喺呢個狀態出佢，等於叫 operator 去 re-check 已經冇事嗰邊。`Mark synced` 更加唔可以有：break-glass 之所以合理，係因為「Graph 連唔到但個人真係喺度」呢個情況存在；而**冇人可以宣稱一條 ServiceNow 記錄存在**——gate ② 唯一開法就係 sweep 見到佢。
2. 🔴 **`deriveStatus` 一定要加 gate ②（F5-6，非計劃內）**。唔加就會**同一個版面自相矛盾**：header badge 講「Ready to assign」，下面 assign 掣同時講「Blocked · sync」。而 `deriveStatus` 係共用嘅 ⇒ Requests 列表本來會為一張 backend 一定 400 嘅單寫住「Ready to assign」。
3. **兩個 gate 共用一個 label**（都係 `Blocked · sync`）。分開 label 睇落更清楚，但 list column 度「等緊邊個 vendor」唔 actionable，而「而家 assign 唔到」先係;更硬嘅理由:`matchesFilter('blocked')` 係 `status === 'Blocked · sync'` 字串比對 —— 加第二個 label 就**必須**同步改個 filter，漏咗會令 gate ② 阻塞嘅 request **靜靜**喺 Blocked tab 消失。共用一個 label ⇒ 個 filter 一個字唔使改就自動接住。有 test 釘住兩邊都搵得返。

**順帶**:migration 零 backfill ⇒ 所有舊 request `serviceNowUserSyncedAt` 都係 null。`deriveStatus` 個 `every ASSIGNED → Completed` 喺 gate 檢查之前,所以**歷史單唔會集體變紅**——已寫 test 釘死（唔係靠讀 code 推論）。

**我自己個 test 一開始紅咗 4 條,而且係我寫錯唔係 code 錯**：`getByText('Blocked · sync')` 撞到兩個 node。原因就係決定 2 生效咗——header badge 同 assign 掣**講緊同一句嘢**。改用 `getByRole('button')`，並且把「兩個位講同一句」由 bug 變成**斷言**（`getAllByText('Ready to assign')` 長度 = 2）。另一條 `.bg-accent` 數到 3：line-item stepper 啲已行過嘅點都係 accent 色 —— 改成數 `button.bg-accent`，因為 H6 講嘅係**幾多個 action 喺度爭**，唔係幾多粒 accent 色像素。

#### `ui-design` skill 自檢（F5-4，逐條）

| # | 結果 | 依據 |
|---|---|---|
| DS-1 token-only | ✅ | 改動檔 grep `#hex` / `rgb(` / `hsl(` = **零命中**；色只用 `text-warn` / `text-ok` / `text-fg-subtle` / `bg-border-strong` |
| DS-2 唔 eyeball | ✅ | 新 step 同新文字每個數值都由**同一行嘅兄弟元素**照抄（`text-[12.5px]` / `text-[11px]` / `w-[60px]` / `h-[2px]`），冇調過一個數 |
| DS-3 單一 accent + 一 primary | ✅ | 有 test：`button.bg-accent` 數目 = **1** |
| DS-4 light + dark | ⚠️ **未 render 驗** | 結構上企得住：`--warn` 喺 `colors.css` `:root`(L29) 同 dark(L56) 都有定義，全部經 CSS var。但**冇真喺瀏覽器行過** → F5-3 / G9 |
| DS-5 數字 mono | N/A | 冇加任何數字 / 識別碼 |
| DS-6 lucide stroke | ✅ | 冇加 icon；第三個 step 用返 `SyncStep` 入面同一個 `Check` |
| DS-7 平面美學 | ✅ | 冇加 shadow / gradient / blur；深度仍然係 1px border + `bg-hover` |
| DS-8 狀態走 semantic | ✅ | badge 照走 `deriveStatus` → danger；「等緊」用 `warn`，同 `STAGE_TONE` 入面 awaiting → warn 一致 |
| DS-9 motion 克制 | N/A | 冇加動畫 |
| DS-10 voice / casing | ✅ | `Known to ServiceNow` / `target user record` / `Waiting on ServiceNow` / `checked automatically` —— 短、Sentence case、冇 emoji |
| DS-11 對住 prototype | ⚠️ **未對** | 同 DS-4 一樣冇 browser。但呢個 row 本身係 CH-015 期嘅 project pattern，今次只係**複製多一個一模一樣嘅 step**，冇引入新 pattern |
| DS-12 唔捏造 logo | N/A | — |

⇒ **兩條 ⚠️ 都係同一個原因：本 session 冇 browser**（`claude-in-chrome` 返 `[]`、無 Playwright MCP）。F5-3 同 G9 照留 `[ ]`，唔當做完。

⚠️ **順帶發現（唔喺本次 scope，冇修）**：`npm run lint -w @uop/web` **本身已經紅**（17 條 prettier，全部喺 `allocation-reset*` + 兩條喺我冇掂過嘅行）。CI 真正 gate 嗰條 root `npm run lint` **只 lint `@uop/api`**，所以 CI 唔會見到。我兩個新檔零 error。建議另開一個 `chore(web): prettier` 清，唔混入本 phase diff。

### Actual vs Planned Effort

| Deliverable | Planned (h) | Actual (h) | Variance |
|---|---|---|---|
| F1 BUG-010 | ~3 | ~2.5 | — |
| F2 建單 | ~3 | ~1.5 | 少咗，因為 F1-8 已經做起 requester 解析 |
| G6 live | ~1 | ~0.7 | — |
| F3 gate ② | ~4 | ~2.5 | — |
| F4 雙閘 | ~1 | ~0.8 | 含順帶修 fixture 陷阱 |
| F5 前端 | ~2 | ~1.5 | 含 F5-6 非計劃內；light+dark 未驗 |

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
