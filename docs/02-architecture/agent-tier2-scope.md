# AI Agent — Tier 2 Scope Report(pre-doc)

**Status**: 🟢 **`scope approved`**(Chris 2026-08-17 —— 三條 OQ 答齊 + 次序拍板)
—— ⚠️ **但每個 phase 開工前仍然要自己嘅 `plan.md`**(PROCESS R1);本文件係 scope
report,唔係任何一個 phase 嘅 contract。**Tier 2 開工要等 W46 落地**(§7 / §8.1)。
**Created**: 2026-08-17
**Owner**: Chris Lai
**前身**: W46 `agent-runtime`(Tier 1)· `ADR-0036`(決策 SSOT)· `ADR-0037` / `0038` / `0039`
**本文件性質**: **report**,唔係 phase plan、唔係 ADR。佢係「決定之前嘅材料」——
逐條列出**要改嘅嘢、改落去撞到邊條 hard constraint、有幾個做法、點拆 phase**。

> 🔴 **本文件刻意唔 claim phase 號。** PROCESS §2.1:「號一旦 commit 就當 claim 咗」,
> 而 Tier 2 會拆成**幾個** phase,今日仲未決定邊一塊先開。掃過所有 remote branch,
> 最大係 **W46**,所以第一個 Tier 2 phase 會係 `W47`(揀嗰刻要重新掃一次)。

---

## 1. Why —— Chris 2026-08-17 講嘅五樣嘢

原話拆成五條可檢查嘅要求:

| # | 要求 |
|---|---|
| **R-A** | 獨立嘅 AI agent **管理頁面(一系列)**,唔係塞喺 Settings 一個 tab |
| **R-B** | 可以**建立同配置多個唔同 agent**,而且**決定用邊一個** |
| **R-C** | **每個 agent 嘅設置範圍**(佢做得到啲乜、睇得到啲乜)—— ⚠️ **2026-08-17 收窄咗**:`OQ-1` / `OQ-2` 答完之後,呢條指嘅係 **model / prompt / 上限**,**唔係**權限範圍(見 §3 `G2`) |
| **R-D** | agent 相關嘅 **security / access / permission 管理** |
| **R-E** | **全站 agent 互動 dock** —— 唔限 request detail,dashboard 或任何頁面都可以喺右邊彈出,**可開可收**,而且**打開時唔會阻住操作底下嗰版** |

---

## 2. 今日嘅基線(全部實測 / 讀過 code,唔係推論)

### 2.1 `AgentPrincipal` 得三個有意義嘅欄

```prisma
model AgentPrincipal {
  id      String  @id @default(cuid())
  name    String  @unique   // 'ai-assist'
  runtime String            // 'openai-agents' | 'claude-tool-runner'
  active  Boolean @default(true)
  ...
}
```

而佢自己個註釋寫住:**`name` 係 capability,唔係背後嗰個 model** ——
「Which LLM answers is runtime config; baking it in here would make *who did this*
change on every model upgrade.」

⇒ **佢係一個「身份 / 責任歸屬」記錄,唔係一個可配置嘅 agent 定義。** 冇 scope 欄、
冇 tool allow-list 欄、冇 model 欄、冇 prompt 欄。

⚠️ 而且**冇任何 CRUD endpoint**,今日嗰一行係 seed 出嚟。

### 2.2 Tool allow-list 係**全域一份**,而呢件事係 W46 一個中心論點

`tool-registry.ts` = **一份 JSON Schema + 一份 impl**(plan F2)。兩個 runtime
**共用同一份**(`ADR-0036 D1`),而 `agent-runtime.contract.spec.ts`(W46 收尾補嘅)
就係守住呢個 claim 嗰條 test:兩個 provider 對同一個 tool 呼叫要產生**同一個 `AgentStep`**。

`agent-runtime.provider.ts` 個註釋講到明:

> An adapter converts shapes and nothing else — no business logic, **no second
> allow-list**, no per-runtime tweak.

### 2.3 Scope 綁**啟動嗰個人**,唔綁 agent

`agent-run.controller.ts`:

> The tools themselves are safe at any width — they apply the **STARTER's** OpCo
> scope, so an OPCO_IT run could only ever see its own OpCo.

⇒ 「agent 自己有幾大權」呢個概念今日**唔存在**。agent 嘅可見範圍 = 撳掣嗰個人嘅範圍。

### 2.4 Kill switch / blast-radius 都係**全域一個**

`kill-switch.service.ts`(G3)· 單 run 上限(G3)—— 兩個都係平台級,唔係 per-agent。

