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

- [x] F5-1 🟢 **OQ-7 答咗(Chris 2026-08-15):Azure OpenAI(公司 tenant)** ⇒ 寫成 **ADR-0037**(同日 `Accepted`,`E4` 除外 —— 見 F5-1b)。🔴 **佢對 F5 code shape 嘅影響 = 零** —— 四個選項入面只有「送之前先 scrub」會改 F5,而嗰個被否決 ⇒ **F5 照原設計寫得**。⚠️ 但佢改咗**兩樣**:①`agentModel` 語意變成 **deployment 名**(ADR-0037 E3)②**OQ-1 個問題本身變咗** —— 由「揀邊個 model」變成「infra 開邊個 deployment」
- [x] F5-1b 🟢 **ADR-0037 `Accepted`(Chris 2026-08-15)** —— 五個後果(E3 語意 / E4 auth / **E5 轉去 Azure 唔會令 tracing 變安全** / E6 原文照出 / E7 只答咗 OpenAI 嗰半)逐條過目之後先批。🟡 **`E4` = approved as DEFERRED**,target = infra 確認 Azure OpenAI resource 之後同 **OQ-1** 一齊答(兩者取決於同一件事,分開問會問兩次)。⇒ 🔴 **`Accepted` 唔等於每一條都答咗**
- [x] F5-2 `AiAssistService.startRun()` —— 開 run → agent 經 `get_request` 讀原文 → `propose_line_items` 停 → 寫 `AgentProposal` + `runState`。⚠️ **R3 deviation**:plan 寫「讀 `rawRequestText`」,實作**唔係由 service 讀畀 agent**,而係 agent 自己經 tool 讀 —— service 只 select 佢嚟驗「空唔空」。咁做 scope 檢查只有一條路(tool 側 `assertOpcoScope`),而 service 唔使揸住段 PII
- [x] F5-3 🔴 **A8 收咗,而且係兩層** —— `toTranscript()` 純函數(7 個 item 形狀逐個驗)**+** 一條 service 層 test 驗「PII 入唔到 `AgentMessage`」。🔴 **第二條係 falsification 迫出嚟嘅**,見 progress Day 4
- [x] F5-4 🔴 **A7 收咗** —— 餵一個講「I have created the line items and assigned the licences」嘅 mock,`AgentStep` 只有 `['start']`,而句嘢落咗 `AgentMessage`。**`AgentStep` 得兩個來源**:平台自己嘅生命週期事件 · seam 新增嘅 `onToolExecuted`(adapter 喺**真** `execute` 前後報告)
- [x] F5-5 🔴 **A6 收咗** —— assert 落 **DB 寫入**唔係只 assert 返回值(falsification 證實:改咗 DB 那句而返回值不變,紅嘅正正係佢)
- [x] F5-6 🔴 **A5 收咗,兩半** —— runtime(五個 domain write mock 一個都冇被 call)+ **static source scan**(`ai-assist.service.ts` 唔准出現任何 domain model 寫入或 raw SQL,跟 `tool-registry.spec.ts` 先例)
- [x] F5-7 🚧 **R3 deviation ×4 記低**:①seam 新增 `AgentSetup.onToolExecuted`(plan 冇講 tool 級 `AgentStep` 點嚟)②`TranscriptRole` 多一個 `unknown`(plan §4 得五個 —— 但 SDK protocol 自己有 `unknown` item type,而 drop 咗 = 蝕 transcript、當成 `assistant` = 講咗個 model 冇講過嘅嘢)③service 唔讀原文畀 agent(見 F5-2)④`kindOf()` 撞到唔認得嘅 write tool **throw 兼把 run 標 `failed`**,唔會 default 一個 `kind`

## F6 — Proposal 審批 endpoint

