# W46 — AI Agent Runtime · Checklist

> **Status**: `active`(2026-08-15)—— ADR-0036 Accepted,plan approved,**F1 + F2 + F3 + F4 已落地**。
>
> 🚧 **本 phase 嘅文件同 code 都住喺 branch,未 merge 落 `main`**(Chris 2026-08-15)。實作 branch = `feat/w46-agent-runtime`,由 **`docs/w46-agent-runtime`** 開,**唔係由 `main`**。

## F0 — 開工 gate

- [x] F0-1 🔴 **ADR-0036 由 Proposed → Accepted**(H1 + H2;Chris 2026-08-15 拍板)
- [x] F0-2 `plan.md` status `draft` → `approved`,§7 六條 OQ 一併批
- [x] F0-3 `docs/adr/README.md` index 加 ADR-0036 一行
- [x] F0-4 `BACKLOG.md` 由 C 區(blocked)搬去 A 區(可立即開工)
- [x] F0-5 建 branch `feat/w46-agent-runtime`(base = `docs/w46-agent-runtime`)
- [x] F0-6 W45 / CH-029 / CH-030 已收官 —— rolling JIT 唔可以兩個 phase 同時 active

## F1 — 五個 Prisma model + migration(H1)

- [x] F1-1 `AgentPrincipal` / `AgentRun` / `AgentStep` / `AgentMessage` / `AgentProposal` 落 `schema.prisma`
- [x] F1-2 `AuditLog.actorType` 註明第四個值 `'agent'`(String 欄,**零 DDL**)
- [x] F1-3 Migration `20260815030000_w46_agent_runtime` —— 🔴 **SQL 由 `prisma migrate diff --from-empty` 離線生成再逐字抄**,唔係手寫。本機 `uop-postgres` 冇跑(5433 畀 `ai-doc-extraction-db` 佔住,停佢要 Chris 批)
- [x] F1-4 `prisma generate` 過(client 認得五個 model)
- [x] F1-5 🟢 **A1 本機側收咗**(2026-08-15,Chris 批准停 `ai-doc-extraction-db`)—— 三個 migration 對真 `uop-postgres` 由 `migrate deploy` 真跑。🔴 **證據唔係 migrate 個 summary**(佢係 summary-level 綠燈,§9 講過嗰種證明唔到下面每件事),係 catalog query 嘅真回傳:五張 `Agent*` 表齊 · `AgentRun.startedById` `NOT NULL` · **三條 FK**(`principalId` / `requestId` / `startedById`)· `ConnectorConfig` 有 `agentModel` + `agentRuntime` · `_prisma_migrations` 三條 `finished = t`。**跑之前 `migrate status` = 22/24 applied 零 drift**
- [ ] F1-5b 🚧 **A1 DEV 側未做** —— 卡「要唔要部署」。⚠️ DEV 個 entrypoint 令 migrate 失敗 **NON-FATAL** ⇒ 部署之後**唔可以睇 revision status 當證據**,要照上面咁 query catalog
- [x] F1-6 🟢 **`AgentRun.startedById` 加咗**(Chris 2026-08-15 拍板「兩個一齊做」)—— **required + FK → `AppUser`,`ON DELETE RESTRICT`**。🔴 **點解唔係 nullable**:nullable 令「攞唔返 scope」變成一個到得到嘅狀態,而**冇 scope 讀落就係全部 scope** —— 正正係 ADR-0036 D0 要 keep out of the agent path 嗰個 fail-open 形狀。`RESTRICT` 令 dangling 結構上唔存在
- [x] F1-7 🟢 **`AgentRun.requestId` FK 補咗**(同一個 migration)—— `ON DELETE SET NULL`,同 `OutboundFailure.requestId` **逐字同一形狀**。呢個唔一致由「寫低咗」升級成「解決咗」
- [x] F1-8 Migration `20260815143648_w46_agent_run_actor` —— 三句 SQL(`ADD COLUMN startedById TEXT NOT NULL` + 兩條 `ADD CONSTRAINT`)。⚠️ Prisma 出咗個 `not possible if the table is not empty` warning:**成立但無害** —— 張表喺同一條 deploy 鏈上面前兩個 migration 先至建出嚟,零 row;DEV 側同理

## F2 — `AgentToolRegistry`(H1;allow-list 喺呢度)