### 2.5 今日個 agent **唔係 chat**

形態係:**開一個 run → 佢自己跑幾步 → 停喺 proposal → 人批 → 完**。

- `AgentMessage` 存嘅係**一個 run 內部**嘅 transcript,唔係一條持續嘅對話線
- 冇 free-form 輸入 endpoint、冇 conversation session、冇「隨時打字問佢」
- `POST /agent/runs` 個 body 得一個 `requestId`

### 2.6 UI 今日兩塊,冇第三塊

| 位置 | 內容 |
|---|---|
| `components/requests/ai-assist-card.tsx` | request detail 上面:step timeline + transcript(**刻意兩個 block**,D4)+ proposal + Approve/Reject + Stop |
| `components/settings/agent-panel.tsx` | Settings › **`AI agent`** tab:kill switch 三態 + review stats(7/30/90 · per-reviewer) |

### 2.7 冇「所有 run」嘅 list endpoint

`GET /agent/runs?requestId=` 只答**一張 request 嘅最新 run**;另外得 `GET /agent/runs/:id`。
⇒ 結構上做唔到一個全域 run 列表。

---

## 3. Gap 逐條 —— 每條標明撞邊條 hard constraint

### G1 · Agent registry(對 **R-B** 一半)

**要做**:`AgentPrincipal` CRUD(建 / 改 / 停用)+ 啟動 run 嗰陣揀邊個 agent。

**撞**:**H1**(schema:`AgentRun` 已經有 `principalId`,但 `AgentPrincipal` 要加欄)+
新 endpoint + 新 UI。

🟢 **呢條係最乾淨嘅一塊** —— 佢唔掂 D1、唔掂 scope 模型,只係把一個 seed 出嚟嘅
身份變成可管理。

⚠️ 但要先答一條問題(見 §5 OQ-1):**「多個 agent」係指「同一套能力、唔同 model」,
定係「唔同能力」?** 兩個答案通向完全唔同嘅設計。

### ~~G2 · Per-agent capability scope(對 **R-C**)~~ — 🟢🟢 **2026-08-17 消失咗**

> **本節保留原文做記錄。** 佢曾經係本 Tier 最重嗰塊(要一份新 ADR、要改安全模型),
> 而 `OQ-1` + `OQ-2` 兩個答案把佢兩半各自拆走。**呢個係本文件最大嘅一個變化,所以
> 唔刪走,留住畀下一個人睇到「點解冇咗」。**

原本要做嘅係兩件事,而家逐件對返答案:

| 原本 | 答案之後 |
|---|---|
| 每個 agent 有自己嘅 **tool allow-list** | ❌ **唔使做** —— `OQ-1` 答「同一套能力」⇒ allow-list 維持全域一份,**`ADR-0036 D1` 一個字唔使郁** |
| 每個 agent 有自己嘅 **資料可見範圍** | ❌ **唔使做** —— `OQ-2` 答「唔可以大過啟動者」⇒ scope 維持綁人,**安全模型一個字唔使改** |

🔴 **值得記低嘅係呢兩條問題點解值得問**:兩個答案都係「唔改」,而**唔問嘅話,兩件都
好可能會被順手做咗** —— 「每個 agent 有自己嘅權限」聽落係一個合理嘅 feature,而佢
實際上會**軟化一個安全邊界**兼**推翻一個中心決定**。⇒ 本 Tier 由「兩份新 ADR」變成
「零份」,唔係因為縮水,係因為問清楚咗。

⚠️ **`R-C`(每個 agent 嘅設置範圍)冇被丟掉,佢只係換咗意思** —— 而家指嘅係
**model / prompt / 上限**呢類設定,唔係「權限範圍」。呢部分落 `T2-a` 同 `T2-e`。

### G3 · Security / access / permission 管理(對 **R-D**)

**今日有**(唯讀):agent 出現喺權限矩陣做一個 actor(**冇 Role**,`permissions.spec.ts`
`🔴 G2` 六條)· 全域 kill switch · 全域 blast-radius · review stats(R13)。

**要做**:per-agent kill switch · per-agent 上限 · 邊個可以建 / 改 agent · 邊個可以
批邊個 agent 嘅 proposal。

**撞**:**H1**(權限模型)。⚠️ 而且要小心一件事 —— 今日 `derivePermissions()` 係
**由 code derive**(W28,ADR-0009 Decision 8.5 刻意唔起 permission table)。
per-agent 權限如果落 DB,就係**第一次有一個 runtime-可改嘅權限來源**,而 W28 個
drift test 嘅前提正正就係「權限喺 code 度」。**呢個要喺 ADR 入面正面處理。**

