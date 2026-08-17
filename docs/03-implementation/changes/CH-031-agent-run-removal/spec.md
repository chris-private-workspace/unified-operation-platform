---
change_id: CH-031
title: "移除一個 agent run —— 由 DEV 兩個測試殘留引出,但真正要決定嘅係 agent 側嘅刪除語意"
status: approved        # 🟢 2026-08-17 Chris 揀咗 §4 選項 B(soft-hide)⇒ scope 定咗,acceptance 見 §6
created: 2026-08-17
target_completion: TBD  # 估 1–1.5 日(§7 選項 B)
affects_components: [apps/api/agent, apps/api/prisma, apps/api/audit, apps/web]
spec_refs:
  - **ADR-0040**(決策 SSOT · **Proposed** —— agent run soft-hide,本單直接落地嗰份)
  - **ADR-0036 D6**(保留策略:`AgentMessage` **永久保留** + ADMIN-only · Chris 2026-08-15 拍板)
  - **ADR-0022 D1**(ledger row **絕不 delete** —— 本單結構上同族嘅先例,見 §3.3)
  - ADR-0009 D7 連帶義務 ③ / D8.3(`AuditLog` retention 刻意唔做)· BACKLOG `audit-retention`
  - ADR-0036 R11(永久保留 = 知情負債)· R13(rubber-stamp 監測 ⇒ 一定要有數字)
  - docs/02-architecture/agent-tier2-scope.md §2.7(冇全域 run 列表)· §5 OQ-4(對話留幾耐)
  - W46 plan §4(schema)· INC-001(audit 真相點解重要)
---

# CH-031 — 移除一個 agent run

> **Spec version**:1.0(**approved** 2026-08-17)
> **Owner**:Chris Lai · **提出**:Chris Lai(2026-08-17,「開單處理 `DELETE /agent/runs/:id`」)· **Approved by**:**Chris Lai**(2026-08-17,揀 §4 選項 **B**)
> **決策 SSOT**:**`ADR-0040`**(🟢 **Accepted** 2026-08-17)
> **分類**:**Change**(改現有 feature 嘅生命週期語意;唔係新 feature,唔係 bug —— 今日冇 DELETE 係 W46 從來冇 scope 過,唔係壞咗)
> 🔴 **觸發 H1**(改 Prisma schema · additive)—— 見 **§3**。
>
> 🟢🟢 **開工閘已過**(2026-08-17):`ADR-0040` **`Accepted`**,八條 D 連 §4.2 兩條 deviation(`D2` `unhide` · `D7` ADMIN-only)一併批 ⇒ **可以落 code**。

---

## 1. 點解要 —— 真實需求,唔好講大咗

**觸發事件**:部署 #9 / #9b 期間,為咗驗 agent 喺 DEV 行唔行得到,喺 DEV 開咗**兩個測試 run**。收工要清,發現**清唔到**:

| 嘗試 | 結果 |
|---|---|
| `POST /agent/runs/{id}/abort` | ✅ 做到 —— 兩個都 terminal、冇 pending proposal |
| `DELETE /agent/runs/{id}` | ❌ **route 唔存在**(DEV OpenAPI 實讀:`/agent/runs/{id}` 只得 `get`) |
| 直接落 DB 執 SQL | ❌ DEV PG 係 private endpoint,呢台機到唔到 |

⇒ **平台今日冇任何路徑移除一個 agent run。**

### 1.1 但個需求實際有幾大?要老實講

🔴 **「兩行測試 row 見得到」呢個講法要收窄。** 由 code 讀返:

- **冇全域 run 列表**(`agent-tier2-scope.md:97`)—— `GET /agent/runs?requestId=` **只答一張 request 嘅最新 run**,另外得 `GET /agent/runs/:id`。
- 前端只有 `components/requests/ai-assist-card.tsx`,掛喺 **request detail 頁**,顯示嗰張 request 嘅**最新** run。

