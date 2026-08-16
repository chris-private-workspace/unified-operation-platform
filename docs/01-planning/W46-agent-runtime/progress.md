# W46 — AI Agent Runtime · Progress

> **Status**: `active`(2026-08-15)
>
> 🚧 文件同 code 都住喺 branch,**未 merge 落 `main`**(Chris 2026-08-15)。

## Day 0 — 2026-08-15(planning,零 code)

### 起因

Chris 要求把 AI agent 引入平台,四項前提同日拍板:**Tier 1**(有 action 權)· 第一個落點 = **`AI-Assist`** · **OpenAI Agents SDK 首選兼要支援 Claude** · **transcript 永久保留 + ADMIN 可讀**。

### 一個改寫

初稿把 target 當成 **Codex SDK**(coding agent,冇 custom tool)⇒ 被逼揀 MCP 做**唯一**接縫。Chris 更正:係 **OpenAI Agents SDK**。個更正令三件事變咗:接縫由 MCP 變 `AgentToolRegistry`(兩邊都食 JSON Schema)· HITL 由「跑完再另外執行」變原生 `needsApproval` pause/resume · 新增 D11 tracing 三重關。

### 最重要嗰個發現

平台**唔使由零起 harness**。過去 40 個 W/CH 已經砌好同一批 primitive —— `AssignStep` shape、audit allow-list、`scrubPii`、boundary spec、`SeamRuntimeRegistry`、`OutboundFailure`、`derivePermissions` —— 只係 actor 一直假設係人。⇒ 本 phase 係「把 actor 由人擴闊到 agent」,唔係「起一套新嘢」。

### Commits

- `c758c60` — `docs(agent): ADR-0036 + W46 pre-doc —— agent 接縫定喺 tool registry,harness 留喺平台`
- `7a58d75` — `docs(agent): ADR-0036 Accepted · W46 approved · 六條 OQ 一併批`

---

## Day 1 — 2026-08-15(F1 + F2)

### 做咗

**F1** —— 五個 model 落 `schema.prisma`,零改動落任何既有表(`AuditLog.actorType` 加 `'agent'` 只係一個 String 值,冇 DDL)。

**F2** —— `AgentToolRegistry`:一份 JSON Schema + 一份 impl,4 個 read tool + `propose_line_items`。33 條 test。

api **1077 / 75 suites** 全綠(基線 1044 / 74,**零跌**)· tsc 0 · lint 0。

### 🔴 Falsification ×4 —— 全部真紅零誤傷

§9 記低過嗰句「一條 assert 睇落嚴唔嚴謹,同佢捉唔捉到嘢,係兩件事」,所以逐個拆走實作跑一次:

| # | 拆走乜 | 結果 |
|---|---|---|
| a | `needsApproval: true` → `false` | 1 failed / 32 passed —— 紅嗰條 = A3 allow-list |
| b | GUID 格式檢查 | 1 / 32 —— 紅嗰條 = 「refuses a SKU named by part number」 |
| c | `scrubPii(row.targetUpn)` | 1 / 32 —— 紅嗰條 = 「redacts the target address」 |
| d | 「冇人批准」由 throw 改成靜靜返成功 | 1 / 32 —— 紅嗰條 = 「refuses to run at all」 |

**四次都係 1 紅 32 綠** ⇒ 每條 assert 捉住嘅係佢自己嗰件事,唔係一個大網。

### 🔴 F2 寫嗰陣揭到一個 ADR 從來冇決定過嘅嘢 —— OQ-7

寫 `get_request` 個 return 嗰刻先諗清楚:**`rawRequestText` 一定要原文出去**(parse 佢就係 AI-Assist 本身,scrub 咗就係交白卷),而 `targetUpn` 同樣。ADR-0036 對 PII 嘅三道防線 —— D6 transcript scrub、D11 tracing 關、D5 唔入 `AuditLog` —— **全部係關於「落庫 / 送去 trace backend」**。

**冇一道係關於 inference 本身。** 而 inference 就係把嗰段文字送去第三方 model provider。

⇒ 呢個唔係本檔嘅 bug,係 **ADR 一個缺口**。已加做 `plan.md` **OQ-7**,標成 **F5 之前嘅硬 gate**。

📌 值得記住嘅形狀:**D11 防到「順手開住嘅 tracing」,防唔到「這個功能的正常運作」。** 一個 opt-in 嘅洩漏面比一個 default-on 嘅更難見到,因為佢冇 default 可以罵。

### 三個「跟咗 plan 但要標明」嘅位

1. **`AgentRun` 冇 `startedById`** —— plan §4 冇寫,F1 跟咗 plan。但 F2 個 `AgentToolContext` 要一個 `AppUser` 攞 OpCo scope,而家由 caller 傳。🔴 **一個隔夜先批准嘅 run 重開之後,嗰個人只可能由 row 攞返** ⇒ F5 之前要決定。
2. **`AgentRun.requestId` 有 index 冇 FK** —— plan §4 逐字咁寫(連 `@@index` 都寫咗,唔似漏)。但 `OutboundFailure.requestId` **係有** FK 嘅 ⇒ 兩者唔一致。冇擅自加,已喺 schema comment 寫明。
3. **`search_catalog` 多回咗 `displayName` / `skuPartNumber` / `seatModel`** —— plan §3.1 寫「`skuId` GUID + `businessAlias` + `category`」。淨係得呢三樣,agent **冇嘢可以拎去 match**「give them E5」⇒ 佢一定會幻覺。真正嘅防線唔係「唔畀佢見到名」,係 `propose_line_items` **只收 GUID 兼驗存在性**(F2-5)。

### 兩個設計判斷(ADR / plan 冇指定)

**① `propose_line_items` 嘅 `execute` 係唯讀嘅。**

D3 / plan §3.2 個順序係:人批准 → **平台**行返 line item 建立路徑 → resume run → SDK 先至 call `execute`。⇒ 到執行嚟到 `execute` 嗰陣,嘢**已經做咗**,再建就係建第二次。所以佢做嘅係「讀返個結果交畀 agent 繼續推理」。

順帶得到一個第二層防禦:如果 `needsApproval` 幾時失效(SDK bug / 壞 adapter / 新 provider),呢個 tool 搵唔到已批准嘅 proposal 就 **throw**。兩條路都係「乜都冇建到」,但一條係靜,一條係大聲。

**② registry 一個 DB 寫入都冇 —— 連 `AgentProposal` 都唔寫。**

D4 講 proposal 由平台寫。如果 tool 自己寫,就係 **agent 自己記錄自己嘅證據** —— INC-001 嗰個形狀。test 用靜態 source 檢查鎖死(`.create(` / `.update(` / `$transaction` … 一律唔准出現)。

### Blockers / 未收

- 🔴 **A1(migration 對真 DB)未做** —— 本機 `uop-postgres` 冇跑(5433 畀 `ai-doc-extraction-db` 佔住,**停佢要 Chris 批**);DEV 要部署。**兩邊都未**。
- 🔴 **OQ-7(inference 側 PII)= F5 硬 gate**
- ⚠️ **OQ-1(model 選型)= F3 硬 gate** —— plan §7 標咗 🟡 approved as **deferred**,唔係已答

### Commits

- `329f223` — `feat(agent): W46 F1+F2 —— 五個 Agent* model + tool registry(allow-list 企喺平台側)`
- `6fd171d` — `docs(agent): W46 checklist + progress + OQ-7(inference 側 PII,ADR-0036 冇答過)`

---

## Day 2 — 2026-08-15(F3 + F4)

### 做咗

**F3** —— seam ⑤:`AgentRuntimeProvider` 抽象 + `OpenAiAgentsProvider` + exported factory,形狀逐條跟 `licenseOpsProviderFactory` 先例。
**F4** —— tracing 三重關(env + code + test)。

api **1099 / 77 suites** 全綠(F2 後 1077 / 75,**零跌**)· tsc 0 · lint 0 · **falsification ×4 真紅零誤傷**。

**H2** —— `@openai/agents@0.16.0` 裝咗(+11 個 transitive,含 `openai@7`、peer `zod@4`)。ADR-0036 已批 ⇒ 唔係新決定。

### 🔴🔴 F4 最重要嗰個發現:對住錯嗰個開關寫 assert,係一條永遠綠嘅 test

SDK 有**兩個唔同嘅 tracing 開關**,而佢哋唔會互相反映:

| | 係乜 | 陷阱 |
|---|---|---|
| `config.tracing.disabled` | 一個**只讀 env 嘅 getter**,`TraceProvider` constructor 讀一次做初值 | 🔴 **`NODE_ENV === 'test'` 時佢永遠返 `true`** |
| `setTracingDisabled()` | 寫 `TraceProvider` 嘅 live flag,`createTrace()` 真係讀佢(關咗返 `NoopTrace`) | 要 assert 就要 assert 佢 |

