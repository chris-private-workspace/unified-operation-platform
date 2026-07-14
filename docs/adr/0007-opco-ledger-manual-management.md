# ADR-0007: OpCo ledger 手動管理(逐格校正 allocated/assigned + LedgerAdjustment audit + 對回機制啟動)

**Date**: 2026-07-14
**Status**: Accepted
**Approver**: Chris Lai

## Context

觸發 **CLAUDE.md §5.1 H1** —— ledger 兩層數字(`allocatedQuantity` / `assignedQuantity`)嘅**語意 + 寫入路徑**係 lock 咗嘅架構決定,改佢要先 ADR。

**業務現實(Chris,2026-07-14)**:

- Microsoft tenant **只知道 tenant 層總量真相**:`owned` = `subscribedSkus.prepaidUnits.enabled`、`consumed` = `consumedUnits`,兩者 Graph 自動同步。
- Microsoft tenant **唔知道**呢啲數點分拆去公司內部唔同 OpCo —— **OpCo 劃分係內部管理維度,Graph 無法提供**。呢個正正就係 License Assets 有 **By-OpCo** 同 **Platform** 兩個介面嘅原因。
- 採購流程唔喺平台走(最多喺 request 轉狀態表達),所以買咗幾多、分咗俾邊個 OpCo,平台冇自動來源。
- 結論:**By-OpCo 層嘅 `allocatedQuantity` + `assignedQuantity` 需要人手管理**,唔可能全自動同步。

**現有實作(W13/W14/W16 map)**:ledger 只有兩條寫入路徑 —— `POST /license/ledger/import`(只寫 `allocatedQuantity`,ADR-0004)+ fulfilment assign(`assignedQuantity` +1,W04)。**無任何單筆 ledger write endpoint**;Assets 畫面純唯讀。

**DESIGN 已預留兩個擴展點正對應此需求**:§10「Reconciliation 對回機制」(明確 deferred)、§6「ledger 逐次修改的獨立 audit 表 —— 先靠 `RequestEvent`,將來需要再加 `LedgerAdjustment`」。本 ADR = 啟動呢兩個預留點,唔係推翻 locked 決策。

## Decision

1. **確立分層真相(釐清 By-OpCo vs Platform)**
   - **Platform 層 = tenant 真相**:`owned`(prepaidEnabled)+ `tenant-consumed`(consumedUnits),Graph **自動同步、唯讀**。
   - **By-OpCo 層 = 內部管理帳**:`allocatedQuantity` + `assignedQuantity`,**人手維護**。
   - **對帳橋樑不變**:`Σ(By-OpCo assignedQuantity) vs tenant consumedUnits` = drift(方案甲原邏輯)。

2. **新增單筆 ledger write endpoint** `PATCH /license/ledger/:id`(by ledger row id;OpCo+SKU 對已存在 row)—— 設定 `allocatedQuantity` / `assignedQuantity` **絕對值**。呢個係 import / assign 之外**第三條、亦係首條「逐格人手」寫入路徑**。

3. **`assignedQuantity` 語意擴展**:由「純 fulfilment assign +1」→「fulfilment assign 自動 +1 **加** 人手校正」。對帳邏輯(Σ assigned vs consumed)**不變**;手動改 assigned = DESIGN §10「把 drift 差異對回落某 OpCo」嘅機制落地。fulfilment assign(W04)繼續自動 +1 不變,人手編輯係 set 絕對值嘅校正 override。

4. **新增 `LedgerAdjustment` audit model**(落實 DESIGN §6 預留):每次**人手逐格**改 ledger 記 `who / when / opcoId+skuCatalogId / field / before→after / reason`。import 與 assign 嘅既有寫入**唔強制**入此表(各有 import summary / RequestEvent),只有逐格編輯必記。

5. **權限沿用 AUTH-3a**:ADMIN / REGIONAL 改全部;OPCO_IT 用 `assertOpcoScope` 只改自己 OpCo(**fail-closed 403**)。

6. **over-allocation 沿用「flag 不 block」**:唔硬 gate(維持現有 `overAllocated` flag 誠實呈現);寫入 invariant 限於**非負整數**(同 import `toQuantity` 一致)。

7. **各欄獨立**:改 `allocatedQuantity` 唔碰 `assignedQuantity`,反之亦然(沿用 import allocatedQuantity-only 精神)。

8. **UI**:Assets **By-OpCo** 表加 inline edit(**一個** primary「Save」,token-only,H6,light+dark)。

9. **DESIGN.md §5 / §6 / §10 同步更新**(決策 SSOT 唔可以淨改 code)。

## Alternatives Considered

- **Option A:只做 allocated inline edit,assigned 維持純 assign 驅動(唯讀)** — rejected:唔解決核心業務現實(好多 assign 唔經平台 → assigned 需人手校正對回),且 Chris 明確要 By-OpCo assigned 可手動。
- **Option B:擴充 CSV import 涵蓋 assigned** — rejected:import 係批量 curation-as-scope,唔啱逐格即時校正;會破壞 ADR-0004 嘅 allocatedQuantity-only invariant。
- **Option C(Chosen):新單筆 PATCH endpoint + `LedgerAdjustment` audit + assigned 語意擴展** — 對應 DESIGN 預留擴展點、逐格即時、有 audit、scope 清晰、對帳邏輯不變。

## Consequences

- **Positive**:By-OpCo 內部帳可維護;§10 對回機制落地;ledger 人手改動有 audit trail;Assets 由唯讀變可管理;貼合「Graph 得 tenant 真相、OpCo 劃分靠人手」嘅現實。
- **Negative**:`assignedQuantity` 唔再係「純自動衍生真相」,可信度依賴人手正確性;多一條寫入路徑要 H5 test + scope 嚴守;over-allocation 不 block 可能出現超配(靠 flag 呈現,唔係硬 gate)。
- **Neutral**:對帳方案甲 / drift 偵測邏輯不變;import / assign 既有路徑不變;schema 加一個 **additive** model(`LedgerAdjustment`)+ 無改現有欄位 → 無 breaking migration。

## References

- `docs/02-architecture/licenseops/DESIGN.md` §5(對帳方案甲 / 兩層數字)、§6(LedgerAdjustment 預留)、§10(對回機制 deferred)
- `CLAUDE.md` §5.1 H1
- ADR-0004(allocation import 機制)
- W13(import)/ W14(ledger read)/ W16(tenant-owned)實作
- Phase `docs/01-planning/W23-assets-manual-ledger/plan.md`
