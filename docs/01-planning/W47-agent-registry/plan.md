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
- **Acceptance**:
  - migration 對真 DB 跑得過(本機 + DEV)
  - **舊 run(`profileId = null`)全部仍然讀得到**,`GET /agent/runs/:id` 唔 500
  - seed 建一個 default profile 掛落現有 `ai-assist` principal
- **Effort**:3h · **Owner**:AI

### F2 — Profile CRUD(service + endpoint)

- **Spec ref**:`agent-tier2-scope.md §3 G1`
- **Endpoint**:`GET/POST/PATCH /agent/profiles`(停用用 `active=false`,**唔硬刪**,見 `R3`)
- **權限**:🟡 **`OQ-A` 未答** —— 暫定 **ADMIN only**(跟 `/admin/*` 現有 pattern
  嘅保守讀法);答咗再收窄 / 放寬
- **Acceptance**:
  - `@Roles` 覆蓋 + `permissions.spec.ts` drift test 認得新 endpoint(W28 機制)
  - 名重複 → 409;`model` 空 → 400
  - **停用一個仲有 run 引用住嘅 profile 唔可以令舊 run 讀唔到**
- **Effort**:4h · **Owner**:AI

### F3 — 啟動 run 揀 profile

- `StartAgentRunDto` 加 `profileId?: string`;唔送 = 用該 principal 嘅 default
- **Acceptance**:
  - 送一個 inactive / 唔存在 / 屬另一個 principal 嘅 `profileId` → **400,唔係靜靜 fallback**
  - `AgentRun.profileId` 寫低,`GET /agent/runs/:id` 出得返
  - 🔴 **`buildAzureClient` 個 model 由 profile 嚟,唔再淨係讀 env** —— 而三個
    `AZURE_OPENAI_*` **缺一即 503 呢個行為唔准鬆**(ADR-0037 E1 靠佢)
- **Effort**:3h · **Owner**:AI

### F4 — 全域 run 列表 endpoint(W46 結構性缺口)

- **Spec ref**:`agent-tier2-scope.md §2.7`
- `GET /agent/runs?status=&profileId=&since=&limit=&cursor=`
- **🔴 OpCo scope 照舊由啟動者帶入** —— 一個 `OPCO_IT` 只睇到自己 OpCo 嘅 run
  (`OQ-2` 個答案喺呢度第一次有實際後果)
- **Acceptance**:
  - 分頁真係分(唔係 `take: 1000` 扮分頁)
  - `runState` **唔出 wire**(W46 個 `select` 就係唯一嗰道閘,`agent-run.controller.spec.ts` 守住)
  - 篩選每個 param 各一條 test
- **Effort**:4h · **Owner**:AI

### F5 — 管理頁面第一版(**H6**)

- 🟡 **`OQ-B` 未答**:獨立 route(`/agent`)定係擴 `Settings › AI agent` tab?
  —— **建議獨立 route**,因為 `R-A` 要嘅係「一系列頁面」,而 run 列表塞唔落一個 tab
- 內容:profile 列表 + 建立 / 編輯 dialog · run 列表(狀態 / profile / 時間 / 開得入去)
- **Acceptance**:light + dark 真 render · 零橫向溢出 · 跑 `ui-design` skill ·
  數字同 id **mono**(DS-5)· **一個 view 一個 primary**(DS-3)
- **Effort**:6h · **Owner**:AI

### F6 — Test + falsification(**H5**)

- LLM 一律 mock(跟 W46)
- **每道新閘拆走實作睇佢紅唔紅**,還原之後真跑
- **Effort**:含喺上面各項

### F7 — Live 驗

- 本機:建兩個 profile(唔同 model)→ 各跑一個 run → run 列表分得開
- DEV:migration 跑得過 + 列表出得到
- ⚠️ **唔可以睇 revision status 當證據**(entrypoint 令 migrate 失敗 NON-FATAL)

---

## 3. Success Criteria(Phase Gate)

| # | Criterion | Target | Measure | Block closeout? |
|---|---|---|---|---|
| G1 | migration 對真 DB | 本機 + DEV 都 applied | container log / `_prisma_migrations` | **Yes** |
| G2 | **舊 run 冇 profile 仍然讀得到** | `GET /agent/runs/:id` 200 | test + live | **Yes** |
| G3 | `agent.boundary.spec.ts` 仍然全綠 | 零 forbidden import | `npm test -w @uop/api` | **Yes** |
| G4 | `runState` 冇經新 endpoint 洩出 | 0 | controller spec | **Yes** |
| G5 | falsification 每道新閘一次 | 真紅零誤傷 | 逐個拆走實作 | **Yes** |
| G6 | H6 light + dark | 兩個都 render 過 | `ui-design` + 截圖 | **Yes** |
| G7 | root gate | test / lint / build 三個 exit 0 | root script(而家蓋埋 web) | **Yes** |
| G8 | live 驗(本機 + DEV) | 兩個 profile 分得開 | F7 | **Yes** |

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

---

**Lifecycle reminder**:呢份 plan locked after status=active。重大 deviation 入第 8 節
changelog,小 detail 變動可直接 inline edit。
