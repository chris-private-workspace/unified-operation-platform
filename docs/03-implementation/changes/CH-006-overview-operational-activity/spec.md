---
change_id: CH-006
title: "Overview 營運活動流 — RequestEvent 全域時間軸取代 audit feed"
status: done            # draft | proposed | approved | active | done | cancelled
created: 2026-07-21
target_completion: 2026-07-22
affects_components: [apps/api, apps/web, prisma]
spec_refs:
  - BACKLOG.md `FE-activity-ops`（CH-005 carry-over）
  - CH-005-overview-activity-feed/spec.md §1.1（語意落差 + 「唔會擋住將來加 RequestEvent 來源」）
  - ADR-0009 Decision 7（/admin/audit ADMIN-only,本 Change 不放寬）
  - ADR-0011 D1（OutboundFailure 刻意唔 denormalize opcoId — 本 Change 沿用同一取捨）
  - design-system.md §6（Prototype 以外 owner-approved 畫面）· DS-8 stage→tone
---

# CH-006 — Overview 營運活動流(RequestEvent)

> **Spec version**:1.0(initial)
> **Owner**:AI(草擬)· Chris(決策)
> **Approved by**:Chris Lai(2026-07-21,「Approve 開工」)

## 1. Context (Why)

CH-005 喺 Overview 上咗一張 activity card,但**來源係 `AuditLog`**(配置 / 帳號稽核),唔係 prototype 示範嗰種營運流水(assign / stage 推進 / 退回)。CH-005 spec §1.1 已經寫明呢個係**刻意嘅 stopgap**,因為當時 `RequestEvent` 冇全域讀取路徑,並註明「呢個決定唔會擋住將來加 `RequestEvent` 來源」。

本 Change 就係嗰個 follow-up。

**Chris 於 2026-07-21 拍板三項:**

| # | 問題 | 決定 |
|---|---|---|
| **D1** | 兩個來源點共存? | **`RequestEvent` 取代 Overview 個 feed**;`AuditLog` 留返 `/audit` 頁。一個來源、一張 card |
| **D2** | 新 index 屬 H1,點行? | **加 `@@index([createdAt])`,當 H1-lite** —— Chris 喺對話批准,理由寫入本 spec,**唔另開 ADR** |
| **D3** | Workflow? | **Change(CH-006)** |

### 1.1 D2 嘅理由(H1-lite 判斷,必須寫低)

H1 定義涵蓋「改 Prisma schema」,但本次改動同 W31(新 model,ADR-0011)/ W20(新欄位,ADR-0006)**唔同級**:

- 純 **additive**,一行 `@@index`,**零資料遷移**、零 backfill
- **零 interface 改動** —— 冇新欄位、冇改型別,既有 query 全部照舊
- **完全 reversible**(drop index 即還原)
- **冇掂任何已 lock 決策** —— 對帳方案甲 / `skuId` 主鍵 / ledger 兩層數字 / stage 掛 line item / sync gate,一個都冇碰

Chris 已就本項給予明示 approval。**先例效力僅限「純 index 增補」** —— 新 model / 新欄位 / 改型別**仍然要 ADR**。

### 1.2 對 BACKLOG 前置描述嘅一項修正

BACKLOG `FE-activity-ops` 寫「`RequestEvent` **只有 write、零 read surface**」。**查證後唔完全準確**:

- `request-detail.tsx:354` **已經 render 緊** per-request event timeline,資料由 `GET /fulfilment/requests/:id` **嵌套**帶落嚟。
- 真正缺嘅係**跨 request 嘅全域時間軸查詢** —— 呢個確實零存在,而且 index `[requestId, createdAt]` 幫唔到 `ORDER BY createdAt DESC`。

修正後結論唔變(仍要新 endpoint + 新 index),但**多咗一個必須遵守嘅約束**:前端已有 `EVENT_TONE`(`request-detail.tsx:32`)同 event 文字邏輯(`:370-373`)。本 Change **必須重用**,唔可以另起一套 —— 同 CH-005 delegate `auditActionTone` 同一個原則(兩套映射會令同一事件喺兩個畫面讀法唔一致)。

