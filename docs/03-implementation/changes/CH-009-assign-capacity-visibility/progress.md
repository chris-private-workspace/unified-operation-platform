---
change_id: CH-009
spec_ref: ./spec.md
checklist_ref: ./checklist.md
status: in-progress    # in-progress | done
---

# CH-009 — Progress

> During-execution log + completion summary。每 commit 對應一個 Day-N entry(R2)。

---

## Day 0 — 2026-07-26:Spec drafted(**proposed,未 approve**)

**Action**:CH-009 開單(PROCESS §3),源自 Chris 2026-07-26 提出嘅「問題 2」後半。

### 觸發本 change 嘅 grounding

Chris 講「冇任何先檢查 license 是否有足夠可用 / 可 assign 數量的流程存在」。逐條查 code 之後**修正咗一半前提**:

| 查證 | 結果 | 依據 |
|---|---|---|
| assign 有冇 seat 檢查 | **有** —— live Graph,`consumedUnits >= prepaidEnabled` → 400,喺 Graph assign **之前**、fail-closed | `assign.service.ts:127-132` |
| Assign 按鈕旁邊有冇容量數字 | **冇** —— 只 gate `isReady && synced` | `request-detail.tsx:466` |
| 平台有冇呢啲數據 | **有** —— `/license/tenant-skus` 三層,但只餵 Assets → Platform view | `queries.ts:97-115` · `platform-view.tsx:64` |
| OpCo 層有冇被檢查 | **完全冇** —— seat gate 只睇 tenant 總量 | 同上 |

⇒ 真缺口係**時機同可見度**,唔係「冇檢查」。呢個修正已回報 Chris,佢 approve 開 change。

### 兩個關鍵查證結果(直接定咗 spec 形狀)

1. **零 backend 改動做得到** —— 兩個數據源都已有 endpoint + hook,而且 **scope 天然對齊**:`GET /license/ledger` 本身 per-actor scoped(AUTH-3a),而 OPCO_IT 本來就只睇到自己 OpCo 嘅 request ⇒ 「呢張單嘅 OpCo × 呢個 SKU」嗰格,actor 一定攞得到。唔使新 endpoint、唔使額外 scope 邏輯。
2. 🔴 **`tenant-skus` 對 OPCO_IT 係 403** —— `license.controller.ts:143` **冇** role override,繼承 controller-level `@Roles(ADMIN, REGIONAL)`。所以必須 lazy fetch(`useTenantSkus(enabled)` + `canSeePlatform`,同 `assets.tsx` 同 pattern),而且 OPCO_IT **唔顯示嗰一層**——唔可以扮 0(0 會被讀成「冇位」,危險)。

### ⚠️ 同 CH-008 嘅真實交互(開工前必讀 spec §2.4)

CH-008 令 `GET /license/ledger` 預設排除 0/0 row,而本 change 靠同一 endpoint lookup ⇒ 0/0 格會搵唔到。
**結論:唔需要特別處理,但唔可以圖方便傳 `?includeEmpty=true`**(咁會令 CH-008 預設失效)。D5 規定「搵唔到 = `0 of 0 — no allocation set`」,而該格真實情況正正就係 allocated=0 ⇒ 結論相同。**A4 專門守呢點。**

> 三者一致:CH-008 隱藏 0/0 → CH-009 顯示「未設預算」→ ADR-0016 擋。同一狀態,三個層面講同一件事。

### 同 ADR-0016 嘅次序

本 change **唔依賴** ADR-0016 approve,而且建議**先做**:令 ADR-0016 上線時,操作員已經睇到嗰個數字,唔會突然被一個從來睇唔到嘅數字擋住。

### Blockers

- **spec 未 approve**(`proposed`)→ 依 R1.change,一行 code 都唔寫

**Commit**:`e5ca84e` — `docs: onboarding 流程三個缺口 — CH-009 spec + ADR-0015/0016 + n8n intake handoff`

---

## Day 1 — 2026-07-26:**Spec approved**,gate 解除

**Chris approve**(spec 內容零改動)⇒ `status: proposed → approved`,checklist 解鎖,可以開工。

**ADR-0016 同日 Accepted** ⇒ spec §6 建議嘅次序成立:**本 change 先做**,令 gate 上線時操作員已經睇到嗰個數字,唔會突然被一個從來睇唔到嘅數字擋住。

### 開工提醒(三個最易踩)

1. **`?includeEmpty=true` 唔可以傳**(§2.4 / R3)—— A4 專門守。CH-008 同日 approve,兩者對同一 endpoint 有交互。
2. **OPCO_IT 唔可以扮 0**(D3 / R1)—— `tenant-skus` 對佢係 403,要用 `useTenantSkus(canSeePlatform)` lazy gate;**A2 要用 Network 面板證冇發 request**,唔可以靠肉眼睇 UI 就當過。
3. **唔可以 per-line-item 開 query**(D4 / R5)—— 一次 list + client index;A5 數 request 數目。

