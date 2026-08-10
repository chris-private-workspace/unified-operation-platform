# CH-023 — Assign 嘗試記錄可翻查

**Status**: `draft`(待 approve;**ADR-0031 亦要同批由 Proposed → Accepted**)
**Created**: 2026-08-10
**Owner**: Chris Lai
**決策 SSOT**: **ADR-0031**
**分類**: Change(<3 日)—— ADR-0029 已交付,本單改嘅係既有 feature

## 1. Why

Chris 2026-08-10 喺 DEV 真撳完 assign 之後即刻指出:

> 「但是這個記錄是否應該要能夠重新打開呢? 現在只能夠在 assign 當刻看到, 之後就已經不能夠重新查看」

**呢個缺口喺設計階段冇人提出過** —— 當時大家諗嘅係「撳嗰刻要見到過程」,而唔係「三日之後想翻查」。要真環境撳一次先浮到出嚟。

最貴嗰格係 **`ticket: skipped`**:條 line 冇 RITM ⇒ ServiceNow 側乜都冇 complete。W44 F7-12 **花咗兩日 + 一次 live ServiceNow query** 先答到呢條問題;ADR-0029 令佢變成畫面一行字,但**嗰行字得五秒命**。

## 2. Scope

### 2.1 In Scope

- **A** — `AssignAttempt` model + migration(ADR-0031 D1/D2)
- **B** — `assignLineItem` 成功路 + refusal 路都寫一行(D4,🔴 三條保護見 §4)
- **C** — `GET /fulfilment/requests/:id/line-items/:lineItemId/assign-attempts` 讀取(role 同 request detail 一樣,OPCO_IT 照 scope)
- **D** — line item 上 secondary 掣「View assign result」,重開**同一個** `AssignResultDialog`(D3)
- **E** — 多過一次嘗試 → dialog 內 `Attempt N of M` + 前後切換
- **F** — test:成功寫一行 / refusal 寫一行 / **寫入失敗唔影響原本個 400** / 讀取 scope / 前端 render

### 2.2 Out of Scope（explicit）

- ❌ **retention / purge job** —— ADR-0031 D5 明文唔做,只定覆核觸發點
- ❌ **`outcome` / `failedAt` 做 Prisma enum** —— D1 刻意用 `String`,避免第二份清單(repo 內同族錯誤已第六次)
- ❌ **改任何 gate 嘅擋唔擋** —— 🔴 W45 plan §2.2 呢半仍然成立且不可動搖
- ❌ **把嘗試記錄塞入 `RequestEvent` timeline** —— 兩個 surface 各有職責(ADR-0009 D1「共存唔取代」同一判斷)
- ❌ 其他操作(advance stage / sync-check)嘅嘗試記錄

## 3. 契約

```
GET  …/line-items/:lineItemId/assign-attempts  →  AssignAttemptDto[]
```

```ts
class AssignAttemptDto {
  id: string;
  outcome: AssignOutcome;      // enum: 由 ASSIGN_OUTCOMES spread,唔手寫
  failedAt?: AssignStepKey;    // enum: 由 ASSIGN_STEP_KEYS spread
  steps: AssignStepDto[];      // 重用 ADR-0029 個 DTO,唔另寫
  actorId: string | null;
  createdAt: string;
}
```

**排序**:`createdAt desc`(最新行先)—— 前端預設開第一個。

## 4. 🔴 三條硬性保護（D4 要求,唔做齊唔算完成）

| # | 保護 | 點驗 |
|---|---|---|
| P1 | **寫入失敗 non-fatal** —— `try/catch` 吞咗,照 throw 原本個 `BadRequestException` | test:令 `create` reject,assert 仍然 400 **兼且** message 逐字不變 |
| P2 | **寫入喺 gate 判斷之後** | test:每道閘照樣擋(既有七條 `expectBlockedAt` 一條唔跌) |
| P3 | **R4 diff** —— `assign.service.ts` gate 段落條件式零改動 | 人手 diff,寫入 progress |

## 5. Acceptance

- [ ] G1 成功 assign 寫一行 `outcome='assigned'`,`steps` 逐字等於回傳嗰個
- [ ] G2 每道閘被擋都寫一行 `outcome='blocked'` + 正確 `failedAt`
- [ ] G3 🔴 **P1**:`AssignAttempt.create` reject 時,caller 仍然收到**一模一樣**嘅 400(message + body 形狀)
- [ ] G4 🔴 **P2/P3**:既有七條 `expectBlockedAt` + 全部 gate test 一條唔跌
- [ ] G5 讀取受 OPCO_IT scope 約束(跨 OpCo → 403)
- [ ] G6 前端:冇記錄 → 唔出掣;一次 → 出掣開嗰次;多次 → `Attempt N of M` 切換得到
- [ ] G7 🔴 **重用同一個 `AssignResultDialog`** —— 唔另寫歷史版(test guard:`assign-result-dialog.tsx` 只此一個)
- [ ] G8 H6:掣係 secondary,一個 view 一個 primary;light + dark 真 render
- [ ] G9 migration apply + **rollback** 都喺 scratch DB 驗過
- [ ] G10 `npm run lint`(root)exit 0 · api + web tsc 0 · 既有 test 一條唔跌
- [ ] G11 live 驗:DEV 撳一次失敗 + 重開睇返(⚠️ 卡 `B8`,同 W45 F4-4b 一齊做)

## 6. Risks

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | 🔴 記錄動作令乾淨嘅 400 變 500 | Med | **High** | P1 + G3 test 先行 |
| R2 | 🔴 順手改咗 gate 行為 | Low | **High** | §2.2 明文 + P3 diff + G4 |
| R3 | 行數無上限 | Med | Low | ADR-0031 D5 覆核觸發點(單 line >20 / 全表 >10k) |
| R4 | Live 同翻查兩個 dialog drift | Low | Med | G7:結構上唔畀有第二個 component |

## 7. Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-08-10 | Initial draft | Chris DEV 實撳後反饋;方向同日選定 = 新表 | _pending_ |
