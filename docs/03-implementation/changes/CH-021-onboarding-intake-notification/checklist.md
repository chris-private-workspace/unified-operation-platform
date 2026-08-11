# CH-021 — Checklist

> **Status**:✅ **done**(2026-08-11 —— code + test + **A12 live 真寄兼 Chris 確認收到**)。決策依據 = `spec.md`(**approved,locked**)。
> **零 schema · 零新 dep · 零 ADR** —— transport 決策由 ADR-0019 D3 涵蓋,本 CH 只加一個 template + 一個 caller + 一個 optional env。

## F0 — 開工 gate

- [x] F0-1 spec `status: draft → approved` + `Approved by` 填實(Chris 2026-08-11)
- [x] F0-2 branch `feat/ch-021-intake-notification`(由 `main` 開)
- [x] F0-3 🔴 **實作前查證三條 intake 路真正入邊度** —— 揭到 **canonical 路喺 controller 直接 call `IntakeService`,冇任何 `preExisting` 檢查**,兼且 **spec D2 點錯咗第二個 caller**(寫 `outbound-retry`,實際係 `servicenow-import`)。結論唔變,理由改寫,已入 spec §2.4 + §7
- [x] F0-4 BACKLOG `NOTIFY-1` 標 approved / 進行中(R7)

## F1 — Template（spec §2.2 ①）

- [x] F1-1 `TemplateKey` 加 `'onboarding-intake'`
- [x] F1-2 template 函數:target displayName + UPN · OpCo code · REQ number · line item(part number × qty)· request detail link
- [x] F1-3 🔴 **A9**:三部分齊 + `text` 非空 —— 由 `TEMPLATES` **derive** 嘅 test 守住(唔手抄清單)
- [x] F1-4 🔴 所有插值行 `escapeHtml`,有一條 `<script>` test 釘住
- [x] F1-5 🔴 **`REPLAYABLE_TEMPLATES` = 唔加**,理由寫入註釋:內容唔係 single-use,但**一樣冇被持久化**(queue row 只帶 `to`+`template`)⇒ replay 會用 `{}` render,寄一封冇 target 冇 link 嘅摘要,**唔危險但無用,而且睇落好似成功**
  - [x] F1-5b 🔴 **連帶修咗一個我自己會製造嘅缺陷** —— retry 拒絕訊息寫死「contents are single-use / ask the recipient」,對新 template 兩個位都錯 ⇒ 改成兩者共有嘅結構性理由。既有嗰條 assert `/single-use/` 嘅 test **性質逐字保留**(佢個註釋講明點解 assert message 而唔係 type),換 regex + 改 `it.each` 兩個 template 各驗一次

## F2 — 收件人 resolver（spec §2.2 ②）

- [x] F2-1 新檔 `fulfilment/intake-notification-recipients.ts`(pure `dedupeRecipients`)
- [x] F2-2 `OPCO_IT`:`role=OPCO_IT AND opcoScopeId=request.opcoId AND active=true`
- [x] F2-3 ops mailbox:`OPS_NOTIFICATION_MAILBOX`(`config.get`,唔用 `getOrThrow`)
- [x] F2-4 🔴 **A5 去重** —— 大小寫不敏感 + trim + 保留首次出現次序
- [x] F2-5 🔴 **A7** inactive 唔收 —— assert **喺 query**(`where` 帶 `active: true`),唔係事後 filter
- [x] F2-6 🔴 **A4 / D3** 兩邊都空 → log warn,唔 throw,request 照建

## F3 — Caller（spec §2.2 ③ / D1 / D2）

- [x] F3-1 🔴 **D1 冪等**:`preExisting` 改**無條件**查,兩個用途(audit injection + 通知)共用同一個結果
- [x] F3-2 `intakeFlat` 接通知(擺喺 `raiseLicenceRequest` **之後** —— 封信話「去睇呢張單」,讀者見到嗰陣嘢應該已經齊)
- [x] F3-3 `intakeNative` 接通知
- [x] F3-4 🔴 **canonical 路(A3)** —— 新 `IntakeAdapterService.intakeCanonical`,controller 改 call 佢。**三個選項比較過**:controller 打 Prisma(orchestration 入咗 `@Public()` controller)/ `IntakeService` 返多個 flag(**佢個回傳值直接做 HTTP response = 改 LOCKED contract 形狀**)/ **收落 adapter ✅**。揀最後一個因為另外兩個都會製造**第二個決定「幾時算新」嘅地方**
  - [x] F3-4b `IntakeAdapterService` class doc 補一段:佢今日實際擁有嘅係「每個 intake 副作用,一個檔」,唔再只係 translator。**冇改名**(ADR-0017 D4 同一堆 commit 引用緊)
  - [x] F3-4c orphan 清理 —— `IntakeController` 個 `IntakeService` 依賴同 import 刪咗(§1.3)
