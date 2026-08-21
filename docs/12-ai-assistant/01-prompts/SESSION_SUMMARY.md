# Unified Operation Platform — Session Summary(SessionStart hook 自動注入 · slim)

> **角色**:精簡即時摘要,由 SessionStart hook 每 session 自動注入。詳版 → `session-start.md`;憲法 → `CLAUDE.md`。
> 此處只補當前座標 + runtime 實況。**維護**:每個 phase closeout doc-sync 一併更新。

**身份**:Unified Operation Platform,spec `docs/architecture.md`,IT operation / support 管理 + 操作平台(逐步引入 AI);第一個模組 LicenseOps(M365 onboarding license 履行)。

## 🟢🟢 **DEV 而家跑 `dev-7dc3811`(部署 #15,2026-08-21)—— `BUG-012` 上咗;`main` = `7dc3811`,DEV 同 `main` 同步**

`BUG-012` 一日收晒(開單 → triage → 修 → render → 部署 → DEV 實物驗),PR #142 merged,
零 open PR,本地同 remote 都淨返 `main`。

### 🔴 三件會影響你開工前提嘅事

**① `A3` 出現,推論唔到 DEV profile 狀態。**
Chris 撳 `Run AI Assist` 得到 `This request has no free-text wording for AI-Assist to
read`。⚠️ **唔好由此推「DEV 有 active profile」** —— `assertHasText` 喺
`ai-assist.service.ts:150`,而 `resolveForRun`(profile 三條 400)喺 `:258` ⇒ 執行**停咗
喺文字檢查**,後面嗰三條閘**由頭到尾冇跑過**。「DEV 有冇 active profile」**今日仍然冇答案**
(部署 #12 收工紀錄寫住三個全部 `active: false`,而嗰個係紀錄唔係實測)。
📌 同「`sync-check` 返 `FOUND` 證明唔到個 user 存在」同族。

**② 一個假設標唔標明「未驗」,後果差一整輪白做。**
我開單時寫「**A1(零 active profile)嫌疑最大**」—— **估錯咗**。🟢 但同時寫咗「呢個係
紀錄唔係當日實測,唔可以當答案」⇒ 冇去開 profile。**當咗事實嘅話,開完之後個 400 照出。**

**③ 新 RISK `R38`** —— 「一個失敗訊息可以由 server 一路傳到前端,然後死喺一條冇人行得到
嘅路上,而每一層 test 都係綠」。累計**五次**(W45 `apiPatch` · `BUG-011` · CH-032 ·
CH-035 · BUG-012)。⇒ **新 mutation 落地時,「失敗點樣顯示」係 deliverable 唔係 polish**,
而且要問:**觸發佢嗰個掣,同顯示 error 嗰段 JSX,喺唔喺同一個 render 分支?**

### ⚠️ 部署 #15 兩樣要記

- **api 側今次結構上冇獨立證據** —— 零 api 改動 ⇒「`api-json` 一樣」同時符合新舊 revision。
  只有 ARM image 欄 + 「同一次 PATCH,web 側 rollout 已證」。**同 #12「零 migration 令判準
  失效」同族,今次係零改動令『上咗機』冇得驗** —— 改動越細,證明佢上咗機越難。
- **兩個數字同 #14 記載對唔上,而我冇解釋(刻意唔編)**:`api-json` #14 寫 90,596,本次
  三次都量到 **90,349**;#14 寫 image vs live js length 差 452,本次**兩邊完全一樣**
  (286,515)。已排除量度不穩(`whoFixes` schema 確實在)。結論唔受影響,因為 baseline
  同驗證兩邊用同一量法。

⬇️ **以下係部署 #15 之前寫嘅** ⬇️

## 🟢🟢 **DEV 而家跑 `dev-4a92be0`(部署 #14,2026-08-21)—— CH-034 + CH-035 都上咗**

api / web 兩個 `PATCH exit 0`,infra 配嘅 custom domain · `external` · workload profile
全部完好。**DEV 同 `main` 而家同步。**

🔴🔴 **本次一個教訓值得你開工之前讀:一個假 marker,而佢係我哋自己寫落交接文件嗰個。**
CH-034 收單文件同**呢份 SESSION_SUMMARY 上一版**都寫住「marker 只可能喺 CSS
(`self-start`)」。開工一驗:`self-start` 喺舊版 **四個檔已經用緊** ⇒ Tailwind 一早生成咗
`.self-start` ⇒ `×0 → ×1` **結構上冇可能成立**。改用 `max-w-full`(舊版**零檔**)先得。
📌 **一份交接文件推薦嘅 marker,同一個外人推薦嘅,一樣要驗**(#12 嗰條規矩嘅新版本)。
🟢 **順帶一句公道說話**:CH-034 個 checklist 當時寫嘅係「`self-start` 舊版有冇**要驗**」而
唔係「就係佢」—— **寫「要驗」呢個習慣今次真係擋咗一次**。

⚠️ **另外兩個假 marker**:①`whoFixes` 舊版 `api-json` 已經出現 **2 次**(來自 `AgentStepDto`)
⇒ 改用 schema-level ②`WHO_FIXES` 五句搬咗檔但 **bundle 總數一個字冇變**。

⬇️ **以下係部署 #14 之前寫嘅** ⬇️

## 🔴 **三件會令你用錯前提嘅事(2026-08-21)**

**① 🟢🟢 本機 `apps/api/.env` 而家有齊 `AZURE_OPENAI_*` ⇒ agent 真跑得掂。**
2026-08-21 Chris 批准由 `orca/workspaces/…/ai-agent` worktree 抄咗三個 key 過嚟
(`ENDPOINT` / `API_KEY` / `API_VERSION`)。實測開一條 thread 送一句 ⇒ run
`completed` **9.5 秒**兼有 assistant turn。⚠️ **副作用**:「run 失敗」呢個狀態喺本機
**自然重現唔到咗**,要驗就要 `page.route` 注入。
⚠️ **冇抄** `AGENT_RUNTIME`(佢行 DB-first,擺 env fallback 會同 Integrations panel
靜靜競爭)· `ANTHROPIC_API_KEY`(實測係空值)。

**② 🔴 CLAUDE.md §9 嗰句「憑證唔喺 repo ⇒ 要 Chris 自己 `az login`」已經更正 ——
佢錯咗十日。** 部署 SP 憑證一直就喺 `apps/api/.env`(`azure_client_id` 前綴逐字
`d2f094a3` = 嗰個部署 SP,`azure_secret` 非空)。根因:08-10 個 grep pattern 係
`^[A-Z_0-9]+=` **只 match 大寫**,而嗰 11 個 key **全部細楷**。`.env` 實際 **28 個 key
唔係 17 個**。⚠️ 但**「憑證喺度」≠「login 得到」** —— 冇人真跑過
`az login --service-principal`。

**③ 🟢🟢 最新係 `CH-035 run 失敗要講出嚟`(2026-08-21,`status: done`)—— 🚧 未上 DEV。**
`/assistant` 同 dock 兩個 chat 面而家講得出「run 停咗」+ `whoFixes`(ADR-0029 受控字彙,
唔顯示 raw error)。api **1495 / 98** · web **577 / 51**。
🔴 **三個最貴嘅教訓**:①**`get()` 成功路徑喺 api 側從來冇 test 行過** —— 新 `runs.map` 落
一個冇 `runs` 嘅 mock,整個 suite 仍然 44/44 綠(現有 `it.each` 只測 Forbidden,喺
`assertOwner` 就 return)②**一條 test 可以自己證明唔到自己** —— 兩條 assert 排住,拆走
branch 之後第一條就紅、第二條冇跑過 ③🔴 **render probe 唔一定係唯讀** —— `li button` 每個
`<li>` 有**兩個**(open + archive),我個「逐個撳」loop 誤 archive 咗兩條 thread(已還原);
揭穿佢嘅係 **`rows=30` 而 API 得 15 條**呢個對唔上嘅數字。

⬇️ **以下係之前嘅座標** ⬇️

**🟢🟢 `CH-034 request header 收窄`(2026-08-20,`status: done`)—— 🚧 DEV 仲未有佢
(同 CH-035 一齊等部署 #14)。** sync gate 由 Card 底部全寬一行,搬入左欄 · 收窄 · 同 Avatar 對齊。
實測 gate 由撐滿(≈1144)變 **780 / 789**;`gateLeft` = `avatarLeft` = `leftColLeft`
= `avatarRowLeft` **四個全部 289**。web **564 / 50**(+2)。

🔴 **三個教訓:**

**① 兩個 class 做晒成件事,而其中一個唔加就靜靜失效。** 冇 `self-start`,flex column
預設 stretch ⇒ box 照樣撐滿、`ml-auto` 照樣把狀態飛去最右 —— **即係改咗等於冇改,
而畫面唔會報錯**。冇 `max-w-full`,兩個 gate 未開嗰陣多咗兩個掣就會撐闊成張 card。
⇒ test 分別守住兩個。

**② `ml-auto` 刻意唔刪。** 直覺係「收窄咗就唔需要」,但佢**只喺有剩餘空間先推得動**
⇒ 今日刪唔刪一模一樣。🟢 而 render 實測 **wrapped 狀態下佢真係做緊嘢**(兩個掣右對齊)
⇒ 刪咗係「今日冇分別、將來有分別」嘅改動。

**③🔴🔴 render probe 報咗一個唔存在嘅缺陷,而揭穿佢嘅唔係座標,係身份。**
`G3` 第一次跑 **`FAIL`**(gate `left: 289` vs `avatarLeft: 248`),而 **code 係啱嘅** ——
`248` 正正係 sidebar 寬度,即我由 `h1` 行三層 `parentElement` **行過咗頭**,量咗 main 區。
🔎 決定性嘅係加印 **`avatarClass` / `avatarWidth`** —— 見到 `44`(逐格等於 code 入面
`size={44}`)先確定今次真係揾到 Avatar。
📌 **幾何 probe 一定要連「你量緊邊個 element」一齊印**,否則一個錯 element 會報一個
唔存在嘅缺陷,而你會去改一段本身完全冇問題嘅 code。同 CH-033 嗰個「probe 問錯問題」
同族,但機制唔同:**嗰次係問錯問題,今次係瞄準錯 element。**

🔴 **falsification 道 1 紅喺負面 assert 嗰半** —— 冇咗
`not.toContain('Onboarding request')`,「由 `h1` 行上去揾到一個同時包住 gate 嘅
ancestor」對 **Card 同 `<body>` 都成立** ⇒ 整條 test 會靜靜綠。

⬇️ **以下係 CH-034 之前嘅座標** ⬇️

**🟢🟢 DEV 而家跑 `dev-9053bcd`(部署 #13,2026-08-20)—— 含 CH-032 + CH-033
(⚠️ **唔含 CH-034**)。**
api `--0000016` / web `--0000012`。infra 配嘅 custom domain · `external` ·
workload profile 全部完好。

🔴🔴 **本次帶咗一個方法轉變,下次部署直接用得着:marker 由「有冇」變「幾多次」。**
#12 學到「一個字串要做 marker,先要驗佢喺舊版真係冇」;今次一驗就發現 **CH-032 三句
喺舊版全部存在,而且係設計使然** —— `D2` 就係「**逐字抄 dock**」⇒ **「有冇出現」呢個
維度結構上冇可能有答案**。改用**次數**:dock 一次 + `/assistant` 一次 ⇒ 舊 ×1 新 ×2,
**部署之前先由 live bundle 攞 baseline**。實測四個 marker 全部 `×1 → ×2`。

🔴 **CH-033 一個新字串都冇**(純 class + 版面)⇒ **唯一 bundle 證據喺 CSS**:
`.lg\:grid-cols-2` 由 **×0 → ×1**。📌 **一單「純版面」改動,證據唔會喺 JS。**

🟢 **五條證據冇一條靠 revision status**:live asset 名逐字 = image 內部 `docker cp`
抽出嗰個(連 `js length 285165` 都對)· #12 個 bundle **404** · 兩組 marker ·
`api-json` **90,341 B 同 #12 逐 byte 一致**(正面印證零後端改動)· vendor chunk hash
同 #12 一樣 ⇒ 對得返「零新 dep」。

🟢 **`-Send` 前個 masking 檢查做深咗一層**:唔止睇 output 有冇 `<len N>`,而係**由
params 逐個讀返真值,再問 output 有冇 `Contains` 佢** ⇒ `leaks = 0`。
📌 **「睇落 masked」同「真值唔喺入面」係兩件事**,而後者先係 H4 要嘅。

⚠️ **兩樣冇做:**
① **live 行為驗證(睇實物)交返 Chris 人手** —— AI 側刻意唔喺瀏覽器打 break-glass
密碼(H4)⇒ **收咗嘅係「code 上咗機」,唔係「畫面睇落啱」**(沿用 `CH-015` 先例)。
② **`R35` 最後一條未驗嘅路(api 返唔到嚟)照樣未驗** —— Chris 決定唔做 scale-to-0。

⬇️ **以下係部署 #13 之前嘅座標** ⬇️

**🟢🟢 `CH-033 request detail 版面`(2026-08-20,`status: done`)。**
`G1`–`G8` 八條全 ✅。**交付**:ticket reference 三個字級各升一級 ·
**Line items / Operational history / AI Assist 三等分並排** ·
`Request remark` 提出 grid full width · `mayUseAgent` 為假 ⇒ `lg:grid-cols-2`。
**零 schema · 零 API · 零新 token · 零 ADR**;web **562 / 50**(+7)。

🔴 **四個教訓,每個都會再撞:**

**①「版面唔啱」嘅報告,可能係「有樣嘢你從來冇見過」。** Chris 話「想三個並排」,而
Line items 同 Operational history **一早已經並排**;佢見唔到 AI Assist,係因為佢喺
history **下面**(render 實測 `top: 516`,另一張單 `747`)。

**② 兩份註釋互相矛盾咗一段時間,而冇嘢會紅。** `request-detail.tsx` 寫住「AI Assist
係 body 得個 Coming soon 嘅空 card」,而 `ai-assist-card.tsx:39` 自己寫住 W46 `F8`
**早就換走咗**。🟢 查咗先講得出本單**唔算推翻 CH-030 `F4`** —— `F4` 反對嘅係「空 card
霸住頂,把 timeline 推落 fold」,三等分之後兩個都喺 fold 之上。📌 **一個決定嘅理由
過時,同一個決定被推翻,係兩件事**(只有前者唔使重新拍板)。

**③🔴🔴 一條 assert 排喺另一條後面,可以令佢由「守衛」變成「複述」。**
`G1` 本來寫成一條 test:先 `toEqual(['12','12.5','11.5'])`,再 loop 查每個值喺唔喺
`typography.css`。⚠️ **`toEqual` 一過三個值就釘死 ⇒ 個 loop 冇可能紅。** 拆做兩條之後,
falsification(把 label 改成 `13px`)得出 **`13px is not in typography.css`** ——
**refactor 之前結構上出唔到**。同 W47 `F3-6` 同族,但機制係「前面嗰條已經把答案定死」。

**④ render probe 要自己判 pass/fail,唔可以淨係印數字畀人肉對。** 「三個 panel 並排」
正正係嗰種**兩個啱咗就睇落似成功**嘅 claim。加咗 verdict 之後 falsification 得出
`G2: FAIL` · `tops [362, 362, **562**]` · `widths [**757**, 371, 371]` ⇒ 證到 probe
唔係 tautology。

⚠️ **一個樣本機驗唔到**:Chris 睇嗰張 `REQ0044105` **冇 agent run**,而本機三張單
**全部有** ⇒「`No run yet` 佔一整欄」個樣要喺 DEV 先睇到。

⬇️ **以下係 CH-033 之前嘅座標** ⬇️

**🟢🟢 `CH-032 /assistant honesty`(2026-08-20,`status: done`,
已 merge 落 `main` —— PR #134)。**
`G1`–`G7` 七條全 ✅ —— 批 + 實作 + test + falsification + light/dark render **一日做完**。

🔴 **「已 merge」逐個驗過**,唔係睇 PR state:兩個 commit `--is-ancestor` 都 `IN` ·
`origin/main..branch` **= 0** · `git cherry` 零 `+` 行。branch **兩邊都刪咗** ⇒
**本地同 remote 而家都淨返 `main`,零 open PR**。
🟢 **順帶一步值得抄**:`git diff <跑過 gate 嗰個 commit> <merge commit>` **空**
⇒ 我測嗰棵樹**就係** `main` 而家棵樹 —— 唔使靠「應該冇變啩」,正正答返 W47 嗰個
「一個勾咗嘅 gate 唔等於佢蓋住咗今日棵樹」。

⚠️ **DEV 因此落後 `main` 一個 CH** —— DEV 跑緊 `dev-04f3c86`(= W49)。

| | |
|---|---|
| 交付 | ①「一句話蓋兩件事」拆成兩句 ②補返 dock 早有嘅 disconnected banner + `Reconnect` ③`forbidden` 補 `profiles.error` |
| 性質 | **零 schema · 零 migration · 零新 endpoint · 零新 dep · 零新 token · 零新 primitive · 零新 icon · 零 ADR**(純前端,一個檔) |
| gate | api **1491 / 98**(冇掂後端)· web **555 / 49**(**+8** 條)· lint 0 · build 0 |
| 剩低 | 🚧 **DEV live 唔喺本單 acceptance**,留下次部署;⚠️ banner 喺 DEV **平時唔會出**(#12 實測 3.2 秒自動重連) |

🟢🟢 **`RISK R35` 由 🟡 Partial 收成 🟢** —— 三個未完項(DEV 側 · heartbeat coupling ·
`/assistant`)**2026-08-20 同日收齊**。

🔴 **三個方法論教訓,每個都會再撞:**

**①「逐字抄」揭到一個冇人見過嘅差異。** `D2` 本來只係防漂移,一擺埋一齊先發現 dock
嗰句係**兩截**(`… An admin can turn one on under Agent.`)而 `/assistant` 只有頭半截
⇒ **「邊個可以整返掂」由頭到尾冇講過**,而**兩邊都「有文案」,所以任何「呢度有冇字」
嘅檢查都會話 OK**。📌 兩句「差唔多」嘅文案,要**逐字擺埋一齊**先睇得出邊句蝕底。

**② falsification 道 2 刻意拆 dock,唔拆 `assistant.tsx`。** 咁 `/assistant` 行為一個字
冇變,剩返嗰條紅**只可能**嚟自跨檔比對 ⇒ 真證到 tautology 冇發生。**如果四道都拆同一個
檔,`G2` 每次都紅,而「佢究竟有冇真係讀第二個檔」由頭到尾冇驗過** —— 四道全紅睇落好
安心,而最關鍵嗰條問題冇問過。

**③ 一個 probe 可以樣樣做齊,但問錯咗問題。** `D3` 第一版寫
`banner.closest('.overflow-y-auto')` 返 **`true`**,睇落即係「banner 喺 scroll 區入面
⇒ D3 唔成立」;實際上嗰個 scroller 係 **`AppShell` main 區**,而**頁面每個 element 都
喺佢入面** ⇒ 個 assert **結構上冇可能返 false**。揭穿佢嘅係同一份 report 入面
`transcriptTop: 56` —— 一個「兩張 card 之下嘅面板」唔可能由第 56 px 開始。改問
`transcript.contains(banner)` 之後:`contains: false` · `bannerIsBefore: true` ·
banner `bottom` **逐格等於** `transcriptTop` `362.25`。

💡 **一個可以直接抄嘅手法:render 一個「只喺失敗時先出」嘅 UI,唔使殺 api。**
`page.route('**/agent/conversations/*/events', r => r.abort())` 幾秒逼爆
`MAX_CONSECUTIVE_FAILURES`,而**其餘每條 query 照常答** —— 正正就係 banner 存在嗰個
狀態(內容喺畫面、live 更新唔喺)。committed 嘅 `render-check.mjs` 做唔到呢個。

⬇️ **以下係 CH-032 之前嘅座標** ⬇️

**🟢🟢 W49 `agent-dock`(Tier 2 `T2-d`)2026-08-20 merge 咗(PR #127,merge commit
`04f3c86`)兼且 phase `closed` —— G1–G7 全 ✅。**

| | |
|---|---|
| 交付 | `Drawer` primitive(**本系統第二個新 primitive**,H6 STOP → Chris 批,七條約束入 `design-system.md §2`)· dock 掛喺 `AppShell` **一次** · route context passing(`D-CTX`)· dock 入面 chat |
| 性質 | **零 schema · 零 migration · 零新 endpoint · 零 ADR**(純前端) |
| DEV | 🟢 **部署 #12 `dev-04f3c86`(2026-08-20)** ⇒ 最後一條 `F5-4` 收 |
| 剩低 | 🚧 `OQ-C` 未答(唔喺 acceptance 入面)· `/requests/new` 喺 DEV 去唔到 ⇒ 嗰條 pathname live 驗唔到 |

🔴🔴 **部署 #12 帶咗一個會直接害到下手嘅教訓:零 migration 令一個用咗六次嘅判準失效。**
#6–#11 每次都靠「**新表 / 新欄讀得到**」做正面證據(#10 `GET /agent/profiles` 200 ·
#11 `GET /agent/conversations` **200 唔係 500**),而 W49 `git diff -- prisma/` **完全空**
⇒ 照抄嗰段就係**驗咗一樣舊版都成立嘅嘢**。改用兩條**唔靠字串**嘅:
①**live asset 名逐字等於由 image 內部 `docker cp` 抽出嗰個** ②**上一個部署嘅 bundle 404**。

🔴 **順帶捉到交接文件推薦嘅 marker 有一個係假** —— `Ask about a licence request` 寫住
「W49 新加」,實查 `git grep -F … b4915e9` ⇒ **`assistant.tsx` 一早有**。
📌 **一個字串要做 marker,先要驗佢喺舊版真係冇**(成本 = 一條 `git grep`)。同 W49
`progress.md` Day 4「grep 命中 ≠ 嗰件嘢喺度」同族,但機制唔同 —— 嗰次係 **substring 命中**,
今次係「**以為新加,其實舊有**」。

🟢🟢 **順手答咗一條之前未知嘅嘢:DEV 嘅 SSE 斷線同本機相反。**
殺 api revision 實測:**DEV(nginx + ACA)close 個 stream + fire `error` + 3.2 秒自動重連**;
**本機(vite proxy)零 event · `readyState` 一直 OPEN**。⇒ W49 `F4-3` 決定「兩種都蓋到」
係啱嘅,唔係過度防禦。`ping` 實測**真係 25 秒**(= `AGENT_SSE_HEARTBEAT_MS` default)
⇒ 60s staleness timer 個推導成立。

🔴 **開工前一個坑(W48 同 W49 兩次都撞)**:DEV 三個 `AgentProfile` 收工全部 `active: false`,
而 **`GET /agent/profiles` 預設只返 active** ⇒ **打去見到 `[]` 唔代表冇 profile**,
要 `?includeInactive=true`。唔開返一個,dock 同 `/assistant` 兩個開始掣**一樣係 disabled,
而畫面唔會話你知點解**。用完記得停返。

⬇️ **以下係 W49 之前嘅座標** ⬇️

**🔵🔵 W48 `agent-conversation`(Tier 2 `T2-c`)2026-08-19 已經 merge 落 `main`
(PR #124,tip `3a9dd66`),branch 兩邊都刪咗。**
🟢🟢 **同日再做咗部署 #11(`dev-b4915e9`)⇒ `F2-6` / `F7-3` / `F7-4` 三條一次過收晒,
九條 G 全 ✅,phase `closed`。** ⚠️ 呢格上一版寫住「phase 仲係 `active`,三條等一次
DEV 部署」—— **而家唔啱**,唔好照用。
🔴 **「已 merge」逐個驗過**:15 個 commit 全部 `--is-ancestor` = `IN`,未入數 = 0。
🟢 **今次冇 W47 嗰種 merge 風險**:開 PR 前實測 `HEAD..origin/main` = **0**(`main` 零 commit
行前)⇒ 冇 auto-merge 靜靜出事嘅位。

| | |
|---|---|
| 交付 | `AgentConversation` + **`AgentChatTurn`**(⚠️ **唔叫 `AgentTurn`** —— seam 一早有 `export interface AgentTurn`,`ADR-0041 Errata E1`)· `POST/GET /agent/conversations` + `@Sse(:id/events)` · 新 route **`/assistant`**(ADMIN + REGIONAL)· 新 **`GET /agent/profiles/options`**(ADMIN + **REGIONAL**,三個欄冇 `prompt`) |
| ADR | **`0041` Accepted**(D1–D9 + Errata E1) |
| test | api **1484 / 97 suites** · web **480 / 45** |
| DEV | 🟢 **部署 #11 `dev-b4915e9`(2026-08-19)** —— `F2-6` `GET /agent/conversations` **200 `[]`**(🔴 **`200 唔係 500` 先係佐證**)· `F7-3` 4 turn 真對話 + **SSE 真通**(連線喺送 turn **之前**開好 ⇒ `changed` @ **79 ms**、`ping` 每 25 秒、**逐個即時到 ⇒ proxy 冇 buffer**;⚠️ 回應**冇** `x-accel-buffering` header ⇒ 唔 buffer 唔係靠佢擋,改 `nginx.conf.template` 就冇咗而**冇 test 會紅**)· `F7-4` 全程冇睇 revision status |
| 剩低 | 🚧 **`F5-12` 一條**(picker 顯示「開新對話用邊個」vs thread header 顯示「呢條用緊邊個」,視覺上都係一個 agent 名。`aria-label` 已改,**視覺嗰半留畀 Chris 睇截圖判斷**)。🆕 部署順帶揭到 **`AGENT-RUN-CONVERSATION-ID`**(見下) |
| risk | 六條入咗 `RISK_REGISTER.md` **`R32`–`R37`** |

🔴 **部署 #11 順帶揭到兩件唔部署就唔會知嘅事:**

- **DEV 零 profile**(連 inactive 都冇)⇒ 而 W47 **刻意冇 default profile**,所以 `/assistant`
  **一句都問唔到**,要先建一個先驗得到 `F7-3`。**profile 係 DB 資料,唔跟部署走**(同
  `CH-026 G-7` curate 同族;部署 #10 個 `G8` 撞過同一件事)。📌 plan 寫住「`F7-3` 差一次
  操作」,實際係**四個**操作 ⇒ **「差一次操作」本身仲可以再拆**。
- **`AgentRun.conversationId` 寫得入 DB,但 `GET /agent/runs` 同 `:id` 兩邊都冇暴露佢。**
  🟢 **而唔可以由此推「DB 冇寫」** —— `agent-conversation.service.ts:97-99` 靠佢攞值先寫得到
  assistant turn,而 turn **真係寫咗** ⇒ 個欄一定有值(**唔使查 DB 就成立**)。缺嘅係 read
  model:W48 加個欄,而 W47 個全域 run 列表 select 喺自己嗰條 branch 上面唔知有佢 ⇒
  **同 `CH-031` × `W47` auto-merge 縫隙同族,兩邊各自完全正確**。已登 `BACKLOG`
  `AGENT-RUN-CONVERSATION-ID`;**本次刻意冇修**(郁 API contract)。

🔴🔴 **本 phase 最值錢嘅四件事,冇一件係 test 揾出嚟:**

1. **`Thinking…` 同「已提出建議」同時出**(render 揾到)—— 五條 assert 每條問「**某樣嘢**
   喺唔喺畫面」,而缺陷係「**兩樣嘢一齊**喺畫面」。同 CH-030 個 `items-center` 同族。
2. **兩個 active profile ⇒ 每條新對話第一句都 400,而用戶冇出路**(live 揾到)——
   UI test **mock 咗 mutation**,所以「送咩 body 落後端」嗰層根本冇人睇。⇒ Chris 批
   Option A:加 picker + 新 options endpoint。
3. **SSE 連斷 3 次就永久靜默** —— `MAX_CONSECUTIVE_FAILURES = 3` 本身啱(`EventSource`
   唔畀睇 status code),但 **thread 活得遠耐過一個 run** ⇒ 一次 api 重啟(= 一次部署)
   就中,而畫面唔會講。切走 thread 再切返(remount)就補得返。
4. **`businessAlias` 101 個 SKU 全部 `null`** ⇒ agent 收人話 SKU 名 search 唔到,
   **兼且把「搵唔到」講成「攞唔到」**(用戶會當系統故障去搵 IT)。

🟢🟢 **`OQ-D` 做成對照實驗唔係單邊觀察**:同一句、同一 profile,**唯一變數係 `requestId`
在唔在** ⇒ 冇 context 嗰條答「with the available tools」做唔到兼且**零 tool call**,
有 context 嗰條真叫 `list_pending_requests`。**單睇前者,「filter 生效」同「model 唔想叫」
睇落一模一樣。**

🟢 **`R26` 喺新路上重現**:揀 `power-bi-only` 開對話,agent 自己答
「I can only suggest Power BI licences」⇒ **揀 profile 揀嘅係行為,唔係一個 id。**

⚠️ **5433 而家喺 `ai-doc-extraction-db` 手上**(W48 借咗兩次,兩次都還原兼真 TCP 驗過)。

---

## W47 / CH-031 座標(2026-08-17,仍然有效)

**🟢🟢 W47 `agent-registry`(Tier 2 `T2-a`)2026-08-17 已經 merge 落 `main`(PR #119),
branch 兩邊都刪咗。**
⚠️ 呢一段一日之內錯過兩次,所以兩句都寫低:先寫「`main` 同你 working tree 係同一件嘢」
(W47 一開工就唔啱),後寫「W47 仲喺 branch,`main` 上面冇」(merge 咗就唔啱)。
🔴 **「已 merge」係逐個驗出嚟嘅**:17 個 commit 全部 `git merge-base --is-ancestor` = `IN`,
兼且 `origin/main..branch` **未入數 = 0**。

| | `main`(W47 merge 之後) |
|---|---|
| test | api **1430 / 94 suites** · web **464 / 44 files,零紅**(對數 = W47 1410 + CH-031 19 + merge 新加 1) |
| ADR | 到 **0040**(0036 agent-runtime seam · 0037 inference boundary · 0038 tool-runner dep · 0039 async + SSE · **0040 agent run soft-hide**)—— **W47 自己零新 ADR** |
| agent module | `src/agent` + `src/agent-approval` · **hide / unhide**(CH-031)· **`AgentProfile` registry** · `/agent` 管理頁 · **全域 run 列表**(W47) |
| `Textarea` primitive | **有**(H6 STOP → Chris 批,`design-system.md §2`) |
| root gate | `test` / `build` / `lint` 三個都蓋埋 `-w @uop/web` |

⚠️ **呢個 worktree checkout 唔到 `main`** —— 佢畀 `C:/ai-develop/unified-operation-platform`
嗰個 worktree 佔住(`fatal: 'main' is already used by worktree at …`)。開工用
`git checkout -b <new> origin/main`,唔好嘥時間試 `git checkout main`。

**🟢🟢 CH-031 2026-08-17 亦已 merge(PR #117)—— agent run 而家移除得到,但唔係 `DELETE`。**
加嘅係 **`POST /agent/runs/:id/hide` + `:id/unhide`**(ADMIN-only · terminal-only)+
`AgentRun.hiddenAt`,`ADR-0040` Accepted。
🔴 **要記住嘅係點解唔 delete**:`AgentStep` / `AgentMessage` / `AgentProposal` 三張表喺
**migration SQL 層面**全部 `ON DELETE CASCADE`,而佢哋就係 audit 真相 ⇒ 刪 run 會帶走
transcript(推翻 `ADR-0036 D6`)同 `approvedById`(邊個批准過)。
🟢🟢 **`ADR-0040 D4` 係最重要嗰條**:`review-stats` / `kill-switch` 聚合 `decidedAt` / `status`,
同 `hiddenAt` **正交** ⇒ **R13 rubber-stamp 監測結構上郁唔到**。
🟢🟢 **部署 #10(`dev-df03563`)2026-08-17 做咗** —— W47 + CH-031 一次過上機(31 個 commit · 2 個 migration)。
DEV 嗰兩個測試 run hide 走咗,`G1`/`G2` 收咗,**兩半都驗**:唔再喺列表出現,而 `GET /agent/runs/:id`
**仍然 200 兼且 steps / proposals 全部仲喺度**(做咗 `DELETE` 就會 cascade 消失)。
⚠️ **兩件下手要知**:①🔴 **`ADR-0040 D4` 喺 DEV 仍然未驗證** —— `review-stats` 返 `decided: 0`,
但佢係 0 **唔係因為 hide**(DEV 冇人真決定過任何 proposal)⇒ 個數字證明唔到嘢,**D4 只有 unit test
+ falsification 撐住** ②`agent.boundary.spec.ts` 個 verb list **仍然冇 `deleteMany`**
(BACKLOG `agent-boundary-gaps`)。

🔴🔴 **本機 DB 同 `orca/…/ai-agent` worktree 共用,而佢開緊 W48**(branch
`feat/w48-agent-conversation`;DB **已經 apply 咗 `20260818055347_w48_agent_conversation`**,
即 `AgentConversation` / `AgentChatTurn` 兩張表同 `AgentRun.conversationId` 都喺度)
⇒ **喺本機 DB 上面絕對唔可以 `prisma migrate dev`** —— 佢見到 drift 會提議
**reset 成個 DB**,毀咗人哋啲嘢。一律用 **`prisma migrate deploy`**(只 apply pending,永遠唔 reset)。
⚠️ **順帶一個推論陷阱**(W48 `F0-6` 實犯):**「我呢個 worktree 未做過 migration」推論唔到
「DB 未做」** —— 兩邊共用一個 DB,`migrate status` 打一次就知,唔好靠估。
⚠️ **W47 merge 之後兩個 migration 都要喺本機 DB**:`20260817090000_ch031_agent_run_hidden_at`
(CH-031)排喺 `20260817093556_w47_agent_profile`(W47)**之前**,但兩個都係獨立
`ADD COLUMN`,**次序點都冇所謂** —— `deploy` 只 apply 未 apply 嗰啲,唔會因為「遲咗嚟嘅
migration 排喺前面」而做任何嘢。

🔴 **「已 merge」唔係睇 PR state 得出嘅** —— W46 十個 commit 逐個 `git merge-base
--is-ancestor <sha> origin/main` 驗過(CLAUDE.md §9 先例:PR **#87** 顯示 `MERGED`,實際
只入咗 6 個入面頭 2 個)。**W47 merge 之後同樣要逐個驗。**

🟢🟢 **嗰 6 條長期紅冇咗** —— `main` 側 `31b5c7d` 修好咗,根因係 **Node 25 預設開 Web
Storage,把 `globalThis.localStorage` 裝成一個空 `{}`**,同 jsdom / 同我哋嘅 code 都無關。
⇒ **以後唔使再喺每份 closeout 數「嗰 6 條係舊嘅」。**

⚠️ **`main` 亦把 root `test` / `build` / `lint` 三個 script 擴到蓋埋 `-w @uop/web`** ——
即係話 **web suite 而家真係入咗 gate**(之前 root script 只 `-w @uop/api`,而 CI 直接跑
root script ⇒ web 由頭到尾冇入過任何 gate,呢個就係嗰 6 條可以紅足幾個星期冇人知嘅機制)。
merge 之後四個 gate 全部真跑過:**test / lint / build 三個 exit 0**。

**W46 `agent-runtime` 2026-08-17 收尾 —— 🟢🟢 21 條 acceptance 21/21 全收。**
⚠️ **呢度之前寫住「19 條 ✅,淨低 `A1` DEV 半邊同 `B6`,而兩條都卡 Redis」—— 已經過時**:
同日部署 **#9**(`dev-45ad525`)同 **#9b**(同一個 image,淨係加 env)之後兩條都收咗,
`CLAUDE.md §0` 一早更新咗而**呢份冇跟** —— 正正係 §14 講嗰種「兩份文件各講各」。
🟢🟢 **`A14` 同日全收** —— Chris 開咗 Azure OpenAI resource,agent **第一次真跑**:
`awaiting_approval` → **approve → `completed`**,落 DB 對數(proposal `executed` +
`approvedById` 有值 + 2 條 line item 逐字對返兩個 GUID)。
🔴 **批准嗰半分兩次先收齊,而第一次「失敗」嗰次先係最有價值**:撞 **409
`This request is complete…`** ⇒ **`F8-3` 卡上嗰句「Approving runs the platform's normal
checks — they can still refuse」第一次真驗證**(閘喺 `RequestService.addLineItem`,唔喺
agent 側)。
🟡 **封信仍然未發**(`docs/13-deployment/11-azure-openai-infra-request.md`)—— 之前寫住
**「佢而家淨係為 Redis 而存在」**;⚠️ **而 DEV Redis 實測已通**(見上)⇒ **封信可能已經
冇存在理由**。🔴 **呢句刻意唔寫死** —— 我冇讀過封信而家嘅內容,亦未確認佢講嘅係咪淨係
DEV;**owner 決定發唔發之前應該先掃一次封信**。幾時發係 owner 決定。Chris 2026-08-17 傾過:W46 code 一行都未入
`main`,喺呢個時候叫人開 production tenant 嘅資源,次序係反嘅。
⚠️ **本機開發完全唔受影響** —— 本機一直有 Redis(`docker-compose.yml:23-32`)。
🔴 **本機 LLM 唔再全部 mock** —— `AZURE_OPENAI_*` 三個 env 一填就打真 Azure(缺一即 503,
冇 default)。

🔴 ~~**部署 DEV 之前 Redis 要喺度,否則 `POST /agent/runs` 直接 503**~~
**—— 呢句唔再係一個未解決嘅前置(2026-08-17 `F8-1` 掃出)**:`B6` 收嗰陣就係喺 DEV 打
`POST /agent/runs` 攞到 **201**,而冇 Redis 佢會直接 503(`ADR-0039 F1`:個 POST 只
enqueue)⇒ **DEV Redis 一早通咗**。
⚠️ **機制本身仍然成立,所以留住呢句做知識** —— 冇 Redis = agent **整個停**,同 Azure
OpenAI 嗰種「少一條 live 驗」唔同級別;但**唔好再當佢係部署前要先解決嘅嘢**。

### W47 `agent-registry` —— 掂 agent 之前要知嘅六件事

1. **冇「default profile」呢個概念** —— 一個 active 就用佢;多過一個而冇指名 → **400 兼
   講明有幾多個**;零個 → 400,**唔准 fallback 落 env**。理由:一個畫面上睇唔到嘅 default,
   就係將來用錯 model 都冇人發現嗰個位。
2. **model 由 profile 經 `AgentSetup.model`(required)落 adapter** —— 兩個 adapter 唔再
   自己 `resolveModel()`,亦**唔再收 `ConnectorConfigService`**(`agent.boundary.spec.ts`
   有 import ban 守住)。⚠️ **三個 `AZURE_OPENAI_*` 缺一即 503,一個字冇改**。
   ⚠️ 另有一條相容路 `modelForLegacyRun` —— 部署嗰刻卡喺 `awaiting_approval` 嘅 run 冇
   profile,喺嗰度 refuse 就會永久封死嗰張 request。
3. **`prompt` 改得,改動入 audit `before`/`after`**,而 **no-op PATCH 唔寫 row**。
   🔴 **`R26` 已經係實證唔係推論**:同一段 text · 同一個 model,唯一變數係 prompt ⇒ 提
   **2 個 SKU** vs **1 個**,而 agent 自己個 reasoning 寫住「**I ignored the Microsoft 365
   E5 request … as instructed**」。
4. **舊 run(`profileId = null`)顯示「Before W47」,唔隱藏**(`OQ-D`);兩個 fkey 都係
   **`onDelete: Restrict`**(Prisma optional relation 預設嗰個 `SET NULL` 會令一個直接落 DB
   嘅 delete 把「呢個 run 用邊個 profile 跑」一次過變 unknown)。
5. **`Textarea` 係新 primitive** —— 用之前讀 `design-system.md §2`;🔴 **`resize-y` 唔可以
   寫成 `resize`**(水平 resize 容許用戶由元件內部把自己拉闊過個 dialog = 打破成個 console
   唯一嗰條 layout 硬規矩,而冇任何一行 code 改動可以賴)。
6. 🔴🔴 **全域列表 `GET /agent/runs` 過濾 `hiddenAt: null`,而呢一行係 merge 嗰刻先加。**
   CH-031 把 filter 放咗喺 `findLatestForRequest`,因為嗰陣**得嗰一條 list-shaped read**;
   W47 加全域列表嗰陣,`hiddenAt` 喺呢條 branch **未存在** ⇒ 兩邊 **auto-merge 得完全乾淨**,
   而結果係 admin hide 咗嘅 run **照樣列出**,**兩邊 suite 全綠**。
   📌 **`GET /agent/runs/:id` 仍然唔過濾(ADR-0040 D3)** —— 嗰個唔對稱就係「hidden」同
   「gone」嘅**全部**分別,唔好順手「修」佢。

⚠️ **merge 之後一定要 `prisma generate`** —— 唔跑就 7 個 api suite 直接開唔到身
(`hiddenAt` 唔喺 generated type),而錯誤訊息指住 `ai-assist.service.ts` 唔指住 client。

🟢🟢 **W47 acceptance 8/8 全收(2026-08-17),phase `status: closed`** —— merge(PR #119)·
部署 #10(`dev-df03563`)· `F7-2` / `F7-3` / `F7-4`,三步同日做完。

🔴 **收尾記低一個判斷錯誤,因為佢係一個寫法問題唔係一次意外**:當時把 `G1` 同 `G8` 當成
**同一個阻塞**,而佢哋唔係 —— `G1` 部署完**自動就收**,`G8` 要**人再做一次對照實驗**
(部署唔會幫你開 profile)。⇒ **寫「DEV ❌」嗰陣要順手寫低差嘅係咩**:一次部署 / 一次操作 /
一個未答嘅問題。三者收尾成本差好遠,而「❌」三個都一樣咁樣寫。

🔴 **`R15` 2026-08-17 第一次 live 命中** —— agent 提咗一個 **101 個 catalog row 一個都
對唔上**嘅幻覺 `skuId`。**唔係缺陷**:proposal payload 明文設計成唔驗,兩道閘住喺 tool body
而 tool body **approve 之後先行** ⇒ 入得到 proposal、**入唔到 line item**。
📌 **值得記嘅唔係「有冇擋到」,係「擋喺邊」** —— 操作員 approve 之前睇到嗰個就係未驗版本,
而畫面**冇任何信號**話畀佢聽個 GUID 係假嘅。product question,**未開單**。
🔴 **`R28` 一半未答(H1,未開單)**:`Restrict` 擋到**刪**擋唔到**改**,而 profile 係
mutable ⇒ 今日答到「用邊個 profile」,答唔到「**嗰一刻佢係咩 model**」;要真答就要
`AgentRun` 存 model snapshot。

---

**`main` 嘅座標(2026-08-14)**:git 連 GitHub **private**(`chris-private-workspace`,`main`)。Backend `apps/api`(NestJS)、`/docs/api` 200、DB seeded(**24** OpCos + admin + catalog SKU)。`apps/web` = **約 10 個實畫面**(Overview / SKU Catalog / Requests + detail + new[開單] / Drift / License Assets / Settings / **Audit log** / **Delivery failures** / Login)。**api 1044 test(74 suites)· web 377 passed**(⚠️ 另有 **6 條 pre-existing 紅**,見下)。ADR 到 **0035**(🟢 **0035 = Accepted 2026-08-14** —— 平台自己開嘅 licence REQ 號碼落 `Request`,**非 `@unique` 兼唔准入任何 `where`**,呢個限制本身就係決定;落地單 = **CH-030**)(🟢 **0034 = Accepted 2026-08-13**,落地單 **CH-029**)(🔴 **0031 = Rejected**,見下)· CH 到 **030**(🟢🟢 **030 = 2026-08-14 一日收晒** —— 實作 + test + migration + H6 light/dark 真 render;✅ `OD-1` backfill **= 唔做,Chris 同日拍板** ⇒ 新欄只對 ADR-0035 之後開嘅 request 有值,**已收嘅決定唔係遺留待辦**)(🟢🟢 **029 = 2026-08-14 全收 closed** —— 實作 + test + `F5-4` render + **`D-C` live @ DEV** + **`D-A` live @ 本機**,三個 deliverable 各自都有 live 證據) · BUG 到 **011**(✅ closed)。

⚠️ **上面呢句 2026-08-13 更正過兩處,而兩處都係同一格入面自己同自己唔同步**:CH-029 喺同一句出現兩次,一處寫 `approved 未開工`、另一處寫 `proposed,三條 OQ 未答` —— 而**兩個都已經過時**。⇒ **改一個 ID 嘅狀態之前,先 grep 成份檔數吓佢有幾多個 entry**(呢個形狀 2026-08-13 一日內中咗六次)。

🟢 **CH-021 ✅ closed(2026-08-11)** —— onboarding intake 通知(該 OpCo `OPCO_IT` + `OPS_NOTIFICATION_MAILBOX`),**A12 live 真寄兼 Chris 確認收到**。🔴 **A12 喺本機做,唔喺 DEV**:本機 ACS 憑證係真值,`ACS_SENDER_ADDRESS` 逐字等於 `CH-012-verify A4`(真送達過)⇒ DEV 換唔到嘢返嚟;而 **canonical intake 路零外部副作用**(唔掂 SN、唔掂 Graph)。⚠️ **fixture 一定要揀冇 `OPCO_IT` 用戶嘅 OpCo** —— seed 嗰個係 `opco.it.rhk@rapo.com.hk`,**真公司 domain**,用預設 RHK 會真寄畀佢。

🟢 **CH-024 / 025 / 026 / 027 四單 2026-08-12 一日內全部 closed 兼 merged**(PR #84 / #85 / #87 / **#88**)。**CH-027 = ADR-0033 落地** —— `owned` 由 `prepaidUnits.enabled` 改成 `enabled + warning`,assign gate 跟住走 ⇒ **由拒絕 32/101 個 SKU 收窄到 11 個,而 11 個個個講得出理由**(6 個真係用晒 + 5 個訂閱已取消)。🟢 **`warning` seat 派得到係實測唔係推論**(`AAD_PREMIUM_P2` `enabled=0`/`warning=10` → Graph HTTP 200,`consumed` 0→1,移返後 0)。

🟢🟢 **五項真環境驗證 2026-08-12 全部收咗**(Chris 批准停 `ai-doc-extraction-db`,一氣呵成):migration 對真 DB **21/21 applied** · **真 sync 驗到 `SPE_E3` `owned` 21 → 4498**(21 + 4477 grace)、`SPE_E5` 4502 → 4744 ⇒ **CH-020 嗰個「dev tenant 超支 33」之謎解開兼修好** · **gate 拒絕 `32 → 11`,同 ADR-0033 D4 個表逐字一樣** · light+dark 六張截圖。⇒ **CH-026 / CH-027 兩單都 closed。**

🟢🟢 **CH-022(`INTAKE-REQUESTER`)2026-08-12 `A7` live 收 ⇒ closed** —— 端到端第 2 步(UOP 收到 n8n intake 之後喺 SN 開 O365 單)**由 W43 交付以嚟第一次真流量行得通**。四個證據冇一個靠 intake 回應:api log `Ordered ServiceNow request REQ0044083 (1 RITM)`(**零** `Could not raise…` = 08-07 三次全部掛嗰句)· SN `sc_req_item` 真出 **`RITM0047389`**(`cat_item=efe38ade…`,count **1**)· `REQ0044083` 個 `requested_for` **逐字等於源 `REQ0044067` 個 `opened_by`**(ADR-0030 修法)· 本機 DB 重讀 line item RITM 已填。📌 **`requesterEmail` 係故意送一個 SN 必然反查唔到嘅地址** —— 舊 code 就死喺呢格,單照開得成 ⇒ **`A1` 嘅 live 版**。🔴 **intake 回應永遠證明唔到 RITM 開咗**(`created` 喺 `raiseLicenceRequest` 之前 snapshot ⇒ line item `serviceNowSysId` 恆為 null)。🔴 **08-11「留返 DEV 做」個前提打咗折**:DEV **一樣缺** `DEFAULT_ONBOARDING_SKU_ID`(grep 零命中,只剩 DB override),而兩邊 `SERVICENOW_INSTANCE_URL` **逐字一樣** ⇒ 同 Graph tenant 論證同族第三次。⚠️ **留低咗一張真單 `REQ0044083`/`RITM0047389` 待決定收唔收**(平台冇 cancel,H3 out-of-scope;同 CH-020 leftover 同族)。

🟢🟢 **CH-028(`ASSETS-IN-M365`)2026-08-12 closed 兼 merged(PR #90)** —— Platform view 加一欄 **`In M365`**(`tenantConsumed`)⇒ **`Assigned`(平台自己嘅帳 = Σ `OpcoSkuLedger.assignedQuantity`)同 M365 真實用量第一次並排**。🔴 **刻意唔計個差**(Chris 拍板 D2-A):`In M365 − Assigned` **就係 `DriftAlert.delta` 嘅定義**(兩條 sum 逐字相同),但**兩邊個 `tenantConsumed` 唔同源** —— Drift 頁行 **live Graph**(`reconcile.service.ts:50`,OD2「fresh tenant totals, not a stored snapshot」)、Platform view 行 **stored snapshot**(`tenant-owned.service.ts:89`,OD4「never calls Graph」)⇒ 喺呢度計 delta = 養一個同 Drift 對唔上嘅第二真相。**有一條 test 專門守住,falsification 真跑過**(加 delta 副行 ⇒ 只有嗰條紅,1/11)。**D3-B**:grand total 加 `TenantSkuStatsDto.totalConsumed`,scope 跟 `totalAssigned`(all rows)唔跟 `totalOwned`(prepaid-only)。🟢 **H6 真數據 render**(唔使造 fixture,101 個 row 有 70 個帶真值):`totalConsumed = 25275`,**grand total(endpoint)同 subtotal(前端計)兩條獨立路徑對得上**;`Teams_Premium` owned **0** / In M365 **2**、`VIVA` owned **0** / In M365 **30** —— 平台以為冇、M365 話有人用緊。🔴 **兩樣淨係真 render 先捉到**:①`In M365` 兩字喺窄 numeric 欄換行令 header 高過其餘六欄(加 `whitespace-nowrap`,實測七個 `th` 全部 36px)②表 **溢出 28px @1440px**(加欄前係零溢出)。⚠️ **順帶揭咗一個 ledger leftover(Chris 決定唔動)**:`POWERAUTOMATE_ATTENDED_RPA` `alloc=0` / **`assigned=1`** / **`In M365=90`** —— 個 `1` 係 **W45 `F4-4` 真派嗰次留低**(Graph 側移返咗、ledger 冇跟住減),而 **Drift 頁零 alert**(sweep 未跑)⇒ **呢個落差今日之前冇任何畫面顯示過**,新欄第一日就派上用場。🔴 **spec 途中一句我自己嘅推論被實測推翻(R3 已 log)**:D3 寫「controller 逐個欄砌(ADR-0013 D2)」係由 `IntegrationController`(BUG-011)**推**去 `LicenseController`,實讀 `license.controller.ts:251-255` **佢直接 return service object** ⇒ **同族第七次,而今次係喺自己份 spec 度製造。**

🟢🟢 **CH-026 `G-7` 2026-08-13 做咗 ⇒ CH-026 全收**(Chris 批准由 AI 經 API 做):22 × `PATCH /license/catalog/:id` **全部 200** ⇒ **`Available seats` KPI `4,270,779` → `50,779`**、`unlimitedSkus` `0` → **22**,light + dark 真 render 過(unlimited 行出 `Unlimited` / `—` / neutral badge / 冇 owned bar,常態行一個字冇郁)。三條獨立路徑對數:endpoint `totalOwned` = 我自己由 79 個 prepaid row 加返嘅總和 = 算術 `4,270,779 − 4,220,000` = **50,779**。
🔴 **`G-7` 只做咗喺本機** —— 當時 **DEV 做唔到**:佢跑緊 `dev-86ed450`(08-10),**冇 CH-026**(row 冇 `seatModel`、stats 冇 `unlimitedSkus`),亦冇 CH-024/025/027/028 ⇒ **DEV 落後 `main` 五個 CH**。
🟢🟢 **部署 #8(`dev-4bbbe0f`,2026-08-15)—— DEV 追返 CH-030 / ADR-0035**(CH-030 08-14 merge 之後又落後一個 CH)。流程同 #6 / #7 逐步一致;驗證同樣唔睇 revision status —— **`GET /api/fulfilment/requests` 200 兼 row 有 `serviceNowLicenceReqNumber`,一個 request 同時證新 code + migration 真跑咗**(column 唔存在會 500),web bundle 兩個新字串中 **而 CH-030 刪走嗰個 `raised by this platform, closed on assign` 唔喺度**。🔴 **重點唔喺流程,喺「呢次部署換唔到咩」** —— ADR-0035 個欄只對部署**之後**開嘅 request 有值(`OD-1` = 唔做)⇒ 實測 **10/10 仍然 `null`**,全部照顯示 RITM;Chris 明知之下仍然揀而家做,理由係唔想累積 drift。⚠️ **一樣唔可以當狀態寫,驗 DEV 之前先確認佢跑緊邊個 tag。** 🟢🟢 **CH-029 merge(PR #101 → `2a68f8d`)之後 DEV 又落後一次,同日 部署 #7(`dev-2a68f8d`)追返** —— 驗證同 #6 一樣唔睇 revision status,改睇新 code 先出到嘅嘢(enum 11 個兼 `holding` 排位啱 · `skippedUnlimited` · web bundle 六個字串)。🟢 **今次多咗一種 #6 冇嘅證據**:輪詢第 1 次 200 但**冇** `holding`、第 2 次(+10 秒)**有** ⇒ **同一個 URL 由舊變新**,排除咗「一直都喺度 / 舊 cache」。⇒ **`CH-029` `D-C` live 同日收**(`reconcile` 201 `{"resolved":16,"skippedUnlimited":22,"drift":56}`;獨立 join `alert.sku.skuId` 對數 72/16 → 56/**0**;audit **16/16** 帶 `reason=unlimited-sku`)。🟢🟢 **`D-A` 2026-08-14 收咗,但唔係喺 DEV 撳** —— 唯讀探測發現 DEV 三條 `READY` **全部同一人同一 SKU**,而 target SKU `POWER_BI_PRO` **Graph 答佢冇持有** ⇒ 撳落去只會驗到「未持有」嗰條路(即本來就有嘅行為),代價係一個真 licence ⇒ **唔撳**。改喺本機驗(**同一個 Graph tenant / 同一個 app**,而 `HoldingCheckService` 就係打 Graph;DEV 側 gate 已由 OpenAPI enum 確認在 wire)。fixture 用 `FORMS_PRO`(**`unlimited` ⇒ 萬一讀錯 seat 成本係零,fail-safe 唔係自信**)。結果:`holding`/`seats`/`assign`/`ledger` 四個全 `skipped`,**ledger `5/0` 一個字冇變**,`stage → ASSIGNED`。📌 **「撳之前先唯讀探測」呢條 R10 規矩今次真係攔咗一次冇意義嘅真派。**⚠️ **「DEV 追齊咗」唔可以當狀態寫 —— 佢每次 merge 就過期**(呢格半日內由 ✅ 變返 🔴)⇒ **驗 DEV 之前一律先確認佢跑緊邊個 tag。**

🟢🟢 **部署 #6(`dev-53965f3`)—— 嗰刻 DEV 追齊五個 CH**。驗證**唔睇 revision status**(entrypoint 令 migrate/seed 失敗 NON-FATAL ⇒ `Healthy` 證明唔到 DB 通),改睇只有新 code 先出到嘅嘢:row 有 **`seatModel`**(順帶證明 **migration 真跑咗** —— 冇嗰條 column,Prisma query 會爆 500)· stats 有 **`totalConsumed: 25292`** · web bundle 有 `In M365` / `unlimited excluded` / `grace` / `Completed`,而 **ADR-0033 移走咗嘅 `No seats enabled` 唔喺度**(**負面命中先係最強證據**)。
🟢 **DEV 側 `G-7` 同日亦做咗**(Chris 批,部署 #6 之後先做得到):pre-state `prepaid=22` ⇒ 22 × PATCH 全部 200,`totalOwned` **4,240,459 → 20,459**、`unlimitedSkus` **22**,三路對數。⚠️ **curate 係 DB 資料唔係 code,唔會跟住部署過去** —— 兩個環境各做一次。
🔴 **DEV 揭到一個本機睇唔到嘅後果:`totalUnallocated` 變負數(`−25,151`)**。條數係**啱**嘅:`totalAllocated`(58,814)**包含** unlimited row 嘅 allocation,而 `totalUnallocated` **只計 prepaid** ⇒ `20,459 − 45,610`。即 **CH-026 progress 決定 #4 個「兩個 KPI 範圍唔同」代價,喺真 allocation 數據下第一次浮面**(本機 `totalAllocated = 0` 所以由頭到尾睇唔到)。**#4 預見咗範圍唔同,冇預見會出負數。🚧 未處理未開單** —— 同 CH-026 spec §4 個「unlimited SKU drift 點計」屬同一批「unlimited 落地之後先睇得到」嘅問題。
📌 順帶:KPI 實際叫 **`Available seats`** 唔係 CH-026 doc 寫嗰個 `Prepaid seats`(CH-027 之後改咗名);`FLOW_FREE` `In M365 = 4,521` ⇒ **unlimited SKU 嘅 drift 點計仍然未處理**(spec §4 標低咗,要另開)。

🔴 **一個落差要記住**:gate 仲擋住嗰 11 個,**組成同 ADR-0033 寫嘅唔同** —— ADR 寫「6 用晒 + 5 `Suspended`」,實測 **7 + 4**(總數啱)。**呢個差異本身就係證據**:probe 嘅數字會郁,而 `capabilityStatus` 唔會 —— 正正就係 D1 揀「存 status」唔揀「由四個數推」嘅理由。

🟢 **stale branch 2026-08-12 清晒**:本地 **8 條**(`git branch -d`)+ remote **18 條**(`git push origin --delete`)—— 全部先跑 `--merged origin/main` 實測過命中先刪,唯一未 merge 嗰條(當時進行中嘅 PR)留低。⇒ **本地剩 `main`、remote 剩 `origin/main`**。💡 **remote 側數量多過本地側**(18 vs 8)—— 本地嗰啲之前有刪過,remote 冇跟,所以查嘅時候兩邊都要查。以下保留做背景 ———— `git branch --no-merged main` **空**,即係全部安全刪得。**下次開工仍然由 `main` 開新 branch**。⚠️ **呢度刻意唔寫 `main` 嘅 commit hash** —— 寫低嗰個 commit 本身就令佢過時(實犯:PR #80 寫住 `main = 8f7711a`,而 merge 佢即刻變 `6bb8e0c`)。要當下真相跑 `git log --oneline -1`。

🔴 **PR merge 之後一定要逐個 commit 查有冇入齊,唔可以睇個 `MERGED` 就算** —— **PR #87 實測只 merge 咗 6 個入面嘅頭 2 個**,靠 checkout 之後見到舊版 working tree 先揭穿。方法:`git merge-base --is-ancestor <sha> origin/main` 逐個行(#88 六個已咁樣查過,全部 `True`)。

🟢 **W44 2026-08-13 closed ⇒ 而家零個 phase 未收**(下面原文保留)(🔴 **2026-08-12 更正** —— 下面 W45 同 CH-023 兩行**已經 closed**,原文保留做背景;呢段一過時就正正係 §14 警告嗰種「下個 session 用錯前提開始」):
- **W44 = 部署上新 Azure DEV 環境** —— 🟢 **2026-08-13 closed**。~~已部署三次,🔴 卡環境(F6 卡 `B8` private DNS · F9 卡 `B9` SSO 真人驗)~~ ⇒ **已部署 5 次**;`B8` 2026-08-12 解封(custom domain 由呢台機直接打得通),`B7` 2026-08-06 解封。**收尾收咗** `F6-6`(break-glass 真登入 DEV:200 + `uop_access`/`uop_refresh` + role `ADMIN`)· `F6-14`(**400 body 290 B 完整過 ACA ingress + nginx**,`steps[]`/`failedAt`/`whoFixes` 齊)· `F2-13` · `F9-9`(原來一早做咗)。🟢🟢 **`F9-8` 同日全收**(SSO 嗰半 Chris 本人測試確認可以)⇒ **`AUTH-2b` 亦 closed**。🚧 **淨低**:**F7 五條 n8n 接線**(target = ADR-0017 三接縫 phase)。🔴 **新 RISK `R10`**:**叫做「DEV」嘅環境對真 production M365 tenant 有寫權** ⇒ 撳 assign 之前一律先唯讀探測。
- ✅ **W45 = assign 過程可見性(ADR-0029)—— 2026-08-12 `F4-4` live 收 ⇒ closed**。⚠️ **下面「卡 `B8`」嗰句已經唔啱** —— 真正卡住嘅係「要唔要真派一個 licence」呢個**決定**(本機同 DEV 打緊同一個 tenant / 同一個 Graph app);失敗路已併入 W44 `F6-14`。以下保留做背景 —— 🟢 **實作全部收晒**(後端十步回傳 `{outcome, failedAt?, steps[]}` · 前端 `AssignResultDialog` · light+dark 真 render 驗過)。🔴 **淨低 F4-4 live 驗,卡同一個 `B8`**。🔴 **branch 座標(2026-08-11 最新)**:W44 三個 phase 嘅 code 全部落咗 `main`(PR **#77** / **#78** / **#79**)—— ⚠️ **「本地已經冇任何 feature branch」呢句 2026-08-12 已經唔啱**(而家 8 條已 merge 未刪,見上面)。`chore/b8-live-verification` 已 merge 兼刪。剩低嘅嘢**全部係 live 驗**(W44 F6-4/5/6 + F9-8 · W45 F4-4b · CH-023 G9),卡同一個 `B8`,**由 `main` 開一條新 branch 一齊做**。
- ✅ **CH-023 = assign 之後 ServiceNow 側結果留得低 —— 2026-08-12 `F3-5` live 收 ⇒ closed**(驗到嘅正正係 `skipped` 分支 = 本 CH 個 driver;NOTE 同 dialog step 逐字一樣,零 drift)。⚠️ 下面「卡 `B8`」同樣唔啱。以下保留做背景 —— 🟢 **實作收晒**(`f219676`)。🔴 **`ADR-0031`(`AssignAttempt` 新表)= Rejected** —— Chris 揀咗 Option A(一條 `RequestEvent` NOTE)。**呢個係一個「提案被自己嘅代價否決」嘅例**,值得記形狀:D4「refusal 路開始寫狀態」係全份提案入面**唯一推翻既有約束**嘅位(第二次軟化 `ADR-0016 D6`),而佢**淨係為 refusal 路存在**;而 refusal「邊道閘擋住」係撳嗰刻見到、改完即刻再撳嘅嘢,**本身唔係「三日後要翻查」嗰種事實** ⇒ 覆蓋面大過需求。⇒ 零 schema / 零 migration / **零前端**。ADR-0031 全文保留唔改寫,將來要「翻查每次嘗試」由 D1-D6 重開。

> 🔴 **2026-08-10 撞到一個所有 test 層都捉唔到嘅 bug,形狀要記住**:`apiPatch` 由頭到尾 hand-roll `new ApiError(status, message)`,**冇第三個參數** ⇒ error body 永遠唔會落 `ApiError.detail`(只有 `errorFrom` 會,而 `apiPatch` 從來冇用過佢)。ADR-0029 個 steps 就係擺喺 400 body,所以**喺瀏覽器永遠到唔到前端,dialog 一世開唔到** —— 而 **api test 917 綠 / web test 綠 / tsc 0 / lint 0**,因為 UI test **自己手砌 `ApiError` 連 detail 落去**。⇒ **教訓唔係「漏咗一條 test」,係「條 test 放錯層」**:一條手砌自己期望嘅 error 嘅 UI test,永遠唔可能喺 transport 層失敗。已修(`d43b7a9`)+ 補 transport 層 test。⚠️ **`apiGet` 一樣冇 detail,刻意冇改**(現時冇 caller 需要)。
>
> 🔴 **同一日第二次同一形狀(BUG-011,`5314664`)**:`IntegrationController.list()` **逐個欄砌回應、明文唔 spread**(ADR-0013 D2 **刻意設計,應該保留**)⇒ 我加咗 `pendingRestart` 落 read-model,**個欄根本冇出到 API**,而三層 test 全綠(service spec 打 service · UI test 自砌 fixture · **DTO 冇宣告嗰個欄所以 tsc 唔返佢完全合法**)。⇒ **兩單嘅共同形狀:每一層 test 都喺自己嗰層邊緣停低,而 bug 就住喺兩層之間。** D2 嗰個代價(**新欄唔會自己流出去**)之前冇人寫低過,而家寫低咗 + `integration.controller.spec.ts` 守住。⚠️ **而第一版 guard 自己都係假嘅**:`toHaveProperty(key)` 對 `undefined` 一樣 pass ⇒ **一條 assert 睇落嚴唔嚴謹,同佢捉唔捉到嘢,係兩件事;唯一分辨方法係拆走實作睇佢紅唔紅。**
>
> ⚠️ **本機 `apps/web` 有 6 條 test 一直紅**(`local-profile.test.ts` 5 條 `localStorage.clear is not a function` + `reset-password.test.tsx` 1 條 timeout)。**`git stash` 實測 baseline 一模一樣 = pre-existing**,已登 BACKLOG `WEB-TEST-JSDOM`。⇒ 見到 `6 failed` **唔好當係自己搞壞咗**,但亦唔好當佢唔存在。
>
> ⚠️ **`npm run lint`(root)只 lint api**。web 要 `-w @uop/web` 另跑,而佢**本身紅住 16 條 prettier**(全部同 W45 無關,見 BACKLOG `LINT-web`)。
>
> 🔴 **`nest start --watch` build-cache 假綠燈 —— 診斷方法 2026-08-11 更正咗**:`Test-Path apps\api\dist\main.js` **唔可靠**(CH-021 A12 實測:watch 跑咗 90 秒佢仍然返 `True`,而真兇就係佢,害我白等 180 秒)。**唯一可靠信號 = `Found 0 errors` 同 `MODULE_NOT_FOUND` 一齊出**,但 `start-detached.ps1` **唔 capture api stdout** ⇒ 要用 `Start-Process … -RedirectStandardOutput` 起一次先睇到。修法次序不變:刪 `*.tsbuildinfo` **同** `dist/` → **直接起,中間唔插 `npm run build`**。
>
> ⚠️ **本機 5433 有 port 衝突**:`ai-doc-extraction-db` 同 `uop-postgres` 搶同一個 host port,**只可以二揀一**。W45 + BUG-011 + CH-021 各借用過一次(Chris 批)之後都已還原 = `ai-doc-extraction` 五個 container 跑緊、UOP stack 停咗。要起 UOP 就要再停佢哋一次。
> 🔴 **還原有個「靜靜失敗」陷阱(BUG-011 實測)**:如果 `docker start ai-doc-extraction-db` 嗰陣 `uop-postgres` 未停,佢會搶唔到 port,而**之後即使停咗 UOP、`docker restart` 都唔會重新 attach** —— container `healthy` · DB 內部 `accepting connections` · `docker inspect` 見到 `PortBindings` 仲喺,**但 host 5433 零 listener**(= restart-stack skill 硬規則 3 嗰個形狀)。修法 = `docker compose up -d <svc>` recreate,**而且要真 TCP connect 驗,唔好睇 health flag**。
> ## 🔴 環境:「Azure UAT」係誤名(2026-08-04 Chris 更正)—— 呢格睇漏會用錯前提開始
>
> **W32/W33 部署嗰個唔係企業 UAT,只係一個自建測試 Azure 環境**:自建 RG(`RG-RCITest-RAPO-N8N`)/ ACR / ACA env(**冇 VNet 整合**)+ PG public,住喺 Azure 公網,**同企業網絡零連繫**。
>
> ⇒ **佢同 n8n 兩個方向都接唔通**:inbound 冇企業 domain 入口;**outbound 打唔入內網**(n8n 住 on-prem / 內部 VM)。
> 🔴 **呢個就係 W36–W42 一路 carry 嗰句「n8n 側從未真接通,三個 seam 零 live 驗證」嘅根本原因 —— 唔係漏做,係環境上做唔到。**
>
> **檔名 / ADR 標題刻意保留**(改名會令 git history 永久對唔上,W36 判斷)⇒ 讀 `07-uat-as-built.md` / ADR-0012 嗰陣,把「UAT」讀成「**第一個 Azure 環境(自建測試)**」;兩個檔頂都有更正 blockquote。
>
> **真正接得通企業網絡嘅環境 = `RG-RAPO-UOP-DEV`**(infra 2026-08-04 交付 · 企業共用 ACA env `acaen-rapo-dev` + hub VNet PE + custom domain `rapo-uop-web-dev.rci-t.com`)—— 🟢 **已部署 5 次**(#1 = 2026-08-06 raw ARM PATCH;現行 `dev-86ed450`),**W44 2026-08-13 closed**。~~W44 進行中,仍未部署~~ ⚠️ **原文呢句由 08-06 起就唔啱,carry 咗七日** —— 正正係 §14 警告嗰種。
>
> **已解封 / 已交付**:**ADR-0027 Accepted**(Chris 揀 **Option A** —— api ingress 收返 internal,對外只剩 web 一個 hostname;🔴 **cookie / CORS / 前端一個字唔變**,兩個選項嘅分別只在 machine-to-machine)· `deploy/azure/aca-dev.json`(**唔建 ACA env**,只 update 兩個既有 app;`validate` **Succeeded**)· `aca.params.dev.json`(gitignored,已證)· **`what-if` 已跑**:零 Delete、9 個無關資源 `Ignore`、**custom domain + `workloadProfileName` 保留** · PG database **`platform` 已自建**(management plane,唔使連到 PG)· `nginx.conf.template` **零改動**(Option A 令 F4 消失)· vendor **暫時全 placeholder**(F3-6 拍板:部署成功再逐個接)。
>
> 🟢 **B1(image build)2026-08-05 解封** —— registry `acrrci3ailanding1.azurecr.io`(跨 tenant 企業中央 ACR)。解封方式 = **換一台唔喺公司網嘅 build host**(出口 IP `52.187.129.166`,Azure 段):Docker Hub ✅ · ACR `Login Succeeded` ✅ · api image(BUG-008 個 `test -f dist/main.js` 硬閘過)+ web image 都 build 成功 ✅ · **push 真證到**(api `sha256:5a8d48cd…` / web `sha256:1d543670…` —— 之前四輪只證到 `login`,冇 image 可推)。params tag = **`dev-0d01f0c`**,`what-if` 重跑同 baseline 一致。
>
> ⚠️ **三件唔可以靜靜當佢消失**:①呢條路**繞開**公司 proxy,唔係令部署鏈喺公司網跑得到 ⇒ **解法 ①(SP 攞 registry `read` + `scheduleRun/action`)仍然最乾淨,infra 唔應該撤走**(🔴 `AcrPush` **唔包** `scheduleRun/action`)②之前四條解法**全部 assume 咗「build 一定要喺公司網嗰台機做」而冇人立過呢個 assumption** ③F5 由 `az acr build` 改本地 `docker build` = **R3 deviation**,已 log。
>
> 🟢 **2026-08-06 已部署上 DEV(部署 #1)** —— 但 **🔴 唔可以講「部署成功」**,見下面 B7。
> **B4**:`az deployment group create` 撞 `LinkedAuthorizationFailed`(SP 冇 `managedEnvironments/join/action`;env `acaen-rapo-dev` 住喺**另一個 RG** `RG-RAPO-ContainerAPP-DEV`,SP 實測**只有** `[Contributor] RG-RAPO-UOP-DEV`)。
> 🟢 **繞過 = `az rest --method patch`,body 唔含 `environmentId`**。🔴 **`az containerapp update`/`registry set` 一樣 403**(CLI read-modify-write 會連 `environmentId` 送返去)⇒ **一定要 raw ARM PATCH**。腳本 = **`deploy/azure/patch-deploy-dev.ps1`**(無參數 = dry-run 印 masked body;`-Send` 先真送)。
> 🟢 **PATCH 比 ARM full PUT 更安全** —— 唔 unset 冇送嘅 property ⇒ infra 配嘅 `customDomains`+SNI / `workloadProfileName` **結構上掂唔到**(實測完好)。`aca-dev.json` 保留做宣告式真相。
> **實測**:api `--0000002` `Healthy`/`RunningAtMaxScale` · web `--0000001` `Healthy`/`Running` · 🟢 **ACA 由 VNet 內 pull 到 registry**。
>
> 🟢🟢 **B7 已解封(infra 2026-08-06 畀咗 `managedEnvironments/read` + enable log)⇒ 三個未知數全部收齊**。container log 原文:
> ```
> 04:14:26 [entrypoint] prisma migrate deploy
> 04:14:27 19 migrations found in prisma/migrations
> 04:14:28 The following migration(s) have been applied:
> 04:14:28 [entrypoint] seeding (idempotent upserts)
> 04:14:30 Seeded 24 OpCos + admin + RHK OPCO_IT user.
> 04:14:31 [NestApplication] Nest application successfully started
> ```
> **零 `WARN: migrate deploy failed` · 零 `WARN: seed failed` · 零 Error** ⇒ **B3(ACA 連 private endpoint PG)✅** · **PG v18 migration(G8)✅ 19 個全部 applied** · **seed ✅ 精確 24 個 OpCo**。
> ⚠️ **陷阱以後仍然成立**:`docker-entrypoint.sh` 令 migrate/seed 失敗 **NON-FATAL** ⇒ revision `Healthy` **證明唔到 DB 通**,驗證一定要睇 log 或 HTTP。
> 🟢 **B9(SSO)—— 2026-08-07 靠改設計解封。code 齊,但仍未 live 驗過,而家仍然行緊 break-glass `admin@uop.local`。**
> **舊前提已作廢,唔好照 W44 前四日嗰套做**:ADR-0003(MSAL SPA)嘅三個硬需求(SPA platform / Application ID URI / `access_as_user` scope)infra 個 app 三樣都冇,而**三輪往返都攞唔到 Application ID URI**。查證揭到重點:**佢哋配嘅嘢本身就係另一條路嘅完整形狀** —— client secret ✅ + redirect URI ✅ + confidential client ✅。**Chris 拍板** ⇒ **ADR-0028 Accepted**(server-side authorization code exchange,**supersedes ADR-0003**;ADR-0002 唔推翻,驗證邏輯移去 callback endpoint)。
> **而家嘅 flow**:前端只送人去 Entra + 交返 `code` → **API 用 client secret 喺 server 側換 token** → 驗 `id_token`(aud = client id,**唔需要任何自訂 scope**)→ upsert `AppUser` → 發**平台自己**嘅 httpOnly cookie ⇒ **SSO 同 break-glass 由 `auth.service.grantSession` 開始完全一樣**。三條 route:`GET /auth/sso/status` · `GET /auth/entra/start` · `POST /auth/entra/callback`。
> 🔴 **`VITE_ENTRA_*` 已經冇咗,MSAL 兩個 dep 已移除。** 四個 `ENTRA_TENANT_ID`/`ENTRA_CLIENT_ID`/`ENTRA_CLIENT_SECRET`/`ENTRA_REDIRECT_URI` 由 **API runtime** 讀 ⇒ **改配置唔使重 build web image**(舊設計嗰個「估錯要重 build 10 分鐘」嘅風險已消失)。範本喺 `apps/api/.env.example` 認證段。
> ⚠️ **兩個「紅得靜」陷阱已處理,但形狀要記住**:①guard(`resolveSessionUser`)同 `refreshSession` 原本硬性 `authProvider:'local'` —— 唔拆嘅話 SSO **登入睇落成功**然後每個 request 401,錯誤指向 token 唔指向 provider 過濾 ②state cookie 喺 callback **驗證之前**就清,免得失敗後 reload replay 用過嘅 code。
> 🟢 **F9-7(PATCH 四個 env)一早做咗** —— 2026-08-12 打 `/api/auth/sso/status` 返 `{"enabled":true}` 先發現(**唔係新做,係發現咗做過**)。🟢 **F9-8 嘅 break-glass 嗰半 2026-08-13 收咗**(`F6-6`)。🟢🟢 **SSO 嗰半 2026-08-13 收咗 —— Chris 本人測試確認可以登入** ⇒ **`F9-8` 全收,`AUTH-2b`(掛咗一個月)同時 closed**。🔴 **證據來源分清楚**:break-glass = AI tool 驗;**SSO = Chris 人手驗**(Entra 互動要真人 + MFA,AI 結構上做唔到)——兩者都算數但唔可以寫成同一種(沿用 `CH-015` 先例)。
> 🟢 **可回退**:`login.tsx` 本地表單永遠喺;SSO 未配置 → `/auth/sso/status` 返 `{enabled:false}`,個掣自動暗住。
> 🟢 **Graph app 權限齊**(`LicenseAssignment.Read.All` / `User.Read.All` / `LicenseAssignment.ReadWrite.All`)⇒ F3-7 接真 Graph 冇障礙。🔴 client secret **exp 2028-07-28** 要入 RISK。
> 💡 **測 Entra 一定要用真瀏覽器** —— 命令列打 authorize endpoint 會攞到「200 冇錯誤」嘅**假陽性**(現代登入頁係 SPA,錯誤由 JS 畫)。跑一個**故意錯**嘅對照 case 先信自己個測試。
>
> ⚠️ **呢台機嘅 az session 唔穩定** —— 一日內撞過 **4 個唔同 SP**(`d2f094a3` / `a19dfe76` / `2ae44f00` / ACR `4a6e1474`),錯身份會畀出**誤導性 error**(403 睇落似權限未落,其實係身份唔啱)。⇒ **做 az 操作一律用獨立 `AZURE_CONFIG_DIR` 登入 SP**(憑證喺 `apps/api/.env` 尾段)。
> 🔴 **B8(新)= 企業 DNS 冇我哋條記錄**。2026-08-06 由**公司網絡**(DNS `10.160.92.1`)實測:`rapo-n8n-uat.rci-t.com` → **`10.160.71.243`** ✅ 但 `rapo-uop-web-dev.rci-t.com` → **Non-existent domain** ⇒ **infra 漏咗建** ⇒ custom domain **連喺企業網都訪問唔到**。⚠️ 之前「ACA 綁 custom domain 要 hostname 驗證 ⇒ DNS 應該配好」呢個推論**已被一條 `nslookup` 推翻**。
> ⛔ ~~🟢 **B8 唔 block 驗證** —— 由**公司網絡**打 **ACA 預設 FQDN**(internal env 喺 hub VNet private DNS 一定有記錄):`https://aca-rapo-uop-web-dev.nicesea-c3849dba.eastasia.azurecontainerapps.io/` + `/api/docs/api` ⇒ **F6-4/5/6 即刻收得**,custom domain 嗰半留 B8 解封後補驗。~~
> 🔴 **上面成句已被實測推翻(2026-08-10),原文保留做方法論記錄。** 個「**一定**」係推論唔係實測 —— ACA 預設 FQDN **一樣訪問唔到**(env `internal=true`,`staticIp=10.160.71.70` 私有 IP,靠嘅 private DNS zone **冇 link 到企業網**);而「F6-4/5/6 即刻收得」跟住錯,**被當成事實用咗四日**。
> 🟢 **實際結局(2026-08-12 / 08-13)**:`F6-5` / `F6-6` / `F6-14` 全部**經 custom domain `https://rapo-uop-web-dev.rci-t.com/`** 收咗,**ACA 預設 FQDN 由頭到尾冇用過一次**。⇒ **凡要 live 驗,第一件事係真打一次 custom domain**(30 秒,兩個結果都有路行)。
> 🔴 **仍要一次直接驗證先收尾**(row count / admin 帳號 / API 200):**最快 = 上面條 ACA FQDN**;其次 ①infra 畀 `managedEnvironments/**read**`(純唯讀,比 join 細)②Chris 個人帳號睇 Azure Portal log。
> 💡 **方法論(值得帶去下一個環境)**:直接路封死唔等於冇路 —— **部署權限 / 觀測權限 / metrics 係三套唔同嘢**,而 metrics 一直喺我哋 RG Contributor 範圍內,四日嚟冇人諗過用。同 Day 3「有咩前提我根本冇寫落嚟」同一族。
>
> ⚠️ 仍未掂:**n8n 雙向**(base URL = `http://rapo-n8n-uat.rci-t.com/`,🔴 **http 明文** = B6)。
> ADR-0027 · `docs/13-deployment/09-dev-as-built.md` · `W44-azure-dev-deploy/`。

> 🔴 **W43 最要緊嗰三件(ADR-0025 / 0026)**:
> ① **onboarding intake 收貨即刻自己建一張 `O365 User License Maintenance Request`**(catalog `order_now`/cart,**唔係** Table API insert —— `sc_request` insert 403,BUG-010)。once-guard = **line item 自己嘅 `serviceNowSysId`**;冇佢嘅話 n8n 每重推一次就開多一張**真飛**,而平台側完全睇唔出。
> ② **assign 由單閘變雙閘**:`azureSyncedAt`(Graph)**同** `serviceNowUserSyncedAt`(SN 有冇呢個人)。兩個都**冇得 override** —— `budgetOverrideReason` override 唔到,因為 sync gate 唔係決定,係「呢個人存唔存在」嘅事實。sweep 一個 vendor 一個 abort flag。
> ③ 🔴 **`target_user` 永遠指住 requester,唔會變**(ADR-0026):`sc_item_option` update **403 ACL**,回填已經拆走,改行 work note。真 target 一律睇 `target_users_email`。
> 🔴 **ServiceNow 逐個 table 分開開權,唔可以由「某張表寫得」推論「另一張寫得」**:`sc_request` insert **403** · `sc_item_option` update **403** · `sc_req_item` / `sc_task` update ✅ · catalog `order_now` ✅。
> 🔴 **UOP 同 n8n 共用 SN 帳號 `n8napiservice1`**(RISK **R7**)⇒ `sys_updated_by` / `assigned_to` 永遠分唔到邊個系統做,**唯一指紋係 `close_notes`**。ADR-0024 D5 個 rationale 就係喺呢個歧義上寫錯咗。查 SN 側「邊個做過乜」一律唔可以信 `sys_updated_by`。
> ⚠️ **SKU Catalog 而家有三個 CSV 動作,唔好撈亂**:①`Export CSV`(CH-018)= 攞走成個 **active** catalog;②`Import CSV`(CH-019)= 改完傳返上去**批量 curate**(對帳鍵 = `SkuId` GUID,只寫 alias / category / base,**永不新建 SKU**,dry-run 先行);③`Download template`(Settings → Integrations,W35 F2)= **allocation** 範本,pre-fill curated alias 同現有數字,拎去改 seat 數 —— 佢同 ①② 係**完全唔同嘅檔同唔同嘅 endpoint**。三者都**只有 active SKU**(`catalog.service.ts:112` 硬 filter)。
> 🔴 **改 `businessAlias` 有一道 fail-closed 閘**(CH-019 / ADR-0023 D5):任何令**兩個 active SKU 撞同一個 alias** 嘅改動 —— 批量 import **同**單筆 `PATCH catalog/:id` —— 一律 **400 整批唔寫**。原因係 `businessAlias` schema 冇 unique constraint,而前端範本 first-wins(`allocation-template.ts:63-67`)、後端 import last-wins 兼冇 `orderBy`(`matrix-csv.ts:86-90`)⇒ 撞咗會**靜靜**把 allocation 寫落錯嘅 SKU。**清空 alias**(→ null)唔算撞、唔會被擋,但批量清要 `confirmClears`(清咗嗰個 SKU 退出 import scope,而佢 ledger 舊數會**凍結**留低)。
> 🔴 **Ledger 有兩個 reset,名近似而風險唔同級**(CH-016 / CH-017,對照表 → `CH-017-ledger-full-reset/spec.md §2.2`):`POST /license/ledger/allocation/reset`(ADMIN+REGIONAL)只清 `allocatedQuantity`,**重新 import 救得返**;`POST /license/ledger/reset`(**ADMIN only** + 打字確認)連 `assignedQuantity` 一齊清,**任何 import 都救唔返**(ADR-0004 #5),只能重跑 `npm run baseline:assigned`。改任何一個之前先睇清楚係邊個。
> ⚠️ **dev DB 現況**:`150 rows | alloc 41 | assigned 5971 | adjustments 14` —— RTW 一個 OpCo 已被 CH-017 驗證 full reset 過(其餘 23 個完好)。全平台清空係 Chris 自己撳,順序見 `CH-017/progress.md` closeout。
> 🟡 **前端驗證:睇你今次 session 有冇 browser tool,唔可以當佢一定喺度。** 2026-08-02 有 **Playwright MCP**(`mcp__plugin_playwright_playwright__*`)嗰陣 AI 自己 render 得到、light/dark 都截到圖;但 **2026-08-04 實測同一個 repo 冇咗** —— 只剩 `claude-in-chrome`,而佢 `list_connected_browsers` 返 `[]`。⇒ **開工先確認,唔好假設**;真係冇就**照寫「未 render 驗」,唔可以用「token 兩邊都有定義」冒充**(W43 F5-3 / G9 就係咁留低)。⚠️ 有 Playwright 嗰陣佢會喺 **repo root** 掉低截圖同 `.playwright-mcp/`,**收工要清**。

> 🔴 **`apps/api/.env` 喺主 checkout(`C:\Users\CLai03\unified-operation-platform`)係有嘅,而且入面係真憑證**(真 `ricohapdev` ServiceNow + 真 Graph tenant + 真 ACS)。2026-07-31 實證:live 打真 SN / 真 Graph 完全做得到。⚠️ 之前呢度寫住「本 worktree 冇 `.env`」—— 嗰句只對**另一個 worktree** 成立,喺主 checkout 讀會令你以為做唔到 live 驗證。**開工前自己確認一次係邊個 checkout。**
> 🔴 **port 3100 跑緊嘅唔一定係本 worktree** —— 驗證前**必查 process ancestry**(AP-11,W36 同 W38 各中過一次)。
> 🔴 **`POST /requests/intake` 而家有兩張合約**(CH-020 / ADR-0024 D2),靠 **body 有冇 `mode`** 分流:冇 `mode` = W24 嗰張 locked canonical(`N8nIntakeRequestDto`,**一個字冇改**);`mode: 1` = n8n 1001 今日實際送嘅 flat 形狀(`N8nFlatIntakeDto`);其他值 **400 fail-closed**。**被共用嘅係 URL 唔係 contract** —— 唔好「順手」把 canonical 兩個 required 欄放寬,`serviceNowSysId` 係 `@unique` idempotency key。Flat 路多兩個 line item 欄 `serviceNowTaskSysId`/`serviceNowTaskNumber`,**刻意唔喺 canonical DTO 出現**。<br>🔴 **W43 更新(ADR-0025 D1)**:嗰兩個欄由「驅動 by-task close」改成**純 traceability,唔再驅動任何嘢**(欄冇 drop)。**by-task close 已停用** —— 實測 n8n 自己閂埋 WDA task,留住嗰條分支只會令每次 assign 都 PATCH 一張已閂嘅 task,被 `active` 閘正確拒絕,再為一個唔存在嘅問題開一條 Delivery failure。`mode` 分流本身**一個字冇改**。
> 🔴 **seam ④ 收 `TicketTarget` union 唔再收 bare sys_id**(`{kind:'ritm'|'task', sysId}`)。`task` 分支 **patch 之前一定要驗 `active=true`**,fail closed —— n8n 會送已閂 task(REQ0044049 實例)。改呢度之前睇 `direct-ticket.provider.ts` 個 `openTask()`。
> ⚠️ **維護**:呢段同 `CLAUDE.md §0/§9` 每次 closeout 一齊掃 —— 兩份都係無條件注入每個 session,過時 = 下一個 session 用錯前提開工(2026-07-31 實犯)。

**開發路線全鏈完成(詳細歷史 → `BACKLOG.md` + memory `MEMORY.md`,此處唔重複)**:
- **後端業務層**:W02 C(catalog+對帳)/ W03 D-1(intake)/ W04 D-2(assign+ledger)✅ · **前端全鏈**:W05 scaffold / W06 FE-1(Overview+Catalog)/ W07 FE-2(Requests+detail 讀寫)/ W08 FE-3(Drift + BE-graph-harden)✅ · **BUG-002 ✅**(Graph error wrap→503)。
- **AUTH 全鏈 ✅**:W09 AUTH-1(後端 Entra JWT + `@Roles` guard,ADR-0002)→ W10 AUTH-2a(FE MSAL scaffold,ADR-0003 — ⚠️ **2026-08-07 已被 ADR-0028 推翻,MSAL 已由 `apps/web` 移除**)→ W11 AUTH-3a(OPCO_IT 後端 per-OpCo scope)→ W18-21 AUTH-4a/b/c(本地登入 / user 管理 / 密碼生命週期 / session hardening,ADR-0005/0006)→ W22 AUTH-3b(FE 真 role scope)→ **W44 F9 SSO server-side code exchange(ADR-0028)**。
- **FE-Assets 鏈 ✅**:W13-17(allocation import[ADR-0004 curation-as-scope]+ ledger read/write + By-OpCo inline edit[ADR-0007])。
- **ADR-0008 request 建單 rollout 全 4 階段 ✅**(2026-07-15):W24 **甲** inbound intake(n8n→平台 `POST /requests/intake` m2m)/ W25 **乙** outbound direct(平台→SN + 前端 `/requests/new`)/ W26 **丙** n8n outbound(`N8nWorkflowProvider` env 選路)/ W27 **丁** D365 scope(平台早 SKU-agnostic → confirm+test+doc)。

**當前 pending(rolling JIT,待 Chris 揀)**:🔴 **AUTH-2b**(真 SSO e2e — ⚠️ **唔再卡 IT 開 SPA app reg**:ADR-0028 之後現有 app registration 直接用得,code 亦已齊;✅ **2026-08-13 closed** —— `F9-7`(四個 `ENTRA_*` env)**一早做咗**、break-glass **AI tool 驗**(`F6-6`)、**SSO Chris 本人測試確認可以**。🔴 **兩半證據來源唔同要標明**(SSO 嗰半 AI 結構上做唔到 —— Entra 互動要真人帳號 + MFA;沿用 `CH-015` 先例)。⚠️ 由 **08-07 ADR-0028** 起就唔再係技術阻塞,**掛咗六日淨係差一撳**。`W10/AUTH-2b-RUNBOOK.md` 個 MSAL 前提**已過時**)· **DEPLOY**(生產部署 + 真數 curation)· honest-gap 三項(activity feed / Drift Resolve / AI-Assist)· 🟡 AUTH-4c-C(email reset)/ DD-2(npm vuln)。
**Deploy-time carry(非 repo)**:真 SN/n8n 建單合約對齊(`docs/05-usage/SERVICENOW-CONTRACT-ALIGNMENT.md` 🅐–🅙 待 SN owner 填)· 真 D365 SKU curation(`W27/CURATION-D365.md` runbook)。

**誠實資料原則**:缺 endpoint(handler name / AI parse / My queue …)一律 EmptyState/coming-soon/略去,絕不砌假數。前端 = **H6 保護**,token-only 唔 eyeball,**寫前對 prototype render 睇**(computed 查證,唔靠畫面名估),跑 `ui-design` skill,vite dev 5173 —— 見 [[ui-design-fidelity]]。

**提醒(完整見 CLAUDE.md §5)**:掂 H1-H8 第一句 **STOP+ask**(H1 架構 / H2 vendor / H3 scope / H4 security / H5 test / H6 UI design fidelity / **H7 tool-result integrity**:絕不作 tool 輸出 · send tool 即收口 · 講 pass/done/rendered 前 trace 一個真 tool_result,見 `docs/03-implementation/incidents/INC-001` / **H8 tool-usage discipline**:讀檔/搜尋用 Read/Grep/Glob 唔用 bash cat/grep · 唔 echo 拼裝 · 單一重定向)。**繁中回覆**。非 trivial 工作先 pre-doc gate(R1)。

**Runtime 實況(避坑,CLAUDE.md 冇)**:
- **起後端**:`docker compose up -d`(postgres **5433** + redis)→ `apps/api/.env`(gitignored)→ root `npm run start:dev` → `http://localhost:3100/docs/api`。
- ⚠️ **Prisma engine CDN(`binaries.prisma.sh`)俾公司 proxy 封(503)**:clean reinstall(刪 node_modules)後要**轉流動網路**跑一次 `npm run prisma:generate` + `prisma migrate` cache engine。其他 TLS 用 `NODE_EXTRA_CA_CERTS=C:/Users/CLai03/ricoh-ca.pem`。
- ⚠️ **Port**:3000 俾 Langfuse 佔 → 用 `PORT=3100`;5432 俾既有 Postgres 佔 → docker postgres host 5433。
- **Auth**:controllers 全域 guard(`@Roles`);OPCO_IT per-OpCo scope(AUTH-3a/3b)+ 本地登入/密碼/session(AUTH-4a-c)。🔴 **兩個 provider 只有一種 session** —— break-glass 同 Entra SSO 都發同一個 httpOnly `uop_access`/`uop_refresh` cookie(ADR-0028);guard 唔再按 `authProvider` 分流。**前端零 token、零 auth library**(MSAL 已移除)。**本地要 `AUTH_DEV_BYPASS=true`**(api `.env`)+ **`VITE_AUTH_DEV_BYPASS=true`**(web)否則 `/api` 401 / FE gate 去 login。扮 OPCO_IT 加 `AUTH_DEV_USER_EMAIL=opco.it.rhk@rapo.com.hk`。**真 SSO e2e 仍未驗**(W44 F9-8)。ADR-0002/**0028**/0005/0006(**ADR-0003 已 superseded**)。
- **Request 建單(ADR-0008)**:inbound intake `POST /requests/intake`(m2m `X-Intake-Key`,`INTAKE_API_KEY`);outbound `POST /requests` provider 由 **`REQUEST_SUBMISSION_PROVIDER=direct|n8n`** 選(default direct→SN Table API / n8n→webhook `N8N_OUTBOUND_WEBHOOK_URL`+`_KEY`)。**代表性合約**,真上線待 `docs/05-usage/SERVICENOW-CONTRACT-ALIGNMENT.md`。
- **Demo harness**:`apps/api/scripts/demo-harness/`(npm `demo:mock-sn`/`demo:mock-n8n`/`demo:cleanup`)—— dev-bypass + mock 底下 live 跑 ADR-0008 request 雙向閉環(甲/乙/丙 + assign 回寫),零新 dep;runbook 見該 folder README。
- **SKU 一律用 `skuId`(GUID)唔靠名**;assign 前必過 `azureSyncedAt` sync gate(`findUser` null = 未 sync)。
- **UI**:token-only,唔 hardcode / eyeball;寫前跑 `.claude/skills/ui-design`;視覺真相 `design_handoff_licenseops/`。
- **git push**:upstream 已設,直接 `git push`;public→已轉 private,唔好 push 真實 secret(`.env` 已 ignore)。

**Detail on-demand**:`session-start.md`(詳版)· active phase folder(hook 自動注入)· `docs/02-architecture/design-system.md`(UI)· memory `MEMORY.md`。
