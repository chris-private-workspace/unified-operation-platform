---
phase: W28-permission-matrix
plan_ref: ./plan.md
status: complete    # in-progress | complete
last_updated: 2026-07-20
---

# Phase W28 — Checklist

> Atomic checkbox(每 item ≤ 1–2 hour effort)。
> AI tick 完成嘅 item;唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。

## F0 — Spike(先做,決定 F1 做法)

- [x] 30 分鐘 spike:`DiscoveryService` + `MetadataScanner` 攞唔攞到 route path + `@Roles` metadata(R1)—— ✅ **A 成功**(path/method/roles/public 全讀到)· ❌ **B 失敗**(jest 內 import AppModule 爆 `jose` ESM)· ✅ **C 成功**(glob+require 9/9)
- [x] Spike 結論寫入 `progress.md` Day-1 —— **成功 → 行 runtime derive**;無需 fallback。衍生 **D1**(F1 用 DiscoveryService / F3 用 glob,共用 `derivePermissions` 純函數)+ **D2**(F3 擴展既有 `controllers-guarded.spec.ts`)→ 已入 plan §7 changelog

## F1 — 後端 `GET /admin/permissions`

- [x] `permissions.ts`:`derivePermissions()` **純函數**(非 service —— 要畀 runtime + test 兩邊共用,見 D1),掃 controller handler derive route + roles + 標示
- [x] 五種標示邏輯:`roles` / `public` / `m2m` / `authenticated` / `unguarded`;**`unguarded` 定義 = 冇 `@Roles` 且唔喺 `REVIEWED_AUTHENTICATED` 白名單**(白名單 = 刻意開放畀任何登入用戶,加一行係 security decision)
- [x] method-level `@Roles` 覆蓋 class-level —— derive 邏輯**逐步 mirror `RolesGuard`**(@Public 優先 → method roles → class roles),否則矩陣會描述一啲冇人 enforce 嘅規則
- [x] `permissions.controller.ts`:`GET /admin/permissions`,`@Roles(ADMIN)`
- [x] DTO + OpenAPI 標註(含 R4 註記寫入 `@ApiOperation` description)
- [x] module wire(`AuthModule` 加 `DiscoveryModule` import)
- [x] live curl 驗:HTTP 200,**34 route / 9 controller 全覆蓋** —— G1 ✅
- [x] live curl 驗:`/requests/intake` = `m2m` + `guards:["IntakeKeyGuard"]`、auth×3 = `public`、me×2 = `authenticated` —— G3 ✅
- [x] live curl 驗:非 ADMIN → **403 ✅ 已實試**(Chris 指示 restart)。三重證明,唔止一個 status code:
      ① `AUTH_DEV_USER_EMAIL=opco.it.rhk@rapo.com.hk` 重起 → `/me` 回 `role:"OPCO_IT"` · `opcoScope:{code:"RHK"}`(**確認真係扮到**)
      ② `GET /admin/permissions` → **403**
      ③ 同一 session `GET /license/ledger` → **200 且只見 RHK**(**證明 403 係 role gate,唔係 session 壞咗**)
      ④ 還原預設重起 → `/me` = ADMIN · `/admin/permissions` = **200** · 34 route / unguarded=0 / m2m=1

## F2 — 前端 Settings › Permissions

- [x] `api-types.ts` 加 `PermissionEntry` + `AccessKind` 型別
- [x] `queries.ts` 加 `usePermissions`(`retryUnless403` —— 403 係權威,唔重試)
- [x] `components/settings/permissions-panel.tsx`:按 controller 分組矩陣表(10 組 / 34 行)
- [x] `unguarded` = danger · `m2m` = info · `authenticated`/`public` = warn · `roles` = neutral(全部既有 `BadgeTone`,零自創色)
- [x] **R4 註記**:頁面明文寫「呢張表答 *which role may call an endpoint*,唔表達 row-level scope —— OpCo IT 另受 backend 限制」
- [x] `settings.tsx` 加第 6 tab(`ShieldCheck`)
- [x] 非 ADMIN → graceful restricted state(沿用 users-panel / opcos-panel pattern)
- [x] **零 primary action**(唯讀頁,Card 無 `action` prop)· token-only · lucide-only —— H6
- [x] browser 驗 light + dark —— G5 ✅(light:34 行 / 10 組 / intake=「Machine key」+IntakeKeyGuard;dark:`dark` on root · page bg `rgb(8,8,10)` · badge token swap `rgb(16,31,57)`/`rgb(95,155,255)` · path = **Geist Mono**)
- [x] 額外:零 `unguarded` 時唔顯示 danger 行;有 `unguarded` 時頂部出 danger 統計句

