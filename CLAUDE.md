# CLAUDE.md — Unified Operation Platform Standing Instructions

> **AI coding agent:呢份文件係你嘅 standing instructions。每個 session 開始必須先讀,然後先做任何嘢。**
> **本 instruction 採用 Strict Mode**:架構決定一旦 lock 就唔可以單方面改,凡涉及 architectural change 必須 STOP and confirm。

---

## 0. Quick Identity Check(每 session 開始 30 秒讀)

| 項目 | Value |
|---|---|
| Project | **Unified Operation Platform** — IT operation / support 的管理 + 操作平台(逐步引入 AI 功能) |
| Primary Spec(platform) | `docs/architecture.md`(平台級,draft) |
| Module 1 Spec | `docs/02-architecture/licenseops/DESIGN.md`(**LicenseOps** = M365 license 履行,決策 SSOT) |
| Phase | 🟢🟢 **CH-034 request header 收窄 2026-08-20 —— 一日收晒(`G1`–`G8` 八條全 ✅,`status: done`)**。Chris 附效果圖:sync gate 由 Card 底部全寬一行,搬入左欄 · 收窄 · 同 Avatar 左邊對齊。實測 gate 由撐滿(≈1144)變 **780 / 789**,`gateLeft` = `avatarLeft` = `leftColLeft` = `avatarRowLeft` **四個全部 289**;web **564 / 50**(+2)。🔴 **三個教訓**:①**兩個 class 做晒成件事,而其中一個唔加就靜靜失效** —— 冇 `self-start`,flex column 預設 stretch ⇒ box 照撐滿、`ml-auto` 照把狀態飛去最右,**即改咗等於冇改而畫面唔會報錯**;冇 `max-w-full`,兩個 gate 未開嗰陣多咗兩個掣就會撐闊成張 card ⇒ **test 分別守住兩個** ②**`ml-auto` 刻意唔刪** —— 佢今日刪唔刪一模一樣(shrink-to-fit 冇剩餘空間),但 render 實測 wrapped 狀態下佢**真係做緊嘢**(兩個掣右對齊)⇒ 刪咗係「今日冇分別、將來有分別」嘅改動 ③🔴🔴 **render probe 報咗一個唔存在嘅缺陷,而揭穿佢嘅唔係座標係身份** —— `G3` 第一次 `FAIL`(gate `289` vs avatar `248`),而 `248` 正正係 sidebar 寬度,即我由 `h1` 行三層 `parentElement` **行過咗頭**量咗 main 區;加印 `avatarClass` / `avatarWidth`(`44`,逐格等於 code `size={44}`)先確定量緊乜 ⇒ **幾何 probe 一定要連「你量緊邊個 element」一齊印**,否則會去改一段本身冇問題嘅 code(同 CH-033 嗰個「probe 問錯問題」同族,但機制係**瞄準錯 element**)。🔴 **falsification 道 1 紅喺負面 assert 嗰半** —— 冇咗 `not.toContain('Onboarding request')`,「揾到共同 ancestor」對 Card 同 `<body>` 都成立 ⇒ 整條 test 靜靜綠。🚧 **未上 DEV**(要部署 #14),而佢**同 CH-033 一樣一個新字串都冇** ⇒ marker 只可能喺 CSS。⬇️ **以下係 CH-034 之前嘅座標** ⬇️ 🟢🟢 **部署 #13(`dev-9053bcd`)2026-08-20 做咗 —— CH-032 + CH-033 上咗 DEV**(七步同 #6–#12 一致 · api `--0000016` / web `--0000012` · infra 配嘅 custom domain / `external` / workload profile 全部完好)。🔴🔴 **本次帶咗一個會直接幫到下手嘅方法轉變:marker 由「有冇」變「幾多次」** —— #12 學到「一個字串要做 marker,先要驗佢喺舊版真係冇」,而今次一驗就發現 **CH-032 三句喺舊版全部存在,兼且係設計使然**(`D2` 就係「逐字抄 dock」)⇒ **「有冇出現」呢個維度結構上冇可能有答案**。改用**次數**:dock 一次 + `/assistant` 一次 ⇒ 舊 ×1 新 ×2,**部署之前先由 live bundle 攞 baseline**,實測 `×1 → ×2` 四個 marker 全中。🔴 **CH-033 一個新字串都冇**(純 class + 版面)⇒ **唯一 bundle 證據喺 CSS**:`.lg\:grid-cols-2` 由 **×0 → ×1**。🟢 **五條證據冇一條靠 revision status**:live asset 名逐字 = image 內部 `docker cp` 抽出嗰個(連 `js length 285165` 都對)· #12 個 bundle **404** · 兩組 marker · `api-json` **90,341 B 同 #12 逐 byte 一致**(正面印證零後端改動)· 順帶 vendor chunk hash 同 #12 一樣 ⇒ 對得返「零新 dep」。🟢 **`-Send` 前個 masking 檢查做深咗一層**:唔止睇有冇 `<len N>`,而係**由 params 逐個讀返真值再問 output 有冇 `Contains` 佢** ⇒ `leaks = 0`;**「睇落 masked」同「真值唔喺入面」係兩件事**。⚠️ **兩樣冇做,要記住**:①**live 行為驗證(睇實物)交返 Chris 人手** —— AI 側刻意唔喺瀏覽器打 break-glass 密碼(H4)⇒ **收咗嘅係「code 上咗機」,唔係「畫面睇落啱」**(證據來源唔同,沿用 CH-015 先例)②**`R35` 最後一條未驗嘅路(api 返唔到嚟)照樣未驗** —— Chris 決定唔做 scale-to-0(要 session + DEV api 停幾分鐘),缺口原樣保留。⬇️ **以下係部署 #13 之前嘅座標** ⬇️ 🟢🟢 **CH-033 request detail 版面 2026-08-20 —— 一日收晒(`G1`–`G8` 八條全 ✅,`status: done`)**。**交付**:ticket reference 三個字級各升一級(`12`/`12.5`/`11.5`,全部喺 `typography.css`)· **Line items / Operational history / AI Assist 三等分並排** · `Request remark` 提出 grid full width · `mayUseAgent` 為假 ⇒ `lg:grid-cols-2`。**零 schema · 零 API · 零新 token · 零 ADR**;web **562 / 50**(+7)。🔴 **四個教訓**:①**「版面唔啱」嘅報告,可能係「有樣嘢你從來冇見過」** —— Chris 話「想三個並排」,而 Line items 同 history **一早已經並排**,佢見唔到 AI Assist 係因為佢喺 history 下面(render 實測 `top: 516`,另一張 `747`)②**兩份註釋互相矛盾咗一段時間而冇嘢會紅** —— `request-detail.tsx` 寫住「AI Assist 係 Coming soon 空 card」,而 `ai-assist-card.tsx:39` 自己寫住 W46 `F8` 早就換走咗;🟢 查咗先講得出本單**唔算推翻 CH-030 `F4`**(`F4` 反對「空 card 霸住頂把 timeline 推落 fold」,三等分後兩個都喺 fold 之上)⇒ **一個決定嘅理由過時,同一個決定被推翻,係兩件事** ③🔴🔴 **一條 assert 排喺另一條後面,可以令佢由「守衛」變成「複述」** —— `G1` 本來一條 test 先 `toEqual` 三個值再 loop 查佢哋喺唔喺 scale,而 `toEqual` 一過就釘死咗 ⇒ **個 loop 冇可能紅**;拆做兩條之後 falsification 得出 `13px is not in typography.css`,**refactor 之前結構上出唔到**(同 W47 `F3-6` 同族,但機制係「前面嗰條已經把答案定死」)④**render probe 要自己判 pass/fail** —— 「三個並排」正正係嗰種兩個啱咗就睇落似成功嘅 claim,加 verdict 之後 falsification 得出 `tops [362,362,**562**]` · `widths [**757**,371,371]`,證到 probe 唔係 tautology。⚠️ **一個樣本機驗唔到**:Chris 睇嗰張 `REQ0044105` 冇 agent run,而本機三張單全部有 ⇒「`No run yet` 佔一整欄」要 DEV 先睇到。⬇️ **以下係 CH-033 之前嘅座標** ⬇️ 🟢🟢 **CH-032 `/assistant` honesty 2026-08-20 —— 批 + 實作 + test + falsification + light/dark render 一日收晒(`G1`–`G7` 七條全 ✅,`status: done`),兼且已經 merge 落 `main`(PR #134)**。🔴 **「已 merge」逐個驗過**:兩個 commit `git merge-base --is-ancestor` 都 `IN`,`origin/main..branch` **未入數 = 0**,`git cherry` 零 `+` 行(§9 先例:PR **#87** 顯示 `MERGED` 實際只入咗頭 2 個);branch **兩邊都刪咗** ⇒ 而家本地同 remote 都**淨返 `main`**,零 open PR。🟢 **順帶驗多一步值得抄**:`git diff <測過嗰個 commit> <merge commit>` **空** ⇒ 我跑 gate 嗰棵樹**就係** `main` 而家棵樹,唔使靠「應該冇變啩」——正正答返 W47 嗰個「一個勾咗嘅 gate 唔等於蓋住咗今日棵樹」。⚠️ **DEV 因此落後 `main` 一個 CH**(DEV 跑緊 `dev-04f3c86` = W49)。**交付**:①「一句話蓋兩件事」拆成兩句 ②補返 dock 早有嘅 disconnected banner + `Reconnect` ③`forbidden` 補 `profiles.error`。**零 schema · 零 migration · 零新 endpoint · 零新 dep · 零新 token · 零新 primitive · 零新 icon · 零 ADR**;api **1491 / 98**(冇掂後端)· web **555 / 49**(**+8**)。🟢🟢 **`RISK R35` 由 🟡 Partial 收成 🟢** —— 三個未完項(DEV 側 · heartbeat coupling · `/assistant`)2026-08-20 同日收齊。🔴 **三個方法論教訓**:①**「逐字抄」揭到 dock 嗰句係兩截而 `/assistant` 只有頭半截** ⇒「邊個可以整返掂」由頭到尾冇講過,而**兩邊都「有文案」所以任何『呢度有冇字』嘅檢查都會話 OK** ⇒ 兩句「差唔多」嘅文案要**逐字擺埋一齊**先睇得出邊句蝕底 ②**falsification 道 2 刻意拆 dock 唔拆 `assistant.tsx`** —— 咁 `/assistant` 行為零改動,剩返嗰條紅只可能嚟自跨檔比對 ⇒ 真證到 tautology 冇發生;**如果四道都拆同一個檔,`G2` 每次都紅,而「佢有冇真係讀第二個檔」由頭到尾冇驗過** ③**一個 probe 可以樣樣做齊但問錯咗問題** —— `banner.closest('.overflow-y-auto')` 返 `true` 睇落即係 `D3` 唔成立,實際上嗰個 scroller 係 `AppShell` main 區而**頁面每個 element 都喺佢入面** ⇒ **結構上冇可能返 false**;揭穿佢嘅係同一份 report 入面 `transcriptTop: 56`(兩張 card 之下嘅面板唔可能由第 56 px 開始)。💡 **順帶一個可複製嘅手法:要 render 一個「只喺失敗時先出」嘅 UI,唔使殺 api** —— `page.route('**/agent/conversations/*/events', r => r.abort())` 幾秒逼爆 `MAX_CONSECUTIVE_FAILURES`,而**其餘每條 query 照常答**,正正就係嗰個狀態。⚠️ **DEV live 唔喺本單 acceptance**(七條 G 冇一條要 DEV),留下次部署;而 banner 喺 DEV **平時唔會出**(#12 實測 3.2 秒自動重連)。⬇️ **以下係 CH-032 之前嘅座標** ⬇️ 🟢🟢 **W49 `agent-dock`(Tier 2 `T2-d`)2026-08-20 —— merge 咗(PR #127,merge commit `04f3c86`)兼且 phase `closed`,G1–G7 全 ✅**。**交付**:`Drawer` primitive(**本系統第二個新 primitive**,H6 STOP → Chris 批,七條約束寫入 `design-system.md §2`)· dock 掛喺 `AppShell` **一次** · **route context passing**(`D-CTX`)· dock 入面 chat。**零 schema · 零 migration · 零新 endpoint · 零 ADR**。🟢🟢 **部署 #12(`dev-04f3c86`)2026-08-20 做咗 ⇒ 最後一條 `F5-4` 收**。🔴🔴 **本次部署帶咗一個會直接害到下手嘅教訓:零 migration 令一個用咗六次嘅判準失效** —— #6–#11 每次都靠「**新表 / 新欄讀得到**」做正面證據,而 W49 `git diff -- prisma/` **完全空** ⇒ 照抄就係**驗咗一樣舊版都成立嘅嘢**。改用兩條唔靠字串嘅:①**live asset 名逐字等於由 image 內部 `docker cp` 抽出嗰個** ②**上一個部署嘅 bundle 404**。🔴 **順帶捉到交接文件推薦嘅 marker 有一個係假** —— `Ask about a licence request` 寫住「W49 新加」,實查 `git grep … b4915e9` **`assistant.tsx` 一早有** ⇒ **一個字串要做 marker,先要驗佢喺舊版真係冇**(同 W49 `progress.md` Day 4「grep 命中 ≠ 嗰件嘢喺度」同族,但機制唔同:嗰次係 substring,今次係「以為新加其實舊有」)。🔴 **W49 最值錢嘅四件事冇一件係 test 揾出嚟,而兩件係 geometry**:①`Drawer` 全高**蓋住自己個 launcher**(開得埋唔得)⇒ `DRAWER_TOP_OFFSET = 56` ②dock 個 link 用 `text-accent` **破咗 DS-3**,而**破佢嗰個就係寫呢條約束嗰個人** ③`F4-3` 斷線偵測**喺真環境 fire 唔到** ④`Accept proposal` 改個名就 survive 兩條 test ⇒ 補 allow-list。🟢🟢 **部署 #12 順手答咗一條之前未知嘅嘢:DEV 嘅 SSE 斷線同本機相反** —— 殺 api revision 實測 DEV(nginx + ACA)**close 個 stream + fire `error` + 3.2 秒自動重連**,而本機(vite proxy)係**零 event · `readyState` 一直 OPEN** ⇒ `F4-3` 決定「兩種都蓋到」係啱嘅唔係過度防禦;`ping` 實測**真係 25 秒**(= `AGENT_SSE_HEARTBEAT_MS` default)⇒ 60s staleness timer 個推導成立。⚠️ **兩樣 carry-over**:`OQ-C` 未答(唔喺 acceptance 入面)· **`/requests/new` 喺 DEV 畀 feature flag redirect** ⇒ 「create form 唔送 context」嗰條 pathname **live 驗唔到**,只有 `route-context.test.ts` 蓋住。⚠️ **DEV 三個 `AgentProfile` 收工全部 `active: false`,而 `GET /agent/profiles` 預設只返 active** ⇒ **打去見到 `[]` 唔代表冇 profile**,要 `?includeInactive=true`;唔開返一個,dock 同 `/assistant` 兩個開始掣**一樣係 disabled 而畫面唔會話你知點解**。⬇️ **以下係 W49 之前嘅座標** ⬇️ 🔵🔵 **W48 `agent-conversation`(Tier 2 `T2-c`)2026-08-19 —— 已經 merge 落 `main`(PR #124,tip `3a9dd66`),`feat/w48-agent-conversation` 兩邊都刪咗。🟢🟢 phase 2026-08-19 亦已經 `closed`**(**部署 #11 `dev-b4915e9`** 收埋最後三條 DEV acceptance ⇒ 九條 G 全 ✅)。🔴 **「已 merge」係逐個驗出嚟嘅**:15 個 commit 全部 `git merge-base --is-ancestor` = `IN`,兼且 `origin/main..branch` **未入數 = 0**(§9 先例:PR **#87** 顯示 `MERGED`,實際只入咗頭 2 個)。🟢 **今次 merge 冇 W47 嗰種風險** —— 開 PR 之前實測 `HEAD..origin/main` = **0**(`main` 零 commit 行前,merge base 就係 tip)⇒ 冇 auto-merge 靜靜出事嘅位。 交付:`AgentConversation` + **`AgentChatTurn`**(⚠️ **唔叫 `AgentTurn`** —— seam 一早有 `export interface AgentTurn`,`ADR-0041 Errata E1`)· `POST/GET /agent/conversations` + `@Sse(:id/events)` · **新 route `/assistant`**(ADMIN + REGIONAL,OPERATIONS section)· **新 `GET /agent/profiles/options`**(ADMIN + **REGIONAL**,三個欄冇 `prompt`)。**`ADR-0041` Accepted**(D1–D9 + Errata E1)。api **1484 / 97 suites** · web **480 / 45**。🟢🟢 **`F0`–`F8` 全收 —— 部署 #11(2026-08-19)三條 DEV acceptance 一次過收晒**:`F2-6` migration(`GET /agent/conversations` **200 `[]`**;🔴 **`200 唔係 500` 先係佐證**,表唔存在 Prisma 掟 `PrismaClientValidationError` ⇒ 500)· `F7-3` 4 turn 真對話 + **SSE 真通** · `F7-4` 全程冇睇 revision status。🔴🔴 **SSE 嗰條刻意直讀 wire 唔用瀏覽器,而個理由可以複製**:DEV 側真正未知數係「捱唔捱得過 ACA ingress + nginx」,而 **buffering 呢種失敗喺瀏覽器睇落同「agent 未答完」一模一樣** ⇒ 連線喺**送 turn 之前**開好,`changed` @ **79 ms** · 第二個 `changed` @ 1.9 s(assistant turn)· `ping` ×3 每 25 秒,**逐個即時到 ⇒ proxy 冇 buffer**。⚠️ 順帶:回應**冇** `x-accel-buffering` header ⇒ 唔 buffer **唔係靠嗰個 header 擋**,係 nginx 配置本身,將來有人改 `nginx.conf.template` 就冇咗呢道保險兼**冇任何 test 會紅**。🔴 **部署順帶揭到兩件唔部署就唔會知嘅事**:①**DEV 零 profile**(連 inactive 都冇)⇒ 而 W47 刻意冇 default ⇒ `/assistant` **一句都問唔到**,要先建一個(profile 係 **DB 資料唔跟部署走**,同 `CH-026 G-7` curate 同族;部署 #10 `G8` 撞過同一件事)⇒ **「差一次操作」本身仲可以再拆** ②**`AgentRun.conversationId` 寫得入 DB 但兩條 read API 都冇暴露佢** —— 🟢 **而唔可以由此推「DB 冇寫」**:`agent-conversation.service.ts:97-99` 靠佢攞值先寫得到 assistant turn,而 turn **真係寫咗** ⇒ 個欄一定有值(**唔使查 DB 就成立嘅證明**);缺嘅係 read model,**形狀同 `CH-031` × `W47` 嗰個 auto-merge 縫隙同族**(兩邊各自完全正確),已登 `BACKLOG` `AGENT-RUN-CONVERSATION-ID`。🔴🔴 **本 phase 最值錢嘅四件事,冇一件係 test 揾出嚟** —— ①`Thinking…` 同「已提出建議」**同時出**(render 揾到:五條 assert 每條問「某樣嘢喺唔喺畫面」,而缺陷係「兩樣嘢一齊喺畫面」,同 CH-030 個 `items-center` 同族)②**兩個 active profile ⇒ 每條新對話第一句都 400 而用戶冇出路**(live 揾到:UI test **mock 咗 mutation**,所以「送咩 body」嗰層根本冇人睇 ⇒ Chris 批 Option A 加 picker)③**SSE 連斷 3 次就永久靜默**(`MAX_CONSECUTIVE_FAILURES = 3`;bound 本身啱,但 thread 活得遠耐過 run ⇒ 一次部署就中,而畫面唔講)④**`businessAlias` 101 個 SKU 全部 `null`** ⇒ agent 收人話 SKU 名 search 唔到,**兼且把「搵唔到」講成「攞唔到」**(用戶會當系統故障)。🟢🟢 **`OQ-D` 做成對照實驗唔係單邊觀察**:同一句、同一 profile,**唯一變數係 `requestId` 在唔在** ⇒ 冇 context 嗰條答「with the available tools」做唔到兼且**零 tool call**,有 context 嗰條真叫 `list_pending_requests` ——單睇前者,「filter 生效」同「model 唔想叫」睇落一模一樣。🟢 **`R26` 喺新路上重現**:揀 `power-bi-only` 開對話,agent 自己答「I can only suggest Power BI licences」⇒ **揀 profile 揀嘅係行為唔係一個 id**。⚠️ **本機 DB 已經 apply 咗 W48 migration**(兩個 worktree 共用一個 DB ⇒ 「我呢邊未做」推論唔到「DB 未做」)。⚠️ **5433 而家喺 `ai-doc-extraction-db` 手上**(借咗兩次,兩次都還原兼真 TCP 驗過)。**W48 六條 risk 入咗 `RISK_REGISTER.md` `R32`–`R37`**。⬇️ **以下係 W48 之前嘅座標** ⬇️ 🟢🟢 **W47 `agent-registry`(Tier 2 `T2-a`)2026-08-17 —— 已經 merge 落 `main`(PR #119),`feat/w47-agent-registry` 兩邊都刪咗**。🔴 **「已 merge」係逐個驗出嚟嘅,唔係睇 PR state**:17 個 commit 全部 `git merge-base --is-ancestor` = `IN`,兼且 `origin/main..branch` **未入數 = 0**(§9 先例:PR **#87** 顯示 `MERGED`,實際只入咗頭 2 個)。⚠️ **W47 branch 喺 merge 之前已經把 `main` merge 咗落嚟**,所以佢**包含 CH-031**。**交付**:`AgentProfile` registry(CRUD · **冇 DELETE**,只 `active=false`)· 揀 profile 開 run · **全域 run 列表**(cursor 分頁,補返 W46 一個結構性缺口)· `/agent` 管理頁 · **新 primitive `Textarea`**(H6 STOP → Chris 批;**本系統第一個唔由 handoff spec 重建嘅 primitive**,約束寫喺 `design-system.md §2`)。api **1430 / 94 suites** · web **464 / 44**(**merge 咗 `main` 之後**,即已含 CH-031;對數 = W47 1410 + CH-031 19 + merge 新加 1),lint + build exit 0,**零新 runtime dep · 零 ADR**。🔴 **acceptance 8 條 = 6 全收 · 2 半收**(`G1` migration @ DEV · `G8` live @ DEV),而兩條 2026-08-17 **全部收咗** ⇒ **W47 acceptance 8/8,phase `status: closed`**(merge PR #119 → 部署 #10 `dev-df03563` → 驗,三步同日做完)。🔴 **但呢度有個判斷錯咗要記低**:當時把 `G1` 同 `G8` **當成同一個阻塞**,而佢哋唔係 —— `G1` 部署完自動就收,`G8` 要**人再做一次對照實驗**(部署唔會幫你開 profile)。⇒ **寫「DEV ❌」嗰陣要順手寫低差嘅係咩**(一次部署 / 一次操作 / 一個未答嘅問題),否則收尾嗰刻分唔出邊條撳個掣就得。🔴🔴 **一句唔講就會令你用錯前提:Redis 唔再係阻塞** —— 下面 W46 段落仲寫住「部署 DEV 之前 Redis 要喺度,否則 `POST /agent/runs` 直接 503」,而 W46 `B6` 喺 DEV **實測過嗰個 POST 返 201** ⇒ Redis 一早通咗;嗰句**對 W46 嗰刻啱,對今日唔再係未解決事項**。🔴 **三個唔查就唔會知嘅設計決定**:①**冇「default profile」呢個概念** —— 一個 active 就用佢,多過一個而冇指名就 **400 兼講明有幾多個**(一個睇唔到嘅 default,就係將來用錯 model 都冇人發現嗰個位)②`AgentRun.profileId` 用 **`onDelete: Restrict`** 唔用 Prisma optional relation 預設嗰個 `SET NULL`(後者會令一個直接落 DB 嘅 delete 把「呢個 run 用邊個 profile 跑」**一次過**變 unknown,冇任何錯誤)③改 `prompt` 入 audit **`before`/`after`**,而 **no-op PATCH 唔寫 row**。🟢🟢 **`R26`(prompt 落 DB = 一個真嘅 runtime 行為面)由推論變實證**:同一段 request text · 同一個 model,**唯一變數係 prompt** ⇒ 內建 prompt 提 **2 個 SKU**、custom 提 **1 個**,而 agent 自己個 reasoning 寫住「**I ignored the Microsoft 365 E5 request … as instructed**」。🔴 **`R28` 一半未答(H1,未開單)**:`Restrict` 擋到**刪**擋唔到**改**,而 profile 係 mutable ⇒ 今日答到「用邊個 profile」,答唔到「**嗰一刻佢係咩 model**」;要真答就要 `AgentRun` 存 model snapshot。🔴 **四個方法論教訓**:①**一條 assert 可以連「有嘢畀佢捉」呢個前提都冇** —— 我寫咗兩條 assert 對住一個 adapter **已經唔再收**嘅 collaborator,結構上冇可能紅;同 §9 嗰三個「assert 太弱」**唔同族**,今次係**瞄準嗰件嘢唔存在** ⇒ 拆走實作嗰個方法要**對已經綠嘅 test 都做一次**,唔止對啱啱寫嘅新閘 ②**截圖自己講大話** —— dialog 截圖顯示面板半透明 + 45% scrim 完全唔見,`fullPage` 同 viewport **兩種模式一致**,而 probe live DOM 係 `opacity: 1` + 實色 `rgb(255,255,255)` ⇒ **capture artifact;一致唔等於真**(警告已寫落 `render-check.mjs`,唔使再畀一次成本)③**一個勾咗嘅 gate 唔等於嗰個 gate 蓋住咗今日棵樹** —— `F6` 跑完之後仲入咗一個 code commit,收尾重跑先知 web 由 449 變 **453**(同「PR `MERGED` ≠ commit 入齊」同族) ④🔴🔴 **merge conflict 唔係最危險嗰半,auto-merge 先係** —— W47 merge `main`(= CH-031 / ADR-0040 agent run soft-hide)嗰陣,**5 個 text conflict 全部一眼睇得出點解**;而真正嘅缺陷喺一個 **auto-merge 得完全乾淨** 嘅位:CH-031 把 `hiddenAt: null` 放咗喺 `findLatestForRequest`(嗰陣**得嗰一條 list-shaped read**),而 W47 加咗**全域 run 列表**(嗰條 branch 上面 `hiddenAt` **唔存在**)⇒ merge 之後 admin hide 咗嘅 run **照樣出現喺 `/agent` 全域列表**,兼且**兩邊 suite 全綠**。📌 **兩條 branch 各自都完全正確,因為每條都只知自己嗰半** —— 同 W46 `B3` 嗰個「兩個 provider spec 各自正確,而『兩個實作一致』結構上冇一個單一 spec 講得到」**係同一件事**。🟢 **而今次唔使自己判斷點做**:`ADR-0040` 自己寫低咗答案(Consequences 逐字「`T2-a` 個 run list 直接 `hiddenAt: null`」)⇒ **一份寫得夠遠嘅 ADR,可以幫你 resolve 一個佢寫嗰陣未存在嘅 merge**。⚠️ 順帶:merge 之後 **`prisma generate` 唔跑就 7 個 suite 開唔到身**(`hiddenAt` 唔喺 generated type)—— `restart-stack` skill 早就記低咗呢個 code drift。⬇️ **以下係 W47 之前嘅座標** ⬇️ 🟢🟢 **W46 `agent-runtime` 2026-08-17 —— 已經 merge 落 `main`(PR #114,tip `45ad525`)**。⚠️ 呢格之前寫住「下一步係 merge 返落 `main`」加「merge 返之前 `main` 仍然冇 agent」,**兩句而家都唔啱** —— `main` 就係有 agent 嗰個(`src/agent` + `src/agent-approval`,api **1381 / 92 suites** · web **450 / 43 零紅**(CH-031 之後),ADR 到 **0040**)。🔴 **「已 merge」唔係睇 PR state 得出嘅** —— 十個 commit 逐個 `git merge-base --is-ancestor <sha> origin/main` 驗過(§9 先例:PR **#87** 顯示 `MERGED`,實際只入咗 6 個入面頭 2 個)。🟢🟢 **部署 #9(`dev-45ad525`)2026-08-17 同日做咗 ⇒ `A1` DEV 半邊同 `B6` 兩條都收咗,W46 21/21**。🟢🟢 **同日再做 #9b(同一個 image,淨係加 env)⇒ 配咗 `AZURE_OPENAI_*` + `AGENT_MODEL`,agent 喺 DEV 第一次真行到底**(`POST /agent/runs` → 201 → **`awaiting_approval`** · `steps: 4` · **`proposals: 1`**,而 #9 嗰次係 `failed`)。⚠️ **`AGENT_RUNTIME` 刻意冇配** —— 佢行 `ConnectorConfigService` **DB-first**,擺 env fallback 會同 Integrations panel 揀嘅嘢靜靜競爭。🔴 **兩個 worktree 嘅 `apps/api/.env` 內容唔同** —— Azure OpenAI 座標**只喺 W46 worktree 嗰份**,主 worktree 嗰份 28 個 key 一個都冇;而 `rcitest` sub 亦**冇任何 Azure OpenAI resource**(部署 SP 睇唔到 Chris 開嗰個)⇒ **凡講「`.env` 有 X」都要講明邊一份**。🔴 **`R21` 一度真發生**:W46 worktree 嗰份 `.env` 有個 108 字元 `ANTHROPIC_API_KEY`(即「未配就 503」嗰道閘當時唔會擋),2026-08-17 Chris 批准清走已清;⚠️ 但「填咗」≠「真打過」,而我哋**冇 log 證得到**,只可以講「冇證據真打過」。🟢🟢 **CH-031 2026-08-17 merged(PR #117,四個 commit 逐個 `--is-ancestor` 驗過)—— 上面嗰句「平台冇任何路徑移除一個 agent run」而家唔啱**。⚠️ 但**唔係加咗 `DELETE`** —— 加嘅係 **`POST /agent/runs/:id/hide` + `:id/unhide`**(ADMIN-only · terminal-only),`AgentRun.hiddenAt` soft-hide,**`ADR-0040` Accepted**。🔴 **點解唔係 `DELETE`(呢個先係要記住嗰半)**:三張子表喺 **migration SQL 層面**全部 `ON DELETE CASCADE`,而佢哋就係 audit 真相(`schema.prisma:646`)⇒ hard delete 會帶走 `AgentMessage`(**推翻 `ADR-0036 D6` 永久保留**)同 `approvedById`(邊個批准過)。**`ADR-0022 D1` 喺 `OpcoSkuLedger` 撞過結構上一模一樣嘅形狀**,原文「同樣效果,單邊代價 ⇒ 唔取」⇒ row 保留 + 讀層隱藏。🟢🟢 **最重要係 `D4`**:`review-stats` / `kill-switch` 聚合 `decidedAt` / `status`,同 `hiddenAt` **正交** ⇒ **R13 rubber-stamp 監測結構上郁唔到**(唔係「小心咗」,係冇路徑)—— R13 係**比率**,hard delete 會令佢兩個方向都靜靜移動兼冇 tombstone。⚠️ **老實記低一個負面結果**:全 repo **冇任何 ADR/spec/test 明文寫過「agent run 唔准刪」**,H1 觸發嚟自「推翻 D6 + 郁 R13 + 違慣例」三層推論。🔴 **順帶揾到守衛缺席兼補咗**:`agent.boundary.spec.ts` 有「一張表一個 writer」約束但**冇 `writersOf('agentRun')`** ⇒ 當時加一句 `prisma.agentRun.delete(...)` **冇任何 test 會紅**;已補(falsification 驗過真紅),但 verb list **仍然冇 `deleteMany`** ⇒ 登咗 BACKLOG `agent-boundary-gaps`。🟢🟢 **部署 #10(`dev-df03563`)2026-08-17 做咗 ⇒ `G1`/`G2` 收咗** —— DEV 嗰兩個測試 run hide 走,**兩半都驗**:`GET /agent/runs/latest` 空 · `/agent/runs` 0 items,而 `GET /agent/runs/:id` **仍然 200 兼且 `steps=5`/`proposals=1`、`steps=2`/`proposals=0` 全部仲喺度** —— 做咗 `DELETE` 嘅話呢啲會經 cascade 一齊消失,呢個就係 ADR-0040 喺真環境嘅兌現。🔴 **但 `D4` 喺 DEV 仍然未驗證,唔可以當收** —— `review-stats` 返 `decided: 0`,而佢係 0 **唔係因為 hide**:DEV 由頭到尾冇人真決定過任何 proposal ⇒ hide 唔 hide 都係 0。**D4 目前只有 unit test + falsification 撐住。**🔴 **順帶推翻咗一個 handoff 前提:「Redis 要等 infra 開」唔成立** —— `redis-rapo-uop-dev` 資源、`pe-redis-…` private endpoint(**同 PG 個 PE 同一個 subnet,而 PG 跑過 19 個 migration**)、access key **三樣一早喺手上**,缺嘅只係「connection string 冇配落 container app」,而嗰個係改 params + 部署腳本兩行嘅事。**同 W44 `B2` 同族**(當時以為「連唔到 PG data-plane ⇒ 建唔到 database」,實際係 management plane 操作)。⚠️ **配 Redis 有兩個會靜靜失敗嘅位**:①scheme **必須 `rediss://`**(兩個 s)—— `agentRedisConnection()` 完全冇 TLS option,TLS 純靠 scheme 決定,而 DEV Redis 係 6380 `enableNonSsl=false`,**而 `.env.example` 個 default 正正係 `redis://`,照抄即中** ②key **必須 percent-encode**(Azure Redis key 係 base64,含 `+` `/` `=`;實測今次個 key 44 → 46 字元)—— 同 W44 `F3-2` PG 密碼個 `$`/`?` 同族。21 條 acceptance **19 條 ✅**,淨低兩條(`A1` DEV 半邊 · `B6`)—— **兩條都係卡 Redis,唔再卡 Azure OpenAI**。🟢🟢 **`A14` 2026-08-17 全收:agent 第一次真跑**(Chris 開咗 Azure OpenAI resource),`awaiting_approval` → **approve → run `completed`**,而收貨標準係**落 DB 對數**唔係睇 HTTP(proposal `executed` + `approvedById` 有值 + 2 條 line item **逐字對返** proposal 兩個 GUID)。🔴 **批准嗰半第一次係「失敗」收場,而嗰次先最有價值** —— 撞 **409 `This request is complete…`** ⇒ **`F8-3` 卡上嗰句「Approving runs the platform's normal checks — they can still refuse」第一次真驗證**(閘喺 `RequestService.addLineItem` 本身,唔喺 agent 側);換一張 `OPEN` request 就過。🔴 **順帶揾到一個真缺陷兼修咗**(`515836d`):`agent-approval.service.ts` 四個「決定」writer,**得 `createLineItems` 個 catch 冇寫 `approvedById`** —— 而佢**唔係漏咗一行,係兩邊都唔企**:平台自己執手尾嗰兩條路(`abortRun` / run expiry)`decidedAt` 同 `approvedById` **兩個都唔寫**,`approveAssign` 被閘拒嗰條**兩個都寫**;寫一個唔寫另一個係一個冇人定義過嘅第三種狀態 ⇒ G7 人口 = `decidedAt != null` 而 `isApproval` 把 `failed` **當批准** ⇒ 條 row **入到 aggregate 但歸入 `approverId: null`**,即**撳咗 approve 嗰個人少咗一次批准**,正正係 `R13` 講嘅「令人安心方向」。**分界線係「有冇人撳過 approve」,唔係「HTTP 成唔成功」。**🟡 **infra 信寫好晒但未發**(`docs/13-deployment/11-azure-openai-infra-request.md`)—— 佢**而家淨係為 Redis 而存在**(Azure OpenAI 嗰半 Chris 已經自己開咗)。🔴 **部署前一定要知**:`main` 一 merge 咗 W46,**部署 DEV 之前 Redis 要喺度**,否則 `POST /agent/runs` 直接 503(ADR-0039 F1 令個 POST 只 enqueue)—— 呢個同 Azure OpenAI **唔同級別**(冇 Azure OpenAI 只係少一條 live 驗,冇 Redis 係 agent 整個停)。🔴 **收尾掃出兩件值得記嘅事**:①**`plan.md` 個 acceptance 表由頭到尾冇更新過**(21 條全部 `[ ]` 而 18 條老早做完,勾咗喺 `checklist.md` —— 兩份文件各講各)⇒ **plan 個 acceptance 就係「呢個 phase 算唔算完」嘅定義,佢全部空白即係冇人講得出仲差幾多**;⚠️ **同一個形狀 2026-08-17 再犯一次**(`F11-2`/`G4-pre-2` 做咗冇勾),而**今次係用戶問「仲欠咩」先掃出嚟** ②掃出 **`B3` 只做咗一半**,而缺嗰半正正係佢個重點 —— schema identity 證嘅係「兩個 adapter **收**同一份嘢」,唔係「兩個 adapter **做**同一件事」⇒ 補咗 `agent-runtime.contract.spec.ts`,而佢**第一次跑就揾到一個真 divergence**(`@openai/agents` 個 `tool()` 自己 catch tool error 返字串,`betaTool` 掟返出嚟)。📌 **形狀**:兩個 provider spec **各自都完全正確,因為每個都只講自己** ⇒ **「兩個實作一致」呢個 claim,結構上冇一個單一實作嘅 spec 講得到**。✅ **`R11`–`R25` 十五條 2026-08-17 入咗 `RISK_REGISTER.md`**。🆕 **AI agent Tier 2 scope report 2026-08-17 寫咗兼 scope approved** → `docs/02-architecture/agent-tier2-scope.md`(Chris 提出:獨立管理頁面 · 多 agent · per-agent 範圍 · security 管理 · **全站可收起嘅互動 dock**)。🟢🟢 **三條 OQ 答完之後,原本最重嗰個 phase 整個消失**:`OQ-1` = 同一套能力唔同 model/prompt ⇒ `ADR-0036 D1` 唔使郁;`OQ-2` = **agent scope 唔可以大過啟動者** ⇒ 安全模型唔使改 ⇒ **兩份新 ADR 變零份**;`OQ-3` = dock 要睇到當前頁面 ⇒ 新硬約束 **`D-CTX`**(前端送嘅 context 當**提示**唔當**授權**)。⚠️ **Tier 2 等 W46 落地先開**,而 **`B6` 唔止係 W46 手尾 —— 佢係 dock 個 chat 嘅前置**。⬇️ **以下係 W46 之前嘅座標** ⬇️ 🟢🟢 **CH-030(request detail 四項修正)2026-08-14 —— 開單 + approve + 實作 + test + migration + H6 light/dark render 一日收晒**(**ADR-0035 Accepted**)。🔴 **最值得記住嗰件唔係四個修正,係 F1 個診斷**:Chris 問「點解 licence request 顯示 RITM 唔係 REQ?」—— **唔係顯示 bug,個 REQ 由頭到尾冇存過落 DB**。平台**攞得到**佢(`order_now` 就係返 REQ number)但 `intake-adapter` 只寫 RITM 落 line item,REQ 跌咗落地;唯一倖存地係 CH-024 C 加嘅一條 timeline NOTE。**ADR-0035 論據**:`schema.prisma` 反對嘅係「第二個 **candidate idempotency key**」唔係「第二個 SN number」⇒ 一個非 `@unique`、唔出現喺任何 `where` 嘅欄**結構上唔可能變成 key**,所以係**收窄原決定範圍唔係推翻**(migration SQL 實讀:一行 `ADD COLUMN … TEXT`,冇 UNIQUE 冇 index)。🔴 **F3 順帶揭到 `accountCreatedAt` 多數係假嘅** —— n8n 兩條 intake 路**明文唔送**佢,`open-sync-gate.ts` 開 gate 嗰陣 `?? now` 補 ⇒ 佢同 `azureSyncedAt` 幾乎必然同一秒,照印就係畫面自己講「開帳戶同 sync 同一秒完成」⇒ **Chris 決定 AD 嗰步唔顯示時間**。🔴 **H6 render 揭到一個四層 test 全綠都捉唔到嘅缺陷**:AD 步冇時間 ⇒ 矮一行,而 row 一直 `items-center` ⇒ 三個 title 唔同水平 —— **test 問「字喺唔喺度」,呢個缺陷係「佢喺邊」**。api **1044/74** · web **377** · falsification ×3 真紅零誤傷。🚧 `OD-1` backfill 未決(建議唔做)。⚠️ **收工發現:跑 full web suite 前應停 dev server** —— stack 跑緊會令一條 test 撞爆 5s timeout,單獨跑綠 1089ms。🟢 **CH-028(`ASSETS-IN-M365`)2026-08-12 closed 兼 merged(PR #90)** —— Platform view 加一欄 **`In M365`**(`tenantConsumed`)⇒ **平台自己嘅帳(`Assigned` = Σ ledger)同 M365 真實用量第一次並排**。🔴 **刻意唔喺呢一版計個差**(Chris 拍板):`In M365 − Assigned` 就係 `DriftAlert.delta` 嘅定義,但**兩邊個 `tenantConsumed` 唔同源** —— Drift 頁行 **live Graph**、Platform view 行 **stored snapshot** ⇒ 喺呢度計就係養一個同 Drift 對唔上嘅第二真相。**Drift 頁維持唯一 delta 真相。** ⚠️ 順帶揭到一個 ledger leftover(`POWERAUTOMATE_ATTENDED_RPA` `alloc=0`/`assigned=1`/`In M365=90`,W45 `F4-4` 真派嗰次留低)—— Chris 決定**暫時唔動**。🟢 **CH-022(`INTAKE-REQUESTER`)2026-08-12 `A7` live 收 ⇒ closed** —— 端到端第 2 步(UOP 收到 n8n intake 之後喺 SN 開 O365 單)**由 W43 交付以嚟第一次真流量行得通**:SN 真出 `RITM0047389`,`REQ0044083` 個 `requested_for` **逐字等於源 REQ 個 `opened_by`**(= ADR-0030 修法生效)。⚠️ **留低咗一張真單 `REQ0044083`/`RITM0047389` 未收**。**CH-024 / 025 / 026 / 027 四單 2026-08-12 一日內全部 closed 兼 merged**(PR #84 / #85 / #87 / **#88**)。**CH-027 = ADR-0033 落地** —— `owned` 由 `prepaidUnits.enabled` 改成 `enabled + warning`,assign gate 由拒絕 32/101 個 SKU 收窄到 11 個。🟢 **CH-026 + CH-027 五項真環境驗證 2026-08-12 全部收咗**(migration 對真 DB `21/21` · light+dark render · **真 sync 驗到 `SPE_E3` `owned` 21 → 4498**、gate 拒絕 `32 → 11`)⇒ **兩單都 closed**。🟢🟢 **CH-026 `G-7` 2026-08-13 做咗 ⇒ CH-026 全收**(Chris 批准由 AI 經 API 做,唔使落 UI):22 × `PATCH /license/catalog/:id` 全部 **200** ⇒ **`Available seats` KPI `4,270,779` → `50,779`**、`unlimitedSkus` `0` → **22**,light + dark 真 render 過。**三條獨立路徑對數**(endpoint `totalOwned` = 自己由 79 個 prepaid row 加返嘅總和 = 算術 `4,270,779 − 4,220,000`)。🟢 **部署 #6(`dev-53965f3`)同日做咗 ⇒ DEV 追返齊五個 CH**(024/025/026/027/028)。之前 DEV 跑緊 `dev-86ed450`(08-10)**冇 CH-026 code**(row 冇 `seatModel`、stats 冇 `unlimitedSkus`)—— 所以 `G-7` 先要改喺本機做。**驗證刻意唔睇 revision status**(entrypoint 令 migrate/seed 失敗 NON-FATAL),改睇只有新 code 先出到嘅嘢:row 有 **`seatModel`**(順帶證明 **migration 真跑咗**)· stats 有 **`totalConsumed`** · web bundle 有 `In M365`,而 **ADR-0033 移走咗嘅 `No seats enabled` 唔喺度**(負面命中先係最強證據)。🟢 **DEV 側 `G-7` 同日亦做咗**(Chris 批;部署 #6 之後先做得到)—— `totalOwned` **4,240,459 → 20,459**、`unlimitedSkus` **22**,三路對數。⚠️ **curate 係 DB 資料唔係 code,唔會跟住部署過去**,所以兩個環境要各做一次。🔴 **DEV 揭到一個本機睇唔到嘅後果:`totalUnallocated` 變負數(`−25,151`)** —— 條數係**啱**嘅(`totalAllocated` 包含 unlimited row 嘅 allocation,而 `totalUnallocated` 只計 prepaid),即 CH-026 決定 #4 個「兩個 KPI 範圍唔同」代價喺真 allocation 數據下第一次浮面(本機 `totalAllocated = 0` 睇唔到)。🟢 **2026-08-15 更正:呢句已經 stale —— 佢由 CH-029 `D-B`「負數呈現(零計算改動)」處理咗,而嗰單 2026-08-14 closed。** Chris 對呢條嘅答案係 **「負數係誠實,唔改計算」**(§9 CH-029 段落嗰個 **B**),所以做嘅係呈現唔係修數 —— 即係話「未處理」同「未開單」兩半都唔啱。⚠️ **但同批嗰句「unlimited SKU drift 點計」唔可以一齊當收** —— CH-029 `D-C` 收嘅係「**drift 跳過 unlimited**」(實測 72 個 OPEN alert 有 16 個屬 unlimited),而「unlimited SKU 自己應該點對帳」**仍然冇答案**,只係唔再嘈。📌 KPI 實際叫 **`Available seats`** 唔係 CH-026 doc 寫嗰個 `Prepaid seats`(CH-027 改咗名)。🟢 **W44(Azure DEV)2026-08-13 closed** —— 收尾一日收咗四條一直卡住嘅 live 驗:**`F6-6` break-glass 真登入 DEV**(login 200 + `Set-Cookie: uop_access, uop_refresh` + `/api/me` 200 role `ADMIN` ⇒ **本 phase 第一次真人登入**)· **`F6-14` 400 body 完整捱過 ACA ingress + nginx**(290 B,`outcome`/`failedAt`/`steps[]`/`whoFixes` 齊,舊 shape `message` 同時在 ⇒ **ADR-0029 dialog 喺 DEV 一定開得到**)· **`F2-13`** `runningStatus` 由「七日後仲行緊」行為收 · **`F9-9`** 原來一早做咗(`RISK R8` 早就存在,**只係冇勾**,而個 `[ ]` 令 §0/§9 一路寫住「仍未入 RISK_REGISTER」carry 咗幾個 session)。🟢🟢 **`F9-8` 2026-08-13 全收 ⇒ `AUTH-2b`(掛咗一個月)同時 closed** —— **SSO 嗰半 Chris 本人測試確認可以**,break-glass 嗰半 AI tool 驗(`F6-6`)。🔴 **兩半證據來源唔同要標明**(SSO = 人手,Entra 互動要真人 + MFA,AI 結構上做唔到;沿用 CH-015 先例)。🚧 **淨低一注**:**F7 五條 n8n 接線**(卡 n8n 側配置,target = ADR-0017 三接縫 phase)。🔴 **新 RISK `R10` —— 叫做「DEV」嘅環境對真 production M365 tenant 有寫權**:實測 DEV 得 9 條 line item **全部真嘢**,其中 **3 條 `READY` 而兩個 sync gate 都已開** ⇒ 撳落去**直達 Graph,只剩 budget 一道閘**,而 budget 係業務規則唔係安全邊界(`budgetOverrideReason` 一送就過)⇒ **喺 DEV 撳 assign 之前一律先唯讀探測,揀兩個 gate 都 null 嗰條**;pending 真相 SSOT = `BACKLOG.md`,呢格只寫最近一個座標。🟢🟢 **2026-08-15:root gate 終於蓋住 web —— 呢個改變咗「跑咗 test 即係驗過乜」** —— root `npm test` / `npm run build` 一直**只 `-w @uop/api`**,而 CI(`.github/workflows/ci.yml` 個 `validate` job)直接跑 root 呢幾個 script ⇒ **web suite 由頭到尾冇入過任何 gate**。而家三個 script 都 `-w @uop/api -w @uop/web`,**CI 亦第一次真跑 web**(實測 job log:web `383 passed / 38 files`)。**呢個先係 `WEB-TEST-JSDOM` 嗰 6 條可以紅足幾個星期冇人知嘅機制 —— 唔係冇人記得跑,係 gate 結構上見唔到佢。** 🟢 同日 6 條紅亦收咗(根因 = **Node 25 預設開 Web Storage,把 `globalThis.localStorage` 裝成空 `{}`**,同 jsdom 無關)⇒ **以後唔使再喺每份 closeout 數「嗰 6 條係舊嘅」**。🔴 **但唔可以由「CI 綠」推論嗰個修法啱**:CI 跑 **Node 20**(實測 `v20.20.2`),而根因係 Node 25 專屬 ⇒ 個 setup guard 喺 CI 係 no-op,嗰半嘅證據只有本機。⚠️ 本機 `package.json` `engines.node >= 20` 而呢台機跑緊 **25**。🟢 **stale branch 2026-08-12 清晒** —— 本地 8 條(`git branch -d`)+ **remote 18 條**(`git push origin --delete`),⇒ 而家**本地剩 `main`、remote 剩 `origin/main`**(加當時進行中嗰條)。🔴 **判準 2026-08-15 更正:用 `git cherry origin/main <branch>`(`-` 前綴 = 內容已入 upstream,全部 `-` 先刪),唔好用 `git diff --stat`(佢**對稱**,行數大細同「有冇未 merge 內容」冇必然關係),亦唔可以**只**信 `--merged`(靠 commit 可達性 ⇒ 對 cherry-pick / rebase 過嘅 branch 會漏報)。**開工由 `main` 開新條。💡 **PR merge 之後順手刪返兩邊** —— 呢次係累積到 18 條先一次過清,而 remote 側**多過**本地側(本地嗰啲刪過,remote 冇跟)。⚠️ **呢格刻意唔寫 `main` 嘅 commit hash** —— 寫 hash 嗰個 commit 本身就會令佢過時,而「有冇 feature branch」先係真正影響下手點開工嗰半 |
| Strict Mode | **ON** — see §5 Hard Constraints |
| Behavioral Baseline | **§1** — universal coding mindset,適用於所有 code change |
| Decision Owner(architecture) | **Chris Lai** |
| Decision Owner(scope / business) | **Chris Lai** |

---

## 1. Behavioral Baseline(Karpathy Guidelines - universal coding mindset)

> 適用於**所有** code change / review / refactor,與 §2 以下 project rule 並行,優先級僅次於 §5 Hard Constraints。
> Trivial task 可用 judgment,non-trivial task 必須跟。

### 1.1 Think Before Coding — 想清先寫
- 把 assumption 明確講出嚟;唔肯定就問,唔好估。
- 有多種詮釋 → 全部 present,唔好默默揀一個。
- 有更簡單做法 → 講出嚟,有需要 push back。
- 唔清楚就 STOP,講明邊度唔清楚,然後問。

### 1.2 Simplicity First — 最少 code 解決問題
- 唔加未要求嘅 feature / abstraction / 「flexibility」。
- 唔處理冇可能發生嘅 error scenario。
- 自我檢查:「senior engineer 會唔會話呢段 over-engineered?」答 yes 就簡化。

### 1.3 Surgical Changes — 精準改動,只清自己嘅 mess
- 唔「順手」改 adjacent code / comment / formatting。
- 唔 refactor 冇 break 嘅嘢;match existing style。
- 見到無關 dead code → mention,但唔好刪。
- 你嘅改動製造嘅 orphan(unused import / var)→ 要刪。
- 驗證標準:**每一行改動都 trace 得返用戶嘅 request**。

### 1.4 Goal-Driven Execution — 定義成功標準,loop 到 verify 為止
- 把 task 轉做 verifiable goal(「加 validation」→「寫 test for invalid input,make them pass」)。
- Multi-step task 先講 plan:`1. [step] → verify: [check]`。
- Strong success criteria 等你可以獨立 loop,唔使用戶不斷 clarify。

### 1.5 Subagent delegation policy

> **2026-08-16 Chris Lai 加入。** 呢節係**常設授權**,作用係覆蓋「除非用戶逐次要求,否則唔好用 Agent / workflow」嗰條預設。**條文逐字保留英文原文,唔要改寫** —— 佢本身就係被測試緊嘅嘢。
>
> ⚠️ **`.claude/agents/` 今日唔存在**(2026-08-16 實測:`.claude/` 只有 `commands` / `settings*.json` / `skills`)⇒ 下面第四條 delegate 條件**今日係空嘅**。但唔等於冇 agent 用得 —— built-in / plugin 側有 `Explore` · `Plan` · `general-purpose` · `feature-dev:*` · `code-review` 等,實際清單以 session 開頭注入嗰份為準。**要令第四條有內容,就要真係開 `.claude/agents/`。**

Standing authorization from the user: you may call the Agent tool on your own
judgement. Treat this section as the user having requested delegation — do not
wait for a per-task request. The same authorization applies to workflows.

Delegate when:
- Work spans several files or modules that are genuinely independent
- Broad search or exploration whose intermediate results should stay out of
  the main context
- Multiple independent review or verification angles can run in parallel
- The task matches the description of an agent in .claude/agents/

Do not delegate when:
- The work finishes in a handful of tool calls
- You would be spawning a subagent to verify your own just-completed work
- One subagent would do — do not fan out wider than the task needs

**同 §5 嘅關係(唔改任何嘢,只講清楚)**:授權嘅係「**幾時可以自己開 subagent**」,唔係「subagent 做嘢可以鬆啲」。H1–H8 對 subagent 一視同仁 —— 尤其 **H7**(subagent 返嘅嘢係 tool result,唔可以當成已驗證嘅結論照抄;要 trace 得返真 output)同 **H8**(唔可以借 subagent 繞過讀檔紀律)。撞到 hard constraint 一樣係**主 agent 停手問**,唔可以派落去。

---

## 2. Document Routing(when to read what)

> **呢份 CLAUDE.md 唔重複任何 spec 內容。** 要做嘢就跟以下 routing 去搵 source of truth。

| 情況 | 必讀文件 |
|---|---|
| 想知有咩 pending / 揀下一個 task | `docs/01-planning/BACKLOG.md` |
| 平台級架構 / 定位 / 四層地基 / locked stack | `docs/architecture.md` |
| LicenseOps 業務決策(定位 / scope / 對帳 / domain model / request 生命週期) | `docs/02-architecture/licenseops/DESIGN.md`(**決策 SSOT**) |
| Domain model 真相(Prisma schema) | `prisma/schema.prisma` |
| Multi-day phase / sprint work | `docs/01-planning/PROCESS.md §2` + active phase folder |
| Change to existing feature(<3 日) | `docs/01-planning/PROCESS.md §3` + new `docs/03-implementation/changes/CH-{NNN}-{kebab}/` |
| Bug-fix | `docs/01-planning/PROCESS.md §4` + new `docs/03-implementation/bugs/BUG-{NNN}-{kebab}/` |
| 改架構 / 違反 §5 設計 | **STOP** — 先確認(H1)+ 寫 ADR `docs/adr/` |
| 加 vendor / dependency / 換 component | **STOP** — 先確認(H2)+ 寫 ADR |
| 寫 / 改 backend feature(Graph / ServiceNow 整合) | `docs/05-usage/INTEGRATION_SETUP.md` + `src/integration/` |
| 寫 / 改 frontend / UI(LicenseOps) | `docs/02-architecture/design-system.md`(**設計系統 SSOT** + anti-drift)→ 視覺真相 `design_handoff_licenseops/` → commit 前跑 `ui-design` skill(見 §5 H6、§7) |
| 寫 / 改 API endpoint | OpenAPI(`apps/api` 的 `main.ts` DocumentBuilder;runtime UI `/docs/api`) |
| 寫 eval / test | `docs/01-planning/PROCESS.md` + §3.4(H5 覆蓋規則) |
| Risk-related decision | `docs/01-planning/RISK_REGISTER.md` |
| 反覆「暫時唔做」嘅決定 | `docs/01-planning/DEFERRED_REGISTER.md` |

**Default**:唔確定 task 屬邊個 doc 範圍 → **ask before guessing**。

---

## 3. Coding Conventions

### 3.1 Backend(NestJS / TypeScript)
- **Runtime**:Node 20+(ServiceNow client 用 global `fetch`)。TypeScript strict。
- **結構**:modular monolith;每個 feature = 一個 Nest module(`*.module.ts` / `*.service.ts` / `*.controller.ts` / `dto/`)。Module 邊界對齊四層地基(見 `docs/architecture.md`)。
- **DI**:constructor injection;唔用 service locator。Config 一律經 `ConfigService.getOrThrow(...)`,唔直接讀 `process.env`。
- **Data layer**:Prisma;`prisma/schema.prisma` = domain model 真相。DB 改動一律經 migration(唔手改 DB)。
- **Vendor SDK 只准喺 `src/integration/`**;domain / orchestration 層唔可以直接 import Graph / ServiceNow SDK。
- **DTO validation**:class-validator + global `ValidationPipe({ whitelist: true, transform: true })`(已喺 `main.ts`)。
- **Logging**:Nest `Logger`,唔用 `console.log`;**絕不** log secret / PII(見 §5 H4)。

### 3.2 Frontend(React + Vite + TypeScript + Tailwind + shadcn/ui)— 落 `apps/web`(ADR-0001)
- **設計系統契約**:`docs/02-architecture/design-system.md` = SSOT;`design_handoff_licenseops/` = 視覺真相。**唔可以 eyeball / hardcode 色值** —— 一律用 token(見 §5 H6)。
- **Token**:原封引入 `design_handoff_licenseops/design-system/tokens/*.css`,Tailwind theme 只**引用 CSS var**(`accent:'var(--accent)'` …),唔複製 hex。`darkMode:'class'`(`.dark` 掛 root)。
- **元件**:shadcn/ui 做底,re-skin 成 handoff token;handoff 個 19 個 `.jsx` reference 當 **spec**(唔照抄 inline-style 版),重建到視覺 1:1。
- **State**:server state = TanStack Query(對 NestJS OpenAPI);UI state = Zustand(theme / role / sidebar / filters …)。Routing:每畫面一 route。
- **Icon**:`lucide-react`(stroke-only);**Fonts**:Geist + Geist Mono;**數字 / 識別碼一律 mono**。一個 view **一個** primary action(Ricoh red `#E60027`)。

### 3.3 共通 Naming
- Classes `PascalCase`;vars / methods `camelCase`;檔名 kebab(Nest 慣例 `*.service.ts`)。
- Env vars `SCREAMING_SNAKE_CASE`。Prisma model `PascalCase` / field `camelCase`。
- SKU 一律以 `skuId`(GUID)為主鍵,唔靠名(見 module spec §5)。
- **Comments**:解釋 **why**,唔係 **what**。
- **TODO format**:`// TODO(<owner>): <description>`。
- **絕不 commit**:secret / API key / PII / `.env` 內容。

### 3.4 測試(H5)
- 框架:Jest(Nest 預設),unit + e2e。Graph / ServiceNow **一律 mock**,唔打真 tenant。
- 掂到 critical path(assign / ledger 更新 / 對帳)嘅 code 必須同步寫 test(見 §5 H5)。

---

## 4. Git & Workflow Conventions

> Repo 已連 GitHub remote:`origin` = `https://github.com/chris-private-workspace/unified-operation-platform.git`(**PRIVATE**;branch `main`)。守 §5 H4:即使 private 都唔好 commit 真實 secret / credential。

### 4.1 Branch naming
```
main                          ← protected,永遠 deployable
feat/<area>-<short-desc>      fix/<area>-<short-desc>
chore/<short-desc>            docs/<short-desc>
adr/<adr-number>-<short>
```

### 4.2 Commit message(Conventional Commits)
`<type>(<scope>): <description>` — types:`feat` / `fix` / `chore` / `docs` / `refactor` / `test` / `perf` / `style`。
Scope:模組名(`integration` / `license` / `fulfilment` / `prisma` / `claude-md` …)。

### 4.3 PR Rules
- One feature per PR。PR description:link spec section / list test scenario /(前端)screenshots。
- Pre-merge:tests pass / coverage 不降 / no linter warning / ADR updated(若架構改動)。

### 4.4 絕不 touch
- `.git/`、`.env*`、任何含 credential 嘅檔。
- `design_handoff_licenseops/`(read-only 設計參考 — 只可 read / recreate,唔可以 port runtime,見 §7)。
- 主 spec / module spec 嘅 content-locked section(只有 owner approve 後先 increment version)。

---

## 5. Hard Constraints(Strict Mode)

> 呢啲 constraint **violate 即係 broken project**。遇到以下情況**必須 STOP and ask**(第一句就講)。

### 5.1 H1 — Architectural Change Constraint

**定義**:任何符合其一 —— 改平台四層地基 / module 邊界;改 vendor / service;改 storage layout / 資料模型 / Prisma schema;動到 module spec 已 lock 嘅決策(對帳方案甲、`skuId` 主鍵、ledger 兩層數字 `allocatedQuantity`/`assignedQuantity`、stage 掛 line item、`azureSyncedAt` sync gate)。

**Required behavior**:①**STOP** 寫 code → ②chat 講明:想做咩架構改動 / 點解現 spec 唔啱 / proposed 替代 → ③等「approved + write ADR」→ ④寫 ADR 入 `docs/adr/`。

**唔屬架構改動(可自行做)**:bug fix / 內部 refactor 冇改 interface / 加 internal helper / 加 test / 加 logging。

### 5.2 H2 — Vendor / Dependency Constraint

**定義**:技術棧已 lock(下表)。加新 runtime dependency 或換 vendor = 觸發。

| Layer | Locked |
|---|---|
| 後端 | NestJS(modular monolith)· TypeScript · Node 20+ |
| DB | PostgreSQL + Prisma |
| 背景工作 | Redis + BullMQ · 排程 `@nestjs/schedule` |
| 對外 API | REST + OpenAPI(NestJS Swagger) |
| Auth | Entra ID SSO + app roles(未建) |
| 前端 | React + Vite + TypeScript + Tailwind + shadcn/ui(落 `apps/web`,ADR-0001) |
| Monorepo | `apps/api`(NestJS)+ `apps/web`(React)（ADR-0001) |
| 部署 | Docker Compose(app + postgres + redis) |
| Integration vendors | Microsoft Graph、ServiceNow Table API、(future)n8n |

