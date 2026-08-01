---
change_id: CH-015
title: "Request 層 on-demand Azure 帳號 sync 檢查"
status: approved        # draft | proposed | approved | active | done | cancelled
created: 2026-08-01
target_completion: 2026-08-02
affects_components: [fulfilment, integration/graph, apps/web]
spec_refs:
  - ADR-0015(sync gate scheduled sweep — 本 CH 直接建基於佢嘅 D1 語意)
  - ADR-0017 D0(n8n execution seams — 驗證路徑唔准經 n8n)
  - CLAUDE.md §5.1 H1(`azureSyncedAt` sync gate = locked 決策)
  - docs/02-architecture/licenseops/DESIGN.md(Phase 1 sync gate)
---

# CH-015 — Request 層 on-demand Azure 帳號 sync 檢查

> **Spec version**:1.0(initial)
> **Owner**:Chris(提出)/ AI(起草)
> **Approved by**:**Chris Lai**(2026-08-01)

## 1. Context (Why)

Chris 2026-08-01 提出:operator 睇住一張單,想主動確認「呢個帳號到底 Entra 見唔見到」,而家做唔到。

查證後現況(全部 trace 得返 code):

| # | 寫 `azureSyncedAt` 嘅路徑 | 有冇真向 Graph 求證 | 觸發 |
|---|---|---|---|
| 1 | n8n intake 傳 `azureSyncedAt`(`intake.service.ts:90`) | ❌ 純聲稱 | n8n push |
| 2 | `markSynced`(`assign.service.ts:62`,`PATCH :id/sync`) | ❌ 純聲稱 | 前端「Mark synced」掣 |
| 3 | `SyncSweepService`(`sync-sweep.service.ts:69`) | ✅ 真 `graph.findUser` | **`@Cron` 每 10 分鐘,被動** |

⇒ **唯一會真求證嘅係被動 cron,冇任何「而家即刻幫我查呢張單」嘅入口。**

兩個具體痛點:

1. **UI 語意倒轉**:唯一睇落似「檢查」嘅掣(「Mark synced」)其實**一個 Graph call 都唔出**,只係記低「有人聲稱」。timeline message 已經刻意寫明呢件事(`sync-gate-messages.ts:19`),但掣面睇唔出。
2. **Sweep 有 30 日 cutoff**(`sync-sweep.service.ts:157`,D5 zombie guard):舊過 30 日嘅單**永遠唔會再被自動掃到**。嗰啲單今日唯一出路就係按「聲稱」掣 —— 即係用一個未經證實嘅動作,去開一個 ADR-0015 特登升級成「要有證據」嘅 gate。

## 2. Scope (What)

### 2.1 Behavior Change

- **Before**:request detail 個 Phase 1 sync 區只有一個 primary 掣「Mark synced」,撳落去 = 無條件寫 `azureSyncedAt = now` + `RequestEvent(SYNC, MANUAL)`,零 Graph 流量。真求證要等 cron(最多 10 分鐘,或者 30 日後永遠等唔到)。
- **After**:同一個區加一個 **「Check now」primary 掣**,撳落去即時直接向 Microsoft Graph 查 `findUser(targetUpn)`:
  - **命中** → 用同 sweep **完全一樣**嘅寫入語意開 gate(`azureSyncedAt = now` · `accountCreatedAt ??= now` · `RequestEvent(SYNC)`),UI 即時變「Ready to assign」。
  - **未命中** → **零寫入**,回一個「Entra 仲未見到呢個帳號」嘅結果(唔係 error)。
  - **Graph 掛** → 503(既有 `graph-unavailable.ts` helper)、零寫入。
  「Mark synced」保留但**降做 secondary/ghost** —— break-glass 應該係例外,唔應該係預設動作(ADR-0015 D3 保留佢嘅原意)。

### 2.2 In Scope

