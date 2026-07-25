---
phase: W35-data-initialisation
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: closed    # in-progress | closed
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

### F4 初步重評 —— ⚠️ **已被 Day 5 取代,結論有誤,勿引用**
當時寫:「批量建 row 已有路,剩落嘅缺口搵唔到真實使用場景 → 建議唔做」。**錯咗**:真場景存在,而且就喺已寫入 DESIGN 嘅 drift 對回流程裡面(`DESIGN.md:98/101/172`)。完整、有依據嘅重評見 **Day 5**。保留本段只為留下修正軌跡。

### Actual vs Planned Effort
| Deliverable | Planned (h) | Actual (h) | Variance |
|---|---|---|---|
| F3 實作(ADR-0014) | 6.0 | ~5.5 | −0.5(含未計劃嘅共用層抽取 + mapper test) |

### Commits
- `<hash>` — `feat(license): W35 F3 — assigned baseline ops script(ADR-0014)`

---

## Day 5 — 2026-07-25:F4 正式重評(**分析留檔,唔含決定**)

> 依 plan §2 F4 承諾「F3 落地後重評」。本段係**證據 + 選項 + 建議**;F4 觸發 **H1**,決定權在 Chris,**未拍板前唔動 code、唔寫 `DEFERRED_REGISTER`**。
> 🔁 **修正**:Day 4 嘅初步重評結論(「搵唔到真實使用場景」)**係錯嘅**,本段取代之。

### 查證到嘅事實(逐條有依據)

| # | 事實 | 依據 |
|---|---|---|
| 1 | Assets By-OpCo 只列**已存在**嘅 ledger row;inline edit 係 per-row `✎`。**全站冇任何 create 入口** | `apps/web/src/components/assets/by-opco-view.tsx:252`(`rows = ledger.data ?? []`) |
| 2 | `PATCH /license/ledger/:id` 容許 **OPCO_IT**(scope-gated),但 `POST /license/ledger/import` 係 **ADMIN/REGIONAL only** ⇒ **OPCO_IT 改得,但永遠 create 唔到 row** | `license.controller.ts:127` vs `:93` |
| 3 | 平台**冇** `POST /license/ledger`;建 row 只有三條路,全部 upsert 副作用:import(ADMIN)· assign 真人(W04)· F3 baseline script(ops) | `license.controller.ts` 全查 · `assign.service.ts:163` · `assigned-baseline.ts` |
| 4 | **drift 對回機制嘅正式定義 = 手動編輯 by-OpCo `assignedQuantity`** | `DESIGN.md:98` · `:101` · `:172`(ADR-0007 / W23-A) |
| 5 | F3 script 對 `0 === 0` 會 skip ⇒ fresh 系統**只有 assigned > 0 嘅組合有 row** | scratch DB 實證:`RTH×E1` CSV 值 0、baseline 0 → 冇建 row(Day 4) |
| 6 | 「OpCo self-service 開放時機」仍係 open question | `DESIGN.md:173` · `:20`(「license 數量管理責任屬 OpCo,將來 self-service 交回」) |

### 真實場景(Day 4 判斷錯咗嘅地方)

事實 4 + 5 + 1 合埋就有一個**功能洞**,而且落喺已文件化嘅流程:

> 某 SKU 爆 drift(tenant `consumedUnits` > 平台 Σ assigned),operator 查到差異落喺 OpCo X。
> 但 X 對該 SKU 之前 assigned = 0 → **冇 ledger row** → `PATCH /license/ledger/:id` 回 **404** → **對回做唔到**。

呢個情境普通到不行:有人喺 tenant 直接被 assign(繞過平台),平台從來冇該 (OpCo, SKU) 組合。F3 baseline **幫唔到** —— 0 值格本來就唔建 row(事實 5)。再加事實 2,OPCO_IT 連 workaround 都冇。

### 選項(比 plan 原本三個多一個)

