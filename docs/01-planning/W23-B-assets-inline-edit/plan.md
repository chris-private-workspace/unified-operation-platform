---
phase: W23-B-assets-inline-edit
name: "W23-B(frontend) — Assets By-OpCo inline edit:逐格改 allocated/assigned → PATCH /license/ledger/:id"
sprint_week: W23-B
backlog_id: LEDGER-MANUAL (W23-B frontend)
start_date: TBD
end_date: TBD
status: closed           # draft → active → closed(D1–D4 同日完成,gates 全過,web 63→75)
adr: ADR-0007 (Accepted;UI = §8,無新 ADR)
spec_refs:
  - docs/adr/0007-opco-ledger-manual-management.md §8(UI:By-OpCo inline edit,一個 primary Save,token-only,H6)
  - docs/01-planning/W23-assets-manual-ledger/progress.md（W23-A carry-overs)
  - apps/web/src/components/assets/by-opco-view.tsx（現唯讀 7 欄表,Allocated/Assigned 待可編輯)
  - apps/web/src/hooks/mutations.ts（apiPatch + invalidate pattern)· lib/api-types.ts(LedgerRow)
  - apps/api PATCH /license/ledger/:id（W23-A,已 live:set 絕對值 + 回更新後 row)
  - CLAUDE.md §5.6 H6(新 UX pattern 要 owner 確認)· §5.5 H5(gating/edit 純函數 test)
prior_phase: W23-assets-manual-ledger (W23-A)
---

# Phase W23-B — Assets By-OpCo inline edit(frontend)

> **Plan version**:0.1(**draft — 等 Chris approve UX + plan**)· **Owner**:Chris Lai · **ADR**:ADR-0007 §8(無新 ADR)
> **緣起**:W23-A 已交後端 `PATCH /license/ledger/:id`(逐格 set allocated/assigned + audit + scope 403)。本 phase = 前端接上,令 Chris **喺 Assets By-OpCo 表直接改數量** —— 即最初嘅訴求。
> **本質**:純前端 —— consume 已 live 嘅 endpoint;無 schema/dep/新 ADR。**H6**:inline edit 係 Assets 首個編輯 pattern,handoff 無參考 → UX 要 owner 揀(見 §5)。

## 0. 前置 gate(未過唔 code)
- **UX pattern 揀定**(§5,AskUserQuestion)+ **plan approve** → 開 D1。**← 現處於此**

## 1. Scope

### In(W23-B)
- **Assets By-OpCo 表 inline edit**:`allocatedQuantity` / `assignedQuantity` 可改 → Save → `PATCH /license/ledger/:id` → toast + refetch。
- **`useUpdateLedger` mutation**(`hooks/mutations.ts`):`apiPatch<LedgerRow>('/license/ledger/'+id, body)`;onSuccess invalidate `['license','ledger']` + `['license','ledger','stats']` + `['license','tenant-skus']`(Platform 加總隨之)+ `['license','drift']`(Σ assigned 變影響對帳)。
- **`UpdateLedgerBody`** type(api-types):`{ allocatedQuantity?, assignedQuantity?, reason? }`。
- **驗證/呈現**:非負(前端擋負 + backend 400 兜);save 中 disable + spinner;錯誤 surface backend message(toast)。over-alloc 即時反映(headroom/status 由 refetch 後真數重算,唔前端造)。
- **scope gating**:OPCO_IT 只見自己 OpCo 行(backend ledger read 已 scope);edit 任何可見行都係自己 scope,backend `assertOpcoScope` 仍最終防線。
- **Tests(H5)**:見 §4。

### Out(→ 其他 / 明確唔做)
- **Platform mode inline edit**(owned/consumed = Graph 真相,維持唯讀 —— ADR-0007)。
- **新增/刪除 ledger row**(只 edit 已存在 row 數量;建 row 靠 import/seed)。
- **後端改動**(endpoint W23-A 已 live)。
- reason 設成必填審批(本 phase reason = optional 備註)。

