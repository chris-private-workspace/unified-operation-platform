# W46 — AI Agent Runtime(Tier 1)

**Status**: `approved`(2026-08-15;**ADR-0036 Accepted ⇒ 開得工**)
**Created**: 2026-08-15
**Owner**: Chris Lai
**Branch**: 🚧 未建 —— 🔴 由 **`docs/w46-agent-runtime`** 開 `feat/w46-agent-runtime`,**唔好由 `main` 開**(理由見下)
**決策 SSOT**: **ADR-0036**

> 🟢 **R1 gate 已過** —— ADR-0036 **Accepted**(Chris 2026-08-15),plan 同日 approved(§7 六條 OQ 一併批)⇒ **開得工**。
>
> 🚧 **但本 phase 嘅文件住喺 branch `docs/w46-agent-runtime`,未 merge 落 `main`** —— Chris 2026-08-15 明確要求:「一切未滿意我都認為不能夠 merge 到 main,因為這些都是會影響現有架構的內容」。**唔開 PR、唔 merge**,直到佢再次明確同意。
>
> 🔴 **⇒ base 要揀啱,呢個唔係細節**:由 `main` 開嘅 branch **冇 ADR-0036 亦冇本 plan**,而 `main` 上面嘅 `CLAUDE.md §0/§9` 同 `SESSION_SUMMARY.md` 仲寫住「ADR 到 **0035**」—— 而嗰兩份係**唯一會被無條件讀入每個新 session** 嘅文件(CLAUDE.md §14 自己記低過呢個實犯:文件過時 ⇒ 下個 session 用錯前提開始)。一個由 `main` 開工嘅 session **唔會知道本 phase 存在**。

---

## 1. Why

Chris 2026-08-15 要求把 AI agent 引入平台。四個定咗嘅前提(ADR-0036 Context):

1. **Tier 1** —— agent 有 action 權
2. **第一個落點 = `AI-Assist`** —— parse `Request.rawRequestText` → 建議 SKU 清單
3. **OpenAI Agents SDK(`@openai/agents`)首選,同時要支援 Claude Agent SDK**
4. **思考 / 對話 / 操作記錄要可視化 + 可 audit;human-in-the-loop**

平台今日嘅 `AI Assist` 係一張空卡:`request-detail.tsx:1004-1018`,`Badge tone="purple"` 寫 `Preview`,body 係 `EmptyState`「Coming soon」。CH-030 F4 啱啱先把佢由右欄頂移落 timeline 下面,因為**佢佔住位但入面冇嘢**。

---

## 2. Scope

### 2.1 In Scope —— 期一(harness 先行)

| # | 交付 | 觸發 |
|---|---|---|
| **F1** | `AgentPrincipal` / `AgentRun` / `AgentStep` / `AgentMessage` / `AgentProposal` 五個 model + migration | H1 |
| **F2** | `src/agent/tool-registry.ts` —— **一份 JSON Schema + 一份 impl**(§3 張表就係全部) | H1 |
| **F3** | `AgentRuntimeProvider` 抽象(seam ⑤,跟 `license-ops` factory 先例)+ **`OpenAiAgentsProvider`**(`@openai/agents`,首選) | H1 + H2 |
| **F4** | 🔴 **Tracing 三重關**(ADR-0036 D11)—— env + code + **test 鎖死** | **H4** |
| **F5** | `AI-Assist` run:讀 `rawRequestText` → `propose_line_items` → `needsApproval` 暫停 → `AgentProposal` | — |
| **F6** | Proposal 審批 endpoint(`POST /agent/proposals/:id/approve` / `/reject`,**ADMIN + REGIONAL**)+ 批准後 **resume run** | H1 |
| **F7** | Audit:`agent.run_started` / `agent.proposal_decided` 兩條 action(event-only)+ `actorType: 'agent'` | H4 |
| **F8** | 前端:`AI Assist` 卡由 EmptyState 換真嘢 + run 觀察畫面(step timeline + transcript + 中止掣)+ proposal 審核 UI | H6 |
| **F9** | 🔴 **Boundary spec** —— `agent` module 唔准 import 任何 domain service;`AgentStep` 一定由平台寫 | H5 |
| **F10** | Test:LLM **一律 mock**(跟 §3.4 Graph/SN 先例)+ falsification(每道閘拆走實作睇佢紅唔紅) | H5 |
| **F11** | H6 light + dark 真 render + live 驗 | H6 |

### 2.2 In Scope —— 期二(action 權 + 第二個 runtime)

