---
phase: W19-auth-user-admin
status: closed        # plan + checklist 已 closed（2026-07-20 status 回填）
---

# W19 — AUTH-4b — Progress

## Day 0 — 2026-07-13（kickoff）

**緣起**：AUTH-4a（W18）交付本地登入核心,但只認 seed 出嚟嘅本地 admin;冇 admin UI 建/管其他 user。本 phase = ADR-0005 §6 第二交付:admin 建/列/改/停用 user + role/opcoScope + Settings › Users & roles 真表。

**紀律判定**：唔觸 H1/H2 STOP —— `AppUser` schema 已有齊欄（`passwordHash`/`authProvider`/`role`/`opcoScopeId`/`active`），建/改 user = INSERT/UPDATE **無 migration**（AUTH-3a / W16 純 query-layer 先例）;argon2 W18 已加,**無新 dep**。ADR-0005 早解鎖 auth 架構。H4 小心 / H5 test / H6 前端 token-only。

**決策（AskUserQuestion 2026-07-13，Chris 拍板）**：
- **初始密碼 = admin 打**（min-length floor;policy/改/重設/force-change 全 4c）。
- **表涵蓋全部 user（local + SSO）**：create + 設密碼限 local;role/OpCo scope/active 兩種 provider 可改。技術安全:guard upsert 唔碰 role/scope（`jwt-auth.guard.ts:180-184`）→ 改 SSO role 唔被覆寫。
- 自行鎖:停用非刪除（H4 + FK 完整性）· `@Roles(ADMIN)` only（BACKLOG/ADR）· 安全閘（唔停自己 / 唔停最後 active ADMIN）。

**查證**：無 `GET /opcos` endpoint（前端從未 fetch OpCo list）→ 本 phase 加 `GET /admin/opcos` 俾 create selector。apps/web 無 Dialog/Select primitive,但 handoff 有規格（`Dialog.jsx` / `Select.d.ts`）→ 重建（FE-2 重建 Stepper/Tabs 先例，H6-OK）。

**做咗**：plan（§0 決策 + scope + 8 gate）+ checklist + progress。status active。

**下一步**：D1 — 後端 DTOs + UserAdminService（argon2 hash + 安全閘）+ UserAdminController（`@Roles(ADMIN)`）+ auth.module wiring。

---

## Day 1 — 2026-07-13（D1-D6 完成）

### Done
- **D1 後端**：`dto/user-admin.dto.ts`（CreateUserDto[email/displayName/role/opcoScopeId?/initialPassword min-8]/UpdateUserDto[role?/opcoScopeId?/active?]/AdminUserDto[無 hash]/AdminOpcoDto）· `user-admin.service.ts`（list[me-shape 無 hash]/create[normaliseScope + email 409 + argon2.hash + insert local]/update[nextRole·nextActive + **D-e 安全閘** + normaliseScope]/listOpcos;`toAdminUser` 排除 passwordHash;H4 log id/role/actor 唔 log email/pw/hash）· `user-admin.controller.ts`（`@Roles(ADMIN)` GET/POST/PATCH `/admin/users` + GET `/admin/opcos`）· `auth.module` wiring。
- **D2 後端 test**：`user-admin.service.spec`（11：create hash+role/scope+無 hash · OPCO_IT 無 scope 400 · scoped create · 非-OPCO forced null · email 409 · update role/active · 停自己 400 · 停最後 ADMIN 400 · 另有 ADMIN 時可降 · 升 OPCO_IT 無 scope 400）· `controllers-guarded.spec` +1（UserAdminController = ADMIN only）。
- **D3 前端 primitive**：`components/ui/dialog.tsx`（handoff Dialog.jsx 重建:overlay bg-black/45 + panel shadow-overlay + Esc/scrim 關 + lucide X + fadeIn）· `components/ui/select.tsx`（Select.d.ts 重建:native select + token + ChevronDown）。
- **D4 前端 Users&roles**：api-types（Role/AdminUser/AdminOpco/CreateUserBody/UpdateUserBody）· queries（useAdminUsers/useAdminOpcos retryUnless403）· mutations（useCreateUser/useUpdateUser invalidate）· `lib/user-admin.ts`（roleLabel/roleTone/providerLabel/scopeLabel/isLocal + validateCreateUser）· `components/settings/users-panel.tsx`（真表 provider badge/status/mono id + Add user Dialog[Role Select + OpCo Select 條件顯] + Edit Dialog[role/scope/Active SegmentedControl] + 403 restricted EmptyState + toast）· `settings.tsx` users tab 接 UsersPanel。
- **順手 in-file 修（R3 note，非 plan deviation）**：settings.tsx **account tab sign-out 仲用 MSAL-only**（`instance.logoutRedirect` + `disabled={!msalConfigured}`）→ 對本地登入 admin（正正係本 phase 服務嘅人）係壞嘅 → 改用 `useSignOut` + `canSignOut`（同 W18 sidebar/top-bar pattern），清埋 W18 遺留嘅 `useMsal`/`msalConfigured` orphan import。
- **D5 前端 test**：`lib/user-admin.test.ts`（10：validateCreateUser 6 + display helper 4）。
- **D6 verify**：見下。

