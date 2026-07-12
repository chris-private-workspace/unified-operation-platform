# W12 — FE Fidelity Audit（drift inventory）

> **日期**:2026-07-11 · **方法**:prototype `full-console.html`（localhost:8080）vs app（localhost:5173,dev-bypass）逐畫面截圖對比。
> **關鍵分類**:🔧 **真 drift（可修,無 backend 依賴）** vs 🚧 **honest gap（唔造假 — 需 backend endpoint / AUTH-3b,H7）**。
> 覆蓋:Shell（sidebar + topbar）+ Login + Overview + Requests list + Request detail + Drift + Catalog + Settings（7 畫面全過)。

---

## A. SHELL — Topbar（每頁都出,最高槓桿）

| # | 症狀 | Prototype 依據 | 級 | 類 |
|---|---|---|---|---|
| T1 | 缺 **sidebar-collapse 掣**（topbar 最左 ▐ icon button） | 左上 collapse toggle | P2 | 🔧 |
| T2 | 搜尋框缺 **⌘K** kbd hint（右側 mono badge） | search 右內 `⌘K` | P2 | 🔧 |
| T3 | role switch 同 theme toggle 之後缺 **垂直 divider**（1px×24px） | divider | P2 | 🔧 |
| T4 | 缺 **tenant 狀態 pill**（`--ok` 綠點 + `ricoh.onmicrosoft.com` mono,卡片） | 綠點 + tenant 名 | P1 | 🔧（tenant 名 = 靜態/config 常數） |
| T5 | 缺 **user menu**（28px `--accent`→`--accent-deep` gradient avatar + initials + chevron） | avatar + ▾ | **P1** | 🔧（reuse `Avatar` + `useCurrentUser`；← Chris 報嘅 icon） |

## B. SHELL — Sidebar

| # | 症狀 | Prototype 依據 | 級 | 類 |
|---|---|---|---|---|
| S1 | **SKU Catalog 擺錯 section**:app 放 OPERATIONS;prototype 有獨立 **CATALOG** section | section「CATALOG」 | P2 | 🔧 |
| S2 | **Administration nav 唔啱**:app = 單一「Settings」;prototype = 「**Users & roles**」+「**Integrations**」(deep-link 入 Settings sub-tab) | 2 個 admin nav | P1 | 🔧 |
| S3 | Roadmap 缺 **D365 Licenses (SOON)**（app 只 Offboarding + Cost Insights） | 3 個 roadmap | P2 | 🔧 |
| S4 | user card 副標:app 顯示 email;prototype 顯示 **role**（"Regional IT operator"） | role 副標 | P3 | 🚧（真 role 需 /me,AUTH-3b;dev-bypass 下顯示 dev 身份 OK） |

## C. Login（`/login`）

| # | 症狀 | Prototype 依據 | 級 | 類 |
|---|---|---|---|---|
| L1 | **左 brand panel 太闊**（~69% vs prototype ~52%）→ 右 form 被推到出界 | two-panel ~52/48 | **P1** | 🔧 |
| L2 | 左 panel **缺 3 stats**（24 operating cos / 1,053 seats managed / 10 SKUs tracked） | 3 mono stats | P1 | 🔧（靜態展示數） |
| L3 | 左 panel 缺底部 footer（"Consumes ServiceNow requests · writes to Microsoft Graph · reconciles the ledger"） | footer line | P2 | 🔧 |
| L4 | brand 缺副標（app 只 "LicenseOps";prototype "LicenseOps / Ricoh APAC · Regional IT"） | brand 副標 | P2 | 🔧 |
| L5 | headline / subtext copy 唔同（app "…unified." / prototype "…under control." + 唔同 subtext） | §0 copy | P2 | 🔧（對齊 prototype copy） |
| — | SSO button disabled + note、email/password 唔 wire | — | — | 🚧（AUTH-2a 誠實,未 app reg;唔改) |

## D. Overview（`/`）

| # | 症狀 | Prototype 依據 | 級 | 類 |
|---|---|---|---|---|
| O1 | KPI card 2 label:app「In progress / being fulfilled」;prototype「**In procurement / awaiting quote·vendor**」(+ 唔同 icon) | card 2 | P2 | 🔧（procurement count 派生得到） |
| O2 | 「Needs attention」缺 **View all requests →** link | header link | P2 | 🔧 |
| O3 | 「Drift summary」缺 **Open →** link + **last run** 時間戳 | header link + 副標 | P2 | 🔧（last run 有數） |
| O4 | KPI card 4:app「Tracked SKUs」;prototype「**Licenses assigned / 1,053 / +151 free**」 | card 4 | P2 | 🚧（需 BE-ledger-read seat 數,唔造假） |
| O5 | 「Recent activity」app = 空 state;prototype = populated feed | activity feed | P2 | 🚧（需 activity endpoint） |
| O6 | Needs-attention row 副標:app = email;prototype = **SKU 名**（+ action badge vs status badge） | row 副標 | P3 | 🚧（需 list 出 line-item SKU） |

