---
change_id: CH-016
title: "Allocation reset — 把 allocatedQuantity 清零重來"
status: done            # draft | proposed | approved | active | done | cancelled
created: 2026-08-02
target_completion: 2026-08-03
affects_components: [license, apps/web]
spec_refs:
  - ADR-0004(allocation import — alloc-only invariant)
  - ADR-0007(ledger 人手改動 audit / LedgerAdjustment)
  - ADR-0016(OpCo 預算 gate — allocatedQuantity 決定 assign 放唔放行)
  - docs/02-architecture/licenseops/DESIGN.md §5(ledger 兩層數字)
---

# CH-016 — Allocation reset

> **Spec version**:1.0(initial)
> **Owner**:Chris(提出)/ AI(起草)
> **Approved by**:**Chris Lai**(2026-08-02)

## 1. Context (Why)

Chris 2026-08-02 測試時提出:上傳咗一次 license assets 數據,發現有問題,想全部 reset 重來 —— 而家冇呢個流程。

查證後,**真正嘅 gap 唔係「唔可以刪」,而係 import 係 upsert-only**:

```ts
// allocation-import.service.ts:85-95
upsert({ where: {opcoId_skuCatalogId}, create: {…}, update: { allocatedQuantity: c.target } })
```

⇒ 重新上傳一份正確 CSV 之後:

| 情況 | 結果 |
|---|---|
| 錯嘅 cell 喺新 CSV **有** | ✅ 被覆蓋,冇問題 |
| 錯嘅 cell 喺新 CSV **冇**(上次多打咗一個 OpCo / 一行 SKU) | ❌ **舊值永遠殘留,今日冇任何辦法清** |

第二行就係本 CH 要解決嘅嘢。

### 🔴 點解唔可以「直接刪 ledger row」

Chris 原本嘅理解係「license assets 同 request 冇關連,各自獨立」。**FK 層面啱**(`OpcoSkuLedger` 冇任何 FK 指向 `Request` / `RequestLineItem`),**但行為上唔係**:

| # | 刪 row 會炸咩 | 出處 |
|---|---|---|
| 1 | **Drift 對帳全爆** — `delta = tenant consumedUnits − sum(assignedQuantity)`。平台側變 0 而 M365 側唔變 ⇒ 每個 SKU 都開 DriftAlert,delta = 成個 tenant 用量 | `reconcile.service.ts:72-77` |
| 2 | **所有 assign 被 budget gate 擋死** — 「No ledger row = nothing was ever allocated → refuse」(ADR-0016 D1,冇 unlimited-by-default) | `assign.service.ts:174-181` |
| 3 | **`LedgerAdjustment` audit trail cascade 消失** — ADR-0007 嘅人手改動紀錄冇得返 | `schema.prisma:163` `onDelete: Cascade` |

`assignedQuantity` **就係 assign 動作累積出嚟嘅數**(`assign.service.ts:264` `increment: 1`)⇒ 佢係營運真數,唔係 import 產物。

⇒ 正確嘅 reset 語意 = **只重設 `allocatedQuantity`,絕不掂 `assignedQuantity`、絕不刪 row**。咁三個爆點全部避開。

## 2. Scope (What)

### 2.1 Behavior Change

- **Before**:allocation 只可以經 CSV import 覆蓋(upsert)。CSV 冇提到嘅 cell 無法清零。冇任何 reset / delete 路徑。
- **After**:新增 `POST /license/ledger/allocation/reset` —— 把符合條件嘅 ledger row 嘅 `allocatedQuantity` 設為 **0**,`assignedQuantity` 同 row 本身**原封不動**。dry-run 為 default,前端 Settings 有對應入口。

### 2.2 In Scope

**Backend**
- `POST /license/ledger/allocation/reset`,`@Roles(ADMIN, REGIONAL)`(Chris 決定;同 `ledger/import` 一致,亦即 controller class-level default)。
- Body:`{ dryRun?: boolean, opcoCode?: string }`。**`dryRun` default = true** —— 跟既有 import 嘅 `dryRun === false` 先 commit 語意,唔另создать第二套習慣。
- 寫入**只有一句**:`update allocatedQuantity = 0`,條件 `allocatedQuantity != 0`(+ optional `opcoId`)。
  🔴 **絕不** `delete` / `deleteMany` · **絕不**出現 `assignedQuantity` 呢個欄位名喺任何 write path。
