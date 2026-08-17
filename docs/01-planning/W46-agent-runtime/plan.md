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
| **G4** | **`ClaudeToolRunnerProvider`**(`betaTool()` + `tool_runner`)—— 證明 D1 一份定義兩邊行得通。🔴 **= 架構證明,唔係產品功能**(Chris 2026-08-16)⇒ **唔打網絡**,而呢件事要有 test 守住(ADR-0038 D3) | H2 → **ADR-0038 `Accepted`**(2026-08-16)⇒ **R1 gate 過** |
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

> 🔴 **2026-08-17 收尾掃咗一次,而呢張表由頭到尾冇更新過** —— 21 條全部仲係 `[ ]`,而實際上
> 18 條老早做完(勾咗喺 `checklist.md`,兩份文件各講各)。**呢個唔係「文件唔靚」** ——
> plan 個 acceptance 就係「W46 算唔算完」嘅定義,佢全部空白即係**冇人講得出仲差幾多**。
>
> 📌 **掃法**:逐條搵返實際證據(邊個 spec 邊個 describe),**唔靠記憶勾**。掃出兩件事:
> **①`B3` 只做咗一半**(D1 schema identity ✅,但「兩個 provider 產生同一個 `AgentStep`」
> 冇 test)⇒ **當日補咗** `agent-runtime.contract.spec.ts`,而佢**第一次跑就揾到一個真
> divergence**(見下)②`A1` 係一半(本機 ✅ / DEV ❌)—— 之前被當成一條。

### 期一

