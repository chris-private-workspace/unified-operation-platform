---
phase: W35-data-initialisation
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: in-progress    # in-progress | closed
---

# Phase W35 — Progress

> Daily progress + 結尾 retro。
> 每 commit 必須對應一個 Day-N entry mention(R2 binding rule per PROCESS.md §5)。

---

## Day 0 — 2026-07-25: Kickoff

**Action**:Phase W35 kickoff(pre-doc,**status=draft — 等 Chris approve 先 flip active**,R1)
- Templates copied from `_templates/phase/`
- `plan.md` filled,status=`draft`
- `checklist.md` derived from plan deliverables(F3 / F4 全部 item 標 **[BLOCKER]** 鎖住)
- Carry-over from W34 retro:無直接技術 carry-over;但 W34 ADR-0013「非機密落 DB / secret 仍 env」邊界會影響 F1 runbook 講憑證嗰段

### 觸發本 phase 嘅 grounding(Chris 提問 → 埋身查證)

Chris 問四件事:(1) 部署後點初始化 license assets(2) 唔用 template 可否從 0 建(3) 冇 template 可下載 / 唔知格式(4) 點 match SKU catalog。逐項查實際 code,結論:

| 問題 | 查證結果 | 依據 |
|---|---|---|
| 初始化有冇規劃 | **有概念,冇 runbook**。`DESIGN.md:96` 定咗流程;DD-1 明寫「殘留 = deploy ops step」;但唯一真 runbook 只覆蓋 D365 | `DESIGN.md:96` · `DEFERRED_REGISTER` DD-1 · `CURATION-D365.md` · `W33-deploy-exec/plan.md:37`「❌ 真數 curation」 |
| 從 0 建 ledger | **部分可以**:CSV import(upsert create)✅ · assign 真人(upsert)✅ · **純手動開一格 ❌** —— PATCH 需 row 已存在,而**冇 `POST /license/ledger`** | `allocation-import.service.ts:118` · `assign.service.ts:163` · `ledger-write.service.ts:58-62` · `license.controller.ts` 全查 |
| template 下載 | **確認完全冇**。grep `Content-Disposition\|attachment\|createObjectURL\|download` 於 `apps/` **零命中**(唯一命中係 upload 個 `accept=".csv"`) | `allocation-import.tsx:95` |
| SKU 匹配方式 | **只靠 `businessAlias` 逐字 exact match**(trim 後),零 fuzzy;curation-as-scope = 冇 alias 就永不入 ledger;curation **有 UI**(CH-003 `EditSkuDialog`)| `allocation-import.service.ts:67-92` · `catalog.tsx:58` · ADR-0004 Decision #3 |

### 額外發現(Chris 冇問但更嚴重)

**`assignedQuantity` go-live baseline 冇任何批量機制** —— 全 repo 只有三處寫 assigned:import **明確拒絕**寫(硬 invariant)· assign +1 · PATCH 逐格。而 `DESIGN.md:96` 要求「上線前建立 baseline 才開始用」,`assignedQuantity` 又係**唯一**參與 drift 嘅數字。23 × 37 ≈ 851 格。若唔填,首次 reconcile **每個 SKU 都爆 drift**。→ 升為 **F3**,並因觸發 H1 而設決策 gate。

### 本地數據真假(避免後續驗證混淆)

- `Opco`(23)= 真(照真 Excel 建)
- `SkuCatalog` = **seed 故意唔 hardcode**(`seed.ts:105` 註),要 `catalog/sync` 灌
- `OpcoSkuLedger` = 🔴 **假** —— `seed-demo-ledger.ts` 用 `Math.random()`,檔頭自認 `DEV/DEMO ONLY`
- ∴ 驗 G5(drift 清零)必須用**乾淨 DB**,唔跑 demo seed(R5)

### 決策 / Open Questions(待 Chris)

- **OQ-W35-1(F3)**:baseline 機制揀 A(擴 import,違 ADR-0004 invariant)/ B(bulk PATCH)/ **C(一次性 ops script,AI 建議)** / D(逐格手填)?
- **OQ-W35-2(F3 前置事實)**:實際有存量嘅 (OpCo, SKU) 組合數量級係幾多?(決定 D 是否現實)
- **OQ-W35-3(F4)**:`POST /license/ledger` 建空 row 係唔係真需求?AI 傾向 **C(唔做)**,但要等 F3 決策先重評。

