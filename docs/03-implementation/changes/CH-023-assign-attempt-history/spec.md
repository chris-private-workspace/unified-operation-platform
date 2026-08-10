# CH-023 — Assign 之後,ServiceNow 側結果留得低

**Status**: `active`(Chris 2026-08-10 拍板 **Option A**)
**Created**: 2026-08-10
**Owner**: Chris Lai
**決策 SSOT**: **ADR-0031 §Outcome**(🔴 ADR **本體個 D1 新表方案係 Rejected** —— 本單做嘅係 Alternatives 嗰個 Option A)
**分類**: Change(<1 日)—— ADR-0029 已交付,本單改嘅係既有 feature

> ⚠️ **Folder 名 `CH-023-assign-attempt-history` 刻意保留**,雖然本單已經唔再係「attempt history」。改名會令已 commit 嘅 `5a8e8ee` 同 git history 永久對唔上(CLAUDE.md §9「Azure UAT 誤名」同一判斷)。

## 1. Why

Chris 2026-08-10 喺 DEV 真撳完 assign 之後即刻指出:

> 「但是這個記錄是否應該要能夠重新打開呢? 現在只能夠在 assign 當刻看到, 之後就已經不能夠重新查看」

**呢個缺口喺設計階段冇人提出過** —— 當時大家諗嘅係「撳嗰刻要見到過程」,而唔係「三日之後想翻查」。要真環境撳一次先浮到出嚟。

**最貴嗰格係 ServiceNow 嗰行**(`ticket: ok` / `skipped`):條 line 有冇 RITM、有冇真係去 complete 過 —— **W44 F7-12 花咗兩日 + 一次 live ServiceNow query 先答到**。ADR-0029 令佢變成畫面一行字,但**嗰行字得五秒命**。

📌 **即時實證(同日)**:Chris 睇返自己朝早喺 DEV 派嗰個 `FORMS_PRO`,答「**有冇 RITM 號?沒有印象了**」——
呢個就係本單要解決嘅缺口本身,而且係喺提出後**幾個鐘之內**就再犯一次。

## 2. Scope

### 2.1 In Scope

- **A** — assign 成功之後,ServiceNow 分支結果寫一條 `RequestEvent`(`type = NOTE`,掛 `lineItemId`)
- **B** — message **由 `steps` 入面嗰個 `ticket` step 推導**,唔另寫一套文案(見 §3)
- **C** — 🔴 寫入 **non-fatal**:寫唔到唔可以令一次已成功嘅 assign 變 500
- **D** — test:三個分支各一條 + non-fatal 一條

### 2.2 Out of Scope（explicit）

- ❌ **`AssignAttempt` 新表 / 任何 schema 改動 / migration** —— ADR-0031 D1 **Rejected**
- ❌ **refusal 路寫任何嘢** —— 🔴 **`ADR-0016 D6`「a block changes no state」唔郁**;W45 plan §2.2「只改點講,唔改擋唔擋」**一個字都唔使改**。呢個正正係揀 Option A 換返嚟嘅嘢
- ❌ **前端改動** —— Operational history 已經 render 全部 event(`request-detail.tsx` `req.events.map`,冇 type filter),`NOTE` 亦已經係系統寫結構性 note 嘅既有用法(`Line item added: …`)
- ❌ **翻查十步 `steps[]` 結構 / 多次嘗試切換** —— ADR-0031 §Outcome 明文記低 Option A 唔覆蓋呢啲,以及幾時要返去攞 D1
- ❌ retention / purge —— 本單零新增表,`RequestEvent` 嘅保留策略同其他 event 一樣(BACKLOG `audit-retention` 一族)

## 3. 契約（零 API 改動）

**新增嘅唯一嘢** = assign 成功後多一條 `RequestEvent`:

| 欄 | 值 |
|---|---|
| `type` | `NOTE` |
| `requestId` / `lineItemId` | 該次 assign 嗰條 line |
| `actorId` | 撳掣嗰個人 |
| `message` | **`ServiceNow {status}: {detail}`** —— `status` / `detail` **直接由 `steps` 嗰個 `key:'ticket'` step 攞** |

四個分支出嚟嘅實際字(全部已經存在,本單一個都冇新寫):

