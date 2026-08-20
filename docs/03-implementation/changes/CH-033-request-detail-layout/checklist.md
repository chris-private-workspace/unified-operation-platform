# CH-033 — checklist

> 由 `spec.md` §4 deliverable + §5 acceptance 推導。2026-08-20 一日做完。

## 落地

- [x] `A` `TicketRef` 三個字級各升一級(`12` / `12.5` / `11.5`,全部喺 `typography.css`)
- [x] `B` 三等分 grid,三個 panel 各佔一欄
- [x] `C` `Request remark` 提出 grid 之外,full width
- [x] `D` `mayUseAgent` 為假 ⇒ `lg:grid-cols-2`
- [x] `E` 改返 `CH-030 F4` 嗰句過時註釋(W46 `F8` 早就換走 "Coming soon")
- [x] `F` Test —— 新檔 `request-detail.layout.test.tsx`,**7 條**

## Acceptance

- [x] `G1` 字級 —— 兩條 test:①三個值係 `D1` 揀嗰三個 ②**每個都喺 `typography.css`**
      (第二條係拆出嚟先有意義,見 `spec.md §6`)+ 一條 10.5px 下限
- [x] `G2` 三個 panel 各佔一欄 —— **render probe 自己判**:`tops` 三個相同 ·
      `widths` 相差 < 2px ⇒ **`PASS` × 4**(2 張單 × light/dark),實測 `362/362/362`
      同 `460/460/460`,三個 width 都係 `371`
- [x] `G3` `OPCO_IT` 唔會見到一個窿 —— 2 條 test(cols-2 + AI Assist 唔喺 DOM;cols-3 + 喺)
- [x] `G4` remark 喺 grid 之外 —— `grid.contains(blockquote) === false`,實測 width `723 → 1110`
- [x] `G5` Line items 喺窄欄讀得到 —— **pass**,見下面「唯一退讓」
- [x] `G6` H6 light + dark —— 兩 theme 真 render · `overflowsX: false` × 4 ·
      `accentButtons` 最多一個(`Check now`)
- [x] `G7` root gate —— api **1491 / 98** · web **562 / 50** · lint 0 · build 0
- [x] `G8` falsification —— 四道逐道拆,**零誤傷**

## 收尾

- [x] `spec.md` §6 補實際 falsification 結果 + 記低 `G1` 個 refactor
- [x] `progress.md` 完成摘要
- [x] `CLAUDE.md §0` + `SESSION_SUMMARY` 換座標
- [x] **DEV 上機** —— 🟢 **部署 #13(`dev-9053bcd`)2026-08-20 做咗**。
      🔴 **本單一個新字串都冇**(淨係改 class 同版面)⇒ **唯一嘅 bundle 證據喺 CSS**:
      `.lg\:grid-cols-2` 由 **×0 → ×1**(`lg:grid-cols-2` 喺 `04f3c86` 零檔)。
- [ ] 🚧 **DEV live 行為驗**(睇實物三欄)—— **Chris 人手做**(要登入,而 AI 側刻意
      唔喺瀏覽器打 break-glass 密碼,H4)。
      📌 Chris 原本睇嗰張單(`REQ0044105`)喺 DEV,而本機三張單全部**有** agent run
      ⇒ **`No run yet` 佔一欄** 嗰個樣本機**結構上**驗唔到,要 DEV 嗰張先睇到。

## 唯一退讓(`G5` 實際結果)

Line items 由 **757px → 371px**,而 render 實測:

| | 結果 |
|---|---|
| `POWERAUTOMATE_ATTENDED_RPA ×1` + `Assigned` badge | 🟢 **仍然一行**(最長嗰個 SKU 名都塞得落) |
| `Short path · no quote/PO · RITM0047389` | 🟢 一行 |
| `Step 4/4 · Completed` | ⚠️ **由一行變兩行** |
| 疊住 progress bar? | 🟢 **冇** |

⇒ 唯一 wrap 咗嘅係 progress **label**,冇遮住任何嘢 ⇒ `G5` pass,唔使退去 B(4 欄)。
