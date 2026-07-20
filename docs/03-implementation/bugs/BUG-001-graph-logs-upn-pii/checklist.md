---
bug_id: BUG-001
report_ref: ./report.md
status: done         # investigating | fixing | verifying | done — fix + regression test 已驗（report done；2026-07-20 status 回填）
last_updated: 2026-07-20
---

# BUG-001 — Checklist

## Investigate
- [x] Confirm repro（code inspection:`assignLicense` 成功路徑無條件 log UPN）
- [x] Root cause（`graph.service.ts:98` findUser 錯誤 + `:132` assignLicense 成功）

## Fix
- [x] `graph.service.ts:132` → `Assigned SKU ${skuId}`（移除 `to ${userIdOrUpn}`）
- [x] `graph.service.ts:98` → `findUser failed: ${err?.message}`（移除 `for ${userIdOrUpn}`）

## Regression test
- [x] `graph.service.spec.ts`:assign 成功時 log **不含** UPN
- [x] `graph.service.spec.ts`:findUser 非-404 錯誤時 log **不含** UPN

## Verify
- [x] `npm run test` 全綠（含新 regression test）
- [x] `npm run build` 0 error · `npm run lint` clean

## Closeout
- [x] `report.md` status → done
- [x] committed + pushed
- [x] BACKLOG BUG-cand → 完成（BUG-001 done）