⇒ 實際可見範圍 = **嗰兩張 request 嘅 detail 頁,各自見到一個 `aborted` run 卡**。唔係「污染成個系統」。

⇒ **呢個需求嘅真實大細,唔足以自己撐起一個推翻 ADR 嘅改動。** 本單真正值錢嘅係第二層:**「agent run 可唔可以移除、點移除」呢個語意,平台遲早要答,而家答成本最低**(Tier 2 `T2-a` 就會加 run list endpoint,到時每一個殘留 run 都會列出嚟)。

---

## 2. 現況 —— 全部由 migration SQL / schema / code 讀返

### 2.1 刪一個 `AgentRun` 會連帶刪走乜(**DB 層面,唔係應用層可以選擇嘅**)

`apps/api/prisma/migrations/20260815030000_w46_agent_runtime/migration.sql:97-103` 逐字:

```sql
AgentStep.runId     REFERENCES "AgentRun"("id") ON DELETE CASCADE
AgentMessage.runId  REFERENCES "AgentRun"("id") ON DELETE CASCADE
AgentProposal.runId REFERENCES "AgentRun"("id") ON DELETE CASCADE
```

⇒ 一句 `DELETE FROM "AgentRun"`,**三張子表對應 row 喺資料庫層面靜靜消失**,應用層攔唔到。

而呢三張表係咩,schema 自己講咗:

| 表 | schema 註釋 |
|---|---|
| `AgentStep` | `schema.prisma:662-663`「The action ledger — written by the PLATFORM, around a tool actually running. **This is the audit truth.**」 |
| `AgentProposal` | `schema.prisma:712-714`「`approvedById` / `rejectedReason` live here … because **'who approved what' is the only reason Tier 1 exists**」 |
| `AgentMessage` | `schema.prisma:692-696`「Retention is **FOREVER** and read access is ADMIN-only (Chris 2026-08-15)」 |

`AgentRun` 自己反而唔係真相 —— `schema.prisma:646`:「It is NOT the audit truth; `AgentStep` and `AgentProposal` are.」

### 2.2 父方向唔受影響

`AgentRun.principalId` → `RESTRICT` · `startedById` → `RESTRICT` · `requestId` → `SET NULL`。刪 run **唔會**掂到 `AgentPrincipal` / `AppUser` / `Request`。

### 2.3 今日兩條「結束一個 run」嘅路,兩條都係 UPDATE

| 路 | 寫咩 | 出處 |
|---|---|---|
| `abortRun` | append 一條 `AgentStep{key:'abort'}` → `status:'aborted'` + `endedAt` → 把 pending proposal bulk `rejected`(**刻意唔寫 `decidedAt`/`approvedById`**) | `ai-assist.service.ts:453-486` |
| `expireRun` | 同一形狀,`key:'expired'` / `status:'expired'` | `ai-assist.service.ts:511-554` |

⇒ **平台既有語意係「append 一條 step + 改 status」,從來冇 DELETE。**

### 2.4 會 dangle 嘅嘢(冇 FK,所以係孤兒唔係一齊走)

- `AuditLog` 兩條 row:`targetType:'AgentRun'`(`AGENT_RUN_STARTED`)+ `targetType:'AgentProposal'`(`AGENT_PROPOSAL_DECIDED`)。**`AuditLog.targetId` 係普通 `String` 冇 FK**(`schema.prisma:445`)⇒ 佢哋會**留低兼且指住一個唔存在嘅 id**。
- 真域副作用:approve 過嘅 proposal 造出嚟嘅 `RequestLineItem` / `RequestEvent` / `OpcoSkuLedger` / `LedgerAdjustment` **全部留低**,但**追唔返係邊個 run 提議嘅** —— 唯一連結 `AgentProposal.payload.createdLineItemIds` 一齊 cascade 走。

### 2.5 R13 監測數字會靜靜郁

`review-stats.service.ts:146-157` 聚合嘅係 **`AgentProposal`,唔係 `AgentRun`**:

```ts
where: { decidedAt: { not: null, gte: since } }
```

而 `isApproval` = `status === 'executed' || status === 'failed'`。呢個係一個**比率**⇒

- 刪走 proposal 被**拒絕**嘅 run ⇒ 批准率**升**
- 刪走 proposal 被**批准**嘅 run ⇒ 批准率**跌**

🔴 **兩個方向都冇 tombstone,冇嘢會紅。** 而 `ADR-0036 R13` 個定義就係「agent proposal 被人 rubber-stamp ⇒ **一定要有數字監測**先睇得到」,service header 亦寫住「Nothing about the system looks different when this happens」。

### 2.6 Kill switch 會講大話

`kill-switch.service.ts:72-92`:`settled = !enabled && liveRuns === 0 && pendingProposals === 0`,而 `liveRuns` = 數 `AgentRun` 入面非 terminal 嗰啲。

⇒ **刪走一個仲行緊嘅 run,kill switch 會報 `settled: true`,而嗰份工從來冇真正停過。**

### 2.7 平台今日得一個 DELETE

全 `apps/api/src` grep `@Delete(` —— **只有一個**:

```
apps/api/src/fulfilment/fulfilment.controller.ts:91  @Delete(':id/line-items/:lineItemId')
```

⇒ 加第二個唔係「跟慣例」,係**開一個新形狀**。

### 2.8 🔴 順帶揾到一個真缺口(唔一定喺本單修,但要記低)

`agent.boundary.spec.ts:217-232` 有「一張表一個 writer」嘅靜態 test,但:

- **只覆蓋 `agentStep` / `agentProposal` / `agentMessage`,冇 `writersOf('agentRun')`**
- verb list 有 `delete(` 但**冇 `deleteMany(`**(對照 `tool-registry.spec.ts:270-282` 兩個都禁)

⇒ **今日喺 `ai-assist.service.ts` 加一句 `prisma.agentRun.delete(...)`,冇任何一條 test 會紅。** 呢個係「守衛缺席」唔係「守衛放行」,兩者分別好大。

---

## 3. 🔴 H1 觸發點 —— 分三層講,唔可以混做一句

我要準確,唔可以講到好似有一條明文禁令咁。**實情係:冇任何 ADR / spec / test 明文寫過「agent run 唔准刪」**(呢個負面結果我核過)。H1 觸發嚟自另外三層:

### 3.1 明文推翻 —— `ADR-0036 D6`

`docs/adr/0036-agent-runtime-seam.md:187-191` 逐字:

> ### D6 —— 保留策略:**永久保留 + ADMIN-only**(Chris 2026-08-15 拍板)
> - `AgentMessage` **永久保留**,唔設 retention

⇒ hard delete 令 `AgentMessage` 經 cascade 消失 ⇒ **直接推翻一條 Chris 親自拍板嘅 Accepted 決定** ⇒ **必須寫 ADR**(§6 H1 required behavior)。

⚠️ **精確度**:D6 明文講嘅**只係 `AgentMessage`**。`AgentStep` / `AgentProposal` 嘅保護嚟自 schema 註釋 +下面 3.3 嘅慣例,**唔係 D6**。呢個分別重要,因為佢決定咗「窄選項」做唔做得到。

### 3.2 實質推翻 —— `R13` 監測嘅可信度

§2.5:刪 run 會令 rubber-stamp 監測數字**兩個方向都可以靜靜郁**。一個「防止有人靜靜 rubber-stamp」嘅指標,如果本身可以被一個 API call 靜靜改,佢就唔再係 control。**呢個唔使改 ADR 文字都已經係實質架構改動。**

### 3.3 慣例推翻 —— `ADR-0022 D1`,而且係**結構上同一件事**

`docs/adr/0022-ledger-full-reset.md:41` 逐字:

