# CH-023 — Assign 嘗試記錄可翻查 · Checklist

> **Status**: `draft` —— **ADR-0031 未 Accepted ⇒ F1 以下一律唔可以開工**(H1 / PROCESS R1)。

## F0 — 開工 gate

- [ ] F0-1 🔴 **ADR-0031 由 Proposed → Accepted**(H1;Chris 拍板)
- [ ] F0-2 `spec.md` status `draft` → `active`
- [ ] F0-3 `docs/adr/README.md` index 加 ADR-0031 一行
- [ ] F0-4 BACKLOG 加 `CH-023` row(R7)

## F1 — test 先行（兩條「紅得靜」嘅）

- [ ] F1-1 🔴 **G3 先寫**:`AssignAttempt.create` reject → assert 仍然 400 **兼且 message + body 形狀逐字不變**(fails-before 要實證)
- [ ] F1-2 🔴 **G7 先寫**:結構 guard —— 只此一個 `AssignResultDialog`,冇「歷史版」副本

## F2 — schema + 後端

- [ ] F2-1 `AssignAttempt` model(ADR-0031 D1;`outcome`/`failedAt` **用 `String` 唔用 enum**,理由見 ADR)
- [ ] F2-2 migration —— apply **同 rollback** 都喺 scratch DB 驗(G9)
- [ ] F2-3 成功路寫一行(G1)
- [ ] F2-4 refusal 路寫一行(G2)—— 🔴 **喺 gate 判斷之後、throw 之前**
- [ ] F2-5 🔴 **P1 non-fatal `try/catch`**
- [ ] F2-6 `GET …/assign-attempts` + `AssignAttemptDto`(`enum:` 一律 spread const array,唔手寫 literal)
- [ ] F2-7 OPCO_IT scope(G5)
- [ ] F2-8 🔴 **P3 R4 diff** —— gate 段落條件式零改動,結果寫入 progress
- [ ] F2-9 🔴 **G4:既有七條 `expectBlockedAt` + 全部 gate test 一條唔跌**

## F3 — 前端

- [ ] F3-1 line item 加 secondary 掣「View assign result」(冇記錄唔出掣,唔出 disabled)
- [ ] F3-2 重開 `AssignResultDialog` —— **重用,唔另寫**(G7)
- [ ] F3-3 `Attempt N of M` + 前後切換(G6)
- [ ] F3-4 🔴 H6:一個 view 一個 primary(dialog 內 `Done` 仍然係唯一)
- [ ] F3-5 跑 `ui-design` skill
- [ ] F3-6 light + dark 真 render 驗(G8)

## F4 — 收尾

- [ ] F4-1 `npm run lint`(root)exit 0 · api + web tsc 0(G10)
- [ ] F4-2 既有 test 一條唔跌(G10)
- [ ] F4-3 🔴 **live 驗**(G11)—— ⚠️ **卡 `B8`,同 W45 F4-4b 一齊做**
- [ ] F4-4 BACKLOG 標完成(R7)
- [ ] F4-5 CLAUDE.md §0/§9 + `SESSION_SUMMARY.md` 掃一次
