---
phase: W37-sync-sweep
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: draft           # draft | active | closed
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

## Retro(填於 closed)

_(待實作)_
