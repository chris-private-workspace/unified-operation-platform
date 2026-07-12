---
phase: W12-fe-fidelity-harden
name: "FE fidelity audit + harden — shell + 6 pages 對齊 prototype"
sprint_week: W12
backlog_id: FE-fidelity
start_date: 2026-07-11
end_date: TBD
status: closed           # draft | active | closed — 全 🔧 真 drift（Tier 1+2+3）修完 + light+dark live 驗;G1-G5 全過;🚧 honest gap 明確 out（OD4,各自 backend/AUTH-3b 追蹤）
spec_refs:
  - docs/02-architecture/design-system.md（設計系統 SSOT + anti-drift DS-1~12）
  - design_handoff_licenseops/design-system/ui_kits/licenseops/full-console.html（視覺真相）
  - CLAUDE.md §5 H6（Design Fidelity — token-only / 1 primary / lucide / light+dark）
  - .claude/skills/ui-design（DS 自檢）
prior_phase: W11-auth-opco-scope
---

# Phase W12 — FE fidelity audit + harden

> **Plan version**:1.0（draft）· **Owner**:Chris Lai
> **緣起**:Chris 發現 app UI「沒有完全跟蹤 mockup」（例:topbar 右上角 user icon 缺失）。初步查證 topbar 已缺 4 樣（divider / tenant 狀態 pill / user menu avatar+chevron / ⌘K hint）→ 疑非孤例。
> **本 phase = 系統性 fidelity audit（read-only,先出 drift inventory)→ Chris approve 修復優先 → harden。** 唔即改 code（R1:implementation 前有 approved 清單）。

## 1. Scope

### In
- **Audit（read-only）**:render prototype（`full-console.html`,local http）+ 跑起 app（5173,dev-bypass）→ 逐個對比 **shell（sidebar + topbar）+ 6 實畫面（Overview / Requests / Request detail / Drift / Catalog / Login / Settings）**,列出所有 drift（缺元件 / 錯 layout / 缺 state / 錯 token）→ 寫 `AUDIT.md` inventory（每項:screen · 症狀 · prototype 依據 · 嚴重度 · 修法）。
- **Harden**:按 approved 優先次序修 drift,**逐個 screen 修完 re-verify light+dark 對 prototype + 跑 ui-design DS 自檢**。全部 token-only（DS-1),reuse 既有 primitive / token。

### Out（H3）
- **新 feature / 新畫面**（只對齊既有 prototype,唔加 mockup 冇嘅嘢）。
- **AUTH-3b 真 role wiring**（假 `role` toggle → 真 /me role）—— 屬 AUTH-3b,本 phase 只還原 prototype **視覺**（toggle 照 prototype 擺,唔動真 role 邏輯)。
- **後端 / API 改動**。

## 2. 已知 seed（topbar,audit 前初步發現）
1. 缺垂直 divider（`1px × 24px` border）。
2. 缺 tenant 狀態 pill（`--ok` 綠點 + tenant 名 mono,卡片）。
3. 缺 user menu（28px `--accent`→`--accent-deep` gradient avatar + initials + chevron 下拉 Account）。
4. 搜尋框缺 `⌘K` kbd hint。
> avatar 可 reuse 既有 `Avatar`（variant brand,已用 `--accent-deep` DS-7 例外)+ `useCurrentUser`;無需新 token / 新 dep。

## 3. Approach（audit 方法）
- **視覺真相**:`full-console.html` 本地 http server render（claude-in-chrome 唔食 file://,memory 避坑）。
- **app**:api 3100（dev-bypass）+ web 5173（`VITE_AUTH_DEV_BYPASS=true`）；每畫面 seed 真數（memory:本地 seed 幾行）。
- **對比**:逐畫面 prototype vs app 截圖 + DOM 結構（screenshot busy → JS DOM 量度,W08 pattern）；drift 分級 P1（結構缺件/明顯錯）· P2（間距/次要）· P3（微調）。
- **精準錨定**:prototype 密集單行 HTML → node slice 抽 screen 區塊比對（H8:寫檔後 Read）。

## 4. Deliverables
- **D1 — Audit**:`AUDIT.md` drift inventory（shell + 6 畫面,分級 + 修法 + prototype 依據）。**← 出咗先 approve 修復清單。**
- **D2…Dn — Harden**（fix 清單 approve 後填):每項 = 改 component + re-verify light+dark + ui-design DS。**逐 screen 一個 checklist 項。**
- **Dn+1 — Verify**:全部 touched screen light+dark 對 prototype;既有 web test 綠;build/lint。
- **Closeout**:progress retro · BACKLOG · memory · commit（待指示）。

## 5. Phase Gates
- **G1** `AUDIT.md` inventory 完整（shell + 6 畫面逐個過,無遺漏)+ Chris approve 修復優先。
- **G2** 每 touched screen light+dark 1:1 對 prototype（截圖 / DOM 驗）。
- **G3** ui-design DS-1~12 全過（token-only,無 hardcode / eyeball,1 primary,lucide,light+dark)。
- **G4** 無新 token / 新 dep（要新 → STOP 問 owner,更新 design-system.md;H6/H2)。
- **G5** 既有 web test 綠 + build 0 error + lint clean。

## 6. Decisions / OD（待 audit 後 + approve）
- **OD1（audit 後）**= 修復優先次序 + 邊啲 P3 微調可 defer（避免無止境調 pixel)。
- **OD2** = user menu 下拉範圍:MVP（avatar + chevron → Account/Settings/Sign out 現有動作)vs 完整 prototype menu。**default MVP,audit 時定案。**

## 7. Risks / 誠實限制
- 假 `role` toggle 照 prototype 還原視覺,但真 role wiring 留 AUTH-3b（唔喺此扮真)。
- Login/Settings 已於 AUTH-2a 建（對 handoff §0/§1),audit 確認佢哋 fidelity;其餘 4 畫面（FE-1/2/3)對 prototype 建過,audit 揪出 regression / 遺漏。
- 避免 scope creep:只還原 prototype 既有嘢,唔「順手」加靚（§1.3 surgical + H3)。

## 8. Changelog
- 1.0（2026-07-11)— draft;topbar seed 4 項已錄;待 approve 開 audit（D1）。
