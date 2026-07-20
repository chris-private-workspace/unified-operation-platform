---
phase: W29-audit-log
plan_ref: ./plan.md
status: in-progress    # in-progress | complete
last_updated: 2026-07-20
---

# Phase W29 — Checklist

> Atomic checkbox(每 item ≤ 1–2 hour effort)。
> AI tick 完成嘅 item;唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。
> **⚠️ plan status=draft —— 未 approve 唔可以開始 F1**(PROCESS R1)。

## F0 — Gate(開工前)

- [x] Chris approve plan §9 三點 —— Q1 **記 `metadata.emailAttempted`** · Q2 **獨立 `/audit` 頁 + sidebar**(偏離原建議)· Q3 **逐組 commit,做完三組先 review**
- [x] plan.md status → `active`
- [x] Q2 連鎖後果查證:prototype **無** audit 畫面 → `/audit` 屬 owner-approved 新畫面,F4 須補 `design-system.md`(plan §9.1)

## F1 — Schema + 白名單基建

- [ ] `schema.prisma` 加 `AuditLog` model(**additive**:`actorId?` / `actorType` / `action` / `targetType` / `targetId` / `before?` / `after?` / `metadata?` / `createdAt` + 三個 index)
- [ ] migration 生成 + apply,`npx prisma validate` 過
- [ ] `audit-fields.ts`:每個 `targetType` 一張**明文 allow-list** + 永久 blacklist(`passwordHash` / `tokenHash`)
- [ ] `pickAuditFields(targetType, obj)` 純函數 —— 白名單外一律唔入
- [ ] **🔴 H4 test 先行**(寫喺 hook 之前):餵含 `passwordHash`/`tokenHash` 嘅完整 `AppUser` → assert 結果**唔含**任何 secret —— G2
- [ ] `audit.service.ts`:`log(tx, entry)` **接受 Prisma transaction client**(Decision 8.1)
- [ ] `metadata` 同樣受固定 key set 約束(plan §8 收緊提案)—— 唔可以做繞過白名單嘅逃生門
- [ ] 既有 **223 test 不降** —— G1

## F2a — identity 事件（user-admin.service.ts）

- [ ] `user.create` / `user.update` / `user.deactivate` / `user.password_reset`
- [ ] **`user.role_change` 獨立成一個 action**(role / opcoScopeId 有變時額外記)—— 權限變更係稽核最關心嘅事,唔應該埋喺一般 update 要人自己 diff
- [ ] 各操作包 `$transaction`,audit 同主寫入同一個 tx
- [ ] test:5 個事件各證實**真係寫低咗**(唔止「唔 crash」)
- [ ] **rollback test**:主操作失敗 → audit **唔會**留低 —— G4
- [ ] 跑全 api test,**既有全綠先落下一組**(R1)

## F2b — auth 事件（auth.service.ts）

- [ ] `auth.login_success` / `auth.login_failed` / `auth.locked`
- [ ] `login_failed` 嘅 `targetId` 處理(打錯 email 時無對應 user)—— 按 Q1 拍板結果
- [ ] test:3 個事件 + lockout 觸發 `auth.locked`
- [ ] 跑全 api test,既有全綠先落下一組

## F2c — config + bulk 事件

- [ ] `opco.create` / `opco.update`(`opco.service.ts`)
- [ ] `catalog.update`(`catalog.service.ts`,CH-003 三個 curation 欄)
- [ ] `allocation.import` —— **summary-level 一條,唔係每行**(逐行會淹沒 audit table)
- [ ] `drift.resolve`
- [ ] test:5 個事件
- [ ] 跑全 api test

## F3 — `GET /admin/audit`

- [ ] 篩選:`actorId` / `targetType` / `targetId` / `action` / 日期範圍
- [ ] 分頁 + **單次上限 100**(防一次拉走成個 table)
- [ ] `@Roles(ADMIN)` —— **採 P-B 故 table 含 PII,唔可放寬**(ADR Decision 7 連帶義務 ①)
- [ ] DTO + OpenAPI
- [ ] test:篩選 / 分頁 / 上限
- [ ] live curl 驗非 ADMIN → **403**(跟 W28 三重驗證做法:`/me` 確認身分 → 403 → 同身分下一個應該成功嘅 endpoint 做對照)—— G5
- [ ] 確認 W28 `permissions.spec.ts` unguarded test 自動覆蓋此新 endpoint(唔使新增)

## F4 — 前端 Audit UI（獨立 `/audit` 頁,Q2 拍板)

- [ ] `api-types.ts` 加 `AuditEntry` + 篩選型別
- [ ] `queries.ts` 加 `useAuditLog`(`retryUnless403`)
- [ ] `pages/audit.tsx`:時間序表 + 篩選 + 分頁 + before→after 展開
- [ ] **新 route `/audit`** 註冊
- [ ] **sidebar 加 Administration 區項目**,用 `canSeeAdminNav` proactive 隱藏(AUTH-3b pattern)
- [ ] 直接開 URL 時 graceful restricted state(**後端 403 先係真權威**,前端隱藏只係 UX)
- [ ] **零 primary action**(唯讀)· token-only · lucide-only —— H6
- [ ] browser 驗 light + dark —— G6
- [ ] **🔴 更新 `docs/02-architecture/design-system.md`** —— 記低 `/audit` 係 prototype 以外、owner-approved 嘅新畫面 + 新 sidebar 項目。**唔補嘅話將來 fidelity audit 會報成 drift**(plan §9.1)

## Verify

- [ ] `apps/api`:build · test(≥223+)· lint 全綠 —— G7
- [ ] `apps/web`:build · test(≥85)· lint 全綠 —— G7
- [ ] **G2 live 抽查**:實際觸發一次 user 改動,查 DB `AuditLog` row 確認**冇任何 secret 欄位**
- [ ] **G8 零既有行為改動**:既有 test 全綠 + `git diff` 核冇改到 API 回應 / 權限 / 對帳邏輯
- [ ] 跑 `ui-design` skill 自檢(H6)

---

## Cross-Cutting

- [ ] All deliverables committed to git
- [ ] All open-question status changes reflected in decision tracker(R4)—— Q1/Q2/Q3 拍板結果入 progress
- [ ] All architectural-adjacent decisions documented as ADR(per CLAUDE.md §5)—— **預期無新 ADR**(ADR-0009 已涵蓋);但 plan §8 `metadata` 收緊建議喺 ADR-0009 補一句註
- [ ] Pending / next-candidate changes synced to `BACKLOG.md`(R7)—— 含 **audit retention** 登記為將來 candidate(R5)
- [ ] `progress.md` retro section written
- [ ] `progress.md` frontmatter status flipped to `closed`
- [ ] Phase N+1 kickoff trigger noted in retro(預期 = **INTEG-1** connector 狀態 + test connection)

---

**Lifecycle reminder**:呢份 checklist 隨 plan deliverables 衍生。新加 deliverable 必須先入 plan + changelog,然後再加 checklist item。
