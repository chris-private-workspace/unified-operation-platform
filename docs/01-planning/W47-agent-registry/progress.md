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

### 🚧 等 approve —— 四條 OQ

`OQ-A` 邊個可以改 profile(暫定 ADMIN only)· `OQ-B` 獨立 route 定 Settings tab
(建議獨立)· `OQ-C` 改 prompt 入唔入 audit(建議入)· `OQ-D` 舊 run 點顯示
(建議顯示「(W47 之前)」唔隱藏)。

**plan `status: draft` ⇒ 一行 code 都未寫**(PROCESS R1)。
