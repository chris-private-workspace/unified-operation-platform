---
change_id: CH-025
title: "Request 完成之後真係要收得晒 + Category 欄唔好教錯人"
status: approved
created: 2026-08-12
target_completion: 2026-08-13
affects_components: [apps/web, apps/api/fulfilment]
spec_refs:
  - CLAUDE.md §5 H6(Design Fidelity)
  - CH-007 D6(platform-created 唔可以加 line)
  - CH-024 D(allLinesAssigned)
---

# CH-025 — 完成之後收得晒 + Category 欄唔好教錯人

> **Spec version**:1.0(initial)
> **Owner**:Chris Lai
> **Approved by**:Chris Lai(2026-08-12,scope + acceptance 原樣批;OQ-1 未答 ⇒ 用 spec default「算完成」)
> **分類**:Change(< 1 日)—— 三項都係改既有 feature 嘅行為 / 文案

## 1. Context (Why)

Chris 2026-08-12 提出四點,其中三點收喺本單(第四點 unlimited SKU 因為未知數多過已知數,另開 **CH-026**)。

| # | Chris 原話 | 查證結果 |
|---|---|---|
| 1 | 「即使已經 assign 咗 license,個 step 應該多一個 completed 去令 timeline 結束」 | `stepper.tsx:39` `done = i < currentIdx` ⇒ **current 永遠唔算 done** ⇒ `ASSIGNED` 個 dot 空心 + 帶住「進行中」嘅 accent ring |
| 3 | 「即使 request 已經 complete,仲可以 add line item,唔可以」 | 🔴 **前後端都冇擋** —— `request.service.ts:94` 只擋 `platform-created` |
| 2 | 「Category 欄個 example 要改,而家個逗號會令人以為可以填多個」 | `catalog.tsx:137` placeholder = `"e.g. Base, Add-on, Power Platform"` |

### 1.1 🔴 第 3 點唔止係 UI

後端 `addLineItem` **一個字都冇擋已完成**,所以就算前端收起個掣,`POST /fulfilment/requests/:id/line-items` **照加得**。加完仲會經 `recomputeRequestStatus` 把 `COMPLETED` **打返** `IN_PROGRESS` ⇒ 一個已經交付完嘅 onboarding 會靜靜「翻生」。

🟢 好消息:「完成」已經有**唯一一個**權威定義 —— `stage.service.ts:61` `aggregateRequestStatus`:全部非 `CANCELLED` 嘅 line 都 `ASSIGNED` → `COMPLETED`。本單**重用佢,唔另寫**。

### 1.2 🔴 第 1 點嘅陷阱(Chris 2026-08-12 拍板揀咗「真係加第 4 個 dot」)

`SHORT_STEPS` / `PROC_STEPS` **同時**係 stepper 嘅顯示來源同 `nextStage()` 嘅來源。直接加 `'COMPLETED'` 落去,`nextStage(ASSIGNED)` 會返 `'COMPLETED'`,而 `request-detail.tsx:783` 係 `{next && !isReady && <Button>Advance stage</Button>}` ⇒ **一條已完成嘅 line 會冒出「Advance stage」掣**,撳落去送一個 `LineItemStage` 根本冇嘅值 → 400。

⇒ **解法:顯示用嘅 steps 同 stage machine 用嘅 steps 分家。** `stepsFor()`(餵 `nextStage`)**一個字唔改**;另開一個 display-only 嘅 `displayStepsFor()`。

## 2. Scope (What)

### 2.1 In Scope

**A — Stepper 收得晒(問題 1)**
- 新 `displayStepsFor(item)` = `[...stepsFor(item), 'Completed']`(short 3→**4** dots · procurement 6→**7**)
- `ASSIGNED` 時 current 落喺**最後嗰個** dot ⇒ `Step 4/4`(而唔係 3/4,「4/4」先讀得出完結)
- 最後嗰個 dot 喺 current 嗰陣 render 一個 **lucide `Check`**,唔係空心 dot + ring
- 🔴 `stepsFor()` / `nextStage()` / `LineItemStage` enum / 後端 stage machine **一個字唔改**

