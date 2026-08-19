---
phase: W49-agent-dock
status: active
derived_from: plan.md v1.0(Chris Lai approved 2026-08-19)
---

# W49 — 全站 agent dock · Checklist

> Derive 自 `plan.md §2`。**唔可以刪未勾嘅項** —— 只可以 `[ ] → [x]`,或者加 🚧 + 理由 + target。

## `F0` — 開工前提

- [x] F0-1 ✅ `OQ-A` / `OQ-B` **Chris 2026-08-19 照建議拍板** ⇒ plan `draft → active`
- [x] F0-2 ✅ **`OQ-B` 揀①令「零後端改動」確立** —— 本 phase **零 schema · 零 migration · 零新 endpoint · 零 ADR**,純前端。🔴 **點解成立**:`D-CTX` 嘅後端半邊 W48 已經做咗(`agent-conversation.service.ts` `create()` 對 `requestId` 行 `findUnique` + `assertOpcoScope`,兼且 doc 逐字寫住「a HINT, never an authorisation」)⇒ dock 送咩上嚟都好,過唔到嗰道閘就係過唔到
- [x] F0-3 ✅ 🔴 **更正咗一個 plan 寫錯咗嘅前提** —— `§0.3` 同 scope report 都寫住「`Dialog` 會 trap focus」,而**實測 `dialog.tsx` 冇任何 focus trap code**,只有 `aria-modal="true"` 聲明。真正令底下撳唔到嘅係 **`fixed inset-0` + 45% scrim 攔截 click**。📌 **點解呢個更正重要**:「唔好 trap focus」assert 唔到,而「冇 `inset-0` · 冇 scrim · 冇 `aria-modal`」**逐樣都 assert 得到** —— 一個籠統概念換成三條可觀察嘅嘢
- [ ] F0-4 🚧 **`OQ-C` 仍然未答**,用建議做 default(兩個都留)。🟢 **`OQ-D` 2026-08-19 答咗 = overlay** —— **同 `F1` 落地嗰個 default 一致 ⇒ 零返工**,`drawer.tsx` 同 `design-system.md §2` 七條約束一個字唔使改。🔴 **但唔好把「零返工」記成「估中咗所以慳咗」** —— 真正令佢平嘅係嗰個 default **寫咗入 design-system**,即估錯嘅代價本來就只係**撞返一次 H6**,唔係靜靜漂走。⚠️ `OQ-C` 遲答唔貴(只影響已經被 `OQ-A` 閂住嘅 `F4`)

## `F1` — `Drawer` primitive(**H6**)

- [x] F1-1 ✅ **H6 STOP → owner 批** —— Chris 2026-08-19 講「開始 F1」,而 `plan §0.3` 同 `F1` 標題都標住呢個係新 primitive ⇒ 當作批咗開。⚠️ **批咗嘅係「開呢個 primitive」,唔係「批咗某一個具體形狀」** —— `OQ-D` 仍然未答,所以 default(overlay)**寫咗入 `design-system.md §2`**,將來改就會再撞一次 H6
- [x] F1-2 ✅ **`design-system.md §2` 寫低約束** —— `overlay / feedback` 行加咗 `Drawer` + 一整段約束(跟 W47 `Textarea` 先例)。🔴 **七條約束,而寫法本身係本項要記嘅嘢**:唔寫「唔好 trap focus」(assert 唔到),寫**三樣具體避開嘅嘢** —— 冇 `inset-0` · 冇 scrim · 冇 `aria-modal`。另外四條:`Esc` 收但唔搶 focus(同 `Dialog` **刻意相反**)· 深度靠 `border-l` **唔加陰影**(`Dialog` 個 `shadow-overlay` 唔可以抄 —— 一個長開嘅面板掛住陰影 = 每一版加咗一個視覺層)· 寬度係**常數唔係 prop**(caller 揀寬度 = 每個 caller 各自漂)· **DS-3「一 view 一 primary」唔可以因為多咗個 dock 就破**
- [x] F1-3 ✅ **`drawer.tsx`** —— `role="complementary"` · `fixed bottom-0 right-0 top-0`(**唔係 `inset-0`**)· 冇 scrim · 冇 `aria-modal` · `z-40`。🔴 **z-index 排序有論據**:`Dialog z-[90]` > `Toast z-50` > **`Drawer z-40`** > 頁面 —— 一個長開嘅 chrome **唔應該蓋住 transient 通知**,而真 modal 仍然要蓋得住佢
- [x] F1-4 ✅ **8 條 test,而佢係本系統第一個有 test 嘅 primitive** —— 🔴 **點解只有佢要**:其餘 primitive 靠 render 驗就夠(色 / 半徑 / 間距睇得到),而 `Drawer` 嘅約束係**行為**,`aria-modal` / scrim / `inset-0` 喺截圖入面**完全睇唔出**。⚠️ **明文寫低咗呢份 test 證明唔到咩**:jsdom 冇 Tailwind ⇒ 冇真 geometry ⇒ 呢八條係**結構前提**,`G2`(dock 開住底下撳得郁)要 `F2-2` live 先驗得到
- [x] F1-5 ✅ **falsification 三道,逐道拆唔一次過拆**(一次改三個就分唔清邊條對應邊個,亦驗唔到零誤傷)—— ①加 `inset-0` ⇒ **1 紅 7 綠**(`not to match /\binset-0\b/`)②加 scrim wrapper ⇒ **1 紅 7 綠**(`expected 'DIV' to be 'ASIDE'`)③加 `aria-modal` ⇒ **1 紅 7 綠**。**三道紅嘅原因逐個對位**
- [x] F1-6 ✅ **light + dark 真 render 喺 `F2-5` 做咗**(押後嗰半收返)—— 押後理由成立:`Drawer` 係 `fixed` 面板,冇 caller 就冇嘢喺畫面。⚠️ **押後嗰刻嘅 deviation 已記 changelog**,而**押後換到嘢**:`F2-5` 影到「開 + 收 × light + dark × sidebar 展開 + 收埋」六個組合,`F1` 嗰刻淨係影到一個空面板

