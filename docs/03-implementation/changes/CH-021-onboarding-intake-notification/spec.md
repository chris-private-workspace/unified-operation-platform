---
change_id: CH-021
title: "Onboarding intake 之後通知操作人員"
status: approved
created: 2026-08-09
approved: 2026-08-11
target_completion: 2026-08-11
affects_components: [fulfilment, integration/email]
spec_refs:
  - adr/0019-acs-email-notification-transport.md D3
  - adr/0020-default-onboarding-sku-injection.md D6
  - adr/0011-outbound-delivery-failure-recovery.md
---

# CH-021 — Onboarding intake 之後通知操作人員

> **Spec version**:1.0
> **Owner**:AI
> **Approved by**:**Chris Lai(2026-08-11)** —— spec 自此 locked,deviation 走 §7 changelog

## 1. Context (Why)

2026-08-09 Chris 逐步對帳「n8n → onboarding → assign → SN complete」九步流程,揭出**唯一完全未起**嗰步:一張 request 由 n8n 入到平台之後,**冇任何人收到通知**。今日要有人主動去開 Requests 頁先發現有新單。

**查證結果 —— 基建齊,缺嘅係三件細嘢:**

| 已有 | 證據 |
|---|---|
| ACS transport | `ACS_CONNECTION_STRING` / `ACS_SENDER_ADDRESS` 已配置並用緊(password reset) |
| Dispatch + 失敗入佇列 | `NotificationDispatchService`(CH-011 / ADR-0019 D3),失敗 → `OutboundFailure` |
| 平台網址(砌 link 用) | `APP_BASE_URL`(W41) |

| 缺 | |
|---|---|
| Template | `templates.ts:28` 得 `connectivity-check` / `password-reset` |
| Caller | intake 路徑零 `send` —— production caller 只有 password reset + retry queue |
| **收件人 policy** | 🔴 `notification.service.ts:24-27` 明文:呢個 policy **唔存在於 codebase** |

**收件人 policy 已由 Chris 拍板(2026-08-09)= 兩者都要**:該 OpCo 嘅 `OPCO_IT` 收正本 + 一個固定 ops mailbox 收副本。

**分類**:改現有 feature 行為(intake 多一個副作用)· scope < 3 日 · acceptance 明確 ⇒ **Change workflow**(PROCESS §1.1)。

**唔使 ADR**:冇改四層地基 / module 邊界 / vendor / Prisma schema / 任何已 lock 決策。transport 決策由 **ADR-0019 D3** 涵蓋,本 CH 只係加多一個 caller 同一個 template。加 env var 屬配置,唔觸發 H2。

## 2. Scope (What)

### 2.1 Behavior Change

- **Before**:`POST /requests/intake`(flat / canonical / native 三條路)建完 request 就完,無人知。
- **After**:**新建**一張 request 之後,向該 OpCo 嘅 active `OPCO_IT` + ops mailbox 各發一封通知。**重推同一個 REQ 唔會再發。**

### 2.2 In Scope

**① 新 template `onboarding-intake`**(`integration/email/templates.ts`)

內容:target displayName + UPN · OpCo code · REQ number · line item(SKU part number × qty)· 一條去 request detail 嘅 link(`<APP_BASE_URL>/requests/<id>`)。

**② 收件人 resolver**(新 `fulfilment/intake-notification-recipients.ts`)

```
OPCO_IT:  AppUser where role=OPCO_IT AND opcoScopeId=request.opcoId AND active=true
ops:      env OPS_NOTIFICATION_MAILBOX(optional,單一地址)
```

- 兩邊都空 → **log warn,唔 throw**(見 §2.4 D3)
- 去重:同一地址喺兩邊都出現只發一次

**③ Caller**(`intake-adapter.service.ts` + `intake.controller.ts` canonical 路)

擺喺 `raiseLicenceRequest` **之後**,同樣 **fail-soft**(ADR-0020 D6 / ADR-0011 OD4 同一判斷:一封通知寄唔出,唔可以令一張已經寫咗嘅 onboarding 變成失敗)。

