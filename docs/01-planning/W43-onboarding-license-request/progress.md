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

### 批 B 收尾 — F3-2 / G5：migration scratch DB apply + rollback ✅

scratch DB `platform_w43_gate2`（建→驗→drop），**全程冇掂 dev DB**。每一步都有真 `psql` / `prisma` 輸出。

| 步 | 做咗 | 真輸出 |
|---|---|---|
| 1 | `CREATE DATABASE platform_w43_gate2` | `CREATE DATABASE` |
| 2 | `DATABASE_URL` 指去 scratch → `prisma migrate deploy` | `Datasource "db": … "platform_w43_gate2"`（**確認 shell env 蓋過 `.env`**）· 19 條全 apply · exit 0 |
| 3 | `npm run seed` | `Seeded 24 OpCos + admin + RHK OPCO_IT user.` exit 0 |
| 4 | 插 2 行 fixture：`g5-row-1` gate ② **有值**、`g5-row-2` **冇值** | `INSERT 0 2` |
| 5 | **手寫 rollback**：`ALTER TABLE "Request" DROP COLUMN ×2; DELETE FROM "_prisma_migrations" WHERE migration_name='20260804032725_w43_gate2_sn_user_sync';`（**同一個 `-c` ⇒ psql 當一個 transaction**，要就一齊成功要就一齊唔郁） | `ALTER TABLE` / `DELETE 1` |
| 6 | 驗 rollback | 兩個欄 **0 rows**（真係冇咗）· 兩行 fixture **其餘每一格逐格不變** · migration ledger **19 → 18** |
| 7 | 重 apply（🔴 **呢次係打落一個已經有 row 嘅 DB** —— 即 UAT 真實情境，唔係空 DB） | 只 apply 返嗰一條 · exit 0 |
| 8 | 驗 forward | `is_nullable = YES`、**`column_default` 空**、type `timestamp without time zone` / `text` · **`rows_with_gate2_set = 0`** |
| 9 | `DROP DATABASE` + 查 dev DB | scratch 冇咗 · dev `Request` **15 → 15**（同 baseline 一樣）· dev 入面 `id LIKE 'g5-row-%'` = **0 行**（零污染，唔係靠「我應該冇寫過去」推論） |

**結論兩句，包括唔好聽嗰句**：
- forward 安全 —— additive、nullable、**冇 default**，打落有 row 嘅 DB 之後舊 row 兩個新欄全部 NULL（**零 backfill 喺真 row 上證到**，唔係讀 `migration.sql` 推論）。
- 🔴 **rollback 對呢兩個欄係有損** —— `DROP COLUMN` 必然。`g5-row-1` 原本有 gate ② 值，rollback 之後冇咗，重 apply 都返唔到。對其餘一切無損。要 rollback 而唔想蝕數，就要事前 dump 嗰兩個欄。

### 🔎 G5 順帶查到（非計劃內，但影響 G7）

查 dev DB 有冇被污染嗰陣見到 **2 張單 gate ② 已經開咗**，而且係 **`scheduled sweep` 真開嘅**，唔係我 update 落去：

```
cms8ne17c… | SYNC | ServiceNow sync verified — the target user exists in ServiceNow (scheduled sweep) | 2026-08-04 03:40:08
cmscld7iz… | SYNC | ServiceNow sync verified — the target user exists in ServiceNow (scheduled sweep) | 2026-08-04 03:40:12
```

⇒ **`findUserSysIdByEmail` + `openServiceNowUserGate` 打真 SN 已經行得通**（G7 前半有實證）。

**兩行 `serviceNowUserSysId` 一模一樣（`f9c5785f…`），睇落好似撞名 bug** —— 查落 `count(DISTINCT "targetUpn") = 1`：**同一個人兩張單**，所以同一個 sys_id 係**啱嘅**。（查 distinct count 而唔係 print 個 UPN = H4。）

🔴 **G7 後半仍然未驗，唔可以順手當做完**：`target_user` 回填走 `updateCatalogVariable`（寫 `sc_item_option`），而佢**刻意 non-fatal** ⇒ 寫唔到都唔會喺 DB 留低任何痕跡。DB 呢邊睇幾耐都證唔到。要證只有一條路：**去 SN 讀返嗰兩張 RITM 個 `target_user`**（read-only）。

