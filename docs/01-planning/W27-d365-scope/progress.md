---
phase: W27-d365-scope
status: active
---

# W27 Phase 丁 — Progress

## Day 0（2026-07-15）— kickoff + ground + scope 拍板
- **緣起**:ADR-0008 D5 rollout 最後一步 —— D365 license 完整納入(assign/catalog/ledger/對帳/drift 一視同仁)。接 Phase 丙(n8n-outbound,W26 closed `23330c2`)。
- **grounding(Explore 全掃 + 第一手)**:
  - **重大發現**:平台機制**早就 SKU-agnostic**。`businessAlias != null` curation gate **全 codebase 只在 `allocation-import.service.ts:60-62` 一處**;`catalog.service`(list/sync)、`reconcile.service`(drift)、`tenant-owned.service`(方案甲總量)、`ledger-read/write`、`assign.service` 全部只 filter `active` + data-presence,**冇 SKU 類型 / M365-only filter**。
  - ADR-0004 當年**明確 reject** name-denylist(「多寫 code、名一改就脆」)→ scope 邊界一直 = curation set(邊啲有 businessAlias)。
  - D365 SKU 由 `graph.getSubscribedSkus()` **已 sync 入 catalog**(冇 filter),排除唯一原因 = 未 curate `businessAlias`(純 data);且除 import 外,reconcile/drift/tenant-owned/assign 本就包含佢。
  - schema `SkuCatalog.category` 已係自由 `String?`(非 enum),`isBaseLicense` 註明「NOT a hard gate」→ **無需 schema 改**。
  - seed **唔 hardcode** catalog(ADR-0004:catalog 由 sync 嚟);curation 值(businessAlias/category)= 人手 curate,非 seed/import。
- **∴ ADR-0008 D5「移除人為 M365-only filter」= 冇 code filter 要拆**。phase 性質 = confirm + lock-in + 文檔,唔係加機制。
- **Scope 拍板(Chris 2026-07-15,AskUserQuestion)= A**(confirm + 測試 + 文檔):D365-parity H5 test + doc-sync + curation runbook。**零 schema/機制改**;唔做 B(代表性 seed catalog,偏離 sync 設計)/ C(前端分組)。真數 curation = deploy-time ops(ADR-0004)。
- **產出**:`plan.md`(0.1)+ `checklist.md` + 本 `progress.md`。plan **active**(scope 已拍板);落 D1。

---

## Day 1（2026-07-15）— D1-D4 實作 + verify + closeout（同日 approve → 落 code）

**D1 — D365-parity 測試(H5 lock-in,4 spec 各加 1 case)**:
- `allocation-import.service.spec`:curated D365 SKU(businessAlias set)→ 正常 import 入 ledger(RTH=175 change,`skippedSkuLabels` 空)—— counterpart to 現有 uncurated-D365 skip,證「擴 curation set 至 D365」零 code 改。
- `reconcile.service.spec`:D365 SKU(`DYN365_ENTERPRISE_SALES`)參與總量層 drift(`Σ assigned 4 vs consumed 7 → delta 3` DriftAlert),同 M365 一致。
- `assign.service.spec`:D365 SKU 經 `skuId` `graph.assignLicense` + ledger `assignedQuantity +1`,無類型 gate(同 M365 upsert）。
- `tenant-owned.service.spec`:D365-category SKU 入 owned/total(owned 500/allocated 400/unallocated 100),`category='Dynamics 365'` 非 gate。

**D2 — doc-sync + comment 對齊**:
- `architecture.md` §2/§11 + `DESIGN` §2/§9#5 → **已由 ADR-0008 doc-sync**(accept 時做咗),確認完整無需改。
- `docs/adr/0004-*` → 加範圍註(curation-as-scope 機制不變、適用範圍隨 ADR-0008 擴含 D365;決策內文不改 §6)。
- surgical de-「M365-only」(§1.3 只改 now-misleading):`main.ts` Swagger title `M365`→`M365/D365`;schema 3 comment(skuId「M365 GUID」→「M365/D365 GUID」· OpcoSkuLedger assignedQuantity「reconciles vs M365 total」→「vs tenant total (M365+D365)」· DriftAlert.tenantConsumed「M365 consumedUnits」→「tenant consumedUnits」)。無順手掃無關 comment。

**D3 — curation runbook**:`CURATION-D365.md`(deploy-time ops)—— sync → set `category="Dynamics 365"` + `businessAlias`(要 CSV import 才需)→ 自動流入 ledger/對帳/drift/assign;明確唔做 D365-side provisioning(D5 邊界）。

**D4 verify**:prisma validate ✓(schema comment 改)· api build ✓ · **jest 197→201**(+4 D365 parity)· eslint 我檔 clean(`--fix` 修一個 where 換行,re-run assign 18 綠)。**無 live boot**(丁零 runtime 行為改,純 test lock-in + doc + comment)。

**Retro**:
- **grounding 係本 phase 最高槓桿**:Explore 全掃 + 第一手 schema 揭「機制早 SKU-agnostic、無 code filter」→ 令 scope 由「拆 filter」誠實 reframe 做「confirm + lock-in + doc」,避免寫**唔存在嘅** filter-removal code(§1.1/§1.2)。ADR-0008 D5「移除人為 M365-only filter」措辭其實無對應 code —— grounding 唔盲信 ADR 措辭,睇真 code。
- **測試 = characterization/lock-in**:因無 production code 改,4 個 D365 case 係「證實 + 防未來 regression 特殊化」,唔係驗新邏輯。誠實記錄,唔造「拆咗 filter」假象。
- **doc 大半已完成**:architecture/DESIGN ADR-0008 accept 時已 sync → D2 主要係 ADR-0004 註 + surgical comment,守 §1.3 無 churn。
- **H1 全程守死**:方案甲/ledger 兩層/skuId 主鍵/schema field 全不動;schema 只改 comment(prisma validate 過)。

## ⏸️ Phase 丁 closeout — ADR-0008 rollout 完成
- **ADR-0008 四階段全 ✅**:甲 inbound intake(W24)· 乙 outbound direct(W25)· 丙 n8n outbound(W26)· **丁 D365 scope(W27)**。initiative 收官。
- **carry(deploy-time / 非 repo)**:① **真 D365 SKU curation**(真 tenant sync 後 set businessAlias/category,CURATION-D365.md runbook)② 代表性 SN(乙)+ n8n webhook(丙)合約 live 對齊 ③ uncurated-SKU drift 噪音(既有機制,非本 phase;curation 決定 track 邊啲)。
- **下一步**:無 ADR-0008 後續;回 BACKLOG 揀 pending(🔴 AUTH-2b 真 SSO e2e[卡 IT app reg]· DEPLOY 生產部署 + 真數 curation · honest-gap 三項)。rolling JIT,待 Chris 揀。