## 2. Approach（UX 待 §5 定;以下係共通骨架）
- **`useUpdateLedger`**:單 row PATCH,回更新後 `LedgerRow`;refetch 令 headroom/util/status/stats/platform 全用真數重算(唔前端 optimistic 造數,守 honest-data)。
- **編輯狀態**:`by-opco-view.tsx` 加 local edit state(邊行 in-edit + draft 值);受控 `Input`(既有 primitive)。**一個 primary**「Save」(Ricoh red);Cancel = secondary/ghost(H6 一 primary/view)。
- **數字欄**:in-edit 時 Allocated/Assigned cell → `<input type=number min=0>`;Available/Utilization/Status 該行 in-edit 時顯示「will recompute」或維持舊值(refetch 後更新)。
- **row id**:`GET /license/ledger` 已回 `id`(W23-A 確認),直接做 PATCH target。

## 3. Deliverables
- **D1** — `UpdateLedgerBody` type + `useUpdateLedger` mutation(invalidate ledger/stats/tenant-skus/drift)。
- **D2** — `by-opco-view.tsx` inline edit UI(依 §5 揀定嘅 pattern:edit 觸發 + 受控 input + Save/Cancel + save 中 disable + toast)。
- **D3** — tests(H5):mutation body 組裝 / 非負 guard / edit-state 純邏輯(draft diff、至少一欄變先 enable Save)。
- **D4** — verify(build/lint/test + **live** ADMIN 改一行 allocated/assigned → 表更新 + stats/platform 隨之 + toast;OPCO_IT 只見自己行;負數擋;light+dark)+ ui-design 自檢 + BACKLOG/memory 同步 + closeout。

## 4. Phase Gates
- **G1** mutation:`useUpdateLedger` PATCH 成功回 row + invalidate 令表/stats refetch。
- **G2** inline edit live:改 allocated/assigned → Save → 值更新 + toast;Available/Utilization/Status 隨真數重算。
- **G3** 一個 primary:Save = 唯一 accent action;Cancel 非 accent(H6)。
- **G4** 錯誤/邊界:負數擋(前端 + backend 400 message surface);save 中 disable 防重複。
- **G5** scope:OPCO_IT 只見/改自己行(backend scope + 403 最終防線;前端唔畀改唔見嘅行)。
- **G6** H5 test:mutation body / 非負 / edit-state 純邏輯;web 63→+N 全綠。
- **G7** H6:token-only · lucide · light+dark · ui-design 過 · 一 primary。
- **G8** regression:唯讀 Platform mode / filter / search / 分頁 / W22 role gating 不破。

## 5. UX pattern(Chris 揀定 2026-07-14)— locked
1. **Row edit mode** —— 每行一個 ✎ 掣;click → 該行 Allocated/Assigned 變 `<input type=number min=0>` + **Save(Ricoh red,唯一 primary)**/Cancel(ghost);一次改一行,Save = 一個 `PATCH /license/ledger/:id`;有確認步驟(唔似 inline cell 即 save,防誤改)。
2. **reason = 選填 note** —— edit 行加一個細 note input(可填可空),填咗入 `LedgerAdjustment.reason` audit。

## 6. Risks / 誠實限制
- **honest-data**:refetch 後真數重算 headroom/status,唔前端 optimistic 造數(over-alloc 由真 backend 值定)。
- **H6 新 pattern**:Assets 首個編輯互動 → 揀定後如偏離 handoff 美學(如新 icon/新 control)先確認。
- **OPCO_IT edit**:前端只可改可見行(已 scope);backend `assertOpcoScope` 係最終防線(前端 gating 係 UX 唔係安全)。

## 7. Changelog
- 0.1(2026-07-14)— draft;W23-A 完成後 kickoff。等 UX pattern 揀定(§5)+ plan approve → 開 D1。
- 1.0(2026-07-14)— **active**;Chris 揀定 **Row edit mode + reason 選填 note**(§5 locked)+ plan approve。開 D1(useUpdateLedger + UpdateLedgerBody)。
- 1.1(2026-07-14)— **closed**;D1–D4 同日完成,G1–G8 全過(G5 靠 backend + 前期覆蓋)。`useUpdateLedger` + `by-opco-view` Row edit mode(Pencil→input+Save/Cancel+reason)+ `evaluateLedgerDraft` 純函數。web 63→**75** test;**live browser 端到端驗**(改 661→665→Save→表+stats+toast · 負數擋 · light+dark · seed 復原)。commit 待指示。