- [x] F6-0 🔴 **新開 `AgentApprovalModule`(H1,Chris 2026-08-15 拍板)** —— 審批要同時掂 domain(建 line item)同 agent(`resume`),而 D0 禁止 `agent` import domain service ⇒ **住唔到落 agent module**。否決:放 `agent`(=軟化 D0,而 D0 係 ADR-0017 第五次應用)· 放 `fulfilment`(方向合法,但令「licence 履行」要識得 agent run 幾時 resume,而佢已經係最大嗰個 module)。⇒ **一個薄 module import 兩邊,`agent` 條 arrow 一個字唔郁,而佢自己零 gate** —— 所有檢查仍然喺 `RequestService.addLineItem` 入面
- [x] F6-1 `POST /agent/proposals/:id/approve` / `/reject` —— `@Roles(ADMIN, REGIONAL)`(OQ-2,跟 ADR-0011 D4 先例)
- [x] F6-2 🔴 **次序係契約唔係排版**:pre-resolve 全部 SKU → 逐條行 `addLineItem` → 標 `executed` → **然後**先 resume。標記**一定要喺 resume 之前**,因為 `propose_line_items.execute` 搵唔到 `executed` proposal 就 throw(D2 第二層)⇒ 掉轉次序會令個 tool 拒絕啱啱做完嗰件事
- [x] F6-3 🔴 **A10 兩半收咗** —— approve → `addLineItem` 收到解析好嘅 `skuCatalogId` + **批准人做 actor** + run resume 到 `completed`;reject → **零 domain call** + `rejectedReason` 落 row **兼且送返個 model**(佢讀唔到就會原封再提一次)
- [x] F6-4 OQ-3 —— **F5 已做**(`assertNoOpenRun`,service 層 guard;三個非終態值逐字 assert,而個 test 刻意 hardcode 唔 import 常數)
- [x] F6-5 🔴 **兩個人,兩種權**:**批准人**做 domain write 嘅 actor(佢負責);**開 run 嗰個人**供 agent 嘅**讀** scope(`resumeRun` 由 `startedBy` 攞)。撈埋一齊就會令一個批准**靜靜擴闊咗 agent 中途睇到嘅嘢**
- [x] F6-6 🔴 **`requestId` 一律由 run row 攞,payload 對唔上就拒絕** —— payload 係 model 寫嘅;唔對就代表「人讀嗰張 proposal」同「將會被寫入嗰張單」唔係同一張
- [x] F6-7 ⚠️ **明文唔聲稱 atomic**:`addLineItem` 唔收 transaction client ⇒ N 條就係 N 個工作單位。pre-resolve 解決咗**現實會撞**嗰個(隔夜之間 SKU 變 inactive);DB 級中途失敗仍然會留低半截,嗰陣 proposal 標 `failed` 唔標 `executed`,而且**唔 resume**

## F7 — Audit

- [x] F7-1 `agent.run_started`(`AiAssistService`)/ `agent.proposal_decided`(`AgentApprovalService`)。🔴 **approve 同 reject 共用一條 action,靠 `metadata.reason` 分** —— 理由同 `ASSIGN_BUDGET_OVERRIDE` 一樣:**R13(批准退化成 rubber-stamp)要一條 query 睇得晒**,拆做兩條 action 就變成兩條 query 加一次相減,而咁樣就冇人會去跑
- [x] F7-2 🟡 **`actorType` union 加咗 `'agent'`(D7),但今日冇任何地方 emit** —— Tier 1 之下每個被審計嘅事件背後都真係有個人(人開 run、人批 proposal),寫 `'agent'` 會**更唔準確**。🔴 **順帶查證到一個 D7 冇講嘅約束**:`AuditLog.actorId` 係 **FK → `AppUser`**(`schema.prisma:440-441`)⇒ 一行 agent-actored 嘅 row **講唔出係邊個 agent**(只可以 `actorId: null`,同 `system`/`m2m` 一樣)。一個 principal 之下捱得住,**兩個就係一個窿** ⇒ 寫咗喺 `AuditEntryInput.actorType` 個 docblock,因為下手要用嗰陣就係望住嗰行
- [x] F7-3 🔴 **A11 兩層** —— ①`audit-fields.spec.ts` 餵一個**肥** row(含 transcript 同 model payload)入 `pickAuditFields('AgentRun'|'AgentProposal')`,assert 回 `undefined`;**刻意唔用 `expect(WHITELIST.AgentRun).toEqual([])`** —— 嗰種寫法只會同份檔自己講嘅嘢一致 ②兩個 service spec 各自 assert call site **連 `before`/`after` 都冇送**。缺一就係「另一半靠假設」
- [x] F7-4 🔴 **兩個 audit 位置刻意唔同,而個分別係規則唔係漂移** —— `run_started` **喺 transaction 入面**(前面冇任何不可逆嘅嘢,一齊 rollback 零成本,ADR-0009 D8.1);`proposal_decided` **喺 transaction 外面兼喺決定之後**(嗰陣 line item 已經真係建咗,一個 audit 打思噎唔可以反轉一件做咗嘅事 —— `outbound-retry.service.ts:398-401` 同一句)
- [x] F7-5 🔴 **`metadata: { source: 'ai-assist' }`** —— 記低係**邊個 agent 能力**,而佢正正就係上面 F7-2 嗰個 FK 約束令 `actorId` 載唔到嘅嘢
- [x] F7-6 🔴 **Falsification ×2 真紅零誤傷**:①`AgentRun` whitelist 由 `[]` 改成 `['status','runState']` ②把 `audit.log` 搬出 transaction 外 —— **第二個證明咗條 test 唔係 `toHaveBeenCalled()` 嗰種**(搬咗出去一樣會被 call)

