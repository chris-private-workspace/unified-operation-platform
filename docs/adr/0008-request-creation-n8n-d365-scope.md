# ADR-0008: 獨立 license request 建單 + n8n 雙向整合啟用 + D365 完整納入 scope

**Date**: 2026-07-15
**Status**: Accepted
**Approver**: Chris Lai

## Context

觸發來源:業務需求(Chris,2026-07-14/15 討論)—— 除咗 onboarding 流程需要 M365/D365 license 分配之外,亦有**獨立於 onboarding 嘅 M365/D365 license 請求**。呢啲請求者好多時冇經 ServiceNow request form 提交,而係由 IT 同事代手開單。故希望平台提供功能,由 IT 同事喺平台建立 ServiceNow request。討論後亦釐清咗 onboarding request 嘅實際 intake 機制,以及 D365 與 M365 喺 license 指派上係同一套 Graph 機制。

本 ADR 一次過解鎖 **三條 hard constraint**,並記錄推翻/擴大既有 locked 決策:

- **CLAUDE.md §5.1 H1**(架構變更):ServiceNow **create** 係新寫入方向(現有 `ServiceNowService` 只有 `getRecord/query/updateRecord/addWorkNote`,冇 create);新增 inbound intake API;新增 write-integration 抽象層。
- **CLAUDE.md §5.2 H2**(vendor lock):**n8n** 由 stack 表嘅 `(future)` 正式啟用為 integration vendor(雙向)。
- **CLAUDE.md §5.3 H3**(scope/tier):`DESIGN §2` 明列「非 onboarding 的獨立 license request」out of scope;`DESIGN §1`「刻意不建:ticket 申請表單」;`DESIGN §2/§9 #5`「M365 only」明列 D365 out of scope。本決定推翻/收窄呢啲界線。

**定位守則張力與化解**(`DESIGN §1`「先守住這條」):守則要求「requesting/recording → 留 ServiceNow」。表面上「喺平台建 request」踩正 ServiceNow 地盤。化解 = 場景本質係「錄入 ticket 呢個動作」目前由 IT 同事手動喺 ServiceNow 做,平台只係將**錄入動作**搬過嚟並代為 create;ticket 一 create 完即 100% 屬 ServiceNow(SoR),平台**不擁有 request intake 語意、不建 form/service catalog/審批鏈**。故定位為 action layer 對 SoR 嘅一次受控 write,守得住守則。

**與 ADR-0004 嘅關係**:ADR-0004 用 curation-as-scope 把 D365/Dataverse/Power Platform 一律 `skipped(unmapped-sku)`,刻意唔 track D365 allocation(當時 H3)。D365 完整納入後,curation set **擴大**到包含 D365 SKU —— curation-as-scope **機制不變**,只係 scope 邊界擴大;ADR-0004 唔 supersede,適用範圍隨本 ADR 擴。

**兩個整合方向**(討論釐清,避免混淆):
- **方向① INBOUND**:onboarding request 入嚟。requester 喺 ServiceNow 開單 → 觸發 n8n onboarding workflow → n8n 喺 AD 整好帳號後、workflow 完結前,call 平台 API push request(帶 ServiceNow ticket 關聯 + 「已 synced」狀態)。呢個係既有 module D 履行嘅上游來源;平台**被動暴露 REST endpoint**(即 `architecture.md §3`/`DESIGN §4.4`「OpenAPI contract 就係 n8n 受控接入點」),H2 影響較輕。
- **方向② OUTBOUND**:獨立 license request 出去。IT 同事喺平台開單 → create `sc_request` + `sc_req_item` 入 ServiceNow → 即時建本地 mirror。可走 direct(平台直連 Table API)或 n8n workflow(平台主動 call,H2 完整觸發)。

## Decision

### D1 — 獨立 license request 建單進 scope(thin create-ticket action)
平台提供 IT-facing 功能,由 IT 同事建立獨立(非 onboarding)M365/D365 license request,並 create 為 ServiceNow ticket。**守死界線**:唔建 request form for end-user 自助、唔建 service catalog、唔建審批鏈、唔擁有 intake 語意。ticket create 後即屬 ServiceNow SoR,平台接返既有 consume + 回寫履行流程。

### D2 — n8n 啟用為 integration vendor(雙向)
n8n 由 `(future)` 轉為 **active** integration vendor。
- **Inbound(方向①)**:平台暴露受控 REST endpoint 接 n8n onboarding push;需解決 n8n → 平台嘅 service auth(machine-to-machine,非 Entra user token)。
- **Outbound(方向②)**:平台可主動 call n8n webhook 去執行建單。

