# W45 — Assign 過程可見性 · Checklist

> **Status**: `active`(2026-08-10)—— ADR-0029 Accepted,F1 / F2 大部分已落地。逐項狀態見下。

## F0 — 開工 gate

- [x] F0-1 🔴 **ADR-0029 由 Proposed → Accepted**(H1;Chris 2026-08-10 拍板)
- [x] F0-2 `plan.md` status `draft` → `active`
- [ ] F0-3 W44 收官(rolling JIT:唔可以兩個 phase 同時 active)—— 🚧 **W44 卡環境**(F6 卡 B8 private DNS · F9 卡 B9 · F8 closeout 未做),而 W45 係純 code、零部署依賴 ⇒ Chris 2026-08-10 直接指示開工。**Target:W44 一解封即收官**
- [x] F0-4 `docs/adr/README.md` index 加 ADR-0029 一行
- [ ] F0-5 建 branch `feat/w45-assign-progress` —— 🚧 **全部 W45 commit 落咗 `feat/w44-azure-dev-deploy`**。理由:W44 未 merge,另開 branch 會令 W45 起喺一個未落地嘅 base。**唔追溯 rebase**(會令已寫入 progress 嘅三個 hash 全部失效)。**Target:W44 merge 後**

## F1 — 契約(test 先行)

- [x] F1-1 🔴 **G4**:餵含 UPN 嘅 vendor error → assert `detail` 冇 email pattern —— ⚠️ 實際做成 **code 先行**,所以補做咗 fails-before:**真拆走 `scrubPii` 跑一次**,條 test 紅,received string 就係 `Resource '/users/new.user@rhk.com' …`,再還原
- [x] F1-2 🔴 **G5**:前端收到新形狀 → assert 錯誤訊息**唔係空白** —— 同樣後補 fails-before:把 `AssignResultDialog` 整個 render 掉,**10 條入面 8 條紅**;剩低 2 條啱啱好係唯二唔應該依賴 dialog 嗰兩條(純負面斷言 + 無 steps 嘅 toast fallback)⇒ 證明 suite 唔係結構性空轉
- [x] F1-3 定義 `AssignStepDto`(`key` / `status` / `detail` / `retryable` / `whoFixes`)
- [x] F1-4 定義 `AssignOutcomeDto`(`outcome` / `failedAt` / `steps[]`)—— 實名 `AssignResultDto`(對齊型別檔嘅 `AssignResult`)
- [x] F1-5 `whoFixes` 做 enum 唔做 free text —— 最終六個:`operator` / `admin` / `identity` / `servicenow` / `procurement` / `platform`(**R3**:plan 原本寫 `entra-admin` / `wait` / `none`,改成按**邊隊人**分而唔係按動作分,因為 `wait` / `none` 答唔到「搵邊個」)

## F2 — 後端十步

- [x] F2-1 `stage`
- [x] F2-2 `sync-azure`
- [x] F2-3 `sync-servicenow`
- [x] F2-4 `directory`
- [x] F2-5 `usage-location`
- [x] F2-6 `budget` —— `overridden` 已加入 `ASSIGN_STEP_STATUSES`(第四個值),兩條 test 守住:override 路出 `overridden`、預算充足時就算帶 reason 都仍然係 `ok`。🔴 **H4**:`detail` 只帶數字 + SKU,**唔回顯 `overrideReason`**(admin 打嘅 free text,已經有 timeline + audit 兩個更窄嘅 surface)
- [x] F2-7 `seats`
- [x] F2-8 `assign`
- [x] F2-9 `ledger`
- [x] F2-10 `ticket` —— 含 `skipped`(冇 RITM 又冇 parent mirror)同 work-note fallback 嘅 `ok`
- [x] F2-11 🔴 **`detail` 全部經 `scrubPii`** —— code(`fail()` + ticket 失敗路)+ test(= F1-1)齊
- [x] F2-12 🔴 **逐個 gate 一條 test assert `failedAt`**(H5,唔可以一條 test 覆蓋多個)—— 七道閘七條,共用 `expectBlockedAt(key, whoFixes, retryable)`。**每條 assert 四件事**:①body 點名嗰道閘 ②之前每一道報 `ok`(呢個先令個 list 變成證據)③之後**一個都唔出現** ④`detail` 非空 + 冇 email pattern。🔴 **全部由 `arrangeHappy()` 起手再只閂一樣嘢** —— 唔咁做嘅話斷言會因為早一道閘擋咗而通過(CH-022 撞過)
- [x] F2-13 🔴 **G2:成功路徑 assert provider 呼叫次數同改動前一模一樣**(證冇多做副作用)—— 成功路徑 step 順序 test 涵蓋;既有 `arrangeHappy` 系列一條唔跌 = 呼叫次數不變嘅實證
- [x] F2-14 🔴 **R4 檢查:對 `assign.service.ts` gate 段落做 diff,確認擋唔擋嘅邏輯零改動** —— 每道閘只係 `throw new BadRequestException(str)` → `fail(key, str, who)`,條件式一個字未郁

