---
change_id: CH-004
spec_ref: ./spec.md
status: done            # in-progress | done
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

- [x] B1 `CreateOpcoDto` + `UpdateOpcoDto`（`dto/opco.dto.ts`）：class-validator（code/displayName/company 必填,costCenter?/active? 可選;空→null 在 service;code 不在 Update DTO — D3）
- [x] B2 新 `OpcoDto`（rich response）— 取代 orphan `AdminOpcoDto`（relocate 後刪除）
- [x] B3 `OpcoService`：`listForAdmin(includeInactive)`（由 user-admin `listOpcos` 移入,active-only default）+ `createOpco`（code 唯一 → 409）+ `updateOpco`（404 gate,`normalizeOptional` 空→null,code immutable）
- [x] B4 新 `OpcoAdminController`（`@Controller('admin/opcos')`, `@Roles(ADMIN, REGIONAL)`）：`@Get()`(?includeInactive) + `@Post()` + `@Patch(':id')` + `@ApiOkResponse`;wire 入 opco module
- [x] B5 **relocate**（D1 後果）：`user-admin.controller` 移除 `@Get('opcos')`、`UserAdminService` 移除 `listOpcos`、`AdminOpcoDto` class 刪（orphan,+ import 清理）;路徑 `/admin/opcos` 不變
- [x] B6 H5 test（`opco.service.spec.ts`）：list active-only / includeInactive / create 全欄 / create 重複 code 409 / trim + costCenter 空→null / update 成功 / update 404 / update 不改 code / deactivate;api 205→**213**（+8）;user-admin 無 listOpcos 專屬 test 需移轉

## Implementation — 前端（apps/web）

- [x] F1 `Opco`/`CreateOpcoBody`/`UpdateOpcoBody`（api-types,`AdminOpco` 留 thin subset）+ `useManageOpcos`（queries,`?includeInactive=true`）+ `useCreateOpco` / `useUpdateOpco`（`hooks/mutations`）→ POST/PATCH `/admin/opcos` + invalidate `['admin','opcos']`(+`['opcos']`/`['license','ledger']`)
- [x] F2 `components/settings/opcos-panel.tsx`：Operating companies Card（list + active count subtitle）+ Add OpCo primary + `OpcoDialog`（Add/Edit;code Edit 唯讀灰盒;active SegmentedControl）+ toast + 403 restricted state
- [x] F3 `settings.tsx` `TABS` 加 `opcos`（Building2 icon,users↔integrations 之間）+ render `<OpcosPanel/>`;`sidebar.tsx` Administration 加 Operating companies deep-link

## Verification

- [x] V1 api `npm run build`（EXIT 0）`&& npm test`（**213 passed**,205→213 +8）+ eslint changed files EXIT=0
- [x] V2 web `npm run build`（EXIT 0,tsc --noEmit clean）`&& npm test`（**85 passed** 不降）+ eslint changed files EXIT=0
- [x] V3 `ui-design` 自檢：token-only（bg-card/border/bg-hover/Badge tone/text-fg-*,零 hex,TH/TD 沿 users-panel 同款）· 1 primary（Add OpCo / dialog Save）· lucide stroke（Building2/Plus/ShieldAlert）· code/costCenter mono · status Badge semantic（ok/neutral）。**light+dark live render 未做**（web 5173 需登入,AI 唔輸密碼;build 過=結構渲染 OK,視覺待 Chris browser,同 CH-003 pattern）
- [x] V4 **live curl（3100 watch,dev-bypass=ADMIN，真 output）**：GET rich active[200,23 opco 含 company/costCenter] / GET includeInactive[200] / POST 建立[**201**,code trim / costCenter 空→null / active 預設 true] / 重複 code[**409**「already exists」] / 缺 company[**400** class-validator] / PATCH 改[**200**,送 code=HACKED 被 whitelist strip → code 仍 CH004-TEST **immutable** / displayName·costCenter 改] / 未知 id[**404**] / deactivate[**200** → picker `/opcos` + admin active-default 已濾走,只 includeInactive 見 active:false] / relocation GET `/admin/opcos` 正常 200。**前端 Edit round-trip 待 Chris browser**
- [x] V5 逐行 diff trace 得返 spec §2（§1.3 surgical）

## Cross-Cutting 〔closeout〕

- [x] Each commit references `progress.md` Day-N（R2）— d7ce956/0651365/a9c9391
- [x] Commit tag：`feat(opco)` / `feat(web)` / `docs(planning)`
- [x] Pending / 範圍變動 synced to `BACKLOG.md`（R7）
- [x] `progress.md` closeout summary written;status `closed`;spec + checklist status = `done`

---

**Lifecycle reminder**：新加 item 必須先入 spec + changelog,再加 checklist。