⇒ **如果條 test 寫 `expect(tracing.disabled).toBe(true)`,佢喺 Jest 之下永遠綠 —— 連 provider 入面 `enforceTracingDisabled()` 整行刪咗都綠。**

所以條 test 寫成三段:**先 `setTracingDisabled(false)` → assert `createTrace().traceId !== 'no-op'`(證明真係開到,唔係空轉)→ 起 provider → assert `=== 'no-op'`**。中間嗰句唔係 setup,佢係 test 一半。

📌 **形狀**:呢個係 §9 記低過嗰句「一條 assert 睇落嚴唔嚴謹,同佢捉唔捉到嘢係兩件事」嘅**最貴一次** —— 因為呢條 test 就係 **R14(SDK 升級令 tracing 靜靜開返)唯一會紅嘅嘢**。佢空轉 = D11 三重關實際上得兩關,而冇人會發現。

### 🔴 第二個 SDK 事實:`needsApproval: true` 會被包成 `async () => true`

`tool()` 內部把 boolean 包成 function(`STATIC_FUNCTION_TOOL_APPROVAL_POLICIES` 記住邊啲係靜態)。

⇒ **`expect(sdkTool.needsApproval).toBe(true)` 一定 fail**,而「修正」成 `toBeDefined()` 就變成**乜都捉唔到**(`false` 一樣 pass)。要驗就要**call 個 policy**:`await expect(policy()).resolves.toBe(true)`。

呢兩件事(tracing 開關、approval 包裝)有同一個形狀:**SDK 內部把一個值轉換咗,而最自然嗰句 assert 啱啱好落喺轉換之前或者之後嘅錯邊。**

### 三個 F3 設計判斷(ADR / plan 冇指定)

**① `claude-tool-runner` 配咗但未實作 ⇒ fall back,唔 throw。**
throw 嘅代價係一個 config typo 令**成個平台起唔到身**;而 fall back 之所以可以接受,**係因為 `recordChoice` 記低 EFFECTIVE runtime** ⇒ panel 講得出「配置咗 X、跑緊 Y」。呢個正正係 BUG-011 個 registry 存在嘅理由 —— 冇佢,fall back 就係一個靜靜嘅替換。

**② `resume()` 要求每個 interruption 都有決定,一個都唔可以留低。**
留低一個未決定嘅,佢執唔執行就變成由 runtime 行為決定,而唔係由人決定 —— 正正係 D2 要防嗰件事。

**③ `RunState` 讀唔返 → 503,唔會重開一個新 run(R16)。**
最誘人嗰個「補救」係由同一個 input 重跑一次。但人批准嘅係**嗰一個** tool call;新 run 會自己推導一批新嘅,然後喺一個從來冇畀過嘅批准下面執行。

### OQ-1:冇代 Chris 答,但令佢唔再 block code

`agentModel` **冇 code default**,由 `ConnectorConfig`(DB-then-env)解析,未配就 **503**。

⇒ 寫 code 唔再需要嗰個答案 —— 但**真跑一個 run 需要**,所以 **OQ-1 仍然 block F5**。理由寫喺 code 度:揀邊個 model 同時決定咗幾錢、做唔做得到、**同埋邊個第三方收到一個真人嘅 request 原文**(= OQ-7),一個 fallback 常數就係幫人做咗呢三個決定再收埋佢。

### 順帶改到既有檔(加一個 connector 嘅必然後果)

- `connectors.ts` —— `CONNECTORS` / `PROBEABLE` / `CONNECTOR_CONFIG` 各加 `agent`。**唔 probeable**(跟 `email` 先例:打一次 model 要錢,而且**一定要送啲嘢**,而「送咩」正正係 OQ-7 未答嗰件事)
- `ConnectorConfig` +`agentRuntime` +`agentModel` + migration + audit whitelist
- `seam-runtime.registry.ts` —— 新增 `recordChoice`/`choiceOf`(既有 boolean API **一個字唔改**)。⚠️ 用第二個 map 而唔係改第一個:三個 n8n seam 真係二元(「有冇經第三方」),agent seam 揀兩個 runtime 而**兩個都唔係「一直以嚟嗰個」**,boolean 冇誠實讀法
- `integration-status.service.ts` —— agent row。🔴 `state` 判斷用 **model** 唔用 runtime 或者 API key:runtime 永遠解析得到(factory 會 fall back),key 係 secret 呢個 service 睇唔到,**只有 model 缺席會真係令一個 run 跑唔到**

### ⚠️ 順帶睇到一個**既有** gap(冇改,只記低)

`audit-fields.ts` 個 `ConnectorConfig` whitelist **冇** `licenseOpsProvider` / `n8nLicenseBaseUrl` / `ticketUpdateProvider` / `n8nTicketWebhookUrl` / `acsSenderAddress` —— 即係 W39 / W40 / CH-011 三批欄改咗都**唔會出現喺 audit `before`/`after`**。唔喺本單範圍(§1.3),但值得開一張單。

### Blockers / 未收

- 🔴 **兩個 migration 都未對真 DB 跑**(`w46_agent_runtime` 五張表 · `w46_agent_connector` 兩個欄)
- 🔴 **OQ-7(inference 側 PII)= F5 硬 gate**
- 🔴 **OQ-1 仍然未答** —— 唔再 block code,但 block F5

### Commits

- `b668f98` — `feat(agent): W46 F3+F4 —— seam ⑤ provider + OpenAI adapter + tracing 三重關`

---

## Day 3 — 2026-08-15(四條 gate 一次過解封 · A1 本機收 · ADR-0037)

### 開場個核對,推翻咗接手文件嘅前提

接手文件寫住「F5 之前有**兩條硬 gate**:OQ-1 同 OQ-7」。讀 plan 嘅時候對唔上:

- §2.1 **F10** 寫住「Test:LLM **一律 mock**」,而 **A6 / A7 / A8** 每條都明文講 mock LLM
- ⇒ **F5 / F6 / F9 嘅 code + test 結構上唔需要一個真 model**。OQ-1 真正 block 嘅係 **A14 live 驗**
- 而 **OQ-7 就真係 gate F5** —— 但唔係因為「要先決定可唔可以送」,係因為佢其中一個候選答案(**送之前先 scrub**)會**改 F5 嘅 code shape**

🔴 **兩條嘢喺 checklist 入面一直並排寫住「F5 之前(硬 gate)」,睇落一模一樣,但性質完全唔同**:一條係 config 值,一條係設計輸入。**分清楚之後,四條 gate 入面有三條當日就唔再係 gate。**

📌 呢個同 §9 記低過嗰句同族:**一個標籤(「硬 gate」)可以蓋住兩件唔同嘅嘢,而個標籤唔會話你聽。**

### Chris 四項拍板

| # | 決定 |
|---|---|
| **OQ-7** | **Azure OpenAI(公司 tenant)** —— 否決 ZDR / 公共 API 標準條款 / 先 scrub |
| **F1-6 + F1-7** | **兩個一齊做**:加 `startedById`、補 `requestId` FK |
| **OQ-1** | **押後到 F11 live 驗** |
| **A1** | **批准停 `ai-doc-extraction-db`** |

### 🟢 A1 本機側收咗(掛咗兩日)

三個 migration 對真 `uop-postgres` 由 `migrate deploy` 跑。**跑之前** `migrate status` = **22 / 24 applied,零 drift**。

🔴 **證據刻意唔用 `migrate deploy` 個 summary** —— 佢係一個 summary-level 綠燈,而 §9 記低過嗰族(「PR 顯示 MERGED ≠ commit 入齊」「revision Healthy ≠ DB 通」)講嘅就係佢證明唔到下面每一件。改為直接 query catalog:

- 五張 `Agent*` 表齊
- `AgentRun.startedById` = `NOT NULL`
- **三條 FK**:`principalId` → `AgentPrincipal` · `requestId` → `Request` (`SET NULL`) · `startedById` → `AppUser` (`RESTRICT`)
- `ConnectorConfig` 有 `agentModel` + `agentRuntime`
- `_prisma_migrations` 三條 `finished = t`

之後 api **1099 / 77 suites 全綠(零跌)** · tsc **0** · lint **0**。用完即時還原 `ai-doc-extraction-db`,並且**真 TCP 驗過佢攞返個 port**(§9 記低過「還原會靜靜失敗」)。

### 兩個 schema 決定,同一個理由

**`startedById` = required + FK + `ON DELETE RESTRICT`。**

