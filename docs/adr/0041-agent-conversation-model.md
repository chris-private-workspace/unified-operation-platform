# ADR-0041: Agent conversation —— 一條綁人嘅對話線,同 run 並存但唔互相冒充

**Date**: 2026-08-18
**Status**: **Accepted**(Chris 2026-08-18 —— **D1–D9 九條連 Consequences 一併批**。八條 OQ 佢喺同日答齊,本 ADR 把答案寫成可引用嘅決定;`Proposed` 嗰一步存在嘅唯一原因,係 `D3`[安全邊界]同 `D7`[retention]兩條嘅**後果**佢未見過逐條寫出嚟嘅版本 —— 跟 `ADR-0037` 先例)
**Approver**: Chris Lai

---

## Context

**觸發**:W48 `T2-c`(`agent-tier2-scope.md §4`)。scope report `§3 G4` 逐字:

> 呢個唔係「把現有卡搬個位」,係一個**新嘅互動模型**。今日成套嘢(run / step / proposal /
> approve)係圍住「**一次任務**」設計嘅;chat 係圍住「**一條關係**」。兩者可以共存
> (chat 入面可以開 run),但**唔可以互相冒充**。

**觸發嘅 hard constraint**:CLAUDE.md **§5 H1**(新 model / 改資料模型)。
scope report `§4` 亦明文寫住本 phase 要一份新 ADR。

### 為咗落決定而查證返嚟嘅事實(讀 code / schema,唔靠記憶)

**① `AgentMessage` 綁死一個 `runId`,佢係 run transcript,唔係一條可以持續嘅對話。**

```prisma
model AgentMessage {
  runId String
  run   AgentRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  role  String   // user | assistant | thinking | tool_call | tool_result
  ...
}
```

睇落「加個 `conversationId`、把 `runId` 改 nullable」就搞掂。**但嗰個改動唔係加欄** ——
`ADR-0036 D6` 講「`AgentMessage` **永久保留**,唔設 retention」,而**嗰句原本只係講
run transcript**。放寬之後同一張表會連 chat 一齊「永久保留」,而 chat **含 PII、量級唔同、
生命週期唔同**。⇒ 呢個係**改一條已 Accepted 決定嘅覆蓋範圍**,同 `ADR-0035` 嗰個
「收窄範圍 vs 推翻」判斷同族,唔可以由一個 migration 靜靜做咗。

**② 今日條 SSE 結構上送唔到 chat 要嘅嘢。**

`agent-run.controller.ts` 用 `@Sse(':id/events')`,而 `agent-run.queue.ts` 個 `changes()`
送嘅係 `{ runId, type: 'ping' }`。controller 個 `@ApiOperation` summary 逐字:
**「Payload carries no content — refetch the run」**,而嗰個係 `ADR-0039 F10` 嘅刻意決定
(唔養第二個真相 · H4:`AgentStep.detail` 可以引 UPN,少一條 transport 就少一個要記住
scrub 嘅地方)。

⇒ chat 要 token-by-token,係**另一條** stream。⚠️ 而 W46 `B6`(SSE 喺 DEV 真通)證嘅係
**heartbeat + 短事件**,**唔係一條長時間 token stream** —— 兩者喺 ACA ingress 之下唔一定
一樣行為(`ADR-0039 F7` / `R22` 講嘅正正係呢個)。

**③ `ADR-0040` 一日之前先喺隔籬一個 model 上面答過「刪唔刪得」,而佢把一半推咗嚟本 ADR。**

`ADR-0040`(CH-031,2026-08-17 Accepted)決定 agent run **唔准 hard delete**,改用
`hiddenAt` soft-hide,理由係三張子表 `onDelete: Cascade` 而佢哋係 audit 真相。
**但同一份 ADR 嘅 Consequences 逐字**:

> **唔解決 GDPR-style 徹底移除**。嗰個屬 `audit-retention`(BACKLOG 候選 ·
> `ADR-0009 D8.3` 刻意唔做),而佢同 `agent-tier2-scope.md` **OQ-4**(「對話要唔要
> persist?留幾耐?」)係同一條問題。**本 ADR 明文唔碰佢。**

⇒ **`OQ-4` = 本 phase 個 `OQ-G`**。一個 ADR 明文「唔碰」某件事,唔等於嗰件事消失 ——
佢只係**排咗隊**,而隊頭就係下一個掂到同一份資料嘅 phase。**本 ADR 就係嗰個位。**

**④ chat 令一條已答嘅安全問題重新出現。**

