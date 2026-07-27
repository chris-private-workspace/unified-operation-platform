---
change_id: CH-009
title: "Assign 前可用量可見度(OpCo 預算 headroom + tenant seat)"
status: approved           # draft | proposed | approved | active | done | cancelled
created: 2026-07-26
target_completion: 2026-07-29
affects_components: [apps/web/src/pages/request-detail.tsx, apps/web/src/hooks/queries.ts, apps/web/src/lib (new capacity helper)]
spec_refs:
  - DESIGN.md §5(ledger 兩層數字 · 三層 owned/allocated/assigned)
  - AUTH-3a(OPCO_IT per-OpCo scope,後端強制)
  - ADR-0016(OpCo 預算 assign gate —— 本 change 顯示嘅正是佢將會擋嘅數字)
  - CH-008(0/0 row 預設隱藏 —— 有真實交互,見 §2.4)
---

# CH-009 — Assign 前可用量可見度

> **Spec version**:1.0(initial)
> **Owner**:AI(執行)· 決策 = Chris Lai
> **Approved by**:**Chris Lai(2026-07-26)**

## 1. Context (Why)

Chris 2026-07-26 提出:「冇任何先檢查 license 是否有足夠可用 / 可 assign 數量的流程存在。」

查證後**修正咗一半前提**:`assign.service.ts:127-132` **已經有** tenant seat gate(live Graph,`consumedUnits >= prepaidEnabled` → 400,fail-closed,喺 Graph assign 之前)。

**但真正嘅缺口係「時機同可見度」:**

| # | 事實 | 依據 |
|---|---|---|
| 1 | Assign 按鈕只 gate 喺 `isReady && synced`,**旁邊零個容量數字** | `request-detail.tsx:466` |
| 2 | 操作員唯一知「冇位」嘅方法 = **撳落去、等 Graph 來回、食個 400** | `assign.service.ts:128` |
| 3 | 平台**已經有**呢啲數據,只係冇餵到 request 流程 —— `/license/tenant-skus`(三層 owned/allocated/assigned)今日只餵 Assets → Platform view | `queries.ts:97-115` · `platform-view.tsx:64` |
| 4 | OpCo 層預算(`allocated - assigned`)喺 By-OpCo 頁睇到,但**同 request 流程完全分離** | `by-opco-view.tsx` |

⇒ 操作員要開兩個頁、自己記住數字、再返嚟撳。而 **ADR-0016 上線之後,睇唔到嘅嗰個數字會開始擋人** —— 所以本 change 係 ADR-0016 嘅前置可見度工作。

## 2. Scope (What)

### 2.1 Behavior Change

- **Before**:request detail 每個 line item 只顯示 SKU 名 + stage + 一粒 Assign 掣。撳落去先知有冇位。
- **After**:每個**可 assign**嘅 line item 旁邊顯示該 SKU 喺**呢張單所屬 OpCo** 嘅容量:
  - **OpCo 預算**(所有角色):`assigned / allocated`,以及 headroom
  - **Tenant seat**(**只** ADMIN / REGIONAL):tenant 層可用座位

### 2.2 In Scope

**D1 — 兩層數字,兩個既有來源,零 backend 改動**

| 層 | 數字 | 來源 | 角色 |
|---|---|---|---|
| OpCo 預算 | `allocatedQuantity` / `assignedQuantity` | `GET /license/ledger`(既有 `useLedger`) | 全部(含 OPCO_IT) |
| Tenant seat | 三層 owned / assigned | `GET /license/tenant-skus`(既有 `useTenantSkus`) | **ADMIN / REGIONAL only** |

**本 change 唔加 endpoint、唔改 backend、唔改 schema。** 純前端接線 ⇒ **唔觸發 H1**。

**D2 — Scope 天然對齊(唔使額外過濾)**

`GET /license/ledger` 本身已經 per-actor scoped(AUTH-3a):ADMIN 見全部、OPCO_IT 只見自己 OpCo。而 OPCO_IT 本來就只睇到自己 OpCo 嘅 request。⇒ **「呢張單嘅 OpCo × 呢個 line 嘅 SKU」嗰格,actor 一定攞得到**,唔需要新 endpoint、唔需要額外 scope 邏輯。

**D3 — `tenant-skus` 對 OPCO_IT 係 403,所以 lazy fetch**

`license.controller.ts:143` **冇** role override ⇒ 繼承 controller-level `@Roles(ADMIN, REGIONAL)` ⇒ OPCO_IT 打會 **403**。

⇒ 用既有 `useTenantSkus(enabled: boolean)` 嘅 `enabled` 參數,以 `canSeePlatform` gate(**同 `assets.tsx` 一模一樣嘅 pattern**,唔發明新做法)。OPCO_IT **根本唔會發出呢個 request**。

⚠️ OPCO_IT 睇唔到 tenant 層時,**唔可以扮成 0、唔可以顯示錯誤、唔可以留個空殼**——直接**唔顯示嗰一層**。理由:0 會被讀成「冇位」,錯得好危險。

