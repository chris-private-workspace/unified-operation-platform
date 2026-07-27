---
phase: W37-sync-sweep
name: "排程 sync sweep —— `azureSyncedAt` 由「宣稱」升級為「平台證實」(ADR-0015 落地)"
sprint_week: W37
start_date: 2026-07-27
end_date: 2026-07-29          # planned, may slip with changelog log
status: closed                # draft | active | closed —— approved + closed 2026-07-27(OQ1=A · OQ2=B · OQ3=A)
spec_refs:
  - ADR-0015(**Accepted 2026-07-26** — 本 phase 就係佢嘅落地;Decision D1-D7 = 實作規格)
  - ADR-0009(AuditLog 契約 · **白名單 = 唯一 enforcement point**)
  - ADR-0010 D5(探針禁 `@Cron` —— ADR-0015 D7 已論證唔抵觸)
  - ADR-0008 / W24 `CONTRACT.md`(inbound 合約 **LOCKED**,本 phase 零影響)
  - RISK **R3**(本 phase 就係佢嘅 mitigation)
prior_phase: W36-opco-budget-gate
---

# Phase W37 — 排程 sync sweep

> **Plan version**:1.1(**active** — approved;**OQ1 = A · OQ2 = B · OQ3 = A**)
> **Owner**:AI(執行)· 決策 = Chris Lai
> **Approved by**:**Chris Lai**(2026-07-27)
> **Branch**:`docs/w37-sync-sweep`,**off `docs/w36-budget-gate`**(見 §7)

## 1. Scope

**ADR-0015 已 Accepted**(2026-07-26),H1 已解鎖,本 phase 純落地。要做嘅係:加一個 `@Cron` 驅動嘅 `SyncSweepService`,定期向 Graph `findUser` 證實仲未過 gate 嘅 request,命中就自動開 gate(`azureSyncedAt` + `RequestEvent(SYNC)`),並把人手 `PATCH /sync` 嘅 message 改成明文自認「未經證實」。

**🔴 唔做(硬邊界,寫死喺此)**:
- **`assign.service.ts` 嘅 `findUser` gate 一個字都唔改** —— sweep 只係**提早**做同一個查詢,唔係取代 gate(ADR-0015 Consequences 明文)。
- **零 schema 改動** —— 語意升級靠寫入路徑收窄,唔靠加欄(D1)。若發現要改 → **STOP** 問 owner。
- **唔移除**人手 `PATCH /sync`(D3 break-glass)。佢嘅權限 / OpCo scope / endpoint 全部不變。
- **唔碰 inbound 合約** —— n8n 照舊可以傳 `azureSyncedAt`(仍然只係聲稱);sweep 只處理**冇值**嗰啲(D-Neutral)。
- **唔做** Graph change notification / webhook(Option C,明文保留為將來升級路徑)。
- **唔做** 多實例 leader election / job lock(ADR-0015 明文 YAGNI,只記低)。
- **唔順手做** OD1 daily reconcile —— ADR 講咗本 phase「為佢鋪路」,唔係「順手做埋」(H3)。

## 2. Grounding(2026-07-27 dev DB 實查)

按 D2 揀單規則逐條落 SQL 實跑:

| | 數 |
|---|---|
| `Request` 總數 | **7** |
| `azureSyncedAt IS NULL` | **2** |
| 上者 **且** `status ∈ {OPEN, IN_PROGRESS}` | **2** |
| ⇒ 再加「至少一個非終態 line item」+ 30 日 cutoff ⇒ **真正會被掃** | **0** |

兩張候選單**都冇任何非終態 line item**(0 pending lines,age 17 日)⇒ 按 D2 正確排除。

**呢個 grounding 有兩個直接後果,唔可以當佢淨係一個數字**:

