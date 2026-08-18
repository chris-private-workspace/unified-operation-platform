# W48 — Conversation session · Checklist

> 由 `plan.md` derive。🟢 **plan `status: active`(Chris 2026-08-18 approve,七條 OQ 全答)**。
> 每項做完即勾 + 寫 `progress.md` Day-N(R2)。
> ✅ **八條 OQ 全部答齊**(`OQ-H` = soft,見 `F0-5`)· ✅ **`ADR-0041` `Accepted`**(見 `F1-5`)。

## `F0` — 開工前

- [x] F0-1 掃 phase 號(PROCESS §2.1)—— `git fetch --all --prune` + `git ls-remote --heads`:remote **只剩 `main`**,`docs/01-planning/` 最大 **W47** ⇒ 揀 **W48**。📌 順帶見到 `W36` 真係有兩個 folder,即嗰個撞號實例
- [x] F0-2 由 `origin/main`(`3bb21fd`)開 `feat/w48-agent-conversation`
- [x] F0-3 Grounding —— 兩個發現寫咗入 `progress.md` Day 0:①`AgentMessage` **綁死 `runId`**,佢係 run transcript 唔係 chat,而「放寬佢」會改動 `ADR-0036 D6` 嘅覆蓋範圍 ②今日條 SSE 個 payload **明文冇 content**(`refetch the run`),而 `B6` 證嘅係 heartbeat 唔係 token 流
- [x] F0-4 🟢 **七條 OQ 2026-08-18 答齊,plan `draft → active`** —— `OQ-A` 綁人 · `OQ-B` 新 model · `OQ-C` FK · `OQ-D` 窄嗰邊 · `OQ-E` SSE · `OQ-F` 跟 `canUseAgent` · `OQ-G` 一直存在直至清掉
- [x] F0-5 ✅ **`OQ-H` 2026-08-18 答咗:soft(`archivedAt`)** —— ⇒ 同 `ADR-0040` 一致,平台喺兩個相鄰 model 唔會有兩個相反答案;verb 亦跟佢先例**唔用 `DELETE`**。⚠️ **AI 建議過「soft 為主 + 一條明文 hard 路留畀 H4」,冇被取納** ⇒ **GDPR-style 徹底移除仍然冇答案**,`OQ-G` 個「直至清掉」實際語意係「直至隱藏」。**已寫入 `ADR-0041` Consequences 做知情取捨,唔係未發現嘅缺口**
- [x] F0-6 ✅ **2026-08-18 借 5433 做咗(Chris 批)** —— 🔴 **但收貨結果同本條寫嘅前提唔同**:`prisma migrate status` 返 **`27 migrations found` + `Database schema is up to date!`** ⇒ 嗰兩個「pending migration」**一早已經 apply 咗**(另一個 worktree / 另一個 session 做嘅),本條由頭到尾冇嘢要補。📌 **本機 DB 兩個 worktree 共用,所以「我呢邊未做」推論唔到「DB 未做」** —— 呢個前提喺 checklist 度掛咗兩日,而查一次 `migrate status` 就答到。還原亦真驗過(TCP `True` · `pg_isready` accepting · 佢個 `ai_document_extraction` DB 完好)

## `F1` — ADR:互動模型(**H1**,排第一)

