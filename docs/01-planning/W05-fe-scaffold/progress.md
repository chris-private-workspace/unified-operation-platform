---
phase: W05-fe-scaffold
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: closed    # in-progress | closed
---

# Phase W05 — Progress

> Daily progress + 結尾 retro。
> 每 commit 必須對應一個 Day-N entry mention（R2 binding rule per PROCESS.md §5）。

---

## Day 0 — 2026-07-09: Kickoff

**Action**:Phase W05 kickoff（前端第一個 phase — apps/web scaffold + app shell + token/theme）
- **H6 對齊**:讀 `docs/02-architecture/design-system.md`（SSOT,五條 non-negotiables + anti-drift）、跑 `.claude/skills/ui-design`（DS-1~12）、讀 token 引入真相（`styles.css` @import 6 token）、app shell 視覺真相（`ui_kits/licenseops/index.html`:sidebar 248px + topbar 56px + 5 nav + role switch + theme toggle）。
- **grounded 發現**:
  - token 引入 = 原封 import `styles.css`（含 fonts/colors/typography/spacing/elevation/base）→ Tailwind 引 CSS var（design-system.md §1.5 範式已畀）。
  - ⚠️ `fonts.css` 用 **Google Fonts CDN**（`@import url(fonts.googleapis.com)`）—— 公司 proxy 可能封（同 W01 Prisma CDN R1 pattern）→ 列做 phase R1，實測。
- `plan.md` 填好,status=`draft`（**等 Chris approve flip active + 定 OD1–OD5**）。
- `checklist.md` derived（F1–F6,每 UI item 綁 DS 自檢）。
- Carry-over:後端業務層完成;auth guard 未做;endpoint 未 wire 入前端（本 phase set QueryClient provider,hooks 留畫面 phase）。

**Commit**:_(pending — kickoff 待 Chris approve plan 後連 flip active 一併 commit)_

**下一步**:Chris review plan → 定 OD1–OD5 → approve flip `active` → 由 F1 開工。

---

## Day 1 — 2026-07-09

**Chris approve plan → status `active`;OD1–OD5 全照 default（OD2 = 原封 Google Fonts CDN）。開始 F1–F6。**

### Done（F1–F6 一日內完成）
- **F1 scaffold ✓**:`apps/web` Vite+React+TS（vite.config `fs.allow` repo root 取 handoff token;build `tsc --noEmit && vite build`,棄 `tsc -b` composite 避 TS6310）。`npm install` 158 pkgs。
- **F2 token ✓**:`src/index.css` 原封 import handoff `styles.css`;`tailwind.config.ts` 只引 CSS var + `darkMode:'class'`。
- **F3 primitive ✓**:cn() + 7 primitive（cva Button;對 handoff .jsx spec 1:1;color/radius/font 用 token,control px 照 spec）。
- **F4 shell ✓**:Sidebar（brand glyph + 5 nav + roadmap + user card）+ TopBar（title/context/search/role/theme toggle）。
- **F5 routing/state ✓**:react-router 5 route + placeholder;Zustand `store/ui`（theme/role/sidebar）;App effect 寫 `.dark`;QueryClientProvider。
- **F6 DS + lint ✓**:見下 DS 自檢;lint clean。

### Gates
- **G1 build ✓**:`tsc --noEmit && vite build` 0 error（1648 modules;CSS 13.58kB = token 打包）。
- **G2 test + render ✓**:vitest 2 test 綠;dev server（5173）render app shell,**light + dark 都試過冇爆**（browser 截圖對照）。
- **G3 token wire ✓**:computed `--bg`=#f5f5f6→body rgb(245,245,246)、`--accent`=#E60027→品牌方塊 rgb(230,0,39);dark `.dark` swap `--bg`→#08080a、sidebar→#0b0b0d。Tailwind class → CSS var 正確 resolve。
- **G4 DS 自檢 ✓**（見下）· **G5 lint ✓**（eslint exit 0）。

### DS 自檢（`.claude/skills/ui-design` DS-1~12）
- DS-1 token-only ✅（computed = token 值;唯一 hardcode = Avatar gradient,見 flag）· DS-2 唔 eyeball ✅（讀 handoff .jsx spec）· DS-3 單一 accent + 一 primary ✅（segmented Regional = 唯一 accent）· DS-4 light+dark ✅（兩個都截圖驗）· DS-5 數字 mono ✅（count 6/3、"FE-1"）· DS-6 lucide ✅（全 lucide-react stroke）· DS-7 平面 ✅（1px border,無 blur）**⚠️ 1 flag** · DS-8 semantic ✅（drift count danger tone）· DS-9 motion ✅（克制）· DS-10 voice ✅（短 label,sentence case,caps section）· DS-11 對 prototype ✅（截圖 1:1）· DS-12 唔捏 logo ✅（generic stacked-bars glyph）。