### G4 · Conversation session(對 **R-E** 嘅一半,而佢係最大嗰半)

**要做**:一條可以持續傾嘅對話線 —— 用戶打字 → agent 答 → 可以再問 → 中途可以要求
佢做嘢(即係產生 proposal)。

**撞**:**H1**(新 model:conversation / turn)+ 需要 **streaming 回應**(今日
`GET /agent/runs/:id/events` 個 SSE 只送 `{runId}` 叫人 refetch,ADR-0039 F10 ——
chat 要送真內容,呢個係另一種 SSE)。

🔴 **呢個唔係「把現有卡搬個位」,係一個新嘅互動模型。** 今日成套嘢(run / step /
proposal / approve)係圍住「一次任務」設計嘅;chat 係圍住「一條關係」。兩者可以共存
(chat 入面可以開 run),但唔可以互相冒充。

### G5 · 全站 dock UI(對 **R-A** + **R-E** 嘅另一半)

**要做**:任何頁面右邊可彈出 / 收起、**non-modal**(唔阻住底下操作)、記住開合狀態。

**撞**:**H6**(design fidelity)—— `design_handoff_licenseops/` 冇 drawer / dock 呢個
pattern。⇒ **要新 primitive** ⇒ 按 H6 要 STOP + owner 確認 + 更新
`docs/02-architecture/design-system.md`。

⚠️ 技術上要留意:**non-modal 唔可以用今日個 `Dialog`** —— 佢會 trap focus 兼加
overlay。要一個新嘅 `Drawer` primitive,配 layout 側嘅 push / overlay 決定。

⚠️ 仲有一條容易漏嘅:**dock 入面個 agent 睇唔睇到「你而家喺邊一版」?** 呢個係
context passing,而佢直接關安全(見 OQ-3)。

### G6 · 獨立管理頁面(對 **R-A**)

**要做**:由 Settings 一個 tab,升做一組頁面(agent 列表 / 單一 agent 詳情 / run 列表 /
稽核)。

**撞**:需要 §2.7 講嗰個 **list endpoint**(今日冇)。UI 側係 H6 但唔係新 pattern
(既有 primitive 砌得到)。

---

## 4. 建議點拆 phase

> 拆嘅原則:**每個 phase 自己交付得到一件用得着嘅嘢**,而**推翻既有決定嗰啲要獨立**,
> 唔好同「加功能」混喺同一個 phase —— 否則 review 嗰陣分唔開「呢個改動係新功能定係
> 改咗個安全模型」。

> 🟢 **2026-08-17 更新** —— 三條 OQ 答咗之後由**五個 phase 變四個**,而拆走嗰個
> (`T2-b`)正正就係唯一一個要改安全模型 / 要新 ADR 嗰個。

| Phase | 內容 | 依賴 | 觸發 |
|---|---|---|---|
| **T2-a** | **Agent registry + 揀 agent** —— `AgentPrincipal`(或 `AgentProfile`,見 §5.4)CRUD + model / prompt 設定 + 啟動 run 揀 agent + 管理頁面第一版 + **run list endpoint** | — | **H1**(additive schema) |
| **T2-c** | **Conversation session** —— chat model + streaming(純後端 + 一個最小 UI) | — | **H1** + 一份新 ADR(互動模型) |
| **T2-d** | **全站 dock** —— `Drawer` primitive + layout + **context passing(`D-CTX`)** | T2-c · **`B6`** | **H6**(新 primitive,要更新 design-system)+ `D-CTX` |
| **T2-e** | **Agent 管理第二版** —— per-agent kill switch / 上限 / 建立權限 | T2-a | H1(細) |

**建議先後**:`T2-a` → `T2-c` → `T2-d` → `T2-e`

🔴 **`T2-d` 有一個唔喺本 Tier 入面嘅前置依賴:`B6`(SSE 喺 DEV 真通)。**
dock 個 chat 要靠嗰條管道,而 `B6` 今日卡「DEV 冇 Redis」+「ACA ingress 對 SSE 嘅行為
未驗證兼且改唔到」。⇒ **W46 收唔到 `B6`,`T2-d` 就唔應該開工** —— 否則會喺一條未證實
通嘅管道上面砌一個全站功能。

⚠️ **`T2-a` 開工之前要先答 §5.4 個 A vs B**(model / prompt 落 `AgentPrincipal` 定
另開 `AgentProfile`)—— 佢決定 schema 形狀,而 schema 一落 migration 就改唔返轉頭。

---

## 5. Open Questions(要 Chris 答,答案改變設計)

