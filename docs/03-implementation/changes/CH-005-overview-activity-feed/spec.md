---
change_id: CH-005
title: "Overview activity feed — 真內容取代 placeholder EmptyState"
status: done            # draft | proposed | approved | active | done | cancelled
created: 2026-07-21
target_completion: 2026-07-21
affects_components: [apps/web]
spec_refs:
  - W12-fe-fidelity-harden/AUDIT.md（honest gap: Overview activity feed）
  - ADR-0009 Decision 7 連帶義務 ①（讀取 ADMIN-only,唔可放寬）
  - ADR-0009 Decision 8.2（REGIONAL / OPCO_IT 將來另議）
  - design-system.md §6（Prototype 以外 owner-approved 畫面）
---

# CH-005 — Overview activity feed

> **Spec version**:1.0(initial)
> **Owner**:AI(草擬)· Chris(決策)
> **Approved by**:_(待 Chris approve 後填)_

## 1. Context (Why)

`overview.tsx:344-351` 有一張 **placeholder card**:

```tsx
{/* Recent activity — no events endpoint yet (honest EmptyState) */}
<Card title="Recent activity">
  <EmptyState title="No activity yet"
    description="The activity feed appears once request event history is exposed by the API." />
</Card>
```

呢個係 **W12 FE-fidelity 刻意留低嘅 honest gap**(唔造假),等後端有 events 來源先填。W29 落咗 `AuditLog` + `GET /admin/audit` 之後,BACKLOG 把 `FE-activity` 標為 **🎯 已解封**。

**兩個開工前必須拍板嘅前置,Chris 已於 2026-07-21 決定:**

| # | 問題 | 決定 |
|---|---|---|
| D1 | non-admin(REGIONAL / OPCO_IT)睇到乜? | **ADMIN-only,non-admin 隱藏整張 card**。零後端改動 —— `/admin/audit` 原封不動 |
| D2 | feed 餵咩來源? | **`AuditLog`**,措辭誠實反映內容 |

### 1.1 D2 嘅背景 —— 一個必須寫低嘅語意落差

Prototype 示範嘅四條活動,同 `AuditLog` 實際記嘅嘢**唔係同一回事**:

| Prototype 示範(`ui_kits/licenseops/index.html:43-48`) | 實際記喺邊 |
|---|---|
| "Alex Tan assigned Office 365 F3 to may.chan@…" | `RequestEvent` |
| "Copilot → Quoting (no seats available)" | `RequestEvent` |
| "Power BI Pro → Ready to assign" | `RequestEvent` |
| "Drift alert opened — M365 E3 delta +3" | `DriftAlert` |

`AuditLog` 記嘅係**另一組事**:role 變更、登入成敗、帳號鎖定、OpCo / catalog 編輯、allocation import、drift **resolve**。四條示範入面只有最後一條沾邊(而且係 resolve 唔係 open)。

**查證結果(2026-07-21)**:`RequestEvent` **只有 write 路徑,零 read surface**(`assign.service.ts:53,164` / `request.service.ts:98` / `stage.service.ts:122` 全部 create;跨 request 查詢唔存在),而且 index 係 `[requestId, createdAt]` —— **冇 global 時間 index**,拉「全平台最近 N 條」用唔到 index。

所以「貼 prototype 語意」= 新 endpoint + 新 DTO + 新 index(schema change)+ scoping + test = **一個細 phase,唔係一個 Change**。Chris 揀咗**先做 AuditLog 版**,並要求措辭誠實反映內容 —— 唔扮成營運流水。

> 呢個決定**唔會擋住**將來加 `RequestEvent` 來源:多一個來源而已,今次嘅 UI 結構照用。

## 2. Scope (What)

### 2.1 Behavior Change

- **Before**:Overview 底部一張 "Recent activity" card,**永遠**顯示 `EmptyState`「No activity yet — appears once request event history is exposed by the API」。全 role 都見到同一個空殼。
- **After**:
  - **ADMIN** —— card 顯示 `GET /admin/audit` 最近 **6** 條事件,每條一句人類可讀描述 + 對象 ref + 相對時間;header 有 `View audit log →` 連去 `/audit`。
  - **REGIONAL / OPCO_IT / role 未載入** —— **整張 card 唔 render**(唔係顯示 restricted state)。Overview 係日常主畫面,對冇權嘅人長期擺一個「你冇權」方塊係噪音;隱藏 = 誠實反映「呢個 surface 唔屬於你」。

### 2.2 In Scope

1. **`apps/web/src/lib/activity.ts`**(新)—— 純函數,無 React:
   - `activitySummary(entry: AuditEntry): { text: string; ref: string }` —— 14 個 action 各自一句描述。措辭忠於 audit 語意(例:`user.role_change` → "Role changed",唔會寫成營運口吻)。未知 action(後端行先)→ fallback 用 raw action 字串,唔 crash、唔亂猜。
   - `activityIcon(action: string)` —— action → lucide icon 名(**只用 `overview.tsx` / `audit.tsx` 已引入嗰批 + lucide stroke set**)。
   - tone **重用既有 `auditActionTone`**(`lib/audit.ts:40`)—— 唔另起一套色映射,避免兩處真相。
