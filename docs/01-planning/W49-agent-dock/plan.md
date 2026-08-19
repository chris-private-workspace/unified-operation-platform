---
phase: W49-agent-dock
name: "全站 agent dock —— Drawer primitive + context passing(Tier 2 第三塊)"
sprint_week: W49
start_date: 2026-08-19
end_date: TBD                 # 見 §5 —— `OQ-C` 未答,而佢決定 `F4` 有冇拆嘢做
status: active                # draft | active | closed
spec_refs:
  - docs/02-architecture/agent-tier2-scope.md §3 G5 / §4 T2-d / §5.2 D-CTX / §5.1 OQ-3
  - docs/02-architecture/design-system.md §2(primitive 清單)· §5(擴充路徑)· §6(畫面登記)
  - docs/adr/0041-agent-conversation-model.md(D3 request context · D6 誰可以用 · D8 approval)
prior_phase: W48-agent-conversation
---

# Phase W49 — 全站 agent dock(Tier 2 · `T2-d`)

> **Plan version**:1.0
> **Approved by**:**Chris Lai(2026-08-19)** —— `OQ-A` / `OQ-B` 照建議拍板,plan `draft → active`
> 🟢 **`OQ-D` 2026-08-19 答咗 = overlay**(同 default 一致 ⇒ `F1` 零返工)
> ⚠️ **淨低 `OQ-C` 未答**,用建議做 default 繼續(見 §7 · §8 changelog)
> **Owner**:Chris Lai
> **決策來源**:`docs/02-architecture/agent-tier2-scope.md`(scope approved 2026-08-17)
> **前置**:W48 `T2-c` —— ⚠️ **merge 咗但 phase 仲係 `active`**,見 §0.2

---

## 0. 開工之前有三件事要第一句講

### 0.1 🟢🟢 好消息:`D-CTX` 嘅**後端半邊 W48 已經做咗**

scope report `§5.2` 把 `D-CTX` 寫成一條硬約束,而且明文講佢**唔會喺 test 度自己浮出嚟**:

> **前端送上嚟嘅 context 一律當「一個提示」,唔當「一個授權」。**

而 W48 落 `AgentConversation.requestId` 嗰陣,**呢條已經實作咗**。
`agent-conversation.service.ts` `create()` 逐字:

```
`requestId` is optional and checked when present — the frontend supplying
one is a HINT, never an authorisation (Tier 2 `D-CTX`), so it goes through
the same OpCo check any other read would.
```

⇒ 前端送 `requestId` 上嚟,後端 **自己 `findUnique` 攞返個 request 再 `assertOpcoScope`**。
dock 送咩上嚟都好,**佢過唔到嗰道閘就係過唔到**。

📌 **所以 `T2-d` 唔係「加一條由前端流向後端嘅新 channel」** —— 嗰條 channel W48 開咗,
兼且開嗰陣就係 fail-closed 嘅。`T2-d` 做嘅係**由邊個 route 自動填嗰個 id**。
⇒ **本 phase 大機會係一個純前端 phase:零 schema、零 migration、零新 endpoint、零 ADR。**

⚠️ **但呢個結論有條件** —— 佢只喺 `OQ-B` 答 ① 嗰陣成立,見 §7。

### 0.2 🔴 前置有一個真缺口,而佢同 scope report 原本嗰個論據一模一樣

scope report `§4` 寫住:

> 🔴 **`T2-d` 有一個唔喺本 Tier 入面嘅前置依賴:`B6`(SSE 喺 DEV 真通)。**
> ⇒ **W46 收唔到 `B6`,`T2-d` 就唔應該開工** —— 否則會喺一條**未證實通嘅管道**上面
> 砌一個全站功能。