**④ 新 env `OPS_NOTIFICATION_MAILBOX`**

`get` 唔用 `getOrThrow` —— 同 `APP_BASE_URL` 同一理由:一個可選功能配置錯,唔應該令平台起唔到身(ADR-0019 D4 / BUG-008)。

### 2.3 Out of Scope（explicit）

- ❌ **通知偏好 UI / 訂閱管理** —— 產品功能,唔係本 CH
- ❌ **其他事件嘅通知**(assign 成功 / stage 推進 / drift)—— 本 CH 只做 intake
- ❌ **通知 target user 本人** —— 佢個 account 未必開好,而且 H3 scope 外
- ❌ **REGIONAL / ADMIN 收通知** —— 佢哋睇全部 OpCo,會被 24 個 OpCo 嘅單淹冇。要就設 ops mailbox
- ❌ **Schema 改動**(例如 `Request.notifiedAt`)—— 見 §2.4 D1,冪等唔使加欄

### 2.4 三個設計決定(實作前定死,免得中途走樣)

**D1 — 冪等靠「係咪新建」,唔加 schema 欄**

🔴 intake **對 `Request.serviceNowSysId` 冪等**(`intake.service.ts:61-67`):重推返返舊嗰張。冇 guard 嘅話,n8n 每次 retry(1001 個 `maxTries:3`)都會再寄一封。

`intakeFlat` 已經有 `preExisting` 呢個 pattern(為咗唔錯誤 audit injection),但佢**只喺 `injected` 為 true 先查**。本 CH 把佢改成**無條件查**,兩個用途共用同一個結果。

- 代價:每次 intake 多一個 `findUnique`(有 `@unique` index)
- 🔴 **唔加 `Request.notifiedAt`** —— 加欄 = Prisma schema 改動 = **H1**,而佢換唔到任何額外保證(已存在嘅 request 本來就唔應該再通知)

**D2 — 三條 intake 路都要通知,but 一個 caller**

`POST /requests/intake` 有兩個 contract(canonical / flat)、另有 `/intake/n8n`。三條最終都入 `IntakeService.intake`。通知**唔擺喺 `IntakeService`** —— 佢係 shared writer,擺落去會令**另一個 caller** 建 request 嗰陣都寄一封。⇒ 擺喺 adapter / controller 層,同 `raiseLicenceRequest` 同一位置。

> 🔴 **2026-08-11 實作前查證 —— 本段原文點錯咗個 caller,結論唔變。**
> 原文寫「會令 **`outbound-retry.service.ts`** 重建 request 嗰陣都寄一封」。實測 `Grep intake\.intake` 全 `src/`:**`outbound-retry.service.ts` 由頭到尾冇 call 過 `IntakeService`**。
> 真正嘅第二個 caller 係 **`servicenow-import.service.ts`**(CH-013 / ADR-0021 —— ADMIN 喺 UI 手動 import 一個 SN REQ),佢自己個註釋(`:26`)就寫住「This is the second caller of `IntakeService`」。
> ⇒ **D2 個結論(唔擺落 `IntakeService`)仍然成立**,但理由變咗:唔係「避免 repair 路重複寄」,而係 **§2.1 明文只涵蓋三條 intake 路,SN import 唔喺 scope 入面**。
> ⚠️ **順帶開一條 open question 畀 Chris(唔喺本 CH 做)**:ADMIN 手動 import 一張 REQ 之後,**該 OpCo 嘅 IT 應唔應該收通知?** 佢同 n8n intake 一樣係「平台第一次見到呢張單」,分別只在觸發者係人。本 CH 按 spec 唔寄,要改就開新 CH。

**D3 — 冇收件人 = log warn,唔係 error**

一個 OpCo 未配 `OPCO_IT` 用戶係真實情況(24 個 OpCo,seed 只有 RHK 有)。⇒ 冇人收 **唔阻止 request 建立**,但要喺 log 講明,否則「通知功能好似 work」但實際冇人收到。

