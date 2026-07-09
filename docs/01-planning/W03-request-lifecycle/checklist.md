---
phase: W03-request-lifecycle
plan_ref: ./plan.md
status: complete    # draft | in-progress | complete
last_updated: 2026-07-09
---

# Phase W03 — Checklist

> Atomic checkbox（每 item ≤ 1–2 hour effort）。
> ✅ plan approved（status active,2026-07-09）;OD1 = 拆兩個（D-1 now / D-2=W04）,OD2–OD5 全照 default。
> AI tick 完成嘅 item;唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。

## F1 — FulfilmentModule 接線

- [x] `FulfilmentModule` import `IntegrationModule`（取 `ServiceNowService`）+ register `RequestService` / `StageService` / `FulfilmentController`
- [x] verify:`npm run build` 0 error;boot log map `FulfilmentController` + 5 route（G1/G3）

## F2 — RequestService（intake + line item + triage）

- [x] `intake()`:by SN number（`getRecordByNumber` → map SN 欄 + rawRequestText）或手動 payload → 建 `Request`（status OPEN）;opco/SN 不存在 → 明確 NotFound
- [x] `addLineItem()`:加 `RequestLineItem`（skuCatalogId + quantity + triage procurementRequired;stage REQUESTED）+ `RequestEvent(NOTE)` + recompute status
- [x] `listRequests()` / `getRequestDetail()`（含 line items + events + opco + sku ref）
- [x] verify（H5）:`request.service.spec` — manual/SN intake mapping / opco 不存在 / SN 不存在 / addLineItem triage + sku 不存在（SN mock）✓ 6 test
- [x] **H4**:intake 唔 log target UPN（PII）—— 只 log request id + opco code

## F3 — StageService（stage 推進 state machine）⭐ critical path

- [x] `advanceStage()`:合法 transition matrix（短路 REQUESTED→READY;procurement REQUESTED→QUOTING→OPCO_APPROVED→AWAITING_VENDOR→READY;→CANCELLED）
- [x] 拒 `→ASSIGNED`（D-2,明確 error）+ 拒非法跳轉
- [x] 每 transition 寫 `RequestEvent(STAGE_CHANGE, from, to)` + set stage timestamp
- [x] transition 後 recompute `Request.status`（OD4;`aggregateRequestStatus` pure helper,forward-compat COMPLETED）
- [x] verify（H5,critical path）:`stage.service.spec` — 合法逐步 / 非法跳轉被拒 / →ASSIGNED 被拒 / CANCELLED / NotFound / event+timestamp / status 聚合（含 pure helper 5 case）✓ 11 test

## F4 — Controller + DTO + OpenAPI

- [x] `POST /fulfilment/requests` + `POST .../:id/line-items` + `PATCH .../:id/line-items/:lineItemId/stage` + `GET /fulfilment/requests` + `GET .../:id`
- [x] request-body DTO（class-validator）+ `@ApiTags('fulfilment')` + response DTO;`// TODO(auth): @Roles`
- [x] verify:boot → 5 route 現 `/docs/api-json`;GET 200 + **真實 intake smoke（POST → status OPEN → GET detail → cleanup）**

## F5 — Test 收尾 + lint

- [x] `npm run test` 全綠（4 suites / 25 test;含 W02 8 + W03 17;SN/Prisma mock,唔打真 SN）✓
- [x] `npm run lint` clean（`--fix` 後 exit 0）✓

---

## Cross-Cutting

- [x] All deliverables committed to git（closeout commit — R2）
- [x] OD1–OD5 resolved → 決策同步 plan §3 + progress（R4）
- [x] Architectural-adjacent decision → ADR（R5;**無** — D-1 屬既定 spec 執行:stage 掛 line item / 兩路徑 / RequestEvent;OD 屬 spec 內實作選擇,非架構改動）
- [x] Pending / next-candidate synced to `BACKLOG.md`（R7;W03 → 完成、W04 = D-2 候選）
- [x] `progress.md` retro section written
- [x] `progress.md` frontmatter status flipped to `closed`
- [x] Phase W04（Module D-2）kickoff trigger noted in retro

---

**Lifecycle reminder**:呢份 checklist 隨 plan deliverables 衍生。新加 deliverable 必須先入 plan + changelog,然後再加 checklist item。