## `F2` — Layout 掛載

- [x] F2-1 ✅ **掛喺 `AppShell` 一次**(`<AgentDock />` 喺 shell root,launcher 喺 `TopBar`)。🔴 **三個決定,而中間嗰個先係 `OQ-D` 嘅實際意思**:①每版自己掛 = navigate 就關,兼且漏咗嗰啲版就係 dock **靜靜唔存在**嘅版 ②**佢係 layout 嘅 sibling,唔係入面一個 column** —— 做 flex child 就會把主欄推窄,即係全站每張表都多一個斷點要驗(= push 嘅代價)③launcher 用 **`IconButton` 唔用 `Button`**:**DS-3** 一 view 一 primary,而 dock 係每一版都喺度嘅 chrome ⇒ 一個紅掣釘喺 top bar = **一次過喺所有版加多一個 primary**
- [x] F2-2 ✅ **`G2` 收咗,而且係「真撳」唔係「量度」** —— dock 開住,撳 Requests 表第一行 ⇒ **URL 由 `/requests` 變 `/requests/cmsq0p4ou…`**。⚠️ 之前一步嘅 `elementFromPoint` 只係**結構前提**(命中 `TD`、`hitIsInsidePanel: false`),真收貨標準係嗰下 click。順帶三個 live 事實:`fullScreenOverlays: 0`(**真量度「有冇嘢覆蓋全屏」,唔係揾 class 名**)· `docScrollWidth 1440` = viewport(零橫向溢出)· `activeElement` 仍然係 launcher(dock 冇搶 focus)。🟢 **順帶收埋 `F2-4` 一半**:click 之後換咗 route,而 dock **仍然開住** ⇒ store-level persist 喺真 router 下面成立
- [x] F2-3 ✅ **`canUseAgent` gate,而做法係「一個 predicate 兩個 export 共用 + 一條 source scan」**(`R5`)。🔴 **點解唔係淨係收埋個掣**:咁樣道閘就變成**個掣嘅屬性**而唔係**個功能嘅屬性**,而 `F3` 會由 route 開呢個 panel ⇒ 到嗰陣「淨係經 launcher 入到」就係一句**冇人驗過嘅話**。🔴 **`undefined` 明文喺 gate test 個 list 入面** —— 佢係 `GET /me` 仲飛緊嗰陣嘅真實狀態,一個只處理已知 role 嘅 gate 會喺**每次冷載**閃一閃
- [x] F2-4 ✅ **開合狀態 persist = state 喺 store 唔喺 component**(切 route 唔會關),一條 remount test 釘住。🔴 **刻意唔落 localStorage**:`theme` / `sidebarCollapsed` 都冇,一個淨係佢自己 refresh 之後返嚟嘅 dock 就係**唯一一個唔一致嘅嘢**。**零橫向溢出**結構上成立(`fixed` + `right-0` + `max-w-[92vw]`,唔參與 layout);⚠️ **sidebar 收埋 / 展開兩個狀態要 `F2-5` 影**
- [x] F2-5 ✅ **light + dark × 開 + 收 × sidebar 展開 + 收埋 全部 render 過**(含 `F1-6` 押後嗰半)。🔴🔴 **而呢一步揾到兩個 test 結構上睇唔到嘅缺陷,兩個都關 geometry**:

  **① `Drawer` 全高 ⇒ 蓋住 top bar 右邊三個控制,包括佢自己個 launcher**(**H6 STOP → Chris 揀 A**)。實測 1440px 之下 dock 佔 x=1060–1440,而 `Toggle theme`(1109–1143)· `Account menu`(1362–1422)· **`Dock launcher`(1063–1097)** 全部落喺嗰度 ⇒ 一個 `aria-expanded` toggle **開得埋唔得**。⇒ `DRAWER_TOP_OFFSET = 56`,dock 由 top bar 下面開始。修完重驗:**六個控制全部 `blocked: false`** · `seam: 0`。
  ⚠️ **呢個唔係推翻 `OQ-D`** —— overlay 問嘅係「**內容**推唔推窄」,而 top bar 係 chrome。收窄嘅係「由邊度開始」。
  🔴 **佢引入咗一個新 drift 風險兼且守咗**:`56` 而家喺兩個檔各寫一次,而**冇任何嘢連住佢哋** ⇒ `drawer.test.tsx` **讀返 `top-bar.tsx` 對數**(falsification:把 top bar 改成 `h-[64px]` ⇒ **1 紅**,`expected 56 to be 64`)。同 BUG-011 / W45 `apiPatch` **同族** —— 兩個實作各自正確,而縫喺中間。

  **② dock 個 `Open the Assistant` 用咗 `text-accent` ⇒ 破咗 DS-3**,而**破佢嗰個就係寫呢條約束嗰個人**。實測 request detail:accent background `Check now`(該版 primary)**同** accent text `Open the Assistant` 同時存在。改成中性 underline link 之後 `accentTexts: []`。📌 **教訓**:`design-system.md §2` 第七條(「DS-3 唔可以因為多咗個 dock 就破」)**係我自己 `F1` 寫嘅**,而第一個 caller 就違反咗 —— ⇒ 嗰條約束唔係多餘,但**寫低一條約束唔會令你跟到佢**,要 live 睇。

  🔴 **順帶量到一個唔修但要記住嘅代價**:request detail(two-column)有 **5 個互動元素**落喺 dock 覆蓋範圍(`Check now` · `Mark synced` · `Edit` · `Hide` · `Transcript`)。**點解呢個接受而 top bar 嗰個唔接受 —— 分界線係「出唔出返嚟」**:top bar 嗰個連收 dock 個掣都蓋埋(死局);呢個收咗 dock 就用得返(trade-off)。⚠️ **但 `F3` 之後 dock 會由 request detail 送 `requestId`** ⇒ **用戶最想開 dock 嗰版正正就係最受遮嗰版**,呢個張力未解決 ⇒ 登 plan `§4 R7`

