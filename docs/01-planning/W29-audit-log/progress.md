---
phase: W29-audit-log
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: in-progress    # in-progress | closed
---

# Phase W29 — Progress

> Daily progress + 結尾 retro。
> 每 commit 必須對應一個 Day-N entry mention(R2 binding rule per PROCESS.md §5)。

---

## Day 0 — 2026-07-20: Kickoff

**Action**:Phase W29 kickoff(audit rollout **item 3**)

- Templates copied from `_templates/phase/`
- `plan.md` filled,status=**`draft`**(**未 active** —— 待 Chris approve §9 三點,R1 gate)
- `checklist.md` derived from plan deliverables(F0 gate + F1 基建 + F2a/b/c 分組 hook + F3 endpoint + F4 前端 + Verify)
- Branch `feat/audit-log`,由 `main`(`3f326fb`)開出

**前置**:
- **ADR-0009 Accepted**(2026-07-20;OQ-1 記白名單 before/after · OQ-2 = P-B)
- **W28 完成**(rollout item 2)—— 權限矩陣;其 unguarded test 會**自動覆蓋**本 phase 新增嘅 endpoint,免費迴歸網
- 本 phase 完成後,Chris 四項 audit 需求全部落地(①用戶列表 ②角色 ③權限可訪問功能 = W28 ④**操作記錄 = 本 phase**)

**本 phase 定位 —— 同 W28 相反,要特別小心**:

W28 係**零行為改動**(純 derive 現有 `@Roles`)。本 phase **會 additive 改 schema、會 hook 入 6+ 個既有 write service、會改佢哋嘅 transaction 邊界**。風險高一級。

**已識別最高風險 R1**:`$transaction` 改造觸及多個既有 service。緩解 = F2 分三組(identity / auth / config+bulk)逐組 commit,**每組完成即跑全 api test,一紅即停,唔繼續落下一組**。既有 223 test 就係迴歸網。

**🔴 硬紅線 G2**:`passwordHash` / `tokenHash` 永不入 audit。做法 = allow-list(唔用 deny-list)+ 永久 blacklist 雙重保險 + **H4 test 寫喺 hook 之前**(先有網,再落刀)。

**主動提出嘅一處收緊**(plan §8):ADR-0009 Decision 5 只講 `before`/`after` 要白名單,**冇講 `metadata`**。若唔管,`metadata` 就係繞過白名單嘅逃生門。本 phase 令 `metadata` 同樣受固定 key set 約束;closeout 建議喺 ADR-0009 補註。

**Commit**:`<pending>` — `chore(planning): kickoff W29 audit-log`

**⏸️ 等 Chris approve plan §9 三點先開 F1**(R1)。

---

## Day 1 — 2026-07-20

### Done
- _(未開始 — 等 approve)_

### Decisions / Open-Questions Resolved
- _(待填 — Q1/Q2/Q3)_

### Blockers
- **plan status=draft,等 Chris approve**(R1 gate,刻意唔開工)

### Actual vs Planned Effort
| Deliverable | Planned (h) | Actual (h) | Variance |
|---|---|---|---|
| F1 | 3 | | |
| F2 | 6 | | |
| F3 | 2.5 | | |
| F4 | 4 | | |

### Commits
- _(待填)_

---

## Day 2 — 2026-07-21

(same structure)

---

## Day 3 — 2026-07-22

(same structure)

---

## Retro(填於 phase 結束)

### What worked
- _(待填)_

### What didn't work / unexpected friction
- _(待填)_

### Surprises / discoveries
- _(待填)_

### Carry-overs to W30
- _(待填)_
- 預期:**audit retention**(R5 — 本 phase 刻意唔做,避免過早優化)→ 登 BACKLOG
- 預期:**FE-activity**(Overview activity feed)由本 phase 解封,但屬另一個 candidate

### ADR triggers
- 預期**無新 ADR** —— ADR-0009 已完整涵蓋
- 但 plan §8 `metadata` 白名單收緊 → 建議喺 ADR-0009 補一句註(唔係新 ADR,係補完既有決定嘅邊界)

### Phase Gate result
- G1–G8:_(待填)_

### Phase status
- Closeout commit:_(待填)_
- Frontmatter status flipped to `closed`
- BACKLOG synced(R7)
- Phase W30 kickoff trigger:預期 = **INTEG-1**(connector 狀態 + test connection,rollout item 4)

---

**End of W29 progress**
