# CH-034 — progress

## Day 1 — 2026-08-20(開單 → 收尾,一日)

### 做咗咩

Chris 附咗**三張效果圖**:sync gate 由 Card 底部全寬一行,搬入左欄、收窄、同 Avatar
左邊對齊。實作 → test → falsification → render 一次過做完。

**零 schema · 零 API · 零 migration · 零新 dep · 零新 token · 零 ADR。**

| | 前 | 後 |
|---|---|---|
| api test | 1491 / 98 | **1491 / 98**(冇掂後端) |
| web test | 562 / 50 | **564 / 50**(+2) |
| gate box 寬 | 撐滿(≈1144) | **780 / 789** |
| 三個 panel `top` | 362 | **347**(header 矮咗 15px) |

### 🔴 三件值得記低嘅事

**1. 兩個 class 做晒成件事,而其中一個唔加就靜靜失效。**
`self-start` + `max-w-full`:
- **冇 `self-start`** ⇒ flex column 預設 stretch,個 box 照樣撐滿成欄,而下面個
  `ml-auto` 就會繼續把狀態文字飛到最右 —— **即係改咗等於冇改**,但畫面唔會報錯。
- **冇 `max-w-full`** ⇒ 兩個 gate 都未開嗰陣 row 仲要載住 `Check now` + `Mark synced`,
  收縮不足就會撐闊成張 card。

📌 呢個係「**一個改動嘅正確性靠兩個獨立宣告**」嘅形狀,所以 test 分別守住兩個
(`self-start` 用 `closest('div.self-start')`;`max-w-full` 用 `className` 檢查)。

**2. `ml-auto` 刻意唔刪,而個理由值得記。**
直覺上「收窄咗就唔再需要 `ml-auto`」⇒ 應該刪。但佢**只喺有剩餘空間先推得動**,
而一個 shrink-to-fit 嘅 box 冇剩餘空間 ⇒ **今日刪唔刪都一模一樣**。
🟢 而佢喺 **wrapped 狀態下真係做緊嘢** —— render 實測:兩個 gate 未開嗰陣
`Check now` / `Mark synced` wrap 落第二行,`ml-auto` 令佢哋右對齊。
⇒ **刪咗係「今日冇分別、將來有分別」嘅改動**,唔屬於本單。

**3.🔴 render probe 報咗一個唔存在嘅缺陷,而揭穿佢嘅唔係座標係身份。**
`G3` 第一次跑:gate `left: 289`、`avatarLeft: 248` ⇒ **`FAIL`**。
但 **code 係啱嘅** —— `248` 正正係 sidebar 寬度,即我由 `h1` 行三層 `parentElement`
**行過咗頭**,量咗 main 區而唔係 Avatar。

改成由 **gate 自己**錨定(`gateBox.parentElement` = 左欄 → `.firstElementChild` =
avatar row → `.firstElementChild` = Avatar)之後,四個數全部 **289**。

🔎 **決定性嘅係我加咗印 `avatarClass` 同 `avatarWidth`** —— 見到 `44`,逐格等於 code
入面 `size={44}`,先確定今次真係揾到 Avatar。
📌 **幾何 probe 一定要連「你量緊邊個 element」一齊印。** 唔係嘅話,一個錯 element
會報一個唔存在嘅缺陷,而你會去改一段本身完全冇問題嘅 code。
⇒ 同 CH-033 嗰個「probe 問錯問題」同族,但機制唔同:**嗰次係問錯問題,今次係
瞄準錯 element。**

### 證據

| | 結果 |
|---|---|
| `G3` 對齊 | `gateLeft` = `avatarLeft` = `leftColLeft` = `avatarRowLeft` = **289** |
| `G2` 收窄 | **780 / 789** vs 內容區 **1144** |
| `G4` 兩個狀態 | `License assigned`(`wrapped: false`)· `Check now`+`Mark synced`(**`wrapped: true`**,冇溢出) |
| `G5` 冇整爛 CH-033 | **重跑 verdict** ⇒ `CH033_G2: PASS` × 4 |
| `G6` | `overflowsX: false` × 4 · 唯一 accent 仍然係 `Check now` |
| falsification | 道 1(拆走左欄 wrapper)**1 紅**,紅喺**負面 assert** ·道 2(拆走 `self-start`)**1 紅** |

🔴 **道 1 紅喺 `not.toContain('Onboarding request')` 嗰半** —— 即係話冇咗嗰句
negative assert,整條 test 會靜靜綠(因為「有共同 ancestor」對 Card 同 `<body>`
都成立)。**呢條 test 嘅價值全部喺負面嗰半。**

### 🚧 carry-over

- **DEV 上機**要下次部署(#14)。⚠️ 同 CH-033 一樣**一個新字串都冇** ⇒ marker 只可能
  喺 CSS。
- **睇實物**交返 Chris(要登入)。

### 狀態

**done** — `G1`–`G8` 八條全 ✅。