**`F2` falsification 三道(逐道拆)**:①拆走 `AgentDock` 個 gate ⇒ **2 紅 11 綠**,而兩條紅**喺唔同層**(behavioural:`OPCO_IT` 照見到 panel · source scan:gate 唔見咗)②加一個冇 gate 嘅第三個 export ⇒ **2 紅 11 綠**,錯誤訊息**逐字點名** `AgentDockBadge does not call useDockVisible()` ③把 `dockOpen` 由 store 搬去 `useState` ⇒ **2 紅 11 綠**,兩條都落喺 `F2-4`。
🔴 **第三道順帶揾到兩件要記低嘅事**:**(a)** 第一次拆出咗一個 **crash**(`useState` 冇 import)⇒ **每條都紅而紅嘅原因全部一樣**,即嗰次驗唔到任何嘢 —— **falsification 拆嘢拆出 crash 就唔算數**,要補返先重跑 **(b)** 同一個 mutation 之下,`renders no panel … even when open` **變成 vacuously green**(panel 永遠唔開就冇嘢可以捉)⇒ **一條 test 有冇意義,係睇佢對邊個 mutation 講嘢**,唔係睇佢自己寫得幾嚴謹

## `F3` — Context passing(`D-CTX`)

- [x] F3-1 ✅ **新 `lib/route-context.ts`** —— 純函數,由 pathname 推導 `{ kind, id } | null`;dock 顯示佢(request number,攞唔到就退返個 id)兼且把 id 當 **query param** 交畀 `/assistant`,而 `/assistant` 開新對話送上去。🔴 **`OQ-B` 答①整個住喺呢個檔嘅 TYPE 入面** —— 答②會把「冇 scope 概念嘅 UI state」變成 agent 資料來源。⚠️ **`/requests/new` 明文排除**(佢同 detail route 形狀一模一樣,唔排除就會送一個叫 `new` 嘅 request id)
- [x] F3-2 ✅ **新 `agent-conversation.scope.spec.ts`(7 條,真 controller + 真 service,只 mock DB)**。🔴 **開工先揾到嗰條縫嘅確切位置**:`agent-conversation.service.spec.ts` 有「checks the request exists」(**404**),而**全 repo 冇一條驗「request 存在但屬於第二個 OpCo」(403)** —— 危險嗰個 id 唔係揾唔到嗰個,係**揾得到**嗰個。**falsification 拆 `assertOpcoScope` ⇒ 2 紅 42 綠**,而值得記嘅係邊啲冇紅:**本來已經存在嘅三個 `agent-conversation` suite 全部照綠** ⇒ 拆走一道真安全閘而三份 spec 冇反應,就係 `R2` 講嗰條縫嘅實證
- [x] F3-3 ✅ **live 做咗,而佢推翻咗本條自己嘅前提 ⇒ 登 `plan §4 R8`**。用 seed 個 `opco.it.rhk@rapo.com.hk`(`AUTH_DEV_USER_EMAIL` shell env,**`.env` 一個字唔改**)⇒ `/me` 確認 `OPCO_IT` scoped `RHK`,送 PFU-HK 嗰張 request 個 id 上去 ⇒ **403,但係 `Insufficient role`(role guard)唔係 `Out of OpCo scope`**。
  🔴🔴 **三條 link 全部驗過**:①controller `@Roles(ADMIN, REGIONAL)` ②`normaliseScope` 第一句 `if (role !== OPCO_IT) return null` ⇒ **ADMIN / REGIONAL 被強制 null scope**(DB 實測 `ADMIN 1 / 0 with_scope`)③`assertOpcoScope` 係 `if (user.opcoScopeId && …)` ⇒ **過得到 role guard 嘅人一定觸發唔到佢**。
  🟢 **改為驗今日真正生效嗰條路**(ADMIN 身份,唯一變數 = `requestId`):**A** 唔存在嘅 id ⇒ **404 `Request not found`**(唔會靜靜開一條冇 context 嘅 thread)· **B** 真 id ⇒ **201 兼 `requestId` 逐字存低** · **C** `null` ⇒ **201**。
  📌 **`G4` 嘅意思由此改咗**:今日 `D-CTX` 嘅實際保護 = **role guard(邊個可以問)+ `findUnique` 個 404(一個唔 resolve 嘅 id 唔會變成 thread)**;`assertOpcoScope` **唔係 dead code,係 defence-in-depth**,但唔可以再當佢係今日嘅保護

