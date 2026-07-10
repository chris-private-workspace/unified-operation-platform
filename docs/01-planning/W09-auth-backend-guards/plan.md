---
phase: W09-auth-backend-guards
name: "AUTH-1 — 後端 Entra JWT 驗證 + role guard（關 unguarded controllers security gap）"
sprint_week: W09
backlog_id: AUTH（sub-phase AUTH-1）
start_date: 2026-07-10
end_date: 2026-07-14          # planned, may slip with changelog log
status: closed               # draft | active | closed
spec_refs:
  - docs/architecture.md §9（Auth / Security — SSO + 3 role,guard 層未建）
  - CLAUDE.md §5 H2（vendor/dep lock — 新 dep 要 approval + ADR）· H4（security/PII）· H5（critical-path test）
  - prisma/schema.prisma（`AppUser` entraOid/role/opcoScopeId · `Role` enum ADMIN/REGIONAL/OPCO_IT）
  - apps/api OpenAPI（/license/* · /fulfilment/requests* — 現全 unguarded,找 `TODO(auth)`）
  - docs/adr/（本 phase 產出 ADR-0002 token 驗證策略）
prior_phase: W08-fe-drift-harden
---

# Phase W09（AUTH-1）— 後端 Entra JWT 驗證 + role guard

> **Plan version**:1.0（draft）
> **Owner**:Chris Lai
> **Approved by**:Chris Lai（2026-07-10）
> **Kickoff OD（2026-07-10 已敲）**:AUTH scope = **A backend-first AUTH-1**;JWT dep = **approve + 寫 ADR**;local dev = **dev-mode bypass + 真 prod 驗證**。
> **H2 提醒**:新 runtime dep（JWT 驗證）→ 已 approve,**必配 ADR-0002**。
> **H4 提醒**:token / secret / entraOid **絕不 log plaintext**;audience/issuer/tenant 一律經 `ConfigService.getOrThrow`,唔 hardcode。
> **H5 提醒**:guard 掂 critical-path endpoint（assign / ledger 更新 / reconcile）→ guard 行為必配 test（valid/missing/invalid/wrong-role/dev-bypass）。

## 1. Scope（AUTH-1 = 後端 only）

現狀:`AppUser`（entraOid ← SSO token）+ `Role` model 已備,但 **guard 層零**（grep 無 `@UseGuards`/`@Roles`）,`license`（4 endpoint）+ `fulfilment/requests`（7 endpoint）**全 unguarded**。真實曝露前必修（architecture.md §9）。

本 phase = **後端關 security gap**,唔掂前端:

1. **Entra JWT 驗證**:incoming `Authorization: Bearer <token>` → 驗簽（tenant JWKS）+ iss/aud/exp → 由 claim（oid/email/name）**resolve/upsert `AppUser`**（by `entraOid`）→ attach 落 request（`@CurrentUser`）。
2. **Dev-mode bypass**（OD3）:env flag `AUTH_DEV_BYPASS=true`（local only）→ 跳過 token 驗證,注入一個固定 **ADMIN** `AppUser`（seed admin）。令本地 dev + 現有手測 + FE（AUTH-2 前）**不受影響**;prod flag 一律 false → 走真 JWT。
3. **Role guard**:`@Roles(ADMIN, REGIONAL)` decorator + `RolesGuard`（讀 metadata 對 `request.user.role`）;`@Public()` decorator 豁免（`/docs/api` swagger）。全域 `APP_GUARD` 掛 JWT guard + role guard。
4. **落 2 controller**:`license` + `fulfilment/requests` 加 `@Roles(ADMIN, REGIONAL)`;swagger docs `@Public`。
5. **ADR-0002**:記 token 驗證策略（dep 選型 · JWKS/iss/aud 驗證 · dev-bypass · 全域 guard）。

**誠實原則**:dev-bypass 只 local；prod 走真驗證。**唔造假 prod 安全感**。

### 1.1 Guard 覆蓋清單（11 endpoint 全上 ADMIN/REGIONAL）
| Controller | Endpoints | Guard |
|---|---|---|
| `license` | catalog/sync · catalog · reconcile · drift（4） | `@Roles(ADMIN, REGIONAL)` |
| `fulfilment/requests` | intake · list · detail · line-items · stage · sync · assign（7） | `@Roles(ADMIN, REGIONAL)` |
| swagger `/docs/api` | — | `@Public()`（免驗） |

> **OPCO_IT scope 過濾**（per-OpCo 只睇自己）= **本 phase out**（spec 講 future self-service;需 query 層改 + FE role 切換）→ AUTH-3。本 phase 三個 role 都當「睇全部」,只驗**身份 + ADMIN/REGIONAL 准入**。

## 2. 明確 out-of-scope（H3）
| 排除項 | 去向 |
|---|---|
| **前端真 SSO（MSAL）** | AUTH-2 —— `@azure/msal-browser/react` 取 token + attach Bearer,取代 placeholder Login（需真 SPA app reg,見 R-A） |
| **OPCO_IT per-OpCo scope 過濾** | AUTH-3（隨 OpCo self-service;query 層 + FE role） |
| **真 Azure SPA app registration / 真 token 端到端** | 需 IT 開 app reg（redirect + exposed API scope + audience）;本 phase 用 dev-bypass + mock token unit test,真 token 驗證留 AUTH-2 有 app reg 時 |
| **user 管理畫面（Users & roles）** | 隨 AUTH-2/Settings;需 AppUser CRUD endpoint |
| **refresh token / session / logout 流程** | 前端關注（AUTH-2） |

## 3. Open Decisions（✅ 2026-07-10 kickoff 敲定）
| # | 決策 | 決定 |
|---|---|---|
| OD1 | AUTH scope | **A — backend-first AUTH-1**（token 驗證 + ADMIN/REGIONAL guard;FE SSO / OPCO_IT scope 留 AUTH-2/3） |
| OD2 | JWT 驗證 dep（H2） | **Approve + 寫 ADR-0002**。選型 proposal:`jwks-rsa` + `jsonwebtoken`（manual JWKS + verify iss/aud/exp;無 passport 框架開銷;jose 作 ADR 替代方案記錄） |
| OD3 | local dev auth | **dev-mode bypass**（`AUTH_DEV_BYPASS` local → 注入 ADMIN AppUser）+ 真 prod JWT 驗證 |

## 4. Deliverables

### D0 — ADR-0002 token 驗證策略 ⭐（H2）
- **Acceptance**:`docs/adr/0002-entra-jwt-validation.md`（Context → Decision → Alternatives[passport-azure-ad / jose / manual] → Consequences → References）;`docs/adr/README.md` index 加行。記:dep 選型、JWKS/iss/aud/exp 驗證、dev-bypass、全域 guard。Status: Accepted。
- **Effort**:1h

### D1 — Auth module:JWT guard + AppUser resolution ⭐ H5
- **Spec ref**:architecture.md §9;`AppUser` model
- **Acceptance**:
  - 新 `apps/api/src/auth/` module。`JwtAuthGuard`（`CanActivate`）:讀 Bearer → 驗簽（tenant JWKS via config）+ iss/aud/exp → claim resolve/upsert `AppUser`（by `entraOid`;更新 `lastLoginAt`）→ `request.user`。缺/壞 token → `UnauthorizedException`（401）。
  - **Dev-bypass**:`AUTH_DEV_BYPASS==='true'` → 跳驗證,`request.user` = seed ADMIN（by env `AUTH_DEV_USER_EMAIL` 或第一個 ADMIN）。
  - `@CurrentUser()` param decorator 取 `request.user`。
  - **H4**:唔 log token/secret/entraOid plaintext;config 經 `getOrThrow`（`ENTRA_TENANT_ID` / `ENTRA_API_AUDIENCE` / `AUTH_DEV_BYPASS`）。
- **Effort**:3h

### D2 — RolesGuard + decorators + 全域 wire
- **Acceptance**:`@Roles(...Role[])` + `RolesGuard`（讀 reflector metadata,對 `request.user.role`;唔夠 → `ForbiddenException` 403）。`@Public()` skip JWT guard。`app.module` 掛 `APP_GUARD`（JwtAuthGuard 先 → RolesGuard 後）。
- **Effort**:2h

### D3 — 落 controller + swagger public
- **Acceptance**:`license` + `fulfilment` controller class 加 `@Roles(ADMIN, REGIONAL)`（移除 `TODO(auth)`）。swagger setup / health `@Public`。`main.ts` 加 `.addBearerAuth()`（OpenAPI 顯示鎖）。
- **Effort**:1h

### D4 — 測試（H5）⭐
- **Acceptance**:
  - `JwtAuthGuard` spec:valid token（mock JWKS/verify）→ pass + user attached;missing/malformed/expired/wrong-aud → 401;dev-bypass → ADMIN。
  - `RolesGuard` spec:role 匹配 → pass;OPCO_IT / 無 user → 403。
  - controller 層:一個 e2e-ish（`@nestjs/testing` + guard override）證 guarded endpoint 無 token → 401、有 ADMIN → pass。
  - **實證 fails-before**（暫拆 guard → 未授權 request 應被擋嘅 test red）。
  - api 全 suite 綠（現 42 → +N）;Graph/JWKS 一律 mock,唔打真 tenant/JWKS。
- **Effort**:3h

### D5 — 新 dep 安裝（H2,已 approve）
- **Acceptance**:`apps/api` 加 `jwks-rsa` + `jsonwebtoken`（+ `@types/jsonwebtoken` dev）。`package-lock` 更新。ADR-0002 記錄。
- **Effort**:0.5h

## 5. Success Criteria（Phase Gate）
| # | Criterion | Target | Measure | Block? |
|---|---|---|---|---|
| G1 | Build | 0 error | `npm run build -w @uop/api` | Yes |
| G2 | 未授權被擋 | guarded endpoint 無/壞 token（dev-bypass off）→ **401**;wrong-role → 403 | guard test + 本地 curl（bypass off） | Yes |
| G3 | 授權通過 | valid token（或 dev-bypass）→ endpoint 正常回 | guard test + 本地 curl（bypass on）| Yes |
| G4 | Dev 不破 | `AUTH_DEV_BYPASS=true` → 現有 FE + 手測 + 42 舊 test **照行**（ADMIN 注入） | 起 api + FE `/drift` 仍讀到數 | Yes |
| G5 | Test（H5） | JwtAuthGuard + RolesGuard + controller-guard regression 綠 + **fails-before 實證**;全 suite 綠 | `npm test -w @uop/api` | Yes（H5） |
| G6 | ADR | ADR-0002 Accepted + index | 檔存在 + README 行 | Yes（H2/R5） |
| G7 | H4 | 無 token/secret/entraOid plaintext log;config 全 `getOrThrow` | grep + review | Yes（H4） |
| G8 | Lint | 0 warning | `npm run lint -w @uop/api` | No |

## 6. Risks
| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R-A | 真 SPA app reg 未有 → 真 token 端到端驗唔到 | High | Med | 本 phase **只到 backend + dev-bypass + mock token unit test**;真 token 驗證明確劃去 AUTH-2（等 IT app reg）;plan 標清唔當已驗 |
| R-B | 全域 guard 令現有 FE/手測 突然 401 | Med | High | **dev-bypass 預設 local on**;G4 專驗現有流程不破;swagger `@Public` |
| R-C | dev-bypass 誤帶落 prod = 全開 | Low | High | flag 預設 **false**;prod env 明確唔設;guard 啟動 log「DEV BYPASS ON」warning（H4 唔 log 敏感）;ADR 記風險 |
| R-D | JWT 驗證選型/Entra v2 token 細節錯（aud/iss format） | Med | Med | 實作時查 **microsoft-docs**（Entra v2.0 access token 驗證:iss `https://login.microsoftonline.com/{tid}/v2.0`、aud = api client-id/App ID URI）;mock 對齊真 claim 結構 |
| R-E | guard 順序錯（role 先過 jwt）→ user undefined | Low | Med | APP_GUARD 次序:JwtAuthGuard → RolesGuard;test 覆蓋無-user→403/401 |

## 7. Day-by-Day（rough）
| Day | Focus | Deliverables |
|---|---|---|
| D1 | ADR + dep + auth module（JWT guard + dev-bypass + AppUser resolve + @CurrentUser） | D0, D5, D1 |
| D2 | RolesGuard + decorators + 全域 wire + 落 controller + swagger public | D2, D3 |
| D3 | 測試（guard specs + controller regression + fails-before）+ gates | D4 |

## 8. Dependencies on Prior Phase
`AppUser` / `Role` model（W01 seed 有 ADMIN admin）· `ConfigService` 慣例（`getOrThrow`）· global `ValidationPipe`（main.ts）· Jest mock 慣例（Graph/SN → 加 JWKS/verify mock）。**無** FE 依賴（AUTH-1 backend-only）。

## 9. Plan Changelog
| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-10 | Initial draft（AUTH-1 backend guards;OD1=A backend-first、OD2 approve JWT dep+ADR、OD3 dev-bypass） | FE-Assets 被 allocation-import 卡 → 轉 AUTH(everything downstream 需);kickoff OD 敲定 | Chris Lai（待 approve） |
| 2026-07-10 | Approved → active（scope + OD 無改動） | Chris approve 開工 | Chris Lai |
| 2026-07-10 | **Closed** — D0–D5 全做,G1–G8 全 pass（api 56 test + fails-before;401/200 wiring live 驗;ADR-0002 Accepted）。無 deviation。honest 限制 R-A（真 token e2e 留 AUTH-2,無 app reg）+ wrong-role→403 只 unit test，已入 progress | AUTH-1 gate 達成 | Chris Lai |

---

**Lifecycle reminder**:plan locked after status=active。deviation → §9 changelog + progress。approve 前唔 code（R1）。**H2**:dep 已 approve,ADR-0002 必寫。**H4**:token/secret 唔 log,config `getOrThrow`。**H5**:guard critical-path 必配 test + fails-before。**誠實**:dev-bypass 只 local,真 token 驗證劃去 AUTH-2,唔當已驗。
