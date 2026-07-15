---
phase: W25-request-outbound-direct
name: "Phase 乙(outbound direct)— IT 平台開單 → 主動 create sc_request/sc_req_item → 建 mirror + 前端開單畫面"
sprint_week: W25
backlog_id: REQ-OUTBOUND-DIRECT (ADR-0008 Phase 乙)
start_date: 2026-07-15
end_date: 2026-07-15
status: closed           # draft → active → closed(D0-D7 完成,api+web build/test/curl 全綠 2026-07-15)
adr: ADR-0008 (Accepted)
spec_refs:
  - docs/adr/0008-request-creation-n8n-d365-scope.md（D1 thin create-ticket · D3 createRecord + RequestSubmissionProvider · D4 即時 mirror · D6 REQ/RITM 對映）
  - docs/02-architecture/licenseops/DESIGN.md §1(定位守則:thin action 對 SoR 一次受控 write)·§2(scope)·§7(生命週期)·§8(integration layer)
  - docs/01-planning/W24-request-intake/CONTRACT.md §4(REQ/RITM two-level SSOT)
  - apps/api/src/integration/servicenow/servicenow.service.ts（現有讀寫,待加 createRecord）
  - apps/api/src/fulfilment/*（W03 intake / W24 intake mirror pattern 參考）
prior_phase: W24-request-intake
---

# Phase 乙 — Outbound direct(IT 平台開單 → 主動建 ServiceNow ticket）

> **Plan version**:0.1(**draft** — 待 Chris approve)· **Owner**:Chris Lai · **ADR**:ADR-0008(Accepted)
> **緣起**:除 onboarding 外,有**獨立於 onboarding 嘅 M365/D365 license request**,好多時由 IT 同事代手開單。平台提供 IT-facing 功能:喺平台開單 → **主動 create** `sc_request`+`sc_req_item` 入 ServiceNow → 即時建本地 mirror → 接返既有履行流程。方向② OUTBOUND(平台主動寫入 SoR),H2 完整觸發但本 phase 只走 **direct**(直連 Table API),n8n outbound 留 Phase 丙。
> **定位守則(ADR-0008 化解)**:平台只將「錄入 ticket 呢個動作」代為 create;ticket create 完即 100% 屬 ServiceNow SoR。**唔擁有 intake 語意、唔建 end-user 自助 form / service catalog / 審批鏈**。開單畫面 = IT **operator action UI**,唔係 end-user 自助 intake(守得住 D1 界線)。

## 0. 前置 gate
- ADR-0008 Accepted ✅ · Phase 甲(inbound intake)closed ✅(W24,`f862406`)
- **Scope 決定(Chris 2026-07-15)**:① 本 phase = **乙 full**(backend + 前端開單畫面)② SN 建單合約 = **代表性先行 + mock**(真實欄位 / 機制之後同 Chris[ServiceNow owner]對齊先 live,mirror W24 做法)

## 1. Scope

### In(W25 / Phase 乙)
- **`ServiceNowService.createRecord(table, fields)`** — POST `/api/now/table/{table}`(仿現有 private `request<T>` pattern),回 `sys_id`/`number`。ADR-0008 D3。
- **`RequestSubmissionProvider` 抽象 + `DirectServiceNowProvider`** — `submit(payload)` → createRecord `sc_request`(REQ 父)→ 每 line createRecord `sc_req_item`(RITM 子,掛父 REQ)→ 回 `{reqSysId, reqNumber, lineItems:[{ritmSysId, ritmNumber}]}`。抽象保留(ADR 拒「唔抽象」),但本 phase **只一個實作**;`N8nWorkflowProvider` 留 Phase 丙。
- **`POST /requests` endpoint**(IT-facing)— user JWT + `@Roles(ADMIN,REGIONAL,OPCO_IT)` + `@CurrentUser` OpCo scope;DTO(targetUpn/opcoCode/lineItems[skuId+qty]/remark 等)→ provider.submit → **即時建本地 `Request`+`RequestLineItem` mirror**(REQ 掛 Request、RITM 掛 line item,two-level D6)→ return。
- **schema(additive)**:`Request.origin` 標記(`platform-created` vs `onboarding-intake`,區分來源;nullable/default）。migration additive。
- **Tests(H5)**:createRecord · provider submit · endpoint happy(建 SN + mirror)· scope 403 · **SN create 失敗 → fail-closed 唔建 local mirror** · mirror 欄位正確。
- **前端開單畫面**(IT-facing form)— targetUpn / opcoCode / line items(SKU picker + qty)/ remark → `POST /requests` mutation → success / error toast;新 route + nav entry;**token-only、light+dark、一個 primary action**(H6)。
- **前端 tests** + browser verify。

### Out(→ 後續 phase 或明確唔做)
- `N8nWorkflowProvider`(平台 call n8n webhook 建單)→ **Phase 丙**。
- D365 catalog/ledger/對帳 curation 擴展 → **Phase 丁**。
- 真實 ServiceNow `sc_request`/`sc_req_item` 欄位 + 機制(Table API 直插 vs Catalog Request API 觸發 workflow)**live 對接** → 代表性先行,live 隨後(Chris 對齊;ADR §10 open item)。
- **end-user 自助 request form / service catalog / 審批鏈 / SLA** → ADR-0008 D1 **守死界線,永久 out**。

## 2. Approach（待 D1+ 落實,代表性合約）
- **createRecord**:仿 `servicenow.service.ts` 現有 `request<T>('POST', /api/now/table/{table}, body)`;回 `result.sys_id`/`result.number`。table 參數(sc_request / sc_req_item)。
- **Provider ordering(fail-closed,仿 assign.service external-before-DB)**:先 create SN(REQ→RITMs,external side-effect）→ **全部成功先**建 local mirror;SN create 失敗 → throw、**唔建任何 local**。SN create 成功但 local mirror 失敗 = SN orphan ticket → log warn +(D3 決定)標記 / 補償策略。
- **Endpoint**:新 `POST /requests`(唔重用 W03 `/fulfilment/requests`[只 mirror 唔 create SN]、唔撞 甲 `/requests/intake`[m2m]);職責 = 「平台主動開單」。DTO validation(class-validator)。
- **origin marker**:`Request.origin='platform-created'`;甲 intake 補 `'onboarding-intake'`、W03 補預設(細節 D3,additive)。
- **代表性 SN 欄位**:`sc_request`(如 requested_for / short_description / …)+ `sc_req_item`(如 cat_item / quantity / request=父 sysId / …)—— **代表性,真實待對齊**;provider 抽象隔離,live 只改 provider 內 mapping。
- **前端**:新 route(如 `/requests/new`)或 modal;form fields mirror backend DTO;SKU 用 catalog picker;TanStack `useMutation` → toast;handoff token,一個 primary(Ricoh red)提交掣。
- **驗證**:build/lint/test + live curl(**mock SN**;placeholder creds 建唔到真 ticket,curl 驗 endpoint→provider→mirror 用 stub/mock)+ FE browser。

## 3. Deliverables

> **命名注意**:本 phase **D0–D7 = 交付項編號**,與 ADR-0008 **D1–D6(decision 編號)**唔同;引用 ADR 一律寫全稱「ADR-0008 D3」。
- **D0** — kickoff doc(本 plan + checklist + progress)+ ground(讀 servicenow.service / W03+W24 intake mirror / 前端 form+mutation pattern)。
- **D1** — `ServiceNowService.createRecord` + test。
- **D2** — `RequestSubmissionProvider` + `DirectServiceNowProvider` + test。
- **D3** — `POST /requests` endpoint + DTO + 建 mirror service + `Request.origin` schema + additive migration + module 註冊。
- **D4** — H5 tests(§1)。
- **D5** — 前端開單畫面(form + mutation + route + nav;token-only light+dark 一 primary)。
- **D6** — 前端 tests + FE verify。
- **D7** — verify(build/lint/test + curl mock + FE browser)+ closeout(BACKLOG/memory 同步 + progress retro + plan closed + Phase 丙 carry)。

## 4. Phase Gates
- **G1** createRecord:POST Table API 回 sys_id/number(mock 驗)。
- **G2** provider:submit 建 REQ + 每 line RITM,回齊 sysId/number;抽象可插拔。
- **G3** endpoint happy:合法 payload → SN create(mock)+ 建 local mirror(REQ/RITM two-level + origin)+ scope 正確。
- **G4** fail-closed:SN create 失敗 → 唔建 local mirror,回錯;scope 403 唔到 provider。
- **G5** H5 test 全綠。
- **G6** 前端開單:form → mutation → 成功建單 + toast;token-only、light+dark、一 primary;error path graceful。
- **G7** regression:module D 履行 / 甲 intake / dev-bypass 不破。

## 5. Risks / 誠實限制
- **代表性 SN 欄位 ≠ 真實**(同 W24):live 對接前只 mock 驗;真實 required fields + 機制(Table API 直建 REQ+RITM 得唔得,定要 Catalog Request API 觸 workflow)待 Chris/SN admin 對齊。**provider 抽象隔離令 live 只改 mapping**。
- **SN orphan ticket**:create SN 成功但 local mirror 失敗 → SN 有單但平台冇 mirror。緩解:mirror 用 tx、失敗 log warn +(D3 定)標記待 reconcile;非本 phase 完全解。
- **無天然 idempotency**:outbound 每 POST 建新 REQ(唔似 inbound 有 REQ sysId 去重)→ 防雙擊靠前端 submit disable +(可選)client idempotency key。細節 D3。
- **H3 守界線**:開單 form 係 IT operator action,**唔係** end-user 自助 intake;唔建 catalog/審批。落地時嚴守(唔加 approval/SLA/自助欄位)。

## 6. Changelog
- 0.1(2026-07-15)— **draft**;ADR-0008 Phase 乙 kickoff。Scope = 乙 full(backend + 前端開單)· SN 合約代表性先行(Chris 2026-07-15)。待 approve → active。
- 0.2(2026-07-15)— **active**;Chris approve pre-doc + 6 個 baked-in 設計決定(新 POST /requests · provider 抽象一實作 · fail-closed ordering · Request.origin · 前端防雙擊 · H3 operator-action 界線)。落 D1。
- 0.3(2026-07-15)— **closed**;D1-D7 完成。backend(createRecord + provider + POST /requests + Request.origin + migration)+ 前端開單畫面 + GET /opcos enabler(picker)。api 187 test · web 85 test · build/curl/browser 全綠。額外:`.gitattributes`(CRLF hygiene,另 commit `8863fd7`)。carry Phase 丙(n8n-outbound)。