- [x] F3-5 🔴 **fail-soft** —— 保證寫喺 `IntakeNotificationService` 內部(同 `NotificationDispatchService` 一樣),**caller 唔使 try/catch**,一個地方讀得晒
- [x] F3-6 🔴 **唔擺落 `IntakeService`** —— `servicenow-import.service.ts` 係第二個 caller,唔喺 §2.1 scope
- [x] F3-7 🆕 🔴 **主動搬走一條變咗 tautology 嘅既有 assert** —— controller spec 嗰句 `calls[0][1]).toBeUndefined()`(守住 canonical caller 唔可以到達 by-task close route)喺 `intakeCanonical(dto)` 之下**由 TypeScript arity 保證,唔再由意圖保證**。搬去 adapter spec 兼**改成 assert 寫入嘅 row**(`serviceNowTaskSysId: null`),咁樣個參數點寫都捉得到。兩邊留註釋

## F4 — Env（spec §2.2 ④）

- [x] F4-1 `OPS_NOTIFICATION_MAILBOX` 寫入 `apps/api/.env.example`
- [x] F4-2 🔴 **A10** 註明 optional + 寫明唔設嘅後果(**若該 OpCo 亦冇 active `OPCO_IT`,一封都唔會寄**;24 個 OpCo 入面 seed 只有 RHK 有)
- [x] F4-3 🔴 **H4** —— 留空佔位,冇填真地址

## F5 — Test（H5）

- [x] F5-1 A1 新建 → OpCo IT 每人一封 + ops 一封
- [x] F5-2 🔴 **A2 重推 → 零寄** —— 三條路各一條,兼 assert `request.create` 冇被叫
- [x] F5-3 A3 三條路都寄(`it.each`)
- [x] F5-4 A4 冇收件人 → warn + 零 throw + 零 send
- [x] F5-5 A5 去重(pure spec 5 條 + service spec 1 條)
- [x] F5-6 A6 fail-soft 三條(dispatch throw / DB 讀唔到 / request 唔見咗)
- [x] F5-7 A7 inactive 唔收(assert query)
- [x] F5-8 🔴 **A8 H4 —— spy logger** 收晒 happy + empty 兩條路,`not.toMatch(EMAIL_SHAPED)`,**再加兩條正面 assert**(`r1` / `RHK`)防止佢因為根本冇 log 而空過。理由:BUG-004 潛伏 18 日就係因為 assert exception message(RISK R5)
- [x] F5-9 A9 template 三部分 + `text` 非空(由 `TEMPLATES` derive)
- [x] F5-10 🔴 **falsification 兩個都真跑**
  - 拆三處 `if (!preExisting)` ⇒ **3 failed / 46 passed**,精確對上三條 re-push test
  - 拆 `dedupeRecipients` 個 `.toLowerCase()` ⇒ **2 failed,兩層各一條**(pure + service)。⇒ 同一個保證有兩層守住,正正係 2026-08-10 兩單「bug 住喺兩層之間」嘅反面

## F6 — 收尾

- [x] F6-1 `npm run lint`(root)**exit 0** · api tsc **0**(⚠️ 一開始紅 21 條,全部 prettier 兼全部喺我改嗰兩個檔,只 `--fix` 咗嗰兩個)
- [x] F6-2 既有 test 一條唔跌 —— api **937 → 974** / **70 → 73 suites**
- [x] F6-3 BACKLOG `NOTIFY-1` 更新(R7)—— 標 🟢「實作完成 · 淨低 A12 live」而**唔標 ✅ closed**
- [x] F6-4 `progress.md` 寫齊
- [x] F6-5 CLAUDE.md §0/§9 + `SESSION_SUMMARY.md` 座標掃一次(A12 收咗先做)

