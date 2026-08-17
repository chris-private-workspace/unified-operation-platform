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

- [x] F8-0 🔴 **先補後端一層 —— `AgentRunController`**(F5/F6 只做咗 service,`AgentModule` 一個 controller 都冇 ⇒ 前端根本冇嘢可以打)。`POST /agent/runs` · `GET /agent/runs?requestId=` · `GET /agent/runs/:id` · `POST /agent/runs/:id/abort`。**`@Roles(ADMIN, REGIONAL)`,同審批一樣** —— plan / ADR 都冇指定邊個可以**開** run,呢個係保守讀法兼寫低咗理由:一個 run 要錢兼製造工作畀批准人;而 tool 本身喺任何闊度都安全(佢哋行**開 run 嗰個人**嘅 OpCo scope)⇒ **日後放寬係一行,收窄係 regression**
- [x] F8-0b 🔴🔴 **一個順手改嘅寫法差啲開咗個窿**:`getRun` 原本用 `include`,而咁樣會連 **`runState`** 一齊回傳 —— 佢係 SDK 嘅原始 state,**入面有未 scrub 過嘅對話歷史**(D6 只 scrub `AgentMessage` 嗰條路)⇒ **等於由 API 把平台小心遮住嗰份 transcript 嘅原本交返出去**,而且冇 error 冇 log 冇嘢會紅。改用明文 `select`,理由寫喺 code 同 DTO 兩邊
- [x] F8-1 `AI Assist` 卡由 `EmptyState`「Coming soon」換成 `AiAssistCard`(新 component,唔喺 `request-detail.tsx` 入面長)
- [x] F8-2 Run 觀察畫面:**steps(What ran)· transcript(摺埋)· Stop 掣**(只喺非終態出)
- [x] F8-3 🔴 **「批准咗仍然可能被 gate 擋」寫咗喺 approve 掣隔籬** —— `Approving runs the platform's normal checks — they can still refuse.`,兼有 test 釘住
- [x] F8-4 ✅ **冇加任何 `variant="primary"`** —— 卡用 secondary/ghost;reject 對話框用 `danger`(destructive,唔係 primary)
- [x] F8-5 🔴 **D4 喺畫面上企得住**:steps **排喺前**(佢係證據)、transcript **預設摺埋**兼開咗之後有一句「唔係任何嘢發生過嘅證據」。test 直接用 INC-001 嗰句 —— 餵一個講「I have created the line items already」嘅 message,assert **佢預設唔喺畫面上**
- [x] F8-6 Role gating:`canUseAgent`(ADMIN+REGIONAL)。🔴 **test 明文寫住「hidden card 唔係一個權限」** —— server guard 先係真嗰個,呢度只係唔遞一個一定 403 嘅掣
- [x] F8-7 ⚠️ **5 個既有 `request-detail.*.test.tsx` 加咗一個 stub mock** —— 用**渲染 marker** 唔用 `() => null`,咁 CH-030 F4 嗰條 DOM 次序 test 同新嘅 role gating test 都仲驗得到。⚠️ CH-030 F4 條 test 原本靠 `getByText('AI Assist')`,而嗰個 anchor 隨住 placeholder 消失 ⇒ **改 anchor 唔改 claim**
- [x] F8-8 🔴 **Falsification ×2 真紅零誤傷**:①transcript 預設改成打開 ②拆走 F8-3 嗰句
- [x] F8-9 web **377 → 392 passed**(+15)· 6 條紅 = **完全就係已知 pre-existing 嗰 6 條,零新增** · web tsc 0 · web lint 0
- [x] F8-10 ✅ **DS-4(light + dark 真 render)2026-08-16 收咗** —— 見 F11-1

## F9 — Boundary spec(H5)

- [x] F9-1 🔴 `agent.boundary.spec.ts` —— 五個禁 import(`fulfilment` / `license` / `opco` / `graph` / seam ②),每個帶**點解禁**唔淨係「禁」。**正半**:registry 仍然有 `PrismaService` + `assertOpcoScope` + `scrubPii`,module 仍然 import `IntegrationModule` ⇒ 條 test 唔會因為 agent module 被掏空而變綠
- [x] F9-2 🔴 **`AgentStep` 得一個 writer,而且係全 `src/` 掃出嚟嘅** —— A7 證嘅係「呢個講大話嘅 model 冇寫到 step」,呢條證嘅係「codebase 入面**冇第二個地方寫得到**」,而後者下個月有人加新 tool 嗰陣仍然成立。`AgentMessage` 同理;`AgentProposal` 剛好兩個 writer(service 建 pending · orchestrator 記人嘅決定),**兩個都唔係 tool**
- [x] F9-3 🔴 **明文寫低「唯一合法跨界」** —— `agent-approval` 同時 import 兩邊,而且**只准經 `requests.addLineItem`,唔准自己打 `prisma.requestLineItem`**(否則一句就繞過 origin 檢查 + COMPLETED 檢查 + status recompute)。⚠️ 有咗一個合法跨界之後,**非法嗰個會變得易 argue**,所以呢條要寫喺同一個檔
- [x] F9-4 ⚠️ **條 spec 第一次跑,五個禁令全部各中一個 offender —— 而 offender 就係佢自己**(五個 needle 以字串字面值住喺佢入面)。**source-scanning test 住喺自己嘅搜尋範圍入面**,已排除 `.spec.ts` 並喺檔內寫低
- [x] F9-5 🔴 **Falsification ×2 真紅零誤傷**:①喺 `tool-registry.ts` 加一個 `../fulfilment/` import ②喺 `agent-approval.service.ts` 加一句 `agentStep.create`

## F10 / F11 — Test + render

- [x] F10-1 ✅ **LLM 一律 mock** —— `AgentRuntimeProvider` 喺 `ai-assist.service.spec.ts` 由明文 mock 頂替(`start`/`resume` 兩個 `jest.fn()`),`openai-agents.provider.spec.ts` 只驗 shape 轉換唔 call model。**證據唔係讀 code 讀返嚟,係全套 81 suites 喺 `AGENT_MODEL` 未設兼零 API key 之下全綠** —— 有任何一條真係要個 live model,`resolveModel()` 就會 503 令佢紅
- [x] F10-2 ✅ **Falsification sweep 收咗(2026-08-16)** —— **四道未驗過嘅閘逐個拆走實作**,結果 **2 綠 2 紅**,而**兩個綠就係兩個洞**
- [x] F10-2a 🔴🔴 **洞 ①:`getRun` 個 `runState` 排除,零測試覆蓋。** 把 `runState: true` 加返落 `select` ⇒ **142 條全綠**。⚠️ **而佢結構上唔可能靠 assert 回傳值捉到** —— Prisma 係 mock,回傳咩由 test 自己講,所以**只有「服務傳咗咩 argument 畀 Prisma」先載得住呢個事實**。⇒ 新增 4 條 test 釘住 query shape。**兩次 falsification 證咗兩條 assert 唔係重複**:`runState: true` ⇒ 紅嘅係 `never selects runState`;`select` → `include` ⇒ 紅嘅係 `uses select rather than include`(**另一對**)。兩次都係 **2 紅 140 綠,零誤傷**
- [x] F10-2b 🔴🔴 **洞 ②:SKU 存在性檢查嘅兩條 test 一直靠錯嘅理由綠。** 拆走 `Unknown or inactive skuId` 個 throw ⇒ **142 全綠**,而**條 test 明明就喺度**(`refuses a GUID that is not in the catalogue`)。原因:再落兩道閘,`propose_line_items` 因為冇 approved proposal 而再拒絕一次,**而佢掟嘅係同一個 `BadRequestException`** —— 而 `agentProposal.findFirst` 係一個裸 `jest.fn()` 返 `undefined` ⇒ **每個 case 都行到嗰度先掟**。⇒ 兩條改成 assert **訊息**(hardcode,唔由被測 code 推導)**+** `agentProposal.findFirst` 冇被 call 過(即證佢喺**上一道**閘就停咗)。**單靠訊息唔夠** —— 兩道閘掉轉次序佢一樣綠。修完再 falsify:**2 紅 140 綠**
- [x] F10-2c ✅ **兩道閘證實有守**:`kindOf()` 拆走 throw 改成一律返 `'line_items'` ⇒ **1 紅**(`refuses a pause on a write tool it cannot classify`)· step detail 拆走 `scrubPii` ⇒ **2 紅**(A7 嗰條 + run-row 嗰條)。兩次零誤傷
- [x] F10-2d 📌 **方法論 —— 本項目第四次撞同一族,而今次係最貴嗰個版本**:`CLAUDE.md §9` 早就記低「**一條 assert 睇落嚴唔嚴謹,同佢捉唔捉到嘢,係兩件事;唯一分辨方法係拆走實作睇佢紅唔紅**」。洞 ② 就係佢 —— test 名啱、位置啱、assert 睇落合理,**而佢由頭到尾釘住嘅係另一道閘**。⚠️ **`toBeInstanceOf(SomeException)` 喺一條有多道閘、而每道都掟同一個 exception type 嘅路徑上,基本上等於冇 assert 過。** 分辨方法只有兩個:assert 訊息,或者 assert「下一道閘冇被行到」
- [x] F10-2e ✅ **兩個 controller spec 補咗(2026-08-16)** —— `agent-run.controller.spec.ts`(8 條)+ `agent-approval.controller.spec.ts`(4 條)。api **1188 → 1199 / 81 → 83**。釘住三類只有 controller 層見得到嘅嘢:**①`@Roles` 喺 class 上 = `[ADMIN, REGIONAL]`**(W28 snapshot 話你知矩陣**變咗**,呢條話你知佢**應該係咩**)**②參數點拆**(`dto.requestId` 唔係成個 dto · `approve(id, user)` 個 user 唔係 optional context —— 佢就係 `approvedById` 同 audit actor · `reject` 攞 `dto.reason` 唔係 `dto`)**③argument 次序**(`getRun(user, id)` 掉轉一樣 type-check,兩個都係 string)
- [x] F10-2f 🔴🔴 **而我第一版嗰條 query-key test 自己就係假嘅,俾 falsification 當場捉到** —— v1 寫 `controller.latest('req-1', user)` 然後 assert service 收到 `'req-1'`,**註釋仲寫住佢守住個 query key**。把 `@Query('requestId')` 改做 `@Query('request_id')` ⇒ **152 條全綠**。原因:**直接 call method 完全繞過 Nest 嘅參數綁定**,個 decorator 嘅 key 由頭到尾冇參與過 ⇒ **條 test 結構上睇唔到佢聲稱守住嗰件事**。改成讀 `__routeArguments__` route metadata ⇒ 同一個 falsification **1 紅 152 綠**。📌 **同一日第二次同一族**(F10-2b 係第一次),而**兩次都係「註釋寫住佢守住乜」同「佢實際釘住乜」唔同一件事**
- [x] F10-2g ✅ **兩個 controller falsification 各一,真紅零誤傷**:`@Query('requestId')` → `request_id` ⇒ **1 紅** · `reject(id, dto.reason, user)` → `reject(id, dto, user)` ⇒ **1 紅**
- [x] F10-2h 🔴 **順帶查證到一個容易讀反嘅事實,已寫落 spec**:`AgentRunDto` 個 header 寫住「`runState` 喺呢度每個 shape 都缺席,而**呢個係規矩唔係遺漏**」—— 講法啱,但 **DTO 喺呢個 app 係文件唔係過濾器**:全 `src/` **零個 `ClassSerializerInterceptor`**(實測 grep),`@ApiOkResponse` 只影響 OpenAPI 頁。⇒ **controller 原封交返 service 嗰個 object** ⇒ **唯一嗰道閘就係 service 個 `select`**(F10-2a 釘住嗰個)。條 test 用 identity(`toBe`)釘住呢個 pass-through,**就係為咗唔畀人把 DTO 個註釋讀成第二道防線 —— 得一道**
- [x] F10-2i ⚠️ **sweep 範圍要講清楚**:本次只掃**未做過 falsification 嗰批**。之前做咗嘅係 `F2-9`(×4)· `F4-3`(tracing 三段式)· `F5-3`(transcript scrub,兩層)· `F5-5`(DB 寫入)· `F7-6`(×2)· `F8-8`(×2)· `F9-5`(×2)。**W46 falsification 累計 ×18,全部真紅零誤傷。** 🚧 **仲有兩道刻意冇掃**:`agent-run.controller.ts` / `agent-approval.controller.ts` **兩個都冇 spec 檔** —— 而 BUG-011 個教訓正正就係「controller 冇 spec ⇒ 新欄唔流出去而三層 test 全綠」。今次個 `runState` test 落咗喺 service 層(佢係 query shape 嘅正確位置),**但 controller ↔ DTO 嗰條縫仍然冇嘢守**。見下面「已知延後」
- [x] F11-1 ✅ **A13:H6 light + dark 真 render 收咗**(2026-08-16,**Chris 批准停 `ai-doc-extraction-db`**)。**四個狀態 × 兩個 theme = 八張**:①預設(proposal + steps + 摺埋嘅 transcript)②transcript 展開 ③reject 對話框 ④未開 run 嘅 empty state。**幾何完全一樣**(728 / 1108 / 239 / 334 px 兩個 theme 逐個相等)⇒ 零 layout drift;**兩個 theme 零橫向溢出**(`scrollWidth === clientWidth === 1440`);token 真 swap(`--bg` `#f5f5f6`↔`#08080a` · `--card` `#ffffff`↔`#141417` · `--accent` `#E60027`↔`#ff3355` · **`--purple` `#6d28d9`↔`#a982f0`**,最後嗰個就係 DS-8 個 AI tone)
- [x] F11-1a 🔴🔴 **本 session 一開始冇 browser tool ⇒ Chris 2026-08-16 批准 `playwright` 落 `apps/web` devDependency**(H2 §5.2 明文例外:dev dependency)。**點解值得記住**:呢個項目由 CH-002 起,「render 驗唔驗到」一路取決於**當日 session 啱啱有冇 browser tool** —— CH-016 驗到、W43 驗唔到照寫「未 render 驗」。⇒ 加一個 dev dep + `apps/web/scripts/render-check.mjs` 令佢**可重複**,唔再靠彩數。⚠️ `npx playwright install chromium` 真落載到(191.8 MiB + 114.5 MiB),**公司 proxy 冇封 `cdn.playwright.dev`** —— 同 RISK R1(Prisma engine CDN 被封)**唔同結果**,所以唔可以由 R1 推論其他 CDN 都封
- [x] F11-1b ⚠️ **render 順帶揭到一個潛在缺口(唔係今日嘅 bug)**:卡入面 `STEP_LABEL[step.key] ?? step.key`,而平台今日寫得出嘅 key **啱啱好九個全部有 label**(`start`/`abort`/`run`/`proposal` + registry 五個 tool 名)⇒ **今日係啱嘅**。但 `AgentStep.key` 係 `string`,**冇任何嘢釘住呢個對應** —— 邊日有人喺 `tool-registry.ts` 加個 tool 而冇掂 `ai-assist-card.tsx`,操作員畫面就會出一個 raw snake_case key。🔴 **而隔籬 `MESSAGE_LABEL` 係 `Record<AgentMessage['role'], string>` ⇒ TypeScript 幫佢守住**:兩個 map 喺 code 入面**睇落一模一樣**,一個有型別保護一個冇。**未修,未開單** —— 見下面「已知延後」
- [ ] F11-2 🔴 **A14:live 驗** —— 真開一個 run,睇到 step timeline + transcript + proposal + 批准後 resume