- 回傳 `{ dryRun, affected, rows[], warning }`:
  - `rows[]` = 會被 / 已被清嘅 cell(`opcoCode` · `skuPartNumber` · `before`),dry-run 時就係預覽。
  - `warning` = 明文講出後果(見 §2.4)。
- Audit(ADR-0009):一行 summary,新 action `ALLOCATION_RESET`,`targetId: 'bulk'` —— 跟 `ALLOCATION_IMPORT` 先例(per-cell 會淹沒 audit 表)。

**Frontend**(`apps/web`,Settings → allocation import panel)
- 同一塊 panel 加 reset 入口。`danger` variant(既有),**唔係 primary** —— panel 個 primary 仍然係 Import(H6 一 view 一 primary)。
- 流程 **dry-run 先**:撳 Reset → 出 confirm Dialog,列明 `affected` 數同頭幾行 → 確認先真跑。
- 完成後嘅提示必須包含 §2.4 嗰句警告 + 一個「而家去 Import」嘅指引。

**Test**(H5 — ledger 更新係明文 critical path)
- 🔴 **最重要嗰條**:reset 之後 `assignedQuantity` **一個都冇變**(逐行對)。
- 🔴 **零 delete**:row 數不變、`LedgerAdjustment` 一條都冇少。
- dry-run 零寫入 · `opcoCode` filter 只掂嗰個 OpCo · 已經係 0 嘅 row 唔算入 `affected`(同 import 嘅 no-op 語意一致)· audit 有寫一行 · OPCO_IT → 403。

### 2.3 Out of Scope（explicit）

- ❌ **唔掂 `assignedQuantity`** —— 佢係 drift 對帳基準(ADR-0004 / DESIGN §5)同 assign 累積嘅真數。要改佢係 `PATCH /license/ledger/:id`(ADR-0007)嘅事,一 cell 一 cell 具名改,有 audit。
- ❌ **唔刪 ledger row**(理由見 §1)。
- ❌ **唔掂 `reconcile`** —— 一個字都唔改。
- ❌ **唔加 import 嘅 replace mode** —— Chris 揀咗獨立 endpoint(§7 changelog)。
- ❌ **唔做 undo / 快照回滾** —— reset 之後嘅復原手段就係重新 import 一份正確 CSV(⚠️ **但只對 active SKU 成立**,見 §2.5);要做快照係另一個 CH。

## 2.5 🔴 Inactive SKU：reset 對嗰啲 cell 係單程票（live 驗證揭出，2026-08-02）

Import 只讀 `active: true` 嘅 catalog(`allocation-import.service.ts:42-44`)⇒ **一個已 deactivate 嘅 SKU,佢嘅 ledger cell 無論如何都 import 唔返**。實測:RTW 四格 reset 之後重新 import 只還原到兩格,`STANDARDPACK` / `VISIO_PLAN1`(兩者 `active=false`)要逐格 `PATCH /license/ledger/:id` 先救得返。

⇒ 本 CH **保留清 inactive cell 嘅能力**(「清走已停用 SKU 嘅殘留 allocation」正正係「上傳錯咗」嘅典型情況之一),但**必須喺撳落去之前令不可逆嗰部分睇得見**:

- Result 每行加 `skuActive: boolean`;result 加 `irreversible: number`(scope 內 inactive SKU 嘅格數)。
- `irreversible > 0` 時 `warning` 追加一句,明講嗰幾格 import 救唔返、唯一出路係逐格 PATCH。
- Dialog preview 逐行標 ⚠️ inactive,並喺表下顯示總數。

### 2.4 🔴 中間態警告(必須喺 API 回應同 UI 都出現)

清零之後、重新 import 之前,受影響嘅 OpCo × SKU **`allocated = 0`** ⇒ ADR-0016 budget gate 會**擋住嗰啲組合嘅所有 assign**(除非 ADMIN 逐張單具名 override)。

Chris 已知悉並接受呢個形態(選咗獨立 endpoint 而唔係 import replace mode)。緩解 = dry-run default + 回應/UI 明文警告 + 引導緊接 import,**唔靠人記得**。

