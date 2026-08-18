---
phase: W48-agent-conversation
name: "Conversation session —— chat model + streaming(Tier 2 第二塊)"
sprint_week: W48
start_date: 2026-08-18
end_date: 2026-08-21          # 七條 OQ 答完之後先填得出,見 §5
status: active                # draft | active | closed
spec_refs:
  - docs/02-architecture/agent-tier2-scope.md §3 G4 / §4 T2-c / §5.3 OQ-4
  - docs/adr/0036-*.md(D3 human-in-the-loop · D6 AgentMessage 永久保留 · D0)
  - docs/adr/0039-*.md(F1 async · F10 SSE 只送 {runId})
prior_phase: W47-agent-registry
---

# Phase W48 — Conversation session(Tier 2 · `T2-c`)

> **Plan version**:1.0
> **Approved by**:**Chris Lai(2026-08-18)** —— 七條 OQ 全部照建議拍板,plan `draft → active`
> ⚠️ **但 `OQ-G` 個答案開咗一條新 OQ(`OQ-H`)**,而佢 block `F2` 一個 `onDelete` 決定,見 §7
> **Owner**:Chris Lai
> **決策來源**:`docs/02-architecture/agent-tier2-scope.md`(scope approved 2026-08-17)
> **前置**:W47 `T2-a` **closed**(acceptance 8/8,部署 #10 上咗 DEV)

---

## 0. 🔴 呢份 plan 同 W46 / W47 有一個結構性分別,要第一句就講

**W46 同 W47 都係「把一件已經存在嘅嘢做好」** —— W46 把 assign 流程交畀一個 agent 跑,
W47 把一個 seed 出嚟嘅 agent 變成可管理嘅 registry。兩者嘅互動模型由頭到尾冇變:
**一次任務,有頭有尾,一個人喺中間批准。**

**`T2-c` 唔係。** scope report `§3 G4` 逐字:

> 呢個唔係「把現有卡搬個位」,係一個**新嘅互動模型**。今日成套嘢(run / step / proposal /
> approve)係圍住「**一次任務**」設計嘅;chat 係圍住「**一條關係**」。兩者可以共存
> (chat 入面可以開 run),但**唔可以互相冒充**。

⇒ **本 phase 觸發 H1,而且 scope report §4 明文寫住佢要一份新 ADR。**

🟢🟢 **2026-08-18 更新:七條 OQ 答完之後,本 phase 細咗一截,而且冇咗兩個最貴嘅分支** ——
`OQ-B` 答**新 model** ⇒ **`ADR-0036 D6` 一個字唔使郁**、migration **純 additive**;
`OQ-E` 答 **SSE** ⇒ **零新 runtime dependency,唔觸發 H2,唔使第二份 ADR**。
⇒ 由「可能要兩份 ADR + 改一張既有表」變成「**一份 ADR + 純 additive schema**」。

⚠️ **但唔好把「細咗」讀成「淺咗」** —— §0 開頭嗰句仍然成立:呢個係一個**新嘅互動模型**,
而唔係一個新 endpoint。`G4`(chat 唔可以繞過 approval)同 `R1` 就係為咗呢點存在。

---

## 1. Scope

### 做

| | |
|---|---|
| **對話模型** | 一條可以持續傾嘅線:用戶打字 → agent 答 → 可以再問 → 中途可以叫佢做嘢(即產生 proposal) |
| **Streaming** | 送**真內容**嘅 channel(今日條 SSE 只送 `{runId}` 叫人 refetch,ADR-0039 F10) |
| **最小 UI** | 一個夠用嚟驗證互動模型嘅畫面。**唔係 dock** —— dock 係 `T2-d` |

### 🔴 刻意唔做(每樣都有理由)

| 唔做 | 理由 |
|---|---|
| **全站 dock / `Drawer` primitive** | 係 `T2-d`。佢觸發 **H6**(handoff 冇 drawer pattern ⇒ 要 owner approve 新 primitive)同 **`D-CTX`**,兩樣都同「對話模型本身啱唔啱」無關 |
| **per-agent kill switch / 上限** | 係 `T2-e` |
| **per-agent tool allow-list / scope** | `OQ-1`/`OQ-2` 2026-08-17 答咗 ⇒ **兩樣都唔使做**(allow-list 全域一份 · scope 綁啟動者)。⚠️ 但 chat 令 `OQ-2` 出現一個新問題,見 `OQ-D` |
| **agent 自主行動** | scope report §6 明文 out —— `ADR-0036 D3` human-in-the-loop 冇打算郁 |

---

## 2. Deliverables —— ⚠️ 呢節唔可以 lock,見 §7

> 🔴 **以下每一項都寫成「若 `OQ-x` 答 A 就係咁,答 B 就唔同」** —— 因為佢哋真係咁。
> 一份把未定嘅嘢寫成確定嘅 plan,會令 review 嗰陣分唔開「呢個係決定」定「呢個係假設」。

### F1 — ADR:互動模型(**H1,最先做,佢決定下面全部**)

- 要答:**對話同 run 嘅關係**(`OQ-A`/`OQ-C`)· **schema 形狀**(`OQ-B`)· **retention**(`OQ-D`)
- 🔴 **點解 ADR 排第一而唔係「邊寫邊決定」**:`AgentMessage` 已經存在而且 **`ADR-0036 D6`
  講咗佢永久保留**。一個「順手放寬 `runId` 做 nullable」嘅改動,會令**一張表同時係 run
  transcript 同 chat 紀錄**,而 D6 嗰句「永久保留」原本只係講前者。呢個唔係加欄,係改咗
  一條已 Accepted 決定嘅覆蓋範圍 —— 同 `ADR-0035` 嗰個「收窄範圍 vs 推翻」判斷同族
- 🟢 **七條 OQ 2026-08-18 答齊** ⇒ ADR 而家要答嘅**淨返 `OQ-H`**(「清掉」= hard 定 soft)
  同埋把七條答案寫成一份可以引用嘅決定
- **Acceptance**:ADR `Accepted` · **`OQ-H` 有明文答案**(唔可以由 migration 靜靜定咗)·
  明文講清楚**同 `ADR-0040` 嘅關係**(佢喺隔籬 model 揀咗 soft,而佢自己把 GDPR 嗰半推咗過嚟)
- **Effort**:3h · **Owner**:AI

### F2 — 對話 schema + migration(**H1**)

- 🟢 **`OQ-B` 揀咗新 model** ⇒ **`AgentMessage` 一個字唔郁**,`ADR-0036 D6` 覆蓋範圍
  維持原狀,migration **純 additive**
- **形狀**(草稿,`F1` 嗰份 ADR lock):

```prisma
model AgentConversation {
  id          String   @id @default(cuid())
  // OQ-A:綁人。required —— 一條冇主人嘅對話,就係一條冇 scope 起點嘅對話(OQ-D)
  startedById String
  startedBy   AppUser  @relation(fields: [startedById], references: [id])
  // 可選 context,唔係擁有者。null = OQ-D 嗰個窄狀態
  requestId   String?
  request     Request? @relation(fields: [requestId], references: [id])
  profileId   String?  // 用邊個 profile 傾(W47 registry)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  turns       AgentTurn[]
  runs        AgentRun[]   // OQ-C:FK
}

model AgentTurn {
  id             String            @id @default(cuid())
  conversationId String
  conversation   AgentConversation @relation(fields: [conversationId], references: [id])
  role           String            // user | assistant
  content        String
  createdAt      DateTime          @default(now())
  @@index([conversationId, createdAt])
}
```

  加 `AgentRun.conversationId String?` + relation(`OQ-C`)。

- 🔴 **兩個 `onDelete` 刻意留空,等 `OQ-H`** —— `AgentTurn → AgentConversation` 同
  `AgentRun → AgentConversation`。**唔可以由 Prisma default 靜靜定咗**:optional relation
  預設 `SetNull`,即係話一個 delete 會把「呢個 run 由邊條對話開」一次過變 unknown,
  而 W47 `F1-3` 就係喺呢個位撞過同一件事
- **Acceptance**:migration **純 additive,零 DROP** · 本機 + DEV 都 applied ·
  🔴 **舊 run 嘅 `AgentMessage` 讀路一個字唔變**(`G3`,falsification 釘住)
- **Effort**:3h · **Owner**:AI

### F3 — Conversation service + endpoint

- `POST /agent/conversations`(開一條)· `POST /agent/conversations/:id/turns`(講一句)·
  `GET /agent/conversations/:id`· `GET /agent/conversations`(列表)
- **權限**:🟢 `OQ-F` 答**跟 `canUseAgent`**(ADMIN + REGIONAL)—— 唔加新 predicate
- 🔴 **`OQ-D` 落喺呢度**:`requestId == null` 嘅對話,**tool 攞唔到任何 request-scoped 資料**
  —— 係「攞唔到」唔係「攞到但唔顯示」。呢個要一條 falsification 釘住(拆走就要紅)
- **Acceptance**:`@Roles` 覆蓋 + **W28 drift test 認得新 endpoint**(佢喺 W47 捉到我兩次)·
  `runState` / `prompt` **唔出 wire**(W46/W47 兩次都係喺呢度漏)
- **Effort**:5h · **Owner**:AI

### F4 — Streaming(送真內容)

- 🔴 **今日條 SSE 送唔到** —— `agent-run.queue.ts` 個 `changes()` 送 `{runId, type}`,
  明文「Payload carries no content — refetch the run」。chat 要 token-by-token
- 🟢 **`OQ-E` 揀咗 SSE** ⇒ **零新 runtime dependency,唔觸發 H2**
- ⚠️ **唔可以重用 `agent-run.queue.ts` 個 `changes()`** —— 佢係 queue-wide BullMQ 事件流,
  per-run 過濾,payload 明文冇 content。chat 要嘅係**per-conversation 嘅 token 流**
- **Acceptance**:斷線唔可以靜靜當完成(**fail loud**,跟 `R16` 同一條規矩)·
  **DEV 真通** —— ⚠️ `B6` 證嘅係 **heartbeat + 短事件**,**唔係長 token stream**,
  所以呢條要自己驗,唔可以引用 `B6`
- **Effort**:5h · **Owner**:AI

### F5 — 最小 UI(**H6**)

- 一版夠驗證互動模型就得。**唔起 `Drawer`**(`T2-d`)
- **Acceptance**:light + dark 真 render(`render-check.mjs`)· 零橫向溢出 · 跑 `ui-design` ·
  **一個 view 一個 primary**
- ⚠️ **chat 氣泡 / streaming 游標呢類 pattern,handoff 冇** ⇒ **可能觸發 H6 STOP**。
  W47 個 `Textarea` 就係咁 —— 要 owner approve 先做得
- **Effort**:5h · **Owner**:AI

### F6 — Test + falsification(**H5**)

- LLM 一律 mock。**每道新閘拆走實作睇佢紅唔紅**,還原後真跑

### F7 — Live 驗

- 本機:真傾一段對話 · 中途叫佢提 SKU(產生 proposal)· 斷線重連
- **DEV**:migration + 一條真對話 + **一次真 token stream**(唔可以引用 `B6`)
- ⚠️ **唔可以睇 revision status 當證據**
- 🔴 **`OQ-D` 要有一條 live**:開一條**冇 request context** 嘅對話,叫 agent 攞 request 資料,
  **佢應該攞唔到** —— 呢個係本 phase 唯一一條安全邊界嘅 live 證據
- **Effort**:2h · **Owner**:AI

---

## 3. Success Criteria(Phase Gate)

| # | Criterion | Target | Block closeout? |
|---|---|---|---|
| G1 | ADR `Accepted` | 互動模型寫低咗,七條 OQ 有答案 | **Yes** |
| G2 | migration 對真 DB | 本機 + DEV 都 applied | **Yes** |
| G3 | **舊 run 嘅 transcript 讀路零改動** | `GET /agent/runs/:id` 行為一個字唔變 | **Yes** |
| G4 | chat 唔可以繞過 approval | 產生 proposal 之後**仍然要人批**(`ADR-0036 D3`) | **Yes** |
| G5 | `runState` / `prompt` 冇經新 endpoint 洩出 | 0 | **Yes** |
| G6 | falsification 每道新閘一次 | 真紅零誤傷 | **Yes** |
| G7 | H6 light + dark | 兩個都 render 過 | **Yes** |
| G8 | root gate | test / lint / build 三個 exit 0 | **Yes** |
| G9 | live 驗(本機 + DEV) | 真傾到 + 真 stream 到 | **Yes** |

> 🔴 **`G3` 同 `G4` 係本 phase 兩條真紅線**,其餘七條係例行。
> `G3` 防「順手改咗既有表」;`G4` 防「chat 因為感覺輕鬆,就變成一條繞過批准嘅路」。

---

## 4. Risks(Phase-Specific)

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| **R1** | 🔴🔴 **chat 變成一條繞過 approval 嘅路** —— 對話介面令「叫佢做嘢」感覺好輕,而 `ADR-0036 D3` 個 human-in-the-loop 係 **Tier 1 成個安全論據** | **Med-High** | 🔴 **High** | ①`G4` 釘住 ②proposal 一定經返同一條 `agent-approval` 路,**唔可以喺 chat 側另開一個「快速批准」** ③falsification:拆走 approval 要紅 |
| **R2** | 🟢 ~~`AgentMessage` 一表兩用~~ —— **`OQ-B` 答「新 model」之後呢條唔再成立**:`AgentMessage` 一個字唔郁,`ADR-0036 D6` 覆蓋範圍原封不動。⚠️ **但 H4 嗰半冇消失,只係搬咗位** —— chat 一樣含 PII,而 `OQ-G` 答「一直存在,直至清掉」⇒ **「清」嗰條路本身就變成 H4 嘅唯一防線**,而佢仲未定形狀 | Med | 🔴 High(H4) | ①**`OQ-H` 要有明文答案先落 migration** ②`F1` ADR 要正面寫「清」嘅語意 —— **唔可以由 Prisma `onDelete` default 靜靜定咗**(W47 `F1-3` 就係喺呢個位撞過) |
| **R3** | 🔴 **對話成本冇上限** —— 每個 turn 帶住成段 history ⇒ token 成本隨對話長度**非線性**升,而今日 blast-radius 係 **per-run** 唔係 per-conversation | **High** | Med | ①本 phase 至少要有**一個 turn 上限或 history 截斷**②per-agent 上限係 `T2-e`,但 chat 一開就有成本 ⇒ 唔可以等 |
| **R4** | **Streaming 斷線靜靜當完成** —— 同 `R16`(SDK resume)同族:一個「睇落完成咗」嘅失敗 | Med | Med | fail loud;`F4` acceptance 釘住 |
| **R5** | **chat 冇 request context 嗰陣,agent 睇到咩?** —— `OQ-2` 答咗「唔可以大過啟動者」,但嗰句假設咗有一個 request 做起點 | Med | 🔴 High(安全) | `OQ-D`(§7)要答;**default 一定係窄嗰邊**(冇 context = 見唔到 request 資料) |
| **R6** | **UI pattern 觸發 H6 STOP 而 phase 中途先發現** | Med | Low | `F5` 開工前先跑 `ui-design` 對一次,**唔好等 render 先知** |
| **R7** | 🟡 **`T2-d` 等緊本 phase** —— dock 依賴 chat。本 phase 拖長 = 兩塊一齊拖 | Med | Low | 保持 `F5` 真係「最小」;唔好順手做 dock |

---

## 5. Day-by-Day(rough)

> 🟢 **2026-08-18 填得返** —— 本節之前刻意留空,因為 `OQ-B` / `OQ-E` 兩條夾埋可以差一倍
> 工作量。而家兩條都答咗**細嗰邊**(新 model · SSE)⇒ 估得出。

| Day | Date | Focus | Deliverables |
|---|---|---|---|
| D1 | 2026-08-18 | ADR(含 `OQ-H`)+ schema + migration | `F1` · `F2` |
| D2 | 2026-08-19 | conversation service + endpoint + test | `F3` · `F6` |
| D3 | 2026-08-20 | streaming(SSE token 流)+ test | `F4` · `F6` |
| D4 | 2026-08-21 | 最小 UI + H6 render + live 驗 | `F5` · `F7` |

**Effort 合計 ≈ 23h**(`F1` 3 + `F2` 3 + `F3` 5 + `F4` 5 + `F5` 5 + `F7` 2;`F6` 含喺各項)。

⚠️ **呢個估算有一個已知嘅弱點**:W46 / W47 兩次都係**後端快、UI 同 live 驗慢**,而本 phase
`F4`(streaming)係**唯一一件平台完全冇做過嘅嘢** —— 今日條 SSE 送 `{runId}`,同送 token 流
係兩件事。⇒ **`F4` 最可能爆,而佢爆嘅話 `F5` 一定跟住爆**(UI 冇嘢 stream)。

---

## 6. Dependencies on Prior Phase

- 🟢 **W47 `T2-a` closed**(acceptance 8/8)⇒ `AgentProfile` registry 喺度,chat 都要揀 profile
- 🟢 **`B6`(SSE 喺 DEV 真通)W46 收咗** —— ⚠️ 但佢證嘅係 **heartbeat + 短事件**,
  **唔係一條長時間 token stream**。`F4` 唔可以當佢已經證咗
- 🟢 **部署 #10(`dev-df03563`)喺 DEV** —— agent registry + soft-hide 都上咗機
- ⚠️ **本機 DB 仲欠 apply 兩個 migration**(`ch031_agent_run_hidden_at` ·
  `w47_agent_profile`)—— 要停 `ai-doc-extraction-db` 交還 5433(**要 Chris 批**),
  而且**一定要 `prisma migrate deploy` 唔可以 `dev`**(本機 DB 兩個 worktree 共用)
- 🔴 **`R28`(W47 carry)未答**:profile 係 mutable ⇒ 答到「用邊個 profile」答唔到「嗰一刻
  係咩 model」。**chat 會令佢更明顯**(一條對話可能橫跨一次 profile 編輯)⇒ 建議喺 `F1`
  嗰份 ADR 一併處理,或者明文 defer

---

## 7. Open Questions —— 🟢 **七條 2026-08-18 全部答齊(Chris)⇒ plan `draft → active`**

| # | 問題 | **決定** | 影響 |
|---|---|---|---|
| **OQ-A** | 一條對話**綁邊度**? | 🟢 **綁人**(跨 request) | request 變成一個**可選 context**,唔係對話嘅擁有者。⇒ `AgentConversation.startedById` required、`requestId` nullable |
| **OQ-B** | schema:新 model 定放寬 `AgentMessage`? | 🟢 **新 model** | 🟢🟢 **`ADR-0036 D6` 一個字唔使郁** —— `AgentMessage` 維持「run transcript,永久保留」,而 chat 有自己嘅 retention 故事(`OQ-G`)。migration **純 additive** |
| **OQ-C** | chat 開嘅 run 點關聯返? | 🟢 **FK**(跟 `AgentRun.requestId` 先例) | `AgentRun.conversationId String?` + relation。⚠️ **`onDelete` 要諗**,見 `OQ-H` |
| **OQ-D** | 🔴 chat 冇 request context 嗰陣,agent 睇到咩? | 🟢 **窄嗰邊 —— 見唔到任何 request 資料** | **安全邊界,唔係 UX**。冇 context = tool 攞唔到 request-scoped 資料,而唔係「攞到但唔顯示」。要 falsification 釘住 |
| **OQ-E** | Streaming:SSE 定 WebSocket? | 🟢 **SSE** | 🟢 **零新 runtime dependency ⇒ 唔觸發 H2,唔使第二份 ADR**。⚠️ 但 `B6` 證嘅係 heartbeat + 短事件,**唔係長 token stream** ⇒ `F4` 仍然要自己驗 |
| **OQ-F** | 邊個 chat 得? | 🟢 **跟 `canUseAgent`**(ADMIN + REGIONAL) | 唔加新 predicate;W28 drift test 要認得新 endpoint |
| **OQ-G** | 🔴 對話 persist 幾耐?(= scope report `OQ-4`) | 🟢 **一直存在,直至清掉** | 🔴 **冇自動 retention,但要有一條「清」嘅路** ⇒ **開咗 `OQ-H`**,見下 |

### 🔴 `OQ-H` —— 由 `OQ-G` 衍生,而佢撞正上星期先答完嘅嘢

> **「清掉」係 hard delete,定係 soft(hidden / archived)?**

**點解呢條唔可以順手決定**:

1. **`ADR-0040`(CH-031,2026-08-17 Accepted)喺隔籬一個 model 上面啱啱先揀咗 soft** ——
   agent run **唔准 hard delete**,理由係三張子表 `onDelete: Cascade` 而佢哋係 audit 真相。
   如果對話揀 hard delete,平台就會有**兩個相反嘅答案**喺兩個相鄰嘅 model 上面,
   而 `ADR-0022 D1` → `ADR-0040` 呢條線一直係「**同樣效果,單邊代價 ⇒ 唔取**」。
2. **但 `ADR-0040` 自己明文把呢條問題推咗畀我哋**,逐字:
   > **唔解決 GDPR-style 徹底移除**。嗰個屬 `audit-retention`……而佢同
   > `agent-tier2-scope.md` **OQ-4**(「對話要唔要 persist?留幾耐?」)係同一條問題。
   > **本 ADR 明文唔碰佢。**

   ⇒ `OQ-G` 個答案**正正就係 ADR-0040 推走嗰條問題**,而家輪到本 phase 答。
3. **兩個答案代價唔同**:

| | Hard delete | Soft(跟 ADR-0040) |
|---|---|---|
| H4 / GDPR「真係冇咗」 | ✅ 做得到 | ❌ 做唔到(row 仲喺度) |
| 同 `ADR-0040` 一致 | ❌ 相反 | ✅ |
| chat 入面開過嘅 run | ⚠️ `AgentRun.conversationId` 要 `SetNull` 定 `Restrict`?**`Restrict` = 有 run 就刪唔到**,`SetNull` = 靜靜失去「呢個 run 由邊條對話開」 | 冇呢個問題 |
| 「清咗」之後個 UI | 真係空 | 要決定睇唔睇得返 |

**建議**:**soft 為主 + 一條明文 hard-delete 路留畀 H4**,兩者唔同 verb、唔同權限 ——
但呢個係 owner 決定,**`F1` 嗰份 ADR 要正面寫,唔可以由 migration 靜靜定咗**。

⚠️ **`OQ-H` block 嘅只係 `F2` 個 `onDelete` 同 `F3` 一條 endpoint**,唔 block `F1` 開始寫。

---

## 8. Plan Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-08-18 | Initial draft(`status: draft`) | Tier 2 `T2-c`,W47 closed 之後嘅下一塊。**七條 OQ 未答 ⇒ 冇 Effort / 冇 end_date / 冇 day-by-day**,見 §0 同 §5 | AI(未 approve) |
| 2026-08-18 | 🟢 **七條 OQ 全部答齊(Chris),`draft → active`;補返 Effort(≈23h)、`end_date`、§5 day-by-day** | 兩條最貴嘅分支都答咗細嗰邊:`OQ-B` **新 model** ⇒ `ADR-0036 D6` 唔使郁 · migration 純 additive;`OQ-E` **SSE** ⇒ 零新 dep、唔觸發 H2、唔使第二份 ADR。⇒ 由「可能兩份 ADR + 改一張既有表」變成「一份 ADR + 純 additive schema」 | Chris Lai |
| 2026-08-18 | 🔴 **新增 `OQ-H`(未答)** —— 「清掉」= hard delete 定 soft? | `OQ-G` 答「一直存在,**直至清掉**」,而「清」嘅語意冇定。呢條唔可以順手決定,因為 **`ADR-0040`(2026-08-17 Accepted)喺隔籬一個 model 上面啱啱先揀咗 soft**,而**同一份 ADR 又明文把 GDPR-style 徹底移除推咗畀 `agent-tier2-scope.md OQ-4`** —— 即係推咗嚟本 phase。兩個答案代價唔同(H4 做唔做得到 vs 同 ADR-0040 一唔一致),而且直接決定兩個 `onDelete`。⚠️ **只 block `F2` 個 `onDelete` 同 `F3` 一條 endpoint,唔 block `F1` 開始** | AI(提出,待 owner) |

---

**Lifecycle reminder**:呢份 plan **而家係 draft** —— 按 PROCESS **R1**,
multi-day implementation 開始之前必須有 approved pre-doc。**未 approve 唔可以寫 code。**
`status` 轉 `active` 之後先 derive `checklist.md`。
