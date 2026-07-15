---
phase: W26-request-n8n-outbound
status: active
---

# W26 Phase 丙 — Progress

## Day 0（2026-07-15）— kickoff（pre-doc,待 approve + Fork 拍板）
- **緣起**:ADR-0008 Phase 丙(n8n outbound)。接 Phase 乙(outbound direct,W25 closed `c37b7c2`)。方向② outbound 第二條路 = 平台主動 POST n8n webhook 建單,由 n8n 既有 workflow 建 `sc_request`+`sc_req_item`。
- **ground(kickoff)**:
  - 抽象 `RequestSubmissionProvider.submit(payload) → SubmittedRequest`(REQ + per-line RITM sysId/number)乙已就位,`OutboundRequestService` 消費(scope gate 先 → provider.submit → 建 two-level mirror,SN-first fail-closed)。**丙插第二實作即可,consumer 零改**。
  - `DirectServiceNowProvider`(乙)= submit 參考:createRecord REQ → 每 line RITM 掛父 → 組 SubmittedRequest。
  - `fulfilment.module.ts` binding `{ provide: RequestSubmissionProvider, useClass: DirectServiceNowProvider }` = swap 點(ADR D3 已註明 N8n 喺此換)。
  - servicenow client `request<T>` = fetch pattern 參考(auth header + 非 ok → throw);n8n webhook call 同套 global fetch,無新 dep。
  - 甲 `CONTRACT.md` = 合約文檔 mirror 對象(方向相反:平台→n8n)。
- **待拍板 3 Fork(plan §2)**:① 合約 fidelity(代表性 mock vs 你畀真合約)② response mode(同步回[fit 抽象] vs 異步 callback[scope 大增])③ 選路(config 單選 vs primary/fallback vs per-type)。Rec = 1 視乎真 workflow 有無 · 2 同步 · 3 config 單選。
- **產出**:`plan.md`(0.1 draft)+ `checklist.md` + 本 `progress.md`。
- **Fork 拍板(Chris 2026-07-15,AskUserQuestion)**:**F1 代表性先行 + mock**(mirror 甲/乙)· **F2 同步回**(webhook response 帶 REQ/RITM IDs → fit 現有抽象,consumer 零改)· **F3 config 單選**(`REQUEST_SUBMISSION_PROVIDER` env + `useFactory`,default direct)。plan 0.1→0.2 active。落 D1。

---

## Day 1（2026-07-15）— D1-D5 實作 + verify + closeout（同日 approve → 落 code）

**Backend(全 `apps/api/src/fulfilment/`,零 schema/dep/migration)**:
- **D1** `CONTRACT-OUTBOUND.md`(代表性):方向(平台→n8n,對照甲相反)· auth `X-N8n-Key`(mirror 甲 反向)· request payload(由乙 `SubmitRequestPayload` 映)· **同步 response shape**(REQ + per-line RITM sysId/number)· fail-closed 5 規則 · §6 live 對齊清單。
- **D2** `n8n-workflow.provider.ts` `N8nWorkflowProvider`(POST webhook → parse → `SubmittedRequest`;quantity 由 payload 權威;line 靠 index+skuId 核對防亂序)+ config env `getOrThrow`(只 n8n mode 構造 → 只 n8n 需 env)+ fail-closed(非 2xx / 缺 REQ sysId / line count 唔對 / 缺 RITM sysId / skuId 亂序 → throw)。
- **D3** `fulfilment.module.ts`:binding `useClass`→`useFactory`,抽 **exported `requestSubmissionProviderFactory(config, snow)`**(env `REQUEST_SUBMISSION_PROVIDER==='n8n'`→N8n / else→Direct,default 不破)+ `inject:[ConfigService, ServiceNowService]` + `.env.example` 加三 env。
- **D4** H5 test:`n8n-workflow.provider.spec`(6:happy+payload/header/url / 502 fail-closed / 缺 REQ sysId / line count / 缺 RITM sysId / skuId 亂序)+ `request-submission.factory.spec`(4:unset→Direct / direct→Direct / n8n→N8n / n8n 缺 env fail-fast)。

**D5 verify**:
- api build ✓ · **jest 187→197**(+10:provider 6 / factory 4)· eslint 我檔 clean(`--fix` 修一個 import 換行)· 零 schema 故無 migrate。
- **live boot smoke**(dist,另 port 3101 唔掂 3100 用戶 instance):**smoke B** `REQUEST_SUBMISSION_PROVIDER=n8n` 無 webhook env → boot **crash EXIT 1**,stack trace 實證鏈路 `requestSubmissionProviderFactory`→`new N8nWorkflowProvider`→`getOrThrow('N8N_OUTBOUND_WEBHOOK_URL')`(即 factory 真係被 Nest DI call + 揀 n8n + fail-fast);**smoke A** default(env unset)→ boot 200 + `POST /requests` empty 400(direct path 回歸不破);清理 3101,確認 3100 未掂。

**Retro**:
- **抽象紅利兌現**:乙 `RequestSubmissionProvider`/`OutboundRequestService`/前端 `/requests/new` **零改**,丙 淨插第二 provider + 一個 factory binding —— ADR-0008 D3 抽象決定回本。丙 = 迄今最細 phase(2 新檔 + 1 module edit)。
- **Fork 前置拍板慳返工**:3 Fork(代表性/同步/config 單選)開 code 前一次問清 → approach 零猶豫;F2 同步回令抽象直接 fit(異步 callback 會炸大 scope,已列 Out）。
- **live boot smoke > 純 unit**:jest rootDir=src 冇 e2e boot,factory 的 **DI wiring** 單元測試證唔到;throwaway boot(fail-fast crash 自終止,無需殺進程)以真 stack trace 補證,H7 唔靠腦補。
- **§4.4 紀律**:只改 committed `.env.example`,唔 touch 本地 secret `.env`;default=direct 令本地零改仍跑。
- **代表性 webhook 合約**(mirror 甲/乙,Fork 1):真 URL/payload/response/auth 待 Chris(n8n owner)live 對齊(CONTRACT-OUTBOUND §6);provider 抽象隔離,live 只改 mapping+env。

## ⏸️ Phase 丙 closeout — carry
- **下一步 = Phase 丁**(D365-scope):按 ADR-0008 D5 移 M365-only filter + 擴 catalog/ledger/對帳/drift 的 curation set 含 D365 SKU(擴 ADR-0004 curation-as-scope,機制不變)。rolling JIT 未 kickoff 唔預建 folder。
- **carry**:代表性 outbound webhook 合約 live 對齊(Chris/n8n owner,CONTRACT-OUTBOUND §6)· orphan-ticket 補償(甲/乙 carry)· outbound idempotency(前端防雙擊 carry)· RISK R3 on-prem sync retry(甲 carry)。
