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
- [x] F5-3 ✅ **light + dark 真 render**(2026-08-18,Chris 批咗借 5433)—— token swap 真發生(`--bg` `#f5f5f6` → `#08080a` · `--card` `#ffffff` → `#141417` · `--accent` `#E60027` → `#ff3355`)· **零橫向溢出**(`scrollWidth` = `clientWidth` = 1440,兩個 theme)· live 實測 `button.bg-accent` = `["Send"]` 一個。⚠️ **`render-check.mjs` 影唔到 transcript**:佢冇 click 邏輯,而揀邊條 thread 係 `useState` 冇入 URL ⇒ 佢見到嘅永遠係「Nothing open」。氣泡嗰半用 **Playwright MCP** 驅動(切 thread → 每個 theme 各一次 `getComputedStyle` probe + 截圖)。🔴 **兩半證據來源唔同,分開寫**(沿用 `CH-015` / `F9-8` 先例):可重現嗰半 = committed script,thread 嗰半 = session 工具
- [x] F5-4 ✅ **`G4` 喺 UI 側:全個畫面冇任何 approve 掣** —— run 泊喺 proposal 嗰陣,thread **link 去嗰張 request**。🔴 **兩條 test,而第二條先係持久嗰條**:①behavioural(有 link · 冇 `/approve|reject/i` 掣)②**source scan**(`assistant.tsx` 唔可以出現 `useDecideProposal` / `useApprove` / `/proposals`)—— 因為第一條**只擋到一個串「Approve」嘅掣**,將來一個叫 `Accept` 嘅一樣過。同 `ADR-0036 D2` 同一個論據:**absence beats instruction**
- [x] F5-5 ✅ **OPERATIONS section 第一次帶 role predicate** —— 之前只有 ADMIN section 有(W31)。Assistant 係**營運工具唔係 admin 功能**,擺入 Administration 去借嗰個 gating 就會把一個日常工具歸錯類 ⇒ `NavEntry` 加 optional `visible`,冇寫就係「登入咗就見到」(= 每個 prototype entry 嘅現狀)
- [x] F5-6 🔴 **更正 `F3-2` 講錯咗一半嘅嘢**:`canUseAgent` **web 側一早存在**(`lib/roles.ts:61`,W46 F8 加,ADMIN + REGIONAL,語意逐字啱)—— 我當時只 grep 過 **api** 側就講「code 入面唔存在」。⇒ **`D6` 講「跟 `canUseAgent`」喺 web 側係字面成立嘅**,而我差啲就加咗第二個同名 function(tsc `TS2323` 捉到)

- [x] F5-7 🔴🔴 **render 即刻捉到一個六條 test 全綠都捉唔到嘅缺陷,而佢係本次 live 驗最值錢嗰件事** —— 畫面**同時**出 `Thinking…`(spinner)同「AI-Assist has proposed something」。成因:`LIVE_STATUSES` 包 `awaiting_approval`,所以**同一個 run** 令 `isThinking` 同 `runAwaitingDecision` 一齊為真。📌 **點解 test 冚唔到**:五條 assert 每條都問「某樣嘢喺唔喺畫面」,而呢個缺陷係**兩樣嘢一齊喺畫面** —— 同 `CH-030` 嗰個 `items-center`(test 問「字喺唔喺度」,缺陷係「佢喺邊」)**同族**。🔴 **後果唔止難睇**:spinner 叫人**等**,而喺 parked 狀態下冇嘢會再發生 —— 佢要自己去撳。呢個係 `R16`「stall reads as progress」嘅**鏡像**:progress reads as stall,令人唔去做應做嘅事。**修法**改最窄嗰層(`isThinking` 剔走 `awaiting_approval`,`isLiveRun` 語意唔郁 —— 佢講「run 未完」係啱嘅),新 test **assert 個 PAIR**(有 link 兼且冇 spinner),因為任何一半單獨 assert 都會繼續綠

