---
change_id: CH-016
spec_ref: ./spec.md
status: in-progress     # in-progress | done
last_updated: 2026-08-02
---

# CH-016 — Checklist

> Atomic checkbox items derived from `spec.md §3` acceptance criteria。每 item ≤ 1-2h effort。
> AI tick 完成嘅 item;唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。

## Implementation — Backend

- [x] **B1** `dto/allocation-reset.dto.ts` — request + result + Swagger
- [x] **B2** `AllocationResetService.reset()` — 寫入只有一句 `updateMany({ data: { allocatedQuantity: 0 } })`,零 delete,`assignedQuantity` 喺任何 write path 都冇出現過
- [x] **B3** `dryRun` default = true(`dto.dryRun === false` 先 commit,同 import 一致)
- [x] **B4** `warning` 講中間態 + 明寫 `assignedQuantity` 冇郁
- [x] **B5** Audit `ALLOCATION_RESET` / `AllocationReset` / `bulk`,同一 `$transaction`;**欄位 allowlist 有加**(`['affected','scope']`)
- [x] **B6** Controller `POST license/ledger/allocation/reset` + `@Roles(ADMIN, REGIONAL)` + module wiring
- [x] **B7** `@HttpCode(200)` — CH-015 就係喺呢度食過 201,今次一開始就落
- [x] **B8**(spec §2.5,live 揭出)`skuActive` per row + `irreversible` 計數 + warning 追加句

## Implementation — Backend Test（H5)

- [x] **T1** 寫 `allocatedQuantity` 而且**只有佢**(明文 assert `assignedQuantity` 唔喺 keys 入面)
- [x] **T2** `delete` / `deleteMany` 一次都冇 call
- [x] **T3** dry-run(default + 明示)零寫入、零 audit
- [x] **T4** commit 正確 + `rows[]` / `affected` 對得上
- [x] **T5** `opcoCode` filter 只掂嗰個 OpCo;**未知 code → 404 而唔係 fallback 去清晒**
- [x] **T6** 已經係 0 嘅 row 唔算入 `affected`(preview 同 write 用同一個 where —— 有 assert)
- [x] **T7** Audit 寫一行 + **欄位過到 ADR-0009 allowlist**(直接 call `pickAuditFields` 驗,唔靠信任)
- [x] **T8** §2.5:`irreversible` 計數 · row flag · **照樣 reset(where 冇 `active` 條件)** · warning 追加句 · 全 active 時唔多口
- [x] **T9** `cd apps/api && npm test` — **719 passed / 63 suites**
- [x] **T10** 權限矩陣 snapshot:讀 diff 確認**只加一行 `+`、零行 `-`**(roles `[ADMIN,REGIONAL]`)先更新

## Implementation — Frontend

- [x] **F1** `useAllocationReset()` + `api-types.ts` 型別(commit 先 invalidate ledger,dry-run 唔 invalidate)
- [x] **F2** `AllocationResetCard` — `danger` variant,**冇 primary**(H6)
- [x] **F3** dry-run 先 → Dialog confirm 列 `affected` + 頭幾行 → 確認先真跑
- [x] **F4** 完成後帶 warning + 「去 Import」指引;`affected: 0` 唔開 Dialog,直接講「已經全部係 0」
- [x] **F5** §2.5:逐行 ⚠️ inactive 標記 + 表上一句 warn 色說明
- [x] **F6** Frontend test — **12 條**(sequence / 文案 verbatim / cancel 唔寫 / scope / inactive 標示)
- [x] **F7** `cd apps/web && npm test` — **225 passed / 27 files**
- [x] **F8** `ui-design` 跑咗;**DS-2 命中兩處已修**(Dialog 520→460 · select `w-[220px]`→`max-w-[240px]`,兩者都改用既有值)

## Verification

- [x] **V1** endpoint 載入,三態 shape 正確
- [x] **V2** Live dry-run(150 格)→ `affected` 正確,**零寫入**
- [x] **V3** Live commit(scope RTW)→ 4 格歸 0
- [x] **V4** 🔴 **前後對比(真 DB)**:`assigned_sum` 6049→**6049** · `ledger_rows` 150→**150** · `LedgerAdjustment` 8→**8** · `allocated_sum` 10373→**10262**(精確 −111)
- [x] **V5** 鄰居 OpCo(RTMEAP)一格都冇郁
- [x] **V6** `AuditLog` 見到 `allocation.reset` / `{"scope":"RTW","affected":4}` —— 欄位**冇被 allowlist drop**
- [x] **V7** Reset → import 回頭路:**active SKU 全還原;inactive 嗰兩格還原唔到** ⇒ 呢個就係 §2.5 嘅來源
- [x] **V8**(§2.5 閉環)同一批真數據重驗:`irreversible: 2`,認出嘅正正係 import 救唔返嗰兩格
- [x] **V9** dev DB 已復原(`allocated_sum` 返 10373;`adjustments` 8→10 = 兩次人手 PATCH,ADR-0007 正常紀錄)
- [ ] ❌ **V10 Browser 實際行一次(dry-run → Dialog → 真跑 → inactive 標示)+ light/dark — 未驗證**
      `claude-in-chrome` extension 連唔上(同 CH-015、同 memory `ui-verification-route` 一致),本 session 冇 Playwright MCP。**唔當佢過(H7)。**
      替代證據:12 條 component test 係真 render + 真 assert;所有 API 行為已用真 DB 前後對比證實。**未證嘅淨係實際 render 觀感。**

## Cross-Cutting

- [x] Each commit references `progress.md` Day-N entry(R2)
- [x] Commit message 標對應 component tag
- [x] ADR:**唔觸發 H1** —— 只寫 `allocatedQuantity` = 遵守 ADR-0004 invariant。實作全程冇出現要掂 `assignedQuantity` 或刪 row 嘅情況
- [x] 🔴 **`npm run lint`(CI 同一條命令)exit 0** —— 中途紅過一次(兩個 prettier 格式),**喺 push 前捉到並修**,冇再重演 CH-015
- [x] **R3 deviation 已 log** — §2.5 係 live 驗證揭出,spec §7 changelog 有記,唔係 silent drift
- [ ] Pending changes synced to `BACKLOG.md`(R7)
- [ ] `CLAUDE.md §0` + `SESSION_SUMMARY.md` 座標掃過(§14)
- [ ] `progress.md` closeout summary written + status flipped

---

**Lifecycle reminder**:呢份 checklist 隨 spec acceptance criteria 衍生。新加 item 必須先入 spec + changelog,然後再加 checklist。
