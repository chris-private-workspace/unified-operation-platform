# Unified Operation Platform — Deferred Decisions Register

> **用途**:記錄「暫時決定唔做」嘅**反覆 / 結構性** deferral,連同**恢復條件**。防止同一個 defer 決定三個月後被重複 relitigate。
>
> **同 BACKLOG 分工**:BACKLOG D/E 區只做指標行;本檔存 close 條件細節。
>
> **只收 recurring / 結構性 class**:一次性、唔會再問嘅 defer,喺 phase `progress.md` 標 🚧 即可,唔使入本冊。

**最後更新**:2026-07-25(**DD-3 新增**:W35 F4 —— 憑空建 ledger row 冇路徑,Chris 決 defer)

---

## 結構性 deferred-debt 類別

| ID | 類別 | 來源 | 現況 | 恢復 / Close 條件 |
|---|---|---|---|---|
| DD-2 | **npm dev/build-chain vulns 需 breaking major 先清**(monorepo 32:apps/web vite/vitest/esbuild/js-yaml/picomatch + apps/api uuid/webpack/nest CLI) | W05 flag + tech-debt batch(2026-07-10) | defer — 全 **dev-only、唔入 production bundle**;非-force `npm audit fix`(root + `-w`)**一個都清唔到**(2026-07-10 實跑,工作樹零 lockfile 改為證) | vite@8 生態 stabilize → 專門 phase 一次過升 + revalidate build/dev/test(**H2 breaking,需 ADR**) |
| DD-3 | **「憑空建一個 ledger row」冇路徑** —— 平台冇 `POST /license/ledger`;建 row 只有三條 upsert 副作用路(import[ADMIN/REGIONAL]· assign 真人 · W35 F3 baseline script[ops])。⚠️ **不對稱**:`PATCH /license/ledger/:id` 容許 **OPCO_IT**(scope-gated)但 import 唔容許 ⇒ **OPCO_IT 改得,但永遠 create 唔到**(`license.controller.ts:127` vs `:93`) | W35 F4 / 2026-07-25(F3 落地後重評;分析見 `W35-data-initialisation/progress.md` Day 5) | **defer(Chris 2026-07-25 拍板選項 C)** —— 需求真實但未到:唯一咬人場景係 **drift 對回**(`DESIGN.md:98/101/172` 定義為手動編輯 by-OpCo `assignedQuantity`)撞上「該 (OpCo,SKU) 之前 assigned=0 故冇 row」→ `PATCH` 404。而 F3 script 對 `0===0` 會 skip,所以 baseline **幫唔到**呢類格。期間 workaround = ADMIN/ops 跑 baseline script 或 import 物化 row(**OPCO_IT 冇 workaround**) | **兩個解封條件,任一達成即重開**:①`Drift-resolve` 動工(對回流程會即刻需要;形狀應同該流程一齊設計 —— 候選 A `POST /license/ledger` / B `PUT /license/ledger/:opcoId/:skuCatalogId` natural-key upsert / D F3 加 `--materialise-zeros`)· ②**OpCo self-service 開放**(`DESIGN.md:173` open question;開放即令上述不對稱由「ops 可繞過」變成真阻塞)。⚠️ 屆時屬**新 API surface = H1,需 ADR** |

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
