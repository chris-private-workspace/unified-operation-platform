# ADR-0040: Agent run 由工作流程移除 = soft-hide,唔係 delete

**Date**: 2026-08-17
**Status**: **Accepted**(Chris Lai,2026-08-17 —— 八條 D 連 §4.2 兩條 deviation[`D2` `unhide` · `D7` ADMIN-only]一併批)
**Approver**: Chris Lai

---

## Context

**觸發**:`CH-031`。部署 #9 / #9b 期間喺 Azure DEV 開咗兩個測試 agent run,收工要清,發現**平台冇任何路徑移除一個 run** —— `/agent/runs/{id}` 只得 `get`(DEV OpenAPI 實讀),而 DEV PG 係 private endpoint。Chris 2026-08-17 要求開單處理 `DELETE /agent/runs/:id`。

**觸發嘅 hard constraint**:CLAUDE.md **§5 H1**(改 Prisma schema / 資料模型)。

### 為咗落決定而查證返嚟嘅事實(全部由 migration SQL / schema / code 讀返)

**① 刪一個 `AgentRun` 唔係應用層可以選擇範圍嘅操作。**

`apps/api/prisma/migrations/20260815030000_w46_agent_runtime/migration.sql:97-103`:

```sql
AgentStep.runId     REFERENCES "AgentRun"("id") ON DELETE CASCADE
AgentMessage.runId  REFERENCES "AgentRun"("id") ON DELETE CASCADE
AgentProposal.runId REFERENCES "AgentRun"("id") ON DELETE CASCADE
```

而呢三張表就係 audit 真相 —— `schema.prisma:646` 明文:「It is NOT the audit truth; `AgentStep` and `AgentProposal` are.」`schema.prisma:712-714` 講 `AgentProposal.approvedById`:「'who approved what' is the only reason Tier 1 exists」。

**② Hard delete 會推翻一條 Accepted 決定。**

`ADR-0036 D6`(Chris 2026-08-15 拍板)逐字:「`AgentMessage` **永久保留**,唔設 retention」。Cascade 令佢消失。

**③ 兩個唔使改任何 ADR 文字、但已經係實質架構改動嘅後果。**

- `review-stats.service.ts:146-157` 聚合 `AgentProposal where decidedAt != null`,而 `isApproval = status === 'executed' || 'failed'`。呢個係一個**比率** ⇒ 刪走 proposal 被拒絕嘅 run 會令批准率**升**,刪走被批准嘅會令佢**跌**,**兩個方向都冇 tombstone、冇嘢會紅**。而 `ADR-0036 R13` 就係「proposal 被人 rubber-stamp ⇒ 一定要有數字監測」。**一個可以被一次 API call 靜靜改嘅指標,唔再係 control。**
- `kill-switch.service.ts:72-92`:`settled = !enabled && liveRuns === 0 && pendingProposals === 0`,`liveRuns` 數 `AgentRun` 非 terminal 數量 ⇒ 刪走一個行緊嘅 run,kill switch **報假 `settled: true`**。

**④ 但要老實記低一個負面結果:冇明文禁令。**

全 repo 搜過 —— **冇任何 ADR / spec / code comment / test 寫過「agent run 唔准刪」**。`agent.boundary.spec.ts:217-232` 有「一張表一個 writer」約束,但**只蓋 `agentStep` / `agentProposal` / `agentMessage`,冇 `writersOf('agentRun')`**,verb list 亦**冇 `deleteMany`**。⇒ 今日加一句 `prisma.agentRun.delete(...)` **冇任何一條 test 會紅**。呢個係**守衛缺席**,唔係守衛放行。

**⑤ 平台上一次撞到結構上一模一樣嘅形狀,已經有答案。**

`ADR-0022 D1` 逐字:

> `OpcoSkuLedger` row 一律唔 hard delete。理由唔係保守,係**刪 row 冇任何額外收益**:`ledger-read.service.ts:33` 已經令 `0/0` 行喺 UI 消失,而 delete 會令 `LedgerAdjustment` 經 `onDelete: Cascade` 一齊消失(ADR-0007 audit trail)。**同樣效果,單邊代價 ⇒ 唔取。**

| | ADR-0022(ledger) | 本 ADR(agent run) |
|---|---|---|
| 想達到嘅效果 | UI 唔好再見到嗰行 | UI 唔好再見到嗰個 run |
| Hard delete 嘅代價 | `LedgerAdjustment` cascade 消失 | `AgentStep` / `Message` / `Proposal` cascade 消失 |
| 決定 | row 保留 + 讀層隱藏 | **同上** |

同一個平台、同一個形狀,唔應該兩次答案唔同,除非講得出點解今次唔同。**今次講唔出。**

**⑥ 需求嘅真實大細(要防止 over-build)。**

平台**冇全域 run 列表**(`agent-tier2-scope.md:97`);前端只有 `ai-assist-card.tsx`,顯示**一張 request 嘅最新 run**。⇒ 今日可見範圍 = **兩張 request 嘅 detail 頁**。呢個需求本身**細過**一個推翻 ADR 嘅改動 —— 所以本 ADR 揀嘅路必須係「唔推翻任何嘢」嗰條,否則成本同收益對唔上。