## E. Requests list（`/requests`）

| # | 症狀 | Prototype 依據 | 級 | 類 |
|---|---|---|---|---|
| R1 | filter tab 樣式:app = 紅底線 text tab;prototype = **深色 pill**（active）+ count badge | pill filter | P2 | 🔧 |
| R2 | 缺 **My queue** filter tab | "My queue 5" | P2 | 🚧（需 /me wiring,AUTH-3b） |
| R3 | HANDLER 欄全 "Unassigned"（prototype 有 Alex Tan / Priya N.） | HANDLER 值 | P2 | 🚧（需 list expose handledBy） |

## F. Request detail（`/requests/:id`）— FE-2 建得忠實

| # | 症狀 | Prototype 依據 | 級 | 類 |
|---|---|---|---|---|
| D1 | AI Assist:app = coming-soon 空卡;prototype = **parsed 3 SKUs + confidence**（0.98…）preview | AI Assist card | P2 | 🚧（rawRequestText 唔 auto-parse,DESIGN §6） |
| — | sync-gate stepper / remark / line-item stepper / operational timeline | — | ✅ | 忠實,無 drift |

## G. Drift（`/drift`）— FE-3,忠實 + honest gap

| # | 症狀 | Prototype 依據 | 級 | 類 |
|---|---|---|---|---|
| DR1 | 缺 **Resolve** action 欄 | ACTION / Resolve | P2 | 🚧（無 manual resolve endpoint,reconcile 自動平） |
| DR2 | SCOPE 全 "Tenant"（prototype 有 per-OpCo RVN/RTH） | SCOPE 值 | P3 | 🚧（方案甲總量層,無 per-OpCo drift） |
| DR3 | SKU 副行 = partNumber（prototype = 描述 "3 seats consumed outside ledger"） | 副行 note | P3 | 🚧（DriftAlert.note 未寫） |
| DR4 | DETECTED = 相對 "2d"（prototype = 絕對 "Jul 7 06:00"） | 絕對時間 | P3 | 🔧（格式,小） |

## H. Catalog（`/catalog`）— ✅ 1:1 忠實

7 欄 + 真數 + category/BASE badge + Edit + 分頁 + footnote 全對。**無 drift。**

## I. Settings（`/settings`）

| # | 症狀 | Prototype 依據 | 級 | 類 |
|---|---|---|---|---|
| ST1 | tab 方向:app = **頂 horizontal tabs**;prototype = **左 vertical sub-nav** | 左 sub-nav | P2 | 🔧 |
| ST2 | 內容 **置中窄欄**（左右大量留白);prototype = 全寬 | full-width | P2 | 🔧 |
| ST3 | Users & roles / Integrations tab = 空 state;prototype = 用戶表 + 3 role 定義 | 用戶表 | P2 | 🚧（用戶表需 users-list endpoint;但 **3 個 role 定義靜態 block 可加** 🔧） |

---

## 修復建議分組（提 Chris 定優先）

**🔧 Tier 1 — Shell（最高槓桿,每頁受惠,無 backend 依賴)**:T1-T5 topbar（尤其 T4 tenant pill + T5 user menu)+ S1-S3 sidebar。→ **直接解決 Chris 報嘅問題 + 全站即刻貼近 mockup。**

**🔧 Tier 2 — Login**:L1 split ratio（P1)+ L2 stats + L3 footer + L4 brand 副標 + L5 copy。→ 登入第一印象。

**🔧 Tier 3 — 頁內細節**:O1/O2/O3（Overview label + links）+ R1（filter pill）+ ST1/ST2（Settings 版面)+ ST3 role 定義 block + DR4（時間格式)。

**🚧 唔造假（記低,唔喺本 phase 修 / 部分屬 AUTH-3b / BE endpoint)**:S4 role 副標 · O4 Licenses assigned(BE-ledger-read) · O5 activity feed · O6 SKU 副標 · R2 My queue(AUTH-3b) · R3 handler · D1 AI Assist · DR1-3 Drift resolve/scope/note · ST3 用戶表。→ 呢啲需 backend / AUTH-3b,**照 honest state,唔喺 fidelity phase 造假**。

---

## 待 Chris 定（OD）
- **OD1 — 修復範圍**:做晒 Tier 1+2+3(🔧)?定分階段(建議至少 Tier 1 shell + Tier 2 Login)?
- **OD2 — user menu 下拉**:MVP(avatar+chevron → 現有 Settings/sign-out)vs 完整 prototype Account menu?**建議 MVP。**
- **OD3 — Settings sidebar nav**:跟 prototype 拆「Users & roles」+「Integrations」deep-link(移除單一 Settings)?定保留「Settings」+ 加埋兩個 deep-link?
- **OD4 — 🚧 honest gap**:確認唔喺本 phase 造假(照現 honest state),留返各自 backend/AUTH-3b phase?