**Blockers**:plan 未 approve(status=draft)· F3 / F4 未拍板 → 依 H1,一行 code 都唔寫

**Commit**:`26067d2` — `chore(planning): kickoff W35 data-initialisation`

---

## Day 1 — 2026-07-25:Plan approve + F3 決策(提早於 D3 完成)

### Done
- **Plan approved**:Chris 2026-07-25 approve → `plan.md` status `draft` → **`active`**,version 1.0 → 1.1,changelog 加兩行(R1 pre-doc gate 達成 → F1/F2 可開工)
- **F3 H1 gate 解除**:Chris 拍板 **選項 C —— 一次性 ops script**;寫 **[ADR-0014](../../adr/0014-assigned-baseline-initialisation.md)**(Accepted)+ `docs/adr/README.md` index 加行
- `checklist.md` F3 段解鎖並改寫成 ADR-0014 實作規格(9 個 atomic item);決策三項 tick

### Decisions / Open-Questions Resolved
- **OQ-W35-1 → resolved = C**(一次性 ops script `apps/api/prisma/init-assigned-baseline.ts`)。關鍵理由:baseline 建立按 `DESIGN.md §5:96` 係**上線前一次性**動作 → 唔值得為此擴 ADR-0004 invariant(A)或新增永久 API surface(B)。ADR-0004 當年 reject CLI 嘅理由(「Regional IT 每次 re-import 要 dev 介入」)針對**重複性**更新,對一次性 baseline 唔適用。(R4:已同步 plan §2 F3 + ADR index)
- **明文記低升級訊號**:若日後需要**重複**批量 assigned 更新(例 `Drift-resolve` 批量對回)→ 回頭寫新 ADR 升級去選項 B,**唔好靜靜擴 script 功能**(ADR-0014 Consequences Negative;checklist 亦寫入)
- **R3 已無效化**:原風險係「揀 A 會污染 drift baseline」;揀 C 令 ADR-0004 Decision #5 invariant **完全不變**,故該風險消失。改由新 test 守**反向** invariant(script 絕不改 `allocatedQuantity`)

### Blockers
- **OQ-W35-2 仍 open**(真實有存量嘅 (OpCo, SKU) 組合數量級)—— **唔阻塞**:ADR-0014 已按最壞情況(851 格)設計,script 對細數據集一樣適用
- **F4 仍未拍板**(`POST /license/ledger` 建空 row)—— 刻意留待 F3 script 落地後重評,因為批量 create row 可能令 F4 變偽需求。checklist F4 段保持 `[BLOCKER]`

### Actual vs Planned Effort
| Deliverable | Planned (h) | Actual (h) | Variance |
|---|---|---|---|
| F3 決策 + ADR | 1.0 | 1.0 | 0 — 提早於 D3 發生(Chris 同日拍板) |

### Commits
- `26067d2` — `chore(planning): kickoff W35 data-initialisation`
- `<hash>` — `docs(planning): W35 plan approve + ADR-0014 assigned baseline 決策`

---

## Day 2 — 2026-07-25:F1 runbook 完成

### Done
- **`docs/05-usage/DATA-INITIALISATION.md`** 建成(依 `_TEMPLATE-how-to.md` 格式):前置表 → 七步(每步含 UI 路徑 + endpoint + 預期輸出 + 驗證)→ 驗證段 → 8 行 FAQ → 相關文件
- 步 4 附**真 CSV 例** + 三條對映規則表(header exact `Opco.code` / col-A exact `businessAlias` / 格非負整數)
- 步 5 = ADR-0014 script 佔位(形態 + dry-run/commit 用法),並列「**唔可以咁做**」四項(期望 import 填 assigned · 靠 assign 補歷史 · 逐格填 851 格 · 擴 script 做重複更新)
- `CURATION-D365.md`:修正過時句(`:20`「直接改 DB;未來 admin UI」→ CH-003 Edit dialog 已建)+ 加上位文件連結,明確分工(通用步驟睇 runbook / D365 約定值睇該文件)

