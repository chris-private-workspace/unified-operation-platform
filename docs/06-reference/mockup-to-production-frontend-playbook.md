# Mockup → Production Frontend Playbook

> **如何把一個 zero-build 的瀏覽器原型(mockup)轉成生產前端,而不累積視覺 drift。**
>
> 本文件由 EKP 項目 W19–W24 前端 sprint cycle 的實戰經驗提煉而成,寫成**可遷移**的方法論 —— 任何「有一份手寫 HTML/CSS/JS 原型,要在生產 Vite/Next + TypeScript + Tailwind/shadcn toolchain 上重現」的項目都適用。EKP 作為已驗證的案例研究貫穿全文。

| 項目 | 內容 |
|---|---|
| 文件類型 | Reference — 方法論 playbook |
| 來源 | EKP W19–W24 前端 sprint cycle(`feedback_design_fidelity.md` memory + `DESIGN_SYSTEM.md §7` + W22 presentation-rebuild phase) |
| 適用 | 任何用 zero-build mockup 開發生產前端的項目 |
| 不適用 | 純 backend / API / schema 變動;無 mockup 對應的工作 |
| 建立日期 | 2026-05-22 |

---

## 0. 這份文件解決什麼問題

典型徵狀(如果你的項目出現以下任何一條,本 playbook 適用):

- 真正達到 mockup「parity」的頁面只佔少數,大部分靠少量「strict 逐行重建」的頁面撐住
- 同一個頁面被做了 3–4 次,大量重做
- 每個 sprint 只能交付約一頁,epic 估時長到不切實際
- 「做完之後用眼睛比對,發現不對,再重做」
- 顏色靠眼睛湊(尤其 `oklch → HSL` 之類的色彩空間轉換)
- 訴求方、規範文件(AGENTS.md / CONTRIBUTING)、團隊實做三方對不齊

**核心論點**:這些徵狀的根因**不是執行不力**,而是**消費方法錯了** —— 團隊在「翻譯」mockup,而翻譯必然 drift。本 playbook 給出一個把翻譯鏈刪掉的方法。

---

## 1. 一頁總結(TL;DR)

1. **Zero-build mockup 不是一個整體,是兩層**:視覺層(`styles.css`)和組件邏輯層(`*.jsx` / `*.html`)。兩層的「可複製性」相反。
2. **視覺層可以無損複製** → **逐字複製,永不翻譯**。把 mockup 的 `styles.css` 整檔複製進生產 repo,組件直接消費 mockup 的 class 名。
3. **邏輯層無法複製**(zero-build:UMD / babel-standalone / window globals 無法被生產 bundler import) → **只重寫邏輯**(資料來源、模組系統、type),**不碰視覺**。
4. **「翻譯 CSS」是所有 drift 的根因**。一旦改成「複製 CSS」,drift 注入點從多個變成零 —— 因為一次檔案複製有 0 個注入點。
5. **色彩空間轉換(`oklch → HSL`)是 unforced error**。現代瀏覽器 + Tailwind 原生支援 oklch;保留 mockup 的原始色彩空間。
6. **drift 還是會發生**(設計師改 mockup、新人不熟)。靠 6 個治理機制收住:硬約束、重建不 patch、代碼層驗證、自動化守衛、設計系統文件、drift incident log。

> **單一最大槓桿**:停止翻譯 CSS,改成複製 CSS。其餘所有機制都是輔助。

---

## 2. 問題定義 — Zero-build mockup vs 生產 toolchain

設計原型常被刻意做成「零 build、瀏覽器直跑」,因為那讓設計師可以快速迭代、無需 toolchain。典型構造:

```html
<!-- mockup 的 index.html — 刻意 zero-build -->
<link rel="stylesheet" href="styles.css">                              <!-- 單一手寫 CSS -->
<script src="https://unpkg.com/react@18/umd/react.development.js"></script>   <!-- React UMD CDN -->
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>      <!-- 瀏覽器內 babel -->
<script type="text/babel" src="page-dashboard.jsx"></script>           <!-- 未編譯 JSX -->
```

