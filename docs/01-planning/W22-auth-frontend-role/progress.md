---
phase: W22-auth-frontend-role
status: closed
---

# W22 — AUTH-3b — Progress

## Day 0 — 2026-07-14（kickoff）

**緣起**：AUTH-3a(W11)後端已 per-OpCo fail-closed scope + `GET /me` 回真 role,但前端零 consumer —— 仲用 `store/ui.ts` 假 role toggle(`'Regional'|'RHK IT'`)。W18 本地登入 + W21 session 令真 role 到手,唔再全卡 IT SSO。本 phase 接真 role 落全站顯示 + gating,退假 toggle。

**Explore map（現狀,2026-07-14）**：
- 假 role toggle `store/ui.ts:4,22,26` —— **唯一 consumer** = `top-bar.tsx:113,118-119,149`(SegmentedControl pill + subtitle 字串);**無 data filter / gating**。
- 真 role 已到:`login.tsx:53` → `local-profile` 有 `role`/`opcoScopeId`;但 `use-current-user.ts:18-44` **drop 咗**(CurrentUser 無 role)。`GET /me`(me.controller.ts,真 role)前端**零 consumer**。
- "My queue" = documented gap(`lib/requests.ts:106-109`,需真 user id);FILTERS 只 all/attention/procurement/blocked。
- Platform mode(`assets.tsx:15-44`)無 role gate(靠 `platform-view` 403 reactive);sidebar admin nav(`sidebar.tsx`)無 gating(靠 backend 403 degrade)。
- role 顯示:淨 top-bar 假 subtitle;user menu/sidebar/Settings 只 name/email 無 role;真 role 只喺 admin Users 表(別人 role)。
- **資料 filtering 已後端 session scoping cover**(queries 無 role param)→ AUTH-3b 純 display/gating + identity-hook。

**決策（AskUserQuestion 2026-07-14,Chris）**：
1. **真 role source = 統一 `GET /me` query(SSOT)** + local profile initialData 免閃。
2. **My queue 本 phase 做**(client-side handledById===me.id)。
3. **Gating = Platform + admin nav 都 proactive**(OPCO_IT 隱 Platform · ADMIN-only admin nav;backend 403 仍最終防線)。

**紀律定位**：純前端 display/gating + identity-hook,**唔觸 H1/H2**(無 schema/dep/架構改),AUTH sprint 內(H3 OK),AUTH-3a 後端 scope 已建 → **無 ADR**,plan-first(R1)足夠。

**做咗**：Explore agent map 前端 role 用法(7 點)。plan(§0 前置 gate + scope + 10 gate + 3 決策)+ checklist + progress。status draft。

**下一步**：**待 Chris approve plan** → 開 D1(useMe query + MeResponse + use-current-user 加 role)。

### Blockers
- ~~plan approve~~ → **Chris approved 2026-07-14**,即開 D1。

---

## Day 1 — 2026-07-14（D1-D5 完成）

### Done
- **D1 真 role hook(SSOT)**:`api-types` `MeResponse`;`hooks/queries.ts` `useMe()`(apiGet('/me') + local profile 組 initialData 免閃,opcoScope 靠 /me 補);`use-current-user` 加 `role`/`opcoScope`(source useMe;name/email 仍 profile/MSAL/dev-bypass label)。
- **D2 退假 toggle + 顯示**:`lib/roles.ts`(pure `roleScopeLabel`/`canSeePlatform`/`canSeeAdminNav`);`store/ui.ts` 刪 `Role`/`role`/`setRole`;`top-bar.tsx` 移除 `SegmentedControl`+`ROLES` pill,subtitle 改 `roleScopeLabel(role,opcoScope)`,user menu 加 role badge;`sidebar.tsx` user card 加 role badge;`settings.tsx` account 加 Role field(真 role badge)+ **順手修 W21 carry** sign-in method 按 session(local/Entra)。
- **D3 gating + My queue**:`assets.tsx` Platform switcher gate(`canSeePlatform`;OPCO_IT/pending 隱 switcher 強制 By-OpCo);`sidebar.tsx` admin nav(Administration section)`canSeeAdminNav` ADMIN-only;`lib/requests.ts` `RequestFilter` 加 `'mine'` + `matchesFilter(meId)`;`requests.tsx` "My queue" tab + `meId` from useMe。
- **D4 tests**:`lib/roles.test.ts`(roleScopeLabel 3 role+scope/pending · canSeePlatform/canSeeAdminNav matrix+pending fail-safe · 10 test);`lib/requests.mine.test.ts`(matchesFilter mine:me/別人/未派/meId 缺/all 不受影響 · 5 test)。
- **D5 verify**:見下。

