---
change_id: CH-033
title: Request detail —— ticket reference 字體 + 三個 panel 並排
status: approved       # proposed | approved | done
approved: 2026-08-20   # Chris Lai —— 見 §3(三條決定當場答咗)
owner: Chris Lai
author: AI
opened: 2026-08-20
source: Chris 2026-08-20 睇 REQ0044105 個畫面提出
---

# CH-033 — request detail 版面兩處調整

> **狀態:`approved`** —— Chris 2026-08-20 當場答咗三條決定(字體升一級 · layout **A**
> 三等分 · 批准借 5433 做 render),所以呢份 spec 記錄嘅係**已批嘅 scope**,唔係提案。
> 我自己判斷嗰兩條(`D3` / `D4`)標明咗係我揀,render 之後畀 owner 驗收。

---

## 0. 分類

`PROCESS §1.2` —— **Change**:改現有 feature 嘅呈現,行為本來冇錯(唔係 Bug-fix),
< 1 日,掂 UI(H6)。零 schema · 零 API · 零新 dep。

---

## 1. Context

Chris 睇住 `REQ0044105` 個 request detail 提出兩件事。

### ① 右上角三組 ticket reference 字體太細

`request-detail.tsx:1201-1211`(`TicketRef`):

```tsx
<span className="… text-[11.5px] text-fg-muted">   {/* label + 號碼 */}
<span className="text-[11px] text-fg-subtle">      {/* sub 句 */}
```

對返 `design_handoff_licenseops/design-system/tokens/typography.css`:

| 位 | 而家 | scale 名 | 用途(token 檔原文) |
|---|---|---|---|
| label + 號碼 | `11.5px` | `--text-2xs` | dense meta |
| sub 句 | `11px` | `--text-3xs` | timestamps, sub-meta |

⇒ **佢哋用緊成個 scale 上面最細嗰兩級**(再落去只剩 `--text-micro: 10.5px`,而
token 檔明文寫「Never smaller than 10.5px」)。呢三行係 CH-030 `F1` 加嘅,而嗰單
關心嘅係「講唔講得清三張飛係三件事」,冇人為「睇唔睇得清楚」把過關。

### ② Line items / Operational history / AI Assist 想並排

`request-detail.tsx:593` 今日:

```tsx
<div className="grid grid-cols-1 gap-[16px] lg:grid-cols-3">
  <div className="… lg:col-span-2">   {/* Request remark + Line items */}
  <div className="…">                 {/* Operational history + AI Assist */}
```

⇒ **兩欄已經並排咗**,而 Chris 見唔到 AI Assist 係因為佢喺 Operational history
**下面**,畀 timeline 推到 fold 以下(截圖右欄去到底都仲係 timeline)。

### 🔴 ③ 查證揭到一句過時嘅註釋 —— 而佢正正係反對本單嘅理由

`request-detail.tsx:955-958` 寫住:

> CH-030 F4 — the timeline first. **"AI Assist" is a Preview card whose body is an
> EmptyState reading "Coming soon"**, so it was holding the top of the right column
> with nothing in it …

⚠️ **呢句今日唔啱** —— `ai-assist-card.tsx:39` 自己寫住「W46 F8 / ADR-0036 — the AI
Assist card, **replacing the "Coming soon" placeholder**」。今日三種狀態:

| 狀態 | 內容 |
|---|---|
| loading | `Loading` |
| **冇 run** | `Preview` badge + `No run yet` EmptyState + **一個撳得嘅入口** |
| 有 run | steps + proposals + status badge(完整) |

🟢 **所以本單唔算推翻 CH-030 `F4`** —— `F4` 反對嘅係「**一個空 card 霸住頂,把
timeline 推落 fold**」,而三等分之後**兩個都喺 fold 之上**,嗰個理由結構上唔再適用。
📌 記低係因為:**一個決定嘅理由過時咗,同個決定被推翻,係兩件事**,而只有前者
唔使開 ADR / 唔使 owner 重新拍板。

---

## 2. Scope

### In

- `A` `TicketRef` 三個字級各升一級(**只用既有 scale**)
- `B` 三個 panel 三等分並排(layout **A**)
- `C` `Request remark` 搬去 grid **之上** full-width(`D3`)
- `D` `mayUseAgent` 為假嗰陣 grid 由 3 欄變 2 欄(`D4`)
- `E` 更新 `request-detail.tsx:955-958` 嗰句過時註釋
- `F` Test