> `OpcoSkuLedger` row 一律唔 hard delete。理由唔係保守,係**刪 row 冇任何額外收益**:`ledger-read.service.ts:33` 已經令 `0/0` 行喺 UI 消失,而 **delete 會令 `LedgerAdjustment` 經 `onDelete: Cascade` 一齊消失(ADR-0007 audit trail)。同樣效果,單邊代價 ⇒ 唔取。**

📌 **兩件事逐項對得返**:

| | ADR-0022(ledger) | CH-031(agent run) |
|---|---|---|
| 想達到嘅效果 | UI 唔好再見到嗰行 | UI 唔好再見到嗰個 run |
| Hard delete 嘅代價 | `LedgerAdjustment` cascade 消失 | `AgentStep`/`Message`/`Proposal` cascade 消失 |
| 有冇更平嘅路 | 有 —— 讀層已經隱藏 `0/0` | **要睇 §4** |
| 當時決定 | **row 保留,唔 delete** | ? |

同一個平台,同一個形狀,**唔應該兩次答案唔同,除非講得出點解今次唔同**。

順帶:`user-admin.service.ts:36`「we never hard-delete (D-c)」· `opco-admin.controller.ts:28`「we never hard-delete」· `catalog.service.ts:105`「Rows are never deleted」—— 三個模組同一句。

---

## 4. 四個選項 —— 要 Chris 揀一個

> 🔴 **呢節就係本單要 approve 嘅嘢。** 揀完先寫 §6 acceptance,先開 checklist。

### 選項 A —— `DELETE /agent/runs/:id`,真 hard delete

**做**:加 route,`prisma.agentRun.delete()`,任由 cascade。

- ✅ 直接、少 code、requester 要嘅嘢逐字做到
- ❌ **推翻 ADR-0036 D6** ⇒ 要 ADR
- ❌ **R13 數字可以被靜靜改**(§2.5)⇒ 一個 control 變成可繞過
- ❌ `AuditLog` 兩條 row 變孤兒(§2.4)
- ❌ 同 ADR-0022 D1 / 三個模組嘅慣例相反
- ❌ 刪一個非 terminal run ⇒ kill switch 報假 `settled`(§2.6)

### 選項 B —— Soft-hide:`AgentRun.hiddenAt`,讀層隱藏 ⭐ **我建議呢個**

**做**:`AgentRun` 加一個 nullable `hiddenAt DateTime?`(additive migration,零 data loss);`POST /agent/runs/:id/hide`(**唔用 `DELETE` verb** —— verb 應該講真相);`findLatestForRequest` 加 `hiddenAt: null`;`GET /agent/runs/:id` **照樣攞得到**(ADMIN 睇得返);`review-stats` / `kill-switch` **一個字唔改**。

- ✅ **同 ADR-0022 D1 逐字同一個解法** —— row 保留,讀層隱藏,零 audit 損失
- ✅ **D6 一個字都唔使郁** ⇒ 嚴格講可能唔使 ADR(要 Chris 判;我傾向仍然寫一份短 ADR,因為佢定義咗一個新語意)
- ✅ R13 / kill switch 數字**結構上唔可能被影響**
- ✅ Tier 2 `T2-a` 加 run list 嗰陣,`hiddenAt` 直接就係個 filter
- ❌ 加一欄 = schema 改動 = **H1**(但係 additive,同 ADR-0035 個「一行 `ADD COLUMN`,冇 UNIQUE 冇 index」同級)
- ❌ 「刪唔到」嘅人如果真係想要 GDPR-style 徹底移除,呢個唔係答案(→ 落 `audit-retention`)

### 選項 C —— 窄閘 hard delete:只准刪「從來冇人決定過」嘅 run

**做**:選項 A + 一道閘 —— run 必須 terminal **兼且**佢下面**冇任何 proposal 有 `decidedAt != null`**。

