---
change_id: CH-008
spec_ref: ./spec.md
status: in-progress     # in-progress | done
last_updated: 2026-07-25
---

# CH-008 — Checklist

> Atomic checkbox items derived from `spec.md §3` acceptance criteria。每 item ≤ 1-2h effort。
> AI tick 完成嘅 item;唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。
> ⚠️ **全部 item 鎖住** —— spec 仍係 `proposed`,等 Chris approve 先開工(PROCESS R1.change)。

## Implementation

### Backend — read-model filter(D2)
- [ ] `ledger-read.service.ts`:`private where(actor)` **之內**加 empty 排除(**唔另起 query**,守 R4)—— 條件 = NOT(`allocatedQuantity=0` AND `assignedQuantity=0`)
- [ ] 兩個 GET 收可選 `includeEmpty`(query DTO + `@ApiQuery`),鏡射 CH-004 `?includeInactive` 慣例;default = 排除
- [ ] `license.controller.ts` 兩個 route 傳落 service;roles / scope **一個字都唔改**
- [ ] spec test:filter 兩態(default 排除 / `includeEmpty=true` 含)+ `scopeWhere` 仍生效(R4)+ 總數三欄不變而兩個 count 變(A2)

### Frontend — status + toggle(D3 / D4)
- [ ] `lib/ledger.ts` `assetStatus()` 加 `Empty` / **既有** `neutral` tone;**排喺 `overAllocated` 之後**;`Pick` 加 `assignedQuantity`
- [ ] `lib/ledger.test.ts` 加:0/0 → `Empty`;`allocated=0, assigned>0` → 仍然 `Over-allocated`(次序守門,A5);`allocated>0, assigned=0` → 仍然 `Headroom`(A4)
- [ ] `hooks/queries.ts`:`useLedger` / `useLedgerStats` 收 `includeEmpty` 參數(入 queryKey,避免 cache 撞)
- [ ] `by-opco-view.tsx`:加「Show empty rows」toggle,用**既有** `components/ui/checkbox.tsx`(唔加新 primitive)
- [ ] toggle 文案講明「empty」≠「已刪除」(R1 mitigation)

## Verification

- [ ] **A1** `GET /license/ledger` default 唔含 0/0 / `?includeEmpty=true` 含(貼真 response)
- [ ] **A2** stats:兩個 count 變、三個總數不變(貼真 response 對照)
- [ ] **A3** 表默認唔見 → 勾 toggle 見到 → 狀態 `Empty` / neutral(browser 實看)
- [ ] **A4** `allocated>0, assigned=0`(21 行)默認仍見、仍 `Headroom`
- [ ] **A5** `allocated=0, assigned>0` 仍 `Over-allocated` / danger
- [ ] **A6** PATCH 對隱藏 row 仍然有效(row 冇被刪)
- [ ] **A7** OPCO_IT scope regression:只見自己 OpCo(對照 ADMIN)
- [ ] **A8** F2 範本 round-trip 仍然 `changes: 0`
- [ ] **A9** api ≥ 390 · web ≥ 151,新 test 覆蓋上述分支
- [ ] **A10** lint(api + web)零 output · `tsc --noEmit` 0 · `npm run build` OK
- [ ] **A11** 跑 `ui-design` skill;toggle + `Empty` badge **light + dark** 實看(Playwright)
- [ ] 造 0/0 test row 用 **scratch DB**(唔污染 dev DB;見 memory `scratch-db-verification`);若用 dev DB PATCH 則**必須還原**並貼還原證據

## Cross-Cutting

- [ ] Each commit references `progress.md` Day-N entry(R2)
- [ ] Commit message 標 component tag(`fix(license):` / `feat(web):`,標 `(CH-008)`)
- [ ] **無 ADR**(D5:零 schema、零新 endpoint,唔觸發 H1)—— 若實作中發現要改 schema → **STOP**,回頭問 owner
- [ ] `BACKLOG.md` 同步(R7)+ **DD-3 註記**本 change 令 create 缺口更明顯
- [ ] `progress.md` closeout summary written
- [ ] `progress.md` frontmatter status flipped to `done`

---

**Lifecycle reminder**:呢份 checklist 隨 spec acceptance criteria 衍生。新加 item 必須先入 spec + changelog,然後再加 checklist。
