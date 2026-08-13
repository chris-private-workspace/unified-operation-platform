# CH-029 — Ledger 同 M365 真相之間三個語意缺口 · Checklist

> **Spec** = `spec.md`(`approved` 2026-08-13)· **決策 SSOT** = `ADR-0034`(**Accepted**)
> **Status**:實作 + test 收晒(2026-08-13)。🔴 **淨低 `F5-4` H6 真 render**(卡本機 5433,要 Chris 批)+ **live 驗**(要部署 #7)。
> **三個 deliverable 各自可獨立收**(spec §8 R4):**D-A** assign 前查持有 · **D-B** 負數呈現 · **D-C** drift 跳過 unlimited

## F0 — 開工 gate

- [x] F0-1 spec `approved`(2026-08-13,Chris)
- [x] F0-2 `ADR-0034` **Accepted**(D3=A · D4 跳過+resolve · D6 fail-open)
- [x] F0-3 branch `feat/ch-029-ledger-truth-gaps` 由 `main`(`1c98a5a`)開

## F1 — D-A:assign 之前由平台自己查持有

- [x] F1-1 🔴 **設計約束(開工先查到,唔喺 spec 入面)** —— `license-ops.boundary.spec.ts:101-108` 明文 assert **`assign.service.ts` 唔可以 `import` `graph/graph.service`**(W38 OQ-1)。而 ADR-0034 D1 又要求呢個 read **唔經 seam** ⇒ 兩條規矩夾埋 ⇒ **要開一個獨立 service**,跟 `SyncCheckService` 先例(`fulfilment.module.ts:127-131` 逐字寫低咗呢個理由)
- [x] F1-2 `GraphService.getUserAssignedSkuIds(upn)` —— `/users/{upn}?$select=assignedLicenses` 唯讀
- [x] F1-3 新 `fulfilment/holding-check.service.ts` —— 直接注入 `GraphService`,回 `held` / `not-held` / **`unknown`**(D6 fail-open 喺呢度接 error)
- [x] F1-4 `license-ops.boundary.spec.ts` `MUST_STAY_DIRECT` 加一行(**寫明點解**,唔淨係寫「佢直接」)
- [x] F1-5 `assign-step.ts` 加 gate key **`holding`**,位置 = `budget` 之後 `seats` 之前
- [x] F1-6 🔴 **點解喺 `budget` 之後**:ADR-0016 D5 明文「爆自己 budget 唔應該花一個 vendor round-trip」,而呢個 check 就係一個 round-trip
- [x] F1-7 🔴 **點解喺 `seats` 之前**:已持有嘅人唔食多一個 seat。排喺後面 ⇒ `No available seats` 會擋住一單**根本唔使 seat** 嘅 assign,而 **`seats` 冇 override 出路**(budget 有)⇒ 死路
- [x] F1-8 `assign.service.ts` 接線:held ⇒ `seats` `skipped` · `assign` `skipped` · **ledger 唔加**(`ledger` `skipped`)· line item **照推 `ASSIGNED`**(D3=A)
- [x] F1-9 **D3 成立條件** —— `RequestEvent` timeline 寫明「已持有,平台冇再派」,**由 `holding` step 個 detail 推導**(CH-023 手法);budget override 同時發生嗰陣兩句都保留
- [x] F1-10 **D6** Graph read 失敗 ⇒ 照 assign,step **唔係 `ok`** + `logger.warn` + **timeline note**(見 progress 決定 #3:D6 個 residual risk 係「冇人發現」,一個關咗就冇咗嘅 modal 唔算防線)
- [x] F1-11 更新 `:428` W39 OQ-1 comment —— 嗰句「fixing it is a separate change」而家有答案,指去 ADR-0034
- [x] F1-12 `fulfilment.module.ts` 註冊新 service
- [x] F1-13 web:`api-types.ts` 加 `holding` · dialog `STEP_LABEL` + `GATE_KEYS` · **成功 banner 唔再硬講 `ledger updated`**(由 `ledger` step 讀)

## F2 — D-C:drift 跳過 unlimited 兼主動 resolve

- [x] F2-1 `reconcile.service.ts` —— `seatModel = unlimited` **唔開唔 update** alert(連 ledger aggregate 都唔行)
- [x] F2-2 **D4 擴闊嗰半**:同一個 SKU 若有 OPEN alert ⇒ **順手 resolve**
- [x] F2-3 audit metadata `reason: 'unlimited-sku'`(`reason` / `source` 都已喺 `AUDIT_METADATA_KEYS`,**冇加 whitelist**);`resolveAlert` 抽出嚟共用,兩個理由一個 audit shape
- [x] F2-4 `ReconcileResult.skippedUnlimited` + DTO + web type + Drift 頁 toast(**只喺 `> 0` 先講**)

## F3 — D-B:負數呈現(零計算改動)

- [x] F3-1 🔴 **一個字都冇改聚合公式**(D5)—— `tenant-owned.service.ts` 冇掂過
- [x] F3-2 `platform-view.tsx` KPI sub-line:負數改讀成 `N over-allocated (prepaid SKUs)`
- [x] F3-3 scope note 補一句解釋「點解 `Allocated to OpCos` 減 `Available seats` 對唔返」
- [x] F3-4 ⚠️ **F3-3 令一條既有 test 紅咗(CH-028 `F3-8` 同一個坑)** —— scope note 指名咗兩張卡 ⇒ `getByText('Available seats')` match 兩次。加 `data-testid="tenant-kpis"` + `within(...)`,**冇改成 `getAllByText`**(嗰個會令 test 淨靠散文都 pass)

## F4 — Test(H5)

- [x] F4-1 `holding-check.service.spec.ts` 7 條 —— held / not-held / 空 / **GUID 唔係 part number** / 撻咗 ⇒ `unknown` / 唔 throw / 唔 log UPN
- [x] F4-2 `assign.service.spec.ts` 新 3 個 describe 13 條
- [x] F4-3 🔴 **timeline 文案 hardcode 一條期望字**,再**另加**一條「仲係由 step 推導」(CH-023 tautology 教訓:兩條夾埋先有意義)
- [x] F4-4 🔴 **兩條 provider 路** —— Graph 路 + 一個會報 `already_assigned` 嘅 n8n 形狀 stub,**兩邊各自 assert 同一個三件事**;另加一條釘住「`already_assigned` 個 handling 一個字冇改」
- [x] F4-5 D6 fail-open 4 條
- [x] F4-6 `reconcile.service.spec.ts` 6 條(含**混合 catalog** —— 單 SKU fixture 蓋唔到「`continue` 擺錯一層」)
- [x] F4-7 web:`request-detail.assign-steps.test.tsx` 4 條新 + `GATES_OK` 加 `holding`(`7 → 8 checks passed`)
- [x] F4-8 web:`platform-view.test.tsx` 負數 / 正數各一條(**兩條都要,否則「永遠寫 over-allocated」照 pass**)
- [x] F4-9 🔴 **Falsification 三個都真跑真紅**:`alreadyHeld=false` ⇒ **7 紅 / 84 綠** · reconcile unlimited 分支永不中 ⇒ **5 紅 / 11 綠** · KPI 文案還原 ⇒ **1 紅 / 13 綠**。**零誤傷**,詳見 progress

## F5 — 收尾

- [x] F5-1 api **1012 → 1040 / 73 → 74 suites** 全綠(+28 拆得開:7+13+6+2)
- [x] F5-2 web **362 → 368 passed**;6 條紅逐個對得返 `WEB-TEST-JSDOM` ⇒ **零新增**
- [x] F5-3 api tsc 0 · web tsc 0 · api lint 0 · **web lint 16(pre-existing,實測落係三個我冇掂過嘅檔)**
- [ ] F5-4 🚧 **H6 light + dark 真 render** —— 🔴 卡本機 5433(`ai-doc-extraction-db` 實測 `Up 4 hours`,停佢**要 Chris 批**)。⚠️ 而且**負數分支本機 render 唔到**(本機 `totalAllocated = 0`)⇒ 跟 CH-028 `F4-4` 先例,唔造假 row 湊截圖
- [x] F5-5 BACKLOG(R7)+ CLAUDE.md §0/§9 + `SESSION_SUMMARY.md` 座標掃(§14)
- [x] F5-6 commit + PR
- [ ] F5-7 🚧 **live 驗**(要部署 #7)——
  - **D-A**:要一個真係已持有某 SKU 嘅 user + 一張 `READY` line。🔴 **RISK `R10`**:DEV 對真 production tenant 有寫權 ⇒ 撳之前一律先唯讀探測
  - **D-C**:DEV 跑一次 `reconcile`。**預期 `skippedUnlimited = 22`、OPEN alert 72 → 56、16 個變 `RESOLVED`**。reconcile 對 Graph 唯讀 ⇒ R10 唔適用
