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
- [ ] F1-6 🚧 **light + dark 真 render 押後到 `F2`** —— `Drawer` 未掛載到任何頁面之前 render 唔到佢。⚠️ **呢個係 deviation**(plan `F1` acceptance 寫住「light/dark 真 render」)⇒ 要記 changelog

## `F2` — Layout 掛載

- [x] F2-1 ✅ **掛喺 `AppShell` 一次**(`<AgentDock />` 喺 shell root,launcher 喺 `TopBar`)。🔴 **三個決定,而中間嗰個先係 `OQ-D` 嘅實際意思**:①每版自己掛 = navigate 就關,兼且漏咗嗰啲版就係 dock **靜靜唔存在**嘅版 ②**佢係 layout 嘅 sibling,唔係入面一個 column** —— 做 flex child 就會把主欄推窄,即係全站每張表都多一個斷點要驗(= push 嘅代價)③launcher 用 **`IconButton` 唔用 `Button`**:**DS-3** 一 view 一 primary,而 dock 係每一版都喺度嘅 chrome ⇒ 一個紅掣釘喺 top bar = **一次過喺所有版加多一個 primary**
- [ ] F2-2 🔴 **`G2` 真驗**:dock 開住嗰陣,底下嘅表**撳得郁** —— 呢個係 non-modal 嘅可觀察定義,唔係「睇落唔似 modal」。⚠️ **要起本機 stack**(`drawer.test.tsx` / `agent-dock.test.tsx` 兩個檔頭都明文寫住佢哋證明唔到呢條:jsdom 冇 Tailwind ⇒ 冇真 geometry)
- [x] F2-3 ✅ **`canUseAgent` gate,而做法係「一個 predicate 兩個 export 共用 + 一條 source scan」**(`R5`)。🔴 **點解唔係淨係收埋個掣**:咁樣道閘就變成**個掣嘅屬性**而唔係**個功能嘅屬性**,而 `F3` 會由 route 開呢個 panel ⇒ 到嗰陣「淨係經 launcher 入到」就係一句**冇人驗過嘅話**。🔴 **`undefined` 明文喺 gate test 個 list 入面** —— 佢係 `GET /me` 仲飛緊嗰陣嘅真實狀態,一個只處理已知 role 嘅 gate 會喺**每次冷載**閃一閃
- [x] F2-4 ✅ **開合狀態 persist = state 喺 store 唔喺 component**(切 route 唔會關),一條 remount test 釘住。🔴 **刻意唔落 localStorage**:`theme` / `sidebarCollapsed` 都冇,一個淨係佢自己 refresh 之後返嚟嘅 dock 就係**唯一一個唔一致嘅嘢**。**零橫向溢出**結構上成立(`fixed` + `right-0` + `max-w-[92vw]`,唔參與 layout);⚠️ **sidebar 收埋 / 展開兩個狀態要 `F2-5` 影**
- [ ] F2-5 **light + dark 真 render,dock 開同收兩個狀態都影**(含 `F1-6` 押後嗰半)

**`F2` falsification 三道(逐道拆)**:①拆走 `AgentDock` 個 gate ⇒ **2 紅 11 綠**,而兩條紅**喺唔同層**(behavioural:`OPCO_IT` 照見到 panel · source scan:gate 唔見咗)②加一個冇 gate 嘅第三個 export ⇒ **2 紅 11 綠**,錯誤訊息**逐字點名** `AgentDockBadge does not call useDockVisible()` ③把 `dockOpen` 由 store 搬去 `useState` ⇒ **2 紅 11 綠**,兩條都落喺 `F2-4`。
🔴 **第三道順帶揾到兩件要記低嘅事**:**(a)** 第一次拆出咗一個 **crash**(`useState` 冇 import)⇒ **每條都紅而紅嘅原因全部一樣**,即嗰次驗唔到任何嘢 —— **falsification 拆嘢拆出 crash 就唔算數**,要補返先重跑 **(b)** 同一個 mutation 之下,`renders no panel … even when open` **變成 vacuously green**(panel 永遠唔開就冇嘢可以捉)⇒ **一條 test 有冇意義,係睇佢對邊個 mutation 講嘢**,唔係睇佢自己寫得幾嚴謹

## `F3` — Context passing(`D-CTX`)

- [ ] F3-1 由 route 推導 `{ kind, id }`,開對話嗰陣送 `requestId`
- [ ] F3-2 🔴🔴 **`G4` 嗰條 test 唔可以係 tautology** —— `plan R2` 明文警告:前端 test 自己砌 context、後端 test 自己砌 user,**兩層都綠而縫喺中間**(BUG-011 · W45 `apiPatch` · W48 `F5-8` **三次同族**)。⇒ ①要打**真 controller** ②**falsification 拆嘅係 `assertOpcoScope`,唔係前端**
- [ ] F3-3 一條 live:用一個 scope 唔到嗰張 request 嘅帳號,由 dock 送個 id 上去 ⇒ **應該拒絕**

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
