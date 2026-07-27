---
change_id: CH-008
spec_ref: ./spec.md
checklist_ref: ./checklist.md
status: done           # in-progress | done
---

# CH-008 — Progress

> During-execution log + completion summary。每 commit 對應一個 Day-N entry(R2)。

---

## Day 0 — 2026-07-25:Spec drafted(**proposed,未 approve**)

**Action**:CH-008 開單(PROCESS §3)
- Templates copied from `_templates/change/`
- `spec.md` filled,status=**`proposed`** —— 等 Chris review + approve 先可以 flip `approved` 並開工(R1.change)
- `checklist.md` 由 spec §3 acceptance 衍生,**全部 item 鎖住**

### 觸發本 change 嘅 grounding

Chris 問:「某 OpCo 某種 license 冇數量了,記錄改成 0 之後仍然存在,唔知係唔係應該咁。」逐條查 code:

| 查證 | 結果 | 依據 |
|---|---|---|
| 有冇 DELETE 路徑 | **冇**;`OpcoSkuLedger` 亦冇 `active` 欄 | `license.controller.ts` 全查 · `schema.prisma:116-128` |
| read-model 有冇零值過濾 | **冇** | `ledger-read.service.ts:19-42` |
| 前端有冇 | **冇**(只 filter OpCo + 搜尋字) | `by-opco-view.tsx:257-267` |
| stats 會唔會虛報 | **會** —— `skusTracked`/`opcosTracked` 係 distinct count over rows,而該數字**印喺 Allocated tile 副標** | `ledger-read.service.ts:74-75` · `by-opco-view.tsx:334` |
| ADR-0007 有冇講過刪除 | **完全冇** ⇒ 從未決策,唔係刻意設計 | ADR-0007 grep 零命中 |

### 🔴 額外揪到嘅顯示 bug(Chris 冇問)
`assetStatus()` 判斷次序係 over-allocated → `allocated>0 && headroom===0` → **否則綠色 `Headroom`**。
⇒ **0/0 row 會顯示成綠色「Headroom」+ utilization 0%**,讀落係「有剩餘容量」,實際係乜都冇。呢個比「row 唔消失」更誤導,所以一併納入本 change(`lib/ledger.ts:34-41`)。

### 為何唔做真刪除(兩個決定性理由)
1. **`LedgerAdjustment.ledger` 帶 `onDelete: Cascade`**(`schema.prisma:139`)⇒ 硬刪一行 ledger 會**連帶靜靜刪埋佢全部 ADR-0007 audit trail**。
2. 平台一貫 **soft-deactivate、從不硬刪**(`SkuCatalog` 明文「FK 必須完整」· `Opco` CH-004 deactivate · `AppUser` active)—— ledger 開硬刪會係全 domain 唯一一個。

∴ 問題唔在保留資料,而在**無條件顯示 + 顯示成綠色**。Chris 揀**選項 A(顯示層解決)**。

### 現況數據(dev DB 實查)
`SELECT` 結果:**148 行**;`0/0` = **0 行**;`assigned=0 AND allocated>0` = **21 行**(= 有預算未派人,**真資訊,唔屬目標**)。
⇒ 問題今日未浮現,但路徑真實:手動 edit 改到 0/0、或 import 把某格由 120 改成空白。

### 影響面盤點(改之前先數清 consumer)
- `useLedger` → by-opco-view(表)+ **allocation-import**(F2 範本)⇒ 範本對缺 row 已 `?? 0` fallback,內容不變(A8 驗)
- `useLedgerStats` → by-opco-view stat tiles + **overview.tsx:178**(只用 `totalAssigned`)⇒ **Overview 一個數字都唔會動**(0 對總數貢獻 0)
- `platform-view.tsx` 用 `/tenant-skus/stats`(另一個 service)⇒ 不受影響
- 既有 `assetStatus` 3 個 test 全部用 `allocatedQuantity: 10` ⇒ **冇一條 assert 0/0 → Headroom**,加分支唔會撞爛舊 test

### 五個設計決定(spec §2.2)
**D1** empty = `allocated===0 && assigned===0`(`allocated>0, assigned=0` 明確唔算)· **D2** 過濾落 read-model 而唔止前端(否則 tile 副標同表自相矛盾),param 鏡射 CH-004 `?includeInactive` · **D3** toggle 用既有 `checkbox.tsx` · **D4** `assetStatus` 加 `Empty`/neutral 且**排喺 `overAllocated` 之後** · **D5** 零 schema、零新 endpoint ⇒ 唔觸發 H1。

### Blockers
- **spec 未 approve**(`proposed`)→ 依 R1.change,一行 code 都唔寫
- ⚠️ **R1 要 Chris 特別留意**:隱藏之後,因為冇 create endpoint(**DD-3**),用戶會冇路徑把該格由 0 調返非零 ⇒ toggle 係**必需品而非裝飾**。若 Chris 覺得呢個 trade-off 唔可接受,應該考慮連 DD-3 一次過做(即 spec §2.3 講嘅「留返 `Drift-resolve`」)

