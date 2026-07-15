---
phase: W27-d365-scope
name: "Phase 丁(D365 scope）— D365 license 完整納入:confirm parity(H5 test)+ doc-sync + curation convention"
sprint_week: W27
backlog_id: REQ-D365-SCOPE (ADR-0008 Phase 丁)
start_date: 2026-07-15
end_date: 2026-07-15
status: closed           # draft → active → closed(D0-D4 完成,api build/test 201/lint/prisma-validate 全綠 2026-07-15)
adr: ADR-0008 (Accepted) · ADR-0004(適用範圍隨本 ADR 擴)
spec_refs:
  - docs/adr/0008-request-creation-n8n-d365-scope.md（D5 D365 完整納入:assign/catalog/ledger/對帳/drift 一視同仁,「唔係另起機制」）
  - docs/adr/0004-allocation-import-mechanism.md（curation-as-scope;明確 reject name-denylist;適用範圍隨 ADR-0008 擴含 D365）
  - docs/02-architecture/licenseops/DESIGN.md §2(scope,已 ADR-0008 更新 M365+D365)·§4.4(方案甲)·§5(ledger 兩層/總量對帳)·§9 #5(已更新)
  - apps/api/prisma/schema.prisma（SkuCatalog:category 已係自由 String?,無需改）
prior_phase: W26-request-n8n-outbound
---

# Phase 丁 — D365 license 完整納入 scope

