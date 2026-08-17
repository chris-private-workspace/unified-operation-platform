---
phase: W47-agent-registry
name: "Agent Registry — 多 profile + 揀 agent + run 列表(Tier 2 第一塊)"
sprint_week: W47
start_date: 2026-08-17
end_date: 2026-08-19          # planned, may slip with changelog log
status: active                # draft | active | closed
spec_refs:
  - docs/02-architecture/agent-tier2-scope.md §3 G1 / §4 T2-a / §5.4
  - docs/adr/0036-*.md(D1 / D4 / D0)
prior_phase: W46-agent-runtime
---

# Phase W47 — Agent Registry(Tier 2 · `T2-a`)

> **Plan version**:1.0(initial)
> **Owner**:Chris Lai
> **Approved by**:**Chris Lai(2026-08-17)** —— 四條 OQ 全部照建議拍板,plan `draft → active`
> **決策來源**:`docs/02-architecture/agent-tier2-scope.md`(scope approved 2026-08-17)

---

## 1. Scope

W46 交付咗**一個** agent(`ai-assist`),而佢係 seed 出嚟嘅一行 `AgentPrincipal`,
**冇 CRUD、冇 UI、冇得揀**。本 phase 把佢變成一個可管理嘅 registry:**同一套能力,
多個 model / prompt 組合**,啟動 run 嗰陣揀用邊個;順帶補返一個 W46 結構上冇嘅嘢 ——
**全域 run 列表**(今日 `GET /agent/runs?requestId=` 只答一張 request 嘅最新 run,
所以「尋日邊幾個 run 失敗咗」呢條問題答唔到)。

🔴 **本 phase 刻意唔掂三樣嘢**,而每樣都有理由:

| 唔做 | 理由 |
|---|---|
| **per-agent tool allow-list** | `OQ-1` 答「同一套能力」⇒ allow-list 維持全域一份,**`ADR-0036 D1` 一個字唔使郁** |
| **per-agent scope** | `OQ-2` 答「唔可以大過啟動者」⇒ scope 維持綁人,**安全模型一個字唔使改** |
| **chat / dock** | 係 `T2-c` / `T2-d`,而 `T2-d` 仲要等 `B6`(已收)之上再做 streaming |

---

## 2. Deliverables

### F1 — `AgentProfile` model + migration(**H1**)

- **Spec ref**:`agent-tier2-scope.md §5.4`(Chris 2026-08-17 揀 **B**)
- **形狀**:

```prisma
model AgentProfile {
  id          String   @id @default(cuid())
  principalId String
  principal   AgentPrincipal @relation(fields: [principalId], references: [id])
  name        String   // 'ai-assist (gpt-4o)' — 人睇嘅名
  model       String   // Azure deployment name(ADR-0037:AGENT_MODEL 喺 Azure 之下就係 deployment)
  prompt      String?  // null = 用 code 入面嗰個 default
  active      Boolean  @default(true)
  createdAt   DateTime @default(now())
  runs        AgentRun[]
  @@unique([principalId, name])
}
```
  加 `AgentRun.profileId String?`(**nullable**,見 `R2`)。

- **🔴 點解係 B 唔係 A**:`AgentPrincipal` 個註釋明文寫住「`name` 係 **capability, not
  the model behind it**;baking it in here would make *who did this* change on every
  model upgrade」。B 保住咗嗰句原意(**「邊個做咗呢件事」= principal,唔隨 model 升級
  而變**),同時令「**當時用咩跑**」變成一個查得返嘅事實(`AgentRun.profileId`)。
  A 要一份 ADR 推翻嗰句,兼要答「model 升級 = 改現有定建新」——**兩個答案都有代價**。
- **Acceptance**(`F8-1` 掃 2026-08-17):
  - 🟡 migration 對真 DB 跑得過(本機 + DEV)—— **本機 ✅ · DEV ❌**(`F1-6`,卡部署)
  - ✅ **舊 run(`profileId = null`)全部仍然讀得到**,`GET /agent/runs/:id` 唔 500(test + `F7-1b` live 三個都顯示)
  - ⚠️ ~~seed 建一個 default profile 掛落現有 `ai-assist` principal~~ —— **呢條 acceptance 本身寫錯咗,落唔到手**,改成一次性遷移(§8 changelog 第 4 條)