### 1.3 兩個誠實 gap(唔扮有)

| Gap | 事實 | 本 Change 點處理 |
|---|---|---|
| `EventType.RECONCILE` | enum 有,但 **`src/` 零 write site**(從來冇寫入過) | 照映射(防後端將來加),但**唔會**喺 UI 宣傳有對帳活動 |
| `STAGE_CHANGE` 冇 `message` | `stage.service.ts:122` 只寫 `fromStage`/`toStage` | 前端由 stage 對砌文字,重用 `STAGE_LABEL` |

## 2. Scope (What)

### 2.1 Behavior Change

- **Before**:Overview "Recent activity" card 只有 **ADMIN** 見到,內容 = 最近 6 條 `AuditLog`(role 變更 / 登入 / catalog 編輯…)。REGIONAL / OPCO_IT **完全冇 card**。
- **After**:同一張 card,**ADMIN / REGIONAL / OPCO_IT 都見到**,內容 = 最近 6 條 `RequestEvent`(assign / stage 推進 / sync / note),**按 OpCo scope 過濾**(OPCO_IT 只見自己 OpCo)。header link 由 `View audit log →` 改為 `View requests →`。

### 2.2 In Scope

**後端(`apps/api`)**

1. **`prisma/schema.prisma`** —— `RequestEvent` 加 `@@index([createdAt])`,+ migration(名:`add_request_event_created_at_index`)。既有 `@@index([requestId, createdAt])` **保留唔郁**。
2. **`src/fulfilment/activity.service.ts`**(新)—— `recent(user, limit)`:
   - `orderBy: { createdAt: 'desc' }`, `take: limit`
   - Scope:**conditional spread**,ADMIN / REGIONAL → `where: {}`(純 index 掃,零 join);OPCO_IT → `where: { request: { opcoId } }`。**唔用 `where: { request: {} }`** —— 空關聯 filter 會白白迫一個 join。
   - **唔 denormalize `opcoId` 落 `RequestEvent`** —— 經 `Request` join,同 ADR-0011 D1 同一取捨。
3. **`src/fulfilment/activity.controller.ts`**(新)—— `@Controller('fulfilment/activity')` + `@Get()`,`@Roles(ADMIN, REGIONAL, OPCO_IT)`。
   > **獨立 controller,唔加落 `fulfilment.controller.ts`** —— 嗰邊有 `@Get(':id')`,`@Get('events')` 要靠宣告次序先唔會被 `:id` 食咗,太脆弱。跟 `outbound-failure.controller.ts`(W31)嘅先例。
4. **`src/fulfilment/dto/activity-query.dto.ts`**(新)—— `limit`(default 6,**上限 50**)+ response DTO。
   - Row 欄位:`id` · `type` · `fromStage` · `toStage` · `message` · `createdAt` · `actorName`(nullable)· `requestId` · `requestRef`(`serviceNowNumber ?? id.slice(-6)`)
   - **明確唔包**:`targetUpn` · `requesterEmail` · `targetDisplayName`(見 §3 B6)
5. **Tests** —— service scope / limit-cap / PII 負面斷言 / controller role。

**前端(`apps/web`)**

6. **`src/lib/activity.ts`**(改寫)—— 由 `AuditEntry` 轉 `ActivityEvent`:
   - `eventTone(type)` / `eventIcon(type)` / `eventSummary(ev): { text, ref }`
   - **`EVENT_TONE` 由 `request-detail.tsx` 抽上嚟**,`request-detail.tsx` 改為 import(去重,唔係順手 refactor —— 係我今次改動製造嘅重複)
   - CH-005 嘅 audit 映射(`ACTION_LABEL` / `ACTION_ICON` / `activityTone`)**變 orphan → 刪**(`/audit` 頁用緊自己嗰套 `lib/audit.ts`,不受影響)
