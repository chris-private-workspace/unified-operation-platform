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
