# W45 — Assign 過程可見性 · Progress

> **Status**: `draft` —— 未開工。第一個 Day-N entry 喺 F0 全部 tick 之後先寫(PROCESS R2)。

## Day 0 — 2026-08-09（planning only,零 code）

### 起因

Chris 逐步對帳「n8n → onboarding → assign → SN complete」九步流程,問「**現在我們卡在哪了**」。對帳結果:三步已通、兩步 code 齊但從未證實、**兩步根本未起**。本 phase 係其中一步(另一步 = CH-021 通知)。

### 決定

- **方案**:Chris 同日拍板 = **回傳每步結果,維持 atomic call**(ADR-0029 D1)
- **否決**:分步 endpoint(會製造 DRIFT 風險)· SSE(基建成本,而 DEV 部署先一個禮拜)
- **分類**:Phase 而唔係 Change —— 觸發 H1 要 ADR,前後端都要改

### 三個查證結果值得記低

**① mockup 真係有完整設計,唔係要從零諗。** `IT Ops Platform.dc.html:1444-1450` 五步 + `:1347-1355` 七個失敗場景。⇒ **設計問題已經答咗一半,而冇人知佢喺度。**

**② 🔴 但 mockup 同實際對唔齊,而個差異啱好就係今個禮拜實測撞到嗰個。** mockup 個 `precheck` 把 OpCo budget 同 tenant seat 合併成一步;實際係兩層兩道 gate。2026-08-07 撞嘅正正係 tenant 嗰層(`POWER_BI_PRO` `prepaidEnabled=0`)而 OpCo budget 係綠(`80/90`)—— **合併就講唔出係邊層擋住**,而兩者下一步完全唔同(叫採購買 vs 加 allocation)。

⇒ **照抄 mockup 會做出一個講唔出真相嘅畫面。** 十步清單(plan §3)就係為咗呢個。

**③ `ticket: skipped` 係 mockup 冇、但我哋而家最需要嗰格。** line item 冇 RITM 就 fallback 去 parent REQ 加 work note,**冇任何嘢被 complete** —— 而呢個分別今日 UI 完全睇唔到,正正係 W44 F7-12 追緊嗰個問題。⇒ 本 phase 順帶把佢由「要靠推理」變成「畫面上一行字」。

### 🔴 已知最危險嗰條(plan R1)

改契約會令前端 `onError` 讀唔到 `message` ⇒ **錯誤訊息變空白**。呢個係典型「紅得靜」:test 全綠、build 綠、畫面出得到,只係出咗個空白。⇒ checklist F1-2 要求**呢條 test 先寫兼且 fails-before 實證**。

### Blockers

- 🔴 **ADR-0029 仍係 Proposed** —— H1 gate 未過,一行 code 都唔可以寫
- 🔴 **W44 未收官** —— rolling JIT 唔可以兩個 phase 同時 active
- ⚠️ live 驗(G11)要一個 tenant 有剩 seat 嘅 SKU:W43 已查證 = `POWERAUTOMATE_ATTENDED_RPA`,**要先加 `allocated`**

### Commits

- `6ed496b` — `docs(planning): W45 assign 過程可見性 plan + ADR-0029;CH-021 intake 通知 spec`(同一個 commit 帶埋 CH-021 spec,因為兩件都係 2026-08-09 同一輪端到端對帳揭出嚟)
- `a13ba95` — `feat(fulfilment): ADR-0029 step 契約型別(純新增,零行為改動)`
- `10cc83d` — `feat(fulfilment): ADR-0029 AssignResult DTO + OpenAPI shape(仍未接 controller)`

---

## Handoff — 2026-08-10(寫畀下一個 session,直接開工用)

### 而家喺邊

| | |
|---|---|
| **ADR-0029** | ✅ **Accepted**(Chris 2026-08-10)⇒ H1 gate 過 |
| **W45 plan / checklist** | ✅ 已備(`6ed496b`) |
| **Code** | 🟡 **契約型別 + DTO 已落**(`assign-step.ts` · `dto/assign-result.dto.ts`)—— **兩個都刻意停喺「宣告」冇到「使用」**:冇任何 controller 返 `AssignResultDto` ⇒ **response contract 到而家一個字未變**。**gate 邏輯 / 前端全部未郁** |

### ✅ 已做:七道閘數清楚(handoff 講嘅起手點)

