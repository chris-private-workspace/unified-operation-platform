# {PROJECT_NAME} — 工作 Backlog(中央 dashboard 入口)

> **用途**:本項目**所有** pending 工作 / next-candidate 嘅**單一一覽入口**。AI 或用戶想知「而家有咩 pending、可以揀邊個做」→ 第一站睇呢度。
>
> **定位 = index 層,唔複製細節**:每行只記「任務 / 狀態 / 前置·阻塞 / 來源連結」,細節一律 link 去 source-of-truth(`adr/README.md` / `DEFERRED_REGISTER.md` / 對應 phase folder),避免雙重維護變 stale。
>
> **同步 = binding(PROCESS.md R7)**:phase kickoff / closeout、ADR Accept、defer/blocked 決定、新 candidate 被識別 → 必須同步本表,**唔可以 silent drift**。維護規則見文末。

**最後更新**:{YYYY-MM-DD}

---

## 狀態 lifecycle
`候選`(已識別未規劃)→ `已規劃`(plan 建咗)→ `進行中` → `完成` / `defer`(實證或決定暫不做)/ `blocked`(卡外部·用戶決定)

分區按「可開工性」:**A 可立即開工** / **B 已設計·暫緩** / **C blocked on 外部** / **D 已實證 defer** / **E 持續技術債** / **F out-of-scope**。

---

## 進行中(Active — 當前處理中)

| ID | 任務 | 狀態 | 下一步 / 阻塞 | 來源 |
|---|---|---|---|---|
| _(空)_ | | | | |

---

## A — 可立即開工

| ID | 任務 | 狀態 | 前置 / 下一步 | 來源 |
|---|---|---|---|---|
| _(空)_ | | | | |

---

## B — 已設計 / Accepted,用戶主動暫緩(等 driver,非技術阻塞)

| ID | 任務 | 狀態 | 解封條件 | 來源 |
|---|---|---|---|---|
| _(空)_ | | | | |

---

## C — Blocked on 外部(IT / 用戶決定 / 第三方)

| ID | 任務 | 狀態 | Blocker | 來源 |
|---|---|---|---|---|
| _(空)_ | | | | |

---

## D — 已實證 defer(不重開,除非新 driver)

> 細節 + 恢復條件全部喺 `DEFERRED_REGISTER.md`,本表只做指標。

| DD | 類別 | 狀態 |
|---|---|---|
| _(空)_ | | |

---

## E — 持續性技術債(對應模組再動時順帶補)

| ID | 類別 | 解封條件 |
|---|---|---|
| _(空)_ | | |

---

## F — 明確 out-of-scope(記錄防混入)

_(列明確唔做嘅嘢,例:未來 tier feature / 已否決方向。防止 scope 蔓延時有據可查。)_

---

## 維護規則(對應 CLAUDE.md §10 R7 / PROCESS.md R7)

1. **新 candidate 被識別**(分析 / 討論 / ADR Accept / phase retro carry-over / 用戶提出)→ 加一行,狀態 `候選`,填來源連結。
2. **phase kickoff**(plan 建)→ 對應項改 `進行中`(或新增做 `已規劃`)。
3. **phase closeout** → 對應項改 `完成`;若產生**反覆 / 結構性** deferral → 同步 `DEFERRED_REGISTER.md` 加 DD-N,本表 D/E 區加指標行。
4. **defer / blocked 決定** → 改對應狀態 + link DD-N 或阻塞源。
5. **single source 原則** — 本表唔複製細節,只 link;細節改去 source-of-truth,本表只更新「狀態 + 一句摘要」。
6. **更新即改「最後更新」日期** + 必要時喺對應 phase `progress.md` Day-N entry mention(per R2)。

> **與 `DEFERRED_REGISTER.md` 分工**:BACKLOG = **全部** pending 嘅 dashboard(含可開工 / 候選 / blocked);DEFERRED_REGISTER = **recurring deferred-debt** 嘅 close 條件細節庫。BACKLOG 嘅 D/E 區只指向 DEFERRED_REGISTER,唔重複內容。
