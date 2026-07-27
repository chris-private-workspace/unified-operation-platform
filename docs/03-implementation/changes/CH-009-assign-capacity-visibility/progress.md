---
change_id: CH-009
spec_ref: ./spec.md
checklist_ref: ./checklist.md
status: done           # in-progress | done
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

**Commit**:`f15f17c` — `feat(web): CH-009 assign 前可用量可見度`

---

## Day 3 — 2026-07-26:Live 驗(**A1-A5 + A9 過**;A6 誠實拆解)

### 環境

跑 `restart-stack` skill 四步。**全 stack 真重起兩次**:
- 第一輪(ADMIN):api pid 41280 → **57232** · web 48968 → **86028** · 三個 endpoint 真 200 · leak watch **11**(健康)
- 第二輪(OPCO_IT run-as):api → **56528** · web → **51364**
- 還原:api → **100124** · web → **93752**

kill list 15 個逐行核對全部 trace 得返本項目;preflight 嘅兩個 `[other]`(worktree setup-runner、Claude Code 自己嘅 pwsh)**冇入 list** ⇒ 冇誤殺。

### 選單:一張單覆蓋三個 acceptance,**零 DB 改動**

`cmrdnmi7w000h8yb0h8ieqpol`(PFU-Asia)三個 line item 剛好齊:

| SKU | stage | ledger | 驗到 |
|---|---|---|---|
| Power BI Pro | READY | 43/36 | **A1 / A3** |
| Microsoft 365 Copilot | OPCO_APPROVED | **冇 row** | **A4** |
| Office 365 F3 ×5 | READY | **冇 row** | **A4** |
| Office 365 F3 ×1 | **ASSIGNED** | — | ➕ 終態唔顯示 |

> 💡 **A4 唔需要造 0/0**:ledger 只有 148 行而組合空間有 2369 個 ⇒ 天然大量缺 row。⇒ **dev DB 零改動、零 `LedgerAdjustment` 污染、唔需要 scratch DB**。

### 結果(全部真證據)