| | 做法 | 評價 |
|---|---|---|
| **A** | `POST /license/ledger` 建 0/0 空 row(roles 鏡像 PATCH:ADMIN/REGIONAL/OPCO_IT + `assertOpcoScope` fail-closed) | 直接;但要為「建空 row」定 audit 語意 —— before/after 都係 0,`LedgerAdjustment`(ADR-0007)唔貼切 → 可能要加 `AuditLog` 第 15 個 action,**掂 ADR-0009 Decision 4** |
| **B** | `PUT /license/ledger/:opcoId/:skuCatalogId`(按 natural key upsert) | REST 上最貼 schema(`@@unique([opcoId, skuCatalogId])`),**一個 endpoint 同時解 create + edit-missing**;代價 = 同 W23-A 既有 PATCH 重疊,兩條寫入路並存 |
| **C** | **唔做,defer**,解封條件寫明:`Drift-resolve` 動工 **或** OpCo self-service 開放 | 洞只喺對回流程咬人,而對回本身係未建候選;期間 ADMIN/ops 有 workaround(跑 baseline script / import 物化 row) |
| **D** | F3 script 加 `--materialise-zeros`:go-live 把 23×N 全格建齊(今日 23×8 = 184 行;全 curate 後 23×37 = 851 行,對 Postgres 微不足道)⇒ PATCH 永遠唔 404 | 純 data 解法、零新 API surface;**但只解 go-live 當刻** —— 之後新 curate 嘅 SKU / 新增 OpCo 又會再出現同一個洞 |

### AI 建議 = **C**(理由同 Day 4 完全唔同)

**唔係**「冇需求」,而係:
1. 需求真實但**未到** —— 咬人場景全部落喺 `Drift-resolve`(BACKLOG 候選,未動工)同 OpCo self-service(`DESIGN.md:173` open)之內
2. A / B / D 三個形狀嘅取捨**取決於對回流程點設計**(邊個 role 對回?逐格定批量?)—— 現在拍板等於猜
3. 期間唔卡死任何人:ADMIN/ops 有 workaround

配套建議(若揀 C):`DEFERRED_REGISTER` 條目要寫明**兩個解封條件** + **事實 2 嘅不對稱**(OPCO_IT 改得但 create 唔到),並把 **D** 記入 runbook 做 go-live 可選緩解。

### 仍 open
- **OQ-W35-3(F4)** —— 待 Chris 揀 A / B / C / D。**未拍板前唔寫 `DEFERRED_REGISTER`、唔動 code**(H1)
- **OQ-W35-2**(真實有存量嘅 (OpCo,SKU) 組合數量級)—— 到今日仍未答,但已證實唔阻塞任何嘢

### Commits
- `<hash>` — `docs(planning): W35 F4 重評留檔(analysis only,未拍板)`

---

## Day 6 — 2026-07-25:F4 拍板 = C(defer → DD-3)· G3 第二次嘗試仍失敗

### Done
- **F4 決策落地**(Chris 2026-07-25 揀 **C = defer**):
  - `DEFERRED_REGISTER` 新增 **DD-3** —— 現況欄寫明真場景(drift 對回撞 0-assigned 無 row → `PATCH` 404,F3 script 因 `0===0` skip 故幫唔到)、**OPCO_IT 改得但 create 唔到**嘅不對稱(`license.controller.ts:127` vs `:93`)、ADMIN/ops workaround;**兩個解封條件**任一達成即重開(①`Drift-resolve` 動工 ②OpCo self-service 開放)+ 註明屆時屬 **H1 需 ADR**
  - `plan.md` F4 段由「決策 gate」改「已決 C」+ changelog · `checklist.md` F4 全 tick · BACKLOG 同步(R7)
  - **零 code 改動、零 ADR**(選項 C 唔新增 API surface)
- **runbook 步 5 加「已知限制(DD-3)」段**:0 值格唔建 row → 日後 PATCH 404、現有 workaround、OPCO_IT 冇 workaround