| # | 交付 | 觸發 |
|---|---|---|
| **G1** | `propose_assign` tool + 批准後行返 `AssignService` 嗰 **8 道閘一道唔少** | H1 |
| **G2** | `derivePermissions()` 認得 `AgentPrincipal` + W28 drift test 覆蓋 | H1 |
| **G3** | Blast-radius limit(單 run 上限)+ kill switch(**要分「配置停咗」同「真係停咗」**,跟 `SeamRuntimeRegistry` 形狀) | H1 |
| **G4** | **`ClaudeToolRunnerProvider`**(`betaTool()` + `tool_runner`)—— 證明 D1 一份定義兩邊行得通 | H2 |
| **G5** | BullMQ 落地(agent run 係長時工作,而 `awaiting_approval` 可以掛好耐) | H2(已 locked) |
| **G6** | SSE transport —— 還 `ADR-0029 A2` 嗰筆基建債(nginx `proxy_buffering off` + ACA ingress) | H1 |
| **G7** | R13 監測:proposal 批准率 / 平均審核秒數(**冇數字就睇唔到 rubber-stamp**) | — |

### 2.3 Out of Scope(explicit)

- ❌ **Tier 2 —— 自主 agent、免審批** —— 未有 Tier 1 實測數據之前冇證據支持(§5.3 H3);要重開 ADR
- ❌ **`needsApproval` 用 async function 動態決定** —— ADR-0036 D3:一律寫死 `true`,要細分就開兩個 tool
- ❌ **MCP** —— ADR-0036 D1:**推遲唔係否決**。兩個 runtime 都食 MCP,將來接**外部** agent 先加一個出口
- ❌ **Claude Agent SDK provider** —— D9 揀咗 Tool Runner;Agent SDK 會帶埋 issue #115 入嚟,要加嘅時候 registry 仍然係唯一防線
- ❌ **改任何既有 gate 嘅行為** —— ADR-0016 / 0025 / 0033 / 0034 一個字唔郁。本 phase 只加**新** actor,唔動舊規則
- ❌ **`reconcile.service.ts`** —— 一個字唔郁
- ❌ **靠 SDK guardrail / `allowedTools` 做安全邊界** —— ADR-0036 D2;可以行做第二層,但**唔可以喺 test 入面被當成 gate**
- ❌ **Hosted tools**(code interpreter / file search)—— 唔喺 registry,唔註冊就唔存在
- ❌ **LicenseOps 以外嘅 agent 能力** —— offboarding / cost insights / D365(§5.3 H3)
- ❌ **`AgentMessage` retention policy** —— Chris 決定永久保留(D6)

---

## 3. Agent Tool 清單(ADR-0036 D1/D3 要求喺 plan 定死)

> 🔴 **呢張表就係 allow-list。** 唔喺表入面嘅 tool,對 agent 嚟講結構上唔存在。加一行 = 擴權 = 要 ADR(R12)。
> 🔴 **一份 JSON Schema**,`OpenAiAgentsProvider` 同 `ClaudeToolRunnerProvider` 兩個 adapter 只做 shape 轉換,**零業務邏輯**。

### 3.1 read tools(`needsApproval: false`)

| tool | 回傳 | scope |
|---|---|---|
| `list_pending_requests` | id / opco / stage / targetUpn **(scrubbed)** | 行返 `assertOpcoScope` |
| `get_request` | request + line items + `rawRequestText` | 同上 |
| `search_catalog` | active SKU(`skuId` GUID + `businessAlias` + `category`) | 全平台 |
| `get_ledger` | `allocatedQuantity` / `assignedQuantity` | 行返 OpCo scope |

### 3.2 propose tools(🔴 `needsApproval: true`,**零副作用**)

| tool | 暫停之後 | 批准之後 |
|---|---|---|
| `propose_line_items` | 平台寫 `AgentProposal{kind:'line_items'}` | 行返既有 line item 建立路徑 → resume run |
| `propose_assign`(期二) | 平台寫 `AgentProposal{kind:'assign'}` | 行返 `AssignService` **8 道閘** → resume run |

### 3.3 四個唔會有嘅 tool(明文寫低,防將來「順手加」)

