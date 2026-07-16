---
change_id: CH-002
spec_ref: ./spec.md
status: done            # in-progress | done
last_updated: 2026-07-16
---

# CH-002 — Checklist

> Atomic items 衍生自 `spec.md §3` acceptance。每 item ≤ 1–2h。
> **Gate**：spec status = `approved`（Chris 2026-07-16）→ 可落 code。

## Implementation — A 組（純視覺 fidelity）

- [x] A1 Request 內頁 remark → 灰底（`bg-hover`）圓角盒 + accent-line 左邊（`request-detail.tsx`）
- [x] A2 Request 內頁 sync-gate strip → 灰底圓角盒 + border（`request-detail.tsx`）
- [x] A3 Requests filter 掣 → bordered card chip（inactive `border/bg-card/rounded-[8px]`）（`requests.tsx`）
- [x] A4 Assets mode switcher 容器 `bg-card border` + 順序 Platform→By OpCo（`assets.tsx`）
- [x] A5 Assets Platform 雙段 bar + 表下顏色圖例（`platform-view.tsx`）
- [x] A6 Assets By-OpCo 補 in-table「All SKUs · total」總行（數字 = filtered rows 加總，跟 filter；R3 deviation 已 log）（`by-opco-view.tsx`）
- [x] A7 Settings 移除多餘 h1 + Section 改用 `Card` primitive（`settings.tsx`）
- [x] A8 Users 表頭併入 Card header + 補角色圖例卡（真實 3 role，非 mock 的 auditor）+ 更新 stale 註解（`users-panel.tsx` / `settings.tsx`）
- [x] A9（追加）Request 內頁 operational history timeline 加事件間垂直連接線（`request-detail.tsx`）
- [x] A10（追加）Settings Account tab 重砌：Account 卡（avatar + 唯讀身份）+ Role & access 卡 + Password 卡；唯讀誠實（移除 unused Input import）（`settings.tsx`）

## Implementation — B 組（決策 B 已定 = 紅 accent，2026-07-16）

- [x] B1 Assets active mode 掣 = `bg-accent text-accent-fg`（`assets.tsx`）+ 更新 `design-system.md` §0.2 澄清 segmented-active accent

## Verification

- [x] `ui-design` skill 自檢：token-only（無 hardcode hex；唯一 inline style = data-driven bar 寬度，DS 明文允許）/ 1 primary / lucide-only ✅
- [x] `cd apps/web && npm run build` 綠（tsc + vite，無 chunk warning）
- [x] `npx eslint <7 changed files>` clean（EXIT=0）— 註：repo-wide `npm run lint` 因 **pre-existing** `ledger.ts`/`ledger.test.ts` CRLF(非本 change)而紅,已 revert 不動
- [x] `cd apps/web && npm test` 不降（85 passed）
- [x] light + dark 實 render 驗收（對 prototype）— **Chris browser 確認「頁面效果比較一致」**（含兩輪 settings padding/寬度修正後）
- [x] 逐行 diff trace 得返 spec §2（無順手改無關 code — §1.3 surgical）

## Cross-Cutting

- [x] Each commit references `progress.md` Day-N（R2）
- [x] Commit tag：`fix(web)/refactor(web): ... (CH-002)`
- [x] 更新 `docs/02-architecture/design-system.md` §0.2 DS-3 澄清（decision B approved）
- [x] Open decision B 解決 → sync spec §6 + progress（R4）
- [x] Pending / 範圍變動 synced to `BACKLOG.md`（R7；含 C 組另開 task 之識別）
- [x] `progress.md` closeout summary written
- [x] `progress.md` frontmatter status flipped to `closed`；spec + checklist status = `done`

---

**Lifecycle reminder**：新加 item 必須先入 spec + changelog，再加 checklist。
