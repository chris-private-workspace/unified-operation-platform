# CH-027 — Progress

## Day 1 — 2026-08-12（實作 A–H）

**Commit**:`68297a8` `feat(license): CH-027 tenant 可用 seat 計埋寬限期 —— owned / gate 唔再只睇 enabled`（26 files, +1215/−171）

### 做咗

| 區 | 內容 |
|---|---|
| **A** | `SubscribedSku` 加三個 bucket;`getSubscribedSkus()` 全部 `?? 0` 兜底 |
| **B** | `TenantSkuSnapshot` 加四欄 + 手寫 migration `20260812160000_ch027_tenant_seat_buckets`（**只加欄**） |
| **C** | `catalog.service.syncFromTenant` 存齊 |
| **D** | seam ② 加 `assignableUnits`;graph = `enabled + warning`,n8n = `prepaidEnabled` |
| **E** | `owned = enabled + warning` + `ownedBreakdown`（DTO 宣告） |
| **F** | gate 改用 `assignableUnits` + grace-period `detail` |
| **G** | `noPrepaidSeats` 收窄;badge 由 `capabilityStatus` 讀 |
| **H** | Platform view 副行 + hover breakdown + KPI `Available seats` |

**數字**:api **995 → 1011 / 73 suites** · web **343 → 358** · api lint **0** · web lint 回到 **16 條 pre-existing** · tsc 兩邊 **0**。

### 🔴 值得帶走嘅三件事

**① Falsification ② 第一次冇紅 —— 而個原因唔係我懶,係我睇唔出。**
拆走 `capabilityStatus` 改由 `suspended > 0` 推,**27 條全綠**。我原本兩條 G2 assert 一正一反,睇落已經夾住;但**兩個 fixture 之下兩條規則永遠同時成立**（VIVA 兩個都真、預設 case 兩個都假）⇒ 分辨唔到。加咗一條**兩者衝突**嘅 case（`suspended:0, lockedOut:5, capabilityStatus:'Suspended'`）先真紅。

📌 同 CH-023 tautology、BUG-011 `toHaveProperty(key)` 同族,而且**今次唔係靠自己睇出嚟,係靠真跑 falsification 揭穿** —— 呢個就係點解 T4 唔可以省。

📌 順帶:嗰個「衝突形狀」唔係砌出嚟遷就 test。`capabilityStatus` 係 Microsoft 對**訂閱**嘅判斷,四個 bucket 係**會郁嘅數** —— 保留期一完 seat 就離開 `suspended`,而判斷仲喺度。**呢個正正就係 ADR-0033 D1 揀「存 status」唔揀「由數推」嘅理由**,而家有一條 test 守住佢。

**② BUG-011 個縫今次真係關住咗,而且係 type-level。**
DTO 一宣告 `ownedBreakdown`,`apps/web` tsc **即刻紅 5 個 fixture**。BUG-011 嗰次「加咗欄落 read-model 但出唔到 API 而三層 test 全綠」,今次同一個動作即刻有閘攔住 —— 唔使靠記性。

**③ `Test-Path` 級數嘅教訓,今次出喺 lint 計數。**
`LINT-web` 個數畀人手數咗四次（25 → 16 → 15 → 16),四次都係喺 lint 輸出上面數行。今次改動令佢升到 27,`--fix` 我自己兩個檔之後**準確回落 16**,eslint 自己印 `✖ 16 problems` ⇒ **一次前後對比 + 一個工具自報**。已入 BACKLOG:`allocation-reset.test.tsx` 11 · `allocation-reset.tsx` 4 · `sync-check.test.tsx` 1,CH-024 記嗰個 15 確認漏數一條。

### ⚠️ 偏離 spec（R3，已入 spec §8 + checklist）

1. **acceptance D2「n8n 既有 test 一條都唔使改」字面守唔到** —— `listTenantSkus` 個 `toEqual` **形狀** assert 要加 `assignableUnits`,因為契約真係多咗一個欄。**行為** assert 同 `license-ops.contract.spec.ts` 跨 provider 等價**一條唔改** ⇒ D2 意圖守住。
2. **F4 加咗一條反面 acceptance** —— 原文只講「靠 `warning` 撐起嗰陣要有 detail」,單獨嘅話 `graceSeats > 0` 就滿足到,而咁樣**每個 `SPE_E3` assign 都會被標成 grace**。反面 case（`enabled` 夠用 ⇒ `detail` 必須 `undefined`）先真正約束到條件。

### 🚧 未完（全部同一個原因）

| 項 | 卡乜 |
|---|---|
| **B-4** migration 未對真 DB 跑 | 本地 stack |
| **V-5** light + dark 真 render（`ui-design` 逐條自檢已做,DS-4 / DS-11 差 render） | 本地 stack |
| **V-6** 真環境 sync 驗 `SPE_E3` `owned` 21 → 4498 | 本地 stack |

**本地 stack 停咗** —— 5433 畀 `ai-doc-extraction-db` 佔住,**停佢係另一個項目嘅事,要 Chris 批**。⚠️ 而且 2026-08-12 實測佢**停咗會自己返嚟兼搶走個 port**(見 `CLAUDE.md §9`),所以要做就一氣呵成。

⇒ 三項同 **CH-026 D-9 / A-2** 一齊做最抵,因為佢哋卡住同一件事。
