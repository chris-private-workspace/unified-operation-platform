---
phase: W25-request-outbound-direct
status: closed
---

# W25 Phase 乙 — Progress

## Day 0（2026-07-15）— kickoff（pre-doc,待 approve）
- **緣起**:ADR-0008 Phase 乙(outbound direct)。接 Phase 甲(inbound intake,W24 closed `f862406`)。
- **Scope 決定(Chris 2026-07-15,AskUserQuestion)**:
  - 本 phase = **乙 full**(backend + 前端開單畫面一個 phase,唔拆 A/B)。
  - SN 建單合約 = **代表性先行 + mock**(mirror W24;真實 sc_request/sc_req_item 欄位 + 機制之後同 Chris[ServiceNow owner]對齊先 live)。
- **grounding(kickoff)**:讀 ADR-0008 全文 —— Phase 乙 = D1(thin create-ticket)+ D3(`createRecord` + `RequestSubmissionProvider`/`DirectServiceNowProvider`)+ D4(即時 mirror)+ D6(REQ/RITM two-level,schema 甲已加 RITM 欄)。定位守則:平台代 create,ticket 完即屬 SoR;開單畫面 = IT operator action UI,非 end-user 自助 form。
- **設計岔口(已喺 plan 記)**:新 `POST /requests`(唔重用 W03 `/fulfilment/requests` / 唔撞甲 `/requests/intake`)· provider 抽象保留但本 phase 一個實作(N8n 留丙)· fail-closed ordering(SN create 先,成功先建 local)· `Request.origin` marker(additive)· outbound 無天然 idempotency(前端防雙擊)。
- **產出**:`plan.md`(0.1 draft)+ `checklist.md` + 本 `progress.md`。**status = draft,待 Chris approve → active 先落 D1 code**(R1)。

## 下一步
- **待 approve** → plan status draft→active → 落 **D1**(`ServiceNowService.createRecord` + test)。
- H-constraint 預判:H1/H2 由 ADR-0008 已解鎖(createRecord/provider 係實作 approved 決定,唔觸新架構;n8n 留丙故本 phase 無新 vendor)· H3 守死界線(唔建 end-user form/catalog/審批)· H4 SN creds env · H5 critical path(create+mirror)test · H6 前端 token-only。

---

## Day 1(2026-07-15)— D1-D7 實作 + verify + closeout（同日 approve → 落 code）

**Backend**:
- **D1** `ServiceNowService.createRecord`(POST Table API,回 sys_id/number)+ spec(3 case:POST/default table/fail-closed)。
- **D2** `RequestSubmissionProvider`(抽象 = DI token)+ `DirectServiceNowProvider`(REQ→per-line RITM 掛父,fail-closed 傳播)+ spec(2 case)。
- **D3** `POST /requests`(`OutboundRequestController` @Roles ADMIN/REGIONAL/OPCO_IT + @CurrentUser)+ `OutboundRequestService`(resolve opco/sku → **scope gate 先** → provider.submit → 建 two-level mirror[origin=platform-created,REQ 掛 Request/RITM 掛 line item]· SN-first fail-closed · orphan warn)+ `create-request.dto` + schema `Request.origin`(migration `20260715072533`,additive default)+ module 註冊(`{provide:RequestSubmissionProvider,useClass:DirectServiceNowProvider}`)。
- **D4** H5 test outbound.service.spec:happy(two-level+origin)/ scope 403(唔到 SN)/ 404 / 400 / SN-fail fail-closed。
- **enabler(計劃外,Chris approve)**:`GET /opcos`(`OpcoModule`,ADMIN/REGIONAL/OPCO_IT,active opco {id,code,displayName})+ spec —— 因 `/admin/opcos` ADMIN-only,非-admin 開單者攞唔到 picker list(Explore 揪出)。

**Frontend(D5/D6)**:`pages/new-request.tsx`(form:targetUpn/displayName/**opco[OPCO_IT 鎖自己 useMe]**/requesterEmail/remark + repeatable license lines[SKU picker + qty,單行無 remove])· `lib/new-request.ts` validate 純函數 + test(10 case)· `useOpcos`/`useCreateRequest` hook · `CreateRequestBody` type · route `/requests/new`(**requests/:id 前**)· requests 頁「New request」primary 入口掣 · top-bar title。token-only、一 primary、light+dark。

**D7 verify**:api build ✓ · **jest 187**(+11:servicenow 3/provider 2/outbound 5/opco 1)· eslint 我檔 clean · migrate ✓;web build ✓ · **vitest 85**(+10 new-request)· eslint 我檔 clean;**live curl**(GET /opcos 200[23 opco] · POST /requests empty 400);**browser**(開單畫面 render + 兩 picker 真數[23 opco/12 sku] + validation gating,light 截圖;dark 截圖工具 hiccup,token-only 結構保證)· **H6 ui-design 自檢全 ✅/N/A**。

**Retro**:
- 2 個 Explore(backend pattern + frontend form/mutation/route)→ 落 code 零返工;Explore 提早揪出 **OpCo picker gap**(非-admin 攞唔到 list)+ **requests/:id 路由順序坑**(/new 要放前)。
- **CRLF 環境問題**:`core.autocrlf=true` + prettier default lf → eslint 對所有 Write-created 檔報 CRLF(committed 內容本來 LF)。修 = 加 `.gitattributes`(Chris approve,另 commit `8863fd7`);我嘅檔 prettier --write + eslint clean。
- **工具 hiccup 唔靠佢落結論**(H7):tool result 注入(W24 遇過)+ screenshot renderer timeout;browser 驗證以 read_page/curl 補強。
- **代表性 SN 合約**(mirror W24):provider 抽象隔離 field mapping;真實 sc_request/sc_req_item 欄位 + 機制(Table API 直建 vs Catalog submit)待 Chris live 對齊(ADR §10)。

## ⏸️ Phase 乙 closeout — carry
- **下一步 = Phase 丙**(n8n-outbound):`N8nWorkflowProvider`(平台 call n8n webhook 建單)+ webhook 合約,swap 落 `{provide:RequestSubmissionProvider}` binding。rolling JIT 未 kickoff 唔預建 folder。
- **carry**:代表性 SN 建單合約 live 對齊(Chris/SN admin)· orphan-ticket 補償(create SN 成功但 mirror fail,暫 log warn)· outbound idempotency(暫靠前端防雙擊)。