- **Effort**:3h · **Owner**:AI

### F2 — Profile CRUD(service + endpoint)

- **Spec ref**:`agent-tier2-scope.md §3 G1`
- **Endpoint**:`GET/POST/PATCH /agent/profiles`(停用用 `active=false`,**唔硬刪**,見 `R3`)
- **權限**:🟡 **`OQ-A` 未答** —— 暫定 **ADMIN only**(跟 `/admin/*` 現有 pattern
  嘅保守讀法);答咗再收窄 / 放寬
- **Acceptance**(`F8-1` 掃 2026-08-17):
  - ✅ `@Roles` 覆蓋 + `permissions.spec.ts` drift test 認得新 endpoint(W28 機制)—— 🟢 **佢真係捉到我**(`F2-5`),唔係我主動加
  - ✅ 名重複 → 409;`model` 空 → 400(`F2-4`,**其餘錯誤原封 rethrow**)
  - ✅ **停用一個仲有 run 引用住嘅 profile 唔可以令舊 run 讀唔到** —— 而實際做到嘅**強過呢條**:`resumes on a profile that has since been retired` 連 in-flight run 都跑得完
- **Effort**:4h · **Owner**:AI

### F3 — 啟動 run 揀 profile

- `StartAgentRunDto` 加 `profileId?: string`;唔送 = 用該 principal 嘅 default
- **Acceptance**(`F8-1` 掃 2026-08-17):
  - ✅ 送一個 inactive / 唔存在 / 屬另一個 principal 嘅 `profileId` → **400,唔係靜靜 fallback**
    —— `F7-1a` **四條拒絕路 live 驗,全部具名**,而重點喺 **refuse 之後 run 數一個都冇多**(`F3-3`)
  - ✅ `AgentRun.profileId` 寫低,`GET /agent/runs/:id` 出得返
  - 🔴 **`buildAzureClient` 個 model 由 profile 嚟,唔再淨係讀 env** —— 而三個
    `AZURE_OPENAI_*` **缺一即 503 呢個行為唔准鬆**(ADR-0037 E1 靠佢)
- **Effort**:3h · **Owner**:AI

### F4 — 全域 run 列表 endpoint(W46 結構性缺口)

- **Spec ref**:`agent-tier2-scope.md §2.7`
- `GET /agent/runs?status=&profileId=&since=&limit=&cursor=`
- **🔴 OpCo scope 照舊由啟動者帶入** —— 一個 `OPCO_IT` 只睇到自己 OpCo 嘅 run
  (`OQ-2` 個答案喺呢度第一次有實際後果)
- **Acceptance**(`F8-1` 掃 2026-08-17,三條全 ✅):
  - ✅ 分頁真係分(唔係 `take: 1000` 扮分頁)—— `F7-1b` live:page2 **冇重複 page1 尾行**
  - `runState` **唔出 wire**(W46 個 `select` 就係唯一嗰道閘,`agent-run.controller.spec.ts` 守住)
  - 篩選每個 param 各一條 test
- **Effort**:4h · **Owner**:AI

### F5 — 管理頁面第一版(**H6**)

- 🟡 **`OQ-B` 未答**:獨立 route(`/agent`)定係擴 `Settings › AI agent` tab?
  —— **建議獨立 route**,因為 `R-A` 要嘅係「一系列頁面」,而 run 列表塞唔落一個 tab
- 內容:profile 列表 + 建立 / 編輯 dialog · run 列表(狀態 / profile / 時間 / 開得入去)
- **Acceptance**(`F8-1` 掃 2026-08-17,**五條全 ✅**):light + dark 真 render · 零橫向溢出
  (`scrollWidth = clientWidth = 1440`)· 跑 `ui-design` skill(12 條逐條答,**`DS-11` 一開始
  係 ❌** ⇒ 補咗入 `design-system.md §6`)· 數字同 id **mono**(DS-5)· **一個 view 一個
  primary**(DS-3,**有 test 數住 `bg-accent` 只得一個**)
  - 🔴 **多咗一件 acceptance 冇要求、但唔做就係缺陷嘅嘢**:`F5-8` Textarea 係 **H6 STOP → owner
    approve** 先做(本系統第一個唔由 handoff spec 重建嘅 primitive);`F5-11` 個 `<label>`
    a11y 缺陷係我由 `users-panel` 抄過嚟嘅