- [x] F2-1 `agent-tool.ts` —— tool 契約(`AgentToolSchema` / `AgentToolContext` / `AgentTool`)。🔴 `parameters` 係 raw JSON Schema,**唔用 Zod / DTO**:呢個值原封交畀兩個 SDK,中間加一層就係第二份 schema 嘅來源
- [x] F2-2 四個 read tool(`list_pending_requests` / `get_request` / `search_catalog` / `get_ledger`),全部 `needsApproval: false`
- [x] F2-3 `propose_line_items`,`needsApproval: **true**`(寫死,唔用 function — D3)
- [x] F2-4 🔴 **OpCo scope 行返 `assertOpcoScope` / `scopeWhere`** —— scope 來自**開 run 嗰個人**,所以 agent 讀唔到嗰個人讀唔到嘅嘢。「一個 agent 應該睇到幾多」呢條冇人答得到嘅問題,結構上唔使問
- [x] F2-5 🔴 **A9:`propose_line_items` 只收 GUID** —— 兩層(格式 regex + 對 active catalogue 驗存在),缺一不可:格式擋唔到幻覺 GUID,存在性擋唔到「`SPE_E5` 究竟指邊個」
- [x] F2-6 🔴 **零副作用** —— registry **一個 DB 寫入都冇**,連 `AgentProposal` 都唔寫(D3/D4:proposal 由平台寫,唔係由 tool 寫,否則就係 agent 自己記錄自己嘅證據)
- [x] F2-7 `agent.module.ts` + 入 `app.module.ts` —— **零 domain module import**(D0 嘅可執行版本)
- [x] F2-8 `tool-registry.spec.ts` —— **33 條**,含 A3 allow-list 逐字鎖死、A9 兩層、scope 正反、A5 靜態半
- [x] F2-9 🔴 **falsification ×4 全部真紅零誤傷** —— ①`needsApproval` 翻 false ②拆走 GUID 格式檢查 ③拆走 `scrubPii` ④「冇人批准」由 throw 改成靜靜返成功。每次**只有對應嗰一條紅**(1 failed / 32 passed)
- [x] F2-10 api **1077 / 75 suites** 全綠(基線 1044 / 74,**零跌**)· tsc 0 · lint 0

## F3 — `AgentRuntimeProvider` + `OpenAiAgentsProvider`(H1 + H2)

- [x] F3-1 🔴 **OQ-1 由 code gate 變成 config gate —— 但佢仍然未答,而且仍然 block F5** —— F3 **冇** hardcode 任何 model:`agentModel` 由 `ConnectorConfig`(DB-then-env)解析,未配就 **503**。⇒ 寫 code 唔再需要嗰個答案,但**真跑一個 run 需要**。🔴 **我冇代 Chris 揀**
- [x] F3-2 `AgentRuntimeProvider` 抽象 —— abstract class 做 DI token(跟 `LicenseOperationsProvider` 先例)+ normalised vocabulary(`AgentTurn` / `PendingApproval` / `ApprovalDecision`)
- [x] F3-3 `OpenAiAgentsProvider` —— `toSdkTools()` 把 registry 一份 JSON Schema 直接餵 `tool({parameters, strict, needsApproval})`;`start()` / `resume()` 用 `run()` + `RunState`
- [x] F3-4 🔴 **H2:`npm i @openai/agents`** —— 裝咗 **0.16.0**(+11 個 transitive,含 `openai@7` 同 peer `zod@4`)。ADR-0036 已批 ⇒ 唔係新決定,但 commit 有標
- [x] F3-5 `agentRuntimeProviderFactory`(exported,可測)+ `ConnectorConfig.agentRuntime` + `connectors.ts` 加 `agent`
- [x] F3-6 🔴 **`claude-tool-runner`(G4 未做)fall back 而唔 throw** —— 一個 config typo 唔應該令成個平台起唔到身;而 fall back 之所以可接受,**係因為 `recordChoice` 記低 EFFECTIVE runtime** ⇒ Integrations panel 講得出「配置咗 X、跑緊 Y」(BUG-011)
- [x] F3-7 🔴 **`resume()` 要求每個 interruption 都有決定** —— 有一個未決定就拒絕續跑(D2:唔可以由 runtime 行為決定佢執唔執行)
- [x] F3-8 🔴 **`RunState` 讀唔返 → 503,唔會重開一個新 run**(R16)—— 人批准嘅係**嗰一個** tool call,新 run 會自己推導一批新嘅然後喺一個從來冇畀過嘅批准下面執行

## F4 — 🔴 Tracing 三重關(H4 / ADR-0036 D11)