`agent-tier2-scope.md OQ-2`(Chris 2026-08-17)答「**agent scope 唔可以大過啟動者**」,
而嗰句嘅實作(`AgentRun.startedById` + tool 帶住嗰個人嘅 OpCo scope)**假設咗有一個
request 做起點**。chat 可以完全冇 request —— **嗰陣 agent 睇到咩,今日冇答案**。

**⑤ 成本形狀同 run 唔同。**

一個 run 係一次任務,token 用量有界。一條對話**每個 turn 都帶住之前全部 history** ⇒
成本隨長度**非線性**升,而今日 blast-radius(`ADR-0036` / W46 `G3`)係 **per-run**,
唔係 per-conversation。

---

## Decision

### D1 — 開新 `AgentConversation` + `AgentTurn`,`AgentMessage` 一個字唔郁(`OQ-B`)

```prisma
model AgentConversation {
  id          String   @id @default(cuid())
  startedById String                       // D2
  requestId   String?                      // D3:可選 context,唔係擁有者
  profileId   String?                      // 用邊個 profile 傾(W47 registry)
  archivedAt  DateTime?                    // D7
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  turns       AgentTurn[]
  runs        AgentRun[]                   // D4
}

model AgentTurn {
  id             String   @id @default(cuid())
  conversationId String
  role           String   // user | assistant
  content        String
  createdAt      DateTime @default(now())
  @@index([conversationId, createdAt])
}
```

加 `AgentRun.conversationId String?`。**Migration 純 additive,零 DROP。**

🔴 **點解唔重用 `AgentMessage`**:見 Context ①。保住 `ADR-0036 D6` 嗰句原意
(「永久保留」講嘅係 run transcript),同時令 chat 有自己嘅生命週期(D7)。
**代價係兩張表都存住「agent 講過嘅嘢」,而讀嗰個要知分別** —— 呢個代價喺 Consequences 列明。

### D2 — 一條對話綁**人**,唔綁 request(`OQ-A`)

`startedById` **required**。一條冇主人嘅對話,就係一條**冇 scope 起點**嘅對話,
而 scope 起點正正就係 `OQ-2` 個安全模型嘅地基(Context ④)。

`requestId` **nullable,而且係一個 context 唔係一個擁有者** —— 對話唔會因為嗰張 request
closed 而結束,亦唔會因為換咗一張 request 就變成另一條對話。

### D3 — 🔴 冇 request context 嗰陣,tool **攞唔到**任何 request-scoped 資料(`OQ-D`)

**「攞唔到」唔係「攞到但唔顯示」。** 分別喺於前者係一個結構性事實(tool 冇嘢可以返),
後者係一個要人記住嘅紀律 —— 而 `ADR-0036 D2` 已經為同一個分別拍過板:
**「見唔到」比「叫佢唔好用」強一個數量級。**

⇒ `requestId == null` 嘅對話,`get_request` 呢類 tool **收唔到一個 request id**,
而唔係「收到但拒絕」。要有一條 falsification 釘住(拆走就要紅)。

⚠️ **本決定唔擴闊亦唔收窄 `OQ-2`** —— 佢只係把「冇起點」嗰個之前未定義嘅狀態,
明文定義成**最窄**嗰個。

### D4 — chat 開嘅 run 用 **FK** 關聯返條對話(`OQ-C`)

`AgentRun.conversationId String?` + relation,跟 `AgentRun.requestId` 先例
(schema 註釋:「one table pointing at Request without a key is a difference that holds
only as long as someone remembers it」)。

⇒ 「呢個 proposal 由邊句話嚟」變成一個查得返嘅事實。

### D5 — Streaming 用 **另一條** SSE,唔重用 `changes()`(`OQ-E`)

**SSE 唔係 WebSocket** ⇒ **零新 runtime dependency,唔觸發 H2,唔使第二份 ADR**。

🔴 **但唔可以重用 `agent-run.queue.ts` 個 `changes()`** —— 佢係 queue-wide BullMQ 事件流
按 run 過濾,payload 明文冇 content(`ADR-0039 F10`)。chat 要嘅係 per-conversation 嘅
**內容流**。⇒ 兩條 stream 語意唔同,合併就等於推翻 F10。

🔴 **斷線必須 fail loud** —— 跟 `R16` 同一條規矩:一個「睇落完成咗」嘅失敗,比一個明顯
嘅失敗差好多。

⚠️ **`B6` 唔可以引用做「DEV 通」嘅證據**(Context ②)。

### D6 — 權限跟 `canUseAgent`(ADMIN + REGIONAL)(`OQ-F`)

