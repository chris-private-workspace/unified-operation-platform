# CH-034 — checklist

> 由 `spec.md` §4 + §5 推導。2026-08-20 一日做完。

## 落地

- [x] `A` 左欄改垂直 flex,sync gate 由 Card 底部搬入去
- [x] `B` 收窄 —— `self-start` + `max-w-full`(唔係 `w-fit`,見下)
- [x] `C` 同 Avatar 左邊對齊(gate 係 avatar row 嘅**兄弟**,唔係姓名 block 嘅 child)
- [x] Test **+2**(`request-detail.layout.test.tsx`,CH-033 開嗰個檔)

## Acceptance

- [x] `G1` gate 喺左欄 —— test:由 `h1` 行上去揾共同 ancestor,佢**含** `AD account created`
      而**唔含** `Onboarding request`
- [x] `G2` 收窄 —— render probe:gate `width` **780 / 789** vs 內容區 **1144**
- [x] `G3` 同 Avatar 對齊 —— `gateLeft` = `avatarLeft` = `leftColLeft` = `avatarRowLeft`
      = **289**(四個逐格相同)
- [x] `G4` 兩個 gate 狀態都 render 過 —— **全開**(`License assigned`,`wrapped: false`)·
      **未開**(`Check now` + `Mark synced`,`wrapped: true`)× light/dark = 4 張
- [x] `G5` 冇整爛 CH-033 —— **重跑咗個 verdict**:`CH033_G2: PASS` × 4
      (順帶 `tops` 由 `362` 變 `347` ⇒ header 真係矮咗)
- [x] `G6` H6 —— `overflowsX: false` × 4 · `Check now` 仍然係唯一 accent
- [x] `G7` root gate —— api **1491 / 98** · web **564 / 50**(+2)· lint 0 · build 0
- [x] `G8` falsification —— 兩道各 **恰好 1 紅**,零誤傷

## 收尾

- [x] `spec.md` §6 補實際 falsification 結果
- [x] `progress.md`
- [x] `CLAUDE.md §0` + `SESSION_SUMMARY`
- [x] 🟢🟢 **DEV 上機 —— 部署 #14(`dev-4a92be0`)2026-08-21 做咗**(連 CH-035 一齊)。
      🔴 **上面嗰句「marker 只可能喺 CSS(`self-start` 舊版有冇**要驗**)」—— 驗咗,答案係
      唔得。** `self-start` 喺 `9053bcd` **四個檔已經用緊**(`change-password-form` /
      `sidebar` / `top-bar` / `settings`)⇒ Tailwind **一早生成咗 `.self-start` 呢條 rule**
      ⇒ 「CSS ×0 → ×1」結構上冇可能成立。
      🟢 **改用 `max-w-full`,而佢喺舊版係實測零檔** ⇒ 兩個 marker 都成立:
      JS className 相鄰組合 `max-w-full flex-wrap` **×0 → ×1** · CSS `.max-w-full` **×0 → ×1**。
      📌 **本 checklist 當時寫「要驗」而唔係「就係佢」,係啱嘅** —— 而下一手(部署 #14)
      **真係去驗咗**,先冇用一個假 marker 收貨。
- [ ] 🚧 **DEV live 睇實物** —— Chris 人手(AI 側唔喺瀏覽器打 break-glass 密碼,H4)

## 🔴 一個 probe 教訓(值得記入 progress)

`G3` 第一次跑報 **`FAIL`**(gate `left: 289` vs `avatarLeft: 248`),而 **code 係啱嘅** ——
`248` 正正係 sidebar 寬度,即我個 probe 由 `h1` 行三層 `parentElement` **行過咗頭**,
量咗 main 區。改成由 **gate 自己**錨定(`gateBox.parentElement` = 左欄 →
`.firstElementChild` = avatar row → `.firstElementChild` = Avatar)之後全部 `289`。

📌 **揭穿佢嘅唔係座標,係身份** —— 我加咗印 `avatarClass` 同 `avatarWidth`,
見到 `44`(逐格等於 code 入面 `size={44}`)先確定今次真係揾到 Avatar。
⇒ **幾何 probe 要連「你量緊邊個 element」一齊印**,否則一個錯 element 會報一個
唔存在嘅缺陷,而你會去改一段本身冇問題嘅 code。
