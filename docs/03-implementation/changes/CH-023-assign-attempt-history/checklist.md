# CH-023 — Assign 之後 ServiceNow 側結果留得低 · Checklist

> **Status**: `active` —— Chris 2026-08-10 拍板 **Option A**(timeline NOTE)。
> 🔴 **ADR-0031 個 D1 新表方案 = Rejected**,原本嘅 F1-F4 全部作廢,見文末 §作廢區(冇刪,逐條標明點解)。

## F0 — 開工 gate

- [x] F0-1 🔴 **ADR-0031 拍板** —— Chris 揀 Option A ⇒ ADR status `Proposed` → **`Rejected`** + 加 §Outcome 記低點解反轉
- [x] F0-2 `spec.md` 全單改寫做 Option A,status → `active`
- [x] F0-3 `docs/adr/README.md` index 更新 ADR-0031 一行(標 Rejected)
- [x] F0-4 BACKLOG 加 / 更新 `CH-023` row(R7)

## F1 — 實作（apps/api,一個檔）

- [x] F1-1 `assign.service.ts`:ServiceNow 分支之後,由 `steps` 攞返個 `ticket` step,寫一條 `RequestEvent`(`NOTE` + `lineItemId` + `actorId`)
- [x] F1-2 🔴 **P1 non-fatal `try/catch` + `logger.warn`** —— 已派咗 licence 嘅一次 assign 唔可以因為一條 note 報 500
- [x] F1-3 🔴 **P2 位置**:喺 `$transaction` **之外**、ServiceNow 分支**之後**;transaction 入面三寫零改動
  - 🟢 **證據比人手 diff 硬**:`git diff --numstat` = **37 insertions / 0 deletions** ⇒ 呢個檔**冇任何一行被改或刪**,gate 條件式同 transaction 三寫結構上逐字不變
- [x] F1-4 message **由 step 推導**(`ServiceNow {status}: {detail}`),唔另寫文案

## F2 — Test（H5:掂到 assign critical path）

- [x] F2-1 G1 有 RITM → `ServiceNow ok: RITM close requested`
- [x] F2-2 G2 冇 RITM 冇 mirror → `ServiceNow skipped: …`
- [x] F2-3 G3 work note 掟錯 → `ServiceNow failed: …` **兼且** `OutboundFailure` 照 record
- [x] F2-4 🔴 G4 **P1**:`requestEvent.create` reject → assign 仍然成功,回傳形狀逐字不變
  - 🟢 **falsification 真跑過**:喺 `catch` 暫時加 `throw err` ⇒ **淨係呢一條紅,其餘 70 條全綠**(有區分度兼且冇誤傷),之後還原
- [x] F2-5 🔴 G5 assert message **等於** step 個 detail 推導出嚟嗰個,唔 hardcode 第二份文案
  - ⚠️ 配一條 `toBe('ServiceNow ok: RITM close requested')` 一齊睇 —— **淨係推導 assert 會變 tautology**(code 同 test 由同一個 step 攞值,永遠 pass)
- [x] F2-6 🔴 G7 既有 test 一條唔跌 —— **api 921 passed / 69 suites**(917 → 921)

## F3 — 收尾

- [x] F3-1 G6 零 schema 改動 · 零前端改動 —— `git status --short` 淨係 2 個 `apps/api/src` 檔 + 4 個 doc
- [x] F3-2 G8 `npm run lint`(root)**exit 0** · api tsc **exit 0**
- [x] F3-3 BACKLOG 標完成(R7)+ W45 `progress.md` 寫一段
- [x] F3-4 CLAUDE.md §0 / §9 + `SESSION_SUMMARY.md` 座標掃一次(§14 規矩:呢兩份係唯一無條件讀入每個新 session 嘅文件)
- [ ] F3-5 🔴 **live 驗**(G9)—— ⚠️ **卡 `B8`,同 W45 F4-4b 一齊做**
  - 🟢 **前提已補**(2026-08-10 **部署 #5** `dev-86ed450`):本單個 code 之前**唔喺 DEV**(部署 #4 個 tag `dev-211001e` 早 `f219676` 三個 commit)⇒ G9 當時根本驗唔到。而家 api `--0000007` / web `--0000004` 兩個 `Healthy` traffic 100,container log 證 DB 通 + seed 行到。**唔好當「已 merge 入 main」= 「已喺 DEV」。**

---

## ❌ 作廢區（方案由 ADR-0031 D1 新表 → Option A,2026-08-10）

> Sacred rule:未勾項唔刪。以下**唔係延後**,係 Chris 拍板換方案之後**唔再需要**。
> 若果將來「翻查每次嘗試」再被要求 → ADR-0031 D1-D6 原文仍在,由嗰度重開。

- ~~F1-1 G3 test 先行(`AssignAttempt.create` reject 仍然 400)~~ — ❌ 冇新表;**同族保護改咗做 F2-4**(保護對象由「400 唔變 500」變成「已成功嘅 assign 唔變 500」)
- ~~F1-2 G7 結構 guard:只此一個 `AssignResultDialog`~~ — ❌ 冇第二個 dialog 要防;**同族風險改咗由 §3「message 由 step 推導」處理**
- ~~F2-1 `AssignAttempt` model~~ / ~~F2-2 migration apply + rollback~~ / ~~F2-3 成功路寫一行~~ / ~~F2-6 `GET …/assign-attempts` + DTO~~ / ~~F2-7 OPCO_IT scope~~ — ❌ 零 schema 改動
- ~~F2-4 refusal 路寫一行~~ / ~~F2-5 P1 non-fatal~~ / ~~F2-8 P3 R4 diff~~ / ~~F2-9 G4 七條 `expectBlockedAt`~~ — 🔴 **refusal 路本單完全唔掂** ⇒ `ADR-0016 D6` 唔使第二次軟化。(七條 `expectBlockedAt` 唔跌呢個要求**保留**,見 F2-6)
- ~~F3-1..F3-6 前端 secondary 掣 / `Attempt N of M` / ui-design / light+dark~~ — ❌ **前端零改動**(Operational history 已經 render 全部 event)
- ~~F4-1..F4-2~~ — 保留,已改寫做 F3-1 / F3-2
