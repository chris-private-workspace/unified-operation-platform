---
phase: W29-audit-log
plan_ref: ./plan.md
status: complete       # in-progress | complete
last_updated: 2026-07-21
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

- [x] `schema.prisma` 加 `AuditLog` model(**additive**;`AppUser` 只加 relation field,無新 column)· `prisma validate` ✅
- [x] migration `add_audit_log` 生成 + apply —— **live DB 實查**:10 欄 + 3 個 index 齊(`targetType+targetId+createdAt` / `actorId+createdAt` / `action+createdAt`),`before`/`after`/`metadata` = `jsonb`
- [x] `audit-fields.ts`:5 個 `targetType` 明文 allow-list(`AppUser` / `Opco` / `SkuCatalog` / `DriftAlert` / `AllocationImport`)+ 永久 blacklist
- [x] `pickAuditFields()` 純函數 —— 白名單外一律唔入;**blacklist 贏過 whitelist**(順序寫死,加咗註唔准反轉)
- [x] **🔴 H4 test 先行 —— 13 條全綠**(G2):餵完整 `AppUser`(含 `passwordHash: '...SECRET_DO_NOT_LEAK'`)→ assert 序列化結果**唔含**該字串;逐個 blacklist key 驗;**白名單交叉驗**(任何 whitelist 都唔可以含 blacklist key)
- [x] **反向 regression**:`mustChangePassword` **唔會**被誤殺 —— blacklist 刻意用「精確名 + `*Hash`/`*Secret` 後綴」而非 substring match `password`
- [x] `audit.service.ts`:`log(tx, entry)` + `logChange(tx, entry)` **接受 `Prisma.TransactionClient`**(Decision 8.1);**caller 傳原始 entity,白名單喺 service 內做** —— 冇 call site 可以繞過 H4 邊界
- [x] `logChange` 只存**變咗嘅欄**;no-op update **唔寫任何 row**(return false)
- [x] `metadata` 受固定 key set 約束(`reason`/`correlationId`/`source`/`emailAttempted`)—— 專門 test 證實 `requestBody`/`ip`/`passwordHash` 全部被丟棄
- [x] `AuditModule` **@Global**(同 `PrismaModule` 一致)—— audit 橫跨所有 write module,逐個改 imports 只會多觸碰無關檔案(§1.3)
- [x] 既有 test 不降:**223 → 236**(+13,31 suites)· build 0 · lint 0 —— G1

## F2a — identity 事件（user-admin.service.ts）

- [x] `user.create` / `user.update` / `user.deactivate` / `user.password_reset`
- [x] **`user.role_change` 獨立成一個 action**(role / opcoScopeId 有變時額外記)—— 權限變更係稽核最關心嘅事,唔應該埋喺一般 update 要人自己 diff(labelling:privilege change 蓋過 deactivate,test 鎖住)
- [x] 各操作包 `$transaction`,audit 同主寫入同一個 tx
- [x] test:5 個事件各證實**真係寫低咗**(唔止「唔 crash」)
- [x] **rollback test**:主操作失敗 → audit **唔會**留低 —— G4
- [x] 跑全 api test,**既有全綠先落下一組**(R1)—— 236 → 242

## F2b — auth 事件（auth.service.ts）

- [x] `auth.login_success` / `auth.login_failed` / `auth.locked`(locked 獨立一條 row,actorType 'system')
- [x] `login_failed` 嘅 `targetId` 處理(打錯 email 時無對應 user)—— 按 Q1:`metadata.emailAttempted`,targetId 'unknown'
- [x] test:3 個事件 + lockout 觸發 `auth.locked`
- [x] 跑全 api test,既有全綠先落下一組 —— 242 → 247

## F2c — config + bulk 事件

- [x] `opco.create` / `opco.update`(`opco.service.ts`)
- [x] `catalog.update`(`catalog.service.ts`,CH-003 三個 curation 欄)
- [x] `allocation.import` —— **summary-level 一條,唔係每行**(逐行會淹沒 audit table;`buildLogArgs()` 入 array-form `$transaction` 同批)
- [x] `drift.resolve`(`reconcile(actorId)`:人手 = actorType user + source manual-reconcile;@Cron = system + scheduled)
- [x] test:5 個事件
- [x] 跑全 api test —— 247 → 256

## F3 — `GET /admin/audit`

