---
bug: BUG-002
report_ref: ./report.md
status: fixed
date: 2026-07-09
---

# BUG-002 — Progress

## 2026-07-09 — Fix + regression test

**Root cause 定位**:`graph.service.findUser` 對非-404 error `throw` raw MSAL error;`assign.service.assignLineItem` 三個 Graph await（`findUser` / `getSubscribedSkus` / `assignLicense`）冇 catch → raw error（invalid status -1）傳到 Nest exception filter → `writeHead(-1)` → **process crash**。

**Fix**（`apps/api/src/fulfilment/assign.service.ts`）:
- 三個 Graph await 各 wrap try/catch → `graphUnavailable(action, err)` helper 回 **`ServiceUnavailableException`（503）**（H4:唔 log UPN,只 log action + message）。
- gate 嘅 `BadRequestException` 喺 try/catch **外**,照舊 pass through。fail-closed 不變（Graph 失敗 → 唔入 `$transaction`,ledger 唔郁）。

**H5 test**（`assign.service.spec.ts`）:
- 新:`wraps a findUser failure as 503 and touches nothing (fail-closed)` —— `findUser` reject（帶 `statusCode:-1` 模擬 MSAL error）→ 期望 `ServiceUnavailableException` + `assignLicense`/`$transaction`/ledger 全冇被呼。
- 更新:`does not touch the ledger if Graph assignLicense throws` —— 由預期 raw `'no seats'` 改預期 `ServiceUnavailableException`（fail-isolation 意圖不變）。
- **實證 fails-before**:暫還原 findUser wrap → 新 test **fail**（raw error 傳出,`statusCode:-1`）→ 再改返。

**Gate**:api 全套 **40 test 綠**（6 suites）· `nest build` 0 error · `eslint` clean（`--fix` 格式）。

### Carry-over（非本 bug scope）
- **catalog sync / reconcile 呼 `getSubscribedSkus` 有相同 latent 風險**（Graph throw → 未 wrap → 同樣 crash）。本 bug per 用戶批准 scoped 到 assign critical path。→ 記入 BACKLOG（BE-graph-harden 候選:GraphService 邊界統一 wrap,或各 POST trigger service catch）。

**Commit**:_(pending — 連本 fix + test + 三件套一併 commit)_
