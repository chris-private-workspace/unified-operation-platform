---
phase: W27-d365-scope
---

# W27 Phase 丁 — Checklist(daily tick)

## D0 — kickoff + ground
- [x] plan/checklist/progress 建立(draft)
- [x] ground:Explore 全掃(無 M365-only code filter,curation gate 只在 import)+ 第一手 schema SkuCatalog / ADR-0004 / ADR-0008 D5 / DESIGN §2/§4.4/§9#5
- [x] scope A 拍板(AskUserQuestion:confirm + 測試 + 文檔;零 schema/機制改)

## D1 — D365-parity 測試(H5 lock-in)
- [x] `allocation-import.service.spec`:curated D365 SKU(businessAlias set)→ 正常 import 入 ledger(counterpart to 現有 skip case)
- [x] `reconcile.service.spec`:D365-category SKU 參與總量層 drift(Σ assigned vs consumed)
- [x] `assign.service.spec`:D365 SKU 經 skuId assign + ledger assignedQuantity +1(無類型 gate)
- [x] `tenant-owned.service.spec`:D365 SKU 出現喺 owned/total(category 非 gate)

## D2 — doc-sync + comment 對齊
- [x] `docs/architecture.md` §2/§11 tier matrix:**已由 ADR-0008 doc-sync**(§2 line 28/32 · §11 line 78 · changelog line 85 皆已講 D365 license in-scope)→ 確認完整,無需改
- [x] `docs/adr/0004-*`:加「適用範圍隨 ADR-0008 擴含 D365 curation」範圍註(決策內文不改,§6)
- [x] surgical de-「M365-only」誤導 comment/label:`main.ts` Swagger title + schema 3 個 mechanism-scope comment(skuId / assignedQuantity reconcile baseline / DriftAlert.tenantConsumed)→ M365/D365(§1.3 只改 now-misleading,無順手大改)
- [x] DESIGN.md verify §2/§9#5 完整(ADR-0008 已 doc-sync:§2 line 34 "M365+D365" · §9#5 line 194 D365 license in-scope)

## D3 — curation convention 文檔
- [x] `CURATION-D365.md`(phase folder):deploy-time D365 納入 runbook(sync → set category "Dynamics 365" + businessAlias → 流入 ledger/對帳/drift;機制零改)

## D4 — verify + closeout
- [x] build / lint / test 全綠(api 201;丁 backend/doc-only 無 web)+ prisma validate ✓(schema comment 改)
- [x] 無 regression(既有 test 全過 + 新 4 D365 case 綠)
- [x] BACKLOG / memory 同步 + progress retro + plan closed(ADR-0008 rollout 甲/乙/丙/丁 全 ✅)