### D3 — ServiceNow create 能力 + write-integration 抽象
- `ServiceNowService` 加 `createRecord`(POST `/api/now/table/{table}`)。
- 建立可插拔抽象 `RequestSubmissionProvider`,兩實作:
  - `DirectServiceNowProvider` → `ServiceNowService.createRecord`。
  - `N8nWorkflowProvider` → POST n8n webhook(n8n 既有 workflow 已識建 `sc_request`+`sc_req_item`)。
- 由 config / per-request-type 揀路;一個做 primary 一個做 fallback。抽象目的 = 未來 D365、其他系統、AI 對外 write 皆可重用。

### D4 — 即時建本地 Request mirror
平台建單後**即時**喺本地建 `Request`(+`RequestLineItem`)記錄,IT 同事即時見到,唔等 reconcile poll。ServiceNow 仍係 SoR,本地係 mirror + action state。

### D5 — D365 完整納入 scope
D365 相關 license 與 M365 **一視同仁、同一套機制**,納入以下全部面向(推翻 `DESIGN §9 #5`「M365 only」):
- **assign**:技術上等同 M365 —— D365 license = Entra `subscribedSku`,行同一個 Graph `assignLicense`(ADR-0002/DESIGN §8)。**不含** D365-side 嘅 security role / legal entity provisioning(嗰啲喺 D365 admin,Graph 掂唔到,不在本 scope)。
- **catalog / ledger / 對帳 / drift**:D365 SKU 納入 SKU catalog、per-OpCo ledger、總量層對帳(方案甲 Σ assigned vs consumed)、drift alert。因平台 SKU 真相本就來自 `subscribedSkus`(D365 SKU 一早喺 list 內),此擴展主要係**移除人為嘅 M365-only filter + 擴大 ADR-0004 curation set**,唔係另起機制。

### D6 — sc_request/sc_req_item 對映 + schema 增補
- **對映**:`Request` ⇄ `sc_request`(REQ 父單);`RequestLineItem` ⇄ `sc_req_item`(RITM 子項,一 REQ 多 RITM)。
- **schema(additive,細節留 phase plan)**:`RequestLineItem` 加自己嘅 SN mirror 欄位(`serviceNowSysId`/`serviceNowNumber`),因現有 mirror 只掛 `Request`;可能加 `Request` origin/type 標記(區分 onboarding-intake vs platform-created)。migration 一律 additive。

### Rollout(分階段,ADR Accepted 後逐個 kickoff — rolling JIT,唔預建 folder)
Chris 已確認優先次序:
1. **Phase 甲 — Inbound intake**:`POST /requests`(接 n8n onboarding push)+ m2m auth + 建 mirror。(方向①,H2 較輕,先行)
2. **Phase 乙 — Outbound direct**:`RequestSubmissionProvider` + `DirectServiceNowProvider` + `ServiceNowService.createRecord` + 前端「開單」畫面。
3. **Phase 丙 — n8n outbound**:`N8nWorkflowProvider` + webhook 合約 + n8n 端 workflow 對接。
4. **Phase 丁 — D365 scope**:按 D5 移 filter、擴 catalog/ledger/對帳 curation set。

同步文件更新(本 ADR Accepted 後):`DESIGN §2`(scope in/out)、`§9 #5`(M365 only → M365+D365)、`architecture.md §2/§11`(tier matrix)、`ADR-0004` 適用範圍註記。

## Alternatives Considered

- **建單只做 direct(唔抽象)** — rejected:Chris 要兩種路徑並存(direct 簡單即時 / n8n low-code 可自助改),且 n8n 已有既有建單 workflow;硬綁單一路徑喪失彈性,未來對外 write 又要重寫。
- **建單只走 n8n(唔做 direct)** — rejected:令建單完全依賴 n8n 可用性;direct 落地成本低(現有 service 加一個 method),適合做 primary/fallback 之一。
- **D365 逐步納入(先 assign,ledger/對帳留後)** — rejected:Chris 明確要一次過連 ledger/對帳/catalog;且因 D365 SKU 本就喺 `subscribedSkus`,分階段反而要臨時 filter、之後再拆,多做功;完整納入更乾淨。
- **Inbound 用平台 poll ServiceNow(唔靠 n8n push)** — rejected:onboarding 由 n8n 執行,n8n 喺 AD 整好帳號嗰刻最清楚「已 synced」,push 帶埋 sync gate 狀態最準;poll 有延遲且攞唔到 AD 完成時點。
- **拆多份 ADR(建單 / n8n / D365 各一)** — rejected:三者係同一 initiative、同一次拍板、互相關聯(D365 建單 + D365 assign + D365 對帳連動),分拆過度碎片化且共用同一 Context;沿用 ADR-0004/0007 一份多-decision 先例。
- **Chosen**:一份 ADR 解鎖 H1+H2+H3,thin-action 建單 + 雙向 n8n + write 抽象 + D365 完整納入 + 分四階段 rollout — 因為同時滿足守定位守則、兩路徑彈性、D365 一視同仁、且 rollout 次序清晰可獨立驗。

