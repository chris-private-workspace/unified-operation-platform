---
change_id: CH-008
spec_ref: ./spec.md
status: done            # in-progress | done
last_updated: 2026-07-27
---

# CH-008 — Checklist

> Atomic checkbox items derived from `spec.md §3` acceptance criteria。每 item ≤ 1-2h effort。
> AI tick 完成嘅 item;唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。
> ✅ **Spec approved(Chris Lai,2026-07-26)—— 可以開工。**
> ⚠️ 開工前必讀 **CH-009 spec §2.4**:本 change 令 `GET /license/ledger` 預設排除 0/0,而 CH-009 靠同一 endpoint lookup。兩者結論一致,但**唔可以**為對方傳 `?includeEmpty=true`。

## Implementation

### Backend — read-model filter(D2)
- [x] `ledger-read.service.ts`:`private where(actor)` **之內**加 empty 排除(**唔另起 query**,守 R4)—— 條件 = NOT(`allocatedQuantity=0` AND `assignedQuantity=0`)
- [x] 兩個 GET 收可選 `includeEmpty`(query DTO + `@ApiQuery`),鏡射 CH-004 `?includeInactive` 慣例;default = 排除
- [x] `license.controller.ts` 兩個 route 傳落 service;roles / scope **一個字都唔改**
- [x] spec test:filter 兩態(default 排除 / `includeEmpty=true` 含)+ `scopeWhere` 仍生效(R4)+ 總數三欄不變而兩個 count 變(A2)

### Frontend — status + toggle(D3 / D4)
- [x] `lib/ledger.ts` `assetStatus()` 加 `Empty` / **既有** `neutral` tone;**排喺 `overAllocated` 之後**;`Pick` 加 `assignedQuantity`
- [x] `lib/ledger.test.ts` 加:0/0 → `Empty`;`allocated=0, assigned>0` → 仍然 `Over-allocated`(次序守門,A5);`allocated>0, assigned=0` → 仍然 `Headroom`(A4)
- [x] `hooks/queries.ts`:`useLedger` / `useLedgerStats` 收 `includeEmpty` 參數(入 queryKey,避免 cache 撞)
- [x] `by-opco-view.tsx`:加「Show empty rows」toggle,用**既有** `components/ui/checkbox.tsx`(唔加新 primitive)
- [x] toggle 文案講明「empty」≠「已刪除」(R1 mitigation)—— 兩處:checkbox `title` + card subtitle **常駐**寫「hidden, not deleted」(tooltip 一個人 hover 唔到就等於冇講)

## Verification

- [x] **A1** `GET /license/ledger` default 唔含 0/0 / `?includeEmpty=true` 含(貼真 response)—— 103 vs 104,且**兩份 list 只差一行** = `ch008-fixture-empty`
- [x] **A2** stats:兩個 count 變、三個總數不變(貼真 response 對照)—— 三個總數 5305/3448/1857 **完全相同**;`skusTracked` 9→10;`opcosTracked` 23→23
- [x] **A3** 表默認唔見 → 勾 toggle 見到 → 狀態 `Empty` / neutral(browser 實看)—— badge class `bg-neutral-soft text-neutral`;tile 副標同步 9→10 SKUs(D2 自洽)
- [x] **A4** `allocated>0, assigned=0` 默認仍見、仍 `Headroom` —— ⚠️ 畫面上係 **14** 行唔係 spec §1 講嘅 21(SQL 證:**既有** OD2 active-only filter,同 CH-008 無關;見 spec §7 changelog)
- [x] **A5** `allocated=0, assigned>0` 仍 `Over-allocated` / danger —— API + 畫面雙證
- [x] **A6** PATCH 對隱藏 row 仍然有效(row 冇被刪)—— `PATCH /license/ledger/ch008-fixture-empty` **200**,default list 103→104 重新出現
- [x] **A7** OPCO_IT scope regression:只見自己 OpCo(對照 ADMIN)—— 最強一項:**加咗 `includeEmpty=true` 都仲係見唔到 PFU-Asia 嘅 0/0 fixture**(filter 冇取代 scopeWhere,R4)
- [x] **A8** F2 範本 round-trip 仍然 `changes: 0` —— 第一次跑用嘅 fixture SKU 未 curate、根本唔喺範本入面(等於冇驗到),**補咗 curated SKU 上嘅 0/0 fixture** 再跑先算數
- [x] **A9** api **433**(基線 429)· web **188**(基線 180),新 test 覆蓋上述分支
- [x] **A10** lint(api + web)零 output · `tsc --noEmit` 0 · `npm run build` OK
- [x] **A11** 跑 `ui-design` skill;toggle + `Empty` badge **light + dark** 實看(Playwright)—— light `#52525b/#eeeef0` → dark `#a1a1aa/#1c1c20`
- [x] 造 0/0 test row:**冇用 scratch DB 亦冇改任何現存資料** —— 插入 **3 個全新 row**(既有 148 行一個都冇 touch),驗完 `DELETE`;cascade 順帶收走 A6 嗰條 `LedgerAdjustment`。teardown 後 148/0/21/20/8/12/23 **逐個對得返 baseline**,fixture 殘留 = **0**

## Cross-Cutting

- [x] Each commit references `progress.md` Day-N entry(R2)
- [x] Commit message 標 component tag(`feat(license):` + `docs(changes):`,標 CH-008)
- [x] **無 ADR**(D5:零 schema、零新 endpoint,唔觸發 H1)—— `schema.prisma` diff **0**、三個 `package.json` diff **0**
- [x] `BACKLOG.md` 同步(R7)+ **DD-3 註記**本 change 令 create 缺口更明顯
- [x] `progress.md` closeout summary written
- [x] `progress.md` frontmatter status flipped to `done`

---

**Lifecycle reminder**:呢份 checklist 隨 spec acceptance criteria 衍生。新加 item 必須先入 spec + changelog,然後再加 checklist。
