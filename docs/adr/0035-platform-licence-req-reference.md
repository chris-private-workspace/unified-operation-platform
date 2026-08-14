# ADR-0035: 平台自己開嘅 licence REQ 號碼,喺 `Request` 有個 display-only 嘅家

**Date**: 2026-08-14
**Status**: **Accepted**(Chris Lai,2026-08-14)
**Approver**: Chris Lai

## Context

觸發:**CLAUDE.md §5 H1**(改 Prisma schema + 推翻 `schema.prisma` 一個明文寫低嘅決定)。
落地單:**CH-030 F1**。

一張 onboarding 背後有**兩張唔同嘅 ServiceNow 單**,而 `schema.prisma` 逐字警告過「mixing them up is the easiest mistake to make here」:

| 單 | 邊個開 | 今日存喺邊 |
|---|---|---|
| **Onboarding REQ** | n8n(intake 源頭) | `Request.serviceNowNumber` — **`@unique`,idempotency key** |
| **Licence REQ** | **本平台**(ADR-0025 D2,catalog `order_now`) | 🔴 **冇地方存** |
| **Licence RITM ×N** | 同上(catalog workflow 造) | `RequestLineItem.serviceNowNumber` |

平台**攞得到**個 REQ 號碼 —— `order_now` 就係返佢(`servicenow.service.ts:242`),`direct-servicenow.provider.ts:180` 亦交返出嚟 —— 但 `intake-adapter.service.ts:331-341` 只把每條 RITM 寫落 line item,**個 REQ 直接跌咗落地**。

`schema.prisma:313` 講明點解當初咁決定:

> The platform's own REQ deliberately has nowhere on `Request` to live: giving it one would mean **two candidate idempotency keys** for the same row.

CH-024 C 之後,佢**唯一嘅倖存地**係一條 timeline NOTE(`intake-adapter.service.ts:414`):

```
Licence request REQ0044083 raised in ServiceNow by the platform (RITM0047389)
```

而 `recordLicenceRequestEvent` 個 comment 自己就寫住「This is the ONLY place the platform's own parent REQ number survives」。

**今日嘅後果**:request detail header 個 section label 叫 **`Licence request`**,但打出嚟嘅係 `licenceRequestNumbers()` 由 line item 撈嘅 **RITM**。label 同內容講緊兩樣嘢 —— Chris 2026-08-14 睇頁面第一個問題就係呢個。**要修,先要有地方存個 REQ。**

## Decision

喺 `Request` 加**一個** display-only 欄:

```prisma
  // ADR-0035 — the licence REQ **this platform** raised (ADR-0025 D2), as
  // opposed to `serviceNowNumber` above, which is the ONBOARDING REQ n8n
  // raised and is this row's @unique idempotency key.
  //
  // 🔴 Deliberately NOT @unique and deliberately never used in a `where` /
  // upsert clause: that is the whole reason this column is allowed to exist
  // at all (see this ADR's Context).
  serviceNowLicenceReqNumber String?
```

**約束(呢個 ADR 嘅實質內容,唔係欄本身)**:

- **D1** — **非 `@unique`**。
- **D2** — **唔可以出現喺任何 `where` / `upsert` / `findUnique`**。佢唯一嘅用途係讀出嚟顯示。
- **D3** — 只喺 intake-adapter 成功 raise licence request 嗰一刻寫入一次,同啲 RITM 同一個 `$transaction`。raise 失敗 ⇒ 維持 `null`。
- **D4** — **唔加 `sysId`**。冇 caller 要 PATCH 平台自己個 REQ(CH-023 close 嘅係 RITM),加咗就係「將來可能有用」= §1.2 禁嘅嘢。要用嗰日由 number 查得返。
- **D5** — 舊資料維持 `null`,前端**必須**回退到今日行為(顯示 RITM),唔可以變空白。

## Alternatives Considered

