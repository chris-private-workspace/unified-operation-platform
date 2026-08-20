---
change_id: CH-034
title: Request detail header —— sync gate 由全寬一行搬入左欄
status: approved       # proposed | approved | done
approved: 2026-08-20   # Chris —— 附咗效果圖,scope 冇歧義(見 §3)
owner: Chris Lai
author: AI
opened: 2026-08-20
source: Chris 2026-08-20 提出 + 三張效果圖
---

# CH-034 — request header 收窄

> **狀態:`approved`** —— Chris 2026-08-20 提出兼且**附咗效果圖**,要咩形狀冇歧義。
> 我自己判斷嗰兩條(`D2` / `D3`)標明咗係我揀,render 之後畀 owner 驗收。

---

## 0. 分類

`PROCESS §1.2` —— **Change**:改現有 feature 嘅呈現,行為冇錯,< 1 日,掂 UI(H6)。
零 schema · 零 API · 零新 dep。**同 CH-033 同一個檔、同一日、同一個人提出**,但拆開單
係因為佢改嘅係 **header card 內部**,而 CH-033 改嘅係 **header 以下嗰個 panel grid** ——
兩者 acceptance 唔重疊,分開先 falsify 得到。

---

## 1. Context

### 而家嘅形狀(`request-detail.tsx:346-591`)

```
<Card>
  <div className="flex items-start justify-between">      ← 上半:左右
    <div className="flex gap-[14px]">   Avatar + 姓名/email/meta
    <div className="shrink-0 …">        ServiceNowTickets + Edit
  </div>
  {form && …}                                              ← edit panel
  <div className="mt-[16px] … w-full">  sync gate 三步      ← 全寬一行
</Card>
```

⇒ sync gate 佔**成行**,而佢實際內容(三個 step + 一句狀態)遠遠填唔滿。
右邊靠 `ml-auto` 把狀態推到 card 最右,結果 `Ready to assign` 同第三個 step 之間
隔咗一大段空白。

### Chris 要嘅形狀(效果圖)

```
<Card>
  <div className="flex items-start justify-between">
    <div className="flex flex-col gap-[14px]">   ← 新:左欄變垂直
      <div className="flex gap-[14px]">  Avatar + 姓名/email/meta
      <div className="w-fit …">          sync gate 三步     ← 搬入嚟,收窄
    </div>
    <div className="shrink-0 …">         ServiceNowTickets + Edit
  </div>
  {form && …}
</Card>
```

🟢 **`ml-auto` 唔使刪都會自動失效** —— 佢只喺有剩餘空間嗰陣先推得動;box 收成 `w-fit`
之後冇剩餘空間,狀態就自然緊貼第三個 step,**正正係效果圖嗰個樣**。

---

## 2. Scope

### In

- `A` sync gate 個 box 由 Card 底部搬入左欄,喺姓名 block 之下
- `B` box 收窄成內容寬度(唔再撐滿)
- `C` 左欄變垂直 flex,令 box **同 Avatar 左邊對齊**(效果圖係咁)

### Out(明文)

- ❌ **唔改三個 step 嘅內容 / 文案 / 條件**(CH-024 D · CH-030 F3 定落嘅嘢)
- ❌ **唔改狀態文字嘅邏輯**(`allLinesAssigned` → `assignable` → `synced` 三分支,CH-024 D)
- ❌ **唔改 `Check now` / `Mark synced` 兩個掣本身**(CH-015 定嘅 primary/ghost 分工)
- ❌ **唔郁 edit panel**(佢繼續喺 Card 底部全寬 —— 反而更合理,因為佢本來就係一個 form)
- ❌ 零 API · 零 schema · 零新 token

---

## 3. Decisions

| # | 問題 | 決定 | 誰 |
|---|---|---|---|
| **D1** | 形狀 | ✅ 搬入左欄 · 收窄 · 同 Avatar 左邊對齊 | **Chris(效果圖)** |
| **D2** | gate 未開嗰陣多咗兩個掣,點算 | 🔵 **靠既有 `flex-wrap` 自然 wrap**,唔為佢改結構 | **AI 判斷** |
| **D3** | 細螢幕(左右兩欄迫埋)點算 | 🔵 **維持現狀** —— 右欄一直有 `shrink-0`,左欄自己 wrap | **AI 判斷** |

**`D2` 點解唔加特別處理**:效果圖嗰張單三個 gate 全開,所以右邊只有一句
`Ready to assign`。但 gate **未開**嗰陣同一位置會出 **`Check now` + `Mark synced`**
兩個掣(`request-detail.tsx:559-586`),box 會闊好多。
⇒ 個 box 一直都有 `flex-wrap`,所以最壞情況係 wrap 落第二行,**唔會溢出**。
⚠️ **但 wrap 之後靚唔靚要 render 先知** —— 兩個狀態本機都有樣本,`G4` 兩個都影。

