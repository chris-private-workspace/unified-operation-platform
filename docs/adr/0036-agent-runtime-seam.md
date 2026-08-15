# ADR-0036: AI Agent Runtime —— 一份 tool 定義,兩個 runtime,harness 留喺平台

**Date**: 2026-08-15
**Status**: **Accepted**
**Approver**: Chris Lai(2026-08-15)

> 🚧 **呢份文件住喺 branch `docs/w46-agent-runtime`,未 merge 落 `main`** —— Chris 2026-08-15 明確要求:「一切未滿意我都認為不能夠 merge 到 main,因為這些都是會影響現有架構的內容」。
>
> **`Accepted` 講嘅係「決定內容批咗、W46 開得工」,唔係「呢條 branch 可以推向 `main`」。** 未得 Chris 再次明確同意之前:**唔開 PR、唔 merge**。
>
> 🔴 **一個由 `main` 開工嘅 session 唔會知道有 ADR-0036** —— `main` 上面嘅 `CLAUDE.md §0/§9` 同 `SESSION_SUMMARY.md` 仲寫住「ADR 到 **0035**」,而嗰兩份係**唯一會被無條件讀入每個新 session** 嘅文件(CLAUDE.md §14 自己記低咗呢個實犯)。⇒ **要開 W46 實作,branch 由呢條開,唔好由 `main` 開。**

> ⚠️ **本 ADR 喺 Accept 之前改寫過一次**。初稿把 OpenAI **Codex SDK** 當成 target,而 Codex SDK 係「Codex CLI 嘅 embedding API」——冇 custom tool、要 git repo、要 spawn subprocess ⇒ 初稿被逼揀 MCP 做**唯一**接縫。Chris 同日更正:target 係 **OpenAI Agents SDK**(`@openai/agents`),佢有 function tool / guardrail / human-in-the-loop / tracing。**呢個更正令 MCP 由「唯一出路」變成「唔需要」**,亦令 D3 由「另外執行」改成「原生 pause / resume」。初稿內容唔保留 —— 佢建基於一個錯嘅前提,留住只會誤導下手。

---

## Context

### 觸發

Chris 2026-08-15 要求把 AI agent 引入平台,並明確定咗四件事:

1. **Tier 1** —— agent 有 action 權,唔止「建議」(Tier 0)
2. **第一個落點 = `AI-Assist`** —— parse `Request.rawRequestText` 成結構化 licence 清單(`SYSTEM-SPEC-AND-SOW.md:950`,B 區「已設計,等 driver」)
3. **OpenAI Agents SDK 首選,但同時要支援 Claude Agent SDK**
4. **Agent 嘅思考 / 對話 / 操作記錄要可視化 + 可 audit;人要控制得到、human-in-the-loop 審核**

### 觸發嘅 hard constraint

- **§5.2 H2** —— 新 runtime dependency(`@openai/agents`),唔屬「pure utility / dev dep」例外
- **§5.1 H1** —— 新 Prisma model、新 module 邊界、新 actor 類型;agent 一旦有 action 權就直接掂 **ADR-0017 D0**
- **§5.4 H4** —— transcript 載 UPN / email,Chris 決定**永久保留**;而且 **SDK tracing 預設把資料送去第三方**(見 D11)
- **§5.3 H3** —— agent 係 LicenseOps 模組內嘅能力,唔係新模組(D8)

### 平台已有嘅嘢(呢個決定咗工作量)

本 ADR 唔係由零起一個 harness。過去 40 個 W/CH 已經砌咗 agent harness 需要嘅同一批 primitive,只係 actor 一直假設係人:

