# docs/ — 文件分層總索引

> 呢個資料夾係 `{PROJECT_NAME}` 嘅文件中樞。**鏡射真實項目佈局** —— 主 spec 喺 docs 根,13 層各司其職。
> 用 `NN-` 數字前綴令資料夾按「生命週期 / 重要性」排序。

## docs 根層(singleton spec)
| 檔案 | 作用 |
|---|---|
| `architecture.md` | **主 spec**(WHAT + WHY)—— CLAUDE.md / catalog / phase plan 都 cite |
| `decision-form.md` | Open questions 登記(CLAUDE.md §8 引用) |
| `setup.md` | 本地 dev 環境 setup |

## 13 層
| 層 | 作用 | 主要住客 |
|---|---|---|
| **01-planning** | 規劃中樞 | `PROCESS.md` / `BACKLOG.md` / registers / `PR_WORKFLOW.md` / `_templates/` / phase folders `W{NN}-*/` / track folder |
| **02-architecture** | 架構真理 | `COMPONENT_CATALOG.md` / `components/` / audit / design docs |
| **03-implementation** | 改動 & 修復實例 | `changes/CH-NNN/` / `bugs/BUG-NNN/` / 實作 memo |
| **04-review** | 審查記錄 | code / security review |
| **05-usage** | 內部使用文檔 | 開發者 how-to |
| **06-reference** | 參考素材 | sample / playbook |
| **07-skills** | 項目專屬 AI skill 說明 | anti-pattern checklist |
| **08-user-guide** | 終端用戶手冊(對外) | 操作 / 配置 / troubleshooting |
| **09-analysis** | 深度分析報告 | 一次性調查 / research |
| **10-development-log** | 開發日誌 | daily / weekly |
| **11-env-resources-detail** | 環境資源細節 | 資源清單(無 secret) |
| **12-ai-assistant** | AI 協作素材 | session-start / compact / SESSION_SUMMARY / bootstrap 腳本 |
| **adr** | 架構決定記錄 | `README.md` index + `NNNN-*.md` |

## 模版落位(鏡射 EKP:template 只喺 `01-planning/_templates`,其餘層用 `_TEMPLATE-*.md` 或直接 singleton)
| 類型 | 位置 |
|---|---|
| Phase / Change / Bug 三軌(copy 好多次) | `01-planning/_templates/{phase,change,bugfix}/*.md.tpl` |
| 大型跨階段 track | `01-planning/_TEMPLATE-track/`(copy 做 `{track-name}/`) |
| Component catalog(singleton) | `02-architecture/COMPONENT_CATALOG.md`(直接填) |
| Component design note(repeated) | `02-architecture/components/_TEMPLATE-component-note.md` |
| Audit / Design doc | `02-architecture/_TEMPLATE-{audit,design-doc}.md` |
| Implementation memo | `03-implementation/_TEMPLATE-memo.md` |
| Review / How-to / Skill / User-guide / Analysis / Research / Resources | 各層 `_TEMPLATE-*.md` |
| Daily / Weekly log | `10-development-log/{01-daily,02-weekly}/_TEMPLATE-*.md` |
| ADR | `adr/0000-TEMPLATE.md` |

## 填好嘅參考範例(EKP「保留一個 reference」pattern)
- `01-planning/W01-example/` — 範例 phase
- `03-implementation/changes/CH-000-example/` + `bugs/BUG-000-example/` — 範例 change / bug

## 導航捷徑
- 有咩 pending → `01-planning/BACKLOG.md` · 流程 → `01-planning/PROCESS.md` · 主 spec → `architecture.md` · 架構決定 → `adr/README.md`
