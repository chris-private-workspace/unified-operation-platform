---
phase: W28-permission-matrix
plan_ref: ./plan.md
status: in-progress    # in-progress | complete
last_updated: 2026-07-20
---

# Phase W28 — Checklist

> Atomic checkbox(每 item ≤ 1–2 hour effort)。
> AI tick 完成嘅 item;唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。

## F0 — Spike(先做,決定 F1 做法)

- [ ] 30 分鐘 spike:`DiscoveryService` + `MetadataScanner` 攞唔攞到 route path + `@Roles` metadata(R1)
- [ ] Spike 結論寫入 `progress.md` Day-1 —— 成功 → 行 runtime derive;失敗 → fallback 手寫 const map + drift test(**要 log 入 plan §7 changelog**)

## F1 — 後端 `GET /admin/permissions`

- [ ] `permissions.service.ts`:掃 controller handler,derive route + roles + 特殊標示
- [ ] 四種標示邏輯:`roles[]` / `public` / `authenticated` / `m2m` / `⚠️ UNGUARDED`
- [ ] method-level `@Roles` 覆蓋 class-level(驗 `license.controller.ts` 6 處 override)
- [ ] `permissions.controller.ts`:`GET /admin/permissions`,`@Roles(ADMIN)`
- [ ] DTO + OpenAPI 標註
- [ ] module wire
- [ ] live curl 驗:9 controller 全覆蓋(對 `@Roles` grep 逐條核)—— G1
- [ ] live curl 驗:`/requests/intake` = `m2m`、auth = `public`、me = `authenticated` —— G3
- [ ] live curl 驗:非 ADMIN → 403

## F2 — 前端 Settings › Permissions

- [ ] `api-types.ts` 加 `PermissionEntry` 型別
- [ ] `queries.ts` 加 `usePermissions`
- [ ] `components/settings/permissions-panel.tsx`:按 controller 分組矩陣表
- [ ] `⚠️ UNGUARDED` = danger Badge · `m2m` = info Badge(沿用既有 Badge tone,唔自創色)
- [ ] **R4 註記**:頁面明文寫「role 只係第一層;OPCO_IT 另有 per-OpCo row-level scope,本表唔表達」
- [ ] `settings.tsx` 加第 6 tab(`ShieldCheck`)
- [ ] 非 ADMIN → graceful restricted state(沿用 users-panel pattern)
- [ ] **零 primary action**(唯讀頁)· token-only · lucide-only —— H6
- [ ] browser 驗 light + dark —— G5

## F3 — Drift 防護 test(H5)

- [ ] Snapshot test:當前矩陣鎖成 fixture
- [ ] Unguarded 偵測 test:白名單外任何 route 冇 `@Roles` → fail
- [ ] **fails-before 實證**:故意改一個 `@Roles` → 睇住 snapshot test 紅 → 還原
- [ ] **fails-before 實證**:故意加一個無 guard route → 睇住 unguarded test 紅 → 還原
- [ ] 兩條實證結果貼 `progress.md`(H7:唔可以只寫「驗過」)—— G4

## Verify

- [ ] `cd apps/api && npm run build && npm test && npm run lint` 全綠(≥213 test)—— G6
- [ ] `cd apps/web && npm run build && npm test && npm run lint` 全綠(≥85 test)—— G6
- [ ] `git diff` 逐行核:**零** 現有 `@Roles` 被改 —— G7
- [ ] 跑 `ui-design` skill 自檢(H6)

---

## Cross-Cutting

- [ ] All deliverables committed to git
- [ ] All open-question status changes reflected in decision tracker(R4)
- [ ] All architectural-adjacent decisions documented as ADR(per CLAUDE.md §5)—— 預期**無新 ADR**(純 derive,ADR-0009 8.5 已覆蓋);若 spike 失敗改 fallback → plan §7 changelog
- [ ] Pending / next-candidate changes synced to `BACKLOG.md`(R7)
- [ ] `progress.md` retro section written
- [ ] `progress.md` frontmatter status flipped to `closed`
- [ ] Phase N+1 kickoff trigger noted in retro(預期 = **AUDIT-3** `AuditLog` 落地)

---

**Lifecycle reminder**:呢份 checklist 隨 plan deliverables 衍生。新加 deliverable 必須先入 plan + changelog,然後再加 checklist item。
