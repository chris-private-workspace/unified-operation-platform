---
phase: W08-fe-drift-harden
status: closed        # plan 已 closed（2026-07-20 status 回填）
---

# W08（FE-3）— Checklist（daily tick）

> 對應 `plan.md` deliverables。approve 前唔 tick（R1）。

## B1 — 後端 Graph-error harden（BE-graph-harden）⭐ H5
- [x] 新 `integration/graph/graph-unavailable.ts` free helper（H4:唔 log UPN/secret）
- [x] `reconcile.service` wrap `getSubscribedSkus` → 503（對帳邏輯一行唔改）
- [x] `catalog.service` wrap `getSubscribedSkus` → 503（upsert/snapshot 邏輯不改）
- [x] `assign.service` 3 個 call 改用共用 helper（private method 移除 + 清 unused import）
- [x] `reconcile.service.spec` regression（throw → 503 + 無 DB 寫）
- [x] `catalog.service.spec` regression（throw → 503 + 無 DB 寫）
- [x] 實證 fails-before（暫還原 → 2 新 test red[Received Error 非 503] → 改返）
- [x] api 全 suite 綠（42 test）+ nest build 0 error + eslint clean

## F1 — types + reconcile mutation
- [x] `api-types.ts` 加 `ReconcileResult`（mirror DTO）
- [x] `hooks/mutations.ts` 加 `useReconcile()`（invalidate drift + caller toast via mutate callbacks）

## F2 — Drift Alerts 畫面（`pages/drift.tsx`）⭐
- [x] Reconciliation 頂欄卡（標題 + summary + Run reconciliation now primary）
- [x] Drift 表格（SKU / Scope=Tenant / Ledger sum / Tenant used / Delta pill / Detected;全 mono 數字）
- [x] Delta pill tone（>0 danger / <0 warn,DS-8）— live 驗 +3/+1 danger、−2 warn
- [x] All-clear empty state（綠勾 + Run reconciliation now）— code-verified（seed 有 3 OPEN,未 live render 空態）
- [x] 無 Resolve 欄 / 無假 Scope（§1.1 honest）
- [x] light+dark 對 prototype 1:1 — browser 兩 theme 截圖對照

## F3 — routing + 狀態 + sidebar count
- [x] `router.tsx` `/drift` → `<Drift />`（拆 Placeholder）
- [x] loading / error / empty 齊全（無假數 / 無 crash）
- [x] `top-bar.tsx` `/drift` → 「Drift Alerts」title（live 見 top-bar 顯示「Drift Alerts」）
- [x] `sidebar.tsx` drift count → `useDrift().data?.length`（live 見 count=3 真數）

## F4 — DS 自檢 + gate
- [x] `.claude/skills/ui-design` DS-1~12 全 ✅（1 toast finding 捉到 → 改用 shared primitive → DOM 重驗 bg-danger token）
- [x] G1 build 0 error / G7 lint 0 warning（web + api）

## Phase Gate（plan §5）
- [x] G1 build · G2 render light+dark · G3 真數讀 · G3b harden round-trip（撳掣→503 toast 唔 crash · API 200 alive）
- [x] G4 DS 自檢 · G5 誠實狀態 · G6 harden test（api 42 綠）· G7 lint

## Closeout
- [x] plan status → closed · progress retro · BACKLOG 同步（FE-3 完成 + BE-graph-harden 完成）
- [x] SESSION_SUMMARY + memory 更新（SESSION_SUMMARY.md + memory `backend-runtime-state` + MEMORY.md index）
- [x] commit（批 A 防範 `ad3ecb8` · 批 B W08 code `29a0ed5`;本 closeout doc-sync 隨後一個小 commit）· **push 待用戶指示**
