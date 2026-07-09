---
bug_id: BUG-001
report_ref: ./report.md
checklist_ref: ./checklist.md
status: done    # in-progress | done
---

# BUG-001 — Progress

## 2026-07-09 — Triage → Fix → Verify（同日完成）

**Triage**:W04 retro 揭發 `GraphService` log UPN;Chris 要求即刻修。Sev3(privacy hygiene,H4)。

**Root cause**:`graph.service.ts:98`(findUser 非-404 錯誤 `findUser failed for ${userIdOrUpn}`)+ `:132`(assignLicense 成功 `Assigned SKU ${skuId} to ${userIdOrUpn}`)。`userIdOrUpn` = AssignService 傳入嘅 `targetUpn`(UPN,PII)。W01 寫時 assign 未接通所以未觸發;W04 接通後暴露。

**Fix**:兩條 log 移除 UPN,保留操作價值(skuId / err message)。邊個被 assign 靠 DB `RequestEvent(ASSIGN)` 追蹤,唔靠 integration log。

**Regression test**:新 `graph.service.spec.ts` —— 用 mocked ConfigService instantiate `GraphService`,覆寫 private `client` 做 mock,spy Logger:
- assign 成功 → log 唔含 UPN(fix 前會 fail:含 `to <upn>`)。
- findUser 非-404 錯誤 → log 唔含 UPN。

**Verify**:`npm run test` 全綠(新 test 綠;fix 前 assign log test 會 fail 為證)。build 0 error、lint clean。

**Acceptance**(report §7):全部 ✓。

**Commit**:`fix(integration): BUG-001 — stop logging user UPN (PII) in GraphService`（pushed origin/main）。

---

**End of BUG-001**
