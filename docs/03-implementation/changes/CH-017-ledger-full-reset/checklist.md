---
change_id: CH-017
spec_ref: ./spec.md
status: done            # in-progress | done
last_updated: 2026-08-02
---

# CH-017 — Checklist

> Atomic checkbox items derived from `spec.md §3` acceptance criteria。每 item ≤ 1-2h effort。
> AI tick 完成嘅 item;唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。

## Implementation — Backend

- [x] **B1** `dto/ledger-full-reset.dto.ts` — request(`dryRun` / `opcoCode` / `confirm`)+ result + row + Swagger
- [x] **B2** `LedgerFullResetService.reset()` — **獨立檔**,CH-016 嘅 `AllocationResetService` 一個字唔改
- [x] **B3** where = `OR: [allocated != 0, assigned != 0]`(+ optional `opcoId`);0/0 唔算入 `affected`
- [x] **B4** `dryRun` default = true(`dto.dryRun === false` 先 commit)
- [x] **B5** `confirm` 只喺 commit 時檢查:`=== opcoCode` 或 `=== 'ALL'`,唔啱 → **400 + 零寫入**
- [x] **B6** `opcoCode` 未知 → **404**(絕不 fallback 去清晒)
- [x] **B7** 寫入 = 單一 `$transaction`:`updateMany({allocatedQuantity:0, assignedQuantity:0})` + `ledgerAdjustment.createMany`(**只為 `assigned > 0` 嗰啲**)+ 一行 `auditLog`。🔴 零 `delete`
      · **用 interactive transaction 而唔係 array 形式**:`beforeValue` 必須係「呢句 statement 真正覆蓋咗嘅值」,喺 tx 外先讀會令 audit 靜靜咁錯
