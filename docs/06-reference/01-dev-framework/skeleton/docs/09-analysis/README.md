# 09-analysis — 深度分析報告

一次性嘅調查 / research / 診斷報告。同 02-architecture(持久架構真理)區分:呢層係「某個時間點嘅調查快照」。

## 建議住客
- 技術調查報告(`{topic}_investigation_{YYYY-MM-DD}.md`)
- Deep-research 產出
- 深度 diagnosis(某個複雜 bug / 品質問題嘅根因分析)
- Pipeline / 架構 review 報告

## 慣例
- 檔名帶日期,標明係「嗰個時間點嘅快照」。
- 若調查得出架構決定 → 決定入 `adr/`,分析報告留呢層做佐證。
- 若調查識別出 pending 工作 → 入 BACKLOG(R7)。

## 模版
- [`_TEMPLATE-analysis.md`](./_TEMPLATE-analysis.md) — 查自己個系統(調查 / 診斷)。
- [`_TEMPLATE-research.md`](./_TEMPLATE-research.md) — 查外部知識(vendor / 業界 / 標準)。