### ⚠️ 一個自我修正(避免文件講大話)
我原本打算把選項 **D**(`--materialise-zeros`)當「可選緩解」寫入 runbook —— **停手改咗**:呢個 flag **根本未實作**,寫落 runbook 等於叫操作者用一個唔存在嘅功能。改為只寫**限制 + 現有 workaround**,D 留喺 DD-3 做將來候選。checklist / plan 相應措辭亦已改正。

### G3(F2 browser light + dark)—— 第二次嘗試,仍然失敗
- Chris 表示 extension 已連上 → 重試 `tabs_context_mcp{createIfEmpty:true}` → 同一個錯:`Browser extension is not connected`
- 追加診斷 `list_connected_browsers` → **回 `[]`**(零個 extension instance)⇒ **唔係 tab 揀錯,而係我這邊完全冇 browser 連上**
- 依 browser 工具紀律(失敗 2-3 次即停,唔盲重試)→ **停手,交還畀 Chris 決定點做**
- 🔴 **G3 仍然未驗證。唔造假。** F2 嘅補償措施(5 個 component test)仍然有效,但**視覺 light/dark 對比零證據**

### Decisions / Open-Questions Resolved
- **OQ-W35-3(F4)→ resolved = C(defer,DD-3)**(R4:已同步 plan / checklist / DEFERRED_REGISTER / BACKLOG)
- **仍 open**:`OQ-W35-2`(真實有存量嘅 (OpCo,SKU) 組合數量級)—— 已證實唔阻塞,建議 retro 一齊收
- **仍未達標**:**G3**(唯一未 tick 嘅 acceptance)

### Blockers
- **G3** —— 需要一個真正連上嘅 Chrome extension,或者由 Chris 人眼確認 Settings › Integrations 嘅 light + dark。**呢個係 W35 closeout 前最後一項**

### Commits
- `<hash>` — `docs(planning): W35 F4 決 C defer(DD-3)+ runbook 限制註記`

---

## Day 7 — 2026-07-25:G3 通過(第三次嘗試,改用 Playwright MCP)· **W35 全部 acceptance 達標**

### 點解第三次先得
`claude-in-chrome` 三次都連唔上(第二次追加 `list_connected_browsers` → `[]`)。Chris 重啟 extension 後**仍然**係同一個錯 → 唔再糾纏,改用 session 內另一個已連上嘅 **Playwright MCP**(唔同工具,唔算盲重試)。**教訓**:驗證被工具鏈卡住時,先問「有冇第二條工具路」,唔好一味重試同一個。

### 驗證設定(誠實交代)
Playwright 開嘅係乾淨 browser,冇 session。**冇**用真密碼登入(禁止處理密碼),改為 `browser_evaluate` 注入 `localStorage['uop.localProfile']`(`require-auth.tsx:16` 嘅 gate 條件),後端本來已 `AUTH_DEV_BYPASS=true` 所以 API 照返數。**本機 dev 技巧,非繞過真實系統權限** —— 記低以免日後誤讀成「已驗真 SSO 流程」。

### G3 結果(light + dark)
| 檢查 | light | dark |
|---|---|---|
| `--bg` token | `#f5f5f6` | `#08080a` |
| card / border / accent | `#fff` 系 · — | `#141417` · `#242427` · **`#ff3355`**(dark accent) |
| format card 背景(computed) | — | `rgb(27,27,31)` |
| Download 掣(computed) | — | bg `rgb(20,20,23)` / fg `rgb(243,243,245)` |
| CSV format 三條規則 | ✅ | ✅ |
| uncurated note | ✅ `91 active SKUs…` + `+79 more not shown`(cap 12 生效) | ✅ |
| primary action 數 | **0**(未揀檔;揀檔後才出 Preview)⇒ 一 view 一 primary 唔違反 | 同 |
| DS-5 mono | ✅ `code` / `Grand Total` / `0` / `23` / `8` / `AAD_PREMIUM_P2` 等 part number 全部 mono(實測 `fontFamily` 含 mono) | 同 |

截圖:`w35-f2-integrations-light.png` / `w35-f2-integrations-dark.png`(存 scratchpad,**唔入 repo**)。