- [x] **A1** 🟢🟢 **全收(2026-08-17,部署 #9 `dev-45ad525`)** —— 本機 ✅(`F1-5`,對真 DB 21 個 migration);**DEV ✅** 三個 migration 真跑,container log 原文 `25 migrations found` → 逐個 `Applying migration 20260815030000_w46_agent_runtime` / `…_w46_agent_connector` / `…_w46_agent_run_actor` → `All migrations have been successfully applied.` + `Seeded 24 OpCos`。🔴 **唔止靠 migrate summary —— 三個 migration 各自有獨立嘅 runtime 佐證**(因為 `docker-entrypoint.sh` 令 migrate 失敗 NON-FATAL,而且 summary 講嘅係「跑咗」唔係「跑出咗嘢」):①`GET /agent/runs?requestId=…` **200** 兼讀得返 run row ⇒ `AgentRun` 表真存在 ②`GET /admin/integrations` 回應帶 `"column": "agentRuntime"` / `"agentModel"` ⇒ 第二個 migration 加嘅欄真讀得到 ③run 回應個 **`startedById` 有值** ⇒ 第三個 migration 真跑咗
- [x] **A2** ✅ `agent.boundary.spec.ts` —— 五個 forbidden import + 正面半(「仲有做緊自己份工」)+ 一個 legal crossing 明文命名
- [x] **A3** ✅ `tool-registry.spec.ts` `allow-list (A3 / D2)` —— `exposes exactly these tools, in this order, with these approval flags`
- [x] **A4** ✅ `openai-agents.provider.spec.ts` `tracing is off (A4 / D11 / H4)` —— 🔴 **佢自己處理咗 vacuous-pass**:jest 之下 tracing 本來就係關,所以條 test **先開返佢**再驗關(唔係咁嘅話,拆走 `enforceTracingDisabled()` 都會綠)
- [x] **A5** ✅ 兩半 —— `ai-assist.service.spec.ts` `A5 — zero side-effects`(行為)+ `tool-registry.spec.ts` `contains no database write at all (A5, static half)`(靜態)
- [x] **A6** ✅ `A6 — a write tool stops the run` 四條
- [x] **A7** ✅ `A7 — AgentStep is written by the platform (INC-001)` —— 含「扮講自己做過嘢」嗰條
- [x] **A8** ✅ `lets nothing email-shaped reach AgentMessage through the service`
- [x] **A9** ✅ `propose_line_items (A9 / R15)` 三條(靠名 / 唔存在 GUID / 存在但 inactive)
- [x] **A10** ✅ `agent-approval.service.spec.ts` `approve` + `reject`
- [x] **A11** ✅ `F7 — agent.run_started` + `F7 — agent.proposal_decided`,含 `🔴 A11 — passes no before/after at all`
- [x] **A12** ✅ 每次交付都跑 —— 🟢🟢 **最後一次係接返 `main` 之後(2026-08-17):api 1362 / 92 · web 439 / 43 **零紅** · root lint 0 · root build 0**。⚠️ **「6 條 pre-existing 紅」呢句由呢一刻起唔再適用** —— `main` 側 `31b5c7d` 修好咗,根因係 **Node 25 預設開 Web Storage 把 `globalThis.localStorage` 裝成空 `{}`**,同 jsdom 無關。而 `main` 同時把 root `test`/`build`/`lint` 擴到蓋 `-w @uop/web` ⇒ **web suite 而家真係入咗 gate**
- [x] **A13** ✅ `F8-10` / `F11-1` + `G-UI`(light + dark 真 render,跑咗 `ui-design`)
- [x] **A14** ✅ **2026-08-17 全收**(Chris 開咗 Azure OpenAI resource ⇒ 唔再等封 infra 信)—— 真跑咗四個 run:`failed`(api-version 太舊,**證咗 endpoint 通 + key 有效**)· `awaiting_approval` ×2 · `aborted`(pending proposal 自動 `rejected`)· **approve → `completed`**。🔴 **批准嗰半分兩次先收齊,而兩次都有價值**:①第一次撞 **409 `This request is complete…`** ⇒ **`F8-3` 卡上嗰句「Approving runs the platform's normal checks — they can still refuse」第一次真驗證**(閘喺 `RequestService.addLineItem`,唔喺 agent 側)②換一張 `OPEN` request 之後 run 真 resume 到 `completed`,而收貨標準係**落 DB 對數**:proposal `executed` + `approvedById` 有值 + 2 條 line item 逐字對返兩個 GUID。⚠️ **`A1` DEV 半邊同 `B6` 唔跟住收** —— 佢哋卡嘅係 **Redis**,唔係 Azure OpenAI

### 期二

- [x] **B1** ✅ `agent-approval.service.spec.ts` `approve — assign (期二 G1)` + `when the platform’s gates refuse`
- [x] **B2** ✅ `permissions.spec.ts` `🔴 G2 — the agent appears as an actor, with no Role` 六條 + W28 snapshot
- [x] **B3** ✅ **2026-08-17 收尾補齊** —— 🔴 **掃嗰陣發現佢只做咗一半**:`claude-tool-runner.provider.spec.ts` 個 `D1` 證咗 **schema identity**(`toBe`),但成個 W46 **冇一條 cross-provider 對照**,而 B3 明文要「兩個 provider 對同一個 tool 呼叫產生**同一個 `AgentStep`**」。補咗 **`agent-runtime.contract.spec.ts`**(7 條,跟 `license-ops.contract.spec.ts` 形狀:reduce 成可比較嘅嘢,**互相比較**而唔係各自對 fixture)
- [x] **B4** ✅ `tool-registry.spec.ts` `🔴 G3 — the blast-radius limit` 五條
- [x] **B5** ✅ `kill-switch.service.spec.ts` + `agent-approval.service.spec.ts` `🔴 G3 — approving is gated, rejecting is not`
- [x] **B6** 🟢🟢 **收咗(2026-08-17,部署 #9)** —— 卡住嗰兩樣同日拆晒:**Redis 配咗**(`rediss://…:6380`,key percent-encode)⇒ `POST /agent/runs` 由結構上必然 503 變成真 **201** `{"runId":"cmswylt7c…","status":"running"}`;**ACA ingress 對 SSE 嘅行為亦驗咗**(呢個先係本條真正未知嗰半)—— `GET /agent/runs/{id}/events` → **HTTP 200** · `Content-Type: text/event-stream` · 真收到 `id: 1` + `data: {"runId":"…","type":"changed"}` ⇒ **三層(nginx `F6` / ACA ingress / api)全部通**。🔴 **誠實界線**:嗰個 run 最後 `status: failed`,因為 **DEV 側冇配 `AZURE_OPENAI_*`** ⇒ 本條驗到嘅係「**SSE 管道通、event 推得到 client**」,**唔係**「一個 run 由 `running` 行到 `completed` 全程 SSE 推送」。後者要配咗 Azure OpenAI 先驗得到,而佢唔係本條嘅定義
- [x] **B7** ✅ `review-stats.service.spec.ts` + `review-stats.controller.spec.ts`,`GET /agent/review-stats`(ADMIN only)

### 🔴 `B3` 補完之後揾到嘅嘢 —— 一個真 divergence,兩個 provider spec 都睇唔到

contract spec **第一次跑就紅咗一條**,而佢紅嘅位唔係我預期嗰個:

| | tool 掟 error 之後 |
|---|---|
| **兩個 adapter** | 逐行一樣:`record({status:'failed', detail})` → `throw err` |
| `@openai/agents` 個 `tool()` | 🔴 **自己 catch 咗**,返一個 error **字串**畀 model |
| `betaTool` | 掟返出嚟畀 caller |

⇒ **同一個 tool 失敗,兩個 runtime 之下「邊一層 catch」唔同。**

🟢 **點解佢唔推翻 B3**(講出嚟而唔係假設):嗰個分歧住喺 **adapter 之下、ledger 之上** ——
`AgentStep` 兩邊**逐字一樣**(已 assert),而**兩邊個 model 都知道 tool 失敗咗**,只係一個經
exception、一個經回傳值。條 test 兩個機制各 assert 一次,唔係淨係 assert「有 throw」。

📌 **值得記嘅唔係呢個分歧本身,係佢點解一直冇人見到** —— **兩個 provider spec 各自都完全正確**,
因為每個都只講自己。**「兩個實作一致」呢個 claim,結構上冇一個單一實作嘅 spec 講得到。**
(= W39 F2 寫 `license-ops.contract.spec.ts` 嗰陣講嘅同一件事。)

**Falsification ×3**:①claude 側 `toolName` 改大寫 ⇒ **2 紅** ②**兩邊一齊**改大寫 ⇒ **1 紅**
(互相比較捉唔到,**hardcode 期望嗰條捉到** ⇒ 兩種 assert 夾埋先有意義 —— CH-023 tautology 教訓
嘅正面應用)③拆走 claude 失敗路個 record ⇒ **2 紅**。

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

## 7. Open Questions —— **淨低 `OQ-1` 一條真正未答(2026-08-16 更新)**

> 🔄 **2026-08-16**:`OQ-5` 答咗(Chris:**7 日**)⇒ **原本嗰句「淨低 OQ-1 一條」而家先至真** ——
> 佢由 08-15 寫到 08-16 期間**其實有兩條未答**(`OQ-1` 同 `OQ-5` 都係 `approved as deferred`),
> 而下面個 ⚠️ 一直喺度提住呢件事。**留呢句喺度**,因為佢示範緊嗰個誤讀本身就發生喺同一段。

> ⚠️ **「approved」對每條嘅意思唔一樣,呢個分別要記住。** OQ-2/3/4/6 嘅 default 係一個**答案**,批咗即係定咗;**OQ-1 同 OQ-5 嘅 default 係「暫時唔答」**,批咗即係確認「維持 deferred 到指定時點」—— **唔可以當成已經答咗**。呢個正正就係 §9 記低過嗰個形狀:一格寫住「approved」而下手當咗成格都答晒。

| # | 問題 | 決定 | 狀態 |
|---|---|---|---|
| **OQ-1** | Agent 用邊個 model? | 🔄 **2026-08-15 更新兩處**。①**target 由「F5 之前」改成「F11 之前」**(Chris 批)—— 因為 §2.1 F10 同 A6/A7/A8 都明文寫住 **LLM 一律 mock** ⇒ F5 / F6 / F9 嘅 code + test **結構上唔需要一個真 model**,佢真正 block 嘅係 **A14 live 驗**。②🔴 **問題本身變咗**(ADR-0037 E3):Azure 之下 `agentModel` 收嘅係 **deployment 名**唔係 model 名 ⇒ 由「揀邊個 model」變成「**infra 喺公司個 Azure OpenAI resource 開邊個 deployment、叫咩名**」—— 而後者係一個要**外部團隊做嘢**嘅問題,唔係一個揀嘅問題 | 🟡 **approved as deferred to F11** —— 🔴 **開 A14 之前一定要答** |
| **OQ-2** | Proposal 審批權:ADMIN only 定 ADMIN + REGIONAL? | **ADMIN + REGIONAL** —— 跟 `OutboundFailure` 先例(ADR-0011 D4):同一批人本來就睇緊呢啲 request | 🟢 **定咗** |
| **OQ-3** | 一張 request 可唔可以有多過一個 open run? | **唔可以** —— 同時只准一個非終態 run(避免兩個 proposal 對住同一張單打架) | 🟢 **定咗** |
| **OQ-4** | Agent 讀唔讀得到 `AuditLog`? | **讀唔到** —— 唔喺 §3 allow-list;audit 係 ADMIN-only 兼載 PII(ADR-0009 P-B) | 🟢 **定咗** |
| **OQ-5** | `awaiting_approval` 掛幾耐算過期? | 🟢 **答咗(Chris 2026-08-16):7 日。** ⚠️ **但一個數字答唔到成條問題** —— 查證揭到佢實際卡四樣(見下),其餘三格係 **AI 建議 · Chris 未逐條講**:②過期落**新 status `expired`**(唔塞 `aborted`)③**R16 版本標記 + 主動對比**(唔淨係靠時間閘)④fail loud 走返 **`OutboundFailure`**。🔴 **呢三格喺 doc 度標開,係因為佢哋唔係佢答嘅** | 🟢 **定咗(數字)** + 🟡 **三格按建議做** —— 🔴 **G5 開得工** |
| **OQ-6** | 用唔用 SDK 嘅 guardrail 做第二層? | **用得,但唔可以入 acceptance gate**(ADR-0036 D2)—— 期二再評估要唔要真行 | 🟢 **定咗** |
| **OQ-7** 🆕 | 🔴 **`rawRequestText` / `targetUpn` 送去第三方 model provider 做 inference,可唔可以?** | 🟢 **答咗(Chris 2026-08-15):行公司 tenant 嘅 **Azure OpenAI**,唔准打 `api.openai.com`** ⇒ 寫成 **ADR-0037**(同日 `Accepted`)。論據係「**收件人變咗**」唔係「內容變少咗」—— 原文仍然原文,但只喺公司同 Microsoft 之間,同平台今日打緊嘅 Graph / M365 / Entra 同一個信任面。否決:ZDR(代價其實係零,但多一個第三方兼要等審批)· 公共 API 標準條款 · **送之前先 scrub**(唯一會改 F5 code shape 嗰個 —— 等於用「功能唔 work」換「冇 PII」)· 只送摘要(個摘要 call 一樣要收原文) | 🟢 **定咗** —— **ADR-0037 同日 `Accepted`**(五條後果逐條過目之後)。⚠️ 兩件唔可以當答咗:①**`E4`(auth 揀 Entra token 定 API key)= approved as DEFERRED**,target = infra 確認 Azure OpenAI resource 之後同 **OQ-1** 一齊答 ②**Claude 側要重新答一次同一條問題**,唔可以引用本答案(E7)。🔄 **2026-08-16 target 收窄(ADR-0038 D5)**:由「**G4 開工之前**」改成「**真打 Anthropic 之前**」—— 因為 Chris 定咗 **G4 = 架構證明唔打網絡** ⇒ E7 個時點判斷嘅隱含前提(「G4 = 真打 Claude」)唔成立。**E7 個禁令本身一個字冇郁**(仍然唔可以引用 ADR-0037 當已答),**收窄唔係推翻**(ADR-0035 形狀)⇒ Claude 側 OQ-7 而家同 **OQ-1** / **E4** / **A14** 併埋同一批,全部等 infra |

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

### 🔴 OQ-5 —— 佢表面係一個數字,實際卡四樣(2026-08-16 查清楚,Chris 問起)

> 📌 寫低係因為**每次重問呢條問題都要重新查同一批 code**。以下每項都有 code 出處,唔係推論。

#### ① 一個掛住嘅 run 會**永久封鎖**嗰張 request

`agent-run-status.ts:28` 個 `NON_TERMINAL_RUN_STATUSES` 包住 `awaiting_approval`,而 **OQ-3** 定咗一張 request
同時只准一個非終態 run(**喺 service 層 guard,唔係 DB constraint** —— 「未完」係一個值嘅**集合**,partial unique
index 喺 Prisma 側表達唔到)。

⇒ **冇 expiry 唔係「唔靚」,係一張真單被一個冇人撳嘅 dialog 鎖死,而平台冇任何自愈路。**

#### ② 有**兩種**過期,而一個時間門檻只解決到一種

| | 由咩決定 |
|---|---|
| **時間過期**(掛咗 N 日) | 時鐘 |
| 🔴 **結構過期**(R16) | **部署** —— 升 `@openai/agents` 嗰一刻,全部 parked run 可能即刻 resume 唔返 |

`schema.prisma:640` `runState Json?` + `openai-agents.provider.ts:290` `RunState.fromString()`。
🔴 **今日結構過期係靜態嘅** —— `ai-assist.service.ts:254` 只喺**有人撳 approve** 嗰刻先發現讀唔到,
**冇人撳就冇人知**。⇒ 一個純時間 sweep 解決唔到佢。

#### ③ 佢決定 G3 個 kill switch 會唔會**永遠 unsettled**

期二 G3 已落地:`settled` = 冇非終態 run。⇒ **一個永久掛住嘅 run = kill switch 永遠 `settled: false`**,
「閂咗但系統未停定」由一個**例外狀態**變成**常態**,而嗰個 badge 就冇咗意義。**呢個唔係假設,係已經跑緊嘅行為。**

#### ④ 過期落咩 status,會撞到 G7

`schema.prisma:628` 現有七個值。落 `aborted` / `failed` / 定加第八個 `expired`?

🔴 **而 G7 個人口係 `decidedAt != null`** ⇒ **過期嘅 proposal 今日完全唔入分母**。但「冇人審到過期」正正係
**R13 rubber-stamp 嘅另一面**(唔係亂批,係唔理)—— 而家個 metric 睇唔到佢。

#### ⑤ 順帶:G5 有一半唔卡 OQ-5

「把 agent run 推去 BullMQ worker」唔需要知 expiry;卡嘅只係 **expiry 由邊個執行**(delayed job 綁住 run
建立嗰刻 vs `@nestjs/schedule` 批次 sweep)。**同 G4 一樣拆得開。**

#### 🟢 答案(2026-08-16)—— 一個係 Chris 答嘅,三個係建議

> 🔴 **四格嘅來源唔一樣,而呢個分別要留喺度。** Chris 答嘅係「7 日」然後叫開工;②③④ 係 AI 建議
> **佢冇反對**,唔係佢逐條講過。沿用 `CH-015` / `F9-8` 個先例:**兩種證據都算數,但唔可以寫成同一種。**

| # | 決定 | 來源 |
|---|---|---|
| ① **門檻** | **7 日** | 🟢 **Chris 2026-08-16** |
| ② **過期落咩 status** | **新開 `expired`**,唔塞 `aborted` | 🟡 AI 建議 |
| ③ **R16 結構過期** | **版本標記 + 主動對比**,唔淨係靠時間閘 | 🟡 AI 建議 |
| ④ **fail loud 畀邊個** | 🔄 **`AgentStep`**(原建議 `OutboundFailure`,實作當日更正 —— 見下) | 🟡 AI 建議 |

**① 7 日** —— 呢個唔係 SLA 係一道**回收閘**:太短會殺死「週末 + 一個假期」之後仍然有效嘅 proposal,
太長就等於冇。而 `AgentProposal.decidedAt` 令實際 median 量得返 ⇒ **收緊隨時做得,唔使一次揀啱。**

**② 新開 `expired`** —— 🔴 理由**唔係**「講得準啲」,係 **G7**:`aborted` 已經有一個好明確嘅意思
(**平台執手尾** —— `abortRun` 兩個決定欄都唔寫),而 G7 個人口定義(`decidedAt != null`)就係靠呢個分野。
**過期塞落 `aborted` = 把「冇人審」同「平台停咗佢」溝埋**,而前者正正係 R13 要量嗰樣。
🟢 **唔使 migration** —— `status` 係 `String` 唔係 Prisma enum(**ADR-0031 D1 個決定喺呢度回本**);
要跟嘅係 `schema.prisma:628` 個 comment list、UI badge map、`NON_TERMINAL_RUN_STATUSES`。

**③ 版本標記** —— 四條入面**唯一真正冇現成答案**嗰條。只做「標記 + 對比 + fail loud」,
**唔做自動 resume 修復** —— 修復係另一個問題,而**知唔知道**先係 R16 問嘅嘢。

**④ ~~`OutboundFailure`~~ → 🔄 `AgentStep`(2026-08-16 實作當日更正)**

原本建議行 `OutboundFailure`,理由係「佢就係平台已有嘅 stateful 修復佇列」。**寫 code 嗰陣睇返佢先發現
建議錯咗**:`OutboundFailure` 係**重做得到嘅嘢**嘅佇列(Delivery failures 畫面有 retry 掣),
而一個過期 run **重做唔到** —— 佢個 state 唔係太舊就係讀唔到,resume 佢等於喺一個冇人畀過嘅批准之下
執行 tool call。擺一個永遠撳唔得嘅 retry 掣落嗰個畫面,比冇更差(**同 G1 嗰個
`Nothing proposed.` 一模一樣嘅錯**)。

🟢 **改用 `AgentStep`** —— 佢就係 **D4 講嘅 action ledger**,而「平台令佢過期」正正係平台自己做嘅事;
F8 張卡**已經 render steps** ⇒ **零前端改動就見到**。⚠️ 而 `agent.boundary.spec.ts` assert
**`AgentStep` 只有一個 writer**,所以 sweep 唔可以自己寫 ⇒ 機制住喺 `AiAssistService.expireRun`,
sweep 只決定「幾時」(CH-015 `openSyncGate` 先例)。

📌 **仲有一個唔屬於 OQ-5 嘅決定留返畀 G5 實作**:**expiry 由邊個執行** —— BullMQ delayed job(綁 run
建立嗰刻)vs `@nestjs/schedule` 批次 sweep。

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
| 2026-08-16 | 🟢🟢 **F7 + F8 + A13 落地 ⇒ 期一淨返 F10-2 同 A14** —— F7 audit 兩條 event-only action · F8 `AgentRunController` + `AiAssistCard` · **A13 / F11-1 light + dark 真 render 收咗**。api **1184 / 81** 全綠零跌 · web **392 passed**(6 條紅逐條核對過 = 已知 pre-existing,零新增)· 兩邊 tsc 0 / lint 0。<br>🔴🔴 **F8 一個「短啲嗰個寫法」差啲開咗個窿**:`getRun` 原本用 `include` ⇒ 會連 **`runState`** 一齊回傳,而佢係 SDK 序列化 state,**入面有未 scrub 過嘅對話歷史**(D6 scrub 嘅係落 `AgentMessage` 嗰條路)⇒ **等於由 API 交返平台小心遮住嗰份 transcript 嘅原本**,冇 error 冇 log 冇嘢會紅。改明文 `select`,而 **A13 順帶喺 wire 上證實咗**(真打 endpoint,payload 入面 `runState` 出現 0 次)。<br>🔴 **F7 查證到 ADR-0036 D7 冇講嘅約束**:`AuditLog.actorId` 係 FK → `AppUser` ⇒ 一行 `actorType:'agent'` **講唔出係邊個 agent**。一個 principal 之下捱得住,兩個就係窿。寫咗喺 `AuditEntryInput.actorType` docblock(下手要用嗰陣望住嗰行)。<br>🔴🔴 **A13 = 一個 R3 級嘅工具方向改變,Chris 2026-08-16 拍板**:本 session 冇 browser tool,而本項目由 CH-002 到 CH-030 **每次 render 驗都靠當日 session 啱啱有 Playwright MCP**(CH-016 驗到 / **W43 驗唔到就照寫「未 render 驗」**),W41 checklist 甚至明文記住「repo 冇 playwright dep」⇒ **歷來每個 session 都刻意冇加**。⇒ 停低問,Chris 揀 **`playwright` 落 `apps/web` devDependency**(H2 §5.2 明文例外)+ 新 `apps/web/scripts/render-check.mjs` ⇒ **acceptance criterion 唔再靠彩數**。🟢 `npx playwright install chromium` 真落載到(191.8 + 114.5 MiB),**公司 proxy 冇封 `cdn.playwright.dev`** —— ⚠️ **呢個結論同 RISK R1 相反**,唔可以由 R1 推論其他 CDN 都封。<br>🔴 **render 揭到一個潛在缺口(F11-1b,未修)**:`STEP_LABEL[step.key] ?? step.key` —— 今日九個 key 全部有 label 所以**唔係 bug**,但 `AgentStep.key` 係 `string`,冇嘢釘住對應;而**上下相鄰嗰個 `MESSAGE_LABEL` 係 `Record<AgentMessage['role'], string>` ⇒ TypeScript 幫佢守住**。兩個 map 寫法睇落一模一樣,分別喺**上游型別係 union 定係 `string`**。Target = 期二 G1 之前(G1 加 `propose_assign`,即第一個真會踩中佢嘅改動)|
| 2026-08-16 | 🟢 **期二 `G3` 落地(blast-radius limit + kill switch)** —— api **1218 → 1243 / 85**,tsc 0 / lint 0,**falsification ×7 真紅零誤傷**。<br>🔴 **R3 deviation ①(要 Chris 過目)—— `AuditLog` 加咗第三條 action `agent.kill_switch_set`,而 ADR-0036 D5 明文寫住「只收兩條新 action」。** 論據:D5 個**主題**係 transcript(自由文本 + 不可預測結構 + 大量 ⇒ 入咗就等於拆咗 ADR-0009 D5 個 whitelist),而呢一行係**一個 boolean 加一個 actor** —— 正正就係 whitelist 本身為咗覆蓋而存在嗰種形狀。唔加嘅代價係:一個**改變平台會唔會行動**嘅 admin 控制,冇任何記錄講邊個改過 ⇒ 直接違背 ADR-0009 存在嘅理由。同時新增 target type `AgentPrincipal`,whitelist **只得 `['active']` 一個 key**(`name`/`runtime` 唔審計,因為呢條路唔改佢哋 —— 一個闊過佢覆蓋嘅寫入嘅 whitelist,就係下次擴闊嘅論據)。<br>🔴 **R3 deviation ②** —— plan §5 B4 寫「單 run 超額**即停**」,實作係「**超額即拒**」:個 cap 令 run **做唔到嘢**,但唔會由平台側終止個 run。**刻意冇扮成停**:Tier 1 agent 寫唔到嘢(D3)⇒ 一個冇 budget 嘅 run 淨係喺度講嘢,而講幾耐由 SDK 個 `MAX_TURNS` 封頂(**第二層,明文標住,唔係 gate** —— D2)。加一個「殺 run」動作會**連埋一個仲有人可能想批嘅 pending proposal 一齊掟走**,而嗰個 proposal 係人嘅嘢唔係 agent 嘅嘢。<br>🔴 **本單三個決定**:①**cap 只計 autonomous tool(`needsApproval: false`)** —— `propose_*` 已經俾一個**人**封住,比一個 counter 強;連佢都 cap 就會出現「平台做完真嘢之後,個 counter 反而拒絕咗報告結果嗰個 tool」呢種由 limit 自己製造嘅失敗 ②**kill switch = `AgentPrincipal.active`,唔開第二個 `ConnectorConfig` 欄** —— 兩個地方閂得到 agent 就係兩個「佢開唔開住」嘅答案(BUG-005 / BUG-011 同族),而且 D7 令 principal 本身就係 actor,停 actor 語意最準;順帶零 migration ③**kill switch 攔 approve、唔攔 reject** —— 停 agent 係要佢**唔好再引起嘢**,唔係要人執唔到手尾;攔埋 reject 就會令每個 pending proposal 被困到有人開返個掣,反而令人唔敢撳呢個掣。<br>🚧 **UI 未做**(狀態顯示 + 開關掣),同 `G2-j` 一齊排喺期二 render 嗰一批;API 側 ADMIN 打 `PATCH /api/agent/kill-switch` 已經用得(沿用 CH-026 `G-7` 由 API 做嘅先例)|
| 2026-08-16 | 🟢 **期二 `G7` 落地(R13 監測)** —— `GET /agent/review-stats?days=30`(ADMIN only);api **1243 → 1260 / 87**,tsc 0 / lint 0,**falsification ×7 真紅零誤傷**。<br>🔴 **R13 唔係「agent 提議錯嘢」,係「批准嗰個人唔再讀」** —— D3 擺一個人喺每個寫入前面就係 Tier 1 成個安全論據,而一個冇人真係做嘅審批步驟會把佢變成形式,**同時每個畫面照樣印住一個人名喺個決定側邊** ⇒ **系統一啲都唔會睇落唔同**,只能靠數字。<br>🔴 **R3 deviation ①:讀 `AgentProposal` 唔讀 `AuditLog`。** `audit-fields.ts` 明文寫住 `AGENT_PROPOSAL_DECIDED` 存在就係為咗令 R13 變成一條 query —— 但由一條 **free-text `reason` 嘅前綴**推批准率,係一個**改一次文案就靜靜變錯**嘅 metric;`status`/`decidedAt`/`approvedById` 係結構化嘅。**audit 嗰條 action 一個字冇改**,兩者並存(一個係事件記錄,一個係統計)。<br>🔴 **R3 deviation ②:plan B7 只寫兩個 aggregate 數,本單加咗 per-reviewer。** 一隊人整體 70% **可以入面有一個 100% 兼平均四秒**,而 aggregate 就係嗰個藏住佢嘅數字 ⇒ **一個講唔出佢講緊邊個嘅 metric,冇人 act 得到**。**H4**:只攞 `displayName` 冇 email(cuid 冇人 act 得到 ⇒ 要個名;email 對呢條問題一個字冇加 ⇒ 唔要),ADMIN only 同 `/admin/audit` 一樣理由(ADR-0009 D7)。<br>🔴 **人口 = `decidedAt != null`,而佢排除嘅嘢係重點**:`abortRun` 批量 reject 唔寫決定欄(**平台執手尾唔係有人話唔得**),計咗佢會把批准率**推低** ⇒ 一個乜都批嘅人會因為愈多 run 被停而睇落愈嚴謹。⚠️ **一個 risk metric 喺「令人安心」嗰個方向出錯,衰過冇 metric。**<br>🔴 **`failed` 計做批准**(G1:人批咗、閘拒絕)—— 當成 rejection 會令 reviewer **愈係要平台救佢就睇落愈有懷疑精神**,而且喺出事嗰刻顯示成改善趨勢。<br>🔴 **兩個指標唔對稱,DTO 明文寫低點讀**:`fastDecisions` **係證據**(幾秒 = 冇讀過,唔使任何假設)· `medianSecondsToDecide` **唔係**(個鐘由 proposal 建立行起,唔係由人望到行起 ⇒ 長 median 可以係「審得仔細」亦可以係「冇人喺度」,由呢度分唔到)。<br>🚧 **UI 未做,而呢個同 `G2-j`/`G3-n` 唔同 —— 佢唔淨係方便**:G7 個前提就係「只能靠數字,靠唔到留意」,而**一個要打 API 先睇到嘅數字冇人會定期望** ⇒ **R13 嘅緩解措施實際上要等 UI 先真正生效**;擺喺邊未決 |
| 2026-08-16 | 🟢🟢 **三個 UI 項一次過收(`G2-j` render · `G3-n` kill switch UI · `G7-o` R13 監測 UI)** —— Chris 批准停 `ai-doc-extraction-db`;web **403 → 414**(6 紅 = pre-existing)· tsc 0 / lint 0 · **四張 render 零橫向溢出**,token 兩個 theme 真 swap。**新 Settings tab「AI agent」** —— 唔擺落 Integrations,因為嗰個 tab 講 **vendor wiring**(邊個 runtime、邊個 model)而呢兩個講 **operation**(個能力行唔行、前面道人閘仲有冇人用)。<br>🔴🔴 **render 捉到一個四層 test 全綠嘅真缺陷**:`Select` 個 wrapper 係 `w-full` 而佢個 chevron 係 `absolute` 貼住嗰個 wrapper ⇒ 我淨係 size 咗入面個 `<select>`,**個箭嘴飛咗去成張 card header 最右邊,同個掣完全分家**。**tsc 0 · lint 0 · 11 條 UI test 全綠,冇一樣嘢會紅。** ⇒ **CH-030 個教訓原封重演:「字喺唔喺度」同「佢喺邊」係兩件事**,而只有真 render 答得到第二條 —— 亦即 `A13` 加 playwright devDep 嗰個決定第一次真正收到成本回報。<br>🔴🔴 **順帶喺真 Postgres 上驗到成套 G7 邏輯(唔係 mock)**:`decided 4 / approved 3` ⇒ **`failed` 真係當咗批准**(G1 嗰行)· `medianSecondsToDecide: 5`(真值 [3,4,6,1320] 嘅 median,而 **mean 會係 333**)· kill switch `enabled:false + liveRuns:1 + pendingProposals:1 ⇒ settled:false`。**Mock 證得到公式,證唔到 Prisma 個 `where` 真係咁行。**<br>🔴 **H4**:fixture 用一個 `.invalid` 假帳戶,**唔用 DB 入面兩個真人** —— 呢個 panel 成個作用就係**點名**,用真名 render 就係把真名寫入一份 artifact;全部 `zzrf-` 前綴,收工逐張表對返數(**0/0/0 + 2 users**,同開工前逐字一樣),screenshot 已刪。<br>⚠️ **兩個 §9 未記過嘅環境陷阱**:①**呢個 worktree 個 compose project name 唔同咗** ⇒ `docker compose up -d` **試圖新建** container 兼開咗個空 volume,**若果成功咗就係一個空 DB 而畫面睇落正常**;正確做法 = `docker start uop-postgres uop-redis` ②`prisma generate` 撞 **EPERM**(殘留 api 進程鎖住 engine DLL)⇒ **`kill-zombies` 要行喺 `sync-code` 之前**。📌 呢個 DB 叫 **`platform`** 唔叫 `uop` |
| 2026-08-16 | 🟢 **`ADR-0038` 起草(`Proposed`)—— H2:Chris 批咗加 `@anthropic-ai/sdk`**,同時定咗 **`G4` = 架構證明唔係產品功能**。<br>🔴 **查證先於決定**:`@anthropic-ai/sdk` root + `apps/api` 兩份 `package.json` **零 match**、`node_modules/@anthropic-ai` 兩個位都唔存在 ⇒ **連 transitive 都冇**。呢點同 ADR-0037 嗰陣**唔同** —— 當時 `openai@7` 早就係 `@openai/agents` 嘅 transitive,換去 Azure client **零新 dependency**,H2 根本冇觸發。<br>🔴 **「G4 = 架構證明」呢個答案解封咗一樣嘢,亦揭穿咗一樣嘢**:解封 = **OQ-7 Claude 半邊唔再 block G4**(ADR-0038 D5:E7 個時點判斷嘅隱含前提係「G4 = 真打 Claude」,前提冇咗 ⇒ **收窄唔係推翻**,ADR-0035 形狀);揭穿 = **「唔真打」如果只寫喺 ADR 度就係一個約定唔係一道閘** ⇒ D3 要 provider 未配就 503 + 一條 test。<br>🔴 **D4 係「點解要真裝」嘅第二個獨立理由,而佢比方便重要**:唔裝就要對住「我以為 `betaTool()` 收成點」寫 adapter,兩邊 fixture 同源 ⇒ **永遠綠,證咗個零** —— **W46 本 phase 已經中過三次同族**(對稱 fixture 令 mean/median 分唔開 · `for` over 空 list 滿足任何 claim · 由同一個 step 推導期望值)。<br>🔴 **起草寫 `Proposed` 唔寫 `Accepted`**,沿用 ADR-0037:Chris 批嗰陣見到嘅係「G4 要 `npm i`」,而 **D3/D4/D5/D6 四條後果佢未見過**。<br>📌 **順帶查清楚 `OQ-5` 實際卡乜**(Chris 問)—— 佢表面係一個數字,實際卡四樣,已寫入 §7 |
| 2026-08-16 | 🟢🟢 **`ADR-0038` `Accepted`(Chris,四條後果過目之後)⇒ `G4` 嘅 R1 gate 過,開得工**。🟢 **同 ADR-0037 有一個分別要記住**:嗰邊個 `Accepted` **唔等於每一條都答咗**(`E4` auth 係知情之下 deferred),而本 ADR **D1–D6 六條全部批咗,零 deferred** —— `D6` 唔係一條未答嘅決定,**佢本身就係決定**(「G4 第一步係查嗰三樣,唔係寫 adapter」)。⇒ **`OQ-1` / `OQ-5` / `ADR-0037 E4` 嗰個「approved as deferred」形狀唔適用喺呢度**,唔好順手當佢又係一格半開嘅嘢 |
| 2026-08-16 | 🟢 **`OQ-5` 答咗(Chris:**7 日**)⇒ `G5` gate 過** —— **W46 七條 OQ 而家淨低 `OQ-1` 一條真正未答**(佢卡 infra,同 `E4` 一齊)。🔴 **但一個數字答唔到成條問題,而四格嘅來源唔一樣,呢個分別要留喺 doc 度**:①門檻 7 日 = **Chris 答**;②新 status `expired` ③R16 版本標記 + 主動對比 ④fail loud 走 `OutboundFailure` = **AI 建議,佢冇反對但冇逐條講**(沿用 `CH-015` / `F9-8` 先例:**兩種證據都算數,但唔可以寫成同一種**)。🔴 **②嘅理由唔係「講得準啲」係 G7** —— `aborted` 已經專指「平台執手尾」(`abortRun` 兩個決定欄都唔寫),塞埋過期落去就係把「冇人審」同「平台停咗佢」溝埋,**而前者正正係 R13 要量嗰樣**;🟢 零 migration,因為 `status` 係 `String` 唔係 Prisma enum(**ADR-0031 D1 喺呢度回本**)|
| 2026-08-16 | 🟢🟢 **期二 `G4` 落地 —— `ADR-0036 D1` 第一次真被測試,而佢成立**。api **1260 → 1289 / 87 → 88** 全綠零跌 · tsc 0 / lint 0 · **falsification ×7 真紅零誤傷**。**registry / 六個 tool / `AgentTool` / `AgentToolSchema` / seam ⑤ vocabulary 一個字冇改**(ADR-0037 `E2` 立嗰條尺:要改 registry 就係 D1 錯咗 ⇒ 唔使返轉頭);最硬證據係一句 `toBe` —— **schema object 由 registry 去到 SDK 係同一個 reference**,唔係結構相等嘅複製品。<br>🔴 **三件靠估會錯嘅嘢,兩件當場紅畀我睇** ⇒ **D4 由一條規矩變成回本咗嘅嘢**:①`betaTool` emit **`input_schema`** 唔係 `inputSchema` ②**`BetaRunnableTool` 個 union 包住 Anthropic 內建 tool**(冇 `inputSchema`,TS 拒絕直接 cast)⇒ 🟢 **D2 多咗一層意思:內建 tool 由同一個 `tools` array 入嚟,而 `toClaudeTools` 只 map registry** ③🔴🔴 **`BetaToolRunner.js` `:23,27` 先 `yield`、`:54` 先執行 tool** ⇒ `break` 就係 approval gate,**但 `:31-33` 個 push 排喺 `yield` 之後 ⇒ 一 break 就跳過**,唔補返個 assistant turn,resume 嗰陣 `tool_result` 指住唔存在嘅 `tool_use` = **API 400**。**冇任何 type signature 講呢件事。**<br>🔴 **ADR-0036 兩處要更正,兩處都唔係 H1**:**`D3`「用 SDK 原生 pause/resume」喺 Claude 側唔成立**(冇 pause/resume,冇 `needsApproval` 欄)—— 但 D3 嘅**實質決定**(一律要人批 · 批准真相落平台 DB)一個字冇變,而且呢邊**更加成立**(冇 SDK 側 approval state 可以誤當真相);**approval 喺呢邊唔係一個機制,係唔繼續**。📌 **而咁樣先令 seam ⑤ 真正回本** —— `AgentTurn` 呢套 vocabulary 載得起兩個唔似樣嘅暫停機制(ADR-0017 D2)。**`D9`** 寫嘅 `tool_runner` 實際叫 **`toolRunner`**。<br>🟢 **D6 三條全部通過**:`@anthropic-ai/sdk@0.117.1` · **MIT** · deps 得兩個 · **`zod` 係 optional peerDependency ⇒ R20 幾乎唔存在** · **零新 env**(`ANTHROPIC_API_KEY` F3 已經喺 `.env.example`)。<br>🔴 **D3 落地成兩樣嘢唔係一句話**:①明文讀 env 再自己 check(**`new Anthropic()` 唔傳 key 會靜靜攞同一個 env var** ⇒ 交畀 SDK 就等於一個冇人覆核過嘅環境變數係唯一嗰道嘢,**同 D11 tracing 同形狀**)②一條 test assert **constructor 完全冇被 call**(「佢 throw 咗」對一個建咗 client 先失敗嘅版本一樣成立)。secret 走 `ConfigService` 唔走 `ConnectorConfig`(**ADR-0013 Model C**;加 DB 欄仲會係 H1)。<br>⚠️ **我個 falsification script 自己喺「令人安心」嗰方向壞咗**:jest 成功時把 summary 寫去 **stderr**,而 script 成功路只讀 stdout ⇒ baseline / restored 兩行 `NO TEST LINE`,即「還原乾淨」冇驗到。補跑真 jest(36/36)+ `git diff --stat`(零殘留)先收 —— **同 G7 嗰句「risk metric 喺令人安心嗰方向出錯衰過冇 metric」同源** |
| 2026-08-16 | 🟢 **期二 `G5` 拆兩半,`G5-A`(run expiry / OQ-5)落地** —— api **1289 → 1308 / 88 → 89** · web **414 → 415**(6 紅 = pre-existing)· 兩邊 tsc 0 / lint 0 · **falsification ×9 真紅零誤傷**。🔴 **R3:拆兩半嘅理由唔係工作量** —— **`G5-B`(BullMQ)會改 API 契約**(`POST /agent/runs` 而家同步等 LLM 返 `AgentRunDto`,推去 worker 就變成返一個 pending run ⇒ F8 張卡要改),**而前端點知幾時完 = 就係 `G6` SSE** ⇒ **B 同 G6 係同一件事嘅兩半**,B 冇 G6 就要 polling,而 polling 唔係過渡係一個會留低嘅設計 ⇒ **等 Chris 一句**。<br>🔴🔴 **OQ-5 ① 指住一個真 bug,唔止係一個門檻**:`resumeRun` 個 R16 檢查 **throw 咗但唔改 row**,而佢排喺 `try` **之前** ⇒ 永遠唔會經 `failRun` ⇒ run 停喺 `awaiting_approval` **永遠**;加上 OQ-3 ⇒ **嗰張單永遠開唔到新 run,平台冇自愈路**。⚠️ **成個檔其他路都處理咗,就係呢個早退冇,而冇任何嘢係紅嘅。**<br>🔄 **我更正咗自己嘅 ④ 建議**:`OutboundFailure` → **`AgentStep`** —— 前者係**重做得到嘅嘢**嘅佇列(有 retry 掣)而過期 run 重做唔到,擺個永遠撳唔得嘅掣落 Delivery failures **同 G1 嗰個 `Nothing proposed.` 一模一樣嘅錯**。<br>🔴 **兩個入口一個實現**(`expireRun` 機制 / sweep 決定幾時)—— **唔係品味**:`agent.boundary.spec.ts` assert **`AgentStep` 只有一個 writer**,跟 **CH-015 `openSyncGate`** 形狀。<br>🔴 **兩個刻意唔做**:①sweep **唔掃 `running`**(有 in-flight call,由另一個 process 令佢過期就係平台講一件仲做緊嘅事做完咗;要 heartbeat 唔係門檻)②過期 proposal **唔寫 `decidedAt`**(寫咗就令佢入 G7 人口做 rejection ⇒ **一隊人愈唔審批准率愈低,睇落愈嚴謹**)。<br>🟢 **F11-1b 嗰個對比拎到實證**:`'expired'` 入 union ⇒ web tsc 即出**兩個 `TS2741`**(`RUN_TONE`/`RUN_LABEL`),而隔籬 `Record<string, string>` 嘅 `STEP_LABEL` **一聲不響**。<br>🔴🔴 **順帶修咗 F11-1b 自己一個缺口**:`PLATFORM_KEYS` 係 hardcode,註釋寫住「for renames」⇒ **對新增完全靜音**;同一個檔守住同一個 map,registry 嗰半 derived、platform 嗰半 written-down ⇒ **兩半兩種強度,而弱嗰半正正就係今日踩中嗰半**。<br>⚠️ **falsification ⑧ 出乎預期(紅咗),而個教訓係方法論**:要證「舊版盲」就要**同時**拆走 label(⑨ = **5 綠**)—— **一個 mutation 證唔到嘢,唔等於個 claim 錯,可能只係 mutation 揀錯咗位** |
