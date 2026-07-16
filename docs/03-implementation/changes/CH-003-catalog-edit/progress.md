---
change_id: CH-003
spec_ref: ./spec.md
checklist_ref: ./checklist.md
status: in-progress     # in-progress | closed
---

# CH-003 — Progress

> Day-N entries during execution + 結尾 closeout summary。
> 每 commit 必須對應一個 Day-N entry mention（R2）。

---

## Day 0 — 2026-07-16（spec + H1 評估）

### Done
- Ground 後端 catalog 現狀：`catalog.service.ts`（sync never overwrites curated cols）、`dto/catalog.dto.ts`、`license.controller.ts`（有 `@Patch('ledger/:id')` 先例）、`SkuCatalog` schema（3 欄已存在）。
- 起草 `spec.md`（proposed）+ `checklist.md`。

### Decisions（H1 評估 — 見 spec §1.1）
- **CH-003 = Change,唔觸發 H1、無新 ADR**：無 schema 改（3 欄已存在）；編輯欄為 display/mapping 非 hard gate；system-owned 欄不動。
- **`businessAlias` 編輯 = ADR-0004 curation 的 UI 化,與其一致**（additive input，非新決策）；副作用（影響 allocation-import 匹配）屬 curation 預期。
- **`isBaseLicense` 屬 OQ §10**；因「NOT a hard gate」低風險，本 change 不 resolve OQ，只依賴。
- Role gate = `@Roles(ADMIN, REGIONAL)`（對齊 catalog/sync；OPCO_IT 不可 curate）。
- 2b（By-OpCo category 分組）不入本 change（純前端，另列 BACKLOG）。

### Blockers
- Chris pre-approved「同意 CH-003 spec, 可以開始執行」→ 落 code；spec flip approved。

### Commits
| Hash | Subject |
|---|---|
| _(next)_ | docs(planning): open CH-003 catalog edit（spec/checklist/progress） |

---

## Closeout（填於 status=closed）

### Acceptance verification
_(待實作後填 — 對 spec.md §3)_

### Lessons
- _(待填)_

---

**End of CH-003 progress**
