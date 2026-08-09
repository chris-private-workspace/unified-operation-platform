# ADR-0029: Assign 回傳每步結果(step results),唔拆 atomic call

**Date**: 2026-08-09
**Status**: **Proposed**(待 Chris 拍板 approve;方案已由 Chris 2026-08-09 選定)
**Approver**: Chris Lai

> **擴充,唔推翻**:ADR-0016(OpCo budget gate)· ADR-0017(三個接縫)· ADR-0011(outbound 失敗佇列)嘅決策一個字唔改。本 ADR 只改**呢啲 gate 嘅結果點樣講畀 caller 聽**。

## Context

**用戶要求(Chris,2026-08-09)**:assign 撳落去之後要**顯示過程**,令操作人員知道行到邊、邊一步失敗。

**呢個唔係新需求 —— mockup 一早設計咗。** `design_handoff_licenseops/prototype/IT Ops Platform.dc.html:1444-1450` 有完整五步:

| key | label | endpoint |
|---|---|---|
| `precheck` | Pre-flight — seat availability | `GET /subscribedSkus` |
| `sync` | Verify Azure AD sync state | `GET /users/{upn}` |
| `assign` | Assign license via Microsoft Graph | `POST /users/{id}/assignLicense` |
| `ledger` | Reconcile OpCo ledger | `PATCH /ledger/{opco}` |
| `history` | Write operational history | `POST /events` |

另加 **7 個失敗場景**(`SCENARIOS`,line 1347-1355):`no_seats` / `sync_race` / `throttled` / `unavailable` / `usage_location` / `ledger_conflict` / `success`。

**而現況**:`request-detail.tsx:763-772` 一個 `assign.mutate()` → 一個 toast。中途乜都睇唔到。

### 🔴 難處喺後端,唔喺前端

`POST /requests/:id/line-items/:lid/assign` 係**一個 atomic call**,`assign.service.ts` 由頭到尾做齊七件事先返一個結果:

| # | 檢查 | 位置 |
|---|---|---|
| 1 | stage = READY | `:129` |
| 2 | `azureSyncedAt`(gate ①) | `:135` |
| 3 | `serviceNowUserSyncedAt`(gate ②,ADR-0025 D5) | `:155` |
| 4 | Graph `findUser` | `:164` |
| 5 | `usageLocation` | `:174` |
| 6 | OpCo budget(ADR-0016) | `:188-222` |
| 7 | live tenant seat | `:229-235` |
| — | 真派 licence → ledger transaction → SN 回寫 | `:240+` |

前端要顯示過程,就要 API 講得出**每一步**發生咗咩。今日佢只講得出「成功」或者「一句 400」。

⚠️ **觸發 CLAUDE.md §5 H1**(改 API 契約形狀)⇒ 本 ADR + owner 拍板,先落 code。

### 🔴 mockup 同實際對唔齊 —— 落實前必須先對

| mockup | 實際 |
|---|---|
| `precheck` 講 `availableUnits … **in this OpCo**`,把 seat 同 budget **合併成一步** | **兩層兩道 gate**:OpCo ledger(`:188`)同 tenant seat(`:229`),而且 **budget 喺 seat 之前** |
| 五步 | 七道閘 + 三個副作用 |
| `history` 獨立一步 | timeline / audit 喺同一個 transaction 入面 |

2026-08-07 實測正正撞咗 tenant 嗰層(`POWER_BI_PRO` `prepaidEnabled=0`),而 OpCo budget 果然係綠嘅(`80/90`)—— **兩層合併就講唔出係邊層擋住**,而兩層嘅下一步完全唔同(叫採購買 vs 加 allocation)。

⇒ **mockup 五步唔可以照抄**,要重新對照實際七道閘。

## Decision

**D1 —— 回傳每步結果,維持一個 atomic call。**

`POST …/assign` 由「返 line item 或者掟一句 400」改成**永遠返一個 step 陣列**:

```jsonc
// 成功
200 {
  "outcome": "assigned",
  "steps": [
    { "key": "precheck", "status": "ok",      "detail": "seats 12 free of 200" },
    { "key": "sync",     "status": "ok",      "detail": "verified in Graph" },
    { "key": "assign",   "status": "ok",      "detail": "202 Accepted" },
    { "key": "ledger",   "status": "ok",      "detail": "assigned 4 -> 5" },
    { "key": "ticket",   "status": "skipped", "detail": "no RITM on this line" }
  ]
}

// 被擋
400 {
  "outcome": "blocked",
  "failedAt": "precheck",
  "steps": [
    { "key": "precheck", "status": "failed", "detail": "tenant has 0 seats",
      "retryable": false, "whoFixes": "procurement" }
  ]
}
```

**D2 —— `retryable` + `whoFixes` 係本 ADR 嘅重點,唔係裝飾。**

操作人員睇完之後要知道**下一步做乜**,而呢件事今日完全靠人自己記:

| 失敗 | `retryable` | `whoFixes` |
|---|---|---|
| tenant 冇 seat | `false` | `procurement` |
| OpCo budget 爆 | `false` | `admin`(加 allocation 或 override) |
| gate ① 未過 | `true` | `wait`(Entra Connect) |
| gate ② 未過 | `true` | `wait`(SN user import) |
| 冇 `usageLocation` | `false` | `entra-admin` |
| Graph 429 / 503 | `true` | `wait` |