## `F4` — dock 入面嘅 chat

- [ ] F4-0 🔴 **閘:等 W48 `F7-3`(conversation SSE 喺 DEV 真通)** —— `OQ-A` 嘅答案。⚠️ **呢條唔係卡工作量,係卡一個唔喺本 phase 嘅事件**
- [ ] F4-1 重用 W48 嘅 hook(`useAgentConversation` / `useAddConversationTurn` / SSE),**唔另開一份 local state**(`R4`)
- [ ] F4-2 🔴 **冇 approve 掣,兩條 test** —— behavioural + **source scan**。W48 `F5-4` 個教訓:第一條**只擋到一個串「Approve」嘅掣**,將來叫 `Accept` 嗰個一樣過
- [ ] F4-3 ⚠️ **SSE 斷咗要講一句**(`RISK R35`)—— dock 係**長開**嘅,撞「連斷 3 次永久靜默」嘅機會遠高過要自己撳入去嘅 `/assistant`

## `F5` — Gate + live

- [ ] F5-1 root `npm test` / `lint` / `build` 三個 exit 0 —— ⚠️ **收尾要重跑**(W47/W48 兩次教訓:勾咗嘅 gate 唔等於蓋住之後入嘅 commit)
- [ ] F5-2 `ui-design` DS-1…DS-12 逐條
- [ ] F5-3 本機 live:真開 dock 傾一段
- [ ] F5-4 DEV live
