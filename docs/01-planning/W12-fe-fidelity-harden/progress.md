---
phase: W12-fe-fidelity-harden
status: closed        # plan 已 closed；honest gap 三項另列 BACKLOG（2026-07-20 status 回填）
---

# W12 — FE fidelity audit + harden — Progress

## Day 0 — 2026-07-11（kickoff）

**緣起**:Chris 報 app UI「沒有完全跟蹤 mockup」（例:topbar 右上角 user icon 缺）。初查 topbar 已缺 4 項（divider / tenant 狀態 pill / user menu avatar+chevron / ⌘K）。

**決定（AskUserQuestion）**:範圍 = **全站 fidelity audit（6 頁 + shell）**→ plan-first phase W12。

**做咗**:寫 `plan.md`（audit-first:read-only 出 drift inventory → approve 修復優先 → harden;逐 screen re-verify light+dark + ui-design DS）+ checklist + progress。status → active（Chris 已 approve audit 方向;修復 D2+ 待 inventory approve）。

**下一步**:D1 audit —— 起 api 3100 + web 5173 + prototype local http + seed 真數,逐畫面對比,寫 `AUDIT.md`。

---

## Day 1 — 2026-07-11（D1 audit 完成）

**做咗**:起環境（api 3100 dev-bypass + web 5173 + prototype static http 8080 + seed 真數）→ 兩 tab 並排逐畫面截圖對比 **全 7 畫面 + shell**。寫 `AUDIT.md`。

**發現（詳見 `AUDIT.md`）**:
- **Shell 最高槓桿 drift（每頁受惠）**:topbar 缺 5 件（T1 collapse / T2 ⌘K / T3 divider / T4 tenant pill / **T5 user menu avatar** ← Chris 報嘅）;sidebar 3-4 件（S1 CATALOG section / S2 admin nav = Users&roles+Integrations 非 Settings / S3 D365 roadmap / S4 role 副標)。
- **Login**:L1 split ratio 太闊(P1)+ L2 缺 3 stats + L3 footer + L4 brand 副標 + L5 copy。
- **Overview**:O1 card2 label / O2 O3 缺 links + last run（🔧);O4 Licenses assigned / O5 activity / O6 SKU 副標（🚧 honest gap)。
- **Requests**:R1 filter pill 樣式(🔧);R2 My queue(🚧 AUTH-3b)/ R3 handler(🚧)。
- **Detail**:忠實;僅 D1 AI Assist(🚧 DESIGN §6)。
- **Drift**:忠實 + honest gap（DR1 Resolve / DR2 scope / DR3 note / DR4 時間格式[🔧 小]）。
- **Catalog**:✅ **1:1 無 drift**。
- **Settings**:ST1 頂 tabs vs 左 sub-nav / ST2 置中窄欄 vs 全寬(🔧);ST3 用戶表(🚧)+ 3 role 定義 block(🔧 可加)。

**關鍵分類**:🔧 真 drift（可修,無 backend 依賴)vs 🚧 honest gap（需 backend/AUTH-3b,**唔造假 H7**)。**Tier 1 = Shell（最高槓桿,直接解 Chris 問題)· Tier 2 = Login · Tier 3 = 頁內細節**。

**下一步（G1）**:present inventory + OD1-4 → Chris approve 修復優先 → 先展開 D2+ harden。**未 approve 唔改 code（R1）。**

**環境備忘**:api(bra7ev26c 3100)+ web(bid4rboyq 5173)+ prototype(b10huukj8 8080)背景 running,harden 時 reuse;browser tab 875=prototype/876=app。

**approve（同日）**:OD1=**Tier 1+2+3 全做** · OD2=user menu MVP · OD3=拆 Users&roles+Integrations nav · OD4=honest gap 唔造假。

---

## Day 1 (harden) — 2026-07-11（Tier 1+2+3 全做 + live 驗 + 收尾）

