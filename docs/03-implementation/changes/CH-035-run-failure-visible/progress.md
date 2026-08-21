# CH-035 — progress

## Day 1(2026-08-21)—— 開工到收工,一日做完

`D1` = **C** 批出之後開工。`spec.md` flip 做 `approved`,checklist derive,實作 → test →
falsification ×4 → light/dark render → root gate,全部同日。

### 交付

| # | 內容 | 檔 |
|---|---|---|
| `A` | `RUN_SELECT` + nested 攞最後一條 failed step | `agent-conversation.service.ts` |
| `B` | `AgentConversationRunDto.whoFixes`(受控字彙 enum) | `dto/agent-conversation.dto.ts` |
| `C` | `WHO_FIXES` 抽共用(**一個字冇改**) | `lib/who-fixes.ts`(新)· `assign-result-dialog.tsx` |
| `D` | `AgentConversationRun.whoFixes` | `api-types.ts` |
| `E` | `latestRunFailure()` + `FAILED_STATUSES` | `lib/assistant.ts` |
| `F` | `/assistant` failed 分支 | `assistant.tsx` |
| `G` | dock failed 分支(主句逐字一致) | `agent-dock.tsx` |
| `H` | Test ×4 組 | 見下 |

**零 schema · 零 migration · 零新 endpoint · 零新 dep · 零新 token · 零新 primitive ·
零新 icon**(`CircleAlert` 一早用緊)· **零 ADR**。

### Gate

| | 前 | 後 |
|---|---|---|
| api | 1491 / 98 suites | **1495 / 98**(+4) |
| web | 564 / 50 files | **577 / 51**(+13,+1 檔) |
| lint | — | **exit 0** |
| build | — | **exit 0** |

---

## 🔴 五件值得記住嘅事

### ① `get()` 嘅成功路徑喺 api 側從來冇 test 行過,而我啱好把新 code 放咗喺嗰度

寫完 API 側,我預期現有 spec 會紅(`conversationRow` mock **冇 `runs`**,而新 code 直接
`.map` 佢)。**實際 44/44 全綠。**

原因:現有 `it.each(['get', 'archive', 'unarchive'])` **只測 Forbidden 路** —— 喺
`assertOwner` 就 throw,行唔到 response 那段。⇒ `get` 送咩形狀,由頭到尾冇人 assert 過。

📌 **形狀同 W45 `apiPatch` / `BUG-011` 一樣**:前端 suite 自己砌 `whoFixes` fixture,
所以「API 有冇真係送」呢個問題**兩層都唔喺位置問得出**。補咗四條(48/48),其中一條係
**負面**:`expect(result.runs[0]).not.toHaveProperty('steps')`。

⚠️ 而「我估佢會紅、實際佢綠」呢件事本身就係證據 —— 如果我照直覺當佢有 test,就會漏咗。

### ② `G5` 個 test 自己證明唔到自己

兩條 assert 排住,道 1 拆走 branch 之後**第一條就紅,第二條冇跑過**。「failed 同 Thinking
唔會同時出」呢個 claim,要**道 4**(令兩者可以同時 true)先真證到。
📌 同 CH-033 嗰個「一條 assert 排喺另一條後面」同族,但機制唔同:**嗰次係前面把答案釘死,
今次係前面紅咗令後面冇機會跑**。

### ③ 道 3 令 UI test 零紅 —— 「只睇最新 run」全靠新開嗰個 helper 檔

`lib/assistant.ts` 之前**冇 test 檔**,兩個 helper 全靠 UI test 間接蓋。而把
`latestRunFailure` 改成「有任何一條 failed」之後,**兩個 UI suite 一條都冇紅**。
⇒ 冇咗 `lib/assistant.test.ts`,呢個改動會靜靜過骨,後果係一條正常 thread 上面掛住永久錯誤。

### ④ 🔴 render probe 有副作用 —— 我 archive 咗兩條唔屬於我嘅 thread

`/assistant` 每行都寫住 `No request context`,冇嘢分辨得到邊條係目標,所以我寫咗一個
「逐個 row 撳落去直到見到主句」嘅 loop,selector 用 `li button`。

**而每個 `<li>` 有兩個 button** —— open **同** archive(`IconButton`)⇒ `rows=30` 而 API
只有 15 條 thread,個 loop 把 index 1、3 …**當成 open 掣去撳**。

實測後果:`cmt1a128p…` 同 `cmt18hj1s…` 兩條(**Chris 08-20 開嘅**,唔係我開嘅)喺
`01:40:26` / `01:40:28` 被 archive。已經 `POST :id/unarchive` 還原,DB 覆核
**`archived = 0` / `active = 16`**。

📌 **兩個教訓**:①`30 ≠ 15` 呢個數字對唔上,係揭穿佢嘅唯一線索 —— **probe 印低「你數到幾多
個」同「應該有幾多個」,先分得出 selector 揀錯咗嘢** ②**一個「逐個撳落去」嘅 probe 唔係
唯讀嘅**,而 render check 一路以嚟都當自己係觀察工具。

### ⑤ `/assistant` 嗰半 render 用真數據,dock 嗰半係注入 —— 兩種證據唔可以寫成同一種

Chris 08-20 撞到嗰條 thread(run `cmt180d3m…`)仍然喺本機 DB ⇒ `/assistant` render 嘅係
**真 API response**,兼且順帶證咗 server 側 mapping 端到端通(live 打 API 實測返
`whoFixes=platform`)。

而 **dock 冇 thread 列表**(W49 記低嘅缺口)⇒ 佢只開得到**新** thread,而新 thread 而家會
成功(Azure OpenAI 配好咗,`spec R4` 預告咗呢件事)⇒ dock 嗰半用 `page.route` 改寫
conversation GET 注入一條 failed run。**佢驗嘅係 render,唔係 API。**

---

## Render 實測(`G6`)

| | assistant light | assistant dark | dock light | dock dark |
|---|---|---|---|---|
| headline | ✅ | ✅ | ✅ | ✅ |
| `whoFixes` 句 | ✅ | ✅ | ✅ | ✅ |
| **`Thinking…` 喺唔喺畫面** | **false** | false | false | false |
| `insideTranscript`(`D3`) | **true** | true | true | true |
| icon 色(`--danger`) | `rgb(200,30,30)` | **`rgb(244,113,113)`** | `rgb(200,30,30)` | **`rgb(244,113,113)`** |
| `accentButtons` | **1** | 1 | **0** | 0 |
| `overflowsX` | false | false | false | false |

🟢 icon 色兩個 theme **真 swap**(`#c81e1e` → `#f47171`)⇒ token 唔係寫死。
🟢 `accentButtons`:`/assistant` 1(Send)· dock **0** —— dock 個 Send 係 `secondary`,
`design-system.md §2` 第七條約束(dock 喺每一頁,primary 會變成「全站多咗一個 primary」)。
🟢 probe 逐個 element 連 `tag` / `class` / `top` / `width` 一齊印(CH-034 教訓)——
`transcriptEl` 兩邊 class 唔同(`px-[18px] py-[16px]` vs `min-h-0 gap-[10px]`)⇒ 確定
量緊嘅係各自嘅 transcript,唔係 `AppShell` 個 main scroller(CH-032 撞過嗰個陷阱)。

---

## 🚧 未做

- **DEV 上機** —— 要部署 #14(連 CH-034 一齊)。⚠️ 本單**有新字串** ⇒ 唔使似 CH-033 / CH-034
  咁靠 CSS 做 marker,主句本身就係 marker(而佢喺舊版**確定唔存在** —— 呢單就係加佢嗰單)。