唔加新 predicate。收窄容易放寬難,而 chat 唔比 run 危險 —— **佢哋行同一套 tool、同一道
approval 閘**(D8)。

⚠️ W28 drift test 會因為新 endpoint 而紅,**呢個係預期唔係意外**(佢喺 W47 捉到兩次)。

### D7 — Retention:**一直存在,直至 soft-archive**(`OQ-G` + `OQ-H`)

- **冇自動 retention** —— 對話唔會因為過期而消失
- **「清」= `archivedAt` soft**,**唔係 hard delete**(`OQ-H`,Chris 2026-08-18)
- ⇒ 同 `ADR-0040` **一致**:平台喺兩個相鄰 model 上面**唔會有兩個相反答案**
- verb 跟 `ADR-0040 D2` 先例:**唔用 `DELETE`** —— `DELETE` 會講一個假嘅真相

🔴 **`archivedAt` 同 `AgentRun.hiddenAt` 係兩個唔同嘅欄,唔可以合併** —— 一個講對話,
一個講 run,而一條 archived 對話入面可能有一個**冇被 hide** 嘅 run(嗰個 run 仍然應該
出現喺全域 run 列表)。

### D8 — 🔴 chat **唔可以繞過 approval**

chat 入面產生嘅 proposal,**行返同一條 `agent-approval` 路**:同一張 `AgentProposal` 表、
同一個 `approvedById`、同一道「approve 唔等於 bypass」嘅閘(`ADR-0036 D3`)。

**明文禁止**喺 chat 側另開任何形式嘅「快速批准」。

📌 **點解要寫成一條決定而唔係一句提醒**:對話介面令「叫佢做嘢」**感覺**好輕,而
`ADR-0036 D3` 個 human-in-the-loop **就係 Tier 1 成個安全論據**。一個因為 UI 手感而
軟化嘅安全邊界,唔會喺任何 code review 度睇落似安全改動。

### D9 — 對話要有**上限**,而本 ADR 唔指定係邊種

Context ⑤ 講嘅成本形狀,喺 chat 之下第一次出現。本 ADR **要求 W48 落地一個上限**
(turn 數上限 / history 截斷 / 兩者皆可),但**唔指定** —— 因為邊種啱要睇實際 token 用量,
而今日冇數據。

⚠️ **per-agent 上限係 `T2-e`**,但**唔可以等** —— chat 一開就有成本,而 `T2-e` 未開。

---

## Alternatives Considered

- **A — 放寬 `AgentMessage`(加 `conversationId`,`runId` 變 nullable)**:**rejected**。
  一張表兩個意思,而且靜靜擴大 `ADR-0036 D6`「永久保留」嘅覆蓋範圍到一批**含 PII、
  量級唔同**嘅資料。migration 亦由「純 additive」變成「NOT NULL → NULL,唔可逆」。
  🔴 **本 alternative 嘅吸引力正正係佢嘅危險**:佢睇落係「慳一張表」,實際上係
  「改一條已 Accepted 決定嘅範圍」,而且**唔會有任何 test 紅**。

- **B — WebSocket 做 streaming**:**rejected**。雙向,而我哋只需要單向;
  **H2 新 dependency** + 另一份 ADR + ACA / nginx 多一層配置。`ADR-0039` 當時已經
  為同一個理由否決過佢一次,而本 phase 冇帶嚟新論據。

- **C — 對話綁 request(一張 request 一條線)**:**rejected**。最窄兼天然有 scope,
  但**直接同 `R-E` 打交** —— scope report 講明「唔限 request detail,dashboard 或
  任何頁面都可以彈出」。揀咗佢,`T2-d` 個 dock 一落地就要返轉頭改 schema。

- **D — hard delete(真刪 row)**:**rejected**。可以答到 GDPR-style 徹底移除,
  但會令平台喺兩個相鄰 model 上面有**兩個相反答案**(`ADR-0040` 前日先揀咗 soft),
  而且 `AgentRun.conversationId` 要 `SetNull`(靜靜失去「呢個 run 由邊條對話開」)
  或者 `Restrict`(有 run 就刪唔到)—— 兩個都係新問題。
  ⚠️ **Chris 2026-08-18 明確揀 soft**,而 AI 建議過嘅「soft 為主 + 一條 hard 路留畀 H4」
  **冇被取納** ⇒ 後果見 Consequences,**唔喺度扮已解決**。

