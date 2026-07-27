---
change_id: CH-008
title: "By-OpCo ledger 空白行(0/0)預設隱藏 + 修正誤導狀態"
status: done               # draft | proposed | approved | active | done | cancelled
created: 2026-07-25
target_completion: 2026-07-28
affects_components: [apps/api/src/license (ledger read-model), apps/web (assets By-OpCo view), apps/web/src/lib/ledger.ts]
spec_refs:
  - DESIGN.md §5(ledger 兩層數字;`allocatedQuantity` 純顯示 / `assignedQuantity` 對帳)
  - ADR-0007(逐格手動校正 · `LedgerAdjustment` audit · over-allocation surface-never-block)
  - DEFERRED_REGISTER DD-3(ledger row 冇 explicit create —— 本 change 嘅鏡像另一半)
---

# CH-008 — By-OpCo ledger 空白行(0/0)預設隱藏 + 修正誤導狀態

> **Spec version**:1.0(initial)
> **Owner**:AI(執行)· 決策 = Chris Lai
> **Approved by**:**Chris Lai(2026-07-26)**

## 1. Context (Why)

Chris 2026-07-25 提出:「某個 OpCo 某種 license 冇數量了,記錄改成 0 之後**仍然存在**,唔知係唔係應該咁。」

埋身查證確認現象存在,並揪到一個**顯示層 bug**:

| # | 事實 | 依據 |
|---|---|---|
| 1 | **冇任何 DELETE 路徑**;`OpcoSkuLedger` 亦**冇 `active` 欄** ⇒ row 一旦建成就永久存在 | `license.controller.ts`(全查)· `schema.prisma:116-128` |
| 2 | read-model **冇零值過濾** —— 只 filter scope + `sku.active` / `opco.active` | `ledger-read.service.ts:19-42` |
| 3 | 前端亦冇 —— 只 filter OpCo + 搜尋字 | `by-opco-view.tsx:257-267` |
| 4 | `ledgerStats` 嘅 `skusTracked` / `opcosTracked` = distinct count over rows ⇒ 0/0 row **虛報**「track 緊幾多」,而該數字**就印喺 Allocated tile 副標** | `ledger-read.service.ts:74-75` · `by-opco-view.tsx:334` |
| 5 | 🔴 **`assetStatus()` 令 0/0 row 顯示成綠色「Headroom」**(判斷次序:over-allocated → `allocated>0 && headroom===0` → 否則 ok)⇒ 讀落係「有剩餘容量」,實際係乜都冇 | `lib/ledger.ts:34-41` |
| 6 | ADR-0007 **完全冇提過刪除** ⇒ 唔係刻意設計,而係**從未決策**嘅缺口 | ADR-0007 grep 零命中 |

**保留 row 本身係對嘅**,兩個決定性理由:
- `LedgerAdjustment.ledger` 帶 **`onDelete: Cascade`**(`schema.prisma:139`)⇒ 硬刪一行 ledger 會**連帶靜靜刪埋佢全部 ADR-0007 audit trail**。
- 平台一貫做法係 **soft-deactivate,從不硬刪**(`SkuCatalog` 明文「never hard-deleted — ledger/snapshot/drift FK 必須完整」· `Opco` CH-004 deactivate · `AppUser` active)。ledger 開硬刪會係全 domain 唯一一個。

∴ 問題唔在「保留資料」,而在「**無條件顯示 + 顯示成綠色**」。本 change 只治後者。

**現況數據(2026-07-25 dev DB 實查)**:148 行,**0 行係 0/0**;**21 行**係 `assigned=0, allocated>0`(= 有預算未派人,**真資訊,唔屬本 change 目標**)。即問題今日未浮現,但路徑真實:手動 edit 改到 0/0、或 import 把某格由 120 改成空白,都會留下 0/0 row。

## 2. Scope (What)

### 2.1 Behavior Change

- **Before**:`GET /license/ledger` 返所有 row(含 0/0);By-OpCo 表照顯示,狀態欄顯示綠色 **Headroom**;`/ledger/stats` 嘅 `skusTracked` / `opcosTracked` 把 0/0 row 計入。
- **After**:兩個 GET **預設排除** 0/0 row,可用 `?includeEmpty=true` 取回;By-OpCo 表加「Show empty rows」toggle;0/0 row 狀態顯示 **`Empty`(neutral)** 而唔再係綠色 Headroom。

### 2.2 In Scope

