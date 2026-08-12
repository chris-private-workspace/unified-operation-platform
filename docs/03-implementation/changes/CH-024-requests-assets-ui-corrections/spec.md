---
change_id: CH-024
title: "Requests / Assets 五處 UI 修正 —— 溯源可見性 + 分頁 + 狀態誠實"
status: approved
created: 2026-08-12
target_completion: 2026-08-13
affects_components: [apps/web, apps/api/fulfilment]
spec_refs:
  - CLAUDE.md §5 H6(Design Fidelity)
  - docs/02-architecture/design-system.md §navigation(Pagination)
  - ADR-0025 D2 / OQ-2(兩個 ServiceNow 單)
  - CH-023(由 step 推導 event message 嘅同族做法)
---

# CH-024 — Requests / Assets 五處 UI 修正

> **Spec version**:1.0(initial)
> **Owner**:Chris Lai
> **Approved by**:Chris Lai(2026-08-12,scope + acceptance 原樣批,零 deviation)
> **分類**:Change(< 1 日)—— 五項都係改既有 feature 嘅行為 / 文案,冇新 feature

## 1. Context (Why)

Chris 2026-08-12 睇實際畫面之後一次過提出五點。逐點查證後,**五點全部成立**,而且其中兩點唔止係「睇落唔靚」:

| # | Chris 原話 | 查證結果 |
|---|---|---|
| 1 | 「先 disable request 頁面上嘅 New request,暫時唔處理」 | 掣 `requests.tsx:116-123` + route `router.tsx:39`,兩個入口 |
| 2 | 「pagination 效果唔好,顯示晒所有頁數」 | `by-opco-view.tsx:526-542` `Array.from({length: pageCount})` **冇 window** ⇒ 2283 行 = **229 個掣**。`requests.tsx:223-236` 一字不差 |
| 3 | 「要顯示原來 onboarding request 由邊度嚟,亦要顯示新建嘅 O365 license request 號,清楚分開;SN 建單記錄應該入 operational history」 | 🔴 **後端一早分得好清楚,係前端冇顯示** —— 見 §2.1 C |
| 4 | 「順序應該 AD account created → synced to azure → synced to serviceNow;而且 assign 完仲寫住 Ready to assign」 | 順序**本身啱**,係文案唔準;但 **assign 完唔變狀態係真 bug** —— 見 §2.1 D |
| 5 | 「Headroom 係乜意思?owned/allocated/assigned/unalloc. 點嚟?」 | 同一個數喺同一頁有**三個名**;四個數字來源已 trace(§6 已答,唔喺本單改) |

### 1.1 🔴 第 3、4 點唔係美化,係「畫面同事實唔一致」

**C(第 3 點)** —— `schema.prisma:286-300` 明文寫住兩個唔同嘅 ServiceNow 單:

- `Request.serviceNow*` = **n8n 開嘅 onboarding REQ**(亦係 `@unique` idempotency key)
- `RequestLineItem.serviceNow*` = **平台自己開嘅 `O365 User License Maintenance Request` 嘅 RITM**(`intake-adapter.service.ts:267` `raiseLicenceRequest`)

而 `request-detail.tsx:379-403` **只顯示前者,仲要顯示兩次**(「Request」欄 + 右上角 ServiceNow chip),line item 個 RITM 號**零露出**。⇒ 操作員睇完成頁,會以為淨係得一張單。schema 個 comment 自己都寫住「mixing them up is the easiest mistake to make here」——**而家個 UI 正正令人一定會 mix up**。

**D(第 4 點)** —— `request-detail.tsx:511` 判斷係 `assignable ? 'Ready to assign' : …`,而 `assignable = synced && snSynced`(`:258`),**完全冇睇 line item 派咗未**。兩道閘一開就永遠寫住 Ready to assign。
🔴 諷刺位:**同一屏頂部個 Badge 其實一早啱**(`deriveStatus` `requests.ts:95-96` 全部 ASSIGNED → `Completed`)⇒ 派完之後畫面會**自己同自己矛盾**:上面 Completed,下面 Ready to assign。

## 2. Scope (What)

### 2.1 In Scope

**A — Disable New request 入口(暫時性)**
- Before:掣常駐 + `/requests/new` route 打得入
- After:單一 flag 常數(預設 off)⇒ 掣唔 render + route 重定向返 `/requests`
- 🔴 **要易還原**:Chris 明講「暫時」⇒ 用 flag 而唔係刪 code,將來改一個 boolean 就返嚟

