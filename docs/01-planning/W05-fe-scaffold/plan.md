---
phase: W05-fe-scaffold
name: "前端 scaffold — apps/web app shell + token/theme 基建"
sprint_week: W05
start_date: 2026-07-09
end_date: 2026-07-16          # planned, may slip with changelog log
status: closed               # draft | active | closed — progress closed + checklist complete（2026-07-20 status 回填）
spec_refs:
  - docs/02-architecture/design-system.md（設計系統 SSOT + anti-drift）
  - design_handoff_licenseops/design-system/styles.css（token 引入真相）
  - design_handoff_licenseops/design-system/ui_kits/licenseops/index.html（app shell 視覺真相）
  - design_handoff_licenseops/prototype/full-console.html（視覺對照）
  - docs/adr/0001-frontend-in-repo-monorepo.md（monorepo）· CLAUDE.md §3.2 / §5 H6
prior_phase: W04-assign-fulfilment
---

# Phase W05 — 前端 scaffold（app shell + token/theme 基建）

> **Plan version**:1.0（draft）
> **Owner**:Chris Lai
> **Approved by**:Chris Lai(2026-07-09)
> **H6 提醒**:token-only、唔 eyeball、light+dark、lucide-only;每 commit 前跑 `.claude/skills/ui-design`（DS-1~12）。

## 1. Scope

後端業務層完成,轉前端。`apps/web` 現時只係 placeholder。本 phase = **前端第一個 phase = 基建 + app shell 骨架**:起 Vite+React+TS、**原封引入 `design_handoff` token**、Tailwind theme **引 CSS var**（`darkMode:'class'`）、shadcn/ui 底 re-skin 成 token、重建 **app shell**（sidebar + top bar + theme toggle + role switch）到視覺 1:1、routing 骨架（每畫面一 route → placeholder）、state 底盤（Zustand + TanStack Query provider）。

呢個係之後所有畫面 phase（FE-1 Overview/Assets、FE-2 Requests、FE-3 Drift/Catalog/Settings/Login）嘅地基。**唔砌實際畫面內容**（KPI / cards / tables 留畫面 phase）。

**H6 對齊（design-system.md 五條 non-negotiables）**:token-only（唔 hardcode 色/字/距/半徑/陰影）· 單一 accent Ricoh red · light+dark 都要 · lucide stroke only · 數字/識別碼 Geist Mono。

## 2. 明確 out-of-scope（H3 / H6 — 唔可以順手做）

| 排除項 | 去向 |
|---|---|
| **實際畫面內容**（Overview KPI/cards、Assets 三層、tables…） | FE-1/2/3 畫面 phase |
| **data fetching**（TanStack Query hooks 對 OpenAPI 實際 endpoint） | 畫面 phase（本 phase 只 set up QueryClient provider） |
| **auth / login 畫面** | AUTH phase / FE-3 |
| **新 primitive / 新 pattern / 改 token / 加新色** | **STOP（H6）** → 傾 owner → 更新 design-system.md（+ 架構級 ADR）先做 |
| **後端改動** | 純 `apps/web`;唔掂 `apps/api` |

## 3. Open Decisions（✅ 2026-07-09 敲定:全照 default — OD2 原封 CDN）

| # | 決策 | 決定（= default） |
|---|---|---|
| **OD1** | shadcn primitive 建幾多 | **按需** — 本 phase 只建 app shell 用到嘅 7 個（Button · IconButton · Input · Avatar · NavItem · SegmentedControl · Toast）;其餘 12 個 rolling（畫面用到先建）。simplicity first |
| **OD2** | Geist 字體引入（handoff 用 Google Fonts CDN） | **原封 CDN**（跟 handoff `fonts.css`,唔改 read-only handoff §7）。⚠️ 公司 proxy 可能封（見 R1）→ 實測封先同 owner 傾 self-host(apps/web 自己 host,唔改 handoff) |
| **OD3** | Router | `react-router-dom`（§3.2「每畫面一 route」;標準,屬既定前端 stack） |
| **OD4** | 前端 test | **H5 N/A**（scaffold 無 critical path business logic）;加一個 app-shell render smoke（Vitest,可選,證 theme swap 唔爆） |
| **OD5** | 主內容 placeholder | 每 route 一個 `EmptyState`-style placeholder（"<畫面> — coming in FE-x"）,唔砌實內容 |