## 3. Acceptance Criteria

- [ ] `POST /license/ledger/allocation/reset` 出現喺 `/docs/api`,body / response shape 見得到
- [ ] dry-run(default)→ `affected` 同 `rows[]` 正確,**DB 一個 byte 都冇變**
- [ ] `dryRun: false` → 目標 row `allocatedQuantity` 變 0
- [ ] 🔴 同一批 row 嘅 **`assignedQuantity` 前後完全一致**(live 用真 DB 前後對比)
- [ ] 🔴 **ledger row 數前後一致 · `LedgerAdjustment` 條數前後一致**
- [ ] `opcoCode: "RHK"` → 只有 RHK 嘅 row 被清,其他 OpCo 一個唔郁
- [ ] 回應 `warning` 有講中間態(§2.4)
- [ ] **§2.5**:result 有 `irreversible` + 每行 `skuActive`;`irreversible > 0` 時 warning 有追加嗰句;Dialog 逐行標 ⚠️ inactive
- [ ] Reset 之後重新 import → **active SKU** 數值返晒嚟,而 inactive 嗰幾格返唔到 —— 且**呢件事喺撳之前就顯示過**
- [ ] `/admin/audit` 見到一行 `ALLOCATION_RESET`
- [ ] OPCO_IT 打呢個 endpoint → **403**
- [ ] 前端:Settings panel 有 reset,`danger` variant,confirm dialog 列明 affected 數;light + dark 都驗
- [ ] `cd apps/api && npm test` 全綠 · `cd apps/web && npm test` 全綠
- [ ] 🔴 **`npm run lint`(repo root,CI 同一條命令)exit 0** —— CH-015 就係喺呢一步失手
- [ ] `ui-design` skill 跑過,零 violation

## 4. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | 清零之後冇即刻 import,assign 全被擋 | **Med** | **High** | dry-run default · 回應 + UI 明文警告 + 引導去 import(§2.4)。形態本身係 Chris 明知並揀嘅 |
| R2 | 手滑清咗全平台(唔記得填 `opcoCode`) | Med | High | dry-run default;UI confirm dialog 必須顯示 `affected` 同受影響 OpCo 數 |
| R3 | 有人以為 reset 會連 assigned 一齊清 | Med | Med | 回應 / UI 文案明寫「`assignedQuantity` 一個都冇郁」;test 直接守住 |
| R4 | 將來有人「順手」把 reset 擴去刪 row 或清 assigned | Low | **High** | §2.3 明文 + test 就係守呢兩條(assigned 不變 / row 數不變) |

## 5. Effort Estimate

**~1 日**(backend ~0.4 日含 test · frontend ~0.3 日 · live 真 DB 前後對比 ~0.3 日)。

## 6. Dependencies

- 冇。唔需要真 Graph / 真 SN。live 驗證用本地 dev DB 前後對比即可。

## 7. Spec Changelog（deviation log）

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-08-02 | Initial draft(proposed) | Chris 測試時發現冇 reset 流程 | — |
| 2026-08-02 | **§2.5 新增(deviation,R3)** —— live 驗證揭出 §2.3 原本嗰句「復原手段就係重新 import」**對 inactive SKU 唔成立**(import 只讀 `active:true`;實測 RTW 4 格只還原到 2 格)。Chris 拍板:**照清但標明不可逆**(另外兩個選項:預設排除 inactive / 淨係改文件)。連帶加 `skuActive` + `irreversible` + warning 追加句 + Dialog 標示 | live 驗證發現,唔可以 silent drift | Chris |
| 2026-08-02 | 三個開放決定由 Chris 拍板:① **獨立 reset endpoint**(AI 原建議係 import 加 replace mode —— Chris 選咗獨立,中間態風險已寫入 §2.4 / R1)② 一律歸 0、絕不刪 row ③ 權限 **ADMIN + REGIONAL**(AI 原建議 ADMIN only) | 起草時提問,即場定案 | Chris |

---

**Lifecycle reminder**:呢份 spec locked after status=approved。重大 deviation → §7 changelog。
**Gate reminder**:status 由 AI 標 `proposed`,**用戶 review + approve 先可以 `approved` + 開始 code**(PROCESS R1.change)。
