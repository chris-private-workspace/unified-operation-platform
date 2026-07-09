# 01-planning — 規劃中樞

項目所有規劃、流程、pending 追蹤、決定登記嘅家。日常最高頻嘅一層。

## 住客

| 檔案 / 資料夾 | 作用 |
|---|---|
| `PROCESS.md` | 三軌工作流 source of truth(Phase / Change / Bug + binding rules) |
| `BACKLOG.md` | 中央 pending dashboard — 想知「有咩可以做」第一站 |
| `DEFERRED_REGISTER.md` | 反覆 / 結構性 defer 決定 + 恢復條件 |
| `RISK_REGISTER.md` | living 風險登記 |
| `PR_WORKFLOW.md` | PR 流程 SOP(**直接檔**,鏡射 EKP;由直推過渡到 PR 時填) |
| `_templates/` | **只放三軌模版**(phase / change / bugfix,鏡射 EKP) |
| `_TEMPLATE-track/` | 大型跨階段 track 模版(copy 做 `{track-name}/`) |
| `W{NN}-{name}/` | 每個 phase 一個 folder(plan / checklist / progress) |
| `{track-name}/` | 落地嘅 track subfolder(TRACKER / ROADMAP / FINDINGS) |

## `_templates/` 有咩(鏡射 EKP — 只放要 copy 好多次嘅三軌)
| 子目錄 | 模版 |
|---|---|
| `phase/` | plan · checklist · progress |
| `change/` | spec · checklist · progress |
| `bugfix/` | report · checklist · progress · postmortem |

> 大型 track 模版 → `_TEMPLATE-track/`;PR 流程 → 直接檔 `PR_WORKFLOW.md`(兩者都**唔入** `_templates/`,鏡射 EKP)。

## 慣例
- Phase folder **rolling JIT**:每 phase kickoff 先建,唔好一次過建晒未來 phase。
- Phase folder 命名 `W{NN}-{phase-kebab}`;`NN` 對應 sprint 序號。
- 大型 track(跨多 phase 嘅主題)開 subfolder 統籌 — 模版 + 概念見 `_TEMPLATE-track/README.md`。
