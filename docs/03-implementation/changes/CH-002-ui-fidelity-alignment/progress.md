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