nullable 睇落安全啲,但佢令「**攞唔返 scope**」變成一個到得到嘅狀態 —— 而**冇 scope 讀落就係全部 scope**。呢個正正係 ADR-0036 D0 想 keep out of the agent path 嗰個 fail-open 形狀。`RESTRICT` 再令 dangling row 結構上唔存在。

**`requestId` FK = `ON DELETE SET NULL`**,同 `OutboundFailure.requestId` 逐字同一形狀。個唔一致由「寫低咗」升級成「解決咗」。

⚠️ Prisma 出咗個 `not possible if the table is not empty` warning —— **成立但無害**:張表喺同一條 deploy 鏈上面前兩個 migration 先至建出嚟,零 row。DEV 側同理。

### 🔴 ADR-0037 —— 而佢改咗 OQ-1 個問題本身

寫之前**對已裝 package 實查**(ADR-0036 初稿就係因為假設咗 SDK 做唔到乜而要整份改寫):

| 事實 | 出處 |
|---|---|
| `setDefaultOpenAIClient(client)` 存在 ⇒ 換得走底層 client | `@openai/agents-openai/dist/defaults.d.ts:11` |
| `openai@7` 自己 ship `AzureOpenAI extends OpenAI` | `openai/azure.d.ts:34` |
| 🔴 設咗 `deployment` **會改寫 base URL**,而且 non-deployment endpoint 之後用唔到 | `openai/azure.d.ts:19-20` |
| 有 `azureADTokenProvider` ⇒ 用得 Entra,唔一定要 static key | `openai/azure.d.ts:54` |
| 🔴 SDK 有個 `DEFAULT_OPENAI_MODEL = "gpt-5.6-luna"` | `defaults.d.ts:3` |

**兩個後果值得單獨講:**

**① `agentModel` 語意變咗。** Azure 之下佢收嘅係 **deployment 名**唔係 model 名,而兩者可以完全唔同字。⇒ **OQ-1 由「揀邊個 model」變成「infra 開邊個 deployment、叫咩名」** —— 一個要**外部團隊做嘢**嘅問題。W46 由此有咗第一個外部依賴,而本項目 infra 依賴 **B1 / B4 / B7 / B8 / B9 五次每次都要等**。

**② 最容易誤讀嗰句,寫咗做 E5**:trace exporter 打嘅係 **OpenAI backend**,同你把 inference 指去邊個 endpoint **完全無關**。⇒「我哋轉咗去 Azure」**唔等於**「PII 唔會出去」。D11 三重關喺呢個 ADR 之後**唔係冇咁重要,係更加係唯一防線** —— 因為身邊多咗一句聽落好安心嘅話。**呢個係本 ADR 自己製造嘅風險(R18)。**

🔴 **ADR 寫成 `Proposed` 唔係 `Accepted`**:Chris 答嘅係「用邊個 provider」,而上面三個後果(E3 語意 / E4 auth 兩條路 / E5 tracing)**佢未見過**。批一個佢冇見過後果嘅決定,正正係本項目一路想避開嗰件事。

### ⚠️ 兩個 doc 從來冇記過嘅環境事實

1. **本 worktree 冇 `apps/api/.env`** —— `Test-Path` = `False`。主 worktree(`C:/ai-develop/unified-operation-platform`)先至有。**冇建佢**(§4.4 絕不 touch `.env*`);`docker-compose.yml` 本身就有本機 DB 憑證(`uop`/`uop`/`platform`,已 commit,唔係 secret)⇒ 根本唔使掂另一個 worktree。
2. **`git worktree list` = 兩個 worktree**,另一條 checkout 咗 `chore/web-lint-prettier`。⇒ **兩邊共用同一個 `uop-postgres`**,今日跑 migration 之後,嗰條 branch 會見到「DB 有佢 folder 入面冇嘅三個 migration」。冇害(migration 純加嘢),但**唔知就會當成 drift 事故**。

### Blockers / 未收

- 🚧 **A1 DEV 側未做** —— 卡「要唔要部署」。⚠️ DEV entrypoint 令 migrate 失敗 NON-FATAL ⇒ 部署後**唔可以睇 revision status**,要照今日咁 query catalog
- 🚧 **ADR-0037 待批**(唔 block F5,block 嘅係真接 Azure)—— ✅ **同日 Day 6 收工前 `Accepted`,`E4` 除外**
- 🚧 **OQ-1** —— 押後到 F11,但佢而家係一個 infra 問題
- 🚧 **R11–R19 未入 `RISK_REGISTER.md`**(R17–R19 由 ADR-0037 新增)
- 🚧 一個**既有** gap 未開單:`audit-fields.ts` 個 `ConnectorConfig` whitelist 漏欄

---

## Day 4 — 2026-08-15(F5 — `AI-Assist` run)

### 做咗

`AiAssistService.startRun()` + `toTranscript()` 純函數 + seam 新增一個 tool 觀察點。

api **1135 / 79 suites**(Day 3 後 1099 / 77,**零跌**,+36 條 +2 個 suite)· tsc **0** · lint **0**。

### 🔴 最重要嗰個結構決定:`AgentStep` 得兩個來源,兩個都唔係 agent 講嘅嘢

A7 要求「餵一個扮講自己做過嘢嘅 mock,assert 佢寫唔到任何 `AgentStep`」。要做到呢件事,首先要答一條 plan 冇答嘅問題:**tool 級嘅 step 究竟由邊度嚟?**

唯一誠實嘅來源係**平台自己嗰個 `execute` 真係跑咗**,而嗰個位喺 adapter 入面。所以 seam 加咗一個 `AgentSetup.onToolExecuted`:

- adapter 喺 `entry.execute()` **前後**報告(`ok` / `failed`),🔴 **`ok` 喺 resolve 之後先報** —— 「就快跑」同「跑咗」係兩件事,而 action ledger 只記後者
- 佢**被通知,唔做決定**:observer 自己 throw 會被 adapter 食咗。倒轉接就會變成「action ledger 有冇得寫」決定咗 agent 嘅行為 —— 一個住錯位置嘅決定
- ⇒ `AgentStep` 得兩個來源:平台生命週期事件(`start` / `proposal` / `run` failed)+ 呢個 observer。**冇任何一條由 transcript 推導。**

實測:mock 講「I have created the line items and assigned the licences」⇒ `AgentStep` 只有 `['start']`,句嘢落咗 `AgentMessage`,role `assistant`。

### 🔴 Falsification ×5 —— 而第二次揭到一條缺口,即刻補咗

| # | 拆走乜 | 結果 |
|---|---|---|
| a | awaiting 分支改寫 `completed` | **1 紅 / 19 綠** —— 紅嘅係 assert **DB 寫入**嗰條(返回值冇變)⇒ 證明條 test 唔係只驗返回值 |
| b | `toTranscript` 個 `scrubPii` | **8 紅** —— 全部喺 `transcript.spec.ts` |
| c | `onToolExecuted` 唔接線 | **2 紅** —— 兩條 tool 觀察 test |
| d | 非終態清單抌走 `approved` | **1 紅** |
| e | 加一句 `prisma.requestLineItem.create` | **2 紅** —— A5 runtime 半 + static 半,兩邊都捉到 |

🔴 **(b) 嗰次唔止係「紅咗」,佢揭咗一件事:`ai-assist.service.spec.ts` 一條都冇紅。**

即係「PII 入唔到 `AgentMessage`」呢個 claim,一路只喺**純函數嗰層**被 assert,喺 **service 嗰層係假設**。而 service 先係真正寫落 DB 嗰個。⇒ 呢個正正係本項目 §9 記低過嗰族:

> **每一層 test 都喺自己嗰層邊緣停低,而 bug 就住喺兩層之間**(`apiPatch` 個 `detail`、BUG-011 個 `IntegrationController.list()`)。

補咗一條 service 層 test(餵含 UPN 嘅 provider item → assert `agentMessage.createMany` 收到嘅 `content` 冇 email pattern),再拆多次同一行 ⇒ **1 紅 / 20 綠**,條縫真係守到。

📌 **值得記住嘅係方法唔係結論**:falsification 唔止告訴你「條 test 有冇用」,佢**同時**畫得出「邊層冇 test」—— 因為紅邊度就係覆蓋喺邊度。呢個用法之前四日冇用過。

### 兩個「plan 冇講、要自己揀」嘅位

**① `TranscriptRole` 多咗一個 `unknown`(plan §4 得五個)。**
SDK protocol 自己就有一個 `unknown` item type ⇒ 認唔到嘅 item 係一件**預期會發生**嘅事。兩個唔誠實嘅處理法:drop 咗(蝕 transcript)· 當成 `assistant`(等於話個 model 講咗一句冇人讀過嘅嘢)。記低「我認唔到」同 `skipped` 唔係 `ok` 嘅一種,係同一個分別。

