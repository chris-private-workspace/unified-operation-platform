---
change_id: CH-003
title: "SKU Catalog 編輯 — alias / category / base-flag（PATCH endpoint + 前端 Edit dialog）"
status: done            # draft | proposed | approved | active | done | cancelled
created: 2026-07-16
target_completion: 2026-07-18
affects_components: [apps/api, apps/web]
spec_refs:
  - docs/02-architecture/licenseops/DESIGN.md §5（skuId 主鍵 / 人手 curation 欄）
  - docs/adr/0004-*（curation-as-scope）
  - docs/02-architecture/licenseops/DESIGN.md §10 open items（isBaseLicense 去留）
  - design_handoff_licenseops/prototype/full-console.html（SKU Catalog Edit 視覺）
---

# CH-003 — SKU Catalog 編輯（alias / category / base-flag）

> **Spec version**：1.0（initial）
> **Owner**：Chris（decision）/ AI（draft）
> **Approved by**：Chris（2026-07-16，含 §1.1 H1 評估 = Change 無新 ADR）

## 1. Context (Why)

CH-002 fidelity audit 期間 Chris 發現 `/catalog` 個 Edit 掣一直 **disabled**（`catalog.tsx:184`，title「Editing … lands in a later phase」）—— 係刻意留低嘅 honest gap。prototype 明確設計咗編輯（footer 註「Part number & skuId are system-owned. **Only alias, category and base-flag are editable**」）。本 change 補齊呢個功能:後端加一個 `PATCH /license/catalog/:id` 寫入端點 + 前端 Edit dialog。

## 1.1 H1 / ADR 評估（**第一手交代**）

**結論:CH-003 = Change,唔觸發 H1、唔需新 ADR。** 依據:
- **無 schema 改** —— `businessAlias` / `category` / `isBaseLicense` 三欄**已存在** `SkuCatalog`（`apps/api/prisma/schema.prisma`）。
- **編輯嘅係 display / mapping 欄,非 hard gate**:schema 註解本身寫 `isBaseLicense` =「UI default hint, **NOT a hard gate**」、`businessAlias` =「for mapping / reconciliation only」、`category` = asset-list 分組顯示。assign / ledger 兩層數字 / sync gate **唔依賴**呢三欄。
- **`skuId` 主鍵 + system-owned 欄不動**:endpoint **只**改上述 3 欄;`skuId` / `skuPartNumber` / `displayName` / `active` / `lastSyncedAt` 由 sync 擁有,唔可經此改（與 `catalog.service` sync「never overwrite curated cols / system cols」對稱）。

**兩點需 flag（非 blocker,記錄在案）:**
1. **`businessAlias` = ADR-0004 curation 欄**。手動編輯 = 將 curation 工作流 UI 化 —— **與** ADR-0004「curation-as-scope」**一致**（同一欄、同一用途,只是多一個 input 途徑,非新決策）。副作用:改 alias 會影響 allocation-import 對 Excel 標籤嘅匹配 —— 呢個正是 curation 嘅預期行為。
2. **`isBaseLicense` 屬 open question（DESIGN §10「isBaseLicense 去留」）**。因其為「UI hint, NOT a hard gate」,編輯低風險;若日後 OQ 決定移除該欄,本 endpoint 對應收窄即可。

> 若 Chris 認為 `businessAlias` 編輯需獨立 ADR 記錄 curation 的第二 input path,可要求 —— 預設判斷係唔需要（additive、與 ADR-0004 一致）。

## 2. Scope (What)

### 2.1 Behavior Change
- **Before**:`/catalog` Edit 掣 `disabled`;無任何 catalog 寫入 endpoint（除 sync）。
- **After**:Edit 掣可用 → dialog 編輯 alias / category / base-flag → `PATCH /license/catalog/:id` → 更新 + 前端 refresh。

### 2.2 In Scope

**後端（`apps/api/src/license`）:**
- `PATCH /license/catalog/:id`（`@Roles(ADMIN, REGIONAL)` —— curation 屬平台級,對齊 `catalog/sync`;**OPCO_IT 不可**）。
- `UpdateSkuCatalogDto`:`businessAlias?: string|null`、`category?: string|null`、`isBaseLicense?: boolean`（class-validator;alias/category trim + 長度上限;空字串 → null）。
- `CatalogService.updateEntry(id, dto)`:驗證 SKU 存在（404 else）;**只** set 呢 3 欄;回傳更新後 `SkuCatalogDto`。
- **H5 test**（`catalog.service.spec`）:成功更新 3 欄 / 404 unknown id / 只改 3 欄（system-owned 欄 not touched）/ 空字串→null 正規化。