**Tier 1 Shell（最高槓桿,直接解 Chris 問題）**:
- `top-bar.tsx` 重寫:T1 collapse 掣(wire `toggleSidebar`)· T2 ⌘K(Input trailing)· T3 divider · T4 tenant pill(`bg-ok` 綠點 + `ricoh.onmicrosoft.com` mono)· T5 user menu(inline dropdown:`Avatar` brand + chevron + identity/Settings/Sign out;click-outside close;dev-bypass honest note)。
- `sidebar.tsx` 重寫:S1 SKU Catalog → 獨立 CATALOG section · S2 Administration → Users&roles + Integrations `/settings?tab=` deep-link(NavItem `collapsed` 現成)· S3 Roadmap 加 D365 · collapse 響應(icon-rail:aside w-64,label/section/brand text/user text 收起)。
- `settings.tsx` 重寫(令 S2 deep-link 生效 + ST1/2/3):讀 `useSearchParams` `?tab=` · **左 vertical sub-nav** 取代頂 tabs(ST1)· **全寬**內容(ST2)· Users&roles 加 **3 role 定義 block**(ST3;用戶表保持 honest empty)。

**Tier 2 Login**:`login.tsx` — brand 加 glyph + 副標(L4)· headline「…under control.」+ prototype subtext(L5)· footer line(L3)· stats **保 honest**(23 OpCos/10 SKUs/Live,唔用 fake「1,053 seats」)。**L1 split = audit false positive**(已 `w-[52%]`,原 transient screenshot 誤判;live 確認對)。

**Tier 3 頁內**:`overview.tsx` — card2「In procurement」派生 count + ClipboardList(O1)· Needs-attention「View all requests →」+ Drift summary「Open →」+「last checked」(O2/O3,HeaderLink)· `requests.tsx` — filter → **inverted pill**(`bg-fg text-bg`)取代 underline Tabs(R1)· `drift.tsx` — DETECTED → `formatDateTime` 絕對時間(DR4)。

**驗（真 tool output）**:
- **build 0 error**(1831 modules,587KB=ADR-0003 已知)· **lint exit 0**(--fix 2 prettier)· **web 8 test 綠**(app-shell test 仍過)。
- **live 對比(dev-bypass,tab 876 app vs 875 prototype)**:①shell **light + dark** 全對(topbar 5 件 + sidebar CATALOG/admin/D365)②user menu dropdown 開合正常(identity + Settings + honest note)③**collapse rail** 真收合 ④Login 對 prototype(split/copy/stats/footer)⑤Requests **pill filter light + dark**(inverted pill 反轉正確)⑥Settings 左 sub-nav + role block + deep-link highlight ⑦Overview card2 + links。

**honest gap 保持（唔造假,OD4）**:Tracked-SKUs(非 Licenses assigned,無 ledger)· Recent-activity empty · Requests My-queue(AUTH-3b)/ handler · Drift Resolve/per-OpCo scope · Detail AI-Assist · Users 表。→ 各自 backend/AUTH-3b phase。

**Retro**:
- ✅ Shell 一次修,全 7 頁即刻受惠 — 槓桿最高,直接解 Chris 報嘅 user icon + 更多。
- ✅ audit 有噪音(L1 split / L2 stats 係 transient screenshot 誤判)→ **落 code 前 re-verify 真 render** 修正,唔盲跟 audit(H7)。
- ✅ 全程 token-only(bg-fg/text-bg/bg-ok/accent-soft…)+ lucide + 既有 primitive 組合(NavItem collapsed / Card action / Avatar brand / Input trailing)→ 無新 token / dep(H6/H2)。
- ✅ honest gap 全部照留,唔喺 fidelity phase 造假數(H7/OD4)。
- ⚠️ 技術債:bundle 587KB(ADR-0003 已知,FE-bundle-split)。
- **下一步**:closeout doc-sync + commit(待指示)。真 role/表等 honest gap = AUTH-3b / backend endpoint。

**紀律自檢**:H6 = 本 phase 核心（token-only 還原);H3 = 只還原 prototype 既有,唔加新嘢,假 role toggle 真 wiring 留 AUTH-3b;R1 = audit read-only,修復前 approve inventory;H8 = prototype 密集 HTML 用 node slice 寫檔後 Read。
