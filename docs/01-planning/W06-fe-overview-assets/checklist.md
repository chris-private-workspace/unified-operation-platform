---
phase: W06-fe-overview-assets
plan_ref: ./plan.md
status: complete    # draft | in-progress | complete
last_updated: 2026-07-09
---

# Phase W06(FE-1)— Checklist

> Atomic checkbox（每 item ≤ 1–2 hour effort）。
> ✅ plan approved（status active,2026-07-09）;OD1–OD4 全照 default = A。由 F1 開工。
> **H6**:每個 UI item 完成前跑 `.claude/skills/ui-design`;偏離設計 → STOP 問 owner。
> **誠實資料**:缺 endpoint section 一律 EmptyState,**絕不砌假數**。

## F1 — Data layer（TanStack Query + fetch wrapper + vite proxy）

- [x] `vite.config.ts` 加 `server.proxy` `/api` → `http://localhost:3100`（OD4;`VITE_API_BASE_URL` 可覆寫）
- [x] `src/lib/api.ts` fetch wrapper（baseURL + JSON + error throw）
- [x] `src/hooks/`:`useCatalog` / `useDrift` / `useRequests`（TanStack Query;return type 按 OD2）
- [x] verify（G3）:後端起,Query 打去 `/api/license/catalog` 等收真 JSON（network / devtools）

## F2 — 畫面用 display primitive re-skin（DS-1/5/6/7）

- [x] StatCard（`label value tone icon delta sub`;tone 只 tint icon chip,value 中性;數字 mono）
- [x] Card + Badge（`tone dot`;stage→tone map DS-8）+ EmptyState（all-clear / no-data）
- [x] 對 handoff `components/display/*.jsx` 視覺 1:1;全 token;icon lucide（DS-6）

## F3 — Overview dashboard（`/`,DS-4/11）⭐

- [x] KPI stat cards 4 個（誠實 metric:Open requests / In-progress / Open drift / Tracked SKUs;**唔砌 ledger 假數**）
- [x] Needs-attention（未完成 request 篩自 `/requests`;dot + REQ/UPN + aggregate status Badge + relative time）
- [x] Drift 摘要 card（open 計數 + 每 SKU delta badge from `/drift`）+ roadmap card（靜態）+ Activity feed EmptyState
- [x] verify（DS-4）:light + dark render 冇爆;對 prototype 1:1（DS-11）;loading skeleton / error toast

## F4 — SKU Catalog（`/catalog`,DS-4/11）⭐ ← 2026-07-09 deviation（原 License Assets,見 progress）

- [x] 字典表 1:1 對 `/license/catalog`（displayName bold / skuPartNumber-mono / skuId GUID-mono muted / alias chip / category badge / BASE badge or "—" / active 綠點 / Edit disabled）
- [x] 副題 "N SKUs · synced {lastSyncedAt}" + Sync 按鈕（`POST /catalog/sync` → invalidate + toast）+ 頁尾 note
- [x] client-side 分頁（prototype 8/頁）
- [x] verify:mono id/GUID/part（DS-5);category/BASE Badge（DS-8);light + dark（DS-4);對 prototype 1:1（DS-11）

## F5 — Query 狀態（loading / error / empty）

- [x] 三 hook 各有 loading（spinner/skeleton）/ error（toast + retry）/ empty（EmptyState）
- [x] 斷後端試:畫面顯示 error/empty 而非 crash;**無假數**

## F6 — DS 自檢 + gate

- [x] `.claude/skills/ui-design` DS-1~12 全 ✅（DS-11 對 prototype / DS-5 mono / DS-8 badge tone）
- [x] `npm run lint -w @uop/web` clean;`npm run build -w @uop/web` 0 error

---

## Cross-Cutting

- [ ] All deliverables committed to git（closeout commit — R2）
- [x] OD1–OD4 resolved → 決策同步 plan §3 + progress（R4）
- [x] Architectural-adjacent decision → ADR（R5;**無** — 純前端組合既有 primitive + 用 token;OD 全選 A,無新 primitive/vendor）
- [x] Pending / next-candidate synced to `BACKLOG.md`（R7;FE-1→進行中、License Assets 移未來、BE-ledger-read + FE-Assets 加候選）
- [x] `progress.md` retro section written + status flipped `closed`
- [x] 下一個 phase（FE-2 Requests）kickoff trigger noted in retro
- [x] G3 真數流通實測記入 progress（後端在線 + vite proxy）

---

**Lifecycle reminder**:呢份 checklist 隨 plan deliverables 衍生。**H6**:要新 primitive/pattern/token 先問 owner + 更新 design-system.md。缺 endpoint = EmptyState,絕不砌假數。
