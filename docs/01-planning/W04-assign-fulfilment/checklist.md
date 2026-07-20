---
phase: W04-assign-fulfilment
plan_ref: ./plan.md
status: complete    # draft | in-progress | complete
last_updated: 2026-07-09
---

# Phase W04 — Checklist

> Atomic checkbox（每 item ≤ 1–2 hour effort）。
> ✅ plan approved（status active,2026-07-09）;OD1–OD6 全照 default。
> AI tick 完成嘅 item;唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。

## F1 — Sync 標記（模擬 Phase 1 回寫）

- [x] `markSynced(requestId)`:set `azureSyncedAt` + `accountCreatedAt`（若空）+ `RequestEvent(SYNC)`
- [x] verify（H5）:set 時間戳 + event;request 不存在 → NotFound（+ G3 真實 smoke:intake → PATCH sync → azureSyncedAt set → SYNC event）

## F2 — AssignService.assignLineItem ⭐⭐ critical path

- [x] 前置 gate 鏈:① stage `READY` ② `azureSyncedAt` 有值 ③ `findUser` 唔 null ④ seat 可用（OD3）⑤ `usageLocation` resolve（OD5）—— 任一 fail 明確拒且唔改 state
- [x] Graph `assignLicense(targetUpn, skuId, { usageLocation })`
- [x] `$transaction`（OD2）:line item `→ASSIGNED`+`assignedAt` / `OpcoSkuLedger` upsert `assignedQuantity` +1（compound key `opcoId_skuCatalogId`）/ `RequestEvent(ASSIGN)` / recompute status
- [x] `addWorkNote` 回寫（OD4,non-fatal;fail → log warning 唔 rollback）
- [x] **H4**:AssignService 唔 log target UPN（只 log sku + ids）
- [x] verify（H5,critical path）:happy path（ledger+1 / ASSIGNED / event / status→COMPLETED / 回寫）+ 每 gate 失敗（非 READY / 未 sync / user null / 無 usageLocation / 無 seat / NotFound）+ assign throw 唔開 tx + SN throw assign 仍成功 + usageLocation override（全 mock）✓ 12 test

## F3 — Controller + DTO + OpenAPI

- [x] `PATCH /fulfilment/requests/:id/sync` + `PATCH .../:id/line-items/:lineItemId/assign`（body 可選 `usageLocation`）
- [x] `@ApiTags('fulfilment')` + response DTO;`// TODO(auth): @Roles`
- [x] verify:boot → 7 fulfilment route 現 `/docs/api-json`（D-1 五 + D-2 二）

## F4 — Test 收尾 + lint

- [x] `npm run test` 全綠（5 suites / 37 test;Graph/SN/Prisma mock,唔打真 tenant）✓
- [x] `npm run lint` clean（`--fix` 後 exit 0）✓

---

## Cross-Cutting

- [x] All deliverables committed to git（closeout commit — R2）
- [x] OD1–OD6 resolved → 決策同步 plan §3 + progress（R4）
- [x] Architectural-adjacent decision → ADR（R5;**無** — D-2 屬既定 spec 執行:sync gate / assignedQuantity +1 / SN mirror;OD 屬 spec 內實作選擇）
- [x] Pending / next-candidate synced to `BACKLOG.md`（R7;W04 → 完成、Module D 全完;下一個 = FE-scaffold）
- [x] `progress.md` retro section written
- [x] `progress.md` frontmatter status flipped to `closed`
- [x] 下一個 phase（FE-scaffold）kickoff trigger noted in retro
- [x] **發現（非本 phase 修）**:`GraphService.assignLicense` log 咗 UPN（PII）—— pre-existing W01 integration code,H4 concern,已 flag 俾 Chris（BUG 候選,見 retro）→ **已由 BUG-001 修復 ✅**（fix + regression test,2026-07-09）;2026-07-20 補勾

---

**Lifecycle reminder**:呢份 checklist 隨 plan deliverables 衍生。新加 deliverable 必須先入 plan + changelog,然後再加 checklist item。
