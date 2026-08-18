# W48 — Conversation session · Progress

> Phase `T2-c`。**`plan.md` 而家係 `draft`,未 approve ⇒ 零 code。**

---

## Day 0 — 2026-08-18(kickoff,**未 approve**)

### 點解而家開得

W47 `T2-a` **closed**(acceptance 8/8,部署 #10 上咗 DEV)。scope report `§4` 個建議次序係
`T2-a` → **`T2-c`** → `T2-d` → `T2-e`,而 `T2-c` **冇前置依賴**(表入面佢個「依賴」欄係空)。

⚠️ `T2-d`(dock)反而**等緊本 phase** —— 佢依賴 `T2-c` 加 `B6`,而 `B6` W46 已收。

### Kickoff 做咗

1. **掃 phase 號**(PROCESS §2.1)—— `git fetch --all --prune` + `git ls-remote --heads`:
   remote **只剩 `main`**,`docs/01-planning/` 最大係 **W47** ⇒ 揀 **W48**。
   📌 順帶見到 `W36` 真係有**兩個 folder**(`W36-n8n-intake-adapter` / `W36-opco-budget-gate`)
   —— 就係 PROCESS 提過嗰個撞號實例,所以呢一步唔可以跳
2. **Grounding**(讀 code 唔靠記憶)—— 見下面兩條
3. 寫 `plan.md` **draft**,七條 OQ

### 🔴 Grounding 揾到兩件事,而佢哋直接決定咗 plan 點寫

**① `AgentMessage` 綁死一個 `runId`,佢係 run transcript 唔係 chat。**

```prisma
model AgentMessage {
  runId String
  run   AgentRun @relation(..., onDelete: Cascade)
  role  String   // user | assistant | thinking | tool_call | tool_result
  ...
}
```

睇落「加個 `conversationId`、把 `runId` 改 nullable」就搞掂 —— 而嗰個改動**唔係加欄**:
`ADR-0036 D6` 講「`AgentMessage` **永久保留**,唔設 retention」,而嗰句原本只係講
**run transcript**。放寬之後同一張表會連 chat 一齊「永久保留」,而 chat **含 PII、量級唔同**。

⇒ 呢個係**改一條已 Accepted 決定嘅覆蓋範圍**,同 `ADR-0035` 嗰個「收窄範圍 vs 推翻」判斷
同族 ⇒ 寫入 `OQ-B` + `R2`,**唔喺 plan 度自己拍板**。

**② 今日條 SSE 送唔到 chat 要嘅嘢。**

`agent-run.controller.ts` 用 `@Sse(':id/events')`,而 `agent-run.queue.ts` 個 `changes()`
送嘅係 `{ runId, type: 'ping' }` —— controller 個 `@ApiOperation` summary 逐字:
**「Payload carries no content — refetch the run」**。

⇒ chat 要 token-by-token,係**另一種** stream。而 `B6`(SSE 喺 DEV 真通)證嘅係
**heartbeat + 短事件**,**唔係一條長時間 token stream** ⇒ `F4` 唔可以當佢已經證咗。

### 🔴 點解七條 OQ 全部係 OQ,唔係「實作細節」

W47 開工前有四條 OQ,答完之後**最重嗰個 phase 整個消失**(`T2-b`)。呢次個形狀類似但
方向相反:**答案會令交付物變大定變細,而唔係只影響寫法**。

| OQ | 兩個答案嘅交付物差幾遠 |
|---|---|
| `OQ-B` schema | A = 純 additive migration;B = 改既有表 + **重新界定一條 Accepted 決定** |
| `OQ-E` streaming | SSE = 零新 dep;WebSocket = **H2 新 dependency** + 另一份 ADR + ACA ingress 未驗 |
| `OQ-D` 冇 context 嗰陣睇到咩 | 呢條係**安全邊界**,唔係 UX |
| `OQ-G`(= scope report `OQ-4`)retention | **H4**。唔答就唔應該落 migration |

⇒ 所以 `plan.md` **冇寫 Effort、冇 `end_date`、§5 day-by-day 刻意留空**。
📌 W46 / W47 兩次估算都係**喺 scope 定死之後**先準;而家未到嗰步,寫個數落去就係假裝定咗。

### ⚠️ 本 phase 兩條真紅線(其餘 acceptance 係例行)

- **`G3` 舊 run 嘅 transcript 讀路零改動** —— 防「順手改咗既有表」
- **`G4` chat 唔可以繞過 approval** —— 對話介面令「叫佢做嘢」感覺輕,而 `ADR-0036 D3`
  個 human-in-the-loop **就係 Tier 1 成個安全論據**(`R1`)

### 🚧 卡住 / 未做

- ~~七條 OQ 全部未答~~ **✅ 同日答齊**,見下
- ~~`checklist.md` 未 derive~~ **✅ 已 derive**
- ⚠️ **本機 DB 仲欠 apply 兩個 migration**(`ch031_agent_run_hidden_at` · `w47_agent_profile`)
  —— 要停 `ai-doc-extraction-db` 交還 5433(**要 Chris 批**),而且**一定要
  `prisma migrate deploy` 唔可以 `dev`**

---

## Day 0(續)— 2026-08-18 · 七條 OQ 答齊,`draft → active`

### 🟢🟢 兩條最貴嘅分支都答咗細嗰邊

| OQ | 決定 | 換返嚟嘅嘢 |
|---|---|---|
| `OQ-B` | **新 model** | **`ADR-0036 D6` 一個字唔使郁** · migration **純 additive** |
| `OQ-E` | **SSE** | **零新 runtime dependency ⇒ 唔觸發 H2 ⇒ 唔使第二份 ADR** |

⇒ 本 phase 由「可能兩份 ADR + 改一張既有表」變成「**一份 ADR + 純 additive schema**」,
Effort 估得返 **≈23h / 4 日**。

⚠️ **但「細咗」唔等於「淺咗」** —— `§0` 嗰句仍然成立:呢個係一個**新嘅互動模型**,
唔係一個新 endpoint。`G4`(chat 唔可以繞過 approval)同 `R1` 就係為咗呢點存在。

### 🔴 `OQ-G` 個答案開咗一條新問題,而佢撞正上星期先做完嘅嘢

`OQ-G` 答「**一直存在,直至清掉**」。⇒ 冇自動 retention,**但要有一條「清」嘅路**。
而「清」係咩,冇定 ⇒ 開 **`OQ-H`**。

呢條唔可以順手決定,原因有兩層:

1. **`ADR-0040`(CH-031,2026-08-17 Accepted)喺隔籬一個 model 上面啱啱先揀咗 soft** ——
   agent run 唔准 hard delete,理由係三張子表 `onDelete: Cascade` 而佢哋係 audit 真相。
   對話揀 hard 就會令平台喺兩個相鄰 model 上面有**兩個相反答案**,而
   `ADR-0022 D1 → ADR-0040` 呢條線一直係「同樣效果,單邊代價 ⇒ 唔取」。
2. **但同一份 `ADR-0040` 自己明文把呢條問題推咗過嚟**,逐字:
   > **唔解決 GDPR-style 徹底移除**……佢同 `agent-tier2-scope.md` **OQ-4** 係同一條問題。
   > **本 ADR 明文唔碰佢。**

   ⇒ `OQ-G` 個答案**正正就係 ADR-0040 推走嗰條問題**,而家輪到本 phase 答。

📌 **形狀值得記低**:一個 ADR 明文「唔碰」某件事,唔等於嗰件事消失 —— 佢只係**排咗隊**,
而隊頭就係下一個掂到同一個資料嘅 phase。**W48 就係嗰個 phase。**

### ⚠️ 一個估算上嘅已知弱點,寫低咗先開工

`F4`(streaming)係**本 phase 唯一一件平台完全冇做過嘅嘢** —— 今日條 SSE 送 `{runId}`
叫人 refetch,同送 token 流係兩件事,而 `B6`(SSE 喺 DEV 真通)證嘅係 **heartbeat + 短事件**。

⇒ **`F4` 最可能爆,而佢爆嘅話 `F5` 一定跟住爆**(UI 冇嘢 stream)。已寫入 `plan.md §5`。

---

## Day 1 — 2026-08-18 · `F1` ADR-0041(`Proposed`)

`OQ-H` 答咗 **soft** ⇒ 八條 OQ 齊,寫成 `ADR-0041` 嘅 **D1–D9**。

### 🔴 寫嘅過程揾到一個 alternative,而佢嘅吸引力正正係佢嘅危險

`Alternative A`(放寬 `AgentMessage`:加 `conversationId`、`runId` 改 nullable)——
**佢係最省事嗰個**:唔使開新表、唔使諗兩張表點分工。

而佢實際上係:

| 睇落 | 實際 |
|---|---|
| 慳一張表 | **改一條 Accepted 決定嘅覆蓋範圍**(`ADR-0036 D6`「永久保留」原本只係講 run transcript) |
| 一個 migration | `NOT NULL → NULL`,**唔可逆** |
| 冇風險 | 靜靜令一批**含 PII、量級唔同**嘅資料變成「永久保留」 |
| —— | 🔴 **而且冇任何一條 test 會紅** |

📌 **形狀**:一個 alternative 之所以危險,唔係因為佢明顯咁差,係因為佢**喺 diff 上面睇落
好細**。呢個同 `ADR-0040` 當時否決 hard delete 嘅理由結構一樣 —— 嗰次都係「一行 code,
而後果喺三張別嘅表」。

### 🔴 `OQ-G` + `OQ-H` 嘅淨效果,誠實寫咗落 Consequences

`OQ-G` 答「一直存在,**直至清掉**」;`OQ-H` 把「清」定義成 **soft** ⇒
**實際語意係「直至隱藏」**,而一條含 PII 嘅對話喺平台側**冇任何路徑真正移除**。

⚠️ 我建議過「soft 為主 + 一條明文 hard 路留畀 H4」,**冇被取納** ——
所以 ADR 寫成**知情取捨**,唔係一個未發現嘅缺口。

📌 **順帶記低一個形狀,因為佢會再出現**:
**`ADR-0040` 明文把 GDPR-style 徹底移除推咗畀 `agent-tier2-scope.md OQ-4`,而 `OQ-4` 就係
本 phase 個 `OQ-G` —— 然後本 ADR 又推多一次。**
⇒ **一條冇人拒絕、但每次都排喺後面嘅問題,同一條被否決咗嘅問題,喺文件上睇落一模一樣。**
分別只喺於前者每次都留低一句「本 ADR 明文唔碰佢」,而嗰句就係佢仲存在嘅唯一證據。

### 兩個決定係「唔可以合併」而唔係「加咗啲嘢」

- **`archivedAt` ≠ `AgentRun.hiddenAt`**(D7)—— 一條 archived 對話入面可以有一個
  **冇被 hide** 嘅 run,而嗰個 run 仍然應該出現喺全域 run 列表
- **chat 個 SSE ≠ `agent-run.queue.changes()`**(D5)—— 後者 payload 明文冇 content
  (`ADR-0039 F10`),合併就等於推翻 F10

⚠️ 兩個都係「睇落可以共用,實際上共用就會靜靜改咗一條既有決定」——
同上面 `Alternative A` 同一族,**一日之內第三次**。

### 🚧 下一步

- **`F1-5` 等 owner `Accepted`** ⇒ 先可以落 `F2` migration(plan `F1-5` 就係咁寫)
- `F0-6` 本機 DB 兩個 pending migration 仲未 apply(要批停 `ai-doc-extraction-db`)

---

## Day 1(續)— 2026-08-18 · `ADR-0041` Accepted + `F2` schema

**Chris 2026-08-18 批 `D1–D9` 連 Consequences** ⇒ `F1-5` 收,`F2` 開工。
schema 三格落齊,`prisma validate` **exit 0**,`prisma generate` **exit 0**。

### 🔴 落 schema 嗰陣撞到一個名字碰撞,而佢要 owner 一句話

`ADR-0041 D1` 個新 model 叫 **`AgentTurn`**。而 `agent-runtime.provider.ts:115` **一早已經有**
`export interface AgentTurn` —— 佢係 **seam 嘅 turn**:一次 runtime round-trip 嘅正規化結果
(`status` / `state` / `pendingApprovals` / `providerItems`),`ADR-0017 D2` 叫呢套詞彙
「the core design work of a seam」。

⇒ **同一個 module 入面,同一個名,兩個完全唔同嘅意思**:

| | `AgentTurn`(seam,今日已存在) | `AgentTurn`(Prisma,ADR-0041 D1) |
|---|---|---|
| 係咩 | 一次 LLM round-trip 嘅結果 | 一句對話 |
| 住喺 | `agent-runtime.provider.ts` | `@prisma/client` |
| 已經有邊個 import | `ai-assist.service.ts` · 兩個 provider · 兩份 spec | (未有) |

⚠️ **佢唔係理論上會撞** —— `F3` 個 conversation service 要**同時**用兩個(開 run 要 seam 嗰個、
寫對話要 Prisma 嗰個),嗰刻一定要 alias 其中一個。

📌 **而家係最平嘅時刻**:migration 未生成、零 code 用緊佢。落咗 migration 之後改名就要另一個
migration。**已寫入下面「等 Chris 決定」,schema 暫時照 ADR 用 `AgentTurn`(spec wins)。**

### 🔴 順手揾到一條「一直綠係彩數」嘅既有 test

`permissions.spec.ts` 嗰條 `AgentPrincipal carries no Role in the schema`,個 slice 係
`indexOf('model AgentPrincipal {')` → `indexOf('model AgentRun {')`。

**而 `AgentRun` 早就唔再係下一個 model** —— W47 插咗 `AgentProfile`,W48 再插兩個 ⇒ 佢**今日
檢查緊四個 model**,而佢個名同註釋都只講一個。

🔴 **佢一直冇紅唔係因為設計啱** —— 係因為 assert 係 `not.toContain('Role')` **大楷**,而我新加
嘅 `AgentTurn.role` **啱好係細楷**。⇒ 終點改成 `model AgentProfile {`。

📌 **形狀**:一個用「下一個 X 喺邊」做邊界嘅 test,佢嘅覆蓋範圍會**隨住有人插嘢入中間而靜靜擴大**,
而擴大方向係**多檢查咗嘢**(睇落更安全)⇒ 冇人會因為佢紅而發現。同 W46 `B3`(兩個 provider spec
各自正確,而「兩個實作一致」冇一個單一 spec 講得到)一樣,係**test 嘅覆蓋面同佢聲稱嘅嘢唔對數**。

### `F2-5` 個 test 刻意唔係 behaviour test

`Alternative A` 落地之後,**平台行為一模一樣** ⇒ 任何 behaviour test 都會照綠。要捉到佢,
就只可以釘 **shape**(schema source scan)。

**falsification 兩輪,零誤傷**:

| 輪 | 拆走乜 | 結果 |
|---|---|---|
| 1 | `AgentMessage.runId` → `String?` | **恰好第 1 條紅**,錯誤訊息逐字印住 `runId String?` |
| 2 | `AgentMessage` 加 `conversationId` + `AgentConversation` 加 `messages` | **恰好第 2、3 條紅** |

⇒ 兩輪都答到 W47 `F3-6` 嗰條問題(「紅嗰個原因係咪我想證嗰個」),而唔止係「有嘢紅」。

### 兩條都即日答咗 ⇒ `F2` 全收(`F2-6` DEV 除外)

**Chris 2026-08-18 兩個都跟建議**:①Prisma 側改名 **`AgentChatTurn`** ②批停 `ai-doc-extraction-db`。

**改名**:schema 兩處 + `ADR-0041` 加 **`Errata E1`**(**`D1` 個 code block 一個字唔改** —— §6
「`Accepted` 唔改內容」)+ **一條新 test 釘住**(`model AgentTurn {` 唔可以出現喺 schema,
而 seam 嗰個必須仍然喺度)。

📌 **點解要一條 test 而唔係一句註釋**:`D1` 仍然寫住 `AgentTurn`,所以**下一個照 ADR 落實嘅人
會伸手攞返呢個名**;而 Prisma model 同 TS interface 撞名係**靜靜**撞 —— 兩個都係 importable
type,要兩個嘅嗰份 file alias 一下就行得通,冇任何嘢會紅。

### 🔴 借 5433 揭到一個掛咗兩日嘅過時前提

`F0-6` 寫住「本機 DB 欠 apply 兩個 migration」。**實際上一早 apply 咗** ——
`prisma migrate status` 返 **`27 migrations found` + `Database schema is up to date!`**。

📌 **成因**:本機 DB **兩個 worktree 共用**,而嗰兩個 migration 係另一邊做嘅 ⇒
**「我呢邊未做」推論唔到「DB 未做」**。而查一次 `migrate status` 就答到,成本 = 一條命令。

⚠️ 同族:呢個同 §9 一路記低嘅「有設定 ≠ 設定啱」、「revision `Healthy` ≠ DB 通」一樣 ——
**一個本地觀察被當成一個全域事實**。

### `F2-4` 收貨標準係落 DB 對真結構,唔係睇 `migrate deploy` exit 0

`20260818055347_w48_agent_conversation` —— `ADD COLUMN` ×1 · `CREATE TABLE` ×2 ·
`CREATE INDEX` ×4 · `ADD FOREIGN KEY` ×5,**零 DROP**。

`\d "AgentConversation"` 對返嚟嘅嘢入面,最值得留意嘅係 **`Referenced by` 兩條**:

```
TABLE "AgentChatTurn" … ON DELETE CASCADE
TABLE "AgentRun"      … ON DELETE RESTRICT
```

⇒ 嗰個**刻意唔對稱**嘅設計喺真 DB 兌現咗:一條開過 run 嘅對話,DB 層面**刪唔到**;
冇開過 run 嗰啲刪得,連 turn 一齊走。兩者都冇 endpoint(`D7`)—— 呢個純粹係「有人繞過平台
直接落 DB」嗰陣 DB 做嘅嘢。

### `G3` 補咗 DB 層證據,而嗰 36 行係重點

`information_schema.columns` 實查:`AgentMessage.runId` **`is_nullable = NO`** ·
`AgentMessage` **冇 `conversationId`** · `AgentRun.conversationId` **`YES`**。

⚠️ 而 **`AgentMessage` 有 36 行真資料** ⇒ `G3` 唔係喺一張空表上面講嘢。`Alternative A`
要改語意嘅,就係嗰 36 行 —— 而佢哋每一行都係 `ADR-0036 D6`「永久保留」講緊嗰啲。

### 🚧 下一步

- **`F3`**(conversation service + endpoint)—— 唔使真 DB(Prisma client 已 generate,test 行 mock)
- `F2-6` DEV migration 等部署

---

## Day 2 — 2026-08-18 · `F3` Conversation service + endpoint

api **94 → 97 suites / 1430 → 1469** · web **44 files** 唔變(F3 冇 UI)· test / lint / build **三個 exit 0**。

### 🔴🔴 開工 grounding 揾到一件會令成個 `F3-4` 做錯嘅事

`ADR-0041 D3` 逐字寫:「`requestId == null` 嘅對話,`get_request` 呢類 tool **收唔到一個
request id**」。**呢句假設咗 requestId 係平台傳落 tool 嘅 context。實況相反**:

```ts
// tool-registry.ts:283-290
parameters: { properties: { requestId: {…} }, required: ['requestId'] }
execute: async (args, ctx) => {
  const requestId = requireString(asRecord(args), 'requestId');   // ← model 自己填
  assertOpcoScope(ctx.user, request.opcoId);                       // ← 唯一嘅閘
}
```

`AgentToolContext` 由頭到尾得 `{ runId, user }` ⇒ **「一條對話睇到咩」完全由 OpCo scope 決定,
同 run 掛住邊張 request 零關係**。一條冇 context 嘅對話可以 `list_pending_requests` 攞晒
OpCo 內所有 request,再 `get_request` 逐張睇。

⇒ **照字面實作 `D3` 係做唔到嘅**。忠於佢意圖(`ADR-0036 D2`「見唔到」比「叫佢唔好用」強一個
數量級)嘅唯一路,係令嗰啲 tool **唔出現喺 tool list** —— 而咁就要郁 registry 個 contract。

📌 **形狀**:一份 ADR 可以完全正確噉描述**要達到嘅性質**,同時錯噉描述**達到佢嘅機制** ——
而兩者喺文字上分唔開。`D3` 個「攞唔到」係啱嘅,「收唔到 request id」係錯嘅,而如果我照住第二句
寫 code,寫出嚟嘅嘢會**睇落完全符合 ADR**。

### 🟢🟢 `list()` 收 required 參數,tsc 即刻兌現咗個決定

`list(ctx)` 加 **required** 參數(唔用 optional fail-open),`all()` 返全部。理由:
一個 provider call `all()` 係**一眼睇得出佢跨咗界**,一個 provider 唔記得傳參數係 **compile error**。

⇒ tsc 捉到 **兩個我完全冇預料嘅 production caller**:

| 位置 | 我點知都唔知 |
|---|---|
| `claude-tool-runner.provider.ts:340` | 我改咗 `:272` 同 `:414`,**第三處喺 resume 入面執行已批准嘅 tool** |
| `auth/permissions.controller.ts:57` | **權限矩陣讀 tool list**,而佢住喺 **另一個 module** |

📌 **如果用 optional 參數,呢兩個位會靜靜保持舊行為** —— 而其中一個(權限矩陣)一旦用咗
filtered list,W28 個 locked snapshot 就會**隨住邊個 run 被問而變**。

### 三個 call site 唔對稱,而唔對稱本身係決定

| call site | 用邊個 | 點解 |
|---|---|---|
| openai `:439` · claude `:414`(畀 tool 落 SDK) | `list(ctx)` | 呢度就係「model 見到咩」 |
| claude `:272`(認返 saved state 嘅 pause) | **`all()`** | filter 咗會令一個 pause **消失**,而消失嘅 pause 係 `undecided` **數唔到**嗰個 ⇒ 靜靜放行 |
| claude `:340`(執行已批准嗰個) | `list(ctx)` | 最後一道閘,揾唔到就 **fail loud** |
| permissions matrix | **`all()`** | 佢描述平台建咗咩,唔係邊個 run 用得咩 |

### 🔴 falsification 第一次做錯咗,而錯法正正係 W47 記低嗰個

拆 `inputFor` 嗰陣我寫 `if (!run.conversationId || true)` ⇒ 後面 code unreachable ⇒
**六個 suite compile error**。「有嘢紅」但**紅嘅原因唔係我想證嗰個**(W47 `F3-6`:33 紅但原因唔啱)。

改成**保持結構**嘅拆法(照行 query、照 throw,只係 return 錯嘢)⇒ **恰好 1 條紅,零誤傷**。

📌 **教訓具體化**:falsification 要拆嘅係「**呢個決定**」,唔係「呢一行」。一個令 file 編譯唔到
嘅改動,證明嘅係「file 存在」。

### 兩個 ADR 冇明文、而我要自己決定嘅位(都寫咗落 code)

**① 對話 owner-only,連 ADMIN 都唔見。** 平時嗰個 bound 喺度**唔存在** —— `getRun` 靠 run 個
**request** 做 OpCo scope,而對話可以冇 request。剩返唯一誠實嘅 bound 就係 `startedById`。
⚠️ **唔等於 agent 活動避開 admin 視線**:對話開嘅 run 係普通 run,照樣出現喺全域 run 列表,
transcript 照樣 ADMIN 可讀 —— **私隱嘅係 chat 外殼,唔係 agent 做過乜**。

**② archive 唔寫 audit,而理由同 `ADR-0040 D5` 唔同族。** 嗰條存在係因為 hide 係 **ADMIN 郁
人哋睇得到嘅嘢**;archive 係人收起自己一條**其他人本來就讀唔到**嘅對話 ⇒ 寫 audit 就係記一件
**冇第二方**嘅事。

### `F3` 刻意留咗一半畀 `F4`

`POST /:id/turns` 返 `{turn, runId}`,**唔返 agent 個答覆**,亦**未寫 assistant turn**。
run 背景執行係 `ADR-0039 F1` 由 W46 起就有嘅形狀;而「run 講嘅嘢點樣返到對話」**就係 `F4` 本身**。

### 🚧 下一步

- **`F4`** streaming + assistant turn 寫返落 `AgentChatTurn`(⚠️ writer 仍然只可以係
  `agent-conversation.service` —— `F3-9` 條 boundary test 會捉)
- `F4-3` **turn 上限 / history 截斷**(`D9` 要求有,唔指定形狀)
- `F2-6` DEV migration 等部署

---

## Day 2(續)— 2026-08-18 · `F4` Streaming + history

api **1469 → 1480**(suites 唔變 97 —— F4 冇新 spec file)· web 44 · lint / build **0**。

### 🔴🔴 開工先查到兩件事,而第二件令 `F4` 個 scope 要 owner 決定

**① 今日 conversation run 完全冇 history。** `executeRun` → `runtime.start(setup, latest.content)`
—— **只送最後一句**。即係話 `F3` 交付嗰條「對話」,實際上係**一串互不相干嘅問答**。
而 `D9`/`R3` 講「每個 turn 帶住成段 history ⇒ 成本非線性升」**正正假設咗有 history** ⇒
呢個唔使問,`F4` 一定要加。

**② 真 token 流要擴 seam。** `AgentRuntimeProvider.start()` 返一個完整 `AgentTurn`,**冇
streaming 面**。實查 `node_modules`:`@openai/agents` 有 `StreamedRunResult`(`run.d.ts:223`)
⇒ OpenAI 側做得到;**Claude 側 grep 唔到**(未確認),而 `ADR-0036 D1` 要求兩個 runtime 行為
一致、`agent-runtime.contract.spec.ts` 就係守呢條。

⚠️ **仲有一個 `ADR-0039 F10` 冇預料到嘅後果**:今日**所有** model 輸出都經 `scrubPii` 先落
`AgentMessage`。一條 token 流會係**第一條繞過佢嘅路**。

⇒ **Chris 2026-08-18 揀 turn-level notify**,`plan.md §8` 有 deviation 記錄(R3)。

### `F4-2` 個 fail loud,實質係「唔好令人等」

落咗兩層:`recordAssistantTurn` 個 publish 喺 **`finally`**;worker 個 `catch` 一樣 call 佢
再 rethrow。

📌 **點解呢個先係重點**:一條**只收到成功消息**嘅 thread,個畫面會**永遠顯示「思考緊」**,而
**等緊嘅人唔會 retry**。⇒ **一個停滯讀落去似進行中** —— 同 `R16` 講嗰個「一個睇落完成咗嘅失敗」
係同一族,方向相反。

### `F4-5` 個問題係「個回覆由邊度攞」,而兩條路都唔啱

| 路 | 點解唔得 |
|---|---|
| 由 `AgentRun` 讀返 | **`finalOutput` 根本冇存落 DB**,佢只喺 `executeRun` 個 return value |
| 由 `AgentMessage` 讀返 | 佢 **ADMIN-only + 永久保留**(`ADR-0036 D4/D6`)⇒ 由嗰度攞個回覆畀 owner 睇,就係**靜靜把一張 admin-only 審計表變成 user-facing** |

⇒ **worker 拎住 `executeRun` 返嘅 result 交畀 conversation service**。而 worker 做 caller
(唔係 `AiAssistService`)係因為 `AgentConversationService` 已經依賴 `AiAssistService`
⇒ 反向邊就係一個要 `forwardRef` 嘅循環,而 `agent.module.ts` **為咗同一個理由已經避過一次**
(queue 同 worker)。

### `F4-3` 兩個上限一齊,因為單獨一個都會喺對方蓋住嗰個 case 失效

`MAX_HISTORY_TURNS = 20` + `MAX_HISTORY_CHARS = 20_000`:20 個一字 turn 唔使錢,
兩個 `MAX_TURN_LENGTH` 嘅 turn 就 8000 字。

🔴 **截斷會自己出聲**(`[N earlier turn(s) omitted]`)—— 一個收到**靜靜縮短版** history 嘅 model,
會就住佢睇唔到嘅 turn 講「as discussed earlier」,而讀嗰個人**分唔出**。

### ⚠️ history flatten 成文字係一個有代價嘅取捨

seam 收 `input: string`,送結構化 message list 要**擴 seam = H1** —— 而本 phase 個 streaming
決定啱啱行咗相反方向。⇒ 用 `Person:` / `You:` 拼一段文字。

**代價寫咗落 code**:model 讀嘅係一份**轉述**而唔係參與一場對話,而**早前 turn 嘅 tool call
唔喺入面**(只有 agent 最後講嗰句)。

### 🚧 下一步

- **`F5`** 最小 UI(**H6**)—— ⚠️ chat 氣泡 / streaming 游標 handoff 冇 ⇒ **開工前先跑
  `ui-design`**,唔好等 render 先知要 STOP(`R6`)
- `F2-6` DEV migration 等部署 · `F7` live 驗

---

## Day 3 — 2026-08-18 · `F5` 最小 UI(`/assistant`)

web **44 → 45 files / 464 → 473 tests** · api 唔變(97 / 1480)· lint / build / tsc **全 0**。

### 🟢🟢 兩個 plan 預咗會 STOP 嘅 H6 風險,實際上都冇發生

| plan 預咗 | 實況 |
|---|---|
| chat 氣泡要新 primitive | `Card` 層 token 砌得到(1px border + surface tint,DS-7)⇒ **組合既有 primitive**,`§5` 明文「直接做」 |
| streaming 游標要新 pattern | **消失咗** —— `F4` 揀咗 turn-level notify,**冇 token 流就冇游標** |

📌 **第二行值得記低**:一個 **transport 層**嘅決定,順手清走咗一個 **UI 層**嘅 H6 風險。
兩件事喺 plan 入面分開兩格(`F4-1` / `F5-2`),而佢哋實際上係同一個決定嘅兩面。

### 🔴 但有一件 plan 冇講,而佢一定要 owner 落

`/agent` 係 **ADMIN-only**(`canManageAgentProfiles`),而對話係 **ADMIN + REGIONAL**(`D6`)
⇒ **chat 塞唔入去**,一定係新 route + 新 sidebar entry,而 `design-system.md §6` 明文要求
新畫面登記「邊個批 / 幾時」。Chris 2026-08-18 批 `/assistant` + sidebar。

⇒ 順帶做成 **OPERATIONS section 第一次帶 role predicate**(之前只有 ADMIN section 有,W31)。
**點解唔擺 Administration 借佢個 gating**:Assistant 係營運工具唔係 admin 功能,擺錯 section
就係把一個日常工具歸錯類。

### 🔴 我講錯咗一半嘅嘢,tsc 捉到

`F3-2` 我寫「`canUseAgent` **喺 code 入面唔存在**」—— **只對 api 側成立**。
`apps/web/src/lib/roles.ts:61` **W46 F8 就已經有**,ADMIN + REGIONAL,語意逐字啱。

我差啲加咗第二個同名 function,靠 **`tsc TS2323`(Cannot redeclare)** 捉到。

📌 **形狀**:一個 monorepo 入面,「grep 唔到」只係「喺我 grep 嗰半 grep 唔到」。而我當時
**確實只 grep 過 `apps/api/src`** —— 個結論本身冇錯,錯喺我把佢講成一個關於「code」嘅陳述。

### `F5-4` 兩條 test,而第二條先係持久嗰條

①behavioural:有 link 去 request · **冇** `/approve|reject/i` 掣
②**source scan**:`assistant.tsx` 唔可以出現 `useDecideProposal` / `useApprove` / `/proposals`

🔴 **點解要第二條**:第一條**只擋到一個串住「Approve」嘅掣**,將來一個叫 `Accept` 嘅一樣過。
同 `ADR-0036 D2` 同一個論據 —— **absence beats instruction**。

### falsification:拆走 `isThinking` 個「只睇最新」

⇒ **恰好 1 條紅**(`does not show Thinking… when only an older run is unfinished`),8 綠。
呢個閘釘住嘅係一個真實 failure:一個三條問題之前就 abort 咗嘅 run,會令成條 thread
**永遠**顯示「Thinking…」。

### 🚧 下一步

- **`F5-3`** light + dark 真 render(`render-check.mjs`)—— **要起本機 stack ⇒ 要批停
  `ai-doc-extraction-db` 交還 5433**。⚠️ 「一個 view 一個 primary」嗰半**唔使等 render**,
  已有 test 數 `button.bg-accent` = 1 兼且係 `Send`
- `F6` gate 收尾 · `F7` live 驗 · `F2-6` DEV migration 等部署

---

## Day 3(續)— 2026-08-18 · `F5-3` render + `F6` gate + `F7` 本機 live

Chris 批咗借 5433。**一氣呵成做完**(CLAUDE.md 記低 5433 揸唔穩,唔好中途停)。
web **473 → 474**(+1)· api 唔變(97 / 1480)· lint / build / tsc-web **全 0**。

### 🔴🔴 render 捉到一個六條 test 全綠都捉唔到嘅缺陷 —— 本次最值錢嗰件事

畫面**同時**出 `Thinking…`(spinner)同「AI-Assist has proposed something」。
成因:`LIVE_STATUSES` 包 `awaiting_approval` ⇒ **同一個 run** 令 `isThinking` 同
`runAwaitingDecision` 一齊為真。

📌 **點解五條 assert 全部漏咗佢**:每一條都問「**某樣嘢**喺唔喺畫面」,而呢個缺陷係
「**兩樣嘢一齊**喺畫面」。同 `CH-030` 嗰個 `items-center` 同族 —— 嗰次 test 問「字喺唔喺度」,
缺陷係「佢喺邊」。**一個畫面級嘅缺陷,住喺每條 assert 嘅縫之間。**

🔴 **後果唔止難睇**:spinner 叫人**等**,而 parked 狀態下冇嘢會再發生 —— 佢要自己去撳。
呢個係 `R16`「stall reads as progress」嘅**鏡像**:**progress reads as stall**,
令人唔去做應做嘅事。

**修法**改最窄嗰層(`isThinking` 剔走 `awaiting_approval`;`isLiveRun` 一個字唔郁,因為佢講
「run 未完」本身係啱嘅)。新 test **assert 個 PAIR**(有 link **兼且** 冇 spinner)——
任何一半單獨 assert 都會繼續綠。falsification:拆走嗰行 ⇒ **1 紅 9 綠**,紅嘅原因
(`expected <div><svg…></div> to be null`)**就係我想證嗰個**。

### 🟢🟢 `OQ-D` live:對照實驗,唔係單邊觀察

**唯一變數 = `requestId` 在唔在**,同一句說話 · 同一個 profile:

| | 冇 request context | 有 request context |
|---|---|---|
| agent 答 | 「I can't access pending requests or REQ0044067 **with the available tools**」 | 真叫 `list_pending_requests`,列出兩張單 |
| `steps` | 只有 `start`(`detail` = `with no request context`)= **零 tool call** | `start` + `list_pending_requests` **ok** + `get_request` |

🔴 **點解一定要做對照**:單睇左邊,「filter 生效」同「model 純粹唔想叫呢個 tool」
**睇落一模一樣**。呢個就係 W47 `G8` 嗰個教訓 —— 部署唔會幫你做對照,要人再做一次。

### 斷線重連:問到底之後,答案有三段

殺 api 鏈(保住 web 同個頁面)~140 秒再起返:

1. 斷線期間送 turn ⇒ 畫面**唔郁**(7 個氣泡,DB 已經 9 個)
2. 切走一條 thread 再切返 ⇒ **即刻 9 個** ⇒ **資料一直喺度,唔通嘅係 SSE 唔係 read**
3. remount 之後再送 ⇒ **自動變 11,冇 click 過** ⇒ 重連真通

📌 成因唔係 bug,係一個有名有姓嘅 bound:`MAX_CONSECUTIVE_FAILURES = 3`,寫落去係為咗擋
403(`EventSource` 唔畀睇 status code)。🔴 **但 W48 把佢放大咗** —— hook 自己個 doc 寫住
「a thread has no terminal state: it is idle between questions」⇒ **一條 thread 活得遠耐過
一個 run**,撞正一次 api 重啟(= 一次部署)嘅機會高好多,而**畫面唔會講**。

### 🔴 一個要 owner 決定嘅缺口(`F5-8`)

三層事實逐條實測:①`assistant.tsx:117` 開新對話**冇 `profileId` 呢個概念**
②`AgentProfile` **冇 default**(W47 刻意決定)⇒ 多過一個 active 就 400
③本機**兩個 active profile** ⇒ **每條新對話第一句都 400**。

⚠️ `send.isError` **有顯示**個 message(fail loud,唔係靜靜死),但用戶**冇出路** ——
畫面冇地方揀,而 `GET /agent/profiles` 係 `@Roles(ADMIN)` ⇒ **REGIONAL 連列表都攞唔到**。

🔴 **順帶驗到一個刻意設計唔係 bug**:400 嗰刻 **user turn 已經寫咗落 DB 而 run 冇**。
`agent-conversation.service.ts:202-206` 明文講咗點解 ——「what they said is a fact, and
losing it to roll back a queue error would be the platform forgetting something a person
did」⇒ **orphan turn 唔使修**。

### 三個順帶 live 發現

- 🟢 **`scrubPii` 真生效** —— tool_result 入面 `targetUpn` 係 `[redacted-email]`(H4)
- 🔴 **`D3` 收窄咗「見唔到」,收窄唔到「填錯」** —— model 攞人講嘅 `REQ0044067` 當
  `requestId` 叫 `get_request` ⇒ 404。**失敗方向安全**,但「填一個存在而屬於第二個 OpCo
  嘅 id」**本次冇驗**
- 🔴 **`search_catalog("Power BI Pro")` 返 `[]`** —— catalog 得 `POWER_BI_PRO` 而
  **101 個 SKU 個 `businessAlias` 全部 `null`**。agent 冇亂估,明文答「can't propose the
  licence without guessing」(**好行為**),但代價係佢幫唔到手 ⇒ catalog curation 缺口,
  同 `CH-026 G-7` 同族,**唔喺 W48 scope**

### ⚠️ 兩個自己踩返嘅坑,兩個都同「一句會講大話嘅 log」有關

1. `Start-Process ... -ArgumentList '...$env:NODE_OPTIONS="..."'` 個引號畀 PowerShell 食咗
   ⇒ process 即刻死。而我條 poll loop **跑完就印「up after 125s」,冇 assert 過** ——
   同 CLAUDE.md 記低嗰啲「summary-level 綠燈」同族,**係我自己寫嗰句**
2. `taskkill /F` 殺 watch ⇒ `tsbuildinfo` + `dist` 都留低 ⇒ 重起必撞
   **`Found 0 errors` + `MODULE_NOT_FOUND`**。🟢 但今次 **13 秒解決**,因為一開始就
   `-RedirectStandardOutput` —— 對照 CLAUDE.md 記低嘅「白等 180/270 秒」,分別淨係有冇 capture

### 🚧 下一步

- **`F5-8`** 等 Chris 揀 A / B / C(B 會推翻 W47「冇 default profile」= H1)
- `F7-3` / `F7-4` DEV live · `F2-6` DEV migration —— **兩條都等同一次部署,但收法唔同**
- `F8` 收尾(`F8-3` 要入 `R1`–`R7` + 今日新揾嘅兩條)
