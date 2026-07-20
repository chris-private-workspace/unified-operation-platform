---
phase: W11-auth-opco-scope
name: "AUTH-3a — OPCO_IT per-OpCo scope 後端強制 + /me"
sprint_week: W11
backlog_id: AUTH（sub-phase AUTH-3a）
start_date: 2026-07-10
end_date: TBD
status: closed           # draft | active | closed — AUTH-3a done（8 deliverable + G1-G8 過,live 對照驗）。2026-07-20 回填：原「仍 active 因 3b」之阻塞已解 —— **AUTH-3b 已於 W22 完成**；殘留「真 SSO e2e」屬 AUTH-2b，由 W10（blocked-on-it-app-reg）追蹤，不再掛 W11。
spec_refs:
  - docs/architecture.md §9（Auth / Security — SSO + 3 role）
  - docs/02-architecture/licenseops/DESIGN.md §10（OpCo self-service 開放時機 — model 就緒,開放時機 open）
  - prisma/schema.prisma（Role.OPCO_IT · AppUser.opcoScopeId · Request.opcoId — 已就緒,H1 不觸發）
  - docs/adr/0002-entra-jwt-validation.md（AUTH-1 guard + dev-bypass — 本 phase dev run-as 係其延伸）
  - CLAUDE.md §5 H4（dev knob 只 dev,prod fail-closed;唔 log PII）· H5（assign/stage scope guard = critical path 要 test）
prior_phase: W10-auth-fe-sso
---

# Phase W11（AUTH-3a）— OPCO_IT per-OpCo scope 後端強制

> **Plan version**:1.0（draft）
> **Owner**:Chris Lai
> **Approved by**:Chris Lai（2026-07-10 — OD1-3 敲定 §6;OD-A = 無 ADR）
> **本 phase = 純後端 scope 強制機制 + `/me`,今日 100% 驗得到（unit + dev run-as live）。前端真 role + 真 SSO e2e = AUTH-3b,卡 IT app reg（同 AUTH-2b),defer。**

> **H1 提醒（已查證 = 不觸發)**:`Role.OPCO_IT` + `AppUser.opcoScopeId`（null=全部 / 設值=該 OpCo）+ `Request.opcoId` + `@@index([opcoId,status])` **schema 已就緒**（schema line 28/37/167,設計時已預留)。本 phase 純 query-layer filter + service write-guard,**無 schema / module 邊界 / locked-decision 改動** → 唔使 ADR（沿用既有 model + ADR-0002 auth;見 §6 OD-A)。
> **H4 提醒**:dev run-as（`AUTH_DEV_USER_EMAIL`）**只喺 `AUTH_DEV_BYPASS=true` 生效**,prod（真 token 路徑）完全不受影響;log 只寫「run-as 邊個 email / role」唔 log token/PII。
> **H5 提醒**:scope write-guard 掂到 **assign / stage 推進**（critical path）→ 必須同步 test（out-of-scope → 403 fail-closed + REGIONAL/ADMIN 不變 regression)。
> **H3 提醒**:本 phase **只建強制機制**,唔對外開放 OpCo self-service（DESIGN §10 open,開放時機仍 Chris 話事）。REGIONAL/ADMIN 行為**零改變**（opcoScopeId=null → filter=全部)。

## 1. Scope

### In（AUTH-3a — 今日做,驗得到）
- **`/me` endpoint**:回當前登入者 `{ id, email, displayName, role, opcoScopeId, opcoScope:{code,displayName}|null }`（前端 3b + "My queue" 解封所需)。
- **Fulfilment read scope**:`listRequests` / `getRequestDetail` 按 `@CurrentUser().opcoScopeId` 過濾（null → 全部;設值 → 只該 OpCo;越界 detail → 403)。
- **Fulfilment write guard**:`advanceStage` / `assign` / `markSynced` / `addLineItem` 先解析 request.opcoId,OPCO_IT 越界 → **403 fail-closed**。
- **Role guard 放行**:fulfilment controller `@Roles` 加 `OPCO_IT`;license **GET catalog + GET drift** method-level 加 `OPCO_IT`（OD2);**POST sync/reconcile 維持 ADMIN/REGIONAL**（action,非 view)。
- **Dev run-as**:`AUTH_DEV_USER_EMAIL`（dev-bypass 時可扮 seeded user）+ seed 一個 OPCO_IT user（scope=RHK)供 live 手驗。
- **Tests（H5）**:scope filter / write-guard 403 / REGIONAL·ADMIN regression / /me shape / dev run-as 解析。

