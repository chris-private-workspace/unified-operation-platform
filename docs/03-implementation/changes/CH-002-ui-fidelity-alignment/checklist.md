---
change_id: CH-002
spec_ref: ./spec.md
status: in-progress     # in-progress | done
last_updated: 2026-07-16
---

# CH-002 — Checklist

> Atomic items 衍生自 `spec.md §3` acceptance。每 item ≤ 1–2h。
> **Gate**：spec status = `proposed`，未 approved 前唔可以 tick implementation item（R1）。

## Implementation — A 組（純視覺 fidelity）

- [ ] A1 Request 內頁 remark → 灰底（`bg-hover`）圓角盒 + accent-line 左邊（`request-detail.tsx`）
- [ ] A2 Request 內頁 sync-gate strip → 灰底圓角盒 + border（`request-detail.tsx`）
- [ ] A3 Requests filter 掣 → bordered card chip（inactive `border/bg-card/rounded-[8px]`）（`requests.tsx`）
- [ ] A4 Assets mode switcher 容器 `bg-card border` + 順序 Platform→By OpCo（`assets.tsx`）
- [ ] A5 Assets Platform 雙段 bar + 表下顏色圖例（`platform-view.tsx`）
- [ ] A6 Assets By-OpCo 補 in-table「All SKUs · total」總行（數字取 `/ledger/stats`，缺值 `—`）（`by-opco-view.tsx`）
- [ ] A7 Settings 移除多餘 h1 + Section 改用 `Card` primitive（`settings.tsx`）
- [ ] A8 Users 表頭併入 Card header + 補角色圖例卡 + 更新 stale 註解（`users-panel.tsx` / `settings.tsx`）

## Implementation — B 組（決策 B 已定 = 紅 accent，2026-07-16）

- [ ] B1 Assets active mode 掣 = `bg-accent text-accent-fg`（`assets.tsx`）+ 更新 `design-system.md` DS-3 澄清 segmented-active accent + changelog

## Verification

- [ ] 逐項跑 `ui-design` skill 自檢（token-only / 1 primary / lucide / light+dark）
- [ ] `cd apps/web && npm run build` 綠
- [ ] `cd apps/web && npm run lint` 無 warning
- [ ] `cd apps/web && npm test` 不降（現 85）
- [ ] 每項 light + dark 兩色實 render 驗收（對 prototype）
- [ ] 逐行 diff trace 得返 spec §2（無順手改無關 code — §1.3 surgical）

## Cross-Cutting

- [ ] Each commit references `progress.md` Day-N（R2）
- [ ] Commit tag：`fix(web): ... (CH-002)` 或 `refactor(web): ...`
- [ ] （若決策 B = 紅）更新 `docs/02-architecture/design-system.md` DS-3 澄清 + changelog
- [ ] Open decision B 解決 → sync spec §6 + progress（R4）
- [ ] Pending / 範圍變動 synced to `BACKLOG.md`（R7；含 C 組另開 task 之識別）
- [ ] `progress.md` closeout summary written
- [ ] `progress.md` frontmatter status flipped to `done`

---

**Lifecycle reminder**：新加 item 必須先入 spec + changelog，再加 checklist。
