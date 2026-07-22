# CH-007 — Implementation Checklist

> 由 `spec.md §4 Acceptance` 推導。**Sacred rule**:唔刪未勾項 —— 只 `[x]` 或標 🚧 + 理由 + target。
> **鐵律**:每個鎖 backend 為準;前端只係 UX。

## F1 — 後端:header PATCH

- [ ] F1.1 `dto/update-request.dto.ts` —— 只設 `targetDisplayName`/`requesterEmail`/`rawRequestText`/`targetUpn`,全 optional(**刻意無**同步鍵/opcoId/origin)
- [ ] F1.2 `request.service.updateHeader(id, dto, actor)` —— assertOpcoScope + `targetUpn` sync-後 gate(409)+ 寫 RequestEvent(**無 PII 值**)
- [ ] F1.3 `PATCH :id` controller route
- [ ] F1.4 test:**C2** sync 後拒/前准 · **C3** 同步鍵夾帶被剝(原值不變)· **C7** opco-scope 403

## F2 — 後端:line item DELETE + add gate

- [ ] F2.1 `request.service.removeLineItem(id, lineItemId, actor)` —— assertOpcoScope + guard(`serviceNowSysId!=null` 或 `stage!=REQUESTED` → 409)+ 刪 + RequestEvent + recomputeRequestStatus
- [ ] F2.2 `DELETE :id/line-items/:lineItemId` controller route
- [ ] F2.3 `addLineItem` 加 `origin=='platform-created'` → 409 gate
- [ ] F2.4 test:**C4** 三態(REQUESTED+無RITM准/有RITM拒/非REQUESTED拒)· **C5** recompute+event · **C6** 加 platform-created拒/intake准 · **C8** 刪唔掂 ledger · **C7** scope 403

## F3 — 後端收口

- [ ] F3.1 `apps/api` test **333 → ≥345** · lint 0 · build 0
- [ ] F3.2 permissions.spec 若受影響(route 加喺既有 controller,role 不變)→ 檢查 snapshot

## F4 — 前端:鎖 gating 純函數 + header edit

- [ ] F4.1 `lib/requests.ts` 加 `canEditUpn(req)`/`canRemoveLine(item)`/`canAddLine(req)` + unit test(**C9**)
- [ ] F4.2 `api-types.ts` 加 update body 型別;`hooks/mutations.ts` 加 `useUpdateRequest`/`useAddLineItem`/`useRemoveLineItem`
- [ ] F4.3 `request-detail.tsx` header inline edit(W23-B pattern);同步鍵區唯讀;`targetUpn` sync-後 disabled+hint

## F5 — 前端:line item 加減 UI

- [ ] F5.1 Add line item 控制(SKU picker + qty)—— `canAddLine` 為 true 先顯示
- [ ] F5.2 每行 trash —— `canRemoveLine(item)` 為 true 先顯示(鎖住行**唔出** trash,唔係 disable)
- [ ] F5.3 `apps/web` test **123 → ≥130** · lint 0 · build 0

## F6 — 驗收

- [ ] G-C10 live:**intake 單** 見 Add + 可刪 REQUESTED 行;**platform-created 單** 唔見 Add、有RITM 行唔見 trash;同步鍵唯讀
- [ ] G-C2 live:sync 後改 UPN → 409
- [ ] G-C11 H6 token-only + lucide + 一 primary + light/dark;跑 `ui-design` 12 條
- [ ] G-截圖驗(唔淨靠 DOM,W31 教訓)

## F7 — 收尾

- [ ] F7.1 progress 完成摘要 + 教訓
- [ ] F7.2 spec status → done + changelog(如有 deviation)
- [ ] F7.3 BACKLOG 同步(R7)—— 新 candidate:handler 改 / quantity edit / push-新行-上-SN
- [ ] F7.4 design-system §6 檢查(改既有畫面,非新畫面)
- [ ] F7.5 commit + push + PR(stack 喺 #17 之後)