## Consequences

- **Positive**:補回 request 閉環上游缺口(create → SoR → consume → fulfil,reuse 既有履行);IT 同事有快速開單入口;n8n 正式打通雙向(onboarding intake 有正規來源);write-integration 抽象可長遠重用;D365 與 M365 統一,消除人為 filter 帶嘅認知負擔。
- **Negative**:n8n 成為 active 依賴(可用性 / 跨系統 trace / m2m auth 要做穩);多一條 create 寫入路徑 = H5 test + scope 嚴守面擴大;D365 納入令 catalog/ledger/對帳 資料量與 curation 工作增加(37 SKU → 含 D365 更多);ServiceNow `sc_request`/`sc_req_item` 實際欄位(catalog item variables / 觸發 workflow)需對齊 Phase 1 team,建單比讀單更依賴準確欄位(`DESIGN §10` open item)。
- **Neutral**:ServiceNow 仍係 SoR、平台仍係 mirror + action;定位守則不變(thin action 守得住);對帳方案甲邏輯不變(只係 SKU 集合擴大含 D365);ADR-0004 curation-as-scope 機制不變(邊界擴大);schema 改動 additive、無 breaking migration;成本/發票仍走 DocuWare(不進平台)。

## References

- `docs/02-architecture/licenseops/DESIGN.md` §1(定位守則)· §2(scope in/out)· §4.1(n8n 分工)· §4.4(OpenAPI = n8n 接入點)· §5(subscribedSkus 總量真相)· §6(domain model / SN mirror 欄位)· §7(request 生命週期)· §8(integration layer)· §9 #5(M365 only,本 ADR 推翻)· §10(ServiceNow 實際 table/field open item)
- `docs/architecture.md` §1(SoR/SoA 定位)· §2(scope & tiers)· §3(四層地基 / OpenAPI 接入點)· §11(tier 2 future matrix)
- CLAUDE.md §5.1 H1 · §5.2 H2(n8n future→active)· §5.3 H3
- ADR-0002(Graph JWT / `assignLicense`)· ADR-0004(allocation import / curation-as-scope,適用範圍隨本 ADR 擴至含 D365)· ADR-0007(ledger 手動管理)
- `apps/api/src/integration/servicenow/servicenow.service.ts`(現有讀寫,待加 `createRecord`)
- Rollout phases:W24+(甲 inbound / 乙 outbound-direct / 丙 n8n-outbound / 丁 D365-scope)— Accepted 後 rolling kickoff

---

## Errata(2026-07-15,post-Accept 勘誤 — 只更正事實/引用,不改任何決策)

> 依 CLAUDE.md §6:Accepted ADR 決策內文不改;以下純事實/引用筆誤,以勘誤註記正,決策本身不變(W24 doc-review 揪出)。

1. **D5 + References 誤引 ADR-0002 做 `assignLicense` 出處** — ADR-0002 係「後端 Entra JWT 驗證」(驗 incoming API JWT),同 Microsoft Graph `assignLicense` **無關**。`assignLicense` 正確出處 = **DESIGN §8 + `apps/api/src/integration/graph/graph.service.ts`**(References 已另行 cite,故 ADR-0002 於此屬誤植)。
2. **Rollout Phase 甲 endpoint `POST /requests`** = 簡寫;正式路徑 **`POST /requests/intake`**,以 `docs/01-planning/W24-request-intake/CONTRACT.md §6` 為 endpoint SSOT。
3. **Context 內 `ServiceNowService` method 清單漏 `getRecordByNumber`**(實際 5 個:getRecord / getRecordByNumber / query / updateRecord / addWorkNote);承載論點「冇 `createRecord`」不變。
4. **D6 REQ/RITM 語意 clarify(Chris 2026-07-15,option a)**:`Request.serviceNow*` = REQ(`sc_request`)、`RequestLineItem.serviceNow*` = RITM(`sc_req_item`)。現有 W03 user-facing intake + `assign.service` 回寫一直當 RITM 用,決定**兩條 intake 一齊升 two-level、回寫改逐 line item**(seed 零 SN,零 migration)。屬 D6 落地細節,不改 D6 決策;SSOT = `CONTRACT.md §4`。