---

## 4. Deliverables

| # | 內容 | 檔 |
|---|---|---|
| `A` | 左欄改垂直 flex + sync gate 搬入去 + 收窄 | `apps/web/src/pages/request-detail.tsx` |
| `B` | Test | `apps/web/src/pages/request-detail.layout.test.tsx`(CH-033 開嗰個) |

---

## 5. Acceptance

| # | 準則 | 收貨標準 | Block? |
|---|---|---|---|
| `G1` | sync gate 喺左欄入面,唔再係 Card 直屬子元素 | test:sync gate 個 box **喺**姓名 block 所屬嘅左欄容器入面 | **Yes** |
| `G2` | 收窄咗 | render probe:gate box `width` **明顯細過** Card 內容寬(前後對照),而且 `right` 唔再貼近 card 右邊 | **Yes** |
| `G3` | 同 Avatar 左邊對齊 | render probe:gate box `left` **逐格等於** Avatar `left` | **Yes** |
| `G4` | 兩個 gate 狀態都 render 過 | **全開**(只有一句狀態)· **未開**(兩個掣)—— 兩張單 × light/dark | **Yes** |
| `G5` | 冇整爛 CH-033 | 三個 panel 仍然 `sameTop` + `sameWidth`(重跑 CH-033 個 verdict) | **Yes** |
| `G6` | H6 | 零橫向溢出 · **一個 view 一個 primary**(`Check now` 仍然係唯一 accent) | **Yes** |
| `G7` | root gate | test / lint / build exit 0 | **Yes** |
| `G8` | falsification | 每道新閘一次,真紅零誤傷 | **Yes** |

---

## 6. Falsification 計劃

| 道 | 拆咩 | 預期 | **實際(2026-08-20 真跑)** |
|---|---|---|---|
| 1 | 拆走左欄 wrapper(gate 同 avatar row 變返 `justify-between` 嘅直接 children) | `G1` 紅 | ✅ **恰好 1 紅** — `expected 'NUNew UserReady to assign…' not to contain 'Onboarding request'` |
| 2 | 拆走 `self-start` | `G2` 紅 | ✅ **恰好 1 紅** — `expected null not to be null`(`closest('div.self-start')` 揾唔到) |

**零誤傷**:兩道各 8 綠。

🔴 **道 1 紅喺負面 assert 嗰半,而呢個就係嗰條 test 嘅全部價值** ——
`not.toContain('Onboarding request')`。冇咗佢,「由 `h1` 行上去揾到一個同時包住 gate
嘅 ancestor」對 **Card 同 `<body>` 都成立** ⇒ 整條 test 會靜靜綠。

⚠️ **道 2 只驗到 class 宣告嗰層**(jsdom 冇 layout)。幾何嗰層由 render probe 蓋 ——
而佢自己都有一次 falsification:見 §7 `R2` 同下面。

⚠️ **CH-033 學到**:一道拆可能同時令兩條紅,**2 紅唔一定係誤傷** —— 逐道記實際數。
⚠️ **仲要問「紅嘅原因係咪我想證嗰個」**(W47 `F3-6`)。

---

## 7. Risks

| # | 風險 | 處理 |
|---|---|---|
| `R1` | **gate 未開嗰陣兩個掣令 box wrap,睇落散** | `G4` 兩個狀態都 render;唔合格就報返 owner,唔自己改掣嘅設計(out of scope) |
| `R2` | `G3`(對齊 Avatar)個 probe 可能係 tautology | probe 讀 **`getBoundingClientRect().left`**,唔讀 class。🔴 **實際發生咗一件更差嘅事:probe 報咗一個唔存在嘅缺陷** —— 第一次跑 `G3: FAIL`(gate `289` vs avatar `248`),而 `248` 正正係 sidebar 寬度,即由 `h1` 行三層 `parentElement` **行過咗頭**量咗 main 區。改成由 gate 自己錨定之後四個數全部 `289`。📌 **揭穿佢嘅唔係座標,係身份** —— 加印 `avatarClass` / `avatarWidth`(`44`,逐格等於 `size={44}`)先確定量緊嘅係 Avatar。⇒ **幾何 probe 一定要連「量緊邊個 element」一齊印**,否則你會去改一段本身冇問題嘅 code |
| `R3` | 搬 DOM 可能整爛 CH-033 啱啱驗完嘅三欄 | `G5` **重跑 CH-033 個 verdict**,唔靠「應該冇影響」 |

---

## 8. 🔴 要 owner 知

1. **`D2` / `D3` 係我判斷嘅**,唔喺你效果圖入面。render 之後你睇實物。
2. **`G4` 要起本機 stack ⇒ 要借 5433**(`ai-doc-extraction-db`)。唔批就 `G4`/`G2`/`G3`/`G5`
   四條標「未驗證」,其餘照做。
