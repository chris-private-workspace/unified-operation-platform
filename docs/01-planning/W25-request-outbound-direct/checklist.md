---
phase: W25-request-outbound-direct
---

# W25 Phase 乙 — Checklist(daily tick)

## D0 — kickoff + ground
- [x] plan/checklist/progress 建立 + Chris approve(draft → active)
- [x] ground:讀 `servicenow.service.ts`(request<T> pattern)· W03/W24 intake mirror · 前端 form+mutation pattern

## D1 — ServiceNowService.createRecord
- [x] `createRecord(table, fields)` POST Table API,回 sys_id/number
- [x] unit test(mock fetch,POST body + 回值)

## D2 — RequestSubmissionProvider + DirectServiceNowProvider
- [x] interface `RequestSubmissionProvider.submit(payload)`
- [x] `DirectServiceNowProvider`:create REQ → 每 line create RITM(掛父)→ 回 sysId/number 齊
- [x] unit test(mock createRecord,REQ+RITM 次序 + 回值組裝)

## D3 — POST /requests endpoint + 建 mirror + schema
- [x] DTO(targetUpn/opcoCode/lineItems[skuId+qty]/remark)+ validation
- [x] endpoint `POST /requests`(@Roles + @CurrentUser scope)
- [x] 建 mirror service:provider.submit → 建 `Request`(origin=platform-created,掛 REQ)+ `RequestLineItem`(掛 RITM);fail-closed(SN fail 唔建 local)
- [x] schema additive `Request.origin` + migration
- [x] module 註冊(provider DI)

## D4 — H5 tests
- [x] createRecord happy
- [x] provider submit(REQ+RITM 組裝)
- [x] endpoint happy(SN create mock + 建 mirror two-level + origin)
- [x] scope 403(OPCO_IT 越權,唔到 provider)
- [x] SN create 失敗 → fail-closed,零 local 寫入
- [x] mirror 欄位正確(REQ 掛 Request / RITM 掛 line item)

## D5 — 前端開單畫面
- [x] route(如 `/requests/new`)+ nav entry
- [x] form(targetUpn/opcoCode/SKU picker+qty/remark)+ 前端 validation(mirror DTO)
- [x] `useMutation` → POST /requests → success/error toast
- [x] token-only、light+dark、一個 primary(Ricoh red 提交)

## D6 — 前端 tests + verify
- [x] FE unit test(form validation / mutation 狀態 / error path)
- [x] browser 端到端(填 form → 提交 → 成功 mirror + toast;error graceful;light+dark)

## D7 — verify + closeout
- [x] build / lint / test 全綠(api + web)
- [x] live curl(mock SN:happy / scope 403 / SN-fail fail-closed)
- [x] regression(module D 履行 / 甲 intake / dev-bypass)
- [x] BACKLOG / memory 同步 + progress retro + plan closed + Phase 丙 carry
