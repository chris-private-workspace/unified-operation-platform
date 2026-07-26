# ADR-0015: Phase 1 sync gate 由「宣稱」升級為「平台證實」——排程 sync sweep

**Date**: 2026-07-26
**Status**: Proposed
**Approver**: Chris Lai

## Context

### 觸發

Chris 提出:「n8n onboarding 完成後,AD 用戶同步落 Azure 需要時間,而且時間唔確定,所以本項目需要有排程 / 服務定時檢查同更新 request 狀態,確認帳號 ready 先可以繼續 license assign。」

### 觸發嘅 hard constraint

**CLAUDE.md §5.1 H1** —— `azureSyncedAt` sync gate 係**明文列出嘅 locked 決策**。本 ADR 唔改 schema、唔加 dependency,**但改變 `azureSyncedAt` 呢個欄位嘅語意**,所以照樣觸發 H1。

> H2 **唔**觸發:`@nestjs/schedule` 已喺 locked stack(CLAUDE.md §5.2)且已喺 `package.json`;`ScheduleModule.forRoot()` 已喺 `app.module.ts:15` 註冊。

### 現況查證(2026-07-26)

| 查證 | 結果 | 依據 |
|---|---|---|
| 全 repo `@Cron` / `@Interval` / `@Timeout` 實作 | **零個** | grep |
| `ScheduleModule` 有冇註冊 | ✅ 有,而且註解**已預言本 ADR** | `app.module.ts:15` — `// enables @Cron (sync sweep + daily reconcile)` |
| `azureSyncedAt` 今日邊個寫 | 只有兩處 | `intake.service.ts:90`(n8n 推單時聲稱)· `assign.service.ts:52`(`markSynced`,人手 PATCH) |
| assign 真正靠咩 gate | `findUser(upn)` **真命中** | `assign.service.ts:99-109` |
| RISK R3 狀態 | ⚠️ **Open**「待 retry 實作」 | `RISK_REGISTER.md` |

### 問題陳述

今日兩個 `azureSyncedAt` 寫入來源**都係「宣稱」,冇一個向 Graph 證實過**:

- n8n 推單時帶嘅 timestamp = n8n 聲稱(DTO 註解本身已寫明「≠ Graph-visible (RISK R3)」)
- 操作員撳「Confirm sync」= 人手宣稱,`markSynced` 淨係喺本地 DB 寫個時間戳,**零 Graph 互動**

⇒ 真正嘅證實延遲到 assign 嗰刻先發生。實際工作流變成:**盲撳 confirm → 盲撳 assign → 撞 400 `Target user not found in Azure AD` → 唔知等幾耐 → 再試**。而 on-prem AD → Entra Connect 延遲時間本身唔確定,操作員冇任何依據決定幾時再試。

## Decision

加一個**排程 sync sweep**:定期向 Graph 查仲未過 gate 嘅 request,命中就自動開 gate。

### D1 — 語意升級(本 ADR 嘅核心,亦即 H1 觸發點)

`Request.azureSyncedAt` 嘅語意由

> 「n8n 聲稱 / 人手宣稱 AD→Entra 已同步」

升級為

> **「平台曾經喺 Graph 真命中過呢個 UPN」**(或 break-glass 人手覆寫,見 D3)

**Schema 零改動** —— 語意升級靠**寫入路徑收窄**達成,唔靠加欄。

### D2 — Sweep 行為

新 `SyncSweepService`(`apps/api/src/fulfilment/`),`@Cron` 掛住:

1. 揀單:`azureSyncedAt IS NULL` **且** `status ∈ {OPEN, IN_PROGRESS}` **且** 至少一個 line item 喺非終態(唔係 `ASSIGNED` / `CANCELLED`)——已經冇嘢等住 assign 嘅單唔掃。
2. 排序 `createdAt` 舊→新,每輪上限 **N 張**(D5)。
3. 每張 `graph.findUser(targetUpn)`:
   - **命中** → 完全複用 `markSynced` 嘅寫入語意:set `azureSyncedAt = now` + `accountCreatedAt ??= now` + 寫 `RequestEvent(SYNC)`。
   - **未命中(404)** → 咩都唔做,下輪再嚟。
   - **Graph 錯(auth / throttle / network)** → 見 D6。

