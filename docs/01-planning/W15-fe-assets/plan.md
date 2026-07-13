---
phase: W15-fe-assets
name: "FE-Assets — License Assets screen (By-OpCo ledger table) + Overview seat KPI"
sprint_week: W15
backlog_id: FE-Assets
start_date: 2026-07-13
end_date: 2026-07-13
status: closed           # draft | active | closed — D1-D5 完成，G1-G7 全過（live：ADMIN 4/2-OpCo · OPCO_IT 2/RHK · Overview Licenses assigned · light+dark）
spec_refs:
  - design_handoff_licenseops/prototype/full-console.html（License Assets view — By-OpCo mode 欄位 SKU|Allocated|Assigned|Available|Utilization|狀態；Overview KPI 第 4 tile = Licenses assigned）
  - docs/02-architecture/design-system.md（H6 token-only / DS 自檢）
  - docs/02-architecture/licenseops/DESIGN.md §5（ledger 兩層數字：allocatedQuantity=owned/budget · assignedQuantity=assigned）
  - apps/api/src/license/dto/ledger-read.dto.ts（W14：LedgerRowDto[headroom/overAllocated] / LedgerStatsDto）
  - docs/01-planning/W14-ledger-read/（consume GET /license/ledger + /license/ledger/stats）
  - CLAUDE.md §5 H6（Design Fidelity）/ H3（scope：只砌有數嗰啲）
prior_phase: W14-ledger-read
---

# Phase W15 — FE-Assets（前端 License Assets 畫面 + Overview seat KPI）

> **Plan version**：1.0 · **Owner**：Chris Lai
> **緣起**：W13 令 `allocatedQuantity` 有得灌、W14 起咗 `/license/ledger`（rows + headroom/overAllocated）+ `/license/ledger/stats` read-model → **FE-Assets 解封**。呢個 phase 把 W13+W14 灌落嘅數變成可見 UI。
> **本 phase = 純前端**：consume 既有 endpoint，**無新 endpoint、無 schema 改、無新 dep、無 ADR**。

## 1. Scope

### In
- **License Assets 畫面**（`pages/assets.tsx`，route `/assets` — 現為 Placeholder）：
  - **Stats strip**（consume `GET /license/ledger/stats`）：3 tile — **Allocated to OpCos**（totalAllocated）· **Assigned to users**（totalAssigned）· **Headroom**（totalHeadroom）；over-allocated pill（overAllocatedCount>0 顯示）。貼 prototype recon 三 tile（減去無 endpoint 嘅 Owned）。
  - **Toolbar**：OpCo filter chips（`[全部][RHK][RTH]…` — 由 rows 內 distinct opco 產生，client filter）+ SKU 文字 filter input（prototype「Filter SKU…」）。
  - **表**（consume `GET /license/ledger`，flat + OpCo 欄，OD2）：欄 = **OpCo | SKU | Allocated | Assigned | Available | Utilization（bar + %）| 狀態**。派生：Available = row.headroom；Utilization% = allocated>0 ? round(assigned/allocated·100) : 0（allocated=0 避除零 → 0% / 「—」）；狀態 = overAllocated→danger「Over-allocated」/ util===100→warn「Fully allocated」/ else ok「Headroom」（貼 prototype tone map）。數字 mono（DS-5）。分頁（catalog pattern，rows > PAGE_SIZE）。
  - loading / error / empty states（feedback-states + EmptyState）。
  - scope：ADMIN/REGIONAL 見全 OpCo rows；**OPCO_IT 只見自己**（W14 後端 `scopeWhere` 已 fail-closed，前端唔另做）。
- **Overview seat KPI**（`pages/overview.tsx`）：第 4 個 KPI tile「Tracked SKUs」→ **「Licenses assigned」**（consume `/license/ledger/stats` totalAssigned，sub「in active use」，tone ok）——還原 prototype 4-tile（OD3）。
- **Tests**：`lib/ledger.test.ts` — utilizationPct（含 allocated=0 除零）· assetStatus tone/label map · distinct-opco / filter helper。

### Out（H3 / surgical / 誠實限制）
- **Platform mode（tenant Owned / Unallocated 三層數）** —— 後端**無 tenant-owned endpoint**（W14 只有 per-OpCo allocated+assigned；drift 只存 tenantConsumed 非 owned/prepaid 總數）。→ **honest gap**，畫面唔砌空殼 Owned/Unalloc 欄；留一句 note，恢復條件 = 後端 subscribedSkus `prepaidUnits.enabled` mini-phase（見 §6 carry-over）。
- **Compare mode** —— out（本 phase 只 By-OpCo）。
- **Manage / Adjust 寫操作** —— allocation 編輯已喺 **Settings › Integrations → Import**（W13 CSV），本畫面 read-only + 一句指路，唔重造寫面。
- **Export / Sync-from-tenant 掣** —— 無 export endpoint；catalog sync 喺 Catalog 畫面。→ 唔擺。
- **新 endpoint / schema / dep / ADR** —— 無（純前端）。