| Harness 需要 | 平台已有 | 位置 |
|---|---|---|
| 顯式決策點(唔准隱含) | 8 個 gate,**執行順序係契約唔係排版** | `assign-step.ts:48-57` |
| 每步做過乜嘅結構化紀錄 | `AssignStep{key,status,detail,retryable,whoFixes}` | `assign-step.ts:116-129` |
| 「未做」同「唔使做」唔准 collapse | `skipped` 明文**唔係** `ok` 嘅一種 | `assign-step.ts:82-91` |
| 人手 override 具名 + 留痕 | `budgetOverrideReason` → audit + timeline | `assign.service.ts:284-334` |
| 防洩漏靠結構唔靠自律 | audit **allow-list** + 第二道 `isNeverAudited` | `audit-fields.ts:169-329` |
| 唔信任外部文字 | `scrubPii()`(明文寫住「係網唔係保證」) | `scrub-pii.ts:19-29` |
| 架構邊界用 test 鎖死 | 靜態 source 檢查 + **正反兩面** assert | `license-ops.boundary.spec.ts:42-53` |
| 「配置咗」≠「真係跑緊」 | `SeamRuntimeRegistry` 記 boot 實際揀咗邊個 | `seam-runtime.registry.ts:27-50` |
| 失敗變成可見可修嘅事實 | `OutboundFailure`(stateful + `resolvedById`) | `schema.prisma:484-505` |
| 權限矩陣自動 derive 唔手寫 | `derivePermissions()` + drift test | `permissions.ts:84-149` |

⇒ **本 ADR 嘅工作係「把 actor 由人擴闊到 agent」,唔係「起一套新嘢」。**

### 四個查證過嘅外部事實(2026-08-15)

🟢 **① OpenAI Agents SDK 有 function tool,而且收 JSON Schema。**
npm package `@openai/agents`(repo `openai/openai-agents-js`)。三類 tool:**function**(你自己寫)· **hosted**(code interpreter / file search)· **MCP**。`tool()` helper 收 **JSON Schema**(唔係 Zod),支援 `strict` 同 `needsApproval`。

🟢 **② HITL 係原生嘅,而且係 pause / resume 唔係 fire-and-forget。**
`needsApproval` 可以係 `true` 或者一個收 tool 參數嘅 async function,**`FunctionTool` / `HostedTool` / `MCPServer` 三種都支援**。執行 tool 之前 SDK 評估佢;要批准嘅話 **agent run 暫停**,回一個帶 **pending interruptions** 嘅 `RunResult`;caller 逐個 approve / reject,然後**把改咗嘅 state 傳返 `run()`** 續跑。

🟢 **③ Guardrail 同 approval 係兩件唔同嘅嘢 —— 官方明文分開。**
Guardrail(input / output / tool 三種)**冇人介入**,做 binary allow / block;approval **停低成個 run 等人決定**。⇒ 兩者可以疊,但唔可以互相代替。

🔴 **④ Tracing 預設開,而且自動把資料送去 OpenAI backend。**
Trace 收 **LLM generations · tool calls · handoffs · guardrails**。關法有三:env `OPENAI_AGENTS_DISABLE_TRACING=1` · code `set_tracing_disabled(true)` · per-run `RunConfig.tracing_disabled`。**ZDR 組織用唔到 tracing。**

⚠️ 順帶:Claude Agent SDK 側有兩張未收 issue —— **#115「`allowedTools` does not restrict built-in tools (Edit, Write, Bash) — security issue for read-only agents」**、#172「`disallowedTools` 對 subagent child process 唔生效」。呢兩張係 **D9** 嘅直接理由。

### 一個必須先講清楚嘅認識論前提

「Agent 嘅思考同操作記錄要可 audit」呢句入面藏住兩種**性質完全唔同**嘅嘢,而溝埋一齊就係 harness 失效嘅開始。

`INC-001` 就係本項目自己嘅實證。佢個 root cause 寫得極準(`INC-001.md:38-40`):

> root cause = **生成慣性 autocomplete** …… 因為係生成層面嘅慣性,**軟提醒 / 寫 memory 本身壓唔住**;step 4→5 就係實證(啱啱親手寫完規則,下一個 tool 又犯)。

而實質損害嗰行(`:45`)更加係教科書:一個 `Edit` **被 fabricate 成 success 但從未 apply**。

⇒ **agent 講「我做咗 X」,結構上唔可以當證據。** 而 `INC-001` §5 嗰句「**刻意寫成可觀察行為(唔靠抽象戒條)**」翻譯落 production agent 就係一句話:

> **唔可以靠 prompt 約束 agent,一定要靠架構約束。閘門必須企喺 agent 之外,而唔係寫喺佢個 system prompt 入面。**

而呢句正正就係 **ADR-0017 D0 嘅同構**。

---

## Decision

### D0 —— Agent 係新一種 executor,唔係新一個 decision-maker