- [x] **B8** `warning` **兩句**:中間態(ADR-0016)+ **assigned 冇回頭路**(ADR-0004 #5 ⇒ 要重跑 ADR-0014 script);第三句(inactive SKU)沿用 CH-016 §2.5,conditional
- [x] **B9** Audit action `LEDGER_FULL_RESET` + **欄位 allowlist 有加**(`['affected','scope','allocatedCells','assignedCells']`)
- [x] **B10** Controller `POST license/ledger/reset` + `@Roles(ADMIN)` + `@HttpCode(200)` + module wiring
- [x] **B11** 權限矩陣 snapshot 更新 — 讀 diff 確認**只加一行 `+`、零行 `-`**(`POST /license/ledger/reset → roles [ADMIN]`)
- [x] **B12**(spec 外,實作揭出)`actorId` 放寬做 `string | null` —— ops script 冇登入用戶,兩個 audit 目標本來就 nullable(跟 ADR-0014 先例)

## Implementation — Backend Test（H5)

- [x] **T1** 🔴 **零 delete** — `delete` / `deleteMany` 一次都冇 call
- [x] **T2** 兩個數字都變 0(`data` 精確 equal),而且只有 in-scope 嘅行變
- [x] **T3** 🔴 `LedgerAdjustment` 條數 = 原本 `assigned > 0` 嘅格數;`field==='assignedQuantity'` · `beforeValue` 對得返 · **allocated 唔產生 adjustment**
- [x] **T4** dry-run(default + 明示)零寫入、零 audit、零 adjustment、**零 `$transaction`**
- [x] **T5** `confirm` 三個 fail case(冇 / 打錯 / 單 OpCo 打咗 `ALL`)→ 400 + 零寫入
- [x] **T6** `opcoCode` 未知 → 404 + 零寫入
- [x] **T7** 已經 0/0 嘅 row 唔算入 `affected`(preview 同 write 用同一個 where —— 有 assert)
- [x] **T8** Audit 寫一行 + **欄位過到 ADR-0009 allowlist**(`pickAuditFields` 直驗,四個 key 都在)
- [x] **T9** `warning` 三段都驗(永遠嗰句 / assigned 嗰句帶 count / inactive 嗰句),同「冇 assigned 就唔多口」
- [x] **T10** 權限:REGIONAL → 403 · OPCO_IT → 403 · ADMIN → 200(由 `permissions.spec.ts` 矩陣 snapshot 守)
- [x] **T11** 🔴 **CH-016 既有 test 全綠**(22 條,佢個 service 冇被改)
- [x] **T12** `cd apps/api && npm test` — **746 passed / 64 suites**(CH-016 收官係 719)

## Implementation — Frontend

- [x] **F1** `useLedgerFullReset()` + `api-types.ts` 型別(commit 先 invalidate ledger,dry-run 唔 invalidate)
- [x] **F2** 既有 card 加 mode 二選一,**唔加第二個掣**;default = allocation only
- [x] **F3** 非 ADMIN → full 選項 disabled(`canFullResetLedger` + `useCurrentUser`;後端 403 為真 gate)
- [x] **F4** Card 文案隨 mode 變 — full mode **換走**「assignedQuantity is never touched」嗰句
- [x] **F5** Dialog(full)多 `Allocated` / `Assigned` 兩欄 + `assignedCells` warn 句
- [x] **F6** 打字確認 input:要打 `ALL` 或 OpCo code 先解鎖 commit 掣
- [x] **F7** Server `warning` 逐字 render(唔喺前端改寫)
- [x] **F8** Frontend test — **12 條新**(mode 打對 endpoint · 非 ADMIN disabled · confirm 解鎖 / near-miss 拒絕 / 帶落 commit / 唔問 allocation mode · 文案翻轉)
- [x] **F9** `cd apps/web && npm test` — **237 passed / 27 files**(CH-016 收官係 225)
- [x] **F10** `ui-design` 跑咗;**DS-2 命中一處已修**(`max-w-[280px]` 係 repo 唯一一個 280 → 改用既有 `240`,同旁邊 scope select 一致)。CH-016 F8 同一個坑,今次自檢即刻捉到
      · 其餘:DS-1 ✅ token-only · DS-3 ✅(browser 實測掣 class = `bg-danger-soft text-danger`,唔含 `bg-accent`)· DS-4 ✅ light+dark 都截圖 · DS-5/6/7/9/10 ✅ · DS-8/11/12 N/A

## Implementation — Ops script

- [x] **S1** `apps/api/prisma/reset-ledger.ts` — **直接 `new LedgerFullResetService(...)`**,零重複邏輯(ADR-0021 先例);`--confirm` **照樣要求**,唔喺 script 開後門
- [x] **S2** dry-run 真跑過(127 格,同 SQL / endpoint 三方一致);`npm run reset:ledger` 已註冊
      · 🔴 **`--env-file-if-exists=.env`**:script 唔喺 `src/**`,`ts-node` 唔會自己 load `.env` → 首次跑爆 `DATABASE_URL not found`。用 Node 22 內置 flag 解,**冇加 `dotenv` dependency**(H2)

## Verification

- [x] **V1** endpoint 載入;`/docs/api-json` 見到 `/license/ledger/reset` 同 CH-016 嗰個**並存**,body(`dryRun,opcoCode,confirm`)/ result(8 個欄)shape 正確
- [x] **V2** Live dry-run(全平台)→ `affected=127` · `assignedCells=127` · `allocatedCells=0`,**零寫入**(前後 `150 | 0 | 6049 | 10` 一模一樣)
- [x] **V3** Live commit(scope RTW)→ 4 格,`assignedBefore` 22+19+17+20 = **78**,同 SQL 嘅 RTW `sum_assigned=78` 對得上
- [x] **V4** 🔴 **前後對比(真 DB)**:`ledger_rows` 150→**150**(零 delete)· `sum_assigned` 6049→**5971**(精確 −78)· `LedgerAdjustment` 10→**14**(+4 = 被清嘅 assigned 格數,精確相等)· RTW 4 行**仍在**且全部 0/0 · 鄰居 RTMEAP **8/5/215 一格唔郁**
- [x] **V5** `confirm` 四個 reject case live curl:冇 confirm / 打 `all` / 單 OpCo 打 `ALL` → **400**;未知 OpCo → **404**;之後 DB 完全冇變
- [x] **V6** `AuditLog` 見到 `ledger.full_reset` / `LedgerFullReset` / `bulk`,`after` = `{"scope":"RTW","affected":4,"assignedCells":4,"allocatedCells":0}` —— **四個 key 一個都冇被 allowlist drop**
- [x] **V7** Full reset → 重新 import → `sum_alloc` 0→**41**(allocated 返晒)而 `sum_assigned` 仍然 **5971**(**assigned 一格都冇返**)⇒ ADR-0004 #5 invariant 實證,亦即 warning 第二句嘅真憑據。兩個 inactive SKU(`STANDARDPACK` / `VISIO_PLAN1`)連 allocation 都 import 唔到 ⇒ CH-016 §2.5 照樣成立
- [x] **V8** Browser(Playwright MCP)—— mode default `allocation` · 掣 class 冇 `bg-accent` · 切 full 後掣變 `Full reset…` 且「never touched」句**消失** · dialog 四欄 + RTMEAP 真數 · **placeholder 係 `RTMEAP` 唔係 `ALL`** · 打 `ALL` 仍 disabled、打 `RTMEAP` 解鎖 · server warning 逐字 · **light + dark 都截圖,dark 零爆** · 🔴 **全程零寫入**(收工 DB 仍 `150 | 41 | 5971 | 14`)
- [x] **V9** 收工已清 browser 留低嘅 repo root 污染(兩張 PNG + `.playwright-mcp/`),`git status` 只剩本 CH 嘅改動

## Cross-Cutting

- [x] Each commit references `progress.md` Day-N entry(R2)
- [x] Commit message 標對應 component tag
- [x] ADR-0022 **已寫且 Accepted**(H1);README index 已加行
- [x] 🔴 **`npm run lint`(repo root,CI 同一條)exit 0** —— 中途紅過一次(3 個 prettier),**push 前捉到並修**
- [x] Spec deviation(如有)→ §7 changelog(R3)
- [x] Pending changes synced to `BACKLOG.md`(R7)
- [x] `CLAUDE.md §0` + `SESSION_SUMMARY.md` 座標掃過(§14)
- [x] `progress.md` closeout summary written + status flipped

---

**Lifecycle reminder**:呢份 checklist 隨 spec acceptance criteria 衍生。新加 item 必須先入 spec + changelog,然後再加 checklist。