### 5.1 🟢 已答(Chris 2026-08-17)

| # | 問題 | **答案** | 後果 |
|---|---|---|---|
| **OQ-1** | 「多個 agent」係指 ①同一套能力、唔同 model / prompt,定 ②唔同能力(唔同 tool 集)? | 🟢 **①同一套能力,唔同 model / prompt** | 🟢🟢 **`ADR-0036 D1` 一個字都唔使郁** —— tool allow-list 維持**全域一份**。⇒ **`T2-b` 嘅 allow-list 半邊直接消失** |
| **OQ-2** | agent 嘅 scope 可唔可以大過啟動佢嗰個人? | 🟢 **不可以** | 🟢🟢 **scope 模型維持「綁啟動者」,一個字唔使改** ⇒ **`T2-b` 嘅 scope 半邊都消失**,安全紅線關咗 |
| **OQ-3** | dock 入面個 agent,睇唔睇到你而家開緊嗰版嘅資料? | 🟢 **需要睇到** | 每一版變成一個 context source ⇒ **新增 `D-CTX` 一條硬約束**(見 §5.2) |

🔴 **三個答案夾埋嘅淨效果:本 Tier 最重嗰塊(`T2-b`)冇咗,兩份新 ADR 變成零份。**
`OQ-1` 拆走 allow-list 嗰半、`OQ-2` 拆走 scope 嗰半,而 `T2-b` 由頭到尾就係嗰兩件事。

### 5.2 🔴 `D-CTX` —— 由 `OQ-3` 衍生嘅硬約束(唔係建議)

`OQ-3` 答「睇到」,而 `OQ-2` 答「唔可以大過啟動者」。兩者**唔矛盾**,但佢哋一齊
成立**只係因為**加咗以下呢條:

> **前端送上嚟嘅 context 一律當「一個提示」,唔當「一個授權」。**
> dock 話「我而家喺 request X」,後端**必須自己重新 scope 檢查一次**,唔可以因為
> 前端顯示緊佢就當用戶有權睇。

⚠️ **點解要寫成硬約束**:今日 agent 攞資料一定經 tool,而 tool 帶住啟動者嘅 scope
(§2.3)—— 呢條路本身係安全嘅。而 dock 引入嘅新嘢係**一條由前端流向後端嘅 context**,
佢係本平台**第一次**有「畫面話畀後端聽而家睇緊乜」。歷史上呢類 channel 就係提權洞
嘅慣常位置,而佢**唔會喺 test 度自己浮出嚟**(前端 test 自己砌 fixture,後端 test
自己砌 context —— 又係 BUG-011 嗰條縫)。

📌 **一個連帶問題(要喺 `T2-d` 之前答)**:「當前頁面嘅資料」係指
**①route + 主要 entity id**(例如 `request:cmsxxx`),定 **②頁面 render 咗嘅嘢**?
①好答得多兼且天然 fail-closed(後端照樣要自己攞返資料、照樣過 scope);
②等於把 UI state 變成 agent 嘅資料來源,而 UI state 冇 scope 概念。
**建議 ①**,但呢個係設計決定,唔係本文件可以自己拍板。

### 5.3 🟡 未答(唔急,但要記住)

| # | 問題 | 點解重要 |
|---|---|---|
| **OQ-4** | 對話要唔要 **persist**?留幾耐? | 關 `AuditLog` retention(BACKLOG `audit-retention` 一直未做)+ H4(對話會含 PII) |
| **OQ-5** | 邊個可以**建立 / 改** agent?ADMIN only? | 關 `T2-e`,亦關 W28 個 code-derived 權限模型 |
| **OQ-6** | Claude 側要唔要**真打網絡**? | `ADR-0038 D3` 今日明文禁,而 `G4-pre-3` 講咗真打之前要重新答 `OQ-7`(inference 側 PII) |
| 🆕 **OQ-8** | **model 升級係「改一個現有 agent」定「建一個新 agent」?** | 🔴 **由 `OQ-1` 個答案直接引爆,見 §5.4** |

### 5.4 🔴 `OQ-1` 個答案同 `AgentPrincipal` 自己個註釋有直接張力

`AgentPrincipal` 個註釋明文寫住:

> `name` 係 **capability, not the model behind it**。Which LLM answers is runtime
> config(`ConnectorConfig`, ADR-0013 Model C); **baking it in here would make
> "who did this" change on every model upgrade.**

而 `OQ-1` 答「多個 agent = 唔同 model / prompt」⇒ **model 就係區分兩個 agent 嘅嘢**,
同上面呢句正面相反。呢個唔係一個可以靜靜繞過嘅細節 —— 佢係 `AgentRun.principalId`
指住邊個嘅語意。