- **Effort**:6h · **Owner**:AI

### F6 — Test + falsification(**H5**)

- LLM 一律 mock(跟 W46)
- **每道新閘拆走實作睇佢紅唔紅**,還原之後真跑
- **Effort**:含喺上面各項

### F7 — Live 驗

- ⚠️ ~~本機:建兩個 profile(**唔同 model**)→ 各跑一個 run → run 列表分得開~~
  **✅ 收咗,但唔係照呢句做** —— 呢條 acceptance 本身證唔到嘢(§8 changelog 第 6 條)
- ❌ DEV:migration 跑得過 + 列表出得到 —— **未做**(`F7-2`,卡部署)
- ⚠️ **唔可以睇 revision status 當證據**(entrypoint 令 migrate 失敗 NON-FATAL)

---

## 3. Success Criteria(Phase Gate)

> 🔴 **`F8-1` 2026-08-17 逐條掃過,狀態欄係掃嘅結果唔係開工時嘅期望。**
> **點解要特別講**:W46 呢張表由頭到尾冇更新過 —— 21 條全部 `[ ]` 而 18 條老早做完,
> 勾咗喺 `checklist.md`,兩份文件各講各。**plan 個 acceptance 就係「呢個 phase 算唔算完」
> 嘅定義**,佢空白即係冇人講得出仲差幾多。

| # | Criterion | Target | Block? | **狀態** | **實測證據(`F8-1` 掃 · 2026-08-17)** |
|---|---|---|---|---|---|
| G1 | migration 對真 DB | 本機 + DEV 都 applied | **Yes** | 🟡 **半收** | 本機 ✅ `F1-3` —— 落 DB 對過**真結構**(8 個欄 · `prompt` nullable · `AgentRun.profileId` nullable · 兩個 fkey 實測 `RESTRICT`)。**DEV ❌ 未跑**(`F1-6`) |
| G2 | **舊 run 冇 profile 仍然讀得到** | `GET /agent/runs/:id` 200 | **Yes** | ✅ | test `reads a run started before the registry existed` —— `profileId` / `profile` 兩個都係 `null` **而唔係爆**;**live** `F5-4` / `F7-1b`:本機 3 個 W46 run 喺新列表**三個都顯示**「Before W47」。➕ 順帶有一條更強嘅:`resumes on a profile that has since been retired`(停用一個 profile **唔會**令 in-flight run 死) |
| G3 | `agent.boundary.spec.ts` 仍然全綠 | 零 forbidden import | **Yes** | ✅ | `F6-4` —— 兼且**多咗一條**:兩個 adapter 唔准 import `ConnectorConfigService`(`F3-7`) |
| G4 | `runState` 冇經新 endpoint 洩出 | 0 | **Yes** | ✅ | `F4-4` controller spec。**列表係最易漏嗰個位,因為冇人會讀一個列表回應** |
| G5 | falsification 每道新閘一次 | 真紅零誤傷 | **Yes** | ✅ | **五次**(`F6-5`):①cross-principal guard ②profile model ③profile prompt ④banned import ⑤list scope filter,每次還原後真跑。⚠️ 第 ② 條 **33 紅 = 太粗** —— 紅嘅原因係 503 唔係揀錯 model,即係話佢**證唔到**佢想證嗰樣 |
| G6 | H6 light + dark | 兩個都 render 過 | **Yes** | ✅ | `F5-7` 用 W46 committed 嗰個 `render-check.mjs`(唔再靠 session 有咩瀏覽器工具):token **真 swap**(`#f5f5f6`→`#08080a` · accent `#E60027`→`#ff3355`)· `scrollWidth = clientWidth = 1440`(零橫向溢出)· `ui-design` 12 條逐條答(`F5-6`) |
| G7 | root gate | test / lint / build 三個 exit 0 | **Yes** | ✅ | 🔴 **要重跑先算數**:`F6-1` 記嘅 web **449** 係 stale —— Textarea(`65ebbb0`)喺 `F6` gate **之後**先入。2026-08-17 重跑三個:api **1410 / 94 suites** · web **453 / 44 files** · lint **exit 0** · build **exit 0** |
| G8 | live 驗(本機 + DEV) | 兩個 profile 分得開 | **Yes** | 🟡 **半收** | 本機 ✅ `F7-1` —— 而「分得開」唔係「兩行唔同名」:**同一段 text · 同一個 model · 唯一變數係 prompt** ⇒ 一個提 2 個 SKU、一個提 1 個。**DEV ❌**(`F7-2`) |

