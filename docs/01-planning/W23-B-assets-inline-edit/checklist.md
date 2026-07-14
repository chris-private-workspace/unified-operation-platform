---
phase: W23-B-assets-inline-edit
status: closed
---

# W23-B — Assets By-OpCo inline edit — Checklist

> ADR-0007 §8。UX(Chris 揀定):**Row edit mode**(每行 ✎ → input + Save[red]/Cancel,一行一 PATCH)+ **reason 選填 note**。
> consume W23-A `PATCH /license/ledger/:id`(已 live)。scope:OPCO_IT 只見/改自己行(backend scope + 403 最終防線)。

## D1 — mutation + type ✅
- [x] `api-types.ts` `UpdateLedgerBody`(allocatedQuantity?/assignedQuantity?/reason?)
- [x] `hooks/mutations.ts` `useUpdateLedger`(apiPatch<LedgerRow> + invalidate ledger/tenant-skus/drift)

## D2 — inline edit UI(Row edit mode)✅
- [x] `by-opco-view.tsx` 加 edit state(editingId + draft)+ `LedgerTableRow`(display / edit 兩態)
- [x] Allocated/Assigned cell:in-edit → `<input type=number min=0>`;非 edit → 純顯示
- [x] 每行 ✎ 掣(lucide Pencil)→ 入 edit;Save(primary Ricoh red)/Cancel(ghost);reason note input
- [x] Save → useUpdateLedger(只傳有變嘅欄)+ toast + 退 edit;save 中 disable(Saving…)
- [x] 負數/空/小數擋(evaluateLedgerDraft invalid → Save disabled + "Enter 0 or more" hint);至少一欄變先 enable
- [x] Edit 欄 header + 對齊(唯讀 ✎;edit Save/Cancel);Available/Util/Status in-edit 顯 '—'(refetch 真數重算,唔前端造)

## D3 — tests(H5)✅
- [x] `ledger.test.ts` `evaluateLedgerDraft`(11:各欄獨立 / 對回 assigned / 兩欄 / reason trim+omit / zero / nochange / reason-only / negative / empty / decimal)+ `initLedgerDraft`(1)

## D4 — verify + closeout ✅
- [x] build 0 + lint 0(--fix)+ test green(web 63→**75**)
- [x] **live browser**(dev session admin):click ✎ → edit mode(input 預填 · Save disabled)→ 改 alloc 661→665 + reason → Save enable → Save → **toast「Updated RHK · SPE_E3」**+ 表 665/headroom 665 + stats 2371→2375 + 退 display;負數 → Save disabled + hint;light+dark token swap(input rgb255→20,23 · Save #E60027 一致);seed 復原 661
- [x] ui-design 自檢(一 primary Save accent · Pencil/Check/X lucide · token-only · light+dark)
- [x] BACKLOG + memory 同步;progress retro;plan closed;commit(待指示)

## Phase Gate(plan §4)
- [x] G1 mutation invalidate → 表/stats refetch(live 2371→2375)
- [x] G2 inline edit live(改→Save→值更新+真數重算)
- [x] G3 一個 primary(Save accent #E60027 / Cancel ghost)
- [x] G4 錯誤/邊界(負數擋+hint + save disable Saving…)
- [~] G5 scope(OPCO_IT 只見/改自己行 — backend scopeWhere + assertOpcoScope 403,W15/W22 已驗;本 phase 未再 run-as live 對照)
- [x] G6 H5 test green(75)
- [x] G7 H6(token/lucide/light+dark live 驗)
- [x] G8 regression(build/test 綠 · filter/search/分頁/stats 保留)

## Cross-Cutting
- [x] BACKLOG 同步(R7);memory
- [x] 無 H1/H2/新 ADR(純前端 consume ADR-0007 endpoint)
- [ ] commit reference progress Day-N(R2)— commit 待指示