### Actual vs Planned Effort

| Deliverable | Planned (h) | Actual (h) | Variance |
|---|---|---|---|
| F1 BUG-010 | ~3 | ~2.5 | — |
| F2 建單 | ~3 | ~1.5 | 少咗，因為 F1-8 已經做起 requester 解析 |
| G6 live | ~1 | ~0.7 | — |
| F3 gate ② | ~4 | ~2.5 | — |
| F4 雙閘 | ~1 | ~0.8 | 含順帶修 fixture 陷阱 |
| F5 前端 | ~2 | ~1.5 | 含 F5-6 非計劃內；light+dark 未驗 |
| F3-2 / G5 scratch DB | ~1 | ~0.5 | 順帶揭到 G7 前半已有實證 |
| G7 read 半 | ~0.5 | ~0.5 | 答案 = 回填冇 landed;寫入實驗等批准 |

### G7 read 半 — 回填**冇** landed（2026-08-04，PR #75 merge 之後）

獨立 read probe（plain `fetch`，同 `updateCatalogVariable` 一模一樣嘅三層 walk，**零寫入**）。用獨立 read 路而唔用 production class，係因為呢度問嘅係「ServiceNow 而家係咩狀態」—— 攞寫嗰個 object 去問佢自己寫成點，證據力弱。

| RITM | cat_item / state | `target_user` | 判斷 |
|---|---|---|---|
| **RITM0047331** | `O365 User License Maintenance Request` · Open | **有**呢個 variable，但值 = **另一位同事** | ❌ 回填**冇**寫入 |
| **RITM0047333** | `New Hire Windows Domain Account` · **Closed Complete** | **吉** | ❌ 冇寫入 |

🔴 **最值得記低嗰件事:好彩佢冇寫到。** dev fixture 把一張「target = requester 本人」嘅平台 request，駁咗落一張**真人真事、關另一位同事事**嘅 RITM。若果回填 work，佢就會靜靜把人哋張飛個 `target_user` 改成我哋嘅 target。⇒ **回填並冇限制只寫平台自己建嘅 RITM** —— production 上 F2 建嘅單無問題（platform 自己開嘅），但 **ADR-0021 import-from-SN 嗰條路**嘅 line item 指住嘅係已存在嘅 SN RITM，值得 Chris 判斷要唔要收窄。

**三個候選因由，而家分唔開**：

| | 候選 | 點解未排除 |
|---|---|---|
| (a) | `sc_item_option` **冇寫權** | BUG-010 已示範呢個 instance insert / update 係兩套 ACL |
| (b) | sweep 03:40 跑嗰刻回填 code 未完整 | `bea936b` 係 **03:59** 先 commit —— 但 watch mode 可能早就 load 咗，分唔到 |
| (c) | 行過，return `false` / throw，畀 non-fatal 食咗 | 回填**刻意**唔留痕（F3-8）⇒ DB 呢邊點查都查唔到 |

⚠️ **(b) 呢個 confound 係我自己整出嚟嘅** —— 驗證跑喺 commit 之前，所以「當時行緊咩 code」講唔死。下次 live gate 驗證應該喺 commit 之後先跑。

**要分開三者只有一條路 = 真 PATCH 一次。** 唯一安全對象 = **RITM0047366**（G6 嗰張 `[UOP TEST]`，本來就等緊人手 cancel）。🔴 **絕不可以攞 RITM0047331** —— 佢係真人張飛。**等 Chris 明示批准先做**（同 G6 一樣）。

⚠️ **順帶一個我自己嘅失誤**：probe 特登只攞 `user_name` 唔攞 email / displayName 去避開 H4，但呢個 instance 個 `user_name` **本身就係 email address**，所以照樣印咗兩個地址落 terminal。冇造成實際外洩（本機 + private repo），但下次要**先確認個欄實際載住咩**先當佢安全。

### 🔴 G7 write 半 — **403 ACL,因由判實**（Chris 2026-08-04 批准打一次）

批准範圍：**只准打 RITM0047366**（G6 嗰張 `[UOP TEST]`，本來就等緊人手 cancel）。Script hard-code 咗一個 number，另外兩張真人張飛入咗 `FORBIDDEN` list 兼 assert 兩次。