**② `kindOf()` 認唔到嘅 write tool ⇒ throw,兼且把 run 標 `failed`。**
default 一個 `kind` 就係造一行**人會批但唔知自己批緊乜**嘅 proposal。而 `failed` 嗰半係後來先補:淨係 throw 會令 run 永遠停喺 `running`,而 `running` 對每個畫面同每個後續 guard 嚟講都讀成「仲做緊」。

### ⚠️ 一個 plan 字面上嘅偏離(F5-2)

plan 寫「**讀** `rawRequestText`」。實作**唔係**由 service 讀完餵畀 agent,而係 agent 自己經 `get_request` 讀 —— service 只 select 佢嚟驗「係咪空」。

咁做嘅兩個好處:scope 檢查**只有一條路**(tool 側 `assertOpcoScope`,唔會有第二個實作漂走)· service 唔使揸住段 PII。空原文喺開 run **之前**就拒絕,因為 AI-Assist 全部輸入就係嗰段字,空嘅話個 model call 唯一可能輸出係一個估。

### Blockers / 未收

- 🚧 **F6(proposal 審批 endpoint + resume)** —— F5 寫低咗 `AgentProposal` 同 `runState`,但**冇人撳得到**
- 🚧 F7 audit · F8 前端 · F9 boundary spec · F11 render + live
- 🚧 ADR-0037 待批 · OQ-1(deployment 名)· A1 DEV 側 · R11–R19 未入 RISK_REGISTER —— ⚠️ **ADR-0037 同日 Day 6 收工前 `Accepted`(`E4` 除外),呢行係 Day 4 當刻嘅狀態**

---

## Day 5 — 2026-08-15(F6 — proposal 審批 + resume)

### 起點係一個 H1

寫 F5 收尾嗰陣先睇清楚:**審批一個 proposal 要同時掂兩邊** —— 行返既有 line item 建立路(domain)同 `runtime.resume()`(agent)。而 ADR-0036 **D0 禁止 `agent` module import 任何 domain service**,F9 仲要用 boundary spec 鎖死佢。

⇒ 個審批 endpoint **結構上住唔到落 `agent`**,而佢住喺邊係 module 邊界決定(§5.1 H1 明文列咗)。停低問,**Chris 揀咗新開一個薄 module**。

`AgentApprovalModule` import `AgentModule` + `FulfilmentModule`。否決咗兩個:

| 放邊 | 點解唔得 |
|---|---|
| `agent` | 要 import domain service = **軟化 D0**,而 D0 係 ADR-0017 第五次應用,ADR-0036 明文「一個字都唔軟化」 |
| `fulfilment` | 方向合法(domain 識得 agent,agent 唔識 domain),但令「licence 履行」孭上「agent run 幾時 resume」呢個同佢無關嘅職責,而佢已經係最大嗰個 module |

🟢 **新 module 自己零 gate** —— 所有本來就有嘅檢查仍然喺 `RequestService.addLineItem` 入面跑。佢只做次序同翻譯。

### 🔴 兩個人,兩種權 —— 呢個係本日最重要嗰個分辨

- **批准人**(ADMIN / REGIONAL)= domain write 嘅 actor。佢負責件事發生。
- **開 run 嗰個人** = agent 嘅**讀** scope(`resumeRun` 由 `startedBy` 攞)。

撈埋一齊嘅後果好具體:批准人多數係 unscoped,所以用佢做 resume 嘅 scope,就等於**一個批准靜靜擴闊咗 agent 中途睇到嘅嘢**,而**冇任何嘢會報告** —— 每個 tool 都仍然喺度做佢被叫做嘅事。⇒ 呢個就係 `startedById` 要 required + FK 嘅實際兌現(F1-6)。

### 次序係契約唔係排版

`pre-resolve 全部 SKU → addLineItem × N → 標 executed → resume`。

**標記一定要喺 resume 之前**:`propose_line_items.execute` 搵唔到 `executed` proposal 就 throw(D2 第二層)⇒ 掉轉次序會令個 tool **拒絕啱啱做完嗰件事**。

**pre-resolve** 亦唔係整齊而已 —— proposal 可以隔夜先批,而 GUID 喺提議嗰刻驗過**唔夠**:SKU 中間可以變 inactive。

### 🔴 Falsification ×3,而第二個嘅錯誤訊息自己就係證據

| # | 拆走乜 | 結果 |
|---|---|---|
| a | 標 `executed` 搬去 resume 之後 | **1 紅 / 13 綠** |
| b | SKU 解析改成 lazy(喺 loop 入面逐個) | **1 紅** —— 而 jest 印出 **`Received number of calls: 1`** ⇒ **第一條 line item 真係會建咗**先至撞第二個 SKU。呢個唔係「條 test 紅咗」,係**條 test 直接演示咗佢防緊嗰個半截寫入** |
| c | 拆走「payload `requestId` 對唔對得上 run」 | **1 紅** |

### 🔴🔴 而全套跑嗰陣,W28 個權限矩陣 drift test 捉到我

`permissions.spec.ts` snapshot 紅,內容係:

```
+ "AgentApprovalController"
+ "POST /agent/proposals/:id/approve → roles [ADMIN,REGIONAL]"
+ "POST /agent/proposals/:id/reject  → roles [ADMIN,REGIONAL]"
```

三行全部**正確**(= OQ-2 拍板嗰個),所以係預期改動,加咗入清單 + 更新 snapshot(實測**淨係加 2 行**,零其他改動)。

📌 **但值得記住嘅唔係「要更新 snapshot」,係呢件事印證咗 ADR-0036 否決 Option A 嗰個理由。** 當時寫嘅係:agent 喺 process 內直接 call domain service **唔會出現喺 `permissions.ts` 個 derive 矩陣**,W28 drift test 睇唔到佢。⇒ **W46 第一個寫入面一出現,呢條 test 當日就捉到**,唔係靠 review。一個當時只係論據嘅嘢,今日變成實測。

### 未收

- 🚧 **F7 audit**(`agent.run_started` / `agent.proposal_decided`)· **F8 前端**(而家後端通晒但**冇畫面撳**)· **F11 render + live**

---

## Day 6 — 2026-08-15(F9 — boundary spec)

### 點解喺 F6 之後即刻做,而唔係排到最後

F6 加咗一個**合法**跨界 module。而一有咗合法跨界,**非法嗰個就變得易 argue**(「approval 都得,點解 agent 唔得?」)。⇒ 條線喺邊,要喺同一日寫成一個會紅嘅嘢,唔係留到期一收尾。

`agent.boundary.spec.ts`,14 條:

- **五個禁 import**(`fulfilment` / `license` / `opco` / `graph` / seam ②),每個帶**點解禁**,唔淨係「禁」
- **正半**:registry 仍然有 `PrismaService` + `assertOpcoScope` + `scrubPii`;module 仍然 import `IntegrationModule` ⇒ 條 test **唔會因為 agent module 被掏空而變綠**(W38 加「still talks to GraphService directly」就係為咗同一件事)
- **唯一合法跨界寫喺同一個檔**:`agent-approval` import 兩邊,而且**只准經 `requests.addLineItem`**,唔准自己打 `prisma.requestLineItem`

### 🔴 F9-2 —— A7 嘅結構版本

A7 證嘅係:**呢一個**講大話嘅 model 冇寫到 `AgentStep`。
F9-2 證嘅係:**codebase 入面冇第二個地方寫得到**。

分別喺於後者下個月有人加新 tool 嗰陣**仍然成立**。實作係掃全個 `src/`,assert:

| 表 | writer |
|---|---|
| `AgentStep` | `agent/ai-assist.service.ts` **一個** |
| `AgentMessage` | 同上 —— scrub 得一道門 |
| `AgentProposal` | 剛好兩個(service 建 pending · orchestrator 記人嘅決定),**兩個都唔係 tool** |

### ⚠️ 第一次跑,五個禁令全部各中一個 offender —— 而 offender 係佢自己

五個 needle 以**字串字面值**住喺條 spec 入面。⇒ **一條 source-scanning test 住喺自己嘅搜尋範圍入面。** 已排除 `.spec.ts` 並喺檔內寫低點解(claim 講嘅係**會 ship 嗰啲**)。

📌 呢個同 §9 記低過嗰句「一條 assert 睇落嚴唔嚴謹,同佢捉唔捉到嘢係兩件事」係同族嘅**反面**:今次條 assert 唔係太鬆,係**太準,準到捉埋自己**。兩種都要真跑先知。

### Falsification ×2 真紅零誤傷