**ADR-0017 D0 第五次應用,一個字都唔軟化。** 所有 gate / ledger / audit / stage machine 留喺平台。Agent 可以**提議**同**觸發**,但每一個真實副作用都行返平台既有嗰條路 —— 包括 `assign` 嗰 8 道閘。

🔴 **呢條唔係「原則宣示」,佢有可驗證嘅後果**:`agent` module **唔准 import 任何 domain service**(見 D2 同 W46 F8 嘅 boundary spec)。

### D1 —— 接縫定喺 **`AgentToolRegistry`**:一份 tool 定義,兩個薄 adapter

新 **seam ⑤ `AgentRuntimeProvider`**。但 tool **唔係**每個 runtime 各寫一份 —— 只有一份:

```
                 ┌────────────────────────────────────┐
  平台 (NestJS)   │  AgentToolRegistry                 │  ← allow-list 喺呢度 (D2)
  ─────────────  │  一份 JSON Schema + 一份 impl       │
  既有 8 道 gate ←┤  read tools · propose tools        │
  AgentProposal ←┤  (§3 張表就係全部)                  │
                 └───────┬────────────────┬───────────┘
                         │ shape 轉換      │ shape 轉換
              OpenAiAgentsProvider   ClaudeToolRunnerProvider
              @openai/agents          @anthropic-ai/sdk
              tool({parameters,       betaTool({inputSchema,
                    needsApproval})          run})
              ── 首選 (Chris) ──       ── 對照實作 ──
```

**點解一份定義夠**:事實① —— `@openai/agents` 個 `tool()` 收 **JSON Schema**;而 Claude Tool Runner 個 `betaTool()`(`@anthropic-ai/sdk/helpers/beta/json-schema`)一樣收 **raw JSON Schema**。⇒ **兩邊嘅 tool 契約本來就係同一種嘢**,adapter 只做 shape 轉換,**零業務邏輯**。

⚠️ **初稿揀咗 MCP,而嗰個理由已經唔成立。** 初稿當時信 Codex SDK 冇 custom tool ⇒ MCP 係唯一畀佢見到 LicenseOps tool 嘅路。事實① 推翻咗個前提,而 MCP 嗰層要換返嘅嘢係:一層網絡 hop、一個新 dependency、一個新認證面(bearer token)。**冇咗嗰個理由,呢啲就係純成本** ⇒ 按 §1.2 揀簡單嗰個。

🟢 **MCP 唔係被否決,係被推遲。** 兩個 runtime 都食 MCP(事實①),所以將來要接**外部** agent(唔住喺我哋 process 入面嗰啲)嗰陣,`AgentToolRegistry` 加一個 MCP 出口就得 —— tool 定義一個字唔改。呢個亦係 `architecture.md:39`「OpenAPI contract 就係 n8n / AI 未來受控接入點」嘅自然延伸。

### D2 —— Allow-list 企喺 `AgentToolRegistry`(平台側),絕不依賴任何 SDK 嘅 permission 機制

🔴 **本 ADR 最重要嘅一條。**

平台**唔會**用任何 SDK 嘅 `allowedTools` / `disallowedTools` / `canUseTool` 做安全邊界。

**Registry 冇註冊嘅 tool,對 agent 嚟講結構上唔存在。**

> 「見唔到」比「叫佢唔好用」強一個數量級 —— 前者係架構,後者係 prompt。

呢招同 **ADR-0034 D1** 完全同構:嗰次係「平台自己問 Graph,唔畀 provider 話畀我聽」;今次係「平台自己決定有咩 tool,唔畀 SDK 話畀我聽」。**兩次都係 D0 嘅正確應用,唔係軟化。**

⚠️ SDK 側嘅 guardrail / `canUseTool` **可以行**,但只當**第二層防禦**,唔可以係唯一一層,**亦唔可以喺 test 入面被當成 gate**(W46 A3 就係鎖呢件事)。

### D3 —— Write tool 一律 `needsApproval`,而**批准嘅真相住喺平台**

事實② 畀咗一個比初稿更好嘅形狀:agent 唔使跑完再由平台另外執行,而係**停喺 tool 前面等人**,批准之後**同一個 run 續跑**,睇到結果繼續推理。

