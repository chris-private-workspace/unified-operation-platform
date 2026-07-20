---
phase: W05-fe-scaffold
plan_ref: ./plan.md
status: complete    # draft | in-progress | complete
last_updated: 2026-07-09
---

# Phase W05 — Checklist

> Atomic checkbox（每 item ≤ 1–2 hour effort）。
> ✅ plan approved（status active,2026-07-09）;OD1–OD5 全照 default（OD2 原封 CDN）。
> **H6**:每個 UI item 完成前跑 `.claude/skills/ui-design`;偏離設計 → STOP 問 owner。

## F1 — Vite + React + TS scaffold

- [x] `apps/web`:package.json（deps 全屬 H2 lock stack）+ vite.config.ts + tsconfig + index.html + main.tsx + App.tsx
- [x] `npm install` resolve（158 pkgs）;verify `npm run build -w @uop/web` 0 error（tsc + vite build,1648 modules）

## F2 — Token 引入 + Tailwind theme（DS-1/DS-2）

- [x] 原封 import `design_handoff .../styles.css`（@import 6 token;vite `fs.allow` repo root）
- [x] `tailwind.config.ts` 只引 CSS var（全 semantic + font + radius + shadow）;`darkMode:'class'`
- [x] postcss（tailwindcss + autoprefixer）
- [x] verify（DS-2）:computed `--bg`=#f5f5f6 → body bg rgb(245,245,246);`--accent`=#E60027 → 品牌方塊 rgb(230,0,39);font=Geist ✓

## F3 — shadcn 底 + shell 必需 primitive re-skin（DS-3/5/6/7）

- [x] cn() util（clsx + tailwind-merge）+ components.json
- [x] 7 primitive 重建（Button[cva variant/size]/IconButton/Input/Avatar/NavItem/SegmentedControl/Toast;對 handoff .jsx spec）
- [x] Button variant + size;一 view 一 primary（DS-3:segmented Regional = 唯一 accent）;icon 全 lucide（DS-6）

## F4 — App shell（DS-4/11）⭐

- [x] Sidebar 248:brand glyph（generic stacked-bars,DS-12）+ wordmark + OPERATIONS 5 nav（active + count 6/3）+ ROADMAP disabled 2（SOON）+ user card（brand avatar）
- [x] Top bar 56:page title + role context + search Input（居中）+ SegmentedControl 角色 + IconButton theme toggle（sun/moon）
- [x] verify（DS-4）:light + dark 都 render 冇爆（截圖對照;`.dark` swap `--bg`→#08080a）;數字 mono（DS-5）;對 prototype 一致（DS-11 ✓）

## F5 — Routing + state 底盤

- [x] react-router-dom:5 route → placeholder;active route ↔ sidebar nav 同步
- [x] Zustand（`store/ui.ts`）:theme（寫 `.dark` on root via App effect）+ role + sidebar collapsed
- [x] TanStack Query QueryClientProvider 就位（hooks 留畫面 phase）

## F6 — DS 自檢 + gate

- [x] `.claude/skills/ui-design` DS-1~12 全 ✅（詳見 progress;**1 flag** = Avatar brand gradient DS-7,見下）
- [x] `npm run lint -w @uop/web` clean（`--fix` 後 exit 0）;build 0 error

---

## Cross-Cutting

- [x] All deliverables committed to git（closeout commit — R2）
- [x] OD1–OD5 resolved → 決策同步 plan §3 + progress（R4）
- [x] Architectural-adjacent decision → ADR（R5;**無** — 用既定 stack + token 砌,無新 primitive/token）
- [x] Pending / next-candidate synced to `BACKLOG.md`（R7;W05 → 完成、FE-1 候選 + 2 個 flag）
- [x] `progress.md` retro section written + status flipped `closed`
- [x] 下一個 phase（FE-1 Overview + License Assets）kickoff trigger noted in retro
- [x] R1（Google Fonts CDN）實測 = **本 session 冇被封**（Geist render 到）;記入 progress
- [x] **flag（非本 phase 修）**:① Avatar brand gradient `#8a0018`（handoff vs DS-7 衝突,BACKLOG）→ **已由 DS-flag 處理 ✅**（tokenize `--accent-deep` + DS-7 明文加 Avatar 例外,2026-07-10）② npm 32 vulnerabilities（dev 工具鏈,BACKLOG）→ **🚧 defer 至 DD-2**（全 dev-only,實測非-force 清唔到,等 vite@8 生態）;2026-07-20 補勾

---

**Lifecycle reminder**:呢份 checklist 隨 plan deliverables 衍生。**H6**:要新 primitive/pattern/token 先問 owner + 更新 design-system.md。
