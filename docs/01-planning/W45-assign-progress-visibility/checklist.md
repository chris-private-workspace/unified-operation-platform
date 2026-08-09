# W45 — Assign 過程可見性 · Checklist

> **Status**: `draft` —— plan 未 approve,ADR-0029 未 Accepted ⇒ **F1 以下一律唔可以開工**(PROCESS R1)。

## F0 — 開工 gate

- [ ] F0-1 🔴 **ADR-0029 由 Proposed → Accepted**(H1;Chris 拍板)
- [ ] F0-2 `plan.md` status `draft` → `active`
- [ ] F0-3 W44 收官(rolling JIT:唔可以兩個 phase 同時 active)
- [ ] F0-4 `docs/adr/README.md` index 加 ADR-0029 一行
- [ ] F0-5 建 branch `feat/w45-assign-progress`

## F1 — 契約(test 先行)

- [ ] F1-1 🔴 **G4 先寫**:餵含 UPN 嘅 vendor error → assert `detail` 冇 email pattern(**fails-before 要實證**)
- [ ] F1-2 🔴 **G5 先寫**:前端收到新形狀 → assert 錯誤訊息**唔係空白**(fails-before)
- [ ] F1-3 定義 `AssignStepDto`(`key` / `status` / `detail` / `retryable` / `whoFixes`)
- [ ] F1-4 定義 `AssignOutcomeDto`(`outcome` / `failedAt` / `steps[]`)
- [ ] F1-5 `whoFixes` 做 enum 唔做 free text(`procurement` / `admin` / `entra-admin` / `wait` / `none`)

## F2 — 後端十步

- [ ] F2-1 `stage`(`:129`)
- [ ] F2-2 `sync-azure`(`:135`)
- [ ] F2-3 `sync-servicenow`(`:155`)
- [ ] F2-4 `directory`(`:164`)
- [ ] F2-5 `usage-location`(`:174`)
- [ ] F2-6 `budget`(`:188-222`)—— 🔴 含 `overridden`,而且 **G6:預算充足時唔可以出現**
- [ ] F2-7 `seats`(`:229-235`)
- [ ] F2-8 `assign`(`:240`)
- [ ] F2-9 `ledger`(`:270-336`)
- [ ] F2-10 `ticket`(`:338-363`)—— 🔴 含 `skipped`(冇 RITM)
- [ ] F2-11 🔴 **`detail` 全部經 `scrubPii`**
- [ ] F2-12 🔴 **逐個 gate 一條 test assert `failedAt`**(H5,唔可以一條 test 覆蓋多個)
- [ ] F2-13 🔴 **G2:成功路徑 assert provider 呼叫次數同改動前一模一樣**(證冇多做副作用)
- [ ] F2-14 🔴 **R4 檢查:對 `assign.service.ts` gate 段落做 diff,確認擋唔擋嘅邏輯零改動**

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
