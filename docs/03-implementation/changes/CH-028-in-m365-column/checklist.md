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
- [ ] F4-4 🔴 **H6:light + dark 真 render**(A8)—— 要起本機 stack(5433 要 Chris 批停 `ai-doc-extraction-db`)。⚠️ **本機 ledger 係空**,`Assigned` 會係 0,要用 fixture 先睇到「兩個數並排」個效果(CH-024 先例)
- [ ] F4-5 BACKLOG 標完成(R7)+ CLAUDE.md §0 / §9 + `SESSION_SUMMARY.md` 座標掃(§14)
- [ ] F4-6 commit + PR