### 額外收穫:G2 亦走完真 UI 路徑
喺真 browser hook `URL.createObjectURL` → 撳真 Download 掣 → 捕到 blob(`text/csv;charset=utf-8` · 706 bytes · 9 行 = 1 header + 8 curated · 23 個真 OpCo code · **冇** `Grand Total`)→ 檔案真落地 → 讀檔頭三個 byte = **`EF BB BF`**(BOM 確實在檔;之前 `Blob.text()` 顯示冇 BOM 係因為規範會 strip)→ **把真下載檔原封 POST 真後端** dry-run:`opcoColumns:23 · skuRows:8 · mappedSkuRows:8 · changes:0 · skipped:[] · unknownOpcoHeaders:[]`。
⇒ 「下載 → 原封上傳 → 零改動」**全程走真 UI + 真後端**,比 Day 3 嘅 node-level round-trip 強。

### 順手清理
Playwright 預設把截圖寫落 **repo root**(兩個 PNG,未被 gitignore)→ 已移去 scratchpad,`git status` 回復 clean。`.playwright-mcp/` 本身已喺 `.gitignore:40`,冇動。

### Decisions / Open-Questions Resolved
- **G3 → Pass**。W35 **G1–G7 全部達標**(G1 runbook · G2 round-trip · G3 light+dark · G4 H1 決策留痕[ADR-0014 + DD-3]· G5 baseline→drift[**部分**:機制 live 驗,但「drift 清零」本身需真 Graph,見下]· G6 test 不降 · G7 H4 零洩漏)
- ⚠️ **G5 只達到機制層**:baseline script 對真 DB 驗過(scratch),但 `reconcile` 需真 Graph 憑證 → **「drift 清零」呢個終局仍未 live 驗**(R1,屬 `DEPLOY-harden`)。呢點 retro 要寫清,唔可以當 G5 完全 pass
- **仍 open**:`OQ-W35-2`(組合數量級)—— 已證唔阻塞,retro 一齊收

### Commits
- `<hash>` — `docs(planning): W35 G3 pass(Playwright light+dark + 真下載 round-trip)`

---

## Retro(2026-07-25 closeout)

### What worked

- **Runbook 先行係正確次序**。F1 逼我把七步逐個對返 code / endpoint,結果**喺寫文件過程中就揭到兩個 code 事實**:①`reconcile` 同 `catalog/sync` 一樣硬依賴 Graph(原本 plan 只當步 2 有此限制)②F3 script 嘅使用步驟有咗歸宿(步 5 佔位 → 落地後回填)。若先寫 code 後補文件,呢兩點會漏。
- **既有 spec 當 refactor gate**。F3 要抽共用對映層 → 動到 critical-path 嘅 `allocation-import.service.ts`。做法係「改完即刻跑該檔 8 個 spec,綠咗才繼續」,而唔係最後一次跑全套。呢個習慣令 refactor 風險由「事後發現」變「即時發現」。
- **scratch DB 係寫入路徑嘅正解**。F3 嘅 `--commit` 用 mock 驗唔到「`allocatedQuantity` 真係冇被寫」。建一個 `platform_w35_f3` 真跑 + `psql` 實查,得到最強證據(三行 alloc 全 0),而 dev DB 全程未動(收尾 148 rows / assigned 6049 對得返 CH-007 記錄)。
- **決策 gate 分兩段(拍板 → 落地)**。F3/F4 都係先 STOP 出選項表、拍板、寫 ADR/DD,再落 code。F4 更證明呢個做法有用 —— 重評推翻咗我自己嘅初步結論。

### What didn't work / unexpected friction