### D3 — 人手 `PATCH /sync` 保留做 break-glass

**唔移除**。Graph 唔通、或者 Entra Connect 出事而要人手放行時,仲需要一條出路。但兩者要**分得出**:

`RequestEvent.message` 區分(**零 schema 改動**):

| 來源 | message |
|---|---|
| Sweep 證實 | `Phase 1 sync verified against Microsoft Graph (scheduled sweep)` |
| 人手 break-glass | `Phase 1 sync manually confirmed (not verified against Graph)` |

⇒ 人手嗰條**明文講出佢未經證實**,唔會扮成同 sweep 同等可信。既有 `markSynced` 嘅 message(`Phase 1 sync confirmed (azureSyncedAt set)`)按此更新。

### D4 — Audit

跟 `reconcile` 既有先例(`reconcile.service.ts:108-118`):`actorId` 有 = `user`,冇 = `'system'` + `metadata.source`。

- **每張**成功開 gate → `RequestEvent(SYNC)`(既有機制,per-request timeline 可見)
- **每輪**若有任何變動 → **一條** `AuditLog` summary(跟 `allocation.import` summary 先例,唔逐張寫),`actorType: 'system'`、`metadata: { source: 'sync-sweep', scanned, opened }`

### D5 — 節流與上限(env 可調,全部有 default)

| 項 | Default | Env |
|---|---|---|
| 排程間隔 | **10 分鐘** | `SYNC_SWEEP_CRON`(標準 cron 表達式) |
| 每輪上限 | **50 張** | `SYNC_SWEEP_BATCH` |
| 放棄 cutoff | **30 日**(超過 `createdAt + 30d` 唔再掃) | `SYNC_SWEEP_MAX_AGE_DAYS` |
| 總開關 | **啟用** | `SYNC_SWEEP_ENABLED=false` 可停 |

cutoff 存在嘅理由:一張永遠 sync 唔到嘅殭屍單(UPN 打錯 / 帳號已刪)否則會被無限掃到天荒地老。

### D6 — 失敗絕不 crash

Graph 出錯 → `logger.warn` + **中止本輪**(唔繼續打,避免 throttle 惡化),下輪再試。**絕不 throw 出 `@Cron` handler** —— unhandled rejection 會殺 Nest process(BUG-002 教訓)。

### D7 — 唔違反 ADR-0010「探針唔可以做成 @Cron」

ADR-0010 D5 連帶義務明文:connector 探針**只可用戶觸發,唔可以做成 `@Cron` 定時打**。本 ADR **唔抵觸**,因為兩者性質唔同:

| | ADR-0010 探針 | 本 ADR sync sweep |
|---|---|---|
| 動機 | 為咗畫 connector 綠燈 | 有真實 pending onboarding 等住 assign |
| 冇嘢做時 | 照打(所以先要禁) | **零 Graph call**(冇符合條件嘅 request 就唔查) |
| 天然節流 | 無 | 有 —— 流量正比於實際 onboarding 量 |

⇒ sweep 係 **domain-driven**,唔係 liveness polling。閒置時對 vendor 零流量。

## Alternatives Considered