### G1 驗證實據(唔碰現有 dev DB)

**步 1 —— scratch DB `platform_w35_verify`**(`CREATE DATABASE` → 驗 → `DROP DATABASE`;真 `platform` DB 全程未動,drop 後 `\l` 確認只剩 platform/postgres/template*):
- `npx prisma migrate deploy` datasource 行確認打中 **`platform_w35_verify`**(shell env 蓋過 `.env`),**11 個 migration 全部 applied**
- `npm run seed` 真 output 兩行,與 runbook 步 1 寫嘅**逐字一致**:`LOCAL_ADMIN_INITIAL_PASSWORD not set — skipping local admin seed.` + `Seeded 23 OpCos + admin + RHK OPCO_IT user.`
- `ANALYZE` + `pg_stat_user_tables`:**15 表**,有 row 嘅只有 `AppUser`=2 · `Opco`=23 · `_prisma_migrations`=11 → **`SkuCatalog` / `OpcoSkuLedger` / `DriftAlert` 全 0**,實證 runbook「seed 唔建 catalog / ledger」嘅聲明(`seed.ts:105` 註)

**步 4 —— dry-run 真 round-trip**(現有 dev DB,`dryRun: true` 寫唔到 DB,`committed: 0` 佐證):
餵一個**刻意含三種情況**嘅 CSV(真 `Opco.code` ×2 + `Grand Total` + 假 code `NOSUCHOPCO`;真 curated alias `F3 Frontline` + 未 curate label),回應逐條印證 runbook 步 4 嘅規則:
- `opcoColumns: 2` —— `Grand Total` 被忽略 ✅
- `unknownOpcoHeaders: ["NOSUCHOPCO"]` —— 對唔上唔會靜靜食咗 ✅
- `mappedSkuRows: 1` · `skippedSkuLabels: ["Definitely Not A Curated Label"]` —— curation-as-scope ✅
- `changes` 逐格列 before → target → delta(含 `70 → 3` = `-67`)✅

**真實數據佐證 curation 就係 scope 閘門**:本地 `GET /license/catalog` = **99 個 active SKU,只有 8 個有 `businessAlias`** —— 即現狀下 91 個 SKU 永遠入唔到 ledger,直到有人 curate。

### 🔴 未驗證(honest gap,唔造假)
- **步 2**(`catalog/sync`)+ **步 6**(`reconcile`)**都未 live 驗** —— 兩者都 live 讀 tenant,本地同 UAT 都冇真 Graph 憑證(UAT 係 placeholder,W33 D3)
- 步 5 script 本身未存在(F3 待實作)→ 步 5 只有形態,未有真 output
- 步 7 第 4-5 項(`tenant-skus` 合理性 / **零 OPEN drift**)未驗 —— 依賴步 2/6

### Decisions / Open-Questions Resolved
- **新發現(runbook 已補)**:步 6 reconcile **同樣硬依賴 Graph**(`reconcile.service.ts:22` live `consumedUnits`)。原本 plan 只當步 2 有此限制;實際係**冇真憑證連 go-live gate(零 drift)都過唔到** → 真憑證唔係「之後補」,係初始化硬前置。已同步落 runbook 三處(前置表 / 步 6 / FAQ),並令 `DEPLOY-harden` 對本 phase 嘅阻塞關係更明確(R1 影響範圍由一步擴至兩步)
- **驗證手法決定**:用 scratch DB 而非重置 dev DB —— dev DB 有 demo 數據,重置屬破壞性且對驗證無額外價值(R5 只要求「驗 baseline 用乾淨 DB」,scratch DB 已滿足)

### Blockers
- 無新增。F1 完成;F2 可即開;F3 script 可即開(ADR-0014 已 Accepted)
- F4 仍 `[BLOCKER]`(等 F3 落地後重評)

### Actual vs Planned Effort
| Deliverable | Planned (h) | Actual (h) | Variance |
|---|---|---|---|
| F1 runbook | 4.0 | ~3.5 | −0.5 |

