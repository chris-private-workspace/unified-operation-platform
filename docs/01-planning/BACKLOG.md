# Unified Operation Platform — 工作 Backlog(中央 dashboard 入口)

> **用途**:本項目**所有** pending 工作 / next-candidate 嘅**單一一覽入口**。AI 或用戶想知「而家有咩 pending、可以揀邊個做」→ 第一站睇呢度。
>
> **定位 = index 層,唔複製細節**:每行只記「任務 / 狀態 / 前置·阻塞 / 來源連結」,細節一律 link 去 source-of-truth(`adr/README.md` / `DEFERRED_REGISTER.md` / 對應 phase folder),避免雙重維護變 stale。
>
> **同步 = binding(PROCESS.md R7)**:phase kickoff / closeout、ADR Accept、defer/blocked 決定、新 candidate 被識別 → 必須同步本表,**唔可以 silent drift**。維護規則見文末。

**最後更新**:2026-07-09(git baseline `5ff2cae` · ADR-0001 前端入 repo monorepo + H6)

---

## 狀態 lifecycle
`候選`(已識別未規劃)→ `已規劃`(plan 建咗)→ `進行中` → `完成` / `defer`(實證或決定暫不做)/ `blocked`(卡外部·用戶決定)

分區按「可開工性」:**A 可立即開工** / **B 已設計·暫緩** / **C blocked on 外部** / **D 已實證 defer** / **E 持續技術債** / **F out-of-scope**。

---

## 進行中(Active — 當前處理中)

| ID | 任務 | 狀態 | 下一步 / 阻塞 | 來源 |
|---|---|---|---|---|
| W01 | Backend Bootstrap（令後端跑得起 + **遷入 monorepo `apps/api`**：package.json / 佈局 / PrismaModule / docker-compose / boot 驗證） | 已規劃（plan `draft`） | 等 Chris approve plan → flip `active` → 由 F1 開工 | `W01-backend-bootstrap/plan.md` · ADR-0001 |

---

## A — 可立即開工

| ID | 任務 | 狀態 | 前置 / 下一步 | 來源 |
|---|---|---|---|---|
| INIT | `git init` + 首個 baseline commit（框架落地基線） | 完成（`5ff2cae`,main） | — | CLAUDE.md §4 |

---

## B — 已設計 / Accepted,用戶主動暫緩(等 driver,非技術阻塞)

| ID | 任務 | 狀態 | 解封條件 | 來源 |
|---|---|---|---|---|
| MOD-C | Module C：SKU Catalog 初始化 + 總量層對帳 / drift | 已設計 | W01 完成後開工（DESIGN 建議功能上先 C） | `docs/02-architecture/licenseops/DESIGN.md §11` |
| MOD-D | Module D：Request 履行（triage → sync gate → assign → ledger → 回寫 ServiceNow） | 已設計 | W01 完成、建議 C 之後 | `docs/02-architecture/licenseops/DESIGN.md §11` |
| AUTH | Entra SSO + role/OpCo-scope guard（controllers 現時 unguarded） | 已設計（model 已有 role/scope） | 真實曝露前必做 | `docs/architecture.md §9` |
| FE | LicenseOps 前端（`apps/web`；React+TS+Tailwind+shadcn；滾動 build order：app shell→theme→Overview→License Assets→Requests→Request detail→Drift→Catalog→Settings→Login） | 已設計（hifi handoff + 設計系統就緒；ADR-0001 已定 in-repo；H6 已生效） | 前置 `apps/web` scaffold（W01 monorepo 之後）；每段一滾動 phase | `docs/02-architecture/design-system.md` · `design_handoff_licenseops/` |

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

開以下任何一項前必須 STOP + approval + 平台級 ADR(H1/H3):

- **其他 IT ops 模組**:offboarding / license 回收、Cost Insights、D365 Licenses、其他 support 工作流 —— 未來 tier(`docs/architecture.md §11`)。
- **LicenseOps 排除項**:ticket 申請表單 / 審批鏈 / SLA 管理 / service catalog / CMDB 當 source of truth / 成本發票金額(→ DocuWare,只記 `quoteRef`/`poRef`)/ 非 onboarding 的獨立 license request(`docs/02-architecture/licenseops/DESIGN.md §2`)。

---

## 維護規則(對應 CLAUDE.md §10 R7 / PROCESS.md R7)

1. **新 candidate 被識別**(分析 / 討論 / ADR Accept / phase retro carry-over / 用戶提出)→ 加一行,狀態 `候選`,填來源連結。
2. **phase kickoff**(plan 建)→ 對應項改 `進行中`(或新增做 `已規劃`)。
3. **phase closeout** → 對應項改 `完成`;若產生**反覆 / 結構性** deferral → 同步 `DEFERRED_REGISTER.md` 加 DD-N,本表 D/E 區加指標行。
4. **defer / blocked 決定** → 改對應狀態 + link DD-N 或阻塞源。
5. **single source 原則** — 本表唔複製細節,只 link;細節改去 source-of-truth,本表只更新「狀態 + 一句摘要」。
6. **更新即改「最後更新」日期** + 必要時喺對應 phase `progress.md` Day-N entry mention(per R2)。

> **與 `DEFERRED_REGISTER.md` 分工**:BACKLOG = **全部** pending 嘅 dashboard(含可開工 / 候選 / blocked);DEFERRED_REGISTER = **recurring deferred-debt** 嘅 close 條件細節庫。BACKLOG 嘅 D/E 區只指向 DEFERRED_REGISTER,唔重複內容。