- [x] F1-1 ✅ **`ADR-0041` 寫咗(`Proposed`)** —— 八條 OQ 寫成 **D1–D9**,五個 alternative 逐個講點解 reject。🔴 **`Alternative A`(放寬 `AgentMessage`)個 reject 理由值得留意**:佢嘅**吸引力正正係佢嘅危險** —— 睇落係「慳一張表」,實際係改一條 Accepted 決定嘅覆蓋範圍,**而且冇任何 test 會紅**
- [x] F1-2 ✅ **`OQ-H` 正面答咗(`D7`)** —— `archivedAt` soft,唔用 hard delete;🔴 **`archivedAt` 同 `AgentRun.hiddenAt` 明文唔可以合併**(一條 archived 對話入面可以有一個**冇被 hide** 嘅 run,嗰個 run 仍然應該出現喺全域 run 列表)
- [x] F1-3 ✅ **同 `ADR-0040` 嘅關係寫咗兩層** —— ①`D7` 跟佢揀 soft ⇒ 一致 ②Context ③ 記低咗**佢自己把 GDPR 嗰半推咗嚟**,而本 ADR **再推一次**。📌 寫低咗個形狀:**一條冇人拒絕、但每次都排喺後面嘅問題,同一條被否決咗嘅問題,喺文件上睇落一模一樣**
- [x] F1-4 ✅ **`D1` + Context ① 寫咗點解唔重用 `AgentMessage`** —— 佢綁死 `runId`,而 `ADR-0036 D6`「永久保留」原本只係講 run transcript;放寬佢係**改覆蓋範圍**唔係加欄(同 `ADR-0035`「收窄 vs 推翻」判斷同族)
- [x] F1-6 ✅ 更新 `docs/adr/README.md` index(0041 一行)
- [x] F1-5 ✅ **`ADR-0041` `Accepted`(Chris 2026-08-18 —— D1–D9 連 Consequences 一併批)** ⇒ `F2` 開得工。📌 `Proposed` 嗰一步存在嘅唯一理由,係 `D3`(安全邊界)同 `D7`(retention)兩條嘅**後果**佢未見過逐條寫出嚟嘅版本(跟 `ADR-0037` 先例)

## `F2` — 對話 schema + migration(**H1**)

- [x] F2-1 ✅ `AgentConversation`(`startedById` required + FK · `requestId?` + FK · `profileId?` **`onDelete: Restrict`** · `archivedAt?` · `@@index([startedById, updatedAt])` + `@@index([requestId])`)—— `prisma validate` **exit 0**
- [x] F2-2 ✅ **`AgentChatTurn`**(🔴 **唔叫 `AgentTurn`** —— `ADR-0041 Errata E1`,Chris 2026-08-18:`agent-runtime.provider.ts:115` 一早 `export interface AgentTurn`,佢係 **seam 一次 runtime round-trip 嘅正規化結果**,而 `F3` 個 service 會**同時要兩個**;`D1` code block 刻意唔改,靠 `agent-conversation.schema.spec.ts` 一條 test 釘住)(`conversationId` **`onDelete: Cascade`** · `role` · `content` · `@@index([conversationId, createdAt])`)。🔴 **`onDelete` 刻意唔對稱兼寫咗落 schema 註釋**:turn `Cascade`(跟 `AgentStep`/`AgentMessage`/`AgentProposal` 先例)而 `AgentRun.conversationId` `Restrict` ⇒ **淨效果 = 一條開過 run 嘅對話 DB 層面刪唔到,冇開過嗰啲刪得兼帶走 turn**;兩者都冇 endpoint(D7),呢個純粹係「有人繞過平台直接落 DB」嗰陣 DB 做嘅嘢
- [x] F2-3 ✅ **`AgentRun.conversationId String?` + relation + `@@index([conversationId])`**(`OQ-C` / D4)—— **`onDelete: Restrict`**,理由同 W47 `profileId` 一字不差:Prisma optional relation 預設 `SetNull` 會令一個直接落 DB 嘅 delete **一次過**把「呢個 run 由邊條對話開」變 unknown 兼**零錯誤**
- [x] F2-4 ✅ **`20260818055347_w48_agent_conversation`** —— **純 additive,零 DROP**(`ADD COLUMN` ×1 · `CREATE TABLE` ×2 · `CREATE INDEX` ×4 · `ADD FOREIGN KEY` ×5)。`migrate deploy` **exit 0**(28 migrations),**落 DB 對真結構**:`\d "AgentConversation"` 七個欄同 nullability 逐個對得返,三條 FK 嘅 `ON DELETE` 亦逐條對(`profileId` RESTRICT · `requestId` SET NULL · `startedById` RESTRICT),而 **`Referenced by` 兩條正正就係嗰個刻意唔對稱嘅設計**:`AgentChatTurn` **CASCADE** · `AgentRun` **RESTRICT**
- [x] F2-8 ✅ **`G3` 補咗 DB 層證據**(唔止 schema source scan)—— `information_schema.columns` 實查:`AgentMessage.runId` **`is_nullable = NO`** · `AgentMessage` **冇 `conversationId`**(query 三個欄只返兩行)· `AgentRun.conversationId` **`YES`**。⚠️ **而 `AgentMessage` 有 36 行真資料** ⇒ `G3` 唔係喺一張空表上面講嘢,`Alternative A` 要改語意嘅就係嗰 36 行
- [x] F2-5 ✅ **`G3` 嘅 test 寫咗**(`agent-conversation.schema.spec.ts`,4 條)—— 🔴 **佢係 source scan 唔係 behaviour test,而呢個係本條嘅重點**:`Alternative A` 落地之後**行為完全一樣**,所以任何一條 behaviour test 都會照綠;要捉到佢就要釘 **shape**。**falsification 兩輪,零誤傷**:①`runId String?` ⇒ **恰好第 1 條紅** ②`AgentMessage` 加 `conversationId` + `AgentConversation` 加 `messages` ⇒ **恰好第 2、3 條紅**,兩輪紅嘅原因逐字都係想證嗰個(W47 `F3-6`「33 紅但原因唔啱」嘅反面)
- [x] F2-7 ✅ **順手修咗一條被我擴大咗嘅既有 test**(`permissions.spec.ts` 「AgentPrincipal carries no Role」)—— 佢個 slice 終點寫死 `model AgentRun {`,而 **W47 插 `AgentProfile`、W48 再插兩個 model** 之後,佢已經靜靜檢查緊四個 model。🔴 **一直綠係彩數唔係設計**(我新加嘅 `AgentTurn.role` 係細楷,而 assert 係 `toContain('Role')` 大楷)⇒ 終點改成 `model AgentProfile {`,令佢真係只檢查佢名寫住嗰個 model
- [ ] F2-6 DEV migration(部署之後)

