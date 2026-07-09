# {PROJECT_NAME} — Open Questions & Decision Form

> **用途**:未定決策點(Open Questions)嘅登記 + 狀態。CLAUDE.md §8 引用呢度決定 AI 嘅 default behavior。
> **同 ADR 分工**:呢度追「未定 / 待 stakeholder 拍板」;拍板咗 + 屬架構級 → promote 做 ADR。

**最後更新**:YYYY-MM-DD

## 狀態說明
- **Open** → AI 用 spec 標明嘅 default value 繼續,commit message 標「depends on Q{N} default」。
- **Resolved** → 直接用 resolved value。
- **Blocked** → STOP 對應 work item,ask user。

## 登記

| Q | 問題 | 影響 | 狀態 | Default(Open 時用) | Resolved value / 日期 |
|---|---|---|---|---|---|
| Q1 | {待決問題} | {影響邊個 work item} | Open / Resolved / Blocked | {default} | {若 resolved} |
| Q2 | | | | | |

## 維護(對應 PROCESS R4)
- Open question resolved → 同步更新本表 **AND** 對應 phase `progress.md` Day-N entry。
- 影響架構嘅 resolution → 順帶開 ADR。