```
ServiceNow ok: RITM close requested
ServiceNow ok: Work note added to the parent REQ (this line has no RITM)
ServiceNow failed: <scrubPii 過嘅 error>
ServiceNow skipped: This line has no RITM and the request has no ServiceNow mirror
```

🔴 **點解一定要由 step 推導,唔另寫文案**:兩處各自維護同一份字,就會出現「dialog 見到 A、timeline 見到 B」。呢個「**第二份清單**」族嘅錯誤喺本 repo 已經數到第六次(W42 BUG-009 postmortem),同 ADR-0031 D1 唔用 Prisma enum、同 ADR-0031 D3 重用同一個 dialog **係同一條理由**。

**H4**:`detail` 本身就係要出畀前端睇嘅字,`failed` 嗰個一早經 `scrubPii`(BUG-004 形狀),其餘三個係固定字串。⇒ 冇新增 PII 面,亦冇再 scrub 一次嘅必要。

## 4. 🔴 兩條硬性保護

| # | 保護 | 點驗 |
|---|---|---|
| P1 | **寫入失敗 non-fatal** —— `try/catch` 吞咗 + `logger.warn`,照返原本個成功結果 | test:令 `requestEvent.create` reject,assert assign 仍然成功兼且回傳形狀逐字不變 |
| P2 | **喺 `$transaction` 之外、ServiceNow 分支之後** | 人手 diff:transaction block(OD2 atomic 三寫)零改動 |

⚠️ **P1 唔係抄 ADR-0031 P1** —— 嗰個係保護「乾淨嘅 400 唔好變 500」;呢個係保護「**已經真派咗 licence** 嘅一次 assign 唔好因為一條 note 而報錯」。後果更重:licence 已經落咗喺人身上,ledger 已經 +1,呢一刻報 500 會令操作員以為要重試。同一個 `writeTicket` non-fatal 判斷(ADR-0011 I1 / OD4)。

## 5. Acceptance

- [ ] G1 有 RITM → timeline 多一條 `ServiceNow ok: RITM close requested`
- [ ] G2 冇 RITM 冇 mirror → `ServiceNow skipped: This line has no RITM and the request has no ServiceNow mirror`
- [ ] G3 work note 掟錯 → `ServiceNow failed: …`,**兼且** `OutboundFailure` 照樣 record(既有行為唔跌)
- [ ] G4 🔴 **P1**:`requestEvent.create` reject 時,assign 仍然成功,回傳 `{outcome:'assigned', steps, lineItem}` 逐字不變
- [ ] G5 message 由 ticket step 推導 —— test 唔可以自己 hardcode 一份期望文案去對(要 assert 佢等於 step 個 detail)
- [ ] G6 零 schema 改動(`git diff apps/api/prisma/` 空)· 零 migration · 零前端改動
- [ ] G7 🔴 既有 test **一條唔跌**,尤其七條 `expectBlockedAt`(refusal 路本單完全冇掂)
- [ ] G8 `npm run lint`(root)exit 0 · api tsc 0
- [ ] G9 live 驗:DEV 撳一次 assign,閂咗 dialog 之後喺 Operational history 仍然睇到 ServiceNow 嗰行(⚠️ 卡 `B8`,同 W45 F4-4b 一齊做)

## 6. Risks

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | 🔴 一條 note 令已成功嘅 assign 報 500 | Low | **High** | P1 + G4 test |
| R2 | 順手掂到 transaction / gate | Low | **High** | §2.2 明文 + P2 diff + G7 |
| R3 | timeline 文案同 dialog drift | Low | Med | §3:結構上由同一個 step 推導 |
| R4 | Timeline 變長(每次 assign 多一行) | High | Low | 接受 —— 一條 line 只 assign 得一次(stage gate),所以係 **+1 行/line**,唔係無上限 |

## 7. Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-08-10 | Initial draft —— `AssignAttempt` 新表(ADR-0031 D1) | Chris DEV 實撳後反饋 | _superseded_ |
| 2026-08-10 | **🔴 全單改寫做 Option A**(timeline NOTE);新表 out of scope | Chris 拍板「想先做 Option A」;換返嚟嘅係 `ADR-0016 D6` 唔使第二次軟化 | Chris Lai |