## `F3` — Conversation service + endpoint

- [x] F3-1 ✅ **六個 endpoint**(唔止 plan 寫嗰四個 —— `archive`/`unarchive` 係 `F3-6`)。⚠️ **`POST /:id/turns` 返 `{turn, runId}` 唔返 agent 個答覆** —— run 背景執行(`ADR-0039 F1`,`POST /agent/runs` 由 W46 起就係咁);**assistant 嗰半嘅 turn 由 `F4` 寫返落 `AgentChatTurn`**,呢個係刻意切法唔係漏
- [x] F3-2 ✅ `@Roles(ADMIN, REGIONAL)` class-level,同 `AgentRunController` **逐字一樣**(`OQ-F` / `D6`)。🔴 **順帶更正一個文件同 code 對唔上嘅講法**:`canUseAgent` **喺 code 入面唔存在**,佢係 plan / ADR 嘅講法;真嘢係 controller 個 class-level `@Roles`
- [x] F3-3 ✅ **如預期紅,而且 diff 逐行對過先更新 snapshot**(唔係 `jest -u` 就算):`+1` controller · **`+6` endpoint 全部 `[ADMIN,REGIONAL]`** · **零 row 移除** ⇒ 冇任何既有權限被郁到。📌 **`+6` 本身就係 `F3-2` 嘅證據**
- [x] F3-4 ✅ **獨立 commit** —— 🔴 **開工先揾到 `ADR-0041 D3` 個 phrasing 建基於一個唔成立嘅前提**(佢寫「tool 收唔到 request id」,而 `get_request` 個 requestId 一直係 **model 自己填**,唯一嘅閘係 OpCo)⇒ 照字面做唔到,要令 tool **唔出現喺 list**。Chris 2026-08-18 批:registry 按 scope 過濾 · 四個 tool 算 request-scoped。**falsification 恰好 3 條紅零誤傷**
- [x] F3-5 ✅ `CONVERSATION_SELECT` / `TURN_SELECT` 兩個 exported const,controller spec **兩邊 key 用 typed map 對數**(widening 任何一邊都 compile 唔到)**+ 一條獨立負面 assert** —— 因為兩邊都冇某個欄一樣算「對數」,**對數證明唔到「危險欄唔喺度」**
- [x] F3-6 ✅ **`POST :id/archive` + `:id/unarchive`**(`OQ-H` = soft),verb 跟 `ADR-0040 D2` **唔用 `DELETE`**。⚠️ **刻意冇寫 audit,理由同 `ADR-0040 D5` 唔同族**:嗰條係 ADMIN 郁**人哋睇得到**嘅嘢;archive 係人收起自己一條**其他人本來就讀唔到**嘅對話,寫 audit 就係記一件冇第二方嘅事
- [x] F3-7 ✅ `agent-conversation.controller.spec.ts` + `agent-conversation.service.spec.ts`
- [x] F3-8 ✅ **一個 ADR 冇明文嘅可見性決定,寫咗落 code**:對話 **owner-only,連 ADMIN 都唔見**。理由係平時嗰個 bound 喺度唔存在 —— `getRun` 靠 run 個 **request** 做 OpCo scope,而對話可以**冇 request** ⇒ 剩返唯一誠實嘅 bound 就係 `startedById`。⚠️ **唔等於 agent 活動避開 admin 視線**:對話開嘅 run 係普通 run,照樣出現喺全域 run 列表,transcript 照樣 ADMIN 可讀(`AgentMessage`,`ADR-0036 D6` 永久保留)—— **私隱嘅係 chat 外殼,唔係 agent 做過乜**
- [x] F3-9 ✅ **`agent.boundary.spec.ts` 加 `writersOf('agentConversation')` + `writersOf('agentChatTurn')`** —— **同表一齊加,唔係等人發現**(CH-031 教訓:`AgentRun` 成個 phase 冇 writer 約束,而**一個缺席嘅守衛同一個批准過嘅行為喺 code 上面一模一樣**)。⚠️ `ai-assist.service.ts` **讀** `agentChatTurn`(`inputFor`)但唔可以出現喺個 list —— 讀同寫係兩種權力

