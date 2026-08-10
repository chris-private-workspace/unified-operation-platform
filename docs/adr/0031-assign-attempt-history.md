# ADR-0031: Assign 每次嘗試都存低,操作員事後翻查得返

**Date**: 2026-08-10
**Status**: **Rejected**(Chris 2026-08-10 拍板改行 **Option A**;見 §Outcome)
**Approver**: Chris Lai

> 🔴 **本 ADR 提出嘅方案(D1 新表)冇被採納。** Chris 睇完取捨之後揀咗 Alternatives 入面嘅 **Option A**(timeline NOTE),落地 = 同一單 **CH-023**。
> **本文全文保留、一個字唔改寫** —— 佢記錄咗當時真係考慮過乜、代價喺邊。將來若果「翻查每次嘗試」再被要求,由呢度開始,唔使重新推一次。
> 實際採納咗嘅決定 → **§Outcome**。

## Context

**用戶反饋(Chris,2026-08-10,DEV 上真撳完之後)**:

> 「但是這個記錄是否應該要能夠重新打開呢? 現在只能夠在 assign 當刻看到, 之後就已經不能夠重新查看」

ADR-0029 交付咗之後**即日就見到個缺口**,而且係喺真環境撳完先見到 —— 呢個順序本身值得記:設計階段冇人提出過「事後翻查」,因為當時大家諗嘅係「撳嗰刻要見到過程」。

### 今日邊啲事實有家、邊啲冇

| 事實 | 今日翻查得返? |
|---|---|
| 派咗邊隻 SKU | 🟢 `RequestEvent` timeline(`Assigned {sku}`) |
| OpCo budget 有冇被 override | 🟢 timeline(**ADR-0016 D6 專登**放落去)+ `AuditLog` |
| ServiceNow 回寫**失敗**咗 | 🟢 `OutboundFailure`(Delivery failures 頁) |
| **ServiceNow 回寫成功 / 或者根本冇 RITM 所以乜都冇做** | 🔴 **邊度都冇** |
| 邊道閘擋住(refusal) | 🔴 邊度都冇 —— refusal 唔寫任何嘢 |

🔴 **第四行就係最貴嗰行。** `ticket: skipped`(條 line 冇 RITM ⇒ ServiceNow 側乜都冇 complete)係 **W44 F7-12 花咗兩日 + 一次 live ServiceNow query 先答到**嘅問題。ADR-0029 令佢由「要靠推理」變成「畫面一行字」—— 但**嗰行字得五秒命**,閂咗 dialog 就返返去要再查一次 ServiceNow。

⇒ **ADR-0029 解決咗一半問題:睇得見,但留唔低。**

### 觸發嘅 hard constraint

**CLAUDE.md §5.1 H1** —— 加 Prisma model / 改資料模型。

## Decision

### D1 — 新增 `AssignAttempt` model,一次嘗試一行

```prisma
model AssignAttempt {
  id         String          @id @default(cuid())
  lineItemId String
  lineItem   RequestLineItem @relation(fields: [lineItemId], references: [id], onDelete: Cascade)
  outcome    String          // 'assigned' | 'blocked' | 'failed'(對齊 ASSIGN_OUTCOMES)
  failedAt   String?         // AssignStepKey,成功時 null
  steps      Json            // AssignStep[](已經 scrubPii)
  actorId    String?
  actor      AppUser?        @relation(fields: [actorId], references: [id])
  createdAt  DateTime        @default(now())

  @@index([lineItemId, createdAt])
}
```

🔴 **`outcome` / `failedAt` 用 `String` 唔用 Prisma enum,係刻意嘅。** 佢哋嘅真相係 `assign-step.ts` 嗰兩個 const array,而 Prisma enum 會**變成第二份清單**,兩份各自維護就會 drift —— 呢個 pattern 喺本 repo 已經數到**第六次**(見 W42 BUG-009 postmortem)。DTO 層個 `enum:` 已經 spread 緊 const array,所以 API 邊界仍然收窄;DB 層刻意留鬆。

### D2 — 只喺 `RequestLineItem` 掛,唔喺 `Request`

