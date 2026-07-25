---
phase: W35-data-initialisation
name: "License assets 生產數據初始化(runbook + CSV 範本 + baseline 機制)"
sprint_week: W35
start_date: 2026-07-25
end_date: 2026-07-30          # planned, may slip with changelog log
status: active                # draft | active | closed —— Chris approve 2026-07-25(R1)
spec_refs:
  - DESIGN.md §5(初始化流程 / ledger 兩層數字 / 對帳方案甲)
  - ADR-0004(allocation import 機制 · curation-as-scope · allocatedQuantity-only invariant)
  - ADR-0007(ledger 手動管理 / 對回機制)
  - DEFERRED_REGISTER DD-1(殘留 = 生產真數 curation = deploy ops step)
  - W27-d365-scope/CURATION-D365.md(現有唯一 deploy-time curation runbook,只覆蓋 D365)
prior_phase: W34-connector-config-ui
---

# Phase W35 — License assets 生產數據初始化

> **Plan version**:1.1(**active** — plan approved + F3 決策落地)
> **Owner**:AI(執行)
> **Approved by**:**Chris Lai**(2026-07-25;同日拍板 **F3 = 選項 C** → **ADR-0014**)

## 1. Scope

平台功能鏈已完整(catalog / ledger / import / 對帳 / drift / assign 全通),但**「由零到可用」嘅數據初始化路徑係碎片化嘅**:概念散在 `DESIGN.md §5`,curation 步驟只有 D365 一份 runbook,`W33-deploy-exec/plan.md:37` 明列「❌ 真數 curation」未做。同時本次 grounding 揭出**兩個機制缺口**(下述 F3 / F4),其中 F3 直接卡住 `DESIGN.md:96` 要求嘅「上線前建立 baseline 才開始用」。

本 phase 交付:**一份可被第三者照做嘅端到端初始化 runbook**、**CSV 範本下載 + UI 格式說明**(令 upload 功能唔再係盲盒),以及**兩個 H1 機制缺口嘅決策 + ADR**(唔由 AI 單方面拍板)。

**唔做(明確 out-of-scope)**:真 tenant `catalog/sync`(需真 Graph 憑證 — UAT 現係 placeholder,W33 D3)· 真 37-SKU businessAlias curation 內容(= ops 動作,唔係 code)· 自動 Excel→平台 sync(ADR-0004 Neutral 已列為新 tier)· drift 對回自動化(`Drift-resolve` 另案)。

## 2. Deliverables

### F1 — 端到端生產數據初始化 runbook(doc-only)
- **Spec ref**:`DESIGN.md §5`(尤其 line 96 初始化流程)· `ADR-0004` §32 deploy-time ops · `DEFERRED_REGISTER` DD-1 · `CURATION-D365.md`(當範本)
- **Dependencies**:無(純文件,唔觸發任何 hard constraint)
- **內容**:`docs/05-usage/DATA-INITIALISATION.md` —— 由空 DB 到可用,逐步:
  1. `migrate` + `seed`(23 OpCo + break-glass admin)
  2. `POST /license/catalog/sync` → 真 tenant `subscribedSkus` 入 `SkuCatalog`(skuId GUID)
  3. **curate** `businessAlias` / `category`(Catalog 頁 Edit dialog,CH-003)—— curation-as-scope = scope 邊界
  4. `POST /license/ledger/import` dry-run → 核對 `skippedSkuLabels` / `unknownOpcoHeaders` → commit(寫 `allocatedQuantity`)
  5. **建立 `assignedQuantity` baseline**(← F3 機制,決策後補寫)
  6. `POST /license/reconcile` → 確認 drift 清零 → 才開放使用
  7. 驗證清單(每步一個可觀察 check)
- **Acceptance criteria**:
  - 每步都有真 endpoint / UI 路徑 + 一個可觀察驗證,唔留「然後就得」式空白
  - 明確標出邊步需要真憑證、邊步係純 data 動作
  - 把 `CURATION-D365.md:20` 過時句(「直接改 DB;未來 admin UI」)修正 → CH-003 Edit dialog 已存在
  - H4:文件零真實 secret / 零真實 PII(範例一律 placeholder)
- **Effort estimate**:4h
- **Owner**:AI