對住 `assign.service.ts` 逐行數,**ADR-0029 初版七個 key 同實際完全對得上**,唔使改:

| # | line | 條件 | key |
|---|---|---|---|
| 1 | 129 | `stage !== READY` | `stage` |
| 2 | 135 | `!azureSyncedAt` | `sync-azure` |
| 3 | 155 | `!serviceNowUserSyncedAt` | `sync-servicenow` |
| 4 | 167 | Graph `findUser` 返 null | `directory` |
| 5 | 174 | `!usageLocation` | `usage-location` |
| 6 | 204 | `overBudget && !overrideReason`(帶 override 分支 + `holdTicket` 副作用) | `budget` |
| 7 | 231 | `!tenantSku \|\| consumed >= prepaid` | `seats` |

⚠️ line 120-128 個 `budgetOverrideReason cannot be blank` **唔算 gate** —— 佢係輸入驗證,唔應該佔一個 step。

🟢 **順帶實證咗 mockup 嗰個爭議**:gate 6 同 7 中間隔住 `budgetOverridden` 計算 **同一次 `listTenantSkus()` 網絡呼叫** ⇒ 兩層係實實在在分開,mockup 把佢哋合併成一個 `precheck` 就真係講唔出邊層擋住。型別檔已把「唔可以合併」寫成註釋鎖住。

### 跟住做(次序有意義)

1. ✅ **已做**(`10cc83d`)—— `AssignResult` 落 DTO + OpenAPI。⚠️ 途中一個唔起眼但要記住嘅決定:三個 union type 改成 **const-derived**(`ASSIGN_STEP_STATUSES` / `ASSIGN_STEP_OWNERS` / `ASSIGN_OUTCOMES`),因為 Swagger 個 `enum:` 要一個 **runtime array**,手寫多一份 literal 就會同 type drift **而 TypeScript 完全捉唔到** ⇒ OpenAPI 會公佈一個同實際型別唔一致嘅 schema 而所有 test 照綠。**又一個「唔會紅嘅錯」。**
   - 另外三個刻意決定:①**冇 class-validator decorator**(response-only DTO,加咗會讀成「有驗證跑緊」但實際冇)②`detail` 個 description 寫明 PII-scrubbed **但同時註明 schema 強制唔到**,免得下手以為安全 ③失敗之後嘅 step 係「**缺席**」唔係 `skipped` —— 佢哋從來冇被評估過
2. 🔴 **分水嶺 —— 唔好喺 context 淺嘅時候開**。`assign.service.ts` 逐道閘改成 append step 而唔係即刻 throw。佢會**同時**改成功回應同 400 body,令既有 test 大批紅,而且要逐道閘補 step assertion(H5)。**唔係一個做一半停得低嘅單元** —— 前面兩步刻意停喺「宣告」就係為咗令呢一步之前嘅任何時刻都可以收手
3. `detail` 經 `scrubPii` + test 守住(BUG-004 同形狀)
4. 400 body 形狀變 → 前端 `onError` 同步改,否則錯誤訊息變空白
5. 前端 steps 畫面