- **Option A:唔做排程,改為 assign 失敗時自動 retry** — rejected。retry 綁喺人手撳 assign 呢個動作上,操作員仍然要自己估幾時再撳;而且 RISK R3 嘅本質係「唔知等幾耐」,retry 解唔到「幾時可以開始」。
- **Option B:n8n 側 sync 完再推第二次(update push)** — rejected。① 要改 LOCKED inbound 合約(W24 CONTRACT)② 把「Entra 幾時見到」嘅責任推畀 n8n,但 n8n 本身都係靠估 ③ 平台仍然要 `findUser` 證實,等於做兩次。
- **Option C:Graph change notification / webhook 訂閱** — rejected(**現階段**)。技術上最乾淨(push 而非 poll),但要 ① 公開 HTTPS notification endpoint ② 訂閱續期排程 ③ validation token 握手 ④ 新 Graph 權限。等於為咗一個 10 分鐘輪詢解決得到嘅問題,引入一整套新 infra。**保留為升級路徑**:若將來 onboarding 量大到輪詢唔夠快,再開新 ADR。
- **Option D:每次開 request 列表時 lazy 檢查** — rejected。把 vendor call 綁喺 UI 讀取路徑上,列表會變慢,而且冇人睇個頁面就永遠唔會 sync(最需要自動化嘅夜間 / 週末反而唔會跑)。
- **Chosen:排程 sweep(D1-D7)** — 因為架構早已預留(`app.module.ts:15` 註解 + `docs/architecture.md §3` 明列 `@Cron(sync poll)`),零新 dependency、零 schema 改動,而且係唯一一個「無人睇住都會自己推進」嘅方案。

## Consequences

- **Positive**
  - RISK R3 由 ⚠️ Open 轉向可 mitigate —— 平台自己收斂等待,操作員唔使估。
  - `azureSyncedAt` 首次成為**有證據支持**嘅欄位;`RequestEvent` timeline 顯示「幾時真係 sync 到」,呢個時間差本身係營運數據(可以答「Entra Connect 實際延遲幾耐」)。
  - 打通全 repo 第一個 `@Cron`,為 deferred 咗好耐嘅 **OD1 daily reconcile** 鋪路(同一個 pattern)。
  - assign 嘅 `findUser` gate **一個字都唔改** —— sweep 只係提早做同一個查詢,唔係取代 gate。

- **Negative**
  - 多咗一條**唔係人觸發**嘅 Graph 流量。閒置時為零,但 onboarding 高峰期會叠加喺人手操作之上,throttle 風險上升(D5 上限 + D6 中止本輪係緩解)。
  - 排程 job 喺**多實例部署**下會重複跑(ACA 若 scale out > 1)。**目前 UAT 單實例,唔構成問題**;若將來 scale out,需要 leader election 或者 job lock —— 屆時 BullMQ(已喺 locked stack 但未 wired)係自然去處。**本 ADR 唔預先解決呢個**(YAGNI),但明文記低。
  - 人手 confirm 同 sweep 證實兩條路並存,`message` 分辨得到但**唔係結構化欄位**,將來若要 query「邊啲單係人手放行」就要 string match。接受 —— 換取零 schema 改動。

- **Neutral**
  - `markSynced` 既有 endpoint / 權限 / OpCo scope 全部不變。
  - 對 n8n inbound 合約零影響:n8n 照舊可以傳 `azureSyncedAt`(仍然被接受,仍然只係聲稱);sweep 只處理**冇值**嗰啲。

## References

- 觸發:Chris 2026-07-26 提出「問題 2」(排程檢查 sync 狀態)
- Locked 決策:`CLAUDE.md §5.1 H1`(`azureSyncedAt` sync gate)
- 架構預留:`apps/api/src/app.module.ts:15` · `docs/architecture.md §3`
- 現況落差:`docs/02-architecture/SYSTEM-SPEC-AND-SOW.md` §A1(排程 / 背景佇列零實作)
- Risk:`docs/01-planning/RISK_REGISTER.md` **R3**
- 實作參考:`assign.service.ts:40-64`(`markSynced` 語意)· `reconcile.service.ts:108-118`(@Cron audit pattern)
- 相關 ADR:**ADR-0010**(D5 探針禁 `@Cron` —— D7 說明點解唔抵觸)· **ADR-0009**(audit 契約)· **ADR-0008**(inbound 合約)
- 姊妹 ADR:**ADR-0016**(OpCo 預算 gate)—— 同屬 assign 前置條件,但正交
