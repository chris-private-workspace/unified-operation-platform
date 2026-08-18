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

- **七條 OQ 全部未答**,其中 **`OQ-D`(安全邊界)同 `OQ-G`(H4 retention)係 blocking**
- `checklist.md` **未 derive** —— 等 `status: active` 先做(佢由 plan derive,而 plan 未 lock)
- ⚠️ **本機 DB 仲欠 apply 兩個 migration**(`ch031_agent_run_hidden_at` · `w47_agent_profile`)
  —— 要停 `ai-doc-extraction-db` 交還 5433(**要 Chris 批**),而且**一定要
  `prisma migrate deploy` 唔可以 `dev`**
