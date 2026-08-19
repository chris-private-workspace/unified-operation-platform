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
- [ ] F0-4 🚧 **`OQ-C` / `OQ-D` 仍然未答**,用建議做 default(`OQ-D` = overlay 唔加 scrim · `OQ-C` = 兩個都留)。⚠️ **`OQ-D` 遲答會貴**(佢係 primitive 形狀本身),所以佢個 default **寫入 `design-system.md §2`** ⇒ 將來改會再撞一次 H6,而嗰個係設計上想要嘅

## `F1` — `Drawer` primitive(**H6**)

- [x] F1-1 ✅ **H6 STOP → owner 批** —— Chris 2026-08-19 講「開始 F1」,而 `plan §0.3` 同 `F1` 標題都標住呢個係新 primitive ⇒ 當作批咗開。⚠️ **批咗嘅係「開呢個 primitive」,唔係「批咗某一個具體形狀」** —— `OQ-D` 仍然未答,所以 default(overlay)**寫咗入 `design-system.md §2`**,將來改就會再撞一次 H6
- [x] F1-2 ✅ **`design-system.md §2` 寫低約束** —— `overlay / feedback` 行加咗 `Drawer` + 一整段約束(跟 W47 `Textarea` 先例)。🔴 **七條約束,而寫法本身係本項要記嘅嘢**:唔寫「唔好 trap focus」(assert 唔到),寫**三樣具體避開嘅嘢** —— 冇 `inset-0` · 冇 scrim · 冇 `aria-modal`。另外四條:`Esc` 收但唔搶 focus(同 `Dialog` **刻意相反**)· 深度靠 `border-l` **唔加陰影**(`Dialog` 個 `shadow-overlay` 唔可以抄 —— 一個長開嘅面板掛住陰影 = 每一版加咗一個視覺層)· 寬度係**常數唔係 prop**(caller 揀寬度 = 每個 caller 各自漂)· **DS-3「一 view 一 primary」唔可以因為多咗個 dock 就破**
- [x] F1-3 ✅ **`drawer.tsx`** —— `role="complementary"` · `fixed bottom-0 right-0 top-0`(**唔係 `inset-0`**)· 冇 scrim · 冇 `aria-modal` · `z-40`。🔴 **z-index 排序有論據**:`Dialog z-[90]` > `Toast z-50` > **`Drawer z-40`** > 頁面 —— 一個長開嘅 chrome **唔應該蓋住 transient 通知**,而真 modal 仍然要蓋得住佢
- [x] F1-4 ✅ **8 條 test,而佢係本系統第一個有 test 嘅 primitive** —— 🔴 **點解只有佢要**:其餘 primitive 靠 render 驗就夠(色 / 半徑 / 間距睇得到),而 `Drawer` 嘅約束係**行為**,`aria-modal` / scrim / `inset-0` 喺截圖入面**完全睇唔出**。⚠️ **明文寫低咗呢份 test 證明唔到咩**:jsdom 冇 Tailwind ⇒ 冇真 geometry ⇒ 呢八條係**結構前提**,`G2`(dock 開住底下撳得郁)要 `F2-2` live 先驗得到
- [x] F1-5 ✅ **falsification 三道,逐道拆唔一次過拆**(一次改三個就分唔清邊條對應邊個,亦驗唔到零誤傷)—— ①加 `inset-0` ⇒ **1 紅 7 綠**(`not to match /\binset-0\b/`)②加 scrim wrapper ⇒ **1 紅 7 綠**(`expected 'DIV' to be 'ASIDE'`)③加 `aria-modal` ⇒ **1 紅 7 綠**。**三道紅嘅原因逐個對位**
- [ ] F1-6 🚧 **light + dark 真 render 押後到 `F2`** —— `Drawer` 未掛載到任何頁面之前 render 唔到佢。⚠️ **呢個係 deviation**(plan `F1` acceptance 寫住「light/dark 真 render」)⇒ 要記 changelog

## `F2` — Layout 掛載

- [ ] F2-1 掛喺 `App` shell **一個位**,唔係每版自己掛(後者一定會漂)
- [ ] F2-2 🔴 **`G2` 真驗**:dock 開住嗰陣,底下嘅表**撳得郁** —— 呢個係 non-modal 嘅可觀察定義,唔係「睇落唔似 modal」
- [ ] F2-3 `canUseAgent` gate(`R5`)—— **唔可以靠「reviewer 記得」**,要一條 test
- [ ] F2-4 開合狀態 persist;sidebar 收埋 / 展開兩個狀態都唔爆;零橫向溢出
- [ ] F2-5 **light + dark 真 render,dock 開同收兩個狀態都影**(含 `F1-6` 押後嗰半)

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