7. **`src/lib/api-types.ts`** —— 加 `ActivityEvent`;**`AuditEntry` 保留**(`/audit` 頁仍用)。
8. **`src/hooks/queries.ts`** —— 加 `useActivity({ limit })`。
9. **`src/components/overview/activity-feed.tsx`**(改)—— 換 hook + 換文案(EmptyState 講營運活動,唔再講「account, OpCo and catalog changes」)。版面結構唔郁。
10. **`src/pages/overview.tsx`**(改)—— **移除 `canSeeAdminNav(role)` gate**,card 全 role render;header link 改指 `/requests`。清 orphan import。
11. **Tests** —— `lib/activity.test.ts` 重寫 + feed component test(含空狀態,用 component test 唔用 live hack —— memory `verification-that-proves-nothing` 第 3 條)。

### 2.3 Out of Scope（explicit）

- ❌ **放寬 `/admin/audit` 權限** —— ADR-0009 Decision 7 站住。本 Change 靠**新 endpoint**畀 non-admin 睇嘢,**唔係**放寬舊嗰個。
- ❌ **`AuditLog` 同 `RequestEvent` 合併顯示** —— D1 已否決(admin feed 會被 `auth.login_success` 洗版)。
- ❌ **`RequestEvent` 加 `opcoId` 欄位** —— 經 join,見 §2.2 第 2 點。
- ❌ **獨立 `/activity` 全頁 / 分頁 / 篩選** —— Overview 只要 tail 6 條。要全頁另開 candidate。
- ❌ **改 `request-detail.tsx` 個 timeline 嘅版面 / 行為** —— 只 import 抽出嘅共用常數。
  > **已解決(2026-07-21)**:`request-detail.tsx:372` fallback 顯示 raw enum(`REQUESTED → QUOTING`)。曾提議一齊改用 `STAGE_LABEL`,但 Chris approve 時**冇特別指示** → 按 §13「scope 模糊 → default out-of-scope」+ §1.3 surgical:**唔改**。只抽 `EVENT_TONE`(常數)共用,`request-detail` 嘅**文字渲染原封不動**。feed 自己嘅 `STAGE_CHANGE` 文字用 `STAGE_LABEL` 砌。
  > 副作用:兩個畫面嘅 stage 文字**短期唔一致**(feed `Requested → quoting` vs detail `REQUESTED → QUOTING`)。登記為 follow-up candidate,唔喺本 Change 解。
- ❌ **補寫 `RECONCILE` write site** —— 對帳事件屬 Drift-resolve candidate。
- ❌ **改任何 `assign` / `stage` / `ledger` 寫入路徑** —— 本 Change **純讀取**,critical path 零改動。

## 3. Acceptance Criteria

- [ ] **B1** ADMIN 登入 → Overview card 顯示真 `RequestEvent`,≤6 行,每行有描述 + request ref + 相對時間
- [ ] **B2** **OPCO_IT live 驗**:card **見到**(唔再隱藏),且內容**只有自己 OpCo** 嘅 request 事件 —— 對照 ADMIN 同一時間見到跨 OpCo 事件
- [ ] **B3** **Scope fail-closed test**:OPCO_IT 查詢**唔會**返回其他 OpCo 嘅 event(service 層 test,唔靠 UI)
- [ ] **B4** `limit` 超過上限 → 收窄到 50,唔會拉全表
- [ ] **B5** ADMIN / REGIONAL 路徑 `where` **唔含 `request` 鍵**(assert query shape) —— 證明冇白白 join
- [ ] **B6** **H4 負面斷言**:response DTO **零 `targetUpn` / `requesterEmail` / `targetDisplayName`**(餵一個齊 PII 嘅 Request,assert 序列化結果唔含)—— 學 W31 G1
- [ ] **B7** `EVENT_TONE` **單一來源**:`request-detail.tsx` 改為 import,repo 內 `EVENT_TONE` 定義**只有一處**(grep 驗)
- [ ] **B8** Migration 喺 dev DB **實跑 apply** 成功,`\d "RequestEvent"` 見到新 index
- [ ] **B9** **H6 token-only**:改動檔案 grep 零 `#hex` / `rgb(` / `gradient`;icon 全 lucide stroke;feed 零 primary action
- [ ] **B10** light + dark 都驗過(DS-4);時間 / requestRef 欄 mono(DS-5)
- [ ] **B11** **截圖驗**(唔淨靠 DOM):窄視窗下整行內容冇被切出畫面 —— W31 教訓
- [ ] **B12** 空 feed → 誠實 EmptyState,措辭講營運活動
- [ ] **B13** `apps/api` test **324 → ≥332** · `apps/web` test **123 → ≥128** · 兩邊 lint / build 全綠
- [ ] **B14** 跑 `ui-design` skill 12 條自檢,逐條記錄