**`B6` W46 收咗**(部署 #9,DEV 實測 SSE 200 `text/event-stream`)。但佢證嘅係
**run 側嘅 heartbeat + 短事件** —— 而 dock 個 chat 行嘅係 **W48 新開嗰條
`/agent/conversations/:id/events`**,而 **`F7-3`(嗰條喺 DEV 真通)仲未做**。

⇒ **同一個論據,阻塞由 `B6` 變成 `F7-3`。** 呢個要 owner 決定,見 `OQ-A`。

⚠️ 順帶一個已知 live 事實會直接影響 dock 嘅設計:**SSE 連斷 3 次就永久靜默**
(`RISK R35`,W48 `F7-5` 實測)。一個**全站**、**長開**嘅 dock 撞呢條嘅機會,
遠高於一個要自己撳入去嘅 `/assistant` 頁 —— 見 §4 `R3`。

### 0.3 🔴 H6:`Drawer` 係**新 primitive**,一定要 STOP + owner 批

`design_handoff_licenseops/` **冇 drawer / dock 呢個 pattern**。按 `H6` 同
`design-system.md §5`,新 primitive 要 owner approve 兼且更新 design-system。

📌 **本系統有先例**:W47 個 `Textarea` 係第一個唔由 handoff spec 重建嘅 primitive
(H6 STOP → Chris 批,約束寫喺 `design-system.md §2`)。`Drawer` 會係第二個,
但**佢比 `Textarea` 重好多** —— `Textarea` 係一個 input,`Drawer` 係一個**改變成個
layout 行為**嘅嘢(non-modal · 唔可以 trap focus · 要決定 push 定 overlay)。

⚠️ 技術上明文唔可以重用今日個 `Dialog`:佢 trap focus 兼加 overlay,而 `G5` 要
**non-modal(唔阻住底下操作)**。

---

## 1. Scope

### In

- 一個 **`Drawer` primitive**(non-modal · 可開可收 · 記住開合狀態)
- **全站掛載**:任何頁面右邊彈得出
- **context passing**:dock 由當前 route 推導出「你而家喺邊」,開對話嗰陣送落去
- dock 入面重用 W48 個 chat(**唔重新實作一次 transcript**)

### Out(明文排除,防混入)

- ❌ **唔改 conversation 嘅後端語意** —— tool registry / approval gate / owner-only 讀路
  全部一個字唔郁(`ADR-0041 D8` · `ADR-0036 D3`)
- ❌ **唔做 per-agent kill switch / 上限**(嗰個係 `T2-e`)
- ❌ **唔做 token streaming**(W48 揀咗 turn-level notify,plan §8 有記;要改係另一個決定)
- ❌ **唔掂 `/assistant` 嘅存在與否** —— 除非 `OQ-C` 答「取代」

---

## 2. Deliverables

> ⚠️ 呢節**唔可以 lock** —— `OQ-B` / `OQ-C` 兩條會直接改變 `F2` / `F4` 嘅形狀。

### F1 — `Drawer` primitive(**H6 STOP**)

- non-modal:唔 trap focus、唔加 overlay、底下照撳得
- 可開可收;`Esc` 收起但**唔可以**偷走底下嘅 focus
- light + dark;唔可以引入 handoff 以外嘅陰影 / gradient(DS-7)
- **Acceptance**:owner 批咗 + `design-system.md §2` 寫低約束 + light/dark 真 render
  · **一個 view 一個 primary 呢條唔可以因為多咗個 dock 就破**

### F2 — Layout 掛載

- 邊度掛?`App` shell 一個位,定每個 page 自己?(前者唯一,後者會漂)
- push 定 overlay?(`OQ-C` 相關)
- **Acceptance**:dock 開住嗰陣,底下嘅表**仍然撳得郁**(non-modal 嘅可觀察定義)
  · 零橫向溢出 · sidebar 收埋 / 展開兩個狀態都唔會爆

### F3 — Context passing(`D-CTX`)

- 由 route 推導 `{ kind, id }`(例如 `request:cmsxxx`),開對話嗰陣送 `requestId`
- 🔴 **前端唔可以自己決定「呢個 context 睇唔睇得」** —— 嗰個判斷喺後端,而佢已經喺度
- **Acceptance**:一條 test 釘住「dock 送嘅 id 只係一個參數,唔係一個 claim」——
  ⚠️ **呢條 test 要諗清楚點寫先有意義**,見 §4 `R2`

### F4 — dock 入面嘅 chat

- 重用 W48 `useAgentConversation` / `useAddConversationTurn` / SSE hook
- **唔可以有 approve 掣**(`ADR-0041 D8`)—— 同 `/assistant` 一樣要**兩條 test**:
  behavioural + **source scan**(W48 `F5-4` 個教訓:第一條只擋到串「Approve」嗰個)
- **Acceptance**:source scan 覆蓋 dock 個檔 · 開合狀態 persist · SSE 斷咗有得知

### F5 — Gate + falsification + H6 render + live 驗

---

## 3. Success Criteria(Phase Gate)

| # | Criterion | Target | Block closeout? |
|---|---|---|---|
| G1 | `Drawer` owner-approved + design-system 更新 | H6 走完合法路徑 | **Yes** |
| G2 | **non-modal 係可觀察嘅** | dock 開住,底下嘅表撳得郁(唔係「睇落唔似 modal」) | **Yes** |
| G3 | **dock 唔可以繞過 approval** | 同 `/assistant` 一樣兩條 test(含 source scan) | **Yes** |
| G4 | **`D-CTX`:前端送嘅 context 唔係授權** | 一條**真捉得到嘢**嘅 test,見 `R2` | **Yes** |
| G5 | H6 light + dark | 兩個都 render 過,**dock 開合兩個狀態都影** | **Yes** |
| G6 | root gate | test / lint / build 三個 exit 0 | **Yes** |
| G7 | live 驗 | 本機真開 dock 傾一段 + DEV | **Yes** |

> 🔴 **`G2` 同 `G4` 係本 phase 兩條真紅線。**
> `G2` 防「叫做 non-modal 但實際上阻住晒」;`G4` 防「dock 送咩後端就信咩」。

---

## 4. Risks(Phase-Specific)

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| **R1** | 🔴 **`Drawer` 係一個 layout primitive,唔係一個 input** —— 佢會改變成個 shell 嘅行為,而 handoff 冇得對 | High | 🔴 High(H6) | ① **owner 批咗先做**(H6 唯一合法路徑)② 約束寫入 `design-system.md §2`,唔止「批咗」③ **push 定 overlay 要一開始決定**,唔可以做完先改 |
| **R2** | 🔴🔴 **`D-CTX` 嗰條 test 好容易寫成 tautology** —— 前端 test 自己砌 context、後端 test 自己砌 user,**兩層都綠而縫喺中間**(BUG-011 · W45 `apiPatch` · W48 `F5-8` 三次同族) | **High** | 🔴 High(安全) | ① test 要**打真 controller**(W47 `F2-7` 個 controller spec 先例)② **falsification 要拆走 `assertOpcoScope` 睇佢紅**,唔係拆走前端 ③ 一條 live:用一個 scope 唔到嗰張 request 嘅帳號,由 dock 送個 id 上去 |
| **R3** | ⚠️ **SSE 斷 3 次永久靜默(`R35`)喺 dock 上面嚴重好多** —— dock 係**長開**嘅,而 `/assistant` 要自己撳入去 | **High** | 🟡 Med | ① 本 phase 至少要令佢**講一句**(「連線斷咗,撳我重連」)② 唔使做無限重試 —— bound 本身係啱嘅(`EventSource` 唔畀睇 status code) |
| **R4** | **dock 同 `/assistant` 兩份 state 各自漂** —— 同一條對話喺兩處開,一邊送咗 turn 另一邊唔知 | Med | Med | 兩邊都行同一個 TanStack query key ⇒ invalidate 一次兩邊都更新。⚠️ **前提係唔另開一份 local state** |
| **R5** | **「全站」包唔包 login / 未登入頁?** | Low | Med | `canUseAgent` 已經喺 web 側(W46 F8);dock 掛載點要行同一個 predicate,**唔可以靠「reviewer 記得」** |
| **R6** | 🟡 **`T2-d` 開工而 W48 `F7-3` 未收** —— 喺一條 DEV 未驗嘅管道上面砌全站功能 | Med | Med | 見 `OQ-A` —— **呢條唔係技術決定,係 owner 決定** |
| **R7** 🆕 | 🔴 **`F3` 之後,用戶最想開 dock 嗰版就係最受 dock 遮嗰版** —— `F2-5` 實測 request detail(two-column)有 **5 個互動元素**落喺 dock 覆蓋範圍(`Check now`[該版 primary]· `Mark synced` · `Edit` · `Hide` · `Transcript`),而 `F3` 正正要由呢一版送 `requestId` | **High** | 🟡 Med | ⚠️ **本 phase 唔修,但唔可以當唔知**。①分界線已經定咗:**「出唔出返嚟」** —— top bar 嗰個係死局(已修),呢個收咗 dock 就用得返 ②`OQ-D` 答咗 overlay,所以修法唔可以係「改做 push」——要改就係另一個決定 ③真正要睇嘅係 `F3` 落地之後嘅實際用法:如果人要**一路睇 request detail 一路傾**,呢條就由 trade-off 變成缺陷 |

---

## 5. Day-by-Day

> 🟢 **2026-08-19 填得返一半** —— `OQ-B` 答①令「零後端改動」確立,所以 `F1`–`F3` 估得出。
> `F4` 仍然估唔到,因為佢**唔係卡工作量,係卡一個唔喺本 phase 嘅事件**(W48 `F7-3`)。

| Day | Focus | Deliverables |
|---|---|---|
| D1 | `Drawer` primitive(H6)+ design-system 約束 | `F1` |
| D2 | Layout 掛載 + context passing | `F2` · `F3` |
| D? | dock 入面嘅 chat —— **等 W48 `F7-3`** | `F4` |
| D? | Gate + render + live | `F5` |

**`F1`–`F3` Effort ≈ 9h**(`F1` 4 + `F2` 3 + `F3` 2)。**`F4` 冇估** —— 見上。

⚠️ **呢個估算有一個已知弱點**:`F1` 個 4h 假設咗 `Drawer` 係「一個 `fixed` 面板 + 一個
開合 state」。如果 `OQ-D` 之後改揀 **push**,佢就唔再係一個 primitive 嘅問題,而係
**每一版嘅 grid 都要處理一個新斷點** —— 嗰個唔喺呢個估算入面。

---

## 6. Dependencies on Prior Phase

- 🟢 **W48 merge 咗落 `main`**(PR #124,15 個 commit 逐個驗過)⇒ conversation / SSE /
  `/assistant` 全部喺 `main` 上面
- 🟢 **`D-CTX` 後端半邊已經喺度**(§0.1)
- 🔴 **W48 `F7-3`(DEV live)未做** ⇒ 見 `OQ-A`
- ⚠️ **`RISK R35`(SSE 斷 3 次靜默)carry 咗過嚟,而 dock 令佢更嚴重**(`R3`)
- ⚠️ **W48 `F5-12` 未完嗰半**:picker(開新對話用邊個)同 thread badge(呢條用緊邊個)
  語意重疊,只改咗 `aria-label`。**dock 重用同一組元件之前要答**

---

## 7. Open Questions(四條 —— 🟢 **三條答咗**,淨低 `OQ-C`)

| # | 問題 | 建議 | 影響 |
|---|---|---|---|
| **OQ-A** 🟢 **答咗** | W48 `F7-3`(conversation SSE 喺 DEV 真通)未做,`T2-d` 開唔開工? | 🟢 **Chris 2026-08-19 揀建議:可以開,但 `F1`/`F2` 行先** —— `Drawer` primitive 同 layout 唔碰 SSE。**`F4`(dock 入面 chat)之前要收到 `F7-3`** | ⇒ `F4` 由「排喺 `F3` 後面」變成「**排喺一個唔喺本 phase 嘅事件後面**」。checklist `F4` 要明文標住呢個閘 |
| **OQ-B** 🟢 **答咗** | 「當前頁面嘅資料」= ① **route + 主要 entity id**,定 ② **頁面 render 咗嘅嘢**? | 🟢 **Chris 2026-08-19 揀 ①** | 🟢🟢 **零後端改動確立** —— ①今日已經實作咗(§0.1),⇒ 本 phase **零 schema · 零 migration · 零新 endpoint · 零 ADR**,純前端。而②會把冇 scope 概念嘅 UI state 變成 agent 資料來源 |
| **OQ-C** | dock 同 W48 個 `/assistant` 全頁,關係係? | **兩個都留** —— dock = 隨手問;`/assistant` = 睇返舊對話 / 長篇。兩邊行同一個 query key(`R4`) | 揀「dock 取代」就要拆一個啱啱做完嘅畫面兼且 `design-system.md §6` 要除名 |
| **OQ-D** 🟢 **答咗** | `Drawer` 用 **push**(把內容推窄)定 **overlay**(浮喺上面)? | 🟢 **Chris 2026-08-19 揀 overlay(即建議)** —— push 會令每一版嘅 grid 都要處理一個新斷點,而 `G5` 只要求「唔阻住底下操作」 | 🟢 **`F1` 落地嗰個 default 確認** ⇒ `drawer.tsx` 同 `design-system.md §2` 七條約束**一個字唔使改**;`F2` 個 dock 做 layout **sibling** 唔做 flex child |

🟢 **`OQ-A` / `OQ-B` / `OQ-D` 2026-08-19 答咗。**`OQ-A` / `OQ-B` 令 plan `draft → active`;
`OQ-D` 落喺 `F2` 開工嗰日答,而**答案同 default 一致 ⇒ 零返工**。
⚠️ **淨低 `OQ-C`(dock 同 `/assistant` 關係)仍然未答**,用建議做 default 繼續。

🔴 **兩條嘅「改動成本」唔同,而呢個分別今次真係換到嘢**:

- **`OQ-D` 遲答會貴** —— 佢係 `Drawer` primitive **形狀本身**,做完先改等於重做。
  ⇒ `F1` 用 default(**overlay,唔加 scrim**)落地,而**約束寫入 `design-system.md §2`**,
  即係話改佢嗰陣會撞返 H6 一次(呢個係好事,唔係阻礙)。**2026-08-19 答案 = overlay,
  所以嗰道 H6 唔使撞。**📌 但要記住:令佢平嘅唔係「估中咗」,係「估錯都只係撞返一次
  H6 而唔係靜靜漂走」
- **`OQ-C` 遲答唔貴** —— 佢只影響 `F4`,而 `F4` 本身已經被 `OQ-A` 閂住等 `F7-3`

---

## 8. Plan Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-08-19 | Initial draft(`status: draft`) | W48 merge 咗落 `main` 之後嘅下一塊(scope report `§4` 建議先後:`T2-a` → `T2-c` → **`T2-d`** → `T2-e`)。**四條 OQ 未答 ⇒ 冇 Effort / 冇 date / 冇 day-by-day**,見 §5 | AI(未 approve) |
| 2026-08-19 | 🟢 **`OQ-A` / `OQ-B` 照建議拍板,`draft → active`** | `OQ-B` 揀①令「零後端改動」確立 ⇒ **純前端 phase**。`OQ-A` 令 `F4` 排喺一個**唔喺本 phase 嘅事件**(W48 `F7-3`)後面 | Chris Lai |
| 2026-08-19 | ⚠️ **`OQ-C` / `OQ-D` 未答,用建議做 default 開工** | `OQ-D`(overlay,唔加 scrim)**遲答會貴**,因為佢係 primitive 形狀本身 ⇒ 落地兼且把約束寫入 `design-system.md §2`,將來改就會再撞一次 H6(呢個係設計上想要嘅)。`OQ-C` 遲答唔貴,佢只影響已經被 `OQ-A` 閂住嘅 `F4` | AI(記錄,待 owner) |
| 2026-08-19 | 🚧 **`F1` acceptance 個「light/dark 真 render」押後到 `F2`** | `Drawer` 未掛載到任何頁面之前 **render 唔到佢** —— 佢係一個 `fixed` 面板,冇 caller 就冇嘢喺畫面。⇒ 併入 `F2-5`(而且嗰度先影得到「開」同「收」兩個狀態)。⚠️ **acceptance 冇被刪,只係搬咗位** | AI |
| 2026-08-19 | 🟢 **`OQ-D` 答咗 = overlay(同 default 一致)** | `F1` 已經照 default 落地 ⇒ **零返工**,`drawer.tsx` 同 `design-system.md §2` 一個字唔使改。⚠️ **唔好把「零返工」記成「估中咗所以慳咗」** —— 慳到嘅原因係嗰個 default **寫入咗 design-system**,即係話估錯嘅代價本來就只係撞返一次 H6,唔係靜靜漂走 | Chris Lai |
| 2026-08-19 | 🔴 **更正 §0.3 一個前提:`Dialog` 冇 focus trap** | 讀實作揾到:`dialog.tsx` **冇任何 focus trap code**,只有 `aria-modal="true"` 聲明。令底下撳唔到嘅係 **`fixed inset-0` + 45% scrim 攔截 click**。⇒ `Drawer` 要避開嘅係**三樣具體嘢**(`inset-0` · scrim · `aria-modal`),唔係一個叫「focus trap」嘅籠統概念 —— 而呢三樣**逐樣都 assert 得到**,籠統概念 assert 唔到 | AI |

---

**Lifecycle**:按 PROCESS **R1**,multi-day implementation 開始之前必須有 approved
pre-doc。**呢份仲係 `draft` ⇒ 未可以寫 code。** `OQ-A` / `OQ-B` 答完先 derive
`checklist.md`。