- ✅ 剛好覆蓋「測試殘留」場景(冇人撳過 approve/reject 嘅 run)
- ✅ **結構上唔可能影響 R13**(R13 個 population 就係 `decidedAt != null`,§2.5)
- ❌ **仍然推翻 D6** —— `AgentMessage` 照樣 cascade 走 ⇒ **仍然要 ADR**
- ❌ 條閘係應用層,**冇 DB 約束撐**(同 `assertNoOpenRun` 一樣,`agent-run-status.ts:18-22` 明文講咗 Prisma 表達唔到)
- ⚠️ 呢個選項嘅風險唔喺今日,喺**將來有人放寬條閘**,而放寬嗰刻 D6 已經係「已經推翻過」

### 選項 D —— 唔加 endpoint,一次性清 DEV

**做**:唔郁 code。開一條路連到 DEV DB(bastion / `az containerapp exec` / 一次性 job)執兩句 SQL,或者索性**唔清**(§1.1:實際只影響兩張 request 嘅 detail 頁)。

- ✅ **零 code、零 ADR、零新語意**
- ✅ 誠實面對 §1.1 —— 需求細過改動
- ❌ 個問題**冇解決**,Tier 2 `T2-a` 出咗 run list 之後會即刻返嚟兼且變大
- ❌ 「連到 DEV DB」本身要開一條路,而嗰條路自己有 H4 味道

### 4.1 🟢 **Chris 2026-08-17 揀咗 B(soft-hide)**

原建議理由(保留原文):**因為 §3.3 個對照表** —— 平台上一次撞到「想 UI 唔見到,但 hard delete 會帶走 audit」呢個一模一樣嘅形狀,答案係 **row 保留 + 讀層隱藏**,而個理由(「同樣效果,單邊代價」)喺本單**逐字成立**。

⚠️ **當時 flag 咗嘅反對意見亦保留**:選項 B 為咗一個「兩張 detail 頁見到 aborted 卡」嘅問題,加一個 schema 欄 + endpoint + 前端。選項 D 係完全企得住嘅答案。**Chris 知情之下仍然揀 B** ⇒ 買嘅唔係今日,係 Tier 2 `T2-a`(見 ADR-0040 Alternatives Option D)。

### 4.2 🔴 兩條「唔喺選項 B 原文入面」嘅嘢 —— 我加嘅,要 Chris 喺 ADR 批(R3)

選項 B 個描述係「`hiddenAt` + `POST :id/hide` + 讀層隱藏 + `review-stats`/`kill-switch` 唔改」。`ADR-0040` 八條 D 入面**有兩條超出咗**,我唔會靜靜加:

| ADR-0040 | 加咗乜 | 點解 |
|---|---|---|
| **`D2` 個 `POST :id/unhide`** | 多一條 route | `hiddenAt` 落咗之後**平台側冇路改得返**(DEV PG private endpoint —— **正正就係本單一開始嗰個困境**)。一個「改錯咗要開 infra 單先救得返」嘅操作,同佢想解決嘅問題同源。成本 = 一個 route + 一句 `update` |
| **`D7` RBAC 收窄做 ADMIN-only** | method-level `@Roles(Role.ADMIN)` override | controller class-level 係 `ADMIN, REGIONAL`。REGIONAL 批得 proposal(plan OQ-2),但「令一個紀錄喺工作流程消失」係另一種權力,跟 `kill-switch` / `review-stats` 兩個 ADMIN-only controller 級別。⚠️ 呢個係本 controller **第一個** method-level override |

另外 **`D8`**(順手加 `writersOf('agentRun')`)嚴格講亦係加嘅,但佢**唔係 scope creep**:本單自己新增咗一個 `agentRun` writer,而嗰張表今日**冇** writer 約束(§2.8)⇒ 釘住佢係本改動製造嘅風險,唔係順手做無關嘢(§1.3)。`deleteMany` verb 嗰半**唔喺本單**,已登 BACKLOG `agent-boundary-gaps`。

---

## 5. Scope

