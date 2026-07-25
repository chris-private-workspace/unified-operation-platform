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