**B — Pagination 共用元件**
- 新 `apps/web/src/components/ui/pagination.tsx`,重建 handoff `design-system/components/navigation/Pagination.jsx`(range summary + `‹` + 最多 5 個 window 頁碼 + `›`)
- 🟢 **owner-approved 擴充**:加 `«` `»` first/last(Chris 2026-08-12 批)—— handoff 原版冇,229 頁之下由頭去尾要撳幾十次
- Wire `by-opco-view.tsx` **同** `requests.tsx`(Chris 2026-08-12 批兩頁一齊修)

**C — Request detail 兩張單分開 + 建單記錄入 timeline**
- 前端:頭部由「一個號出兩次」改成**兩塊,標明各自係乜**
  - `Onboarding request` — `req.serviceNowNumber`,標明「raised by n8n / source of this onboarding」
  - `Licence request` — 逐條 line 自己個 `serviceNowNumber`(RITM),標明「raised by this platform」
  - 🔴 **line item 卡本身亦要顯示自己個 RITM 號**(而家完全冇)
- 後端:`raiseLicenceRequest` **submit 成功之後**寫一條 `RequestEvent`(`type = NOTE`)
  - 🟢 **順帶補一個真空**:平台自己嗰張**父 REQ 號**喺 schema 上**冇欄可以住**(`schema.prisma:296-297` 刻意設計,避免兩個 idempotency key 候選)⇒ 呢條 event 會係**全系統唯一保存到佢嘅地方**(而家只有 log)
  - 🔴 **non-fatal**:寫唔到唔可以令一個已經成功嘅 intake 失敗(同 CH-023 P1 同一形狀)
  - 🔴 **once-only**:重複 push 唔可以重複寫 —— 靠既有 `if (lines.some(l => l.serviceNowSysId)) return` 早退,event 寫喺佢之後

**D — Sync 檢查點文案 + assign 完狀態**
- 文案:`Account created` → **`AD account created`**;`Known to ServiceNow` → **`Synced to ServiceNow`**(第二步 `Synced to Azure AD` 唔郁)
- 狀態:sync row 右邊由「只睇兩道閘」改成**先睇 line item**:全部 active line 已 `ASSIGNED` → **`License assigned`**(tone ok);否則維持現有三態

**E — By OpCo status badge 改名**
- `ledger.ts:51` `Headroom` → **`Available`**(同表頭 `Available` 欄一致,Chris 2026-08-12 批)
- KPI card 個 `Headroom` **保留唔改** —— 佢係「總剩餘量」,同 badge 唔同角色

### 2.2 Out of Scope（explicit）

- ❌ **Platform view 加 `In M365` 欄** —— §6 提咗建議(`tenantConsumed` 已經喺 API 回應),但 Chris 只要求「先說明」,未批改動。要做另開單
- ❌ **`deriveStatus` 個 `Ready to assign`** —— 嗰個係 list 欄同 header badge 用,行為正確,唔郁
- ❌ **`outbound-request.service.ts` 加同款 event** —— 嗰條路嘅入口正正就係 A 要 disable 嘅 New request ⇒ 加咗都冇路驗證。**明知留低,唔係漏**
- ❌ **`intakeNative` / `intakeCanonical` 加 event** —— 呢兩條路**根本冇 call `raiseLicenceRequest`**(已 grep 全檔確認),冇單可記
- ❌ **追溯補舊 request 嘅 event** —— 唔會捏造一條「當時發生過」嘅記錄(R1)
- ❌ 任何 schema / migration / API 契約改動
- ❌ ServiceNow 側任何寫入行為改動

## 3. Acceptance Criteria

- [ ] **A1** flag off:Requests 頁**冇** New request 掣;直接打 `/requests/new` **重定向**返 `/requests`
- [ ] **A2** flag on:兩者行為同今日**逐字一樣**(test 兩個方向)
- [ ] **B1** 2283 行 / 10 per page:頁碼掣**最多 5 個**,另加 `«` `‹` `›` `»`,range summary 保留 `1–10 of 2283`
- [ ] **B2** 邊界:第 1 頁 `«` `‹` disabled;最後一頁 `»` `›` disabled;pageCount ≤ 5 時**唔出現省略行為**
- [ ] **B3** `requests.tsx` 同 `by-opco-view.tsx` 用**同一個**元件(唔係兩份 copy)
- [ ] **C1** Request detail 頭部**同時**見到兩個號,各自標明邊個系統開;line item 卡見到自己個 RITM
- [ ] **C2** 冇 RITM 嘅 line **唔會**出一個空白 / `—` 標籤扮有單(直接唔顯示)
- [ ] **C3** flat intake 成功開單後,Operational history 出一條 NOTE,**內含平台個 REQ 號**
- [ ] **C4** `requestEvent.create` reject → intake **仍然成功**,回傳形狀逐字不變(test)
- [ ] **C5** 重複 push 同一個 `serviceNowSysId` → **唔會**多一條 event(test)
- [ ] **D1** 三個檢查點文案 = `AD account created` / `Synced to Azure AD` / `Synced to ServiceNow`
- [ ] **D2** 全部 active line `ASSIGNED` 時,sync row 顯示 `License assigned`,**唔再**顯示 `Ready to assign`
- [ ] **D3** 仲有 line 未派 + 兩閘已開 → 維持 `Ready to assign`(唔可以一有 assigned 就跳)
- [ ] **E1** badge 出 `Available`;`Empty` / `Fully allocated` / `Over-allocated` 三個**一個字唔改**
- [ ] **T1** `npm test -w @uop/web` 全綠(含 §5 R3 要改嘅既有 test)
- [ ] **T2** `npm test -w @uop/api` 全綠
- [ ] **T3** root lint 0 warning + api tsc 0 error
- [ ] **T4** 🔴 **Falsification**:拆走 D2 個 line-item 判斷 ⇒ 對應 test 要**真紅**(唔係 tautology,CH-023 教訓)
- [ ] **H6** commit 前跑 `ui-design` skill;**light + dark 兩邊都真 render 睇過**

