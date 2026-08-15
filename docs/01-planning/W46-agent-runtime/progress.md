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
