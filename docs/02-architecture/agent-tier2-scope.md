# AI Agent — Tier 2 Scope Report(pre-doc)

**Status**: `draft` —— **未 approve,一行 code 都唔准寫**(PROCESS §1.4 R1)
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
| **R-C** | **每個 agent 嘅設置範圍**(佢做得到啲乜、睇得到啲乜) |
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

### G2 · Per-agent capability scope(對 **R-C**)

**要做**:每個 agent 有自己嘅 tool allow-list + 自己嘅資料可見範圍。

**撞**:🔴🔴 **兩個 W46 中心決定**

1. **`ADR-0036 D1`** ——「一份 tool 定義,兩個 runtime 共用」。per-agent allow-list
   會令佢由「一份」變成「N 份」。⚠️ **注意分辨**:D1 講嘅係「**唔好因為 runtime 唔同
   而有兩份**」;per-agent 係另一個維度。所以呢個**唔一定**推翻 D1,但**一定要喺 ADR
   入面明文講清楚兩者關係**,否則下一個人會用 D1 嚟反對佢,或者反過嚟用佢嚟繞過 D1。
2. **scope 綁人呢個模型** —— 一旦 agent 自己有 scope,就會出現「agent 睇到啟動者
   睇唔到嘅嘢」。🔴 **呢個係安全模型改動,唔係一個欄。**

**⇒ 要一份新 ADR,而且係本 Tier 最重嗰份。**

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

| Phase | 內容 | 依賴 | 觸發 |
|---|---|---|---|
| **T2-a** | **Agent registry + 揀 agent** —— `AgentPrincipal` CRUD + 啟動 run 揀 agent + 管理頁面第一版 + **run list endpoint** | — | H1(additive schema) |
| **T2-b** | 🔴 **Per-agent capability scope** —— allow-list + 可見範圍 | T2-a | **H1 + 新 ADR**(本 Tier 最重) |
| **T2-c** | **Conversation session** —— chat model + streaming(純後端 + 一個最小 UI) | — | H1 + 新 ADR |
| **T2-d** | **全站 dock** —— `Drawer` primitive + layout + context passing | T2-c | **H6 + design-system 更新** |
| **T2-e** | **Per-agent security / permission 管理** | T2-a, T2-b | H1(權限模型) |

**建議先後**:`T2-a` → `T2-c` → `T2-d` → `T2-b` → `T2-e`

🔴 **點解 `T2-b` 排喺 dock 之後而唔係緊接 `T2-a`**:佢係本 Tier 唯一一塊會**改安全模型**
嘅嘢,而 `T2-c`/`T2-d` 交付咗之後,你會**真係用過**多 agent 互動,嗰陣先答得準「每個
agent 應該有幾大範圍」。今日答呢條題,係喺冇使用經驗嘅情況下設計一個權限模型。

⚠️ **但如果 OQ-1 答「唔同 agent = 唔同能力」,`T2-b` 就要排前** —— 因為嗰個答案之下,
`T2-a` 冇咗 allow-list 就唔完整。**呢個係本文件最重要嘅一條依賴。**

---

## 5. Open Questions(要 Chris 答,答案改變設計)

| # | 問題 | 點解重要 |
|---|---|---|
| **OQ-1** | 「多個 agent」係指 **①同一套能力、唔同 model / prompt**,定 **②唔同能力(唔同 tool 集)**? | 決定 `T2-b` 排前定排後,亦決定 `AgentPrincipal` 加咩欄 |
| **OQ-2** | agent 嘅 scope **可唔可以大過**啟動佢嗰個人? | 🔴 安全紅線。答「可以」= 一條提權路徑,要獨立 ADR 論證;答「唔可以」= scope 變成「人 ∩ agent」,設計簡單好多 |
| **OQ-3** | dock 入面個 agent,**睇唔睇到你而家開緊嗰版嘅資料**? | 答「睇到」= 每個頁面都變成一個 context source,而「佢睇到嘅嘢」唔再由一個 endpoint 講晒 ⇒ 影響 §2.3 個 scope 模型同 audit |
| **OQ-4** | 對話要唔要 **persist**?留幾耐? | 關 `AuditLog` retention(BACKLOG `audit-retention` 一直未做)+ H4(對話會含 PII) |
| **OQ-5** | 邊個可以**建立 / 改** agent?ADMIN only? | 關 `T2-e`,亦關 W28 個 code-derived 權限模型 |
| **OQ-6** | Claude 側要唔要**真打網絡**? | `ADR-0038 D3` 今日明文禁,而 `G4-pre-3` 講咗真打之前要重新答 `OQ-7`(inference 側 PII) |

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

## 8. 下一步(等 approve)

1. Chris 答 **OQ-1 / OQ-2 / OQ-3**(其餘四條可以遲啲)—— 呢三條決定 phase 次序同安全模型
2. 決定 W46 落地次序(§7)
3. approve 之後:開第一個 Tier 2 phase folder(揀號嗰刻**重新掃一次** remote branch)+
   為 `T2-b` / `T2-c` 各寫一份 ADR

**本文件 approve 之前,唔開 phase folder、唔寫 code。**