### Out（AUTH-3b — 卡 IT app reg,defer)
- 前端真 role 顯示（consume /me)、移除/改寫假 `role` toggle（`store/ui.ts` mockup `Regional/RHK IT`)、"My queue" 前端 filter 落地、Overview/Requests 前端隨 role scope。
- 真 OPCO_IT 用戶 SSO 登入 → 只見自己 OpCo 嘅**真 e2e**（需真帳戶 + Entra app-role→claim mapping)。

### Out（scope boundary,H3)
- Entra app-role → claim → 自動 role/opcoScope 對映（role elevation 仍手動,見 jwt-auth.guard §resolveUser comment)。
- OpCo self-service 對外開放（DESIGN §10 open,timing 未定)。
- BE-ledger-read per-OpCo ledger endpoint（未建;建時亦需套同一 scope helper — 記低)。

## 2. 現狀觸點（research 2026-07-10）

- `jwt-auth.guard.ts` L57-85:`req.user`=AppUser（真 token 或 dev-bypass seed ADMIN);`resolveDevUser` L147 findFirst role=ADMIN。→ **dev run-as 落點**。
- `current-user.decorator.ts`:`@CurrentUser()` 已可注入 AppUser。
- `fulfilment.controller.ts` L21 `@Roles(ADMIN,REGIONAL)`（OPCO_IT 全擋);service call 未傳 user。
- `request.service.ts` L102 `listRequests()` / L112 `getRequestDetail(id)` **無 opco filter**。
- `assign.service.ts` / `stage.service.ts`:write by lineItemId/requestId,**無 opco 擁有權檢查**。
- `license.controller.ts` L17 `@Roles(ADMIN,REGIONAL)` controller-level → OD2 要 **method-level override**（GET 放 OPCO_IT / POST 唔放)。
- `seed.ts`:23 OpCo + 1 ADMIN(Chris);**無 OPCO_IT user** → D6 補。
- 前端 `store/ui.ts` L4 `role:'Regional'|'RHK IT'` = 假 mockup（同後端 enum 對唔上)→ 3b 處理。

## 3. Deliverables（D0-D8）

- **D0** — plan-first（本 doc + checklist + progress);status→active（approve 後)。無 ADR（§6 OD-A)。
- **D1** — `/me`:`auth/me.controller.ts`（`@Get('me')` + `@CurrentUser()` → DTO)+ `MeDto`。掛 AuthModule。任何 authenticated role 可 call。
- **D2** — scope helper:`auth/opco-scope.ts` `assertOpcoScope(user, opcoId)`（null → allow;mismatch → `ForbiddenException`)+ `scopeWhere(user)`（Prisma where 片段:null → {} / 設值 → {opcoId})。unit。
- **D3** — fulfilment read scope:controller 傳 `@CurrentUser()` 入 `listRequests(user)` / `getRequestDetail(id, user)`;list 用 `scopeWhere`,detail 用 `assertOpcoScope`（先讀 request.opcoId)。
- **D4** — fulfilment write guard:`advanceStage` / `assignLineItem` / `markSynced` / `addLineItem` 接 `user`,解析 request.opcoId → `assertOpcoScope`。assign（critical path)保持既有 5 gate + 新增 scope gate 喺最前（fail-closed)。
- **D5** — role guards:fulfilment `@Roles` 加 `OPCO_IT`;license GET catalog / GET drift method-level `@Roles(ADMIN,REGIONAL,OPCO_IT)`,POST sync/reconcile 保持 controller default（先驗 `RolesGuard` getAllAndOverride method>class 語意)。
- **D6** — dev run-as:`jwt-auth.guard` `resolveDevUser` 讀 `AUTH_DEV_USER_EMAIL`（設 → findFirst by email+active;缺/搵唔到 → fallback seed ADMIN + warn);seed 加 `opco.it@rhk...` OPCO_IT user(opcoScopeId=RHK)。
- **D7** — tests（H5):① scope filter（OPCO_IT 只見自己 OpCo request;REGIONAL 見全部)② write-guard（out-of-scope assign/advance/sync/addLineItem → 403;in-scope → 通)③ regression（既有 56 test 綠,ADMIN dev-bypass 路徑不變)④ /me shape ⑤ dev run-as 解析（email set→該 user / unset→ADMIN)。live 驗:run-as OPCO_IT → GET requests 只返 RHK。
- **D8** — closeout:gate + progress retro + BACKLOG（AUTH-3a done / AUTH-3b blocked)+ memory + commit(+push 待指示)。