**Backend**
- 新 endpoint `POST /fulfilment/requests/:id/sync-check`,`@Roles(ADMIN, REGIONAL, OPCO_IT)`(跟 controller 現有),`assertOpcoScope`(AUTH-3a fail-closed)。
- 🔴 **直接用 `GraphService`,絕不經 `LicenseOperationsProvider`** —— ADR-0017 D0 + `license-ops.boundary.spec.ts:30` 明文:經 n8n 去證實 sync = 直接推翻 ADR-0015(gate 靜靜地變返「信 caller」)。要有 boundary test 守住呢條線。
- 開 gate 嘅寫入**複用 sweep 個 `openGate` 語意**(同一 transaction 形狀:update + RequestEvent,`accountCreatedAt` 用 `??` 唔覆蓋)。實作上抽共用 helper 定各自寫,由實作時決定,但**行為必須一致**。
- 三態回傳(唔用 429):`{ status: 'FOUND' | 'NOT_FOUND' | 'THROTTLED', retryAfterSeconds: number, request: RequestDto }`。
  > 點解唔用 429:throttle 同「未 sync」係兩件完全唔同嘅事,擺喺 HTTP error path 會令前端要靠 status code 分辨,好易寫成「查過未見到」。三態 enum 令佢冇得撈亂。
- **Cooldown 30 秒 / per request**,in-memory(service 內 Map,順手 prune 過期 entry)。cooldown 內唔出任何 Graph call,回 `THROTTLED` + 剩餘秒數。
  > 唔加 schema 欄位存呢個時間 —— 加 = 觸發 H1,而 cooldown 只係防手震連按,唔係安全 gate,唔值得動 Prisma schema。
- 新 timeline message `SYNC_GATE_MESSAGE.VERIFIED_ON_DEMAND`:`'Phase 1 sync verified against Microsoft Graph (on-demand check)'`。
  > `sync-gate-messages.ts` 成個設計就係「一眼睇出證據 vs 聲稱」;「邊個/點解觸發」本身係營運數據(可以答「幾多單係人手催出嚟,而唔係 cron 掃到」)。

**Frontend**(`apps/web`)
- `useSyncCheck(requestId)` mutation(跟 `useMarkSynced` 既有形狀 + invalidate 同兩條 query key)。
- request detail sync 區:`Check now` = primary(Ricoh red)· `Mark synced` = ghost/secondary。**一個 view 一個 primary,H6 唔破**。
- 三態 + 錯誤文案(全部唔可以將 throttle 講成「未 sync」):
  | 情況 | 文案 |
  |---|---|
  | FOUND | `Verified in Azure AD — ready to assign` |
  | NOT_FOUND | `Not in Azure AD yet · 再試 in {n}s` |
  | THROTTLED | `Just checked · 再試 in {n}s` |
  | 503 | 既有 Graph unavailable 錯誤路徑 |
- Cooldown 期間 button disabled + 本地倒數(食 `retryAfterSeconds`)。
- 只用既有 token / 既有 `Button` variant,**唔加新 pattern**;commit 前跑 `ui-design` skill(H6)。

**Test**(H5 — sync gate 係明文 critical path)
- Backend:FOUND 開 gate + 寫 `VERIFIED_ON_DEMAND` event · NOT_FOUND **零寫入** · THROTTLED **零 Graph call** · Graph throw → 503 且零寫入 · OPCO_IT 跨 OpCo → 403 · 已 synced 嘅 request 唔重複寫(唔覆蓋 timestamp、唔再出 event)。
- 🔴 Boundary test:呢條路徑**唔准**經 `LicenseOperationsProvider`(跟 `license-ops.boundary.spec.ts` 既有做法)。
- Frontend:三態文案 + cooldown disable。
- Graph 一律 mock(§3.4)。

### 2.3 Out of Scope（explicit）

- ❌ **唔改 `azureSyncedAt` schema / 語意** —— ADR-0015 D1 已經 lock 咗「平台向 Graph 證實過」,本 CH 淨係加多個觸發器,寫入語意一個字都唔改。
- ❌ **唔郁 `SyncSweepService`** —— cron 照跑,cutoff / batch / 間隔全部唔改。
- ❌ **唔郁 assign gate** —— `assign.service.ts` 照舊 fail-closed 查 `azureSyncedAt` + `findUser`。呢個 CH 令 gate 更早有答案,**唔係**取代最後嗰道 gate。
- ❌ **唔加 audit row** —— 跟既有 `markSynced` 一致:`RequestEvent(SYNC)` 已經係 per-request 完整記錄。sweep 要 audit 係因為佢係 bulk 且冇 actor,呢度兩樣都唔成立。
- ❌ **唔喺 Requests 列表加批量 check** —— 一次過 N 個 = 手動重造 sweep,而且直接打爆 Graph。要嘅話另開 CH。
- ❌ **唔自動 assign** —— check 命中只係開 gate,派 seat 仍然係人手撳 Assign。
- ❌ **唔改 n8n / ServiceNow 合約**。