**唯一合法路徑**:STOP → 解釋點解現 stack 唔夠 → 等 approval → 寫 ADR。
**例外(可自行加)**:pure utility lib / type stub / dev dependency(test / linter / formatter)。

### 5.3 H3 — Scope / Tier Constraint

**定義**:有明確 in / out-of-scope,唔可以「順手做埋」。兩個層面:
- **平台層**:LicenseOps = **模組一**。其他 IT ops 模組(offboarding / cost insights / D365 / 其他 support 工作流)**未 approve 前唔起**。
- **LicenseOps 模組**(module spec §1-2 刻意排除):ticket 申請表單 / 審批鏈 / SLA 管理 / service catalog / 把 CMDB 當 source of truth / 成本發票金額(→ DocuWare,只記 `quoteRef`/`poRef`)/ offboarding·license 回收 / D365 / 非 onboarding 的獨立 license request。

**Required behavior**:想加超出當前 scope / tier 嘅 feature → **STOP**,講清楚屬邊個未來 tier,等 approval。模糊 → default out-of-scope,ask。

### 5.4 H4 — Security / Privacy Constraint

- **絕不 log / commit**:Entra `GRAPH_CLIENT_SECRET`、ServiceNow 帳密、`DATABASE_URL`、任何 connection string / token。
- **絕不 hard-code**:tenant id / client id / secret / instance URL —— 一律 from env(`ConfigService`)。
- **PII 謹慎**:user UPN / email / displayName 唔好 log 落 plaintext file;debug log 用完即清。
- 掂到敏感資料嘅改動 = 高度小心,唔確定就 STOP。