### Decisions / 學習
- **use-current-user 變 async-aware**:role from useMe(query)。local session profile initialData 令 role 即時(免 loading 閃);Entra/dev-bypass 首 fetch 短窗 role undefined → gating fail-safe 隱(寧收窄唔誤開)。
- **opcoScope 兩段**:profile 只有 opcoScopeId 冇 opcoScope object → initialData subtitle OPCO_IT fallback "OpCo IT",/me revalidate 補 code → "RHK — RHK only"(live 實測 600ms 內補到)。
- **資料 filtering 唔改**:queries 無 role param,後端 session scoping SSOT(live opcoit All=1 scoped 證 AUTH-3a 仍 work)。
- **順手修 W21 carry**(R3,plan §1 Out 允許):settings sign-in method 按 session(local→"Local account (password)")取代寫死 Entra。
- **踩坑**:①stale `dist/main` 又佔 3100(EADDRINUSE)→ netstat owning PID kill 重起(反覆坑);②browser output filter 擋 role/Token key → 用 boolean(isAdmin/isOpcoIt)繞;③useMe queryKey ['me'] cache → 切 session 用 full-reload navigate 令 QueryClient fresh(唔係 SPA pushState)。

### Verify（真 tool output）
- api **157 不動**(純前端);web **build 0 · lint 0 · 48→63 test**(roles 10 + requests.mine 5);`--fix` 修 requests.ts union formatting。
- **live**(本地登入 admin + 建 OPCO_IT local user `opcoit.w22@uop.local` scoped RHK,curl create/login/change-pw 清 must-change,/me 確認 role=OPCO_IT scope=RHK):
  - **ADMIN**(admin@uop.local):subtitle **"Admin — all OpCos"** · sidebar **Administration+Users&roles+Integrations 見** · assets **By OpCo+Platform 兩掣**。
  - **OPCO_IT**:subtitle **"RHK — RHK only"** · sidebar admin nav **全隱** · assets switcher **全隱**(直接 By-OpCo)。
  - **My queue tab render**(both):filter tabs All=1/My queue=0/Needs attention/Procurement/Blocked;OPCO_IT **All=1**(backend RHK scoping 仍 work)· My queue=0(opcoit 非 handler,正確)。
- cleanup:kill 3100(44712)/5173(47668)。

### Blockers
- 無。

### Effort
- Planned ~1-2 日;Actual D0-D5 同日。

### Commits
| Hash | Subject |
|---|---|
| (待指示) | feat(web): W22 AUTH-3b — frontend real role scope (consume /me · retire fake toggle · gating · My queue) |

---

## Closeout（status=closed）

### Acceptance verification（plan §4 gates）
| Gate | 結果 |
|---|---|
| G1 useMe SSOT | ✅ /me 真 role + profile initialData;live admin/opcoit 真 role |
| G2 假 toggle 消失 | ✅ store/ui 無 role/setRole · top-bar 無 Regional/RHK IT pill |
| G3 真 role 顯示 | ✅ subtitle 3 role live 對照 + role badge(menu/sidebar/settings) |
| G4 Platform gate | ✅ ADMIN 見 By OpCo+Platform / OPCO_IT switcher 全隱 |
| G5 admin nav gate | ✅ ADMIN Administration 見 / OPCO_IT 隱 |
| G6 My queue | ✅ tab render + matchesFilter handledById===me.id |
| G7 H5 test | ✅ roles.test 10 + requests.mine.test 5 |
| G8 build/lint/test | ✅ api 157 · web 63 · web build/lint 0 |
| G9 H6 UI | ✅ role badge 既有 Badge token-only(DS-8 roleTone map) · lucide 不變 · ui-design 過 |
| G10 regression | ✅ app render 正常 · backend RHK scoping 仍 work · role pending fail-safe 隱 |

全 10 gate ✅。

### Lessons
- **真 role 一直喺,只欠 hook**:AUTH-3a 後端 scope + /me 早已交付,前端 seam 只係 use-current-user 接返真 role → 全站 gating/display 隨之。
- **fail-safe gating**:role pending(Entra/dev-bypass 首 fetch)→ 隱 admin/Platform,寧收窄唔誤開;local session profile initialData 消除呢個窗。
- **gating 係 UX layer**:後端 fail-closed 403(AUTH-3a)先係權限真相,前端隱藏只係唔顯示無權入口(live 證 backend scoping 仍主導資料)。

### Carry-overs
- **真 OPCO_IT SSO e2e**(🔴 隨 **AUTH-2b**,卡 IT SPA app reg)—— 本地登入 + 建 OPCO_IT local user 已驗真 role scope;Entra 真 token e2e 待 app reg。
- 本地 DB 測試數(`opcoit.w22@uop.local` OPCO_IT/RHK · 其他 local)無害。

---

**End of W22 progress**