特徵:React UMD + babel-standalone CDN、`window` 全域變數連結組件、單一手寫 `styles.css`、無 Tailwind / npm / bundler。

> **EKP 案例**:EKP 的 `references/design-mockups/EKP Platform.html` 正是此構造 —— `React 18.3.1 UMD` + `@babel/standalone@7.29.0` 全部 unpkg CDN、18 個 `<script type="text/babel" src="ekp-page-*.jsx">`、`window.MOCK_KBS` 全域連結、單一 30KB 手寫 `styles.css`(oklch 色彩)。

**這個構造在技術上無法被生產的 Vite/Next + TS + Tailwind toolchain 直接 `import`。** 這是真實限制,不是藉口。

❌ **錯誤推論**:「既然不能直接 import,就只能整份翻譯重寫。」

✅ **正確推論**:「不能 import 的只有**邏輯層**。視覺層是純 CSS,生產端再 load 一個 `.css` 完全合法 —— 它可以、而且應該被無損複製。」

---

## 3. Drift 的根因 — 你在翻譯 CSS

當團隊「整份翻譯重寫」時,翻譯鏈長這樣,**每一個箭頭都是一個 drift 注入點**:

```
mockup styles.css                          翻譯動作                  drift 注入
─────────────────────────────────────────────────────────────────────────────
.btn { padding: 0 14px; height: 32px }  →  Tailwind「h-8 px-3.5」 →  px-3.5=14px? 還是 px-4? 湊
oklch(0.65 0.18 25)                     →  HSL「hsl(14 90% 58%)」 →  色彩空間轉換,用眼湊
.card { box-shadow: 0 1px 2px ... }     →  shadcn shadow-sm        →  陰影參數不同,近似
border-radius: 10px                     →  rounded-lg (8px)        →  就近取整
font-feature-settings: "cv11"           →  (通常直接掉了)          →  靜默遺失
```

**關鍵事實**:手工把一個 CSS 宣告翻譯成 utility class **必然 lossy**。每個 spacing、radius、shadow、typography 數值都在「找最接近的 utility」時被就近取整。`oklch → HSL` 更糟 —— 那是跨色彩空間轉換,沒有人能用眼睛湊準。

把上面這張表乘以「31 條路由 × 每頁數十個元素」,你得到的就是:**每頁手工、每 sprint 一頁、做完發現不對再重做**。這不是執行問題,是**方法問題** —— 翻譯這個動作本身產生 drift。

> **推論**:要消滅 drift,不是「翻譯得更仔細」,而是**刪掉翻譯這個動作**。

---

## 4. 核心解法 — 把 mockup 拆成兩層

### 4.1 兩層的可複製性相反

| Mockup 的層 | 典型檔案 | 能否無損複製到生產? | 為什麼 | 正確處理 |
|---|---|---|---|---|
| **視覺層 / CSS** | `styles.css` | ✅ **可以** | CSS 是純文字宣告。生產端在 Tailwind preflight 之後再 load 一個 `.css` 完全合法,瀏覽器照常 cascade。 | **逐字複製,永不翻譯** |
| **組件邏輯層** | `*.jsx` / inline `<script>` | ❌ **不可以** | `window` 全域、`babel-standalone`、UMD 模組無法被生產 bundler 解析。 | **重寫成 TSX / 生產模組** |

這條接縫就是答案。「複製即用」對了一半(CSS),「重寫」也對了一半(邏輯)。把每個動作套在正確的層上。

### 4.2 視覺層 — 逐字複製(4-layer sync protocol)

把 mockup 的 `styles.css` **整檔機械複製**進生產 repo,作為一個 sibling stylesheet,在 Tailwind preflight **之後** load。生產組件**直接消費 mockup 的 class 名**(`.btn`、`.card`、`.nav-item`…),不重新拼成 Tailwind utility。

