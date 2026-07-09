# {PROJECT_NAME} — PR Workflow SOP

> 幾時開始用:項目由「直推 main」過渡到「PR-based」時。分階段落地 —— 唔使一次過上齊 branch protection。

**最後更新**:YYYY-MM-DD ・ **Owner**:{owner}

## 0. 點解 solo 都要 PR
{traceability / CI gate / 未來協作預備 —— 一兩句}

## 1. 適用範圍(幾時要開 PR)

| 改動類型 | 走 PR? | 理由 |
|---|---|---|
| feat / fix / 架構改動 | ✅ | 要 review + CI gate |
| 純 docs / housekeeping | {✅ / 直推,揀一} | {你嘅取捨} |
| trivial(typo / 單行) | {通常直推} | |

## 2. 標準流程(階段 1 — solo self-merge)
```
1. 由 main 開 feature branch(feat/... / fix/... / docs/...)
2. 落 code + commit(對應 phase/change/bug progress)
3. push branch → 開 PR
4. 確認 CI green(見 §4)
5. rebase-merge 入 main(保持 linear history)
6. 退役 branch
```
**原則**:PR 要細 + 乾淨(one feature per PR);唔好 kitchen-sink。

## 3. PR body 要求
- Link to spec section / 對應 phase/change/bug folder。
- List test scenario。
- (前端改動)附 screenshots(對齊 design fidelity)。

## 4. CI Gate

| Workflow / Check | 觸發條件 | 做乜 |
|---|---|---|
| {ci-name} | PR + push | {lint / test / build} |
| {deploy-name} | push to main | {deploy — 若有} |

## 5. Merge 策略
- 揀一種 keep consistent(建議 **rebase-merge** 保 linear history)。

## 6. 階段路線圖

| 階段 | 內容 | 狀態 |
|---|---|---|
| 1 | Solo self-merge SOP | {當前} |
| 2 | `main` branch protection(禁直推 + require CI + require PR) | 候選 |
| 3 | 有協作者:CODEOWNERS + required reviewer + PR template | 候選 |

## 7. 常見坑
- {填你項目撞過嘅 — 例:長期直推令 origin/main 落後,正常化要先併返 main 再開 branch}