### In(選項 B 定咗之後)
- `AgentRun.hiddenAt DateTime?` + additive migration
- `POST /agent/runs/:id/hide` + `POST /agent/runs/:id/unhide`(ADMIN-only · terminal-only · OpCo scope)
- `findLatestForRequest` 加 `hiddenAt: null`;**`getRun` 明文唔過濾**
- `AuditLog` 新 action `agent.run_hidden`(event-only)
- `review-stats` / `kill-switch` **不受影響**嘅證明(falsification test)
- 前端:`ai-assist-card.tsx` 加 hide 入口 + hidden 狀態(H6 light + dark)
- `agent.boundary.spec.ts` 加 `writersOf('agentRun')`
- 清走(hide 走)DEV 嗰兩個測試 run

### Out(明文)
- **`audit-retention` 政策**(BACKLOG 候選 · ADR-0009 D8.3)—— 本單**唔可以**順手定 retention,佢同 `agent-tier2-scope.md` **OQ-4**(「對話要唔要 persist?留幾耐?」)撞
- **全域 run 列表 / run 管理頁**(Tier 2 `T2-a`)
- 批量刪除 / `deleteMany` 任何形式
- `AgentPrincipal` 刪除

### 🚧 順帶記低,唔喺本單做
- §2.8 `agent.boundary.spec.ts` 兩個缺口(`agentRun` 冇 writer 約束 · verb list 冇 `deleteMany`)⇒ **若揀 A 或 C,呢個必須一齊修**,因為佢係唯一會攔住「將來有人靜靜加多個 delete」嘅嘢;若揀 B 或 D,登做獨立候選。

---

## 6. Acceptance

> 🟢 **選項 B 揀咗(2026-08-17)⇒ 填得。** 每條寫**點驗**,唔係寫「做咗」。
> 📌 **形式跟 W46 個教訓**:acceptance 就係「呢單算唔算完」嘅定義。收尾要**逐條搵返實際證據(邊個 spec 邊個 `describe`)唔靠記憶勾**。

### A — Schema / migration

- [x] **A1** `AgentRun.hiddenAt DateTime?` 落 schema;migration SQL **實讀** = `ALTER TABLE "AgentRun" ADD COLUMN     "hiddenAt" TIMESTAMP(3);` —— 一行、**冇 `UNIQUE`、冇 index、冇 `NOT NULL`**
- [x] **A2** 本機真 Postgres 跑咗(`prisma migrate deploy`,**唔用 `migrate dev`** —— 原因見 checklist S1-4);`information_schema` 對數:nullable **YES** · 既有 **3 row / 0 non-null** · `pg_indexes` 證 `hiddenAt` 上面**零 index 零 unique**。🚧 **DEV 半邊等部署 #10**

### B — API 行為

- [x] **B1** `POST /agent/runs/:id/hide` → `hiddenAt` 由 `NULL` 變 `Date`;`:id/unhide` → 變返 **`null`**(唔係 `undefined` —— Prisma 當 `undefined` 係「唔好郁」,咁就會靜靜變返單向掣)
- [x] **B2** **terminal-only 閘**(D6):`running` / `awaiting_approval` / `approved` 三個 status 逐個 → `ConflictException` **兼且 `agentRun.update` 完全冇被叫**;`completed` / `failed` / `aborted` / `expired` / `rejected` 五個 → 過
- [x] **B3** **`GET /agent/runs/:id` 對 hidden run 照樣返** —— assert 個 `where` 係 `{ id }` 冇 `hiddenAt`
- [x] **B4** `GET /agent/runs?requestId=` 個 `where` **逐字 = `{ requestId, hiddenAt: null }`**;冇其他 run ⇒ 返 `null`
- [x] **B5** OpCo scope:hide / unhide **兩個都** `ForbiddenException` 兼 `update` 冇被叫;唔存在 → `NotFoundException`
- [x] **B6** RBAC:唔靠 controller unit test,靠 **`permissions.spec.ts.snap` derive 出嚟嘅矩陣**(佢由 `@Roles` 真 derive)—— diff **`2 insertions, 0 deletions`,兩行都 `→ roles [ADMIN]`**;前端側 REGIONAL / OPCO_IT 見唔到個掣(有 test + falsification)