- **A1 ✅** 三個 line item 都渲染兩層。
- **A3 ✅** `36/43 · 7 left` 對 DB `43/36`;tenant 三個都對得返 `TenantSkuSnapshot`:`0/263` → `0 free of 0`(**證 `Math.max(0,·)` floor 生效**)· `761/769` 超用 → `0 free of 761` · `0/52` → `0 free of 0`。
- **A4 ✅** 兩個缺 row 顯示 `0/0 · no allocation set`;network 只見 `/api/license/ledger`(**無 query string** ⇒ 冇傳 `includeEmpty`,守 §2.4)。
- **A5 ✅** 3 個 SKU → `/api/license/ledger` **只出現一次**(network #100)⇒ 零 N+1。
- **A2 ✅** OPCO_IT 對照:**先驗 `/me` 真返 `OPCO_IT`/`RHK`**(關鍵 —— `resolveDevUser` 用 `where:{email,active:true}`,inactive 會**靜靜 fallback 到 ADMIN**,唔驗就係假驗證);scoped `/fulfilment/requests` 返 **1 張**(ADMIN 6 張);開單後 `/license/tenant-skus` **完全唔喺 network list**(ADMIN 有 `#101 200`)+ DOM `hasTenantSeats:false` + **0 console error**;role label `RHK — RHK only`。
- **A9 ✅** light + dark 都實看(截圖);`getComputedStyle` 證 token 隨 `.dark` swap(`rgb(157,157,167)` on `rgb(8,8,10)`,對比充足)。
- **➕ 終態唔顯示 ✅** 同一張單 `Assigned` 嗰個 F3 **完全冇容量行**。

### `ui-design` 逐條(A9)

DS-1 ✅ 零 hex,全部 `text-fg-subtle`/`text-fg-muted`/`text-danger`/`font-mono` · DS-2 ✅ 色階**直接鏡射** `by-opco-view.tsx:112` 既有判斷,冇自己調數值 · DS-3 ✅ 冇加任何 action,Assign 仍唯一 primary · DS-4 ✅ 兩個都行過 · DS-5 ✅ 數字全 mono(DOM class 為證)· DS-6 ✅ 冇加 icon · DS-7 ✅ 冇 shadow/gradient/blur · DS-8 ✅ 冇自創狀態色 · DS-9 ✅ 冇 motion · DS-10 ✅ 短名詞 + sentence case(`OpCo budget` / `Tenant seats` / `no allocation set` / `last sync`)· DS-12 N/A。

⚠️ **DS-11(對住 prototype 睇)= 部分**:prototype **冇**呢個容量資訊行(佢係新資訊層)。依 H6「組合既有 primitive / 用 token 砌 = OK」,我用既有 token + 同 `pathLabel` 同級嘅排版慣例(`text-[11.5px] text-fg-subtle`)。**但既然 prototype 冇對應物,視覺可接受度最終要 owner 睇截圖拍板。**

### ⚠️ A6 —— 代理驗證證明唔到,冇砌假驗證

Chris 揀咗「代理驗證」。落手時發現**代理本身證明唔到目標命題**:
- 要用 By OpCo inline edit 觸發 invalidate,就必須 **navigate 離開** request detail;返嚟時係 **re-mount 觸發 fetch**,唔係 invalidate 生效 ⇒ 見到新數字係「睇落成功」但**完全冇驗到 invalidate**(正是 memory `verification-that-proves-nothing`)。
- `window.__TANSTACK_QUERY_CLIENT__` **唔 expose**(實測 `hasClient:false`)⇒ 冇法喺同一頁手動觸發 invalidate。
- 唔可以撳 `Assign now` —— 會嘗試打**真 tenant Graph**。

**誠實拆解**:

| 命題 | 狀態 |
|---|---|
| 容量數字真來自 `['license','ledger']`(key 冇打錯) | ✅ **A1 已證**(36/43 正確顯示) |
| invalidate 該 key → re-fetch | TanStack Query 框架保證,唔屬項目要驗 |
| assign 成功後**有** invalidate 該 key | ⚠️ **一行 code(已加),未經真 assign live 驗** |

⇒ **A6 留 unchecked**,等 owner 決定(加 component test / 接受 code review / 等有 mock Graph 路徑)。

### 環境還原(證據)

run-as env 已清(`/me` 驗返 **ADMIN** / `opcoScope:null`)· 注入嘅 `uop.localProfile` 已 `removeItem`(只剩 `uop.ui`)· theme 復原 light · repo root 嘅 `ch009-light.png` 已刪(`.playwright-mcp/` 本身喺 `.gitignore:40`)· `git status` 乾淨(只餘一個**唔屬本 change** 嘅 untracked `docs/06-reference/03-n8n-workflow/`,未碰)。

**Commit**:`3be9f03` — live 驗結果入 checklist + progress

---

## Day 4 — 2026-07-26:A6 收尾(component test)· **CH-009 done**

Chris 拍板 A6 用 **component test** 收尾。

### 新 `apps/web/src/hooks/mutations.assign.test.ts`(4 test)

專門用**真 `QueryClient` + `vi.spyOn(client, 'invalidateQueries')`**,而唔係跟其餘 component test 嘅慣例 mock 走 hooks —— 因為 mock 走 hooks 對「有冇 invalidate」呢個命題**證明唔到任何嘢**。

四條:① 有 invalidate `['license','ledger']` ② **冇** invalidate `['license','tenant-skus']`,亦**冇**用更闊嘅 `['license']`(守 D1 刻意決定:tenant 層係 as-of-last-sync,擴 prefix 會令 `last sync` 標籤變成謊話)③ 既有三個 invalidate 仍在(requests / requests list / drift)④ assign **失敗**時一個都唔 invalidate。

### 🔴 跑咗 mutation check —— 證明呢個 test 真守得住

綠色本身唔證明 test 有效,所以真做一次:

1. 暫時移走 `qc.invalidateQueries({ queryKey: ['license', 'ledger'] })`
2. 跑 → **真係紅**:`× invalidates the ledger … → expected [ …(3) ] to include '["license","ledger"]'`(**1 failed / 3 passed** —— 其餘三條仍綠 = 各驗自己命題,冇互相掩蓋)
3. 加返 → 綠

**還原有證據**(唔靠「我加返咗」):`git diff HEAD -- apps/web/src/hooks/mutations.ts` **零 output** + build chunk hash 仍然 `index-DqNaGsZl`(同還原前一致)。

### A6 最終狀態(三句)

| 命題 | 狀態 |
|---|---|
| 容量數字真來自 `['license','ledger']` | ✅ A1 live 證 |
| assign 成功後**有** invalidate 該 key | ✅ **本 test 證,且經 mutation check 證明守得住** |
| 真 assign 端到端(Graph → ledger +1 → UI) | ⚠️ **仍未 live 驗** —— 打真 tenant(§3.4),`GraphService` 唔 env-mockable |

### Gate(真 output)

**web test 167 passed / 21 files**(151 基線 → 163 → **167**)· lint **零 output**(修咗一個 prettier 換行)· `tsc --noEmit` + `vite build` OK。

---

## Completion summary

**CH-009 done(2026-07-26)。** Request detail 每個未 assign 嘅 line item 顯示兩層容量,操作員撳 Assign 之前就知有冇位。

**交付**:`lib/capacity.ts` + `capacity.test.ts`(12)· `pages/request-detail.tsx` 接線 · `hooks/mutations.ts` 一行 invalidate 修正 · `hooks/mutations.assign.test.ts`(4)。**零 backend / 零 schema / 零新 endpoint / 零新 dep / 無 ADR。**

**Spec 之外做咗三件**(全部已 log spec §7):① 修 `useAssignLineItem` 缺 invalidate(A6 前提錯,唔修則本 change 反效果)② tenant 層標 `last sync` + `owned=null` 顯示 `unknown` 而唔係 0(查證確認係 snapshot 唔係 live Graph)③ 加 tenant helper。

**驗證**:A1-A5 + A7-A9 全過(live + DOM + network 面板證據);A6 由 component test + mutation check 覆蓋。**測試 151 → 167**。

**兩個 carry-over**:
1. 🚧 **CH-008 落地後重跑 A4 交互驗**(§2.4)—— 今日驗嘅係「天然冇 ledger row」,而 CH-008 嘅「0/0 被隱藏」係另一條路徑(結論相同,路徑未驗)。
2. ⚠️ **真 assign 端到端未 live 驗** —— 需要 mock Graph 路徑(`GraphService` 目前唔 env-mockable),或者等 UAT 有真 tenant。

**一個要 owner 留意嘅視覺點**:`ui-design` DS-11 = 部分 —— prototype **冇**呢個容量資訊行(新資訊層)。已依 H6 用既有 token + 同 `pathLabel` 同級排版,light/dark 截圖已交 owner,**未收到視覺異議**。

**Commit**:`<hash>` — A6 component test + mutation check + closeout
