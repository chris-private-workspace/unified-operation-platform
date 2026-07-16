---
change_id: CH-004
title: "OpCo 管理 — Add / Edit Operating Company（create/update endpoint + 前端 settings › OpCos tab + dialog）"
status: approved          # draft | proposed | approved | active | done | cancelled
created: 2026-07-16
target_completion: 2026-07-18
affects_components: [apps/api, apps/web]
spec_refs:
  - docs/02-architecture/licenseops/DESIGN.md（OpCo = 核心實體；ledger / request / user scope 皆掛 OpCo）
  - apps/api/prisma/schema.prisma（model Opco — code/displayName/company/costCenter/active）
  - design_handoff_licenseops/prototype/full-console.html（settings › OpCos tab：Operating companies + Add/Edit OpCo dialog）
  - docs/03-implementation/changes/CH-003-catalog-edit/spec.md（同型 write-surface Change 先例）
---

# CH-004 — OpCo 管理（Add / Edit Operating Company）

> **Spec version**：1.0（initial）
> **Owner**：Chris（decision）/ AI（draft）
> **Approved by**：Chris（2026-07-16，含 §1.1 H1 評估 + §2.4 D1–D4 拍板 + D1 GET-relocation 連鎖後果 final 確認）

## 1. Context (Why)

Chris 手測發現左側 sidemenu 冇「OpCo 設定」入口。查證結論（code trace）：**唔係 sidemenu 收埋,而係整個功能未實作** ——
- **前端**：`router.tsx` 無 OpCo route；`settings.tsx` `TABS` 只得 `account/preferences/users/integrations`（**少咗 prototype 設計嘅 `opcos` tab**）。
- **後端**：OpCo 只得兩個 **read-only** endpoint（`GET /opcos` picker、`GET /admin/opcos` user-admin 下拉）；**無任何 create/update/deactivate 寫入端點**。23 個 OpCo 全部由 seed 嚟。
- **Prototype 其實設計咗**：settings 第 4 個 tab = `['opcos','OpCos', Building2 icon]`,內含「Operating companies」card（subtitle「{{opcoCount}} OpCos · shared tenant. Added OpCos appear across License Assets automatically.」）+ **Add OpCo / Edit OpCo** dialog（`openAddOpco` / `openEditOpco`,`removeOpco` with `canRemove: opcos.length>1`）。

本 change 補齊呢個 honest gap（原 CH-002 audit C 組列為「OpCos CRUD tab」carry-over）：後端加 `POST /admin/opcos` + `PATCH /admin/opcos/:id` 寫入端點,前端補 settings `opcos` tab + Add/Edit dialog。

## 1.1 H1 / ADR 評估（**第一手交代**）

**結論：CH-004 = Change,唔觸發 H1、唔需新 ADR。** 依據：
- **無 schema 改** —— `Opco` model（`apps/api/prisma/schema.prisma`）嘅 `code`（@unique）/ `displayName` / `company` / `costCenter?` / `active` **五欄全部已存在**。本 change 只加 endpoint / service / DTO,唔改 schema、唔 migration。
- **唔動任何 lock 決策** —— reconciliation 方案甲、`skuId` 主鍵、ledger 兩層數字（allocated/assigned）、stage 掛 line item、`azureSyncedAt` sync gate **全部無關**。OpCo 之增減與呢啲正交。
- **無 module 邊界 / 四層地基改動** —— 純粹喺既有 `opco` 領域模組加寫入面,pattern 對稱 CH-003（license 模組加 catalog write）+ AUTH-4b（auth 模組加 user write）。additive,非 boundary change。
- **無新 vendor / dependency**（H2 不觸發）。