### 5.5 H5 — Test Coverage Constraint

**定義**:critical path module 寫 code 必須同步寫 test。Critical path = license `assignLicense`、ledger `assignedQuantity` 更新、SKU 總量層對帳 / drift 偵測、request stage 推進 / sync gate。
**Required behavior**:改到上述 path 冇對應 test → task 未完;Graph / ServiceNow 一律 mock(§3.4)。

### 5.6 H6 — Design Fidelity Constraint(前端專用)

**定義**:LicenseOps 前端(`apps/web`)必須忠實還原 `design_handoff_licenseops/` 嘅 hifi 設計。以下屬 violate:
- **hardcode 色 / 字 / 間距 / 半徑 / 陰影值**(唔用 `design-system/tokens/*` 嘅 CSS var / Tailwind token)。
- **eyeball** token(憑感覺調數值,唔查 `tokens/*.css` 實際值)。
- 引入 handoff 以外嘅 **accent 色 / gradient / 陰影美學 / icon set**(accent 只有 Ricoh red;icon 只有 lucide stroke;唯一 gradient = login)。
- 一個 view **多過一個** primary action。
- 只做 light 或只做 dark(兩個都要）。

**Required behavior**:UI 改動 commit / 驗收前跑 `.claude/skills/ui-design` 自檢;要偏離設計(加新元件 / 新 pattern / 改 token)→ **STOP**,先同 owner 確認,必要時更新 `docs/02-architecture/design-system.md`(+ 若屬架構級 → ADR)。
**唔屬 violate**:用既有 token 砌新畫面 / 組合既有 primitive / 加 handoff 已定義嘅 state。

### 5.7 H7 — Tool Result Integrity(工具結果誠信)

**定義**:任何涉及「tool 執行 / 結果 / 驗證狀態」嘅陳述。呢條係為咗杜絕 AI agent
**腦補(fabricate)tool 結果** —— send 完 tool 冇等真 result,就自己續寫一個扮成回傳嘅
output(見 `docs/03-implementation/incidents/INC-001`)。bypass permissions mode 冇咗
「逐個 tool 彈確認」呢個天然 checkpoint,更加容易觸發,所以本條規矩寫成**可觀察行為**,
唔靠抽象自律。

**Required behavior(可觀察,唔係抽象戒條):**
1. **絕不生成任何扮 tool 輸出嘅文字。** tool result 只可以係系統真正返嘅 block。
2. **send tool 即收口**:一個 message 內一旦有 tool call,之後唔可以再有任何文字 —— 到此
   為止,等真 result 返先繼續。
3. **結果類陳述必 trace**:講「pass / clean / done / 200 / rendered / 綠」之前,對上必須
   有一個真 tool_result 支持;trace 唔到 → 一律寫「未驗證」。
4. **高危節點主動停(補 bypass mode 冇 permission checkpoint)**:凡「宣稱完成 / 跑
   verify(test·build·lint·render)/ 過 gate」,一個 command 一個 turn;output 淨係可以貼
   真嘅,唔可以總結成 pass;可驗證嘅優先畀用戶跑。
5. **紅旗自檢**:若發現自己「已經知道」一個仲未有 tool_result 嘅結果 —— 嗰種確定感就係
   警號,即停,真跑。

**違反 = 破壞信任,比任何功能 bug 更嚴重(見 `docs/03-implementation/incidents/INC-001`)。**

### 5.8 H8 — Tool Usage Discipline(工具使用強制紀律 · 🔴 零容忍・無例外)

> **來源** merge 事件——大量用 bash `echo`/`cat`/`grep` 拼裝命令 + `{ }` group 重定向,造成嚴重輸出污染(檔案內容重複、亂碼、語意注入),險些 commit 進損壞內容。本條同 §5.7 **H7 同源(訊息 / 工具結構紀律)**,優先級等同。

**絕對禁止(無任何例外,違反即停手改正):**

1. ❌ 用 bash/shell 跑 `cat` / `head` / `tail` / `grep` / `find` / `sed` / `awk` 讀檔或搜尋 → **一律改用 Read / Grep / Glob 工具**
2. ❌ 用 `echo` 拼裝輸出、`{ }` group 重定向、多命令混合重定向 → **只用單一命令直接重定向** `cmd > file`,再用 **Read 工具**讀
3. ❌ 靠 bash 即時 stdout 判斷結果 → **寫檔後用 Read 工具讀**

**bash/shell 唯一正當用途**:執行**無專用工具替代**的操作(git、npm、其他 CLI),輸出到檔案時**只用單一命令直接重定向、絕不混 echo**。此為正當用途,非漏洞——禁嘅是「有替代卻用 bash」,唔係「用 bash」本身。

**這不是「避免」,是「禁止」。** 本區優先級等同 §5.7 H7(訊息 / 工具結構紀律同源)。

---

## 6. Architecture Decision Record (ADR) Format

違反 §5 嘅改動,approval 後必須寫 ADR。Format 見 `docs/adr/0000-TEMPLATE.md`:`Context → Decision → Alternatives Considered → Consequences → References`。
- 檔位 `docs/adr/NNNN-short-title.md`(NNNN 4-digit),index 喺 `docs/adr/README.md`。
- Status:`Proposed → Accepted → Superseded by ADR-MMMM`。Accepted 唔改內容,要推翻寫新 ADR。

---

## 7. External References — 設計 handoff(read-only)

`design_handoff_licenseops/` 係 LicenseOps 嘅 **hifi 設計參考**(HTML prototype + framework-agnostic design system),= 前端**視覺真相**;可操作契約 + anti-drift 喺 `docs/02-architecture/design-system.md`(SSOT)。
- **只讀 / recreate,唔可以 port 佢個 `.dc.html` runtime,唔可以照 copy prototype code。**
- Token(色 / 字 / 間距)真相喺 `design-system/tokens/*` —— **唔可以 eyeball**,用實際 `--token`(見 §5 **H6**)。
- 建前端前先讀 `docs/02-architecture/design-system.md`,再 `design-system/readme.md` + `styles.css` + tokens。

---

## 8. Open Questions(影響 default behavior)

見 module spec(`docs/02-architecture/licenseops/DESIGN.md §10`)嘅 open items:成本可見度、`isBaseLicense` 去留、ServiceNow 實際 table/field、對帳「對回」機制、OpCo self-service 開放時機。
- Open → 用 spec default 繼續,commit 標「depends on OQ default」。Blocked → STOP 對應 work item,ask。

---

## 9. Sprint / Phase Awareness + 當前 build state

Rolling / JIT — 每 phase kickoff 先喺 `docs/01-planning/W{NN}-{name}/` 建 folder,見 `BACKLOG.md`。唔清楚而家喺邊個 phase → **ask user**。

**當前狀態(2026-08-10)**:

> ⚠️ 呢段**只寫粗略座標**。真相 SSOT 係 `BACKLOG.md`(工作狀態)+ `docs/adr/README.md`(架構決定)+ memory `MEMORY.md`(runtime 實況)。**唔好喺呢度累積歷史** —— 佢一過時就會令成個 session 用錯前提開始(2026-07-31 實犯:本段一直寫住「`apps/web` = placeholder、auth 未做」,而嗰陣前端同 AUTH 早就做齊)。

- 🔴 **「Azure UAT」係誤名(2026-08-04 Chris 更正)** —— W32/W33 部署嗰個**唔係企業 UAT,只係一個自建測試 Azure 環境**:自建 RG / ACR / ACA env(**冇 VNet 整合**)+ PG public,住喺 Azure 公網,**同企業網絡零連繫** ⇒ **同 n8n 兩個方向都接唔通**(inbound 冇企業 domain 入口;outbound 打唔入內網)。**呢個就係 W36–W42 一路 carry 嗰句「n8n 側零 live 驗證」嘅根本原因 —— 唔係漏做,係環境上做唔到。** 檔名 / ADR 標題**刻意保留**(改名會令 git history 永久對唔上,W36 判斷),靠 `ADR-0012` + `07-uat-as-built.md` 頂部 blockquote 更正。⚠️ **W43 亦未部署上去**。
- **真正接得通企業網絡嘅環境 = `RG-RAPO-UOP-DEV`**(infra team 2026-08-04 交付 · 企業共用 ACA env `acaen-rapo-dev` + hub VNet PE + custom domain `rapo-uop-web-dev.rci-t.com`)—— **W44 進行中,仍未部署**。**ADR-0027 Accepted**(Chris 揀 **Option A**:api ingress 收返 internal,對外只剩 web 一個 hostname;cookie / CORS / 前端**一個字唔變**)。`aca-dev.json` + gitignored params + `what-if` baseline **全部備好並驗過**(validate `Succeeded`;what-if 證零 Delete、9 個無關資源 Ignore、custom domain 保留)。
- 🟢 **B1(image build)2026-08-05 已解封** —— 靠**換一台唔喺公司網嘅 build host**(出口 IP `52.187.129.166`,Azure 段;之前四條解法全部 assume 咗「build 一定要喺公司網嗰台機做」)。兩個 image 已 build + **真 push 上 `acrrci3ailanding1`**(api `sha256:5a8d48cd…` / web `sha256:1d543670…`;之前四輪只證到 `login`)。⚠️ **唔係長期方案** —— 佢繞開公司 proxy;**解法 ①(SP 攞 registry `read`+`scheduleRun/action`)仍然最乾淨,infra 唔應該撤走**。🔴 `AcrPush` **唔包** `scheduleRun/action`。
- 🟢 **2026-08-06 已部署上 DEV**(部署 #1)—— 但**唔可以講「部署成功」**,見下面 B7。
  - **B4**:`az deployment group create` 撞 **`LinkedAuthorizationFailed`**(SP 冇 `managedEnvironments/join/action` 喺共用 env `acaen-rapo-dev`,佢住喺**另一個 RG** `RG-RAPO-ContainerAPP-DEV`;SP 實測**只有** `[Contributor] RG-RAPO-UOP-DEV`)。
  - 🟢 **繞過方法 = `az rest --method patch`,body 唔含 `environmentId`** ⇒ 唔觸發 linked auth。🔴 **`az containerapp update`/`registry set` 一樣 403** —— CLI 做 read-modify-write,連 `environmentId` 一齊送返去。**要用 raw ARM PATCH**,腳本 `deploy/azure/patch-deploy-dev.ps1`(dry-run 先印 masked body)。
  - 🟢 **PATCH 比 ARM full PUT 更安全**:唔 unset 冇送嘅 property ⇒ infra 配嘅 `customDomains`+SNI / `workloadProfileName` 結構上掂唔到(實測全部完好)。`aca-dev.json` 保留做宣告式真相,infra 一畀 `join/action` 就用得返。
  - **實測結果**:api revision `--0000002` `Healthy`/`RunningAtMaxScale` · web `--0000001` `Healthy`/`Running` · 🟢 **ACA 由 VNet 內 pull 到 `acrrci3ailanding1`**。
- 🟢🟢 **B7 已解封(infra 2026-08-06 畀咗 `managedEnvironments/read` + enable log)⇒ 三個未知數全部收齊**,container log 原文:`19 migrations found` → `The following migration(s) have been applied:` · `Seeded 24 OpCos + admin + RHK OPCO_IT user.` · `Nest application successfully started`,**零 `WARN: … failed`**。⇒ **B3(ACA 連 private endpoint PG)✅ · PG v18 migration(G8)✅ · seed ✅**。
- ⚠️ **`apps/api/docker-entrypoint.sh` 令 migrate/seed 失敗 NON-FATAL ⇒ revision `Healthy` 本身證明唔到 DB 通** —— 呢個陷阱以後仍然成立,驗證一定要睇 log 或 HTTP。
- 🟢 **B9(SSO)—— 2026-08-07 改咗設計解封,code 齊,但仍未 live 驗過**。而家行緊 **break-glass 本地登入**(`admin@uop.local`)。
  - **點解改設計**:infra 交嘅 app registration `08fa14bf-…`(tenant `d1ea071a-…`,**公司 M365 tenant**)只配咗 client-credentials,ADR-0003(MSAL SPA)要嘅三樣缺晒;而**三輪往返都攞唔到 Application ID URI**。查證揭到重點:**佢哋配嘅嘢本身就係另一條路嘅完整形狀**(client secret ✅ + redirect URI ✅ + confidential client ✅)。**Chris 2026-08-07 拍板** ⇒ **ADR-0028 Accepted**(server-side authorization code exchange,**supersedes ADR-0003**;ADR-0002 唔推翻)。
  - **而家係點行**:前端只把用戶送去 Entra + 交返個 `code`;**API 用 client secret 喺 server 側換 token** → 驗 `id_token` → upsert `AppUser` → 發**平台自己**嘅 httpOnly cookie ⇒ **SSO 同 break-glass 由呢一點開始完全一樣**(`auth.service.grantSession`)。scope 只用 `openid profile email` ⇒ **唔再需要 Application ID URI / 自訂 scope**。
  - 🔴 **配置由 build-time 變 runtime**:`VITE_ENTRA_*` **已全部消失**(vite 會烘死落 bundle)。而家四個 `ENTRA_TENANT_ID` / `ENTRA_CLIENT_ID` / `ENTRA_CLIENT_SECRET` / `ENTRA_REDIRECT_URI` 由 **API env** 讀 ⇒ **改 Entra 配置唔使重 build web image**(見 `apps/api/.env.example` 認證段)。
  - ⚠️ **兩個「紅得靜」陷阱已處理,但要記住形狀**:①guard 同 `refreshSession` 原本硬性 `authProvider:'local'` —— 唔拆嘅話 SSO 登入**睇落成功**然後每個 request 401,而錯誤指向 token 唔指向 provider 過濾(同 v1-issuer 嗰個一模一樣嘅失敗形狀)②state cookie 喺 callback **驗證之前**就清,免得失敗後 reload replay 一個用過嘅 code。
  - 🟢 **F9-7(PATCH 四個 env 上 DEV)一早做咗** —— 2026-08-12 打 `/api/auth/sso/status` 返 `{"enabled":true}` 先發現(唔係新做,係發現咗做過)。🟢 **`F9-8` 嘅 break-glass 嗰半 2026-08-13 收咗**(`F6-6`:login 200 + `uop_access`/`uop_refresh` + role `ADMIN`)。🟢🟢 **SSO 嗰半 2026-08-13 亦收咗 —— Chris 本人測試確認可以登入** ⇒ **`F9-8` 全收,`AUTH-2b`(掛咗一個月)同時 closed**。🔴 **證據來源要分清楚**:break-glass = **AI tool 驗**(HTTP 狀態 + `/api/me` body);SSO = **Chris 人手驗**(Entra 互動要真人帳號 + MFA,AI 結構上做唔到)。兩者都算數,但唔可以寫成同一種證據(沿用 `CH-015` 先例)。⚠️ **由 08-07 ADR-0028 起,呢單就唔再係技術阻塞,淨係差一個人 —— 而佢掛咗六日先有人撳**
  - 🟢 可回退:`login.tsx` 本地表單永遠喺;SSO 未配置 → `GET /auth/sso/status` 返 `{enabled:false}`,個掣自動暗住。🟢 順帶:Graph app `27d329e5-…` 權限齊(`LicenseAssignment.ReadWrite.All` 等)⇒ F3-7 冇障礙。🔴 client secret **expiry 2028-07-28**(RISK R8)。
- ⚠️ **呢台機嘅 az session 唔穩定**(一日內撞過 **4 個唔同 SP**:`d2f094a3` / `a19dfe76` / `2ae44f00` / ACR 嗰個 `4a6e1474`)⇒ 錯身份會畀出**誤導性 error**。**做 az 操作之前一律先 `az account show` 驗身份**(2026-08-10 實測:`d2f094a3-…` = 部署 SP,sub `rcitest`)。🔴🔴 **2026-08-20 更正:部署 SP 憑證一直就喺 `apps/api/.env`,而呢格由 08-10 到 08-20 寫咗十日相反嘅嘢。** 呢格原本寫「喺 `apps/api/.env` 尾段」,08-10 「實測」推翻咗佢(當時寫:`.env` **17 個** key 冇一個 `AZURE_*`)⇒ 結論係「憑證唔喺 repo,**要 Chris 喺 terminal 自己 `az login`**」。**兩句都唔啱,而最初嗰句先啱。** 08-20 實測:`.env` **28 個 key 唔係 17 個** —— 差嗰 11 個**全部細楷**(`azure_tenant_id` / `azure_client_id` / `azure_secret` / `azure_container_registry` / `azure_url_for_uop` / `azure_url_for_api_call` / `azure_postgresql_id` / `azure_postgresql_pw` / 三個 `dev_entra_*`),而 08-10 個 grep pattern 係 `^[A-Z_0-9]+=`(**只 match 大寫**)⇒ 佢哋結構上冇可能出現喺結果入面。🔎 **身份逐個比對過先講**(唔印值,只比前綴):`azure_client_id` 前綴 = **`d2f094a3`** = 上一句講嗰個部署 SP · `azure_secret` 非空 · `dev_entra_client_id` = Entra app `08fa14bf`(ADR-0028 嗰組)· `dev_entra_tenant_id` / `GRAPH_TENANT_ID` = M365 tenant `d1ea071a`。⚠️ **兩件唔可以順住推落去嘅事**:①`azure_tenant_id` **match 唔到任何已記錄過嘅 id**(部署 sub 係 `rcitest`,同 M365 tenant 唔同一個,而呢格從來冇記過部署 tenant)②**「憑證喺度」≠「login 得到」** —— 我**冇**真跑過 `az login --service-principal`,secret 可能過期;要用之前照樣要驗一次(同「revision `Healthy` ≠ DB 通」、「有設定 ≠ 設定啱」同族)。📌 **方法論(§9 第六次同一族)**:一個對嘅觀察(「grep 冇中」)推去一個更強嘅結論(「檔案冇」),而今次兩者之間差嘅淨係 **case sensitivity 一個字**。⚠️ 仍然啱嘅兩句:`patch-deploy-dev.ps1` **自己唔 login**,靠 caller 事先做;`aca.params.dev.json` 有 ACR 同 app secret 但冇部署 SP。ACR 側另一組憑證(`4a6e1474`)先至喺 `aca.params.dev.json`,而且**唔可以用 `az acr login`**(部署 SP 冇 registry 權限,CLI 會 fallback 互動式然後 `EOFError`,錯誤訊息完全唔提權限)。
- 🟢🟢 **B8 ✅ 解封(2026-08-12,Chris 提示 + 本機瀏覽器實測)** —— **`https://rapo-uop-web-dev.rci-t.com/` 而家由呢台機打得通**。以下全部**實測**,唔係推論:
  - `/` → `/login`,頁面完整 render
  - **`/api/docs/api` → 200 Swagger UI · `/api/docs/api-json` → 200 真 OpenAPI JSON** ⇒ **W44 `F6-5` 收**。⚠️ **路徑係 `/api/docs/api` 唔係 `/docs/api`**(ADR-0027 Option A:對外淨係得 web 一個 hostname,api 靠 `/api` prefix;打 `/docs/api` 會畀 SPA fallback 食咗返 HTML —— 呢個係最易誤判成「api 唔通」嘅位)
  - `/api/me` → **401 `Missing credentials`**(唔係 502/504)⇒ api 真係喺度兼且 guard 正常
  - 🟢 **`/api/auth/sso/status` → `{"enabled":true}`** ⇒ **`F9-7`(四個 `ENTRA_*` env PATCH 上 DEV)原來一早做咗**,login 頁個 `Continue with Microsoft Entra ID` 掣係**着**嘅
  - ⇒ **仲卡住嘅唔再係「有冇路」,係「有冇憑證 / 要唔要真派 licence」**:`A2` break-glass(要 admin 密碼)· `A3`/`F9-8` 真人 SSO(要 Chris 本人)· `A4` Graph test connection · `A5` W45 失敗路 · `CH-022 A7`(要一張新 intake)—— 全部**登入之後就做得**
  - 📌 **點解會通返冇查證**(唔亂猜):可能係 infra 補咗 DNS、可能係網絡改動。**唔重要,重要係 Step 0 每次都要真打一次** —— 呢格由 08-06 到 08-12 錯過兩次方向(先當通、再當唔通),兩次都係靠推論。
- ⬇️ **以下係解封之前嘅歷史,保留做方法論記錄** ⬇️
- 🔴 **B8(舊)= 企業 DNS 冇我哋條記錄**。2026-08-06 由**公司網絡**實測:`rapo-n8n-uat.rci-t.com` → `10.160.71.243` ✅ 但 `rapo-uop-web-dev.rci-t.com` → **Non-existent domain** ⇒ **infra 漏咗建**,custom domain **喺企業網都訪問唔到**。⚠️ 之前嗰個「ACA 綁 custom domain 要 hostname 驗證 ⇒ DNS 應該配好咗」嘅推論**已被推翻**。
- 🔴 **B8 範圍更正(2026-08-10)——「B8 唔 block 驗證」呢句係錯,而且一直被當成事實用咗四日。** 原文寫住「由公司網絡打 ACA 預設 FQDN(internal env 喺 hub VNet private DNS **一定**有記錄)⇒ F6-4/5/6 即刻收得」。嗰個「**一定**」係**推論唔係實測**;2026-08-10 Chris 實測 **ACA 預設 FQDN 一樣訪問唔到**。查證(`az containerapp show` / `az resource show`):web ingress `external: true` **但** env `vnetConfiguration.internal = true` 而 `staticIp = **10.160.71.70**`(**私有 IP**)⇒ 個 FQDN 要靠 private DNS zone `nicesea-c3849dba.eastasia.azurecontainerapps.io` → `10.160.71.70` 先解析到,而嗰個 zone 冇 link 到企業網。⇒ **ACA 預設 FQDN 呢條路確定冇得行。**
  - 🔴 **2026-08-11 再更正:上面原本收尾嗰句「兩個 hostname 都打唔到」自己就係一個冇標明嘅推論 —— 第四次同一族。** 08-10 **只實測過 ACA 預設 FQDN**,custom domain **冇任何一次測試記錄**;而 `09-dev-as-built.md:668-672` 記住 **2026-08-06 稍後 infra 建咗記錄之後,Chris 由公司網絡實測 `https://rapo-uop-web-dev.rci-t.com/` 開到 login 頁面**(W44 `F6-4` 亦係 `[x]`)。**兩者本來就係兩條唔同嘅解析路** —— custom domain 靠**企業 DNS** 一條 A record,ACA FQDN 靠 **Azure private DNS zone**(冇 link 到企業網)⇒ **一條唔通推論唔到另一條唔通**。諷刺位:同一段落一邊寫住「§9 入面凡係推論必須標明」,一邊自己藏咗一個。
  - ⇒ **凡要 live 驗,第一件事係打 `https://rapo-uop-web-dev.rci-t.com/`**(30 秒,兩個結果都有路行)。**唔好預設要 hosts 繞路** —— 佢係 Step 0 失敗先用嘅後備。全套見 **`docs/13-deployment/10-dev-live-verification-runbook.md`**。
  - 🔴 **後果**:F6-4/5/6、F9-8(真人 SSO)、**CH-022 A7** 一直寫住「隨時做得 / 即刻收得」—— 實際上**冇路**。凡見到「打 ACA FQDN 就驗到」嘅計劃,一律當未解封。
  - 💡 **繞路(未驗證,但有同網段實測支持)= hosts 檔**:`staticIp` 係 `10.160.71.70`,而上面 B8 自己記低咗公司網打 `rapo-n8n-uat.rci-t.com` → `10.160.71.243` **係通嘅** ⇒ 同一段,缺嘅淨係 DNS 一行。喺公司網嗰部機加 `10.160.71.70  rapo-uop-web-dev.rci-t.com`。**用 custom domain 唔好用 ACA FQDN** —— infra 綁咗 SNI cert 喺 custom domain,而且 `ENTRA_REDIRECT_URI` 就係佢 ⇒ 連 SSO 都用得返。
  - 📌 **方法論(第三次同一族)**:呢句同 W44 Day 3(`az acr list` vs `show`)、Day 7(`docker login` vs `push`)同源 —— **由一個相關但唔對位嘅觀察,推去一個更強嘅結論**。分別係前兩次自己撞返出嚟,呢次要用戶問「根本不能夠訪問,你不知道的嗎?」先揭穿。**推論寫入 §9 嗰刻就會變成下個 session 嘅事實**,所以 §9 入面凡係推論必須標明。
- 🔴 **仍要一次直接驗證先收尾**(row count / admin 帳號 / API 200):**最快 = 上面條 ACA FQDN**;其次 ①infra 畀 `managedEnvironments/**read**`(純唯讀)②Chris 個人帳號睇 Portal log。
- 💡 **方法論**:直接路封死唔等於冇路 —— **部署權限 / 觀測權限 / metrics 係三套嘢**,而 metrics 一直喺手上,四日冇人諗過用。詳見 `docs/13-deployment/09-dev-as-built.md`。
- 🟢 **W45(ADR-0029 assign 過程可見性)實作收晒**(2026-08-10):後端十步真回傳 `{outcome, failedAt?, steps[]}`;前端 `AssignResultDialog`(pre-flight 摺七道閘 + 三個副作用逐個 + `whoFixes`)。**light + dark 真 render 驗過。🔴 淨低 F4-4 live 驗,2026-08-11 拆兩半:失敗路 @ DEV 卡 B8 · 成功路 @ 本機唔卡 B8(見下)。**
  - 🔴 **順帶揭咗一個所有 test 層都捉唔到嘅 bug,形狀要記住**:`apiPatch` 由頭到尾 hand-roll `new ApiError(status, message)` **冇第三個參數** ⇒ error body 永遠唔會落 `ApiError.detail`(只有 `errorFrom` 會,而 `apiPatch` 從來冇用過佢)。ADR-0029 個 steps 擺喺 400 body ⇒ **喺瀏覽器永遠到唔到前端**,而 api/web test/tsc/lint **全綠** —— 因為 UI test **自己手砌 `ApiError` 連 detail**。⇒ **唔係「漏咗一條 test」,係「條 test 放錯層」**。已修 + 補 transport 層 test。⚠️ `apiGet` 一樣冇 detail(冇 caller 需要,刻意冇改)。
- 🟢 **CH-023(assign 之後 ServiceNow 側結果寫落 timeline)實作收晒**(2026-08-10,`f219676`):assign 成功後多寫一條 `RequestEvent` NOTE `ServiceNow {status}: {detail}`,**message 由 `steps` 個 ticket step 推導**(唔另寫文案,否則 dialog 同 timeline 各自漂)。零 schema / 零 migration / **零前端**。🔴 淨低 G9 live 驗 —— **2026-08-11 更正:唔卡 B8**(見下)。
- 🔴 **「live 驗」唔等於「卡同一個環境」—— 同一族第五次(2026-08-11)**。W45 成功路同 CH-023 G9 一直寫住卡 `B8`,實際上卡嘅係「**要唔要真派一個 licence**」呢個決定:兩者都只喺 assign **成功之後**先睇得到,而 `BACKLOG` `DEV-GRAPH-PLACEHOLDER` 行(08-10 查證)證實 **DEV 個 `GRAPH_TENANT_ID` = 公司 M365 tenant `d1ea071a-…` 而 `GRAPH_CLIENT_ID` 同本機 `.env` 逐字一致** ⇒ **DEV 同本機打緊同一個 tenant / 同一個 Graph app,派出去嗰個 licence 一模一樣** ⇒ **去 DEV 換唔到任何嘢返嚟,本機做仲快**。⚠️ 亦要記住 W45 F3-7 四張截圖入面 `success`/`skipped`/`overridden` **係攔截 PATCH 造出嚟**,唔係真回應。**全套步驟(兩條 track)= `docs/13-deployment/10-dev-live-verification-runbook.md`。**
  - 🔴 **`ADR-0031`(`AssignAttempt` 新表)= Rejected —— 呢個「提案被自己嘅代價否決」嘅形狀值得記住**:D4「refusal 路開始寫狀態」係全份提案入面**唯一推翻既有約束**嘅位(第二次軟化 `ADR-0016 D6`「a block changes no state」),而佢**淨係為 refusal 路存在**;但 refusal「邊道閘擋住」係操作員撳嗰刻見到、改完即刻再撳嘅嘢,**本身唔係「三日後要翻查」嗰種事實** ⇒ **覆蓋面大過需求**。揀 Option A 換返嚟嘅就係「唔使軟化任何約束」。ADR 全文保留唔改寫,將來真係要翻查每次嘗試由 D1-D6 重開。
  - ⚠️ **「由 step 推導」嘅 test 自己有個陷阱**:`toBe(\`ServiceNow ${step.status}: ${step.detail}\`)` 防到 drift,**但係 tautology**(code 同 test 由同一個 step 攞值,永遠 pass)⇒ 一定要同時配一條 hardcode 期望字嘅 assert,兩條夾埋先有意義。
- 🟢 **BUG-011 ✅ closed**(2026-08-11,PR #79):Integrations panel enum 值送埋去前端(按 `kind` 分流去既有 `Select`)+ 新 `SeamRuntimeRegistry` 記低三個 factory **boot 實際揀咗邊個** ⇒ 出 `pendingRestart` badge。🔴 **`state` 語意同 ADR-0013 C2 boot-once 語義一個字冇改**(改後者 = H1)。**RISK 新增 `R9`**。
  - 🔴 **「新欄唔會自己流出去」呢個代價要記住**:`IntegrationController.list()` **逐個欄砌回應、明文唔 spread**(ADR-0013 D2 **刻意設計,應該保留**)⇒ 加咗欄落 read-model **唔等於出到 API**,而三層 test 可以全綠(service spec 打 service · UI test 自砌 fixture · **DTO 冇宣告嗰個欄所以 tsc 唔返佢完全合法**)。同上面 `apiPatch` **同一日第二次同一形狀**:**每一層 test 都喺自己嗰層邊緣停低,而 bug 就住喺兩層之間。** 而家有 `integration.controller.spec.ts` 守住條縫。
  - 🔴 **一條 assert 睇落嚴唔嚴謹,同佢捉唔捉到嘢,係兩件事** —— 同日中三次(CH-023 由 step 推導 = tautology · status 三條 `expect(false)` 喺 no-op 之下仍然綠 · guard 用 `toHaveProperty(key)` 對 `undefined` 一樣 pass)。**唯一分辨方法係拆走實作睇佢紅唔紅**,`toHaveProperty(key, value)` 先由 1 紅變 2 紅。
- **本機 runtime 避坑**:Prisma engine CDN 被公司 proxy 封(RISK R1);port 3000→Langfuse 佔用 ⇒ api 用 **3100**、5432→既有 Postgres 佔用 ⇒ docker **5433**;web **5173**。起 / 重啟一律用 `restart-stack` skill。
  - 🔴 **5433 同 `ai-doc-extraction-db` 硬衝突,只可以二揀一** —— 起 UOP 前要 `docker stop` 佢(**要 Chris 批**,係另一個項目),用完 `docker start` 還原。⚠️ **還原會靜靜失敗**:`docker start` 撞正 `uop-postgres` 未停就搶唔到 port,而**之後即使停咗 UOP、`docker restart` 都唔會重新 attach** —— container `healthy` · `inspect` 見到 `PortBindings` 仲喺,**但 host 零 listener**(restart-stack 硬規則 3 嗰個形狀)。要 `docker compose up -d <svc>` recreate,**兼且真 TCP connect 驗,唔好睇 health flag**。
  - 🔴🔴 **更嚴重(2026-08-12 兩次實測):5433 揸唔穩 —— `ai-doc-extraction-db` 停咗會自己返嚟兼搶走個 port,而 `uop-postgres` 會被 fast-shutdown。** 兩次時序:①10:34 `docker stop` 佢 → **10:41 佢 Up 返**,`uop-postgres` 撞 `port is already allocated` ②11:54 recreate 咗 `uop-postgres`(真 TCP `True`)→ **11:55:46 收到 `received fast shutdown request`**,同一刻佢 Up 返。⚠️ **佢個 `restart=unless-stopped` 語意上唔應該咁做**,所以**唔好當係 restart policy** —— 真兇未查證。🔎 **唯一線索**:`uop-postgres` log 喺被殺前 28 秒有 `FATAL: password authentication failed for user "postgres" — Role "postgres" does not exist` ⇒ **有第三方一直喺度打 5433 兼且期望嗰度係另一個項目個 DB**(佢用 `postgres` user,我哋用 `uop`)。
    - ⇒ **實務規則**:**要用本機 DB 就一氣呵成做完,唔好中間停低**;每次 `docker exec` 之前**唔好假設個 container 仲喺度**(會出 `container ... is not running`,而個錯誤訊息完全唔提 port 被搶)。長時間工作(起 stack 做 render 驗證)要接受中途可能要 recreate 一次。
  - 🔴 **`nest start --watch` 個 build-cache 假綠燈會再撞**:見到 **`Found 0 errors` 同 `MODULE_NOT_FOUND` 一齊出**,就係佢 —— 刪 `apps/api/*.tsbuildinfo` **同** `dist/`,然後**直接起 stack,中間唔可以插 `npm run build`**。
    - 🔴 **2026-08-12 再更正:同一個症狀有第二個成因,而且更常見 —— 兩條 `nest start --watch` 同時跑。** 第二條起身**清 `dist/`** → tsc 讀第一條啱啱寫低嘅 `tsbuildinfo` → 判斷「已最新」→ **skip emit** ⇒ `dist` 空。**刪幾多次 cache 都冇用**,因為每起一次就重新生成一次。**分辨方法 = `kill-zombies.ps1` dry-run 睇下有幾多條 `nest.js start --watch`**(正常 1 條);實測嗰次係我自己起第二條之前冇清第一條。
    - 🔴 **2026-08-11 更正:`Test-Path dist/main.js` 唔係可靠嘅 discriminator,呢度原本教錯咗。** 原文寫「要喺 watch **起身之後** check 先有意義」;CH-021 A12 實測**照做咗**,watch 已經跑咗 90 秒,佢**仍然返 `True`**(舊 build 剩低嘅檔)⇒ 我據此**排除**咗 build-cache,再白等 180 秒,而真兇就係佢。
    - ⇒ **唯一可靠信號 = log 嗰兩句同時出現**。🔴 **但 `start-detached.ps1` 唔會 capture api stdout**,所以預設情況下你**睇唔到** —— 要 `Start-Process … -RedirectStandardOutput/-RedirectStandardError` 起一次先睇到。
    - 🟢 **2026-08-12 第三、第四次撞,兩次都 13 秒解決** —— 因為**一開始就用 `Start-Process -RedirectStandardOutput` 起 api**,唔使等,唔使估。⇒ **四次對照下,「白等 180/270 秒」同「13 秒」嘅唯一分別就係有冇 capture stdout。** 呢個唔應該再當成「要記住嘅坑」,應該當成 **`start-detached.ps1` 一個要修嘅缺陷**(佢係唯一令呢個坑貴嘅嘢)。**起本機 api 一律自己 redirect,直到腳本改咗為止。**
    - 🔴 **2026-08-12 順帶睇出咗觸發規律,而佢解釋咗點解「成日都撞」**:`nest start --watch` **被殺死**(唔係正常退出)⇒ `tsbuildinfo` **同** `dist/` 都留喺度 ⇒ 下次起身 watch 清 `dist/`、tsc 讀舊 `tsbuildinfo` 判斷「已最新」跳過 emit ⇒ **必撞**。而收工一律係 `kill-zombies.ps1 -Execute` 殺死佢 ⇒ **幾乎每次起 stack 都會中**。⇒ **實務規則:起 stack 之前一律先刪 `apps/api/*.tsbuildinfo` + `dist/`**,唔使等佢紅先做(成本 = 一次 full rebuild 約 15 秒)。
  - 🔴 **本機 Graph 係通嘅** ⇒ 真跑一次成功 assign 會**喺公司 tenant 真派 licence**。
    - 🔴🔴 **`sync-check` 返 `FOUND` **證明唔到**個 user 存在 —— 2026-08-12 有硬對照**:同一個 UPN(`w45.render.check@rapo.com.hk`)、同一分鐘,`POST :id/sync-check` 返 **`FOUND`**,而真 assign 個 `directory` 閘返 **`Target user not found in Azure AD`**。⇒ **兩個相反答案。** 08-10 只知「假 UPN 一樣返 FOUND」,而家知**佢同真相相反**。**要探個 UPN 存唔存在,唯一可靠方法係直接打 Graph `/users/{upn}`**(scratchpad 有 `probe-target-user.js`),唔好信 `sync-check`。⚠️ 順帶:嗰條 request 個 timeline 寫住 `Phase 1 sync manually confirmed (not verified against Graph)` —— **gate 係人手開嘅**,而 `sync-check` 似乎冇覆核。
    - 🔴 **`targetUpn` 喺 `azureSyncedAt` 之後改唔到**(`PATCH /fulfilment/requests/:id` → **409**「it is the key the assignment flow uses」)。**個 guard 係啱嘅**,但做 live 驗證要換 target 嗰陣就要**直接改本機 fixture 嘅 DB row** —— 呢個唔係繞過生產約束,係改測試資料本身。
- 🔴 **ServiceNow 寫入係逐個 table 分開開權,唔可以由「某張表寫得」推論「另一張寫得」**:`sc_request` insert **403**(BUG-010)· `sc_item_option` update **403**(ADR-0026)· `sc_req_item` / `sc_task` update ✅ · catalog `order_now` ✅。⇒ `target_user` **永遠**指住 requester,真 target 睇 `target_users_email`(DD-5)。
- 🔴 **UOP 同 n8n 共用 SN 帳號 `n8napiservice1`** ⇒ `sys_updated_by` 分唔到邊個系統做,唯一指紋係 `close_notes`(RISK **R7**)。查 SN 側「邊個做過乜」一律唔可以信 `sys_updated_by`。
- 🔴 **PR 顯示 `MERGED` 唔等於啲 commit 入齊咗** —— **PR #87 實測只 merge 咗 6 個入面嘅頭 2 個**,靠 checkout 之後見到舊版 working tree 先揭穿,而嗰 4 條走漏嘅要跟下一個 PR 先入到 main。⇒ **merge 之後逐個 `git merge-base --is-ancestor <sha> origin/main`**,唔好睇個 state 就當收咗(PR #88 六個已咁樣查過,全部 `True`)。
  - 🟢🟢 **2026-08-15 搵到根因,而佢直接得出一條操作規矩** —— 呢個形狀累計中咗**四次**(`#87` / `#102` / `#104` / `#105`):commit **到咗 remote branch**,但 **PR 個 head ref 冇跟住更新**,而 merge 只 merge **PR 自己認住嗰個 head** ⇒ 後面 push 上去嗰啲原地不動。**⇒ 開咗 PR 之後唔好再 push 落同一條 branch;要補嘢就開新 PR。**
  - 🔴 **順帶推翻一個舊誤判**:`gh pr view` 報嘅 commit 數**係真嘅,唔係 stale API**。當佢 stale 嗰刻,結論就變成「顯示問題,唔使理」⇒ **繼續 push 落同一條 PR** ⇒ 繼續踩。**一個「解釋得通」嘅無害解釋,比冇解釋更危險。**同「revision `Healthy` ≠ DB 通」、「有設定 ≠ 設定啱」同族:**一個 summary-level 綠燈證明唔到下面每一件都真係做咗。**
- 🔴 **`owned` 嘅定義 2026-08-12 改咗(ADR-0033 / CH-027)** —— 由 `prepaidUnits.enabled` 變 `enabled + warning`(過期但喺寬限期嘅 seat **真係派得到**,實測 Graph HTTP 200)。assign gate 跟住由拒絕 **32/101** 收窄到 **11**。`suspended`/`lockedOut` **刻意唔計**(Microsoft 自己喺 `capabilityStatus` 講咗唔可以用)。⚠️ **凡見到「`owned` = 買咗幾多」嘅舊講法,一律當過時。**
- **仍未做 / pending**:見 `BACKLOG.md`(🆕 🟢 **CH-030 2026-08-14 實作 + test + migration + render 全收**,ADR-0035 Accepted;✅ **`OD-1` = 唔做(Chris 2026-08-14 拍板)** —— 新欄只對 ADR-0035 之後開嘅 request 有值,舊嗰批永遠 `null` 兼行 A7 回退路(顯示 RITM);**呢個係已收嘅決定唔係遺留待辦**,唔好將來當成「未做嘅 backfill」重開(要查舊單個 REQ,timeline NOTE 一直喺度)。🟢 **render fixture 亦已清返** —— 🔴 **還原時揭到一個教訓:改測試資料之前,`SELECT` 一次你將會寫嘅每一個欄**(唔係只 select 你關心嗰啲)。我當時只 query 咗 `lic`/`az`/`sn`,而 `stage`/`assignedAt`/`accountCreatedAt` 三個都被覆蓋咗;今次補得返係因為 **timeline 零 `STAGE_CHANGE` 而 `advanceStage` 一定寫 event** ⇒ `REQUESTED`,同 **`openSyncGate` 喺同一 transaction 寫 `azureSyncedAt`(原本 NULL)** ⇒ `accountCreatedAt` NULL —— **下次可能唔會咁啱有證據答得返**;✅ **AUTH-2b 2026-08-13 closed**(Chris 本人測 SSO 確認可以 ⇒ W44 `F9-8` 全收);DEPLOY-harden;W43 遺留 = live close 未驗;~~🆕 🔴 DEV 落後 `main` 五個 CH ⇒ 要部署 #6~~ 🟢 **2026-08-13 部署 #6 `dev-53965f3` 做咗**;🟢 **CH-030 merge 之後又落後一次 ⇒ 2026-08-15 部署 #8(`dev-4bbbe0f`)追返**(驗證:`GET /api/fulfilment/requests` **200 兼 row 有 `serviceNowLicenceReqNumber`** ⇒ 一個 request 同時證新 code + migration;web bundle 兩個新字串中而 CH-030 刪走嗰個唔喺度。🔴 **要記住嘅係佢換唔到咩** —— 個欄只對部署**之後**開嘅 request 有值,實測 **10/10 仍然 `null`** 照顯示 RITM);🟢 **CH-029 merge 之後 DEV 又落後一次,同日 部署 #7(`dev-2a68f8d`)追返** ⇒ **`CH-029` 個 `D-C` live 驗同日收咗**(`reconcile` → 201 `{"resolved":16,"skippedUnlimited":22,"drift":56}`,三個預測數全中;audit **16/16** 帶 `reason=unlimited-sku`)。🟢🟢 **`D-A` live 2026-08-14 收咗 ⇒ CH-029 三個 deliverable 全部有 live 證據,單 closed**。🔴 **而個「撳之前先唯讀探測」規矩今次真係攔住咗一次冇意義嘅真派**:DEV 三條 `READY` **全部同一人同一 SKU**,target SKU = **`POWER_BI_PRO`**,而 Graph `/users/{upn}/licenseDetails` 直接答**佢冇持有** ⇒ 撳落去**只會驗到「未持有」嗰條路(即 CH-029 之前本來就有嘅行為)**,代價係一個真 licence。⇒ **改喺本機驗**(§9 同族先例:DEV 同本機打**同一個 Graph tenant / 同一個 app**,而 `HoldingCheckService` 就係打 Graph;DEV 側 gate 已由 OpenAPI enum 確認在 wire ⇒ **code 在 DEV + 行為在本機 = 齊**)。fixture = `jerry.wong` + **`FORMS_PRO`**(**揀佢係 fail-safe 唔係自信 —— 佢係 `unlimited`,萬一嗰個 Graph 讀錯咗,真派嘅 seat 成本係零**)+ **要自己建 ledger row**(`budget` 排喺 `holding` 之前,本機零 row 就到唔到嗰道閘)。**結果**:HTTP 200 `outcome: assigned`,`holding`/`seats`/`assign`/`ledger` **四個全 `skipped`**;DB 側 **ledger `5/0` 一個字冇變**、`stage → ASSIGNED`(D3=A)、timeline 寫低咗點解、零 `LedgerAdjustment`。🔴 **誠實講一個驗唔到嘅位:M365 側喺呢個場景結構上證明唔到嘢**(SKU 本來就喺佢身上,Graph POST idempotent)⇒ 真證據係 **ledger 冇加 + `assign: skipped` + code 明文唔 call provider**。⚠️ **「DEV 追齊咗」呢句唔可以當狀態寫 —— 佢每次 merge 就過期**,驗 DEV 之前一律先確認佢跑緊邊個 tag)。🟢 **CH-026 `G-7` 2026-08-13 做咗**(22 個 SKU curate 做 `unlimited`,`Available seats` `4,270,779` → `50,779`;本機 + DEV 兩邊各做一次)。🟢🟢 **CH-029 2026-08-13 實作 + test 收晒(一日做齊三個 deliverable,估 2.5–3 日)** —— api **1012 → 1040 / 73 → 74 suites** · web **362 → 368**(6 條紅 = pre-existing,零新增)· tsc 兩邊 0 · api lint 0 · **falsification 三個都真跑真紅零誤傷**。🟢 **`F5-4` H6 render(08-13)· `F5-7a` D-C live @ DEV(08-13)· `F5-7b` D-A live @ 本機(08-14)全部收晒 ⇒ CH-029 closed。**🔴 **開工先查到一個 spec 冇寫嘅約束,而佢決定咗形狀**:`license-ops.boundary.spec.ts` assert **`assign.service.ts` 唔可以 import `GraphService`**,而 ADR-0034 D1 又要求唔經 seam ⇒ **要開獨立 `HoldingCheckService`**(跟 `SyncCheckService` 先例)。📌 **而個約束令設計好咗** —— 獨立 service 令 `unknown` 呢個狀態有地方住;塞返落 assign.service 就會變 boolean,而 `unknown` collapse 落 `not-held` **正正就係 D6 講嗰種靜靜退化**。🔴 **`holding` 排喺 `budget` 之後 `seats` 之前係本單決定(ADR 冇指定)**:budget 後面因為 ADR-0016 D5(唔應該為一個爆咗 budget 嘅 request 花 vendor round-trip);seats 前面因為**已持有唔食 seat** 而 **`seats` 冇 override 出路**。以下三個缺口係本單起因:**A** 重複 assign 令 ledger double-count(**W39 OQ-1 拍板嘅結果,唔係 bug**;`POWERAUTOMATE_ATTENDED_RPA` 就係活例)· **B** `totalUnallocated` 負數 · **C** drift 對 unlimited 冇意義但照開 alert。**Chris 答案**:A = **assign 前由平台自己查 M365** · B = **負數係誠實,唔改** · C = **先攞實測數**。🟢🟢 **A 揀「平台自己查」令道閘企喺 provider 之前 ⇒ 兩條路自動一致 ⇒ 唔使軟化 ADR-0017 D0,反而係 D0 嘅正確應用**。🟢 **實測(DEV reconcile)**:**72 個 OPEN drift alert,16 個(22.2%)屬 unlimited** ⇒ 跳過後 72 → 56;🔴 **順帶揭到:72 個入面只有 4 個 `ledgerAssignedSum ≠ 0`** ⇒ **今日大部分 drift 唔係「拉開咗」,係「平台由頭到尾未記錄過」**(指向 ADR-0014 baseline,唔喺本單)。🟢🟢 **ADR-0034 同日 Accepted、spec `approved` ⇒ 而家開得工**(D3 揀 **A** 照推 `ASSIGNED` ⇒ 唔掂 stage machine · D6 **fail-open + 大聲**[呢道 gate 係帳目準確性優化唔係安全邊界,同 ADR-0016 budget gate 性質唔同]· D4 擴成「**跳過 + 主動 resolve**」)。

---

## 10. Phase Planning Workflow

> Source of truth:`docs/01-planning/PROCESS.md`。

### 10.1 Per-Phase Artifacts
每 phase `docs/01-planning/W{NN}-{name}/`:`plan.md`(locked 後改要 changelog)/ `checklist.md`(daily tick)/ `progress.md`(daily + retro)。

### 10.2 Binding Rules
- **R1** — multi-day implementation 前必須有 approved pre-doc(plan/spec/report)。冇 → STOP。
- **R2** — Daily commit 對應 `progress.md` Day-N entry。
- **R3** — Plan/spec deviation 必須 log changelog,唔可以 silent drift。
- **R4** — Open question resolved → 同步更新對應文件 + progress。
- **R5** — 架構級決定 → 必寫 ADR。
- **R7** — Pending 工作變動必須反映喺 `BACKLOG.md`。

### 10.3 AI Session Start Protocol
每 session(§0 identity check 之後):①讀 `docs/12-ai-assistant/01-prompts/session-start.md`(詳版 onboarding)→ ②active phase `plan.md`(scope + acceptance)→ ③`checklist.md`(next unchecked)→ ④`progress.md` 最近 3 個 Day-N → ⑤`git status --short` + `git log --oneline -5` → ⑥唔清楚 ask。SessionStart hook 已自動注入 `SESSION_SUMMARY.md` + active phase + git;`/compact` 前用 `compact-session.md`。**Compact 後**必須 re-read ①-④。

---

## 11. Output / Communication Conventions

- **回覆語言**:**繁體中文為主**,英文只限 code identifier / 檔名 / API / commit hash / ADR 編號 / vendor 名。
- 唔好過度 disclaimer / hedging。重要決定明確 surface,唔好 bury 喺長文最後。
- Code change 說明 **what + why**,唔重複 code。引用 spec 標明 section。
- 遇到 §5 hard constraint trigger,**第一句就 STOP and explain**。

---

## 12. Self-Verification Before Marking Task Done

- [ ] 對應 spec 邊個 section?
- [ ] 有冇 violate §5 hard constraints?(有 → 未完)
- [ ] 有冇 violate §1 behavioral baseline?(每行改動 trace 得返 request?)
- [ ] Test 寫咗未?(critical path → H5)
- [ ] Linter / formatter run 過?
- [ ] Commit message follow Conventional Commits?
- [ ] 架構-adjacent 改動 → ADR 寫咗未?
- [ ] Phase checklist tick 咗?progress Day-N 寫咗?(R2)
- [ ] Pending 變動 → BACKLOG 同步咗?(R7)

---

## 13. When in Doubt(default behavior)

| 情況 | Default |
|---|---|
| Spec 同 your idea 衝突 | Spec wins,除非 explicitly raise + get approval |
| Spec 缺 detail | Ask user,don't guess |
| 兩種實作都 reasonable | 揀更接近既有 pattern 嗰個 |
| Stakeholder feedback 同 spec 衝突 | STOP — surface conflict,等 resolution |
| Scope 邊界模糊 | Default out-of-scope,ask(H3) |
| SKU 靠名定靠 GUID | 一律 `skuId` GUID,唔信 Excel / 記憶中嘅 part number |
| 要加 dependency 至做到 | STOP(H2),唔好靜靜 `npm i` |
| Assign 但 user 未 sync | 唔 assign — `findUser` null / `azureSyncedAt` 空 = Phase 1 sync gate 未過 |
| UI 想調色 / 間距 / 加元件 | 查 `design-system/tokens/*` 用 token,唔 eyeball / hardcode;要新 pattern 先問(H6) |
| Performance vs simplicity | 早期:simplicity wins |

---

## 14. Update This File

當以下發生 update:加新 vendor(approved + ADR)/ 改 phase / 加改 hard constraint / open question resolved / 新 convention / scaffold 現狀清除(§9)。
- 改動 commit 標 `docs(claude-md): <change>`。重大(§1 / §5)需 owner explicit approve;微調(routing entry / phase status)可自行做。

🔴 **§0 同 §9 嘅 phase 座標,每次 phase / CH / BUG closeout 都要順手掃一次** —— 同 `docs/12-ai-assistant/01-prompts/SESSION_SUMMARY.md` 一齊做(嗰份由 SessionStart hook 每 session 注入)。

**點解值得寫成一條規矩**:呢兩份係**唯一會被無條件讀入每個新 session** 嘅文件。佢哋過時唔係「文件唔靚」——係**下一個 session 會用錯前提開始工作**。2026-07-31 實測:§9 一直寫住「`apps/web` = placeholder、auth guard 未做、module C/D 未做」,而嗰陣全部早就交付咗;`SESSION_SUMMARY` 甚至寫住「本 worktree 冇 `apps/api/.env`」(嗰個係另一個 worktree 嘅 note),會令下手以為做唔到 live 驗證。

---

## Appendix: Quick Reference Card

```
Unified Operation Platform — Strict Mode
├─ Baseline (§1): think → simple → surgical → goal
│  └─ §1.5 subagent: 自行判斷可以(standing auth)· 唔好開嚟驗自己啱啱做完嘅嘢 · 唔好過度 fan out
├─ Platform spec: docs/architecture.md
├─ Module 1 (LicenseOps): docs/02-architecture/licenseops/DESIGN.md
├─ Design system: docs/02-architecture/design-system.md (視覺真相 design_handoff_licenseops/)
├─ Monorepo: apps/api (NestJS) + apps/web (React) — ADR-0001
├─ Stack: NestJS+Prisma+Postgres · Redis/BullMQ · Graph+ServiceNow · React/shadcn(FE)
├─ Hard Constraints (STOP+ask on trigger):
│  ├─ H1 Architectural change      H2 Vendor/dep lock
│  ├─ H3 Scope/Tier boundary       H4 Security/PII
│  ├─ H5 Test coverage (critical path)
│  ├─ H6 Design fidelity (token-only, 1 primary/view, lucide, light+dark)
│  ├─ H7 Tool-result integrity (唔作 tool 輸出 · send tool 即收口 · 結果 trace 真 output)
│  └─ H8 Tool-usage discipline (讀檔/搜尋用 Read/Grep/Glob 唔用 bash cat/grep · 唔 echo 拼裝 · 單一重定向)
└─ When in doubt: ask, don't guess · skuId not name · sync gate before assign · UI: token 唔 eyeball
```

---

**End of CLAUDE.md** · Version 1.2 · Owner: Chris Lai
