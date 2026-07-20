---
phase: W12-fe-fidelity-harden
status: closed        # plan + progress 已 closed；honest gap 三項另列 BACKLOG（2026-07-20 status 回填）
---

# W12 — FE fidelity audit + harden — Checklist

> D1 audit = read-only（Chris 已 approve 全站 audit 方向）。**修復（D2+）approve inventory 後先做（R1）。**

## D1 — Audit（read-only → drift inventory）✅
- [x] 起環境:api 3100（dev-bypass）+ web 5173 + prototype http 8080 + seed 真數
- [x] Shell — sidebar 對 prototype（S1-S4:CATALOG section / admin nav / D365 roadmap / role 副標）
- [x] Shell — topbar 對 prototype（T1-T5:collapse / ⌘K / divider / tenant pill / user menu）
- [x] Overview（`/`）對 prototype（O1-O6）
- [x] Requests 列表（`/requests`）對 prototype（R1-R3）
- [x] Request detail（`/requests/:id`）對 prototype（D1;FE-2 忠實）
- [x] Drift（`/drift`）對 prototype（DR1-4）
- [x] Catalog（`/catalog`）對 prototype（✅ 1:1 無 drift）
- [x] Login（`/login`）對 prototype（L1-L5）
- [x] Settings（`/settings`）對 prototype（ST1-3）
- [x] 寫 `AUDIT.md`（分 🔧 真 drift / 🚧 honest gap;P1-3 + prototype 依據 + 修法 + Tier 分組）
- [x] **G1:present inventory → Chris approve 修復優先（OD1-4）** —— Chris approved 2026-07-11（決定見下方 D2+ 標題:OD1=Tier1+2+3 全 · OD2=user menu MVP · OD3=拆 Users&roles+Integrations nav · OD4=honest gap 唔造假）;2026-07-20 補勾

## D2+ — Harden（approved 2026-07-11:OD1=Tier1+2+3 全 · OD2=user menu MVP · OD3=拆 Users&roles+Integrations nav · OD4=honest gap 唔造假）

### D2 — Tier 1 Shell（最高槓桿）✅
- [x] Topbar T1 collapse 掣（wire `toggleSidebar` → sidebar 真收合 icon-rail;live 驗）
- [x] Topbar T2 ⌘K kbd hint（Input trailing mono badge）
- [x] Topbar T3 垂直 divider（1px×24px `bg-border`）
- [x] Topbar T4 tenant 狀態 pill（`bg-ok` 綠點 + tenant 名 mono 卡片;TENANT 常數）
- [x] Topbar T5 user menu（`Avatar` brand + chevron + dropdown → identity/Settings/Sign out;dev-bypass honest note;live 驗）
- [x] Sidebar S1 SKU Catalog → 獨立「CATALOG」section
- [x] Sidebar S2 Administration → 「Users & roles」+「Integrations」deep-link `/settings?tab=`（Settings 讀 `useSearchParams`;sidebar highlight 對）
- [x] Sidebar S3 Roadmap 加「D365 Licenses」SOON（+ Offboarding icon → UserMinus）
- [x] **驗:shell light+dark + collapse + dropdown 全 live 驗對 prototype**

### D3 — Tier 2 Login ✅
- [x] ~~L1 split ratio~~ — **audit false positive**（已係 `w-[52%]`,transient screenshot 誤判;live 確認對）
- [x] L2 3 stats **保 honest**（23 OpCos / 10 SKUs / Live;唔用 prototype fake「1,053 seats」— H7）
- [x] L3 左 panel footer line
- [x] L4 brand 副標「Ricoh APAC · Regional IT」+ glyph
- [x] L5 headline「…under control.」+ subtext copy 對齊 prototype
- [x] **驗:Login live 驗對 prototype（split/copy/stats/footer 全對）**

### D4 — Tier 3 頁內細節 ✅
- [x] O1 Overview KPI card2 → 「In procurement / awaiting quote · vendor」（procurement count 派生 + ClipboardList icon）
- [x] O2 Overview「View all requests →」HeaderLink · O3「Open →」HeaderLink + 「last checked」（honest 用 latest detectedAt）
- [x] R1 Requests filter → pill（active `bg-fg text-bg` inverted + count;live 驗 light+dark）
- [x] ST1/ST2 Settings 頂 tabs → 左 sub-nav + 全寬（live 驗）
- [x] ST3 Settings Users&roles 加 3 role 定義 block（用戶表保持 honest empty）
- [x] DR4 Drift DETECTED → `formatDateTime` 絕對時間
- [x] **驗:各頁 live 驗**

### D5 — Verify + closeout ✅
- [x] touched screen light+dark 對 prototype（shell 兩 mode + Login + Requests pill 兩 mode live 驗;content 全 token-based）
- [x] web **8 test 綠** · build **0 error** · lint **exit 0**
- [ ] progress retro · BACKLOG · memory · commit（待指示）

## Phase Gate（plan §5）
- [x] G1 AUDIT.md 完整（7 畫面 + shell）+ Chris approve（OD1-3）
- [x] G2 touched screen light+dark 對 prototype（shell 兩 mode + Login + Requests pill 兩 mode live 驗）
- [x] G3 ui-design DS 過（token-only:bg-fg/text-bg/bg-ok/accent-soft…無 hardcode hex;lucide-only;1 primary;mono 數字;flat + shadow-overlay dropdown）
- [x] G4 無新 token / 新 dep（reuse 既有 token + 已裝 lucide icon;無 npm i）
- [x] G5 web 8 test 綠 + build 0 error + lint exit 0

## Closeout
- [ ] progress retro · BACKLOG · memory · commit（待指示）
