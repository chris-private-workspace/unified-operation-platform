# {PROJECT_NAME} — Deferred Decisions Register

> **用途**:記錄「暫時決定唔做」嘅**反覆 / 結構性** deferral,連同**恢復條件**。防止同一個 defer 決定三個月後被重複 relitigate。
>
> **同 BACKLOG 分工**:BACKLOG D/E 區只做指標行;本檔存 close 條件細節。
>
> **只收 recurring / 結構性 class**:一次性、唔會再問嘅 defer,喺 phase `progress.md` 標 🚧 即可,唔使入本冊。

**最後更新**:YYYY-MM-DD

---

## 結構性 deferred-debt 類別

| ID | 類別 | 來源 | 現況 | 恢復 / Close 條件 |
|---|---|---|---|---|
| DD-1 | _(空)_ | {phase / ADR / 分析} | {當前狀態} | {咩情況會重新開工} |

<!-- 範例:
| DD-1 | X 功能等真實用量先做 | W05 retro | defer | 出現 ≥3 真實用戶要求,或 stakeholder 排入 roadmap |
-->

---

## 已 Close(保留 audit trail)

> Close 咗嘅項由上面表移落嚟,**唔刪**,保留審計痕跡。

| ID | 類別 | Close 於 | 證據 |
|---|---|---|---|
| _(空)_ | | {W{NN} / 日期} | {commit / ADR / eval 結果} |

---

## 維護規則
1. **加**:一個工作被 defer 且 ①有明確恢復條件 ②之後可能有人再問「點解唔做」→ 加入上表(狀態 = `defer` / `blocked`)。
2. **更新現況**:恢復條件進度變 → 改「現況」欄。
3. **Close**:恢復條件達成或永久唔做 → 由結構性表**移落「已 Close」表** + 記證據(唔刪)。
4. **去噪**:一次性 🚧 唔入本冊(留 progress.md)。
5. 同步 `BACKLOG.md` D/E 區指標行(R7)。