EKP 把這條鏈正式化成 **4-layer sync protocol**:

```
┌──────────────────────────────────────────────────────────┐
│ Layer 1（canonical）  mockup/styles.css                   │
│   設計師唯一改這裡。                                       │
└────────┬─────────────────────────────────────────────────┘
         │ verbatim copy（逐字複製,連順序、註解都保留）
         ▼
┌──────────────────────────────────────────────────────────┐
│ Layer 2（生產採用）  frontend/app/styles-mockup.css        │
│   機械複製,除頂部 @tailwind directive 外零修改。          │
│   ⚠ 絕不直接編輯此檔 —— 它不是 source of truth。          │
└────────┬─────────────────────────────────────────────────┘
         │ extract :root CSS vars only
         ▼
┌──────────────────────────────────────────────────────────┐
│ Layer 3（Tailwind 橋接）  frontend/app/globals.css         │
│   :root 色彩 token,Tailwind config 包成                   │
│   oklch(var(--token)) 供 utility class 消費。              │
└────────┬─────────────────────────────────────────────────┘
         │ mirror color tokens（只鏡像色彩,不含 radius/font）
         ▼
┌──────────────────────────────────────────────────────────┐
│ Layer 4（TS 鏡像）  frontend/lib/theming/tokens.ts         │
│   colorsLight / colorsDark 物件供 tailwind.config 用。     │
└──────────────────────────────────────────────────────────┘
```

關鍵字是 **verbatim copy** —— Layer 2 是「複製」不是「詮釋」。複製是機械動作,有 0 個 drift 注入點。

**當 mockup 變更時的 re-sync 程序**:

*Token 變更(色彩 / radius / font / layout var)*
1. 在 Layer 1 `styles.css` 的 `:root`(或 `.dark`)block 改
2. 整檔 re-copy 到 Layer 2(保留生產檔頂部的 `@tailwind` directive)
3. 若色彩 token 變了 → 更新 Layer 3 `globals.css` 的裸值
4. 若色彩 token 變了 → 更新 Layer 4 `tokens.ts` 的對應字串
5. 跑 verify gates(見 §7.4)
6. 測 dark mode toggle
7. 若這是 drift 修復(非計畫內變更)→ **同一個 commit** 內在 drift incident log 加一行
8. Commit:`style(tokens): <what> — sync styles.css → styles-mockup.css + globals.css + tokens.ts`

*Class 定義變更(新 primitive / 改 hover 等)*
1. 在 Layer 1 改 class 定義
2. re-copy 到 Layer 2
3. Layer 3 / 4 無需改(那兩層只帶 token,不帶 class 定義)
4. 若新增 class → 在設計系統文件(見 §7.5)的 primitive index 加一行
5. 若是 drift 修復 → drift incident log 加一行
6. Commit:`style(<class>): <what> — sync styles.css → styles-mockup.css`

**絕對不要做**:
- 絕不直接編輯 Layer 2 `styles-mockup.css` 當作 source of truth —— 下次 re-sync 你的改動會被覆蓋
- 絕不在組件裡寫死色值 —— 一律走 `oklch(var(--token))`
- 絕不在 Layer 3/4 加 token 而不先加進 Layer 1 —— 那破壞 canonical-source 鏈
- 絕不為了「生產端方便消費」去改 mockup canonical —— mockup 是設計意圖,生產跟隨

### 4.3 組件邏輯層 — 只重寫邏輯,不碰視覺

邏輯層必須重寫,因為 zero-build 構造無法被生產 toolchain import。但重寫**只針對邏輯**,視覺(class 名、inline style)原封不動 copy。