## 4. Deliverables

### F1 — Vite + React + TS scaffold
- **Spec ref**:ADR-0001、CLAUDE.md §3.2
- **Acceptance criteria**:
  - `apps/web`:`package.json`（deps 見下,全屬 §5.2 H2 lock stack — **非新 vendor**）+ `vite.config.ts` + `tsconfig.json`（strict）+ `index.html` + `src/main.tsx` + `src/App.tsx`。
  - `npm install`（root workspace）resolve;`npm run build -w @uop/web`（vite build）0 error。
  - **Deps（全屬 lock stack,plan 標明免 H2 誤觸）**:`react`/`react-dom`/`vite`/`@vitejs/plugin-react`/`typescript`(H2 表)、`tailwindcss`/`postcss`/`autoprefixer`(H2 Tailwind)、shadcn 底層 `@radix-ui/*`/`class-variance-authority`/`clsx`/`tailwind-merge`(H2 shadcn)、`lucide-react`(§3.2)、`@tanstack/react-query`/`zustand`(§3.2 state)、`react-router-dom`(§3.2 routing)。
- **Effort**:2.5h · **Owner**:AI

### F2 — Token 引入 + Tailwind theme（DS-1/DS-2）
- **Spec ref**:design-system.md §1;`styles.css`（@import 6 token）
- **Acceptance criteria**:
  - `apps/web` **原封 import** `design_handoff_licenseops/design-system/styles.css`（含 fonts/colors/typography/spacing/elevation/base）—— 唔複製 hex。
  - `tailwind.config.ts` **只引 CSS var**（照 design-system.md §1.5 範式:`accent:'var(--accent)'` … 全 semantic + font + radius + shadow）;`darkMode:'class'`。
  - postcss（tailwindcss + autoprefixer）。
  - **驗**:一個用 Tailwind token class 嘅元素,computed color = `tokens/colors.css` 實際值（light + dark）。
- **Effort**:2.5h · **Owner**:AI

### F3 — shadcn 底 + shell 必需 primitive re-skin（DS-3/5/6/7）
- **Spec ref**:design-system.md §2;handoff `components/**/*.jsx`（**inline-style spec,唔照抄**,重建到視覺 1:1）+ 各 `.prompt.md`
- **Acceptance criteria**:
  - shadcn/ui init（`components.json` + `cn()` util）;7 個 primitive（Button/IconButton/Input/Avatar/NavItem/SegmentedControl/Toast）用 shadcn+Tailwind token 重建,對 handoff `.jsx` + prototype 視覺 1:1。
  - Button `variant`(primary/secondary/ghost/danger)·`size`(sm/md/lg),一 view 一 primary（DS-3）;icon 全 lucide stroke（DS-6）。
- **Effort**:4h · **Owner**:AI

### F4 — App shell（DS-4/11）⭐ 視覺核心
- **Spec ref**:`ui_kits/licenseops/index.html`（shell 真相）+ `prototype/full-console.html`
- **Acceptance criteria**:
  - **Sidebar 248px**（`--sidebar`,右 border）:brand glyph（accent square + stacked-bars,**唔捏 logo** DS-12）+ wordmark;OPERATIONS nav 5 項（Overview/Requests/License Assets/Drift Alerts/SKU Catalog,lucide icon,active 態 + count badge）;ROADMAP disabled 2 項（Offboarding/Cost Insights + "soon"）;底部 user card（Avatar brand + name/role）。
  - **Top bar 56px**（`--panel`,底 border）:page title + role context（"Regional — all OpCos"）;search Input（居中,max 420）;SegmentedControl 角色切換;IconButton theme toggle（sun/moon lucide）。
  - **light + dark 都行過冇爆**（DS-4）;數字/識別碼 mono（DS-5）;對 prototype 視覺一致（DS-11）。