---

## 期二(G1–G7)—— 未開工

- [x] G1 ✅ **`propose_assign` + 批准後行返 8 道閘一道唔少(2026-08-16)** —— api **1199 → 1212 / 83**,tsc 0,lint 0。`propose_assign` 落 registry(`needsApproval: true`,execute 唯讀)· `kindOf` → `'assign'` · `agent-approval` 分流去 **`AssignService.assignLineItem`**(**同 request 畫面撳嗰粒掣係同一個 call**)
- [x] G1-a 🔴 **R12/H1 覆蓋確認咗先開工** —— `tool-registry.ts` 頂寫住「加一行 = 擴權 = 要 ADR(R12)」,而 **`propose_assign` 由 ADR-0036 §3.2 + plan §2.2/§3.2 一開始就明文列咗** ⇒ 佢係 ADR 計劃咗嘅 tool,唔係新塞一行入 allow-list。**boundary spec 一條 ban 都唔使鬆** —— 禁令針對 `src/agent/`,而 crossing 一直住喺 `agent-approval`(F9-3 早就命名咗佢)⇒ **今次係用返嗰個許可,唔係擴闊佢**
- [x] G1-b 🔴 **四個 ADR 冇指定、屬本單嘅決定(R3)**:**①agent 路徑冇 budget override** —— schema 冇呢個欄、call 只有三個 argument。ADR-0016 D3 話佢 ADMIN-only 兼要**寫低理由**,而**畀 model 作嗰句理由、再叫人批准佢冇寫過嘅字,就係最壞嗰種 rubber-stamp**;要 override 就喺 request 畫面自己做 **②gate 拒絕 ⇒ proposal 標 `failed` 唔係 `executed`**(`executed` 正正就係 `propose_assign.execute` 搵嗰個 —— 標錯就等於同個 model 報告一件冇發生過嘅成功)**③拒絕之後仍然 resume,但用 `approved: false` + 真原因** ——「**人拒絕**」同「**平台拒絕**」係兩件唔同嘅事,合埋就係喺 transcript 度講錯發生咗乜 **④只有 ADR-0029 `blocked` body 當拒絕**,其餘(403 / DB error)原封 rethrow
- [x] G1-c 🔴🔴 **同一個改動入面連中三次「自己個註釋觸發自己條 test」** —— boundary spec grep `budgetOverrideReason` / `usageLocation`,而我喺 `agent-approval.service.ts` 同 `tool-registry.ts` 兩處嘅**解釋性註釋**都寫咗嗰兩個字。**CH-029 犯過一模一樣嘅**(「一個解釋規矩嘅註釋觸發咗嗰條規矩」)⇒ 沿用當時做法:**改註釋,唔鬆 test**,兼喺註釋度寫明「呢個名刻意唔喺呢度出現」
- [x] G1-d 🔴🔴 **falsification 揭到 boundary grep 單獨唔夠** —— 把 model 自己嘅 `reasoning` **用位置參數**傳做第四個 argument(即係真正嘅壞版本):**boundary 條 grep 完全睇唔到**(冇出現過個名),紅嘅係 approval spec 嗰條 **arity assert**(`toHaveBeenCalledWith` 三個 argument)。⇒ **一條睇個名、一條睇個 call 嘅形狀,兩條唔係重複** —— 已寫入 boundary spec 註釋
- [x] G1-e ✅ **Falsification ×2 真紅零誤傷**:①blocked 都標 `executed` ⇒ **1 紅** ②位置參數偷渡 override ⇒ **1 紅**。⚠️ **第三個(拆走「只有 `blocked` 先算拒絕」)拆唔落 —— 佢一拆就唔 compile**:TS narrowing 令你冇檢查過就砌唔到嗰句 refusal 訊息。**呢個係比一條紅 test 更強嘅保證,照實記低**
- [x] G1-f ✅ 新 test:registry 4 條(第二層閘 / 只認 `executed` / 403 跨 OpCo / 唔存在嘅 line item)· approval 7 條(actor + 三個 argument · executed + resume true · 拒絕三態 · 非 gate error rethrow · 冇 lineItem 嘅 payload)· boundary 2 條。⚠️ **兩條舊 test 要跟住改,而佢哋紅得啱**:`refuses a pause on a write tool it cannot classify` 本來攞 `propose_assign` 做「分類唔到」嘅例子(而家佢分類到喇)· `does not expose propose_assign yet` —— **佢本來就係為咗有一日要被人特登刪先存在**
- [x] G2 ✅ **`derivePermissions()` 認得 `AgentPrincipal` + W28 drift test(2026-08-16)** —— api **1212 → 1218 / 83** · web **398 → 403**(6 紅 = pre-existing,數目一個字冇變)· 兩邊 tsc 0 / lint 0。`PermissionEntry` 加 `actor: 'user' | 'agent'`,`AccessKind` 加 `agent-read` / `agent-propose`;agent 嗰半由 **`AgentToolRegistry` derive**,同人嗰半由 `@Roles` derive 係同一個道理(讀返 runtime 真正跑嗰個 object,唔係第二份手 keep 嘅表)
- [x] G2-a 🔴 **點解要做:一個對 actor 沉默嘅矩陣,同一個報告「呢個 actor 乜都掂唔到」嘅矩陣,讀落一模一樣** —— ADR-0036 D7 逐字講嘅就係呢件事。`/admin/permissions` 之前答到「邊個 role 撳得邊個 endpoint」,而 agent 嘅 reach **根本唔係 endpoint**(佢 in-process 撳 tool)⇒ 一個 ADMIN 睇完成份矩陣,會合理咁以為 `POST /agent/proposals/:id/approve` 就係 agent 故事嘅全部
- [x] G2-b 🔴 **`agentTools` 參數刻意冇 default value** —— 畀 `= []` 就等於容許一個「望落齊全、實際靜靜少咗成個 actor」嘅矩陣,即係 D7 想擋嗰個失敗模式當成便利重新引入一次。**required ⇒ compiler 喺兩個 call site 都會問**
- [x] G2-c 🔴 **排序刻意令 route 行喺前、agent block 行喺後** —— 結果係本次 snapshot diff **淨係加咗六行,零行移位**(64 → 70,實測 `ADDED` 6 / `REMOVED` 0 / 共有行順序不變)。⚠️ **而呢個對數係補做嘅**:我改咗頂層 `describe` 個名 ⇒ jest **當佢係新 snapshot 直接寫落去**,舊嗰個標 obsolete ⇒ **嗰一刻 drift 保護係被繞過咗嘅**(`jest -u` 唔係唯一繞過方法,**改個 describe 名一樣得**)。要寫一段 script 攞返新舊兩個 key 逐行對,先算真係睇過
- [x] G2-d 🔴 **`guards` 對 propose row 填 `AgentApprovalController`** —— 同 `IntakeKeyGuard` 一樣嘅用法:寫低「係乜嘢令呢行安全」,而佢**指住同一份矩陣入面另一行**(嗰行有佢真正嘅 `@Roles`)⇒「一個人決定緊」由一句 prose 變成一件驗得到嘅事。read tool 填 `[]`,因為嗰個 loop 真係冇人喺度
- [x] G2-e 🔴 **刻意唔喺 row 度聲稱 OpCo scope** —— 每個 tool 都真係行 `assertOpcoScope`,但個 descriptor 冇呢個資料,填就係手寫一個可以 drift 嘅 claim。**一份 audit 文件最壞嘅唔係唔齊,係聲稱一個冇人驗過嘅控制**。改為喺 endpoint description + 畫面文案講(同人嗰半對 OPCO_IT 講嘅係同一句 caveat)
- [x] G2-f 🔴🔴 **falsification 揭到我自己兩條 test 係空轉** —— 拆走個 derive loop 之後,**3 條紅但 2 條照綠**:嗰兩條係 `for (const row of agentRows)`,而**空 list 滿足你對佢成員作出嘅任何 claim**。同 `agent.boundary.spec.ts` 用 `expect(agentFiles.length).toBeGreaterThan(5)` 守住嘅係同一個洞。⇒ 補咗一條獨立 `has agent rows at all` + 兩個 `length > 0` guard ⇒ **同一個 falsification 由 3 紅變 6 紅**
- [x] G2-g ✅ **Falsification ×5 真紅零誤傷**:①拆走 derive loop ⇒ **6 紅** ②agent row 靜靜畀個 `Role.REGIONAL` ⇒ **2 紅**(D7 條 + snapshot)③`AgentApprovalController` 加 `OPCO_IT` ⇒ **2 紅** ④`schema.prisma` 個 `AgentPrincipal` 加 `role Role` ⇒ **1 紅,而其餘全部照綠** —— **正正就係嗰條 test 存在嘅理由**:derive 出嚟嗰啲 row 個 `roles: []` 係 hardcode 嘅,schema 加咗 role 佢哋一個都唔會察覺,矩陣會由「啱」變成「靜靜報少咗」⑤前端拆走 agent 段文案 ⇒ **1 紅**
- [x] G2-h ✅ 前端:`Access matrix`(舊名 `Role & endpoint matrix` 而家會**錯**,因為表入面有行既唔係 role 亦唔係 endpoint)· 兩個新 badge 用返既有 `purple`(DS-8 AI 色)—— **刻意唔用 `warn`**,因為「要人批」正正係令 propose tool **安全**嗰件事,tint 成風險就係對住一行設計正常運作嘅嘢大叫 · endpoint 同 tool **分開數**(夾埋數出嚟嗰個「N endpoints」對邊半邊都唔真)· 冇 tool 嘅部署**成段消失**,唔會出現「plus 0 agent tools」
- [x] G2-i 🔴 **web test 第一版自己係假嘅,而佢自己撞紅先揭穿** —— `getByText('Agent proposal')` 撞「found multiple elements」,因為我新加嗰段解釋文案入面都有呢個字。⇒ **一個 page-wide match 可以淨係靠嗰段「描述緊嗰行」嘅文案綠**,而唔係靠嗰行本身。改成 `rowFor(path)` + `within(row)`。同 F10-2 嗰族一模一樣:**綠嘅理由同條 test 聲稱嘅理由唔同**
- [x] G2-j ✅ **H6 真 render 做咗(2026-08-16)** —— 見下面 `G-UI`
- [x] G3 ✅ **Blast-radius limit + kill switch(2026-08-16)** —— api **1218 → 1243 / 83 → 85**,tsc 0 / lint 0,**falsification ×7 真紅零誤傷**。web 一個字冇改(UI 見 `G3-h`)
- [x] G3-a ✅ **Blast radius = 一個 run 可以自己撳幾多次 tool(`MAX_AUTONOMOUS_TOOL_CALLS = 25`)**,閘企喺 **registry** 唔喺 adapter —— D1 明文寫住「adapter 要決定嘢嘅時候,個決定應該搬返入 registry」,而 G4 個第二個 adapter 就係要靠呢點先唔使重寫一次。**每個 tool 喺出生嗰刻被 wrap**(唔係六個 `execute` 各自 check),所以下個月加嘅 tool 係**因為佢喺邊度宣告**而被 cap,唔係因為作者記得
- [x] G3-b 🔴 **counter 讀 `AgentStep` 唔係記喺 memory** —— run 隔夜批准之後喺**另一個 process** resume,而 registry 揸住 per-run counter 就係一個冇人清嘅 map。⚠️ **誠實講個代價**:step 寫唔入就會令 counter 唔郁 ⇒ **fail-OPEN**;接受係因為「action ledger 寫唔到」本身係大過「agent 講多咗嘢」嘅警號,而 `onToolExecuted` **結構上唔准 fail 一個 tool call**(provider 明文 swallow),所以另一種接法根本冇得揀
- [x] G3-c 🔴 **cap 只計 autonomous tool(`needsApproval: false`),`propose_*` 豁免** —— 佢已經俾**一個人**封住,比一個 counter 強一個量級。連佢都 cap 就會出現「平台做完真嘢、marked `executed`,然後個 counter 拒絕咗負責報告結果嗰個 tool」—— **一個由 limit 自己製造出嚟嘅失敗**。呢條係最似 bug 嘅設計,所以有一條 test 專門講佢
- [x] G3-d 🔴 **R3 deviation:plan B4 寫「超額即停」,實作係「超額即拒」** —— 個 cap 令 run **做唔到嘢**,但唔會由平台終止佢。**刻意冇扮成停**:Tier 1 寫唔到嘢(D3)⇒ 冇 budget 嘅 run 淨係喺度講,而講幾耐由 SDK `MAX_TURNS` 封頂(**第二層,明文標住,唔係 gate**,D2)。加「殺 run」會連埋一個**人可能仲想批**嘅 pending proposal 一齊掟走,而嗰個係人嘅嘢唔係 agent 嘅嘢
- [x] G3-e ✅ **Kill switch = `AgentPrincipal.active`** —— plan §4 一開始就有,`startRun` 一直有 check,**零 migration**。否決咗開第二個 `ConnectorConfig.agentEnabled`:兩個地方閂得到 agent 就係兩個「佢開唔開住」嘅答案(BUG-005 / BUG-011 同族),而 D7 令 principal 本身就係 actor ⇒ 停 actor 語意最準
- [x] G3-f 🔴 **原本得一道 check,而缺嗰兩道入面有一道係最重要嗰道** —— `startRun` 有、`resumeRun` 冇、**`approve` 冇**。第三道就係會**派真 licence** 嗰條(G1)⇒ 一個寫住「off」而 approve 仍然推得到 assignment 落去嘅 switch,**係喺令人安心嗰個意義上 off、喺唯一有所謂嗰個意義上 on**。三道全部補齊
- [x] G3-g 🔴 **攔 approve,唔攔 reject** —— 停 agent 係要佢唔好再**引起**嘢,唔係要人執唔到手尾。攔埋 reject 會令每個 pending proposal 困到有人開返個掣,**反而令人唔敢撳呢個掣**。條 test 明文寫住呢個唔對稱係設計,因為佢睇落似漏咗
- [x] G3-h 🔴 **`settled` 係第二個事實,唔係 `!enabled`** —— 閂咗掣**唔會**清走已經 park 咗嘅 run;佢哋變成 inert,然後**開返掣嗰刻全部翻生**。所以 status 同時報 `enabled` / `liveRuns` / `pendingProposals` / `settled`。呢個就係 `SeamRuntimeRegistry` 個形狀(saved ≠ live)換咗另一對
- [x] G3-i 🔴 **冇 principal row = `enabled: true`** —— 「未用過」唔係「閂咗」。倒轉 default 會令一個全新部署報告話 agent 停咗,而事實係下一個撳掣嘅人就會開一個 run。⚠️ 但 `set()` **建得到 row**,所以未用過都閂得到(一個要用過先閂得到嘅 kill switch,喺最應該用嘅時刻最冇用)
- [x] G3-j 🔴 **R3 deviation:`AuditLog` 加咗第三條 action,而 ADR-0036 D5 寫「只收兩條」** —— **要 Chris 過目**。D5 個主題係 **transcript**(自由文本 + 大量 ⇒ 入咗等於拆咗 whitelist);呢一行係**一個 boolean 加一個 actor**,正正係 whitelist 為咗覆蓋而存在嗰種形狀。唔加嘅代價 = 一個改變平台會唔會行動嘅 admin 控制冇任何記錄。新 target `AgentPrincipal`,whitelist **只得 `['active']`**(闊過佢覆蓋嘅寫入嗰個 whitelist,就係下次擴闊嘅論據)
- [x] G3-k ✅ **W28 drift test 第二次捉到新 agent write surface** —— `AgentKillSwitchController` 一加,`discovers every controller in src` 即刻紅,而**唔係靠 review**。snapshot 睇過先更新:**只加兩行,兩行都 `[ADMIN]`**。⚠️ ADMIN-only 比 run / approval 兩個 surface 窄,係本單決定:嗰兩個決定一張單點算,呢個決定**個能力存唔存在**
- [x] G3-l ✅ **Falsification ×7 真紅零誤傷**:①拆走個 cap ⇒ **2 紅** ②cap 埋 `propose_*` ⇒ **1 紅** ③counter 唔篩 `status: 'ok'` ⇒ **1 紅** ④`approve` 拆走 gate ⇒ **2 紅** ⑤`reject` 加返 gate ⇒ **1 紅** ⑥`settled = !enabled` ⇒ **1 紅** ⑦冇 row 當 disabled ⇒ **1 紅**。實作檔全部還原乾淨
- [x] G3-m ✅ **刻意冇加一條 boundary static test** —— behavioural test 已經 assert 咗「拆走 gate 會點」,而 static test 只 assert「嗰行字喺唔喺度」⇒ **今次真係重複**(G1 嗰次唔重複,係因為位置參數偷渡 grep 睇唔到)。**兩者分別喺有冇一個 grep 睇唔到嘅壞版本**
- [x] G3-n ✅ **UI 做咗(2026-08-16)** —— 見下面 `G-UI`
- [x] G4 ✅ **`ClaudeToolRunnerProvider`(2026-08-16)—— D1 成立** · api **1260 → 1289 / 87 → 88** 全綠零跌 · tsc 0 / lint 0 · **falsification ×7 真紅零誤傷**
- [x] G4-a 🟢🟢 **D1 嘅結論:registry / 六個 tool / `AgentTool` / `AgentToolSchema` 一個字冇改** —— `name`/`description` 逐字過,`parameters` → `inputSchema` **純改名**。按 ADR-0037 `E2` 立嗰條尺(「要改 registry 就係 D1 錯咗,要返轉頭講唔係硬塞」)⇒ **唔使返轉頭**
- [x] G4-b 🔴 **`input_schema` 唔係 `inputSchema`** —— `betaTool` 收 camelCase option、emit API 個 snake_case wire 欄。**D1 唔受損**:schema **object 本身** `toBe`(identity)過去,改嘅只係托住佢嗰個 key,而改 key 名正正就係 adapter 唯一獲准做嘅事
- [x] G4-c 🔴🔴 **`BetaRunnableTool` = `BetaToolUnion & { run }`,個 union 包住 Anthropic 內建 tool**(text editor / bash …),嗰啲**冇 `inputSchema`** ⇒ TS 拒絕直接 cast,而佢啱。🟢 **D2 因此多咗一層意思**:內建 tool 由**同一個 `tools` array** 入嚟,而 `toClaudeTools` 只 map registry ⇒ 「邊界喺 registry」喺 **SDK 自己遞一個 shell 畀你**嗰陣仍然成立
- [x] G4-d 🔴🔴 **只有真 SDK 講得出嘅陷阱** —— `BetaToolRunner.js` **`:23,27` 先 `yield`,`:54` 先執行 tool** ⇒ **`break` 就係 approval gate**(generator 停喺 `yield`,`#generateToolResponse` 到唔到)。**但 `:31-33` 把 assistant turn push 落 `params.messages` 排喺 `yield` 之後** ⇒ **一 `break` 就跳過** ⇒ 唔自己補 push,`tool_use` 唔入 saved conversation,resume 嗰陣 `tool_result` 指住一個唔存在嘅 call = **API 400**。⚠️ **冇任何 type signature 講呢件事**,而任何「幫手」嘅 fake 都會掩蓋佢
- [x] G4-e 🔴 **ADR-0036 `D3` 要更正,但唔係 H1** —— 「用 SDK 原生 pause/resume」喺 Claude 側**唔成立**(冇 pause/resume,冇 `needsApproval` 欄)。D3 嘅**實質決定**(write tool 一律要人批 · 批准真相落平台 DB)**一個字冇變**,而且呢邊**更加成立**(根本冇 SDK 側 approval state 可以誤當真相)。📌 **而咁樣先令 seam ⑤ 真正回本**:ADR-0017 D2 講 seam 核心設計工作就係嗰套 vocabulary,而 `AgentTurn` **載得起兩個唔似樣嘅暫停機制**
- [x] G4-f 🔴 **ADR-0036 `D9` 寫嘅 `client.beta.messages.tool_runner` 實際叫 `toolRunner`**(camelCase)—— 小事,但正正係「靠記憶寫 API 名」嗰種
- [x] G4-g 🟢 **R16 喺呢個 runtime 幾乎唔存在** —— `state` = `JSON.stringify(messages)`,即 Messages API 自己嘅**公開 wire 格式**唔係 SDK 內部結構。仍然驗證唔靠信:非 JSON / 空 array / object / `null` 四種都 503
- [x] G4-h 🔴 **ADR-0038 D3 落地成兩樣嘢,唔係一句話** —— ①`buildClient()` **明文讀 `ANTHROPIC_API_KEY` 再自己 check**(`new Anthropic()` 唔傳 key 會靜靜攞同一個 env var ⇒ 「一個冇人覆核過嘅 env」就會係唯一嗰道嘢,同 D11 tracing 同形狀)②一條 test assert **constructor 完全冇被 call** —— 「佢 throw 咗」對一個建咗 client 先失敗嘅版本一樣成立
- [x] G4-i 🟢 **secret 走 `ConfigService` 唔走 `ConnectorConfig`** —— ADR-0013 Model C(非機密落 DB、真 secret 只落 env);加個 DB 欄仲會係 **H1**。🟢 **零新 env**:`ANTHROPIC_API_KEY` F3 嗰陣已經喺 `.env.example`,今次只更新註釋(標明 R21:填咗佢 = 真打)
- [x] G4-j 🔴 **factory 唔再 fall back,而呢個係刻意** —— 揀 `claude-tool-runner` 就真係行佢;冇 key 就 **503**,**唔會靜靜跌返去 OpenAI**(平台唔可以用「喺第二度行咗」嚟回答「喺 Claude 行」)。認唔到嘅值(打錯字)仍然 fall back。⚠️ **BUG-011 嗰條 `recordChoice` test 要搬去 typo case** —— Claude 已實作之後,喺嗰度 assert 就變成 `'claude-tool-runner'` 同自己比,**邊個字串都綠**
- [x] G4-k ✅ **Falsification ×7 真紅零誤傷**:①拆 push ⇒ **1 紅** ②`needsApproval` 改由 message 讀 ⇒ **10 紅** ③由 SDK 自己搵 key ⇒ **2 紅** ④rebuild schema(`{...parameters}`)⇒ **1 紅** ⑤拆 undecided 閘 ⇒ **1 紅** ⑥rejection 唔標 `is_error` ⇒ **1 紅** ⑦factory 繼續 fall back ⇒ **2 紅**。實作檔還原後 **36/36 綠**,`git diff --stat` 零殘留
- [x] G4-l ⚠️ **falsification script 自己有個洞,捉返咗** —— jest 成功時把 summary 寫去 **stderr**,而 script 成功路只讀 stdout ⇒ **baseline 同 restored 兩行都係 `NO TEST LINE`**,即「還原乾淨」根本冇驗到。補跑一次真 jest + `git diff --stat` 先收
- [x] G4-pre-1 ✅ **`ADR-0038` `Accepted`(Chris 2026-08-16,四條後果過目之後)** —— **D3** 唔打網絡要有 test 守住(唔可以靠註釋)· **D4** 要對真 SDK 型別 assert,唔可以自己砌 shape · **D5** OQ-7 Claude 半邊 target 收窄 · **D6** 三件未查證。🟢 **同 ADR-0037 唔同,本 ADR 冇任何一條 deferred** —— 嗰邊個 `E4` 係知情留低,而 `D6` 本身就係一個決定(「G4 第一步係查,唔係寫」)⇒ **R1 gate 過,G4 開得工**
- [ ] G4-pre-2 **`npm i @anthropic-ai/sdk -w @uop/api`**(D1:落 `apps/api` 唔落 root,跟 `@openai/agents` 位置),然後 🔴 **第一件事係查 D6 三樣,唔係寫 adapter** —— ①`betaTool()` 收嘅參數形狀 vs `AgentToolRegistry` 今日出嘅嘢(**D1 成唔成立就睇呢個**;要改 registry 先接到 = D1 錯咗,要返轉頭講,唔係硬塞 —— ADR-0037 E2 立咗呢條尺)②transitive 撞唔撞 `@openai/agents`(尤其 **`zod`** / HTTP client,tool schema 就係靠 `zod`)③license
- [ ] G4-pre-3 🔴 **`OQ-7` Claude 半邊唔再 block G4**(ADR-0038 D5)—— 但**真打 Anthropic 之前仍然要重新答**,唔可以引用 ADR-0037(E7 個禁令一個字冇郁)。**新 R21**:「裝咗個 SDK」被讀成「可以打 Anthropic」,而 D3 嗰條 test 係唯一防線
- [x] G5 ✅ **兩半都做齊(`G5-A` expiry 2026-08-16 · `G5-B` BullMQ 2026-08-16)**
- [x] G5-A ✅ **Run expiry(OQ-5)2026-08-16 落地** —— api **1289 → 1308 / 88 → 89** · web **414 → 415**(6 紅 = pre-existing 一個字冇變)· 兩邊 tsc 0 / lint 0 · **falsification ×9 真紅零誤傷**(內含一個反方向)
- [x] G5-A-a 🔴 **`expired` 唔係 `aborted` 嘅一種,而理由係 G7 唔係「講得準啲」** —— `aborted` 已經專指「有人撳咗 Stop」(`abortRun`),而 G7 個人口 `decidedAt != null` 就係建喺呢個分野上。溝埋 = 把「冇人審」併入「平台停咗佢」,**而前者正正係 R13 要量嗰樣**。🟢 **零 migration**:`status` 係 `String` 唔係 Prisma enum ⇒ **ADR-0031 D1 喺呢度回本**
- [x] G5-A-b 🔴🔴 **`resumeRun` 個 R16 早退係一個真 bug,而 OQ-5 ① 正正指住佢** —— `ai-assist.service.ts` 嗰個 throw 排喺 `try` **之前** ⇒ **永遠唔會經 `failRun`** ⇒ run 停喺 `awaiting_approval` **永遠**;而 OQ-3 只准一張 request 一個非終態 run ⇒ **嗰張單永遠開唔到新 run,平台冇任何自愈路**。⚠️ **成個檔其他路都處理咗,就係呢個早退冇,而冇任何嘢係紅嘅**
- [x] G5-A-c 🔴 **兩個入口一個實現** —— `AiAssistService.expireRun()` 係機制,`AgentRunExpiryService` 只決定「幾時」。**唔係品味**:`agent.boundary.spec.ts` assert **`AgentStep` 只有一個 writer**,sweep 自己寫就會被佢捉到(而佢係啱嘅)。形狀跟 **CH-015 `openSyncGate`**(sweep + on-demand 兩條路唔可以漂)
- [x] G5-A-d 🔴 **④ 由 `OutboundFailure` 改成 `AgentStep`(實作當日更正咗自己嘅建議)** —— `OutboundFailure` 係**重做得到嘅嘢**嘅佇列(有 retry 掣),而過期 run **重做唔到**;擺個永遠撳唔得嘅掣落 Delivery failures **同 G1 嗰個 `Nothing proposed.` 一模一樣嘅錯**。`AgentStep` = D4 action ledger,而 F8 張卡已經 render steps ⇒ **零前端改動就見到**
- [x] G5-A-e 🔴 **sweep 只掃 `awaiting_approval`,刻意唔掃 `running`** —— running 有 in-flight model call,由另一個 process 令佢過期就係**平台自己講一件仲做緊嘅事做完咗**。要偵測真死咗嗰啲需要 **heartbeat 唔係門檻** ⇒ **列做已知缺口,唔喺度塞一個錯答案**
- [x] G5-A-f 🔴 **過期 proposal 唔寫 `decidedAt`/`approvedById`** —— 寫咗就會令佢哋入 G7 個人口做 rejection ⇒ **一隊人愈唔審,批准率愈低,睇落愈嚴謹**。⚠️ **一個 risk metric 唔可以喺佢量緊嘅行為變差嗰陣自己變靚**
- [x] G5-A-g 🟢 **`Record<AgentRunStatus, …>` 兩個 map 即刻紅** —— 加 `'expired'` 落 union,web tsc 出**兩個** TS2741(`RUN_TONE` + `RUN_LABEL`)⇒ **union 真係守住咗**。而隔籬 `STEP_LABEL` 係 `Record<string, string>` **一聲不響** —— **F11-1b 講嗰個對比,今日拎到實證**
- [x] G5-A-h 🔴🔴 **順帶修咗 F11-1b 自己一個缺口** —— `ai-assist-step-labels.test.ts` 個 `PLATFORM_KEYS` 係 **hardcode**,而佢個註釋寫住「hardcoded on purpose: if one is renamed…」⇒ **守住改名,守唔住新增**。同一個檔入面 registry 嗰半係**掃出嚟**(新 tool 捉到)、platform 嗰半係**手寫**(新 key 捉唔到)—— **兩半用咗兩種強度,而弱嗰半正正就係我今日踩中嗰半**。已改成兩半都掃 + 各自有 vacuous-pass guard
- [x] G5-A-i ✅ **Falsification ×9 真紅零誤傷**:①`expired` 改返 `aborted` ⇒ **3 紅** ②寫 `decidedAt` ⇒ 1 紅 ③R16 早退唔 expire ⇒ 1 紅 ④sweep 掃埋 `running` ⇒ 1 紅 ⑤cutoff 用鐘唔用日 ⇒ **6 紅** ⑥sweep select `runState` ⇒ 1 紅 ⑦拆走 `expired` label ⇒ 1 紅 ⑧**反方向**:`platformStepKeys` 改返 hardcode ⇒ **1 紅(出乎預期)** ⑨**改返 hardcode 兼拆走 label ⇒ 5 綠**
- [x] G5-A-j 🔴 **⑧ 出乎預期,而個原因值得記** —— 我預期「改返 hardcode」會綠(證明舊版盲),佢**紅咗**,因為條 test **另一半**(orphan label,反方向嗰條)捉到:`STEP_LABEL` 有 `expired` 而 known set 冇。⇒ **要證「舊版盲」就要同時拆走 label**(⑨),而⑨**真係 5 綠** —— **一個 mutation 證唔到嘢,唔等於個 claim 錯,可能只係 mutation 揀錯咗位**
- [x] G5-B ✅ **BullMQ 落地(2026-08-16)** —— `POST /agent/runs` 只 enqueue 就返;`AgentRunQueue`(Queue + QueueEvents + QueueEventsProducer)+ `AgentRunWorker`(**in-process**,ADR-0039 F3:locked stack 寫「app + postgres + redis」冇 worker,而本 phase 已經有一個外部依賴等緊)。`startRun` 拆兩半,新 `executeRun` 畀 worker 叫
- [x] G5-B-a 🟢🟢 **回應 shape 一個字唔使改,而呢個係查證返嚟唔係設計出嚟(ADR-0039 F2)** —— 原本以為要 break 契約(「返結果」→「返 job id」),實際上 `AgentRunDto` 照返得,只係 `status: 'running'` / `steps` 得一個 / `proposals` 空;而**前端一早識處理** —— `RUN_TONE.running` / `RUN_LABEL.running` **F8 寫嗰陣就喺度**。⇒ **唔係 breaking change,係「返嘅嘢無咁完整」**。H1 仍然觸發(語義變咗:回應唔再代表「做完咗」),但**代價細一個數量級**
- [x] G5-B-b 🔴🔴 **`bullmq@6` 把 `ioredis` 由 dependency 改成 peerDependency —— 而我喺 ADR 寫住佢係 transitive** —— 實測 `MODULE_NOT_FOUND`,**連 transitive 都冇**;`bullmq` 同時 peer 住 `redis` 同 `pg`(佢有 `PostgresQueueBackend`)⇒ **BullMQ 6 唔再自帶 client,要自己揀一個裝**。⇒ **F9 個理由①「零新 dependency」係錯**,已喺 ADR 全文更正。**決定唔變**(仍然用 `QueueEvents`),消失嘅只係理由①,另外兩個原封成立兼多咗一個。📌 **呢個正正係 ADR-0038 `D4` 講嗰件事**(唔真裝就係對住「我以為佢係點」寫),而今次係**喺自己啱啱寫落 ADR 嘅論據上**中招
- [x] G5-B-c 🔴 **STOP 咗一句先做(H2)** —— 判斷:**冇任何一個讀法可以令 BullMQ 唔使 Redis client** ⇒ 「批咗 BullMQ」邏輯上已經包住佢(**ADR-0035 個「必然後果唔係新決定」形狀**)。揀 `ioredis` 唔揀 `redis`:BullMQ 文檔同生態預設(§13「揀更接近既有 pattern」)。`ioredis@6.0.0` **MIT**
- [x] G5-B-d 🔴🔴 **enqueue 失敗一定要 `failRun`,唔可以淨係報錯** —— row 到嗰刻已經係 `running`,留喺度就係 **OQ-3 永久封鎖嗰張 request**,而 **expiry sweep 刻意唔掃 `running`** ⇒ 冇人執得返。**同 `G5-A` 喺 `resumeRun` 揾到嗰個永久封鎖一模一樣,經另一道門**(infra outage 唔係 SDK upgrade)
- [x] G5-B-e 🔴 **`executeRun` 個 kill switch 排喺 `try` 入面,而唔係順眼嗰個位** —— `startRun` 查過,但**一個 switch 就係喺「queue 咗未行」嗰段時間被人撳**。排喺 `try` 之上 = 閂咗就 throw 而 row 留喺 `running` 永遠 = **G5-A 嗰個 bug 第二次**。⇒ **一次係 bug,兩次係 pattern**。🔴 **反過嚟 `status !== 'running'` 就刻意唔 `failRun`** —— 嗰個 run 已經有結論(`aborted` / `expired` / 遲到嘅重複 job),覆蓋佢就係**用一個錯答案冚一個真答案**
- [x] G5-B-f 🟢 **worker 冇 `user`,scope 由 `startedBy` 攞** —— **`F1-6` 個 required column 第二次回本**(第一次係 `resumeRun` 隔夜審批之後)。一個由第二度攞 scope 嘅背景 job,就係一條事後擴闊 run 可見範圍嘅路
- [x] G5-B-g ✅ **`attempts: 1`,唔 retry** —— retry 會重入一個已經唔係 `running` 嘅 run,而 `executeRun` 拒絕佢 ⇒ 買到嘅只係一個遲啲先出、更難解嘅失敗。**修法係開一個新 run,而嗰個係人嘅決定**(同 `expireRun` 同一個答案)
- [x] G5-B-h 🔴 **兩個 provider 唔係一個** —— 依賴方向相反(`AiAssistService` 要 queue、worker 要 `AiAssistService`),夾埋就係 circular 要 `forwardRef`;而拆開本身就係更誠實嘅形狀(一個乜都唔知嘅 transport + 一個只識一個動詞嘅 worker)
- [x] G6 ✅ **SSE transport(2026-08-16)—— `ADR-0029 A2` 嗰筆基建債還咗** —— `GET /agent/runs/:id/events`
- [x] G6-a 🔴 **payload 只有 `{runId, type}`,唔送內容(ADR-0039 F10)** —— ①**唔養第二個真相**(stream 出去嘅 step 同 refetch 返嚟嘅一有差,畫面就攞住兩個版本;**CH-028 唔喺 Platform view 計 delta 講嘅就係同一件事**)②🔴 **H4**:`AgentStep.detail` 可以有 vendor error,而 vendor error 引嘅 path 帶 UPN(**BUG-004**),今日入表前經 `scrubPii` ⇒ **唔開多一條 transport,就冇多一個要記住去 scrub 嘅地方** ③回退 polling 唔使改契約
- [x] G6-b 🔴 **`defer` 唔係 `async` handler,而佢係承重嘅** —— 令權限檢查喺**每次 subscribe** 做,而唔係 route 建立嗰刻;**scope 唔過就連 channel 都唔開**(唔係開完先 error —— 嗰種寫法個失敗睇得見,個 leak 睇唔見)。falsification ⑪ 兩條都紅
- [x] G6-c 🔴 **一個 publish 點 + 三個補位** —— `writeStep` 已經係 `AgentStep` 唯一 writer(`agent.boundary.spec.ts` assert 住,原本為咗 A7 / INC-001),所以 publish 擺喺嗰度就覆蓋晒每一個 step。🔴 **但改 status 而唔寫 step 嗰啲佢睇唔到** —— `completed` / `awaiting_approval` / `failRun` / `abortRun` / `expireRun` 各補一次,唔補就係**一個已經完咗嘅 run 上面卡住個 spinner**
- [x] G6-d 🟢 **nginx 喺我哋手上(F6)** —— `apps/web/nginx.conf.template` 加一個 **regex location 專用**,`proxy_buffering off` / `proxy_cache off` / `proxy_read_timeout 3600s` / `Connection ''`。**唔關掉成個 `/api/`** —— 為一條 endpoint 付全域代價,而 location 匹配本來就容得落更精確嘅路徑。🔴 **自己 catch 咗一個**:regex location **唔可以**靠 trailing slash strip `/api`(嗰個只對 prefix location 成立)⇒ 要 `rewrite ^/api/(.*)$ /$1 break;` + 一個冇 URI 部分嘅 `proxy_pass`
- [x] G6-e 🔴 **`EventSource` 自己會無限重連,而且睇唔到 status code** ⇒ 一個 404(run 冇咗)或者 403(唔同 OpCo)同一個 blip 完全一樣,會重試到閂 tab 為止。⇒ **連續三次失敗就收線**,`onopen` 重置(唔重置就會變成「一世累積三次」,一條開足一日嘅連線遲早會夠數然後永久停)
- [x] G6-f ✅ **終態 run 唔開連線** —— 終態係呢張卡大部分時間顯示緊嘅嘢(每一個俾人揭返出嚟嘅舊 run)。逐個開就係**一張卡一條 socket**,開足成個 session,更新一件唔會變嘅嘢。📌 寫成 **LIVE set 唔係 terminal set**:兩者可以互推,但**新加嘅 status 大機會係終態**,咁寫令未知情況 fail closed
- [x] G6-g ✅ **靠既有 httpOnly cookie(F8)** —— `EventSource` 唔送 `Authorization` header,而平台由 ADR-0028 起發嘅就係 cookie ⇒ 現有 guard 原封適用。⚠️ **代價講白**:Bearer 呢條路(ADR-0002,保留住)**用唔到 SSE**,今日冇 caller 需要
- [x] G6-h ✅ **Falsification ×11 真紅零誤傷**:①enqueue 失敗唔 `failRun` **1 紅** ②kill switch 移出 `try` **1 紅** ③拆走 status 守衛 **1 紅** ④拆走 `completed` 個 publish **1 紅** ⑤拆走開場 tick **3 紅** ⑥拆走 `runId` filter **1 紅** ⑦拆走 teardown `off` **1 紅** ⑧enqueue 錯誤訊息改成 kill-switch 講法 **1 紅**(R23)⑨`LIVE_STATUSES` 加 `completed` **2 紅** ⑩拆走 `onopen` reset **1 紅** ⑪**反方向**:SSE 先開 channel 後驗權 **2 紅**
- [x] G6-i ✅ **W28 permission drift test 第四次捉到新 agent surface** —— 睇過先更新,**只加一行** `GET /agent/runs/:id/events → roles [ADMIN,REGIONAL]`
- [x] G6-j 🔴 **兩個 test helper 各自令一條 test 睇唔到嘢,兩個都係真跑先揭到** —— ①queue spec 原本 `state.eventsOn.mock.calls[0]` 假設「第一個 listener 就係我要嗰個」,而 `onModuleInit` 早就註冊咗 `'error'` ⇒ 改成按 name 搵 ②web spec `mount('running', undefined)` 撞正 **default parameter 食咗 explicit `undefined`** ⇒ 條 test 從來冇行過佢聲稱嘅 case。**兩個都紅咗,所以先至係腳註**
- [x] G6-k ✅ **Redis 2026-08-17 併入嗰封未發出嘅 infra 信(Chris 拍板)** —— `11-azure-openai-infra-request.md` 加咗 **`Q5`**(Redis:開唔開得到 / 點連 / **idle timeout**)+ **`Q6`**(SSE 過唔過 ACA ingress)+ **Part D**(兩件事嘅緊急程度唔一樣)。🔴 **`Q5c` idle timeout 專門問一個已知會咬人嘅位** —— BullMQ `Worker` / `QueueEvents` 靠**長期 blocking 連線**等嘢做,而一條乜都冇做嘅佇列**結構上就係 idle**;⚠️ 呢個我由印象寫,repo 證唔到 ⇒ 同 `Q3` 一樣寫成「請確認」唔寫成結論。🔴 **新 `R25`:`rediss://` vs `redis://` 一個字之差** —— `ioredis` 靠 **scheme** 決定行唔行 TLS,而 Azure Cache for Redis 預設只收 TLS ⇒ 填錯個症狀係「連唔到」,錯誤訊息**一個字唔提 TLS**(**同 `R17` deployment 名完全同族**)⇒ 信入面要求**原文回報成條 connection string**
- [x] G6-l 🔴 **Redis 同 Azure OpenAI 唔係同一種請求,而個分別喺 PAR 嗰格** —— `05:54` 原文係 `Azure OpenAI ✅ 暫無(**Redis/BullMQ 未 wired**)`:前者係「申報**冇** → 而家要有」,後者係「申報**未接** → 而家接咗」。⇒ 治理重量差一級(Redis **零新增對外資料流**,經佢嘅只有一個 run id),**但同一格要改** ⇒ 一個「只改一半」嘅修訂同一個冇修訂,喺治理上都係**描述咗一個唔存在嘅態勢**(`05:30` 嗰條原則)
- [x] G6-m 🔴 **Part D:兩件事嘅緊急程度唔一樣,唔可以因為寫喺同一封信就當佢哋卡住同一樣嘢** —— Azure OpenAI 冇 = **`A14` 一條 live 驗**(期二全部 mock 照做得);**Redis 冇 = DEV 一部署 agent 就整個停**(`startRun` enqueue 直接 503),**冇 workaround** ⇒ **`main` merge 咗 W46 之後,部署 DEV 之前 Redis 要喺度**
- [x] G6-n 🚧 **一條 contingency,查證咗一半就停(刻意)** —— `bullmq@6` exports 有 **`PostgresQueueBackend`**、`peerDependencies` 有 `pg>=8`(實查),而我哋**已經有一個通咗嘅 Postgres**。⚠️ **三件事未查證所以佢係線索唔係方案**:①`QueueEvents` 喺 Postgres backend 之下行唔行得通(**我哋個 SSE 就係靠佢**)②成熟度(BullMQ 6 新嘢)③🔴 **佢會觸發 H1/H2**(§5.2 逐字寫「背景工作:Redis + BullMQ」)。**刻意唔寫入請求** —— infra 唔需要知我哋有後備,寫咗只會令個請求睇落可有可無
- [x] G5-B / G6 ⚠️ **`B6`(SSE 喺 DEV 真通)維持未勾** —— 佢要 **Redis 喺 DEV 存在**先做得到(F5),而 **ACA ingress 對 SSE 嘅行為係唯一改唔到嗰層兼且未驗證**(F7 / R22)。🚧 **卡 infra,同 `A14` 完全同一個形狀** · 🔴 **佢會改 API 契約**:`POST /agent/runs` 而家**同步等 LLM 返 `AgentRunDto``,推去 worker = 由「返結果」變「返一個 pending run」⇒ F8 張卡要改,**而前端點知幾時完 = 就係 `G6` SSE** ⇒ **A 同 G6 係同一件事嘅兩半**(A 冇 G6 就要 polling,而 polling 係一個會留低嘅設計;ADR-0029 A2 當初否決 SSE 係因為基建未摸熟,唔係因為 polling 好)
- [x] G5-pre-1 ✅ **OQ-5 答咗,而四格嘅來源唔一樣** —— ①**門檻 7 日 = Chris 答**;②**新 status `expired`** ③**R16 版本標記 + 主動對比** ④**fail loud 走 `OutboundFailure`** = **AI 建議,Chris 冇反對但冇逐條講**(沿用 `CH-015`/`F9-8` 先例:兩種證據都算數,但唔可以寫成同一種)。🔴 **②嘅理由唔係「講得準啲」係 G7**:`aborted` 已經專指「平台執手尾」(`abortRun` 兩個決定欄都唔寫),塞埋過期落去 = 把「冇人審」同「平台停咗佢」溝埋,而前者正正係 R13 要量嗰樣。🟢 **零 migration**(`status` 係 `String` 唔係 enum —— **ADR-0031 D1 喺呢度回本**)。📌 **expiry 由邊個執行(BullMQ delayed job vs `@nestjs/schedule` sweep)唔屬 OQ-5,係 G5 實作決定**
- [x] G5-pre-2 ✅ **查清楚 OQ-5 實際卡乜(2026-08-16,寫咗入 plan §7)—— 佢表面係一個數字,實際卡四樣** —— ①一個掛住嘅 run **永久封鎖**嗰張 request(OQ-3 + `NON_TERMINAL_RUN_STATUSES`)②**有兩種過期**,時間 sweep 解決唔到 R16 嗰種結構過期(由**部署**決定,而且今日**冇人撳就冇人知**)③佢決定 G3 個 kill switch 會唔會**永遠 `settled: false`** ④過期落咩 status 會撞到 G7 個 `decidedAt != null` 人口(**「冇人審到過期」係 R13 嘅另一面,而家個 metric 睇唔到**)。📌 **G5 有一半唔卡佢** —— 推去 worker 唔使知 expiry,卡嘅只係「expiry 由邊個執行」
- [x] G6-pre ✅ **`ADR-0039` Accepted(Chris 2026-08-16,五條後果過目之後)** —— **F2** 契約唔使 break · **F4** SSE 同多 replica 令 Redis 由「BullMQ 要」升級成「SSE 都要」 · 🔴🔴 **F5 DEV 冇 Redis = 第二個 infra 依賴,應即刻併入未發出嗰封信** · **F6** nginx 喺我哋手上 · 🟡 **F7 ACA 對 SSE 未驗證**。⇒ **R1 gate 過**
- [x] G7 ✅ **R13 監測(2026-08-16)** —— api **1243 → 1260 / 85 → 87**,tsc 0 / lint 0,**falsification ×7 真紅零誤傷**。`GET /agent/review-stats?days=30`(**ADMIN only**)
- [x] G7-a 🔴 **R13 唔係「agent 提議錯嘢」,係「批准嗰個人唔再讀」** —— ADR-0036 D3 擺一個人喺每個寫入前面,而**嗰個就係 Tier 1 成個安全論據**;一個冇人真係做嘅審批步驟,會把個論據變成形式,而**每個畫面照樣印住一個人名喺個決定側邊**。系統一啲都唔會睇落唔同 ⇒ **只能靠數字,靠唔到留意**
- [x] G7-b 🔴 **讀 `AgentProposal` 唔讀 `AuditLog`** —— audit 側**已經**係一條 query(`AGENT_PROPOSAL_DECIDED` 一條 action 覆蓋 approve + reject,靠 `metadata.reason` 分),但由一條 **free-text reason 嘅前綴**推個批准率,係一個**改一次文案就靜靜變錯**嘅 metric。`status` / `decidedAt` / `approvedById` 三個欄係結構化嘅
- [x] G7-c 🔴🔴 **人口定義 = `decidedAt != null`,而佢排除嘅嘢先係重點** —— `abortRun` 把一個 run 嘅 pending proposal **批量 reject**,而佢**兩個決定欄都唔寫**(平台執手尾,唔係有人話唔得)。計咗佢哋做 rejection 會把批准率**推低** ⇒ **一個乜都批嘅人,會因為愈多 run 被停而睇落愈嚴謹**。⚠️ **一個 risk metric 喺「令人安心」嗰個方向出錯,衰過冇 metric**
- [x] G7-d 🔴 **`failed` 計做批准** —— G1 之下,批准人講咗 yes 而八道閘之一拒絕咗,就標 `failed`。**R13 問嘅係個人仲讀唔讀,而佢講咗 yes**。當成 rejection 會令一個 reviewer **愈係要平台救佢就睇落愈有懷疑精神** —— 啱啱相反,而且會喺**出事嗰刻**顯示成一條改善緊嘅趨勢
- [x] G7-e 🔴 **兩個指標唔對稱,而個 DTO 明文寫低咗點讀** —— **`fastDecisions` 係證據**(幾秒就決定咗 = 冇讀過,唔使任何假設);**`medianSecondsToDecide` 唔係**:個鐘由 proposal **建立**嗰刻開始行,唔係由人**望到**嗰刻,所以一個長 median 可以係「審得仔細」亦可以係「冇人喺度」—— **由呢度分唔到**。一個把慢 median 當勤力嚟展示嘅 dashboard,就係自己作嗰個令人安心嘅解讀
- [x] G7-f ✅ **median 唔係 mean** —— 一單隔夜批准 = 14 個鐘,足以把十單 5 秒嘅平均值拉過任何有用嘅門檻
- [x] G7-g 🔴 **per-reviewer,因為 aggregate 答唔到** —— 一隊人整體 70%,**可以入面有一個 100% 兼平均四秒**,而 aggregate 就係嗰個藏住佢嘅數字。**一個講唔出佢講緊邊個嘅 metric,冇人 act 得到。**(⚠️ R3:plan B7 只寫「批准率 / 平均審核秒數」兩個 aggregate 數,per-reviewer 係本單加嘅)
- [x] G7-h 🔴 **H4:只攞 `displayName`,冇 email** —— 攞名係因為 cuid 冇人 act 得到,而**一個冇人 act 得到嘅 metric 等於冇做**;只攞名係因為 email 對呢條問題**一個字都冇加**。endpoint **ADMIN only**,同 `/admin/audit` 一樣理由(ADR-0009 D7)。條 test 用 `Object.keys().sort()` 釘死成個 row 得八個欄
- [x] G7-i ✅ **`null` 唔係 `0`** —— `approvalRate: 0` 讀落係「呢隊人乜都唔批」,而事實係「乜都未有」。同 `lastSuccessAt: null`(ADR-0010 D4)同一條規矩
- [x] G7-j ✅ **冇 row cap,刻意** —— 一個被截斷嘅統計係一個**望落啱嘅錯統計**;bound 佢嘅係個 window,而 proposal 以人類速度到達
- [x] G7-k 🔴🔴 **falsification 揭到我一條 test 靠對稱嘅 fixture 綠** —— `averages the two middle values` 原本用 **10/20/30/40**,而嗰組數嘅 **mean 同 median 都係 25** ⇒ **把實作換成 mean,佢照綠**。改成 10/20/30/**200**(median 25 / mean 65)⇒ 同一個 falsification 由 1 紅變 2 紅。**佢 assert 緊個數字,唔係嗰個統計量**
- [x] G7-l 🔴 **試過寫一條 boundary static test,寫完拆咗** —— 想 assert「全 `src/` 只有 approval orchestrator 寫 `decidedAt`」,但個 grep **分唔開 write 同 Prisma `select`/`where`**(`decidedAt: true` 係 select、`decidedAt: { not: null }` 係 where)⇒ 兩個 false positive。**改成一條 behavioural test 釘住真正嘅風險位**(`abortRun` 個 `updateMany` 冇 `decidedAt` / `approvedById`),而「冇第二個地方寫」嗰半**既有嘅 `writersOf('agentProposal')` 已經覆蓋咗**
- [x] G7-m ✅ **Falsification ×7 真紅零誤傷**:①人口放闊(唔要 `not: null`)⇒ **1 紅** ②`failed` 當 rejection ⇒ **1 紅** ③rate 返 `0` 唔返 `null` ⇒ **1 紅** ④mean 代 median ⇒ **2 紅**(修完 fixture 之後)⑤fast 門檻改 inclusive ⇒ **1 紅** ⑥`abortRun` 補 `decidedAt` ⇒ **1 紅** ⑦拆走 per-reviewer ⇒ **5 紅**
- [x] G7-n ✅ **W28 drift test 第三次捉到新 agent surface** —— snapshot 睇過先更新:**只加一行 `GET /agent/review-stats → roles [ADMIN]`**
- [x] G7-o ✅ **UI 做咗(2026-08-16)** —— 見下面 `G-UI`

---

## `G-UI` —— 三個 UI 項一次過收(2026-08-16,Chris 批准停 `ai-doc-extraction-db`)

- [x] G-UI-1 ✅ **新 Settings tab「AI agent」** = kill switch card + review stats card。**唔擺落 Integrations**:嗰個 tab 講 **vendor wiring**(邊個 runtime、邊個 model),呢兩個講 **operation**(個能力行唔行、前面道人閘仲有冇人用)。一個 view 一個 primary(H6)= 個掣;數字係唯讀
- [x] G-UI-2 🔴 **badge tone 跟 `settled` 唔跟 `enabled`** —— 「閂咗」係一個**打算之內**嘅狀態,唔應該嘈;「閂咗但仲有 run park 住」先係要人知嗰個。⇒ `Running`(purple/AI 色)· `Switched off`(neutral)· **`Switched off — not settled`(warn)**
- [x] G-UI-3 🔴 **dialog 兩個方向講唔同嘢,而「開返」嗰個先係嚇親人嗰個** —— 閂:講清楚**連 approval 都會拒**(唔止新 run),而已經 park 咗嘅唔會消失。開返:**逐個數報出嚟**(「N run + M proposal 會變返可批准」)兼明講「入面可能有一個真派 licence 嘅 assign」
- [x] G-UI-4 🔴 **G7 個「點讀呢啲數」寫上畫面,唔淨係擺喺 DTO** —— 「幾秒 = 冇讀過」係證據 · median 係 **context, not proof of care**(個鐘由 proposal 建立行起)。**一個把慢 median 當勤力展示嘅 dashboard,就係自己作嗰個令人安心嘅解讀**
- [x] G-UI-5 🔴🔴 **render 捉到一個四層 test 全綠嘅真缺陷 —— CH-030 個教訓原封重演**:`Select` 個 wrapper 係 `w-full`,而佢個 chevron 係 `absolute` 貼住嗰個 wrapper ⇒ 我淨係 size 咗入面個 `<select>`,**個箭嘴飛咗去成張 card header 最右邊**,同個掣完全分家。tsc / lint / 11 條 UI test **全部綠**。改成**外面包一個 `w-[150px]` div**;順帶連 subtitle 都唔再折行。⇒ **「字喺唔喺度」同「佢喺邊」仍然係兩件事**
- [x] G-UI-6 ✅ **兩個 tab × 兩個 theme = 四張,全部零橫向溢出**(`scrollWidth === clientWidth === 1440`)· token 真 swap(`--bg` `#f5f5f6`↔`#08080a` · `--card` `#ffffff`↔`#141417` · `--accent` `#E60027`↔`#ff3355` · `--purple` `#6d28d9`↔`#a982f0`)· 幾何 light/dark 逐個相等
- [x] G-UI-7 🔴🔴 **順帶喺真 Postgres 上驗到成套 G7 邏輯,唔係 mock**:`decided 4 / approved 3` ⇒ **`failed` 真係當咗批准**(G1 嗰行)· `medianSecondsToDecide: 5`(真值 [3,4,6,1320] 嘅 median = 5,而 **mean 會係 333**)· `approvalRate: 0.75` · byReviewer 兩行(一個有名 100%/4s/3 快、一個 `displayName: null`)· kill switch `enabled:false + liveRuns:1 + pendingProposals:1 ⇒ settled:false`。**mock 證得到公式,證唔到 Prisma 個 where 真係咁行**
- [x] G-UI-8 🔴 **H4:fixture 用一個 `.invalid` 假帳戶,唔用 DB 入面兩個真人** —— 呢個 panel 成個作用就係**點名**,用真名 render 就係把真名寫入一份 artifact。fixture 全部 `zzrf-` 前綴,收工逐張表對返數:**0 principals / 0 runs / 0 proposals / 2 users**(同開工前逐字一樣),screenshot 亦已刪
- [x] G-UI-9 ⚠️ **兩個新環境陷阱,§9 未記過**(見 progress Day 15)—— ①**呢個 worktree 個 compose project name 唔同咗**,`docker compose up -d` 唔係 start 返舊 container,係**試圖新建**(撞名失敗)兼**開咗一個空 `ai-agent_pgdata` volume** ⇒ 若果佢成功咗就係一個**空 DB**;正確做法係 `docker start uop-postgres uop-redis` ②`prisma generate` 撞 **EPERM**,因為一個殘留 api 進程**鎖住咗 engine DLL** ⇒ **`kill-zombies` 要行喺 `sync-code` 之前**
- [x] G-UI-10 ✅ **5433 交還驗到最嚴嗰個標準**(§9 硬規則):**真 TCP connect = True** + `pg_isready accepting` + 佢個真 DB `ai_document_extraction` 仲喺 ⇒ 唔係 `docker ps` 個 `Up (healthy)`。順手清咗個空 volume 同 network
- [x] G-UI-11 ✅ web **403 → 414**(6 紅 = pre-existing,數目一個字冇變)· tsc 0 / lint 0 · 新 test 11 條

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
| 🆕 infra | 🟡 **草擬咗,未發出** → `docs/13-deployment/11-azure-openai-infra-request.md`(**Q0 治理 + Q1 auth/E4 + Q2 deployment/OQ-1 + Q3 abuse monitoring + Q4 outbound**,連一段可直接發嘅英文全文) | W46 **第一個外部依賴**,而本項目 infra 依賴 B1/B4/B7/B8/B9 五次每次都要等。🔴 **草擬過程查到一個唔喺任何 W46 文件入面嘅障礙**:`05-rci-par-process.md:4`「**開資源前必經 PAR**」,而同一份 PAR Section 1 `:54` **明文申報咗「Azure OpenAI 暫無」** ⇒ 開佢同我哋自己寫落治理文件嗰句相反;而嗰份 PAR **仲未提交**,`09-dev-as-built.md:125`「DEV 要唔要走 PAR,要問」**亦從來冇問過** | 🟢 **路已揀 = B**(Chris 2026-08-16:治理同技術同一封,`Q0` 第一條)⇒ **份嘢可以直接發,等 Chris 發**。**A14 嘅時間表由佢決定** |
| ~~F10-2e~~ | ~~**`agent-run.controller.ts` / `agent-approval.controller.ts` 兩個都冇 spec 檔**;而 **BUG-011 個教訓逐字就係呢條縫**(三層 test 可以全綠而 bug 住喺中間)~~ | 🟢 **2026-08-16 同日補咗** —— 8 + 4 條,api **1199 / 83**;兩個 controller falsification 各一真紅零誤傷。🔴 **順帶查證到:呢個 app 全 `src/` 零個 `ClassSerializerInterceptor`** ⇒ **DTO 係文件唔係過濾器**,`runState` 唯一嗰道閘就係 service 個 `select` | ✅ |
| ~~F11-1b~~ | ~~**`STEP_LABEL` 同 `tool-registry.ts` 冇嘢釘住兩者對應**~~ | 🟢 **2026-08-16 收咗,喺 `G1` 之前**(佢就係第一個會踩中呢個缺口嘅改動)。**揀咗 parity test 唔係改 render 行為** —— §13「兩種都 reasonable → 揀更接近既有 pattern 嗰個」,而 source-scanning test 正正就係 `agent.boundary.spec.ts` 個 idiom;改 render 反而會令一個**今日唔存在**嘅狀態霸咗畫面一個位置。`ai-assist-step-labels.test.ts`(4 條)讀 API 個 registry 對返 `STEP_LABEL`,**兩個方向都驗**(缺 label / 多咗一個冇嘢 emit 得到嘅 label)。⚠️ **順帶要處理埋一個 lint 訊號**:由 component 檔 export 一個 constant 會破 fast refresh ⇒ `STEP_LABEL` 搬咗去 `ai-assist-labels.ts`(lint 建議嘅做法,亦令 test 個 import 乾淨咗)。falsification:抽走 `get_ledger` ⇒ **1 紅 3 綠**,而**錯誤訊息直接點名嗰個 tool** | ✅ |
| ~~G7-o~~ | ~~UI / render 未做~~ | 🟢 **2026-08-16 三個一次過收晒**(Chris 批准停 `ai-doc-extraction-db`)—— 見 `G-UI` | ✅ |
| ~~G3-n~~ | ~~UI / render 未做~~ | 🟢 **2026-08-16 三個一次過收晒**(Chris 批准停 `ai-doc-extraction-db`)—— 見 `G-UI` | ✅ |
| ~~G2-j~~ | ~~UI / render 未做~~ | 🟢 **2026-08-16 三個一次過收晒**(Chris 批准停 `ai-doc-extraction-db`)—— 見 `G-UI` | ✅ |
| R11–R19 | 未入 `RISK_REGISTER.md`(🆕 R17–R19 由 ADR-0037 新增) | living doc,ADR / plan 已記 | 期一收尾 |
| — | 🆕 **既有 gap(唔喺 W46 範圍)**:`audit-fields.ts` 個 `ConnectorConfig` whitelist 漏咗 `licenseOpsProvider` / `ticketUpdateProvider` / `acsSenderAddress` 等 ⇒ 改 seam provider 唔會出現喺 audit `before`/`after` | W39 / W40 / CH-011 三批欄都中 | 開一張 CH |