### Decisions / 學習
- **無 schema 改**（AppUser 已有齊欄）→ H1 不觸發,同 AUTH-3a/W16 純 query/service-layer;**無新 dep**（argon2 W18 已加）→ H2 不觸發。ADR-0005 §6 早解鎖。
- **安全閘 recompute scope**：update 時一律 `normaliseScope(nextRole, rawScope)` → 降級自動清 stale scope、升級無 scope 即 400,一條路搞掂 role↔scope 一致。
- **guard upsert 唔碰 role/scope** 令改 SSO user role 唔被下次登入覆寫（查證過 `jwt-auth.guard.ts:180-184`）—— D-b「管理埋 SSO user」成立。
- **踩坑:5173 vite server 死咗但 tab 仲 show cached 畫面**（`/api` fetch「Failed to fetch」）→ netstat 冇 LISTENING 確認死;kill + fresh `npm run dev` 起返（同 3100 stale instance 教訓）。screenshot renderer timeout → 改 JS DOM 量度（memory 教訓）。

### Verify（真 tool output）
- api **build 0 · lint 0 · 109→121 test**（user-admin.service +11 · guarded +1）· web **build 0 · lint 0 · 25→35 test**（user-admin +10）。
- **live backend（真 HTTP,local-only:AUTH_JWT_SECRET / 無 dev-bypass / seed admin@uop.local）**：
  - admin login 200 → GET /admin/users = **3 users,無 passwordHash 欄**(H4) · GET /admin/opcos = 23。
  - POST create OPCO_IT scoped(PFU-Asia) → **201,role/scope 正確,body 無 hash** · dup email → **409** · OPCO_IT 無 scope → **400**。
  - 新 user login → /me = OPCO_IT/PFU-Asia · GET /license/ledger → **200 scoped** · GET /admin/users(該 OPCO_IT token) → **403**(G8)。
  - PATCH deactivate → 200 · deactivated login → **401** · 停自己 → **400** · demote 最後 active ADMIN（先停另一 entra admin 令本地 admin 成孤)→ **400「Cannot demote or deactivate the last active admin」** → 還原 entra admin + 確認 admin@uop.local 仍 ADMIN。
- **live FE（browser,真 local 登入 via /api proxy）**：admin session → Settings›Users&roles = **4 行真數**（Chris Lai SSO/Admin/All OpCos/Active · opco.it.rhk SSO/OPCO_IT · admin@uop.local local/Admin · test user）· 7 欄 · Add user primary。**Add user Dialog** = role="dialog" + Email/Display name/Role/Password;Role select = Admin/Regional/OpCo IT;切 OPCO_IT → OpCo scope 欄 + Select 由 `/admin/opcos` 填 **24 項**(23+placeholder);**Esc 關**。**dark mode**:`.dark` + body rgb(8,8,10) + card rgb(20,20,23) + **Add user btn rgb(230,0,39)=#E60027 唯一 primary** + 4 行仍渲染。**OPCO_IT session** → Users tab = **「Admin access required / limited to platform admins」restricted,0 行,無 Add 掣**(G8 誠實無造假)。
- cleanup:test OPCO_IT user 停用返 · kill 3100/5173 server（避 stale instance）。

### Blockers
- 無。

### Effort
- Planned ~1-2 日；Actual D0-D6 同日。

### Commits
| Hash | Subject |
|---|---|
| (待指示) | feat(auth): W19 AUTH-4b — local user administration (admin CRUD + role/opco-scope + Users&roles UI) |

---

## Closeout（status=closed）

### Acceptance verification（plan §4 gates）
| Gate | 結果 |
|---|---|
| G1 CRUD + @Roles(ADMIN) | ✅ 三 endpoint + guarded metadata test + live 非-admin 403 |
| G2 create → login → scoped live | ✅ backend curl(create→login→/me OPCO_IT→ledger 200) + FE 表真數 |
| G3 H4 無 hash / 不 log | ✅ /admin/users + create response 無 passwordHash;log 只 id/role/actor |
| G4 安全閘 + 驗證 | ✅ 409 dup · 400 no-scope · 400 停自己 · 400 最後 ADMIN(live) |
| G5 H5 test | ✅ api 121(service 11 + guarded 1) · web 35(user-admin 10) |
| G6 build/lint/test green | ✅ api build/lint 0 · 121 · web build/lint 0 · 35 |
| G7 H6 token-only + handoff 重建 + 一 primary + light+dark | ✅ ui-design DS-1..12 全過;live 兩 theme + #E60027 sole primary |
| G8 FE 403 graceful | ✅ OPCO_IT session → restricted,0 行,無 Add(誠實無造假) |

全 8 gate ✅。

### Lessons
- **無 schema/dep 嘅 auth 擴充**：4b 完全建喺 ADR-0005 stack 上,dual-provider 表 + 既有 role/opco-scope/guard 零改,只加 CRUD 面 → plan-first + H5 test 足夠,唔使新 ADR。
- **stale dev server 陷阱翻兜**：5173 vite 死咗但 browser tab show cached → `/api` fetch fail 先揭發;netstat LISTENING 係真相,tab title 唔係。fresh 起自己控制嘅 server。
- **screenshot busy → JS DOM 量度**：renderer timeout 時,`getComputedStyle` 取 token 實色（#E60027 / dark surface）比截圖更硬證。

### Carry-overs（→ AUTH-4c / 其他）
- **AUTH-4c**（W20）：自助改密碼 / admin 重設 / force-change-on-first-login / lockout / rate-limit / policy;**密碼重設 email transport = 另一 H2 sub-decision**;refresh token;httpOnly cookie。
- **AUTH-3b**：前端全站真 role gating（本 phase Users tab 靠後端 @Roles + 403 graceful,未做全站 role）。
- account tab「Sign-in method: Microsoft Entra ID」對本地 user 仍寫死顯示 SSO（cosmetic;真 provider 顯示隨 AUTH-3b identity）。
- 本地 DB test 數（live.opco.* 停用 local OPCO_IT）無害,同既有 test 數一致。

---

**End of W19 progress**
