---
bug_id: BUG-001
title: "GraphService 把 user UPN(PII)寫入 log — 違反 H4"
severity: Sev3          # Sev1 | Sev2 | Sev3 | Sev4 (per PROCESS.md §4.4)
status: done            # triaged | investigating | fixing | verifying | done | wont-fix
reported: 2026-07-09
reporter: "Auto-detected (W04 retro)"
affects_components: [integration/graph]
spec_refs:
  - CLAUDE.md §5.4 H4（絕不 log PII:user UPN / email / displayName）
---

# BUG-001 — GraphService 把 user UPN(PII)寫入 log

> **Report version**:1.0(initial)
> **Triage approver**:Chris Lai(2026-07-09 — 明確要求「即刻修」)

## 1. Symptom
`GraphService`(integration layer)喺兩處把 **user UPN**(= email 格式,PII)寫入 application log:
- `assignLicense()` 成功時:`Assigned SKU <guid> to <UPN>`
- `findUser()` 非-404 錯誤時:`findUser failed for <UPN>: <err>`

W04(Module D-2)接通 assign flow 後,`AssignService` 用 `request.targetUpn` call `assignLicense` → **每次成功 assign 就寫一個 UPN 落 log**,由潛在變真實暴露。

## 2. Reproduction Steps
1. 一條 `READY` line item 過晒 sync gate。
2. call `PATCH /fulfilment/requests/:id/line-items/:lid/assign`(或直接 `GraphService.assignLicense(upn, skuId)`)。
3. assign 成功 → stdout 出現 `Assigned SKU <guid> to <UPN>` —— UPN 明文喺 log。

**Reproduction reliability**:Always(log 語句無條件執行於成功路徑)
**Environment**:local dev(任何環境皆然;log = Nest `Logger` → stdout)

## 3. Expected vs Actual
- **Expected**(CLAUDE.md §5.4 H4):user UPN / email / displayName **絕不** log 落 plaintext。操作性追蹤(邊個被 assign)靠 DB `RequestEvent(ASSIGN)` + line item,唔靠 integration log。
- **Actual**:UPN 明文寫入 log 兩處(`graph.service.ts:132` 成功、`:98` 錯誤)。

## 4. Impact
- **Affected users / scenarios**:每次 `assignLicense` 成功 + 每次 `findUser` 非-404 錯誤。
- **Workaround available?**:No(唯有改 code)。
- **Data loss / corruption?**:No。
- **Security implication?**:**Yes** — PII(UPN)落 log,違反 H4 privacy 約束。

## 5. Severity Justification
**Sev3** per `PROCESS.md §4.4`:privacy hygiene 缺陷,唔係 outage / data loss / 外部 breach(非 Sev1),亦唔係 major feature broken(assign 本身正常運作,非 Sev2)。範圍 = 內部單租戶工具、log 目前 local stdout(未確認外送/長期保留)。屬「specific impact / minor」。若日後 log 外送 SIEM / 長期保留,可升 Sev2。Postmortem 非強制。

## 6. Initial Diagnosis
- **Initial hypothesis**(triage):兩條 log 語句直接內插 `userIdOrUpn` 參數。
- **Root cause confirmed**(2026-07-09):`graph.service.ts:132`(`Assigned SKU ${skuId} to ${userIdOrUpn}`)+ `:98`(`findUser failed for ${userIdOrUpn}`)—— W01 integration code,寫時 assign flow 未接通所以未觸發;W04 接通後暴露。

## 7. Acceptance for Fix
- [x] Reproduction confirmed(code inspection — 成功路徑無條件 log UPN)
- [x] Root cause identified(`graph.service.ts:98` + `:132`)
- [x] Fix implemented(移除 log 內嘅 UPN,保留 skuId / err message)
- [x] Regression test added(**實證 fails-before**:還原 buggy code 後 assign log test fail;fix 後 pass)
- [x] Verified(6 suites / 39 tests 綠 + build 0 error + lint clean)

## 8. Report Changelog
| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-09 | Initial triage(Sev3) | W04 retro 揭發,Chris 要求即刻修 | Chris Lai |

---

**Lifecycle reminder**:Sev3 → postmortem 非強制(recurring 先寫)。
**Gate reminder**:Chris 已 confirm repro + severity(「即刻修 BUG-001」)→ 可投查。
