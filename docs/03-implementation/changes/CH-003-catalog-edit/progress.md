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

## Day 1 — 2026-07-16（後端 + 前端實作）

### Done
- **後端**（`apps/api/src/license`）：`UpdateSkuCatalogDto`（IsOptional/IsString/IsBoolean/MaxLength）+ `CatalogService.updateEntry`（404 gate + `normalizeOptional` 空→null + 只 set 3 curated 欄）+ `PATCH /license/catalog/:id`（繼承 class `@Roles(ADMIN,REGIONAL)`）+ `catalog.service.spec` 4 test。
- **前端**（`apps/web`）：`UpdateCatalogBody`（api-types）+ `useUpdateCatalog`（invalidate `['license','catalog']`）+ `catalog.tsx` Edit 掣解禁 → `EditSkuDialog`（alias/category/base 可改，system-owned display/part/skuId 唯讀灰盒，SegmentedControl Base/Add-on）+ toast。

### Decisions
- `normalizeOptional`（trim；空→null）令「清空 alias/category」有明確語意。
- Edit 掣由 `disabled` → `onClick={setEditing(s)}`；page footer 註「Only alias/category/base editable」保持準確。
- 唯讀身份用灰盒（`bg-hover`）呈現，重用 CH-002 A1/A2 同款 token。

### Verify（真 tool output）
- api `npm run build` EXIT 0；`npm test` **205 passed**（201→205，+4 updateEntry）；eslint changed files EXIT=0。
- web `npm run build` EXIT 0；`npm test` **85 passed**（不降）；eslint changed files EXIT=0。
- **未做**：live curl / 前端 round-trip —— 用戶 3100 backend 當前 down（curl HTTP 000）；service 邏輯已由 unit test 覆蓋，HTTP 層（route/guard/DTO validation/實際 update）待 server up 或前端 Edit round-trip 驗。

### Blockers
- 無阻塞。

### Live curl 驗證（重啟 3100 後補完，dev-bypass=ADMIN）
- PATCH edit → **200**：`businessAlias` `"  CH003 TEST  "`→`"CH003 TEST"`（trim）、`category`/`isBaseLicense` 更新；`skuId`/`skuPartNumber`(DESKLESSPACK)/`displayName`(Office 365 F3) **不變**（immutable ✅）。
- unknown id → **404**「SKU catalog entry … not found」。
- 非法型別 `isBaseLicense:"nope"` → **400**「must be a boolean value」（DTO 驗證 ✅）。
- restore → **200**，GET 確認回復 `F3 Frontline / Base / true`（DB 無殘留）。
- OPCO_IT 403 由 `@Roles(ADMIN,REGIONAL)` guard 保證（未 live，需換 env）；前端 Edit round-trip 待 browser 手測。

### Commits
| Hash | Subject |
|---|---|
| _(next)_ | feat(license): CH-003 catalog edit — PATCH endpoint + Edit dialog |

---

## Closeout（填於 status=closed）

### Acceptance verification
_(待實作後填 — 對 spec.md §3)_

### Lessons
- _(待填)_

---

**End of CH-003 progress**
