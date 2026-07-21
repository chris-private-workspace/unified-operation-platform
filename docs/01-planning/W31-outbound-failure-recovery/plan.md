---
phase: W31-outbound-failure-recovery
name: "Outbound 交付失敗持久化 + 人手補救(ADR-0011 / INTEG-3 / rollout item 6)"
sprint_week: W31
start_date: 2026-07-21
end_date: 2026-07-23          # planned, may slip with changelog log
status: active                # draft | active | closed
spec_refs:
  - docs/adr/0011-outbound-delivery-failure-recovery.md（D1–D9 — 全部本 phase 落地）
  - docs/adr/0010-integration-observability-delivery.md D8（路線來源）
  - docs/02-architecture/audit-and-integration-observability.md §2.4 第 5 點 · §6 item 6 · §7.2
prior_phase: W30-integration-status
---

# Phase W31 — Outbound 交付失敗持久化 + 人手補救

> **Plan version**:1.0(initial)
> **Owner**:AI(執行)/ Chris Lai(decision)
> **Approved by**:**Chris Lai(2026-07-21)** —— scope + §6 三個實作級選擇(I1/I2/I3)照建議通過

## 1. Scope

ADR-0011 **Accepted**,本 phase 落實 rollout **item 6**(最後一項自足嘅 rollout 工作):令 outbound 失敗由「throw 完就消失」變成**一件可見、可查、可補救嘅事**。

覆蓋 ADR-0011 Context 表入面三種失敗:

| | 失敗點 | 補救動作 |
|---|---|---|
| **F1** `request.submit` | SN/n8n 建 ticket 失敗 | 重新提交 |
| **F2** `request.mirror` | ticket 建咗、本地 mirror 失敗(orphan) | 🔴 **只**用已有 sysId 補寫本地,**絕不重新提交** |
| **F3** `servicenow.worknote` | SN work-note 回寫失敗(而家靜默 swallow) | 重發 work note |

### ⚠️ 風險等級對比前兩個 phase —— 本 phase 明顯較高

| phase | 性質 | 風險 |
|---|---|---|
| W29 audit | 改 6 個既有 service 嘅 **transaction 邊界** | 高 |
| W30 integration status | **純新增讀取面**,零既有路徑改動 | 低 |
| **W31(本)** | **新 schema + 改三條既有寫入路徑嘅失敗分支,其中一條係 critical path(`assign.service`)** | **中高** |

呢個唔係「加個新畫面」——係喺已經 work 緊嘅 outbound 路徑上動刀。故:

- **成功路徑必須零行為改動**(G4 用既有 test 全綠 + `git diff` 核實把關)
- **`assign.service` 屬 H5 critical path** → 改動必有對應 test,Graph / ServiceNow 一律 mock
- 三條硬紅線(G1/G2/G3)**test 先行**,同 W29(白名單)/ W30(secret + 唯讀)同一手法

### 唔喺本 phase

- item 5 n8n 回程 webhook —— 卡 **OQ-D**(外部合約會,唔喺我哋手上)
- **自動 retry / BullMQ** —— ADR-0010 D8 + ADR-0011 D9 明確唔做,要另寫 ADR
- **RISK R3**(n8n on-prem sync 延遲 → assign fail)—— ADR-0011 Context 已校正:同 item 6 唔係同一件事,另行處理
- `OutboundFailure` retention / 清理 —— 同 `audit-retention` 一齊留後

## 2. Deliverables

### F1 — `OutboundFailure` model + 白名單記錄服務

- **Spec ref**:ADR-0011 **D1**(schema)· **D5**(白名單 / 絕不存 secret)· **D6**(唔綁主 transaction)
- **內容**:
  - `schema.prisma` 加 `OutboundFailure`(additive)+ migration
  - `outbound-failure.service.ts` —— `record()` / `list()` / `markResolved()` / `markAbandoned()`
  - **白名單喺 service 一處做**,call site 唔可以自己砌 payload(沿用 ADR-0009 `AuditService` 嘅做法)
- **Acceptance criteria**:
  - 🔴 **G1**:餵假 secret(`SERVICENOW_PASSWORD` / `N8N_OUTBOUND_WEBHOOK_KEY` / auth header / vendor raw body)→ assert **一個都唔會**出現喺 persisted row
  - `lastError` 只存訊息文字,唔存 vendor 原始 response
  - `record()` **唔接受** caller 個 tx handle —— 簽名層面就杜絕綁 transaction(D6)
- **Effort estimate**:3h

### F2 — 三處失敗點接線

- **Spec ref**:ADR-0011 **D2**(kind 分流)· **D6** · **D7**(F2 錯誤訊息改動)
- **內容**:

| kind | 接線位置 | 現狀 | 改成 |
|---|---|---|---|
| `request.submit` | `outbound-request.service.ts:79-87` | throw 503 | 記錄 → 照樣 throw 503(訊息不變) |
| `request.mirror` | `outbound-request.service.ts:123-131` | `logger.warn` + `throw err` | 記錄(含 `externalRef` sysId)→ throw **講明 ticket 已開但平台未記低**(D7) |
| `servicenow.worknote` | `assign.service.ts:197-203` | `logger.warn`,swallow | 記錄 → **仍然 swallow**(唔改 assign 成功語意,OD4 不變) |

