---
phase: W37-sync-sweep
plan_ref: ./plan.md
status: closed           # draft | active | closed
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

- [x] `RISK_REGISTER` **R3** ⚠️ Open → 🟡 **Mitigating**(live 驗完先改),連**三項殘留**寫明:仍係輪詢(最壞等 10 分鐘)· 30 日後放棄仍要人手 · 多實例重複跑
- [x] `SYSTEM-SPEC-AND-SOW.md` **四處**:§17 A1 落差(零實作 → 🟡 排程通/佇列未通)· stack 表 · Layer 3 查證段 · P8 · 查證方法註(標明「結果為零」係當時實況)
- [x] `docs/architecture.md §3`(`@Cron` 由 planned → **sync sweep ✅ 已實作**,daily reconcile 仍 planned)
- [x] `BACKLOG.md` 同步(R7)—— W37 行 + `SYNC-sweep` 收官 + 路線更新
- [x] `.env.example` 三個新 key + default + 點解 cutoff 要存在

## Verification(phase 級)

- [x] **live ①(負面)** —— ⚠️ **原本寫法 live 觀察唔到**:sweep 閒置時**刻意靜默**,所以「tick 咗但乜都冇做」同「tick 冇發生」喺外面睇落一樣。改為由 ① unit test(真 assert `findUser` 零 call)+ ② live ③ 嘅**對照組**(同一輪其餘兩張唔合資格嘅單完全冇被掂)共同證明。**唔加 idle-round log** —— 每 10 分鐘一條「乜都冇做」會蓋過真正有嘢講嗰啲
- [x] **live ②** `SYNC_SWEEP_ENABLED=false` → **A/B 對照**:同一個 seed,預設 06:30 tick **15 秒內被掃**;`false` 時 06:40 tick 過咗 **仍然 null + audit 0**。⚠️ 中途補做 `/docs/api` + `/me` 200 確認 **API 真係活住**先落結論(第一次 boot 輪詢冇印到 "api up",直接落結論就會係假驗證)
- [x] **live ③ 命中路徑(OQ2 = B,Chris 授權)** —— seed → 下一個 tick 命中:`azureSyncedAt` SET · `accountCreatedAt` SET · `RequestEvent` = verified 文案 · **一條** `sync.sweep` audit(`after {"opened":1,"scanned":1}` **喺真 DB 過到白名單**)· 🔴 **對照組**:同輪其餘兩張唔合資格嘅單仍然 null
- [x] **還原證據(H4)**:兩次 seed 全清 —— `w37_requests_left`/`w37_lines_left`/`w37_events_left`/`sweep_audit_left`/**`upn_rows_left`** 五個 count **全 0**,回到 baseline(7 張 / `would_be_swept` 0);UPN 冇入任何 commit / 文檔 / log;env 只經 shell 傳,**`.env` 全程未改**
- [x] 🔴 `assign.service.ts` diff = **1 個 import + 1 段註釋 + 1 行 message**;`assignLineItem` 嘅 `findUser` gate **一個字都冇動**(逐行 diff 為證)
- [x] `prisma/schema.prisma` diff **0** · 三個 `package.json` diff **0** · `reconcile.service.ts` diff **0**
- [x] **ADR-0015 D1-D7 逐條核對完成**(見 progress Day 2 表)—— **五條逐字相符,兩條偏離**(D4 audit 形狀 · D5 放棄 `SYNC_SWEEP_CRON`),兩條都係**起草 / 開工前**發現、owner 批咗、入咗 changelog。冇一條係靜靜偏離

## Cross-Cutting

- [x] Daily commit 對應 `progress.md` Day-N(R2)—— Day 0/1/2 各有 hash
- [x] Conventional Commits + scope(`docs(planning)` / `feat(fulfilment)` / `docs(architecture)`)
- [x] **零 schema 改動** —— `prisma/schema.prisma` diff **0**
- [x] **零新 dependency**(H2)—— 三個 `package.json` diff **0**(OQ1 揀 A 就係為咗避開呢個)
- [x] **唔順手做 daily reconcile**(H3)—— `reconcile.service.ts` diff **0**;已列入 carry-over 等開新 phase
- [x] `progress.md` closeout + status → `closed`

---

**Lifecycle reminder**:本 checklist 隨 plan 衍生。新項目必須先入 plan + changelog,再加落此。
