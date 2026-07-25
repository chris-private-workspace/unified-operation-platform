# ADR-0014: `assignedQuantity` go-live baseline 初始化機制(一次性 ops script,唔擴 import、唔加 bulk API)

**Date**: 2026-07-25
**Status**: Accepted
**Approver**: Chris Lai

## Context

`DESIGN.md §5`(line 96)要求:「上線前 → 建 per-OpCo ledger → 跟 M365 實際總數比對 → 把差異**全部清乾淨**建立 baseline → 才開始用」。而 `assignedQuantity` 係**唯一參與對帳 / drift 嘅數字**(`DESIGN.md:98/101`;`allocatedQuantity` 純顯示,不對帳)。

W35 grounding 埋身查證後確認:**平台冇任何批量建立 `assignedQuantity` baseline 嘅路徑**。全 repo 只有三處寫 `assignedQuantity`:

| 路徑 | 實況 | 為何唔夠 |
|---|---|---|
| `POST /license/ledger/import` | **明確拒絕**寫 assigned(`allocation-import.service.ts:24-28` 硬 invariant;create 省略該欄靠 schema default 0,update 只 set allocated) | ADR-0004 Decision #5 刻意咁做 —— 保護 drift baseline 唔被 budget 數污染 |
| `assign.service.ts:163` | 每次真人 onboarding `+1`(upsert 會建 row) | 只反映**平台上線後**嘅新 assign,追溯唔到上線前既有存量 |
| `PATCH /license/ledger/:id`(ADR-0007) | 逐格設絕對值 + `LedgerAdjustment` audit | **一格一個 HTTP call**,而且 `ledger-write.service.ts:58-62` 要求 row 已存在;23 OpCo × 37 SKU ≈ **851 格** |

後果:若 go-live 唔填 baseline,首次 `POST /license/reconcile` 會拿 tenant `consumedUnits` 對 `Σ assignedQuantity = 0` → **每個 SKU 都爆 `DriftAlert`**,drift 功能上線即失去信號價值,直接違背 `DESIGN.md:96`。

「新增一條寫入 `assignedQuantity` 嘅機制」= 動到 module spec 已 lock 嘅 ledger 兩層數字語意 + 潛在改 ADR-0004 invariant → 觸發 **CLAUDE.md §5.1 H1**,故 STOP 並由 owner 拍板;本 ADR = 解鎖記錄(R5)。同時觸發 **H5**(掂 ledger write = critical path,必須同步寫 test)。

## Decision

建 **一次性 ops script `apps/api/prisma/init-assigned-baseline.ts`**(選項 C),而**唔**擴 allocation-import、**唔**新增永久 bulk API surface:

1. **輸入 = CSV 文字檔路徑**(script 參數),格式與 allocation-import 同一個 matrix 慣例:header === `Opco.code`、col A === `SkuCatalog.businessAlias`、格 = 整數已指派座位數。沿用同一格式 = 唔另創第二種 data contract。
2. **對映規則與 ADR-0004 完全一致**:OpCo exact match `Opco.code`;SKU 經 `businessAlias` exact match(curation-as-scope —— 未 curate 就 skip 並報告)。**唔重寫對映邏輯** —— 抽用 `allocation-import.service.ts` 既有 `parseCsv` + 對映做法,避免兩處 drift。
3. **dry-run 先行**:default dry-run(印 before → target → delta + skipped 清單),要 explicit flag 才 commit。與 ADR-0004 OD4 human-in-the-loop 精神一致。
4. **寫入範圍**:只寫 `assignedQuantity`(**鏡像** ADR-0004 嘅反向 invariant —— 該 script 絕不掂 `allocatedQuantity`)。row 唔存在則 create(allocated 留 schema default 0,交由 allocation-import 補)。
5. **Audit**:每格改動寫一條 `LedgerAdjustment`(field=`assignedQuantity`,`reason` 標明 go-live baseline),與 ADR-0007 手動校正同一 audit 表 —— baseline 初始化語意上就係「批量手動校正」。
6. **ADR-0004 Decision #5 invariant 不變**:allocation-import 永遠唔寫 `assignedQuantity`。本決策**唔修訂**該 ADR,只係在其**旁邊**加一條獨立、一次性嘅 ops 路徑。
7. **定位 = deploy-time ops,唔係產品功能**:唔出現在 API surface、唔出現在 UI、唔進 permission matrix。使用方式寫入 `docs/05-usage/DATA-INITIALISATION.md`(W35 F1)步 5。

## Alternatives Considered