①`tool-registry.ts` 加一個 `../fulfilment/` import ⇒ 1 紅 ②`agent-approval.service.ts` 加一句 `agentStep.create` ⇒ 1 紅。

api **1171 / 81**(F6 後 1157 / 80)· tsc 0 · lint 0。

### 收尾:ADR-0037 `Accepted`,但 `E4` 明文未答

Chris 問「**所以 OQ-7 要批什麼?**」—— 呢條問題本身就係 `Proposed` 起咗作用:佢已經答咗 OQ-7,所以**要批嘅唔係 OQ-7,係「呢份 ADR 連埋佢列出嘅後果就係決定」**。

拆返清楚之後,入面只有**一件真係未答**(`E4` auth 揀 Entra token 定 API key),其餘四條(E3 / E5 / E6 / E7)係**要佢睇過先算數**嘅後果。逐條過目之後,Chris **同日 Accept,並指明 `E4` 維持 deferred**。

🔴 **`E4` 同 `OQ-1` 合併做一個問題** —— 兩者都取決於「infra 點開個 Azure OpenAI resource」,分開問就會問兩次,而中間隔住嘅係本項目最貴嗰種等待(B1/B4/B7/B8/B9 五次先例)。⇒ **落一個 infra request,一次過要齊:resource · deployment 名 · E4 兩條路邊條做得到。**

📌 **形狀**:`Accepted` **唔等於「每一條都答咗」**。`plan.md §7` 為 OQ-1/OQ-5 標過同一件事(「approved as deferred」),而嗰格自己就寫住「一格寫住 approved 而下手當咗成格都答晒」係本項目撞過嘅事 —— 所以呢次喺 **ADR 頂部、index、plan、checklist 四個地方**都寫明 E4 未答,唔靠一個地方。
---

## Day 7 — 2026-08-16(F7 — audit)

### 做咗

兩條 action(`agent.run_started` / `agent.proposal_decided`)· 兩個 event-only target(`AgentRun` / `AgentProposal`,whitelist 都係 `[]`)· `actorType` union 加 `'agent'`。

api **1171 → 1184 / 81**(零跌)· tsc 0 · lint 0 · **falsification ×2 真紅零誤傷**。

### 🔴 查證到一個 ADR-0036 D7 冇講嘅約束

D7 要求 `AuditLog.actorType` 加一個 `'agent'`。做嘅時候先發現:

> **`AuditLog.actorId` 係 FK → `AppUser`**(`schema.prisma:440-441`)

⇒ 一行 `actorType: 'agent'` 嘅 row **講唔出係邊個 agent** —— `AgentPrincipal` 個 id 塞唔入去,只可以 `actorId: null`,同 `system` / `m2m` 一模一樣。**一個 principal 之下捱得住,兩個就係一個窿。**

而且今日**冇任何地方 emit `'agent'`**,呢個亦係啱嘅:Tier 1 之下每個被審計嘅事件背後都真係有個人(人開 run、人批 proposal),寫 `'agent'` 係**更唔準確**唔係更準確。

⇒ 兩件事都寫咗喺 `AuditEntryInput.actorType` 個 docblock,**唔寫喺 plan** —— 因為下手真係要用嗰陣,佢望住嘅係嗰行 code。

### 兩個 audit 位置刻意唔同,而個分別係規則唔係漂移

| | 位置 | 點解 |
|---|---|---|
| `agent.run_started` | **transaction 入面** | 前面冇任何不可逆嘅嘢(冇 model call、冇 line item)⇒ 一齊 rollback 零成本。ADR-0009 **D8.1**:「done but unrecorded」差過「not done」 |
| `agent.proposal_decided` | **transaction 外面,決定之後** | 嗰陣 line item **已經真係建咗** ⇒ 為咗一個 audit 打思噎而 rollback 個決定,會留低「line item 存在但 proposal 仲係 pending」,再批一次就建兩次。`outbound-retry.service.ts:398-401` 同一句 |

⇒ **同一條規則,喺兩個唔同前提下得出兩個答案**:睇 audit 之前有冇一件不可逆嘅事發生過。

### 🔴 Falsification ×2,而第二個先係重點

| # | 拆走乜 | 結果 |
|---|---|---|
| a | `AgentRun` whitelist 由 `[]` 改成 `['status','runState']` | **1 紅** |
| b | 把 `audit.log` 搬出 transaction 外 | **1 紅** |

**(b) 證明咗條 test 唔係 `toHaveBeenCalled()` 嗰種** —— 搬咗出去佢一樣會被 call,`expect(audit.log).toHaveBeenCalled()` 會照綠。條 test 用一個 flag 記住「被 call 嗰刻 transaction 開唔開住」,而嗰個 flag 就係佢同一條空 assert 嘅全部分別。

📌 同族:**A11 亦刻意唔寫 `expect(WHITELIST.AgentRun).toEqual([])`** —— 嗰種寫法只會同份檔自己講嘅嘢一致。改為餵一個**肥** row(含 transcript 同 model payload)入 `pickAuditFields`,驗佢真係乜都唔剩。

### ⚠️ F7 令 A5 講嘅嘢變咗,所以 A5 改咗講法

一個 run 而家會喺五張 `Agent*` 表以外寫**一行**:`agent.run_started`。呢個係 D5 明文要求嘅,但 **A5 原本嗰句「零改動」由嗰刻起就唔再係真** ⇒ 加咗一條 test 講**準確**嗰句:`Agent*` 以外**剛好一行,而且就係佢**。

（一條 assert 唔更新就會變成描述緊一個已經唔存在嘅系統 —— 同 §9 講「文件過時令下個 session 用錯前提」同族,只係呢次過時嘅係 test。）

---

---

## Day 8 — 2026-08-16(F8 — 前端)

### 開工先發現後端仲差一層

F5 / F6 做咗 service 同審批 endpoint,但 **`AgentModule` 一個 controller 都冇** —— 即係前端**根本冇嘢可以打**。補 `AgentRunController`:開 run / 攞最近一個 run / 攞一個 run / 中止。

**`@Roles(ADMIN, REGIONAL)`,同審批一樣。** plan / ADR 都冇指定邊個可以**開** run。理由寫低咗:一個 run 要錢兼且製造工作畀批准人;而 tool 本身喺任何闊度都安全(佢哋行**開 run 嗰個人**嘅 OpCo scope,一個 OPCO_IT 開嘅 run 結構上只睇到自己個 OpCo)⇒ **日後放寬係一行,收窄係 regression。**

### 🔴🔴 一個「短啲嗰個寫法」差啲開咗個窿

`getRun` 第一版用 `include` 攞 relation。`include` 會連**每個 scalar** 一齊回傳 —— 包括 **`runState`**。

而 `runState` 係 SDK 嘅序列化 state,**入面有 model 嘅對話歷史,逐字,未 scrub 過**。D6 scrub 嘅係「落 `AgentMessage` 嗰條路」,`runState` 係另一條路、為另一個目的(resume,R16)寫嘅。

⇒ **一個 `include` 就等於由 API 把平台小心遮住嗰份 transcript 嘅原本交返出去** —— 冇 error、冇 log、冇嘢會紅。

改用明文 `select`,理由寫喺 service 同 DTO 兩邊(DTO 個 header 寫住「任何令 `runState` 出現喺回應嘅改動,就係靜靜拆咗 D6」)。

📌 **形狀**:呢個同 §9 一路撞緊嗰族一樣 —— **預設值 / 最順手嗰個寫法本身就係唔安全,而且冇嘢會話你聽**。分別係今次係我自己嘅 `include`,唔係 vendor 嘅 default。

### 畫面點解係咁排

D4 要求 transcript 同 action ledger 唔可以撈埋。落到畫面就係三件事:

1. **steps 排喺前**,標題 `What ran` —— 佢係證據
2. **transcript 預設摺埋**,開咗之後第一句係「**唔係任何嘢發生過嘅證據**」
3. proposal 塊嘢**貼住 approve 掣**寫住 **`Approving runs the platform's normal checks — they can still refuse.`**(F8-3 / D3 嗰個反直覺後果)

🔴 **A7 嗰個 mock 直接搬咗上畫面做 test fixture**:transcript 入面擺一句 `I have created the line items already`,然後 assert **佢預設唔喺畫面上**。同一句嘢,F5 用嚟證「佢寫唔到 `AgentStep`」,F8 用嚟證「佢唔會喺人望落去第一眼就同證據並排」。

### Falsification ×2 真紅零誤傷

①transcript 預設改成打開 ⇒ 1 紅 ②拆走 F8-3 嗰句 ⇒ 1 紅。

### ⚠️ 5 個既有 test 檔要加 stub,而 stub 點寫有分別

