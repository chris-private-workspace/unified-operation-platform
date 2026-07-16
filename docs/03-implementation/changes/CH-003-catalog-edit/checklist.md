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

- [ ] B1 `UpdateSkuCatalogDto`（`dto/catalog.dto.ts`）：businessAlias?/category?/isBaseLicense?，class-validator（trim + 長度，空→null）
- [ ] B2 `CatalogService.updateEntry(id, dto)`：404 if 唔存在；只 set 3 欄；回傳更新後 record
- [ ] B3 `PATCH /license/catalog/:id`（`license.controller.ts`）`@Roles(ADMIN, REGIONAL)` + `@ApiOkResponse(SkuCatalogDto)`
- [ ] B4 H5 test（`catalog.service.spec.ts`）：更新 3 欄成功 / 404 / system-owned 欄不動 / 空字串→null

## Implementation — 前端（apps/web）

- [ ] F1 `useUpdateCatalog` mutation（`hooks/mutations`）→ `PATCH /license/catalog/:id` + invalidate `['license','catalog']`
- [ ] F2 `catalog.tsx`：Edit 掣解禁 → `EditSkuDialog`（alias/category/base 可改；part number/skuId/display name 唯讀）+ toast

## Verification

- [ ] `cd apps/api && npm run build && npm test`（不降）+ lint clean（changed files）
- [ ] `cd apps/web && npm run build && npm test`（85 不降）+ lint clean（changed files）
- [ ] `ui-design` skill 自檢（前端 dialog：token-only / light+dark / lucide）
- [ ] live 驗：curl PATCH（ADMIN 改成功 / OPCO_IT 403 / 404 / immutable 欄不動）+ 前端 Edit round-trip
- [ ] 逐行 diff trace 得返 spec §2（§1.3 surgical）

## Cross-Cutting

- [ ] Each commit references `progress.md` Day-N（R2）
- [ ] Commit tag：`feat(license): ... (CH-003)` / `feat(web): ...`
- [ ] Open question（isBaseLicense §10）狀態確認（R4；本 change 不 resolve，只記依賴）
- [ ] Pending / 範圍變動 synced to `BACKLOG.md`（R7；含 2b By-OpCo 分組另列）
- [ ] `progress.md` closeout summary written
- [ ] `progress.md` frontmatter status flipped to `done`

---

**Lifecycle reminder**：新加 item 必須先入 spec + changelog，再加 checklist。
