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
- 🚧 **ADR-0037 待批**(唔 block F5,block 嘅係真接 Azure)
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
- 🚧 ADR-0037 待批 · OQ-1(deployment 名)· A1 DEV 側 · R11–R19 未入 RISK_REGISTER

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
- 🚧 ADR-0037 待批 · OQ-1(deployment 名,而佢而家係 infra 問題)· A1 DEV 側 · R11–R19 未入 `RISK_REGISTER`
