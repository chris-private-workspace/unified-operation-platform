# {PROJECT_NAME} — Compact Summary Prompt(每個 session `/compact` 之前用)

> **用法**:直接 copy「複製貼上區」呢段入 AI agent 對話框送出即可。下方「設計說明」係畀維護者睇,唔需要每次貼。
> **點解要項目專屬 compact**:通用 compact 唔檢查項目 hard constraint / 紀律。以下違反屬「PR revert / phase 重做」級,必須每次 compact 強制驗證。

---

## ✂️ 複製貼上區(直接送出)

```
/compact

## {PROJECT_NAME} Compact 格式（{語言},≤1500 字）

### 0. Phase 座標
Phase W{NN}-{name} / Day Z / Branch / Working tree（clean / dirty）

### 1. 本次主要任務（一句）

### 2. 已完成（按 workflow R1-R7 順序）
- Plan / spec / report + checklist + progress 變更：路徑 + 勾選 X 項
- Code 變更：新建 / 修改 / 刪除（每 file 標歸屬 Cn component）
- Doc 變更：component design note bump？ADR 寫咗？decision 同步？
- 測試：pass/fail 數 + linter + type-check + build
- Commits：hash + subject（每個對應 1 checklist 項 — R2）

### 3. 紀律自檢（每項 ✅/⚠️/❌/N/A）
1. Architectural change（H-架構 — 改 core component / storage？→ ADR？）
2. Vendor / dependency lock（H-vendor — 新 dep 前 ask？）
3. {你嘅第三條 hard constraint}
4. Scope / Tier 邊界（無滲入 out-of-scope feature）
5. Security（無 hardcode secret / PII / plaintext prompt log）
6. Component spine（每 file 明確歸屬 1 Cn — 無 cross-component scattering）
7. Task classification（Phase / Change / Bug / Trivial 之前 propose）
8. Behavioral baseline（think / simple / surgical / goal-driven）

### 4. 進行中 / 阻塞 / 🚧 延後項
（sacred rule：不可刪未勾 `[ ]` 項，必須標 🚧 + 理由 + target phase）

### 5. 關鍵決策 / open-question 變更
- Spec-aligned 決策（non-architectural）
- Open question resolved → 決策文件 + progress Day-N 同步（R4）
- ADR triggered（若 hard constraint approved）→ adr/NNNN-*.md
- Plan / spec deviation → changelog（R3）

### 6. Commit ↔ checklist mapping
| Hash | Subject | Checklist item |
|---|---|---|

### 7. 下一步
- Next session 第 1 件事
- 本 phase 剩 X items
- 下個 phase plan 狀態（rolling JIT：當前收尾才寫）
- Carry-overs（progress retro / 🚧 延後 / RISK 🔴）
- 即將觸發嘅 hard gate

### 8. Rolling Planning 自檢
☐ 冇預寫多個未來 phase folder（只當前 active + 下一個 draft）
☐ 冇跳過 plan/spec/report 直接 code（R1）
☐ 冇刪未勾 `[ ]` 項（只 →[x] 或加 🚧 + reason）
☐ Daily commit 對應 progress Day-N（R2）
☐ 架構-adjacent 決定 → ADR（R5）
☐ Pending 變動 → BACKLOG（R7）

### 9. 風險 / Risk Register 變更
- 新加 risk？status 變（🟢 mitigated / 🟡 partial / 🔴 active / ⚫ accepted）？
- （RISK_REGISTER.md living doc — 有變即更新）

### 10. 紅旗（若有）
任何 hard constraint violation hint / spec drift / vendor swap / out-of-scope feature 滲入 / 未經 ADR 嘅架構改動 → 第一句寫
```

---

## 設計說明（維護者睇,唔使每次貼)
- 同 `session-start.template.md` 配套(一個 session 開頭、一個結尾)。
- CLAUDE.md 大改(§5 hard constraints / §10 binding rules / §1 baseline)時,§3 紀律自檢對應更新。
- PROCESS.md 大改(加 task type)時,§3 #7 對應更新。
- 幾時用項目 compact vs 通用 compact:phase 期間 working session 用項目版;ad-hoc explore / 緊急 token 壓力用通用版。
