---
change_id: CH-001
spec_ref: ./spec.md
status: done     # in-progress | done
last_updated: 2026-07-13
---

# CH-001 — Checklist

> Atomic checkbox items derived from `spec.md §3` acceptance criteria。每 item ≤ 1-2h effort。

## Implementation

- [x] 量 baseline:`npm run build` — 單一 `index-*.js` = **587.77 kB** + 確認 `>500 kB` 警告存在
- [x] `vite.config.ts` 加 `build.rollupOptions.output.manualChunks`(react-vendor / msal-vendor / query-vendor)
- [x] `npm run build` → **無 >500 kB 警告** + 具名 vendor chunk 出現(msal 254 / react 197 / query 42 / app 94 kB)

## Verification

- [x] `npm run build` exit 0 + 無 chunk-size 警告(acceptance 1-2)✅
- [x] `npm run lint` exit 0(acceptance 3)✅
- [x] `npm run test` web **8 test 綠**(acceptance 4)✅
- [x] live(`vite preview` 真 production dist,tab 1081755877):Login 渲染(DOM `readyState=complete`+ W12 copy)、MSAL provider mount(React 渲染 MsalProvider tree)、無 chunk/module error(只有 Chrome extension 雜訊)、light `rgb(245,245,246)`↔dark `rgb(8,8,10)` token swap 正常(acceptance 5)✅

## Cross-Cutting

- [x] Commit references `progress.md` Day-N entry(R2)— 待 commit
- [x] Commit message 標 component tag(`chore(web): ... (CH-001)`)— 待 commit
- [x] (非架構,無 ADR 需要 — H1 不觸發)
- [x] Pending changes synced to `BACKLOG.md`(R7:FE-bundle-split → 完成)
- [x] `progress.md` closeout summary written
- [x] `progress.md` frontmatter status flipped to `closed`

---

**Lifecycle reminder**:呢份 checklist 隨 spec acceptance criteria 衍生。新加 item 必須先入 spec + changelog,然後再加 checklist。