- [x] F5-8 ✅🔴🔴 **live 揭到一個「平台狀態令功能完全用唔到」嘅缺口 —— Chris 2026-08-18 揀 A(畫面顯示 + 揀 profile)** ⇒ 三層事實逐條實測:①`assistant.tsx:117` 開新對話 `create.mutate({ requestId: null })`,**冇 `profileId` 呢個概念** ②`AgentProfile` **冇 default**(W47 刻意決定:多過一個 active 而冇指名 ⇒ **400 兼講明有幾多個**)③本機**兩個 active profile** ⇒ **每條新對話第一句都 400**。⚠️ **`send.isError` 有顯示個 message**(即 fail loud,唔係靜靜死),但用戶**冇出路** —— 畫面冇地方揀,而 **`GET /agent/profiles` 係 `@Roles(ADMIN)`** ⇒ REGIONAL 連列表都攞唔到。🔴 **順帶驗到一個刻意設計唔係 bug**:400 嗰刻 **user turn 已經寫咗落 DB 而 run 冇**(`agent-conversation.service.ts:202-206` 明文「what they said is a fact, and losing it to roll back a queue error would be the platform forgetting something a person did」)⇒ **orphan turn 係設計,唔使修**。**三條路各有代價**:**A** 前端加 profile 揀 ⇒ 要開一條 REGIONAL 讀得到嘅 profile 列表(郁 role 邊界)· **B** 後端揀一個 default ⇒ **直接推翻 W47「冇 default profile」**(H1,而嗰條決定嘅理由係「一個睇唔到嘅 default 就係將來用錯 model 都冇人發現嗰個位」)· **C** 只改文案叫人去 `/agent` ⇒ 最平,但 REGIONAL 入唔到 `/agent`

- [x] F5-9 ✅ **`F5-8` 落地(Option A)** —— 新 `GET /agent/profiles/options`(**ADMIN + REGIONAL**,`{id, name, model}`,**冇 `prompt`**)+ `/assistant` 揀 agent + thread header 講明跑緊邊個。🔴 **四個決定值得記**:①**獨立 endpoint 唔係放寬現有嗰條** —— 「同一條 route 按 role 返唔同 shape」正正係 W46 / W47 兩次 leak 嘅形狀 ⇒ 兩個 select **結構上唔可能漂埋一齊**,代價只係一個常數 ②`@Roles` 落 **method** 層覆蓋 class(`RolesGuard` 行 `getAllAndOverride([handler, class])`)⇒ 管理仍然 ADMIN-only,**只有「睇下有邊個 agent」變寬**;`OQ-A` 講嘅係「改咗影響每一個未來嘅 run」,同「見唔見到有咩揀」唔同一件事 ③**揀嗰陣一律送 `profileId`,即使得一個** ⇒ conversation 永遠答得出「跑緊邊個」;而 picker **得一個 agent 就唔顯示**(一個選擇唔算選擇)④**retired profile 顯示「Retired agent」唔係靜靜唔顯示** —— 後者就係 `OQ-A` 嗰個「睇唔到嘅 default」換件衫。**W28 drift test 第三次紅**,`+1` row(`GET /agent/profiles/options → [ADMIN,REGIONAL]`)**零移除**,逐行對過先更新 snapshot。falsification **兩道**:①`listOptions` 個 select 加返 `prompt` ⇒ **1 紅 28 綠**(`Expected path: not "prompt"`)②`assistant.tsx` 唔送 `profileId` ⇒ **1 紅 15 綠**(就係缺陷本身)。gate:api **1484 / 97**(+4)· web **480 / 45**(+6)· tsc / lint / build 全 0
- [x] F5-10 ✅ **`F5-9` 嘅 light + dark 真 render**(2026-08-19,Chris 批咗再借一次 5433)—— **兩個都係既有 primitive / 既有 tone** 所以唔觸發 H6 STOP,但 `F5-3` 嗰次 render **蓋唔到今日棵樹**(W47 教訓)。實測:purple badge `#6d28d9` → **`#a982f0`**(DS-8 AI → purple,**兩個 theme 都行返 token 唔係硬色**)· picker `--card` `#ffffff` → `#141417` · 高度 **34px = 同 `Input` 一致** · 一個 primary(`["Send"]`)· 零橫向溢出(1440 = 1440)· **`Thinking…` 仍然唔喺度而 proposal block 喺**(`F5-7` 修正喺新樹上仍然生效)
- [x] F5-11 ✅🔴 **`F5-8` live 驗,而佢比預期強** —— 經 **UI** 開新對話(缺陷本來就發生喺呢條路):picker 見到兩個 agent,**我刻意揀第二個 `power-bi-only`**。①**冇 400**(`text-danger` 零元素)②thread header 即刻顯示 **`power-bi-only`** ⇒ 揀嘅嘢真入咗 conversation ③agent 答「**I can only suggest Power BI licences**」⇒ **揀嘅唔止係一個 id,係真行為** —— 嗰句正正係 `power-bi-only` 個 custom prompt(「Only ever propose Power BI licences」),即 W47 `R26` 喺 conversation 呢條新路上重現 ④SSE 自動更新(bubble 1 → 2,冇 refetch)。🟢 **順帶 live 證到 `G5`**:`GET /agent/profiles/options` 真 wire 只有 `id` / `name` / `model` **三個欄**,而 `power-bi-only` 喺 DB 係**有 prompt** 嘅 ⇒ 唔止 unit test 講,係真嘢冇出去
- [ ] F5-12 🚧 **render 揭到一個「可能誤解」,唔係缺陷,留畀 Chris 睇截圖判斷** —— picker 顯示 `power-bi-only`(= **開新對話**會用邊個)而同一屏 thread header 顯示 `gpt-5.6-luna`(= **呢條**用緊邊個)。兩者意思唔同,而視覺上都係「一個 agent 名」。⚠️ **今日冇改**(§1.2/§1.3 —— 唔加未要求嘅嘢),而佢**冇 `F5-7` 咁硬**:嗰個係自相矛盾,呢個係可能誤解。💡 最平嘅修法係 `aria-label` / 一個 label 由 `Agent` 變 `Agent for new conversations`(純文字,零視覺改動,但要一併改 test)。**`T2-d` dock 重用呢個 pattern 之前一定要答**

