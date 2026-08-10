# W45 — Assign 過程可見性

**Status**: `active`(2026-08-10;ADR-0029 同日 Proposed → **Accepted**)
**Created**: 2026-08-09
**Owner**: Chris Lai
**Branch**: 🚧 `feat/w45-assign-progress` **未建** —— commit 落緊 `feat/w44-azure-dev-deploy`(W44 未 merge,另開 branch 會起喺一個未落地嘅 base);見 checklist F0-5
**決策 SSOT**: **ADR-0029**

> ⚠️ **W44 未收官,但已卡環境**(F6 卡 B8 private DNS · F9 卡 B9),而 W45 係純 code、零部署依賴 ⇒ Chris 2026-08-10 直接指示開工。W44 一解封即收官。

## 1. Why

Chris 2026-08-09 逐步對帳端到端流程,第 7 步(assign)要求「**像之前 mockup 一樣顯示過程,讓操作人員知道會否中途有錯誤**」。

mockup 真係有完整設計(五步 + 七個失敗場景),而現況係 `assign.mutate()` → **一個 toast**。

2026-08-07 實測示範咗單句錯誤訊息嘅極限:`No available seats for SKU POWER_BI_PRO` —— 呢句同時代表「tenant 冇買過」同「seat 用晒」,而兩者下一步完全唔同。

## 2. Scope

### 2.1 In Scope

- **F1** — API 契約:`POST …/assign` 改返 `{outcome, steps[], failedAt?}`(ADR-0029 D1)
- **F2** — 十個 step 逐個對應實際 gate(§3,ADR-0029 D6 要求喺呢度定死)
- **F3** — 每個失敗帶 `retryable` + `whoFixes`(ADR-0029 D2)
- **F4** — 前端:分步顯示 + 失敗高亮 + 「下一步搵邊個」
- **F5** — `detail` 全部經 `scrubPii`(BUG-004 同一形狀)
- **F6** — OpenAPI 更新;既有 test 逐個 gate 補 step assertion(H5)

### 2.2 Out of Scope（explicit）

- ❌ **即時進度 / SSE** —— ADR-0029 A2 明文否決(基建成本),steps 契約保持向前兼容
- ❌ **分步 endpoint** —— ADR-0029 A1 否決(會製造 DRIFT 風險)
- ❌ **改任何 gate 嘅行為** —— 🔴 本 phase **只改「點講」,唔改「擋唔擋」**。ADR-0016 / 0025 D5 一個字唔郁
- ❌ **retry 掣 / 自動重試** —— `retryable` 只係**告訴**,唔係做
- ❌ 其他操作(advance stage / sync-check)嘅 step 顯示

## 3. Step 清單（ADR-0029 D6 要求喺 plan 定死）

| # | key | label | 對應 `assign.service.ts` | status 可能值 |
|---|---|---|---|---|
| 1 | `stage` | Line item is ready | `:129` | ok · failed |
| 2 | `sync-azure` | Account synced to Azure AD | `:135` | ok · failed |
| 3 | `sync-servicenow` | Target user known to ServiceNow | `:155` | ok · failed |
| 4 | `directory` | User found in directory | `:164` | ok · failed |
| 5 | `usage-location` | Usage location set | `:174` | ok · failed |
| 6 | `budget` | OpCo allocation | `:188-222` | ok · failed · **overridden** |
| 7 | `seats` | Tenant seat available | `:229-235` | ok · failed |
| 8 | `assign` | Licence applied via provider | `:240` | ok · failed |
| 9 | `ledger` | Ledger updated | `:270-336` | ok · failed |
| 10 | `ticket` | ServiceNow updated | `:338-363` | ok · **skipped** · failed |

### 3.1 mockup 五步 → 實際十步,兩個必須講清楚嘅分別