### 🔴 掃出嚟嘅結論(`F8-1`)

**8 條入面 6 條全收,2 條半收 —— 而兩條半收(`G1` / `G8`)缺嘅係同一件事:一次 DEV 部署。**
兩條都係 `Block closeout: Yes` ⇒ **本 phase 今日 closeable 唔到**,而唔 closeable 嘅理由
**唔係技術阻塞**:

- ⚠️ **Redis 唔係阻塞** —— W46 `B6` 喺 DEV 實測過 `POST /agent/runs` **201**(冇 Redis 佢會直接
  503,ADR-0039 F1),即 DEV 側 Redis 一早通咗。呢句要寫低,因為 `CLAUDE.md §0` 仲留住
  「部署 DEV 之前 Redis 要喺度」嗰句警告,佢**對 W46 嗰刻啱,對今日唔再係未解決事項**。
- ⇒ 缺嘅係 **merge → 部署 #10 → 驗**,三步。

**兩條 acceptance 掃出嚟嘅額外發現(唔喺原表)**:

1. **`G7` 個 gate 曾經同 code 脫節** —— `F6` 跑完之後仲有一個 code commit(`65ebbb0`)。
   **一個 checklist 上勾咗嘅 gate,唔等於嗰個 gate 蓋住咗今日棵樹。** 呢個同 §0 記低嗰句
   「PR 顯示 `MERGED` 唔等於啲 commit 入齊咗」同族 —— **summary-level 綠燈證明唔到下面
   每一件都真係做咗**。
2. **`F7` 個 acceptance 本身寫錯咗**(見 §8 changelog 第 6 條)—— 原文要求「兩個**唔同 model**」,
   而本機只有一個真 Azure deployment ⇒ 第二個必 fail,「一成一敗」講唔出 profile 有冇生效。

---

## 4. Risks(Phase-Specific)

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| **R1** | 🔴 **`prompt` 落 DB = 一個 runtime 可改嘅行為面** —— ADMIN 改咗個 system prompt 就改咗 agent 點諗嘢,而呢個改動**唔會出現喺任何 code review** | Med | **High** | ①改 prompt **要入 audit**(跟 `ConnectorConfig` 先例,ADR-0013)②**tool allow-list 仍然喺 code**,所以最壞情況係 agent 亂噏,**做唔到未授權嘅嘢** ③plan 明文寫低:**呢個係本 phase 唯一一個把行為交畀 runtime 配置嘅位** |
| **R2** | 舊 run 冇 `profileId` ⇒ UI 顯示 / 統計要處理 null | High | Low | `profileId` **nullable**,UI 顯示「(W47 之前)」;G2 釘住 |
| **R3** | profile 硬刪會令舊 run 指向唔存在嘅 row | Med | Med | **唔提供硬刪**,只 `active=false`;FK 唔 cascade |
| **R4** | 多 profile ⇒ Azure 側成本 / tracing 歸屬散開 | Med | Low | run 列表出 `profile.name`;成本本身唔喺本 phase(H3) |
| **R5** | run 列表分頁做得求其(`take` 大數扮分頁)⇒ 將來 run 多咗就爆 | Med | Med | cursor 分頁 + 一條 test 釘住「唔可以一次過攞晒」 |
| **R6** | 🟡 `OQ-A`(邊個可以改 profile)未答 ⇒ 做咗之後要返轉頭改權限 | Med | Low | 暫定 **ADMIN only**(收窄容易,放寬難);答咗先 lock |