### 🚩 Flags（非本 phase 修）
- **① Avatar brand gradient `#8a0018`**（DS-7）:handoff `Avatar.jsx` 本身用 `linear-gradient(135deg,var(--accent),#8a0018)` —— 我 1:1 還原（H6「忠實還原 hifi」）,但**衝突** design-system.md DS-7「唯一 gradient = login」+ DS-1（非 token hex）。已喺 `avatar.tsx` 加 flag comment。→ **要 owner 定**:保留 hifi gradient（更新 DS-7 例外）定改 token-only solid。BACKLOG。
- **② npm 32 vulnerabilities**（3 low / 20 mod / 8 high / 1 critical,全 dev 工具鏈 vite/vitest/jsdom）:未 `audit fix --force`（breaking）。BACKLOG follow-up。

### R1（Google Fonts CDN）實測
- **本 session 冇被封** —— Geist 字體 render 正常（body font-family = Geist …）。⚠️ 若之後公司網封（同 Prisma CDN pattern）字體會 fallback;屆時再傾 self-host（OD2）。RISK 保持觀察。

### Commits
- `feat(web): W05 FE-scaffold — apps/web app shell + token/theme`（closeout,含 F1–F6 前端 code + W05 三件套 + BACKLOG/SESSION_SUMMARY sync;pushed origin/main）。

---

## Retro（2026-07-09 收尾）

### What worked
- **H6 kickoff 對齊做足**:先讀 design-system SSOT + 跑 ui-design skill + 讀 handoff token 引入真相 + app shell 視覺真相,先落 code → token wire 一次啱、shell 對 prototype 1:1。
- **原封 import token（唔複製 hex）**:`styles.css` @import → Tailwind 只 alias CSS var → computed 值實測 = token 真相（#f5f5f6/#E60027/#08080a）。DS-1/DS-2 硬證。
- **browser 截圖 light+dark 對照**:唔靠 eyeball,實際 render 兩個 theme + computed style 驗 token swap,DS-4/DS-11 有圖為證。
- token/theme decouple 好靚:theme toggle → zustand → App effect 寫 `.dark` → 全 token 自動 swap,零 per-component dark class。

### What didn't work / unexpected friction
- **`tsc -b` composite + noEmit → TS6310**:Vite 預設 project-references 模板撞 TS 版本。解 = 改 `tsc --noEmit`（single project typecheck）+ 移除 references。
- browser evaluate 同步讀 computed style **太早**（React effect 未跑）→ theme swap 睇落似冇效;分開一次 evaluate 再讀就正常。教訓:讀 React-driven DOM state 要等 render settle。
- prettier line-wrap 又 `--fix`（慣性）。

### Surprises / discoveries
- **handoff Avatar 用咗非 token gradient（#8a0018）**,同 design-system.md「唯一 gradient = login」規則有出入 → flag 俾 owner（見上）。揭示 handoff 視覺真相 vs contract 規則偶有微出入,遇到要 surface 唔好靜靜決定。
- Google Fonts CDN 本 session **冇被封**（同 Prisma CDN 唔同待遇）—— 但保持觀察。
- npm 前端 deps 帶一批 dev-only vulnerabilities（vite/vitest 生態常見）→ flag。

### Carry-overs to 下一個 phase（FE-1）
- **下一個 = FE-1**:Overview dashboard + License Assets（用既有 token + 7 primitive + 補建畫面用到嘅 primitive:StatCard/Card/Badge…）+ 開始 **TanStack Query 對後端 `/license/*` `/fulfilment/*`**（provider 已就位）。
- **🚩 2 flags 待 owner/follow-up**:Avatar gradient（DS-7 決策）· npm vulnerabilities。
- OpenAPI → 前端型別:FE-1 可考慮由 `/docs/api-json` 生 TS client（openapi-typescript）—— 屆時評估（可能加 dep,H2 睇下）。
- auth guard 仍未做（前端未接 auth;endpoint unguarded）。

### ADR triggers
- **無新 ADR** — 用既定前端 stack（ADR-0001 已定 in-repo）+ design-system token 砌,無新 primitive/pattern/token/vendor（H1/H2/H6 未觸發;Avatar flag 係 handoff-vs-rule 出入,交 owner,未擅改）。

### Phase Gate result
- **G1 build:Pass** · **G2 test+render（light+dark）:Pass** · **G3 token wire:Pass** · **G4 DS 自檢:Pass（1 flag）** · **G5 lint:Pass**

### Phase status
- Frontmatter status → `closed`。
- BACKLOG 待同步（W05 → 完成;FE-1 候選 + 2 flag）。
- 下一個 phase kickoff trigger:**FE-1 = Overview dashboard + License Assets**（畫面 + 首次接後端 data via TanStack Query）。

---

**End of W05 progress**