1. ✅ **D7「閒置時對 vendor 零流量」喺 dev 係字面可證** —— 上線後喺 dev 跑,Graph call 應該係 **0**。呢個會做成 F4 一條 live 驗證(**證負面**:sweep 跑咗但 Graph 零 call)。
2. 🔴 **命中路徑喺 dev 冇天然素材** —— 要驗「findUser 命中 → 開 gate」就必須**造數據**:一張 `azureSyncedAt IS NULL` + 有非終態 line item + **UPN 真係喺 tenant 搵得到**嘅 request。見 §5 OQ2。

## 3. Deliverables

### F1 — `SyncSweepService`(核心)
- **Spec ref**:ADR-0015 **D2**(行為)· **D5**(節流)· **D6**(失敗處理)
- **內容**:
  - 新 `apps/api/src/fulfilment/sync-sweep.service.ts`,注入 `PrismaService` / `GraphService` / `AuditService`(三者都已喺 `FulfilmentModule` 可達,**零 module 改動**除咗 provider 註冊)。
  - 揀單(D2):`azureSyncedAt IS NULL` **且** `status ∈ {OPEN, IN_PROGRESS}` **且** 至少一個 line item 唔喺 `{ASSIGNED, CANCELLED}` **且** `createdAt > now - maxAgeDays`;`createdAt` 舊→新;`take = batch`。
  - 逐張 `graph.findUser(targetUpn)`:
    - **命中** → `azureSyncedAt = now` + `accountCreatedAt ??= now` + `RequestEvent(SYNC)`,**同一個 `$transaction`**。
    - **未命中(null)** → 咩都唔做。
    - **throw** → D6:`logger.warn` + **中止本輪**,絕不 rethrow 出 handler。
  - **H4**:全程唔 log `targetUpn`(只 id + 計數)。
- **Acceptance criteria**:
  - 冇符合條件嘅 request → **`findUser` 零 call**(證 D7,唔止證「冇 crash」)
  - 命中 → `azureSyncedAt` 有值 · `accountCreatedAt` 只喺原本為 null 時先填 · `RequestEvent(SYNC)` 一條
  - 未命中 → **DB 零寫入**(同一張單下輪仍然入選)
  - `findUser` throw → 本輪**中止**(後面嗰張唔會再打 Graph)· 方法**唔 throw** · DB 零寫入
  - 超過 cutoff / 冇非終態 line item / 已有 `azureSyncedAt` / `status = COMPLETED|CANCELLED` → **唔入選**
- **Effort estimate**:3h

### F2 — 排程掛接 + 開關(D5)
- **Spec ref**:ADR-0015 **D5**
- **內容**:`@Cron` 掛住 sweep;`SYNC_SWEEP_ENABLED` / `SYNC_SWEEP_BATCH` / `SYNC_SWEEP_MAX_AGE_DAYS` 經 `ConfigService.get` 讀(**有 default,唔用 `getOrThrow`** —— 跟 `jwt-auth.guard.ts:50` 既有 optional-env 先例)。`.env.example` 同步。
- **⚠️ 見 §5 OQ1** —— `SYNC_SWEEP_CRON`(env 可調 cron 表達式)**做唔到零成本**,要 owner 揀形狀。
- **Acceptance criteria**:
  - `SYNC_SWEEP_ENABLED=false` → handler 即刻返回,**`findUser` 零 call**、DB 零讀
  - batch / maxAge 真係影響 query(test 用不同值 assert `take` / `createdAt` filter)
  - `.env.example` 有齊新 key + 註明 default
- **Effort estimate**:1h

### F3 — 人手 confirm 明文降級(D3)
- **Spec ref**:ADR-0015 **D3**
- **內容**:`markSynced` 嘅 `RequestEvent.message` 由 `Phase 1 sync confirmed (azureSyncedAt set)` 改成 **`Phase 1 sync manually confirmed (not verified against Graph)`**;sweep 用 **`Phase 1 sync verified against Microsoft Graph (scheduled sweep)`**。
- **理由(要寫入 code 註釋)**:兩條路並存,timeline 上必須睇得出邊條係有證據、邊條係人手宣稱 —— 否則 D1 嘅語意升級喺 UI 上等於冇發生。
- **Acceptance criteria**:兩條 message 各自有 test 鎖住字串;`markSynced` 其餘行為(權限 / OpCo scope / 回傳)**零改動**
- **Effort estimate**:0.5h

