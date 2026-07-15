---
phase: W26-request-n8n-outbound
name: "Phase 丙(n8n outbound)— 平台開單改走 n8n webhook(N8nWorkflowProvider)+ webhook 合約 + provider 選路"
sprint_week: W26
backlog_id: REQ-N8N-OUTBOUND (ADR-0008 Phase 丙)
start_date: 2026-07-15
end_date: 2026-07-15
status: closed           # draft → active → closed(D0-D5 完成,api build/test 197/lint/live-boot 全綠 2026-07-15)
adr: ADR-0008 (Accepted)
spec_refs:
  - docs/adr/0008-request-creation-n8n-d365-scope.md（D2 outbound 可 call n8n · D3 N8nWorkflowProvider + 選路[config / primary-fallback]）
  - docs/02-architecture/licenseops/DESIGN.md §1(定位守則)·§4.1(n8n 分工)·§4.4(OpenAPI = n8n 受控接入點)·§8(integration layer)
  - apps/api/src/fulfilment/request-submission.provider.ts（抽象 = DI token,乙已就位）
  - apps/api/src/fulfilment/direct-servicenow.provider.ts（乙參考實作:submit → SubmittedRequest）
  - apps/api/src/fulfilment/outbound-request.service.ts（provider consumer,不改)
  - apps/api/src/fulfilment/fulfilment.module.ts（{provide:RequestSubmissionProvider} binding — swap 點）
  - docs/01-planning/W24-request-intake/CONTRACT.md（合約文檔 mirror 對象)
prior_phase: W25-request-outbound-direct
---

# Phase 丙 — n8n outbound(平台主動 call n8n webhook 建單)

> **Plan version**:0.1(**draft** — 待 Chris approve + §2 岔口拍板)· **Owner**:Chris Lai · **ADR**:ADR-0008(Accepted)
> **緣起**:ADR-0008 D2 方向② outbound 有兩條路 —— 乙已做 **direct**(平台直連 Table API);丙做 **n8n**(平台主動 POST n8n webhook,由 n8n 既有 workflow 建 `sc_request`+`sc_req_item`)。抽象 `RequestSubmissionProvider` 乙已就位,丙 = 插第二個實作 `N8nWorkflowProvider` + swap DI binding。**n8n team = Chris 本人**(workflow 已生產運行),故合約可能可直接畀真值(見 §2 Fork 1)。
> **定位守則不變**:平台只代 create,ticket 完即屬 SoR;唔擁有 intake 語意 / 唔建 form / catalog / 審批(同乙,D1 界線)。
> **前端不改**:`/requests/new` 開單畫面(乙)透過 `POST /requests` 呼叫,provider swap 喺 backend binding 背後透明 —— **丙係 backend-only phase**。

## 0. 前置 gate
- ADR-0008 Accepted ✅ · Phase 甲 closed ✅(W24)· Phase 乙 closed ✅(W25,`c37b7c2`)
- 抽象就位 ✅:`RequestSubmissionProvider.submit(payload) → SubmittedRequest`(REQ + per-line RITM sysId/number),乙已定義並由 `OutboundRequestService` 消費(fail-closed ordering:SN write 先→建 mirror)。
- **H2 已由 ADR-0008 D2 解鎖**:n8n 由 `(future)` 轉 active integration vendor(**唔使新 ADR**)。丙落地**唔加新 runtime dep**(用 global `fetch`,同 ServiceNow client;若成立則 H2 不再觸發)。

## 2. 待拍板岔口(❗approve 前決定 — 影響 approach,不影響 §3 deliverable 骨架)

> 因 Chris = n8n owner,以下岔口你答完先定得死 approach。我的 recommendation 附後。

- **Fork 1 — webhook 合約 fidelity**:
  - (a) **代表性先行 + mock**(mirror 甲/乙:representative payload + response,真 URL/欄位/auth live 對齊)。
  - (b) **你直接畀真合約**(你話 n8n 既有 create-ticket workflow 已運行 → 真 webhook URL 形態 / request payload / response shape / auth)。
  - *Rec*:若真 outbound create-ticket workflow 已存在 → (b) 最好(慳一次 live 返工);未存在或未定 → (a)。