### C — 🔴 最重要嗰組:證明 R13 同 kill switch 冇被影響(ADR-0040 D4)

- [x] **C1** `review-stats` 兩個 query 個 `where` **永遠唔提 `hiddenAt`、唔提 `run`**。🔴 **刻意 assert query 唔 assert 數字** —— 數字可以啱得好彩,一個從來冇提過嗰個欄嘅 `where` **結構上濾唔到**。順帶用 `JSON.stringify(...).not.toContain('hidden')` 兜住 nested 寫法(BUG-011 教訓:`toHaveProperty(key)` 對 `undefined` 一樣 pass)
- [x] **C2** `kill-switch` 嗰條**本身就係 exact-match `toHaveBeenCalledWith`** ⇒ 加 `hiddenAt` 落去佢自己會紅。**冇重複寫一條**,補咗註釋標明佢而家兼任 D4 守衛(寫多一條係重複,唔係嚴謹)
- [x] **C3** **Falsification 真跑真紅零誤傷**:`review-stats` `where` 加 `run: { hiddenAt: null }` ⇒ **1 紅 / 13 綠**,紅嗰條 = `never filters on whether the run was hidden (ADR-0040 D4)`。已還原(`git diff` 證 `review-stats.service.ts` 零 diff)
- [x] **C4** `agent.boundary.spec.ts` 加咗 `writersOf('agentRun')`;喺 `kill-switch.service.ts` 加一個**真** `agentRun.update` writer(唔用註釋 —— 個 check 係文字比對,註釋會假紅)⇒ **1 紅 / 16 綠**。已還原(零 diff)
- [x] **C5** 🆕 額外一條:hide **只寫 `AgentRun` 一張表**(`agentStep` / `agentMessage` / `agentProposal` 四個 writer 全部 `not.toHaveBeenCalled`)**兼且只寫一個欄**(`Object.keys(updateData())` 逐字 `['hiddenAt']`)—— 呢條就係「佢冇變成 delete」嘅結構證明
- [x] **C6** 🆕 第三個 falsification:拆走 `findLatestForRequest` 個 `hiddenAt: null`(即本單核心功能)⇒ **1 紅 / 78 綠**

### D — Audit

- [x] **D1** hide / unhide 各寫一條,action **hardcode assert `'agent.run_hidden'`** 兼 assert `=== AUDIT_ACTIONS.AGENT_RUN_HIDDEN`(兩條夾埋先有意義 —— 淨係後者係 CH-023 嗰種 tautology,code 同 test 由同一個地方攞值);`targetType: 'AgentRun'` · `actorId` = 撳嘅人 · `metadata.hidden` 分開兩個方向 · `before`/`after` **`toBeUndefined`**
- [x] **D2** 唔使改 `/admin/audit` —— 佢照 `action` / `targetType` / `targetId` 篩,而 **`'AgentRun'` 一早喺 `AuditTargetType`**(`audit-fields.ts:200`)⇒ 加一條 action 就夠,零 allow-list 改動
- [x] **D3** audit 同主操作**同一個 `$transaction`** —— 用既有 `auditSawOpenTransaction` flag 驗(佢分得出「transaction 開住嗰陣寫」同「閂咗之後寫」,單純 assert `audit.log` 被叫過係捉唔到嘅)

### E — 前端(H6)