### Commits
- `<hash>` — `docs(usage): W35 F1 — license assets 生產數據初始化 runbook`

---

## Day 3 — 2026-07-25:F2 CSV 範本 + UI 格式說明完成

### Done
- **`lib/allocation-template.ts`** 純函數(零新 dep):header ← 真 `Opco.code`(sorted)· rows ← 已 curate `businessAlias`(sorted)· RFC 4180 引號逃逸 · BOM 前置(Excel UTF-8,後端 `parseCsv` 會 strip)· `Grand Total` 刻意唔生
- **`allocation-import.tsx`**:Download template 掣(secondary)· CSV format 說明卡(三條規則)· 未 curate SKU 提示(capped 12 + 「+N more」)· 描述補「只更新 allocated,assigned 永不受影響」
- **test**:10 純函數 + 5 component;web **136 → 151**;lint 0 · tsc 0 · build 成功(最大 chunk 254KB 不變)

### 兩個設計決定(值得記錄)
1. **動態生成,唔用靜態檔** —— OpCo(CH-004 可改)同 curated alias(CH-003 可改)都會變,靜態範本必然過時。
2. **格填「當前 `allocatedQuantity`」而唔係空白** —— 令「下載 → 原封上傳」= 零改動(import `target === before` 就 skip),操作者係**改現有數字**而唔係由白紙打 23×N 格。全新系統仲未有 ledger row → 每格自然係 0,退化成純結構範本,round-trip 一樣零改動。**呢個決定係 G2 acceptance(`changes: 0`)成立嘅前提** —— 若範本留空白,原封上傳會把所有現有 allocation 歸零,`changes` 等於現有非零格數,G2 反而唔可能過。

### G2 驗證實據(真 round-trip)
用**真嘅生成函數**打**真後端**(臨時 test 檔,驗完已刪,唔入 repo):
- 生成:`opcos=23 curatedSkus=8 uncurated=91`;header 第一行含真 code(`PFU-Asia,PFU-HK,RAP,RAPO/APTC,…,RVN`)
- dry-run 回應:`{"opcoColumns":23,"skuRows":8,"mappedSkuRows":8,"changes":0}` · `skippedSkuLabels: []` · `unknownOpcoHeaders: []` · `committed: 0`
- ⇒ **範本格式真係食得落**,而且 idempotent

