# CH-021 — Progress

## Day 1（2026-08-11）— spec approve → 實作 → test

Chris 同日 approve **INTAKE-REQUESTER** 同 **NOTIFY-1**,並指示由 CH-021 開工。

---

### 開工之前查證咗三樣，其中一樣推翻咗 spec 一句

**① 三條 intake 路實際點入 `IntakeService`**(唔靠 spec 轉述)

| 路 | 入口 | 之前點行 |
|---|---|---|
| canonical(冇 `mode`) | `IntakeController.push` | **直接** `this.intake.intake(dto)` |
| flat(`mode:1`) | `IntakeAdapterService.intakeFlat` | 經 adapter |
| native(`/intake/n8n`) | `IntakeAdapterService.intakeNative` | 經 adapter |

⇒ **canonical 路根本冇 `preExisting` 檢查**,而 A3 要求佢都要寄。呢個係 F3-4 嗰格要諗清楚嘅位。

**② 🔴 spec §2.4 D2 點錯咗第二個 caller**

D2 寫住「擺落 `IntakeService` 會令 **`outbound-retry.service.ts`** 重建 request 嗰陣都寄一封」。

`Grep intake\.intake` 掃全 `src/` 實測:**`outbound-retry.service.ts` 由頭到尾冇 call 過 `IntakeService`。** 真正嘅第二個 caller 係 **`servicenow-import.service.ts`**(CH-013 / ADR-0021 —— ADMIN 喺 UI 手動 import 一張 SN REQ),佢自己個註釋 `:26` 就寫住「This is the second caller of `IntakeService`」。

⇒ **D2 個結論仍然成立**(唔擺落 `IntakeService`),但理由變咗:唔係「避免 repair 路重複寄」,而係 **§2.1 明文只涵蓋三條 intake 路**。已寫入 spec §2.4 查證註 + §7 changelog。

📌 **順帶開一條 OQ 畀 Chris(本 CH 唔做)**:ADMIN 手動 import 一張 REQ 之後,該 OpCo 嘅 IT 應唔應該收通知?佢同 n8n intake 一樣係「平台第一次見到呢張單」,分別只在觸發者係人。

**③ `REPLAYABLE_TEMPLATES` 明文要求新 template 主動申請**(F1-5)

`templates.ts:197` 寫住「A new template has to ask to be here」。**答案 = 唔加**,理由同 `password-reset` **結構相同但外衣唔同**:佢個內容唔係 single-use,但**一樣冇被持久化** —— queue row 只帶 `to` 同 `template`(`PAYLOAD_WHITELIST`),replay 會用 `{}` render,寄出一封冇 target、冇 OpCo、冇 link 嘅摘要。**唔危險,但無用,而且對撳 retry 嗰個操作員嚟講睇落好似成功咗。**

---

### 🔴 呢個決定連帶揭咗一個我自己會製造嘅缺陷

Retry 拒絕嗰句寫死咗:

> `'${template}' cannot be re-sent from the queue because its contents are **single-use**. Ask the **recipient** to request it again.

對 `password-reset` 啱,對 `onboarding-intake` **兩個位都錯**(內容唔係 single-use;叫「recipient 再要求一次」對一封 onboarding 通知冇意義)。

⇒ 改成兩者共有嘅**結構性**理由:「the queue does not store template parameters, so a replay would send an incomplete message. Trigger it again from the source.」

⚠️ **既有嗰條 test assert `/single-use/`** —— 改字就要改佢。**冇靜靜改細佢**:原本條 test 個註釋講明點解要 assert message 而唔係 type(當年 `password-reset` 由 unknown-template 分支靜靜搬去呢個分支,`toThrow(BadRequestException)` 兩邊都會綠)。呢個性質**逐字保留**,只係換咗新 regex,並且改成 `it.each` **兩個 template 各驗一次**。

---

### 設計:F3-4 點解揀「三條路嘅副作用全部收喺 adapter」

Canonical 路要 `preExisting`,而佢住喺 controller。三個選項:

| 選項 | 問題 |
|---|---|
| controller 直接打 Prisma | 一個 `@Public()` controller 入面做 orchestration |
| 改 `IntakeService` 返多一個「係咪新建」flag | 佢個回傳值**直接做 HTTP response**,= 改 LOCKED contract 嘅形狀 |
| **✅ 加 `intakeCanonical` 落 adapter** | adapter 個名變窄咗 —— 用註釋處理 |

揀第三個,因為另外兩個都會製造**第二個決定「幾時算新」嘅地方**。而「兩處各自維護同一件事」正正係呢個 repo 由 BUG-004 起數落嚟第六次嘅 pattern。

`IntakeAdapterService` 個 class doc 補咗一段講清楚佢**今日實際擁有嘅係「每個 intake 副作用,一個檔」**,唔再只係 translator。**冇改名** —— ADR-0017 D4 同一堆 commit 都引用緊佢。

順帶:`IntakeController` 個 `IntakeService` 依賴變咗 orphan,**刪咗**(§1.3)。

---

### 🔴 而呢個改動令一條既有 assert 靜靜變成 tautology —— 主動搬咗層

`intake.controller.spec.ts` 原本有:

```ts
expect(intake.intake.mock.calls[0][1]).toBeUndefined();
```

守住「canonical caller 唔可以到達 by-task close route」(嗰條路繞過 ADR-0018 D3「一張 RITM 只准一個 active task」嘅保護)。

Controller 改成 call `intakeCanonical(dto)` **之後,`calls[0][1]` 係 undefined 因為個 method 得一個參數** —— 由 TypeScript 保證,唔係由意圖保證。**留喺度就會變成一條「睇落嚴謹但捉唔到嘢」嘅 assert**,而且 adapter 開始 forward task ref 佢一樣綠。

⇒ 搬去 `intake-adapter.service.spec.ts`,而且**改成 assert 寫入嘅 row**(`serviceNowTaskSysId: null`)而唔係 call shape —— 咁樣無論個參數點寫都捉得到。兩邊都留咗註釋講明點解搬。

📌 **呢個係 2026-08-10 嗰三次同族錯誤嘅反面應用** —— 嗰三次係事後被 falsification 揭穿,今次係改動嗰刻自己認出個形狀。

---

### 落地清單

| 檔 | 做咗乜 |
|---|---|
| `integration/email/templates.ts` | `TemplateKey` 加 `onboarding-intake` + template 函數 + `REPLAYABLE_TEMPLATES` 決定寫入註釋 |
| `fulfilment/intake-notification-recipients.ts` | **新** —— pure `dedupeRecipients`(大小寫不敏感 + trim + 保留首次出現次序) |
| `fulfilment/intake-notification.service.ts` | **新** —— 收件人 query + params + dispatch;**永不 throw** |
| `fulfilment/intake-adapter.service.ts` | `preExisting` 改無條件 ×2 · 新 `intakeCanonical` · 三處接通知 · class doc |
| `fulfilment/intake.controller.ts` | canonical 改行 adapter · 刪 orphan 依賴 |
| `fulfilment/fulfilment.module.ts` | provide `IntakeNotificationService` |
| `fulfilment/outbound-retry.service.ts` | 拒絕訊息改成兩個 template 都啱 |
| `apps/api/.env.example` | `OPS_NOTIFICATION_MAILBOX`(optional + 寫明唔設嘅後果 + **佔位唔填真地址**) |

---

### Test（H5）

| 檔 | 覆蓋 |
|---|---|
| `intake-notification-recipients.spec.ts` | **新** —— A5 五條(次序 / 空值 / trim / **大小寫** / 全空) |
| `intake-notification.service.spec.ts` | **新** —— A1 A4 A5 A7 · params · trailing slash · 冇 `APP_BASE_URL` 仍然寄 · **A6 三條 fail-soft** · **A8 logger spy** |
| `integration/email/templates.spec.ts` | **新** —— A9 由 `TEMPLATES` **derive**(唔手抄清單)· subject/text 非空 · escape · `REPLAYABLE_TEMPLATES` 守門 |
| `intake-adapter.service.spec.ts` | A1/A3 三條路各驗 · **A2 三條路 re-push 零寄** · 搬過嚟嗰條 task-ref guard |
| `intake.controller.spec.ts` | 改用 `intakeCanonical`;degraded 嗰半搬走並註明 |

**A8 特別做法**:`jest.spyOn(Logger.prototype, 'warn'/'log')` 收晒 happy + empty 兩條路嘅 log line,`expect(written).not.toMatch(EMAIL_SHAPED)`,**再加兩條正面 assert**(`toContain('r1')` / `toContain('RHK')`)防止佢因為根本冇 log 而空過。
⚠️ 理由:**BUG-004 潛伏 18 日就係因為條 test assert exception message,而洩漏喺 log line**(RISK R5 明文要求)。

---

### 🔴 Falsification（F5-10 — 兩個都真跑）

| 拆咩 | 結果 |
|---|---|
| 三處 `if (!preExisting)` 全部拆走 | **3 failed / 46 passed** —— 精確對上三條 re-push test(canonical / flat / native) |
| `dedupeRecipients` 個 `.toLowerCase()` 拆走 | **2 failed** —— **兩層各一條**(pure spec + service spec) |

第二個結果特別值得記:同一個保證**喺兩層各有一條 test**,呢個正正係 2026-08-10 `apiPatch` / `pendingRestart` 兩單「bug 住喺兩層之間」嘅反面。

---

### 數字

| | before | after |
|---|---|---|
| api test | 937 / 70 suites | **974 / 73 suites** |
| root lint | 0 | **0** |
| api tsc | 0 | **0** |

⚠️ lint 一開始紅咗 21 條,**全部 prettier 格式兼且全部喺我改嗰兩個檔** —— 只 `--fix` 咗嗰兩個,無關嘅一律冇掂。

---

### 仍未做

- [ ] **A12 live 真寄** —— 見 checklist F7。⚠️ 兩個未知數:①本機有冇真 ACS 憑證(**要查證,唔好假設**)②DEV 要 PATCH 一個 `OPS_NOTIFICATION_MAILBOX`
- 🔴 **CH-011 R1 仍然成立**:ACS 返 `Succeeded` **證明唔到收到**(custom sender domain 可以靜靜唔送達)⇒ A12 一定要以「收件人真係收到」為準