---

## `G-CLOSE` —— W46 收尾(2026-08-17)

- [x] G-CLOSE-a 🔴 **`plan.md` 個 acceptance 表由頭到尾冇更新過** —— 21 條全部 `[ ]` 而實際 18 條老早做完(勾咗喺本檔,**兩份文件各講各**)。**唔係「文件唔靚」** ⇒ plan 個 acceptance 就係「W46 算唔算完」嘅定義,佢全部空白即係**冇人講得出仲差幾多**。掃法 = 逐條搵返實際證據(邊個 spec 邊個 `describe`),**唔靠記憶勾**
- [x] G-CLOSE-b 🔴🔴 **掃出 `B3` 只做咗一半,而缺嗰半正正係佢個重點** —— claude spec 個 `D1` 證咗 **schema identity**(`toBe`),但 B3 原文要嘅係「**兩個 provider 對同一個 tool 呼叫產生同一個 `AgentStep`**」⇒ **成個 W46 冇一條 cross-provider 對照**。補咗 `agent-runtime.contract.spec.ts`(7 條,跟 `license-ops.contract.spec.ts` 形狀:**互相比較**而唔係各自對 fixture)。🔴 **點解 schema identity 頂唔住呢個 claim**:佢證嘅係「兩個 adapter **收**同一份嘢」,唔係「兩個 adapter **做**同一件事」,而 `AgentStep` 係 **audit truth**(D4)—— 佢一旦因為一個配置字串而有兩個意思,建喺佢上面嘅每一個查證都係喺**讀兩種語言當一種**
- [x] G-CLOSE-c 🔴 **contract spec 第一次跑就紅咗一條,而紅嘅位唔係我預期嗰個** —— 兩個 adapter 掟 error 之後**逐行一樣**(`record failed` → `throw`),但 **`@openai/agents` 個 `tool()` 自己 catch 咗**返一個 error 字串畀 model,而 `betaTool` 掟返出嚟。🟢 **點解唔推翻 B3(講出嚟唔係假設)**:分歧住喺 **adapter 之下、ledger 之上** —— `AgentStep` 兩邊逐字一樣,而兩邊個 model 都知道 tool 失敗咗,只係一個經 exception 一個經回傳值;條 test **兩個機制各 assert 一次**(只 assert `threw === null` 會 pin 住個 swallow 而 pin 唔住「有嘢生還」)。跟 `license-ops.contract.spec.ts` 先例 **pin 佢唔抹走佢**。📌 **值得記嘅唔係呢個分歧,係佢點解一直冇人見到** —— **兩個 provider spec 各自都完全正確,因為每個都只講自己**;「兩個實作一致」呢個 claim,**結構上冇一個單一實作嘅 spec 講得到**
- [x] G-CLOSE-d ✅ **Falsification ×3,其中一個係測 contract spec 自己嘅盲點** —— ①claude 側 `toolName` 改大寫 ⇒ **2 紅** ②**兩邊一齊**改大寫 ⇒ **1 紅**(🔴 **互相比較嗰條綠咗,hardcode 期望嗰條紅** ⇒ 兩種 assert **夾埋先有意義**;一條「兩邊一致」嘅 assert 對「兩邊一齊錯」係盲嘅 —— CH-023 tautology 教訓嘅正面應用)③拆走 claude 失敗路個 record ⇒ **2 紅**。還原後 `git diff --stat` 對兩個 provider **零輸出**兼**真跑過**
- [x] G-CLOSE-e ✅ **`R11`–`R25` 十五條入咗 `RISK_REGISTER.md`** —— carry 咗最耐嗰筆。`plan §6` 只定義咗 `R11`–`R16`,其餘散落喺 ADR-0037 / 0038 / 0039 同封 infra 信 ⇒ **有九條 risk 由頭到尾冇一個地方會令佢浮上嚟**,同 `PAR-submit` **一模一樣嘅形狀**(住喺一份文件尾嘅 `- [ ]`)。🔴 **入冊嗰陣校正咗 `R20`**(兩個 SDK 各自 ship `zod`)—— 實測 `@anthropic-ai/sdk` 得**兩個** dependency 而 `zod` 係 **optional peerDependency**,workspace 解析到**一個** `zod@4.4.3` ⇒ 標 `🟢 Resolved` 兼**理由寫成「實測推翻咗原假設」**,唔係靜靜刪走
- [x] G-CLOSE-f ✅ **收尾數字** —— api **1348 → 1355 / 91 → 92** · web **433 passed / 6 pre-existing** · 兩邊 tsc 0 / lint 0
- [ ] G-CLOSE-g 🚧 **W46 淨低三條,全部同一個原因** —— `A1`(DEV 半邊)· `A14` · `B6`:**三條都係「要一個真環境」**,而真環境要 infra 開兩個 resource。封信已寫好(含 Redis)**但未發**,幾時發係 owner 決定

