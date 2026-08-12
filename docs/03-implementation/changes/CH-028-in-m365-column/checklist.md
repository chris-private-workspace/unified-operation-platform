# CH-028 — Platform view 加 `In M365` 欄 · Checklist

> **Status**:實作收晒,🔴 **淨低 `F4-4` H6 真 render**(要起本機 stack)。
> spec = `spec.md`(`approved`,Chris 拍板 **D2-A** + **D3-B**)。

## F0 — 開工 gate

- [x] F0-1 spec draft(`proposed`)+ 兩個決定 present 畀 owner
- [x] F0-2 🔴 **D2 / D3 拍板** ⇒ spec `approved`(閘過咗先寫第一行 code,CH-026 先例)
- [x] F0-3 BACKLOG `ASSETS-IN-M365` 更新(R7)

## F1 — 後端（D3-B）

- [x] F1-1 `TenantSkuStatsDto` 加 `totalConsumed`,description **寫明 scope 同 `totalAssigned` 一樣、唔係 `totalOwned` 嗰個 prepaid-only**
- [x] F1-2 `tenantSkuStats()` 計 `Σ (tenantConsumed ?? 0)` across **all rows**
- [x] F1-3 🔴 **查證推翻咗 spec D3 一句(R3 已 log)** —— `license.controller.ts:251-255` **直接 return service object**,唔似 `IntegrationController` 逐個欄砌 ⇒ BUG-011 個縫喺呢條 route 唔存在。**DTO 照樣加**(佢係 OpenAPI 真相),但冇為一個唔存在嘅縫砌 controller test

## F2 — 前端

- [x] F2-1 `api-types.ts` `TenantSkuStats.totalConsumed`
- [x] F2-2 `tenant-skus.ts` — `CategoryGroup.subtotal.consumed`(**all rows**,同 `assigned` 同邊)+ 註釋講清兩個 scope 點解可以同行
- [x] F2-3 `platform-view.tsx` — header / row cell / grand total / subtotal / `colSpan` 6→**7**
- [x] F2-4 **D1 位置**:`Assigned` 之後、`Unalloc.` 之前(隔開就冇咗對比)
- [x] F2-5 **D4**:`tenantConsumed === null` → `—`(**唔係 `0`**)
- [x] F2-6 **D6** scope note:講明 `Assigned` 係平台自己嘅帳、`In M365` 係 tenant 上次 sync 報嘅數,差額由 Drift 跟進
- [x] F2-7 **冇色**:`Assigned` 係 info 因為佢係平台自己嘅數;呢欄留返同 `Owned` 一樣中性 —— **同源同色**

## F3 — Test

- [x] F3-1 api:`toEqual` 兩處加 `totalConsumed`(1590 / 0)
- [x] F3-2 api:**unlimited 那條加 `9089`**(1500 + 3064 + 4525)—— **一條 assert 同時證兩個相反 scope**(`totalOwned` 剔走 sentinel、`totalConsumed` 保留 consumed)
- [x] F3-3 api:新 test — never-synced 只貢獻 0(`1500`,唔係 `0`)
- [x] F3-4 web:`tenant-skus.test.ts` 三條 subtotal;其中兩條**特登唔用 0**(60 / 4925)—— 0-vs-0 分唔到「null 被跳過」同「成個 sum 空咗」
- [x] F3-5 web:`platform-view.test.tsx` 新 describe 三條(per-row + `—` · grand total vs subtotal **用唔同值** · D2 冇 delta)
- [x] F3-6 🔴 **Falsification 真跑真紅** —— 暫時加一個 delta 副行 ⇒ **只有 D2 嗰條紅(1 failed / 11 passed)**,有區分度兼零誤傷,之後還原
- [x] F3-7 🔴 **A6 硬證據** —— `git diff --numstat` 9 個檔,**冇一個係 `drift.tsx` 或 `reconcile.service.ts`** ⇒ Drift 頁一個字冇改
- [x] F3-8 `getByRole('columnheader')` 唔用 `getByText` —— scope note 而家都有「In M365」字樣,text query 會 match 兩次然後**因為錯嘅理由**通過

## F4 — 收尾

- [x] F4-1 api **1011 → 1012 / 73 suites** 全綠
- [x] F4-2 web **362 passed**;6 條紅逐個對得返 `WEB-TEST-JSDOM` 嗰 6 條(`local-profile` 5 + `reset-password` 1)⇒ **零新增**
- [x] F4-3 api tsc **0** · web tsc **0** · root lint **0** · web lint **19 → 16**(我加咗 3 條,prettier fix 返自己個檔;無關嗰 16 條冇掂,跟 W45 先例)
- [x] F4-4 ✅ **H6 收咗**(2026-08-12,Chris 批准停 `ai-doc-extraction-db`)
  - 🟢 **唔使造 fixture**(原本估要)—— 本機 catalog 一早 sync 過,**101 個 row 入面 70 個有真 `tenantConsumed`**,`totalConsumed = 25275`。⇒ **零 fixture = 零清理**
  - **light + dark 各兩張**(表頭 + subtotal 尾段),七欄 header、grand total、subtotal、scope note 全部真 render
  - 🟢 **grand total `25275` 同 API 逐字一樣,而 subtotal 亦係 `25275`** —— 一個行 endpoint、一個行前端計,**兩條獨立路徑對得上**
  - 🔴 **render 揭咗一個所有 test 都捉唔到嘅問題,已修**:`In M365` 兩個字喺窄 numeric 欄**換行成兩行**,令 header 高過其餘六欄。加 `whitespace-nowrap` ⇒ 實測七個 `th` **全部 36px**。**呢個只有真 render 睇得到**
  - ⚠️ **表由 6 欄變 7 欄,1440px 之下開始橫向捲**:實測 `table.scrollWidth 1160` vs container `1132` = **溢出 28px**,而 `In M365` 佔 **79px** ⇒ **加欄之前係零溢出**。由既有 `overflow-x-auto` 接住。**冇為咗慳位去收窄 padding** —— 嗰個係設計值(H6)
  - ⚠️ **`—`(never synced)喺本機 render 唔到** —— 101 個 row **零個** `tenantConsumed` 係 null。由 unit test 蓋住(F3-4 / F3-5),唔造假 row 去湊夠一張截圖
  - 🟢 **順帶即場示範咗本 CH 個價值**:`Teams_Premium_(for_Departments)` owned **0** / In M365 **2** · `VIVA` owned **0** / In M365 **30** —— 平台以為冇,M365 話有人用緊
- [ ] F4-7 ⚠️ **順帶揭咗一個 ledger leftover,待 Chris 決定** —— `POWERAUTOMATE_ATTENDED_RPA`:`owned=165` · `alloc=0` · **`assigned=1`** · **`In M365=90`**。呢個 `1` 係 **W45 `F4-4` 真派嗰次留低**(Graph 側當時有移返,ledger `assignedQuantity` 冇跟住減)⇒ **ledger 揸住一個唔存在嘅 assignment**,兼且因為 `alloc=0` 而顯示 `Over-allocated`。**同 CH-020 leftover 同族第三次**。🔴 **而 Drift 頁今日零 alert**(reconcile sweep 未跑過)⇒ 呢個落差**今日之前冇任何畫面顯示過**,而 CH-028 個新欄一眼就見到 —— 呢個係本 CH 第一個真實用途
- [ ] F4-5 BACKLOG 標完成(R7)+ CLAUDE.md §0 / §9 + `SESSION_SUMMARY.md` 座標掃(§14)
- [ ] F4-6 commit + PR