**Verification commands**:
- `npm run -w apps/api test` · `npm run -w apps/api lint` · `npm run -w apps/api build`
- `npm run -w apps/web test` · `npm run -w apps/web lint` · `npm run -w apps/web build`
- `npx prisma migrate dev --name add_request_event_created_at_index`
- live:ADMIN vs OPCO_IT 對照(`AUTH_DEV_USER_EMAIL=opco.it.rhk@rapo.com.hk`)

## 4. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | OPCO_IT 見到其他 OpCo 嘅營運事件(跨租戶洩漏) | Low | **High** | B3 service 層 fail-closed test + B2 live 對照;沿用既有 `scopeWhere` 唔自創 |
| R2 | DTO 順手帶出 `targetUpn`(onboarding 對象 PII) | **Med** | **High** | B6 負面斷言 test;DTO 明確列白名單欄位 |
| R3 | `EVENT_TONE` 兩處定義 → 同一事件兩個畫面唔同色 | Med | Low | B7 grep 驗單一定義 |
| R4 | 新 DB / 新環境冇 request 事件 → 全 role 見空 card | Med | Low | B12 誠實 EmptyState(係真空,唔係 bug) |
| R5 | 抽 helper 時**順手**改埋 `request-detail` 版面(§1.3 surgical 違反) | Med | Med | §2.3 明文只 import 常數;`git diff` 逐行 review |
| R6 | index 加咗但 query 行錯 plan(仍全表 scan) | Low | Med | B8 確認 index 存在;B5 確認 admin 路徑無 join |

## 5. Effort Estimate

**5–7 小時**(後端 endpoint + 一行 schema + migration;前端換來源 + 去重)。無新 dep、無新 model、無資料遷移。

## 6. Dependencies

- ✅ `scopeWhere` / `assertOpcoScope`(W11 AUTH-3a)可直接用
- ✅ `STAGE_LABEL` / `STAGE_TONE`(`lib/requests.ts`)可重用
- ✅ CH-005 嘅 feed 版面 / `TONE_SOFT` / `relativeTime` 照用
- ✅ D1 / D2 / D3 已由 Chris 拍板(2026-07-21)
- ✅ §2.3 `request-detail` raw-enum 問題已裁定:**唔改**(default out-of-scope)
- ❌ 無外部阻塞(唔碰 SN / Graph / n8n)

## 7. Spec Changelog（deviation log）

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-21 | Initial draft | CH-005 carry-over;D1/D2/D3 已拍板 | Chris Lai |
| 2026-07-21 | Approved → active;§2.3 raw-enum 裁定唔改 | Chris「Approve 開工」,未就 raw-enum 另行指示 → default out-of-scope | Chris Lai |
| 2026-07-22 | **B13 web 數字修正**:`123 → ≥128` 改為 `123 → 123(不變)` | 原數字假設 test 累加。本 Change **換來源**,CH-005 嘅 audit 措辭 test 連同佢守護嘅映射一齊刪:新 15 test(9+6)= 舊 15 test(10+5)。api 側 324→333 如期。**唔為湊數補 test** | AI(記錄)· 待 Chris 覆核 |
| 2026-07-22 | F3.3 由「獨立 controller spec」改為「用既有 `permissions.spec.ts`」 | `fulfilment/` 零 controller spec;本項目 role 驗證集中於 W28 derived 矩陣。跟既有 pattern(§13) | AI(記錄) |
| 2026-07-22 | status → `done` | B1–B12 / B14 全 pass;B13 部分(見上) | AI(記錄) |

---

**Lifecycle reminder**:呢份 spec locked after status=approved。重大 deviation → §7 changelog。
**Gate reminder**:status = `proposed`,**用戶 review + approve 先可以 `approved` + 開始 code**(PROCESS R1.change)。