- **`claude-in-chrome` 三次都連唔上**(第二次 `list_connected_browsers` 回 `[]`;Chris 重啟 extension 後仍然一樣)。我頭兩次嘅反應係「標 honest gap 然後等」,拖到第三次才想起**同一 session 有另一條工具路(Playwright MCP)**。→ **教訓:驗證被工具鏈卡住時,第一問應該係「有冇第二條工具路」,唔係「幾時再試一次」。**
- **我自己嘅初步結論錯過一次**(F4 Day 4「搵唔到真實使用場景」)。原因係只睇「建 row 有冇路」,冇睇「邊個 role 有路 + 對回流程需要咩」。正式重評(Day 5)逐條查 controller roles + DESIGN 對回定義才見到真洞。→ **快速判斷同正式重評唔可以混為一談**;plan 幸好寫咗「F3 落地後重評」呢個 checkpoint。
- **兩次差啲令文件講大話**,都係中途自己截住:①想把未實作嘅 `--materialise-zeros` 寫入 runbook 做「可選緩解」②F2 checklist 一度寫成「選項 D 已寫入 runbook」。兩次都改成「只寫限制 + 現有 workaround」。→ 寫文件時「呢個功能存在嗎?」要同「呢個做法好嗎?」分開問。
- **Playwright 預設把截圖寫落 repo root**(兩個 PNG 未被 gitignore)→ 污染工作樹,收尾才發現要移。下次指定輸出路徑。
- **prettier / eslint 反覆咬**(BOM 字面字元觸 `no-irregular-whitespace`、`_blob` unused、多次 format 錯)。BOM 一役最花時間:Edit 工具匹配隱形字元失敗 → 最後改用 `String.fromCharCode(0xfeff)` 反而更易讀。

### Surprises / discoveries

- **`reconcile` 同 `catalog/sync` 一樣要真 Graph** → 「真憑證」唔係部署後補嘅 hardening 項,而係**初始化嘅硬前置**:冇憑證連 go-live gate(零 drift)都過唔到。R1 影響範圍由一步擴至兩步。
- **本地 catalog 現況 = 99 個 active SKU,只有 8 個有 `businessAlias`** → 即現狀下 **91 個 SKU 永遠入唔到 ledger**。呢個數字令「curation = scope 閘門」由抽象規則變成可量化工作量,亦成為 F2 動態範本嘅最佳論據(靜態範本會漏掉 curation 狀態)。
- **`toQuantity` 嘅負數 / 小數 / 垃圾輸入從來冇 test**(舊 service 有 code 冇 spec)。抽共用層時順手鎖死 `-5→0` / `12.9→12` / `abc→0` —— 若無呢層,CSV 一個負數會寫負 `assignedQuantity` 落 ledger。**「抽出舊 code 去共用」係發現舊測試空白嘅好時機。**
- **`Blob.text()` 會 strip BOM**(Encoding Standard 行為)→ 一度以為範本冇 BOM。要讀**檔案 bytes**(`EF BB BF`)才知真相。
- **F4 嘅洞有 role 不對稱**:`PATCH` 容許 OPCO_IT 但 `import` 唔容許 ⇒ ADMIN/ops 有 workaround,**OPCO_IT 完全冇**。呢個不對稱比「冇 endpoint」本身更值得記(已入 DD-3)。

### Carry-overs to W36

1. 🔴 **G5 終局未驗**:baseline → `reconcile` → **drift 清零**呢個 go-live gate 需真 Graph 憑證(UAT 現 placeholder,W33 D3)→ 屬 **`DEPLOY-harden`**。F1 runbook 步 2 / 步 6 亦因此**只寫得,未 live 驗**。
2. 🟡 **DD-3**(F4 defer):解封 = `Drift-resolve` 動工 **或** OpCo self-service 開放;屆時屬新 API surface = **H1 需 ADR**。形狀候選 A/B/D 已留檔。
3. 🟡 **design-system §0.1 契約 vs repo idiom 張力**:§0.1 字面禁 hardcode 間距 / 半徑 **px**,但全 repo 一律用 arbitrary px class(`p-[18px]` / `text-[13px]`)。F2 跟咗檔內既有 idiom,**冇**發起 repo-wide refactor。建議開獨立 change 由 owner 拍板(要麼放寬契約措辭,要麼立 token scale)。
4. 🟢 `OQ-W35-2`(真實有存量嘅 (OpCo,SKU) 組合數量級)—— **收為 moot**:ADR-0014 按最壞情況(851 格)設計,F3 已對真數據驗過且對細數據集一樣適用,該數字唔再影響任何決定。

