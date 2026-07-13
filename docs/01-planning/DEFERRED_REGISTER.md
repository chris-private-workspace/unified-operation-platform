# Unified Operation Platform — Deferred Decisions Register

> **用途**:記錄「暫時決定唔做」嘅**反覆 / 結構性** deferral,連同**恢復條件**。防止同一個 defer 決定三個月後被重複 relitigate。
>
> **同 BACKLOG 分工**:BACKLOG D/E 區只做指標行;本檔存 close 條件細節。
>
> **只收 recurring / 結構性 class**:一次性、唔會再問嘅 defer,喺 phase `progress.md` 標 🚧 即可,唔使入本冊。

**最後更新**:2026-07-13(DD-1 → Close:W13 allocation import 建成,ADR-0004)

---

## 結構性 deferred-debt 類別

| ID | 類別 | 來源 | 現況 | 恢復 / Close 條件 |
|---|---|---|---|---|
| DD-2 | **npm dev/build-chain vulns 需 breaking major 先清**(monorepo 32:apps/web vite/vitest/esbuild/js-yaml/picomatch + apps/api uuid/webpack/nest CLI) | W05 flag + tech-debt batch(2026-07-10) | defer — 全 **dev-only、唔入 production bundle**;非-force `npm audit fix`(root + `-w`)**一個都清唔到**(2026-07-10 實跑,工作樹零 lockfile 改為證) | vite@8 生態 stabilize → 專門 phase 一次過升 + revalidate build/dev/test(**H2 breaking,需 ADR**) |

<!-- 範例:
| DD-1 | X 功能等真實用量先做 | W05 retro | defer | 出現 ≥3 真實用戶要求,或 stakeholder 排入 roadmap |
-->

---

## 已 Close(保留 audit trail)

> Close 咗嘅項由上面表移落嚟,**唔刪**,保留審計痕跡。

| ID | 類別 | Close 於 | 證據 |
|---|---|---|---|
| DD-1 | **Prepaid `allocatedQuantity` Excel import 方式未定** → 卡 BE-ledger-read / FE-Assets | W13 / 2026-07-13 | Chris 決 admin CSV upload(**ADR-0004**);`POST /license/ledger/import`(dry-run+commit,curation-as-scope,allocatedQuantity-only)+ FE upload UI 建成 + live round-trip 驗(commit df3a7ac 起)。**殘留 = 生產真數 curation(真 tenant catalog/sync + 37-SKU businessAlias)= deploy ops step,非設計 deferral。** BE-ledger-read / FE-Assets 已解封。 |

---

## 維護規則
1. **加**:一個工作被 defer 且 ①有明確恢復條件 ②之後可能有人再問「點解唔做」→ 加入上表(狀態 = `defer` / `blocked`)。
2. **更新現況**:恢復條件進度變 → 改「現況」欄。
3. **Close**:恢復條件達成或永久唔做 → 由結構性表**移落「已 Close」表** + 記證據(唔刪)。
4. **去噪**:一次性 🚧 唔入本冊(留 progress.md)。
5. 同步 `BACKLOG.md` D/E 區指標行(R7)。