**Commit**:`bd6d29f` — approve gate flip + ADR-0015/0016 Accepted + 文檔同步

---

## Day 2 — 2026-07-26:實作(helper + 接線)· **gate 三項過** · A6 前提修正

### 改咗嘅檔(4 個)

| 檔 | 動作 |
|---|---|
| `apps/web/src/lib/capacity.ts` | **新** —— ledger / tenant 兩個 index + lookup(D4 一次 index,唔 per-item query) |
| `apps/web/src/lib/capacity.test.ts` | **新** —— 12 個 test |
| `apps/web/src/pages/request-detail.tsx` | 接線:hooks + 兩層容量顯示 |
| `apps/web/src/hooks/mutations.ts` | 🔴 修 `useAssignLineItem` invalidate(見下) |

### Gate(真 output,唔係推斷)

- **web test 163 passed / 20 files**(基線 151 + 12 新)
- **lint 零 output**
- **`tsc --noEmit` + `vite build` OK** —— 改 `mutations.ts` 之後**重跑過**,chunk hash 由 `index-CVE27SYE` → `index-DqNaGsZl`,證明 build 嘅係改動後嘅 code 而唔係 cache

### 🔴 A6 前提錯(spec bug,已修 + 已 log changelog)

Spec A6 寫「`mutations.ts:256` 已 invalidate ledger —— 驗佢真係生效」。逐行核對後:**`useAssignLineItem` 嘅 `onSuccess` 只** invalidate `['fulfilment','requests',*]` + `['license','drift']`,**冇** `['license','ledger']`(spec 引用嘅 `:256` 係另一個 mutation)。

⇒ 照原樣,assign 成功之後本 change 新加嘅 OpCo budget 數字**唔會更新**,操作員會見到 stale 預算 —— 正好係本 change 想解決嘅反面。

**修**:加 `invalidateQueries(['license','ledger'])`(prefix 兼收 `…,'stats'`)。**唔** invalidate `tenant-skus` —— 佢讀 `TenantSkuSnapshot`,assign 唔碰嗰張表,而且佢刻意就係 as-of-last-sync 數字。

呢個唔算「順手改 adjacent code」(§1.3):staleness **係本 change 自己製造**(request detail 首次依賴 ledger data)。

### ➕ 一個 spec 冇涵蓋嘅誠實性問題

查 `tenant-owned.service.ts` 發現 `owned` / `tenantConsumed` 來自 **`TenantSkuSnapshot` 最新一筆**,service 註解明文寫「**never calls Graph**」⇒ **係 snapshot,唔係 live**。而 assign 嘅 seat gate 讀 **live Graph** ⇒ 兩個數字可以唔同。

⇒ tenant 層 UI **標明 `last sync`**;`owned = null` 顯示 **`unknown — no tenant snapshot`** 而**唔係 0** —— 0 會被讀成「冇位」,係另一個而且危險嘅 claim。

### 兩個實作決定(都係「揀更接近既有 pattern」)

1. **色階鏡射 `by-opco-view.tsx:112`** —— `headroom < 0 ? text-danger : text-fg-muted`,兩態。唔為「冇位但未超」發明第三個色階(By OpCo 頁同一格就係兩態,否則同一數字兩頁兩個色)。「冇位」靠**文案** `no headroom` 講。
2. **文案 keyed on `allocated === 0` 而唔係 `!present`** —— 缺 row 同「row 存在但 0 預算」對操作員係同一件事(冇預算)。`present` 保留做診斷語意(CH-008 隱藏 vs DD-3 從未建),test 有覆蓋。

### ⚠️ Blocker — A6 live 驗方式要 owner 決定

A6 要**真 assign** 才驗得到,但:
- assign 會打**真 tenant Graph**,違 §3.4「Graph / ServiceNow 一律 mock,唔打真 tenant」
- `demo-harness/README.md` 明講 **`GraphService` 唔 env-mockable** ⇒ 冇現成 mock 路徑

**唔會擅自打真 tenant。** 三個選項:
1. **(建議)** 代理驗證 —— 用 By OpCo inline edit(`PATCH /license/ledger/:id`,零 vendor 流量)改一格,睇 request detail 是否即時反映。呢個驗**同一條 query key + reactivity 全通**;assign 那一步嘅 invalidate 就靠 code review(一行,直接可見)。誠實標明「真 assign 路徑未 live 驗」。
2. 加 component test mock `useAssignLineItem` 驗 `invalidateQueries` 被 call —— 驗到 call,驗唔到效果。
3. 真 assign 打真 tenant —— **唔建議**(違 §3.4)。

### 仍未驗

**A1-A6 + A9** 全部未做(要起服務 + Playwright)。A7 / A8 已過。

**Commit**:`<hash>` — `feat(web): CH-009 assign 前可用量可見度`

---

## Completion summary(填於 done)

_(待實作)_