標準 workflow,每頁:
1. 開 mockup 的 `page-*.jsx`(原型組件 source)
2. 開生產目標 `page.tsx`
3. **並排,逐行機械翻譯**:
   - `window.MOCK_XXX` 全域存取 → typed API client 消費
   - babel JSX → ES module TSX(`import { useState } from 'react'`)
   - mockup 自訂的 popover / dropdown → 生產的 a11y primitive(如 Radix)外殼 + **內層 mockup JSX 結構原樣保留**
   - **所有 mockup CSS class 名 + inline `style={{...}}` 原封不動保留**
   - icon:機械對應(見下)
4. 跑 verify gates
5. 用眼比對 —— 但這是**最後的信任閘**,不是發現機制(見 §7.3)

**機械翻譯規則**(只有真正必須翻譯的東西才翻譯,且機械、可重現):

- **Icon 對應靠 SVG 路徑形狀,不靠語意猜測。** 讀 mockup 的 icon SVG `path`,挑視覺路徑最接近的生產 icon。
  - ❌ 語意猜測:Dashboard 圖示 `IcHome`(房屋形)→ 猜成 `LayoutDashboard`(四宮格)—— 視覺不符
  - ✅ 路徑配對:`IcHome` → `Home`(房屋輪廓相符)
- **資料來源** `window` 全域 → typed client;`MOCK_DATA` → 真實 fetch。
- **互動也要對齊。** mockup 是單擊 toggle 就不要包成三態 dropdown;mockup 沒有的 UI 控制項就不要「順手加」。互動行為 drift 也是保真度 drift。

> **EKP 案例**:`frontend/app/styles-mockup.css` 是 `references/design-mockups/styles.css` 的逐字複製(30,881 bytes → 30,827 bytes,唯一刻意改動 = 頂部 `@tailwind` directive)。生產組件直接用 `.btn` / `.card` / `.nav-item` / `.workspace-switcher` 等 mockup class。`layout.tsx` 的 import 順序:`globals.css` 先(Tailwind preflight + 色彩 token),`styles-mockup.css` 後。

---

## 5. 與 Tailwind / shadcn 共存

採用本方法**不需要放棄 Tailwind / shadcn**。重新界定它們的角色:

| 工具 | 用途 | 不要用來 |
|---|---|---|
| **複製進來的 mockup CSS** | 視覺系統的 baseline —— 所有 primitive 外觀(按鈕、卡片、欄位…) | — |
| **Tailwind utility** | 一次性 layout 微調、responsive breakpoint | 重建視覺系統 / 翻譯 mockup class |
| **shadcn/ui primitive** | 需要 Radix a11y 的地方(Dialog / DropdownMenu / focus trap) | 取代 mockup 的視覺;shadcn 的 thin default 會丟失 mockup 的 rich content |

**CSS specificity 注意**:`styles-mockup.css` 在 Tailwind 之後 load。相同 specificity 下宣告順序贏 —— 所以 mockup `.btn { display: inline-flex }` 會蓋過 Tailwind `md:hidden`。當 Tailwind utility **必須**贏時,用 important variant:

```tsx
<button className="btn btn-icon md:!hidden">           {/* 只在 mobile 顯示 */}
<button className="btn btn-icon !hidden md:!inline-flex"> {/* 只在 desktop 顯示 */}
```

`!` 放在 variant prefix 之後、utility 名之前。不要為此翻轉 import 順序(會讓 Tailwind base reset 蓋過 mockup body 樣式)。

---

## 6. oklch 不要轉 HSL

如果你的 mockup 用 oklch 而團隊在轉 HSL —— **停止。這個轉換不需要發生。**

- 現代瀏覽器原生支援 `oklch()`。
- Tailwind 在 CSS custom property 上完全支援:把 oklch 裸值(`L C H`)放進 `:root`,config 包成 `oklch(var(--token))`。
- shadcn 預設主題用 HSL 只是**預設**,可以整碗換成 oklch token。

`oklch → HSL` 是跨色彩空間轉換,沒有人能用眼睛湊準 —— 它是一個**自找的(unforced)有損步驟**。保留 mockup 的原始色彩空間,色彩從頭到尾不變。