---

## Decision

**D1 — `AgentRun` 加 `hiddenAt DateTime?`(nullable),additive migration,零 data loss。**

一行 `ADD COLUMN … TIMESTAMP(3)`,**冇 `UNIQUE`、冇 index、唔出現喺任何既有 `where`**。同 `ADR-0035` 加 `serviceNowLicenceReqNumber` 同級 —— 收窄範圍嘅 schema 改動,唔係新 candidate key。

**D2 — verb 用 `POST /agent/runs/:id/hide` + `POST /agent/runs/:id/unhide`,明文唔用 `DELETE`。**

`DELETE` 會講一個假嘅真相。呢個操作唔刪任何 row,而 HTTP verb 係 API 對外講「我做緊乜」嘅第一句。

🔴 **`unhide` 係本 ADR 加嘅,唔喺 CH-031 §4 選項 B 原文入面(R3 deviation,明文記低)。** 理由:`hiddenAt` 落咗之後,**平台側冇路改得返**(DEV PG 係 private endpoint —— 正正就係本單一開始嘅困境)。一個「單向、改錯咗要開 infra 單先救得返」嘅操作,同佢想解決嘅問題同源。成本係一個 route + 一句 `update`。

**D3 — 讀層邊界:`findLatestForRequest` 過濾,`getRun` 唔過濾。**

- `GET /agent/runs?requestId=` 加 `hiddenAt: null` ⇒ AI-Assist card 唔再見到
- `GET /agent/runs/:id` **照樣攞得到** ⇒ 攞住 id 嘅 ADMIN / REGIONAL 睇得返

語意寫清楚:**「hidden」= 唔好再喺日常工作流程出現,唔係「消失」。** 呢個分別就係本 ADR 同 hard delete 嘅全部分別。

**D4 — `review-stats` 同 `kill-switch` 一個字唔改,而且呢個係本決定最重要嘅性質。**

兩者聚合嘅係 `AgentProposal.decidedAt` / `AgentRun.status`,同 `hiddenAt` **正交**。⇒ **R13 監測同 kill switch 結構上唔可能被 hide 影響** —— 唔係「我哋小心咗」,係「冇一條路徑通得到」。

Test 要用 falsification 釘住呢一點(見 CH-031 acceptance)。

**D5 — 寫 `AuditLog`,新 action `agent.run_hidden`,event-only(`before` / `after` 空)。**

論據**唔係新嘅** —— `audit-fields.ts:172-180` 講 `AGENT_KILL_SWITCH_SET` 嗰段逐字適用:

> the alternative is an admin control that changes what the platform will do and **leaves no record of who changed it** — which is the thing ADR-0009 exists to prevent

「令一個紀錄喺畫面消失」比「撳熄個 agent」更加需要留低邊個做過。`'AgentRun'` **已經喺 `AuditTargetType`**(`audit-fields.ts:200`),所以只加一條 action,唔動 target type,唔動 allow-list。

**D6 — 只准 hide **terminal** run(即 `status ∉ NON_TERMINAL_RUN_STATUSES`)。**

Hide 唔改 `status`,所以 kill switch **仍然**數得到一個 hidden 但行緊嘅 run —— 假 `settled` 呢個問題本身唔會出現。要擋嘅係另一樣:**一個 hidden 但仲有 pending proposal 嘅 run,個 proposal 會永遠喺 `pendingProposals` 度等人批,而人喺 UI 已經見唔到佢。** 呢個閘同 `abortRun:455-459` 嗰個啱啱相反,行為對稱:**未完就 abort,完咗先 hide。**

**D7 — RBAC 收窄做 ADMIN-only(method-level `@Roles(Role.ADMIN)` override)。**

`AgentRunController` class-level 係 `@Roles(ADMIN, REGIONAL)`。REGIONAL 批得 proposal(plan OQ-2),但「令一個紀錄喺工作流程消失」係另一種權力,跟 `kill-switch` / `review-stats` 兩個 ADMIN-only controller 嘅級別。

⚠️ 呢個係**本 controller 第一個 method-level `@Roles`**。合法 Nest pattern,但要記住佢會郁 `permissions.spec.ts.snap`(加任何 route 都會)。

**D8 — `agent.boundary.spec.ts` 順手加 `writersOf('agentRun')`,但 `deleteMany` 嗰半唔喺本單。**

本 ADR **新增咗一個 `agentRun` writer**,而嗰張表今日冇 writer 約束(Context ④)。釘住「邊個可以寫 `agentRun`」係本改動自己製造嘅風險,唔係順手做無關嘢(§1.3)。`deleteMany` verb 嗰半登做獨立候選 `agent-boundary-gaps`。

---

## Alternatives Considered

- **Option A — 真 hard delete(`DELETE /agent/runs/:id`,任由 cascade)**:**rejected**。推翻 `ADR-0036 D6`;令 R13 監測數字可以被靜靜改;`AuditLog` 兩條 row(`targetId` 冇 FK)變孤兒指住唔存在嘅 id;同 `ADR-0022 D1` 加三個模組(`user-admin.service.ts:36` / `opco-admin.controller.ts:28` / `catalog.service.ts:105`)嘅慣例相反。**換返嚟嘅嘢 = 零** —— 效果同 soft-hide 一樣。

