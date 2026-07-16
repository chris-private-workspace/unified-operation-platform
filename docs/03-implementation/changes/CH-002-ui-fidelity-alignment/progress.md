---
change_id: CH-002
spec_ref: ./spec.md
checklist_ref: ./checklist.md
status: in-progress     # in-progress | closed
---

# CH-002 — Progress

> Day-N entries during execution + 結尾 closeout summary。
> 每 commit 必須對應一個 Day-N entry mention（R2）。

---

## Day 0 — 2026-07-16（draft，未 code）

### Done
- 完成跨 4 畫面 fidelity audit：逐段比對 app code ↔ prototype markup（`design_handoff_licenseops/prototype/full-console.html`），unescape `.dc.html` 擷取 settings / requests / request-detail / assets 段落。
- 起草 `spec.md`（status: proposed）+ `checklist.md`，記低所有 diff（§2.1）+ 分類 A（純視覺，會做）/ B（決策）/ C（功能缺口，scope 外）。

### Decisions（已確立）
- 分類：request-detail remark/sync-gate 灰底、requests filter chip、assets mode 容器/順序/雙段 bar/By-OpCo 總數行、settings/users 用 Card + 角色圖例 → **A 組會做**。
- Compare 矩陣 / Sync·Export·Manage·Adjust / OpCos CRUD tab / AI 解析 / By-OpCo 單-OpCo 模型重構 → **C 組 scope 外**（誠實缺口，H7 唔假造）。
- 確認：Requests「New request」掣、Users 多欄（provider/Edit/reset/must-change）= 合法功能，**唔還原**。

### Decisions（已定）
- **決策 B**：Assets mode active 掣色 = **紅 accent（選項甲，貼 mockup）**（Chris，AskUserQuestion，2026-07-16）。B1 併入實作，A4 掣色一併改；連帶更新 `design-system.md` DS-3 澄清 segmented-active accent（R1 走偏合法路徑）。spec §2.1/§2.2/§3/§6/§7 已同步（R4）。

### Blockers
- **Gate**：spec status = `proposed`，待 Chris approve → flip `approved` 先落 code（R1）。

### Effort
- Planned：—（audit + doc）；Actual：~audit 已完成；Variance：—

### Commits
| Hash | Subject |
|---|---|
| _(pending)_ | docs(planning): open CH-002 UI fidelity alignment（spec/checklist/progress） |

---

## Day 1 — 2026-07-16（A 組 + B1 實作）

### Done
- spec `proposed → approved`（Chris）；branch `feat/web-ch-002-ui-fidelity`。
- **A1/A2**（`request-detail.tsx`）：remark → `bg-hover` 圓角盒 + `border-l-[3px] accent-line`；sync-gate strip → `bg-hover` + `border` + `rounded-[10px]` 灰底盒（connector 40→60px 對齊 prototype）。
- **A3**（`requests.tsx`）：filter 掣 → `rounded-[8px]` bordered chip（inactive `border-border bg-card`，active 維持 `bg-fg/text-bg` borderless）+ 更新 stale 註解。
- **A4/B1**（`assets.tsx`）：mode switcher 容器 `bg-card border rounded-[8px]`；順序 Platform→By OpCo；active tab **`bg-accent text-accent-fg`（紅，決策 B）**；更新舊「neutral/DS-3」註解。
- **A5**（`platform-view.tsx`）：`OwnedBar` 單段 → 雙段（`bg-info` assigned + `bg-border-strong` alloc-not-assigned；over → `bg-danger`）+ 表下 3 色圖例。
- **A6**（`by-opco-view.tsx`）：table 頂加「All SKUs · total」行（`border-b-2 border-border-strong bg-hover`），數字 = filtered rows client-side 加總（**R3 deviation**：原 spec「/ledger/stats」改為 filtered 加總，因 stats 全 scope 唔跟 filter → 篩選時誤導；已 log spec §7）。
- **A7**（`settings.tsx`）：移除 page-level `Settings` h1 + flatten wrapper；`Section` → 共用 `Card` primitive（得 resting shadow）；更新 stale 檔頭註解。
- **A8**（`users-panel.tsx`）：表頭併入 `Card` header（title/subtitle/Add-user action）+ 表下角色圖例卡 —— **用真實 3 role（Admin/Regional/OpCo IT）而非 mock 的 Read-only auditor（H7 唔誤導）**。
- **DS-3 澄清**（`design-system.md §0.2`）：active segmented-control tab 用 accent 屬合法（view 切換器非 action button；決策 B）。