**D1 — 「empty」嘅定義**:`allocatedQuantity === 0 && assignedQuantity === 0`。
⚠️ `allocated > 0, assigned = 0`(21 行)**明確唔算** —— 佢意思係「有預算、未派人」,係真資訊。

**D2 — 過濾落 read-model,唔止前端**。理由:`skusTracked` / `opcosTracked` 直接印喺 Allocated tile 副標(`by-opco-view.tsx:334`),若只前端隱藏就會出現「副標講 8 SKUs tracked、表只有 7 行」嘅自相矛盾。做法 = `ledger-read.service.ts` 加 empty 過濾 + 兩個 GET 收可選 `includeEmpty` query param —— **鏡射 CH-004 已有嘅 `?includeInactive` pattern**,唔係新發明。

**D3 — 前端 toggle**:By-OpCo view 加「Show empty rows」,用**既有** `components/ui/checkbox.tsx` primitive(唔加新 pattern,H6)。勾選 → query 帶 `includeEmpty=true`。

**D4 — `assetStatus()` 加第四個分支**:`Empty` + **既有** `neutral` tone(唔加新色)。
⚠️ **必須排喺 `overAllocated` 之後** —— 否則 `allocated=0, assigned=5`(真 over-allocated)會被誤判成 Empty。`Pick` 要加 `assignedQuantity` 令條件直白(唔靠 `headroom===0` 推)。

**D5 — 零 schema、零新 endpoint**:唔加 DELETE、唔加 `active` 欄 ⇒ **唔觸發 H1**。

### 2.3 Out of Scope（explicit）

- **DELETE endpoint / soft-delete `active` 欄**(即原討論嘅選項 B / C)—— cascade 殺 audit 嘅問題 + 「此 SKU 對此 OpCo 已不適用」呢個語意,留返同 **DD-3**(冇 explicit create)**一次過**喺 `Drift-resolve` phase 設計。理由:兩者係 ledger row 生命週期嘅兩半,分兩次補會撞埋一齊。
- **`allocated > 0, assigned = 0` 嘅顯示** —— 不變(21 行,係真資訊)。
- **Platform mode / tenant-owned**(`/license/tenant-skus*`)—— 另一個 service(`tenant-owned.service.ts:42` 自己 groupBy),不受本 change 影響;而且 0 對 `_sum` 貢獻 0。
- **`reconcile` / drift** —— 不變(0 對 `Σ assignedQuantity` 貢獻 0)。
- **Overview KPI** —— `overview.tsx:178` 只用 `totalAssigned`,而總數三個欄(`totalAllocated`/`totalAssigned`/`totalHeadroom`)**排除 0/0 後數值完全不變**(0 貢獻 0)⇒ Overview 一個數字都唔會動。
- **F2 allocation 範本** —— `allocation-template.ts` 對缺 row 已 `?? 0` fallback ⇒ 生成內容不變(有 acceptance 驗)。

## 3. Acceptance Criteria

- [ ] **A1** 造一個真 0/0 row(scratch DB,或 dev DB 用 PATCH 改到 0/0 再還原)→ `GET /license/ledger` **默認唔含**該 row;加 `?includeEmpty=true` **含**
- [ ] **A2** `GET /license/ledger/stats` 默認嘅 `skusTracked` / `opcosTracked` **唔再數**該 row;而 `totalAllocated` / `totalAssigned` / `totalHeadroom` **數值不變**(證明只影響 count 語意)
- [ ] **A3** By-OpCo 表默認唔見該 row;勾「Show empty rows」→ 見到,且狀態顯示 **`Empty` / neutral**(**唔係**綠色 Headroom)
- [ ] **A4** `allocated>0, assigned=0` 嘅 row(21 行)**默認仍然顯示**,狀態仍然係 `Headroom` —— 唔可以被誤殺
- [ ] **A5** `allocated=0, assigned>0`(真 over-allocated)仍然顯示 **`Over-allocated` / danger**(證 D4 次序正確)
- [ ] **A6** **PATCH 對隱藏 row 仍然有效** —— 隱藏純顯示層,row 冇被刪(R1 mitigation 驗證)
- [ ] **A7** **OPCO_IT scope regression**:empty filter 同 `scopeWhere` 並存,OPCO_IT 仍然只見自己 OpCo(對照 ADMIN)
- [ ] **A8** F2 範本 round-trip 仍然 `changes: 0`(證 `?? 0` fallback 令範本內容不變)
- [ ] **A9** test 不降 + 新增覆蓋:api ≥ **390** · web ≥ **151**;新 test 至少含 `assetStatus` Empty 分支 + Empty-vs-over-allocated 次序 + read-model filter(含 `includeEmpty` 兩態)
- [ ] **A10** `npm run lint`(api + web)零 output · `tsc --noEmit` 0 · `npm run build` OK
- [ ] **A11** H6:跑 `ui-design` skill;toggle + `Empty` badge **light + dark 都實看**(Playwright,見 memory `ui-verification-route`)

