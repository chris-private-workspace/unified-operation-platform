---
phase: W19-auth-user-admin
status: closed
---

# W19 — AUTH-4b — Checklist

> ADR-0005 §6。本地 user 管理:admin CRUD + role/opcoScope + Settings › Users & roles UI。
> 決策鎖定:admin 打初始密碼 · 表涵蓋 local+SSO(create/密碼限 local) · 停用非刪除 · @Roles(ADMIN) · 安全閘(唔停自己/最後 ADMIN)。
> **D1-D6 完成,G1-G8 全過**（api 109→121 · web 25→35;live backend curl 端到端 + FE browser light/dark + 403 restricted）。

## D1 — 後端 CRUD
- [x] DTOs：`CreateUserDto`（email/displayName/role/opcoScopeId?/initialPassword）· `UpdateUserDto`（role?/opcoScopeId?/active?）· `AdminUserDto`（無 hash）· `AdminOpcoDto`
- [x] `UserAdminService`：list（全部,me-shape 無 hash）· create（驗 + argon2 hash + insert local）· update（+ D-e 安全閘）· listOpcos
- [x] `UserAdminController`（`@Roles(ADMIN)`）：GET/POST/PATCH `/admin/users` + GET `/admin/opcos`
- [x] wire `auth.module.ts`（UserAdminService provider + UserAdminController）

## D2 — 後端 tests（H5）
- [x] create → passwordHash 存 + role/opcoScopeId 正確 + **回應無 passwordHash**
- [x] OPCO_IT 無 opcoScopeId → 400 · ADMIN/REGIONAL 有 scope → 拒/清 · email 重複 → 409
- [x] update role / active;**D-e**：停自己 → 拒 · 停/降最後 active ADMIN → 拒
- [x] controller `@Roles(ADMIN)`：非-ADMIN → 403
- [x] round-trip：create local user → `auth.service.login` 成功 → PATCH active:false → login 401

## D3 — 前端 primitive（handoff 重建，H6）
- [x] `components/ui/dialog.tsx`（Dialog.jsx 重建：overlay + panel + Esc/overlay 關 + 基本 focus;token-only;light+dark）
- [x] `components/ui/select.tsx`（Select.d.ts 重建：token-styled dropdown）

## D4 — 前端 Users & roles
- [x] `lib/api-types.ts`：AdminUser / CreateUserBody / UpdateUserBody / AdminOpco
- [x] `hooks/queries.ts`：useAdminUsers / useAdminOpcos（lazy）+ useCreateUser / useUpdateUser（invalidate）
- [x] `components/settings/users-panel.tsx`：真表（provider badge + status + mono id）+ Add user Dialog（Role SegmentedControl + OpCo Select）+ row actions（改 role/scope/停用·啟用）+ **403 restricted EmptyState**
- [x] `pages/settings.tsx` users tab 接 users-panel（取代 coming-soon stub）;一 primary（Add user）

## D5 — 前端 tests（web）
- [x] 純 helper 單元：provider/status/scope 顯示 + create validation gate（OPCO_IT 需 scope）—— match `lib/*.test.ts`

## D6 — verify + closeout
- [x] api build 0 + web build 0 + lint 0 + test green（api 109→N · web 25→N）
- [x] **live**：admin create local user → 新 user login → token → guarded 200 正確 role/scope → 改 role/停用 → 停用後 login 401;非-ADMIN 403 graceful;light+dark
- [x] `ui-design` skill 自檢（DS-1..12）
- [x] progress retro · plan closed · BACKLOG（AUTH-4b ✅）· memory · commit（待指示）

## Phase Gate（plan §4）
- [x] G1 CRUD 三 endpoint + @Roles(ADMIN) 強制
- [x] G2 create local user 端到端 live（新 user 登入拎正確 scope）
- [x] G3 H4（無 hash 外露 · 不 log 密碼/hash · me-shape）
- [x] G4 安全閘 + 驗證（停自己/最後 ADMIN 拒 · OPCO_IT 需 scope · email dup 409）
- [x] G5 H5 test（service + guard 403 + hash 不外露 + 停用-blocks-login）
- [x] G6 build 0 + lint 0 + test green
- [x] G7 H6（token-only · Dialog/Select handoff 重建 · 一 primary · lucide · light+dark · ui-design 過）
- [x] G8 前端 403 graceful（非-ADMIN restricted，不造假）

## Cross-Cutting
- [x] 每 commit references progress Day-N（R2）
- [x] ADR-0005 §6 對齊（無新 schema/dep → 無新 ADR）
- [x] BACKLOG 同步（R7：AUTH-4b active → ✅）