### F4 — Test(H5 critical path)
- **Spec ref**:CLAUDE.md §5.5 **H5** —— sync gate 係明列嘅 critical path;§3.4 Graph 一律 mock
- **內容**:`sync-sweep.service.spec.ts` 全新;`assign.service.spec.ts` 補 message 斷言。
- **Acceptance criteria**:
  - 上面 F1/F2/F3 每條 acceptance 各有對應 test
  - **兩條「證負面」test**:① 冇候選 → `findUser` **零 call** ② 第一張 throw → 第二張 **零 call**(證真係中止,唔係吞咗繼續)
  - Graph 全 mock,零真 tenant
  - api test ≥ **410**(現行基線);`npm run lint` 零 output
- **Effort estimate**:2.5h

### F5 — Audit(D4)【⚠️ **見 §5 OQ3 —— D4 同白名單唔兼容,同 W36 D6 同一類**】
- **Spec ref**:ADR-0015 **D4** · ADR-0009 Decision 5
- **內容**:每輪若有變動 → **一條** `AuditLog` summary(跟 `allocation.import` 先例,唔逐張寫),`actorType: 'system'`。
- **Acceptance criteria**:
  - 有變動 → **一條** audit(唔係每張一條);零變動 → **零** audit
  - **captured payload 過真嘅 `pickAuditFields` / `pickAuditMetadata` 唔被丟棄**(W36 立嘅回歸網做法)
  - 寫入同 sweep 嘅 DB 改動**同一個 transaction**(ADR-0009 D8.1)
- **Effort estimate**:1h(擴白名單 0.5h + test 0.5h)

### F6 — 文檔同步
- **內容**:`RISK_REGISTER` **R3** ⚠️ Open → 🟡 Mitigating(**實作 + 驗證之後先改**,唔可以寫咗 code 就改)· `SYSTEM-SPEC-AND-SOW.md §A1`(「排程 / 背景佇列零實作」變 stale)· `docs/architecture.md §3`(`@Cron` 由預留變實作)· BACKLOG(R7)。
- **Effort estimate**:1h

## 4. Acceptance(phase 級)

- [x] F1-F6 各自 acceptance 全過
- [x] api test **429 / 42 suites**(≥ 410 ✅);lint 零 output
- [x] 🔴 **`assign.service.ts` diff = 1 import + 1 段註釋 + 1 行 message**;`assignLineItem` 嘅 `findUser` gate 一個字冇動
- [x] **零 schema 改動**(diff 0)· **零新 dependency**(三個 `package.json` diff 0)
- [x] **live 驗證**:① D7 改由 unit test + live 對照組共同證明(**原本寫法 live 觀察唔到** —— sweep 閒置刻意靜默,見 progress Day 2)② **命中路徑真 Graph 驗到**,連對照組 ③ kill switch A/B
- [x] ADR-0015 D1-D7 逐條核對 —— **五條相符,D4 / D5 兩條偏離**,兩條都係起草/開工前發現、owner 批、入 changelog

## 5. Open Questions(🔴 **兩條都要 owner 答先開工**)

### OQ1 — `SYNC_SWEEP_CRON`(env 可調排程間隔)點做?

D5 列咗 `SYNC_SWEEP_CRON`(標準 cron 表達式,default 10 分鐘)。但 **`@Cron(...)` 嘅參數喺 class 定義時求值,早過 DI**,所以「由 `ConfigService` 讀」做唔到。逐字查證後只有四條路:

| | 做法 | 代價 |
|---|---|---|
| **A(建議)** | `@Cron(CronExpression.EVERY_10_MINUTES)` **寫死**;保留 `SYNC_SWEEP_ENABLED` 做總開關,**放棄** `SYNC_SWEEP_CRON` | 零新 dep、零 cleverness、最少 code。代價 = 改間隔要改 code + 重新部署。**但真正嘅營運急救手段係「熄咗佢」,而唔係「調快啲」** —— 開關保住咗 |
| B | `@Interval` 每 1 分鐘 tick,handler 用 in-memory `lastRunAt` 自我節流到 `SYNC_SWEEP_INTERVAL_MINUTES` | 保住 env 可調、零新 dep、無 `process.env`。代價 = 多一層自製節流邏輯(每分鐘一次純記憶體比較,零 DB / 零 Graph);語意由 cron 表達式變「每 N 分鐘」 |
| C | `SchedulerRegistry.addCronJob()` 動態註冊 | **要 `import { CronJob } from 'cron'`**。`cron` 目前**只係 `@nestjs/schedule` 嘅 transitive dep,未 declare 喺任何 `package.json`**。要用就應該明文 declare ⇒ **H2 觸發,要 owner 批 + ADR** |
| D | `@Cron(process.env.SYNC_SWEEP_CRON ?? '...')` | **違反 §3.1**(「唔直接讀 `process.env`」)。不建議 |

**我建議 A。** 理由:D5 四個旋鈕入面,`ENABLED` 係唯一一個真係會喺半夜被人用嘅(Graph 出事 → 熄);間隔可調係「聽落好」但冇實際 driver,而為咗佢引入 H2(C)或者自製節流(B)都唔值。若 owner 要保住可調 → 揀 **B**(仍然零 H2)。

> ⚠️ 呢個係**偏離 ADR-0015 D5** 嘅明文清單(`SYNC_SWEEP_CRON` 會消失),所以要 owner 拍板 + 入 changelog。

### OQ2 — 命中路徑點 live 驗?(dev 冇天然素材)

§2 grounding 顯示 dev **would_be_swept = 0**。要驗「findUser 命中 → 開 gate」就要一張 UPN **真係喺 tenant 搵得到**嘅 request。

| | 做法 | 風險評估 |
|---|---|---|
| **A(建議)** | **只靠 mock test 驗命中路徑**;live 只驗**負面**(dev 現況跑一輪 → Graph 零 call、DB 零寫入)+ `ENABLED=false` 短路 | 零 tenant 接觸、零造數據。代價 = 「真 Graph 真命中」呢一步留到 UAT,寫入 runbook 做部署後檢查(**同 W36 一樣嘅交接做法**) |
| B | 喺 dev 造一張 request,`targetUpn` 用**一個真實存在嘅 tenant 帳號**,跑一輪,驗完刪 | `findUser` 係 **read-only**,而且 sweep **只寫本地 DB**(唔似 W36 下一步係真 assign)⇒ **實質風險遠低過 W36 嗰個**。但仍然係「攞一個真人 UPN 落 dev DB」,H4 要小心(造完即刪、唔入 commit、唔入 log) |
| C | 喺 scratch DB 造,連 Graph 都用 stub | 等於 mock test,冇額外價值 |

**我建議 A**,但 **B 唔係唔可以** —— 同 W36 R6 唔同級:嗰次「gate 有 bug = 真派 licence 畀真人」,今次「sweep 有 bug = 本地 DB 多咗個 timestamp」。若 owner 想見到真命中,我可以做 B(用你指定嘅一個帳號,造完即刪並貼還原證據)。

### OQ3 — 🔴 D4 同 ADR-0009 白名單唔兼容,要唔要擴白名單?

**呢個同 W36 D6 係一模一樣嘅問題,但今次喺開工前就發現咗**(W36 係實作到一半先撞到)。逐字核對 `audit-fields.ts` 之後,D4 三個假設全部唔成立:

