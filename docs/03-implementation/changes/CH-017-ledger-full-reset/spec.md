---
change_id: CH-017
title: "Ledger full reset — allocated + assigned 一併歸零,可以真正重新導入"
status: approved        # draft | proposed | approved | active | done | cancelled
created: 2026-08-02
target_completion: 2026-08-04
affects_components: [license, apps/web, prisma]
spec_refs:
  - ADR-0022(**本 change 嘅決策 SSOT** — ledger full reset)
  - ADR-0014(assigned baseline — 清咗之後唯一救得返 assigned 嘅路)
  - ADR-0004 #5(alloc-only invariant — import 永遠唔寫 assigned)
  - ADR-0007(LedgerAdjustment 逐格 audit)
  - ADR-0016 D1(allocated=0 擋 assign 嘅中間態)
  - CH-016(前身 — allocation reset)
---

# CH-017 — Ledger full reset

> **Spec version**:1.0(initial)
> **Owner**:Chris(提出)/ AI(起草)
> **Approved by**:**Chris Lai**(2026-08-02)

## 1. Context (Why)

Chris 2026-08-02 試用 CH-016 之後指出效果同預期唔同:佢要嘅唔係「allocated 清零」,而係**成個 OpCo / 所有 OpCo 嘅記錄清走,可以重新導入真正要管理嘅 license 記錄**。

查證(本地 dev DB,`ledger-state.sql`):`sum(allocated)=0`(CH-016 已跑過全平台)但 `sum(assigned)=6049`,**127 行**因為 assigned 唔係 0 而繼續留喺 License Assets 畫面 —— `ledger-read.service.ts:33` 只隱藏 `allocated=0 AND assigned=0`。

完整背景 + 三個 alternative 點解 reject,見 **ADR-0022**。本 spec 只講落地。

## 2. Scope (What)

### 2.1 Behavior Change

- **Before**:得一種 reset(`POST /license/ledger/allocation/reset`,CH-016),只清 `allocatedQuantity`。`assignedQuantity` 冇任何常設批量路徑(得 ADR-0014 一次性 ops script)。
- **After**:多一種 **full reset**(`POST /license/ledger/reset`,ADMIN only),`allocatedQuantity` + `assignedQuantity` 兩個都設 0。**row 一樣唔刪**(ADR-0022 D1)。前端一個入口二選一,另有 ops script 做部署時大批初始化。

### 2.2 兩種 reset 對照(🔴 呢張表係本 CH 最要緊嘅產出)

| | **Allocation reset**(CH-016) | **Full reset**(CH-017) |
|---|---|---|
| Endpoint | `POST /license/ledger/allocation/reset` | `POST /license/ledger/reset` |
| 清咩 | `allocatedQuantity` | `allocatedQuantity` **+** `assignedQuantity` |
| 權限 | ADMIN + REGIONAL | **ADMIN only** |
| 額外確認 | dry-run + dialog | dry-run + dialog **+ 打字確認 scope** |
| `LedgerAdjustment` | 唔寫(跟 import 慣例) | **每個被清嘅 assigned cell 寫一條** |
| 點救返 | 重新 import(inactive SKU 除外) | allocated:重新 import;**assigned:import 救唔返**,要重跑 ADR-0014 script |
| 用喺邊 | 上傳錯咗一份 CSV | 數據初始化 / 整批推倒重來 |

### 2.3 Backend

**新 `LedgerFullResetService`(獨立檔,ADR-0022 D2)**
- CH-016 嘅 `AllocationResetService` **一個字唔改**,佢嗰條「write path 唔准出現 `assignedQuantity`」嘅 invariant test 原封保留。
- `POST /license/ledger/reset`,`@Roles(ADMIN)`、`@HttpCode(200)`(跟 CH-016:dry-run 咩都冇建,commit 只 update 既有 row)。
- Body:`{ dryRun?: boolean, opcoCode?: string, confirm?: string }`
  - `dryRun` default **true**(跟 import / CH-016,一個習慣唔開第二套)。
  - `opcoCode` 打錯 → **404**(唔可以靜靜咁 fallback 做「全平台」—— 呢個 endpoint 嗰種 failure mode 最貴)。
  - `confirm`:**只喺 `dryRun === false` 時檢查**,必須 `=== opcoCode`(限單一 OpCo)或 `=== 'ALL'`(全平台)。唔啱 → **400**,訊息講明要打咩。