| ❌ | 點解 |
|---|---|
| `assign_license` | 直接副作用,違反 D3。批准之後由**平台**call,唔係 agent |
| `update_ledger` | ledger 係對帳基線(ADR-0004 #5),agent 唔應該掂 |
| 任何 shell / file tool | 正正就係 Claude Agent SDK #115 漏底嗰批;registry 根本唔註冊 |
| hosted tools(code interpreter / file search) | 唔喺 registry ⇒ 唔存在。要用要開 ADR |

### 3.4 🔴 SKU 一律 `skuId` GUID

`search_catalog` 回 GUID,`propose_line_items` 收 GUID。**絕不准 agent 靠名揀 SKU**(§13 locked;`businessAlias` 存在嘅原因就係「唔可以信名」,DESIGN §93)。LLM 對「E5」呢種字串嘅幻覺率係已知風險,而 catalog 實測有**兩個** E5 變體(`SPE_E5` / `Microsoft_365_E5_(no_Teams)`,ADR-0020 記低)。

⇒ tool 側**必須驗存在性**,跟 ADR-0020 嗰句「如果是自行填的,一定要驗證是否真實存在」。

---

## 4. Schema 改動(H1)

```prisma
model AgentPrincipal {
  id        String   @id @default(cuid())
  name      String   @unique      // 'ai-assist'
  runtime   String                // 'openai-agents' | 'claude-tool-runner'
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  runs      AgentRun[]
}

model AgentRun {
  id          String   @id @default(cuid())
  principalId String
  principal   AgentPrincipal @relation(fields: [principalId], references: [id])
  // 🔄 2026-08-15 Chris 拍板加(F1-6)—— 本 §4 原稿冇。required + FK,
  // ON DELETE RESTRICT:tool 嘅 OpCo scope 來自呢個人,而一個隔夜先批准
  // 嘅 run 重開之後只可能由 row 攞返。nullable 會令「冇 scope」到得到,
  // 而冇 scope 讀落就係全部 scope(ADR-0036 D0 要擋嘅 fail-open 形狀)
  startedById String
  startedBy   AppUser        @relation(fields: [startedById], references: [id])
  requestId   String?        // AI-Assist 掛住一張 request
  // 🔄 2026-08-15 Chris 拍板加 FK(F1-7)—— 原稿刻意只寫 @@index。
  // ON DELETE SET NULL,同 OutboundFailure.requestId 逐字同一形狀
  request     Request?       @relation(fields: [requestId], references: [id])
  status      String         // running | awaiting_approval | approved
                             // | rejected | completed | failed | aborted
  // 🔴 SDK 嘅 resumable run state。存返係為咗 approve 之後 resume 得返
  // (ADR-0036 D3)。⚠️ 佢唔係 audit 真相 —— 真相喺 AgentStep / AgentProposal
  runState    Json?
  startedAt   DateTime @default(now())
  endedAt     DateTime?
  steps       AgentStep[]
  messages    AgentMessage[]
  proposals   AgentProposal[]
  @@index([status, startedAt])
  @@index([requestId])
}

// 🟢 平台自己寫 —— audit 真相。shape 刻意抄 assign-step.ts
model AgentStep {
  id        String   @id @default(cuid())
  runId     String
  run       AgentRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  key       String   // tool 名 / 'gate' / 'proposal'
  status    String   // ok | failed | skipped   ← skipped 唔係 ok 嘅一種
  detail    String?  // 一律過 scrubPii
  retryable Boolean?
  whoFixes  String?
  createdAt DateTime @default(now())
  @@index([runId, createdAt])
}

// ⚠️ agent 講嘅嘢 —— 權威等級低,唔可以當證據(ADR-0036 D4 / INC-001)
model AgentMessage {
  id        String   @id @default(cuid())
  runId     String
  run       AgentRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  role      String   // user | assistant | thinking | tool_call | tool_result
  content   String   // 🔴 落庫前一律 scrubPii(D6:永久保留令佢變成唯一防線)
  createdAt DateTime @default(now())
  @@index([runId, createdAt])
}

model AgentProposal {
  id             String   @id @default(cuid())
  runId          String
  run            AgentRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  kind           String   // 'line_items' | 'assign'
  // SDK 側嘅 interruption id —— resume 嗰陣要逐個對返(ADR-0036 D3 步驟 4)
  interruptionRef String?
  payload        Json     // 提議內容(GUID only,見 §3.4)
  status         String   @default("pending") // pending | approved | rejected | executed | failed
  approvedById   String?
  rejectedReason String?
  decidedAt      DateTime?
  createdAt      DateTime @default(now())
  @@index([status, createdAt])
}
```

**`AuditLog` 改動**:`actorType` 加 `'agent'`(String 欄,零 migration)+ `audit-fields.ts` 加兩條 action、一個 `AgentRun` target(**`before`/`after` 空**,跟 `RequestLineItem` / `Request` event-only 先例)。

---

## 5. Acceptance

### 期一

- [ ] **A1** 五個 model migration 對真 DB 跑得過(本機 + DEV 各一次)
- [ ] **A2** 🔴 **Boundary spec 綠**:`agent` module 唔 import 任何 domain service;正反兩面 assert(跟 `license-ops.boundary.spec.ts:42-53` 形狀)
- [ ] **A3** 🔴 **Allow-list 鎖死**:assert registry 暴露嘅 tool **逐字等於** §3 張表。多一個少一個都要紅
- [ ] **A4** 🔴 **Tracing 真係關咗**(ADR-0036 D11 / H4)—— assert provider 起身之後 tracing disabled。**唔准用 `toHaveProperty(key)` 嗰種 assert**(§9 教訓:一條 assert 睇落嚴唔嚴謹,同佢捉唔捉到嘢係兩件事);拆走 disable 嗰行要**真紅**
- [ ] **A5** 🔴 **零副作用證明**:跑一個完整 `AI-Assist` run,assert **DB 除咗 `Agent*` 五張表之外零改動**(`RequestLineItem` / `OpcoSkuLedger` count 不變)
- [ ] **A6** 🔴 **`needsApproval` 真係停到**:mock LLM 直接 call `propose_line_items`,assert run **停喺 `awaiting_approval`** 兼且 `AgentProposal` 有 row —— 而**唔係**跑埋落去
- [ ] **A7** 🔴 **`AgentStep` 由平台寫** —— 餵一個「扮講自己做過嘢」嘅 mock LLM response,assert **佢寫唔到任何 `AgentStep`**(INC-001 直接對應)
- [ ] **A8** 🔴 **transcript 零 PII** —— 餵一個含 UPN 嘅 tool result,assert `AgentMessage.content` 冇 email pattern(BUG-004 形狀,test 先行)
- [ ] **A9** 🔴 **`propose_line_items` 只收 GUID** —— 餵一個靠名嘅 payload,assert 400 而唔係猜;餵一個唔存在嘅 GUID,assert 400(§3.4 / R15)
- [ ] **A10** Proposal 審批:approve → 真建 line item **兼且 run resume 到 `completed`**;reject → 零改動 + `rejectedReason` 有值
- [ ] **A11** Audit 兩條 action 出現,而且 `before`/`after` **係空**(H4)
- [ ] **A12** `npm run lint` exit 0 · api + web tsc 0 · 既有 test 一條唔跌
- [ ] **A13** 🔴 **H6 真 render(light + dark)**,跑 `ui-design` skill
- [ ] **A14** live 驗:真開一個 `AI-Assist` run,睇到 step timeline + transcript + proposal + 批准後 resume

### 期二

- [ ] **B1** 🔴 `propose_assign` 批准之後 **8 道閘一道唔少** —— assert 一個 budget 唔夠嘅 proposal **批准咗之後仍然被擋**(ADR-0036 D3 嗰個反直覺後果)
- [ ] **B2** `derivePermissions()` 認得 agent principal;W28 drift test 覆蓋
- [ ] **B3** 🔴 **`ClaudeToolRunnerProvider` 用同一份 registry** —— assert 兩個 provider 對同一個 tool 呼叫產生**同一個 `AgentStep`**(D1 嘅可驗證形式;同 `license-ops.contract.spec.ts` 同族)
- [ ] **B4** Blast-radius limit 生效(單 run 超額即停)+ 有 `AgentStep` 記低
- [ ] **B5** Kill switch:**分得出「配置停咗」同「真係停咗」**(`SeamRuntimeRegistry` 形狀)
- [ ] **B6** SSE 喺 DEV 真通(nginx + ACA ingress 兩層都過)—— 還 ADR-0029 A2 嗰筆債
- [ ] **B7** R13 監測數字睇得到

---

## 6. Risks

| ID | Risk | 對策 |
|---|---|---|
| **R11** | `AgentMessage` 載 PII + 永久增長 | `scrubPii` 落庫前;ADMIN-only;**知情決定**(D6) |
| **R12** | Tool allow-list 蠶食 | §3 張表 = ADR 級;A3 用 test 鎖死 |
| **R13** | Proposal 被 rubber-stamp | G7 數字監測(同 ADR-0016 R4 同族) |
| **R14** | 🔴 **SDK 升級令 tracing 靜靜開返** | A4 嗰條 test 係唯一會紅嘅嘢 ⇒ **升 `@openai/agents` 之後一定要跑** |
| **R15** | LLM 幻覺出一個唔存在嘅 `skuId` | A9:tool 側驗存在性(跟 ADR-0020 先例) |
| **R16** | 🆕 `AgentRun.runState` 存住 SDK 內部結構 ⇒ **SDK 升級可能令舊 run resume 唔返** | `awaiting_approval` 嘅 run 加 SDK 版本標記;resume 唔到就 fail loud 唔好靜靜當成功 |

---

## 7. Open Questions —— **七條全部有結論;淨低 OQ-1 一條真正未答(2026-08-15)**

> ⚠️ **「approved」對每條嘅意思唔一樣,呢個分別要記住。** OQ-2/3/4/6 嘅 default 係一個**答案**,批咗即係定咗;**OQ-1 同 OQ-5 嘅 default 係「暫時唔答」**,批咗即係確認「維持 deferred 到指定時點」—— **唔可以當成已經答咗**。呢個正正就係 §9 記低過嗰個形狀:一格寫住「approved」而下手當咗成格都答晒。

| # | 問題 | 決定 | 狀態 |
|---|---|---|---|
| **OQ-1** | Agent 用邊個 model? | 🔄 **2026-08-15 更新兩處**。①**target 由「F5 之前」改成「F11 之前」**(Chris 批)—— 因為 §2.1 F10 同 A6/A7/A8 都明文寫住 **LLM 一律 mock** ⇒ F5 / F6 / F9 嘅 code + test **結構上唔需要一個真 model**,佢真正 block 嘅係 **A14 live 驗**。②🔴 **問題本身變咗**(ADR-0037 E3):Azure 之下 `agentModel` 收嘅係 **deployment 名**唔係 model 名 ⇒ 由「揀邊個 model」變成「**infra 喺公司個 Azure OpenAI resource 開邊個 deployment、叫咩名**」—— 而後者係一個要**外部團隊做嘢**嘅問題,唔係一個揀嘅問題 | 🟡 **approved as deferred to F11** —— 🔴 **開 A14 之前一定要答** |
| **OQ-2** | Proposal 審批權:ADMIN only 定 ADMIN + REGIONAL? | **ADMIN + REGIONAL** —— 跟 `OutboundFailure` 先例(ADR-0011 D4):同一批人本來就睇緊呢啲 request | 🟢 **定咗** |
| **OQ-3** | 一張 request 可唔可以有多過一個 open run? | **唔可以** —— 同時只准一個非終態 run(避免兩個 proposal 對住同一張單打架) | 🟢 **定咗** |
| **OQ-4** | Agent 讀唔讀得到 `AuditLog`? | **讀唔到** —— 唔喺 §3 allow-list;audit 係 ADMIN-only 兼載 PII(ADR-0009 P-B) | 🟢 **定咗** |
| **OQ-5** | `awaiting_approval` 掛幾耐算過期? | **維持 deferred** 到期二連 BullMQ 一齊決定;🔴 **但過期一定要 fail loud,唔可以靜靜當成功**(R16) | 🟡 **approved as deferred** —— 🔴 **開 G5 之前一定要答** |
| **OQ-6** | 用唔用 SDK 嘅 guardrail 做第二層? | **用得,但唔可以入 acceptance gate**(ADR-0036 D2)—— 期二再評估要唔要真行 | 🟢 **定咗** |
| **OQ-7** 🆕 | 🔴 **`rawRequestText` / `targetUpn` 送去第三方 model provider 做 inference,可唔可以?** | 🟢 **答咗(Chris 2026-08-15):行公司 tenant 嘅 **Azure OpenAI**,唔准打 `api.openai.com`** ⇒ 寫成 **ADR-0037**(同日 `Accepted`)。論據係「**收件人變咗**」唔係「內容變少咗」—— 原文仍然原文,但只喺公司同 Microsoft 之間,同平台今日打緊嘅 Graph / M365 / Entra 同一個信任面。否決:ZDR(代價其實係零,但多一個第三方兼要等審批)· 公共 API 標準條款 · **送之前先 scrub**(唯一會改 F5 code shape 嗰個 —— 等於用「功能唔 work」換「冇 PII」)· 只送摘要(個摘要 call 一樣要收原文) | 🟢 **定咗** —— **ADR-0037 同日 `Accepted`**(五條後果逐條過目之後)。⚠️ 兩件唔可以當答咗:①**`E4`(auth 揀 Entra token 定 API key)= approved as DEFERRED**,target = infra 確認 Azure OpenAI resource 之後同 **OQ-1** 一齊答 ②**期二 G4(Claude Tool Runner)要重新答一次同一條問題**,唔可以引用本答案(E7) |

### 🔴 OQ-7 —— F2 寫 `get_request` 嗰陣揭出嚟,ADR-0036 從來冇決定過

ADR-0036 對 PII 有三道防線,而**三道全部係關於「落庫」同「送去 trace backend」**:

| 防線 | 擋住乜 |
|---|---|
| **D6** `scrubPii` | transcript **落 `AgentMessage`** 之前 |
| **D11** tracing 三重關 | tool call **送去 OpenAI trace backend** |
| **D5** 唔入 `AuditLog` | transcript **入審計表** |

**冇一道係關於 inference 本身。** 而 `AI-Assist` 嘅工作**就係**把 `rawRequestText`(一段真人寫嘅 email 原文)送去一個第三方 model provider ——
scrub 咗佢就係交白卷,所以 `get_request` **必須**原文回傳(F2 已經咁做,兼喺 code 註釋標明)。

📌 **值得記住嘅形狀**:D11 防到嘅係「順手開住嗰個 tracing」,防唔到「**呢個功能正常運作嗰陣本身做嘅嘢**」。
一個 opt-in 嘅洩漏面比一個 default-on 嘅**更難見到**,因為佢冇一個 default 可以罵 —— 佢就係設計本身。

**要答嘅係邊幾樣**(唔係「可唔可以」一句):
1. Provider 側嘅資料處理承諾(retention / 訓練用途 / 地區)夠唔夠?
2. 要唔要 **ZDR**(zero data retention)?⚠️ ADR-0036 事實④ 已經記低:**ZDR 組織用唔到 tracing** —— 兩件事互相牽扯
3. 送之前要唔要先 scrub 一次,接受「agent 見到嘅係 `[redacted-email]`」?(可行,但要驗佢仲 parse 唔 parse 得到)
4. 要唔要限定只送**摘要**而唔送原文?(=多一個 LLM call,而嗰個 call 本身一樣要送原文)
5. 呢個決定要唔要一份新 ADR,定係補做 ADR-0036 嘅 **superseding** ADR?(§6:`Accepted` 唔改內容)

📌 **OQ-2/3/4 有一個共同後果**:三者都要變成**可驗證嘅嘢**,唔係口頭約定 ——
- **OQ-2** → `@Roles(Role.ADMIN, Role.REGIONAL)` 落審批 endpoint,兼且要出現喺 `derivePermissions` 矩陣(期二 **G2**)
- **OQ-3** → service 層 guard + test(⚠️ 唔好只靠 DB unique constraint —— 「非終態」係一個**狀態集合**唔係單一值,partial index 喺 Prisma 側表達唔到)
- **OQ-4** → **A3 嗰條 allow-list test 本來就會擋住**,唔使另外寫嘢

⇒ **`AuditLog` 讀唔到呢件事,係由「registry 冇註冊」保證,唔係由「我哋記住唔好加」保證** —— 呢個就係 ADR-0036 D2 想要嘅性質。

---

## 8. 工作量估算

| 期 | 內容 | 估 |
|---|---|---|
| 期一 | F1–F11(harness + registry + OpenAI provider + AI-Assist + UI + test) | **≈ 9–11 日** |
| 期二 | G1–G7(action 權 + 第二個 provider + BullMQ + SSE) | **≈ 12–14 日** |
| | **合計** | **≈ 21–25 日**(唔計 ADR 審批來回) |

⚠️ **期二有兩筆基建債**(BullMQ 零實作 · SSE 被 ADR-0029 A2 暫時否決)⇒ **期二嘅估算信心低過期一。**

📉 **比初稿(26 日)少咗** —— 因為 MCP 嗰層冇咗(D1),而 `@openai/agents` 係普通 npm library、唔使 subprocess 或者 git repo(D10)⇒ 零新增部署基建。

---

## 9. Changelog

| 日期 | 改動 |
|---|---|
| 2026-08-15 | 建 plan(`draft`);ADR-0036 同日 Proposed。**Chris 五項拍板**:Tier 1 · `AI-Assist` 做第一個落點 · OpenAI SDK 首選兼要支援 Claude · 開新 `AgentPrincipal` 表 · transcript 永久保留 + ADMIN 可讀 |
| 2026-08-15 | 🔴 **改寫** —— 初稿把 target 當成 **Codex SDK**(coding agent,冇 custom tool)⇒ 被逼揀 MCP 做唯一接縫。Chris 更正 target 係 **OpenAI Agents SDK**。三處實質改動:**① 接縫由 MCP 改成 `AgentToolRegistry`**(兩邊都食 JSON Schema)· **② HITL 改用原生 `needsApproval` pause/resume**(唔再係「跑完再另外執行」)· **③ 新增 F4 tracing 三重關**(SDK 預設把 tool call 送去 OpenAI backend = H4)。工作量由 26 日跌到 21–25 日 |
| 2026-08-15 | 🟢🟢 **ADR-0036 `Accepted`(Chris)· plan `approved` · §7 六條 OQ 一併批** ⇒ **R1 gate 過,開得工**。⚠️ 同一刻 Chris 要求**呢條 doc branch 唔准 merge 落 `main`**(「一切未滿意我都認為不能夠 merge 到 main,因為這些都是會影響現有架構的內容」)⇒ 兩份文件頂加 banner;**實作 branch 由 `docs/w46-agent-runtime` 開,唔好由 `main` 開**。🔴 **一個知道咗但刻意冇修嘅缺口**:`main` 上面嘅 `CLAUDE.md §0/§9` + `SESSION_SUMMARY.md` 仍然寫住「ADR 到 **0035**」,而嗰兩份係每個 session **無條件讀入**嘅 ⇒ **由 `main` 開工嘅 session 唔知道本 phase 存在**。冇改係因為改咗都唔會到 `main`(branch 唔 merge),⇒ **呢個缺口要靠人記住,直到 branch merge 嗰日**。📌 OQ-1(model 選型)同 OQ-5(`awaiting_approval` 過期)嘅「approved」= **維持 deferred**,唔係已答 —— 見 §7 個 ⚠️ |
| 2026-08-15 | 🟢 **F1 + F2 落地**(`329f223`,branch `feat/w46-agent-runtime`)—— 五個 model + migration + `AgentToolRegistry`(5 個 tool)+ 33 條 test;api 1077/75 全綠,falsification ×4 真紅零誤傷。**R3 deviation ×3,全部喺 checklist 標咗**:①`search_catalog` 多回 `displayName`/`skuPartNumber`/`seatModel`(唔畀 agent 有嘢 match 就等於逼佢幻覺;真防線係 `propose_line_items` 只收 GUID)②tool 契約拆咗做 `agent-tool.ts` + `tool-registry.ts` 兩個檔(plan 只寫一個檔名)③`propose_line_items` 嘅 `execute` 做成**唯讀**(D3 個順序係「平台建完先 resume」⇒ execute 再建就係建第二次)。🔴 **同時新增 `OQ-7`(inference 側 PII)—— 呢個唔係 deviation,係 ADR-0036 一個從來冇決定過嘅缺口**,列為 **F5 硬 gate** |
| 2026-08-15 | 🟢 **F3 + F4 落地**(`b668f98`)—— seam ⑤ `AgentRuntimeProvider` + `OpenAiAgentsProvider` + factory + tracing 三重關;api **1099/77** 全綠(零跌)· tsc 0 · lint 0 · falsification ×4 真紅零誤傷。**H2**:`@openai/agents@0.16.0` 裝咗(ADR-0036 已批)。🔴🔴 **F4 揭到一個會令 A4 完全空轉嘅陷阱**:SDK 有**兩個**唔同 tracing 開關 —— `config.tracing.disabled` 係只讀 env 嘅 getter 而且 **`NODE_ENV==='test'` 時永遠 `true`**,真開關喺 `TraceProvider`(`setTracingDisabled` 寫、`createTrace()` 讀)⇒ 對住前者寫 assert,**喺 Jest 之下連 disable 嗰行刪咗都會綠**。條 test 改成三段式(開返 → 證明開到 → 起 provider → 驗關咗)。**而呢條 test 就係 R14 唯一會紅嘅嘢**,佢空轉即係三重關實際上得兩關。🔴 第二個同族陷阱:`tool()` 把 `needsApproval: true` 包成 `async () => true` ⇒ `toBe(true)` 必 fail、`toBeDefined()` 乜都捉唔到,**要 call 個 policy 先驗到**。📌 **OQ-1 冇代答** —— `agentModel` 冇 code default、未配就 503 ⇒ 唔再 block code,但**仍然 block F5**。**R3 deviation ×2**:①F3 順帶加咗 `agent` connector 落 `connectors.ts` / `ConnectorConfig` / audit whitelist / Integrations panel(D10 明文要求,但 plan §2.1 F3 冇列)②`SeamRuntimeRegistry` 新增 `recordChoice`/`choiceOf`(既有 boolean API 一個字唔改)|
| 2026-08-15 | 🟢🟢 **四條卡住嘅嘢一次過解封(Chris 四項拍板)** —— ①**OQ-7 = Azure OpenAI(公司 tenant)** ⇒ **ADR-0037**(`Proposed`)②**`startedById` + `requestId` FK 兩個一齊做**(F1-6 / F1-7)③**OQ-1 押後到 F11**(唔再係 F5 gate)④**批准停 `ai-doc-extraction-db`** ⇒ **A1 本機側收咗**。<br>🔴 **一個核對推翻咗 handoff 嘅前提,而佢決定咗今日做到幾多**:handoff 寫「OQ-1 同 OQ-7 係 F5 兩條硬 gate」。實際上 §2.1 F10 同 A6/A7/A8 都明文寫住 **LLM 一律 mock** ⇒ **OQ-1 結構上唔可能 block F5 嘅 code + test**,佢 block 嘅係 A14。而 **OQ-7 就真係 gate F5** —— 但唔係因為「要決定可唔可以送」,係因為其中一個候選答案(先 scrub)會改 F5 嘅 code shape。⇒ **兩條「硬 gate」性質完全唔同,而佢哋喺 doc 入面一直並排寫住,睇落一模一樣。**<br>🔴 **`AGENT_MODEL` 語意被 OQ-7 個答案改咗**(ADR-0037 E3):Azure 之下佢收 **deployment 名**。⇒ OQ-1 由「揀邊個 model」變成「infra 開邊個 deployment」——**一個要外部團隊做嘢嘅問題**,而 W46 由此有咗第一個外部依賴。<br>🟢 **A1 本機**:三個 migration `migrate deploy` 真跑(跑之前 `migrate status` = 22/24、零 drift),證據係 **catalog query 唔係 migrate 個 summary** —— 五張表 · `startedById NOT NULL` · 三條 FK · `ConnectorConfig` 兩個欄 · ledger 三條 `finished = t`。api **1099 / 77 全綠零跌** · tsc 0 · lint 0。<br>⚠️ **順帶發現兩個 doc 冇記過嘅環境事實**:①**本 worktree 冇 `apps/api/.env`**(主 worktree `C:/ai-develop/unified-operation-platform` 先有)—— 但 `docker-compose.yml` 本身就有本機 DB 憑證,所以唔使掂佢 ②`git worktree list` = **兩個** worktree,而另一條 checkout 咗 `chore/web-lint-prettier` ⇒ **兩邊共用同一個 `uop-postgres`**,本機 migration 一跑就會令另一條 branch 睇到「DB 有佢冇嘅 migration」|
| 2026-08-15 | 🟢🟢 **F5 + F6 + F9 落地,`ADR-0037` 同日 `Accepted`** —— F5 `AiAssistService`(停喺 propose、零副作用)· F6 **新開 `AgentApprovalModule`**(H1,Chris 拍板)· F9 `agent.boundary.spec.ts`。api **1099 → 1171 / 77 → 81**(零跌)· tsc 0 · lint 0 · **falsification ×10 全部真紅零誤傷**。<br>🔴 **F6 個 H1**:審批要同時掂 domain 同 agent,而 D0 禁止 `agent` import domain service ⇒ 住唔到落 `agent`。否決放 `agent`(=軟化 D0)同放 `fulfilment`(令最大嗰個 module 孭多一個無關職責)⇒ **薄 module import 兩邊,`agent` 條 arrow 一個字唔郁**。<br>🔴 **兩個人兩種權**:批准人做 domain write 嘅 actor;開 run 嗰個人供 agent 嘅**讀** scope —— 撈埋一齊 = 一個批准靜靜擴闊咗 agent 中途睇到嘅嘢,而冇任何嘢會報告。<br>🔴 **W28 權限矩陣 drift test 當日捉到新 controller** ⇒ **ADR-0036 否決 Option A 嗰個理由由「論據」變成「實測」**。<br>🔴 **falsification 揭到一條層與層之間嘅縫**:拆走 `toTranscript` 個 `scrubPii`,八條 transcript test 紅晒而 service spec **一條都冇紅** ⇒ 「PII 入唔到 `AgentMessage`」一路只喺純函數層被 assert。補咗 service 層一條。📌 **方法論**:falsification 唔止話你知「條 test 有冇用」,佢**同時畫得出「邊層冇 test」**—— 紅邊度就係覆蓋喺邊度。<br>🟢 **`ADR-0037` `Accepted`(Chris)**,但 🟡 **`E4`(auth)= approved as DEFERRED** —— 起因係 Chris 問「**所以 OQ-7 要批什麼?**」:佢已經答咗 OQ-7,所以要批嘅係「呢份 ADR 連埋佢五個後果就係決定」。拆清楚之後只有 `E4` 真係未答,其餘四條(E3/E5/E6/E7)係要佢過目嘅後果。**`E4` 同 `OQ-1` 合併做一個 infra request**(兩者取決於同一件事,分開問會問兩次)|