### F2 — CSV 範本下載 + upload UI 格式說明
- **Spec ref**:`ADR-0004` Decision #1/#2/#6 · `allocation-import.service.ts:52-92`(對映規則真相)· H6
- **Dependencies**:無新 dependency;純前端 + 一個既有 endpoint 嘅資料
- **問題**:`components/settings/allocation-import.tsx` 只有 upload,**全 repo 零 download 實作**(grep `Content-Disposition|attachment|createObjectURL|download` 零命中)。格式規格只活在 ADR-0004 + DTO 註解,UI 一個字都冇提 → 用戶唔可能知要餵咩。
- **內容**:
  - 「Download CSV template」按鈕 —— **client-side 動態生成**(`Blob` + `URL.createObjectURL`,零新 dep):header row 用 `GET /opcos` 真 `Opco.code`;SKU rows 用 `GET /license/catalog` **已 curate 嘅 `businessAlias`**;未 curate 嘅 SKU 另列並提示要先 curate
  - upload 卡加格式說明:三條對映規則(header === `Opco.code` exact · col A === `businessAlias` exact · 格 = 整數 seat)+ 「未 curate = 唔會入 ledger」
- **Acceptance criteria**:
  - **round-trip**:下載範本 → 原封上傳 → dry-run 回 `changes: 0` 且 `unknownOpcoHeaders: []`(證範本格式真係食得落)
  - 動態生成 → OpCo 增減 / alias 改動後範本自動跟住變(唔係靜態檔會過時)
  - 一個 view 一個 primary action(H6 DS)· token-only · light + dark 都驗
  - curation 未做時唔會生一個空範本 → 明確提示「先 curate businessAlias」
- **Effort estimate**:5h
- **Owner**:AI