新卡自己叫 `useAgentRun`,而 5 個 `request-detail.*.test.tsx` 都用明文 object mock `@/hooks/queries` ⇒ 全部即刻紅(45 條)。

加咗一個 stub mock,**渲染一個 marker 唔係 `() => null`** —— 因為:

- CH-030 F4 嗰條「Operational history 排喺 AI Assist 之前」嘅 DOM 次序 test **仲要驗得到**(佢原本靠 `getByText('AI Assist')`,而嗰個 anchor 隨住 placeholder 消失)⇒ **改 anchor,唔改 claim**
- **role gating 係 request-detail 嘅責任唔係卡嘅責任**,所以嗰三條 test(ADMIN/REGIONAL 見到、OPCO_IT 見唔到)要留喺嗰邊

🔴 而嗰條 OPCO_IT test 特登喺註釋寫死一句:**hidden card 唔係一個權限** —— server guard 先係真嗰個,呢度只係唔遞一個一定 403 嘅掣。唔咁寫,下一個改動好容易 ship 一個冇 `@Roles` 嘅 endpoint。

### DS 自檢(H6)

DS-1 ✅ · DS-2 ✅ · DS-3 ✅(**零新 primary**)· DS-5 ✅ · DS-6 ✅ · DS-7 ✅ · DS-8 ✅ · DS-9 ✅ · DS-10 ✅ · DS-11 N/A(prototype 冇 agent 卡,純組合既有 primitive)· DS-12 N/A。

🚧 **DS-4(light + dark 真 render)未做** —— 全部行 token 所以**結構上**應該 swap,但 §9 一路嘅規矩就係「未 render 過就唔可以講佢掂」⇒ 留喺 **A13 / F11-1**。

### 數字

web **377 → 392 passed**(+15)· **6 條紅 = 完全就係已知 pre-existing 嗰 6 條,零新增** · web tsc 0 · web lint 0
api **1184 / 81** 全綠零跌 · api tsc 0 · api lint 0
🔴 W28 權限矩陣 drift test **第二次**捉到新 controller(4 條 route,全部 `[ADMIN,REGIONAL]`),snapshot 實測只加 4 行。

---

## Day 9 — 2026-08-16(A13 / F11-1 — light + dark 真 render)

### 開工第一件事係確認工具,唔係寫 code

`SESSION_SUMMARY.md:119` 有一條硬規矩:**前端驗證睇你今次 session 有冇 browser tool,唔可以當佢一定喺度;真係冇就照寫「未 render 驗」,唔可以用「token 兩邊都有定義」冒充。**

本 session **冇**(兩次獨立確認:deferred tool 清單 + 兩次 `ToolSearch`)。而查返歷史,本項目由 CH-002 到 CH-030,**每一次** light+dark render 都係靠當日 session 啱啱有 Playwright MCP —— CH-016 驗到、**W43 驗唔到就照寫「未 render 驗」**。repo 入面**一個可以照跑嘅 render 腳本都冇**。

⇒ 停低問 Chris。**佢揀咗第三條路:`playwright` 落 `apps/web` devDependency。**

🔴 **點解呢個係方向改變唔係順手做嘅嘢**:W41 checklist 明文記住「repo 冇 playwright dep」—— 即係話**歷來每個 session 都刻意冇加**。H2 §5.2 寫住 dev dependency 屬例外可自行加,但「一個 acceptance criterion 應唔應該靠彩數」係 owner 嘅決定,唔係我嘅。

🟢 **`npx playwright install chromium` 真落載到**(191.8 MiB + 114.5 MiB)—— **公司 proxy 冇封 `cdn.playwright.dev`**。⚠️ **值得記住嘅係呢個結論同 RISK R1 相反**(Prisma engine CDN 被封)⇒ **唔可以由「R1 封咗」推論「其他 CDN 都封」**,呢個係 §9 一路撞緊嗰族(由一個相關但唔對位嘅觀察推去更強嘅結論)嘅預防針。

### 起 stack

Chris 批准停 `ai-doc-extraction-db` 借 5433。`uop-postgres` + `uop-redis` 起返,**真 TCP 驗**(5433 / 6379 都 `True`,唔睇 health flag)。`prisma migrate status` = **25 migrations,up to date**(F1-5 嗰次已經落咗)。

⚠️ **本 worktree 冇 `.env`**(佢住喺主 worktree)⇒ 造咗一個**本機 render 專用**嘅:DB URL 抄自 repo 自己 commit 咗嘅 `docker-compose.yml`,其餘 vendor 值**全部 placeholder**(Graph / SN / ACS / Entra / OpenAI 一律打唔通),`AUTH_DEV_BYPASS=true` 免得掂到 Chris 個 break-glass 密碼。**主 worktree 個 `.env` 由頭到尾冇讀過、冇抄過。**

🔴 **順帶撞到一個唔明顯嘅位**:`main.ts` 個 port default 係 **3000**,而 §9 講嘅 3100 一直係由 `.env` 嘅 `PORT` 嚟。新造個 `.env` 冇 `PORT` ⇒ api 起咗喺 3000,而 **vite proxy 寫死 target 3100** ⇒ 畫面會攞唔到數,但 api 本身 200。補返 `PORT=3100`。

### Fixture(純 INSERT,零現有 row 被改)

一個 `awaiting_approval` run,掛喺 W45 嗰張 local render fixture request 上。**三種 step status 齊**(ok / failed / skipped)· **六個 transcript role 齊 —— 連 `unknown` 嗰個**(佢係平台喺 SDK 畀個唔認得嘅 role 嗰陣自己鑄嘅,冇 fixture 會自然生出佢)· 一個 pending proposal 帶兩個 skuId。

📌 CH-030 嗰個教訓(改測試資料之前 SELECT 一次你將會寫嘅每個欄)今次唔使用 —— **因為一個欄都冇寫過落既有 row**。

### 🟢 順帶攞到 F8-0b 個真證據

打 `GET /agent/runs?requestId=…` → **200**,payload 入面 **`runState` 出現次數 = 0**。即係 Day 8 嗰個 `include` → `select` 修正**喺 wire 上真係守住咗**,唔淨係 code review 睇落啱。端到端(browser → vite proxy → api → DB)亦通。

### Render — 四個狀態 × 兩個 theme = 八張

①預設(proposal + steps + 摺埋嘅 transcript)②transcript 展開 ③reject 對話框 ④未開 run 嘅 empty state。

**結果**:

- **幾何兩個 theme 逐個相等**(728 / 1108 / 239 / 334 px)⇒ **零 layout drift**
- **兩個 theme 都零橫向溢出**(`scrollWidth === clientWidth === 1440`)
- **token 真 swap**:`--bg` `#f5f5f6`↔`#08080a` · `--card` `#ffffff`↔`#141417` · `--accent` `#E60027`↔`#ff3355` · **`--purple` `#6d28d9`↔`#a982f0`**(最後嗰個就係 DS-8 個 AI tone,而佢係本卡唯一新用嘅 semantic 色)
- 八張逐張肉眼睇過:step 三個 icon 各自帶啱色(綠 check / 紅 alert / 灰 minus)· skuId + 時間戳 mono · `WHAT RAN` / `TRANSCRIPT` / 六個 role label 全部 micro uppercase · D4 嗰句 caveat 喺展開之後第一行 · reject 掣係 `bg-danger-soft`+`text-danger`(**唔係** disabled —— disabled 係 `opacity-.55`,實測係 full opacity)

### 三個過程上嘅坑,兩個係我自己整出嚟

1. **git-bash 食咗個 URL path**:`--url /requests/…` 被 MSYS 轉成 `C:/Program Files/Git/requests/…`。改用 PowerShell 跑。
2. **`fullPage: true` 冇用** —— 頁面 main region 有自己嘅 scroll container,所以 document 本身唔滾,`fullPage` 永遠只得一個 viewport。⇒ 改**影卡本身**(`locator.screenshot()`)。順帶:element 高過 viewport 會影到一半黑,viewport 要開夠高。
3. **`networkidle` 唔等於 React Query 已 settle** —— empty state 嗰張第一次影到個 `Loading…`。改成 `waitForSelector('text=No run yet')`。**同族**:等一個「網絡靜咗」嘅信號,去斷定一個「UI 已經到位」嘅結論。

### 🔴 render 揭到一個潛在缺口(唔係今日嘅 bug)

我 fixture 起初作咗個 `propose_assign` 做 step key,而畫面**直接印咗個 raw snake_case key 出嚟**。

查證之後:**係我 fixture 錯,唔係 code 錯** —— 平台今日寫得出嘅 key 一共九個(`start`/`abort`/`run`/`proposal` + registry 五個 tool 名),而 `STEP_LABEL` **九個全部有**。fixture 改成真 key 就正常。

