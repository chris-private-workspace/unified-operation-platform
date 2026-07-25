---
phase: W35-data-initialisation
plan_ref: ./plan.md
status: in-progress    # in-progress | complete
last_updated: 2026-07-25
---

# Phase W35 — Checklist

> Atomic checkbox(每 item ≤ 1–2 hour effort)。
> AI tick 完成嘅 item;唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。
> ⚠️ **F3 / F4 全部 item 鎖住** —— 未有 Chris 對應決策之前唔可以開始(H1)。

## F1 — 端到端生產數據初始化 runbook

- [ ] 起 `docs/05-usage/DATA-INITIALISATION.md` 骨架(7 步 + 每步驗證欄)
- [ ] 步 1-2:migrate / seed / `POST /license/catalog/sync` —— 寫清需真 Graph 憑證(標 honest gap,R1)
- [ ] 步 3:`businessAlias` / `category` curation —— 指向 Catalog 頁 Edit dialog(CH-003),講清 curation-as-scope = scope 邊界
- [ ] 步 4:`POST /license/ledger/import` dry-run → 核 `skippedSkuLabels` / `unknownOpcoHeaders` → commit
- [ ] 步 6-7:`POST /license/reconcile` 清零 + 開放前驗證清單
- [ ] 修正 `W27-d365-scope/CURATION-D365.md:20` 過時句(「直接改 DB;未來 admin UI」→ CH-003 Edit dialog 已有)
- [ ] H4 自檢:全文零真實 secret / 零真實 PII(範例全 placeholder)
- [ ] verify(G1):本地由乾淨 DB 照 runbook 走一次,catalog sync 步標明未驗;實際跑到嘅步逐步貼真 output

## F2 — CSV 範本下載 + upload UI 格式說明

- [ ] `lib/` 加範本生成純函數(header ← 真 `Opco.code`;rows ← 已 curate `businessAlias`)+ unit test
- [ ] 未 curate 情境:唔生空檔,改出提示 + 另列未 curate SKU
- [ ] `allocation-import.tsx` 加 Download template 按鈕(`Blob` + `createObjectURL`,零新 dep)
- [ ] upload 卡加三條對映規則說明 + curation 前提
- [ ] H6 自檢:跑 `ui-design` skill(token-only · 一個 view 一個 primary action · lucide · light+dark)
- [ ] verify(G2):下載 → 原封上傳 → dry-run 真 response `changes: 0` + `unknownOpcoHeaders: []`,貼真 output
- [ ] verify(G3):browser light + dark 實看格式說明

## F3 — 🔴 `assignedQuantity` baseline 機制【鎖住:等 Chris 決策】

- [ ] **[BLOCKER]** 向 Chris 提 A/B/C/D 四選項 + 問「實際有存量嘅 (OpCo,SKU) 組合數量級」(定 D 是否可行)
- [ ] **[BLOCKER]** Chris 拍板 → 記入 progress Day-N
- [ ] 寫 ADR(`docs/adr/00NN-*`)—— 若揀 A 必須寫明 ADR-0004 invariant 修訂範圍
- [ ] 實作(視選項)+ dry-run 先行
- [ ] H5:ledger write critical path → 同步寫 test(Graph / SN mock)
- [ ] 若揀 A:加 test 鎖死「budget 數唔會流入 assignedQuantity」(R3)
- [ ] verify(G5):**乾淨 DB**(唔跑 demo seed,R5)跑完全鏈 → `POST /license/reconcile` **drift 清零**,貼真 response
- [ ] F1 runbook 補回步 5(baseline 建立)

## F4 — 🔴 `POST /license/ledger` 建空 row?【鎖住:等 F3 決策先】

- [ ] **[BLOCKER]** F3 決策後重評 F4 是否仍係真需求
- [ ] Chris 拍板(A 加 endpoint / B import flag / C 唔做)→ 記入 progress
- [ ] 若 C:寫入 `DEFERRED_REGISTER`(DD-N)+ 恢復條件
- [ ] 若 A/B:ADR + 實作 + test + live 驗

---

## Cross-Cutting

- [ ] All deliverables committed to git
- [ ] All open-question status changes reflected in decision tracker(R4)
- [ ] All architectural-adjacent decisions documented as ADR(per CLAUDE.md §5)
- [ ] Pending / next-candidate changes synced to `BACKLOG.md`(R7)
- [ ] verify(G6):`npm test`(api ≥ 367 · web ≥ 136)+ `npm run lint` 0 warning,貼真 output
- [ ] verify(G7):H4 零洩漏實查(runbook + 生成範本 + 前端)
- [ ] `progress.md` retro section written
- [ ] `progress.md` frontmatter status flipped to `closed`
- [ ] Phase N+1 kickoff trigger noted in retro

---

**Lifecycle reminder**:呢份 checklist 隨 plan deliverables 衍生。新加 deliverable 必須先入 plan + changelog,然後再加 checklist item。
