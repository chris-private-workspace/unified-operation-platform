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

**Commit**:`<hash>` — `docs(planning): kickoff W35 data-initialisation`

---

## Day 1 — YYYY-MM-DD

### Done

### Decisions / Open-Questions Resolved

### Blockers

### Actual vs Planned Effort
| Deliverable | Planned (h) | Actual (h) | Variance |
|---|---|---|---|

### Commits

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
