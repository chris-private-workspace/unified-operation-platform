---
bug_id: BUG-000
title: "?status=active 都回埋 archived items"
severity: Sev2          # 篩選回錯結果 → 資料正確性 → Sev2（觸發 mandatory postmortem）
status: done
reported: 2026-01-12
reporter: "End-user"
affects_components: [C08]
spec_refs:
  - api-contract.md §list-endpoints
---

# BUG-000 — ?status=active 都回埋 archived items

> ⚠️ **範例實例(EXAMPLE)**,示範 `_templates/bugfix/` 模版點填。落新項目可刪走。真實 bug 由 `BUG-001` 開始。
> 呢個範例接住 `CH-000-example`(filter feature 出咗 regression),展示 Change → Bug 嘅呼應。
>
> **Report version**:1.0
> **Triage approver**:Chris（2026-01-12）

## 1. Symptom
`GET /items?status=active` 嘅結果入面夾雜咗 archived items。

## 2. Reproduction Steps
1. 建 2 個 active item + 1 個 archived item。
2. `GET /items?status=active`。
3. 回 3 個(應該只 2 個)—— archived 嗰個都返埋。

**Reproduction reliability**:Always
**Environment**:local dev + staging

## 3. Expected vs Actual
- **Expected**:只回 status == active 嘅 items（per CH-000 spec §2.1）。
- **Actual**:回全部,filter 冇生效。

## 4. Impact
- **Affected users / scenarios**:所有用 status filter 嘅 list 查詢。
- **Workaround available?**:Yes — client-side 再 filter（但正正係 CH-000 想消除嘅嘢）。
- **Data loss / corruption?**:No。
- **Security implication?**:No。

## 5. Severity Justification
**Sev2** per `PROCESS.md §4.4`：篩選功能回錯結果，影響資料正確性（「returns wrong results」屬 Sev2 example）。有 workaround 故非 Sev1。

## 6. Initial Diagnosis
- **Initial hypothesis**（triage）：filter 條件冇 apply 落 query，或者 param 冇讀到。
- **（投查中 2026-01-12）**：param 有讀到（422 test 過），但 handler 攞 `status` 之後冇 pass 落 repository query。
- **（Root cause confirmed 2026-01-12）**：`list_items()` 收 `status` 但 body 內 query 冇用佢 —— filter 參數接咗但漏咗 wire 入 SQL where clause。

## 7. Acceptance for Fix
- [x] Reproduction confirmed locally
- [x] Root cause identified
- [x] Fix implemented
- [x] Regression test added（先 fail、fix 後 pass）
- [x] Verified in env（re-run §2 repro）

## 8. Report Changelog
| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-01-12 | Initial triage | — | Chris |

---

**Lifecycle reminder**:Sev1/Sev2 → `postmortem.md` mandatory。
