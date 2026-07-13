---
phase: W15-fe-assets
status: closed
---

# W15 — FE-Assets — Checklist

> Plan approved 2026-07-13（OD1 By-OpCo 誠實表 · OD2 平表+chips · OD3 Overview Licenses assigned）。純前端 consume 既有 endpoint，無 schema/dep/ADR。D1-D5 完成，G1-G7 全過。

## D1 — data layer ✅
- [x] `api-types.ts`：`LedgerRow`（opco/sku ref + allocated/assigned + headroom + overAllocated）+ `LedgerStats`（totalAllocated/Assigned/Headroom + skusTracked/opcosTracked/overAllocatedCount）
- [x] `hooks/queries.ts`：`useLedger()`（GET /license/ledger）+ `useLedgerStats()`（GET /license/ledger/stats）
- [x] `lib/ledger.ts`：`utilizationPct`（allocated=0 → 0 避除零）· `assetStatus`（overAllocated→danger / util===100→warn / else ok）· `distinctOpcos`

## D2 — Assets 畫面 + route ✅
- [x] `pages/assets.tsx`：stats strip（3 tile + over-alloc pill）· toolbar（OpCo chips + SKU filter）· flat 表（OpCo|SKU|Allocated|Assigned|Available|Utilization bar/%|狀態，mono 數字）· pager · honest-gap note（allocation→Settings import；Platform/Compare future）· loading/error/empty
- [x] `router.tsx`：`/assets` 換 `<Assets/>`（移除 Placeholder import）

## D3 — Overview seat KPI ✅
- [x] `pages/overview.tsx`：第 4 tile「Tracked SKUs」→「Licenses assigned」（useLedgerStats totalAssigned，sub「in active use」，tone ok，KeyRound）；清 orphan（useCatalog/Package/activeSkus）

## D4 — tests（H5-lite，pure helper）✅
- [x] `lib/ledger.test.ts`：utilizationPct（正常 / 除零 / rounding / over-clamp）· assetStatus（3 tone/label）· distinctOpcos（去重+排序 / empty）— 9 test

## D5 — verify + closeout ✅
- [x] lint 0（--fix prettier）+ build 0 + web test green（8→**17**）
- [x] **live DOM round-trip**（真 HTTP + JS DOM，dev-bypass）：ADMIN 4 行/2-OpCo + stats + OpCo chip filter（RHK→2 · +office→1 · reset→4）+ Overview「Licenses assigned」對數；run-as OPCO_IT → **只 2 RHK 行** + stats scoped（741/1 OpCo）
- [x] **light + dark 都驗**（Assets 畫面取色：card 255→20 · util fill 29,78,216→95,155,255 · badge token swap）
- [x] `ui-design` skill 自檢（DS-1..12 全 ✅/N/A）
- [x] progress retro · plan closed · BACKLOG（FE-Assets ✅ + Platform-Owned view 新 candidate）· memory · commit（待指示）

## Phase Gate（plan §4）
- [x] G1 Assets 表派生正確 + scope（ADMIN 全 / OPCO_IT 自己）live 驗
- [x] G2 OpCo chips + SKU filter work
- [x] G3 Overview Licenses assigned 接 stats live 對數
- [x] G4 honest gap 守住（無捏造 Owned/Unalloc；指路 Settings import；Platform/Compare future）— H7
- [x] G5 H6 fidelity（token-only/lucide/light+dark/mono/≤1 primary）+ ui-design 自檢 + prototype 對照
- [x] G6 lint 0 + build 0 + web test green
- [x] G7 無 schema / 無 dep / 無 ADR（純前端）

## Cross-Cutting
- [x] 每 commit references progress Day-N（R2）— commit 待指示
- [x] （純前端 consume，無 ADR — H1 不觸發）
- [x] BACKLOG 同步（R7：FE-Assets ✅ + Platform-Owned 新 candidate）
- [x] progress closeout + status closed