### F3 — ✅ `assignedQuantity` go-live baseline 機制【H1 gate 已解 → ADR-0014】
- **Spec ref**:`DESIGN.md:96`(上線前建 baseline)· `DESIGN.md:101`(assigned 寫入路徑)· `ADR-0004` Decision #5(**allocatedQuantity-only invariant**)· `ADR-0007`(手動校正)
- **問題(本 phase 最嚴重缺口)**:`assignedQuantity` 係**唯一參與對帳 / drift** 嘅數字,但寫入路徑只有三條 —— allocation-import **明確拒絕**寫它(`allocation-import.service.ts:24-28` 硬 invariant)· assign 每次 +1(要真人 onboarding)· `PATCH /license/ledger/:id` **逐格一個 HTTP call 且 row 必須先存在**。23 OpCo × 37 SKU ≈ **851 格**。若 go-live 唔填 baseline,首次 `reconcile` 會令**每個 SKU 都爆 drift**(tenant `consumedUnits` 對 0)。
- **✅ H1 gate 已解**(2026-07-25):Chris 拍板 **選項 C —— 一次性 ops script `apps/api/prisma/init-assigned-baseline.ts`** → **[ADR-0014](../../adr/0014-assigned-baseline-initialisation.md) Accepted**。實作規格見該 ADR Decision 1-7(沿用 ADR-0004 CSV 格式 + 對映邏輯 · dry-run 先行 · **只寫 assigned**[鏡像反向 invariant]· 每格寫 `LedgerAdjustment` · **ADR-0004 Decision #5 invariant 不變**)。
- 原四選項對照(留檔;被否理由詳見 ADR-0014 Alternatives):

  | 選項 | 做法 | 代價 / 風險 |
  |---|---|---|
  | **A** | 擴 `POST /license/ledger/import` 加 `target: 'assigned'` mode | **直接違反 ADR-0004 Decision #5 invariant** → 要修訂/superseding note;而該 invariant 正是保護 drift baseline 唔被 budget 數污染,風險最高 |
  | **B** | 新 `PATCH /license/ledger/bulk`(批量絕對值 set + `LedgerAdjustment` audit) | 保留 ADR-0004 invariant 不變;語意 = ADR-0007 手動校正嘅批量版;但**永久新增 API surface**,將來 drift 批量對回亦用得著 |
  | **C** ⭐ | 一次性 ops script `prisma/init-assigned-baseline.ts`(讀 CSV → set assigned,dry-run + commit) | 唔加永久 API surface、唔動 ADR-0004;ADR-0004 當年 reject CLI 嘅理由(「每次 re-import 要 dev 介入」)**對一次性 baseline 唔適用**;但將來要重複做就要回頭揀 B |
  | **D** | 唔加機制,靠 W23-B 既有 inline edit 逐格填 | 零 code;但 851 格不現實 —— **除非**實際有存量嘅 (OpCo, SKU) 組合遠少於 851(需 Chris 提供真實數量級) |

- **決策**:**C ✅**(Chris 2026-07-25 approve;AI 建議一致)。⚠️ **B 保留為升級路徑** —— 若日後需要**重複**做批量 assigned 更新(例:`Drift-resolve` 批量對回),訊號係回頭寫新 ADR 升級去 B,**唔好靜靜擴 script 功能**(ADR-0014 Consequences Negative)。
- **Acceptance criteria**(選定後):
  - Chris 拍板記入 progress + ADR(`docs/adr/00NN-*`)
  - dry-run 先行(同 ADR-0004 OD4 精神一致)· 每格改動有 audit trail(`LedgerAdjustment` 或等效)
  - H5:掂 ledger write = critical path → 必須同步寫 test(Graph / SN 一律 mock)
  - **live 驗**:乾淨 DB 跑完 F1 runbook 全鏈 → `POST /license/reconcile` → **drift 清零**(= `DESIGN.md:96` 嘅真正驗收)
- **Effort estimate**:決策 1h + 實作 6h(視選項)
- **Owner**:決策 = Chris Lai · 實作 = AI

### F4 — 🔴 `POST /license/ledger` 建空 row?【H1 決策 gate】
- **Spec ref**:`license.controller.ts`(現無此 endpoint)· `ledger-write.service.ts:58-62`(PATCH 需 row 存在,否則 404)· `ADR-0007`
- **問題**:建 ledger row 只有兩條路 —— CSV import(`upsert` create)· assign 真人(`assign.service.ts:163` upsert)。**純手動由零開一格 = 目前做唔到**。
- **🔴 觸發 H1** → 需決策:

  | 選項 | 做法 |
  |---|---|
  | **A** | 加 `POST /license/ledger`(建 allocated=0 / assigned=0 空 row) |
  | **B** | 唔加 endpoint,改為 import 加 `createMissingRows` flag(現時 `target === before` 即 `0 === 0` 會 skip,所以 0 值格唔會建 row) |
  | **C** ⭐ | **唔做** —— 若 F3 揀 B/C,批量機制順手會建齊所有需要嘅 row,F4 就係偽需求 → 登入 `DEFERRED_REGISTER` 等真實需求出現 |

- **AI 建議**:**C,但要等 F3 決策先** —— F4 係唔係真需求,完全取決於 F3 揀咩。誠實講:如果 F3 解決咗批量建 row,「憑空開一格」嘅真實使用場景我搵唔到(用戶想手動管一個未 import 未 assign 嘅組合 = 罕見)。
- **Acceptance criteria**:決策記入 progress;若揀 C → 寫入 `DEFERRED_REGISTER`(DD-N)並講清恢復條件;若揀 A/B → ADR + test + live 驗
- **Effort estimate**:決策 0.5h + 實作 0–3h
- **Owner**:決策 = Chris Lai · 實作 = AI

## 3. Success Criteria(Phase Gate)

| # | Criterion | Target | Measure | Block closeout? |
|---|---|---|---|---|
| G1 | runbook 可被第三者照做 | 每步有 endpoint/UI + 可觀察驗證 | 本地由乾淨 DB 照 runbook 走一次(catalog sync 除外,見 R1) | Yes |
| G2 | CSV 範本 round-trip | 下載 → 原封上傳 → dry-run `changes: 0` + `unknownOpcoHeaders: []` | live 真跑,貼真 response | Yes |
| G3 | UI 講清格式 | upload 卡列出三條對映規則 + curation 前提 | browser 實看 light + dark | Yes |
| G4 | H1 決策留痕 | F3 / F4 各有 Chris 拍板記錄;實作項有 ADR | `docs/adr/` + progress Day-N | Yes |
| G5 | **baseline → drift 清零** | 跑完全鏈後 `reconcile` 回 0 drift | live `POST /license/reconcile` 真 response | Yes(若 F3 揀實作選項) |
| G6 | test 不降 + lint clean | api ≥ 367 · web ≥ 136(W34 基線)· lint 0 warning | `npm test` / `npm run lint` 真 output | Yes |
| G7 | H4 零洩漏 | runbook / 範本 / 前端零真實 secret 或 PII | 文件 + 生成物實查 | Yes |

## 4. Risks(Phase-Specific)

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **真 `catalog/sync` 驗唔到** —— 需真 Graph 憑證,UAT 現係 placeholder(W33 D3),本地亦無 | **High(近乎確定)** | Med | runbook 該步標明「需真憑證,未 live 驗」;用現有本地 catalog 驗下游步驟。**唔造假 —— 呢個係 honest gap,寫入 progress** |
| R2 | Chris 揀 F3 = D(逐格手填)→ phase 主目標(baseline)達唔到 | Low | High | 決策 gate 前先問清「實際有存量嘅 (OpCo,SKU) 組合數量級」;若 ≫ 100 格則 D 不可行,擺明講 |
| R3 | F3 揀 A → 污染 drift baseline invariant | Low(已標為最高風險選項) | **High** | 若真要揀 A,ADR 必須寫明 invariant 修訂範圍 + 加 test 鎖死「budget 數唔會流入 assigned」 |
| R4 | 範本動態生成時 curation 未做 → 生出空範本反而更誤導 | Med | Med | F2 acceptance 明列:未 curate 時顯示提示而唔生空檔;未 curate SKU 另列 |
| R5 | 本地 ledger 係 `seed-demo-ledger.ts` 隨機假數 → 驗 baseline 時混淆真假 | Med | Med | 驗 G5 用**乾淨 DB**(唔跑 demo seed),避免假數污染 reconcile 結論 |

## 5. Day-by-Day Breakdown(rough)

| Day | Date | Focus | Deliverables targeted |
|---|---|---|---|
| D0 | 2026-07-25 | Kickoff(本 pre-doc)+ 等 approve | — |
| D1 | 2026-07-26 | F1 runbook 草稿 + `CURATION-D365.md` 過時句修正 | F1 |
| D2 | 2026-07-27 | F2 範本生成 + UI 格式說明 + round-trip live 驗 | F2, G2, G3 |
| D3 | 2026-07-28 | **決策 gate**:F3 / F4 提案 → Chris 拍板 → 寫 ADR | F3, F4, G4 |
| D4-D5 | 2026-07-29~30 | F3(+F4)實作 + test + 乾淨 DB 全鏈 live 驗 | F3, G5, G6 |
| D6 | 2026-07-30 | runbook 補回 F3 步驟 + closeout retro + BACKLOG sync | G1, G7 |

## 6. Dependencies on Prior Phase

Carry-over from `W34-connector-config-ui/progress.md`:
- 無直接技術 carry-over(W34 = connector 配置,與 data init 正交)
- 但 W34 建立嘅「非機密落 DB / secret 仍 env」邊界對 F1 runbook 有影響:runbook 講到 Graph / SN 憑證時,要指向 ADR-0013 嘅 config 路徑(UI 可改非機密欄),唔可以叫人手改 secret 落 DB

外部前置:
- **F3 / F4 需 Chris 拍板**(H1 決策 gate,D3)—— 唔 approve 就唔動 code
- R1 真憑證屬 `DEPLOY-harden` 範圍,本 phase 唔負責解

## 7. Plan Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-25 | Initial plan(**draft**) | Chris 要求開 phase 統籌四個 data-init 缺口 | — |
| 2026-07-25 | **status draft → active**;plan version 1.0 → 1.1 | Chris approve plan(R1 pre-doc gate 達成)| **Chris Lai** |
| 2026-07-25 | **F3 H1 gate 解除** → 選項 **C**(一次性 ops script);寫 **ADR-0014**;D3 決策提早於 D1 完成 | Chris 同日拍板,唔需等 D3 | **Chris Lai** |
| 2026-07-25 | **F2 deviation ①**:順手修 panel 一句過時文案(「only curated **M365** … D365 skipped」→ 「only SKUs you have curated …」) | 該句自 ADR-0008 D5 / W27 起已錯,且喺我改動嘅同一段文案內 | AI(記錄待 owner 過目) |
| 2026-07-25 | **F2 deviation ②**:plan 只要求純函數 unit test,實際另加 **5 個 component test** | G3(browser light+dark)被 Chrome extension 未連上封鎖 → 補償性自動驗證,否則 UI 層零驗證 | AI(記錄待 owner 過目) |
| 2026-07-25 | **G3 未達標**(browser light+dark 未驗)—— 唔阻 F2 其餘項,但 closeout 前必須補 | Chrome extension not connected | — |

---

**Lifecycle reminder**:呢份 plan locked after status=active。重大 deviation 入第 7 節 changelog,小 detail 變動可直接 inline edit。
**H1 提醒**:F3 已 approve(ADR-0014,可實作)。**F4 仍未拍板 —— 未 approve 之前一行 code 都唔寫**(CLAUDE.md §5.1)。
