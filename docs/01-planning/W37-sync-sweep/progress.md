---
phase: W37-sync-sweep
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: active          # draft | active | closed
---

# W37 — Progress

> Daily log + retro。每 commit 對應一個 Day-N entry(R2)。

---

## Day 0 — 2026-07-27:Phase 開單(**draft**,等 approve + OQ1/OQ2/OQ3)

**Action**:W36 收官(PR #30,CI pass)後接力落 ADR-0015。plan / checklist / progress 三件齊,**全部鎖住**,等 Chris approve 並答三條 OQ。

### Grounding —— 逐條落 SQL 實跑 D2 揀單規則

```
Request 總數 7 | azureSyncedAt IS NULL 2 | 且 status ∈ {OPEN,IN_PROGRESS} 2
⇒ 再加「至少一個非終態 line item」+ 30 日 cutoff ⇒ would_be_swept = 0
```

兩張候選單**都冇任何非終態 line item**(0 pending lines,17 日大)⇒ 按 D2 正確排除。

呢個 0 唔係「冇嘢睇」,係兩個直接後果:

1. ✅ **D7「閒置時對 vendor 零流量」喺 dev 變成可驗證嘅 acceptance** —— 上線後跑一輪,Graph call 應該係 **0**。呢個係一條**證負面**嘅 live 驗證,比「跑咗冇 crash」有力得多。
2. 🔴 **命中路徑喺 dev 冇天然素材** ⇒ 要驗就要造數據,而「UPN 真係喺 tenant 搵得到」呢個條件把問題推去 tenant 接觸面 → 成為 **OQ2**。

### 🔴 開工前就發現咗 D4 同白名單唔兼容(OQ3)—— 呢個係 W36 retro 嘅直接成果

W36 嗰次係**實作到一半**先撞到「ADR 引用嘅 audit 機制同 `audit-fields.ts` 唔對版」。今次起草 plan 時就逐字打開嗰個檔核對,結果 D4 三個假設**又係全部唔成立**:`AUDIT_ACTIONS` 冇 sync 相關 action、`AuditTargetType` 冇合適 target、`scanned`/`opened` 唔喺 metadata 白名單(只有 `source` 喺)。

⇒ 照 D4 字面寫,audit 只會留低 `source: 'sync-sweep'`,兩個計數無聲消失。

**兩次撞同一個坑,呢個係機制問題唔係偶然。** 建議 closeout 時把「引用 ADR-0009 audit 契約 = 必須逐字核對三個常數」寫入 ADR 模板或 `anti-patterns` skill。

### 另一個起草時查到嘅實作阻力(OQ1)

D5 列咗 `SYNC_SWEEP_CRON`(env 可調)。但 **`@Cron(...)` 嘅參數喺 class 定義時求值,早過 DI**,所以「由 `ConfigService` 讀」根本做唔到。逐字查 `@nestjs/schedule@4` 嘅 `index.d.ts` / `scheduler.registry.d.ts` 之後確認:動態註冊要 `import { CronJob } from 'cron'`,而 **`cron` 目前只係 transitive dep,未 declare 喺任何 `package.json`** ⇒ 要用就係 **H2 觸發**。

四條路(寫死 / 自我節流 / 引 `cron` / 讀 `process.env`)全部有代價,已列入 OQ1,建議**寫死 + 保留 `ENABLED` 開關**。

### Branch 決定

`docs/w37-sync-sweep` **off `docs/w36-budget-gate`**(PR #30),因為 F3 改 `assign.service.ts`、F5 改 `audit-fields.ts`,**兩個檔 W36 都改過而未 merge**。#29 → #30 merge 之後 rebase 落 main。

### Blockers

- **plan 未 approve**(`draft`)→ 依 R1,一行 code 都唔寫
- **OQ1 未答** → F2 排程形狀未定(且 C 會觸發 H2)
- **OQ2 未答** → 命中路徑點驗未定
- **OQ3 未答** → F5 audit 落唔到(擴白名單 = ADR-0009 Decision 5 privacy decision,要 owner 批)

**Commit**:`<hash>` — W37 plan / checklist / progress(draft)

---

## Day 1 — 2026-07-27:plan approved(OQ1=A · OQ2=B · OQ3=A)· **F1+F2+F3+F4+F5 完成**

### 完成

| | 內容 |
|---|---|
| **F5**(先做) | `audit-fields.ts` 三處:action `sync.sweep` · target `SyncSweep`(欄位白名單 `['scanned','opened']`)· 計數放 **`after`** 跟 `allocation.import` 先例。**先做 audit 白名單**係刻意嘅 —— W36 就係因為留到最後先發現唔兼容而卡住 |
| **F3** | 新 `sync-gate-messages.ts` 把兩條 message 放埋一齊(`VERIFIED` / `MANUAL`),`assign.service.ts` 改用 `MANUAL` |
| **F1** | `sync-sweep.service.ts`:D2 四條件揀單 · 命中開 gate(同一 transaction)· 未命中零寫入 · Graph throw 中止本輪 |
| **F2** | `@Cron(EVERY_10_MINUTES)` 寫死(OQ1=A)+ `SYNC_SWEEP_ENABLED`/`_BATCH`/`_MAX_AGE_DAYS` + `.env.example` |
| **F4** | `sync-sweep.service.spec.ts` 新 suite + `assign.service.spec.ts` 補 message 斷言 |

### 三個設計上唔顯然嘅決定

**1. `handleCron` 同 `sweep` 分開,兩層都 catch。** `sweep()` 內部已經處理 Graph 失敗,但 `handleCron` 仍然包多一層 —— 因為佢係同 scheduler 之間嘅邊界,而**任何逃出去嘅 exception 就係 unhandled rejection,會殺 Nest process**(BUG-002 已經實證過一次)。`sweep()` 保持會 return 結果,方便 test 直接 assert。

**2. `SYNC_SWEEP_ENABLED` 用 `!== 'false'` 而唔係 `=== 'true'`。** 唔設 / 打錯字 → **繼續跑**。呢個 flag 嘅用途係「Graph 出事時熄咗佢」,唔係「要記得開佢」;default-off 會令一次 typo 靜靜停咗整個機制而冇人為意。

**3. audit summary 寫喺 transaction 之外**(偏離 checklist 原本寫法,見下)。

### 🔴 一個 checklist 寫錯咗、實作時修正嘅地方(R3)

Checklist F5 原本寫「audit 寫入同 sweep 嘅 DB 改動**同一個 transaction**(ADR-0009 D8.1)」。**做唔到,而且唔應該做**:round summary 橫跨 N 個獨立 transaction(每張單一個),冇一個係佢應該屬於嘅,揀最後嗰個純粹係武斷。

改為**跟 `outbound-retry.service.ts` 已立嘅先例**(佢都係刻意 audit 喺 transaction 外,並寫明理由)。D8.1 要防嘅「做咗但冇紀錄」喺呢度**根本唔可能發生** —— 每一個被開嘅 gate 都已經有自己嗰條 `RequestEvent(SYNC)`,同 update 原子寫入。summary 失敗只會蝕咗一個**報表數字**,唔係行為紀錄本身。已改 checklist + code 註釋寫明。

### Gate(真 output)

| | 結果 |
|---|---|
| api test | **429 passed / 42 suites**(基線 410,**+19**) |
| api lint | **零 output** |
| 硬邊界 | `schema.prisma` / 三個 `package.json` / `reconcile.service.ts` **diff 全部 0** |
| 🔴 `assign.service.ts` | diff = **1 個 import + 1 段註釋 + 1 行 message**;`assignLineItem` 嘅 `findUser` gate **一個字都冇動** |

### 幾條 test 特別講一句

- **`aborts the whole round`** —— assert 3 張候選只 call 咗 `findUser` **一次**。若果有人把 `break` 改成 `continue`,呢條即刻紅。淨係 assert「冇 throw」嘅話,一個「吞咗錯繼續狂打 Graph」嘅實作照樣全綠,而嗰個正正係 throttle 變 lockout 嘅路徑。
- **`never overwrites an accountCreatedAt that is already known`** —— `??` 變 `=` 就紅。呢個數字係 ADR 明列嘅交付物(「Entra Connect 實際延遲幾耐」),覆寫咗就永遠答唔到。
- **`the counts survive the ADR-0009 whitelist`** —— 把 captured payload 餵落**真嘅** `pickAuditFields`。W36 立嘅回歸網,今次一開始就落。

**未做**:live 驗證(negative + OQ2=B 命中路徑,**等 owner 畀帳號**)· F6 文檔同步 · ADR-0015 逐條 closeout 核對。

**Commit**:`<hash>` — F1-F5

---

## Retro(填於 closed)

_(待實作)_
