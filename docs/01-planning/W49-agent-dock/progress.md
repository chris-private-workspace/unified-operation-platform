---
phase: W49-agent-dock
status: active
---

# W49 — 全站 agent dock · Progress

## Day 0 — 2026-08-19(kickoff · plan draft)

四條 OQ 列出,兩條 blocking。plan `status: draft`,**冇寫任何 code**(R1)。

開工前三件事寫咗入 `plan §0`,而第一件係好消息:**`D-CTX` 嘅後端半邊 W48 已經做咗**。

---

## Day 0(續)— 2026-08-19 · `OQ-A` / `OQ-B` 答咗,`draft → active`

Chris 兩條都照建議。淨效果:

| | |
|---|---|
| `OQ-B` 答① | 🟢🟢 **零後端改動確立** ⇒ 本 phase **純前端**:零 schema · 零 migration · 零新 endpoint · 零 ADR |
| `OQ-A` 答「開,但 `F1`/`F2` 行先」 | `F4` 由「排喺 `F3` 後面」變成「**排喺一個唔喺本 phase 嘅事件後面**」(W48 `F7-3`)⇒ checklist `F4-0` 就係嗰道閘 |

⚠️ `OQ-C` / `OQ-D` 仍然未答,用建議做 default。**兩條嘅「遲答成本」唔同**:
`OQ-D` 係 primitive 形狀本身,做完先改等於重做 ⇒ 佢個 default **寫入 design-system**,
將來改會再撞一次 H6(**呢個係想要嘅**);`OQ-C` 只影響已經被 `OQ-A` 閂住嘅 `F4`。

---

## Day 1 — 2026-08-19 · `F1` `Drawer` primitive(H6)

web **45 → 46 files / 480 → 488 tests** · api 唔變(97 / 1484)· tsc / lint / build 全 0。

### 🔴 開工第一件事係推翻一個 plan 自己寫錯咗嘅前提

`plan §0.3` 同 scope report 都寫住「**`Dialog` 會 trap focus**,所以要新 primitive」。
讀實作:**`dialog.tsx` 由頭到尾冇任何 focus trap code**,只有 `aria-modal="true"`。

真正令底下用唔到嘅係另外三樣:

1. `fixed inset-0` —— **覆蓋全屏就係「阻住底下」本身**
2. `bg-black/45` scrim —— 佢唔止係視覺,佢**攔截 click**
3. `aria-modal="true"` —— 對輔助技術聲明「其餘嘅嘢唔存在」

📌 **點解呢個更正值錢**:「唔好 trap focus」**assert 唔到**,而呢三樣**逐樣都 assert
得到**。一個籠統概念換成三條可觀察嘅嘢 —— 而三條 falsification 就係喺呢度嚟嘅。

### `Drawer` 七條約束,兩條唔係抄 `Dialog` 而係**刻意同佢相反**

| 約束 | 點解 |
|---|---|
| 唔可以 `inset-0` / scrim / `aria-modal` | 上面三點 |
| **`Esc` 收起但唔搶 focus** | `Dialog` 開嗰陣拉走 focus 係啱嘅(佢係你唯一做得到嘢嘅嘢);dock 係一個人**開住佢繼續喺底下打字**。搶 focus = 行為上係 modal 而 role 上聲稱唔係 |
| **唔加陰影**(DS-7) | `Dialog` 用 `shadow-overlay` 因為佢浮一陣;呢個**留喺度**,而一浸永久陰影 = 喺每一版加咗一個新視覺層 |
| **寬度係常數唔係 prop** | caller 揀寬度 = 每個 caller 各自漂;`%` 喺闊 mon 變半版 ⇒ 一個 layout 決定收埋喺 style 值入面 |
| **DS-3 唔可以因為多咗個 dock 就破** | dock 係第一個令「一個 view」呢個講法變含糊嘅嘢。⚠️ 呢條 `Drawer` 自己保證唔到,係 caller 責任 —— 但要寫喺 primitive 度,因為將來冇人會諗返起 |

### z-index 排序有論據,唔係求其揀個數

實測既有:`Dialog z-[90]` · `Toast z-50` · 其餘冇 z。
⇒ `Drawer` 揀 **`z-40`**:`Dialog` > `Toast` > **`Drawer`** > 頁面。

**一個長開嘅 chrome 唔應該蓋住 transient 通知**,而一個真 modal 仍然要蓋得住佢。

### 🔴 `Drawer` 係本系統第一個有 test 嘅 primitive,而佢應該係

`components/ui/` 底下**零個** `.test.tsx`(實測)。呢個一直都合理:其餘 primitive 靠
render 驗就夠 —— 色、半徑、間距**睇得到**。

`Drawer` 唔同:佢存在嘅唯一理由係 **non-modal**,而 `aria-modal` / scrim / `inset-0`
喺截圖入面**完全睇唔出**。⇒ 八條 test,其中三條就係嗰三樣嘢。

⚠️ **同時喺 test 檔頭寫明佢證明唔到咩**:jsdom 冇 Tailwind ⇒ 冇真 geometry ⇒
「底下嘅表撳得郁」(`G2`)**要 `F2-2` live 先驗得到**。呢八條係**結構前提**,唔係 `G2`。

### falsification 三道,逐道拆

| 拆走 | 結果 | 紅嘅原因 |
|---|---|---|
| 加 `inset-0` | **1 紅 7 綠** | `expected 'fixed inset-0 …' not to match /\binset-0\b/` |
| 加 scrim wrapper | **1 紅 7 綠** | `expected 'DIV' to be 'ASIDE'` |
| 加 `aria-modal` | **1 紅 7 綠** | `does not tell assistive tech the page is gone` |