### H6 / ui-design 自檢 —— 揪到兩個真問題(已修)
- **DS-2(唔 eyeball)**:我原本寫 `gap-[5px]` / `mt-[9px]`,係檔內冇出現過嘅新間距值 = 憑感覺調 → 改用既有 scale `gap-[6px]` / `mt-[8px]`
- **DS-5(識別碼 mono)**:未 curate 列表出嘅係 `skuPartNumber`(識別碼,唔同於既有 skipped list 嘅 business alias 散文標籤)→ 加 `mono` prop,只套用喺新 note(唔改既有 alias 列表,out of scope)
- 其餘:DS-1 色 ✅ 零 hex(grep 實查)· DS-3 ✅ Download = secondary,唯一 primary 仍係 Preview/Commit · DS-6 ✅ lucide `Download` stroke · DS-7 ✅ 無陰影/gradient,深度靠 1px border + `bg-hover` · DS-9 ✅ 零 motion · DS-10 ✅ sentence case 短 label · DS-11 N/A(prototype 無此 panel;panel 本身 W13 已存在,design-system §6 登記嘅係**畫面/導航**而唔係畫面內 panel)· DS-12 ✅
- 🟡 **DS-1 附註(唔係本次引入)**:design-system §0.1 字面要求「唔 hardcode … 間距 / 半徑 hex/**px**」,但全 repo(含本檔改動前)一律用 arbitrary px class(`p-[18px]` / `text-[13px]` / `rounded-[12px]`)。我跟咗檔內既有 idiom(§1.3 match existing style),**冇擅自發起 repo-wide refactor**。契約與實作之間呢個張力值得 owner 拍板(要就開獨立 change,唔應夾喺 F2)

### 🔴 未驗證(honest gap)
- **G3 browser light + dark 未驗** —— Chrome extension 未連上(工具回 "Browser extension is not connected")。**唔造假**:token class 理論上會 swap,但我冇親眼見過。補償措施 = 5 個 component test 鎖住 UI wiring(格式文案 / 下載真係出 CSV blob / 未 curate 唔生檔 / out-of-scope 提示 / 資料未齊 disabled),但**視覺對比仍需人眼**
- jsdom 喺 `a.click()` 打印 `Not implemented: navigation` stderr —— 係 jsdom 冇實作 blob URL 導航,**test 通過**,同既有 React Router warning 同類噪音

### Decisions / Open-Questions Resolved
- **順手修一句錯文案(R3 deviation,已記)**:panel 原描述寫「only curated **M365** SKUs are imported — **D365** and other rows are listed as skipped」,呢句自 **ADR-0008 D5 / W27** 起已經錯(D365 curate 咗就一視同仁入 ledger)。改為「only SKUs you have curated are imported — uncurated rows …」。屬我改動範圍內嘅同一段文案,故一併修正而非留錯
- **plan 外增補(R3 deviation,已記)**:plan F2 只要求純函數 unit test,冇要求 component test。因 G3 browser 驗證被封,加 5 個 component test 作為補償性自動驗證。若唔加,F2 嘅 UI 層將**完全冇驗證**

### Blockers
- **G3 需要 Chrome extension** —— 要 Chris 連上 extension 之後我再跑,或者 Chris 自己 browser 睇一眼 Settings › Integrations(light + dark)
- F4 仍 `[BLOCKER]`(等 F3 落地後重評)

### Actual vs Planned Effort
| Deliverable | Planned (h) | Actual (h) | Variance |
|---|---|---|---|
| F2 範本 + UI 說明 | 5.0 | ~4.5 | −0.5(G3 未計,被 extension 封) |

### Commits
- `<hash>` — `feat(web): W35 F2 — allocation CSV 範本下載 + import 格式說明`

---

## Day 4 — 2026-07-25:F3 assigned baseline script 完成(ADR-0014 落地)

### Done
- **抽共用對映層** `src/license/matrix-csv.ts` —— ADR-0014 明文要求「唔重寫對映邏輯,避免兩處 drift」。header→`Opco.code` / col-A→`businessAlias` / cell 消毒(`toQuantity`)集中一處,兩個 consumer(import 寫 allocated · baseline 寫 assigned)共用。**`allocation-import.service.ts` refactor 用佢,既有 8 個 spec 全綠 = 零行為改動**(呢個係我做 refactor 嘅 gate,跑咗先繼續)
- **`src/license/assigned-baseline.ts`**:`planAssignedBaseline`(純函數,dry-run 同 commit 用同一計算)+ `applyAssignedBaseline`(一個 transaction:逐格 upsert → 一次 `createMany` 寫 `LedgerAdjustment`)。**故意用結構型別而唔用 `PrismaClient`** —— 令「只可以掂 `OpcoSkuLedger` 同 `LedgerAdjustment`」寫在簽名上,唔止寫在 body
- **`prisma/init-assigned-baseline.ts`** 薄殼(argv / 讀檔 / DB 查詢 / 印表);`package.json` 加 `baseline:assigned`
- **23 個新 test**(api 367 → **390**):10 個 plan/apply + 13 個 mapper。`src/` lint 0 · `tsc --noEmit` 0
- runbook 步 5 由佔位改成真(含真實 dry-run 輸出樣式 + `--actor` 用法 + 兩個 ⚠️)

### 真跑驗證(H7 —— 全部貼真 output;dev DB 只讀,寫入用 scratch DB)

**A. dev DB dry-run ×2(read-only)** —— 用真 `/opcos`+`/license/catalog`+`/license/ledger` 砌兩個 CSV:
- 同值 CSV → `Mapped: 23 OpCo columns · 8/8 SKU rows · 0 cell change(s)` → `Nothing to do`(184 格全對得上 = idempotent 對真數據成立)
- 改一格 CSV → `1 cell change(s)`,`PFU-Asia Microsoft_365_Copilot 0 → 7 +7`,收 `DRY RUN — nothing written`

**B. scratch DB `platform_w35_f3` 真 `--commit` ×2**(建→驗→drop,**真 `platform` DB 全程未動**):
- 第一次:`Committed 3 assignedQuantity change(s); 3 LedgerAdjustment row(s) recorded.`;未 curate 嘅 row 正確報 skipped
- DB 實查 `OpcoSkuLedger`:RHK×E3=120 · RTH×E3=45 · RHK×E1=8,而 **`allocatedQuantity` 三行全部 = 0** ⇒ **鏡像反向 invariant 對真 DB 成立**(唔止 mock)
- DB 實查 `LedgerAdjustment`:3 行,`field=assignedQuantity` · `0→120/45/8` · `reason='go-live baseline (init-assigned-baseline)'` · actor 解析到 `chris.lai@rapo.com.hk`
- `RTH×E1` CSV 值係 0 而 baseline 亦係 0 → **冇建 row**(0===0 no-op),符合設計
- 第二次 commit:`0 cell change(s)` + `adjustment_rows` 仍然係 **3** ⇒ 重跑唔會生重複 audit
- drop 後確認 dev DB:`ledger_rows=148 · total_assigned=6049 · adjustments=8`(同 CH-007 記錄一致,未被污染)

### Decisions / Open-Questions Resolved
- **refactor 邊界**:ADR-0014 要求共用對映,而 §1.3 又要求唔好亂 refactor。取捨 = **只抽 parse/mapping 呢一層**(兩個 consumer 真正共用嘅部分),**寫入語意各自保留**(import 寫 allocated + 一條 summary audit;baseline 寫 assigned + 逐格 `LedgerAdjustment`)。既有 spec 做安全網,先跑綠才繼續
- **新增 `matrix-csv.spec.ts` 補一個真空白**:`toQuantity` 嘅負數 / 小數 / 垃圾輸入**從來冇 test 覆蓋過**(舊 service 有段 code 但冇 spec)。抽出嚟順手鎖死:`-5→0` · `12.9→12` · `abc→0`。若無呢層,CSV 一個負數就會寫負 assigned 落 ledger
- **actor 處理**:script 冇認證 context;`LedgerAdjustment.actorId` schema 本身 optional(ADR-0007)→ 支援可選 `--actor=<email>` 解析,唔傳就 null 並印 warning。**唔加新 auth 機制**(會係 scope 蔓延)

### Blockers
- 無新增。**F1 / F2 / F3 全部完成**,只剩 F4(仍 `[BLOCKER]`,依 plan 等 F3 落地後重評)+ F2 嘅 G3(browser light+dark,等 Chrome extension)

### F4 重評(依 plan 承諾,F3 落地後即做)
F3 嘅 `upsert` **本身就會 create 唔存在嘅 row**(scratch DB 實證:3 行由零建出嚟,`allocatedQuantity` 留 default 0)。即係「批量建 row」已經有路。剩落嘅唯一缺口 = 「**唔用 CSV、唔靠 assign,想單獨開一格空 row**」,而我搵唔到真實使用場景(要管一個未 import 未 assign 嘅組合)。→ **AI 建議 F4 = 選項 C(唔做),登入 `DEFERRED_REGISTER` 等真實需求**。⚠️ **等 Chris 拍板,唔自行 close**

### Actual vs Planned Effort
| Deliverable | Planned (h) | Actual (h) | Variance |
|---|---|---|---|
| F3 實作(ADR-0014) | 6.0 | ~5.5 | −0.5(含未計劃嘅共用層抽取 + mapper test) |

### Commits
- `<hash>` — `feat(license): W35 F3 — assigned baseline ops script(ADR-0014)`

---

## Retro(填於 phase 結束)

### What worked

### What didn't work / unexpected friction

### Surprises / discoveries

### Carry-overs to W36

### ADR triggers

### Phase Gate result
- G1 – G7:_(填實測值)_

### Phase status
- Closeout commit:`<hash>`
- Frontmatter status flipped to `closed`
- BACKLOG synced(R7)
- Phase W36 kickoff trigger:{date / blocker}

---

**End of W35 progress**