## F7 — Live（A12）✅

- [x] F7-1 🔴 **A12 真寄一次 —— 喺本機做,唔喺 DEV**
  - 🟢 **查證結果推翻咗 spec 寫嘅「DEV」**:本機 `ACS_CONNECTION_STRING` **係真值**(真 ACS endpoint domain + 40+ 字元 accesskey,零 placeholder marker),而 `ACS_SENDER_ADDRESS` **逐字等於** `CH-012-verify A4` 嗰個(`UnifiedOperationsPortal@rci-t.com`,2026-07-30 真送達過)⇒ **去 DEV 換唔到嘢返嚟**。⚠️ 全部用 `Grep --count` 查,**零值輸出**(H4)
  - 🟢 **canonical 路零外部副作用** —— `intakeCanonical` 唔掂 ServiceNow、唔掂 Graph,唯一對外動作 = 寄嗰封信。比 CH-022 A7(真 RITM)同 W45 成功路(真 licence)都乾淨
  - ⚠️ **fixture 揀 `PFU-HK`** —— seed 個 `OPCO_IT` 用戶係 `opco.it.rhk@rapo.com.hk`(**真公司 domain**),用預設 RHK 就會真寄畀佢。揀一個冇 `OPCO_IT` 用戶嘅 OpCo(24 個入面 23 個都係)⇒ 收件人得 `OPS_NOTIFICATION_MAILBOX` 一個
  - 🟢 `OPS_NOTIFICATION_MAILBOX` 只傳 **shell env**,`.env` **一個字冇改**(skill 硬規則 5 / §4.4)
- [x] F7-2 🔴 **CH-011 R1 —— 以「收件人真係收到」為準,唔係 ACS 返 `Succeeded`**。**Chris 2026-08-11 確認收到咗封信** ⇒ A12 過

### Live 真 output

| 檢查 | 證據 |
|---|---|
| intake 建到單 | `HTTP 201` · `[IntakeService] Intake created request cmso63a4d… (opco PFU-HK, 1 line items)` |
| **ACS 收貨** | `[AcsEmailService] Sent 'onboarding-intake' via ACS (operation 48e1b00b-f020-4e6f-9077-7500e2257781)` |
| 收件人解析 | `[IntakeNotificationService] … notified 1 recipient(s)` ← **同時證咗 shell env 真係入到 process**(PFU-HK 冇 `OPCO_IT`,唔傳就會 log `nobody`) |
| **A2 重推唔再寄** | 第二次 POST → `201` · **同一個 id** · ACS send 總數**仍然 1** |
| 冪等冇建重複 row | `Request` 得 **1** 行 |
| fail-soft queue | `OutboundFailure` **0 rows** |
| **A8 / H4** | 成份 api log grep email 形狀 = **0 命中** |
| **真送達** | **Chris 確認收到**(subject `[PFU-HK] Onboarding licence request — REQ-CH021-A12`) |

## F8 — 環境還原

- [x] F8-1 停 UOP stack,`docker start ai-doc-extraction-db` 還原 5433
- [x] F8-2 🔴 **真 TCP connect 驗,唔睇 health flag**(BUG-011 踩過嗰個「靜靜失敗」形狀)
- [x] F8-3 本機 DB 留低一行 test request(`serviceNowSysId = ch021-a12-199171`)—— dev 資料,冇清

## 🚧 移交（本 CH 明文唔做）

- 🚧 **OQ:ADMIN 手動 import 一張 REQ 之後要唔要通知?**(`ServiceNowImportService`,CH-013)—— 佢同 n8n intake 一樣係「平台第一次見到呢張單」,分別只在觸發者係人。**要就開新 CH**
- 🚧 **`start-detached.ps1` 冇 capture api stdout** —— 今次因為咁,build-cache 假綠燈嗰兩句(`Found 0 errors` + `MODULE_NOT_FOUND`)睇唔到,白等咗 270 秒。**改動屬 skill 共用工具,等 Chris 話事**(見 progress)

## 🚧 移交（本 CH 明文唔做）

- 🚧 **OQ:ADMIN 手動 import 一張 REQ 之後要唔要通知?**(`ServiceNowImportService`,CH-013)—— 佢同 n8n intake 一樣係「平台第一次見到呢張單」,分別只在觸發者係人。**要就開新 CH**