- **Option C — 窄閘 hard delete(只准刪冇任何 proposal 有 `decidedAt` 嘅 terminal run)**:**rejected**。條閘設計得啱(R13 個 population 就係 `decidedAt != null`,所以結構上影響唔到佢),但**仍然推翻 D6**(`AgentMessage` 照樣 cascade 走)⇒ 付咗「推翻一條 Accepted 決定」嘅全額代價,只換到一個 soft-hide 免費就有嘅效果。真正嘅風險亦唔喺今日:條閘住喺應用層冇 DB 約束撐(同 `assertNoOpenRun` 一樣,`agent-run-status.ts:18-22` 明文講咗 Prisma 表達唔到),而**將來有人放寬佢嗰刻,D6 已經係「推翻過」嘅狀態**。

- **Option D — 唔加 endpoint,一次性清 DEV**:**rejected,但佢係四個入面第二好,而且理由值得記低**。Context ⑥ 講咗需求細過改動,所以「唔做」係企得住嘅。Reject 嘅原因唔係今日痛,係 **Tier 2 `T2-a` 會加 run list endpoint**(`agent-tier2-scope.md:198`)—— 到時每一個殘留 run 都會列出嚟,而「點移除」呢個語意會喺**有更多 run、更多人睇緊**嘅時候先要答。而且「開一條路連到 DEV DB」本身有 H4 味道。**而家答,係最平嘅時候。**

- **Chosen — Option B(soft-hide)**:因為 Context ⑤ 個對照表。同樣效果,零 audit 損失,零 ADR 推翻,而 `hiddenAt` 喺 Tier 2 run list 直接就係個 filter。

---

## Consequences

### Positive
- **零 audit 損失**:`AgentStep` / `AgentMessage` / `AgentProposal` 一行都唔郁,`ADR-0036 D6` 一個字唔使改。
- **R13 同 kill switch 結構上免疫**(D4)—— 唔係靠紀律,係冇路徑。
- **可逆**(D2 `unhide`),而唔可逆正正係本單一開始嘅困境。
- **Tier 2 用得返**:`T2-a` 個 run list 直接 `hiddenAt: null`。
- 加咗一個本來缺席嘅守衛(D8)。

### Negative
- **加咗一欄 + 兩個 route + 一條 audit action** —— 為咗一個今日只影響兩張 detail 頁嘅問題。呢個係知情之下嘅取捨:買嘅唔係今日,係 Tier 2(Alternatives Option D)。
- **`hiddenAt` 係第二個「令 run 喺 UI 消失」嘅機制**(第一個係 `abortRun` 之後張卡仍然喺度)。將來睇 run 可見性要同時考慮 `status` 同 `hiddenAt` 兩個欄。
- **唔解決 GDPR-style 徹底移除**。嗰個屬 `audit-retention`(BACKLOG 候選 · `ADR-0009 D8.3` 刻意唔做),而佢同 `agent-tier2-scope.md` **OQ-4**(「對話要唔要 persist?留幾耐?」)係同一條問題。**本 ADR 明文唔碰佢。**
- **第一個 method-level `@Roles` override**(D7)—— 新形狀。

### Neutral
- `AgentRun` 三個父 FK(`principalId` RESTRICT / `startedById` RESTRICT / `requestId` SET NULL)**唔受影響**。
- `AuditTargetType` 已經有 `'AgentRun'`,唔使動(D5)。
- 既有兩條「結束一個 run」嘅路(`abortRun` / `expireRun`)語意**一個字唔改** —— hide 係第三件事,同「結束」正交。

---

## References
- `docs/03-implementation/changes/CH-031-agent-run-removal/spec.md`(觸發本 ADR 嘅 change)
- **`ADR-0036 D6`**(`docs/adr/0036-agent-runtime-seam.md:187-191`)—— 本 ADR **唔推翻**佢,係刻意繞開
- **`ADR-0022 D1`**(`docs/adr/0022-ledger-full-reset.md:39-41`)—— 結構上同族嘅先例
- `ADR-0009 D7` 連帶義務 ③ / `D8.3` · BACKLOG `audit-retention`(明文 out-of-scope)
- `ADR-0035`(additive schema 改動嘅先例:一行 `ADD COLUMN`,冇 UNIQUE 冇 index)
- `docs/02-architecture/agent-tier2-scope.md` §2.7(冇全域 run 列表)· §5 `OQ-4` · `T2-a`
- `apps/api/prisma/migrations/20260815030000_w46_agent_runtime/migration.sql:97-103`(cascade 事實)
- `apps/api/src/agent/review-stats.service.ts:130-157`(R13 population)· `kill-switch.service.ts:72-92`
- `apps/api/src/audit/audit-fields.ts:169-181`(D5 個論據來源)· `:200`(`AgentRun` target type 已存在)
- `apps/api/src/agent/agent.boundary.spec.ts:202-244`(D8 個缺口)
- W46 `plan.md §4` · INC-001