**但個缺口係真嘅**:`AgentStep.key` 型別係 `string`,`STEP_LABEL[step.key] ?? step.key` 冇任何嘢釘住兩者對應 ⇒ 邊日有人喺 `tool-registry.ts` 加個 tool 而冇掂 `ai-assist-card.tsx`,操作員畫面就出 raw key。

🔴 **而最值得記住嗰半係隔籬**:`MESSAGE_LABEL` 係 `Record<AgentMessage['role'], string>` ⇒ **TypeScript 幫佢守住,漏一個 role 就唔 compile**。兩個 map 喺 code 入面**上下相鄰、寫法睇落一模一樣**,一個有型別保護一個冇 —— 而分別唔係寫法,係**上游嗰個型別係 union 定係 `string`**。

**未修,已開項**(F11-1b):兩條修法(跨 package parity test / unknown key render 成一望而知係 unknown)都唔係順手做嘅嘢,要 Chris 揀。**Target = 期二 G1 之前** —— G1 就係加 `propose_assign`,即係第一個真會踩中佢嘅改動。

### DS 自檢(H6)—— 今次 12 條全部有答案

DS-1 ✅(8 個色 class 逐個對返 `tailwind.config.ts`,全部 CSS var alias,零 hex)· DS-2 ✅(px 值逐個查過係 house idiom:`text-[11.5px]` 119 處 / 31 檔、`gap-[7px]` 16 處…;唯一獨有嘅 `pl-[22px]` 而 22 本身喺 spacing scale 上)· DS-3 ✅ 零新 primary · **DS-4 ✅ 兩個都真 render** · DS-5 ✅ · DS-6 ✅ · DS-7 ✅ · DS-8 ✅ · DS-9 ✅ · DS-10 ✅ · **DS-11 ✅**(prototype 冇 agent 卡,但整張卡純由既有 primitive 砌:Card / Badge / Button / Dialog / Input / EmptyState)· DS-12 N/A。

### H4

八張截圖**只影卡本身**,而卡入面個 target 係 `[redacted]`(scrub 過)⇒ **零真 UPN**(`Select-String` 實測 0 命中)。中途影過嘅全頁截圖帶住真 UPN,**已刪**。`git status --untracked-files=all` 實測 repo 零剩餘 artifact。

### 數字

api **1184 / 81** 全綠零跌 · web **392 passed**,**6 條紅逐條核對過就係已知嗰兩個檔**(`reset-password` 1 + `local-profile` 5),零新增。

---

### 同日:草擬 infra request(`docs/13-deployment/11-azure-openai-infra-request.md`)

**格式唔係自己諗,係抄返 W44 附錄 C 個兩層分法**(`W44 plan.md:333`):上面內部記錄,下面一個 `📤` code block 放**真正發出去嗰段英文全文**。原文理由:

> infra team 唔需要嗰啲 —— 佢哋需要嘅係「**壞咗乜 + 要你做乜**」。刪走內部細節唔係簡化,係**移走會分散注意嘅嘢**。

五條問題:**`Q0`** 治理 · **`Q1`** auth(= `E4`)· **`Q2`** deployment(= `OQ-1`)· **`Q3`** abuse monitoring · **`Q4`** ACA outbound。

### 🔴🔴 草擬過程查到一個唔喺任何 W46 文件入面嘅障礙,而佢改變咗成件事嘅形狀

`05-rci-par-process.md:4` 寫住「**開資源前必經 PAR**」,而**同一份 PAR Section 1 `:54` 明文申報咗**:

> `AKS / Blob / **Azure OpenAI** / Event Grid | ✅ **暫無**(…AI 屬未來 tier)`

⇒ **開一個 Azure OpenAI resource,同我哋自己寫落治理文件嗰句直接相反**,而 PAR 簽核鏈(`:20`)包括 **Security Manager / GM CISO IT / CDO** —— 佢哋 endorse 嘅就係一個資料流向態勢,而本次改動加嘅正正就係一條新資料流。

加埋兩件事:**①嗰份 PAR 由頭到尾未提交**(Section 1 仍有 `🔲 待 Chris`)**②`09-dev-as-built.md:125` 一早寫低「DEV 環境要唔要走 PAR,要問」,由 08-04 到今日從來冇問過。**

📌 **而 `05:30` 自己嗰句填表原則,反方向一樣成立** —— 佢寫「填 private access 而實際 public,等於向治理機構描述咗一個唔存在嘅態勢」;**申報「Azure OpenAI 暫無」然後靜靜開一個,係同一個錯誤嘅鏡像。**

⇒ 所以本份**唔係一張 ticket,係一個要先揀路嘅嘢**。**冇列第三條「當一般資源請求發」** —— `W44 plan.md:309`:**留住一個死路選項唔係保留彈性,係引人揀錯。**

🟢 **Chris 同日揀咗 B(治理同技術同一封,`Q0` 第一條)。**

而 B 個賣點(「若要行 PAR,啲技術答案唔會白寫」)**唔可以齋講**,所以補咗一張逐格對照表落文件:

| 問題 | 填入 PAR Section 1 邊度 |
|---|---|
| `Q1` auth | User Access / Authentication |
| `Q2` model / deployment | **就係把 `05:54` 嗰行 `Azure OpenAI ✅ 暫無` 改成實際值** —— 即整件事嘅治理核心 |
| `Q3` abuse monitoring | Security requirements(`05:88`)—— 🔴 **Security Manager endorse 嘅就係呢格** |
| `Q4` outbound | Communication protocol 表加一行 `uop-api → Azure OpenAI · HTTPS · 443` |

⚠️ **最後嗰行值得記住,因為佢同 `05:64` 剛好相反** —— 嗰條 `uop-api → Key Vault` 被**劃走並註明唔好填**(連線根本唔存在,填咗會令防火牆開一條唔需要嘅通道);而呢條係**會真係存在所以一定要填**。**同一條原則兩個方向:PAR 上面嘅資料流表要同實況逐條對得上,多一條少一條都係向治理機構描述一個唔存在嘅態勢。**

### 🔴 第二個查證改咗請求點寫

`ADR-0028:35` 記低咗 **「Application ID URI」三輪往返都攞唔到** —— infra 分別答咗「web portal 網址」「OAuth authorization endpoint」「Application ID」,而 `W44 progress.md:605` 個結論係:**三次嘅解讀都合理,值得懷疑嘅唔係對方,係嗰條問題本身。**

**而 `deployment` 完全同一族** —— 對 infra 嚟講呢個字預設係 **ARM deployment**,唔係「model deployment」。⇒ 發出去嗰段字**自己先解釋個詞**(「唔係 ARM deployment、唔一定等於 model 名、開嗰個人自己揀」)兼要求**逐字 copy 唔好重打**,唔靠對方估。

同族嘅仲有 **Q2 問法**:問「**有咩開得到**」唔係「請開 X」—— 沿用 `W44 checklist.md:247`(「問係咩,唔係叫佢設定」),因為我哋證唔到邊個 model 喺公司 tenant 開得到。

### ⚠️ 一件我自己答唔到,所以寫成問題唔寫成結論

**`Q3`(abuse monitoring / prompt 保留)我係由記憶寫嘅,repo 入面冇任何嘢證實得到。**

但佢唔係可有可無 —— **`ADR-0037 E1` 成個論據就係「收件人變咗,同 Graph / M365 同一個信任面」,而呢句只喺冇第三方人手覆核嘅前提下成立。** 如果 Azure OpenAI 預設會保留 prompt 兼有人手覆核,咁個論據就要收窄(而 Graph / M365 唔會有人睇我哋啲資料)。

⇒ 寫成「請確認,唔好當我哋講得啱」。**唔可以因為 ADR 已經 `Accepted` 就當呢條唔使問** —— `09-dev-as-built.md:224`:**一個未實測嘅答覆,同一個未問嘅問題,喺風險上係同一樣嘢。**

### 順帶查實嘅四件環境事實(寫落請求,慳一個往返)

| 事實 | 點查 | 影響 |
|---|---|---|
| `aca-rapo-uop-api-dev` **今日冇 managed identity** | `aca-dev.json` grep `identity` = **0** | `Q1` Option A 要**先開**佢 |
| 我哋個 SP 喺 `RG-RAPO-UOP-DEV` **只有 Contributor** | `09-dev-as-built.md` · B4 史 | role assignment **無論如何都要 infra 做**(Contributor 冇 `roleAssignments/write`) |
| `openai-agents.provider.ts` **零 Azure 接線** | grep:只有 `resolveModel()` | `E2` 未寫,**係我哋嘅工作唔係 infra 嘅** |
| `aca-dev.json` **零個 `AGENT_*` / `OPENAI_*` env** | grep = **0** | 部署 template 要加,同上 |