### Out(明文)

- ❌ **唔改 `TicketRef` 嘅結構 / 措辭 / 條件**(CH-030 `F1` + ADR-0035 決定,只改字級)
- ❌ **唔改 `AiAssistCard` 本身**(只係換佢住喺邊)
- ❌ **唔改 Line items 每行嘅內容**(如果三等分之下太窄,見 `R1` 個出路)
- ❌ 零 API · 零 schema · 零 migration · 零新 token · 零新 primitive

---

## 3. Decisions

| # | 問題 | 決定 | 誰 |
|---|---|---|---|
| **D1** | 字體升幾多 | ✅ **升一級**:label `11.5 → 12px`(`--text-xs`)· 號碼 `11.5 → 12.5px`(`--text-sm`)· sub `11 → 11.5px`(`--text-2xs`) | **Chris** |
| **D2** | 三個點並排 | ✅ **A —— 三等分 `lg:grid-cols-3`**,每個各佔一欄 | **Chris** |
| **D3** | `Request remark` 去邊 | 🔵 **搬去 grid 之上,full width** | **AI 判斷**,見下 |
| **D4** | `OPCO_IT` 見唔到 AI Assist ⇒ 右邊一個窿 | 🔵 **grid 條件式:`mayUseAgent` 為假就 `lg:grid-cols-2`** | **AI 判斷** |

**`D3` 點解 full width 唔係塞返入 Line items 嗰欄**:三等分嘅價值就係三個 panel
**齊頭對齊**,而 remark 塞入其中一欄會即刻打破嗰個對齊;加上佢係 ServiceNow free
text(`text-[13px]` italic blockquote),喺 ~430px 欄入面會 wrap 到好難讀。
⚠️ 佢**只喺 `req.rawRequestText` 有值先出現**,所以大部分單根本睇唔到分別。

**`D4` 點解唔係「照留一個窿」**:`grid-cols-3` 得兩個 child 就係右邊 1/3 空白,
而 `OPCO_IT` **每一張單**都會係咁 —— 唔係邊緣情況,係一整個 role 嘅日常畫面。

---

## 4. Deliverables

| # | 內容 | 檔 |
|---|---|---|
| `A` | `TicketRef` 三個字級升一級 | `apps/web/src/pages/request-detail.tsx` |
| `B` | 三等分 grid + 三個 panel 各自一欄 | 同上 |
| `C` | `Request remark` 提去 grid 之上 | 同上 |
| `D` | `mayUseAgent` 為假 ⇒ 2 欄 | 同上 |
| `E` | 改返 `CH-030 F4` 嗰句過時註釋 | 同上 |
| `F` | Test | `apps/web/src/pages/request-detail.*.test.tsx` |

---

## 5. Acceptance

| # | 準則 | 收貨標準 | Block? |
|---|---|---|---|
| `G1` | 字級真係升咗,而且**係 scale 上面嘅值** | source scan:`TicketRef` 入面三個字級逐個等於 `12px` / `12.5px` / `11.5px`,兼且**逐個都喺 `typography.css` 揾得返**(唔係我自己作嘅數) | **Yes** |
| `G2` | 三個 panel 各佔一欄 | render probe:三個 card 嘅 `getBoundingClientRect().top` **相等**(齊頭),`width` 三個相差 < 2px | **Yes** |
| `G3` | `OPCO_IT` 唔會見到一個窿 | test:`mayUseAgent` 為假 ⇒ grid class 係 `lg:grid-cols-2`,兼且 AI Assist **唔喺 DOM** | **Yes** |
| `G4` | `Request remark` 喺 grid 之上 full width | test:remark card **唔喺**三欄 grid 入面(`grid.contains(remark) === false`) | **Yes** |
| `G5` | Line items 喺窄欄仍然讀得到 | render:一行嘅 SKU + badge + meta **唔可以** wrap 到疊住 progress bar;⚠️ 唔合格嘅出路見 `R1` | **Yes** |
| `G6` | H6 light + dark | 兩個 theme 真 render · 零橫向溢出 · **一個 view 一個 primary** | **Yes** |
| `G7` | root gate | test / lint / build exit 0 | **Yes** |
| `G8` | falsification | 每道新閘一次,真紅零誤傷 | **Yes** |