## 4. 強制機制設計（enforcement approach）

```
REGIONAL / ADMIN : opcoScopeId = null  → scopeWhere = {}            (見全部,今日行為不變)
OPCO_IT          : opcoScopeId = <id>  → scopeWhere = { opcoId }    (只見自己)
```
- **Read**:list 加 `where: scopeWhere(user)`;detail 讀出後 `assertOpcoScope(user, req.opcoId)`（避免「憑 id 撞」洩漏)。
- **Write**:每個寫入前解析 target request 的 opcoId → `assertOpcoScope`。**default deny**:opcoScopeId 設咗但 request.opcoId 對唔上 = 403,唔 silently 當通。
- **為何 service 層而唔係純 guard**:scope 綁 data（request.opcoId),要 DB 讀先知 → 放 service（guard 只做 role gate)。controller 經 `@CurrentUser()` 把 user 傳落 service(signature +1 param)。

## 5. Phase Gates（closeout 前逐項驗）
- **G1** build / tsc 0 error（api)
- **G2** scope filter 正確:OPCO_IT 只見自己 OpCo requests（unit)
- **G3** write-guard fail-closed:out-of-scope assign/advance/sync/addLineItem → 403（unit,**H5 critical path**)
- **G4** REGIONAL/ADMIN 行為不變:既有 56 test 綠 + regression（dev-bypass ADMIN 見全部)
- **G5** `/me` 回正確 shape（role + opcoScope)
- **G6** dev run-as:`AUTH_DEV_USER_EMAIL` 解析對 + **live 驗**（bypass on run-as OPCO_IT → GET requests 只 RHK)
- **G7** H4:dev knob 只 dev-bypass 生效、prod 真 token 路徑不受影響、唔 log token/PII
- **G8** lint clean（api)
- 🔴 **（無 real-SSO e2e gate — 屬 AUTH-3b,卡 IT app reg,標未驗)**

## 6. Decisions

- **OD1 = 3a 後端 only**（AskUserQuestion 2026-07-10):做後端 scope 強制 + /me + tests,前端 + 真 e2e 拆 3b（卡 IT app reg)。
- **OD2 = OPCO_IT 亦見 tenant drift**:OPCO_IT 可 read GET catalog + GET drift（全租戶總量,非 per-OpCo);**POST sync/reconcile（action)維持 ADMIN/REGIONAL**（view vs action 分界;approval 時可改)。
- **OD3 = 加 dev run-as env**（`AUTH_DEV_USER_EMAIL`)+ seed OPCO_IT user,令本地可扮 OPCO_IT live check;tests 仍為主 verify。
- **OD-A = 無 ADR**（Chris approve 2026-07-10):scope 強制 = 套用既有 model（schema 設計本意)+ ADR-0002 auth 延伸,非架構級 → 唔另寫 ADR。

## 7. Day-by-Day（rough,1-2 日）
- **Day 1**:D1 /me · D2 scope helper（+unit)· D3 read scope · D5 role guards（驗 RolesGuard method-override)。
- **Day 2**:D4 write guard（assign/stage/sync/addLineItem)· D6 dev run-as + seed OPCO_IT · D7 tests + live 驗 · D8 closeout。

## 8. Risks / honest gaps
- **R（真 e2e 無 app reg)**:真 OPCO_IT SSO 只 unit + dev run-as 驗,真帳戶端到端留 3b（同 AUTH-2b 卡 IT)。誠實標未驗,唔當 done。
- **role elevation 仍手動**:Entra app-role→claim mapping 未做（jwt-auth.guard resolveUser 首見=REGIONAL)→ 真 OPCO_IT 用戶要人手 set role+opcoScopeId,屬 3b/IT 對接。
- **BE-ledger-read 未建**:將來 per-OpCo ledger endpoint 亦需套 scope helper（本 phase 記低,唔做)。
- **RolesGuard method>class override 未證**:D5 先寫細 test 確認 method-level `@Roles` 蓋過 controller-level,否則改用其他放行法。

## 9. Changelog
- 1.0（2026-07-10)— draft;OD1-3 敲定（AskUserQuestion);待 approve。
