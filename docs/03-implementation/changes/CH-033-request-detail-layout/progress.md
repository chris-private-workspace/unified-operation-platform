# CH-033 — progress

## Day 1 — 2026-08-20(開單 → 收尾,一日)

### 做咗咩

Chris 睇住 `REQ0044105` 提兩件事:右上角 ticket reference **字太細**,同埋 Line items /
Operational history / AI Assist **想並排**。三條決定當場答咗(字體升一級 · layout **A**
三等分 · 批准借 5433),之後實作 → test → falsification → render 一次過做完。

**零 schema · 零 API · 零 migration · 零新 dep · 零新 token · 零新 primitive · 零 ADR。**

| | 前 | 後 |
|---|---|---|
| api test | 1491 / 98 | **1491 / 98**(一個字冇掂後端) |
| web test | 555 / 49 | **562 / 50**(+7,新檔 `request-detail.layout.test.tsx`) |
| lint / build | 0 / 0 | **0 / 0** |

### 🔴 四件值得記低嘅事

**1. 「並排」呢個要求裡面,有一半唔係版面問題。**
Chris 話「想三個並排」,而實際上 **Line items 同 Operational history 一早已經並排**
(`lg:grid-cols-3`,左 `col-span-2`)。佢見唔到 AI Assist,係因為佢喺 Operational
history **下面**,畀 timeline 推到 fold 以下 —— render probe 實測 `top: 516`(另一張單
`747`)。📌 **一個「版面唔啱」嘅報告,可能係「有樣嘢你從來冇見過」。**

**2. 查證揭到一句過時註釋,而佢正正係反對呢單嘅理由。**
`request-detail.tsx` 寫住「CH-030 F4 — the timeline first. **AI Assist is a Preview
card whose body is an EmptyState reading "Coming soon"**」,而 `ai-assist-card.tsx:39`
自己寫住「W46 `F8` — **replacing the "Coming soon" placeholder**」。
⇒ **兩份註釋互相矛盾咗一段時間,而冇嘢會紅。**
🟢 而正因為查咗,本單先講得出佢**唔算推翻 `F4`**:`F4` 反對嘅係「空 card 霸住頂,把
timeline 推落 fold」,三等分之後兩個都喺 fold 之上,**佢個理由結構上唔再適用**。
📌 **一個決定嘅理由過時,同一個決定被推翻,係兩件事** —— 只有前者唔使重新拍板。

**3. 一條 assert 排喺另一條後面,可以令佢由「守衛」變成「複述」。**
`G1` 本來寫成一條 test:先 `toEqual(['12','12.5','11.5'])`,再 loop 查每個值喺唔喺
`typography.css` 個 scale。⚠️ **咁樣個 loop 冇可能紅** —— `toEqual` 一過三個值就釘死,
而嗰三個本來就喺 scale。拆做兩條之後,falsification 道 1(把 label 改成 `13px`)得出
**兩條紅**,其中 `13px is not in typography.css` **refactor 之前結構上出唔到**。
📌 同 W47 `F3-6` 嗰兩條「瞄準一個唔存在嘅 collaborator」嘅 assert 同族,但機制唔同:
**呢次瞄準嘅嘢存在,只係前面嗰條已經把答案定死。**

**4. render probe 要自己判 pass/fail,唔可以淨係印數字出嚟畀人肉對。**
`G2`(三個 panel 齊頭等闊)第一版只係印 rects,而「三個並排」正正係嗰種**兩個啱咗就
睇落似成功**嘅 claim。加咗 verdict 之後,falsification 道 2 得出
`G2: FAIL` · `tops [362, 362, **562**]` · `widths [**757**, 371, 371]` ——
**證到個 probe 唔係 tautology**(`spec.md` `R2`)。

### 證據(唔係推論)

| | 前 | 後 |
|---|---|---|
| 三個 panel `top` | `362 / 362 / 516`(第二張 `460 / 321 / 747`) | **`362 / 362 / 362`**(第二張 `460 / 460 / 460`) |
| 三個 panel `width` | `757 / 371 / 371` | **`371 / 371 / 371`** |
| ticket 字級 | `11.5 / 11.5 / 11` | **`12 / 12.5 / 11.5`** |
| remark | `insideGrid: true` · width `723` | **`insideGrid: false`** · width **`1110`** |
| `overflowsX` | false | **false**(4 個組合) |
| `accentButtons` | `["Check now"]` | **`["Check now"]`**(冇加第二個 primary) |

### 🚧 carry-over

**DEV live 驗**唔喺本單 acceptance,留下次部署同 CH-032 一齊做。
📌 **有一個樣本機驗唔到**:Chris 原本睇嗰張 `REQ0044105` **冇 agent run**,而本機三張單
**全部有** ⇒ 「`No run yet` 佔一整欄」個樣要喺 DEV 先睇到。

### 狀態

**done** — `G1`–`G8` 八條全 ✅。
