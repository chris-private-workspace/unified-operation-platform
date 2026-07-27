---
phase: W37-sync-sweep
plan_ref: ./plan.md
status: draft            # draft | active | closed
last_updated: 2026-07-27
---

# W37 — Checklist

> 由 `plan.md` §3 deliverables + §4 acceptance 衍生。每項 ≤ 1-2h。
> ⚠️ **全部鎖住** —— plan 仍係 `draft`,等 Chris approve + 答 **OQ1 / OQ2 / OQ3** 先開工(PROCESS R1)。

## F1 — `SyncSweepService`

- [ ] 新 `apps/api/src/fulfilment/sync-sweep.service.ts` + `FulfilmentModule` 註冊 provider
- [ ] 揀單四條件齊全(D2):`azureSyncedAt IS NULL` · `status ∈ {OPEN, IN_PROGRESS}` · **至少一個非終態 line item** · `createdAt > now - maxAge`
- [ ] 排序 `createdAt` 舊→新;`take = batch`
- [ ] 命中 → `azureSyncedAt = now` + **`accountCreatedAt ??= now`**(唔可以覆寫已有值)+ `RequestEvent(SYNC)`,**同一個 `$transaction`**
- [ ] 未命中(`findUser` 返 null)→ **DB 零寫入**
- [ ] `findUser` throw → `logger.warn` + **中止本輪** + **絕不 rethrow**(D6;R1 = process 死)
- [ ] **H4**:全程零 `targetUpn` 落 log(只 id + 計數)

## F2 — 排程掛接 + 開關

- [ ] 🚧 **等 OQ1** —— `SYNC_SWEEP_CRON` 做唔到零成本(`@Cron` 參數喺 DI 之前求值);A 寫死 / B 自我節流 / C 引入 `cron`(**H2**)
- [ ] `SYNC_SWEEP_ENABLED` 總開關 —— `false` 時 **`findUser` 零 call + DB 零讀**
- [ ] `SYNC_SWEEP_BATCH`(default 50)· `SYNC_SWEEP_MAX_AGE_DAYS`(default 30)
- [ ] 三者一律 `ConfigService.get` + default(**唔用 `getOrThrow`** —— 跟 `jwt-auth.guard.ts:50` optional-env 先例)
- [ ] `.env.example` 補齊新 key + default 註明

## F3 — 人手 confirm 明文降級(D3)

- [ ] `markSynced` message → `Phase 1 sync manually confirmed (not verified against Graph)`
- [ ] sweep message → `Phase 1 sync verified against Microsoft Graph (scheduled sweep)`
- [ ] `markSynced` **其餘行為零改動**(權限 / OpCo scope / 回傳 / endpoint)
- [ ] Code 註釋寫明**點解**要分辨(唔分辨 = D1 語意升級喺 UI 上等於冇發生)

## F4 — Test(H5)

- [ ] `sync-sweep.service.spec.ts` 新 suite
- [ ] 揀單:四條件逐條各有一個「唔應入選」case(已 sync / 狀態終態 / 冇非終態 line item / 過 cutoff)
- [ ] 命中 / 未命中 / throw 三條主路徑
- [ ] **`accountCreatedAt` 已有值時唔被覆寫**(`??=` 而唔係 `=`)
- [ ] 🔴 **證負面 ①**:冇候選 → `findUser` **零 call**(證 D7,唔止證「冇 crash」)
- [ ] 🔴 **證負面 ②**:第一張 throw → 第二張 **零 call**(證真係中止,唔係吞咗繼續)
- [ ] `SYNC_SWEEP_ENABLED=false` → 零 call 零讀
- [ ] `assign.service.spec.ts` 補 `markSynced` message 斷言(F3)
- [ ] Graph + ServiceNow 全 mock,零真 tenant(§3.4)
- [ ] api test ≥ **410** + lint 零 output

## F5 — Audit(D4)

- [ ] 🚧 **等 OQ3** —— D4 同 ADR-0009 白名單唔兼容(`AUDIT_ACTIONS` 冇 sync action · `AuditTargetType` 冇合適 target · `scanned`/`opened` 唔喺 metadata 白名單)
- [ ] (A)`AUDIT_ACTIONS` + `SYNC_SWEEP: 'sync.sweep'`
- [ ] (A)`AuditTargetType` + `'SyncSweep'`,白名單 `['scanned','opened']`,`targetId: 'bulk'`(跟 `allocation.import`)
- [ ] 有變動 → **一條** audit;零變動 → **零** audit
- [ ] 🔴 **captured payload 過真嘅 `pickAuditFields` 唔被丟棄**(W36 立嘅回歸網)
- [ ] 同 sweep 寫入**同一個 transaction**(ADR-0009 D8.1)
- [ ] `actorType: 'system'` + `metadata.source = 'sync-sweep'`

## F6 — 文檔同步

- [ ] `RISK_REGISTER` **R3** ⚠️ Open → 🟡 Mitigating —— ⚠️ **實作 + live 驗完先改**,唔可以寫完 code 就改
- [ ] `SYSTEM-SPEC-AND-SOW.md §A1`(「排程 / 背景佇列零實作」已 stale)
- [ ] `docs/architecture.md §3`(`@Cron` 由預留 → 實作)
- [ ] `BACKLOG.md` 同步(R7)
- [ ] `.env.example` + 部署文檔提及新 env

## Verification(phase 級)

- [ ] **live ①(負面,零風險)**:dev 現況跑一輪 → **Graph 零 call + DB 零寫入**(§2 grounding 已證 `would_be_swept = 0`)
- [ ] **live ②**:`SYNC_SWEEP_ENABLED=false` → 完全短路
- [ ] 🚧 **live ③ 命中路徑** —— 等 **OQ2**(A = 只靠 mock,交接落 UAT / B = 用指定真帳號造數據,造完即刪貼證據)
- [ ] 🔴 `assign.service.ts` 嘅 **`findUser` gate 區塊 diff 為空**(只有 `markSynced` message 一行可動)
- [ ] `prisma/schema.prisma` diff **0** · 三個 `package.json` diff **0**(⚠️ 除非 OQ1 揀 C)
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