| 類 | 例 | `needsApproval` |
|---|---|---|
| **read** | `list_pending_requests` · `get_request` · `search_catalog` · `get_ledger` | `false` |
| **propose** | `propose_line_items` · `propose_assign` | 🔴 **一律 `true`** |

🔴 **`needsApproval` 用 SDK 嘅,但決定同記錄唔用 SDK 嘅**:

1. Agent 撞到 write tool → SDK 暫停,回 `RunResult` 帶 pending interruptions
2. **平台**把每個 interruption 寫成一條 **`AgentProposal`**(`status: pending`),`AgentRun.status → awaiting_approval`
3. 人喺平台 UI 撳 approve / reject —— **`approvedById` / `rejectedReason` 落平台 DB**,唔係落 SDK 嘅 state
4. 平台把 state 傳返 `run()` resume

**點解唔直接信 SDK 個 approval state**:佢係一個 in-memory / serialised object,冇 actor、冇時間、冇 audit、亦唔會出現喺任何 admin 畫面。而「邊個批准過乜」正正就係 Tier 1 存在嘅唯一理由。

🔴 **`needsApproval` 一律寫死 `true`,唔准用 async function 動態決定。** 事實② 話佢**可以**收一個 async function,但一個「有時要批有時唔使」嘅 write tool,就係一個冇人講得出邊種情況要批嘅 write tool。要細分就開兩個 tool。

🔴 **批准 ≠ 繞過閘。** Approve 咗嘅 `propose_assign` 行返 `AssignService.assignLineItem()` **8 道閘一道唔少**,可以照樣被 budget 擋住。呢個係**正確行為唔係缺陷** —— 批准嘅係「應唔應該做」,唔係「唔使檢查」。UI 要講得清楚(W46 F7)。

### D4 —— Transcript 同 Action ledger 係兩張表,權威等級唔同

```
AgentRun            一次執行(running | awaiting_approval | approved
 │                   | rejected | completed | failed | aborted)
 ├─ AgentStep[]     🟢 平台自己寫。同 AssignStep 同構:
 │                     {key, status, detail, retryable, whoFixes}
 ├─ AgentMessage[]  ⚠️ transcript(思考 / 對話 / tool 意圖)。
 │                     agent 講嘅嘢,權威等級低,明文標明
 └─ AgentProposal[] 要人撳嘅嘢。approvedById / rejectedReason
```

| | `AgentMessage`(transcript) | `AgentStep`(action ledger) |
|---|---|---|
| 邊個寫 | agent 講嘅 | **平台**喺 tool 真正執行前後自己寫 |
| 用嚟做乜 | 理解 / debug / 追責 / 改 prompt | **audit 真相** |
| 可唔可以信 | ❌ 一個敘述 | ✅ 一個事實 |

🔴 **`AgentStep` 刻意抄 `assign-step.ts` 嘅 shape**,包括 `skipped` 唔係 `ok` 嘅一種。呢個唔係為咗好睇 —— 前端 `AssignResultDialog` 已經證明過呢個 shape 讀得明,而 `ADR-0029:139` 明文寫住「steps 契約穩定 ⇒ 將來要 SSE 只換 transport」。

### D5 —— Transcript **唔可以**入 `AuditLog`

`AuditLog.metadata` 係 key-restricted(8 個 key),`before`/`after` 係 per-target field whitelist。`audit-fields.ts:14-15` 明文寫低點解:

> `metadata` is key-restricted for the same reason — left free-form it would become an escape hatch around the whitelist

Agent transcript 係**自由文本 + 不可預測結構 + 大量** ⇒ **佢結構上放唔入,而放得入就等於拆咗 ADR-0009 D5。**

⇒ transcript 住喺 `AgentMessage`。`AuditLog` 只收**兩條新 action**(`agent.run_started` / `agent.proposal_decided`),兩條都係 event-only(`before`/`after` 空,跟 `RequestLineItem` / `Request` 先例)。

### D6 —— 保留策略:**永久保留 + ADMIN-only**(Chris 2026-08-15 拍板)

- `AgentMessage` **永久保留**,唔設 retention
- 讀權限 **ADMIN only**,跟 `AuditLog` 先例(ADR-0009 P-B)
- 🔴 **落庫前一律過 `scrubPii()`** —— 永久保留令呢一步由「好習慣」升格成**唯一防線**