## 4. Risks

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | C 條 event **只有將來嘅 intake 先有**,已存在 request 永遠冇 | High | Low | spec 明文寫死唔追溯;UI 上「冇 event」同「當時冇開單」讀落一樣,但捏造歷史更差 |
| R2 | `«` `»` 偏離 handoff | — | Low | Chris 2026-08-12 明批;**必須同步寫入 `design-system.md` navigation 段**,否則下個 session 會當佢係 drift |
| R3 | 改文案 / 改 badge 名撞爛既有 test | High | Low | 已定位三處:`ledger.test.ts:90,114,121`(Headroom)、`request-detail.sn-gate.test.tsx:213`(`getAllByText('Ready to assign')` 期望 **2** 個,改完 sync row 會變 1)、`request-detail.sync-check.test.tsx:212`。**逐條睇住改,唔可以為咗轉綠而放寬 assert** |
| R4 | B 抽共用元件時順手改到 requests 頁其他嘢 | Med | Med | §1.3 surgical:只換 pager 嗰個 `<div>`,filter / table / row 一行唔郁 |
| R5 | C 個 event 寫喺 transaction 入面拖死 intake | Low | High | 明確寫喺 `$transaction` **之外**、`submitted` 成功之後,try/catch 包住(CH-023 P1/P2 同款) |

## 5. Effort Estimate

**約 4–6 小時**(A ≈ 0.5h · B ≈ 1.5h · C ≈ 2h · D ≈ 1h · E ≈ 0.25h · 驗證 + doc-sync ≈ 1h)

## 6. 附:第 5 點嘅答案（唔喺本單改,記低免得下次再問）

**By OpCo `Headroom` badge** = `allocated − assigned > 0`,即「仲有位」。同一個數喺同一頁三個名(表頭 `Available` / KPI card `Headroom` / badge `Headroom`)—— E 收其中一半。

**Platform view 四個數字**(`tenant-owned.service.ts:19-91` 逐行 trace):

| 欄 | 計法 | 來源 | 邊個改到 |
|---|---|---|---|
| Owned | `TenantSkuSnapshot.prepaidEnabled`(每 SKU 取最新一筆) | **M365 真相** | SKU Catalog → sync from tenant |
| Allocated | `Σ OpcoSkuLedger.allocatedQuantity` 跨全部 OpCo | **平台自己嘅帳** | allocation import CSV / By OpCo 手動改 |
| Assigned | `Σ OpcoSkuLedger.assignedQuantity` | **平台自己嘅帳** | 每次 assign +1 / import / 手動改 |
| Unalloc. | `Owned − Allocated`;Owned 未 sync(null)→ 顯示 `—` | 即場計,唔存 | — |

🔴 **`Assigned` 唔係 M365 真實用量**。M365 真實用量係同一筆 snapshot 嘅 `consumedUnits`(API 出咗做 `tenantConsumed`),但**呢個表冇顯示**。兩者差幾多就係 **Drift 頁**存在嘅原因(`schema.prisma:196-207`)。⇒ 建議 Platform 表加一欄 `In M365`(零後端改動),**但未批,見 §2.2**。

## 7. Spec Changelog（deviation log）

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-08-12 | Initial draft | Chris 五點 review | — |

---

**Lifecycle reminder**:呢份 spec locked after status=approved。重大 deviation → §7 changelog。
**Gate reminder**:status 由 AI 標 `proposed`,**用戶 review + approve 先可以 `approved` + 開始 code**(PROCESS R1.change)。