---

## `G-LIVE` —— Azure OpenAI 真接線 + 第一次真跑 agent(2026-08-17,同日續)

> 🔴 **`G-CLOSE-g` 寫住「三條都要一個真環境」,而其中一條當日就唔使等 infra 咗** ——
> Chris 開咗一個 Azure OpenAI resource,`A14` 由「卡 infra」變成「跑得」。

- [x] G-LIVE-a ✅ **Azure 接線落地**(`1281c47`)—— `openai-agents.provider.ts` 新 `buildAzureClient(config)`,`buildAgent` 每次叫 `setDefaultOpenAIClient(...)`。🔴 **`AZURE_OPENAI_ENDPOINT` / `_API_KEY` / `_API_VERSION` 三個缺一就 503,冇 default** ⇒ **`E1`(唔准打公共 OpenAI API)由「冇人設 key」變成一道真閘**:之前 E1 靠「冇人填 `OPENAI_API_KEY`」成立,而家係**填咗都唔會用**
- [x] G-LIVE-b 🔴 **H1 觸發過一次,STOP 咗** —— 原定跟 ADR-0037 `B4` 把 endpoint 放 `ConnectorConfig`,但一 Read 就發現 `connectors.ts` 個 editable 集合**係 Prisma 欄**⇒ 加欄 = migration = H1。改行 **env**,三個理由 log 咗(①endpoint 同 key 同源,分兩處存反而易錯 ②env 改完唔使重 build web image,同 ADR-0028 `ENTRA_*` 同族 ③`ConnectorConfig` 係 runtime 可改,而呢三個係部署事實)
- [x] G-LIVE-c 🔴 **`AZURE_OPENAI_API_VERSION` 刻意冇 default,而佢第一次跑就證明咗自己** —— Run 1 `failed`,Azure 原文:`… only for api-version 2025-03-01-preview and later`。⚠️ **一個 default 喺呢度會變成一個靜靜過時嘅數字**;冇 default ⇒ 錯就即刻大聲。🟢 **順帶證咗 endpoint 通 + key 有效**(打得到先有得嫌 version 舊)
- [x] G-LIVE-d ✅ **Run 2 / Run 3 真跑到 `awaiting_approval`** —— Run 2:`start → get_request → search_catalog → propose_line_items`,items 空(fixture 冇提 licence),而 agent **主動講明**兼認得張單已 `COMPLETED`。Run 3:`search_catalog ×3`、**9 條 transcript**、提兩個 SKU,**兩個 GUID 落 DB 逐字對得返**(`Microsoft_365_E5_(no_Teams)` / `VISIOCLIENT`),reasoning **主動指名另外兩個變體兼叫人覆核**
- [x] G-LIVE-e ✅ **abort 真行到** —— run `aborted`,佢個 pending proposal **自動 `rejected`**(`The run was stopped`)⇒ `abortRun` 嗰段 bulk reject **第一次有真數據**
- [x] G-LIVE-f 🟢🟢 **approve → 409 `This request is complete…`,零副作用** —— **`F8-3` 卡上嗰句「Approving runs the platform's normal checks — they can still refuse」第一次真驗證**:個閘唔喺 agent 側,係 `RequestService.addLineItem` 本身,而佢照拒
- [x] G-LIVE-g 🔴🔴 **而個 409 順帶揭到一個真缺陷 —— `agent-approval.service.ts` 四個決定 writer,得佢一個冇寫 `approvedById`** —— 修咗(見下)
- [x] G-LIVE-h ✅ **UI render** —— light/dark **token 真 swap**、零橫向溢出、`STEP_LABEL` 生效(`Read the request` / `Searched the catalogue`)
- [x] G-LIVE-i 🟢🟢 **`A14` 最後三分一同日收咗 ⇒ `A14` 全收** —— 卡住嘅唔係 infra,係**要一張非 `COMPLETED` 嘅 request**(`G-LIVE-f` 嗰個 409 同呢個阻塞係同一道閘)。建咗一張 throwaway(`zzrf-resume-req-1`,`OPEN`)⇒ run `awaiting_approval`(7 steps / 1 proposal,兩個 GUID)⇒ **approve → run `completed`、proposals 清空**。🔴 **落 DB 對數而唔係睇 HTTP**:proposal `executed` + `approvedById` 有值 + `createdLineItemIds` 兩個真 id · request **2 條 line item**(`Microsoft_365_E5_(no_Teams)` / `VISIO_PLAN2_DEPT`,逐字對返 proposal 兩個 GUID)· 2 條 `NOTE` event · request 仍然 `OPEN`(兩條 `REQUESTED`,同 `aggregateRequestStatus:65-67` 對得返)
- [x] G-LIVE-j 🟢 **撳之前查證咗個真風險,而唔係假設佢安全** —— approve 會行 `RequestService.addLineItem`,而本機 Graph / ServiceNow 都係通嘅 ⇒ **先 Read 佢實作**:三個 Prisma 寫(line item / event / recompute),**零 outbound**。⇒ 撳落去最壞情況只係本機 DB 多幾行。⚠️ 順帶由同一段 code 確認咗 `:117` 嗰句 409 文案**逐字**就係前一日撞到嗰句
- [x] G-LIVE-k ✅ **收工逐張表對數** —— 刪 1 audit / 25 message / 8 step / 1 proposal / 1 run / 2 event / 2 line item / 1 request,四個 count **全 0**。fixture free-text 還原**用長度對數**(`146` → `46` = backup 長度),`_w46_fixture_backup` 已 `DROP`(`to_regclass` 返 null)。帶真 UPN 嘅 screenshot **2 → 0**(全程**冇 Read 過**)
- [x] G-LIVE-l ⚠️ **agent 主動標明咗一個唔完美嘅 match** —— Visio 嗰個提咗 `VISIO_PLAN2_DEPT`,reasoning 寫住「the catalogue offers a **departmental variant**; this is the closest exact Plan 2 match, **so it is proposed for human approval**」⇒ **佢冇扮完美 match**,呢個正正係 D 側想要嘅行為