⚠️ **代價明文寫低**:`schema.prisma:433-434` 已經記低咗 `AuditLog` 冇 retention policy 呢筆債;`AgentMessage` 量大好多,佢會令呢筆債第一次真正變貴。**呢個係 Chris 知情之下嘅決定,唔係漏咗。**

### D7 —— Agent actor = 新 `AgentPrincipal` 表(Chris 2026-08-15 拍板)

**唔** reuse `AppUser` + `Role`。理由:`Role` 得三個值,畀 agent 任何一個都等於畀佢**嗰個 role 嘅全部權力**,而 `derivePermissions` 會繼續報告佢係一個正常用戶 —— 靜靜擴權嘅完美形狀。

- 新 `AgentPrincipal`(`id` / `name` / `runtime` / `active` / `createdAt`)
- `AuditLog.actorType` 由 `'user' | 'system' | 'm2m'` 加一個 `'agent'`
- `AgentRun.principalId` → `AgentPrincipal`
- 🔴 **`derivePermissions()` 要認得佢**,而 W28 個 drift test 要覆蓋 —— 否則平台會出現**唯一一條唔受權限矩陣管嘅寫入路徑,而個矩陣唔會話你聽**

### D8 —— Scope:LicenseOps 模組內,唔開新 tier

Agent 只做 `AI-Assist`(parse `rawRequestText` → 建議 SKU)同 `propose_assign`。**唔碰** offboarding / cost insights / D365 / 其他 support 工作流(§5.3 H3)。

### D9 —— Claude 側用 **Tool Runner**,唔用 Claude Agent SDK

Anthropic 官方把 agent 分四種做法,而 **Claude Agent SDK = 「Claude Code 打包成 library」**,佢 ship 內建 `Read`/`Write`/`Edit`/`Bash`/`Glob`/`Grep`/`WebSearch`。

對一個 LicenseOps business-process agent,呢批內建 tool **全部係負債唔係資產** —— 一個行得到 `Bash` 嘅 agent 住喺 NestJS process 入面,就係把 §5 全部 hard constraint 一次過繞開。加埋 **issue #115**(`allowedTools` 唔限制內建 `Edit`/`Write`/`Bash`),更加唔應該靠佢去關。

**Tool Runner**(`client.beta.messages.tool_runner` + `betaTool()`)先係啱嘅形狀:**零內建 tool、零 filesystem、零 sandbox**,淨係跑你自己註冊嗰批,而佢自己有 per-turn hook(approval gate / error interception / result modification / retry)。

📌 **咁「支援 Claude Agent SDK」呢個要求點滿足?** D1 令佢變成一個**加 provider 嘅動作**:`AgentToolRegistry` 一個字唔改,加一個 `ClaudeAgentSdkProvider` adapter 就得。**但佢會帶埋 #115 入嚟**,所以真係要加嘅時候,`disallowedTools` 唔可以係唯一防線 —— registry 仍然係。

### D10 —— Runtime 選型:`@openai/agents` 首選,兩個都行 in-process

Agents SDK 係一個**普通 npm library**,唔使 spawn subprocess、唔使 git repo(嗰啲係 Codex SDK 嘅形狀,唔係佢)⇒ **佢同 Claude Tool Runner 兩個都直接住喺 NestJS process 入面**,部署形狀同今日一樣,零新增基建。

`ConnectorConfig` 加一個 `agent` connector 記 runtime 選擇(跟 ADR-0013 Model C:**非機密欄落 DB,真 secret 只落 env**)。`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` **只落 env**,永遠唔入 DB / API / audit(H4)。

### D11 —— 🔴 **Tracing 一律關,而且用 test 鎖死**(H4)

事實④:`@openai/agents` **預設**把 trace 送去 OpenAI backend,內容包括 **tool calls** —— 而我哋個 `get_request` 回傳 target UPN。

⇒ **忘記關 = 靜靜把 PII 送畀第三方,冇錯誤訊息、冇 log、冇任何嘢會紅。** 呢個正正就係本項目一路撞緊嗰族缺陷(「預設值本身就係錯,而且冇嘢會話你聽」)。

三重關:

1. `OPENAI_AGENTS_DISABLE_TRACING=1` 落 env(`.env.example` 要有,兼註明點解)
2. Code 側明文 disable(唔靠 env 一個人)
3. 🔴 **Test 鎖死** —— assert provider 起身之後 tracing 係 disabled 嘅。**呢條 test 唔可以係 `toHaveProperty(key)` 嗰種**(§9 已經記低嗰個教訓:一條 assert 睇落嚴唔嚴謹,同佢捉唔捉到嘢係兩件事)

⚠️ 順帶:如果將來真係想要 trace,**唯一可接受嘅路係 self-hosted trace processor**,唔係「開返 OpenAI 嗰個但少送啲嘢」。

---

## Alternatives Considered

- **Option A —— In-process module,直接注入既有 service** — **rejected**。`permissions.ts:84` 個矩陣係由 controller 嘅 `@Roles` decorator derive。Agent 喺 process 內直接 call `AssignService` 就**唔會出現喺矩陣度**,W28 drift test 睇唔到佢,`/admin/permissions` 會繼續顯示一個唔完整嘅真相。同 BUG-011「新欄唔會自己流出去」同族,但後果嚴重好多。

- **Option B —— MCP 做接縫**(本 ADR 初稿) — **rejected**。初稿嘅理由(「Codex SDK 冇 custom tool」)建基於一個錯嘅 target。Agents SDK 有 function tool 兼收 JSON Schema,而 Claude Tool Runner 一樣收 JSON Schema ⇒ MCP 淨低嘅係一層網絡 hop、一個 dependency、一個 bearer-token 認證面。**保留做將來接外部 agent 嘅出口(D1),唔做今日嘅地基。**

- **Option C —— 每個 runtime 各寫一份 tool 定義** — **rejected**。兩份定義一定會漂,而 `ADR-0017 D2` 就係為咗防呢件事而寫。事實① 令佢完全冇必要(兩邊同一種 schema)。

- **Option D —— 靠 SDK 嘅 guardrail / `allowedTools` 做安全邊界** — **rejected**。事實③ 講明 guardrail 係 binary allow/block 冇人介入 —— 佢係好嘢,但係**第二層**。而 Claude Agent SDK #115 實證咗「SDK 講自己有 allow-list」同「allow-list 真係關到嘢」係兩件事。

- **Option E —— Agent 直接執行,唔經 approval** — **rejected**。呢個係 Tier 2,而 Tier 1 未有實測數據之前,「邊啲操作可以免審」冇任何證據支持(§5.3 H3)。

- **Option F —— 只揀一個 runtime** — **rejected**,Chris 明確要求兩個都支援得到。D1 令呢個要求嘅邊際成本近乎零。

- **Chosen** —— **`AgentToolRegistry` 做接縫 + `needsApproval` 做 HITL + harness 留喺平台側**。理由:佢**同時**滿足「兩個 runtime 都支援」、「用得返 SDK 原生嘅 pause/resume」同「唔依賴任何一個 runtime 嘅安全機制」,而呢三樣睇落本來係衝突嘅。

---

## Consequences

### Positive

- 🟢 **換 runtime 唔使動 tool 定義,亦唔使動 harness** —— 一份 JSON Schema,兩個薄 adapter
- 🟢 **`ADR-0017 D0` 唔使軟化,反而係佢嘅正確應用**(同 ADR-0034 一樣)
- 🟢 **HITL 用返 SDK 原生 pause/resume** ⇒ agent 睇到批准結果可以繼續推理,比「跑完再由平台另外執行」自然
- 🟢 **零新增部署基建**(D10)—— 兩個 runtime 都係普通 npm library,in-process
- 🟢 **兌現 `architecture.md:39`** 嗰句「呢個 OpenAPI contract 就係 n8n / AI 未來受控接入點」——registry 加個 MCP 出口就係佢嘅 agent-facing 面
- 🟢 `AgentStep` 抄 `AssignStep` ⇒ 前端 `AssignResultDialog` 嘅讀法直接搬得過去

### Negative