- **Effort**:4h · **Owner**:AI

### F5 — Routing + state 底盤
- **Spec ref**:§3.2
- **Acceptance criteria**:
  - `react-router-dom`:每畫面一 route（overview/requests/assets/drift/catalog…）→ 各一 placeholder（OD5）;active route ↔ sidebar nav 同步。
  - Zustand store:theme（light/dark,寫 `.dark` on root）、role（Regional/OpCo）、sidebar（collapsed）。
  - TanStack Query `QueryClientProvider`（provider 就位,hooks 留畫面 phase）。
- **Effort**:2.5h · **Owner**:AI

### F6 — DS 自檢 + gate
- **Acceptance criteria**:`.claude/skills/ui-design` DS-1~12 全 ✅（特別 DS-11 對 prototype）;`npm run lint -w @uop/web` clean;build 0 error。
- **Effort**:1.5h · **Owner**:AI

## 5. Success Criteria（Phase Gate）

| # | Criterion | Target | Measure | Block closeout? |
|---|---|---|---|---|
| G1 | Build passes | 0 error | `npm run build -w @uop/web` | Yes |
| G2 | Dev server + shell render（light + dark） | shell 出、theme swap 唔爆 | `npm run dev` + 視覺（DS-4） | Yes |
| G3 | Token wire 正確 | Tailwind class → CSS var 實際值 | computed style（light+dark） | Yes |
| G4 | ui-design DS 自檢 | DS-1~12 全 ✅ | skill 逐條 | Yes（H6） |
| G5 | Lint clean | 0 warning | `npm run lint -w @uop/web` | No |

## 6. Risks（Phase-Specific）

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **Google Fonts CDN 被公司 proxy 封**（承 W01 Prisma CDN pattern） | Med | Low | 字體 fallback 到 system;實測封 → 轉流動網路 / 同 owner 傾 self-host（apps/web 自 host,**唔改 read-only handoff**）。唔 block 功能 |
| R2 | Token wire 錯（Tailwind var 冇 resolve → 視覺爆） | Med | Med | G3 查 computed（light+dark）;照 design-system.md §1.5 範式 |
| R3 | shell 視覺偏離 prototype（H6 drift） | Med | High | 對 handoff `.jsx`（spec）+ prototype（視覺）重建;G4 ui-design DS-11 |
| R4 | 前端 deps 觸 H2 | Low | Low | 全屬 §5.2 H2 lock stack（React/Vite/TS/Tailwind/shadcn/TanStack/Zustand/lucide/router）,**非新 vendor**;plan 已列明 |
| R5 | stale 3100 / vite port 佔用 | Low | Low | vite 預設 5173;驗前查 port |

## 7. Day-by-Day Breakdown（rough）

| Day | Date | Focus | Deliverables |
|---|---|---|---|
| D1 | 2026-07-09 | Vite/TS scaffold + token 引入 + Tailwind theme | F1, F2 |
| D2 | 2026-07-10 | shadcn + 7 primitive re-skin + app shell（sidebar/topbar） | F3, F4 |
| D3 | 2026-07-11 | routing + state + theme toggle + DS 自檢 + gates | F5, F6, G1–G5 |

## 8. Dependencies on Prior Phase

W01 monorepo（`apps/web` placeholder + root workspace）、ADR-0001、design-system.md（SSOT）、`design_handoff_licenseops/`（視覺真相）。全部就緒。後端 OpenAPI（`/docs/api`）供將來 TanStack Query 對接（本 phase 未接）。

## 9. Plan Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-09 | Initial draft（前端 scaffold） | 後端業務層完成,轉前端第一個 phase | Chris Lai |
| 2026-07-09 | Approved → status active;OD1–OD5 全照 default（OD2 = 原封 Google Fonts CDN,實測封先傾 self-host） | Chris approve 開工 | Chris Lai |

---

**Lifecycle reminder**:plan locked after status=active。重大 deviation → 第 9 節 changelog + progress Day-N;approve 前唔 code（R1）。**H6**:偏離設計（新 primitive/pattern/token/色）→ STOP 問 owner。