**三點需 flag（非 blocker,記錄在案 — 部分屬設計決策,見 §2.4）：**
1. **Deactivate ≠ hard-delete**：`Opco` 被 `ledger` / `requests` / `scopedUsers` 引用。沿用 AUTH-4b UserAdminService 明文政策「never hard-delete,`active=false` 代替」—— OpCo 亦**只 deactivate,唔硬刪**。與既有 D-c 政策一致,**非新決策**。
2. **Fidelity↔資料模型落差**：prototype dialog 用 `code/name/region` 三欄,但真 schema 係 `code/displayName/company/costCenter`(**冇 `region`**)。本 spec 選 **忠於資料模型**(Prisma schema = domain 真相,CLAUDE §2),dialog 出 `displayName/company/costCenter`,唔捏造 `region`。屬**設計決策,需 Chris review 拍板**(§2.4 D2),非架構。
3. **`code` 編輯性**：prototype 允許 rename(`origCode`)。本 spec 建議 **code 建立後不可改**(stable business key,SN/n8n 對外以 code 認 OpCo;relations 內部 key 於 `id` 故 DB 安全,但外部引用 + @unique + 人手識別碼 傾向不可變 —— 同 CH-003 `skuId` immutable 精神一致)。屬設計決策(§2.4 D3)。

> 若 Chris 認為以上任一需獨立 ADR,可要求 —— 預設判斷係唔需要(additive、無 schema、與既有 CH-003 / AUTH-4b 政策同型)。

## 2. Scope (What)

### 2.1 Behavior Change
- **Before**：無 OpCo 寫入端點；settings 無 `opcos` tab；OpCo 只能由 seed 增減。
- **After**：ADMIN 可經 settings › **OpCos** tab 新增 OpCo（Add OpCo dialog）/ 編輯既有 OpCo（Edit dialog：displayName/company/costCenter/active）→ 打 `POST` / `PATCH /admin/opcos` → 更新 + 前端 refresh；新 OpCo 自動出現喺 License Assets（既有 by-opco / picker 讀 active OpCo）。

### 2.2 In Scope

**後端（`apps/api/src/opco`）：** 全部 **`@Roles(ADMIN, REGIONAL)`**（D1；OPCO_IT **不可**）。
- 新 `OpcoAdminController`（`@Controller('admin/opcos')`, `@Roles(ADMIN, REGIONAL)`）承載三個 endpoint：
  - `GET /admin/opcos`：rich 清單（id/code/displayName/company/costCenter/active）;`?includeInactive`（預設 false = active-only,供 user-scope 下拉;OpCos 管理面板傳 true 睇/重啟 inactive）。
  - `POST /admin/opcos`：新建。
  - `PATCH /admin/opcos/:id`：編輯。
- **relocate（D1 連鎖後果,§2.4 D4）**：既有 `GET /admin/opcos`（現喺 `user-admin.controller`, `@Roles(ADMIN)`, 回 thin id/code/displayName）**搬入本 controller** —— **路徑不變**（前端 `['admin','opcos']` hook 零改）,只後端擁有權移動 + role 放寬至 REGIONAL + DTO 加 company/costCenter/active。`UserAdminService.listOpcos` 移去 `OpcoService`;user-admin.controller 移除 `@Get('opcos')`。
- `CreateOpcoDto`：`code`（必填,trim,長度上限,非空）、`displayName`（必填）、`company`（必填）、`costCenter?`（可選,空→null）、`active?`（預設 true）。class-validator。
- `UpdateOpcoDto`：`displayName?` / `company?` / `costCenter?` / `active?`（全可選；**`code` 不在其中 = immutable,D3**）。
- `OpcoService.createOpco(dto)`：code 唯一性檢查（已存在 → **409 Conflict**）；建立；回傳。
- `OpcoService.updateOpco(id, dto)`：驗證存在（404 else）；只 set 允許欄（`normalizeOptional` 空→null）；回傳。
- **回應 DTO**：擴充 `AdminOpcoDto`（現只 id/code/displayName）**additive** 加 `company` / `costCenter` / `active`（既有 AUTH-4b user 下拉忽略多出欄,不受影響）。
- **H5-style test**（`opco.service.spec.ts`）：list（active-only / includeInactive）/ create 成功（全欄）/ create 重複 code → 409 / create trim + costCenter 空→null / update 成功 / update 404 / update **不改 code**（immutable 實證）/ deactivate（active=false）。**AUTH-4b relocation regression**：user-admin 既有 opcos test 移轉後不降。

