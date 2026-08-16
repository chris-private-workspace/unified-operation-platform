# ADR-0038: 加 `@anthropic-ai/sdk` —— 第二個 agent runtime 做 D1 嘅架構證明

**Date**: 2026-08-16
**Status**: **Proposed**
**Approver**: Chris Lai(實質決定已批 2026-08-16;後果待過目)

> 🚧 同 ADR-0036 / 0037 一樣,本文件住喺 branch `feat/w46-agent-runtime`,**未 merge 落 `main`**。
>
> 🔴 **點解係 `Proposed` 而唔係 `Accepted`** —— Chris 2026-08-16 批嘅係一句:「H2:批,寫 ADR-0038」。
> 佢批嗰陣見到嘅係「G4 要 `npm i @anthropic-ai/sdk`」。而寫呢份嘅時候浮出嚟嘅後果(**D3** 唔打網絡要有
> test 守住 · **D4** 唔可以自己砌 shape · **D5** OQ-7 target 移後 · **D6** 三件事未查證)佢未見過。
>
> ⚠️ **呢個係 ADR-0037 行過嘅同一條路**(嗰次起草 `Proposed`,五條後果逐條過目之後同日 `Accepted`)。
> 沿用,唔係為咗慢,係因為「批咗個標題」同「批咗成份後果」係兩件事 —— 而本項目 §9 記低過嗰種漂移,
> 就係由前者被當成後者開始。

---

## Context

### 觸發

**W46 期二 `G4`** —— `ClaudeToolRunnerProvider`,存在意義係證明 **ADR-0036 D1**:「一份 tool 定義,換 runtime
唔使動」。

### 觸發嘅 hard constraint —— §5.2 **H2**

**查證(2026-08-16,唔係靠記憶)**:

| 查 | 結果 |
|---|---|
| root + `apps/api` 兩份 `package.json` grep `anthropic` | **零 match** |
| `node_modules/@anthropic-ai` · `apps/api/node_modules/@anthropic-ai` | **兩個位都唔存在** |

⇒ **連 transitive 都冇。** 呢點同 ADR-0037 嗰陣**唔同**:當時 `openai@7` 早就係 `@openai/agents`
(`apps/api/package.json:41`)嘅 transitive ⇒ 換去 Azure client **零新 dependency**,H2 根本冇觸發。

**今次係真・新 runtime dependency ⇒ H2 觸發。**

### Chris 2026-08-16 拍板嘅兩件事(次序有意義)

1. **`G4` = 架構證明,唔係產品功能** —— 呢句先講,而佢直接決定咗下面 **D3**、**D5**
2. **批 H2** —— 寫本 ADR

---

## Decision

### D1 —— `@anthropic-ai/sdk` 加落 `apps/api` 嘅 `dependencies`

**唔落 root。** 跟 `@openai/agents`(`apps/api/package.json:41`)同 `@nestjs/schedule`(`:39`)嘅位置 ——
agent runtime 係 api 嘅嘢,`apps/web` 冇任何理由見到佢。

### D2 —— 批准嘅係 `betaTool()` + `client.beta.messages.tool_runner`,**唔係** Claude Agent SDK

**ADR-0036 D9 已經定咗呢件事,本 ADR 唔重開佢**,只係把「批咗乜」講到冇得含糊:

批准範圍 = **呢個 package 嘅呢個用法**,唔係「Anthropic 出嘅嘢一律可以入 `apps/api`」。

D9 原文嘅理由仍然逐字有效:Claude Agent SDK ship 內建 `Read`/`Write`/`Edit`/`Bash`/`Glob`/`Grep`,
「一個行得到 `Bash` 嘅 agent 住喺 NestJS process 入面,就係把 §5 全部 hard constraint 一次過繞開」,
而 **issue #115**(`allowedTools` 唔限制內建 tool)令「靠配置關佢」唔可以係防線。

### D3 —— 🔴 `G4` 唔打網絡,而且**要有嘢守住**,唔係一個約定

Chris「架構證明」呢個定位嘅直接後果:**G4 唔會送任何 `rawRequestText` / `targetUpn` 去 Anthropic。**