⚠️ 與 `not_configured` 嘅分別:ACS 未配置 → `NotificationDispatchService` 已經會入佇列(CH-011 刻意)。「冇收件人」係**另一件事** —— 冇嘢寄得出,入佇列冇意義(repair 都唔知寄畀邊個)⇒ 只 log。

## 3. Acceptance Criteria

- [ ] A1 新建 request(flat `mode:1`)→ 該 OpCo active `OPCO_IT` 每人一封 + ops mailbox 一封
- [ ] A2 🔴 **重推同一個 REQ → 一封都唔寄**(D1;test 明確 assert `send` 冇被呼叫)
- [ ] A3 canonical contract(冇 `mode`)同 `/intake/n8n` 一樣寄
- [ ] A4 OpCo 冇 active `OPCO_IT` 且 `OPS_NOTIFICATION_MAILBOX` 未設 → **log warn,request 照建,零 throw**
- [ ] A5 同一地址喺兩邊都命中 → 只寄一次
- [ ] A6 🔴 **寄信 throw → request 仍然 201**,失敗入 `OutboundFailure`(fail-soft)
- [ ] A7 inactive `OPCO_IT` 用戶**唔會**收到
- [ ] A8 🔴 **H4**:通知內容含 UPN(收件人係 IT,合理),但 **log line 一個字都唔可以有 UPN / email**
- [ ] A9 template 三部分齊(`subject` / `text` / `html`),`text` 唔可以空(ADR-0019 既有規矩)
- [ ] A10 `OPS_NOTIFICATION_MAILBOX` 寫入 `.env.example` 並註明 optional + 唔設嘅後果
- [ ] A11 `npm run lint`(root)exit 0 · api tsc 0 · 既有 test 一條唔跌
- [ ] A12 live 驗:DEV 真寄一次,收到信 + 條 link 撳得開

## 4. Risks

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | 🔴 n8n retry 導致重複寄信 | **High** | Med | D1 冪等 guard + A2 明確 test |
| R2 | 通知內容洩 PII 落 log | Med | **High** | A8;`scrub-pii.ts` 已存在,log 只寫 request id + OpCo + 收件人數目 |
| R3 | ACS sender domain 未驗證 → 收貨但唔送達,API 照返 Succeeded | Med | Med | CH-011 R1 已知;A12 真寄係唯一證據 |
| R4 | OpCo IT 名單大 → 一張單寄好多封 | Low | Low | 今日每 OpCo 得幾個人;真係多就再議(唔預先優化) |
| R5 | ops mailbox 收 24 個 OpCo 全部單 → 被忽略 | Med | Low | 已知取捨(Chris 揀「兩者都要」);subject 帶 OpCo code 方便過濾 |

## 5. Effort Estimate

1–1.5 日(template + resolver + caller + test + live 驗)。

## 6. Dependencies

- ✅ ADR-0019 / CH-011 ACS transport(已 live 用緊)
- ✅ `APP_BASE_URL`(W41)
- ⚠️ **DEV 環境要有 `OPS_NOTIFICATION_MAILBOX`** ⇒ A12 要 PATCH 一次 DEV env(`patch-deploy-dev.ps1` 加一個 key)

## 7. Spec Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-08-09 | Initial draft | Chris 端到端對帳揭出缺口;收件人 policy 同日拍板「兩者都要」 | _pending_ |
| 2026-08-11 | **approved** | Chris approve ⇒ spec locked,開工 | Chris |
| 2026-08-11 | §2.4 D2 加查證註 | 原文點錯咗第二個 caller(寫 `outbound-retry`,實際係 `servicenow-import`)。**結論唔變**,但理由由「避免 repair 重寄」改成「SN import 唔喺 §2.1 scope」;順帶開一條 OQ | AI(記錄)|

---

**Lifecycle reminder**:spec locked after status=approved。重大 deviation → §7 changelog。