- **Acceptance criteria**:
  - 🔴 **G3**:F2 場景 test —— mirror write 失敗後,failure row **仍然存在**(證明冇被 rollback 拖走)
  - 🔴 **G4**:成功路徑零行為改動 —— 既有 test 全綠 + `git diff` 逐處核
  - **G7**(H5):`assign.service` 改動有對應 test,Graph / SN mock
  - F3 之後 assign **仍然成功返回**(唔可以因為 work note 失敗而令 assign 變失敗)
- **Effort estimate**:3h

### F3 — Endpoint + 補救分流

- **Spec ref**:ADR-0011 **D2**(kind 分流)· **D3**(🔴 絕不重新提交)· **D4**(權限)· **D8**(audit)
- **內容**:
  - `GET /admin/outbound-failures`(篩 status / kind,cap 同 audit 一樣雙重防守)
  - `POST /admin/outbound-failures/:id/retry` —— **按 `kind` 分流**
  - `POST /admin/outbound-failures/:id/abandon`
  - 全部 `@Roles(ADMIN, REGIONAL)`(D4)
- **Acceptance criteria**:
  - 🔴 **G2**:`request.mirror` 補救路徑 test —— assert `provider.submit` / `createRecord` **從未被呼叫**(同 W30 G2 同一手法)
  - **G5**:OPCO_IT live **403** 三重驗證(`/me` 確認身分 → 403 → 同身分另一 endpoint 200 對照)
  - **G6**:retry / abandon 都落 audit(`outbound.retry` / `outbound.abandon`,actorType `user`)
  - retry 失敗 → `attemptCount` +1、`status` 保持 `open`、更新 `lastError`(唔係扮成功)
  - W28 `permissions.spec.ts` 會如預期紅(新 route)→ 審視後 deliberate update
- **Effort estimate**:3h

### F4 — 前端補救畫面

- **Spec ref**:ADR-0011 **D2**(UI 要分辨兩種 retry)· **D4**
- **內容**:Settings 新 tab(或獨立頁,F4 埋身再定)—— 失敗清單 + 按 kind 顯示**唔同嘅動作文案**
- **Acceptance criteria**:
  - **`request.mirror` 嘅掣文案唔可以係「Resubmit」** —— 要講明係「補寫本地紀錄」,唔可以令操作員以為會再開 ticket(D3 喺 UI 層嘅延伸)
  - **G9**:token-only(grep 零 hex/rgb/gradient)· light + dark · lucide-only · 一個 view 一個 primary · 跑 `ui-design` 12 條
  - 非 ADMIN/REGIONAL → restricted state(**呢度用 restricted 唔用隱藏** —— 同 CH-005 相反,因為呢個係專程去嘅畫面,唔係日常 landing)
  - 空清單 → 誠實 EmptyState(「冇失敗」係好消息,唔係 error)
- **Effort estimate**:3h

## 3. Verify

- **G8**:`apps/api` + `apps/web` build · lint · test 全綠;api 286→ ≥300、web 114→ ≥120
- migration 可 apply 亦可 rollback(dev DB 實跑)
- live 端到端:人為整跌 SN(改壞 `SERVICENOW_INSTANCE_URL`)→ 見 F1 失敗入表 → 撳 retry → 還原 env → retry 成功 → status `resolved`

## 4. Effort

| Deliverable | Estimate |
|---|---|
| F1 model + 白名單服務 | 3h |
| F2 三處接線 | 3h |
| F3 endpoint + 分流 | 3h |
| F4 前端 | 3h |
| **合計** | **~12h(2 日)** |

## 5. Dependencies

- ✅ ADR-0011 **Accepted**(2026-07-21)—— D1–D9 全部已拍板
- ✅ `AuditService`(W29)可直接用嚟落 D8 嘅 retry / abandon 紀錄
- ✅ ADR-0008 `RequestSubmissionProvider` 已存在 —— F1 retry 直接重用,唔使新 vendor 方法
- ❌ 無外部阻塞(同 item 5 唔同)

## 6. Open Questions

**無 —— 決策已由 ADR-0011 D1–D9 全部覆蓋**(Chris 2026-07-21 拍板 Q1 scope + Q2 權限)。

以下三個係**實作級選擇,由 AI 拍板**,列出畀 Chris 過目;有異議喺 approve 時講:

| # | 選擇 | 理由 |
|---|---|---|
| I1 | **F3 仍然 swallow** —— 記錄咗,但 assign 照樣成功返回 | 唔改 OD4 既有語意。work note 係 mirror,唔應該令一個已完成嘅 assign 變成失敗 |
| I2 | **retry 失敗 → `attemptCount` +1,`status` 留 `open`** | 唔會扮成功;試幾多次一目了然(正正係 ADR-0010 D8 話「自動 retry 但冇人知試過幾多次」要避免嘅嘢) |
| I3 | **`abandoned` 之後可以再 reopen retry** | 判斷可以錯;唔值得為咗防呆而鎖死。兩個動作都有 audit(D8) |

---

**Lifecycle reminder**:plan locked after `status: active`。deviation → changelog(R3)。