- **E — 唔開新互動模型,擴 run 令佢可以「再問一句」**:**rejected**。
  run 有 terminal status、有 `runState`(SDK 內部結構,`R16` 講咗升級會令佢 un-resumable)、
  有 OQ-3「一張 request 一個非 terminal run」嘅限制。把一條可以傾幾日嘅對話塞入去,
  等於令 run 永遠唔 terminal —— 而嗰個狀態正正係 `expireRun` / kill switch `settled`
  嗰套嘢賴以運作嘅前提。**兩者可以共存,但唔可以互相冒充**(scope report 原話)。

---

## Consequences

### Positive
- **`ADR-0036 D6` 一個字唔使郁**(D1)—— `AgentMessage` 維持「run transcript,永久保留」
- **零新 runtime dependency**(D5)⇒ 唔觸發 H2,唔使第二份 ADR
- **Migration 純 additive,零 DROP**(D1)
- **同 `ADR-0040` 一致**(D7)—— 平台對「移除」呢件事,喺 agent 範圍內只有一個答案
- **`OQ-2` 個安全模型唔使改**(D3 只係把一個未定義狀態定義成最窄)

### Negative
- 🔴 **GDPR-style 徹底移除仍然冇答案。** `OQ-G` 答「一直存在,**直至清掉**」,而 `OQ-H` 把
  「清」定義成 soft ⇒ **實際語意係「直至隱藏」**。一條含 PII 嘅對話,喺平台側**冇任何路徑
  真正移除**。⚠️ **AI 建議過「soft 為主 + 一條明文 hard 路留畀 H4」,冇被取納** ——
  呢個係知情之下嘅取捨,**而唔係一個未發現嘅缺口**。佢同 `audit-retention`(BACKLOG,
  一直未做)係同一條問題,而本 ADR **把佢再推後一次**。
  📌 **`ADR-0040` 推咗一次畀本 ADR,本 ADR 再推一次** —— 呢個形狀值得記低:
  **一條冇人拒絕、但每次都排喺後面嘅問題,同一條被否決咗嘅問題,喺文件上睇落一模一樣。**
- **第三個「令嘢喺畫面消失」嘅機制**:`abortRun`(run 結束但卡仍在)· `AgentRun.hiddenAt`
  (CH-031)· 而家 `AgentConversation.archivedAt`。⇒ 將來睇「點解呢樣嘢唔見咗」要同時
  考慮三個欄。`ADR-0040` 已經記低過第二個,本 ADR 加第三個。
- **兩張表都存住「agent 講過嘅嘢」**(`AgentMessage` / `AgentTurn`)—— 讀嗰個要知邊張係
  run transcript、邊張係對話。呢個係 D1 換返「唔郁 D6」嘅代價。
- **成本上限係一條新嘅、未有數據支持嘅決定**(D9)—— 本 ADR 只要求有,唔指定形狀。

### Neutral
- `AgentRun` 三個既有 FK(`principalId` / `startedById` / `profileId`)**唔受影響**
- `review-stats` / `kill-switch` **一個字唔改** —— 佢哋聚合 `AgentProposal.decidedAt` 同
  `AgentRun.status`,同 `conversationId` / `archivedAt` **正交**(同 `ADR-0040 D4` 同一個性質)
- W47 個 `AgentProfile` registry **原封適用** —— 對話一樣揀 profile

---

## References
- `docs/01-planning/W48-agent-conversation/plan.md`(本 ADR = `F1`)
- `docs/02-architecture/agent-tier2-scope.md` §3 `G4` · §4 `T2-c` · §5.1 `OQ-2` · §5.3 `OQ-4`
- **`ADR-0036 D6`** —— 本 ADR **唔推翻,係刻意繞開**(D1)· **D2**(「見唔到」比「叫佢唔好用」強)· **D3**(human-in-the-loop,D8 靠佢)
- **`ADR-0039 F10`** —— SSE 只送 `{runId}` 唔送內容;D5 開第二條 stream 唔改呢條
- **`ADR-0040`** —— soft-hide 先例(D7 跟佢)· 佢 Consequences 明文把 GDPR 嗰半推咗嚟本 ADR
- `ADR-0035` —— 「收窄範圍 vs 推翻」嘅判斷先例
- `ADR-0022 D1` —— 「同樣效果,單邊代價 ⇒ 唔取」,`ADR-0040` 經由佢推導
- `apps/api/prisma/schema.prisma`(`AgentMessage` `runId` 必填 · `AgentRun` 三個 FK)
- `apps/api/src/agent/agent-run.controller.ts`(`@Sse(':id/events')`)· `agent-run.queue.ts`(`changes()`)
