# W48 — Conversation session · Checklist

> 由 `plan.md` derive。🟢 **plan `status: active`(Chris 2026-08-18 approve,七條 OQ 全答)**。
> 每項做完即勾 + 寫 `progress.md` Day-N(R2)。
> 🔴 **`OQ-H`(「清掉」= hard 定 soft)仲未答** —— 佢 block `F2-3` 同 `F3-6`,唔 block `F1`。

## `F0` — 開工前

- [x] F0-1 掃 phase 號(PROCESS §2.1)—— `git fetch --all --prune` + `git ls-remote --heads`:remote **只剩 `main`**,`docs/01-planning/` 最大 **W47** ⇒ 揀 **W48**。📌 順帶見到 `W36` 真係有兩個 folder,即嗰個撞號實例
- [x] F0-2 由 `origin/main`(`3bb21fd`)開 `feat/w48-agent-conversation`
- [x] F0-3 Grounding —— 兩個發現寫咗入 `progress.md` Day 0:①`AgentMessage` **綁死 `runId`**,佢係 run transcript 唔係 chat,而「放寬佢」會改動 `ADR-0036 D6` 嘅覆蓋範圍 ②今日條 SSE 個 payload **明文冇 content**(`refetch the run`),而 `B6` 證嘅係 heartbeat 唔係 token 流
- [x] F0-4 🟢 **七條 OQ 2026-08-18 答齊,plan `draft → active`** —— `OQ-A` 綁人 · `OQ-B` 新 model · `OQ-C` FK · `OQ-D` 窄嗰邊 · `OQ-E` SSE · `OQ-F` 跟 `canUseAgent` · `OQ-G` 一直存在直至清掉
- [x] F0-5 ✅ **`OQ-H` 2026-08-18 答咗:soft(`archivedAt`)** —— ⇒ 同 `ADR-0040` 一致,平台喺兩個相鄰 model 唔會有兩個相反答案;verb 亦跟佢先例**唔用 `DELETE`**。⚠️ **AI 建議過「soft 為主 + 一條明文 hard 路留畀 H4」,冇被取納** ⇒ **GDPR-style 徹底移除仍然冇答案**,`OQ-G` 個「直至清掉」實際語意係「直至隱藏」。**已寫入 `ADR-0041` Consequences 做知情取捨,唔係未發現嘅缺口**
- [ ] F0-6 ⚠️ 本機 DB apply 兩個 pending migration(`ch031_agent_run_hidden_at` · `w47_agent_profile`)—— 要停 `ai-doc-extraction-db` 交還 5433(**要 Chris 批**);🔴 **一定要 `prisma migrate deploy`,唔可以 `dev`**(本機 DB 兩個 worktree 共用,`dev` 見到 drift 會提議 reset)

## `F1` — ADR:互動模型(**H1**,排第一)

- [x] F1-1 ✅ **`ADR-0041` 寫咗(`Proposed`)** —— 八條 OQ 寫成 **D1–D9**,五個 alternative 逐個講點解 reject。🔴 **`Alternative A`(放寬 `AgentMessage`)個 reject 理由值得留意**:佢嘅**吸引力正正係佢嘅危險** —— 睇落係「慳一張表」,實際係改一條 Accepted 決定嘅覆蓋範圍,**而且冇任何 test 會紅**
- [x] F1-2 ✅ **`OQ-H` 正面答咗(`D7`)** —— `archivedAt` soft,唔用 hard delete;🔴 **`archivedAt` 同 `AgentRun.hiddenAt` 明文唔可以合併**(一條 archived 對話入面可以有一個**冇被 hide** 嘅 run,嗰個 run 仍然應該出現喺全域 run 列表)
- [x] F1-3 ✅ **同 `ADR-0040` 嘅關係寫咗兩層** —— ①`D7` 跟佢揀 soft ⇒ 一致 ②Context ③ 記低咗**佢自己把 GDPR 嗰半推咗嚟**,而本 ADR **再推一次**。📌 寫低咗個形狀:**一條冇人拒絕、但每次都排喺後面嘅問題,同一條被否決咗嘅問題,喺文件上睇落一模一樣**
- [x] F1-4 ✅ **`D1` + Context ① 寫咗點解唔重用 `AgentMessage`** —— 佢綁死 `runId`,而 `ADR-0036 D6`「永久保留」原本只係講 run transcript;放寬佢係**改覆蓋範圍**唔係加欄(同 `ADR-0035`「收窄 vs 推翻」判斷同族)
- [x] F1-6 ✅ 更新 `docs/adr/README.md` index(0041 一行)
- [ ] F1-5 ADR `Accepted`(owner)⇒ 先可以落 `F2` migration

## `F2` — 對話 schema + migration(**H1**)

- [ ] F2-1 `AgentConversation`(`startedById` required · `requestId?` · `profileId?`)
- [ ] F2-2 `AgentTurn`(`conversationId` · `role` · `content` · `@@index([conversationId, createdAt])`)
- [ ] F2-3 🔴 **`AgentRun.conversationId String?` + relation**(`OQ-C` FK)—— ⚠️ **兩個 `onDelete` 等 `OQ-H`**;Prisma optional relation 預設 `SetNull`,即一個 delete 會把「呢個 run 由邊條對話開」**一次過**變 unknown(W47 `F1-3` 撞過同一件事)
- [ ] F2-4 migration **純 additive,零 DROP**;本機真 DB 跑得過,落 DB 對真結構
- [ ] F2-5 🔴 **`G3` 嘅 test**:舊 run 嘅 `AgentMessage` 讀路**一個字唔變**(falsification 釘住 —— 拆走要紅)
- [ ] F2-6 DEV migration(部署之後)

