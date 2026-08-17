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