| D4 寫 | 實情 |
|---|---|
| 寫一條 `AuditLog` summary | ❌ `AUDIT_ACTIONS` **冇任何** sync / sweep 相關 action |
| target = ? (D4 冇講) | ❌ `AuditTargetType` 冇 `Request`,亦冇任何 batch 類型可以借 |
| `metadata: { source, scanned, opened }` | ⚠️ `source` **有**白名單 ✅,但 `scanned` / `opened` **冇** ⇒ 會被 `pickAuditMetadata` **靜靜丟棄** |

⇒ 照 D4 字面寫,結果係 **audit 只留低 `source: 'sync-sweep'`,兩個計數無聲消失**。

| | 做法 | 代價 |
|---|---|---|
| **A(建議)** | 擴白名單,**跟 `allocation.import` 先例**:`AUDIT_ACTIONS` 加 `SYNC_SWEEP: 'sync.sweep'` · `AuditTargetType` 加 `'SyncSweep'`,欄位白名單 `['scanned','opened']`(計數放 **`after`**,唔放 metadata —— `AllocationImport` 就係咁做)· `targetId: 'bulk'`(同 `allocation.import` 一致)· `metadata: { source: 'sync-sweep' }`(`source` 已白名單,零改動) | 掂 **ADR-0009 Decision 5**(檔頭明文「adding a line here is a **privacy decision**」)⇒ **要你批**。但兩個新欄位**都係整數計數**,零 PII |
| B | 唔寫 `AuditLog`,只靠**每張**嘅 `RequestEvent(SYNC)` | 違 D4 明文。而且「呢輪掃咗幾多、開咗幾多」呢個**營運視角**冇咗 —— 但要留意:`RequestEvent` 已經記低咗每一張,所以損失冇 W36 嗰次咁大 |
| C | 把計數塞入 `source` 字串 | 零白名單改動,但數字**查唔到**、污染 `source` 語意。**不建議** |

**我建議 A**,理由同 W36:計數放喺 `after` 而唔係 metadata,係跟足 `allocation.import` 已立嘅 summary 先例,唔係新發明。

> 📌 **兩次都撞同一個坑,呢個係機制問題唔係偶然。** 建議 phase 完之後把「引用 ADR-0009 audit 契約時必須逐字核對 `audit-fields.ts` 三個常數」加入 ADR 模板或 `anti-patterns` skill —— 已入 §6 R3 + 留待 closeout 提。

## 6. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| **R1** | 🔴 **`@Cron` handler throw → unhandled rejection → Nest process 死**(BUG-002 同款) | Med(Graph 隨時可以 throw) | **High** | D6 明文:整個 handler 包 try/catch,**絕不 rethrow**;F4 有一條 test 專門 assert 方法唔 throw + 中止本輪 |
| **R2** | Graph throttle —— sweep 疊喺人手操作之上 | Med | Med | D5 batch 上限 50 + D6 出錯即中止本輪;D7 天然節流(閒置零流量,§2 已實證 dev = 0) |
| **R3** | 🔴 **審計寫入被白名單靜靜丟棄**(= W36 D6 同一類問題,見 OQ 段) | **High**(已查證成立) | Med | F5 未擴白名單前**唔可以當 audit 做咗**;test 必須把**真嘅** `pickAuditFields` 拉入 assertion(W36 已立呢條先例) |
| R4 | 多實例部署重複跑 | Low(UAT 單實例) | Low | ADR 明文 YAGNI;**唔預先解**,只喺 runbook / ADR 記低。⚠️ **唔可以順手加 lock**(H3) |
| R5 | 造 live 素材時把真人 UPN 留咗喺 dev DB / commit / log | Low | **High**(H4) | 若揀 OQ2-B:造完即刪 + 貼還原證據 + 全程唔 log UPN + 唔入任何 commit |
| R6 | 「順手做埋 daily reconcile」(ADR 提到本 phase 為佢鋪路) | Med(誘惑大) | Med | §1 硬邊界明文列出;鋪路 ≠ 做埋(H3) |