## `F3` — Conversation service + endpoint

- [ ] F3-1 `POST /agent/conversations` · `POST /agent/conversations/:id/turns` · `GET /agent/conversations/:id` · `GET /agent/conversations`
- [ ] F3-2 `@Roles` 跟 `canUseAgent`(ADMIN + REGIONAL,`OQ-F`)
- [ ] F3-3 🟢🟢 **W28 drift test 要認得新 endpoint** —— 佢喺 W47 捉到我**兩次**,今次預咗佢會紅,唔好當意外
- [ ] F3-4 🔴 **`OQ-D` 落喺呢度**:`requestId == null` 嘅對話,tool **攞唔到任何 request-scoped 資料** —— 係「攞唔到」唔係「攞到但唔顯示」。**一條 falsification 釘住**
- [ ] F3-5 `runState` / `prompt` **唔出 wire**(W46 / W47 兩次都係喺呢度漏,而列表最易漏)
- [ ] F3-6 ⚠️ **「清」嘅 endpoint 等 `OQ-H`** —— verb 同權限都由嗰個答案決定(`ADR-0040 D2` 先例:唔用 `DELETE`,因為 `DELETE` 會講一個假嘅真相)
- [ ] F3-7 controller spec —— 釘住 DTO 同 select 兩邊 key(W47 `F2-7` 第一次跑就揾到一個真缺口)

## `F4` — Streaming(送真內容)

- [ ] F4-1 per-conversation token 流(SSE,`OQ-E`)—— ⚠️ **唔可以重用 `agent-run.queue.ts` 個 `changes()`**(queue-wide BullMQ 事件,payload 明文冇 content)
- [ ] F4-2 🔴 斷線 **fail loud**,唔可以靜靜當完成(跟 `R16` 同一條規矩)
- [ ] F4-3 **turn 上限或 history 截斷**(`R3` —— 每個 turn 帶住成段 history,成本非線性升,而今日 blast-radius 係 per-run 唔係 per-conversation)
- [ ] F4-4 falsification:拆走 fail-loud → 要紅

## `F5` — 最小 UI(**H6**)

- [ ] F5-1 一版夠驗證互動模型。**唔起 `Drawer`**(`T2-d`)
- [ ] F5-2 ⚠️ **chat 氣泡 / streaming 游標 handoff 冇** ⇒ **開工前先跑 `ui-design` 對一次**(`R6`:唔好等 render 先知要 STOP)
- [ ] F5-3 light + dark 真 render(`render-check.mjs`)· 零橫向溢出 · 一個 view 一個 primary
- [ ] F5-4 🔴 **`G4` 喺 UI 側**:chat 產生嘅 proposal **仍然要行返同一條 approval 路** —— 唔可以喺 chat 側另開一個「快速批准」

## `F6` — Gate

- [ ] F6-1 root `npm test` exit 0 —— ⚠️ **收尾要重跑**(W47 教訓:`F6` 之後仲入咗 code commit,勾咗嘅 gate 唔等於蓋住今日棵樹)
- [ ] F6-2 root `npm run lint` exit 0
- [ ] F6-3 root `npm run build` exit 0
- [ ] F6-4 `agent.boundary.spec.ts` 全綠(新 service 唔可以直接 import vendor SDK)
- [ ] F6-5 falsification 每道新閘一次,真紅**零誤傷** —— ⚠️ W47 `F3-6` 有一次 33 紅但**紅嘅原因唔啱**,所以要問「紅嗰個原因係咪我想證嗰個」

## `F7` — Live 驗

- [ ] F7-1 本機:真傾一段對話 · 中途叫佢提 SKU(產生 proposal)· 斷線重連
- [ ] F7-2 🔴 **`OQ-D` live**:開一條**冇 request context** 嘅對話,叫 agent 攞 request 資料 —— **佢應該攞唔到**。呢個係本 phase 唯一一條安全邊界嘅 live 證據
- [ ] F7-3 DEV:migration + 一條真對話 + **一次真 token stream**(⚠️ **唔可以引用 `B6`** —— 佢證嘅係 heartbeat + 短事件)
- [ ] F7-4 ⚠️ **唔可以睇 revision status 當證據**(entrypoint 令 migrate 失敗 NON-FATAL)

## `F8` — 收尾

- [ ] F8-1 `plan.md` acceptance 逐條掃 + 填狀態欄(W47 做過,而嗰次仲掃出兩條 acceptance 自己寫錯咗)
- [ ] F8-2 progress retro
- [ ] F8-3 risk 入 `RISK_REGISTER.md`
- [ ] F8-4 `BACKLOG.md` 同步(R7)
- [ ] F8-5 `CLAUDE.md §0` + `SESSION_SUMMARY.md` doc-sync(§14)
- [ ] F8-6 🔴 **收尾用 grep 掃狀態詞**(`卡部署` / `半收` / `status: active` / `未做`)—— W47 收尾嗰次,我一邊寫「同一份文件兩處各講各」一邊自己漏咗一處,靠 grep 先揾返
