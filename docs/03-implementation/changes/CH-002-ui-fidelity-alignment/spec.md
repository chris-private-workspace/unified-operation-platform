---
change_id: CH-002
title: "LicenseOps 前端 fidelity 對齊 — request 內頁 / requests 列表 / License Assets / Settings·Users"
status: done            # draft | proposed | approved | active | done | cancelled
created: 2026-07-16
target_completion: 2026-07-18
affects_components: [apps/web]
spec_refs:
  - docs/02-architecture/design-system.md（H6 Design Fidelity SSOT）
  - design_handoff_licenseops/prototype/full-console.html（視覺真相）
---

# CH-002 — LicenseOps 前端 fidelity 對齊

> **Spec version**：1.0（initial）
> **Owner**：Chris（decision）/ AI（draft）
> **Approved by**：Chris（2026-07-16）

## 1. Context (Why)

Chris 喺頁面手測期間，發現多個實畫面同 hifi mockup（`design_handoff_licenseops/prototype/full-console.html` = H6 視覺真相）唔一致。經 AI 逐段 **app code ↔ prototype markup** 比對確認，跨 **4 個畫面**有可觀嘅視覺 drift（部分係 UsersPanel 由 coming-soon stub 建成實頁時累積、部分係手砌 card 冇用共用 primitive、部分係作者對 DS-3 嘅詮釋同 prototype 相衝）。

本 change 記錄所有 diff + 決策，並將**純視覺 fidelity 修正**（低風險、組合既有 primitive、token-only）落地；功能性缺口（需 backend / 較大結構改動）明確劃出 scope 外，另行處理。

> **誠實限制（H7）**：以下 diff 全部由 code↔prototype markup 比對得出，**未 live render 逐頁 pixel 核對**（本地 web 未開 dev-bypass，AI 唔代入密碼登入）。落 code 後每項以 `ui-design` skill 自檢 + light/dark 實 render 驗收。

## 2. Scope (What)

### 2.1 Behavior Change（逐畫面 Before / After）

#### ① Request 內頁（`apps/web/src/pages/request-detail.tsx`）
| 元素 | Before（app 現狀） | After（對齊 mockup） |
|---|---|---|
| Request remark | `blockquote` 淨 `border-l-2 border-accent-line`，**無底色** | 灰底盒：`bg-hover` + `border-l`（accent-line 3px）+ 右上下圓角（`0 8px 8px 0`），內距 12–14px |
| Sync-gate / stage strip | 淨 `border-t border-border pt-[14px]` 分隔，**無底盒** | 灰底圓角盒：`bg-hover` + `border border-border` + `rounded-[10px]` + `p-[12px_14px]` |
| Operational history timeline **(A9)** | 每事件淨 dot、**無連接線** | 每事件 dot + 下方垂直連接線（`w-px flex-1 bg-border`；最後一項無線）|

#### ② Requests 列表（`apps/web/src/pages/requests.tsx`）
| 元素 | Before | After |
|---|---|---|
| Filter 掣 | `rounded-pill`（全圓）；inactive = `text-fg-muted`（**無邊框、透明**，淨 hover 有底） | bordered chip：inactive = `border border-border bg-card rounded-[8px]`；active 維持 inverted（`bg-fg text-bg`，border transparent）；count pill 保留 |

#### ③ License Assets（`apps/web/src/pages/assets.tsx` + `components/assets/*`）
| 元素 | Before | After |
|---|---|---|
| Mode switcher 容器 | `bg-hover p-[3px] rounded-lg`（灰底無邊） | `bg-card border border-border rounded-[8px] p-[2px]` |
| Mode 掣順序 | By OpCo, Platform（2 個） | Platform, By OpCo（, Compare — 見 scope 外）|
| Mode active 掣色 | 中性 `bg-card ... shadow` | **`bg-accent text-accent-fg`（紅 accent）** — 決策 B 已定 2026-07-16，貼 mockup |
| Platform 表：cell bar | 單段 bar（allocated-of-owned） | 雙段 bar（assigned + allocated 兩色疊）+ 表下顏色圖例 |
| By OpCo 表：頂部總數 | 3 張 StatCard，無 in-table 總數行 | 補 in-table「All SKUs · total」總行（`border-b-2 border-border-strong bg-hover`，數字由 `/ledger/stats` 出，唔前端捏造）|

