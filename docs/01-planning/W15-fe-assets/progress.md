---
phase: W15-fe-assets
status: closed
---

# W15 — FE-Assets — Progress

## Day 0 — 2026-07-13（kickoff）

**緣起**：W13（allocation import）+ W14（`/license/ledger` rows + `/ledger/stats`）令 assets 數有得灌又有得讀 → FE-Assets 解封。把數變成可見 UI。

**查證（落 plan 前）**：
- prototype License Assets view 有 3 mode。**By-OpCo mode** 欄位 = `SKU | Allocated | Assigned | Available | Utilization | 狀態` → 同 W14 `/ledger` rows **1:1**（Available=headroom、Utilization=assigned/allocated FE 計、狀態=overAllocated flag）。
- **Platform mode** 要 tenant 級 **Owned / Unalloc** 三層數 → 後端**無 tenant-owned endpoint**（W14 只有底兩層）→ 誠實限制。
- prototype Overview 第 4 個 KPI 實際係 **「Licenses assigned」**（totAssigned）；我哋現時擺咗「Tracked SKUs」（W12 因無 ledger stats 用嘅替身）。

**決定（AskUserQuestion，Chris approve）**：
- **OD1** = By-OpCo 誠實表（只砌 W14 支撐嘅 allocated/assigned/available；Platform tenant-Owned = honest gap，唔砌空殼）。
- **OD2** = 單一平表 + OpCo 欄 + filter chips（唔按 OpCo 分組 subtotal）。
- **OD3** = Overview 第 4 tile 換返「Licenses assigned」（totalAssigned，貼 prototype）。

**做咗**：寫 plan（scope / 7 gate / 3 OD）+ checklist + progress。status active。

**下一步**：D1 — api-types + hooks + `lib/ledger.ts` helper。

---

## Day 1 — 2026-07-13（D1-D5 完成）

### Done
- **D1**：`api-types.ts`（`LedgerRow`[opco/sku ref + allocated/assigned + headroom + overAllocated] / `LedgerStats`）· `hooks/queries.ts`（`useLedger` / `useLedgerStats`）· `lib/ledger.ts`（`utilizationPct` 除零守 / `assetStatus` tone map / `distinctOpcos`）。
- **D2**：`pages/assets.tsx`（stats strip 3 tile + over-alloc pill · OpCo filter chips + SKU search · flat 表 OpCo|SKU|Allocated|Assigned|Available|Utilization bar/%|Status，mono 數字 · pager · honest-gap note · loading/error/empty）· `router.tsx` `/assets` 換 `<Assets/>`（移除 Placeholder import）。
- **D3**：`pages/overview.tsx` 第 4 tile「Tracked SKUs」→「Licenses assigned」（`useLedgerStats` totalAssigned，tone ok，KeyRound）；順帶清 orphan（`useCatalog`/`Package`/`activeSkus`，§1.3）。
- **D4**：`lib/ledger.test.ts`（9 test：utilizationPct 正常/rounding/除零/over-clamp · assetStatus 3 tone · distinctOpcos dedupe+sort/empty）。
- **D5 verify**：lint 0（--fix prettier）· build 0（tsc + vite，msal-vendor 254KB « 500KB 無警告）· **web test 8→17 綠**；**live DOM round-trip**（見下）。

### Decisions
- **`useMemo` 依賴 `ledger.data` 而非 `rows`**（`?? []` 每 render 新 array 會 thrash memo deps → react-hooks/exhaustive-deps warning）——跟 requests.tsx pattern。
- **util bar 寬 = inline `style width:${pct}%`**：呢個係**數據**（assigned/allocated），非 hardcode 設計值（prototype bar 一樣做法）→ 不違 DS-1。
- **Placeholder 元件變無 route consumer**（所有實畫面已砌齊）：係本改動結果，但佢係可重用 primitive 非 import/var orphan → **mention 唔刪**（§1.3）。