**Commit**:`40105a8` — `docs(changes): CH-008 spec — ledger 空白行預設隱藏 + 修正誤導狀態`

---

## Day 1 — 2026-07-26:**Spec approved**,gate 解除

**Chris approve**(spec 內容零改動)⇒ `status: proposed → approved`,checklist 解鎖,可以開工。

Chris 明確接受 §4 **R1** 嘅 trade-off:隱藏之後因為冇 create endpoint(**DD-3**),用戶要靠 toggle 搵返該格 ⇒ toggle 係**必需品而唔係裝飾**。DD-3 本身仍然未解(留 `Drift-resolve`)。

### ⚠️ 開工前必讀 —— 同 CH-009 嘅交互(同日 approve)

CH-009(assign 前可用量可見度)靠**同一個** `GET /license/ledger` 做 `(opco, sku)` lookup。本 change 令該 endpoint **預設排除 0/0** ⇒ CH-009 嘅 lookup 對 0/0 格會落空。

**兩者結論一致**(落空 = `allocated = 0` = 「未設預算」),所以唔需要為對方改任何嘢。但 **唔可以**為圖方便而喺 request detail 傳 `?includeEmpty=true` —— 咁會令本 change 嘅預設失效。詳見 CH-009 spec **§2.4**;CH-009 **A4** 專門守呢點。

> 三者一致:本 change 隱藏 0/0 → CH-009 顯示「未設預算」→ **ADR-0016**(同日 Accepted)擋 assign。同一個狀態,三個層面講同一件事。

**Commit**:`<hash>` — approve gate flip + ADR-0015/0016 Accepted + 文檔同步

---

## Day 2 — 2026-07-27:實作 + live 驗證 + 收官

