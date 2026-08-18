---
phase: W48-agent-conversation
name: "Conversation session —— chat model + streaming(Tier 2 第二塊)"
sprint_week: W48
start_date: 2026-08-18
end_date: TBD                 # 等 §7 OQ 答完先估得到,見 §5
status: draft                 # draft | active | closed
spec_refs:
  - docs/02-architecture/agent-tier2-scope.md §3 G4 / §4 T2-c / §5.3 OQ-4
  - docs/adr/0036-*.md(D3 human-in-the-loop · D6 AgentMessage 永久保留 · D0)
  - docs/adr/0039-*.md(F1 async · F10 SSE 只送 {runId})
prior_phase: W47-agent-registry
---

# Phase W48 — Conversation session(Tier 2 · `T2-c`)

> **Plan version**:0.1(**draft —— 未 approve,唔可以開始寫 code**)
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
呢份 plan **唔會**自己拍板嗰份 ADR 嘅內容 —— §7 有 **七條 OQ**,而其中至少三條
(`OQ-A` / `OQ-B` / `OQ-E`)**答案唔同,交付物就唔同**,唔係「實作細節」。

⚠️ **所以本 plan 刻意冇寫 Effort 同 end_date** —— 寫咗就係假裝 scope 已經定咗。
`§5` 解釋咗點解。

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
- **Acceptance**:ADR `Accepted` + `§7` 七條 OQ 全部有答案(或者明文 defer 兼講明後果)

### F2 — 對話 schema + migration(**H1**)

- **形狀待 `OQ-B`**。兩個候選,代價唔同:

| | A:新 `AgentConversation` + `AgentTurn` | B:放寬 `AgentMessage`(加 `conversationId`,`runId` 變 nullable) |
|---|---|---|
| 改既有表 | ❌ 唔使 | ✅ 要(而佢有 `onDelete: Cascade` 三處同 D6 保證) |
| 「一張表兩個意思」 | 冇 | **有** —— 讀嗰個要自己分 |
| migration | 純 additive | `runId` NOT NULL → NULL,**唔可逆** |
| D6 覆蓋範圍 | 一個字唔使郁 | 要喺 ADR 明文重新界定 |

- **Acceptance**:migration 純 additive(若揀 A)· 本機 + DEV 都 applied ·
  **舊 run 嘅 `AgentMessage` 讀路一個字唔變**(falsification 釘住)

### F3 — Conversation service + endpoint

- `POST /agent/conversations`(開一條)· `POST /agent/conversations/:id/turns`(講一句)·
  `GET /agent/conversations/:id`· `GET /agent/conversations`(列表)
- **權限**:跟 `canUseAgent`(ADMIN + REGIONAL,今日已存在)—— ⚠️ 但 `OQ-F` 要確認
- **Acceptance**:`@Roles` 覆蓋 + **W28 drift test 認得新 endpoint**(佢喺 W47 捉到我兩次)·
  `runState` / `prompt` **唔出 wire**(W46/W47 兩次都係喺呢度漏)

### F4 — Streaming(送真內容)

- 🔴 **今日條 SSE 送唔到** —— `agent-run.queue.ts` 個 `changes()` 送 `{runId, type}`,
  明文「Payload carries no content — refetch the run」。chat 要 token-by-token
- **待 `OQ-E`**:①另開一條 SSE(**零新 dependency**)②WebSocket(**H2,要新 dep + ADR**)
- **Acceptance**:斷線唔可以靜靜當完成(**fail loud**,跟 `R16` 同一條規矩)·
  **DEV 真通**(W46 `B6` 證咗 ACA ingress 過到 SSE,但嗰條係 heartbeat 唔係長流)

### F5 — 最小 UI(**H6**)

- 一版夠驗證互動模型就得。**唔起 `Drawer`**(`T2-d`)
- **Acceptance**:light + dark 真 render(`render-check.mjs`)· 零橫向溢出 · 跑 `ui-design` ·
  **一個 view 一個 primary**
- ⚠️ **chat 氣泡 / streaming 游標呢類 pattern,handoff 冇** ⇒ **可能觸發 H6 STOP**。
  W47 個 `Textarea` 就係咁 —— 要 owner approve 先做得

### F6 — Test + falsification(**H5**)

- LLM 一律 mock。**每道新閘拆走實作睇佢紅唔紅**,還原後真跑

### F7 — Live 驗

