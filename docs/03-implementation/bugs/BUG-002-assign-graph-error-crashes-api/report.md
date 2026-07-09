---
bug: BUG-002
title: "assign 時 Graph findUser throw → 未 wrap → NestJS process crash"
severity: Sev2   # critical path robustness — 生產 Graph 出錯會 crash 整個 API
status: fixed    # reported | fixing | fixed（2026-07-09;fix + regression test,實證 fails-before）
found_in: W07 (FE-2) assign-now 手測
owner: Chris Lai
date: 2026-07-09
refs:
  - apps/api/src/fulfilment/assign.service.ts（assignLineItem — findUser/getSubscribedSkus/assignLicense）
  - apps/api/src/integration/graph/graph.service.ts（findUser:404→null,其餘→throw raw）
---

# BUG-002 — assign 時 Graph error 令 API crash

## 現象
FE-2「Assign now」手測（本地 placeholder Graph creds）→ 後端崩:
```
ERROR [GraphService] findUser failed: AADSTS700038: ... is not a valid application identifier
RangeError [ERR_HTTP_INVALID_STATUS_CODE]: Invalid status code: -1
    at ServerResponse.writeHead ... ExceptionsHandler.handleUnknownError
```
整個 NestJS process 退出（之後所有 request 502/連線 refused）。

## 根因
- `graph.service.findUser` 對 **404 → return null**（正確,= sync gate「user 未 sync」）,但**其他 error（auth/network/throttle）→ `throw err`（raw MSAL error）**。
- `assign.service.assignLineItem` 呼叫 `findUser`（+ `getSubscribedSkus` + `assignLicense`）**冇 catch**。raw MSAL error 唔係 `HttpException`,帶住 invalid status（-1）傳到 Nest exception filter → Express `writeHead(-1)` → **crash**。
- W04 test 全部 mock `findUser` 嘅 **return value**（null / user object），**冇覆蓋 throw 路徑** → 漏咗。

## 影響
Critical path robustness:生產環境 Graph 一旦 throttle / timeout / auth 過期 / 暫時故障,assign（同理 catalog sync / reconcile 呼 getSubscribedSkus）會令**整個 API crash**,而唔係回一個乾淨錯誤畀操作員 retry。

## 修法（surgical — scoped 到 assign critical path）
`assignLineItem` 內 wrap 三個 Graph await（`findUser` / `getSubscribedSkus` / `assignLicense`）:raw Graph error → **`ServiceUnavailableException`（503）**（H4:唔 log UPN,只 log 動作 + message）。gate 嘅 `BadRequestException` 照舊 pass through（喺 try/catch 外）。fail-closed 不變（Graph 失敗 → 唔入 `$transaction`,ledger 唔郁）。

> catalog sync / reconcile 呼 `getSubscribedSkus` 亦有相同 latent 風險 → 記入 progress carry-over（本 bug scope = assign,per 用戶批准）。

## H5 覆蓋
- **新 regression test**:`findUser` **reject（throw）** → `assignLineItem` 應 throw `ServiceUnavailableException`（**唔** raw error / crash）+ ledger 唔郁（fail-closed）。實證 **fails-before**（未修時傳 raw error）。
- **更新既有 test**:「assignLicense throws」由預期 raw `'no seats'` → 預期 `ServiceUnavailableException`（fail-isolation 意圖不變）。
