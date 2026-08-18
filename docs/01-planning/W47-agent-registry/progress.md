# W47 — Agent Registry · Progress

> Daily Day-N entry(R2:每個 commit 對應一個 Day-N)+ 結尾 retro。

---

## Day 0 — 2026-08-17(kickoff,**未 approve**)

### 點解而家開得

W46 `agent-runtime` **21/21 全收**,而且唔係靠 commit message 講:

| | 證據 |
|---|---|
| merge | 十個 commit 逐個 `git merge-base --is-ancestor <sha> origin/main`(§9 先例:PR **#87** 顯示 `MERGED` 但只入咗 6 個入面頭 2 個) |
| 部署 | DEV OpenAPI **200**,`/agent/runs` · `/agent/proposals` · `review-stats` 三個 path 都喺 —— **只有新 code 先出到嘅嘢** |
| `A1` | container log 原文 `25 migrations found` → 三個 W46 migration 逐個 `Applying …` → `All migrations have been successfully applied` |
| `B6` | Redis 配咗 ⇒ `POST /agent/runs` 由**結構上必然 503** 變成真 **201**;SSE `GET /agent/runs/{id}/events` → **200** + `Content-Type: text/event-stream` |

⇒ scope report §7 個前置(W46 落地)滿足。

### Kickoff 做咗

- **掃 phase 號**(PROCESS §2.1 硬要求)—— `git fetch --all` + 掃晒所有 remote branch,
  最大 **W46** ⇒ 揀 **W47**。⚠️ 唔淨係睇 `main`:有兩個 W36 撞過,原因就係後者只睇 `main`
- **branch** `feat/w47-agent-registry` 由 `origin/main`(`125ab50`)開
- **plan / checklist / progress** 三份寫咗,`status: draft`

### 🟢🟢 三條 Tier 2 OQ 答完之後,本 phase 細咗一大截

| OQ | 答案 | 對本 phase 嘅後果 |
|---|---|---|
| `OQ-1` | **同一套能力,唔同 model / prompt** | tool allow-list 維持全域一份 ⇒ **`ADR-0036 D1` 一個字唔使郁** |
| `OQ-2` | **agent scope 唔可以大過啟動者** | scope 維持綁人 ⇒ **安全模型一個字唔使改** |
| `OQ-3` | dock 要睇到當前頁面 | 唔關本 phase(`T2-d`),但引入咗硬約束 `D-CTX` |

🔴 **原本 scope report 入面最重嗰個 phase(`T2-b` per-agent capability scope)整個消失**
—— 佢由頭到尾就係「per-agent allow-list」同「per-agent scope」兩件事,而兩個答案各自
拆走一半。**兩份預計要寫嘅新 ADR 變成零份。**

📌 **值得記低嘅係呢兩條問題點解值得問**:兩個答案都係「唔改」,而**唔問嘅話,兩件都好
可能會被順手做咗** —— 「每個 agent 有自己嘅權限」聽落係一個合理 feature,實際上會
**軟化一個安全邊界**兼**推翻一個中心決定**。

### 🔴 揀 `AgentProfile`(B)而唔係加欄落 `AgentPrincipal`(A)

Chris 2026-08-17 揀 **B**。點解值得寫落 progress:`AgentPrincipal` **自己個註釋**明文
寫住

> the capability, **not the model behind it** … baking it in here would make
> "who did this" change on every model upgrade

而 `OQ-1` 個答案(多 agent = 唔同 model / prompt)同呢句**正面相反**。⇒ A 要一份 ADR
推翻佢,兼要答「model 升級 = 改現有 agent 定建新 agent」——**兩個答案都有代價**
(改現有 ⇒ 歷史 run 講唔出當時用邊個 model;建新 ⇒ agent 列表隨每次升級增長)。

**B 兩層,把兩個問題分開答**:「邊個做咗呢件事」= principal(唔隨升級變),
「當時用咩跑」= profile(`AgentRun.profileId` 查得返)。**原註釋一個字唔使改。**

### 🔴 本 phase 唯一一個「把行為交畀 runtime 配置」嘅位 —— `R1`

`prompt` 落 DB 兼由 UI 改 ⇒ **一個 ADMIN 改咗個 system prompt 就改咗 agent 點諗嘢,
而呢個改動唔會出現喺任何 code review**。

三道 mitigation(寫咗入 plan):①改 prompt **要入 audit** ②**tool allow-list 仍然喺
code** ⇒ 最壞情況係 agent 亂噏,**做唔到未授權嘅嘢** ③plan 明文標記呢個係唯一一個
咁樣嘅位,唔好將來靜靜多幾個。

### 🟢 四條 OQ 同日答齊,plan `draft → active`

| | 決定 | 一句理由 |
|---|---|---|
| `OQ-A` | **ADMIN only** | 收窄易、放寬難 ⇒ 由窄嗰邊開始 |
| `OQ-B` | **獨立 route `/agent`** | `R-A` 要嘅係「一系列頁面」,而 run 列表塞唔落一個 tab |
| `OQ-C` | 改 prompt **入 audit** | `R1` 第一道 mitigation,跟 ADR-0013 `ConnectorConfig` 先例 |
| `OQ-D` | 舊 run **顯示唔隱藏** | 隱藏會令「W47 之前有幾多 run」變成答唔到嘅問題,而佢正正係新列表最易被信錯嗰個數 |

⚠️ **`OQ-C` 有一個容易漏嘅連帶動作**:`audit-fields.ts` 個 whitelist 要記得加新欄 ——
BACKLOG 有一條既有 gap 就係嗰個 whitelist 漏咗 `licenseOpsProvider` / `ticketUpdateProvider`
等,結果係「改咗 seam provider 唔會出現喺 audit `before`/`after`」。**同一個坑唔好再踩。**

⇒ **開工。**

---

## Day 1 — 2026-08-17(`F1` · `F2` · `F3` · `F4`)

| Commit | 範圍 | Checklist |
|---|---|---|
| `23813ae` | schema + registry CRUD + audit | `F1-1` `F1-2` `F2-1`–`F2-6` |
| `add4751` | migration + seed 遷移 | `F1-3` `F1-4` |
| `97edfdf` | controller spec | `F2-7` |
| `4a835fe` | 揀 profile 開 run | `F3-1`–`F3-7` `F1-5` |
| `35e2de7` | 全域 run 列表 | `F4-1`–`F4-7` |

**數字**:api **1362 → 1410 / 92 → 94 suites** · web 439(零改動)· tsc 0 · lint 0 · build 0。
**Falsification 五次真跑真紅**,每次都還原後真跑一次。

### 🔴 今日最值得記嘅四件事(都唔係「功能做完咗」)

**① 一個 migration 出咗一句冇人要求過嘅 SQL,而佢會靜靜噬走 `F2-3` 個決定。**
`F2-3` 刻意**唔提供 DELETE**,理由係「歷史 run 指住 profile 講當時用咩跑」。但 Prisma 對
optional relation **預設 `ON DELETE SET NULL`** ⇒ 一個直接落 DB 嘅 delete 會把嗰個答案
**一次過**變成 unknown,冇任何錯誤。改成 `onDelete: Restrict`,DB 自己企硬。
📌 **形狀**:一個決定喺 API 層守住咗,而**同一個決定喺 DB 層預設係反方向嘅** —— 而
migration SQL 唔逐行讀就見唔到。

**② `F1-4` 落唔到手,而點解落唔到手先係重點。**
plan 寫「seed 建一個 default profile」,但 `AgentPrincipal` 係 lazy 建,佢個 `runtime` 欄
**明文只准係 provider 實際 boot 嗰個(BUG-011)**。seed 冇 provider ⇒ **seed 建嗰行一定係
捏造**。⇒ 改成一次性遷移,而且條件係「零 **profile**」唔係「零 **active** profile」——
seed 每次部署都跑,用後者會令一個 admin 刻意熄咗嘅 profile 翻生。

**③ 我寫咗兩條結構上冇可能紅嘅 test,而佢哋睇落完全合理。**
「assert adapter 冇 call `connectorConfig.resolve`」—— 但同一個 commit 入面我啱啱先拆走咗
adapter 嗰個 dependency,即係話**個 mock 根本冇駁落去任何嘢**。一條對住唔存在嘅協作者嘅
assert,永遠綠。
改咗去 `agent.boundary.spec.ts` 做 import ban 之後,**嗰條 ban 第一版又即刻紅** —— 紅喺
兩個 adapter **解釋自己點解唔再用佢**嗰段註釋度。
📌 **兩件事夾埋係同一課**:`CLAUDE.md §9` 已經有「一條 assert 睇落嚴唔嚴謹,同佢捉唔捉到
嘢,係兩件事」,今日係第二種變體 —— **一條 assert 可以連「有嘢畀佢捉」呢個前提都冇**。
唯一分辨方法一樣:**拆走實作睇佢紅唔紅**。

**④ 一個 falsification 紅咗 33 條,而佢係一個差嘅 falsification。**
拆走「用 profile 個 model」⇒ 33 紅。睇落好勁,但**紅嘅原因係 503(冇 model 可用)唔係
「揀錯 model」** —— 佢證明唔到我想證嗰樣嘢。改成「拆走 profile 個 **prompt**」⇒
**1 紅零誤傷**,嗰條先真係釘住行為。
📌 **紅得多 ≠ 釘得準。** 一個 falsification 要答嘅係「邊條 test 守住呢個行為」,唔係
「拆咗會唔會爆」。

### ⚠️ 兩個 plan 講錯咗嘅位(已入 §8 changelog)

- **`F4-2`「scope 由啟動者帶入」係錯嘅** —— 嗰句講緊 `OQ-2`(agent 行緊嗰陣睇到咩),
  攞嚟做可見性就會同 `getRun` 打交,出現**列表見唔到、撳落去又開到**。
- **`F3-2`「用 default profile」冇 default 可言**(Day 0 已 log)。

### 🟢🟢 W28 drift test 第四次捉到我

新 route `GET /agent/runs/latest` 令鎖定矩陣紅。⚠️ 呢次同前三次唔同:**佢唔係一個新
write surface,只係一條 read route 搬咗位** —— 但矩陣一樣捉到,而 diff 得**一行**。

### 🚧 卡住 / 未做

- `F5` UI · `F6` gate · `F7` live —— 未開始
- `F1-6` DEV migration(等部署)
- `F8-3` 六條 risk 仲未入 `RISK_REGISTER.md`

---

## Day 1(續)— 2026-08-17 · `F5` + `F6` + `Textarea`

`e6fc6ed` F5 頁面 · `8cf4bd8` checklist · 之後 Chris 批 `Textarea` ⇒ prompt 改得。

**數字**:api **1410 / 94** · web **439 → 453 / 44** · lint 0 · build 0 · falsification 累計 **六次**。

### 🔴🔴 今日最貴嗰個教訓:**截圖自己講大話**

驗 dialog 嗰陣,兩個 theme 嘅截圖都顯示 **dialog 半透明、底下 Runs 表嘅文字疊晒上嚟,而 45% scrim 完全唔見**。睇落係一個嚴重視覺缺陷,而且會影響**全部** dialog(users-panel、kill switch…)。

第一個懷疑係 Playwright `fullPage: true` 對 `position: fixed` 嘅 artifact ⇒ 改 viewport 截圖再試 —— **一模一樣**。

真正解決係**去量度 DOM**:

| | 實測 |
|---|---|
| scrim | `opacity: 1` · `rgba(0, 0, 0, 0.45)` · 零 running animation |
| panel | `opacity: 1` · **實色** `rgb(255, 255, 255)` |

⇒ **頁面完全正常,係個 capture 呃人。** 兩張截圖、兩種模式、兩個 theme 全部一致噉呃 —— 而**一致唔等於真**。

📌 **形狀同 `CLAUDE.md §9` 嗰一串完全同族**:「revision `Healthy` ≠ DB 通」·「`sync-check` 返 `FOUND` ≠ 個 user 存在」·「有 listener ≠ 啱嗰個 DB」(今日先撞過)。今次係 **「截圖睇到 X」≠「真係 X」**。
📌 而**分辨方法一直都係同一個**:唔好再睇多次同一個信號,去攞一個**唔同層**嘅證據。
⇒ 已喺 `render-check.mjs` 頂寫低警告,連實測數字,免得下一個人再花一個鐘。

### 🔴 一個真 a11y 缺陷,由一條「揾唔到 field」嘅 test 揾出嚟

`Field` 個 `<label>` 同 control 冇關聯 —— 我由 `users-panel` 抄過嚟,而嗰個一路都係咁。撳 label 唔 focus,screen reader 讀到一個冇名嘅框。
改成 `<label>` 包住 control 之後**仲要再改一次**:包住嘅 label 入面所有嘢都算入 accessible name,而個 hint 帶住即時字數 ⇒ 個 field 個名會**每打一個字變一次**。hint 要放喺 label 外面。
📌 兩個問題都唔係 review 揾到,係 `getByLabelText` 失敗逼出嚟。

### 🔴 `Textarea` —— 本系統第一個冇 handoff spec 嘅 primitive

handoff 由頭到尾冇 textarea(兩邊 grep 零命中)⇒ 冇嘢可以對照,而**冇對照就係最大 drift 風險**:下一個人加嘅時候一定憑感覺揀值。
所以約束寫得死:每個值由 `Input` 抄,只有三樣刻意唔同(高度 / 垂直 padding / 行高),而三樣都係單行 field 結構上冇嘅。
🟢 **而且係實測唔係聲稱** —— live probe 對 `<input>` 同 `<textarea>` 逐項比:border / radius / background / color / font-size 兩個 theme 全部逐字相同。
🔴 **`resize-y` 唔可以係 `resize`**:水平 resize 係瀏覽器預設,佢容許用戶由**元件內部**把自己拉闊過個 dialog ⇒ 打破成個 console 唯一嗰條 layout 硬規矩,而**冇任何一行 code 改動可以賴**。

### ⚠️ 空 prompt 一定要送 `null`,唔可以送 `''`(標題,詳見下)

送 `''` 會 compile、會過 validation、run 亦會正常(server 當 blank = unset)—— 但 row 會話有 prompt,而 registry 個表就會為一個**跑緊內建指示**嘅 profile 顯示「Custom」。**一個畫面同自己講唔埋,冇任何錯誤。** falsification 驗過:改成送 `''` ⇒ 兩條 test 精準紅。

---

## Day 1(收尾)— 2026-08-17 · `F7-1` live

### 🟢🟢🟢 agent 真跑咗兩次,而佢係一個**對照實驗**唔係兩次 smoke test

`F7-1` 原文寫「兩個 profile(**唔同 model**)各跑一個 run」。落手先發現嗰個設計證唔到嘢:本機只有**一個**真 Azure deployment,第二個 model 會直接 fail,而「一個成功一個失敗」講唔出 profile 有冇生效。

⇒ 改成:**同一段 request text · 同一個 model · 唯一變數係 prompt**。

| profile | 提咗 | agent 自己嘅理由 |
|---|---|---|
| `gpt-5.6-luna`(內建) | **2 個 SKU**(`SPE_E5` + `POWER_BI_PRO`) | 「matched Microsoft 365 E5 … and Power BI Pro」 |
| `power-bi-only`(custom) | **1 個**(`POWER_BI_PRO`) | 「**I ignored the Microsoft 365 E5 request** … as instructed to propose only Power BI licences」 |

📌 **`R26` 由推論變咗實證** —— 「`prompt` 落 DB 就係一個把行為交畀 runtime 配置嘅位」呢句,而家有一對可以並排睇嘅 proposal 撐住,而且 agent **自己講得出佢點解唔提 E5**。三道防線(audit / allow-list 留喺 code / 8000 字 cap)唔再係紙上談兵。

### 🔴 四條拒絕路 live,而重點係「refuse 之後冇留低 row」

①兩個 active 冇指名 → `This agent has 2 active profiles — say which one to run on` ②唔存在 → 400 ③熄咗 → `The profile 'power-bi-only' is switched off…`

全部**具名**,唔係 generic error。而最重要嗰條係:**四次 refuse 之後 run 數仍然係 3(開工前個數)**。`F3-3` 個理由就係呢個 —— OQ-3 只准一張 request 有一個非 terminal run,refusal 留低一行 `running` 就係永久封死。

### 🟢🟢 `OQ-C` 唔止「有入 audit」,而係「入到答得出改成咩」

`agent.profile_update`:`before.prompt` **616 字元** → `after.prompt` **61 字元**,而 `before`/`after` 兩邊**淨係得 `prompt` 一個 key**。
再送一次**同一個值** ⇒ audit **1 → 1,冇新 row**。`F2-6` 嗰個決定(no-op 唔寫)喺度真係擋住咗:冇佢,`R26` 靠嗰條 query 會畀一堆「改過但冇改到」嘅 row 塞爆。

### ⚠️ 一個唔屬本單、但今日撞咗三次嘅嘢

`ai-doc-extraction-db` **會自己返嚟搶 5433**(今日交換咗三次)。其中一次 `TCP 5433 = True` **差啲被我當成「我哋個 DB 通」** —— 實際上通嘅係另一個項目個 DB。
📌 同 `CLAUDE.md §9` 嗰句「有 listener ≠ 啱嗰個 DB」係同一件事,而今日先真撞到。**每次交換之後都要用真 query 驗係邊個 DB,唔可以只睇 port。**

---

## Retro(`F8-2`)— 2026-08-17

### 交付 vs plan

| | Plan | 實際 |
|---|---|---|
| 日數 | 3 日(D1 schema+CRUD / D2 揀 profile+列表 / D3 UI+live) | **code 側 1 日做晒**,DEV 嗰半未做 |
| Effort | F1 3h + F2 4h + F3 3h + F4 4h + F5 6h = **20h** | 一日 |
| Acceptance | 8 條 | **8/8 全收** —— ⚠️ 呢格寫 retro 嗰刻係「6 全收 · 2 半收」,而兩條同日就由部署 #10(`G1`)同 `F7-4`(`G8`)收埋 |
| test | — | api **1362 → 1410 / 92 → 94** · web **439 → 453 / 43 → 44** |
| ADR | 預咗可能要 | **零份** —— schema 改動喺已 approve plan 範圍內,唔係新架構決定 |

🔴 **「快咗兩日」唔係因為做少咗,主要係 W46 舖低嘅嘢今日直接收成**:seam(`AgentSetup`
一加個 `model` 欄,兩個 adapter 就唔使各自揾 model)· `agent.boundary.spec.ts`(加一條
ban 就守得住)· W28 drift test(**兩次自動捉到我**)· `render-check.mjs`(H6 render 唔再
靠 session 有咩瀏覽器工具)。**呢啲全部係 W46 當時睇落「多做咗」嘅嘢。**

### 🔴 本 phase 最值錢嗰個教訓:一條 assert 可以連「有嘢畀佢捉」呢個前提都冇

`F3-7`:我寫咗兩條 test,assert 兩個 adapter **冇** call `connectorConfig.resolve`。睇落嚴謹,
實際上 —— **adapter 而家連收都唔收嗰個 service**。一條對住一個**唔存在嘅協作者**嘅 assert,
**結構上冇可能紅**。

📌 **點解值得同 `CLAUDE.md §9` 嗰三個並排**:嗰三個(tautology · `toHaveProperty(key)` ·
`expect(false)` 喺 no-op 之下)都係「**assert 太弱**」。今次唔同 —— assert 本身寫得好好,
**係佢瞄準嗰件嘢唔存在**。⇒ 「拆走實作睇佢紅唔紅」呢個方法**照樣捉得到**,但你要記得
對一條**已經綠**嘅 test 都做一次,而唔係只對啱啱寫嘅新閘做。

➕ 同族第二件(`F3-6`):第二個 falsification **33 紅**,睇落好勁,但**紅嘅原因係 503 唔係
揀錯 model** ⇒ **紅得多 ≠ 釘得準**。一個 falsification 要問嘅唔係「紅唔紅」,係「**紅嗰個
原因係咪我想證嗰個**」。

### 🔴🔴 第二貴:截圖自己講大話(`F5-7` / `F5-9`)

Dialog 截圖顯示面板半透明、45% scrim 完全唔見,`fullPage` 同 viewport **兩種模式一致**。
差啲就去「修」一個唔存在嘅缺陷 —— 直到 probe live DOM:`opacity: 1`、實色
`rgb(255,255,255)`、scrim `rgba(0,0,0,0.45)`、零 running animation。**係 capture 唔係頁面。**

📌 **一致唔等於真** —— 兩種 capture 模式同時錯,睇落就似「兩個獨立來源互相印證」。
已寫警告落 `render-check.mjs`(committed,唔淨係寫喺呢份 progress)⇒ **下次唔使再畀一次
同樣嘅成本。**

### ⚠️ 兩條 plan acceptance 自己寫錯咗,而佢哋錯得唔一樣

- `F1`「seed 建一個 default profile」—— **落唔到手**(`AgentPrincipal` lazy 建,`runtime` 欄
  只准係 provider 實際 boot 嗰個 ⇒ seed 冇 provider,建嗰行一定係捏造)
- `F7`「兩個 profile(**唔同 model**)」—— **做得到但證唔到嘢**(本機一個 deployment,第二個
  必 fail,而「一成一敗」同「model 名打錯字」結果一模一樣)

📌 **形狀**:寫 plan 嗰陣未落手,所以 acceptance 難免會寫到一啲**聽落合理、做落先知唔成立**
嘅嘢。**應對唔係「plan 寫好啲」**(嗰個要求等於要求未做之前就知答案),**係落手一發現就
即刻入 changelog** —— 本 phase 三條偏離(`F3-2` / `F1-4` / `F4-2`)加收尾兩條,全部入咗 §8。

### 🔴 `F8-1` 掃出一件唔掃就唔會知嘅事

**`F6` 個 gate 同今日棵樹脫節咗** —— `F6-1` 勾嗰陣 web 係 449,而 Textarea(`65ebbb0`)喺
**gate 之後**先入。重跑先知係 453。

📌 **一個勾咗嘅 gate 唔等於嗰個 gate 蓋住咗今日棵樹**,同 §0 嗰句「PR 顯示 `MERGED` 唔等於
啲 commit 入齊咗」完全同族:**summary-level 綠燈證明唔到下面每一件都真係做咗。**
⇒ **收尾一定要重跑 gate,唔可以抄 checklist 個數。**

### 🚧 卡住 / carry-over

| 項 | 狀態 | 缺咩 |
|---|---|---|
| `F1-6` · `F7-2` · `F7-3` | ✅ **2026-08-17 全收** | ~~一次 DEV 部署~~ —— merge(PR #119)· 部署 #10(`dev-df03563`)· 驗,三步同日做完。➕ `F7-4`(`G8` DEV 對照實驗)亦收 ⇒ **8/8**。⚠️ **Redis 由頭到尾唔係阻塞**:W46 `B6` 喺 DEV 實測 `POST /agent/runs` **201** ⇒ 一早通咗 |
| `R28` 一半 | 🔴 未答 | `onDelete: Restrict` 擋到**刪**擋唔到**改** ⇒ `AgentRun.profileId` 答到「用邊個 profile」,答唔到「**嗰一刻佢係咩 model**」。要真答 = `AgentRun` 存 model snapshot = **schema 改動(H1),未開單** |
| `F5-9` 兩件 | 🚧 唔喺本單 | header primary 掣位置(**`/audit` 一模一樣** ⇒ 既有樣式,唔單方面改)· dark 之下 `IconButton` 對比偏弱(既有 primitive) |

---

## Day 1(merge)— 2026-08-17 · `F8-6` merge `main` 落 branch

開咗 PR #119 之後 GitHub 報 conflict —— `main` 喺 W47 開工之後多咗 **CH-031 / ADR-0040
agent run soft-hide**,而佢直接掂 agent module。

### 🔴🔴 今日最值錢嗰件:**conflict 唔係最危險嗰半,auto-merge 先係**

5 個 text conflict 全部一眼睇得出點解(兩邊各自加一個 audit action / 各自加一個欄 /
各自加一條 route)。而**真正嘅缺陷喺一個 merge 得完全乾淨嘅位**:

| | CH-031 嗰邊 | W47 嗰邊 |
|---|---|---|
| `hiddenAt` | 加咗,filter 落 `findLatestForRequest` | **唔存在** |
| 全域 run 列表 | **唔存在**(ADR-0040 Context ⑥ 明文寫住「平台冇全域 run 列表」) | 加咗 |

⇒ merge 之後,admin 撳完 hide 嘅 run **照樣出現喺 `/agent` 全域列表**,而**兩邊 suite 全綠**
—— 因為每一邊都**唔可能**寫呢條 test:佢要 assert 嘅兩樣嘢,喺每一條 branch 上面都只有一半
存在。

📌 **同 W46 `B3` 結構上係同一件事** —— 嗰次係「兩個 provider spec 各自都完全正確,因為每個
都只講自己 ⇒ 『兩個實作一致』呢個 claim,冇一個單一實作嘅 spec 講得到」。今次係
**兩條 branch**,而唔係兩個實作。

🟢🟢 **而今次唔使自己判斷點做,因為 `ADR-0040` 早就寫低咗答案** —— 佢 Consequences 逐字:
「Tier 2 用得返:`T2-a` 個 run list 直接 `hiddenAt: null`」,兼且喺 Alternatives 度用「`T2-a`
會加 run list endpoint」做 reject Option D 嘅理由。**一份寫得夠遠嘅 ADR,可以幫你 resolve
一個佢寫嗰陣未存在嘅 merge。**

⇒ 加咗 `hiddenAt: null` 落 `listRuns` + 一條 test + **falsification(1 紅零誤傷**,還原後
100/100 綠**)**,兼更正咗 `findLatestForRequest` 上面「this is the ONE read that filters on
`hiddenAt`」嗰句 —— merge 之後佢係第二條,唔再係唯一。

### ⚠️ `CLAUDE.md §0` 個 conflict 要特別講,因為佢逼出咗一個做法

BACKLOG 硬規矩 7:**逐行 resolve,永遠唔好 `--ours` / `--theirs`**。但 §0 個 Phase 格
**成格係一行**(幾千字),`git` 眼中就係「一行 vs 一行」,冇得逐行。

做法:**保留我嗰行,再逐處手動施加 CH-031 兩個改動**(test 數字 + 用 CH-031 段落取代
「平台今日冇任何路徑刪一個 agent run … 未開單」嗰句)—— 即係「逐行」嘅精神,唔係字面。
🔴 **收貨標準用負面命中**:舊句**唔再喺檔案入面**,而 CH-031 兩段**在**。單靠正面命中
證明唔到我冇 revert 咗嘢。

### ⚠️ `prisma generate` —— merge 之後第一件事

唔跑就 **7 個 api suite 直接開唔到身**,而錯誤訊息指住 `ai-assist.service.ts` 嗰幾行
(`'hiddenAt' does not exist in type 'AgentRunWhereInput'`),**唔指住 client**。
`restart-stack` skill 早就記低咗(「切 branch / pull 之後最常踩」),而 merge 係同一族。

### 🟢 對數

api **1430 / 94** · web **464 / 44** · lint 0 · build 0。
**W47 1410 + CH-031 19 + merge 新加 1 = 1430** · **453 + 11 = 464** ⇒ **兩邊冇一條 test
喺 merge 入面蒸發**。順帶:`permissions.spec.ts.snap` 個順序我 resolve 嗰陣係**猜**嘅
(route 註冊次序決定),實測啱,唔使 `-u`。

---

## Day 2 — 2026-08-18 · closeout(獨立覆核)

部署 #10 同 `G8` 係 **main worktree 嗰個 session** 做嘅。呢個 session 落手嗰陣**唔知佢做過乜**,
所以做咗一次獨立覆核 —— 而個做法本身有一件值得記低嘅嘢。

### 🟢🟢 331 條 audit 入面,8 條就重建到成個 `G8` 嘅時序

冇問人、冇睇佢個 commit,淨係查 `GET /admin/audit?targetType=AgentRun`:

```
14:43:11  hide ×2       ← §0 講嗰兩個舊測試 run(CH-031 開單起因)
14:59:35  create ×2     ← dev-g8-baseline(prompt null)+ dev-g8-powerbi-only(141 字元)
14:59:52  run started   ← 同一個 model gpt-5.6-luna
15:01:20  run started   ← 唯一變數係 prompt
15:04:25  hide ×2 + active:true→false ×2   ← 收拾
```

逐項同佢 commit message 寫嘅對得上。📌 **ADR-0009 設計 audit 嗰陣冇聲稱過呢個用途** ——
「一個第三者可以由 audit 重建一次驗證做過乜」係一個附帶得嚟嘅性質,而佢比「有紀錄」強:
**有紀錄只答到「有人做過」,呢個答到「做咗咩、順序點、收唔收得成」**。

### 🔴 覆核途中撞到兩件事,兩件都係我自己個 query 唔啱

1. **`/admin/audit` 個 response 係 `{total, limit, offset, entries}`,唔係 `{items}`。**
   我第一次讀成 `items` ⇒ 攞到空陣列 ⇒ **差啲寫低「audit 係空嘅」**。真相係 `total: 331`。
2. **`/agent/profiles` 個 param 係 `includeInactive`,唔係 `active`。**
   打 `?active=false` 返 `[]`,而佢**唔係 bug** —— `active` 唔係宣告過嘅 param,
   `ValidationPipe({whitelist:true})` 剝走咗,等同冇 filter ⇒ 走預設(只返 active)。
   用 `?includeInactive=true` 就見到兩個 `active=false` 嘅 profile。

📌 兩件同一個形狀,而佢就係本 phase `F3-7` 嗰個教訓喺**驗證側**嘅版本:**一個返空嘅 query,
同一個「真係冇嘢」嘅事實,喺畫面上一模一樣。** 分別只能靠去查佢個 contract,唔能靠睇個結果。

### ✅ 覆核結論

`AgentProfile` 有真 row(`dev-g8-*`,`model` 欄有值)⇒ migration 真跑咗;
hidden run 打 `GET /agent/runs/{id}` **200 兼 `steps: 7` / `proposals: 1` 一件冇少**,
而 `GET /agent/runs` 返 **0 items** ⇒ **ADR-0040 D3 個唔對稱喺真環境成立**,
兼且**我喺 merge 度加嗰行 `hiddenAt: null` 第一次真生效**(冇佢,`/agent` 會列出 4 個已經
移除咗嘅 run)。

### 收尾改咗嘅嘢

- `plan.md` §2 `F7` 個 acceptance 仲寫住「DEV ❌ 未做」,而同一份 plan §3 已經寫住全收
  ⇒ **同一份文件內部兩處各講各**,W46 教訓(plan vs checklist)嘅新變種
- `progress.md` carry-over 表同 `CLAUDE.md §0` 亦各有一處 stale
- `checklist.md` `F7-5` 由 `[ ]` 改勾 —— **刻意唔刪原文**(PROCESS sacred rule),因為佢記錄住
  嗰一刻「未做」係一個**有成本、要人拍板**嘅狀態,唔係漏做
- `plan.md` `status: active → closed`

🔴 **而收尾掃嗰陣,我自己即刻又踩多次同一個坑** —— 我改咗 `plan.md` §2 個 `F7` acceptance,
**漏咗同一節嘅 `F1`**(佢一樣寫住「DEV ❌,卡部署」),要最後 grep 一次 `卡部署|半收|status: active`
先揾返。

📌 **所以真正嘅教訓唔係「記住更新」** —— 我上一句先講完呢個形狀,下一分鐘就再犯。
**係「收尾一定要用 grep 掃 stale 講法,唔可以靠記憶行一次」**:掃 `卡部署` / `半收` /
`status: active` / `未做` 呢類**當時嘅狀態詞**,佢哋就係會過期嗰批字。
同一次掃亦揾到 `checklist.md` 個 header 仲寫住 `plan status: active`,而嗰行**冇人會諗起去改**。
