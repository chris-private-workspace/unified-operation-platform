# ADR-0002: 後端 Entra ID JWT 驗證策略（AUTH-1）

**Date**: 2026-07-10
**Status**: Accepted
**Approver**: Chris Lai

## Context

平台 auth 已 lock 喺 stack（CLAUDE.md §5.2 H2:**Entra ID SSO + app roles**）,但 **guard 層一直未建** —— `license`（4 endpoint）+ `fulfilment/requests`（7 endpoint）controllers **全 unguarded**（`TODO(auth)`),`AppUser`（`entraOid`/`role`/`opcoScopeId`）+ `Role`（ADMIN/REGIONAL/OPCO_IT）model 早備但無人用。architecture.md §9 只高階講「SSO + 3 role」,**無指定 token 驗證策略**。

W09（AUTH-1,backend-first）要真正驗 incoming request 嘅 Entra access token 並上 role guard。呢個牽涉:
- **H2（vendor/dep lock）**:後端無現成 JWT 驗證能力,要**加新 runtime dependency** → 觸發 H2,Chris approve 後必寫本 ADR。
- **架構級決定**（R5）:token 驗證方式 = 安全地基,必記 ADR。

本地限制:**真 SPA app registration 未有**,本地攞唔到真 Entra token(似 Graph 情況),所以要一個 dev-mode 對策先令 AUTH-1 可本地行 + unit test。

## Decision

**1. Token 驗證（prod path）** —— 後端當 protected web API,驗 Entra **v2.0 access token**（`Authorization: Bearer <jwt>`),用 **`jwks-rsa` + `jsonwebtoken`**:
- **簽名**:RS256;signing key 由 tenant JWKS endpoint `https://login.microsoftonline.com/{tenantId}/discovery/v2.0/keys` 取(`jwks-rsa` 按 JWT header `kid` 選 key + cache + rate-limit + 24h rotation 自動處理)。
- **`aud`** = 本 API 嘅 App ID URI / client id（config `ENTRA_API_AUDIENCE`)。
- **`iss`** = `https://login.microsoftonline.com/{tenantId}/v2.0`（config `ENTRA_TENANT_ID`;single-tenant exact match）。
- **`exp`/`nbf`** 生命週期。algorithms 限 `['RS256']`（唔接受 `alg:none` / HS 對稱）。
- 驗證通過 → 由 claim（`oid`→entraOid、`email`/`preferred_username`、`name`）**resolve/upsert `AppUser`**（by `entraOid`,更新 `lastLoginAt`)→ `request.user`。缺/壞/過期 token → **401**。

**2. 授權** —— 全域 `APP_GUARD` 掛兩層(次序 **JwtAuthGuard → RolesGuard**):`@Roles(...Role[])` decorator + `RolesGuard`（reflector metadata 對 `request.user.role`;唔夠 → **403**）;`@Public()` 豁免（swagger `/docs/api`)。2 controller 上 `@Roles(ADMIN, REGIONAL)`。

**3. Dev-mode bypass（local only）** —— env flag **`AUTH_DEV_BYPASS`**(預設 `false`;prod 一律唔設):`==='true'` → **跳過 token 驗證**,`request.user` 注入 seed **ADMIN** `AppUser`。令本地 dev + 現有手測 + FE(AUTH-2 前)不受影響;啟動時 log 一句 `⚠️ AUTH_DEV_BYPASS ON` warning(H4:唔 log 敏感值)。

**4. H4** —— `ENTRA_TENANT_ID` / `ENTRA_API_AUDIENCE` / `AUTH_DEV_BYPASS` 一律 `ConfigService.getOrThrow`;**絕不 log** token / signature / `entraOid` plaintext。

## Alternatives Considered

- **`passport-azure-ad`（BearerStrategy）+ `@nestjs/passport`** — rejected:passport-azure-ad 已進入 maintenance mode(Microsoft 建議新專案用 MSAL 系);引入 passport 框架抽象對「淨係驗一隻 tenant 嘅 access token」偏重,mock 測試更繞。
- **`jose`（`createRemoteJWKSet` + `jwtVerify`）** — 好選擇(現代、maintained、內建 remote JWKS):作為**同級替代**記錄;rejected 只因 kickoff OD 已明確 approve `jwks-rsa`+`jsonwebtoken` 呢對(團隊熟、生態最廣),差異微。若日後要收窄依賴可轉 jose(無架構影響)。
- **`Microsoft.Identity.Web`** — N/A(.NET 專用,本後端係 NestJS)。
- **Chosen**:**`jwks-rsa` + `jsonwebtoken`** — Microsoft 文件明言要用「well-maintained and established standard token validation library」,呢對係 Node 生態最廣用、最成熟嘅組合;`jwks-rsa` 專責 JWKS 取 key + cache + kid 選 key,`jsonwebtoken.verify` 做 aud/iss/exp/簽名;無框架開銷,guard 邏輯 mock 直接(mock `getKey` + `verify`)。

## Consequences

- **Positive**:11 個 unguarded endpoint 一次上 role guard,關 security gap(架構紅線);dev-bypass 令本地/現有流程唔破 + unit test 全 mock(唔打真 tenant/JWKS);token 驗證用 microsoft-docs 核實嘅 v2.0 規格(aud/iss/JWKS/RS256/exp)。
- **Negative**:手寫驗證 code(vs 全託管框架)—— 緩解:`jwks-rsa`+`jsonwebtoken` 成熟、規格對齊 Microsoft 文件、guard 有 fails-before 實證測試;**真 token 端到端本 phase 驗唔到**(無 app reg)→ 明確劃去 AUTH-2,唔當已驗。
- **Neutral / 風險**:`AUTH_DEV_BYPASS` 誤帶落 prod = 全開(R-C)→ 預設 false、prod 明確唔設、啟動 warning、本 ADR 記風險;OPCO_IT per-OpCo scope 過濾 = AUTH-3(本 phase 三個 role 都當睇全部,只驗身份 + ADMIN/REGIONAL 准入)。

## References

- `docs/architecture.md §9`（Auth / Security)· CLAUDE.md §5.2 **H2**(dep lock,本 ADR 觸發)· §5.4 **H4**(secret/PII)· §5.5 **H5**(guard critical-path test)
- `docs/01-planning/W09-auth-backend-guards/plan.md`(觸發 phase;OD1/OD2/OD3)
- Microsoft Learn — Access tokens · validate tokens:<https://learn.microsoft.com/entra/identity-platform/access-tokens#validate-tokens>
- Microsoft Learn — Protected web API token validation:<https://learn.microsoft.com/entra/identity-platform/scenario-protected-web-api-app-configuration#token-validation>
- Microsoft Learn — API protection / enforce access:<https://learn.microsoft.com/security/zero-trust/develop/protect-api#enforce-access>
- `prisma/schema.prisma`(`AppUser` / `Role`)