2. **`apps/web/src/components/overview/activity-feed.tsx`**(新)—— 跟 prototype 結構:24×24 圓角 6 嘅 icon 方塊(soft 底 + solid 前景)+ 描述(12.5px)+ ref(fg-subtle)+ 時間(11px **mono**, nowrap)。含 loading / error / empty / 正常四態。
3. **`apps/web/src/pages/overview.tsx`**(改)—— 用 `useCurrentUser().role` + `canSeeAdminNav(role)` gate;ADMIN 先 render `<ActivityFeed />`,否則整張 card 唔出。清走變成 orphan 嘅 import(`Activity` / 可能 `EmptyState`,視乎其他用途)。
4. **`apps/web/src/lib/activity.test.ts`**(新)—— 純函數 test,含一條**措辭 guard**:assert 描述唔會出現營運字眼(`assigned` / `to `),鎖死 D2 嘅誠實要求。

### 2.3 Out of Scope（explicit）

- ❌ **改 `/admin/audit` 嘅權限** —— ADR-0009 Decision 7 連帶義務 ①,放寬要重開 ADR。
- ❌ **新 endpoint / 新 DTO / 任何後端改動** —— 本 Change `apps/api` 零 diff。
- ❌ **`RequestEvent` 來源**(營運流水)—— 見 §1.1,登做獨立 candidate。
- ❌ **per-OpCo scoped feed** —— 要 `AuditLog.opcoId`(schema change = H1)+ 舊行永遠 null(Decision 8.4 唔補歷史)。
- ❌ **feed 分頁 / 篩選** —— `/audit` 頁已經有,唔喺 Overview 重複。
- ❌ **改 `/audit` 頁任何嘢**。

## 3. Acceptance Criteria

- [ ] **A1** ADMIN 登入 → Overview 底部見真 feed,行數 ≤ 6,每行有描述 + 相對時間
- [ ] **A2** `View audit log →` 連到 `/audit`(既有 HeaderLink pattern)
- [ ] **A3** **OPCO_IT live DOM 驗**:整張 "Recent activity" card **唔存在**(`hasActivityCard: false`),而**同一 session** Overview 其餘部分(KPI / Needs attention)照常 render —— 證明係 gate 唔係整頁爆
- [ ] **A4** **零後端改動**:`git diff --stat apps/api` 空
- [ ] **A5** **H6 token-only**:新檔案 grep 零 `#hex` / `rgb(` / `gradient`
- [ ] **A6** 時間欄實測 `font-family` 含 `Geist Mono`(DS-5)
- [ ] **A7** light + dark 都驗過(DS-4);dark 用**無 transition 嘅元素**量度(避開 W30 揪到嗰個隱藏-tab 假陰性坑)
- [ ] **A8** icon 全部 lucide stroke(DS-6);feed 零 primary action(DS-3 —— Overview 本身冇 primary,HeaderLink 唔算)
- [ ] **A9** 措辭 guard test 綠:描述唔含 `assigned` / `to ` 等營運字眼
- [ ] **A10** `apps/web` build · lint 全綠;test **99 → ≥103**(新純函數 test)
- [ ] **A11** 跑 `ui-design` skill 12 條自檢,逐條記錄
- [ ] **A12** 空 feed(`entries: []`)→ 誠實 EmptyState,措辭講明係平台變更紀錄,唔再提「once request event history is exposed」(嗰句已經唔啱)

**Verification commands**:
- `npm run -w apps/web build` · `npm run -w apps/web lint` · `npm run -w apps/web test`
- `git diff --stat apps/api`(預期空)

## 4. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | 措辭令人以為 feed 係營運流水(實際係配置稽核) | **High** | Med | 描述忠於 audit 語意;HeaderLink 明寫 `View audit log`;A9 措辭 guard test 鎖死 |
| R2 | 為咗令 non-admin「有嘢睇」而放寬 `/admin/audit` | Low | **High** | §2.3 明文禁止;A4 零後端 diff 係機械證據 |
| R3 | 新 DB 冇 audit 事件 → ADMIN 都見空 card | Med | Low | A12 誠實 EmptyState(唔係 bug,係真空) |
| R4 | non-admin Overview 底部留白突兀 | Low | Low | 隱藏整張 card 而非留空殼;Overview 用 flex-col gap,少一張 card 唔會留洞 |
| R5 | 14 個 action 描述寫漏 / 後端加新 action | Med | Low | fallback 用 raw action 字串,唔 crash;test 覆蓋 fallback |

## 5. Effort Estimate

**3–4 小時**(純前端;無後端、無 schema、無 migration、無新 dep)。

## 6. Dependencies

- ✅ `GET /admin/audit`(W29 F3)已上線 —— `useAuditLog` hook 已存在(`queries.ts:172`)
- ✅ `useCurrentUser().role` + `canSeeAdminNav`(W22 AUTH-3b)已存在
- ✅ `auditActionTone`(W29 F4)可重用
- ✅ D1 / D2 已由 Chris 拍板(2026-07-21)
- ❌ 無外部阻塞

## 7. Spec Changelog（deviation log）

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-21 | Initial draft | FE-activity 經 W29 解封;D1/D2 已拍板 | _(待 Chris)_ |

---

**Lifecycle reminder**:呢份 spec locked after status=approved。重大 deviation → §7 changelog。
**Gate reminder**:status 由 AI 標 `proposed`,**用戶 review + approve 先可以 `approved` + 開始 code**(PROCESS R1.change)。
