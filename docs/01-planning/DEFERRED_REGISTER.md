# Unified Operation Platform — Deferred Decisions Register

> **用途**:記錄「暫時決定唔做」嘅**反覆 / 結構性** deferral,連同**恢復條件**。防止同一個 defer 決定三個月後被重複 relitigate。
>
> **同 BACKLOG 分工**:BACKLOG D/E 區只做指標行;本檔存 close 條件細節。
>
> **只收 recurring / 結構性 class**:一次性、唔會再問嘅 defer,喺 phase `progress.md` 標 🚧 即可,唔使入本冊。

**最後更新**:2026-07-31(**新增 DD-4**:W41 密碼重設嘅「真人收信 → 撳連結 → 真重設」呢一段未驗)

---

## 結構性 deferred-debt 類別

| ID | 類別 | 來源 | 現況 | 恢復 / Close 條件 |
|---|---|---|---|---|
| DD-2 | **npm dev/build-chain vulns 需 breaking major 先清**(monorepo 32:apps/web vite/vitest/esbuild/js-yaml/picomatch + apps/api uuid/webpack/nest CLI) | W05 flag + tech-debt batch(2026-07-10) | defer — 全 **dev-only、唔入 production bundle**;非-force `npm audit fix`(root + `-w`)**一個都清唔到**(2026-07-10 實跑,工作樹零 lockfile 改為證) | vite@8 生態 stabilize → 專門 phase 一次過升 + revalidate build/dev/test(**H2 breaking,需 ADR**) |
| DD-3 | **「憑空建一個 ledger row」冇路徑** —— 平台冇 `POST /license/ledger`;建 row 只有三條 upsert 副作用路(import[ADMIN/REGIONAL]· assign 真人 · W35 F3 baseline script[ops])。⚠️ **不對稱**:`PATCH /license/ledger/:id` 容許 **OPCO_IT**(scope-gated)但 import 唔容許 ⇒ **OPCO_IT 改得,但永遠 create 唔到**(`license.controller.ts:127` vs `:93`) | W35 F4 / 2026-07-25(F3 落地後重評;分析見 `W35-data-initialisation/progress.md` Day 5) | **defer(Chris 2026-07-25 拍板選項 C)** —— 需求真實但未到:唯一咬人場景係 **drift 對回**(`DESIGN.md:98/101/172` 定義為手動編輯 by-OpCo `assignedQuantity`)撞上「該 (OpCo,SKU) 之前 assigned=0 故冇 row」→ `PATCH` 404。而 F3 script 對 `0===0` 會 skip,所以 baseline **幫唔到**呢類格。期間 workaround = ADMIN/ops 跑 baseline script 或 import 物化 row(**OPCO_IT 冇 workaround**) | **兩個解封條件,任一達成即重開**:①`Drift-resolve` 動工(對回流程會即刻需要;形狀應同該流程一齊設計 —— 候選 A `POST /license/ledger` / B `PUT /license/ledger/:opcoId/:skuCatalogId` natural-key upsert / D F3 加 `--materialise-zeros`)· ②**OpCo self-service 開放**(`DESIGN.md:173` open question;開放即令上述不對稱由「ops 可繞過」變成真阻塞)。⚠️ 屆時屬**新 API surface = H1,需 ADR**。**⬆️ CH-008 加註(2026-07-27)**:0/0 格由「無條件顯示」變「預設隱藏 + toggle 搵返」⇒ 呢個缺口更加浮面 —— 見到嗰格但**開唔到**,同見唔到嗰格但**開唔到**,對操作員嚟講後者更難自我解釋。Chris 落 CH-008 approval 時**已明確接受**呢個 trade-off(CH-008 spec §4 R1);解封條件**一個字都冇改** |

| DD-4 | **密碼重設嘅「真人收信 → 撳連結 → 真重設 → 舊 session 失效」呢一段未驗** —— 🔴 根因係**結構性,唔係時間**:AUTH-4c-C 由設計上**只服務 local-password user**(ADR-0019 D8),而現時**所有真人都係 SSO** ⇒ `chris.lai@rapo.com.hk` 唔合資格、`admin@uop.local` 個地址收唔到信。要驗就要「local-password + 真實 mailbox」呢個組合,而佢暫時唔存在(**owner 本人永遠用唔到呢個功能** —— 佢係為冇 Entra 帳號嘅外部 / 臨時人員而做) | W41 F8c / 2026-07-31 | **defer(Chris 2026-07-31 拍板)**。⚠️ **未證範圍要講精確,唔好讀成「功能未驗」**:①**transport 真 work** —— CH-011 A11 + **CH-012 A4 兩次真寄而 Chris 確認收到** · ②**W41 側 ACS 真被呼叫並接受 202**(F8f:token 建咗 ⇒ `issue()` 返非 null ⇒ 一定行到 `notifications.send()`;失敗會入佇列而佇列 0 行 ⇒ 冇 throw)· ③**endpoint 真上線** —— UAT 同一 endpoint 部署前 404 部署後 204 · ④**consume 邏輯**由 G2 單次 / G3 過期 / G5 副作用同一 transaction + UAT 假 token→400 覆蓋。⇒ 淨低未證嘅係**中間嗰段真人操作**。🔴 而佢**唔係低風險**:F8f 用一個唔存在嘅 domain 寄,平台側**所有信號全綠**(204 · token · audit `issued` · 佇列空)—— ADR-0019 **D5「唔畀探」**嘅代價喺度由理論變咗實證,冇任何平台側信號睇得出送唔到 | **任一達成即重開**:①**首個 local-password 真人 onboard**(外部 / 臨時人員 —— 呢個正正係本功能嘅目標用戶,佢一出現就自然有「local-password + 真 mailbox」組合)· ②**go-live / UAT 正式驗收**要求密碼重設有端到端證據 · ③owner 決定開一個帶真 mailbox 嘅測試帳號。⚠️ 屆時**判準一律「收件人真係收到」**,唔可以以 API 202 / audit `issued` 為準(理由見左欄④) |

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
