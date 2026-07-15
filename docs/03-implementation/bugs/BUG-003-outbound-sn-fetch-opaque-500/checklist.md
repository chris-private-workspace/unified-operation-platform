---
bug: BUG-003
---

# BUG-003 — Checklist

- [x] 重現 + 確診(curl 3100 500;fresh backend log `TypeError: fetch failed` stack:createRecord→submit→create)
- [x] 根因定位(`provider.submit()` 喺 try/catch 外 → raw error → generic 500;對比 assign 已有 graphUnavailable wrap)
- [x] 修:`OutboundRequestService.create` wrap `provider.submit()` → `ServiceUnavailableException`(503,H4 唔 log UPN,fail-closed 不變,provider-agnostic direct+n8n)
- [x] H5:更新 `outbound-request.service.spec` SN-fail test → 預期 `ServiceUnavailableException` + mirror not called
- [x] 前端確認:`new-request.tsx` onError + `api.ts` 已 surface server message → 零 FE 改
- [x] verify:api test 全綠(201)+ build + lint
- [x] live 驗:fresh backend POST /requests → 500 → **503**「ServiceNow is unavailable…」
- [x] BACKLOG 同步 + BUG doc(report/checklist/progress)