- **Option A:擴 `POST /license/ledger/import` 加 `target: 'assigned'` mode** — rejected:**直接違反 ADR-0004 Decision #5** 嘅 `allocatedQuantity`-only write invariant,而該 invariant 正是保護方案甲 drift baseline 唔被 budget 數污染嘅唯一機制屏障。要行呢條路就要修訂一份 Accepted ADR,而且從此 import 端點同時可寫兩個語意完全唔同嘅數字,人手揀錯 mode = 靜靜污染對帳基準。風險回報最差。
- **Option B:新增 `PATCH /license/ledger/bulk`(批量絕對值 set + audit)** — rejected(**但保留為升級路徑**):保住 ADR-0004 invariant、語意乾淨(= ADR-0007 批量版),而且將來 drift 批量對回都用得著。否決理由係**時機**:baseline 初始化按 `DESIGN.md §5` 定義係**上線前一次性**動作,為一次性需求新增永久 API surface(連帶 permission matrix 條目、scope gating、audit 面、attack surface)= 過早。若日後 `Drift-resolve` 真需要批量對回,屆時寫新 ADR 升級去 B,本 script 亦可退役。
- **Option D:唔加機制,靠 W23-B 既有 inline edit 逐格填** — rejected:23 × 37 ≈ 851 格,人手逐格點擊不現實,而且逐格 PATCH 前 row 仲要先存在(`ledger-write.service.ts:58-62` 404)。註:若真實有存量嘅 (OpCo, SKU) 組合數量級遠低於 851,D 本來唔荒謬 —— 該數量級(**OQ-W35-2**)owner 未提供,故按最壞情況設計;script 對細數據集一樣適用,所以呢個未知數唔影響本決策。
- **Chosen:Option C(一次性 ops script)** — 因為它同時做到:唔動 ADR-0004 invariant(零架構債)· 唔擴永久 API surface(零新 attack surface / 零 permission 條目)· 沿用既有 CSV 格式同對映邏輯(零第二種 data contract)· 有 dry-run 同 `LedgerAdjustment` audit(唔犧牲可審計性)· 精準對應「上線前一次」嘅真實使用頻率。ADR-0004 當年 reject CLI script 嘅理由係「Regional IT 每次 re-import 要 dev 介入」—— 該理由針對**重複性**嘅 allocation 更新,對**一次性** baseline 初始化唔適用。

## Consequences

- **Positive**:解封 `DESIGN.md:96` 嘅 go-live 前提(baseline → reconcile 清零 → 才開放),令 drift 功能上線即有信號價值;ADR-0004 invariant 完好無損;零新 runtime dependency、零 schema 改動、零新 API surface;audit trail 沿用 `LedgerAdjustment`(唔另起表)。
- **Negative**:baseline 更新需 dev / ops 執行 script(非自助)—— 一次性動作故可接受,但**若日後需要重複做,呢個就會變成痛點 → 訊號係「回頭揀 Option B」,唔好靜靜擴 script 功能**;script 屬 `prisma/` ops 工具,唔受 API 層 role guard 保護(靠 DB 連線權限本身),所以**執行者權限等同 DB 直連**,runbook 要寫明。
- **Neutral**:baseline 數字來源仍係人手 Excel / 現況盤點(平台唔會自己知上線前誰有 license);script 只寫 `assignedQuantity`,`allocatedQuantity` 仍走 allocation-import 兩者互不干擾;`AuditLog`(ADR-0009)唔覆蓋 script(非 API 操作),`LedgerAdjustment` 係其 audit 真相。

## References

- `docs/02-architecture/licenseops/DESIGN.md` §5(line 96 初始化流程 · line 98/101 兩層數字與寫入路徑)
- [ADR-0004](./0004-allocation-import-mechanism.md) Decision #5(`allocatedQuantity`-only write invariant —— 本 ADR **唔修訂**它)· Alternatives(當年 reject CLI 嘅理由與適用範圍)
- [ADR-0007](./0007-opco-ledger-manual-management.md)(`LedgerAdjustment` audit · 手動校正語意 —— baseline = 其批量一次性版)
- [ADR-0009](./0009-platform-audit-trail.md)(`AuditLog` 覆蓋範圍 = API 操作,唔含 ops script)
- `docs/01-planning/W35-data-initialisation/`(plan §2 F3 四選項對照 · progress Day 1 決策記錄)
- `docs/01-planning/DEFERRED_REGISTER.md` DD-1(「殘留 = 生產真數 curation = deploy ops step」)
- CLAUDE.md §5.1 H1(新寫入機制 / 動到 locked ledger 語意)· §5.5 H5(ledger write 必測)
- **未決**:OQ-W35-2(真實有存量嘅 (OpCo, SKU) 組合數量級)· W35 F4(`POST /license/ledger` 建空 row 是否真需求 —— 待本 script 落地後重評)