> **Plan version**:0.1(**draft** — 待 approve）· **Owner**:Chris Lai · **ADR**:ADR-0008(Accepted)D5
> **grounding 結論(Explore 全掃 + 第一手 schema/ADR/DESIGN,2026-07-15)**:平台機制**早就 SKU-agnostic** —— `businessAlias != null` curation gate **全 codebase 只在 allocation-import 一處**;catalog/對帳方案甲/drift/tenant-owned/assign/ledger-PATCH 全部只 filter `active` + data-presence,**冇 SKU 類型 / M365-only filter**(ADR-0004 當年明確 reject name-denylist)。D365 SKU 由 `subscribedSkus` sync **已入 catalog**,被排除嘅唯一原因 = 未 curate `businessAlias`(純 data),且除 import 外全部下游本就包含佢。
> **∴ ADR-0008 D5「移除人為 M365-only filter」= 冇 code filter 要拆**;本 phase = **confirm + lock-in + 文檔化** D365 已被支援,+ 定清 curation 慣例。真數 curation(真 skuId)= **deploy-time ops**(ADR-0004 已定,非 repo 改)。
> **Scope 決定(Chris 2026-07-15,AskUserQuestion)= A**:confirm + 測試 + 文檔(**零 schema/機制改**;唔加代表性 seed catalog[B]、唔郁前端[C]）。

## 0. 前置 gate
- ADR-0008 Accepted ✅ · Phase 甲/乙/丙 closed ✅ · scope A 拍板 ✅
- **H1 不觸及**:方案甲對帳 / ledger 兩層(allocated/assigned)/ skuId 主鍵 / stage 掛 line item / sync gate 全部**不動**;schema **無改**(`category` 已自由 String?)。本 phase = 擴大 scope 邊界(curation 慣例)+ 鎖定 parity,**唔係另起機制**(ADR-0008 D5 原話)。

## 1. Scope

### In(W27 / Phase 丁,scope A）
- **D1 — D365-parity 測試(H5,critical path)**:喺既有 spec 加 D365 case,**鎖死** D365 SKU 被一視同仁(防未來特殊化 regression):
  - `allocation-import.service.spec`:**curated D365 SKU(businessAlias set)→ 正常 import 入 ledger**（現有 spec 只證 uncurated D365 被 skip;加 counterpart 證「擴大 curation set 至 D365」零 code 改即 work）。
  - `reconcile.service.spec`:D365-category SKU 參與總量層 drift(`Σ assigned vs consumed`）同 M365 一致。
  - `assign.service.spec`:D365 SKU 經 `skuId` assign 成功(無類型 gate)+ ledger `assignedQuantity +1` 同 M365 路徑一致。
  - `tenant-owned.service.spec`（可選、cheap）:D365 SKU 出現喺 owned/total 計算。
- **D2 — doc-sync + comment 對齊**：
  - `docs/architecture.md` §2 / §11 tier matrix — 確認/更新 D365 **license** in-scope（D365 **業務模組**仍 future）。
  - `docs/adr/0004-*` — 加「適用範圍隨 ADR-0008 擴含 D365 curation」一句(References 已預告,補實)。
  - de-「M365-only」誤導 comment/label（**surgical,只改 now-misleading 嘅**）:如 `main.ts` title、`DriftAlert.tenantConsumed`/`tenant-owned.dto` 註解「M365 …」→ 「M365/D365 tenant …」。**唔順手大改無關 comment**（§1.3）。
  - DESIGN.md — verify §2/§9#5 已完整(ADR-0008 已 doc-sync,補漏即可)。
- **D3 — curation convention 文檔（deploy-time ops runbook）**：`CURATION-D365.md`(phase folder)—— D365 SKU 納入步驟:catalog/sync 後,set `category`（建議值 "Dynamics 365"）+ `businessAlias`（對應 Excel/import label）→ 自動流入 ledger(import)/對帳/drift。強調真 skuId curation = deploy-time（真 tenant),機制零改。
- **D4 — verify + closeout**：build/lint/test（api）+ doc review + BACKLOG/memory 同步 + progress retro + plan closed。

### Out（→ 明確唔做）
- **代表性 seed catalog（含 D365）** — scope B,唔做（偏離「catalog 由 sync 嚟」ADR-0004 設計）。
- **前端 asset-list D365 分組** — scope C,唔做（無 UI 改）。
- **真數 curation（真 D365 skuId + businessAlias）** — deploy-time ops（ADR-0004 已定），非 repo。
- **D365-side provisioning**（security role / legal entity,Graph 掂唔到）— ADR-0008 D5 永久 out。
- **D365 業務應用模組**（F&O 工作流）— future tier，非 license 層。
- **任何機制改**（對帳方案甲 / ledger / schema / filter 邏輯）— H1 守死,不動。

## 2. Approach
- **測試風格**:仿既有 spec（`allocation-import.service.spec` 已有 D365 skip case；照同一 fixture 樣式加 curated-D365 case）。D365 SKU 用代表性 `skuPartNumber`(如 `DYN365_ENTERPRISE_SALES`)+ `category:'Dynamics 365'`。Graph/DB 一律 mock（§3.4）。
- **doc surgical**:comment/label 只改「而家會誤導」嘅（M365-only 語意）;描述性「M365 GUID」等唔誤導嘅唔掃。
- **零 runtime 行為改**:因機制本已 SKU-agnostic,測試係 **characterization / lock-in**（證實 + 防 regression），唔期望改任何 production code path。若寫測試途中發現任何**真**阻擋 D365 嘅 code → STOP,surface（可能 ADR-0008 D5 有未預見細節）。

## 3. Deliverables
- **D0** — kickoff（本 plan + checklist + progress）+ ground（✅ Explore 全掃 + 第一手 schema/ADR-0004/ADR-0008/DESIGN）。
- **D1** — D365-parity 測試（allocation-import curated-D365 / reconcile / assign [/ tenant-owned]）。
- **D2** — doc-sync（architecture tier matrix + ADR-0004 註 + surgical comment de-M365-only + DESIGN verify）。
- **D3** — `CURATION-D365.md`（deploy-time curation runbook）。
- **D4** — verify（build/lint/test）+ closeout（BACKLOG/memory + progress retro + plan closed；ADR-0008 rollout 甲/乙/丙/丁 全 ✅）。

## 4. Phase Gates
- **G1** curated D365 SKU（businessAlias set）→ allocation-import 正常入 ledger（test 綠）。
- **G2** D365 SKU 參與 reconcile drift + assign +1 + tenant-owned，同 M365 一致（test 綠）。
- **G3** 全 api test 綠（無 regression;新增 D365 case 全過）+ build/lint 清。
- **G4** doc:architecture tier matrix / ADR-0004 註 / DESIGN 一致講 D365 license in-scope;誤導 comment 已對齊。
- **G5** curation runbook 清楚可執行（deploy-time D365 納入步驟）。

## 5. Risks / 誠實限制
- **repo 側幾乎零 code**:本 phase 主要係 test lock-in + doc —— 因機制本已支援 D365。**唔造「拆咗 filter」嘅假象**（根本冇 filter）;誠實記錄 = 擴 scope 邊界靠 curation。
- **真數 curation 未做**:真 D365 skuId + businessAlias 要真 tenant sync 後由人 curate（deploy-time,ADR-0004 已定）;repo 只證機制 + 出 runbook。
- **uncurated SKU drift 噪音**（既有、非本 phase 引入）:reconcile 對所有 active SKU 計 drift → 未 curate 但已 sync 嘅 SKU（含 D365）若 tenant 有 consumed 但無 ledger,會顯 drift。此為**既有機制行為**,H1 不動;若成問題屬另議（curation 決定 track 邊啲）。本 phase 唔改 reconcile。

## 6. Changelog
- 0.1(2026-07-15)— **draft**;ADR-0008 Phase 丁 kickoff。grounding 揭平台已 SKU-agnostic（無 code filter）→ scope A（confirm + test + doc,Chris 2026-07-15 AskUserQuestion）。待 approve → active 落 D1。
- 0.2(2026-07-15)— **active → closed**;D1-D4 完成。D1 4 個 D365-parity lock-in test（allocation-import curated-D365 / reconcile drift / assign +1 / tenant-owned;api 197→**201**）· D2 doc-sync（architecture/DESIGN 確認已 ADR-0008 synced;ADR-0004 範圍註;surgical de-M365-only:main.ts title + 3 schema comment）· D3 `CURATION-D365.md` deploy-time runbook。**零 schema field / 機制 / 前端改**（schema 只改 comment,prisma validate ✓）。build/lint/test 全綠。**ADR-0008 rollout 甲/乙/丙/丁 全 ✅ 收官**。