- **Fork 2 — response mode(架構關鍵,決定抽象 fit 唔 fit)**:
  - (a) **同步回**:webhook response 即帶 REQ/RITM `sys_id`+`number` → **完美 fit 現有 `SubmittedRequest`**,`OutboundRequestService` 收到即建 mirror(同乙,零流程改動)。
  - (b) **異步 callback**:n8n 收 request 後 fire-and-forget,建完 tickets 反過來 call **Phase 甲 inbound intake**(`POST /requests/intake`)帶 sysId → **唔 fit 同步 `submit()` return**,要另設 pending/correlation 流程(scope 大增)。
  - *Rec*:**(a) 同步**。抽象特意設計成同步 drop-in;n8n「Respond to Webhook」node 可回建好嘅 IDs。若你要 (b),丙 scope 會大過乙,建議獨立 re-scope(可能重用甲 intake path 而非行 provider)。
- **Fork 3 — provider 選路機制**(ADR D3:「config / per-request-type;一 primary 一 fallback」):
  - (a) **config 單選**:env(如 `REQUEST_SUBMISSION_PROVIDER=direct|n8n`)揀一個 active,`useFactory` 綁 —— 最 thin,對「swap 落既有 binding」framing。
  - (b) **primary + fallback**:n8n 掛 → direct 補(反之亦然)。
  - (c) **per-request-type routing**。
  - *Rec*:**(a) config 單選**(丙 thin)。(b) 有 double-submit 風險 + 要 orchestration;(c) premature。fallback 可留後續 enhancement。

## 1. Scope

### In(W26 / Phase 丙)— 以 Fork 答案定案(以下按 Rec:1(a/b)、2(a)、3(a))
- **`N8nWorkflowProvider implements RequestSubmissionProvider`** — `submit(payload)` → POST n8n webhook(JSON payload)→ 解析 response 取 REQ + per-line RITM `sys_id`/`number` → 回 `SubmittedRequest`。fail-closed:webhook 非 2xx / response 缺 IDs → throw(consumer 唔建 mirror,同乙)。
- **`N8nOutboundClient`(或 provider 內建)** — POST `N8N_OUTBOUND_WEBHOOK_URL`,auth header(`N8N_OUTBOUND_WEBHOOK_KEY`,mirror 甲 intake key,方向相反);global `fetch`,無新 dep。creds 全 env(`ConfigService.getOrThrow`)。
- **Provider 選路**:`fulfilment.module.ts` 由 `{ useClass: DirectServiceNowProvider }` 改 `useFactory`(讀 `REQUEST_SUBMISSION_PROVIDER` env,default `direct` → 不改現有行為)。
- **`CONTRACT-OUTBOUND.md`**(mirror 甲 `CONTRACT.md`)— webhook 方向 / auth / request payload(targetUpn/opcoCode/lineItems…)/ **expected response shape**(REQ+RITM sysId/number)/ 代表性 vs 真(Fork 1)。
- **`.env` / `.env.example`** — 加 `N8N_OUTBOUND_WEBHOOK_URL` / `N8N_OUTBOUND_WEBHOOK_KEY` / `REQUEST_SUBMISSION_PROVIDER`(placeholder;真值 IT/Chris,唔 commit)。
- **Tests(H5,critical path = 對外 create + mirror)**:provider submit happy(webhook 200 + response → SubmittedRequest 組裝)· webhook 非 2xx → throw fail-closed · response 缺 REQ/RITM ID → throw · payload 正確(mock fetch 驗 body)· 選路 factory(env=direct/n8n 綁對 class)。

### Out(→ 後續 phase 或明確唔做)
- **異步 callback 流程**(Fork 2b)→ 若揀,獨立 re-scope,非本 phase。
- **primary/fallback 或 per-type 選路**(Fork 3b/c)→ 後續 enhancement。
- **n8n 端 workflow 本身**(建 sc_request/sc_req_item 嘅 low-code)→ n8n owner(Chris)側,非 repo scope;丙只做平台側 call + 合約。
- **D365 catalog/ledger 擴展** → Phase 丁。
- **end-user 自助 form / catalog / 審批** → ADR-0008 D1 守死界線,永久 out。
- 前端改動 → 無(provider swap 透明)。