**D4 — 一個 request 多個 line item:一次 list + client-side match,唔逐個 query**

`useLedger` 返 list(dev 現時 148 行,ADMIN);按 `(opcoId, skuCatalogId)` 喺 client 砌 index 對每個 line item lookup。**唔可以** per-line-item 開 query(N+1)。

**D5 — Row 唔存在 = 「未設預算」,唔係「載入中」**

ledger 冇該 `(opco, sku)` 組合 ⇒ 顯示 **`0 of 0 — no allocation set`**(明確狀態),**唔可以**顯示空白 / skeleton / `—`。

理由:呢個狀態喺 **ADR-0016 之下就係「會被擋」**,操作員必須事前睇得出,而唔係撳完先知。

**D6 — 純顯示,唔加 action**

本 change **唔**加 gate、唔改 assign 行為、唔加按鈕。DS-3(一 view 一 primary)維持:Assign 仍然係唯一 primary。

### 2.3 Out of Scope（explicit）

- **OpCo 預算 gate 本身** —— 係 **ADR-0016** 嘅實作,獨立進行。本 change 只顯示數字,唔擋任何嘢。
- **改 tenant seat gate** —— `assign.service.ts:127-132` 一個字都唔改。
- **放寬 `tenant-skus` 畀 OPCO_IT** —— 係 AUTH-3a scope 決定,唔喺本 change 質疑(要改 = H1)。
- **Requests 列表頁顯示容量** —— 只做 detail 頁。列表加 per-row 容量會令 list query 變重,而決定 assign 嘅動作發生喺 detail。
- **Sync 狀態相關顯示** —— ADR-0015 範圍。
- **自動轉 procurement path** —— H3,明確 out。

### 2.4 ⚠️ 同 CH-008 嘅真實交互(**兩個 change 都要知**)

CH-008 令 `GET /license/ledger` **預設排除 0/0 row**。而本 change 靠同一個 endpoint 搵「呢個 OpCo × 呢個 SKU」嗰格。

⇒ **若該格係 0/0,CH-008 之後就搵唔到佢。**

**處理:唔需要特別處理,但必須刻意確認語意一致** —— D5 已規定「搵唔到 = `0 of 0 — no allocation set`」,而 0/0 row 被 CH-008 隱藏時,**真實情況正正就係 allocated=0**。兩者結論相同 ⇒ 顯示正確。

⚠️ 但**唔可以**為咗本 change 而喺 request detail 傳 `?includeEmpty=true`——咁會令 CH-008 嘅預設失效,而且冇必要(D5 已經 cover)。**A4 專門驗呢點。**

> 三者一致性:CH-008 隱藏 0/0 → CH-009 顯示「未設預算」→ ADR-0016 擋。同一個狀態,三個層面講同一件事。

## 3. Acceptance Criteria

- [ ] **A1** ADMIN 開一張 RHK 單:每個可 assign 嘅 line item 見到 **OpCo 預算**(`assigned / allocated` + headroom)**同 tenant seat** 兩層
- [ ] **A2** **OPCO_IT 對照**:同一張單只見 OpCo 層;tenant 層**完全唔出現**(唔係 0、唔係錯誤、唔係空殼);**Network 面板確認冇發出 `/license/tenant-skus` request**(證 lazy gate,唔係靠 UI 遮)
- [ ] **A3** 數字對得返 Assets → By OpCo 同一格(同源,唔可以出現兩個唔同數字)
- [ ] **A4** 造一個 0/0 格 → request detail 顯示 **`0 of 0 — no allocation set`**;且**確認 request detail 冇傳 `?includeEmpty=true`**(唔破壞 CH-008 預設)
- [ ] **A5** 一張多 line item(≥3 個唔同 SKU)嘅單:**只發出一次** ledger query(Network 面板數,證 D4 冇 N+1)
- [ ] **A6** assign 成功之後,顯示嘅數字**即時反映 +1**(`mutations.ts:256` 已 invalidate ledger —— 驗佢真係生效,唔係靠 reload)
- [ ] **A7** test:web ≥ 現行基線 + 新增覆蓋 capacity helper(row 存在 / row 缺 / OPCO_IT 無 tenant 層 三個分支)
- [ ] **A8** `npm run lint`(web)零 output · `tsc --noEmit` 0 · `npm run build` OK
- [ ] **A9** H6:跑 `ui-design` skill;**light + dark 都實看**(Playwright);數字用 **mono**(DS-5);零新色 / 零新 primitive;Assign 仍然係該 view 唯一 primary(DS-3)