## 7. Dependencies

- **ADR-0015 Accepted** ✅(2026-07-26)—— H1 已解鎖
- **零新 dependency**(H2 不觸發 —— `@nestjs/schedule` 已喺 locked stack 且已裝)⚠️ **除非 OQ1 揀 C**
- **零 schema 改動**(H1 唔再觸發)
- **Branch stacking**:本 branch off `docs/w36-budget-gate`(PR #30),因為 F3 改 `assign.service.ts`、F5 改 `audit-fields.ts`,**兩個檔 W36 都改過而未 merge**。#29 → #30 merge 之後 rebase 落 main。

## 8. Plan Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-27 | Initial draft(**draft**) | ADR-0015 Accepted 後開 phase;grounding 實跑 D2 揀單 SQL 得 **0 張**,順帶令 D7「閒置零流量」變成可驗證嘅 acceptance;起草時逐字核對 `audit-fields.ts`,**開工前**就發現 D4 同白名單唔兼容(W36 係實作到一半先發現) | — |
| 2026-07-27 | `draft → active`;**OQ1 = A · OQ2 = B · OQ3 = A** | Chris 拍板 | **Chris Lai** |
| 2026-07-27 | 🔴 **偏離 ADR-0015 D5**(owner approved,OQ1=A):**放棄 `SYNC_SWEEP_CRON`**,排程間隔 `@Cron(CronExpression.EVERY_10_MINUTES)` **寫死**;保留 `SYNC_SWEEP_ENABLED` / `_BATCH` / `_MAX_AGE_DAYS` | `@Cron(...)` 參數喺 class 定義時求值,早過 DI ⇒ 讀唔到 `ConfigService`。動態註冊要 `import { CronJob } from 'cron'`,而 `cron` 只係 transitive dep 未 declare ⇒ 明文 declare 就係 **H2 觸發**。四個旋鈕入面只有 `ENABLED` 有真實營運 driver(Graph 出事要熄),為間隔可調而引入 H2 唔值 | **Chris Lai** |
| 2026-07-27 | 🔴 **偏離 ADR-0015 D4**(owner approved,OQ3=A):擴 ADR-0009 白名單 —— `AUDIT_ACTIONS` 加 `SYNC_SWEEP: 'sync.sweep'` · `AuditTargetType` 加 `'SyncSweep'`(欄位白名單 `['scanned','opened']`)· 計數放 **`after`** 而唔係 `metadata` | D4 三個假設逐字核對後全部唔成立(冇 sync action / 冇合適 target / `scanned`·`opened` 唔喺 metadata 白名單)⇒ 照字面寫,兩個計數會被 `pickAuditMetadata` **靜靜丟棄**。計數放 `after` 係跟足 `allocation.import` 已立嘅 summary 先例(`targetId: 'bulk'`),唔係新發明。掂 **ADR-0009 Decision 5** ⇒ 已 STOP 取得批准;兩個新欄位**都係整數,零 PII** | **Chris Lai** |
| 2026-07-27 | **OQ2 = B**:命中路徑用真 UPN 喺 dev 造數據驗,驗完即刪 | dev `would_be_swept = 0`,冇天然素材。風險同 W36 R6 **唔同級**:`findUser` 係 read-only 且 sweep **只寫本地 DB**,bug 嘅後果係「本地多咗個 timestamp」而唔係「真派 licence 畀真人」。⚠️ **H4 連帶義務**:造完即刪 + 貼還原證據 + 全程唔 log UPN + 唔入任何 commit | **Chris Lai** |

---

**Gate reminder**:status `draft` → **Chris approve + 答 OQ1 / OQ2 先可以 `active` 並開始 code**(PROCESS R1)。