**B — Category 欄文案(問題 2)**
- placeholder 由 `"e.g. Base, Add-on, Power Platform"` 改成**單一個值**嘅例子
- 加一句 hint 講明**一個 SKU 一個 category**
- 🔴 同時檢查 **CSV import 路**(`catalog-import`)有冇同款逗號暗示 —— 有就一齊改(同一個誤解,兩個入口)

**C — 完成之後唔可以再加 line(問題 3)**
- **後端**(權威):`addLineItem` 加一道 guard —— 用 `aggregateRequestStatus` 重算,`COMPLETED` → `ConflictException`
- **前端**(唔好offer 一個會 bounce 嘅掣):`canAddLine` 加 `&& !allLinesAssigned(req)`
- 🔴 **收起,唔係 disable** —— 同 CH-024 A 一致:一個撳唔到嘅掣讀落係「壞咗」

### 2.2 Out of Scope（explicit）

- ❌ **問題 4(unlimited SKU)** —— 未知數多過已知數,見 **CH-026**
- ❌ **`LineItemStage` 加 `COMPLETED` enum 值** —— 🔴 = schema + stage machine 改動 = **H1**。本單個 `'Completed'` **純粹係前端顯示字串**,零後端概念
- ❌ **`advanceStage` / `assign` 嘅任何 guard** —— 本單只掂 `addLineItem` 一條路
- ❌ **`removeLineItem` 加同款 guard** —— `canRemoveLine` 已經要求 `stage === 'REQUESTED'` 兼且冇 RITM,一條 `ASSIGNED` 嘅 line 本來就刪唔到。**冇缺口就唔加 code**
- ❌ 重新定義「完成」/ 掂 `RequestStatus` enum
- ❌ 任何 schema / migration / API 契約形狀改動

## 3. Acceptance Criteria

- [ ] **A1** 一條 `ASSIGNED` 嘅 short-path line:stepper 出 **4 個** dot,最後嗰個係 **✓**,文字 `Step 4/4`
- [ ] **A2** procurement path 同款:**7 個** dot,`Step 7/7`
- [ ] **A3**(🔴 **2026-08-12 render 時更正,見下**)未完成嘅 line(`READY`)第 2 個 dot 仍然帶 ring、**冇 tick**、`Add line item` 仍然出;但**分母跟住變 4**(`Step 2/4`)

> 🔴 **A3 原文寫錯咗,而錯法值得記**。原文係「**逐字不變**:3 dots、`Step 2/3`」—— 但**佢同 A1 唔可能同時成立**:第 4 個 dot 要嘛由頭到尾都喺(未完成嗰陣分母就係 4),要嘛派完先突然出現(**timeline 會撳一下由 3 個 dot 變 4 個**,讀落似 bug)。寫 spec 嗰陣冇諗到呢兩者互斥,render 出嚟見到 `Step 2/4` 先發現。
> **揀咗「由頭到尾 4 個」** —— 操作員一開始就見到「呢條路 4 步、最後一步係 Completed」,呢個預期性本身就係 Chris 要嘅嘢。⇒ A3 改成守真正應該不變嗰啲(ring 位置 · 冇 tick · 掣仲喺),而唔係守一個同 A1 打對台嘅數字。
- [ ] **A4** 🔴 `ASSIGNED` 嘅 line **冇** `Advance stage` 掣(即 `nextStage` 冇被污染)—— test 直接 assert `nextStage(ASSIGNED) === null`
- [ ] **B1** Edit SKU dialog 個 Category placeholder **冇逗號**,而且有一句講明一個 SKU 一個 category
- [ ] **B2** CSV import 路(如果有同款暗示)一齊改;冇就喺 progress 明文寫「查過,冇」
- [ ] **C1** 後端:對一個全部 line `ASSIGNED` 嘅 request `POST` 一條新 line → **409**,而且 **DB 零改動**(唔可以有 line、唔可以有 event、status 仍然 `COMPLETED`)
- [ ] **C2** 後端:未完成嘅 request 加 line **仍然得**(唔可以順手擋死)
- [ ] **C3** 後端:全部 line `CANCELLED` 嘅 request **唔算完成**(照舊可以加)—— 對齊 `allLinesAssigned` 同 `aggregateRequestStatus` 兩者
- [ ] **C4** 前端:完成嘅 request **冇** `Add line item` 掣(唔係 disabled)
- [ ] **T1** `npm test -w @uop/api` 全綠 · **T2** `npm test -w @uop/web` 全綠(pre-existing 6 條紅唔計)
- [ ] **T3** api lint exit 0 · web tsc exit 0
- [ ] **T4** 🔴 **Falsification**:拆走 C 個後端 guard ⇒ C1 條 test 必須**真紅**;拆走 A 個 display-steps 分家 ⇒ A4 必須**真紅**
- [ ] **H6** 跑 `ui-design` skill;**light + dark 真 render**(request detail 完成態 + SKU Catalog edit dialog)

