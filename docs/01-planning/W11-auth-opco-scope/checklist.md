---
phase: W11-auth-opco-scope
status: closed        # AUTH-3b 已於 W22 完成，殘留真 SSO e2e 歸 W10/AUTH-2b（2026-07-20 回填）
---

# W11（AUTH-3a）— Checklist（daily tick）

> 對應 `plan.md` deliverables。**approve 前唔 tick（R1）**。🔴 = 屬 AUTH-3b,卡 IT app reg。

## D0 — plan-first
- [x] `plan.md` + `checklist.md` + `progress.md`（OD1-3 敲定;OD-A=無 ADR）
- [x] approve → status draft→active（無 ADR — 沿用既有 model + ADR-0002）

## D1 — /me endpoint
- [x] `auth/dto/me.dto.ts`（id/email/displayName/role/opcoScopeId/opcoScope{code,displayName}|null）
- [x] `auth/me.controller.ts`（`@Get('me')` + `@CurrentUser()`;無 @Roles = 任何 authenticated role）+ 掛 AuthModule controllers
- [x] Swagger `@ApiBearerAuth` + `@ApiOkResponse`;live 驗 `/me` 回真 identity + scope

## D2 — scope helper（+unit）
- [x] `auth/opco-scope.ts`:`assertOpcoScope(user, opcoId)`（null→allow / mismatch→ForbiddenException）+ `scopeWhere(user)`（null→{} / 設值→{opcoId}）
- [x] unit `opco-scope.spec.ts`:null scope 全通 / in-scope 通 / out-of-scope throw

## D3 — fulfilment read scope
- [x] controller 傳 `@CurrentUser()` 入 `listRequests(user)` / `getRequestDetail(id, user)`
- [x] list 用 `scopeWhere`;detail 讀後 `assertOpcoScope(user, req.opcoId)`（越界 403，唔靠 id 撞洩漏）

## D4 — fulfilment write guard（H5 critical path）
- [x] `advanceStage` / `assignLineItem` / `markSynced` / `addLineItem` **+ intake**（補完整化，R3）接 `actor` + 解析 request.opcoId → `assertOpcoScope`
- [x] assign scope gate 擺最前（既有 5 gate 之前，fail-closed）;`actor` 統一 param 順帶 activate 返 actorId 記錄（本 dormant，advance/assign 事件而家有真 actor）

## D5 — role guards 放行
- [x] fulfilment `@Roles` 加 `OPCO_IT`
- [x] license GET catalog / GET drift method-level `@Roles(ADMIN,REGIONAL,OPCO_IT)`；POST sync/reconcile 維持 controller default ADMIN/REGIONAL
- [x] **已驗** `RolesGuard` getAllAndOverride([handler,class]) method>class（`controllers-guarded.spec` 證 GET override / POST 無 override）

## D6 — dev run-as + seed OPCO_IT
- [x] `jwt-auth.guard` `resolveDevUser` 讀 `AUTH_DEV_USER_EMAIL`（設→findFirst by email+active / 缺/搵唔到→fallback ADMIN + warn）
- [x] `seed.ts` 加 OPCO_IT user `opco.it.rhk@rapo.com.hk`（opcoScopeId = RHK，lookup by code）
- [x] H4:log 只 `role=… id=…`，**唔 log email/token**（live log 實證）

## D7 — 測試（H5）
- [x] scope filter（OPCO_IT 只見自己 / REGIONAL 見全部）— request.service.spec
- [x] write-guard（out-of-scope assign/advance/sync/intake/addLineItem → 403；in-scope 通）— 3 fulfilment spec
- [x] regression（既有 test 全綠 + ADMIN dev-bypass 見全部不變）→ **56→81 test 綠**
- [x] /me shape（me.controller.spec）· dev run-as 解析（jwt-auth.guard.spec:email set→該 user / unset/miss→ADMIN）
- [x] **live 驗**（run-as OPCO_IT → requests count 1 只 RHK / RAPO/IT detail 403；ADMIN → count 7 全部 / 200）

## Phase Gate（plan §5）
- [x] G1 build/tsc 0 error（nest build clean）
- [x] G2 scope filter 正確（unit + live）
- [x] G3 write-guard fail-closed 403（H5，unit 5 write 面 + live 403）
- [x] G4 REGIONAL/ADMIN 不變（81 test 綠 + live ADMIN 見 7 全部）
- [x] G5 /me shape 正確（unit + live）
- [x] G6 dev run-as 解析 + **live 驗**（run-as OPCO_IT 對照 ADMIN，表見 progress）
- [x] G7 H4（dev-only、prod 真 token 路徑不受影響、log 只 role+id 唔 log PII）
- [x] G8 lint clean（exit 0）
- 🔴 （無 real-SSO e2e gate — AUTH-3b,卡 IT app reg，未驗當未 done）

## Closeout
- [x] progress retro · BACKLOG 同步（3a done / 3b blocked）· plan status
- [x] SESSION_SUMMARY + memory 更新
- [ ] commit · push（待用戶指示）