一次 assign 針對一條 line item(ADR-0008 D6 兩層結構:stage 掛 line item)。掛喺 `Request` 就要另外記係邊條 line,而嗰個關係一早存在。`onDelete: Cascade` 跟返 line item —— 一條被刪嘅 line(CH-007 D5:只有未送出嘅 REQUESTED 線刪得)嘅嘗試記錄冇獨立價值。

### D3 — UI:line item 上一個 secondary 掣,重開**同一個** `AssignResultDialog`

- 有嘗試記錄先出掣(冇就唔出,唔出 disabled 掣)
- 預設開**最新**嗰次;多過一次就喺 dialog 內加 `Attempt N of M` + 前後切換
- 🔴 **唔加第二個 primary**(H6 / DS-3)—— 掣係 secondary,dialog 內個 `Done` 仍然係唯一 primary
- **重用 `AssignResultDialog` 一個 component**,唔另寫一個「歷史版」;兩個各自維護就會出現「live 見到 A、翻查見到 B」

### D4 — 🔴 refusal 路**開始寫狀態**,而呢個推翻咗一條寫落 plan 嘅約束

要存「被擋嗰次」,就一定要喺 `fail()` throw **之前**寫一行。呢個直接抵觸:

- **W45 plan §2.2**:「❌ 改任何 gate 嘅行為 —— 本 phase **只改「點講」,唔改「擋唔擋」**」
- **ADR-0016 D6** 原文:一次 block「changes no state」(⚠️ 呢句 **W40 已經被 `ticketHeldAt` 軟化過一次**,本 ADR 係第二次)

**本 ADR 明文收窄嗰條約束**:「唔改擋唔擋」**仍然成立且不可動搖** —— 擋唔擋嘅條件式一行唔郁。變嘅係「一次 refusal 唔再係零寫入」。

**三條硬性保護**:
1. 🔴 **寫入失敗必須 non-fatal** —— `try/catch` 吞咗,照 throw 原本個 `BadRequestException`。一個記錄動作**絕不可以**令一個乾淨嘅 400 變成 500
2. 🔴 **寫入喺 gate 判斷之後** —— 對「擋唔擋」零影響,一定係「已經決定咗擋,先記低」
3. 🔴 **R4 檢查照做**:對 `assign.service.ts` gate 段落 diff,證明條件式零改動

### D5 — 保留策略:**暫時唔設**,但明文記低點解同幾時要覆核

一條 blocked assign 可以被重試無限次,每次一行 ⇒ **行數理論上無上限**。本 ADR **刻意唔加 retention job**:

- 加一個 `@nestjs/schedule` job 去 purge 係**未被要求嘅 flexibility**(§1.2),而且要答「保留幾耐」呢條冇人問過嘅問題
- 實際增長率有界:要有人**手動**喺 UI 撳先會多一行,唔係機器產生
- **覆核觸發點(寫死喺度,唔靠人記)**:任何一條 line item 嘅 `AssignAttempt` 超過 **20 行**,或者全表超過 **10,000 行** ⇒ 開單處理

⚠️ BACKLOG 一早有 `audit-retention` 候選(deferred),**同一族問題** —— 將來要做就一齊做,唔好各自發明一套。

### D6 — 存嘅嘢**唔多過** API 已經回傳嘅

`steps` 存嘅就係回傳嗰個 array,**逐字一樣,零額外欄位**。⇒ 冇任何資料只存喺 DB 而 API 見唔到,亦冇新增 PII 面:

- `detail` 一早經 `scrubPii`(ADR-0029 / BUG-004 同一形狀)
- `budget: overridden` 個 detail **刻意唔含 `overrideReason`**(W45 已定,H4)—— 存落 DB 一樣冇

## Alternatives Considered