## `F6` — Gate

- [x] F6-1 ✅ root `npm test` exit 0 —— api **97 suites / 1480** · web **45 files / 474**(+1 = `F5-7` 嗰條)。⚠️ **收尾仲要再跑一次**(W47 教訓:`F6` 之後仲入咗 code commit,勾咗嘅 gate 唔等於蓋住今日棵樹)
- [x] F6-2 ✅ root `npm run lint` exit 0
- [x] F6-3 ✅ root `npm run build` exit 0(順帶 `tsc --noEmit` web 側 exit 0)
- [x] F6-4 ✅ `agent.boundary.spec.ts` 全綠(含 W48 加嘅 `writersOf('agentConversation')` / `writersOf('agentChatTurn')`)
- [x] F6-5 ✅ falsification —— `F5-7` 嗰道閘拆走 `if (latest.status === 'awaiting_approval') return false;` ⇒ **恰好 1 紅 9 綠零誤傷**,而且紅嘅原因**就係我想證嗰個**(`expected <div><svg…></div> to be null` = spinner 真出咗嚟),唔係 compile error。⚠️ W47 `F3-6` 有一次 33 紅但**紅嘅原因唔啱**,所以每次都要問多一句

## `F7` — Live 驗

- [x] F7-1 ✅ **本機三項全收**(2026-08-18)—— ①**真傾一段對話**:11 個 turn,`inputFor` 個 history flatten **跨 run 真生效**(run #2 個 user message 逐字見到 `Person: … You: … Person: …`)②**proposal**:`awaiting_approval` · `proposals: 1` · payload `skuId` = `f8a1db68…`(`POWER_BI_PRO` 正確),reasoning 自己講「rather than the distinct POWER_BI_PRO_DEPT variant」③**斷線重連**見 `F7-5`
- [x] F7-2 ✅🔴 **`OQ-D` live 收咗,而且係對照實驗唔係單邊觀察** —— **唯一變數 = `requestId` 在唔在**,同一句說話 · 同一個 profile:**冇** request context ⇒ agent 答「**I can't access pending requests or REQ0044067 with the available tools**」兼且 `steps` 只有一個 `start`(`detail` 明文 `with no request context`)= **零 tool call**;**有** request context ⇒ 真叫 `list_pending_requests` 並列出兩張單。🔴 **點解要做對照**:單睇前者,「filter 生效」同「model 純粹唔想叫」**睇落一模一樣** —— 呢個就係 W47 `G8` 嗰個教訓(部署唔會幫你做對照,要人再做一次)
- [x] F7-5 ✅ **斷線重連,行為問到底** —— 殺 api 鏈(保住 web + 個頁面)~140 秒再起返。①斷線期間送 turn ⇒ 畫面**唔郁**(7 個氣泡,而 DB 已經 9 個)②切走一條 thread 再切返 ⇒ **即刻 9 個** ⇒ 資料一直喺度,**唔通嘅係 SSE 唔係 read** ③remount 之後再送 ⇒ **自動變 11 個,冇 click 過** ⇒ 重連真通。📌 **成因唔係 bug 係一個有名有姓嘅 bound**:`MAX_CONSECUTIVE_FAILURES = 3`,而佢寫落去係為咗擋 403(`EventSource` 唔畀睇 status code)。🔴 **但 W48 把佢放大咗**:hook 自己個 doc 講「a thread has no terminal state — it is idle between questions」⇒ **一條 thread 活得遠耐過一個 run**,撞正一次 api 重啟(= 一次部署)嘅機會高好多,而**畫面唔會講**。⇒ 登 `F8-3`
- [x] F7-6 ✅ **順帶三個 live 發現(唔喺原 checklist,但唔記低就會失去)** —— ①🟢 **`scrubPii` 真生效**:`list_pending_requests` 個 tool_result 入面 `targetUpn` 係 `[redacted-email]`(H4)②🔴 **`D3` 收窄咗「見唔到」,收窄唔到「填錯」**:model 攞人講嘅 `REQ0044067` 當 `requestId` 去叫 `get_request` ⇒ `Request not found`。**失敗方向係安全嘅**(唔存在就 404),但「填一個存在而屬於第二個 OpCo 嘅 id」呢條路**本次冇驗** ⇒ 登 `F8-3` ③🔴🔴 **`search_catalog("Power BI Pro")` 返 `[]`,而 2026-08-19 再撞一次之後多咗一層要記** —— tool step **status = `ok`** 返空陣列(即「**搵唔到**」),而 agent 對用戶講「I **couldn't retrieve** the active catalogue」(即「**攞唔到**」)。**呢兩句對用戶意思完全唔同**:一個係「冇呢件貨」,一個係「系統壞咗」,而後者會令人去搵 IT。⇒ **平台冇 bug,但個 catalog 缺口被 model 措辭放大咗**。原文如下: —— catalog 得 `POWER_BI_PRO` 而 **101 個 SKU 個 `businessAlias` 全部 `null``**,即人話講法對唔到。agent 冇亂估,明文答「can't propose the licence without guessing」(**好行為**),但代價係佢幫唔到手。⇒ catalog curation 缺口,**唔喺 W48 scope**(同 `CH-026 G-7` 同族),登 `BACKLOG`
- [ ] F7-3 🚧 DEV:migration + 一條真對話 + **一次真 SSE 通知 + refetch**(⚠️ **唔可以引用 `B6`** —— 佢證嘅係 heartbeat + 短事件)。🔴 **本條 2026-08-19 `F8-1` 掃出寫錯咗兼更正**:原文寫「一次真 **token stream**」,而 `F4` 08-18 已經由 token-by-token 收窄做 **turn-level notify**(plan §8 有記,理由係真 token 流要擴 seam = H1,兼且 token 未經 `scrubPii` 就落 wire)⇒ **驗嘅嘢由頭到尾唔應該係 token**。📌 呢個就係 W47 教落「`F8-1` 要逐條掃 acceptance 句」嘅原因 —— plan §2 個 `F4` acceptance 其實**冇**寫 token(佢寫「DEV 真通」),stale 嘅只有 checklist 同 `G9` 兩處措辭
- [ ] F7-4 ⚠️ **唔可以睇 revision status 當證據**(entrypoint 令 migrate 失敗 NON-FATAL)

> 🔴 **2026-08-19(W49 Day 4)實測補一個座標,因為佢改變咗「仲差咩」嘅答案**:
> **DEV 一早有 W48 code,唔使再部署。**`/api/docs/api-json` 同日兩次 **逐 byte 一致
> (90341)**,入面有 `/agent/conversations` · `/agent/profiles/options` · `AgentChatTurn`;
> web bundle 有 `/assistant` · `Agent for new conversations`(picker)· `New conversation`;
> `/api/auth/sso/status` = `{"enabled":true}`。兩條新 route 返 **401 唔係 404** ⇒ 真喺 wire。
>
> ⇒ **三條全部卡同一樣嘢:一次真人登入**,唔係一次部署。
> **401 喺 guard 度擋住,由頭到尾未掂過 DB** ⇒ `F2-6`(migration)要一個**成功讀到新表**
> 嘅 response 先證得到 —— 而「一入到 `/assistant` 見到對話列表而唔係 500」就係嗰個 response。
>
> **三條收貨標準唔同,唔好當一件事**:
> `F2-6` = 入到 `/assistant` 唔 500(表存在)· `F7-3` = 送完一句之後 **agent 自己覆你而你冇撳 refresh**
> (要嘅係「唔使 refresh」嗰半)· `F7-4` = 唔使做,佢係一條約束(上面兩條就係證據)。
>
> ⚠️ **兩個已知陷阱,撞到唔好當壞咗**:`R33` 第一句返 400 講「有幾多個 agent」⇒ 撳 picker 揀一個;
> `R35` `Thinking…` 卡住 ⇒ **切走 thread 再切返**,見到答案 = SSE 靜默咗唔係 agent 死咗
> (⚠️ 兩者喺畫面上一模一樣)。

## `F8` — 收尾

- [x] F8-1 ✅ **`plan.md` acceptance 逐條掃 + 狀態欄** —— §3 九條全部填咗,而 **`G2` / `G9` 兩條「DEV ❌」逐條寫明差嘅係邊種**(`G2` 部署完自動收 · `G9` 要部署完再做一次對話),因為 W47 收尾把 `G1`/`G8` 當成同一個阻塞而佢哋唔係。🔴 **順帶掃出兩處 stale,而 W47 就係話呢一步會掃到嘢**:`checklist F7-3` 同 `§3 G9` 都仲寫住「一次真 **token stream**」,而 `F4` 08-18 已經收窄做 **turn-level notify**(plan §8 有記)⇒ 兩處措辭更正咗。⚠️ **plan §2 個 `F4` acceptance 本身冇錯**(佢寫「DEV 真通」)—— 錯嘅只有兩處引用佢嘅地方,**所以逐條掃唔可以只掃 §3 個表**
- [x] F8-2 ✅ progress retro —— 含**估算 vs 實際**(最貴嗰件 `F4` 反而最平;`F5-8` 整條唔喺 plan 入面)· **四件最值錢嘅事冇一件係 test 揾出嚟**(兩件係「test 結構上睇唔到」唔係「漏咗寫」)· 三個方法論教訓
- [x] F8-3 ✅ risk 入 `RISK_REGISTER.md` —— **六條 `R32`–`R37`**(chat 繞過 approval · chat PII 冇清除路徑 · 對話成本 · **SSE 斷 3 次永久靜默** · **`D3` 擋唔到「填錯」** · **`businessAlias` 全 null**)。順帶更新 `last_updated`(佢一直停喺 2026-07-31,連 W47 加 `R28`–`R31` 嗰次都冇郁)
- [x] F8-4 ✅ `BACKLOG.md` 同步(R7)—— W48 行改咗狀態 + 下一步(**三條 DEV 條目逐條寫明收法唔同**)· 新增 **`CATALOG-ALIAS`**(同 `CH-026 G-7` 同族,本機同 DEV 各要做一次,因為 curate 係 DB 資料唔跟部署走)
- [x] F8-5 ✅ `CLAUDE.md §0` + `SESSION_SUMMARY.md` doc-sync(§14)—— 兩份都加咗 W48 座標,而**第一句就講「`main` 上面一個字都冇,唔好用 W47 = 最新開工」**。順帶修 `SESSION_SUMMARY` 一處會直接害到下手嘅 stale:佢寫住「本機 DB …… 佢開緊 W47」,而 DB 一早 apply 咗 W48 個 migration
- [x] F8-6 ✅ **grep 掃狀態詞**(`卡部署` / `半收` / `status:` / `未做` / `🚧` / `等 Chris`)—— 掃出 **`progress.md` Day 3(續) 個「下一步」三行已經過時**(`F5-8` 同日揀咗 A 兼落咗地、`F8-3` 做咗)。**保留原文做日誌 + 加一句講明**,因為由上而下讀嘅人會信咗佢。📌 **一份日誌入面,每個「下一步」都係一個會過期嘅斷言**