## 3. Deliverables
> **命名**:本 phase D0–D5 = 交付項編號,與 ADR-0008 D1–D6(decision 編號)唔同;引用 ADR 寫全稱「ADR-0008 D3」。
- **D0** — kickoff(本 plan + checklist + progress)+ ground(抽象 / DirectServiceNowProvider / module binding / servicenow client fetch pattern / 甲 CONTRACT)+ **Fork 拍板(AskUserQuestion)**。
- **D1** — `CONTRACT-OUTBOUND.md`(webhook 方向/auth/payload/response,代表性 or 真依 Fork 1)。
- **D2** — `N8nWorkflowProvider`(submit → POST webhook → parse → SubmittedRequest;fail-closed)+ config(env)+ unit test。
- **D3** — 選路 `useFactory` binding(default direct,不破現有)+ factory test + `.env.example` 更新。
- **D4** — H5 tests 全套(§1)+ regression(乙 direct path / 甲 intake / dev-bypass 不破)。
- **D5** — verify(build/lint/test + live curl mock webhook + 選路對照)+ closeout(BACKLOG/memory 同步 + progress retro + plan closed + Phase 丁 carry)。

## 4. Phase Gates
- **G1** provider:webhook 200 + 合法 response → `submit()` 回齊 REQ+per-line RITM sysId/number(mock 驗)。
- **G2** fail-closed:webhook 非 2xx / response 缺 ID → throw;`OutboundRequestService` 唔建 local mirror(重用乙 consumer,零改)。
- **G3** 選路:env=`direct` → DirectServiceNowProvider(現行,回歸不破);env=`n8n` → N8nWorkflowProvider。
- **G4** H5 test 全綠 + payload/auth header 正確(mock fetch body 驗)。
- **G5** regression:乙 `POST /requests` direct path / 甲 intake / module D 履行 / dev-bypass 不破。

## 5. Risks / 誠實限制
- **代表性 webhook 合約 ≠ 真實**(除非 Fork 1=b):真 URL / payload 欄位 / response shape / auth 待 Chris(n8n owner)確認;provider 抽象隔離,live 只改 provider 內 mapping + env。
- **response mode 假設**(Fork 2):以同步回為前提;若 n8n 實際只能 fire-and-forget,submit() 攞唔到即時 IDs → 要轉異步流程(已列 Out,需 re-scope)。
- **選路 default 安全**:factory default `direct` → 唔改現有生產行為;要行 n8n 需明確 set env。
- **無天然 idempotency**(同乙):outbound 每 call 建新單 → 防雙擊靠前端 submit disable(乙已有);n8n 端去重(如有)屬 workflow 側。
- **H3 守界線**:丙只換 create 通道,唔加 intake 語意 / form / 審批。

## 6. Changelog
- 0.1(2026-07-15)— **draft**;ADR-0008 Phase 丙 kickoff。scope 骨架 + 3 個待拍板 Fork(合約 fidelity / response mode / 選路機制)。待 Chris approve + Fork 拍板 → active 落 D1。
- 0.2(2026-07-15)— **active**;Chris 拍板 3 Fork(AskUserQuestion):**F1 = 代表性先行 + mock**(mirror 甲/乙,真合約 live 對齊)· **F2 = 同步回**(webhook response 帶 REQ/RITM IDs → fit 現有 `SubmittedRequest` 抽象,consumer 零改)· **F3 = config 單選**(`REQUEST_SUBMISSION_PROVIDER` env + `useFactory`,default `direct` 不破現有)。§1 In-scope 按此定案。落 D1。
- 0.3(2026-07-15)— **closed**;D1-D5 完成。`CONTRACT-OUTBOUND.md`(代表性)+ `N8nWorkflowProvider`(POST webhook → 同步 response → `SubmittedRequest`,fail-closed 5 規則)+ `requestSubmissionProviderFactory`(env 選路,default direct)+ `.env.example`(3 env)。**零 schema/dep/migration/前端改動**;consumer(`OutboundRequestService`/`/requests/new`)零改。api **187→197** test(provider 6 / factory 4)· build/lint 清 · live boot smoke(n8n fail-fast crash stack trace 證 DI wiring / default direct 200 + POST /requests 400)。carry Phase 丁(D365-scope)。
