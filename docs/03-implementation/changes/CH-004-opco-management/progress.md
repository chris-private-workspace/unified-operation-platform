---
change_id: CH-004
spec_ref: ./spec.md
checklist_ref: ./checklist.md
status: closed          # in-progress | closed
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
| d7ce956 | docs(planning): open CH-004 OpCo management（spec/checklist/progress） |

---

## Day 1 — 2026-07-16（後端 + 前端實作 + live 驗）

### Done
- **後端**（`apps/api/src/opco`）：新 `dto/opco.dto.ts`（`OpcoDto` rich + `CreateOpcoDto` + `UpdateOpcoDto`,code 不在 Update = immutable）+ `OpcoService`（`listForAdmin(includeInactive)` / `createOpco`[code 唯一 409] / `updateOpco`[404,`normalizeOptional` 空→null,只 set 允許欄]）+ 新 `OpcoAdminController`（`admin/opcos` GET?includeInactive/POST/PATCH,`@Roles(ADMIN,REGIONAL)`）+ wire module + `opco.service.spec` 8 test。
- **relocate（D1 後果）**：`user-admin.controller` 移除 `@Get('opcos')`、`UserAdminService.listOpcos` 移除、orphan `AdminOpcoDto` class 刪 + import 清理;路徑 `/admin/opcos` 不變（前端 hook 零改）。
- **前端**（`apps/web`）：`api-types`（`Opco`/`CreateOpcoBody`/`UpdateOpcoBody`,`AdminOpco` 保留 thin subset）+ `useManageOpcos`（queries）+ `useCreateOpco`/`useUpdateOpco`（mutations）+ 新 `opcos-panel.tsx`（Operating companies Card + Add/Edit `OpcoDialog`,code Edit 唯讀灰盒,active SegmentedControl,403 restricted）+ `settings.tsx` OpCos tab（Building2）+ `sidebar.tsx` Administration deep-link。

### Decisions（執行細節，全在 spec 拍板範圍內）
- **relocation 無 test 需移轉**：user-admin 從無 `listOpcos` 專屬 test（grep 證），故 relocate 零 test 搬遷,只新增 opco 8 test。
- **`AdminOpcoDto` 變 orphan → 刪**（relocate 後無 import）;新 `OpcoDto`（opco 模組）取代,domain 內聚。
- 前端 `AdminOpco` 保留 thin（picker `/opcos` 只回 3 欄,唔可謊報 rich）;另立 `Opco` rich 供面板。
- code immutability **雙層保證**：`UpdateOpcoDto` 無 code 欄 + 全域 whitelist ValidationPipe strip（live 證送 `HACKED` 無效）。

### Verify（真 tool output）
- api `npm run build` EXIT 0;`npm test` **213 passed**（205→213,+8）;eslint changed EXIT 0。
- web `npm run build` EXIT 0（tsc --noEmit clean + vite build）;`npm test` **85 passed**（不降）;eslint changed EXIT 0。
- **live curl（3100 watch,dev-bypass=ADMIN）**：GET rich active[200] · GET includeInactive[200] · POST 建立[201,code trim `  CH004-TEST  `→`CH004-TEST` / costCenter `   `→null / active 預設 true] · 重複 code[409] · 缺 company[400] · PATCH[200,code 送 `HACKED` 被 strip 仍 `CH004-TEST` **immutable** / displayName·costCenter 改] · 未知 id[404] · deactivate[200 → picker+active-list 濾走,includeInactive 見 active:false] · relocation GET `/admin/opcos` 200。
- **未做**：前端 Edit round-trip（web 5173 需登入,AI 唔輸密碼)+ light/dark live render → 待 Chris browser（build 過=結構渲染 OK,同 CH-003 pattern）。測試 opco `CH004-TEST` 依設計留 DB inactive（無 hard-delete）。

### Blockers
- 無。

### Commits
| Hash | Subject |
|---|---|
| 0651365 | feat(opco): CH-004 backend — admin/opcos CRUD endpoints + GET relocation |
| a9c9391 | feat(web): CH-004 OpCos settings tab + management panel |

---

## Closeout（2026-07-16，status=closed）

### Acceptance verification（對 spec.md §3）
- `GET /admin/opcos`（ADMIN+REGIONAL,rich + `?includeInactive`）✅ live 200;`POST` ✅ 201/409/400;`PATCH` ✅ 200(code immutable)/404 — 全 live curl 實證。
- AUTH-4b relocation ✅：`GET /admin/opcos` 路徑不變仍 200(active-only),user-admin `@Get('opcos')`/`listOpcos`/orphan `AdminOpcoDto` 已移除;**controllers-guarded.spec 綠**(guard 仍覆蓋)。
- deactivate（active=false）✅：picker `/opcos` + admin active-default 濾走,`?includeInactive` 見 active:false — soft,歷史保留。
- 前端 OpCos tab + panel ✅ build/85 test 綠、token-only;**Edit round-trip + light/dark 由 Chris browser 手測**（web 需登入,已重啟可即試;backend curl 已證後端）。
- api 205→**213**（+8）;web **85** 不降;兩邊 lint clean。

### Lessons
- **決策連鎖要即抓**：D1（ADMIN+REGIONAL）令 D4「GET 留 user-admin」失效（REGIONAL 需讀 rich list）→ 停低 surface 個 relocation 後果、更新 spec §2.4 ⚠️/§7/R6、拎 Chris final 確認先落 code,唔 silent drift（R3）。
- **immutable 雙層**：DTO 無 code 欄 + 全域 whitelist strip;live 送 `code:"HACKED"` 被 strip 實證,唔淨靠 DTO。
- **relocate 路徑不變 = 前端零改**：GET 由 user-admin 搬入 opco 模組但 `/admin/opcos` path + `['admin','opcos']` hook 不動,AUTH-4b 下拉零風險。
- **honest fidelity**：prototype dialog 用 `region`,但 schema 係 company/costCenter → 忠於資料模型（D2）,唔捏欄;唯讀誠實 code。

---

**End of CH-004 progress（Day 1 + closeout）**