🔴 **① `precheck` 唔可以合併。** mockup 寫 `availableUnits … in this OpCo`,把 **OpCo budget**(#6)同 **tenant seat**(#7)當成一件事。實際係兩層、兩道 gate、**budget 喺前**,而且下一步完全唔同(加 allocation vs 叫採購買)。2026-08-07 就係撞咗 #7 而 #6 係綠嘅 —— 合併就講唔出。

🔴 **② `ticket: skipped` 係新資訊,mockup 冇。** line item 冇 RITM 就 fallback 去 parent REQ 加 work note(`:363`),**冇任何嘢被 complete**。呢個分別今日 UI 完全睇唔到,而佢正正係 W44 F7-12 追緊嗰個問題。

### 3.2 UI 可以摺,API 唔可以

十步逐個列會淹冇重點(前七個都係 pre-flight)。⇒ **UI 把 #1-#7 摺埋做一組「Pre-flight」**(mockup `precheck` 嘅精神),展開先見逐項;**#8-#10 逐個顯示**(佢哋有真實副作用)。

**API 永遠逐個報** —— 摺疊係顯示決定,唔可以令後端講得冇咁精確。

## 4. Acceptance

- [ ] G1 十個 step 全部有 test,逐個 gate assert 對應 `failedAt`(H5)
- [ ] G2 🔴 **成功路徑 steps 全 `ok`**,而且**副作用一次都冇多做**(assert provider 呼叫次數不變)
- [ ] G3 每個失敗 `retryable` / `whoFixes` 正確(對照 ADR-0029 D2 個表)
- [ ] G4 🔴 **`detail` 零 PII** —— 餵一個含 UPN 嘅 vendor error,assert output 冇 email pattern(BUG-004 pattern,test 先行)
- [ ] G5 🔴 **前端兩種形狀都處理到** —— 舊 `{message}` 同新 `{outcome, steps}`;**assert 錯誤訊息唔會變空白**(ADR-0029 Consequences 標記嘅「紅得靜」)
- [ ] G6 `budget: overridden` 喺 override 路徑正確出現,而且**唔會喺預算充足時出現**(ADR-0016 R4:「override used」必須誠實)
- [ ] G7 `ticket: skipped` 喺冇 RITM 嘅 line item 出現;有 RITM 出 `ok`
- [ ] G8 OpenAPI `/docs/api` 反映新形狀
- [ ] G9 `npm run lint`(root)exit 0 · api + web tsc 0 · 既有 test 一條唔跌
- [ ] G10 🔴 **UI 真 render 驗**(light + dark),跑 `ui-design` skill
- [ ] G11 live 驗:DEV 真撳一次失敗(seat 不足)+ 一次成功,兩個都睇到正確 steps

## 5. Risks

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | 🔴 前端錯誤訊息變空白(契約改咗但 `onError` 冇跟) | **High** | **High** | G5 test 先行 |
| R2 | 🔴 改 test assert 順手改到「啱嘅原因」冇咗 | Med | **High** | G1 逐個 gate 獨立 test;唔可以只改 assert 字串 |
| R3 | `detail` 洩 PII | Med | **High** | G4 test 先行 + `scrubPii` |
| R4 | 順手改咗 gate 行為 | Low | **High** | §2.2 明文;code review 對 `assign.service.ts` gate 段落做 diff 檢查 |
| R5 | 十步太多、UI 淹冇重點 | Med | Low | §3.2 摺疊 |

## 6. Dependencies

- 🔴 **ADR-0029 要由 Proposed → Accepted**(H1 gate)
- ⚠️ **W44 要收官先開工**(rolling JIT)
- 💡 G11 live 驗需要一個 tenant 有剩 seat 嘅 SKU —— W43 已查證 = **`POWERAUTOMATE_ATTENDED_RPA`**(要先加 `allocated`),fixture `REQ0044072` ready

## 7. Plan Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-08-09 | Initial draft | Chris 端到端對帳;方案同日拍板 = ADR-0029 D1 | _pending_ |
| 2026-08-10 | status `draft` → `active`;W44 收官前置改成「已卡環境 ⇒ 平行開工」 | ADR-0029 Accepted;W45 零部署依賴 | Chris |
| 2026-08-10 | **400 body 保留 `message`**(ADR JSON 例子只有 `{outcome, failedAt, steps}`) | 直接消除 R1「錯誤訊息變空白」。成本一個欄,收益 = 冇任何一刻 UI 靜靜地失去錯誤文字;順帶保住幾十條 `toThrow(/…/)` 嘅覆蓋 | Chris(2026-08-10 口頭) |
| 2026-08-10 | **200 body 保留 `lineItem`**(ADR 講 return `AssignResult`) | 同上:讀 line item 嘅 caller 繼續行得,冇「response 合規但對佢冇用」嘅中間狀態 | Chris(2026-08-10 口頭) |
| 2026-08-10 | `whoFixes` enum 由 `procurement`/`admin`/`entra-admin`/`wait`/`none` 改成 `operator`/`admin`/`identity`/`servicenow`/`procurement`/`platform` | 原本嗰組**撈埋咗兩個軸**:`entra-admin` / `procurement` 係「邊隊人」,`wait` / `none` 係「做咩」。ADR-0029 D2 要答嘅係「**搵邊個**」,而 `wait` 答唔到。新組全部係人,而且 `sync-azure`(identity)同 `sync-servicenow`(servicenow)分得開 —— 呢個正正係 ADR-0025 D5 保留兩句訊息嘅理由 | Chris(2026-08-10 口頭) |
