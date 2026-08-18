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