- [x] 篩選:`actorId` / `targetType` / `targetId` / `action` / 日期範圍(`from`/`to` ISO 8601;action / targetType 用 `@IsIn` 對齊 write-path 常數,typo 即 400)
- [x] 分頁 + **單次上限 100**(DTO `@Max(100)` + service 層 re-clamp 雙重防守)
- [x] `@Roles(ADMIN)` —— **採 P-B 故 table 含 PII,唔可放寬**(ADR Decision 7 連帶義務 ①;controller comment 寫明放寬須重開 ADR)
- [x] DTO + OpenAPI(`audit-query.dto.ts`:AuditQueryDto / AuditEntryDto / AuditPageDto)
- [x] test:篩選 / 分頁 / 上限(service find 4 條 + DTO validation 3 條)
- [x] live curl 驗非 ADMIN → **403**(三重驗證:`/me` 200 = opco.it.rhk OPCO_IT → `/admin/audit` 403 → 同身分 `/license/ledger` 200 對照)—— G5
- [x] 確認 W28 `permissions.spec.ts` unguarded test 自動覆蓋此新 endpoint —— **實證**:snapshot 即 fail 並捕捉 `GET /admin/audit → roles [ADMIN]`,審視後 deliberate update(snapshot + controller 名單 +AuditController)

## F4 — 前端 Audit UI（獨立 `/audit` 頁,Q2 拍板)

- [x] `api-types.ts` 加 `AuditEntry` + 篩選型別(AuditActor / AuditPage / AuditFilters)
- [x] `queries.ts` 加 `useAuditLog`(`retryUnless403`;filters 入 queryKey)
- [x] `pages/audit.tsx`:時間序表 + 篩選 + 分頁 + before→after 展開(filter 變更自動 reset offset)
- [x] **新 route `/audit`** 註冊
- [x] **sidebar 加 Administration 區項目**,用 `canSeeAdminNav` proactive 隱藏(AUTH-3b pattern;ADMIN 陣列改 `to` union 支援 standalone route + settings tab deep-link)
- [x] 直接開 URL 時 graceful restricted state(403 → EmptyState「Access required」;**後端 403 先係真權威**)
- [x] **零 primary action**(唯讀)· token-only · lucide-only —— H6(ui-design 12 條自檢全 ✅)
- [x] browser 驗 light + dark —— G6(真數據 render + 展開 + filter 生效 + dark swap 無爆色)
- [x] **🔴 更新 `docs/02-architecture/design-system.md`** —— 新增 §6「Prototype 以外嘅 owner-approved 畫面」表,登記 `/audit` + sidebar 項(Chris 2026-07-20,plan §9.1 Q2)

## Verify

- [x] `apps/api`:build · test(**263**,31→32 suites)· lint 全綠 —— G7
- [x] `apps/web`:build · test(**92**)· lint 全綠 —— G7
- [x] **G2 live 抽查**:實觸發 PATCH deactivate + 還原 → `/admin/audit` 見 2 row(`user.deactivate` + `user.update`,diff 只含 `active`,actor join 正常)——**冇任何 secret 欄位**
- [x] **G8 零既有行為改動**:既有 test 全綠(api 263 / web 92)+ `git diff` 核全 additive —— audit.service 只加 read path,snapshot +1 行純新 route,sidebar refactor 行為等價
- [x] 跑 `ui-design` skill 自檢(H6)—— 12 條全 ✅(零 primary action / token-only / light+dark 實截)

---

## Cross-Cutting

- [x] All deliverables committed to git(`219075f` F1 · `2a60d48`/`b0634ed`/`b8d3c30`/`91b4c40` F2 · `95bd083` F3 · `5c0cb24` F4 · `5fb5085` progress)
- [x] All open-question status changes reflected in decision tracker(R4)—— Q1/Q2/Q3 拍板結果 + Q2 連鎖後果查證入 progress Day 1
- [x] All architectural-adjacent decisions documented as ADR(per CLAUDE.md §5)—— **無新 ADR**(ADR-0009 已涵蓋);plan §8 `metadata` 收緊 **已補入 ADR-0009 Decision 5 實作補註**(明寫收緊唔係推翻,故唔需新 ADR)
- [x] **Pending / next-candidate changes synced to `BACKLOG.md`(R7)** —— 曾 🚧 卡 PR #9(`docs/w28-closeout` 改同一批行 → 必然 conflict + 中間態自相矛盾);**PR #9 於 2026-07-21 merge(`547c89f`)後解封**:rebase 本 branch 上 main(11 commit 零衝突)→ 一個 commit 同步 AUDIT-3 → ✅ · W29 入進行中表 · header 更新 · **`audit-retention` 登新 candidate**(R5)· **`FE-activity` 標解封**(附 ADMIN-only 連帶問題)
- [x] `progress.md` retro section written
- [x] `progress.md` frontmatter status flipped to `closed`
- [x] Phase N+1 kickoff trigger noted in retro —— **INTEG-1**(connector 狀態 + test connection);但建議先 PR #9 merge + R7 sync 再開

---

**Lifecycle reminder**:呢份 checklist 隨 plan deliverables 衍生。新加 deliverable 必須先入 plan + changelog,然後再加 checklist item。