- 命中條件:`OR: [{ allocatedQuantity: { not: 0 } }, { assignedQuantity: { not: 0 } }]`(+ optional `opcoId`)。已經 0/0 嘅 row 唔算入 `affected`(跟 CH-016 no-op 語意)。
- 寫入(單一 `$transaction`):
  1. `updateMany` → `{ allocatedQuantity: 0, assignedQuantity: 0 }`
  2. `ledgerAdjustment.createMany` → **每個 `assignedQuantity > 0` 嘅 cell 一條**,`field: 'assignedQuantity'` / `beforeValue` / `afterValue: 0` / `reason` / `actorId`(ADR-0022 D4)
  3. `auditLog.create` → 一行 summary,新 action **`LEDGER_FULL_RESET`**,`targetId: 'bulk'`
  🔴 **絕不** `delete` / `deleteMany`。
- 回應 `{ dryRun, affected, scope, rows[], allocatedCells, assignedCells, irreversibleAllocated, warning }`
  - `rows[]` 每行:`opcoCode` · `skuPartNumber` · `allocatedBefore` · `assignedBefore` · `skuActive`
  - `assignedCells` = 有 assigned 要清嘅格數 ⇒ **全部都係 import 救唔返嘅**
  - `irreversibleAllocated` = allocated 格入面 SKU 已停用嗰啲(CH-016 §2.5 個坑照樣成立)

