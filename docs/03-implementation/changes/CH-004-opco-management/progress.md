---
change_id: CH-004
spec_ref: ./spec.md
checklist_ref: ./checklist.md
status: in-progress      # in-progress | closed
---

# CH-004 — Progress

> Day-N entries during execution + 結尾 closeout summary。
> 每 commit 必須對應一個 Day-N entry mention（R2）。

---

## Day 0 — 2026-07-16（spec + H1 評估 + 決策點）

### Done
- Ground 現狀（code trace,唔靠記憶）：
  - **前端**：`router.tsx` 無 OpCo route;`settings.tsx` TABS = account/preferences/users/integrations(**缺 opcos**);`sidebar.tsx` Administration 只 users+integrations。
  - **後端**：OpCo 只 read —— `GET /opcos`(picker,`opco.controller.ts`)+ `GET /admin/opcos`(user-admin 下拉);grep `prisma.opco.create/update/delete` + `@Post/@Patch opco` = **no match**(零寫入)。
  - **Schema**：`model Opco` = code(@unique)/displayName/company/costCenter?/active + relations(ledger/requests/scopedUsers);**五欄全存在 → 無 schema 改**。23 OpCo 由 seed(code 拆 company+costCenter)。
  - **Prototype**：settings 有第 5 tab `['opcos','OpCos',Building2]`;Operating companies card + Add/Edit OpCo dialog(欄 code/name/region;`removeOpco` canRemove opcos.length>1)。
- 起草 `spec.md`（proposed）+ `checklist.md`。

### Decisions（H1 評估 — 見 spec §1.1）
- **CH-004 = Change,唔觸發 H1、無新 ADR**：無 schema 改(5 欄已存在);唔動 lock 決策(方案甲/skuId/ledger 兩層/stage line item/sync gate 全無關);additive 寫入面對稱 CH-003(license write)+ AUTH-4b(user write);無新 dep。
- **Deactivate ≠ hard-delete**：OpCo 被 ledger/requests/scopedUsers 引用 → 沿 AUTH-4b「never hard-delete」政策,只 active=false(非新決策)。
- **H3 scope**：OpCo 管理**不在** LicenseOps 排除清單;OpCo 係核心實體;prototype 設計咗 opcos tab → in-scope,屬 honest gap 非 scope creep。
### Chris 拍板（2026-07-16, AskUserQuestion）
- **D1 = ADMIN + REGIONAL**（偏離 draft 建議 ADMIN-only）
- **D2 = 忠於 schema**（displayName/company/costCenter,唔捏 region）
- **D3 = code immutable**（建立後不可改）
- **D4 = 新 OpcoAdminController**
- **D1 連鎖後果**：REGIONAL 需讀 rich opco 清單 → `GET /admin/opcos` 由 user-admin **relocate** 入 OpcoAdminController（路徑不變、role 放寬、DTO additive）;spec §2.4 ⚠️ + §7 changelog + R6 已記。

### Blockers
- **spec = proposed** → 全部 code item(B*/F*/V*) blocked。決策已拍板,**等 Chris 對「GET relocation 連鎖後果」final 確認 → flip approved 落 code**（PROCESS R1.change）。

### Commits
| Hash | Subject |
|---|---|
| _(next)_ | docs(planning): open CH-004 OpCo management（spec/checklist/progress） |

---

**End of CH-004 progress（Day 0）**
