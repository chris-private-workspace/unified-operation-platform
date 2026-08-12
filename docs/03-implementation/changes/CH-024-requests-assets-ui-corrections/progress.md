---
change_id: CH-024
spec_ref: ./spec.md
checklist_ref: ./checklist.md
status: in-progress     # in-progress | closed
---

# CH-024 — Progress

> Day-N entries + closeout summary。每 commit 對應一個 Day-N entry(R2)。

---

## Day 0 — 2026-08-12(spec + kickoff)

### Done

- Chris 一次過提五點 review → 逐點 trace 落 code 查證,**五點全部成立**
- 三個決定經 Chris 拍板:pagination 加 `«` `»` first/last · requests 頁一齊修 · badge `Headroom` → `Available`
- `spec.md` 寫好 → Chris **approve**(scope + acceptance 原樣,零 deviation)→ status `approved`
- `checklist.md` 由 spec §3 衍生
- Branch `feat/ch-024-requests-assets-ui` 由 `main`(`14dc0ee`)開出

### Decisions

- **五點合一個 CH,唔拆五個** —— 同一批 review、同一次驗證、加埋 < 1 日。拆開係官僚,而且 B / D / E 三項會撞同一批 test 檔
- **A 用 flag 唔刪 code** —— Chris 明講「暫時」;刪咗將來要靠 git history 撈返
- **C 條 event 順帶記低平台個父 REQ 號** —— 查證揭到 `schema.prisma:296-297` 刻意冇欄畀佢住(避免第二個 idempotency key 候選)⇒ 呢條 event 會係全系統唯一保存到佢嘅地方
- **outbound 路唔加同款 event** —— 佢個入口正正就係 A 要 disable 嘅 New request,加咗冇路驗。明知留低,寫入 spec §2.2 而唔係靜靜略過

### 查證過程揭到（值得記低）

1. **問題 3 唔係 UI 美化,係畫面同 schema 打對台** —— `schema.prisma:286-300` 自己寫住「mixing them up is the easiest mistake to make here」,而現行 UI **令人一定會 mix up**(只顯示 onboarding 個號,仲要出兩次)
2. **問題 4 後半係真 bug 兼自相矛盾** —— `assignable` 唔睇 line stage,而同一屏頂部 `deriveStatus` 一早啱 ⇒ 派完之後上面 `Completed`、下面 `Ready to assign`
3. **`raiseLicenceRequest` 只喺 `intakeFlat` 一條路** —— `intakeNative` / `intakeCanonical` 完全冇 call(grep 全檔確認)。⇒ 新 event 覆蓋面係「n8n 真實生產路」,唔係「所有 intake」
4. **問題 5 真正嘅落差唔係個名** —— 係 `Assigned` = 平台帳面數而唔係 M365 真實用量(`consumedUnits` 有,但表冇顯示)。呢個係 Drift 頁存在嘅理由。已寫入 spec §6,改動未批

### Blockers

- 無

### Effort

- Planned:4–6h(全單);Actual(Day 0 spec + kickoff):≈ 1h

### Commits

| Hash | Subject |
|---|---|
| _(pending)_ | `docs(planning): CH-024 spec approved + checklist` |

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

**End of CH-024 progress**