**`warning` 必須分兩句(ADR-0022 D7)** —— 唔可以合併成「import 返就得」,嗰句對 assigned 係錯:
1. 中間態:未 import 之前 allocated=0 ⇒ ADR-0016 budget gate 擋 assign。
2. **assigned 冇回頭路**:`N` 格 assigned 歸零,**重新 import 一格都救唔返**(ADR-0004 #5),唯一出路 = 重跑 `init-assigned-baseline.ts` 或逐格 `PATCH /license/ledger/:id`;drift 對帳喺灌返 baseline 之前冇基準。

### 2.4 Frontend(`apps/web` Settings)

**唔加第二個掣** —— 喺既有 `AllocationResetCard` 加一個 mode 選擇(ADR-0022 Negative 第三點):
- `Allocation only`(default)→ 打 CH-016 endpoint,文案 / 行為完全同今日一樣。
- `Allocation + assigned — full reset` → 打 CH-017 endpoint。
- 非 ADMIN:full 呢個選項 **disabled**(前端 gate 沿用 AUTH-3b `useMe` role,後端 403 為真 gate)。
- Card 文案隨 mode 變:今日嗰句「assignedQuantity is never touched」喺 full mode **必須換走**,唔可以留低變成謊話。

**Dialog(full mode)**
- 表多兩欄:`Allocated now` / `Assigned now`。
- `assignedCells > 0` → 一段 `text-warn` 明講「呢 N 格 assigned import 救唔返」。
- **打字確認**:input,要打 `ALL` 或該 OpCo code 先解鎖 commit 掣(placeholder 講明要打咩)。
- Server 嘅 `warning` 照樣逐字 render(唔喺前端改寫,兩邊唔會 drift)。
- Light + dark 都要驗;token-only,唔加新色值(H6)。

### 2.5 Ops script(ADR-0022 D5)

`apps/api/prisma/reset-ledger.ts` —— **同 endpoint 共用同一個 service / 同一份 plan 邏輯**,唔各寫一份(跟 ADR-0021「script 同 endpoint 共用同一份 lookup」)。dry-run default,`--commit` 先寫,`--opco=CODE` 收窄。

### 2.6 Test(H5 — ledger 更新係明文 critical path)

- 🔴 **零 delete**:commit 之後 ledger row 數**一模一樣**。
- 🔴 **兩個數字都變 0**,而且**只有 in-scope 嘅行變**(其他 OpCo 逐行對前後值)。
- 🔴 **`LedgerAdjustment` 條數 = 原本 `assigned > 0` 嘅格數**,而且 `beforeValue` 對得返原值 / `field === 'assignedQuantity'`。allocated 唔會產生 adjustment。
- `dryRun` default(body 冇 `dryRun` 都當 dry-run)→ **零寫入**。
- `dryRun: false` 但 `confirm` 唔啱 / 冇 → **400 + 零寫入**(逐個 case:冇 confirm、confirm 打錯、單 OpCo 打咗 `ALL`)。
- `opcoCode` 唔存在 → 404 + 零寫入。
- 已經 0/0 嘅 row 唔算入 `affected`。
- REGIONAL → **403**(呢條就係 CH-016 同 CH-017 權限唔同級嘅守門 test)· OPCO_IT → 403。
- audit 有一行 `LEDGER_FULL_RESET`。
- **CH-016 既有 test 全部照跑照綠**(佢個 service 冇被改)。
- 前端:mode 切換打對 endpoint · 非 ADMIN 見到 full 係 disabled · confirm 打啱先解鎖 commit。

### 2.7 Out of Scope（explicit）

- ❌ **唔 hard delete ledger row**(ADR-0022 D1 已 present 過 A / A+ 兩個 option,Chris 揀咗清零)。
- ❌ **唔改 CH-016 嘅 service / endpoint / test** —— 佢係對照組。
- ❌ **`reconcile` 一個字唔改**(同 ADR-0016 同一取態)。
- ❌ **唔 auto 重跑 baseline** —— full reset 之後灌返 assigned 係獨立、要人手決定嘅動作。把佢串埋一齊會令「清空」偷偷變成「換一批數」。
- ❌ **唔做 undo / 快照** —— 要做係另一個 CH。
- ❌ **唔掂 `Opco` / `SkuCatalog` 表**(當初問過,Chris 揀咗只清 ledger)。

## 3. Acceptance Criteria

- [ ] `POST /license/ledger/reset` 出現喺 `/docs/api`,body / response shape 見得到
- [ ] dry-run(default)→ `affected` / `rows[]` 正確,**DB 一個 byte 都冇變**
- [ ] `dryRun:false` + 啱嘅 `confirm` → in-scope row 兩個數字都變 0
- [ ] 🔴 **ledger row 數前後完全一致**(真 DB 前後對比)
- [ ] 🔴 **`LedgerAdjustment` 增加咗嘅條數 = 被清嘅 assigned 格數**,`beforeValue` 對得返
- [ ] `confirm` 唔啱 → 400 且**零寫入**
- [ ] `opcoCode: "RHK"` → 只有 RHK 變,其他 23 個 OpCo 逐行對前後一致
- [ ] `warning` 兩句都在:中間態 + **assigned 冇回頭路**
- [ ] REGIONAL → 403 · OPCO_IT → 403 · ADMIN → 200
- [ ] `/admin/audit` 見到一行 `LEDGER_FULL_RESET`
- [ ] Full reset 之後重新 import → **allocated 返晒(active SKU)**,而 **assigned 全部仍然 0** —— 且呢件事撳之前已經顯示過
- [ ] 前端:mode 二選一 · full 要打確認字串 · 非 ADMIN disabled · light + dark 都驗
- [ ] ops script dry-run / `--commit` / `--opco` 三種都行過
- [ ] `cd apps/api && npm test` 全綠(**含 CH-016 既有 test**) · `cd apps/web && npm test` 全綠
- [ ] 🔴 **`npm run lint`(repo root,CI 同一條)exit 0**
- [ ] `ui-design` skill 跑過,零 violation

## 4. Risks

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | 清咗 assigned 冇即刻灌返 baseline ⇒ drift 對帳長期冇基準 | **Med** | **High** | `warning` 第二句 + dialog `text-warn` 明講;完成畫面直接指去 ADR-0014 script。**形態本身係 Chris 明知並揀嘅** |
| R2 | 有人想清 allocation 但揀錯 full mode | Med | **High** | default = allocation only · full 要**打字**確認 scope · dialog 表分開兩欄睇到 assigned 會冇 |
| R3 | 將來有人「順手」把呢個 service 擴去 delete row | Low | **High** | §2.7 明文 + test 守 row 數不變 |
| R4 | 兩個 endpoint 名太似,日後改錯邊個 | Med | Med | §2.2 對照表 + 兩個獨立 service/檔案 + CH-016 test 保持綠做迴歸網 |
| R5 | 前端 role gate 當成安全邊界 | Low | High | 後端 `@Roles(ADMIN)` 係真 gate,前端只係 UX;403 有 test |

## 5. Effort Estimate

**~1.5 日**(backend + test ~0.6 · frontend ~0.4 · ops script ~0.2 · 真 DB 前後對比 live 驗 ~0.3)。

## 6. Dependencies

冇。唔需要真 Graph / 真 SN。live 驗證用本地 dev DB(150 row / 6049 assigned)前後對比。

## 7. Spec Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-08-02 | Initial draft(proposed);ADR-0022 同步起草 | Chris 試用 CH-016 後指出要嘅係「記錄清走可以重新導入」 | — |
| 2026-08-02 | 兩項拍板:① **清零兩個數字、row 留低**(否決 hard delete / hard delete + audit snapshot)② **API + UI + ops script 三邊都要** | 起草前提問,即場定案 | Chris |

---

**Lifecycle reminder**:呢份 spec locked after status=approved。重大 deviation → §7 changelog。
**Gate reminder**:status 而家係 `proposed` —— **Chris review + approve 先可以 `approved` + 開始 code**(PROCESS R1.change)。