**但唔可以靠註釋。** 呢個正正係 ADR-0036 **D2** 要求嘅性質 —— OQ-4(agent 讀唔到 `AuditLog`)之所以
安全,係由「**registry 冇註冊**」保證,唔係由「我哋記住唔好加」保證。同一條尺放喺呢度:

- provider **未配就 503**,跟 `openai-agents.provider.ts:324-332` `resolveModel()` 個先例
- 一條 test 守住「G4 路徑唔會建立一個真 HTTP client」

⇒ **冇呢個,「G4 唔真打」就只係一句寫喺 ADR 度嘅話**,而下一個 session 見到個 provider 齊晒、就會順手填個 key。

### D4 —— 🔴 D1 嘅證明要對住**真 SDK 型別**,唔可以自己砌一個 shape

呢條係「**點解要真裝**」嘅第二個獨立理由,而佢比 D1 個「方便」重要:

如果唔裝,`toSdkTools()` 嘅 Claude 版就係對住「**我以為 `betaTool()` 收成點**」寫,而 test 兩邊都係
自己寫嘅 fixture ⇒ **永遠綠,證咗個零**。

⚠️ 呢個唔係假設 —— **W46 本 phase 已經中過三次同一族**:對稱 fixture 令 mean/median 分唔開 ·
`for` over 空 list 滿足任何 claim · 由同一個 step 推導期望值嘅 tautology assert。

⇒ **要真 `import { betaTool }` 真跑一次、對真型別 assert**(唔使網絡,所以同 D3 冇衝突)。

📌 而 ADR-0036 初稿要整份改寫,起因就係「**假設咗一個 SDK 做唔到乜**」。呢條 D4 係把嗰個教訓變成一條規矩。

### D5 —— `OQ-7` Claude 半邊嘅 target:由「G4 開工之前」→「**真打 Anthropic 之前**」

**ADR-0037 `E7` 嘅內容一個字唔改**(§6:`Accepted` 唔改內容)。

`E7` 嘅**實質禁令**係「**唔可以引用 ADR-0037 當已答**」—— 呢句照樣成立,真打嗰刻仍然要重新答一次 OQ-7
(Anthropic 唔喺公司個 M365 / Azure 信任面入面)。

郁嘅只係佢對 target 嘅**時點判斷**,而嗰個判斷嘅**隱含前提係「G4 = 真打 Claude」**。Chris 2026-08-16
講明唔係 ⇒ **前提唔成立,唔係決定被推翻**。

📌 **呢個形狀 ADR-0035 行過**:`schema.prisma` 反對嘅係「第二個 candidate idempotency key」唔係
「第二個 SN number」⇒ **收窄原決定範圍,唔係推翻**。

⇒ Claude 側 OQ-7 同 `OQ-1` / `E4`(auth) / `A14` 併埋同一批,全部等 infra。

### D6 —— 🔴 三件事**未查證**,列做 G4 第一步

本 ADR 引用唔到 `node_modules`(package 未裝),所以以下三件**唔可以當已知**:

| # | 要查 | 點解重要 |
|---|---|---|
| ① | `betaTool()` 收嘅參數形狀 vs `AgentToolRegistry` 今日出嘅嘢 | **D1 成唔成立就睇呢個。**「要改 registry 先接到」= D1 錯咗,要返轉頭講,唔係硬塞(ADR-0037 E2 立咗呢條尺) |
| ② | transitive 有冇同 `@openai/agents` 撞(尤其 `zod` / HTTP client) | 兩個 SDK 各自 ship 一套,而 tool schema 就係靠 `zod` |
| ③ | license | 加 runtime dependency 嘅基本盡職 |

⇒ **裝完第一件事係查呢三樣,唔係寫 adapter。**

---

## Alternatives Considered

- **Option A:唔裝,自己 mock 一個「Claude-like」介面** — **rejected**,理由就係 **D4**:adapter 會對住
  一個想像中嘅形狀寫,test 兩邊同源 ⇒ 證唔到 D1,只證到我自己前後一致。
- **Option B:裝 Claude Agent SDK(唔係 Tool Runner)** — **rejected**,ADR-0036 **D9** 已判:內建
  `Bash`/`Write` 對一個 LicenseOps business-process agent 係負債,加埋 issue #115 令 `disallowedTools`
  唔可以做防線。