**前端（`apps/web`）：**
- `settings.tsx` `TABS`：加 `{ value:'opcos', label:'OpCos', Icon: Building2 }`（沿 users tab 同款做法：tab 常駐,panel 對 403 graceful degrade）。
- 新 `components/settings/opcos-panel.tsx`：「Operating companies」Card（list + subtitle count）+ 一個 primary「Add OpCo」→ `OpcoDialog`（Add/Edit；沿用 handoff Dialog/Input/Button primitive；`code` 於 Edit 唯讀灰盒；active 用 SegmentedControl 或 Checkbox）+ toast。
- `useCreateOpco` / `useUpdateOpco` mutation（`hooks/mutations`）+ `OpcoBody` types（`api-types`）→ invalidate `['admin','opcos']`（+ picker `['opcos']` / `['license','ledger']` 令新 OpCo 即現 Assets）。
- Sidebar Administration section 加 deep-link `Operating companies → /settings?tab=opcos`（對齊 prototype；沿 users/integrations 同款,`canSeeAdminNav` gate）。

### 2.3 Out of Scope（明確排除）
- **Hard delete OpCo**（只 `active=false` deactivate；prototype `removeOpco` → 映射為 deactivate,非硬刪）。
- **改 `code`**（建立後不可變 — §2.4 D3；外部 SN/n8n business key）。
- **`region` 欄**（資料模型無此欄 — §2.4 D2，改用 company/costCenter）。
- **OpCo-level 預算 / 成本金額**（H3：成本 → DocuWare,平台只記 quoteRef/poRef）。
- **Deactivate 時重新分配 / 清理 ledger / requests**（soft-deactivate 保留歷史列,既有 active-only 讀取自然濾走）。
- **批次匯入 OpCo**（單筆 Add/Edit only）。

### 2.4 決策點（**Chris 已拍板 2026-07-16**）
| # | 決策 | 拍板 | 備註 |
|---|---|---|---|
| D1 | Role gate | ✅ **`@Roles(ADMIN, REGIONAL)`** | 偏離 draft 建議（ADMIN-only）;連鎖後果見下 ⚠️ |
| D2 | Dialog 欄位（fidelity↔schema）| ✅ **忠於 schema**：`displayName / company / costCenter`（唔捏 `region`）| — |
| D3 | `code` 編輯性 | ✅ **建立後 immutable**（穩定 business key,Edit 唯讀灰盒）| — |
| D4 | 控制器擺位 | ✅ **新 `OpcoAdminController`**（opco 模組）| 因 D1,GET 亦搬入本 controller ⚠️ |
| D5 | Remove/deactivate UI | Edit dialog 內 active toggle（default,未特別 flag）| 可 review 時再調 |

> ⚠️ **D1 連鎖後果（flag,§7 changelog）**：D1 放寬至 REGIONAL 後,REGIONAL 亦需**讀** rich OpCo 清單先填到管理面板,但既有 `GET /admin/opcos`（user-admin）係 ADMIN-only。故 D4「GET 留 user-admin 不動」與 D1 相衝 → 決議把 `GET /admin/opcos` **一併搬入 `OpcoAdminController`**（路徑不變、前端 hook 零改,只後端擁有權移動 + role 放寬 + DTO additive）。此為 D1 的必然結果,非額外 scope。