**三個做法**:

| | 做法 | 代價 |
|---|---|---|
| **A** | model / prompt 直接落 `AgentPrincipal` | 推翻上面嗰句。model 一升級,要決定改現有定建新(= **OQ-8**) |
| **B** | `AgentPrincipal` 維持 capability,另開 `AgentProfile`(model + prompt)掛落佢 | 兩層,但 `who did this` 穩定,而歷史 run 記得返當時用邊個 profile |
| **C** | model / prompt 落 `ConnectorConfig`(跟原設計) | 一次得一個,**答唔到「多個」**⇒ 唔符合 `OQ-1` |

⇒ **C 出局。A vs B 係 `T2-a` 開工前要答嘅第一條題**,而 **B 睇落更貼近現有設計嘅意圖**
(佢保住咗「audit 歸屬唔應該隨 model 升級而變」呢個原意,同時滿足「多個」)。
**但呢個要 owner 拍板,唔係本文件決定。**

---

## 6. 明確**唔喺** Tier 2 範圍(記低防混入)

- **agent 自主行動**(冇人批就做嘢)—— `ADR-0036 D3` 嘅 human-in-the-loop 冇打算郁
- **LicenseOps 以外嘅模組**(offboarding / cost insights / D365)—— **H3**,平台 scope 未開
- **自訂 tool / plugin 由 UI 加** —— tool impl 係 code,由 UI 加 tool = 一個完全唔同量級嘅問題
- **多 tenant / 對外開放 agent** —— 冇人提過

---

## 7. 一件要先講清楚嘅前提

🔴 **W46 到今日一行都未入 `main`。**

`main` 仍然係 api 1044 / ADR 到 0035 / **冇 agent**;Tier 1 全部嘢住喺
`feat/w46-agent-runtime`。喺一個未落地嘅地基上面起第二層,兩層都會浮住 ——
而且**每一個 Tier 2 phase 都會由呢條 branch 開**,branch 之間嘅距離只會越拉越遠。

⇒ **建議 Tier 2 開工之前先把 W46 落地**(merge → 部署 DEV → 收埋 `A1` DEV 半邊同 `B6`)。
呢個唔係流程潔癖:`B6`(SSE 喺 DEV 真通)**正正就係 `T2-c`/`T2-d` 個 chat 要靠嗰條管道**
—— 佢喺 DEV 通唔通,係 dock 做唔做得成嘅前提。

---

## 8. 下一步

🟢 **Chris 2026-08-17 批咗方向同次序** —— `OQ-1`/`OQ-2`/`OQ-3` 答齊,兼且拍板
**先把 W46 落地,再開 Tier 2**(§7 建議獲接納)。

### 8.1 而家做(W46 落地)

1. **merge W46 落 `main`**
2. **部署 DEV** —— ⚠️ 部署之前 **Redis 要喺度**,否則 `POST /agent/runs` 直接 503
   (`ADR-0039 F1`:個 POST 而家只 enqueue)
3. 收 **`A1` DEV 半邊**(三個 migration 對 DEV 跑)+ **`B6`**(SSE 喺 DEV 真通)
   —— ⚠️ **`B6` 唔止係 W46 手尾,佢係 `T2-d` 嘅前置**

### 8.2 W46 落地之後(Tier 2 開工)

1. 答 **§5.4 A vs B**(model / prompt 落 `AgentPrincipal` 定另開 `AgentProfile`)
   —— `T2-a` 嘅 schema 形狀,一落 migration 就改唔返轉頭
2. 答 **§5.2 個連帶問題**(context = route + entity id,定 render 咗嘅嘢)——
   `T2-d` 之前要有答案,建議 ①
3. 開 `T2-a` 嘅 phase folder —— **揀號嗰刻重新掃一次** remote branch(PROCESS §2.1)
4. 為 **`T2-c`**(互動模型)寫一份 ADR。⚠️ **`T2-a` 唔一定要 ADR**,佢係 additive
   schema + 新 endpoint;但如果 §5.4 揀咗 **A**(推翻「`name` 係 capability 唔係
   model」嗰句),**就要一份**

### 8.3 仍然成立嘅約束

- **每個 phase 開工前仍然要自己嘅 `plan.md`**(PROCESS R1)—— 本文件係 scope report,
  唔係任何一個 phase 嘅 contract
- **`D-CTX`(§5.2)由 `T2-d` 第一日起就要當硬約束**,唔係「之後再 harden」
