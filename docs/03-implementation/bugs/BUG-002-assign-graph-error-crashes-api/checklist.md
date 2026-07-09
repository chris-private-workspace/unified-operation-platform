---
bug: BUG-002
status: complete
---

# BUG-002 — Checklist

- [x] Root cause 定位（findUser throw raw → assignLineItem 冇 catch → crash）
- [x] Fix:三個 Graph await wrap → `ServiceUnavailableException`（`graphUnavailable` helper;H4 唔 log UPN）
- [x] Gate BadRequest 保持 pass-through;fail-closed 不變
- [x] 新 regression test（findUser throw → 503 + 冇 side-effect）
- [x] 更新既有 test（assignLicense throw → 503）
- [x] 實證 fails-before（暫還原 → 新 test red → 改返）
- [x] api 40 test 綠 + `nest build` 0 error + eslint clean
- [x] report/progress/checklist 三件套
- [x] BACKLOG BUG-002 → 完成;carry-over（BE-graph-harden）加候選
- [ ] commit + push