## F8 — 前端(H6)

- [ ] F8-1 `AI Assist` 卡由 `EmptyState` 換真嘢
- [ ] F8-2 Run 觀察畫面(step timeline + transcript + 中止掣)
- [ ] F8-3 Proposal 審核 UI —— 🔴 **要講清楚「批准咗仍然可能被 gate 擋」**(D3 嗰個反直覺後果)
- [ ] F8-4 一個 view 一個 primary action(H6)

## F9 — Boundary spec(H5)

- [x] F9-1 🔴 `agent.boundary.spec.ts` —— 五個禁 import(`fulfilment` / `license` / `opco` / `graph` / seam ②),每個帶**點解禁**唔淨係「禁」。**正半**:registry 仍然有 `PrismaService` + `assertOpcoScope` + `scrubPii`,module 仍然 import `IntegrationModule` ⇒ 條 test 唔會因為 agent module 被掏空而變綠
- [x] F9-2 🔴 **`AgentStep` 得一個 writer,而且係全 `src/` 掃出嚟嘅** —— A7 證嘅係「呢個講大話嘅 model 冇寫到 step」,呢條證嘅係「codebase 入面**冇第二個地方寫得到**」,而後者下個月有人加新 tool 嗰陣仍然成立。`AgentMessage` 同理;`AgentProposal` 剛好兩個 writer(service 建 pending · orchestrator 記人嘅決定),**兩個都唔係 tool**
- [x] F9-3 🔴 **明文寫低「唯一合法跨界」** —— `agent-approval` 同時 import 兩邊,而且**只准經 `requests.addLineItem`,唔准自己打 `prisma.requestLineItem`**(否則一句就繞過 origin 檢查 + COMPLETED 檢查 + status recompute)。⚠️ 有咗一個合法跨界之後,**非法嗰個會變得易 argue**,所以呢條要寫喺同一個檔
- [x] F9-4 ⚠️ **條 spec 第一次跑,五個禁令全部各中一個 offender —— 而 offender 就係佢自己**(五個 needle 以字串字面值住喺佢入面)。**source-scanning test 住喺自己嘅搜尋範圍入面**,已排除 `.spec.ts` 並喺檔內寫低
- [x] F9-5 🔴 **Falsification ×2 真紅零誤傷**:①喺 `tool-registry.ts` 加一個 `../fulfilment/` import ②喺 `agent-approval.service.ts` 加一句 `agentStep.create`

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
| ~~OQ-7~~ | ~~inference 側 PII 冇決定過~~ | 🟢 **Chris 2026-08-15 揀 Azure OpenAI** ⇒ **ADR-0037 同日 `Accepted`** | ✅（🟡 `E4` 除外,見下） |
| F1-5b | **DEV 側 migration 未跑** | 卡「要唔要部署」 | 期一收尾 |
| ~~ADR-0037~~ | ~~`Proposed`~~ | 🟢 **2026-08-15 `Accepted`**(五個後果逐條過目之後) | ✅ |
| **ADR-0037 `E4`** | 🟡 auth 揀 Entra token 定 API key —— **approved as DEFERRED** | 取決於 infra 點開個 resource,而 **OQ-1 取決於同一件事** ⇒ 一齊答,唔好分開問兩次 | **infra 回覆之後 / A14 之前** |
| OQ-1 | model / **deployment** 選型未答 | Chris 2026-08-15 **批准押後到 F11**;ADR-0037 E3 令問題由「揀邊個 model」變成「**infra 開邊個 deployment、叫咩名**」⇒ 佢而家係一個 **infra request**,唔係一個揀 | **F11 之前** |
| 🆕 infra | 未出 request:開 Azure OpenAI resource + deployment(要回報名)+ 答 E4 兩條路邊條做得到 | W46 **第一個外部依賴**,而本項目 infra 依賴 B1/B4/B7/B8/B9 五次每次都要等 | **A14 嘅時間表由佢決定** |
| R11–R19 | 未入 `RISK_REGISTER.md`(🆕 R17–R19 由 ADR-0037 新增) | living doc,ADR / plan 已記 | 期一收尾 |
| — | 🆕 **既有 gap(唔喺 W46 範圍)**:`audit-fields.ts` 個 `ConnectorConfig` whitelist 漏咗 `licenseOpsProvider` / `ticketUpdateProvider` / `acsSenderAddress` 等 ⇒ 改 seam provider 唔會出現喺 audit `before`/`after` | W39 / W40 / CH-011 三批欄都中 | 開一張 CH |