## `F4` — Streaming(送真內容)

- [x] F4-1 ✅ **per-conversation SSE** —— 新 event `AGENT_CONVERSATION_CHANGED` + `publishConversationChanged()` + `conversationChanges()` + `GET /agent/conversations/:id/events`。**冇重用 `changes()`**(佢按 runId 過濾,而一條 thread 每個 turn 開一個新 run ⇒ 過濾唔到)。🔴 **但唔係 token 流 —— Chris 2026-08-18 揀咗 turn-level notify,而 plan 寫嘅係 token-by-token ⇒ `plan.md §8` 有 deviation 記錄(R3)**
- [x] F4-2 ✅ **fail loud 落咗兩層**:①`recordAssistantTurn` 個 publish 喺 **`finally`** ⇒ 寫 turn 掟咗都照通知 ②worker 個 `catch` 一樣 call 佢再 rethrow ⇒ **run failed 都會通知對話**。🔴 **點解呢個先係「fail loud」嘅實質**:一條只收到成功消息嘅 thread,個畫面會**永遠顯示「思考緊」**,而**等緊嘅人唔會 retry** —— 呢個比一個明顯錯誤差
- [x] F4-3 ✅ **兩個上限一齊**(`MAX_HISTORY_TURNS = 20` + `MAX_HISTORY_CHARS = 20_000`)—— 兩個都要,因為**任何一個單獨都喺對方蓋住嗰個 case 失效**:20 個一字 turn 唔使錢,兩個 4000 字 turn 就要。🔴 **截斷會自己出聲**(`[N earlier turn(s) omitted]`)—— 一個收到靜靜縮短版 history 嘅 model,會就住佢睇唔到嘅 turn 講「as discussed earlier」,而讀嗰個人分唔出
- [x] F4-4 ✅ **falsification 恰好 4 條紅零誤傷**(3 條「冇嘢講都要通知」+ 1 條「寫失敗都要通知」),424 綠
- [x] F4-5 ✅ **assistant turn 寫返落 `AgentChatTurn`**(F3 刻意留低嗰半)—— 由 **worker** 拎住 `executeRun` **返嘅** `finalOutput` 交畀 conversation service。🔴 **點解唔喺 DB 讀返**:①`finalOutput` **根本冇存落 `AgentRun`** ②另一個存 agent 講過嘅嘢嘅地方係 `AgentMessage`,而佢 **ADMIN-only + 永久保留**(`ADR-0036 D4/D6`)⇒ 由嗰度讀個回覆出嚟畀 owner 睇,就係**靜靜把一張 admin-only 審計表變成 user-facing**
- [x] F4-6 ✅ **history**(plan 冇獨立列,但佢先係 `F4` 真核心)—— 之前 `inputFor` 只送最後一句 ⇒ 條「對話」實際上係**一串互不相干嘅問答**。⚠️ **flatten 成文字**(`Person:` / `You:`),因為 seam 收 `input: string`;送結構化 message list 要**擴 seam = H1**,而本 phase 個 streaming 決定啱啱行咗相反方向。**代價寫咗落 code**:model 讀嘅係一份**轉述**,而早前 turn 嘅 tool call 唔喺入面
- [x] F4-7 ✅ **W28 drift 第二次紅,一樣係逐行對過先更新** —— `+1` row(`GET /agent/conversations/:id/events → [ADMIN,REGIONAL]`),零移除

