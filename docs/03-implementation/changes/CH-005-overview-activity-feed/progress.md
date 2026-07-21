---
change_id: CH-005
spec_ref: ./spec.md
checklist_ref: ./checklist.md
status: in-progress     # in-progress | closed
---

# CH-005 — Progress

> Day-N entries during execution + 結尾 closeout summary。
> 每 commit 必須對應一個 Day-N entry mention(R2 binding rule per PROCESS.md §5)。

---

## Day 1 — 2026-07-21

### Done
- (執行中)

### Decisions

**開工前兩個前置,Chris 2026-07-21 拍板:**

- **D1 = ADMIN-only,non-admin 隱藏整張 card**。零後端改動,`/admin/audit` 原封不動 —— ADR-0009 Decision 7 連帶義務 ① 唔可以為咗做 feed 而放寬。
- **D2 = 先做 `AuditLog` 版,措辭誠實反映內容**。

**D2 背後嘅查證(spec §1.1 詳述)**:prototype 示範嗰四條活動全部係 `RequestEvent` / `DriftAlert` 嘅嘢,`AuditLog` 記嘅係另一組(role 變更 / 登入 / catalog / import / drift **resolve**)。而 `RequestEvent` **只有 write、零 read surface**,index 亦係 `[requestId, createdAt]` 冇 global 時間軸 —— 貼 prototype 語意 = 新 endpoint + 新 index(schema change)= 一個細 phase,唔係一個 Change。

**衍生決定(AI 判斷,spec 已寫明 Chris 可推翻)**:
- non-admin 走「隱藏」而 `/audit` 頁走「restricted state」—— **刻意唔一致**:Overview 係日常主畫面(長期擺個「你冇權」= 噪音),`/audit` 係專程去嘅(需要解釋點解入唔到)。
- 顯示 **6** 條(prototype 示範 4 條,但嗰個 card 右邊有嘢頂住;Overview 呢張佔成行闊度)。無其他根據。

### Blockers
- 無

### Effort
- Planned:3–4h;Actual:_(待填)_;Variance:_(待填)_

### Commits
| Hash | Subject |
|---|---|

---

## Closeout(填於 status=closed)

### Acceptance verification
_(待填)_

### Effort summary
| Day | Planned (h) | Actual (h) | Variance |
|---|---|---|---|

### Lessons
_(待填)_

---

**End of CH-005 progress**
