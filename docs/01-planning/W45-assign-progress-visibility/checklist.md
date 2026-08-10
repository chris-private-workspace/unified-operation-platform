# W45 — Assign 過程可見性 · Checklist

> **Status**: `active`(2026-08-10)—— ADR-0029 Accepted,F1 / F2 大部分已落地。逐項狀態見下。

## F0 — 開工 gate

- [x] F0-1 🔴 **ADR-0029 由 Proposed → Accepted**(H1;Chris 2026-08-10 拍板)
- [x] F0-2 `plan.md` status `draft` → `active`
- [ ] F0-3 W44 收官(rolling JIT:唔可以兩個 phase 同時 active)—— 🚧 **W44 卡環境**(F6 卡 B8 private DNS · F9 卡 B9 · F8 closeout 未做),而 W45 係純 code、零部署依賴 ⇒ Chris 2026-08-10 直接指示開工。**Target:W44 一解封即收官**
- [x] F0-4 `docs/adr/README.md` index 加 ADR-0029 一行
- [ ] F0-5 建 branch `feat/w45-assign-progress` —— 🚧 **全部 W45 commit 落咗 `feat/w44-azure-dev-deploy`**。理由:W44 未 merge,另開 branch 會令 W45 起喺一個未落地嘅 base。**唔追溯 rebase**(會令已寫入 progress 嘅三個 hash 全部失效)。**Target:W44 merge 後**

## F1 — 契約(test 先行)

- [ ] F1-1 🔴 **G4 先寫**:餵含 UPN 嘅 vendor error → assert `detail` 冇 email pattern(**fails-before 要實證**)—— ⚠️ **code 已落但 test 未寫,做成咗 code 先行** ⇒ 補嗰陣要**故意拆走 `scrubPii` 睇佢紅**先算有 fails-before 實證
- [ ] F1-2 🔴 **G5 先寫**:前端收到新形狀 → assert 錯誤訊息**唔係空白**(fails-before)—— ⚠️ 同上,`onError` code 已改但零 test
- [x] F1-3 定義 `AssignStepDto`(`key` / `status` / `detail` / `retryable` / `whoFixes`)
- [x] F1-4 定義 `AssignOutcomeDto`(`outcome` / `failedAt` / `steps[]`)—— 實名 `AssignResultDto`(對齊型別檔嘅 `AssignResult`)
- [x] F1-5 `whoFixes` 做 enum 唔做 free text —— 最終六個:`operator` / `admin` / `identity` / `servicenow` / `procurement` / `platform`(**R3**:plan 原本寫 `entra-admin` / `wait` / `none`,改成按**邊隊人**分而唔係按動作分,因為 `wait` / `none` 答唔到「搵邊個」)

## F2 — 後端十步

- [x] F2-1 `stage`
- [x] F2-2 `sync-azure`
- [x] F2-3 `sync-servicenow`
- [x] F2-4 `directory`
- [x] F2-5 `usage-location`
- [ ] F2-6 `budget` —— 🔴 **只做咗 `ok` / `failed`,`overridden` 未做**(`ASSIGN_STEP_STATUSES` 得三個值)⇒ **G6 收唔到貨**,前端亦冇嘢可顯示。**Day 2 第一件事**
- [x] F2-7 `seats`
- [x] F2-8 `assign`
- [x] F2-9 `ledger`
- [x] F2-10 `ticket` —— 含 `skipped`(冇 RITM 又冇 parent mirror)同 work-note fallback 嘅 `ok`
- [ ] F2-11 🔴 **`detail` 全部經 `scrubPii`** —— 🟡 **code 已落**(`fail()` + ticket 失敗路),**test 未寫**(= F1-1)
- [ ] F2-12 🔴 **逐個 gate 一條 test assert `failedAt`**(H5,唔可以一條 test 覆蓋多個)—— 🟡 而家得 `sync-servicenow` 一條,其餘六道閘只有舊嘅 message assert
- [x] F2-13 🔴 **G2:成功路徑 assert provider 呼叫次數同改動前一模一樣**(證冇多做副作用)—— 成功路徑 step 順序 test 涵蓋;既有 `arrangeHappy` 系列一條唔跌 = 呼叫次數不變嘅實證
- [x] F2-14 🔴 **R4 檢查:對 `assign.service.ts` gate 段落做 diff,確認擋唔擋嘅邏輯零改動** —— 每道閘只係 `throw new BadRequestException(str)` → `fail(key, str, who)`,條件式一個字未郁

## F3 — 前端

- [ ] F3-1 step 顯示 component(#1-#7 摺做「Pre-flight」,#8-#10 逐個)
- [ ] F3-2 失敗步驟高亮 + `whoFixes` 文案
- [ ] F3-3 🔴 `onError` 同時處理舊 `{message}` 同新形狀(G5)
- [ ] F3-4 `ticket: skipped` 要**明確講出嚟**(唔可以同 `ok` 一樣樣)——呢個係 F7-12 追緊嗰個資訊
- [ ] F3-5 🔴 一個 view 一個 primary(H6)—— step 面板唔可以加第二個 accent 掣
- [ ] F3-6 跑 `ui-design` skill(H6)
- [ ] F3-7 light + dark 真 render 驗(G10)

## F4 — 收尾

- [ ] F4-1 OpenAPI 反映新形狀(G8)
- [ ] F4-2 `npm run lint`(root)exit 0 · api + web tsc 0(G9)
- [ ] F4-3 既有 test 一條唔跌(G9)
- [ ] F4-4 🔴 **live 驗**:DEV 真撳一次失敗 + 一次成功(G11)—— SKU 用 `POWERAUTOMATE_ATTENDED_RPA`(W43 查證,要先加 `allocated`)
- [ ] F4-5 BACKLOG `ASSIGN-PROGRESS` 標完成(R7)
- [ ] F4-6 CLAUDE.md §0/§9 座標掃一次 + `SESSION_SUMMARY.md` 同步