## 4. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| **R1** | 🔴 **隱藏之後改唔返上去** —— 因為冇 create endpoint(**DD-3**),若 0/0 row 被隱藏,用戶就冇路徑把該格由 0 調返非零 | **High**(必然發生,除非有 toggle) | High | toggle 必須**默認可見、易撳**(唔可以藏喺三層菜單);row **冇被刪**所以 PATCH 照 work(A6 驗);toggle 文案講明「empty」唔等於「已刪除」 |
| R2 | 預設 API 行為改變令 consumer 收少啲 row | Low | Med | consumer 只有自己前端 —— by-opco-view(要嘅正是隱藏)+ F2 template(`?? 0` fallback,A8 驗)。已全數盤點 |
| R3 | `skusTracked` / `opcosTracked` 語意改變被誤讀成「數字錯咗」 | Med | Low | A2 明確驗「count 變、總數不變」;spec §2.1 寫明係**語意修正**(tracked = 有數量嘅組合) |
| R4 | filter 寫錯位置令 `scopeWhere` 失效 → **跨 OpCo 洩漏** | Low | **High** | filter 加喺既有 `private where(actor)` **之內**,唔另起 query;A7 對照驗證 |
| R5 | 「empty」定義寫得太闊,誤殺 `allocated>0, assigned=0` | Med | High | D1 明文 + A4 專門守住;test 用 21 行嘅代表 case |

## 5. Effort Estimate

**~5h** — backend filter + param(1.5h)· `assetStatus` + toggle 前端(2h)· test(1h)· live 驗 + light/dark(0.5h)

## 6. Dependencies

- 無外部阻塞。W35 已 merge(`main` = `2982f57`),`useLedger` / `useLedgerStats` / `allocation-template.ts` 現狀已知。
- **與 DD-3 嘅關係**:本 change **唔解** DD-3,但會令 DD-3 更明顯(隱藏之後「想開返一格」嘅需求會浮上水面)。建議 `Drift-resolve` phase 一次過處理 create + delete 兩半。

## 7. Spec Changelog（deviation log）

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-25 | Initial draft(**proposed**) | Chris 提出 0/0 row 唔會消失;查證確認 + 揪到 `assetStatus` 顯示 bug;Chris 揀選項 A(顯示層解決) | — |
| 2026-07-26 | **proposed → approved**(spec 內容零改動) | Chris approve,含明確接受 §4 R1 嘅 trade-off(隱藏後靠 toggle 搵返,DD-3 仍未解)。⚠️ 開工前必讀 **CH-009 spec §2.4** —— 兩個 change 對同一個 `GET /license/ledger` 有交互 | **Chris Lai** |
| 2026-07-27 | **grounding 更正(非決策改動)**:§1 同 §2.2 D1 講嘅「**21 行** `assigned=0, allocated>0`」係 raw table 數;**畫面 / API 實際係 14 行**。差額全部係 W14 開始就有嘅 `sku.active` / `opco.active` 過濾(OD2),**同本 change 無關**。SQL 對數:`budget_no_assign_all=21` · `budget_no_assign_active=14` · `active_rows=104` = `?includeEmpty=true` 嘅 API 行數。**D1 定義同 A4 守嘅嘢一個字都冇變** | 實作期 A4 驗證撞出(Day 2)—— 21 呢個數由頭到尾都唔係「畫面見到嘅行數」 | AI(事實更正,無需 approve) |
| 2026-07-27 | **approved → done** | 11 條 acceptance 全 pass;零 schema / 零 dep / 零 ADR;api 433 · web 188 | — |

---

**Lifecycle reminder**:呢份 spec locked after status=approved。重大 deviation → §7 changelog。
**Gate reminder**:status 由 AI 標 `proposed`,**用戶 review + approve 先可以 `approved` + 開始 code**(PROCESS R1.change)。