### ADR triggers

- **ADR-0014**(Accepted)—— `assignedQuantity` baseline 機制屬新寫入路徑 + 掂 locked ledger 語意 = **H1**,已寫。
- **F4 = defer** → **唔需要 ADR**(選項 C 唔新增 API surface),改為 `DEFERRED_REGISTER` **DD-3** 記解封條件。
- F1 / F2 **唔觸發 ADR**:純文件 + 前端組合既有 primitive、零新 dependency、零 schema。

### Phase Gate result(最終實測)

| # | Criterion | 結果 |
|---|---|---|
| G1 | runbook 可被第三者照做 | **Pass** —— 七步齊,scratch DB 真走過步 1;步 2 / 6 標明需真憑證(未驗) |
| G2 | CSV 範本 round-trip | **Pass** —— 真撳 Download → 真檔(BOM `EF BB BF`)→ 原封 POST 真後端:`changes:0` · `skipped:[]` · `unknownOpcoHeaders:[]` |
| G3 | UI 講清格式 | **Pass** —— Playwright light + dark 實看 + 截圖;token 真 swap(`#f5f5f6`↔`#08080a`) |
| G4 | H1 決策留痕 | **Pass** —— ADR-0014 Accepted · DD-3 · plan changelog 9 行 |
| G5 | baseline → drift 清零 | **⚠️ 部分** —— 機制對真 DB 驗過(3 格寫入 · alloc 全 0 · 3 條 audit · 重跑零改動);**「drift 清零」終局需真 Graph,未驗**(carry-over 1) |
| G6 | test 不降 + lint clean | **Pass** —— api **367 → 390**(41 suites)· web **136 → 151**(19 files)· 兩邊 lint **0** · `tsc --noEmit` **0** · build OK(最大 chunk 254KB 不變) |
| G7 | H4 零洩漏 | **Pass** —— runbook 只列 env **變數名**(源自已 commit 嘅 `.env.example`),值全 placeholder;生成範本只含 OpCo code + alias + 數字,零 secret / 零 PII |

### Anti-pattern 自檢(closeout 掃)
`AP-1` ⚠️(F1 步 2/6 未真行過,已列 carry-over)· `AP-2` ✅(F3 寫入路徑用真 Postgres 驗,唔止 mock;G3 用真 browser + 真 API,但身分係注入 local-profile —— 已交代)· `AP-3` ✅(seed 輸出逐字對真 output;script 名對真 `package.json`)· `AP-4` ⚠️→✅(**掃到 F3 兩項 deviation 只記喺 progress 冇入 plan changelog,closeout 已補**)· `AP-5` ✅ · `AP-6` ✅(範本寧可 `ok:false` 都唔生空檔)· `AP-7` ✅(api listener pid 47884→**43200**,啟動 17:15:43 晚於最後 source 改動 16:24:45,`dist/license/matrix-csv.js` 已編譯 ⇒ G3 打嘅係 refactor 後 code)· `AP-8` ✅(alias 只係 curated 指向,寫入一律用 `skuCatalogId`)· `AP-9` N/A · `AP-10` ✅(F3 核心 invariant,test + 真 DB 雙重鎖)

### Phase status
- Closeout commit:`<hash>`
- `plan.md` / `progress.md` frontmatter status → **`closed`**;`checklist.md` → **`complete`**
- BACKLOG synced(R7)· `DEFERRED_REGISTER` DD-3 · `adr/README.md` ADR-0014
- **Phase W36 kickoff trigger**:由 Chris 揀下一個 —— BACKLOG A 區候選中,`DEPLOY-harden`(解 carry-over 1 + 真憑證)同 `Drift-resolve`(解 DD-3)係同 W35 直接相關嘅兩個

---

**End of W35 progress**