- [x] F4-1 `OPENAI_AGENTS_DISABLE_TRACING=1` 落 `.env.example` + 註明點解(兼有一條 test 讀返份 `.env.example` 確認佢喺度)
- [x] F4-2 Code 側明文 disable —— `enforceTracingDisabled()`,provider constructor call
- [x] F4-3 🔴 **A4:test 鎖死,而且係三段式** —— 🔴🔴 **查證揭到 SDK 有兩個唔同開關,而揀錯一個就係一條空轉嘅 test**:`config.tracing.disabled` 係一個**只讀 env 嘅 getter**,而且 **`NODE_ENV === 'test'` 時永遠 `true`** ⇒ 對住佢寫 assert 喺 Jest 之下**永遠綠,連 disable 嗰行刪咗都綠**。真開關喺 `TraceProvider`(`setTracingDisabled` 寫佢,`createTrace()` 讀佢,關咗就返 `NoopTrace`)。⇒ 條 test **先開返 tracing → 證明真係開到 → 起 provider → 驗佢關咗**,三段缺一不可。**falsification 實測真紅**(1 failed / 54 passed)

## F5 — `AI-Assist` run

- [x] F5-1 🟢 **OQ-7 答咗(Chris 2026-08-15):Azure OpenAI(公司 tenant)** ⇒ 寫成 **ADR-0037**(`Proposed`,待拍板)。🔴 **佢對 F5 code shape 嘅影響 = 零** —— 四個選項入面只有「送之前先 scrub」會改 F5,而嗰個被否決 ⇒ **F5 照原設計寫得**。⚠️ 但佢改咗**兩樣**:①`agentModel` 語意變成 **deployment 名**(ADR-0037 E3)②**OQ-1 個問題本身變咗** —— 由「揀邊個 model」變成「infra 開邊個 deployment」
- [ ] F5-1b 🚧 **ADR-0037 仲係 `Proposed`** —— Chris 答咗 provider,但**未見過**三個查證後先浮出嚟嘅後果(E3 語意 / E4 auth 兩條路 / **E5 轉去 Azure 唔會令 tracing 變安全**)。⚠️ **唔 block F5**(見上),block 嘅係真接 Azure 嗰步
- [x] F5-2 `AiAssistService.startRun()` —— 開 run → agent 經 `get_request` 讀原文 → `propose_line_items` 停 → 寫 `AgentProposal` + `runState`。⚠️ **R3 deviation**:plan 寫「讀 `rawRequestText`」,實作**唔係由 service 讀畀 agent**,而係 agent 自己經 tool 讀 —— service 只 select 佢嚟驗「空唔空」。咁做 scope 檢查只有一條路(tool 側 `assertOpcoScope`),而 service 唔使揸住段 PII
- [x] F5-3 🔴 **A8 收咗,而且係兩層** —— `toTranscript()` 純函數(7 個 item 形狀逐個驗)**+** 一條 service 層 test 驗「PII 入唔到 `AgentMessage`」。🔴 **第二條係 falsification 迫出嚟嘅**,見 progress Day 4
- [x] F5-4 🔴 **A7 收咗** —— 餵一個講「I have created the line items and assigned the licences」嘅 mock,`AgentStep` 只有 `['start']`,而句嘢落咗 `AgentMessage`。**`AgentStep` 得兩個來源**:平台自己嘅生命週期事件 · seam 新增嘅 `onToolExecuted`(adapter 喺**真** `execute` 前後報告)
- [x] F5-5 🔴 **A6 收咗** —— assert 落 **DB 寫入**唔係只 assert 返回值(falsification 證實:改咗 DB 那句而返回值不變,紅嘅正正係佢)
- [x] F5-6 🔴 **A5 收咗,兩半** —— runtime(五個 domain write mock 一個都冇被 call)+ **static source scan**(`ai-assist.service.ts` 唔准出現任何 domain model 寫入或 raw SQL,跟 `tool-registry.spec.ts` 先例)
- [x] F5-7 🚧 **R3 deviation ×4 記低**:①seam 新增 `AgentSetup.onToolExecuted`(plan 冇講 tool 級 `AgentStep` 點嚟)②`TranscriptRole` 多一個 `unknown`(plan §4 得五個 —— 但 SDK protocol 自己有 `unknown` item type,而 drop 咗 = 蝕 transcript、當成 `assistant` = 講咗個 model 冇講過嘅嘢)③service 唔讀原文畀 agent(見 F5-2)④`kindOf()` 撞到唔認得嘅 write tool **throw 兼把 run 標 `failed`**,唔會 default 一個 `kind`

## F6 — Proposal 審批 endpoint

