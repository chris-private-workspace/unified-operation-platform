# CH-006 — Progress Log

> Change:Overview 營運活動流(`RequestEvent` 取代 audit feed)
> Spec:`spec.md`(v1.0,approved 2026-07-21)· Checklist:`checklist.md`

---

## Day 1 — 2026-07-21

### Kickoff

CH-005 carry-over。開工前查證,三項落實 + 一項修正:

| # | 決定 | 由 |
|---|---|---|
| D1 | `RequestEvent` **取代** Overview feed;`AuditLog` 留 `/audit` | Chris |
| D2 | `@@index([createdAt])` 當 **H1-lite** —— approval + spec 記錄,唔開 ADR | Chris |
| D3 | 走 **Change** workflow(CH-006) | Chris |
| D4 | `request-detail` raw-enum **唔改**(default out-of-scope) | AI(Chris 未另行指示) |

**D1 嘅實證理由**:曾考慮合併兩個來源(BACKLOG 原本嘅「多加一個來源」)。但 feed limit = 6,而 `auth.login_success` **每次登入寫一條 AuditLog** —— 直接按時間合併,admin 嗰六行大機會全係 sign-in,反而將 assign / stage 推進洗走。即係為咗加營運內容,結果營運內容更加見唔到。

### 開工前查證(改寫咗 spec 兩處)

**① BACKLOG 前置描述唔準確。** 佢寫 `RequestEvent`「只有 write、零 read surface」。實情:`request-detail.tsx:354` **已經 render 緊** per-request timeline(資料嵌喺 `GET /fulfilment/requests/:id`)。真正缺嘅只係**跨 request 全域查詢**。

結論唔變,但多咗約束:前端已有 `EVENT_TONE`(`request-detail.tsx:32`)。另寫一套 = CH-005 刻意避開嘅「兩處真相」→ spec 要求抽出共用 + grep 驗(B7)。

**② 個 feed 實際有咩內容 —— 四個 write site:**

| 來源 | type | actor | message |
|---|---|---|---|
| `assign.service.ts:167` | `ASSIGN` | ✅ | `Assigned {skuPartNumber}` |
| `stage.service.ts:122` | `STAGE_CHANGE` | ✅ | **無** —— 只有 fromStage→toStage |
| `assign.service.ts:56` | `SYNC` | ❌ | `Phase 1 sync confirmed` |
| `request.service.ts:98` | `NOTE` | ❌ | `Line item added: …` |

兩個誠實 gap:`EventType.RECONCILE` enum 有但 **`src/` 零 write site**(唔會喺 UI 宣傳有對帳活動);`STAGE_CHANGE` 冇 message,文字要前端砌。

**③ 一個 PII 位。** `Request` 有 `targetUpn` / `requesterEmail` / `targetDisplayName`(onboarding 對象),而本 endpoint 開畀 OPCO_IT。DTO 順手 `include` 就漏。→ B6 抄 W31 G1:餵齊 PII,assert 序列化結果零出現。

**④ 路由脆弱點。** `fulfilment.controller.ts` 有 `@Get(':id')`;`@Get('events')` 要靠宣告次序先唔會被食。→ 開獨立 `@Controller('fulfilment/activity')`,跟 W31 `outbound-failure.controller.ts` 先例。

### Branch 說明

Branch 由 `feat/w31-outbound-failure-recovery` 出,**唔係 main** —— 本機 dev DB 已 apply W31 migration,由 main 出會令 Prisma 見到 drift 要 reset。

> ⚠️ **CH-006 個 PR stack 喺 PR #16 上面,要 #16 先 merge。**

---

_(實作進度陸續補)_