## 2. Approach
- **Data layer**：`api-types.ts` 加 `LedgerRow` / `LedgerStats`（鏡 W14 DTO）；`hooks/queries.ts` 加 `useLedger()` / `useLedgerStats()`（TanStack Query，key `['license','ledger']` / `['license','ledger','stats']`）。
- **純派生 helper 抽去 `lib/ledger.ts`**（可測，唔埋 component）：`utilizationPct(row)` · `assetStatus(row)`（→ {label,tone}）· `distinctOpcos(rows)`。
- **`pages/assets.tsx`**：組合既有 primitive（Card / StatCard / Badge / Button / feedback-states / EmptyState）+ catalog table/pager pattern；OpCo chips 用既有 button token style。**唔加新 primitive**。
- **Router**：`/assets` 由 `<Placeholder>` 換 `<Assets/>`。
- **Overview**：4th StatCard 改 label/value/icon/tone，接 `useLedgerStats`。

## 3. Deliverables
- **D1** — data layer：api-types（LedgerRow/LedgerStats）+ hooks（useLedger/useLedgerStats）+ `lib/ledger.ts` helper。
- **D2** — `pages/assets.tsx`（stats strip + toolbar + flat table + pager + honest-gap note + states）+ router wire。
- **D3** — Overview 4th KPI → Licenses assigned。
- **D4** — `lib/ledger.test.ts`（utilizationPct 含除零 · assetStatus map · distinct/filter）。
- **D5** — verify（lint + build + web test green + **live DOM round-trip**：ADMIN 全 OpCo rows + OpCo chip filter + Overview Licenses assigned；run-as OPCO_IT 只見自己；light+dark）+ ui-design 自檢 + closeout。

## 4. Phase Gates
- **G1** Assets 表 render ledger rows，派生 Available/Utilization/狀態正確；ADMIN 見全 OpCo、OPCO_IT 只見自己（live，run-as `AUTH_DEV_USER_EMAIL`）。
- **G2** OpCo filter chips + SKU filter 客端 filter work。
- **G3** Overview 第 4 tile = Licenses assigned，接 `/ledger/stats` totalAssigned（live 對數）。
- **G4** honest gap 守住（無捏造 Owned/Unalloc；allocation 編輯指去 Settings import；Platform/Compare 標 future）—— H7。
- **G5** H6 fidelity：token-only、lucide stroke、light+dark、數字 mono、一 view ≤1 primary；跑 `ui-design` skill 自檢；對 prototype By-OpCo view 視覺一致。
- **G6** lint 0 + build 0 + web test green（8→+N）。
- **G7** 無 schema / 無新 dep / 無 ADR（純前端 consume 既有 endpoint）。

## 5. Decisions / OD（Chris approve 2026-07-13）
- **OD1** = **By-OpCo 誠實表**（只砌 W14 支撐嘅 allocated/assigned/available；Platform tenant-Owned = honest gap，唔砌空殼）。
- **OD2** = **單一平表 + OpCo 欄 + filter chips**（唔按 OpCo 分組 subtotal）。
- **OD3** = Overview 第 4 tile **換返「Licenses assigned」**（totalAssigned，貼 prototype）。

## 6. Risks / 誠實限制
- 本地 allocated 真數 = W13 import 咗嘅測試數（test-e3/e1 × RHK/RTH，**assigned 皆 0**）→ 本地 Utilization 多數 0%、over-allocated 狀態難現場 exercise → **靠 unit test 覆蓋** util/status 派生（含 over-allocated + 除零）。真 utilization 生產數需 deploy curation。
- **Platform tenant-Owned/Unalloc view carry-over**：需後端 mini-phase pull subscribedSkus `prepaidUnits.enabled`（tenant owned 總數）先砌得，本 phase 標 future（BACKLOG 新 candidate）。

## 7. Changelog
- 1.0（2026-07-13）— active；Chris approve OD1（By-OpCo 誠實表）/ OD2（平表+chips）/ OD3（Overview Licenses assigned）。開 D1。
- 1.1（2026-07-13）— closed；D1-D5 同日完成，G1-G7 全過（web 8→17 test；live DOM ADMIN 4/2-OpCo · OPCO_IT 2/RHK · Overview Licenses assigned · light+dark 取色驗）。carry-over：Platform tenant-Owned view（需 subscribedSkus prepaidUnits endpoint）登 BACKLOG 新 candidate。
