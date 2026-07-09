# ADR-0001: 前端納入本 repo,採 monorepo(`apps/api` + `apps/web`)

**Date**: 2026-07-09
**Status**: Accepted
**Approver**: Chris Lai

## Context

原設計(`docs/02-architecture/licenseops/DESIGN.md §4.4`、CLAUDE.md §5 H2)把前端列為「另一個 deliverable,唔喺本 repo」。2026-07-09 用戶把完整 hifi 設計 handoff(`design_handoff_licenseops/`)放入本 repo,並要求規劃 + 開發 LicenseOps 前端。

呢個改變觸發:
- **H1(架構變更)**— 動到平台級檔案佈局 / module 邊界。
- **H3(scope)**— 前端由 out-of-repo 變成 in-repo,屬 scope 邊界移動。

## Decision

1. **前端納入本 repo**(唔再係獨立 deliverable)。
2. 採 **monorepo 佈局**:
   - `apps/api/` — 現有 NestJS 後端(由 repo root 嘅 `src/` / `prisma/` / `main.ts` / `app.module.ts` / `seed.ts` 遷入)。
   - `apps/web/` — 新 React + TypeScript + Tailwind + shadcn/ui 前端。
3. 前端**視覺真相** = `design_handoff_licenseops/`;設計系統契約落 `docs/02-architecture/design-system.md`,並由 **H6(Design Fidelity)** 硬約束保護。
4. 實際搬遷後端入 `apps/api/` 由 **phase W01(backend bootstrap)** 執行(plan 已相應更新);前端建置由後續滾動 phase 進行。

## Alternatives Considered

- **Option B — 前端 subfolder(`web/`),後端留 root**:改動最少,但兩套 tooling 位置不對稱、日後共享 type / CI 較亂。Rejected。
- **Option C — 前端獨立 repo**:完全隔離、對齊原 DESIGN,但跨 repo 協調、type 唔共享、單一 PR 睇唔到前後端一致性。Rejected。
- **Chosen — Option A(monorepo `apps/api` + `apps/web`)**:前後端同一版本管理、可共享 type(OpenAPI → TS)、單一 CI/PR gate;代價係一次性後端遷移 + tooling 設定,由 W01 一併處理。

## Consequences

- **Positive**:前後端一致演進;OpenAPI 契約可生成前端 type;統一 CI / hard constraints;設計系統集中管理。
- **Negative**:需一次性把後端由 root 搬入 `apps/api/`(改 import / build config / W01 scope 擴大);monorepo tooling(workspace)要設定。
- **Neutral**:root 由「單一 NestJS app」變成「monorepo 容器」;`docs/` / `design_handoff_licenseops/` 留 root。

## References

- 觸發:CLAUDE.md §5 H1 + H3;用戶 2026-07-09 approval(揀 Option A)
- 受影響 spec:`docs/architecture.md §2/§4/§5`
- 設計系統:`docs/02-architecture/design-system.md`、`design_handoff_licenseops/`
- 執行:phase `docs/01-planning/W01-backend-bootstrap/`(後端遷入 `apps/api`)
- 相關約束:新增 CLAUDE.md §5 **H6 Design Fidelity**