Branch `feat/ch-008-ledger-empty-rows`,stack 喺 `docs/w37-sync-sweep` 之上(#29 → #30 → #31 → 本 change)。
揀 stack 而唔係由 `main` 開,係因為 §2.4 講明「**後 merge 嗰個要跑 A4**」—— 要驗 CH-009 嘅 request detail 有冇偷傳 `includeEmpty`,就一定要 CH-009 嘅 code 喺樹上。

### D1-D5 實作(commit `09dd053`)

五個決定原封落地,無一偏離:

| D | 落點 | 值得記低嘅 |
|---|---|---|
| D1 | `NOT: { allocatedQuantity: 0, assignedQuantity: 0 }` | Prisma 嘅 `NOT` 對 object 係 **AND 之後再 NOT**,正好等於 D1 要嘅語意;`allocated>0, assigned=0` 天然唔中 |
| D2 | 過濾寫喺**既有** `private where(actor, includeEmpty)` 之內 | 唔另起 query 唔係風格問題 —— 另一條 query 就係另一個 `scopeWhere` 可以被漏掉嘅地方(R4) |
| D3 | `Checkbox` primitive + `useLedgerStats(showEmpty)` | stats **跟同一個 flag**,所以 tile 副標「N SKUs tracked」同表上行數永遠對得返 |
| D4 | `Empty` / `neutral`,排喺 `overAllocated` 之後 | `Pick` 加 `assignedQuantity` 令條件直白;連帶要幫既有 3 條 test 補欄位 |
| D5 | 零 schema / 零 dep / 零新 endpoint | `schema.prisma` 同三個 `package.json` diff **都係 0** |

**Query key 形狀改咗** —— `['license','ledger', {includeEmpty}]`。呢個係本 change 唯一一個「唔明顯但會靜靜爆」嘅位:所有 ledger mutation 都係 invalidate `['license','ledger']` prefix,key 由兩層變三層之後 prefix match 仍然成立,但**冇嘢逼佢成立**。所以 `queries.ledger.test.ts` 專登有一條 test 驅動真 `QueryClient` 去證 invalidate 之後真係 refetch(A6 嘅前端另一半)。

### Live 驗證 —— fixture 策略

**冇改任何一行現存資料。** 插入 **3 個全新 row**(RHK / PFU-Asia 上未有 ledger row 嘅 SKU 組合),驗完 `DELETE`:

| Fixture | 值 | 用嚟驗 |
|---|---|---|
| `ch008-fixture-empty` | RHK × AAD_PREMIUM_P2 · **0/0** | A1 A2 A3 A6 A7 |
| `ch008-fixture-over` | RHK × AX7_USER_TRIAL · **0/1** | A5 —— dev DB **一行都冇**呢種 row,唔造就驗唔到次序 |
| `ch008-fixture-curated` | PFU-Asia × DESKLESSPACK(alias `F3 Frontline`)· **0/0** | A8(補驗,見下) |

Teardown 之後 `148 / 0 / 21 / 20 / 8 / 12 / 23` **逐個對得返 baseline**,`fixture_rows_left` / `fixture_adjustments_left` / `ch008_reason_rows_left` 全部 **0**。A6 嗰條 `LedgerAdjustment` 由 `onDelete: Cascade` 帶走 —— 就係令本 change 唔敢做 DELETE endpoint 嗰條 cascade,喺呢度反而啱用。

### 三個「驗到嘢」嘅位

**① A8 第一次跑係假驗。** 出咗 `changes: 0`,睇落過關 —— 但 `AAD_PREMIUM_P2` 根本未 curate、**唔喺範本入面**,即係嗰個 0 同 CH-008 完全無關。補咗 `ch008-fixture-curated`(範本真係會出嗰行)再跑:`F3 Frontline` × `PFU-Asia` cell = `"0"`,round-trip `changes: 0`。呢次先係驗緊「隱藏格 → `?? 0` fallback → 零改動」。

**② A7 唔止「OPCO_IT 只見自己」。** 真正守門嗰條係:OPCO_IT **加咗 `?includeEmpty=true`** 之後,仍然見唔到 PFU-Asia 嗰個 0/0 fixture。若 filter 寫成另一條 query(R4 驚嗰個),`includeEmpty=true` 就會係最容易漏 scope 嗰條路徑。先驗 `/me` 真係 `role=OPCO_IT` + scope=RHK 至數(inactive user 會靜靜 fallback 做 ADMIN)。

**③ A1 有對照組。** 「fixture 唔見咗」證明唔到揀行規則啱 —— 一個掃走更多行嘅實作一樣會令 fixture 消失。所以逐行 diff 兩份 list:**只差一行**,就係 fixture。

### plan / spec 對唔上嘅一處(A4)

spec §1 同 progress Day 0 寫「**21 行** `assigned=0, allocated>0`」。畫面同 API 實際係 **14**。查清楚:21 係 raw table 數,而兩個 GET 由 W14 開始就一直有 `sku.active` / `opco.active` 過濾(OD2)—— SQL 對數:`budget_no_assign_all = 21` vs `budget_no_assign_active = 14`,`active_rows = 104` 啱啱好等於 `includeEmpty=true` 嘅 API 行數。**同 CH-008 無關**,但 spec 嗰個 21 從來就唔係畫面數,已入 spec §7 changelog。

### 紀律自檢

**H1** ✅ 零 schema · **H2** ✅ 零新 dep · **H3** ✅ 冇順手掂 DELETE / `active` 欄(明文留返 DD-3 + `Drift-resolve`)· **H4** ✅ 零 secret / PII;fixture 用 SKU 同 OpCo id,冇 UPN · **H5** ✅ read-model + scope 分支全覆蓋 · **H6** 見下 · **H7** ✅ 每個結論都有真 tool output · **H8** ⚠️ 開頭用 `sed` 讀 CH-009 spec,**違反**,即刻改用 Glob/Grep。

**`ui-design`(H6)**:DS-1 ✅(`bg-neutral-soft text-neutral`,零 hex)· DS-2 ✅(用既有 `neutral` tone,冇調數值)· DS-3 ✅(冇加 accent;view 仍然零 primary)· DS-4 ✅(light + dark 都實 render 過並讀 computed style)· DS-5 ✅(數字欄不變,仍 mono)· DS-6 ✅(冇加 icon)· DS-7 ✅ · DS-8 ✅(`Empty`→neutral 跟 tone map)· DS-9 N/A · DS-10 ✅(Sentence case 短名詞)· DS-11 **部分** —— prototype 冇「empty row」呢個概念,無得 1:1 對;但用嘅係既有 Badge primitive + 既有 tone + 既有 status 欄,屬 spec D4 已 approve 嘅組合,唔係新 pattern · DS-12 N/A。

**Commit**:`09dd053` — `feat(license): CH-008 — 0/0 ledger 行預設隱藏 + 修正誤導狀態`

---

## Completion summary

**Status**:✅ done(2026-07-27)。11 條 acceptance **全部 pass**,零延後項。

問題從來唔係「row 唔消失」—— 保留 row 係啱嘅(cascade 會殺 audit;平台一貫 soft-deactivate)。問題係**無條件顯示 + 顯示成綠色**。兩樣都治咗:預設隱藏(server-side,連 stats 語意一齊修),而真係要睇嗰陣顯示 `Empty` / neutral 而唔係讀落似「仲有位」嘅綠色 Headroom。

**測試**:api 429 → **433**(+4)· web 180 → **188**(+8)。lint 兩邊零 output;`tsc --noEmit && vite build` 過。

**要記住嘅 trade-off(R1,Chris 已明確接受)**:0/0 格隱藏之後,因為冇 create endpoint(**DD-3**),操作員要靠 toggle 先搵返佢。所以 toggle 唔係裝飾 —— 佢係唯一入口。文案喺兩處講明「hidden, not deleted」:checkbox `title` + card subtitle 常駐(只靠 tooltip 等於冇講)。

**下一步順序**:merge 必須 #29 → #30 → #31 → 本 change。