## F3 — Drift 防護 test(H5)

- [x] Snapshot test:當前矩陣鎖成 fixture(`__snapshots__/permissions.spec.ts.snap`,34 行)
- [x] Unguarded 偵測 test:白名單外任何 route 冇 `@Roles` → fail
- [x] **fails-before 實證 1**:`opco.controller.ts` 移走 `Role.OPCO_IT` → snapshot **紅**,diff 顯示 `GET /opcos → roles [ADMIN,REGIONAL,OPCO_IT]` 變 `[ADMIN,REGIONAL]` → 已還原
- [x] **fails-before 實證 2**:`MeController` 加 `@Get('fails-before-probe')`(無 `@Roles`)→ unguarded test **紅**,報 `GET /me/fails-before-probe (MeController.probe)` → 已還原
- [x] 兩條實證結果貼 `progress.md` —— G4 ✅
- [x] 額外 8 條意圖 test(controller 全覆蓋 / reviewed-authenticated 白名單 / m2m / public / override / **OPCO_IT 可寫 ledger 迴歸鎖** / tenant-sku 排除 OPCO_IT / endpoint 自身 ADMIN-only)
- [x] 保留既有 `controllers-guarded.spec.ts`(assert **意圖**)—— 同新 spec(lock **現況**)互補,兩者答唔同問題

## Verify

- [x] `apps/api`:build ✅ exit 0 · test ✅ **223**(30 suites,1 snapshot)· lint ✅ **全 repo exit 0** —— G6
      📌 CRLF 383 error(4 個 W23-A 舊檔)**經 Chris 指示順手清咗**。查根因發現**問題早已根治且唔會復發**:`.gitattributes`(W25)嘅 `* text=auto eol=lf` **override** 咗 `core.autocrlf=true`,`git ls-files --eol` 證實全部 `i/lf w/lf`。嗰 4 個檔只係 `.gitattributes` 生效**之前**遺留嘅 working-copy 殘留,從未 refresh → `eslint --fix` 清完 **`git diff` 空**(index 本來就 LF,repo 一直乾淨,無嘢可 commit)。**唔係技術債,唔使入 BACKLOG。**
- [x] `apps/web`:build ✅ exit 0 · test ✅ **85** 不降 · lint ✅ exit 0 —— G6
- [x] `git diff` 核:`opco.controller.ts` / `me.controller.ts` / `license.controller.ts` / `fulfilment/` **全部零 diff**(fails-before 兩處改動已還原乾淨)—— G7 ✅
- [x] 跑 `ui-design` skill 自檢 —— DS-1~DS-10 全 ✅;**DS-11 = N/A**(prototype 無此畫面,屬「用既有 token + primitive 砌新畫面」,H6 允許唔使問);DS-12 N/A

---

## Cross-Cutting

- [x] All deliverables committed to git(`3fc4de7` F0 · `a5126c7` F1+F3 · `faf8c68` F2 · `d107c43` 403+CRLF · closeout commit)
- [x] All open-question status changes reflected in decision tracker(R4)—— OQ-1/OQ-2 於 `81dc99b` 已同步 ADR-0009 + 分析文件 §8
- [x] All architectural-adjacent decisions documented as ADR(per CLAUDE.md §5)—— **無新 ADR**,ADR-0009 Decision 8.5 已完整覆蓋(純 derive / 零 schema / 零行為改動);spike 成功故無 fallback deviation
- [x] Pending / next-candidate changes synced to `BACKLOG.md`(R7)
- [x] `progress.md` retro section written
- [x] `progress.md` frontmatter status flipped to `closed`(plan / checklist 同步)
- [x] Phase N+1 kickoff trigger noted in retro —— **AUDIT-3**(`AuditLog` 落地),無外部阻塞可即開

---

**Lifecycle reminder**:呢份 checklist 隨 plan deliverables 衍生。新加 deliverable 必須先入 plan + changelog,然後再加 checklist item。
