---
phase: W07-fe-requests
plan_ref: ./plan.md
status: complete    # draft | in-progress | complete
last_updated: 2026-07-09
---

# Phase W07(FE-2)— Checklist

> Atomic checkbox（每 item ≤ 1–2 hour effort）。
> ✅ plan approved（status active,2026-07-09）;**OD1 = B（讀+寫)**、OD2/OD3 = A。由 F1 開工。
> **H6**:每個 UI item 完成前跑 `.claude/skills/ui-design`;偏離設計 → 先確認。
> **誠實資料**:缺 endpoint（handler / AI parse）→ "—" / coming-soon,**絕不砌假數**。

## F1 — types + hooks（擴充 read model）

- [x] `api-types.ts`:`RequestLineItem`（stage timestamps + quoteRef/poRef + optional sku）· `RequestEvent`（type/fromStage/toStage/message）· `EventType` · 擴 `OnboardingRequest`（+opco+lineItems）· `RequestDetail`
- [x] `hooks/queries.ts`:`useRequest(id)`（`GET /fulfilment/requests/:id`）
- [x] verify:hook 收真 detail JSON（含 lineItems{sku} + events）

## F2 — primitive:Stepper + Tabs（DS-1/6/8）

- [x] Stepper（`steps current`;短 3 點 / 採購 6 點;current 帶 ring-accent;已完成填 accent）對 handoff `Stepper.jsx`
- [x] Tabs（filter tab + count）對 handoff `Tabs.jsx`
- [x] 全 token;icon lucide（DS-6）;對 prototype 1:1

## F3 — Requests 列表（`/requests`,DS-4/11）⭐

- [x] filter tabs（All/Needs attention/My queue/Procurement/Blocked;**client 計數** by lineItems+status）
- [x] 表格:REQUEST(mono)·TARGET USER(name+upn mono)·OPCO(code)·LINE ITEMS(每 stage count Badge,stage→tone)·STATUS(派生 label+dot)·HANDLER(OD3 "—")·AGE(relative mono)
- [x] client 分頁;row → `/requests/:id`
- [x] verify（DS-4）:light+dark;對 prototype 1:1（DS-11）

## F4 — Request detail（`/requests/:id`,DS-4/11）⭐

- [x] header:Avatar brand + name + status Badge + meta(OpCo/Handler/Request mono) + SN chip 外連
- [x] sync-gate stepper（account created / azure synced,由 timestamps;done→ok）
- [x] remark card（rawRequestText 引言式）
- [x] line items:每 item name+BASE+×qty / path 標籤 / status Badge / **stage stepper**(短3/採購6 by stage) / action 按鈕(F5 wire)
- [x] operational history timeline（events;dot tone by type;mono 時間）
- [x] AI Assist coming-soon card（OD2;**唔砌假 parse**）
- [x] verify:light+dark;對 prototype 1:1（DS-11）

## F5 — 寫操作（mutations + action 按鈕,OD1=B）⭐ critical path

- [x] `hooks/mutations.ts`:`useAdvanceStage` / `useAssignLineItem` / `useMarkSynced`（各 onSuccess invalidate + toast;onError → 後端 message toast）
- [x] Advance stage:toStage 由 stage 序推下一步（採購路徑）;只採購 / 未到 READY 顯示
- [x] Assign now:只 `stage===READY` + `azureSyncedAt` 有值 enable(否則 Blocked·sync);成功→ASSIGNED invalidate;錯誤 toast **唔崩**
- [x] Mark synced:`azureSyncedAt` 空時提供;成功→gate stepper 更新
- [x] button pending 態（spin/disable）;一 view 一 primary（DS-3）
- [x] **G3b 寫 round-trip 實測**:advance ✓ / mark synced ✓（端到端）;**assign 成功本地驗唔到**（真 Graph placeholder → findUser fail;成功邏輯 W04 覆蓋;揭出後端 crash bug BUG-002）

## F6 — routing + Query 狀態

- [x] `/requests/:id` route
- [x] list/detail 各 loading / error（LoadError）/ empty（no requests / request not found）;**無假數 / 無 crash**

## F7 — DS 自檢 + gate

- [x] `.claude/skills/ui-design` DS-1~12 全 ✅（DS-8 stage→tone / DS-5 mono / DS-3 一 view 一 primary / DS-11 對 prototype）
- [x] `npm run lint -w @uop/web` clean;`npm run build -w @uop/web` 0 error

---

## Cross-Cutting

- [ ] All deliverables committed to git（closeout commit — R2）
- [x] OD1–OD3 resolved → 決策同步 plan §3 + progress（R4;OD1=B 讀+寫、OD2/OD3=A）
- [x] Architectural-adjacent decision → ADR（R5;預期**無** — Stepper/Tabs 屬 handoff inventory,非新發明;寫操作呼既有 endpoint 無新架構）
- [x] Pending / next-candidate synced to `BACKLOG.md`（R7;FE-2 → 進行中→完成）
- [x] `progress.md` retro section written + status flipped `closed`
- [x] 下一個 phase kickoff trigger noted in retro
- [x] G3 真數流通實測（seed 擴 line items + events）記入 progress

---

**Lifecycle reminder**:呢份 checklist 隨 plan deliverables 衍生。**H6**:要 handoff 以外 primitive/pattern/token 先確認。缺 endpoint = EmptyState/coming-soon,絕不砌假數。