### Decisions
- A6 總數來源：filtered 加總 > /ledger/stats（見上，R3）。
- A8 角色圖例：反映 app 真 role 而非照抄 mock（H7）。

### Verify（真 tool output）
- `npm run build`：綠（tsc + vite，1847 modules，最大 chunk 254KB « 500，無 warning）。
- `npx eslint <7 changed files>`：EXIT=0 clean。
- `npm test`：**85 passed**（不降）。
- **未做**：light/dark 實 render 對照（本地 web 未開 dev-bypass，AI 唔登入；待 Chris 瀏覽器核對）。

### Blockers
- 無阻塞。惟 repo-wide `npm run lint` 因 **pre-existing** `ledger.ts`/`ledger.test.ts` CRLF（HEAD 存 CRLF，非本 change 引入）而紅 → 已 `git checkout` revert 不動；本 change 7 檔 scoped-lint clean。

### Effort
- Planned：~1.5 日；Actual：~數小時（A 組多為 primitive/token 組合）；Variance：−。

### Commits
| Hash | Subject |
|---|---|
| 4da1793 | docs(planning): open CH-002（spec/checklist/progress + BACKLOG） |
| _(next)_ | fix(web): CH-002 A 組 + B1 fidelity 對齊（4 畫面） |

---

## Day 2 — 2026-07-16（範圍擴充 A9 + A10）

### 緣起
- Chris 手測回報 3 問題：①timeline 連接線缺失 ②catalog 未能 edit + assets 分類 ③settings 仍唔貼 mockup。
- **客觀確認 settings 問題 = (b) 改咗但仍未夠貼**：curl 行緊嘅 vite dev server（5173）攞 `settings.tsx` module → 已含我改嘅版本（`import Card`、`flex gap-[24px] p-[24px]`、無 `text-[22px]` h1）→ 證 code live，非 server stale。剩下 = Account tab 內容結構未砌。
- 分流：①③純視覺 → **併入 CH-002**（本擴充）；②catalog edit 需 backend → 另開 CH-003（待 approve）。Chris approve 擴充。

### Done
- **A9**（`request-detail.tsx`）：operational history timeline 由「淨 dot」→ 每事件 dot + 下方垂直連接線（`w-px flex-1 bg-border`，最後一項無線；content `pb-[14px]` 取代 gap）。
- **A10**（`settings.tsx`）：Account tab 重砌貼 mockup layout —— **Account 卡**（`Avatar` 60px + name/email(mono)/role badge，唯讀）+ **Role & access 卡**（`Row` label→value：Role / OpCo scope[code mono] / Sign-in；保留 Sign out 掣）+ **Password 卡**（local）。**唯讀誠實**：唔加 Job title/Phone/Save/Change photo/MFA（app 無此資料/功能，加咗即假 UI 違 H7）。移除變 unused 的 `Input` import。

### Decisions
- A10 唯讀誠實：只砌 mockup layout，唔照搬可編輯欄 + Save（app profile IT-managed 唯讀；假控件違 H7）。
- 問題 2（catalog edit）另開 CH-003（需 `PATCH /license/catalog/:id`，觸 H1）—— 唔混入本純視覺 change。

### Verify（真 tool output）
- `npm run build`：綠（14.8s，無 chunk warning）。
- `npx eslint request-detail.tsx settings.tsx`：EXIT=0。
- `npm test`：**85 passed**（不降）。
- **未做**：light/dark 實 render 對照（同 Day 1，待 Chris 瀏覽器核對）。

### Commits
| Hash | Subject |
|---|---|
| _(next)_ | fix(web): CH-002 A9 timeline connector + A10 settings Account restructure |

---

## Closeout（填於 status=closed）

### Acceptance verification
_(待實作後填 — 對 spec.md §3)_

### Effort summary
| Day | Planned (h) | Actual (h) | Variance |
|---|---|---|---|

### Lessons
- _(待填)_

---

**End of CH-002 progress**