```css
/* globals.css :root — 保留 oklch,裸 L C H 值 */
--accent: 0.65 0.18 25;
--background: 1 0 0;
/* 組件透過 oklch(var(--accent)) 消費,Tailwind config 同樣包裝 */
```

---

## 7. Drift 治理 — 當 drift 還是發生時

即使方法正確,drift 仍會發生:設計師改了 mockup、新人不熟、re-sync 漏步。EKP 真實出過嚴重 drift —— **某個 sprint 出貨的頁面有 4 處 fundamental drift(TopBar 結構、Sidebar IA、主內容形狀、Typography),而且通過了全部自動化 gate**。它能收住,靠以下 6 個機制。這些就是治理層。

### 7.1 把設計保真度設為硬約束

保真度必須是一條**硬約束**(binding constraint),跟「不可改架構」「不可換 vendor」同層級,觸發即 **STOP**。如果保真度只是隱性期望,「做完了但不對」永遠不會觸發硬停 —— 它只會默默進下一個 sprint,drift 累積。

> EKP 把它寫成 `H7 Design Fidelity Constraint`(CLAUDE.md §5.7):實作與 mockup 任一項(layout / spacing / typography / color / interaction / responsive / a11y)不對齊 → STOP and ask,絕不自行 approximate。

### 7.2 Fundamental drift → 重建,不要 patch

**這條直接對應「同一頁做 3–4 次」的重做迴圈。**

重做迴圈的本質是:用**同一套會 drift 的翻譯方法**,patch 完發現還是不對,再 patch,再 redo —— 每次 redo 都用爛方法再注入一次 drift。

正確規則:
- **局部小偏差** → inline 修
- **根本性形狀不對**(top bar / sidebar / 內容 layout 多項 mismatch)→ 判定「方法錯了」,**先換方法,再一次性重建**

差別不在「重建 vs patch」,在於**重建之前先把方法換掉**。EKP 的 W22 就是:確認翻譯法是錯的 → 改成 CSS-first 逐字複製 → 一次性重建全部 15 頁。如果重做時還用舊方法,第 4 次跟第 1 次一樣 drift。

重建時**保留**架構層(routing、route group、API client、auth flow、backend、shell pattern),**只重建** presentation 層。

### 7.3 驗證在代碼層做,不是用眼

> 「為什麼需要用眼去檢查?你不是應該直接在代碼文件的層面去檢查和把它們弄到一致的嗎?」

驗證 = 開 mockup `page-*.jsx` 跟生產 `page.tsx` **並排,逐行機械比對**。用眼只是**最後的信任閘**(已對齊,確認一下),不是**發現機制**(靠眼睛找 drift)。

靠眼睛找 drift 必然漏掉 subtle 的 typography metrics / spacing 取整 / pseudo-state。而且「用眼發現不對」這件事本身就太晚 —— 等你看到,cumulative drift 已經深。

CSS 層的驗證更可以**完全程式化**:

```bash
diff mockup/styles.css frontend/app/styles-mockup.css
# 預期差異:只有頂部 @tailwind 3 行 + CRLF/LF 行尾。
# 其餘任何差異 = drift,立即查哪邊對(通常 mockup 對)。
```

「CSS 對不對」從一個用眼的主觀判斷,變成一個確定性的 `diff`。

### 7.4 自動化守衛

針對**特定 drift class** 設程式化守衛,放進 CI / pre-commit:

- **抓寫死色值**:`grep` 組件檔裡的 inline arbitrary 色值(如 Tailwind 的 `[oklch(...)]` / `[#...]` arbitrary class)—— 必須回傳 **0**。任何命中 = 有人把顏色眼睛湊進了組件。
- **`diff` 守衛**:§7.3 的 `diff styles.css styles-mockup.css`,預期差異極小。
- **type / lint gate**:`tsc --noEmit` exit 0、lint clean。
- ⚠ **但記住**:這些 gate **不 measure 視覺保真度**。EKP 的 4 處 fundamental drift 全部通過了自動化 gate。自動化 gate 抓的是「有沒有人違反機制」,不是「視覺對不對」。視覺保真度的 gate 是 §7.3 的代碼層並排比對 —— **不可以用自動化 gate 代替它**。

