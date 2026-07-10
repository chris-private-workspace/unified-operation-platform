---
phase: W09-auth-backend-guards
---

# W09（AUTH-1）— Progress（daily + retro）

## Day 0 — 2026-07-10（kickoff / plan approved）

**做咗**:
- 承接 W08 closeout 後嘅路線討論:揭 **FE-Assets 被 allocation-import（deferred Excel data 決定）卡死**（seed 唔播 ledger、`allocatedQuantity`=0 → owned/utilization/headroom 無真數,重蹈 FE-1 覆轍）→ Chris 拍板轉 **AUTH**（everything downstream 需、無 data 依賴、controllers 現全 unguarded 真 gap）。
- Discovery:`AppUser`（entraOid/role/opcoScopeId）+ `Role`（ADMIN/REGIONAL/OPCO_IT）model 已備;guard 層零（grep 無 `@UseGuards`/`@Roles`）;`license`（4）+ `fulfilment/requests`（7）全 unguarded;`main.ts` 得 global ValidationPipe;architecture.md §9 只高階（無 token 策略 → 屬架構級,要 ADR）。
- Kickoff OD 敲定:**OD1 = A backend-first AUTH-1**、**OD2 = approve JWT dep（jwks-rsa+jsonwebtoken）+ 寫 ADR-0002**、**OD3 = dev-mode bypass + 真 prod 驗證**。
- 寫 W09 三件套 draft（plan / checklist / progress）→ Chris **approve → active**。

**誠實限制（plan R-A,已同 Chris 講明並接受）**:真 SPA app reg 未有 → **真 token 端到端本 phase 驗唔到**,只到 backend + dev-bypass + mock token unit test;真 token 驗證劃去 AUTH-2（等 IT app reg）。

**下一步**:D0 ADR-0002 → D5 dep 安裝 → D1 auth module（JWT guard + dev-bypass + AppUser resolve）。

**紀律**:H2 dep 已 approve → ADR-0002 必寫;H4 token/secret/entraOid 唔 log、config `getOrThrow`;H5 guard critical-path 必配 test + fails-before;dev-bypass 只 local、預設 false（R-C 誤帶落 prod 風險）。

## Day 1 — 2026-07-10（D0–D5 全做 + gate 全綠）

**做咗（D0–D5）**:
- **D0 ADR-0002**:token 驗證策略（`jwks-rsa`+`jsonwebtoken` · JWKS/aud/iss/exp/RS256 · 全域 guard · dev-bypass）→ `docs/adr/0002-*.md` Accepted + README index。**microsoft-docs 核實** Entra v2.0 access token 驗證規格（aud=API client-id/App ID URI · iss=`.../v2.0` · JWKS `.../discovery/v2.0/keys` · RS256）先落筆（避 R-D）。
- **D5 dep**:`jwks-rsa ^4.1.0` + `jsonwebtoken ^9.0.3` + `@types/jsonwebtoken`（標準 npm registry,無撞 proxy）。
- **D1 auth module**:`src/auth/` —— `JwtAuthGuard`（Bearer→JWKS 驗簽+aud/iss/exp→upsert AppUser by oid+lastLoginAt→request.user;缺/壞→401;dev-bypass 注入 findFirst ADMIN + cache + 啟動 warning）+ `@CurrentUser` decorator。config:`AUTH_DEV_BYPASS` optional `get`,`ENTRA_TENANT_ID`/`ENTRA_API_AUDIENCE` `getOrThrow`（prod fail-fast）。H4:只 log flag + 失敗 reason,唔 log token/entraOid。
- **D2 guards+wire**:`@Roles`/`@Public` decorator + `RolesGuard`（metadata→role,唔夠 403）;`AuthModule` 掛 2 個 `APP_GUARD`（JwtAuthGuard→RolesGuard 次序）;`app.module` import。
- **D3 controller**:`license` + `fulfilment` 加 `@Roles(ADMIN,REGIONAL)` + `@ApiBearerAuth`（移除 `TODO(auth)`）;`main.ts` `.addBearerAuth()`。

**Gate 全綠（真跑真 trace）**:
- **G1** nest build 0 error。**G5** api **56 test**（42 舊 + jwt-auth 7 + roles 5 + controllers-guarded 2）全綠;**fails-before 實證**（暫神經 missing-token throw → 「401 missing」red[resolved true instead of rejected] → 還原）。**G8** eslint clean（`--fix` 修 5 prettier）。
- **G2/G3/G4 live 整合驗**（unit 唔覆蓋「全域 guard 真掛到 route」）:
  - bypass OFF（inline env,佔位 ENTRA）→ `/license/drift`·`/fulfilment/requests`·`/license/reconcile` 無 token = **401**;`/docs/api` = **200**（swagger 天然唔經 guard chain)。
  - bypass ON → 同上 guarded endpoint = **200**（ADMIN 注入;drift len1014 = 3 rows 同 W08 一致 → 現有流程不破);啟動 log 有 `AUTH_DEV_BYPASS is ON` warning。
- **G6** ADR-0002 Accepted + index。**G7 H4**:log 只 flag/reason,config getOrThrow。

**誠實限制（plan R-A,已接受)**:**真 SPA app reg 未有 → 真 token 端到端驗唔到**;本 phase 到 backend + dev-bypass + mock unit test + 401/200 wiring live 驗。真 token 驗證留 AUTH-2（等 IT app reg）。**wrong-role→403** 只 unit test（dev-bypass 係 ADMIN,無真 non-admin token 本地）。

**本地驗證用 inline env（`$env:AUTH_DEV_BYPASS`/`ENTRA_*`）—— 冇郁 `.env`（§4.4）**。ConfigModule dotenv 唔 override 既有 process.env,inline 值生效。

**下一步**:closeout —— BACKLOG 同步（AUTH-1 完成 + AUTH-2/3 carry）· plan closed · SESSION_SUMMARY/memory · commit。**AUTH-2 前要 IT 開 SPA app reg**（redirect + exposed API scope + audience）+ 本地 `.env` 補 `AUTH_DEV_BYPASS=true`(dev)/真 `ENTRA_TENANT_ID`+`ENTRA_API_AUDIENCE`(接真 token 時)。
