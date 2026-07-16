---
change_id: CH-003
spec_ref: ./spec.md
status: in-progress     # in-progress | done
last_updated: 2026-07-16
---

# CH-003 — Checklist

> Atomic items 衍生自 `spec.md §3` acceptance。每 item ≤ 1–2h。
> **Gate**：spec status = `approved`（Chris pre-approved「同意 CH-003 spec, 可以開始執行」）→ 可落 code。

## Implementation — 後端（apps/api/src/license）

- [x] B1 `UpdateSkuCatalogDto`（`dto/catalog.dto.ts`）：businessAlias?/category?/isBaseLicense?，class-validator（IsOptional/IsString/IsBoolean/MaxLength；空→null 在 service）
- [x] B2 `CatalogService.updateEntry(id, dto)`：404 if 唔存在；只 set 3 欄（`normalizeOptional` 空→null）；回傳更新後 record
- [x] B3 `PATCH /license/catalog/:id`（`license.controller.ts`）繼承 class `@Roles(ADMIN, REGIONAL)` + `@ApiOkResponse(SkuCatalogDto)`
- [x] B4 H5 test（`catalog.service.spec.ts`）：更新 3 欄(trimmed)成功 / 空→null / 只改供應欄 / 404；api 201→**205**

## Implementation — 前端（apps/web）

- [x] F1 `useUpdateCatalog` mutation（`hooks/mutations`）+ `UpdateCatalogBody`（api-types）→ `PATCH /license/catalog/:id` + invalidate `['license','catalog']`
- [x] F2 `catalog.tsx`：Edit 掣解禁 → `EditSkuDialog`（alias/category/base 可改；display name/part number/skuId 唯讀灰盒）+ toast

## Verification

- [x] `cd apps/api && npm run build`（EXIT 0）`&& npm test`（**205 passed**，+4）+ eslint changed files EXIT=0
- [x] `cd apps/web && npm run build`（EXIT 0）`&& npm test`（**85 passed**，不降）+ eslint changed files EXIT=0
- [x] `ui-design` 自檢（dialog：token-only[bg-hover/border/Input/SegmentedControl]，無新 accent/icon，1 primary[Save]）；**light+dark live pending**
- [ ] live 驗：curl PATCH（ADMIN 改成功 / OPCO_IT 403 / 404 / immutable 欄不動）+ 前端 Edit round-trip — **pending**（用戶 3100 backend 當前 down[curl HTTP 000]；unit test 已覆蓋邏輯，HTTP 層待 server up 或前端 round-trip）
- [x] 逐行 diff trace 得返 spec §2（§1.3 surgical）

## Cross-Cutting

- [ ] Each commit references `progress.md` Day-N（R2）
- [ ] Commit tag：`feat(license): ... (CH-003)` / `feat(web): ...`
- [ ] Open question（isBaseLicense §10）狀態確認（R4；本 change 不 resolve，只記依賴）
- [ ] Pending / 範圍變動 synced to `BACKLOG.md`（R7；含 2b By-OpCo 分組另列）
- [ ] `progress.md` closeout summary written
- [ ] `progress.md` frontmatter status flipped to `done`

---

**Lifecycle reminder**：新加 item 必須先入 spec + changelog，再加 checklist。
