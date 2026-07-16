---
change_id: CH-004
spec_ref: ./spec.md
status: in-progress      # in-progress | done
last_updated: 2026-07-16
---

# CH-004 — Checklist

> Atomic items 衍生自 `spec.md §3` acceptance。每 item ≤ 1–2h。
> **Gate**：spec status = `approved`（待 Chris review + approve 含 §1.1 + §2.4）→ 先可落 code。**目前 spec = proposed,以下 code item 全部 blocked。**

## Planning（可即做）

- [x] P1 `spec.md`（proposed）+ H1/ADR 評估（§1.1）+ §2.4 決策點
- [x] P2 `checklist.md` + `progress.md`（Day 0）
- [x] P3 Chris review：approve spec + 拍板 §2.4 D1–D4（D1=ADMIN+REGIONAL/D2=忠 schema/D3=code immutable/D4=新 controller）+ GET-relocation 連鎖後果 final 確認 → spec flip `approved`

## Implementation — 後端（apps/api/src/opco）〔blocked until P3〕（全 `@Roles(ADMIN, REGIONAL)` — D1）

- [ ] B1 `CreateOpcoDto` + `UpdateOpcoDto`（`dto/opco.dto.ts`）：class-validator（code/displayName/company 必填,costCenter?/active? 可選;空→null 在 service;code 不在 Update DTO — D3）
- [ ] B2 擴充 `AdminOpcoDto`（additive）加 `company` / `costCenter` / `active`
- [ ] B3 `OpcoService`：`listForAdmin(includeInactive)`（由 user-admin `listOpcos` 移入,active-only default）+ `createOpco`（code 唯一 → 409）+ `updateOpco`（404 gate,`normalizeOptional` 空→null,code immutable）
- [ ] B4 新 `OpcoAdminController`（`@Controller('admin/opcos')`, `@Roles(ADMIN, REGIONAL)`）：`@Get()`(?includeInactive) + `@Post()` + `@Patch(':id')` + `@ApiOkResponse`;wire 入 opco module
- [ ] B5 **relocate**（D1 後果）：`user-admin.controller` 移除 `@Get('opcos')`、`UserAdminService` 移除 `listOpcos`（+ import 清理）;路徑 `/admin/opcos` 不變
- [ ] B6 H5 test（`opco.service.spec.ts`）：list active-only / includeInactive / create 全欄 / create 重複 code 409 / trim + costCenter 空→null / update 成功 / update 404 / update 不改 code / deactivate;**AUTH-4b**：user-admin 既有 opcos test 移轉不降

## Implementation — 前端（apps/web）〔blocked until P3〕

- [ ] F1 `OpcoBody`（api-types）+ `useCreateOpco` / `useUpdateOpco`（`hooks/mutations`）→ POST/PATCH `/admin/opcos` + invalidate `['admin','opcos']`(+`['opcos']`/`['license','ledger']`)
- [ ] F2 `components/settings/opcos-panel.tsx`：Operating companies Card（list + count subtitle）+ Add OpCo primary + `OpcoDialog`（Add/Edit;code Edit 唯讀;active toggle）+ toast
- [ ] F3 `settings.tsx` `TABS` 加 `opcos`（Building2 icon）+ render `<OpcosPanel/>`;`sidebar.tsx` Administration 加 Operating companies deep-link

## Verification 〔blocked until P3〕

- [ ] V1 `cd apps/api && npm run build`（EXIT 0）`&& npm test`（+N,不降）+ eslint changed files EXIT=0
- [ ] V2 `cd apps/web && npm run build`（EXIT 0）`&& npm test`（不降）+ eslint changed files EXIT=0
- [ ] V3 `ui-design` 自檢（dialog/panel：token-only,無新 accent/icon,1 primary,Building2 lucide,light+dark）
- [ ] V4 live 驗（重啟 3100 後,dev-bypass=ADMIN）：GET rich[active-only / ?includeInactive] / curl POST 建立[201] / 重複 code[409] / PATCH 改[200,code 不變] / 404 / 400[缺必填] / deactivate → GET /opcos 唔見 / restore;user-scope 下拉仍 work（relocation 驗）
- [ ] V5 逐行 diff trace 得返 spec §2（§1.3 surgical）

## Cross-Cutting 〔closeout〕

- [ ] Each commit references `progress.md` Day-N（R2）
- [ ] Commit tag：`feat(opco): … (CH-004)` / `docs(planning): …`
- [ ] Pending / 範圍變動 synced to `BACKLOG.md`（R7）
- [ ] `progress.md` closeout summary written;status `closed`;spec + checklist status = `done`

---

**Lifecycle reminder**：新加 item 必須先入 spec + changelog,再加 checklist。