📌 **刻意唔一次過拆三個** —— 一次改三處會紅三條,但就分唔清邊條對應邊個,
亦**驗唔到「零誤傷」**。

### 🚧 下一步

- **`F1-6`** light + dark 真 render **押後到 `F2`** —— `Drawer` 未掛載到任何頁面之前
  render 唔到佢。⚠️ 呢個係 **deviation**(plan `F1` acceptance 寫住 render),已記 changelog
- `F2` layout 掛載 —— 而 `F2-2` 就係 `G2` 真正嘅收貨標準

---

## Day 2 — 2026-08-19 · `OQ-D` 答咗 + `F2` 掛載(`F2-1` / `F2-3` / `F2-4`)

web **46 → 47 files / 488 → 501 tests** · api 唔變(97 / 1484)· lint / build 0。

### 🟢 `OQ-D` = **overlay**,而「零返工」個原因唔係估中咗

Chris 揀 overlay,**同 `F1` 落地嗰個 default 一致** ⇒ `drawer.tsx` 同 `design-system.md §2`
七條約束**一個字唔使改**。

🔴 **但唔好把呢件事記成「估中咗所以慳咗」** —— 真正令佢平嘅係嗰個 default **寫咗入
design-system**,即係話**估錯嘅代價本來就只係撞返一次 H6**,唔係靜靜漂走。
呢個先係 Day 0 嗰個「`OQ-D` 遲答會貴,所以寫入 design-system」決定換返嚟嘅嘢。

### `F2` 三個掛載決定,而中間嗰個先係 `OQ-D` 嘅實際意思

| 決定 | 點解 |
|---|---|
| 掛喺 `AppShell` **一次** | 每版自己掛 = navigate 就關;而**漏咗嗰啲版就係 dock 靜靜唔存在嘅版** |
| **layout 嘅 sibling,唔係入面一個 column** | 呢個就係 overlay 落到 code 嘅樣。做 flex child 會把主欄推窄 ⇒ **全站每張表都多一個斷點要驗**(= push 嘅真實代價) |
| launcher 用 **`IconButton` 唔用 `Button`** | **DS-3** 一 view 一 primary。dock 係**每一版都喺度**嘅 chrome ⇒ 一個紅掣釘喺 top bar = **一次過喺所有版加多一個 primary** |

### 🔴 `R5`:唔係收埋個掣,係「一個 predicate + 一條 source scan」

顯而易見嘅做法係收埋 launcher 然後由得 panel 跟。**但咁樣道閘就變成個掣嘅屬性,
而唔係個功能嘅屬性** —— 而 `F3` 會由 route 開呢個 panel,到嗰陣「淨係經 launcher 入到」
就係一句**冇人驗過嘅話**。

⇒ `useDockVisible()` 一個,兩個 export 共用;`agent-dock.test.tsx` **scan 返個檔**,
逐個 export 檢查。`R5` 逐字寫住「唔可以靠 reviewer 記得」,而呢個就係唔靠。

🔴 **`undefined` 明文喺 gate test 個 list 入面** —— 佢係 `GET /me` 仲飛緊嗰陣嘅**真實狀態**,
一個只處理已知 role 嘅 gate 會喺**每次冷載閃一閃**。

### 「開合狀態 persist」喺呢個 codebase 嘅意思

state 喺 **store** 唔喺 component ⇒ 切 route 唔會關(shell 之下嘅嘢每次 navigate 都 remount)。
**刻意唔落 localStorage**:`theme` 同 `sidebarCollapsed` 都冇,一個淨係佢自己 refresh 之後
返嚟嘅 dock 就係**唯一一個唔一致嘅嘢**。

### falsification 三道,而第三道教返兩件事

| 拆走 | 結果 | 邊條紅 |
|---|---|---|
| `AgentDock` 個 gate | **2 紅 11 綠** | behavioural(`OPCO_IT` 照見到 panel)**同** source scan(gate 唔見咗)—— **兩層各自捉到** |
| 加一個冇 gate 嘅第三個 export | **2 紅 11 綠** | 訊息**逐字點名** `AgentDockBadge does not call useDockVisible()` |
| `dockOpen` 由 store 搬去 `useState` | **2 紅 11 綠** | 兩條都落喺 `F2-4` |

🔴 **(a) falsification 拆嘢拆出 crash 就唔算數。** 第三道第一次拆完撞 `useState is not
defined` ⇒ **每條都紅,而紅嘅原因全部一樣**。嗰次驗唔到任何嘢 —— 補返 import 重跑先有意義。
📌 同 Day 1「唔一次過拆三個」同族:**兩者都係「紅得唔對位就等於冇驗」**。

🔴 **(b) 同一個 mutation 之下,`renders no panel … even when open` 變成 vacuously green**
(panel 永遠唔開,就冇嘢可以捉)⇒ **一條 test 有冇意義,係睇佢對邊個 mutation 講嘢**,
唔係睇佢自己寫得幾嚴謹。同 §9「一條 assert 睇落嚴唔嚴謹,同佢捉唔捉到嘢,係兩件事」同族。

### 🚧 下一步

- **`F2-2`(`G2` live)** 同 **`F2-5`(light + dark render,含 `F1-6` 押後嗰半)** —— 兩條都要
  **起本機 stack**。⚠️ **5433 而家喺 `ai-doc-extraction-db` 手上,停佢要 Chris 批**
- ⚠️ **`F2-4` 個「sidebar 收埋 / 展開兩個狀態都唔爆」結構上成立但未影過** —— 併入 `F2-5`