- **Option A**:**前端 parse 條 timeline NOTE** —— rejected。個 REQ 號碼確實喺嗰句嘢入面,而且**零 migration、舊資料即刻有數**,單睇成本佢係最平嗰個。但佢要 regex 一句**英文文案**,而嗰句文案**冇任何 test 釘住格式** —— 改個字就靜靜壞,而壞嘅方式係「號碼冇咗」唔係「紅燈」。呢個正正係 CH-029 / BUG-011 一路撞緊嗰族(綠燈喺每一層,bug 住喺層與層之間)。

- **Option B**:**維持現狀,改 label** —— 把 `Licence request` 改成 `Licence RITM`,唔再暗示嗰個係 REQ。rejected:呢個令個畫面**誠實**,但 Chris 想要嘅 REQ 仍然睇唔到,而佢係一個合理嘅操作需求(「平台幫我開咗邊張單」)。誠實但答唔到問題,唔算解決。

- **Option C**:**加返一個 `@unique` 欄** —— rejected,而且係 `schema.prisma` 當初明文避開嗰樣嘢:兩個 unique 嘅 SN number 就係兩個 candidate idempotency key,而 intake 個 upsert 之後就要答「用邊個」。

- **Chosen**:**Option D — 加一個明確非 unique、唔參與任何 lookup 嘅 display-only 欄**。
  🔴 **關鍵論據**:`schema.prisma` 反對嘅係「第二個 **candidate idempotency key**」,唔係「第二個 SN number」。一個**結構上唔可能被當成 key** 嘅欄(非 unique + 唔出現喺 `where`)產生唔到嗰個問題 —— 原本嘅理由**唔覆蓋**呢個做法。所以呢個 ADR 嚴格嚟講唔算推翻 `schema.prisma` 個決定,而係**收窄佢嘅範圍**:反對嘅係「多一個 key」,唔係「多一個 reference」。

## Consequences

- **Positive**
  - 平台自己開嘅單第一次有個**結構化**嘅家 —— 之前佢淨係活喺一條 log 同一句英文 NOTE 入面。
  - header 講得返一句完整嘅嘢:`Licence request REQ…` + `items RITM…`,兩張單各歸各位(ADR-0025 OQ-2 想要嘅嘢)。
  - 將來要對帳 / 追單,唔使 parse 文案。

- **Negative**
  - 🔴 **`Request` 上面嘅 ServiceNow 欄由 4 個變 5 個**(`serviceNowSysId` / `serviceNowNumber` / `serviceNowStatus` / `serviceNowUserSysId` / 新嗰個),而佢哋分別指住**三樣唔同嘢**。命名混淆嘅風險**上升咗**,而呢個正正係 `schema.prisma` 當初想避開嘅氣味。**緩解 = schema comment 寫明分別**(見 Decision),但緩解唔等於消除。
  - 要一個 migration。
  - **舊 request 加咗欄都係 null** ⇒ 要 backfill 先睇到數,而 backfill 就係 Option A 條 parse(CH-030 §5 OD-1 建議唔做)。**即係話呢個決定解決唔到已經存在嘅單** —— 只對之後開嘅生效。

- **Neutral**
  - `RequestLineItem.serviceNowNumber`(RITM)**一個字唔改**。
  - 對 assign / ledger / 對帳 / stage machine **零影響** —— 呢個欄冇任何 code path 讀佢嚟做決定。

## References

- `apps/api/prisma/schema.prisma`(`Request` model · line ~313 個決定 comment)
- `apps/api/src/fulfilment/intake-adapter.service.ts`(`recordLicenceRequestEvent` · 寫入點)
- `apps/api/src/fulfilment/direct-servicenow.provider.ts:180`(REQ number 交返出嚟嗰點)
- `apps/api/src/integration/servicenow/servicenow.service.ts:242`(`order_now` 返 REQ number)
- **ADR-0025**(D2 平台開 licence request · OQ-2 兩張單唔可以混淆)
- **CH-024** C(header 分開兩張單 · timeline NOTE)
- 落地單:**CH-030** `docs/03-implementation/changes/CH-030-request-detail-refinements/`
