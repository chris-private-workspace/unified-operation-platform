# Unified Operation Platform — Compact Summary Prompt(每個 session `/compact` 之前用)

> **用法**:copy「複製貼上區」入對話框送出即可。下方「設計說明」係畀維護者睇,唔使每次貼。
> **點解要項目專屬 compact**:通用 compact 唔檢查本項目 hard constraint(H1-H6)/ 紀律。以下違反屬「PR revert / phase 重做」級,必須每次 compact 強制驗證。

---

## ✂️ 複製貼上區(直接送出)

```
/compact

## Unified Operation Platform Compact 格式（繁中,≤1500 字）

### 0. Phase 座標
Phase W{NN}-{name} / Day Z / Branch main / Working tree（clean / dirty）/ origin 同步狀態

### 1. 本次主要任務（一句）

### 2. 已完成（按 workflow R1-R7 順序）
- Plan / spec / report + checklist + progress 變更：路徑 + 勾選 X 項
- Code 變更：新建 / 修改 / 刪除（每 file 標歸屬 apps/api module 或 apps/web feature）
- Doc 變更：architecture / design-system / module spec bump？ADR 寫咗？decision 同步？
- 測試：pass/fail 數 + linter + type-check + build
- Commits：hash + subject（每個對應 1 checklist 項 — R2）+ push 咗未

### 3. 紀律自檢（每項 ✅/⚠️/❌/N/A — 對應 CLAUDE.md §5 H1-H6）
1. **H1 架構**：改四層地基 / module 邊界 / Prisma schema / 已 lock 決策（方案甲對帳 / skuId 主鍵 / ledger 兩層數字 / stage 掛 line item / sync gate）？→ 有冇 STOP + ADR？
2. **H2 Vendor**：加新 runtime dep / 換 vendor 前有冇 ask + ADR？
3. **H3 Scope**：有冇滲入 out-of-scope（新模組 / LicenseOps 排除項：ticket 表單·審批·SLA·成本·offboarding·D365）？
4. **H4 Security**：無 hardcode / log secret（Graph secret·ServiceNow 帳密·DATABASE_URL）/ PII？
5. **H5 Test**：critical path（assignLicense / ledger 更新 / 對帳 / stage 推進·sync gate）有冇同步 test（Graph·ServiceNow mock）？
6. **H6 Design Fidelity**：apps/web UI 有冇 token-only（唔 hardcode / eyeball 色·距）、一 view 一 primary、lucide-only、light+dark、跑咗 ui-design skill？
7. Task classification（Phase / Change / Bug / Trivial 之前有 propose）
8. Behavioral baseline（think / simple / surgical / goal-driven）

### 4. 進行中 / 阻塞 / 🚧 延後項
（sacred rule：不可刪未勾 `[ ]` 項，必須標 🚧 + 理由 + target phase）

### 5. 關鍵決策 / open-question 變更
- Spec-aligned 決策（non-architectural）
- Open question resolved → 決策文件 + progress Day-N 同步（R4）
- ADR triggered（hard constraint approved）→ adr/NNNN-*.md
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
任何 H1-H6 violation hint / spec drift / vendor swap / out-of-scope 滲入 / 未經 ADR 嘅架構改動 / UI 走偏 → 第一句寫
```

---

## 設計說明（維護者睇,唔使每次貼）
- 同 `session-start.md` 配套(一個 session 開頭、一個結尾);slim 即時摘要係 `SESSION_SUMMARY.md`(hook 注入)。
- CLAUDE.md 大改(§5 H1-H6 / §10 binding rules / §1 baseline)時,§3 紀律自檢對應更新。
- PROCESS.md 大改(加 task type)時,§3 #7 對應更新。
- 幾時用項目 compact vs 通用:phase 期間 working session 用項目版;ad-hoc explore / 緊急 token 壓力用通用版。