**D3 —— 唔拆 transaction,唔加串流。**

外部副作用(真派 licence)同 ledger 寫入維持喺**同一個 call** 入面。

**D4 —— 失敗一樣返完整 steps,唔止返失敗嗰步。**

已經過咗嘅步驟要顯示做 `ok`,咁操作人員先睇得出「行到第幾步先撞牆」。

**D5 —— `ticket` 步(SN 回寫)status 可以係 `skipped`。**

`assign.service.ts:341-363`:line item 冇 RITM 就 fallback 去 parent REQ 加 work note,唔關任何嘢。**呢個分別今日喺 UI 完全睇唔到**,而佢正正係 W44 F7-12 追緊嗰個問題。

**D6 —— step 定義同實際 gate 一一對應,唔跟 mockup 五步。**

初版七個 key:`stage` · `sync-azure` · `sync-servicenow` · `directory` · `usage-location` · `budget` · `seats`,加副作用三個:`assign` · `ledger` · `ticket`。**最終清單喺 W45 plan 定死**,本 ADR 只 lock「一步一 gate,唔合併」呢條原則。

## Alternatives Considered

**A1 — 分步 endpoint(前端逐步 call)**
`POST .../assign/precheck` → `/verify` → `/execute` → `/commit`。真過程、即時可見。
🔴 **否決**:要拆開現有 atomic transaction。`execute` 成功但 `commit` 前斷線 = **licence 已派、ledger 冇加 = DRIFT**,而 mockup 自己個 `ledger_conflict` 場景正正就係描述呢個災難。用一個「顯示過程」嘅需求去製造一個真嘅資料完整性風險,唔值。

**A2 — SSE 進度串流**
一個 call 保持 atomic,邊做邊推。過程即時可見**而且**唔使拆 transaction —— 技術上最貼原始需求。
🔴 **否決(暫時)**:要 NestJS + web nginx(`proxy_buffering off`)+ ACA ingress 三層配合,而我哋 **2026-08-06 先第一次部署上 DEV**,ingress 行為仲未摸熟。前端亦要由 `useMutation` 改 `EventSource`。⇒ **成本喺基建唔喺功能**,而 D1 已經滿足「知道邊步失敗、下一步做乜」。
💡 **D1 唔封死 A2**:step 定義一旦 lock,將來加串流只係換 transport,steps 契約不變。

**A3 — 咩都唔做,只改善錯誤訊息**
最平。
🔴 **否決**:講唔出「行到第幾步」,亦答唔到 D2 個「邊個去修」。而且 2026-08-07 個 `No available seats` 已經示範咗單句訊息嘅極限 —— **佢把「tenant 冇買」同「seat 用晒」寫成同一句**,兩者下一步完全唔同。

## Consequences

### 🟢 正面

- 操作人員睇得出行到邊、邊步失敗、**下一步搵邊個**(D2)
- `ticket: skipped` 令 F7-12 嗰個「有冇真係關到 RITM」由推理變成畫面上一行字
- 錯誤分類集中一個地方,唔再散落七個 `throw new BadRequestException`
- steps 契約穩定 ⇒ 將來要 SSE 只換 transport

### ⚠️ 代價 / 風險

- 🔴 **API 契約改變**:`POST …/assign` 成功回應由 line item 變成 `{outcome, steps}`。前端係唯一 caller(查證:`mutations.ts` 一處),但 **OpenAPI 契約變咗**,任何外部消費者要跟。
- 🔴 **400 body 形狀變咗**:今日前端 `onError` 直接讀 `message`。改完要同時處理兩種形狀,否則**錯誤訊息會變空白** —— 呢個係典型「紅得靜」失敗。
- ⚠️ **既有 test 會大批要改**:`assign.service.spec.ts` 大量 assert exception message。改契約唔可以順手改晒 assert 就當過 —— **H5 critical path**,每個 gate 都要有對應嘅 step assertion。
- ⚠️ **step `detail` 有機會夾帶 PII**:`sync` / `directory` 兩步嘅底層 vendor error 可能含 UPN(BUG-004 同一形狀)。⇒ `detail` **必須經 `scrubPii`**,而且要有 test 守住。
- ⚠️ 唔係即時進度 —— 撳落去仍然係等,做完先見到 breakdown。已知取捨(A2)。

## References

- `design_handoff_licenseops/prototype/IT Ops Platform.dc.html:1343-1355, 1443-1452`(mockup 五步 + 七場景)
- `apps/api/src/fulfilment/assign.service.ts:129-235`(七道閘)· `:338-363`(SN 回寫兩條路)
- `apps/web/src/pages/request-detail.tsx:763-772`(現況一個 toast)
- ADR-0016(OpCo budget gate)· ADR-0017 D2(assign outcome 語意)· ADR-0025 D5(gate ②)· ADR-0011(失敗佇列)
- BUG-004(vendor error 洩 UPN)· CLAUDE.md §5 H1 / H5
- W44 `checklist.md` F7-12 · BACKLOG `ASSIGN-PROGRESS`
