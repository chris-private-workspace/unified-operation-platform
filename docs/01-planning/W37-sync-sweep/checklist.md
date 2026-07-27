---
phase: W37-sync-sweep
plan_ref: ./plan.md
status: active           # draft | active | closed
last_updated: 2026-07-27
---

# W37 — Checklist

> 由 `plan.md` §3 deliverables + §4 acceptance 衍生。每項 ≤ 1-2h。
> ✅ **已解鎖**(2026-07-27,Chris approve)—— **OQ1 = A**(寫死 10 分鐘 + `ENABLED` 開關)· **OQ2 = B**(真 UPN 造數據驗完即刪)· **OQ3 = A**(擴白名單)。

## F1 — `SyncSweepService`

- [x] 新 `apps/api/src/fulfilment/sync-sweep.service.ts` + `FulfilmentModule` 註冊 provider
- [x] 揀單四條件齊全(D2):`azureSyncedAt IS NULL` · `status ∈ {OPEN, IN_PROGRESS}` · **至少一個非終態 line item** · `createdAt > now - maxAge`
- [x] 排序 `createdAt` 舊→新;`take = batch`
- [x] 命中 → `azureSyncedAt = now` + **`accountCreatedAt ??= now`**(唔可以覆寫已有值)+ `RequestEvent(SYNC)`,**同一個 `$transaction`**
- [x] 未命中(`findUser` 返 null)→ **DB 零寫入**
- [x] `findUser` throw → `logger.warn` + **中止本輪** + **絕不 rethrow**(D6;R1 = process 死)
- [x] ➕ `handleCron` **再包多一層 catch** —— 佢係同 scheduler 之間嘅邊界,任何逃出去嘅 exception 就係 unhandled rejection(BUG-002 已實證會殺 process)
- [x] **H4**:全程零 `targetUpn` 落 log(只 id + 計數)

## F2 — 排程掛接 + 開關

- [x] **OQ1 = A** —— `@Cron(CronExpression.EVERY_10_MINUTES)` **寫死**,**放棄 `SYNC_SWEEP_CRON`**(偏離 D5,已入 changelog)
- [x] `SYNC_SWEEP_ENABLED` 總開關 —— `false` 時 **`findUser` 零 call + DB 零讀**
- [x] ➕ 用 **`!== 'false'`** 而唔係 `=== 'true'`:唔設 / 打錯字 → **繼續跑**。呢個 flag 係「出事時熄佢」,default-off 會令一次 typo 靜靜停咗成個機制
- [x] `SYNC_SWEEP_BATCH`(default 50)· `SYNC_SWEEP_MAX_AGE_DAYS`(default 30);junk 值 fallback 唔會變 `NaN`
- [x] 三者一律 `ConfigService.get` + default(**唔用 `getOrThrow`** —— 跟 `jwt-auth.guard.ts:50` optional-env 先例)
- [x] `.env.example` 補齊新 key + default 註明

## F3 — 人手 confirm 明文降級(D3)

- [x] 新 `sync-gate-messages.ts` 把兩條放埋一齊(改任何一條都會見到另一條)
- [x] `markSynced` message → `Phase 1 sync manually confirmed (not verified against Graph)`
- [x] sweep message → `Phase 1 sync verified against Microsoft Graph (scheduled sweep)`
- [x] `markSynced` **其餘行為零改動**(權限 / OpCo scope / 回傳 / endpoint)—— diff 為證
- [x] Code 註釋寫明**點解**要分辨(唔分辨 = D1 語意升級喺 UI 上等於冇發生)

## F4 — Test(H5)

- [x] `sync-sweep.service.spec.ts` 新 suite
- [x] 揀單:四條件 + 排序 + batch/maxAge env + junk 值 fallback
- [x] 命中 / 未命中 / throw 三條主路徑;miss 唔會中斷 batch
- [x] **`accountCreatedAt` 已有值時唔被覆寫**(`??=` 而唔係 `=`)
- [x] 🔴 **證負面 ①**:冇候選 → `findUser` **零 call**(證 D7,唔止證「冇 crash」)
- [x] 🔴 **證負面 ②**:第一張 throw → 第二張 **零 call**(證真係中止,唔係吞咗繼續)
- [x] `SYNC_SWEEP_ENABLED=false` → 零 call 零讀;非 `'false'` 嘅值一律照跑
- [x] `handleCron` 吞得住連 `sweep` 都擋唔住嘅錯(DB 死)
- [x] `assign.service.spec.ts` 補 `markSynced` message 斷言(F3)
- [x] Graph + ServiceNow 全 mock,零真 tenant(§3.4)
- [x] api test **429 passed / 42 suites**(基線 410,**+19**)+ lint 零 output

