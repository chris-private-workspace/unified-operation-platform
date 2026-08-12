---
change_id: CH-025
spec_ref: ./spec.md
status: done            # in-progress | done
last_updated: 2026-08-12
---

# CH-025 — Checklist

> 由 `spec.md §3` acceptance 衍生。唔可以 tick 嘅喺 `progress.md` 寫原因(唔可以刪)。

## A — Stepper 收得晒

- [x] **A-1** `lib/requests.ts` 新 `displayStepsFor(item): string[]` = `[...stepsFor(item), 'Completed']`
- [x] **A-2** 新 `displayStepIndex(item): number` —— `ASSIGNED` → **最後一個**(即 `Step 4/4` 而唔係 3/4);其餘 = `stepsFor` 入面嘅位置
- [x] **A-3** 🔴 `stepsFor()` / `nextStage()` **一行唔改**(呢個係整單嘢嘅安全繩)
- [x] **A-4** `Stepper` 支援「終結」:current 落喺最後一個 step 時 render lucide `Check`,唔出空心 dot + ring
- [x] **A-5** `request-detail.tsx` 改用 `displayStepsFor` / `displayStepIndex`
- [x] **A-6** unit test:short 4 dots / procurement 7 dots / `READY` 仍然係第 2 個位(⚠️ **分母跟住變 4** —— 見 spec §3 A3 更正)/ cancelled → -1 / **`nextStage(ASSIGNED) === null`**
- [x] **A-7** grep 全部 `Stepper` caller,確認新行為只喺「current = 最後一個」先觸發

## B — Category 文案

- [x] **B-1** `catalog.tsx` Edit dialog:placeholder 去走逗號,改單一值
- [x] **B-2** 加一句 hint:一個 SKU 一個 category
- [x] **B-3** 🔴 查 CSV import 路(`catalog-import.tsx` / `catalog-export` / template)有冇同款逗號暗示 —— 有就改,**冇就喺 progress 明文寫「查過,冇」**

## C — 完成之後唔可以再加 line

- [x] **C-1** 後端 `addLineItem`:查 line items → `aggregateRequestStatus` → `COMPLETED` 就 `ConflictException`
- [x] **C-2** 🔴 **唔用 persisted `request.status`**,重算(R2)
- [x] **C-3** 前端 `canAddLine` 加 `&& !allLinesAssigned(req)`
- [x] **C-4** 🔴 掣**收起唔係 disable**(同 CH-024 A 一致)
- [x] **C-5** 後端 test ×3:完成 → 409 兼 **DB 零改動** / 未完成 → 照加得 / **全 `CANCELLED` 唔算完成**(C3)
- [x] **C-6** 前端 test:完成 → 冇掣;未完成 → 有掣

## Verification

- [x] **V-1** `npm test -w @uop/api`
- [x] **V-2** `npm test -w @uop/web`(pre-existing 6 條紅唔計)
- [x] **V-3** api lint exit 0 · web tsc exit 0 · 本單掂到嘅 web 檔逐個 lint
- [x] **V-4** 🔴 **Falsification ×2**:拆走 C 個後端 guard ⇒ C-5 第一條必須**真紅**;把 `displayStepsFor` 直接塞返 `stepsFor` ⇒ A-6 個 `nextStage` 條必須**真紅**
- [x] **V-5** `ui-design` skill 自檢
- [x] **V-6** 🔴 **light + dark 真 render**:request detail 完成態(4 dots + ✓ + 冇 Add 掣)· SKU Catalog edit dialog
  - ⚠️ 起 stack 前記住 §9 新加嗰段:**5433 揸唔穩**,`ai-doc-extraction-db` 會自己返嚟搶 port

## Cross-Cutting

- [x] Commit 對應 `progress.md` Day-N(R2)
- [x] **零 ADR 預期**(無 schema / 無契約 / 無 vendor)
- [x] `BACKLOG.md` 同步(R7)
- [x] `progress.md` closeout + 兩個檔 frontmatter → `done`

---

**Lifecycle reminder**:新加 item 先入 spec + §7 changelog,再落呢度。