⚠️ 2026-08-10 嗰日全日做咗**另一條線**(INTAKE-REQUESTER → ADR-0030 → CH-022 → DEV 部署 #3),W45 一直冇動過。唔好以為有半成品。

### 起手點:step 清單要先喺 plan 定死

**ADR-0029 只 lock 咗一條原則:「一步一 gate,唔合併」。** 佢初版點名七個 gate key(`stage` · `sync-azure` · `sync-servicenow` · `directory` · `usage-location` · `budget` · `seats`)加副作用三個(`assign` · `ledger` · `ticket`),但明文寫住**最終清單喺 W45 plan 定死**。

⇒ **第一件事係對住 `assign.service.ts:129-235` 逐道閘數返**,確認七個 key 同實際 gate 一一對應,唔好照抄 ADR 個初版清單。

### 🔴 兩個「紅得靜」陷阱(ADR Consequences 已列,呢度重申因為佢哋唔會令 test 紅)

1. **400 body 形狀變** —— 今日前端 `onError` 直接讀 `message`(`request-detail.tsx:763-772`)。改完契約如果冇同步處理兩種形狀,**錯誤訊息會變成空白**:畫面睇落「失敗咗但唔講點解」,而 test 全綠。
2. **step `detail` 會夾帶 PII** —— `sync` / `directory` 兩步嘅底層 vendor error 可能含 UPN(**BUG-004 同一形狀**)。`detail` **必須經 `scrubPii`**,而且要有 test 守住。

### ⚠️ 既有 test 唔可以「順手改 assert 就當過」

`assign.service.spec.ts` 大量 assert exception message。契約一改佢哋會紅 —— 但**逐條改到綠唔等於守住咗新契約**。H5 critical path:**每道 gate 都要有對應嘅 step assertion**。

💡 今日 CH-022 撞過一條**假綠**值得記住:我寫嘅 test assert「`submit` 冇被 call」,但當時冇 mock line items,而條 code 喺冇 line 嗰陣本來就 early-return ⇒ **斷言因為錯嘅理由通過**。改契約嘅 test 特別容易出呢種。

### 本地環境現況(2026-08-10 起返,可以即刻驗)

- postgres **5433** / redis **6379** / api **3100** / web **5173** —— 全部跑緊,三個 endpoint 真 200 驗過
- ⚠️ **本地 DB 係當日新建**(舊 volume 連 container 一齊冇咗),19 migration + seed 24 OpCos 已跑
- ⚠️ **`LOCAL_ADMIN_INITIAL_PASSWORD` 未設** ⇒ 登入表單登唔到,靠 `.env` 個 `AUTH_DEV_BYPASS=true` 頂住。要驗 per-user 行為就要 `start-detached.ps1 -DisableAuthBypass`
- ⚠️ **port 5433 同 `ai-doc-extraction-db` 有衝突** —— 當日停咗佢五個 container 先起到 UOP。佢一 `docker start` 就會再搶 5433。長遠解法見當日討論(搬佢個 host port)

### 相關檔案

- `apps/api/src/fulfilment/assign.service.ts:129-235`(七道閘)· `:338-363`(SN 回寫兩條路)
- `apps/web/src/pages/request-detail.tsx:763-772`(現況一個 toast)· `apps/web/src/hooks/mutations.ts`(唯一 caller)
- `design_handoff_licenseops/prototype/IT Ops Platform.dc.html:1343-1355, 1443-1452`(mockup 五步 + 七場景)
- 🔴 **mockup 同實際對唔齊**:mockup 個 `precheck` 把 **OpCo budget** 同 **tenant seat** 合併成一步,實際係兩層兩道 gate。2026-08-07 DEV 實測**兩層都撞過**(log:`OpCo budget gate blocked … 0/0` 同 `… 100/90`)⇒ 合併就講唔出係邊層擋住,而兩者下一步完全唔同(叫採購買 vs 加 allocation)

### 唔屬 W45 但會一齊見到嘅事

- **CH-021**(intake 通知)同屬 W45 範圍,但 **`ACS_SENDER_ADDRESS` 喺 DEV 仍然係空** ⇒ 寫完驗唔到。建議 ADR-0029 先行
- **CH-022 A7** 仍然欠 live 驗證,而佢卡喺 **B8**(private DNS 完全冇配,兩個 hostname 都打唔到 —— 2026-08-10 更正)

---

## Day 1 — 2026-08-10（後端契約落地:F1 + F2 大部分）

### 做咗乜

| Commit | 內容 | Checklist |
|---|---|---|
| `a13ba95` | `assign-step.ts` —— 契約型別,**純新增零行為改動** | F1-3 · F1-5 |
| `10cc83d` | `dto/assign-result.dto.ts` + OpenAPI shape,**仍未接 controller** | F1-4 |
| `ef7ca97` | 七道閘 + 三個副作用改成 append step;controller 返 `AssignResultDto` | F2-1…F2-10 |

**分三個 commit 唔係為咗靚**:前兩個停喺「宣告」⇒ response contract 一個字未變,任何一刻收手都唔會留低半成品。真正嘅分水嶺淨係 `ef7ca97` 一個。

### 三個途中發現,每個都改咗做法

**① 保留 `message` 令既有 test 只紅一條(預期係「大批紅」)。** 原因:所有 `toThrow(/…/)` 嘅 assert 都靠 `message`,而我冇攞走佢。ADR-0029 Consequences 把「錯誤訊息變空白」列為**最大風險**,而保留一個欄就直接消除咗 —— 順帶保住幾十條 test 嘅覆蓋。**呢個決定嘅性價比高過預期一個數量級。**

**② `ApiError.detail` 一早就載住成個 parsed body** ⇒ 前端攞 `steps` / `whoFixes` **唔使改 `api.ts` 一行**。開工前我以為要改 transport 層。

**③ 唯一真正紅嗰條(`toEqual({id, stage})`),紅得啱。** 佢係「SN 回寫失敗仍然成功」嗰條 —— 主題正正係 **failure isolation**,而 ADR-0029 令佢由「靠推理」變成「睇得見」。⇒ 冇淨係改到綠,而係**加咗 step assertion**(`ticket: failed` + `assign`/`ledger: ok`)。

### 一個刻意收窄嘅宣稱

`ticket` step 成功路徑寫 **`RITM close requested`**,唔係 `closed`。因為 `writeTicket` 係 non-fatal(ADR-0011 I1):被拒會入 Delivery failures 但照樣返到嚟。講成「已 close」就係 **W44 F7-12 花咗兩日推翻嘅嗰種過度宣稱**,Delivery failures 先係真相。

### 🔴 R3 Deviation —— 兩個保守補充(相對 ADR-0029 / plan 原文)

| # | Deviation | Reason |
|---|---|---|
| D-a | **400 body 保留 `message`** —— ADR 個 JSON 例子只有 `{outcome, failedAt, steps}` | 消除 plan R1(錯誤訊息變空白)。成本 = 一個欄;收益 = 冇任何一刻 UI 靜靜地失去錯誤文字 |
| D-b | **200 body 保留 `lineItem`** —— ADR 講 return `AssignResult` | 同上理由:讀 line item 嘅 caller 繼續行得,冇「response 合規但對佢冇用」嘅中間狀態 |

兩個都係 **加欄唔係改欄**,向前兼容,唔影響 ADR-0029 D1 嘅原則。

### 🔴 未做完(帶落 Day 2)

- **F2-11 嘅 test 部分** —— `scrubPii` **code 已落**(`fail()` 同 ticket 失敗路都經咗),但 **G4 專屬 test 未寫**。⚠️ plan 要求 test 先行,實際做成 code 先行 ⇒ **fails-before 已經證唔到**,Day 2 補嗰條 test 要用**故意拆走 `scrubPii` 睇佢紅**嘅方式補回實證
- **`budget: overridden` 未實作** —— plan §3 第 6 行寫明 status 可以係 `overridden`,但 `ef7ca97` 一律 `pass('budget')` 出 `ok`,`ASSIGN_STEP_STATUSES` 亦只有三個值 ⇒ **G6 而家收唔到貨**,而且前端根本冇嘢可以顯示。Day 2 第一件事
- **F0-5 branch `feat/w45-assign-progress` 冇建** 🚧 —— 全部 W45 commit 落咗 `feat/w44-azure-dev-deploy`。理由:W44 未 merge,另開 branch 會令 W45 起喺一個未落地嘅 base 上面。**唔追溯改**(rebase 會令上面三個 hash 全部失效),W44 merge 之後再處理

### 測試

| | |
|---|---|
| api | **908 passed / 69 suites**(905 → 908,新增 3 條守 step 契約) |
| lint / tsc | root lint `exit 0` · api + web tsc 都 `0` |
| web | ⚠️ **6 failed** —— `localStorage.clear is not a function`。**已用 `git stash` 實測 baseline 一模一樣 ⇒ pre-existing,唔係本 phase 造成** |

⚠️ 嗰 6 條係一個**真問題**,只係唔屬 W45:`package-lock.json` 喺開工前就已經 modified,今早 `npm install` 套用咗 —— 高度懷疑係嗰次 dependency 更新嘅副作用。**未查證,唔可以當結論。**

### Commits

- `a13ba95` · `10cc83d` · `4efb608`(第 1 步收尾)· `ef7ca97`(分水嶺)· `6ba1ce3`(本 Day-1 回填)

---

## Day 2 — 2026-08-10（`budget: overridden` + 兩條 fails-before + 前端 steps 畫面）

### 🔴 開工第一件事係一個由回填揭出嚟嘅落差

寫 Day 1 progress 嗰陣先發現 **plan §3 第 6 行寫明 `budget` 可以係 `overridden`,而 `ef7ca97` 一律出 `ok`** —— `ASSIGN_STEP_STATUSES` 只有三個值。⇒ G6 收唔到貨,而且**前端根本冇嘢可以顯示**。

順帶揭到第二件:**ADR-0029 個檔一直寫住 `Proposed`**。handoff 講咗「Chris 2026-08-10 Accepted」,但**冇人改過檔**,README index 一樣。⇒ 打勾聲稱同真改檔係兩件事,呢次係後者一直缺。

💡 **回填 progress 本身就係一種 audit** —— 呢兩個落差唔係寫 code 撞返出嚟,係逐項對 plan 打勾嗰陣先浮面。

### 做咗乜

**後端**
- `ASSIGN_STEP_STATUSES` 加第四個值 `overridden`。理由同 `skipped` 一模一樣:gate **的確拒絕過**,係有人負責任咁行過去。報做 `ok` 會抹走 ADR-0016 R4 唯一靠住嘅事實 —— 「override used」必須代表 allocation 真係爆咗
- 🔴 **H4**:`budget.detail` 只帶數字 + SKU,**唔回顯 `overrideReason`**。嗰句係 admin 打嘅 free text,已經有 timeline + audit 兩個更窄嘅 surface,冇理由再放上 API response
- 順手修正兩處已經變成謊話嘅註釋:`failedAt` 唔再係「第一個非 ok 嘅 step」(成功路都可以帶 `skipped` / `overridden`),DTO 個「🔴 NOT wired to the controller yet」`ef7ca97` 已經接咗

**前端**(`components/requests/assign-result-dialog.tsx`,新)
- 十步 → UI 摺做 **Pre-flight(七道閘)+ 三個副作用逐個**(plan §3.2)。**API 永遠逐個報,摺疊純粹係顯示決定**
- 🔴 **成功同失敗行同一個 dialog**。淨係失敗先開就會令 `ticket: skipped` 喺成功路睇唔到 —— 而嗰格正正係 W44 F7-12 追咗兩日嗰個問題
- **失敗時 pre-flight 預設展開**:摺住就會冚住佢開嚟睇嗰一行
- **步驟之後嘅步驟唔畫 placeholder row**。契約講明佢哋係「缺席」唔係 `skipped`,畫個灰 row 出嚟就等於話「評估過」

### 三個對住 prototype 嘅刻意偏離(每個都係其他文件早就決定咗,唔係喺呢度新發明)

| # | prototype | 我哋 | 出處 |
|---|---|---|---|
| 1 | 逐步 animate「running」 | 一次過連 response 返 | ADR-0029 A2 否決 SSE ⇒ 扮一個 server 從來冇報過嘅 timeline = 作嘢 |
| 2 | 失敗有 `Retry` 掣 | 冇 | plan §2.2 明文 out-of-scope + DS-3 一 view 一 primary |
| 3 | 五步、`precheck` 合併 budget/seats | 十步、兩層分開 | plan §3.1 —— 2026-08-07 DEV 兩層都撞過,補救完全唔同 |

### `ui-design` skill 自檢(F3-6)

DS-1 ✅(全部 token / Tailwind theme;`rounded-lg` = 8px **token**,冇跟 prototype 個未 tokenize 嘅 inline `9px`)· DS-2 ✅ 但要記低:`pl-[27px]` 係 **16px icon + 11px gap 兩個 handoff 值加出嚟**,唔係憑感覺;`max-h-[46vh]` 係 scroll 上限唔係設計值 · DS-3 ✅(有 test 數死一個 primary)· **DS-4 ❌** · DS-5 **本來 ❌ 已改**(「7 checks passed」個數字轉咗 mono,對齊既有 `Step 2/3` 同 OpCo budget 嘅做法)· DS-6 ✅ 全 lucide stroke · DS-7 ✅ 冇新陰影 / gradient · DS-8 ✅ 只用六個 semantic tint(step 用 icon 唔用 Badge = 跟 prototype) · DS-9 ✅ 零新 animation · DS-10 ✅ · **DS-11 ❌** · DS-12 N/A

🔴 **兩條 ❌(DS-4 light+dark / DS-11 對住 prototype 睇)係同一件事 = F3-7,而佢做唔到**:本機 stack 冧咗,**port 5433 畀 `ai-doc-extraction-db` 佔返**(`docker ps` 實測)⇒ 要停另一個項目五個 container 先起得返,**呢個要 Chris 批**。

### 兩條 fails-before,兩條都真跑過

1. **G4(`scrubPii`)** —— 真拆走 `scrubPii` 跑一次:條 test 紅,而 received string 就係原本會外洩嗰句 `Resource '/users/new.user@rhk.com' …`。還原後綠
2. **G5(前端)** —— 把 `AssignResultDialog` 整個 render 掉:**10 條入面 8 條紅**。剩低 2 條啱啱好係唯二**唔應該**依賴 dialog 嗰兩條(純負面斷言「冇畫未行到嘅步驟」+ 無 steps 走 toast fallback)⇒ 證明個 suite 唔係結構性空轉

⚠️ 兩條都係**後補**,唔係 plan 要求嘅 test-先行。plan F1-1 / F1-2 寫明先寫 test —— 實際做成 code 先行,所以要用「拆走實作睇佢紅」補返實證。**下次同類 R1 風險應該真係先寫。**

### 測試 / 檢查

| | |
|---|---|
| api | **911 passed / 69 suites**(908 → 911) |
| web | **286 passed**(276 → 286);⚠️ **6 條 pre-existing 紅**(`localStorage.clear is not a function`)—— `git stash` 實測 baseline 一模一樣 |
| tsc | api `0` · web `0` |
| lint | root(= api)`exit 0`;web 我改嗰 5 個檔 `exit 0` |

⚠️ **兩個唔屬本 phase 但要講嘅事**:①`npm run lint`(root)**只 lint api** —— web 要另跑,而 web **本身就紅住 16 條 prettier**(`allocation-reset*` 15 + `sync-check.test` 1)。我只 `--fix` 咗自己嗰 5 個檔,無關嗰 16 條冇掂 ②嗰 16 條 prettier 同嗰 6 條紅 test 都指向同一個嫌疑:開工前就已經 modified 嘅 `package-lock.json`。**未查證,唔可以當結論。**

### Commits

- `6ba1ce3` — `docs(planning): W45 Day 1 — 後端契約落地回填 + ADR-0029 真改 Accepted`
- `f358886` — `feat(fulfilment): ADR-0029 前端 steps 畫面 + budget: overridden`

---

## Day 2(續)— F2-12:七道閘逐個一條 test

### 做法

共用一個 `expectBlockedAt(key, whoFixes, retryable)`,**每條 assert 四件事**,因為淨係 assert `failedAt` 係三者之中最弱嗰個:

1. body **點名**嗰道閘
2. 之前每一道報 `ok` —— **呢個先令個 list 變成證據**(「行到 budget,即係兩個 sync 都冇事」)
3. 之後**一個都唔出現** —— 從來冇被評估過嘅 step 必須缺席,唔可以報 `skipped`
4. `detail` 非空 + 冇 email pattern(BUG-004 個網)

🔴 **七條全部由 `arrangeHappy()` 起手,再只閂一樣嘢。** 唔咁做嘅話斷言會因為**早一道閘擋咗**而通過 —— 就係 CH-022 撞過嗰種假綠。

### 兩個 falsification,兩個都真跑過

我喺 helper 註釋寫咗一個**具體 claim**:「expected prefix 由 `ASSIGN_GATE_KEYS` 推導唔係 tautology,因為 `assign.service.ts` 從來冇讀過嗰個 array —— 佢係手寫順序跑閘,所以 contract order 同 runtime order 一唔夾就會紅」。呢句唔可以就咁寫落去:

| 改咗乜 | 結果 |
|---|---|
| `ASSIGN_GATE_KEYS` 對調 `directory` / `usage-location` | **4 條紅**(對調嗰對 + 之後全部,因為 prefix 變咗)⇒ claim 成立 |
| `fail('directory', …)` 個 owner 由 `identity` 改做 `platform` | **只有 1 條紅**,正正係 `directory` 嗰條 ⇒ 每條 test 真係只認自己嗰道閘,冇互相蓋住 |

兩個都已還原。

### 順帶:`seats` 嗰條專登寫成「budget 綠但 seats 紅」

`arrangeHappy()` 留咗 headroom,所以嗰條 test 入面 **budget step 係 `ok` 而 seats 先失敗** —— 呢個就係 **2026-08-07 DEV 實際撞到嗰個形狀**,亦正正係 mockup 個合併 `precheck` 講唔出嘅嘢。

### 測試

| | |
|---|---|
| api | **917 passed / 69 suites**(911 → 917,+6) |
| tsc / lint | api tsc `0` · root lint `exit 0` |