- **Option A —— 寫一條 `RequestEvent` NOTE,只記 ServiceNow 側結果**:零 schema 改動、唔觸發 H1、落喺用戶本來就預期嘅 Operational history。🟢 **ACCEPTED(Chris 2026-08-10)** —— 見 §Outcome。佢**解決咗最貴嗰行**(`ticket` 結果)而成本細一個數量級。
- **Option B —— `RequestLineItem` 加一個 `Json` column,只存最後一次**:一行一個 JSON、零行數增長、gate 路可以完全唔郁(只喺成功路寫)。**rejected**:睇唔到「試過三次都被 budget 擋住」呢類過程。
- **Option C —— 前端 `localStorage` 存返最後一次**:零後端改動。**rejected**:換部機 / 換個人就冇,而「邊個都翻查得到」正正係需求本身。呢個係**扮持久化**。
- **D1 新表(本 ADR 提出嘅方案)**:唯一答得到「**每次**嘗試」嘅做法。代價(D4 refusal 寫入 · D5 retention · migration + 一組 test)已明文列出並各自有對策。**Rejected** —— 見 §Outcome。

## Outcome（2026-08-10,Chris 拍板）

**採納 Option A,唔起新表。** 呢個決定值得記低點解,因為佢反轉咗同日稍早嘅方向:

1. **D4 係整個提案入面唯一一個「推翻既有約束」嘅位** —— 而佢完全係為咗 refusal 路而存在。Option A 唔掂 refusal 路 ⇒ **`ADR-0016 D6`「a block changes no state」唔使第二次軟化,W45 plan §2.2 一個字都唔使改。** 一個要三條保護(P1/P2/P3)先敢做嘅改動,同一個**根本唔需要保護**嘅改動,唔係同一個數量級嘅風險。
2. **Context 個表入面真正紅嗰行只有一行**:「ServiceNow 回寫成功 / 或者根本冇 RITM」。refusal 邊道閘擋住 —— 操作員撳嗰刻見到、改完即刻再撳,**佢本身就唔係「三日後要翻查」嗰種事實**。⇒ D1 嘅覆蓋面大過需求。
3. **落點更啱**:Chris 原話係「應該要能夠重新打開」,而佢已經有一個為「呢單發生過咩」而存在嘅 surface = **Operational history**。加一行落去,唔使教任何人多一個新地方要睇。

**Option A 唔覆蓋而 D1 覆蓋嘅**(明文記低,唔扮冇):
- ❌ refusal(邊道閘擋住)—— 完全唔記
- ❌ 「試過三次都被 budget 擋住」呢類**過程**
- ❌ 十步逐步嘅 `steps[]` 結構(timeline 得一句人話)

⇒ **若果將來真係要翻查 refusal / 多次嘗試,由 D1-D6 開始睇,唔使重新設計。** 觸發訊號:有人問「點解嗰次派唔到」而 timeline 答唔到。

**落地**:CH-023(folder 名 `CH-023-assign-attempt-history` **刻意保留** —— 改名會令 git history 同已 commit 嘅 `5a8e8ee` 永久對唔上,同 CLAUDE.md §9「Azure UAT 誤名」同一判斷)。

## Consequences

- **Positive**:`ticket: skipped` 由「五秒」變成「永久」—— W44 F7-12 嗰條問題以後唔使再查 ServiceNow · 「我試過三次都被擋」變成可出示嘅證據 · 重用同一個 dialog component,live 同翻查**結構上唔可能講唔同嘅嘢**
- **Negative**:🔴 **refusal 唔再係零寫入**(D4,推翻 plan §2.2 一句)· 行數無硬上限(D5)· `outcome`/`failedAt` 喺 DB 層冇 enum 約束(D1,刻意換嚟避免第二份清單)· 多一個 model + migration + 一組 test
- **Neutral**:唔影響任何 gate 嘅擋唔擋 · 唔影響 ADR-0029 個 API 契約(response 形狀一個字唔變)· 唔加新 dependency(Prisma 原生 `Json`)

## References

- **ADR-0029**(assign step results —— 本 ADR 擴充佢)
- **ADR-0016 D6**(「a block changes no state」—— 本 ADR 第二次軟化佢;第一次係 W40 `ticketHeldAt`)
- ADR-0008 D6(兩層 REQ/RITM,stage 掛 line item)· ADR-0009(AuditLog 共存唔取代)· BUG-004(`scrubPii`)
- `docs/01-planning/W45-assign-progress-visibility/plan.md` §2.2(被 D4 收窄嗰句)
- 落地 = **CH-023**(`docs/03-implementation/changes/CH-023-assign-attempt-history/`)
- 觸發:Chris 2026-08-10 喺 DEV 真撳完之後嘅反饋