### Verify（真 tool output）
- lint exit 0 · build exit 0 · **17 test**（ledger 9 + api 6 + app-shell 2）。
- **live（真 HTTP + JS DOM 量度，dev-bypass；ledger = W13 import 咗嘅 test-e3/e1 × RHK/RTH，assigned 0）**：
  - **ADMIN**：`/assets` render **4 行**（RHK×E3 661/0/661 · RHK×E1 80/0/80 · RTH×E3 1624/0/1624 · RTH×E1 6/0/6，全 0% / Headroom）· stats tile Allocated 2371「2 SKUs · 2 OpCos」/ Assigned 0 / Headroom 2371 · 無 over-pill（count 0）· honest note 齊。
  - **filter**：click RHK → 2 行（全 RHK）· RHK + 「office」→ 1 行（Office 365 E1）· reset → 4 行。
  - **Overview**：4 KPI = Open requests 6 / In procurement 2 / Open drift 3 / **Licenses assigned 0**；Tracked SKUs 已移除。
  - **light+dark（Assets 畫面本身取色）**：card 255→20 · pageBg 245→8 · util fill(bg-info) 29,78,216→95,155,255 · badge(text-ok) 21,128,61→67,209,127 → token swap 無 hardcode。
  - **run-as OPCO_IT**（`AUTH_DEV_USER_EMAIL=opco.it.rhk@rapo.com.hk`；`/me` OPCO_IT/RHK）：`/assets` **只 2 RHK 行** · chips 只剩 All+RHK（RTH 消失）· stats 741「2 SKUs · 1 OpCos」→ **scope fail-closed 端到端正確**（後端 W14 scopeWhere，前端 verbatim render）。

### Blockers
- 無。

### Effort
- Planned：~1-2 日；Actual：D0-D5 同日。

### Commits
| Hash | Subject |
|---|---|
| (待指示) | feat(web): W15 FE-Assets — License Assets screen + Overview seat KPI |

---

## Closeout（status=closed）

### Acceptance verification（plan §4 gates）
| Gate | 結果 |
|---|---|
| G1 Assets 表派生 + scope（ADMIN 全 / OPCO_IT 自己）live | ✅ ADMIN 4/2-OpCo · OPCO_IT 2/RHK（真 HTTP + DOM） |
| G2 OpCo chips + SKU filter | ✅ RHK→2 · +office→1 · reset→4 |
| G3 Overview Licenses assigned 接 stats | ✅ totalAssigned 0 對數，Tracked SKUs 移除 |
| G4 honest gap（無捏造 Owned/Unalloc；指路 import；Platform/Compare future） | ✅ H7 守住 |
| G5 H6 fidelity（token/lucide/light+dark/mono/≤1 primary）+ ui-design 自檢 | ✅ DS-1..12 全 ✅/N/A |
| G6 lint 0 + build 0 + web test green | ✅ 17 test |
| G7 無 schema / 無 dep / 無 ADR | ✅ 純前端 consume 既有 endpoint |

全 7 gate ✅。

### Lessons
- **W14 read-model 直接 1:1 落 By-OpCo 表**：Available=headroom、Utilization=FE 計、狀態=overAllocated flag——後端把派生語意留 FE 嘅決定令前端零改後端就砌到。
- **honest-data 再次贏**：prototype Platform mode 靠 tenant-Owned（後端無）→ 唔砌空殼 Owned/Unalloc，留一句 note + 恢復條件，好過出空欄扮完整（H7）。
- **本地 assigned 全 0**：over-allocated / fully-allocated 狀態現場 exercise 唔到 → 靠 `lib/ledger.test.ts` unit test 補（含 over-clamp + 除零 + 3 tone）。真 utilization 生產數需 deploy curation。
- **`?? []` in useMemo deps**：新 array 每 render → 依賴 query.data 而非 derived array（requests.tsx 已示範）。

### Carry-overs
- **Platform tenant-Owned/Unalloc view**（BACKLOG 新 candidate）：需後端 mini-phase pull subscribedSkus `prepaidUnits.enabled`（tenant owned 總數）先砌得；砌成後 Assets 可加 Platform mode（Owned/Unalloc 欄 + 三層 recon tile）。
- **真 allocated 生產數** = deploy curation（真 tenant catalog/sync + 37-SKU businessAlias）。
- **Placeholder 元件** 現無 route consumer（可重用 primitive，暫留）。

---

**End of W15 progress**