### 7.5 設計系統文件化一次

把設計系統(所有 primitive、layout pattern、composite pattern、色彩語意、interaction state 慣例)寫成一份 **dev API reference**。開發者**查文件**,不去 `styles.css` 重新推導。

每次重新推導 = 再 drift 一次。已經 documented 的 pattern 還重複推導,是浪費也是 drift 來源。

> EKP 的 `DESIGN_SYSTEM.md`:§0 quick reference card + 13-primitive index + layout patterns + composite patterns + 色彩語意 + interaction state 慣例 + §7 sync protocol + §8 季度健檢 checklist。

### 7.6 Drift incident log + anti-pattern 目錄

**Drift incident log** —— 每次 drift 修復在表格加一行:

| 日期 | Drift 內容 | 哪邊對 | 修復 commit |
|---|---|---|---|
| 2026-05-18 | `--popover` dark mode `0.20` vs `0.22` | mockup 對 | `a385180` |

**Anti-pattern 目錄** —— 把重複踩的坑寫成具名 anti-pattern,每個 frontend phase kickoff 對著它做 pre-flight 檢查。Drift 從「每次重新踩」變成「踩過一次就進目錄」。可遷移的通用 anti-pattern 見 §9。

---

## 8. 既有項目的遷移 checklist

把本 playbook 套進一個**已經在翻譯**的項目,按影響力排序:

- [ ] **1. 停止翻譯 CSS。** 把 mockup `styles.css` 逐字複製進生產 repo,在 Tailwind preflight 之後 load。組件改成直接用 mockup class 名。→ 刪掉大部分 drift 注入點。
- [ ] **2. 停止色彩空間轉換。** 若有 `oklch → HSL`(或類似),停掉。oklch 裸值放 `:root`,Tailwind `oklch(var(--token))` 消費。
- [ ] **3. 重新界定規範文件(AGENTS.md / CONTRIBUTING)的「重寫」scope。** 明文寫清:「重寫」只套用在組件邏輯層;CSS 是「複製」不是「重寫」。mockup 本身保持 zero-build(那是設計師迭代的功能,不要動);改的是生產端的複製方式。把這條原本的三方矛盾在文件裡寫死。
- [ ] **4. 建立 4-layer sync protocol** 與 re-sync 程序(§4.2)。
- [ ] **5. 加 CI 守衛**:`diff` styles 檔 + `grep` 抓寫死色值(§7.4)。
- [ ] **6. 把保真度設為硬約束**(§7.1)。
- [ ] **7. 訂「fundamental drift → 換方法後重建」規則**(§7.2)—— 停止用爛方法 redo。
- [ ] **8. 驗證移到代碼層**:mockup `.jsx` 與生產 `.tsx` 並排逐行(§7.3)。
- [ ] **9. 建設計系統文件 + drift incident log + anti-pattern 目錄**(§7.5 / §7.6)。

> **最短路徑**:第 1 + 第 2 點。逐頁手工翻譯的工作量,絕大部分花在翻譯 CSS。CSS 改成複製後,逐頁只剩「JS 邏輯接 API」,工作量大幅塌縮,且 drift 注入點歸零。先做這兩點,其餘是治理層、可漸進補。

---

## 9. Anti-pattern 目錄(可遷移版)

EKP W22 cycle 累積的具名 anti-pattern,通用化後:

| Anti-pattern | 為什麼錯 | 正確做法 |
|---|---|---|
| 手工把 mockup CSS 翻譯成 Tailwind utility | 每個 spacing / radius / typography 都被就近取整,lossy | 逐字複製 `styles.css`,組件消費 class 名 |
| `oklch → HSL`(或任何色彩空間轉換)用眼湊 | 跨色彩空間,無法湊準 | 保留原始色彩空間,oklch 走 CSS var |
| 語意猜測 icon 對應(`Dashboard` → `LayoutDashboard`) | SVG 形狀不同,視覺不符 | 機械 SVG 路徑配對 |
| 用 a11y primitive 的 thin default 取代 mockup rich content | 丟失 mockup 的 rich identity surface | primitive 只做 a11y 外殼,內層保留 mockup JSX |
| 「順手 preserve」一個 mockup 沒有的舊 UI 元素 | mockup 沒有 = 不該存在;preserve 它是 drift | mockup 沒有的元素 → drop,不要為「向後相容」留 |
| 把「backend 沒有對應」當理由 drop 一個 mockup 視覺元素 | backend 權威只管**資料契約**(欄位形狀),不管視覺元素的存在與否 | 視覺元素照 mockup 渲染;用 client-side 合成補功能 |
| mockup 是單擊 toggle 卻包成三態 dropdown | mockup 沒有的互動 = 互動 drift | 互動行為也要對齊 mockup |
| 規範文件(plan / spec)沿用舊 phase 的過時引用 | 過時的檔名 / 函式名 / pattern 污染新實作 | phase kickoff 先對規範文字做 pre-flight grep 比對 |
| 把「用眼比對」當主要驗證手段 | subtle drift 必漏 | 代碼層並排比對為主,用眼為最後信任閘 |
| 用自動化 gate(tsc / lint)代替保真度 gate | 那些 gate 不 measure 視覺;drift 照樣通過 | 保真度 gate = 代碼層 mockup-vs-impl 並排比對 |

---

## 10. 附錄 — EKP 案例證據

| 主張 | EKP 證據 |
|---|---|
| Mockup 是 zero-build 原型 | `EKP Platform.html`:React 18.3.1 UMD + `@babel/standalone@7.29.0` CDN + 18 個 `<script type="text/babel">` + `window.MOCK_*` 全域 + 單一 30KB 手寫 `styles.css` |
| CSS 逐字複製 | `frontend/app/styles-mockup.css` = `references/design-mockups/styles.css` 逐字複製(30,881 → 30,827 bytes) |
| 4-layer sync protocol | `DESIGN_SYSTEM.md §7`:`styles.css → styles-mockup.css → globals.css → tokens.ts` |
| oklch 保留不轉 HSL | `globals.css :root`:`--accent: 0.65 0.18 25`(裸 L C H),組件走 `oklch(var(--token))` |
| 翻譯法曾造成 fundamental drift | W20 Wave A 出貨 4 處 drift(TopBar / Sidebar / 主內容 / Typography),全通過自動化 gate |
| Fundamental drift → 換方法重建 | W22-frontend-presentation-rebuild:改成 CSS-first 逐字複製後,一次性重建 15 頁 |
| 保真度 = 硬約束 | `CLAUDE.md §5.7 H7 Design Fidelity Constraint` |
| 代碼層驗證 | `feedback_design_fidelity.md` memory:「verification 應該係 code-level diff,唔係 eye-comparison」 |
| 自動化守衛 | `grep '\[oklch'` 必須回傳 0;`diff` styles 檔 |
| 設計系統文件化 | `DESIGN_SYSTEM.md`(13 primitive index + pattern catalog + §7 sync + §8 健檢) |
| Drift incident log | `DESIGN_SYSTEM.md §7.3` 表格 |
| Anti-pattern 目錄 | `feedback_design_fidelity.md` 的 W22 5-pattern catalog(D1 / D6 / D7 / D8 / D9) |

---

*本 playbook 的方法論來源:EKP W19–W24 前端 sprint cycle。EKP 內部規範見 `CLAUDE.md §3.2 / §3.2.1 / §5.7`、`references/design-mockups/DESIGN_SYSTEM.md §7`。本文件為可遷移版本,供其他用 mockup 開發前端的項目參考。*