---

## 6. Falsification 計劃(逐道拆)

| 道 | 拆咩 | 預期 | **實際(2026-08-20 真跑)** |
|---|---|---|---|
| 1 | label 改成 **`13px`**(一個唔喺 scale 嘅值) | `G1` 紅,而且**要講得出邊個值唔啱** | **2 紅**,兩條各講一件事:①`expected [ '13', '12.5', '11.5' ] to deeply equal [ '12', '12.5', '11.5' ]` ②**`13px is not in typography.css`** |
| 2 | grid 加返 `[&>*:first-child]:lg:col-span-2` | `G2` 紅(三個唔再等闊) | ✅ **`G2: FAIL` 兩個 theme** —— `tops [362, 362, **562**]` · `widths [**757**, 371, 371]`(AI Assist 跌咗落第二行) |
| 3 | 拿走 `mayUseAgent` 條件,永遠 `cols-3` | `G3` 紅 | ✅ **恰好 1 紅** — `expected 'grid … lg:grid-c…' to contain 'lg:grid-cols-2'` |
| 4 | `Request remark` 搬返入 grid | `G4` 紅 | ✅ **恰好 1 紅** — `expected true to be false` |

**零誤傷**:四道加埋冇一條無關 test 變紅。

### 🔴 道 1 順帶證明咗一個 refactor 有意義,而佢原本冇

`G1` 本來寫成**一條** test:先 `toEqual(['12','12.5','11.5'])`,再 loop 查每個值喺唔喺
scale。⚠️ **咁樣個 loop 結構上冇可能紅** —— `toEqual` 一過,三個值就釘死,而嗰三個
本來就喺 scale ⇒ **佢瞄準緊一個永遠成立嘅嘢**(同 W47 `F3-6` 兩條對住一個唔再存在嘅
collaborator 嘅 assert 同族)。

拆做兩條之後,道 1 兩條**一齊紅而且各講一件事**:一條講「值變咗」,另一條講
「**`13px` 唔喺 `typography.css`**」——後者**refactor 之前冇可能出現**。
📌 **一條 assert 排喺另一條後面,可以令佢由『守衛』變成『複述』。**

⚠️ **每道都要問「紅嘅原因係咪我想證嗰個」**(W47 `F3-6`:33 紅但原因唔啱)。

---

## 7. Risks

| # | 風險 | 處理 |
|---|---|---|
| `R1` | **Line items 喺 ~430px 太窄** —— 一行要塞 SKU 名 + `×N` + `Assigned` badge + `Short path · no quote/PO · RITM…` + 4 點 progress | `G5` render 實測。**唔合格就 STOP 報返 owner**,唔可以自己改行內容(嗰個係 out of scope);出路 = 退去當日問過嘅 **B(4 欄 2+1+1)** |
| `R2` | `G2` 個「三個等闊」probe 可能係 tautology(量度嘅係我自己寫嗰個 class 嘅結果) | probe **唔讀 class,只讀 `getBoundingClientRect()`** —— 即由瀏覽器算完之後嘅真幾何;falsification 道 2 驗佢捉唔捉到 |
| `R3` | 字級升咗令 header card 右上角迫爆,或者 push 到 `Edit` 掣 | `G6` render 睇實;三行都係右對齊 `items-end`,有 wrap 空間 |
| `R4` | 三等分之後 **Operational history 會變窄而佢每條 event 文字最長** | 呢個係 A 方案自帶嘅代價(當日問嗰陣已經寫喺 option B 個 preview 度),`G6` render 睇實 |

---

## 8. 🔴 兩件要 owner 知

1. **`D3` / `D4` 係我判斷嘅**,唔係你答過嘅。render 之後你睇實物,唔啱改一行就得。
2. **`R1` 係本單唯一可能推翻 `D2` 嘅嘢** —— 如果 Line items 喺 1/3 寬真係散,
   我會**停手報你**,唔會自己去改 line item 每行嘅內容嚟遷就版面
   (嗰個係另一單,而且會郁到 CH-024 / CH-030 定落嘅嘢)。