- **Option C:唔做 G4,D1 維持一個未驗證嘅承諾** — **rejected**(Chris 2026-08-16)。D1 係
  ADR-0036 成個 seam 設計嘅地基;**一個 runtime 之下,佢結構上證明唔到** —— ADR-0037 E2 換 client 嗰次
  只證到「換 endpoint 唔使改」,唔係「換 SDK 唔使改」。
- **Option D:接一個 OpenAI-compatible 第三方 endpoint 扮第二個 runtime** — **rejected**:佢仍然行
  緊同一個 `@openai/agents` adapter ⇒ 證到嘅係 ADR-0037 E2 已經證過嗰半,唔係 D1。
- **Chosen:裝 `@anthropic-ai/sdk`,只用 Tool Runner,G4 唔打網絡** — 因為佢係唯一同時滿足
  「對真型別證 D1」(D4)同「唔擴闊 PII 暴露面」(D3 + D5)嘅做法。

---

## Consequences

### Positive

- 🟢 **D1 第一次被真嘢測試** —— ADR-0037 E2 換嘅只係 endpoint(SDK 冇變);今次換嘅係**成個 SDK**,
  即 D1 當初嘅原話
- 🟢 **零 PII 後果** —— G4 唔打網絡(D3)⇒ 唔觸發 OQ-7,亦唔使等 infra
- 🟢 **唔阻 A14** —— OpenAI 側(Azure)嗰條路一個字唔郁

### Negative

- 🔴 **`apps/api` 多一個 runtime dependency**,而佢喺可見將來**冇產品用途** —— 只服務一個架構證明。
  呢個代價係實嘅,唔應該用「將來會用到」開脫:**佢今日就係為咗證 D1 而存在**
- 🔴 **裝咗就有人可以打** —— D3 嗰條 test 係唯一防線(見 R21)
- ⚠️ **可能撞 transitive**(D6 ②),而撞到嗰陣先知,`npm i` 之後先答得到

### Neutral

- `AgentToolRegistry` / 五個 tool / D0 / D2 / D3 / D4 / D11 **一個字唔郁** —— **如果要郁,就係 D1 錯咗**(D6 ①)
- ADR-0036 **D9** 唔受影響,本 ADR 只係把佢由「將來會加」變成「而家加,範圍就係佢寫嗰個」
- ADR-0037 **唔 supersede、唔修改**;只係 `E7` 嘅 target 被收窄(D5)

### 殘留風險

| ID | Risk |
|---|---|
| **R20** | 兩個 SDK 各自 ship `zod` / HTTP client ⇒ 版本撞。tool schema 靠 `zod`,撞到就唔係「裝多咗嘢」咁簡單 |
| **R21** | 🔴 **「裝咗個 SDK」被讀成「可以打 Anthropic」** ⇒ 有人填個 key 就真打,而 OQ-7 Claude 半邊**從來未答過**。D3 嗰條 test 係唯一防線 —— 同 **R18**(「轉咗 Azure」被讀成「PII 解決咗」)完全同族:**一件令人安心嘅事實,擺喺一個佢答唔到嘅問題隔籬** |

---

## References

- **ADR-0036 `D1`** —— 本 ADR 存在嘅唯一理由;`D2`(靠架構唔靠自律)· `D9`(Tool Runner 唔用 Agent SDK,連 issue #115)
- **ADR-0037 `E2`**(「要改 registry 就係 D1 錯咗」呢條尺)· **`E7`**(Claude 側要重新答 OQ-7)· **`R18`**(R21 同族)
- **ADR-0035** —— D5「收窄範圍唔係推翻」嘅先例
- `docs/01-planning/W46-agent-runtime/plan.md §2.2 G4`(第三欄本來就標住 `H2`,對比 `G5` 標 `H2(已 locked)`)· `§7 OQ-7`
- **查證(2026-08-16)**:root + `apps/api` 兩份 `package.json` grep `anthropic` 零 match ·
  `node_modules/@anthropic-ai` 兩個位皆不存在 · `apps/api/package.json:41` `@openai/agents ^0.16.0`
- **INC-001** —— D3 / D4 同源:「唔可以靠自律,要靠架構」