#### ④ Settings / Users（`apps/web/src/pages/settings.tsx` + `components/settings/users-panel.tsx`）
| 元素 | Before | After |
|---|---|---|
| Settings 頁大標題 | 有 `Settings` h1（22px） | 移除（prototype 無此 h1，直接 sub-nav + 內容）|
| Section 卡 | 手砌 `rounded-[12px] border bg-card p-[18px]`，**無陰影** | 改用共用 `Card` primitive（`border + rounded + shadow`）|
| Users 表頭 | 「{n} users」+ Add-user 掣**浮喺卡外** | 併入 `Card` header：標題「Users & roles」+ 副題「Who can see and act on which OpCos」+ 掣 |
| 角色圖例卡 | **缺**（`settings.tsx` 註解仍寫「plus the static role reference」= stale） | 補 3 欄圖例卡（實際 role：Admin / Regional / OpCo IT，非 mock 的 auditor — H7）|
| Account tab 內容 **(A10)** | Profile / Sign-in / Password 三個唯讀 Section（無 avatar，欄位以 Input 呈現）| 貼 mockup layout：**Account 卡**（avatar 60px + 唯讀身份 name/email/role）+ **Role & access 卡**（Role / OpCo scope / Sign-in 行）+ Password 卡（local）。**唯讀誠實** —— 唔加 Job title / Phone / Save / Change photo / MFA（app 無此資料/功能，加咗即假 UI 違 H7）|

### 2.2 In Scope（本 change 會做）

**A 組 — 純視覺 fidelity（token-only、組合既有 primitive、無 backend、唔觸發 H1/H2/H3）：**
- A1 Request 內頁 remark 灰底盒
- A2 Request 內頁 sync-gate 灰底圓角盒
- A3 Requests filter 掣 → bordered card chip
- A4 Assets mode switcher 容器 card+border + 順序 Platform→By OpCo
- A5 Assets Platform 雙段 bar + 顏色圖例
- A6 Assets By-OpCo 補 in-table 總數行（數字取自 `/ledger/stats`，缺值顯示 `—`，不捏造）
- A7 Settings 移除多餘 h1 + Section 改用 `Card`
- A8 Users 表頭併入 Card header + 補角色圖例卡
- **A9**（追加 2026-07-16）Request 內頁 operational history timeline 加事件間垂直連接線
- **A10**（追加 2026-07-16）Settings Account tab 重砌貼 mockup layout（avatar + Role & access 卡），保持唯讀誠實

**B 組 — 決策已定（2026-07-16），併入實作：**
- B1 Assets mode active 掣色 = **accent 紅**（`bg-accent text-accent-fg`；決策 B = 選項甲）。連帶更新 `design-system.md` DS-3 澄清「segmented active 屬 accent 合法用途」（消除現有註解衝突）。A4 掣色一併改。

### 2.3 Out of Scope（明確排除，防 scope creep）

**C 組 — 功能缺口（需 backend / 較大結構改，H3 要另行 approve；本 change 唔掂）：**
- C1 Assets **Compare** 矩陣 view（SKU×OpCo available 熱圖）— 技術上可用現有 `useLedger` 資料純前端砌，但屬新 view/新 pattern（H6 要先傾），另開 task。
- C2 Assets Platform **Sync from tenant / Export / 每行 Manage·Adjust** action 掣 — 需真 endpoint（誠實缺口，維持現狀不假造）。
- C3 Settings **OpCos** admin tab（prototype Administration 第 3 項）— 需 OpCo CRUD endpoint。
- C4 Request 內頁 **AI Assist 真解析**（紫漸層 + parsed SKU）— 維持 coming-soon 誠實缺口。
- C5 By-OpCo **改成「一次一個 OpCo」模型**（prototype `isSingle` 用 OpCo picker）— 現行「全 OpCo 平表 + filter pill」係更早期決策，本 change 只補總數行，唔重構模型。
- C6 Assets Platform 表 category 分組 / subtotal 行 — 需 SKU category 資料齊全先做，暫排除（Platform 現已有 grand-total 行，維持）。

**唔屬 diff（現狀正確，唔改動）：**
- Requests「New request」primary 掣（W25 outbound 合法新增）
- Users 表多出嘅 Sign-in provider / Status「Must change」/ Edit·Reset action（AUTH-4b 接真 backend 嘅合法功能，非退化，唔還原成 static mock 5 欄）

## 3. Acceptance Criteria

> 每項落 code 後跑 `ui-design` skill 自檢 + light/dark 兩色實 render 驗收；token-only，無 hardcode 色值。

> 驗收結果見 `progress.md` Closeout（2026-07-16）：A1–A10 + B1 全部 ✅ code + build/eslint/85 test 綠；**light/dark 實 render 由 Chris browser 確認「頁面效果比較一致」**（含 settings padding `085dd78` + max-width `b8abede` 兩輪修正後）。