- 本機:真傾一段對話 · 中途叫佢提 SKU(產生 proposal)· 斷線重連
- DEV:migration + 一條真對話
- ⚠️ **唔可以睇 revision status 當證據**

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
| **R2** | 🔴 **`AgentMessage` 一表兩用** —— 若 `OQ-B` 揀 B,`ADR-0036 D6`「永久保留」嘅覆蓋範圍靜靜擴大到 chat,而 chat **含 PII 而且量級唔同** | Med | 🔴 High(H4) | ①ADR 明文重新界定 D6 範圍(唔可以靠推論)②`OQ-D` retention 一定要有答案先落 migration |
| **R3** | 🔴 **對話成本冇上限** —— 每個 turn 帶住成段 history ⇒ token 成本隨對話長度**非線性**升,而今日 blast-radius 係 **per-run** 唔係 per-conversation | **High** | Med | ①本 phase 至少要有**一個 turn 上限或 history 截斷**②per-agent 上限係 `T2-e`,但 chat 一開就有成本 ⇒ 唔可以等 |
| **R4** | **Streaming 斷線靜靜當完成** —— 同 `R16`(SDK resume)同族:一個「睇落完成咗」嘅失敗 | Med | Med | fail loud;`F4` acceptance 釘住 |
| **R5** | **chat 冇 request context 嗰陣,agent 睇到咩?** —— `OQ-2` 答咗「唔可以大過啟動者」,但嗰句假設咗有一個 request 做起點 | Med | 🔴 High(安全) | `OQ-D`(§7)要答;**default 一定係窄嗰邊**(冇 context = 見唔到 request 資料) |
| **R6** | **UI pattern 觸發 H6 STOP 而 phase 中途先發現** | Med | Low | `F5` 開工前先跑 `ui-design` 對一次,**唔好等 render 先知** |
| **R7** | 🟡 **`T2-d` 等緊本 phase** —— dock 依賴 chat。本 phase 拖長 = 兩塊一齊拖 | Med | Low | 保持 `F5` 真係「最小」;唔好順手做 dock |

---

## 5. Day-by-Day —— ⚠️ **本節刻意留空**

**點解**:`OQ-B` 答 A 定 B,`OQ-E` 答 SSE 定 WebSocket,兩條夾埋可以差一倍工作量
(B 要改既有表 + 重新界定一條 Accepted 決定;WebSocket 係 **H2 新 dependency** 要另一份 ADR)。

⇒ **`§7` 答完之後,喺 §8 changelog 補返一個 breakdown,同時填 `end_date`。**

📌 W46 個 plan 估 21 條 acceptance 用咗接近估算;W47 估 20h / 3 日而 code 側 1 日做完 ——
**兩次都係喺 scope 已經定死之後先估得準**。本 phase 而家未到嗰步。

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

## 7. Open Questions —— 🔴 **七條全部未答,而且唔係細節**

| # | 問題 | 點解佢改變交付物 | 建議 |
|---|---|---|---|
| **OQ-A** | 一條對話**綁邊度**?①一張 request ②一個人(跨 request)③完全獨立 | ①最窄兼天然有 scope;③最貼 `R-E`(「任何頁面都彈得出」)但**冇 scope 起點**(見 `OQ-D`) | 傾向 **②**,而 request 做**可選** context |
| **OQ-B** | schema:**新 model** 定**放寬 `AgentMessage`**? | 見 `F2` 張表 —— 後者要重新界定 `ADR-0036 D6` | 傾向 **A(新 model)**;理由係 D6 |
| **OQ-C** | chat 入面開嘅 run,**點樣關聯**返條對話? | 冇 link 就答唔到「呢個 proposal 由邊句話嚟」;有 link 就要決定係 FK 定 soft ref | 傾向 **FK**(跟 `AgentRun.requestId` 先例) |
| **OQ-D** | 🔴 **chat 冇 request context 嗰陣,agent 睇到咩?** | `OQ-2`(scope 綁啟動者)假設咗有起點。冇起點 = 要決定 default | 🔴 **窄嗰邊**:冇 context 就見唔到任何 request 資料 |
| **OQ-E** | Streaming:**另開 SSE** 定 **WebSocket**? | WebSocket = **H2 新 dependency** + 另一份 ADR + ACA ingress 未驗 | 傾向 **SSE**(零新 dep,而 `B6` 證咗 ingress 過到 SSE) |
| **OQ-F** | 邊個 chat 得?跟 `canUseAgent`(ADMIN+REGIONAL)定收窄? | 關 W28 drift test 同 `OQ-A` | 傾向 **跟 `canUseAgent`**,收窄容易放寬難 |
| **OQ-G** | 🔴 **`OQ-4`(scope report §5.3)—— 對話 persist 幾耐?** | **H4** —— 對話含 PII,而 `audit-retention` 一直未做。**唔答就唔應該落 migration** | 要 owner 答;**唔建議由 AI 拍板** |

> 🔴 **`OQ-G` 同 `OQ-D` 兩條係 blocking** —— 一條係 H4,一條係安全邊界。
> 其餘五條答唔到可以用建議值行,但要喺 §8 log。

---

## 8. Plan Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-08-18 | Initial draft(`status: draft`) | Tier 2 `T2-c`,W47 closed 之後嘅下一塊。**七條 OQ 未答 ⇒ 冇 Effort / 冇 end_date / 冇 day-by-day**,見 §0 同 §5 | AI(未 approve) |

---

**Lifecycle reminder**:呢份 plan **而家係 draft** —— 按 PROCESS **R1**,
multi-day implementation 開始之前必須有 approved pre-doc。**未 approve 唔可以寫 code。**
`status` 轉 `active` 之後先 derive `checklist.md`。