---

## 5. Day-by-Day Breakdown(rough)

| Day | Date | Focus | Deliverables |
|---|---|---|---|
| D1 | 2026-08-17 | schema + migration + seed + CRUD service | F1 · F2 |
| D2 | 2026-08-18 | 揀 profile + run 列表 + test | F3 · F4 · F6 |
| D3 | 2026-08-19 | UI + H6 render + live 驗 | F5 · F7 |

---

## 6. Dependencies on Prior Phase

由 `W46-agent-runtime/progress.md` 帶落嚟:

- 🟢 **W46 21/21 全收**(部署 #9 / #9b,`A1` + `B6` 都有硬證據)⇒ 本 phase 前置滿足
- 🟢 `B6`(SSE @ DEV)收咗 —— **本 phase 唔使用到,但佢係 `T2-d` 嘅前置**
- ⚠️ **`.env` 個 `AZURE_OPENAI_API_VERSION`** —— W46 收工時本機仲係舊值,`F3` 會掂到
  `buildAzureClient`,開工前確認一次
- ⚠️ **`ANTHROPIC_API_KEY` 建議清走**(`R21` 已發生;`E1`/`E7` 之下用唔着)

---

## 7. Open Questions —— 🟢 **四條 2026-08-17 全部答齊(Chris)**

| # | 問題 | **決定** | 影響 |
|---|---|---|---|
| **OQ-A** | 邊個可以**建立 / 改** profile? | 🟢 **ADMIN only** | F2 `@Roles(ADMIN)` + W28 drift test 要認得。**收窄易、放寬難**,所以由窄嗰邊開始 |
| **OQ-B** | 管理 UI 獨立 route 定擴 Settings tab? | 🟢 **獨立 route `/agent`** | `R-A` 要嘅係「一系列頁面」,而 run 列表塞唔落一個 tab。⚠️ 新 nav entry ⇒ H6 要跑 `ui-design` |
| **OQ-C** | 改 `prompt` 要唔要入 audit? | 🟢 **要** | `R1` 第一道 mitigation,跟 ADR-0013 `ConnectorConfig` 先例。⚠️ **`audit-fields.ts` 個 whitelist 要記得加**(BACKLOG 有一條既有 gap 就係漏咗加欄) |
| **OQ-D** | 舊 run(`profileId = null`)點顯示? | 🟢 顯示「(W47 之前)」,**唔隱藏** | 隱藏就會令「W47 之前有幾多 run」變成一個答唔到嘅問題,而佢正正係新列表最容易被信錯嗰個數 |

---

## 8. Plan Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-08-17 | Initial plan | Tier 2 `T2-a`,scope report approved | Chris Lai |
| 2026-08-17 | 🔴 **`F3-2` 偏離:冇「default profile」呢個概念** | 原文寫「唔送 = 用該 principal 嘅 **default**」。落手嗰陣發現 default 只可以係**一個畫面上睇唔到嘅欄**,或者一條隱含規則(「最舊嗰個」)—— 兩者都令**加第二個 profile 之後乜都冇變**,直到有日有人問點解 run 仲跑緊舊 model。**一個睇唔到嘅 default,就係將來用錯 model 都冇人發現嗰個位。** 改成 fail-loud:**一個 active ⇒ 用佢**(今日單 profile 世界照行,`ai-assist-card` 唔使改)· **多過一個而冇送 ⇒ 400 兼講明有幾多個** · **零個 ⇒ 400**(唔准 fallback 落 env,否則一個關咗嘅 registry 睇落似正常)。⚠️ 連帶:`F5` 要包 profile 選擇器,否則多 profile 之下 request detail 張卡會 400 | AI(實作決定,已 log) |
| 2026-08-17 | `prompt` 入 audit `before`/`after`(唔止 event-only) | `OQ-C` 只講「入 audit」,冇講入到咩程度。揀咗記 before/after,理由:`R1` 要答嘅係「**改成咩**」唔止「有人改過」。🔴 **點解唔算重開 transcript 嗰個決定**(`AgentRun: []`):嗰條排除嘅係「free text of **unpredictable shape and large volume**」,而兩半講嘅都係 **model 生成**嘅文字;prompt 係**人寫嘅配置**,經 DTO 封長度(`MAX_PROMPT_LENGTH = 8000`),同 `ConnectorConfig` 嗰堆自由文本欄同族 | AI(實作決定,已 log) |
| 2026-08-17 | 🔴 **`F1-4` 偏離:seed 唔建 principal,只做一次性遷移** | 原文寫「seed 建一個 default profile 掛落現有 `ai-assist` principal」,而佢**落唔到手**:`AgentPrincipal` 係第一次 run 先 lazy 建,佢個 `runtime` 欄明文只准係 **provider 實際 boot 嗰個**(BUG-011 就係為咗呢句而修),而 seed 冇 provider ⇒ seed 建嗰行一定係捏造。改成:**principal 已存在兼且零 profile** 先種一個,model 由 `ConnectorConfig.agentModel → AGENT_MODEL`(同兩個 provider `resolveModel()` 同源),冇配置就唔種。⚠️ 條件係「零 **profile**」唔係「零 **active** profile」—— seed 每次部署都跑,用後者會令一個 admin 刻意熄咗嘅 profile 翻生。未跑過 agent 嘅環境咩都唔種,維持 W47 之前行為(嗰種環境本來就未有人揀過 model) | AI(實作決定,已 log) |
| 2026-08-17 | 🔴 **`F4-2` 偏離:列表可見性跟 `getRun`,唔跟啟動者** | plan 寫「OpCo scope 照舊由**啟動者**帶入」。嗰句講緊 `OQ-2`(agent **行緊嗰陣**睇到咩,受啟動者封頂),攞嚟做**邊個睇到呢個 run** 就會同 `getRun` 打交 —— `getRun` 按 run 嗰張 request 嘅 OpCo,即一個 `OPCO_IT` 開得到同事喺同一張 request 上開嘅 run ⇒ 用啟動者過濾就會出現**列表見唔到、撳落去又開到**。反方向仲差:REGIONAL 係 unscoped,按啟動者過濾即係「人人見晒佢啲 run」或者「人人都見唔到」,兩個都唔啱。⇒ 列表 = `getRun` 同一條規則寫成 query(`request: { is: scopeWhere(user) }`) | AI(實作決定,已 log) |
| 2026-08-17 | 🔴 **`F7-1` 偏離:唔用「兩個唔同 model」,改成「同一個 model,唯一變數係 prompt」** | 原文寫「建兩個 profile(**唔同 model**)→ 各跑一個 run → run 列表分得開」。落手先發現**佢證唔到佢想證嗰樣**:本機只有**一個**真 Azure deployment ⇒ 第二個 profile 一開 run 就 fail,而「一個成功一個失敗」講唔出 profile 有冇生效 —— 一個**打錯字**嘅 model 名會產生一模一樣嘅結果。改成一個對照實驗:**同一段 request text · 同一個 model · 唯一變數係 prompt** ⇒ 內建 prompt 提 **2 個 SKU**、`power-bi-only` 提 **1 個**,而 agent 自己個 reasoning 寫住「**I ignored the Microsoft 365 E5 request … as instructed**」。🔴 **順帶把 `R26`(prompt 落 DB = 一個真嘅 runtime 行為面)由推論變成實證** —— 呢個係原設計換唔到嘅嘢 | AI(實作決定,已 log) |
| 2026-08-17 | 📌 **`F8-1`:§3 acceptance 表加「狀態 / 實測證據」兩欄** | 唔係 scope 改動,係補返一個**本來就應該喺 plan 度嘅答案**。W46 個 acceptance 表 21 條全部 `[ ]` 而 18 條老早做完(勾咗喺 `checklist.md`)⇒ **兩份文件各講各,冇人講得出仲差幾多**。掃嘅結果:8 條入面 **6 全收 · 2 半收**(`G1` / `G8`,兩條都係缺一次 DEV 部署) | AI(收尾決定,已 log) |

---

**Lifecycle reminder**:呢份 plan locked after status=active。重大 deviation 入第 8 節
changelog,小 detail 變動可直接 inline edit。
