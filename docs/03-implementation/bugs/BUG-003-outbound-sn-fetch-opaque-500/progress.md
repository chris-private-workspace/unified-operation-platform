---
bug: BUG-003
---

# BUG-003 — Progress

## 2026-07-15 — reported → fixed（同日）
- **緣起**:Chris 報 `http://localhost:5173/requests/new` 提交報「Internal server error」。
- **診斷(唔估,真跑)**:curl 3100(dev-bypass)重現 `{statusCode:500,message:"Internal server error"}`。起 fresh backend(placeholder `.env` SN)POST /requests → log 實證 `TypeError: fetch failed` @ `ServiceNowService.request → createRecord → DirectServiceNowProvider.submit → OutboundRequestService.create`。→ 根因 = outbound submit 打真 SN(placeholder 不可達)fetch throw,`provider.submit()` 未 wrap → generic 500。
- **決定(Chris,AskUserQuestion)= 修 error handling(BUG fix)**:wrap 成乾淨 503 + toast,取代 opaque 500(mirror assign BUG-002 pattern)。**唔令提交成功**(仍無真 SN),但 error 有意義。
- **修**:`OutboundRequestService.create` try/catch wrap `provider.submit()` → `ServiceUnavailableException`「ServiceNow is unavailable — the request could not be submitted. Please retry.」(H4 唔 log UPN;provider-agnostic 涵蓋 direct+n8n;fail-closed 不變)。
- **H5**:`outbound-request.service.spec` SN-fail test 由 raw `'SN down'` → 預期 `ServiceUnavailableException`;mirror 仍 not-called。
- **前端**:零改 —— `new-request.tsx` onError 已 toast `e.message`,`api.ts apiPost` 已抽 server message。
- **verify**:見下步(build/test/lint + live 500→503)。

## Retro
- **診斷紀律**:唔靠「應該係 X」，起 fresh backend 讀真 stack trace 定位(H7)。demo「成功」係 mock SN,真 instance placeholder → 揭出 error-handling gap。
- **一致性教訓**:BUG-002 只 harden 咗 Graph 路徑;outbound ServiceNow/n8n 整合失敗一直係 latent opaque-500。本 fix 補齊(carry:未來新對外整合寫 provider 時,submit 失敗一律 wrap)。
- **scope 克制**:只 wrap submit(reported case);orphan(SN 成功 mirror 失敗)維持現行(內部 DB 錯,非整合不可達)。