## F3 — 前端

- [x] F3-1 step 顯示 component(#1-#7 摺做「Pre-flight」,#8-#10 逐個)—— `components/requests/assign-result-dialog.tsx`。**成功同失敗行同一個 dialog**:淨係失敗先開,就等於成功嗰陣仍然睇唔到 `ticket: skipped`
- [x] F3-2 失敗步驟高亮 + `whoFixes` 文案 —— 失敗嗰步 danger tint + `CircleAlert`;pre-flight 撞牆時**預設展開**(摺住就會冚住佢開嚟睇嗰行)
- [x] F3-3 🔴 `onError` 同時處理舊 `{message}` 同新形狀(G5)—— 有 steps 開 dialog,冇 steps(403 / 500 / 斷線)照 toast `message`
- [x] F3-4 `ticket: skipped` 明確講出嚟 —— 獨立 `CircleMinus` + neutral tint + 原句 detail;`ok` 路寫 **`RITM close requested`** 唔係 `closed`
- [x] F3-5 🔴 一個 view 一個 primary(H6)—— dialog 得一個 `Done`,有 test 數 `[role=dialog] button.bg-accent` === 1。**冇 Retry 掣**(plan §2.2 明文 out-of-scope)
- [x] F3-6 跑 `ui-design` skill(H6)—— 12 條逐條行過,詳見 progress Day 2;唯一改到嘢係 DS-5(count 轉 mono),2 條 ❌ 全部係 F3-7 嗰件事
- [x] F3-7 🔴 light + dark 真 render 驗(G10)—— Chris 2026-08-10 批咗停 `ai-doc-extraction` 五個 container 放返 5433。**四張截圖**(blocked light / blocked dark / success dark / success light + 展開)。DS-4 / DS-11 收返 ✅。🔴 **而呢一驗即刻揭咗一個所有 test 都捉唔到嘅 bug —— 見 F3-8**
- [x] F3-8 🆕 🔴 **`apiPatch` 從來冇帶 `detail`** —— 佢自己 hand-roll `new ApiError(status, message)`,冇第三個參數(只有 `errorFrom` 會帶 body,而 `apiPatch` 從來冇用過佢)⇒ **ADR-0029 個 steps 喺瀏覽器永遠到唔到前端,dialog 一世開唔到**。api test 綠 / web test 綠 / tsc 0 / lint 0 —— 因為 UI test **自己手砌 `ApiError` 連 detail**,永遠踩唔到真 transport。修:`apiPatch` 改行 `errorFrom`(同 `apiPost` 一樣,佢由 CH-019 起就帶住 body);補两條 **transport 層** test,並**真試過**改返舊寫法 → 新 test 紅

## F4 — 收尾

- [x] F4-1 OpenAPI 反映新形狀(G8)—— `AssignResultDto` / `AssignStepDto` 掛咗 `@ApiOkResponse`,四個 `enum:` 全部 spread const array(唔手寫 literal)。⚠️ **只證到 code 層**:`/docs/api` runtime 未睇過(同 F3-7 一齊卡)
- [x] F4-2 root lint exit 0 · api + web tsc 0(G9)—— ⚠️ **`npm run lint`(root)只 lint api**;web 要另跑 `-w @uop/web`,而佢 **本身就已經紅 16 條 prettier**(`allocation-reset*` 15 + `sync-check.test` 1,全部同本 phase 無關)⇒ 我只 `--fix` 咗自己嗰 5 個檔,無關嗰 16 條**冇掂**
- [x] F4-3 既有 test 一條唔跌(G9)—— api **911 / 69 suites**(908 → 911)· web **286 passed**(276 → 286)。⚠️ web 另有 **6 條 pre-existing 紅**(`localStorage.clear is not a function`),`git stash` 實測 baseline 一模一樣
- [x] F4-4 ✅ **live 驗收咗**(2026-08-12,本機,Chris 批准真派一次 licence)—— SKU **`POWERAUTOMATE_ATTENDED_RPA`**,一次 session 內**撳三次收齊三條路**:

  | # | 局 | HTTP | `failedAt` | steps |
  |---|---|---|---|---|
  | 1 | 原 fixture(target = 砌出嚟嘅 `w45.render.check@…`) | **400** | **`directory`** | 4 步,`Target user not found in Azure AD` |
  | 2 | target 換成真人,冇 override | **400** | **`budget`** | 6 步,`0 assigned of 0 allocated` |
  | 3 | 同上 + ADMIN `budgetOverrideReason` | **200** | — | **10 步 · `outcome = assigned`** |

  第 3 撳完整十步真回傳:`stage/sync-azure/sync-servicenow/directory/usage-location` ok → **`budget: overridden`** → `seats: ok` → **`assign: ok`** → `ledger: ok` → **`ticket: skipped`**(`This line has no RITM and the request has no ServiceNow mirror`)。

  🟢 **一次過收埋兩個「從來未真驗過」嘅狀態** —— `progress.md:308` 記低四張截圖入面 `success`/`skipped`/`overridden` 係**攔截 PATCH 造出嚟**,唔係真回應。今次 `overridden` + `skipped` **兩個都係真回應**。
  🟢 **Graph 側獨立覆核**:`licenseDetails` 顯示 `user holds this SKU : true` ⇒ 唔係只信平台講。**移返之後 `false`,tenant `consumed 92 → 91`,零殘留。**
  🔴 **點解揀 override 唔揀補 ledger allocation**:`ledger/import` 走 CSV matrix 而且要 `businessAlias` 已 curate(ADR-0004),呢隻 SKU 冇 alias ⇒ 行唔通;手插 ledger row 就要再改一次 DB。**override 零額外資料改動,而且順帶把 `overridden` 由「攔截造出嚟」變成真回應** —— 換到嘅嘢比「七道閘全綠」多。
  ⚠️ **代價講清楚**:`budget` 因此**冇驗到 `ok` 分支**。佢有 unit test 蓋住,而且 1 號、2 號兩撳已證咗個閘真係擋(唔係擺設)。
  - [x] **F4-4a 部署** ✅ **2026-08-10 部署 #4(`dev-211001e`)** —— build host 就係開發嗰台機(egress IP 實測 `52.187.129.166`,同 B1 記低嗰個逐字一樣)。api `--0000006` / web `--0000003` 都 `Healthy` traffic 100,舊 revision 已退場;custom domain 完好。container log 原文證到 DB 通 + schema 最新 + seed 行到,零 `failed`。詳見 `docs/13-deployment/09-dev-as-built.md`
  - [x] **F4-4b 真撳** —— 🔴 **2026-08-11 拆兩半(Chris 拍板),因為兩半卡住嘅嘢唔同**。全套步驟見 **`docs/13-deployment/10-dev-live-verification-runbook.md`**
    - [ ] 🚧 **F4-4b-1 失敗路 @ DEV**(runbook **A5**)—— **仍然未做,而且 2026-08-12 之後理由變咗**:`B8` 已解封(custom domain 由呢台機打得通),所以**唔再係「冇路」**。佢淨低嘅價值係**單一而具體嘅一樣嘢**:400 body 捱唔捱得過真 ACA ingress + nginx proxy(同 `apiPatch` `detail` bug 同一族)。⚠️ **dialog 邏輯本機已 100% 真驗過**(今日再加三撳真 400/200),所以呢條**唔阻 W45 收官**,併入 W44 `F6` 一齊做
    - [x] **F4-4b-2 成功路 @ 本機**(runbook **B3**)✅ **2026-08-12 收咗**,見上面 F4-4 個表⚠️ **原本寫住卡 B8 係錯嘅**:`BACKLOG` `DEV-GRAPH-PLACEHOLDER` 行(2026-08-10 查證)證實 **DEV 個 `GRAPH_TENANT_ID` = 公司 M365 tenant `d1ea071a-…`,`GRAPH_CLIENT_ID` 同本機 `.env` 完全一致** ⇒ **兩邊同一個 tenant 同一個 Graph app,喺 DEV 撳同喺本機撳真派出去嗰個 licence 一模一樣** ⇒ 去 DEV 換唔到任何嘢返嚟,而本機仲快
      - 🔴 **順帶更正 F3-7 一個容易睇漏嘅界線**:嗰四張截圖入面,`success` / `skipped` / `overridden` **三個狀態係攔截 PATCH 造出嚟**(`progress.md:308`)⇒ **成功路到今日為止零真回應證據**,呢一格先係佢
  - 💡 **建議拆兩半**:**失敗路**用 allocation = 0 行 `budget` 閘(閘喺 tenant seat read 同 `assignLicense` 之前,有 test 釘住)⇒ **零副作用,可以放心做**,而且已涵蓋 dialog / 十步 / `whoFixes` / 400 body 過真 nginx+ACA ingress;**成功路**會喺公司 tenant **真派一個 licence**(CH-020 V5d 做過一次,留低咗一個冇收嘅 Power BI Free),要先揀定 target 同收拾方式
- [x] F4-5 BACKLOG `ASSIGN-PROGRESS` 標完成(R7)—— 標 🟢「實作完成 · 淨低 live 驗(卡 B8)」而**唔標 ✅ closed**(G11 未做)。順帶:`LINT-web` 更新真實數字(16 條)+ **新登 `WEB-TEST-JSDOM`**(6 條 pre-existing 紅 test,一直冇人追)
- [x] F4-6 CLAUDE.md §0/§9 座標掃一次 + `SESSION_SUMMARY.md` 同步 —— §0 Phase 行由「W43 收官」改成「W44 + W45 兩個同時未收」(舊值已 stale 六日);§9 加 W45 一格 + **三個本機避坑**(5433 硬衝突 · `nest --watch` build-cache 假綠燈 · **本機 Graph 通 ⇒ 真 assign 會派真 licence,fixture 要先用唯讀 sync-check 探**);`SESSION_SUMMARY` 座標由 2026-08-04 推到 2026-08-10,加 `apiPatch` 教訓 + 6 條 pre-existing 紅 test + web lint 16 條
