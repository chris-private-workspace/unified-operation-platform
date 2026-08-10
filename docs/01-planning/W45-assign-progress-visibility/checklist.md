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
- [ ] F4-4 🔴 **live 驗**:DEV 真撳一次失敗 + 一次成功(G11)—— SKU 用 `POWERAUTOMATE_ATTENDED_RPA`(W43 查證,要先加 `allocated`)
- [ ] F4-5 BACKLOG `ASSIGN-PROGRESS` 標完成(R7)
- [ ] F4-6 CLAUDE.md §0/§9 座標掃一次 + `SESSION_SUMMARY.md` 同步