## 3. Acceptance Criteria

**Backend**
- [ ] `POST /fulfilment/requests/:id/sync-check` 出現喺 `/docs/api`,三態 response shape 見得到
- [ ] 真 Graph live 驗:**存在**嘅 UPN → `FOUND`,DB `azureSyncedAt` 由 null 變有值,timeline 見到 `(on-demand check)` 字樣
- [ ] 真 Graph live 驗:**唔存在**嘅 UPN → `NOT_FOUND`,DB `azureSyncedAt` **仍然 null**、timeline **零新 event**
- [ ] 30 秒內第二次撳 → `THROTTLED`,`retryAfterSeconds` 合理,且**冇新 Graph 流量**(test 用 mock spy 證)
- [ ] OPCO_IT 對唔屬自己 OpCo 嘅 request → **403**
- [ ] Graph throw → **503**(唔係 500、process 唔死),零寫入
- [ ] Boundary test 證實冇經 `LicenseOperationsProvider`
- [ ] `cd apps/api && npm test` 全綠,新增 test 覆蓋上面每一條

**Frontend**
- [ ] request detail sync 區:`Check now` primary + `Mark synced` ghost,light + dark 兩個都驗
- [ ] 三態文案各自見到(FOUND / NOT_FOUND / THROTTLED),**THROTTLED 唔會顯示成「未 sync」**
- [ ] Cooldown 期間掣 disabled + 倒數
- [ ] 已 synced 嘅 request 照舊顯示「Ready to assign」,兩個掣都唔出(現有行為冇 regression)
- [ ] `cd apps/web && npm test` 全綠
- [ ] `ui-design` skill 跑過,零 violation

**驗證指令**
- [ ] `cd apps/api && npm test`
- [ ] `cd apps/web && npm test`
- [ ] Live:真 Graph 各打一次「存在 / 唔存在」嘅 UPN,DB 前後對比

## 4. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | In-memory cooldown 唔跨 instance;將來 scale out 後每個 instance 各自 30 秒 | Low | Low | 明文接受 —— cooldown 係防手震,唔係安全 gate。真 gate 仍然係 assign 嗰道。UAT 現時單 container |
| R2 | Operator 連環撳 → Graph throttle(429) | Med | Low | 30 秒 cooldown + 既有 `graph-unavailable.ts` wrap → 503,唔會 crash(BUG-002 教訓) |
| R3 | Operator 將 `NOT_FOUND` 誤讀成「帳號有問題」,實情只係 Entra Connect 未 sync 完 | Med | Med | 文案明寫 `Not in Azure AD yet`(yet)+ 帶重試秒數,唔用 error tone |
| R4 | 抽共用 `openGate` helper 時改壞 sweep | Low | High | sweep 既有 test 必須全綠;唔為咗「靚啲」而改 sweep 任何行為(§1.3) |
| R5 | 新掣令人以為唔再需要等 sweep,或者以為可以跳過 assign gate | Low | Med | spec §2.3 明文;assign gate 一個字唔改,test 守住 |

## 5. Effort Estimate

**~1 日**(backend ~0.5 日含 test · frontend ~0.3 日 · live 驗 ~0.2 日)。

## 6. Dependencies

- 需要真 Graph 憑證做 live 驗 —— `apps/api/.env` 喺主 checkout 有真 tenant(2026-07-31 實證),✅ 冇 blocker。
- 唔依賴 AUTH-2b / DEPLOY-harden。
- 唔依賴 n8n 側任何嘢。

## 7. Spec Changelog（deviation log）

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-08-01 | Initial draft(proposed) | Chris 提出 request 層主動 sync 檢查 | — |
| 2026-08-01 | proposed → **approved**,spec locked | Chris review 後 approve,指示出 checklist 開工 | Chris |
| 2026-08-01 | 三個開放決定由 Chris 拍板:①Check now = primary / Mark synced 降 ghost ②per-request cooldown 30s ③新開 `VERIFIED_ON_DEMAND` message | 起草時提問,即場定案 | Chris |

---

**Lifecycle reminder**:呢份 spec locked after status=approved。重大 deviation → §7 changelog。
**Gate reminder**:status 由 AI 標 `proposed`,**用戶 review + approve 先可以 `approved` + 開始 code**(PROCESS R1.change)。