- [x] **A1** Request 內頁 remark 呈灰底（`bg-hover`）圓角盒 + accent-line 左邊；light+dark 對比 OK
- [x] **A2** Sync-gate strip 呈灰底（`bg-hover`）圓角盒 + border；帳號/sync 兩步狀態顯示不變
- [x] **A3** Requests filter：inactive 為 bordered card chip（`border-border`/`bg-card`/`rounded-[8px]`），active 維持 inverted；count 顯示不變
- [x] **A4** Assets mode switcher 容器 = `bg-card border`，順序 Platform→By OpCo；OPCO_IT（無 Platform）行為不變（照舊只見 By OpCo）
- [x] **A5** Platform 每行 SKU cell 為雙段 bar（assigned/allocated 兩色 + over→danger），表下有顏色圖例
- [x] **A6** By-OpCo 表頂有「All SKUs · total」行；數字 = 當前 filtered rows client-side 加總（真資料聚合、respects OpCo/search filter；無 filter 時 = `/ledger/stats`）；只在 filtered 有列時渲染，故無捏造/缺值問題
- [x] **A7** Settings 無 `Settings` h1；4 個 Section 用 `Card`（有陰影）；Account/Preferences/Users/Integrations 內容功能不變
- [x] **A8** Users tab 表頭併入 Card header（標題+副題+掣）；表下有 3 欄角色圖例卡；`settings.tsx` stale 註解更新
- [x] **B1** Assets active mode 掣 = `bg-accent text-accent-fg`（決策 B = 紅）；`design-system.md` DS-3 加 segmented-active accent 澄清 + changelog
- [x] **A9** Request 內頁 timeline 每事件 dot 下有垂直連接線串起（最後一項無線）；light+dark OK
- [x] **A10** Settings Account tab = Account 卡（avatar + 唯讀身份）+ Role & access 卡（Role/OpCo/Sign-in 行）+ Password 卡（local）；無 Job title/Phone/Save/photo/MFA（H7 唯讀誠實）；sign-out + 改密碼功能保留
- [x] `cd apps/web && npm run build` 綠、`npm run lint` 無 warning、`npm test` 不降（現 85）—— scoped eslint EXIT=0（repo-wide 紅屬 pre-existing CRLF，見 progress Day 1 Blockers）
- [x] 全部改動 trace 得返本 spec §2.1/§2.2（無順手改無關 code — §1.3 surgical）

## 4. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | 決策 B（紅 vs 中性）同 `design-system.md` DS-3「一 view 一 accent/primary」相衝 | High | Med | §6 決策 B owner 拍板；若採紅，同步喺 `design-system.md` 澄清「segmented active 可用 accent」（ui-design skill「走偏唯一合法路徑」）|
| R2 | 誤把誠實缺口（C 組）當 drift 一齊改 → 假造未接 backend 嘅資料（違 H7） | Med | High | C 組明確排除；A6 缺值顯示 `—` 不捏造 |
| R3 | 大範圍 UI 改動順手 refactor 無關 code（違 §1.3） | Med | Med | 每 commit 對一個 A 項；diff 逐行 trace |
| R4 | 雙段 bar / 總數行 涉數字，改到顯示邏輯（近 critical path 顯示層） | Low | Med | 只改顯示，數字仍源自既有 query/stats；唔掂後端計算 |

## 5. Effort Estimate

約 1.5–2 日（A 組 8 項，多為 primitive 組合 + token；B 待決策；驗收含 light/dark 逐頁）。

## 6. Dependencies + Decisions

### 決策 B — Assets mode active 掣色 ✅ 已定
- **選項 甲｜貼 mockup**：active tab 用 `var(--accent)` 紅（prototype `segStyle(active)` 實際如此）。→ 需同步 `design-system.md` 註明 segmented active 屬 accent 合法用途。
- **選項 乙｜維持中性**：active = 中性白卡+shadow（現 `assets.tsx` 引 DS-3 之選）。
- **狀態**：✅ **已定（2026-07-16，Chris）= 選項甲（紅 accent）**。B1 併入實作，A4 掣色一併改；連帶更新 `design-system.md` DS-3 澄清（R1：走偏唯一合法路徑 = 更新 SSOT）。

### 其他 dependency
- 無新 vendor/dep（H2 不觸發）；無 schema/API 改（H1 不觸發）。
- A6 依賴既有 `useLedgerStats`（已存在）。

## 7. Spec Changelog（deviation log）

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-16 | Initial draft（status: proposed） | Chris 手測發現跨 4 畫面 fidelity drift | — |
| 2026-07-16 | 決策 B 定案 = 紅 accent（選項甲）；B1 併入實作 + 連帶更新 design-system.md DS-3 | Chris（AskUserQuestion）| Chris |
| 2026-07-16 | A6 總行數字改用「filtered rows client-side 加總」取代原文「/ledger/stats」| stats 係全 scope 唔跟 OpCo/search filter，篩選時總行會誤導；filtered 加總更正確且仍係真資料聚合（H7） | AI（實作決定，符 spec 意圖）|
| 2026-07-16 | **範圍擴充**：追加 A9（timeline 連接線）+ A10（Settings Account tab 重砌）| Chris 手測後發現 timeline 線缺失 + Account tab 內容仍未貼 mockup（A7 只改卡殼）；兩者皆純視覺、同 CH-002 主題 → 併入而非另開 | Chris（approve 擴充）|

---

**Lifecycle reminder**：本 spec locked after status=approved。重大 deviation → §7 changelog。
**Gate reminder**：status 現為 `proposed`，**待 Chris review + approve 先 flip `approved` + 開始 code**（PROCESS R1.change）。