## Day 10 — 2026-08-16(F10-1 + F10-2 — falsification sweep)

### Baseline

`--testPathPattern "src[\\/]agent"` = **7 suites / 138 tests** 全綠。⚠️ 順帶一個坑:第一次用 `"agent"` 做 pattern **match 咗成個 suite(81 個)** —— 因為 **repo 目錄本身就叫 `ai-agent`**,每條路徑都含 `agent`。

### 掃法

只掃**未做過 falsification 嗰批**(之前做咗嘅見 checklist `F10-2e`)。**四道閘,結果 2 綠 2 紅 —— 而兩個綠就係兩個洞。**

### 🔴🔴 洞 ① —— `getRun` 個 `runState` 排除,零測試覆蓋

把 `runState: true` 加返落 `select` ⇒ **142 條全綠**。

即係話 Day 8 嗰個「差啲開咗個窿」嘅修正,**由改完嗰刻起就冇任何嘢守住** —— A13 喺 wire 上驗過一次,但**一次 live 觀察唔係一道 regression 閘**。

⚠️ **而佢結構上唔可能靠 assert 回傳值捉到**:Prisma 係 mock,回傳咩由 test 自己講。⇒ **只有「服務傳咗咩 argument 畀 Prisma」先載得住呢個事實** —— **道閘就係 query shape 本身**。

新增 4 條 test。**兩次 falsification 證咗兩條 assert 唔係重複**:

| falsification | 紅嗰條 | |
|---|---|---|
| `runState: true` 加返落 `select` | `never selects runState` | 2 紅 140 綠 |
| `select` → `include` | `uses select rather than include` | 2 紅 140 綠 |

**兩次紅嘅係唔同一對。** 我喺 test 註釋寫咗「呢兩條唔係重複」,而家嗰句係證出嚟唔係聲稱。

### 🔴🔴 洞 ② —— SKU 存在性嘅兩條 test,一直靠錯嘅理由綠

拆走 `Unknown or inactive skuId` 個 throw ⇒ **142 全綠**。而條 test **明明就喺度**,名仲要叫 `refuses a GUID that is not in the catalogue (hallucinated id)`。

**點解**:再落兩道閘,`propose_line_items` 因為冇 approved proposal 而再拒絕一次,**而佢掟嘅係同一個 `BadRequestException`**;`agentProposal.findFirst` 又係一個裸 `jest.fn()` 返 `undefined` ⇒ **每個 case 都一路行到嗰度先掟**。

⇒ 兩條改成 assert **訊息**(hardcode,唔由被測 code 推導)**+** `agentProposal.findFirst` 冇被 call 過(即證佢喺**上一道**閘就停咗)。**單靠訊息唔夠 —— 兩道閘掉轉次序佢一樣綠。** 修完再 falsify:**2 紅 140 綠**。

📌 **格式檢查同存在性檢查係兩件事,而只有一件有守**:`F2-9②` 驗咗 GUID **格式**,但**幻覺出嚟嘅 GUID 格式完全合法** —— 真正攔住佢嘅係存在性,而嗰道正正就係冇守嗰道。

### ✅ 兩道證實有守

`kindOf()` 拆走 throw 改成一律返 `'line_items'` ⇒ **1 紅** · step detail 拆走 `scrubPii` ⇒ **2 紅**。兩次零誤傷。

### 📌 方法論 —— 第四次撞同一族,今次係最貴嗰個版本

`CLAUDE.md §9` 早就記低:**一條 assert 睇落嚴唔嚴謹,同佢捉唔捉到嘢,係兩件事;唯一分辨方法係拆走實作睇佢紅唔紅。**

洞 ② 就係佢本人 —— test 名啱、位置啱、assert 睇落合理,**而佢由頭到尾釘住緊另一道閘**。

⚠️ **可操作嘅一句**:`toBeInstanceOf(SomeException)` 喺一條**有多道閘、而每道都掟同一個 exception type** 嘅路徑上,基本上等於冇 assert 過。分辨方法只有兩個:**assert 訊息**,或者 **assert「下一道閘冇被行到」**。

### 數字

api **1184 → 1188 / 81**(零跌)· tsc 0 · lint 0。實作檔**全部還原乾淨** —— `git diff --stat` 只有兩個 spec 檔,**零 production code 改動**(falsification sweep 應有嘅收尾形狀)。**W46 falsification 累計 ×18,全部真紅零誤傷。**

### 🚧 sweep 刻意冇掃嗰兩道

`agent-run.controller.ts` / `agent-approval.controller.ts` **兩個都冇 spec 檔**。今次個 `runState` test 落咗喺 **service 層**(query shape 嘅正確位置),**但 controller ↔ DTO 嗰條縫仍然冇嘢守** —— 而 **BUG-011 個教訓逐字就係呢條縫**。已開項 `F10-2e`,target 期二 `G1` 之前。

---

### 同日補埋 F10-2e —— 兩個 controller spec

`agent-run.controller.spec.ts`(8 條)+ `agent-approval.controller.spec.ts`(4 條)。api **1188 → 1199 / 81 → 83**。

釘住三類**只有 controller 層見得到**嘅嘢:①`@Roles` 喺 class 上 = `[ADMIN, REGIONAL]`(W28 snapshot 話你知矩陣**變咗**,呢條話你知佢**應該係咩**)②參數點拆(`dto.requestId` 唔係成個 dto · **`approve(id, user)` 個 user 唔係 optional context —— 佢就係 `approvedById` 同 audit actor**)③argument 次序(`getRun(user, id)` 掉轉一樣 type-check,兩個都係 string)。

### 🔴🔴 而我第一版嗰條 query-key test 自己就係假嘅,俾 falsification 當場捉到

v1 寫 `controller.latest('req-1', user)` 然後 assert service 收到 `'req-1'`,**註釋仲寫住佢守住個 query key**。把 `@Query('requestId')` 改做 `@Query('request_id')` ⇒ **152 條全綠**。

**原因**:直接 call 個 method **完全繞過 Nest 嘅參數綁定** —— `@Query()` 個 key 係 runtime metadata,由頭到尾冇參與過 ⇒ **條 test 結構上睇唔到佢聲稱守住嗰件事**。

改成讀 `__routeArguments__` route metadata。同一個 falsification ⇒ **1 紅 152 綠**。

📌 **同一日第二次同一族**(F10-2b SKU 嗰個係第一次),而**兩次都係同一個形狀:註釋寫住佢守住乜,同佢實際釘住乜,係兩件事。** 上午嗰次係別人寫嘅 test,下午呢次係我自己啱啱寫嘅 —— **知道咗個模式,唔代表寫嗰刻唔會再中。**

### 🔴 順帶查證到一個容易讀反嘅事實

`AgentRunDto` header 寫住「`runState` 喺呢度每個 shape 都缺席,而**呢個係規矩唔係遺漏**」。講法啱,但 **DTO 喺呢個 app 係文件唔係過濾器**:全 `src/` **零個 `ClassSerializerInterceptor`**(實測 grep),`@ApiOkResponse` 只影響 OpenAPI 頁。

⇒ **controller 原封交返 service 嗰個 object**,⇒ **唯一嗰道閘就係 service 個 `select`**(F10-2a 釘住嗰個)。條 test 用 identity(`toBe`)釘住呢個 pass-through,**就係為咗唔畀人把 DTO 個註釋讀成第二道防線 —— 得一道。**

### 數字(收工)

api **1199 / 83** 全綠 · tsc 0 · lint 0(⚠️ 一個 prettier error 修咗先過)· **實作檔全部還原乾淨,零 production code 改動**。**W46 falsification 累計 ×21,全部真紅零誤傷。**

---

### 未收

- 🚧 **F11-1b**(`STEP_LABEL` 冇嘢釘住)—— target 期二 `G1` 之前,要 Chris 揀修法
- 🚧 **infra request 寫好晒,路已揀(B),但未發出** —— 發嗰步要 Chris 做
- 🚧 **F11-2 / A14** live 驗 —— 卡 **ADR-0037 `E4`**(auth)同 **OQ-1**(deployment 名),**同一個 infra request,未出**
- 🚧 **F10-2** falsification 收尾 · **F11-1b**(上面嗰個缺口,要 Chris 揀修法)
- 🚧 **A1 DEV 側** · **R11–R19 未入 `RISK_REGISTER`** · 一張要開嘅單(`audit-fields.ts` 個 `ConnectorConfig` whitelist 由 W39 起漏欄)