**前端（`apps/web`）:**
- `catalog.tsx`:Edit 掣解禁 → 開 `EditSkuDialog`（沿用 handoff Dialog/Input/Select primitive）編輯 alias / category / base-flag。
- `useUpdateCatalog` mutation → `PATCH /license/catalog/:id` → `invalidateQueries(['license','catalog'])` + toast。
- system-owned 欄（part number / skuId / display name）dialog 內**唯讀顯示**（唔可改）。

### 2.3 Out of Scope（明確排除）
- 編輯 `skuId` / `skuPartNumber` / `displayName` / `active`（system-owned;displayName 之 curation gap 另議 —— 現 UI 契約只列 alias/category/base）。
- **By-OpCo 表按 category 分組**（問題 2b）—— 純前端,另開細 item;唔混入本 backend change。
- 新增 / 刪除 SKU（catalog 只由 tenant sync 增減,soft-deactivate,OD3 不變）。
- `businessAlias` 編輯**唔改** allocation-import / reconciliation 既有邏輯本身（只係令其 input 可經 UI 設定）。

## 3. Acceptance Criteria

> 驗收結果見 `progress.md` Closeout（2026-07-16）。live curl 於 3100 重啟後以 dev-bypass=ADMIN 實跑。

- [x] `PATCH /license/catalog/:id` 存在,`@Roles(ADMIN, REGIONAL)`;OPCO_IT 呼叫 → 403 —— endpoint live 200 ✅；**OPCO_IT 403 由 class `@Roles(ADMIN,REGIONAL)` guard config 保證,未 live 試**（需換 `AUTH_DEV_USER_EMAIL` env）
- [x] 只更新 alias / category / isBaseLicense;system-owned 欄（skuId/partNumber/displayName/active）**不受影響**（test 實證）—— unit test + live curl 雙證（skuId/DESKLESSPACK/Office 365 F3 不變）
- [x] unknown id → 404;空 alias/category 字串 → null;過長 → 400 —— 404 ✅ live、空→null ✅ test、400 ✅ live（非法型別；`MaxLength` 由 DTO 保證，過長未單獨 live 試）
- [x] `catalog.service.spec` 新增 test 全綠;`apps/api` 既有 test 不降 —— 201 → **205**（+4）
- [ ] 前端 Edit 掣可用 → dialog 改 3 欄 → save → 表即時反映 + toast;system-owned 欄唯讀 —— ⏳ **待 Chris browser 手測**（code 已 build 過＝結構渲染 OK，後端已由 curl 全證；AI 無法登入 web 故未親驗，H7 不虛報）
- [x] `cd apps/api && npm run build && npm test` 綠;`cd apps/web && npm run build && npm test` 綠;兩邊 lint clean（changed files）
- [x] 每行改動 trace 得返本 spec §2（§1.3 surgical）

## 4. Risks
| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | 改 `businessAlias` 影響 allocation-import 匹配（curation 副作用）| Med | Med | 屬 curation 預期行為;§1.1 已交代;dialog 顯示 alias 用途提示 |
| R2 | `isBaseLicense` OQ（§10）未定就開放編輯 | Low | Low | 該欄「NOT a hard gate」;OQ 若移除欄則收窄 endpoint |
| R3 | 新寫入端點缺 test → 迴歸風險 | Low | Med | H5:service spec 覆蓋更新 / 404 / immutable / 正規化 |
| R4 | 誤讓 OPCO_IT 改 curation | Low | Med | `@Roles(ADMIN, REGIONAL)`,對齊 sync;test 驗 403 |

## 5. Effort Estimate
約 1 日（後端 endpoint+DTO+service+test ~半日;前端 dialog+mutation ~半日）。

## 6. Dependencies
- 無新 vendor / dep（H2 不觸發）。無 schema migration（H1 不觸發）。
- 對齊既有 `@Patch('ledger/:id')`（W23-A）pattern。

## 7. Spec Changelog（deviation log）
| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-16 | Initial draft（status: proposed）+ H1/ADR 評估（= Change,無新 ADR）| CH-002 揭 catalog Edit honest gap;prototype 設計咗編輯 | — |

---

**Lifecycle reminder**：本 spec locked after status=approved。重大 deviation → §7 changelog。
**Gate reminder**：status = `proposed`，**待 Chris review + approve（含 §1.1 H1 評估認可）先 flip approved + 落 code**（PROCESS R1.change）。