### `G-FIX` —— `approvedById` 漏寫(2026-08-17)

- [x] G-FIX-a 🔴 **形狀:唔係「漏咗一行」,係「呢條路對『算唔算一個決定』冇立場」** —— `createLineItems` 個 catch 寫 `decidedAt` 但唔寫 `approvedById`,而**呢個組合喺本 codebase 自己嘅語彙入面唔存在**。三個先例:`abortRun` 同 run expiry **兩個都唔寫**(`review-stats.service.ts:136-140` / `ai-assist.service.ts:538` 都明文寫低理由)· `approveAssign` 被閘拒 **兩個都寫**
- [x] G-FIX-b 🔴 **分界線係「有冇人撳過 approve」,唔係「HTTP 成唔成功」** —— 按呢條線 `createLineItems` 個 catch 屬**有人撳過**(佢只喺 `approve` 收咗個決定之後先跑得到)⇒ 補 `approvedById`,`decidedAt` 保留
- [x] G-FIX-c 🔴 **後果係一個 risk metric 喺令人安心方向出錯** —— G7 人口 = `decidedAt != null` 而 `isApproval` **把 `failed` 當批准**(`review-stats.service.ts:120`)⇒ 呢條 row **入到 aggregate**,但 `byReviewer` 把佢掉入 `approverId: null` 個 bucket ⇒ **撳咗 approve 嗰個人少咗一次批准**。而 `R13` 自己嘅規矩就係「review metric 唔可以喺令人安心嗰個方向錯」
- [x] G-FIX-d ⚠️ **順手校正咗一句會誤導下一個人嘅 test 註釋** —— 原文「The proposal is marked `failed`, and **nobody decided anything**」係講 **audit row**,但佢會被讀成「呢條路唔算決定」。改成講清楚兩份記錄答唔同問題:audit 記「**發生咗咩**」(冇嘢發生 ⇒ 冇 row),`approvedById`/`decidedAt` 記「**邊個撳咗**」(有人撳咗 ⇒ 寫)
- [x] G-FIX-e ✅ **新 test + falsification** —— `records WHO approved even though the domain path then threw`(**兩個欄一齊 assert**,因為佢哋淨係一齊出現先有意思)。拆走 `approvedById: approver.id` ⇒ **1 紅 / 29 綠,零誤傷**,紅嗰條正正係新 test(`Received: undefined`)
- [x] G-FIX-f ✅ **api 1361 → 1362 / 92 suites 全綠** · tsc 0(`--incremental false`,唔想留低 `tsbuildinfo` 觸發嗰個假綠燈)· lint 0
