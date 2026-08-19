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