## 4. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| **R1** | 🔴 OPCO_IT 誤 fetch `tenant-skus` → **403 令成頁爆** | Med | **High** | 用既有 `useTenantSkus(enabled)` + `canSeePlatform`,同 `assets.tsx` 同一 pattern;**A2 用 Network 面板驗**,唔靠肉眼睇 UI |
| R2 | 顯示 stale 數字,同 assign 當下真實情況唔同 | Med | Med | A6 驗 invalidate;而且**顯示唔係 gate** —— 真正判斷仍喺後端 fail-closed,顯示錯唔會導致錯誤 assign |
| R3 | 誤傳 `?includeEmpty=true` 破壞 CH-008 | Med | Med | §2.4 明文禁 + **A4 專門驗** |
| R4 | 顯示 0 被讀成「冇位」,實際係「未設預算」 | Med | Med | D5 規定文案係 **`no allocation set`** 而唔係淨個 `0`;兩者語意唔同 |
| R5 | per-line-item query 造成 N+1 | Low | Med | D4 明文一次 list + client index;**A5 數 request 數目** |
| R6 | tenant 層 vs OpCo 層兩個數字令人混淆邊個先係會擋佢 | Med | Low | 兩層各自標明( "OpCo budget" / "Tenant seats" );ADR-0016 上線後 OpCo 層先係最常撞嗰個 |

## 5. Effort Estimate

**~4h** — capacity helper + test(1h)· request detail 接線 + 兩層顯示(1.5h)· 角色對照 live 驗(1h)· light/dark + `ui-design`(0.5h)

## 6. Dependencies

- **零 backend 依賴** —— 兩個 endpoint 都已存在且已有 hook。
- **同 CH-008 嘅次序**:兩個都改唔同檔案(CH-008 = `ledger-read.service` + `by-opco-view` + `lib/ledger.ts`;CH-009 = `request-detail` + 新 helper)⇒ **唔會 conflict**,邊個先 merge 都得。但**後 merge 嗰個要跑一次 §2.4 嘅 A4**。
- **同 ADR-0016 嘅關係**:本 change **唔依賴** ADR-0016 approve。建議**先做本 change** —— 令 ADR-0016 上線時操作員已經睇到數字,唔會突然被一個佢從來睇唔到嘅數字擋住。

## 7. Spec Changelog（deviation log）

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-26 | Initial draft(**proposed**) | Chris 提出「冇檢查可用量」;查證修正前提(tenant seat gate 已存在)後,確認真缺口 = 事前可見度;Chris approve 開 change | — |
| 2026-07-26 | **proposed → approved**(spec 內容零改動) | Chris approve。**ADR-0016 同日 Accepted** ⇒ §6 建議嘅「本 change 先行」次序成立:先令操作員睇到數字,gate 才上線 | **Chris Lai** |
| 2026-07-26 | 🔴 **A6 前提修正 + 多改一個檔** | 實作時發現 **A6 建立喺錯誤假設上**:spec 寫「`mutations.ts:256` 已 invalidate ledger」,但逐行核對後 `useAssignLineItem` 嘅 `onSuccess` **只** invalidate `['fulfilment','requests',*]` + `['license','drift']`,**冇** `['license','ledger']`(spec 引用嘅 `:256` 係另一個 mutation)。⇒ 照原樣,assign 之後本 change 新加嘅容量數字唔會更新,操作員會睇到 stale 預算。**修正**:`useAssignLineItem` 加 `invalidateQueries(['license','ledger'])`(prefix 兼收 `…,'stats'`)。**唔** invalidate `tenant-skus`(佢讀 `TenantSkuSnapshot`,assign 唔碰,刻意係 as-of-last-sync)。⇒ affects_components 實際多咗 `hooks/mutations.ts`。理由:呢個 staleness **係本 change 自己製造**(request detail 首次依賴 ledger data),唔算順手改 adjacent code(§1.3) | AI(實作發現);待 Chris 確認 |
| 2026-07-26 | ⚠️ **A6 live 驗方式待 owner 決定** | A6 要真 assign 才驗得到,但 assign **會打真 tenant Graph**(§3.4「Graph / ServiceNow 一律 mock,唔打真 tenant」),而 demo-harness README 明講 `GraphService` **唔 env-mockable** ⇒ 冇現成 mock 路徑。**唔會擅自打真 tenant。** 見 progress Day 1 三個選項 | 待 Chris |
| 2026-07-26 | ➕ **多加一個顯示語意(spec 冇涵蓋)** | 查證 `tenant-owned.service.ts` 發現 `owned`/`tenantConsumed` 來自 **`TenantSkuSnapshot` 最新一筆**,service 註解明文「never calls Graph」⇒ 係 **snapshot 唔係 live**,而 assign gate 用 live Graph,兩者可能唔同。⇒ tenant 層 UI **標明「last sync」**,`owned = null` 顯示 **`unknown — no tenant snapshot`** 而唔係 0(0 會被讀成「冇位」,係另一個而且危險嘅 claim)。呢個係 D1「tenant seat」嘅誠實實作,唔係新 feature | AI(實作發現) |

---

**Lifecycle reminder**:呢份 spec locked after status=approved。重大 deviation → §7 changelog。
**Gate reminder**:status 由 AI 標 `proposed`,**用戶 review + approve 先可以 `approved` + 開始 code**(PROCESS R1.change)。
