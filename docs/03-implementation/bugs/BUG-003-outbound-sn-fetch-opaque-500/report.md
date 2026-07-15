---
bug: BUG-003
title: "/requests 提交時 ServiceNow fetch 失敗 → 未 wrap → opaque 500 Internal server error"
severity: Sev3   # UX / robustness — 唔 crash,但整合失敗回 opaque 500 而非有意義 503
status: fixed    # reported | fixing | fixed（2026-07-15;wrap provider.submit → 503 + spec 更新,live 500→503 驗）
found_in: 手測 /requests/new 提交（本地 placeholder ServiceNow creds）
owner: Chris Lai
date: 2026-07-15
refs:
  - apps/api/src/fulfilment/outbound-request.service.ts（create — provider.submit 未 wrap）
  - apps/api/src/fulfilment/direct-servicenow.provider.ts / n8n-workflow.provider.ts（submit → 真 fetch）
  - apps/api/src/integration/servicenow/servicenow.service.ts（request → global fetch）
  - apps/api/src/integration/graph/graph-unavailable.ts（既有 pattern,assign/reconcile/catalog）
---

# BUG-003 — outbound 建單整合失敗 → opaque 500

## 現象
`/requests/new` 填表提交 → 前端 toast「Internal server error」。curl 重現(3100,dev-bypass):
```
POST /requests → {"statusCode":500,"message":"Internal server error"}
```
後端 log(fresh backend 重現):
```
ERROR [ExceptionsHandler] fetch failed
TypeError: fetch failed
    at ServiceNowService.request → createRecord → DirectServiceNowProvider.submit
    → OutboundRequestService.create
```

## 根因
- outbound 建單 `OutboundRequestService.create` 呼 `provider.submit()`(external side-effect 先,fail-closed)—— `DirectServiceNowProvider` 內 `ServiceNowService.createRecord` 對 `SERVICENOW_INSTANCE_URL`(本地 = placeholder,不可達)做 **global `fetch`**,fetch **throw `TypeError: fetch failed`**(網絡/DNS/proxy)。
- `provider.submit()` **喺 try/catch 外**(原本只 wrap 之後嘅 mirror `prisma.request.create`)→ raw `TypeError` 唔係 `HttpException` → Nest exception filter 包成 **generic 500「Internal server error」**。
- 對比 assign 路徑(BUG-002 / BE-graph-harden):Graph 失敗經 `graphUnavailable()` 包成**乾淨 503 + 有意義 message**;outbound ServiceNow(+ n8n)路徑**無同等處理** → error handling 唔一致。

## 影響
- **非 crash**(process 唔死),但**整合不可達時**(生產 SN 暫故障 / 本地無真 SN)操作員見到 **opaque 500** 而唔係「ServiceNow unavailable,請 retry」,難自助判斷。
- **非 regression**:`/requests/new` 由 W25 起就需要**可達的 ServiceNow**;本 bug 純屬 error-handling gap,唔影響 happy path(真 SN / mock harness 底下正常)。

## 修法（surgical — scoped 到 outbound submit）
`OutboundRequestService.create` 內 wrap `provider.submit()`:raw 整合 error(fetch failed / webhook down / SN 5xx)→ **`ServiceUnavailableException`(503)**,message「ServiceNow is unavailable — the request could not be submitted. Please retry.」(H4:log 動作 + message,唔 log UPN)。
- **provider-agnostic**:一處涵蓋 direct + n8n(兩者 submit 失敗都經此)。
- **fail-closed 不變**:submit throw → 唔行 mirror create,零 local 寫入(原行為)。
- gate 嘅 404/400/403 照舊(喺 submit 之前 throw,不受影響)。
- **前端零改**:`new-request.tsx` `onError` 已 toast `e.message`、`api.ts` `apiPost` 已抽 server `message` → 503 message 自動顯示取代「Internal server error」。
- **out-of-scope(可接受)**:SN submit 成功但 mirror DB create 失敗 = SN orphan → 現行 log warn + rethrow(rare;屬內部 DB 錯,非整合不可達,維持 500 合理)。

## H5 覆蓋
- **更新既有 test**(`outbound-request.service.spec`「ServiceNow create fails → fail-closed」):由預期 raw `'SN down'` → 預期 **`ServiceUnavailableException`**;mirror 仍 `not.toHaveBeenCalled`(fail-closed 意圖不變)。
- 其餘 gate test(403/404/400 before submit)不變 → 確認 wrap 唔影響前置驗證。
- **live 驗**:fresh backend(placeholder SN)POST /requests → 由 **500 → 503** +「ServiceNow is unavailable…」message。