## 3. Acceptance Criteria
- [ ] `GET /admin/opcos`（`@Roles(ADMIN, REGIONAL)`）回 rich 清單;`?includeInactive` 預設 false（active-only）、true 見 inactive;OPCO_IT → 403
- [ ] `POST /admin/opcos`（`@Roles(ADMIN, REGIONAL)`）建立成功;OPCO_IT → 403;重複 code → 409
- [ ] `PATCH /admin/opcos/:id`（`@Roles(ADMIN, REGIONAL)`）只改 displayName/company/costCenter/active;`code` 不受影響（test 實證）;unknown id → 404
- [ ] AUTH-4b relocation：user-admin `@Get('opcos')` 移除後 user-scope 下拉仍 work（同路徑）;既有 test 移轉不降
- [ ] 空 costCenter 字串 → null;過長 → 400;缺必填（code/displayName/company）→ 400
- [ ] deactivate（active=false）成功,OpCo 從 active 讀取（picker / by-opco）消失,歷史列保留
- [ ] `opco.service.spec` 新增 test 全綠;`apps/api` 既有 test 不降
- [ ] 前端 settings 出現 OpCos tab → Add OpCo 建立 → 表即時反映 + toast;Edit 改欄 → 反映;`code` 於 Edit 唯讀
- [ ] `cd apps/api && npm run build && npm test` 綠;`cd apps/web && npm run build && npm test` 綠;兩邊 lint clean（changed files）
- [ ] `ui-design` 自檢：token-only、一 view 一 primary（Add OpCo / dialog Save）、lucide Building2、light+dark
- [ ] 每行改動 trace 得返本 spec §2（§1.3 surgical）

## 4. Risks
| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | deactivate 有 active ledger/requests 嘅 OpCo → 孤兒感 | Med | Low | soft（active=false）,歷史列保留,active-only 讀取自然濾走;§2.3 明確不 cascade |
| R2 | 新 code 與外部 SN/n8n OpCo 身份不符 | Low | Med | code 為 admin 自由輸入,409 擋重複;對外合約 deploy-time 對齊 |
| R3 | 新寫入端點缺 test → 迴歸 | Low | Med | §2.2 H5 service spec 覆蓋 create/409/update/404/immutable/deactivate |
| R4 | fidelity 偏離 prototype（region→company/costCenter）| Low | Low | schema = domain 真相;D2 flag 待 Chris 拍板 |
| R5 | 擴充共用 `AdminOpcoDto` 影響 AUTH-4b | Low | Low | 只 additive 加 optional 欄,既有下拉忽略多出欄 |
| R6 | GET relocation（D1 後果）動到 AUTH-4b user-admin | Low | Med | **路徑不變**（前端零改）;移動後 user-admin opcos test 移轉 + user-scope 下拉 live 驗;role 放寬僅令 REGIONAL 可讀 opco list（非新 leak,REGIONAL 本已可讀 `GET /opcos` picker）|

## 5. Effort Estimate
約 1 日（後端 endpoint+DTO+service+test ~半日;前端 tab+panel+dialog+mutation ~半日）—— 同 CH-003 量級。

## 6. Dependencies
- 無新 vendor / dep（H2 不觸發）。無 schema migration（H1 不觸發）。
- 對齊既有 `@Patch('catalog/:id')`（CH-003）+ AUTH-4b admin CRUD pattern。

## 7. Spec Changelog（deviation log）
| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-16 | Initial draft（status: proposed）+ H1/ADR 評估（= Change,無新 ADR）+ §2.4 決策點 | Chris 揭 settings 無 OpCo 管理入口;prototype 設計咗 opcos tab（CH-002 audit C 組 carry-over）| — |
| 2026-07-16 | §2.4 D1–D4 拍板（D1=ADMIN+REGIONAL / D2=忠 schema / D3=code immutable / D4=新 OpcoAdminController）| Chris review（AskUserQuestion）| Chris |
| 2026-07-16 | **D1 連鎖後果**：`GET /admin/opcos` 由 user-admin **relocate** 入 OpcoAdminController（路徑不變、role 放寬 ADMIN+REGIONAL、DTO additive）—— 因 REGIONAL 需讀 rich opco 清單填面板,不能停留 ADMIN-only GET | D1=ADMIN+REGIONAL 的必然結果 | Chris（待 final 確認）|

---

**Lifecycle reminder**：本 spec locked after status=approved。重大 deviation → §7 changelog。
**Gate reminder**：status = `proposed`，**待 Chris review + approve（含 §1.1 H1 評估 + §2.4 決策點認可）先 flip approved + 落 code**（PROCESS R1.change）。
