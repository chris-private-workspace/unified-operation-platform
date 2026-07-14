---
phase: W23-assets-manual-ledger
status: closed
---

# W23-A — OpCo ledger 手動管理(backend + audit) — Checklist

> ADR-0007 Accepted。拆 A(backend)/ B(frontend)。決策:assigned set 絕對值並存 assign +1 · over-alloc flag 不 block · LedgerAdjustment 只記逐格人手 · Platform 措辭修正。
> scope 規則:ADMIN/REGIONAL 全部 · OPCO_IT assertOpcoScope 只改自己(403 改別人)。

## D1 — schema + migration ✅
- [x] `schema.prisma` 加 `LedgerAdjustment` model(ledgerId/field/beforeValue/afterValue/reason?/actorId?/createdAt)
- [x] relation:`OpcoSkuLedger.adjustments` + `AppUser.ledgerAdjustments`
- [x] `prisma migrate`(`20260714104258_add_ledger_adjustment`)+ generate;additive 現有數據不動
- [x] `GET /license/ledger` row 已有 `id`(W14 已加,唔使改)

## D2 — write endpoint ✅
- [x] `license/dto/ledger-write.dto.ts`(allocatedQuantity? / assignedQuantity? @IsInt @Min(0) / reason? @MaxLength(500))
- [x] `license/ledger-write.service.ts` `updateLedgerRow`(load→assertOpcoScope→逐欄 diff→$transaction[update + LedgerAdjustment×N];no-op skip;404/400)
- [x] `license.controller.ts` `@Patch('ledger/:id')` `@Roles(ADMIN,REGIONAL,OPCO_IT)`
- [x] `license.module.ts` 註冊 + export LedgerWriteService

## D3 — tests(H5)✅
- [x] scope:OPCO_IT 改自己 200 / 改別人 403(fail-closed,無寫);ADMIN 全部
- [x] adjustment:每變動欄一筆 before→after + actorId(+reason);兩欄→2 筆;無變動不寫
- [x] 各欄獨立:只改 allocated 唔碰 assigned(反之);對回(assigned set)語意
- [x] 邊界:至少一欄(空 dto 400,無 DB access);404 row 唔存在;no-op return current
- [x] 負數 invariant:DTO @Min(0)(live curl 400 驗;service 層唔重複)

## D4 — DESIGN.md 更新 ✅
- [x] §5(assigned 語意擴展 + 對回 + 分層真相)· §6(LedgerAdjustment 落地)· §10(對回機制 activated)

## D5 — verify + closeout ✅
- [x] build 0 + lint 0(--fix)+ test green(api 157→**165**)
- [x] live curl:ADMIN set assigned=5→200 headroom 656 · 負數 400 · 空 body 400 · LedgerAdjustment DB 記錄(field/before→after/actor)· seed 復原
- [x] BACKLOG + memory 同步;progress retro;plan closed;**W23-B kickoff carry**;commit(待指示)

## Phase Gate(plan §4)
- [x] G1 schema migrate + row id(已有)
- [x] G2 write live(絕對值 · 各欄獨立)
- [x] G3 scope 403 fail-closed(test)
- [x] G4 audit LedgerAdjustment(live DB + test)
- [x] G5 H5 test green(165)
- [~] G6 對帳不破:reconcile 邏輯**不變**(Σ assigned vs consumed);手動改 assigned 令 Σ 隨之,drift 自然反映;既有 reconcile spec 覆蓋(未 live 跑 reconcile —— Graph 未配,503)
- [x] G7 over-alloc flag 不 block · 負數擋(400)
- [x] G8 regression(import/assign/opco-scope spec 全 PASS;ledger-read 加 id 不破)

## Cross-Cutting
- [x] BACKLOG 同步(R7)
- [x] ADR-0007 Accepted(H1 已解鎖)
- [ ] 每 commit reference progress Day-N(R2)— commit 待指示