## 4. Risks

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | 加第 4 個 dot 污染 `nextStage` ⇒ 冒出一個會 400 嘅 `Advance stage` 掣 | **High** | **High** | §1.2 個分家設計 + **A4 專門一條 test** 釘住。呢個係本單唯一一個「改顯示會整爛行為」嘅位 |
| R2 | 後端 guard 用 persisted `request.status` 而佢同實際 line 唔同步 | Low | Med | **唔用 persisted 值**,查 line items 用 `aggregateRequestStatus` 重算 —— 同 `recomputeRequestStatus` 同一個 pure function,結構上唔會漂 |
| R3 | C 擋得太闊,連正常補加 line 都擋咗 | Low | High | C2 / C3 兩條 test 專門守呢個邊界。⚠️ 全 `CANCELLED` **唔算完成**,呢個界線兩個 helper 都要對得返 |
| R4 | 改 `Stepper` 撞爛其他用佢嘅畫面 | Low | Med | 先 grep 全部 caller;新行為只喺「current 落喺最後一個 step」先觸發,其餘一律走原路 |

## 5. Effort Estimate

**約 2–3 小時**(A ≈ 1h · B ≈ 0.25h · C ≈ 1h · 驗證 + doc-sync ≈ 0.75h)

## 6. Open Questions

- **OQ-1** — 一條 `CANCELLED` line 之後,個 request 只剩 `ASSIGNED` 嘅 line,佢算唔算完成?**本單 default = 算**(`aggregateRequestStatus` 一直都係咁,`allLinesAssigned` CH-024 亦係咁)。如果 Chris 覺得應該唔算,要一齊改兩個 helper —— 嗰個係行為改動,唔喺本單。

## 7. Spec Changelog（deviation log）

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-08-12 | Initial draft | Chris 四點 review 其中三點 | — |
| 2026-08-12 | 問題 1 揀「真係加第 4 個 dot」而唔係「最後一步填實」 | Chris 拍板;連帶要 §1.2 個分家設計 + R1 | Chris Lai |
| 2026-08-12 | **更正 A3** —— 原文要求未完成嘅 line「逐字不變 3 dots / `Step 2/3`」,**同 A1 互斥**(第 4 個 dot 唔可以「只喺派完先出現」,否則 timeline 會撳一下自己變長)。改成:分母跟住變 4,守 ring 位置 / 冇 tick / 掣仲喺 | 寫 spec 時冇察覺兩條 acceptance 打對台;render 出嚟見到 `Step 2/4` 先發現(§3 A3 blockquote) | AI(自揭,已向 Chris surface) |

---

**Gate reminder**:status 由 AI 標 `proposed`,**用戶 review + approve 先可以 `approved` + 開始 code**(PROCESS R1.change)。
