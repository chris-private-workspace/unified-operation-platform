# W47 — Agent Registry · Checklist

> 由 `plan.md` derive。🟢 **plan `status: active`(Chris 2026-08-17 approve,四條 OQ 全答)**。
> 每項做完即勾 + 寫 `progress.md` Day-N(R2)。

## `F0` — 開工前(唔使 approve 都做得)

- [x] F0-1 掃 phase 號 —— `git fetch --all` + 掃晒所有 remote branch(PROCESS §2.1,有兩個 W36 撞過嘅實例)⇒ 最大 **W46**,揀 **W47**
- [x] F0-2 由 `origin/main` 開 `feat/w47-agent-registry`(`125ab50`,已含部署 #9 / #9b)
- [x] F0-3 確認 W46 前置真收 —— `A1`(container log `25 migrations found` → 三個 W46 migration 逐個 applied)· `B6`(`POST /agent/runs` **201** + SSE **200** `text/event-stream`)· DEV OpenAPI 三個 agent path 都喺
- [x] F0-4 🟢 **四條 OQ 2026-08-17 全部答齊,plan `draft → active`** —— `OQ-A` ADMIN only · `OQ-B` 獨立 route `/agent` · `OQ-C` 改 prompt 入 audit · `OQ-D` 舊 run 顯示「(W47 之前)」唔隱藏

## `F1` — `AgentProfile` model + migration(H1)

- [x] F1-1 ✅ `AgentProfile` model(`principalId` / `name` / `model` / `prompt?` / `active`,`@@unique([principalId, name])`)—— 三段 `///` 註釋寫低咗**點解係另一個 model 唔係加欄**,同埋 `prompt` 個 `R1` 三道防線
- [x] F1-2 ✅ `AgentRun.profileId String?` + `@@index([profileId])` —— **nullable 而且會長期 nullable**:W47 之前開嘅 run 冇 profile,追溯 back-fill 就係聲稱一件冇發生過嘅事
- [x] F1-3 ✅ migration 生成 + 對本機真 DB 跑(Chris 2026-08-17 批准停 `ai-doc-extraction-db`)。**SQL 純 additive,零 DROP**;落 DB 對過真結構(8 個欄 · `prompt` nullable · `AgentRun.profileId` nullable)。🔴 **生成之後揾到一個同 `F2-3` 打交嘅位**:Prisma 對 optional relation 預設 `ON DELETE SET NULL` ⇒ 一個直接落 DB 嘅 delete 會把「呢個 run 用邊個 profile 跑」**一次過**變成 unknown,冇任何錯誤 —— 而 `F2-3` 存在嘅理由正正係保住嗰個答案。改成 **`onDelete: Restrict`**,兩個 fkey 落 DB 實測都係 `RESTRICT`
- [x] F1-4 ✅ **唔係 plan 寫嗰個「default profile」,因為佢落唔到手** —— `AgentPrincipal` 係第一次 run 先 lazy 建,而 `runtime` 欄明文只准係 provider 實際 boot 嗰個(BUG-011)⇒ seed 冇 provider,唔可以捏造嗰行。改成**一次性遷移**:principal 已存在 **兼且** 零 profile 先做,model 由 `ConnectorConfig.agentModel → AGENT_MODEL`(同兩個 provider `resolveModel()` 同源),冇配置就唔種。用 **model 做 profile 名**(叫「Default」會宣稱一個 registry 刻意冇嘅地位)。實測種咗 `gpt-5.6-luna`,第二次跑 `left alone`
- [x] F1-5 ✅ **G2 嘅 test** —— `profileId = null` 嘅舊 run 讀得返(`profileId` / `profile` 兩個都係 `null` 而唔係爆);順帶釘住 **run 回應永遠唔 select `prompt`**(8000 字,屬 registry 畫面)
- [ ] F1-6 DEV migration(部署之後)

## `F2` — Profile CRUD

- [x] F2-1 ✅ `AgentProfileService`(list / create / update / **`resolveForRun`**)
- [x] F2-2 ✅ `GET/POST/PATCH /agent/profiles`,**`@Roles(ADMIN)`**(`OQ-A`)
- [x] F2-3 ✅ **冇 DELETE** —— 只 `active=false`(`R3`:歷史 run 指住佢講「當時用咩跑」,呢個答案要捱得住有人執嗰張列表)
- [x] F2-4 ✅ 名重複 → **409**(narrow 咗 `P2002`,**其餘錯誤原封 rethrow** —— 把任意失敗報成「個名撞咗」係講大話,INC-001 就係呢個代價)· DTO `@IsNotEmpty` + `@MaxLength`
- [x] F2-5 🟢🟢 **drift test 真係捉到我** —— 加完 controller 跑 full suite,`permissions.spec.ts` 兩條即刻紅:「discovers every controller」同 snapshot。**呢個係第三次一個 agent write surface 被矩陣捉到而唔係被 review 捉到**。已加入鎖定矩陣(帶理由,唔係淨係加個名)+ 更新 snapshot,實測三條路由全部 `roles [ADMIN]`
- [x] F2-6 🔴 ✅ 改 `prompt` **入 audit `before`/`after`** —— `AUDIT_ACTIONS` 加 `AGENT_PROFILE_CREATE` / `_UPDATE`,`AuditTargetType` 加 `AgentProfile`,whitelist `['name','model','prompt','active']`。🔴 **whitelist 註釋明文講咗點解唔算重開 transcript 嗰個決定**(model 生成 vs 人寫嘅配置)。⚠️ **no-op PATCH 唔寫 audit**(`auditDiff`)—— 否則 `R1` 靠嗰條 query 會被冇改過嘢嘅 edit 塞爆
- [x] F2-7 ✅ controller spec —— **第一次跑就揾到一個真缺口**:`list()` join 咗 `principal: { name }` 送落去,而 `AgentProfileDto` 由頭到尾冇宣告過佢 ⇒ 照 OpenAPI 寫嘅前端會以為冇呢個欄。**同 BUG-011 同一條縫,方向相反**(嗰次係 controller 漏送 read-model 有嘅欄)。兩邊 key 都 typed(`keyof typeof PROFILE_SELECT` vs `keyof AgentProfileDto`)⇒ 任何一邊加欄都 compile 唔到。順帶釘住 query string → boolean 嘅轉換(service 結構上見唔到字串)

## `F3` — 啟動 run 揀 profile

- [x] F3-1 ✅ `StartAgentRunDto` 加 `profileId?`(controller spec 釘住佢真係傳到落去 —— 掉咗個值嘅版本會照樣開得成 run、成功、有紀錄,**只係跑咗一個冇人揀嘅 model**,冇一個畫面睇得出)
- [x] F3-2 ✅ 唔送 → `resolveForRun`(**冇 default 概念**,見 §8 changelog 第 2 條)
- [x] F3-3 ✅ inactive / 唔存在 / 屬另一個 principal → **400**。🔴 **refusal 一定要喺 row 建之前**:OQ-3 只准一張 request 有一個非 terminal run,refusal 留低一行 `running` 就會**永久封死**嗰張 request —— 即 期二 `G5-A` 嗰個形狀第三次由另一道門入嚟。已有一條 test 專門 assert 「refuse 咗冇建 row」
- [x] F3-4 ✅ `AgentRun.profileId` 寫低 + `GET /agent/runs/:id` 出 `profileId` / `profile{id,name,model}`(**冇 `prompt`**)
- [x] F3-5 ✅ model 由 profile 經 **`AgentSetup.model`(required)** 落 adapter,兩個 adapter 唔再自己 `resolveModel()`。⚠️ **三個 `AZURE_OPENAI_*` 缺一即 503 一個字冇改**(`buildAzureClient` 冇郁)。🔴 **順帶清走兩個 adapter 個 `ConnectorConfigService`** —— 留住一個「攞得到 config」嘅 adapter,隨時攞返嚟用,到時畫面講一個 model、run 用另一個,冇一處紅。⚠️ **保留一條相容路 `modelForLegacyRun`**:部署嗰刻卡喺 `awaiting_approval` 嘅 run 冇 profile,喺嗰度 refuse 就係再造一次 `G5-A`
- [x] F3-6 ✅ falsification ×4 真跑真紅:①拆 cross-principal guard → 1 紅 ②profile model 唔用 → 33 紅(**太粗,紅嘅原因係 503 唔係揀錯 model**)③profile prompt 唔用 → **1 紅零誤傷** ④加返 banned import → 1 紅。全部還原後真跑過
- [x] F3-7 🔴 **兩條我自己寫嘅 test 係假嘅** —— 「assert adapter 冇 call `connectorConfig.resolve`」,但 adapter 而家連收都唔收嗰個 service ⇒ **一條對住唔存在嘅協作者嘅 assert,結構上冇可能紅**。改咗去 `agent.boundary.spec.ts` 用 import ban;而**嗰條 ban 第一版又即刻紅咗** —— 紅喺兩個 adapter 解釋自己點解唔再用佢嗰段註釋度。**一條「檔案寫低自己守規矩就會犯規」嘅 ban,唔係喺度執行佢講嗰條規矩**。收窄到 import 本身

## `F4` — 全域 run 列表

- [x] F4-1 ✅ `GET /agent/runs?status=&profileId=&since=&limit=&cursor=`。⚠️ **呢條路本來係「一張 request 最近嗰個 run」,搬咗去 `/agent/runs/latest`** —— 另一條路係同一個 URL 睇有冇 `requestId` 分流,即一條 endpoint 兩個 response shape,OpenAPI 描述唔到。得一個 caller,一齊搬。**`@Get('latest')` 一定要宣告喺 `@Get(':id')` 之前**
- [x] F4-2 🔴 ✅ **但同 plan 寫嗰句唔同,而 plan 嗰句係錯嘅**(見 §8 changelog 第 3 條)—— 可見性跟 `getRun`(run 嗰張 request 嘅 OpCo),唔跟啟動者。⚠️ 亦揾到 `request: { is: … }` **只可以喺有 scope 嗰陣加**:Prisma 對 nullable relation 落任何 filter(即使空)都會要求 relation 存在 ⇒ 無條件加就會靜靜令 ADMIN 睇唔到冇 request 嘅 run
- [x] F4-3 ✅ cursor + `skip: 1` + `take: limit + 1` 探下一頁;limit 上限 **DTO 同 service 各夾一次**。⚠️ orderBy 要有 **`id` tiebreak** —— 兩個 run 可以同一毫秒開,order 唔穩定就會喺頁邊界跳行或者重複,而佢淨係喺有負載嗰陣出現、永遠 reproduce 唔到
- [x] F4-4 ✅ `runState` 唔出 wire —— 列表係最易漏嘅位,因為**冇人會讀一個列表回應**
- [x] F4-5 ✅ 每個 param 一條;另加「冇送嘅 filter 唔可以以 `undefined` 形式留喺 where」(對 Prisma 一樣,對讀嘅人唔一樣,而 `profileId: undefined` 距離 `profileId: null` 只差一次 refactor,而後者意思完全唔同)
- [x] F4-6 ✅ falsification:拆走 scope filter → **1 紅零誤傷**,還原後真跑
- [x] F4-7 🟢🟢 **W28 drift test 第四次捉到我** —— 新 route `GET /agent/runs/latest` 令鎖定矩陣紅。確認佢繼承 class-level `@Roles` 之後更新,diff **一行、零其他改動**

## `F5` — 管理 UI(H6)

- [x] F5-1 ✅ route `/agent` + sidebar entry(**自己一個 predicate `canManageAgentProfiles`**,唔借 `canSeeAdminNav` —— 跟 `roles.ts` 自己嘅慣例:「開唔開得 admin console」同「改唔改得每個未來 run 用邊個 model」係兩條問題)
- [x] F5-2 ✅ profile 表 + create / edit dialog(plain `useState` + `validateProfileForm` 純函數,跟 `users-panel` 先例)。🔴 **`prompt` 睇得到改唔到 —— H6 STOP,未批**(見下 `F5-8`)
- [x] F5-3 ✅ run 列表(時間 / 狀態 / profile / request · 狀態 + profile 兩個篩選 · cursor 分頁)。⚠️ **filter 一改就要清 cursor** —— 舊 cursor 指向一個唔再存在嘅結果集,而個症狀似壞資料唔似 bug
- [x] F5-4 ✅ 舊 run 顯示「Before W47」**唔隱藏**(`OQ-D`)—— 真 render 驗到:本機 3 個 W46 run **三個都顯示咗**
- [x] F5-5 ✅ DS-5(model / 時間 / requestId / 頁碼 mono;profile **名**唔係識別碼 ⇒ sans)· DS-3(一個 primary,**有 test 數住 `bg-accent` 只得一個**)· DS-8(6 個既有 tone,零新色)
- [x] F5-6 ✅ `ui-design` 逐條答過 —— 12 條入面 **DS-11 一開始係 ❌**(prototype 冇呢個畫面)⇒ 補咗入 `design-system.md §6` owner-approved 表
- [x] F5-7 ✅ light + dark 真 render(用 W46 committed 嗰個 `render-check.mjs`,唔再靠 session 有咩瀏覽器工具):token 真 swap(`#f5f5f6`→`#08080a` · accent `#E60027`→`#ff3355`)· **零橫向溢出**(scrollWidth = clientWidth = 1440)· 真數據
- [x] F5-8 🟢🟢 **H6 STOP 解封 —— Chris 2026-08-17 批咗 `Textarea`**,已加入 `design-system.md §2`(**本系統第一個唔係由 handoff spec 重建出嚟嘅 primitive**,所以約束寫得特別死:每個值由 `Input` 抄 · 只有三樣刻意唔同 · **`resize-y` 唔可以係 `resize`** —— 水平 resize 容許用戶由元件內部把自己拉闊過個 dialog,即打破成個 console 唯一嗰條 layout 硬規矩,而冇任何一行 code 改動可以賴)。`prompt` 而家改得,**空 = `null` 唔係 `''`**(送 `''` 會令 row 話有 prompt 而行為係內建 ⇒ 個表會為一個跑緊內建指示嘅 profile 顯示「Custom」,一個畫面同自己講唔埋)
- [x] F5-10 ✅ **API DTO 補返 `prompt?: string | null`** —— `@IsOptional()` 一路都收 null,只係 OpenAPI 冇講 ⇒ **同 `F2-7` 揾到嗰個契約缺口同族,喺 request 側**
- [x] F5-11 🔴 **揾到一個真 a11y 缺陷,而佢係我由 `users-panel` 抄過嚟嘅**:`Field` 個 `<label>` 同 control 冇關聯(冇 `htmlFor`)⇒ 撳 label 唔會 focus,screen reader 讀到一個冇名嘅輸入框。改成 `<label>` **包住** control。⚠️ **hint 要放喺 label 外面** —— 包住嘅 label 入面所有嘢都會變成 accessible name,而個 hint 帶住字數,即係話個 field 個名會每打一個字變一次。**兩個問題都係一條 test 揾唔到 field 先浮出嚟,唔係 review**
- [x] F5-9 ⚠️ **render 揾到兩件唔喺本單修嘅事**:①header 個 primary 掣掉咗落標題下面 —— 根因係 `Card` 有自己一個 body wrapper,落 `className` 嘅 flex 包唔到 children,而 **`/audit` 一模一樣**(render 對比過)⇒ 既有樣式,唔單方面改 ②dark 之下 `IconButton` 個 pencil 對比偏弱(既有 primitive)

## `F6` — Gate

- [x] F6-1 ✅ root `npm test` exit 0 —— api **1410 / 94 suites** · web **449 / 44**。🔴 **第一次跑紅咗一條同我無關嘅 test**:`requests.new-request-flag.test.tsx` render 成個 router,而我加咗 `/agent` 落去 ⇒ parallel run 5009ms 撞爆 5s,**單獨跑 1512ms 綠**。⚠️ **嗰個檔早就記錄過同一件事一次**(當時靠拆 loader 買 margin)⇒ 第二次唔應該再買,改成 per-test budget + 註釋講明呢個成本會隨 app 增長
- [x] F6-2 ✅ root `npm run lint` exit 0
- [x] F6-3 ✅ root `npm run build` exit 0
- [x] F6-4 ✅ `agent.boundary.spec.ts` 全綠 —— 兼且**多咗一條**:兩個 adapter 唔准 import `ConnectorConfigService`(`F3-7`)
- [x] F6-5 ✅ falsification **五次**逐個真跑真紅,每次還原後真跑:①cross-principal guard ②profile model ③profile prompt ④banned import ⑤list scope filter

## `F7` — Live 驗

- [ ] F7-1 本機:兩個 profile(唔同 model)各跑一個 run,列表分得開
- [ ] F7-2 DEV:migration + 列表
- [ ] F7-3 ⚠️ **唔可以睇 revision status 當證據** —— entrypoint 令 migrate 失敗 NON-FATAL

## `F8` — 收尾

- [ ] F8-1 `plan.md` acceptance 逐條掃(**W46 教訓:呢張表由頭到尾冇更新過**)
- [ ] F8-2 progress retro
- [x] F8-3 ✅ 六條入咗 `RISK_REGISTER.md` 做 **`R26`–`R31`**(2026-08-17,提早做咗唔等收尾)。`R6`(邊個改 profile)已答 ⇒ 冇入,佢係 plan OQ 唔係 risk。🔴 **`R28` 寫嗰陣先睇清一件事:`onDelete: Restrict` 擋到「刪」但擋唔到「改」** —— profile 係 mutable,所以 `AgentRun.profileId` 答到「用邊個 profile」但答唔到「嗰一刻佢係咩 model」。要真答就要喺 `AgentRun` 存 model snapshot = schema 改動(**H1,未開單**)
- [ ] F8-4 `BACKLOG.md` 同步(R7)
- [ ] F8-5 `CLAUDE.md §0` + `SESSION_SUMMARY.md` doc-sync(§14:**佢哋過時 = 下個 session 用錯前提開始**)