**做法**：行 **production class**（`ServiceNowService` + stub `ConfigService`/`ConnectorConfigService`），寫**同一個值**（`target_user` 本來就係 requester 個 sys_id）—— 唔改張飛任何事實，證據係 **HTTP status** 唔係新值。覆核走**獨立 read 路**，唔畀寫嗰個 object 做自己成功嘅證人。Dry-run 先行，`--write` 至寫。

```
BEFORE  option=f11e6ba4… value=f9c5785f… updated=2026-08-04 02:26:28 mod_count=0
WRITE   THREW: ServiceNow request failed (403)
        PATCH /api/now/table/sc_item_option/f11e6ba4… -> 403
        {"error":{"message":"Operation Failed",
                  "detail":"ACL Exception Update Failed due to security constraints"}}
AFTER   option=f11e6ba4… value=f9c5785f… updated=2026-08-04 02:26:28 mod_count=0
```

⇒ **候選 (a) 證實，(b)/(c) 唔使再查** —— 就算 03:40 嗰次 code 完整、就算行過，結果都一定係 403。

⇒ 🔴 **`updateCatalogVariable` 對 `n8napiservice1` 係永遠 work 唔到。** `target_user` 回填等同死 code：每次靜靜 403（non-fatal 食咗），gate 照開，而張單**永遠繼續指住 requester 做自己個 target**。

**ServiceNow 零副作用**：`value` 冇變、`sys_mod_count` **0 → 0**。RITM0047366 仍然係嗰四張等人手 cancel 嘅其中一張，狀態同做呢個實驗之前一模一樣。

**呢個推翻 ADR-0025 D3 嘅後半段（H1 —— 未拍板前唔改 code）。** 三條路畀 Chris 揀：

| | 路 | 代價 / 好處 |
|---|---|---|
| **(i)** | 同 SN admin 攞 `sc_item_option` 寫權 | 唯一保住 D3 原設計嘅方法;但要外部批,時間唔喺我哋手 |
| **(ii)** | **拆走回填**（call + `updateCatalogVariable` 一併刪） | 最誠實 —— 唔留一段永遠 403 嘅 code。`target_user` 永遠 = requester，真 target 靠 `target_users_email`（已經有） |
| **(iii)** | 改用 **work note** 講返真 target | `sc_req_item` 嘅 PATCH **已證實寫得**（CH-010 close task 就係走呢條路），O365 Support 睇得到;但 `target_user` 欄本身仍然錯 |

**我 recommend (iii) + (ii) 一齊做**：拆走一段永遠失敗嘅 code，改用一條**已經證實寫得到**嘅路去交付同一個資訊。(i) 可以平行去追，追到再回來加返。

⚠️ **gate ② 本身唔受影響** —— 佢開閘靠嘅係「SN 搵唔搵到呢個人」，同寫唔寫得到 variable 無關。assign 雙閘照 work。

一次性 script **跑完即刪**（hardcode 咗 RITM number，係 gate 驗證唔係持續工具）。

### Commits

| Hash | Subject | Checklist |
|---|---|---|
| `9afc5c3` | `refactor(fulfilment)` W43 F0 — 停用 by-task close | F0-1 ~ F0-5 |
| `1a29240` | `feat(integration)` W43 F1 — 平台開單改行 Service Catalog API（修 BUG-010） | F1-1 ~ F1-9 |
| `7484fa4` | `feat(fulfilment)` W43 F2 — onboarding intake 之後即刻建 O365 licence 單 | F2-1 ~ F2-13 |
| `1d8997c` | `docs(planning)` W43 G6 live 驗證通過 — BUG-010 轉 done | G6 |
| `bea936b` | `feat(fulfilment)` W43 F3+F4 — gate ② + assign 雙閘 | F3-1,3~8,10~12 / F4-1 ~ F4-5 |
| `29ee6d3` | `feat(web)` W43 F5 — request detail 顯示兩個 sync gate 狀態 | F5-1,2,4,5,6 |
| `00033bd` | `docs(planning)` progress 補回 commit ↔ checklist 對照 | R2 |
| `faa4786` | `docs(planning)` W43 F3-2 / G5 scratch DB apply + rollback 驗證通過 | F3-2 / G5 |

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