## `F5` — 最小 UI(**H6**)

- [x] F5-1 ✅ **`/assistant`**(thread 列表 · transcript · 輸入)—— **唔係 `Drawer`**(`T2-d`)。🔴 **一定要新畫面而唔係 `/agent` 加個 tab**:`/agent` 係 **ADMIN-only**(`canManageAgentProfiles`)而對話係 **ADMIN + REGIONAL**(`D6`)⇒ 塞入去 REGIONAL 就入唔到。Chris 2026-08-18 批 route + sidebar entry,已登記 `design-system.md §6`
- [x] F5-2 ✅ **`ui-design` DS-1…DS-12 開工前對咗** —— 🟢🟢 **兩個 plan 預咗會觸發 H6 STOP 嘅位,實際上都唔使開新 primitive**:①chat 氣泡 = `Card` 層 token(1px border + surface tint,DS-7)⇒ **組合既有 primitive**(§5 明文「直接做」)②**streaming 游標消失咗** —— `F4` 揀咗 turn-level notify,冇 token 流就冇游標。📌 **一個 transport 決定順手清走一個 UI 風險**。DS-11 係唯一 ❌(prototype 冇 chat 畫面),而 **§6 登記處就係為呢件事存在**
- [ ] F5-3 🚧 light + dark 真 render(`render-check.mjs`)· 零橫向溢出 —— **要起本機 stack ⇒ 要批停 `ai-doc-extraction-db` 交還 5433**。⚠️ **「一個 view 一個 primary」呢半唔使等 render**,已有 test 釘住(數 `button.bg-accent` = 1 兼且係 `Send`)
- [x] F5-4 ✅ **`G4` 喺 UI 側:全個畫面冇任何 approve 掣** —— run 泊喺 proposal 嗰陣,thread **link 去嗰張 request**。🔴 **兩條 test,而第二條先係持久嗰條**:①behavioural(有 link · 冇 `/approve|reject/i` 掣)②**source scan**(`assistant.tsx` 唔可以出現 `useDecideProposal` / `useApprove` / `/proposals`)—— 因為第一條**只擋到一個串「Approve」嘅掣**,將來一個叫 `Accept` 嘅一樣過。同 `ADR-0036 D2` 同一個論據:**absence beats instruction**
- [x] F5-5 ✅ **OPERATIONS section 第一次帶 role predicate** —— 之前只有 ADMIN section 有(W31)。Assistant 係**營運工具唔係 admin 功能**,擺入 Administration 去借嗰個 gating 就會把一個日常工具歸錯類 ⇒ `NavEntry` 加 optional `visible`,冇寫就係「登入咗就見到」(= 每個 prototype entry 嘅現狀)
- [x] F5-6 🔴 **更正 `F3-2` 講錯咗一半嘅嘢**:`canUseAgent` **web 側一早存在**(`lib/roles.ts:61`,W46 F8 加,ADMIN + REGIONAL,語意逐字啱)—— 我當時只 grep 過 **api** 側就講「code 入面唔存在」。⇒ **`D6` 講「跟 `canUseAgent`」喺 web 側係字面成立嘅**,而我差啲就加咗第二個同名 function(tsc `TS2323` 捉到)

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
