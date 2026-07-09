---
change_id: CH-000
spec_ref: ./spec.md
status: done
last_updated: 2026-01-10
---

# CH-000 — Checklist

> ⚠️ 範例實例。Atomic items derived from `spec.md §3` acceptance。

## Implementation
- [x] `GET /items` handler 加 `status` optional query param（Pydantic `Literal["active","archived"]`）
- [x] Server-side filter 邏輯
- [x] 無效值 → 422（Pydantic 自動 validation）

## Verification
- [x] Run all acceptance criteria from `spec.md §3`（4/4）
- [x] Smoke test in dev env
- [x] （user-facing）manual verify — list 頁篩選正常

## Cross-Cutting
- [x] Each commit references `progress.md` Day-N entry（R2）
- [x] Commit message 標 component tag（`feat(api): CH-000 status filter (C08)`）
- [x] （if architectural）ADR — N/A（加 optional param 唔改契約 shape,非架構級）
- [x] （if affects component）Update `components/C08-*.md` design note — N/A（範例項目未建 catalog）
- [x] Open-question status sync — N/A
- [x] Pending changes synced to `BACKLOG.md`（R7）
- [x] `progress.md` closeout summary written
- [x] `progress.md` frontmatter status flipped to `closed`

---

**Lifecycle reminder**:呢份 checklist 隨 spec acceptance criteria 衍生。