- [ ] F6-1 `POST /agent/proposals/:id/approve` / `/reject` —— `@Roles(ADMIN, REGIONAL)`(OQ-2)
- [ ] F6-2 批准 → **平台**行返既有 line item 建立路徑 → 標 proposal `executed` → **然後**先 resume run
- [ ] F6-3 🔴 **A10**:approve → 真建 line item 兼 run resume 到 `completed`;reject → 零改動 + `rejectedReason` 有值
- [ ] F6-4 OQ-3:一張 request 同時只准一個非終態 run —— **service 層 guard + test**(唔可以靠 DB unique:「非終態」係一個狀態集合)

## F7 — Audit

- [ ] F7-1 `agent.run_started` / `agent.proposal_decided` 兩條 action(event-only)
- [ ] F7-2 `actorType: 'agent'`
- [ ] F7-3 🔴 **A11:`before`/`after` 係空**(H4;transcript 結構上入唔到 `AuditLog` — D5)

## F8 — 前端(H6)

- [ ] F8-1 `AI Assist` 卡由 `EmptyState` 換真嘢
- [ ] F8-2 Run 觀察畫面(step timeline + transcript + 中止掣)
- [ ] F8-3 Proposal 審核 UI —— 🔴 **要講清楚「批准咗仍然可能被 gate 擋」**(D3 嗰個反直覺後果)
- [ ] F8-4 一個 view 一個 primary action(H6)

## F9 — Boundary spec(H5)

- [ ] F9-1 🔴 `agent` module 唔 import 任何 domain service —— **正反兩面 assert**(跟 `license-ops.boundary.spec.ts:42-53` 形狀)
- [ ] F9-2 🔴 `AgentStep` 一定由平台寫

## F10 / F11 — Test + render

- [ ] F10-1 LLM 一律 mock(跟 §3.4 Graph / SN 先例)
- [ ] F10-2 Falsification:每道閘拆走實作睇佢紅唔紅
- [ ] F11-1 🔴 **A13:H6 light + dark 真 render**,跑 `ui-design` skill
- [ ] F11-2 🔴 **A14:live 驗** —— 真開一個 run,睇到 step timeline + transcript + proposal + 批准後 resume

---

## 期二(G1–G7)—— 未開工

- [ ] G1 `propose_assign` + 批准後行返 **8 道閘一道唔少**(A/B1)
- [ ] G2 `derivePermissions()` 認得 `AgentPrincipal` + W28 drift test
- [ ] G3 Blast-radius limit + kill switch(要分「配置停咗」同「真係停咗」)
- [ ] G4 `ClaudeToolRunnerProvider` —— 證明 D1 一份定義兩邊行得通(B3)
- [ ] G5 BullMQ 落地 —— 🔴 **開工前要答 OQ-5(`awaiting_approval` 過期)**
- [ ] G6 SSE transport —— 還 `ADR-0029 A2` 嗰筆基建債
- [ ] G7 R13 監測:proposal 批准率 / 平均審核秒數

---

## 🚧 已知延後(唔可以靜靜消失)

| # | 項 | 理由 | Target |
|---|---|---|---|
| ~~F1-5~~ | ~~三個 migration 未對真 DB 跑~~ | 🟢 **2026-08-15 本機收咗**(Chris 批准停 `ai-doc-extraction-db`) | ✅ |
| ~~F1-6 / F1-7~~ | ~~`startedById` / `requestId` FK~~ | 🟢 **Chris 2026-08-15 拍板兩個一齊做**,已落 migration | ✅ |
| ~~OQ-7~~ | ~~inference 側 PII 冇決定過~~ | 🟢 **Chris 2026-08-15 揀 Azure OpenAI** ⇒ ADR-0037 | ✅（ADR 待批） |
| F1-5b | **DEV 側 migration 未跑** | 卡「要唔要部署」 | 期一收尾 |
| ADR-0037 | `Proposed`,三個後果 Chris 未見過 | 佢答嘅係 provider,唔係嗰三樣 | **接 Azure 之前** |
| OQ-1 | model / **deployment** 選型未答 | Chris 2026-08-15 **批准押後到 F11 live 驗**;ADR-0037 E3 令問題變成「infra 開邊個 deployment」 | **F11 之前** |
| R11–R19 | 未入 `RISK_REGISTER.md`(🆕 R17–R19 由 ADR-0037 新增) | living doc,ADR / plan 已記 | 期一收尾 |
| — | 🆕 **既有 gap(唔喺 W46 範圍)**:`audit-fields.ts` 個 `ConnectorConfig` whitelist 漏咗 `licenseOpsProvider` / `ticketUpdateProvider` / `acsSenderAddress` 等 ⇒ 改 seam provider 唔會出現喺 audit `before`/`after` | W39 / W40 / CH-011 三批欄都中 | 開一張 CH |