- [x] **E1** `Hide` 掣,**ADMIN 先見到**(新 `canHideAgentRun`);REGIONAL / OPCO_IT 見唔到,而 **REGIONAL 仍然見到 `Stop`** —— 呢條係關鍵,佢證兩個權限真係分開咗
- [x] **E2** hide 成功 ⇒ invalidate ⇒ 服務端濾走 ⇒ 卡返 EmptyState;hide 失敗會出喺既有 error div(有 test)
- [x] **E3** **light + dark 真 render 做咗**(`render-check.mjs`)—— token 真 swap(`#f5f5f6`→`#08080a` · accent `#E60027`→`#ff3355`)· **`overflowsX: false` 兩個 theme** · **前後對照證咗 D6 個閘**(before 有 `Stop` 冇 `Hide`,after 有 `Stopped`+`Hide` 冇 `Stop`)· **真眼睇過兩張圖**唔淨係睇 innerText
- [x] **E4** `variant="ghost"`;核過成張 card **零 `variant="primary"`**

### F — Gate

- [x] **F1** root `npm test` **exit 0** —— api **1381 / 92**(基線 1362)· web **450 / 43**(基線 439),兩邊零紅
- [x] **F2** root `npm run build` **exit 0** · root `npm run lint` **exit 0** · api `tsc --noEmit` **exit 0**
- [x] **F3** `ADR-0040` **`Accepted`**(Chris 2026-08-17),`docs/adr/README.md` 同步

### G — Live(🚧 等部署 #10)

- [ ] **G1** DEV 兩個測試 run **真係唔再喺 request detail 出現**,而 `GET /agent/runs/:id` **仍然攞得返**(兩邊都要驗 —— 只驗一邊證唔到 D3)
- [ ] **G2** 收貨標準係**落 DB / 落 API 對數,唔係睇 HTTP 200**(§9 `A14` 先例)

---

## 7. 估算

🟢 **揀咗 B ⇒ 估 1–1.5 日**(schema + migration + api + web + test)。**ADR 寫咗 = `ADR-0040`,狀態 `Proposed`。**

原四個選項嘅估算保留做記錄:

| 選項 | 估算 | 要唔要 ADR |
|---|---|---|
| A | 0.5 日 + ADR | **要** |
| **B** ✅ | **1–1.5 日** | 寫咗(`ADR-0040`) |
| C | 0.75 日 + ADR | **要** |
| D | 0.25 日(或零) | 唔使 |

---

## 8. Open questions(要 Chris 答)

| # | 問題 | 狀態 |
|---|---|---|
| **OQ-1** | §4 揀邊個? | 🟢 **答咗(2026-08-17)= B(soft-hide)**,Chris 揀 |
| **OQ-2** | 隱藏一個 run 要唔要寫 `AuditLog`? | 🟢 **答咗 = 要**(`ADR-0040 D5`)。**論據唔係我發明** —— `audit-fields.ts:172-180` 講 `AGENT_KILL_SWITCH_SET` 嗰段逐字適用:「an admin control that … **leaves no record of who changed it** — which is the thing ADR-0009 exists to prevent」。順帶查證咗 `'AgentRun'` **一早喺 `AuditTargetType`**(`:200`)⇒ 只加一條 action,**唔動 target type、唔動 allow-list**(即係唔觸發 H4 嗰種「加一行係一個 privacy 決定」) |
| **OQ-3** | 用邊個 HTTP verb? | 🟢 **答咗 = `POST :id/hide`**(`ADR-0040 D2`),**唔用 `DELETE`** —— verb 應該講真相。➕ 加咗 `POST :id/unhide`(§4.2) |
| **OQ-4** | 要唔要順手修 §2.8 兩個 boundary 缺口? | 🟡 **一半**:`writersOf('agentRun')` **做**(`ADR-0040 D8` —— 本單自己新增 writer);`deleteMany` verb 嗰半**唔做**,已登 BACKLOG `agent-boundary-gaps` |
| **OQ-5** 🆕 | **`ADR-0040` 八條 D 批唔批?** | 🔴 **未答 —— 呢個就係開工閘**。尤其 §4.2 兩條(`unhide` · ADMIN-only)係我加嘅,唔喺選項 B 原文 |

---

**End of CH-031 spec v0.1(proposed)**