- 🔴 **`AgentMessage` 永久保留 + 載 PII** —— `AuditLog` 嗰筆 retention 債會第一次變貴(D6,知情決定)
- 🔴 **Tracing 係「預設不安全」** —— D11 三重關,但呢個仍然係一個要靠紀律維持嘅面(升級 SDK 之後尤其)
- 🔴 **新增 runtime dependency**(H2),而 agent SDK 呢個範疇仍然變得好快
- ⚠️ **批准咗嘅 proposal 仍然可能被 gate 擋** —— 正確但反直覺,UI 要講清楚(W46 F7)
- ⚠️ **`AgentRun` 係長時工作**,而平台今日冇 job queue(BullMQ 喺 locked stack 但零實作)⇒ W46 期二要還

### Neutral

- 本 ADR **唔改任何既有 gate 嘅行為**。ADR-0016 / 0025 / 0033 / 0034 一個字唔郁
- `reconcile.service.ts` 一個字唔郁
- MCP **唔係被否決,係被推遲**(D1)
- Tier 2(自主 agent、免審批)明文留返將來,要重開 ADR

### 殘留風險(進 RISK_REGISTER)

| ID | Risk |
|---|---|
| **R11** | `AgentMessage` 載 PII + 永久增長,而平台從來冇 retention policy |
| **R12** | Tool allow-list 蠶食 —— 「registry 加多一個 tool」冇 ADR 門檻就會慢慢變成全權 |
| **R13** | Agent proposal 被人 rubber-stamp(同 ADR-0016 R4「override 退化成日常」同族)⇒ **一定要有數字監測**先睇得到 |
| **R14** | 🔴 **SDK 升級令 tracing 靜靜開返** —— D11 嗰條 test 就係唯一會紅嘅嘢 |
| **R15** | LLM 幻覺出一個唔存在嘅 `skuId` ⇒ tool 側必須驗存在性(跟 ADR-0020 先例) |

---

## References

- `docs/01-planning/W46-agent-runtime/plan.md` —— 落地 phase
- **ADR-0017** —— seam 模式 + D0「只換執行器唔換決策者」(本 ADR 第五次應用);D2「normalised vocabulary 先係核心設計工作」
- **ADR-0034 / CH-029** —— 「平台自己查,唔畀 provider 決定」嘅同構先例(D2)
- **ADR-0029** —— `AssignStep` shape;A2 否決 SSE 嘅理由(W46 期二要還呢筆基建債)
- **ADR-0009** —— audit allow-list;D5 就係本 ADR 唔可以把 transcript 塞入 `AuditLog` 嘅原因
- **ADR-0013** —— `ConnectorConfig` Model C(D10 跟呢個先例,secret 只落 env)
- **ADR-0016** —— 具名 override + R4「override 退化成日常」(R13 同族)
- **ADR-0020** —— 「如果是自行填的,一定要驗證是否真實存在」(R15 同族)
- **INC-001** —— AI 腦補 tool 結果;D4 兩張表嘅分開由佢直接推導
- `SYSTEM-SPEC-AND-SOW.md:950` —— `AI-Assist` backlog 項
- `apps/api/prisma/schema.prisma:240` —— `rawRequestText`(入口,已存在)
- **外部(2026-08-15 查證)**:
  - [OpenAI Agents SDK — guide](https://developers.openai.com/api/docs/guides/agents) —— agent loop · guardrail · resumable approval · tracing · MCP
  - [Agents SDK — Tools](https://openai.github.io/openai-agents-js/guides/tools/) —— `@openai/agents` · `tool()` 收 JSON Schema · `needsApproval` · `strict`
  - [Agents SDK — Human-in-the-loop](https://openai.github.io/openai-agents-js/guides/human-in-the-loop/) —— pending interruptions · approve/reject · resume
  - [Guardrails and human review](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals) —— guardrail(無人介入)vs approval(停低等人)
  - [Agents SDK — Tracing](https://openai.github.io/openai-agents-python/tracing/) —— 🔴 預設送去 OpenAI backend · `OPENAI_AGENTS_DISABLE_TRACING`
  - [claude-agent-sdk-typescript#115](https://github.com/anthropics/claude-agent-sdk-typescript/issues/115) —— 🔴 `allowedTools` 唔限制內建 Edit/Write/Bash
  - [claude-agent-sdk-typescript#172](https://github.com/anthropics/claude-agent-sdk-typescript/issues/172) —— `disallowedTools` 對 subagent 唔生效