## F5 — Audit(D4)

- [x] **OQ3 = A** —— 擴白名單(偏離 D4,已入 changelog);計數放 **`after`** 唔放 metadata
- [x] `AUDIT_ACTIONS` + `SYNC_SWEEP: 'sync.sweep'`
- [x] `AuditTargetType` + `'SyncSweep'`,白名單 `['scanned','opened']`,`targetId: 'bulk'`(跟 `allocation.import`)
- [x] 有變動 → **一條** audit;零變動 → **零** audit
- [x] 🔴 **captured payload 過真嘅 `pickAuditFields` 唔被丟棄**(W36 立嘅回歸網)
- [x] ~~同 sweep 寫入同一個 transaction~~ → **實作時修正為「刻意寫喺 transaction 外」**(R3,見 progress Day 1):round summary 橫跨 N 個獨立 transaction,冇一個係佢應該屬於嘅。跟 `outbound-retry.service.ts` 先例;D8.1 要防嘅「做咗但冇紀錄」喺呢度唔可能發生 —— 每個開咗嘅 gate 都有自己嗰條 `RequestEvent(SYNC)` 同 update 原子寫入
- [x] `actorType: 'system'` + `actorId: null` + `metadata.source = 'sync-sweep'`

## F6 — 文檔同步

- [ ] `RISK_REGISTER` **R3** ⚠️ Open → 🟡 Mitigating —— ⚠️ **實作 + live 驗完先改**,唔可以寫完 code 就改
- [ ] `SYSTEM-SPEC-AND-SOW.md §A1`(「排程 / 背景佇列零實作」已 stale)
- [ ] `docs/architecture.md §3`(`@Cron` 由預留 → 實作)
- [ ] `BACKLOG.md` 同步(R7)
- [ ] `.env.example` + 部署文檔提及新 env

## Verification(phase 級)

- [ ] **live ①(負面,零風險)**:dev 現況跑一輪 → **Graph 零 call + DB 零寫入**(§2 grounding 已證 `would_be_swept = 0`)
- [ ] **live ②**:`SYNC_SWEEP_ENABLED=false` → 完全短路
- [ ] **live ③ 命中路徑(OQ2 = B)** —— 用**指定嘅**真 tenant 帳號造一張 request,跑一輪見真命中,**造完即刪 + 貼還原證據**;⚠️ H4:全程唔 log UPN、唔入任何 commit。🚧 **開工前要問 owner 攞用邊個帳號**
- [x] 🔴 `assign.service.ts` diff = **1 個 import + 1 段註釋 + 1 行 message**;`assignLineItem` 嘅 `findUser` gate **一個字都冇動**(逐行 diff 為證)
- [x] `prisma/schema.prisma` diff **0** · 三個 `package.json` diff **0** · `reconcile.service.ts` diff **0**
- [ ] ADR-0015 D1-D7 逐條核對;有偏離 → plan changelog + 問 owner

## Cross-Cutting

- [ ] Daily commit 對應 `progress.md` Day-N(R2)
- [ ] Conventional Commits + scope(`feat(fulfilment)` / `feat(audit)` / `docs(planning)`)
- [ ] **零 schema 改動** —— 發現要改 → **STOP**(H1 重新觸發)
- [ ] **零新 dependency**(H2)—— OQ1 揀 C 就係觸發,要 ADR
- [ ] **唔順手做 daily reconcile**(H3;ADR 講「鋪路」唔係「做埋」)
- [ ] `progress.md` closeout + status → `closed`

---

**Lifecycle reminder**:本 checklist 隨 plan 衍生。新項目必須先入 plan + changelog,再加落此。
