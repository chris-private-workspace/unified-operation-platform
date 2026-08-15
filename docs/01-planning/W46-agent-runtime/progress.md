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
