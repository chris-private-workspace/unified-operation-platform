---
phase: W35-data-initialisation
plan_ref: ./plan.md
status: in-progress    # in-progress | complete
last_updated: 2026-07-25
---

# Phase W35 — Checklist

> Atomic checkbox(每 item ≤ 1–2 hour effort)。
> AI tick 完成嘅 item;唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。
> ✅ **F3 已解鎖**(Chris 2026-07-25 approve 選項 C → ADR-0014)。⚠️ **F4 仍鎖住** —— 未拍板唔可以開始(H1)。

## F1 — 端到端生產數據初始化 runbook

- [x] 起 `docs/05-usage/DATA-INITIALISATION.md` 骨架(7 步 + 每步驗證欄 + FAQ)
- [x] 步 1-2:migrate(dev `prisma:migrate` / 部署 `prisma:deploy`)/ seed / `POST /license/catalog/sync` —— 標明需真 Graph 憑證(honest gap,R1);加警告 `demo:ledger` 絕不落生產
- [x] 步 3:`businessAlias` / `category` curation —— 指向 Catalog 頁 Edit dialog(CH-003),講清 curation-as-scope = scope 邊界
- [x] 步 4:`POST /license/ledger/import` dry-run → 核 `skippedSkuLabels` / `unknownOpcoHeaders` → commit;附真 CSV 例 + 三條對映規則表
- [x] 步 5 佔位:ADR-0014 script 形態 + 「唔可以咁做」四項(等 F3 實作填實)
- [x] 步 6-7:`POST /license/reconcile` 清零 + 開放前 8 項驗證清單(含假數清查)
- [x] 修正 `W27-d365-scope/CURATION-D365.md:20` 過時句 + 加上位文件連結(避免兩份 runbook 重複)
- [x] H4 自檢:全文零真實 secret / 零真實 PII —— 只列 env **變數名**(源自已 commit 嘅 `.env.example`),值全 placeholder
- [x] **verify(G1)**:見 progress Day 2 —— scratch DB(`platform_w35_verify`,**唔碰** dev DB)跑 migrate deploy + seed 真 output;步 4 dry-run 三張清單行為真 output;步 2 / 步 6 因無 Graph 憑證**未驗**(誠實標明)
- [x] **新發現補入 runbook**:步 6 reconcile **同樣硬依賴 Graph**(`reconcile.service.ts:22` live `consumedUnits`)→ 冇憑證連 go-live gate 都過唔到(前置表 + 步 6 + FAQ 三處同步)

## F2 — CSV 範本下載 + upload UI 格式說明

- [x] `lib/allocation-template.ts` 純函數(header ← 真 `Opco.code`;rows ← 已 curate `businessAlias`)+ **10 unit test**
- [x] 未 curate 情境:唔生空檔(`ok:false` + `no-curated-sku`),UI 出提示 + 另列未 curate SKU(capped 12)
- [x] `allocation-import.tsx` 加 Download template 按鈕(`Blob` + `createObjectURL`,**零新 dep**)
- [x] upload 卡加三條對映規則說明 + curation 前提 + 「更新 allocated only」講明
- [x] H6 自檢:跑 `ui-design` skill —— **揪到兩個真問題並修**(DS-2 唔好發明新間距值 → `gap-[6px]`/`mt-[8px]` 對齊檔內既有 scale;DS-5 未 curate 嘅 `skuPartNumber` 係識別碼 → 加 `mono` prop)
- [x] **verify(G2)**:真 round-trip 通過 —— 真 `/opcos`+`/license/catalog`+`/license/ledger` → 生成 → POST dry-run 回 `opcoColumns:23 · skuRows:8 · mappedSkuRows:8 · changes:0` · `skipped:[]` · `unknownOpcoHeaders:[]`(臨時 test 檔驗完已刪,唔入 repo)
- [ ] ⚠️ **verify(G3):browser light + dark 未驗** —— Chrome extension 未連上("Browser extension is not connected")。改為加 **5 個 component test** 覆蓋 UI wiring(格式文案 / 下載 blob / 未 curate 唔生檔 / out-of-scope 提示 / 資料未齊 disabled);**視覺 light+dark 仍需人眼確認**
- [x] web test 136 → **151**(+10 純函數 +5 component);lint 0 · `tsc --noEmit` 0 · `npm run build` 成功(最大 chunk 254KB,無變化)

## F3 — ✅ `assignedQuantity` baseline 機制【已解鎖:選項 C · ADR-0014】

- [x] 向 Chris 提 A/B/C/D 四選項(plan §2 F3 對照表)
- [x] Chris 拍板 **選項 C**(一次性 ops script)→ 記入 progress Day 1
- [x] 寫 **ADR-0014**(Accepted;`docs/adr/README.md` index 加行)
- [ ] 建 `apps/api/prisma/init-assigned-baseline.ts`:讀 CSV → 對映(**抽用** `csv.ts` `parseCsv` + ADR-0004 對映做法,唔重寫)
- [ ] dry-run 為 default(印 before → target → delta + skipped);commit 要 explicit flag
- [ ] **只寫 `assignedQuantity`**(鏡像反向 invariant);row 唔存在則 create(allocated 留 default 0)
- [ ] 每格改動寫一條 `LedgerAdjustment`(field=`assignedQuantity`,reason 標 go-live baseline)
- [ ] H5:ledger write critical path → 同步寫 test(Graph / SN mock)
- [ ] 加 test 鎖死**反向 invariant**:script 絕不改 `allocatedQuantity`
- [ ] 加 `package.json` script entry + runbook 講明「執行者權限等同 DB 直連」(ADR-0014 Negative)
- [ ] ⚠️ 唔可以擴 script 做重複性批量更新 —— 有該需求 = 回頭寫新 ADR 升級去選項 B
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
