---
doc_type: how-to
title: "License assets 生產數據初始化(由空 DB 到可開放使用)"
audience: 操作者(Regional IT / 部署執行者)+ 開發者
last_updated: 2026-07-25
---

# How to 初始化 license assets 數據

> **對內** how-to。對外終端用戶手冊入 `08-user-guide/`。
> **來源**:W35 F1(`docs/01-planning/W35-data-initialisation/`)。決策依據 `DESIGN.md §5`、ADR-0004、ADR-0007、**ADR-0014**。

## 目的

平台功能鏈(catalog / ledger / import / 對帳 / drift / assign)全部就緒,但**數據要人手初始化** —— 平台唔會自己知道邊個 OpCo 買咗幾多座位、上線前已經派咗幾多。本指南由**空 DB** 帶到**可開放使用**。

`DESIGN.md §5`(line 96)定義嘅前提:

> 上線前 → 建 per-OpCo ledger → 跟 M365 實際總數比對 → 把差異**全部清乾淨**建立 baseline → 才開始用。

⚠️ **唔跟呢個次序嘅後果**:`assignedQuantity` 留 0 就跑 `reconcile` → 拿 tenant `consumedUnits` 對 0 → **每個 SKU 都爆 `DriftAlert`**,drift 功能上線即失去信號價值。

## 前置

| 項目 | 要求 | 備註 |
|---|---|---|
| DB 連線 | `DATABASE_URL`(見 `apps/api/.env.example`) | 步 1 需要;步 5 script 亦需要 |
| Graph 憑證 | `GRAPH_TENANT_ID` / `GRAPH_CLIENT_ID` / `GRAPH_CLIENT_SECRET` | **步 2 + 步 6 硬前置**(兩步都 live 讀 tenant)。非機密兩個 id 亦可經 UI 改(ADR-0013),但 **secret 永遠只經 env,絕不落 DB** |
| 平台帳號 | **ADMIN** 或 **REGIONAL** | 步 2/3/4/6 全部 `@Roles(ADMIN, REGIONAL)`;`OPCO_IT` **做唔到**(import 更係 ADMIN/REGIONAL only,ADR-0004 OD2) |
| 來源檔 | O365 license summary(Excel → 匯出 CSV) | 步 4 = budget 數;步 5 = 已派座位數。兩者格式相同,詳見步 4 |
| ⚠️ H4 | **絕不**把真實 secret / 真實 UPN 寫入本文件或任何 commit | 本文件所有值一律 placeholder |

---

## 步驟

### 步 1 — Schema + 基礎 seed(OpCo + break-glass admin)

```bash
# 本地 dev
npm run prisma:migrate -w @uop/api     # prisma migrate dev
npm run seed -w @uop/api

# 已部署環境(ACA):走 prisma migrate deploy,唔用 migrate dev
npm run prisma:deploy -w @uop/api
npm run seed -w @uop/api
```

預期輸出:`Seeded 23 OpCos + admin + RHK OPCO_IT user.`

- **break-glass 本地 admin(`admin@uop.local`)只在 `LOCAL_ADMIN_INITIAL_PASSWORD` 有值時才建**(`seed.ts:83-102`,H4:唔 hardcode 密碼)。冇設 → 印 `LOCAL_ADMIN_INITIAL_PASSWORD not set — skipping local admin seed.`,屬正常。
- seed **唔會**建 `SkuCatalog`(`seed.ts:105` 明文註),亦唔會建 ledger。呢個係刻意 —— SKU 真相只可來自 tenant(步 2)。
- ⚠️ **`npm run demo:ledger -w @uop/api` 絕對唔可以喺生產跑** —— 佢用 `Math.random()` 生假 allocation(`seed-demo-ledger.ts` 檔頭自認 `DEV/DEMO ONLY`)。只供本地 demo。

**驗證**:`GET /opcos` 回 23 個 OpCo;能以 admin 登入。

---

### 步 2 — 由 tenant 灌 SKU 字典(`SkuCatalog`)

**UI**:`SKU Catalog` 頁 → **「Sync catalog from tenant」**(`catalog.tsx:215`)
**API**:`POST /license/catalog/sync`

做咗啲咩(`catalog.service.ts:43-107`):

- 讀 tenant `subscribedSkus`,以 **`skuId`(GUID)** 為唯一主鍵 upsert 入 `SkuCatalog`(**唔信名**,DESIGN §5)
- 新 entry:`displayName = skuPartNumber`(placeholder)、`businessAlias = null`、`category = null`
- **永不覆寫** human-curated 欄位(`businessAlias` / `category` / `displayName` / `isBaseLicense`)→ curate 完唔會被下次 sync 沖走
- 每個 SKU 同時寫一條 `TenantSkuSnapshot`(`prepaidEnabled` = 買咗幾多 / `consumedUnits` = tenant 實際派咗幾多)
- tenant 唔再返嘅 SKU → **soft-deactivate**(`active=false`),絕不 hard-delete(保 FK)

預期輸出:`{ created, updated, deactivated, snapshots }`

> 🔴 **本步需要真 Graph 憑證。** Graph 唔通 → 乾淨 **503**(`graphUnavailable`,BUG-002 後已 harden,唔會 crash)。
> **UAT 現時係 placeholder 憑證**(W33 D3)→ 本步**未經 live 驗證**,屬 `DEPLOY-harden` 範圍。呢個係已知 honest gap,唔係本指南可以繞過嘅。

**驗證**:`GET /license/catalog` 見到 SKU 清單;Catalog 頁副標顯示 `… synced from tenant <時間>`。

---

### 步 3 — Curate `businessAlias` / `category`(⚠️ 決定 scope 邊界)

**UI**:`SKU Catalog` 頁 → 每行 **Edit**(`catalog.tsx:58` `EditSkuDialog`,CH-003)
**API**:`PATCH /license/catalog/:id`(只收 `businessAlias` / `category` / `isBaseLicense`)

| 欄 | 填咩 | 幾時必要 |
|---|---|---|
| `businessAlias` | **逐字** = O365 CSV col-A 個 label | **步 4 / 步 5 匹配靠佢** —— 冇值 = 該 SKU 永不入 ledger |
| `category` | 分組用自由字串(現用值:`Base` / `Add-on` / `Power Platform` / `Security` / `Dynamics 365`) | asset-list 分組顯示 |
| `isBaseLicense` | base bundle(E3/F3)vs add-on | **UI hint,非 hard gate** |

> **curation-as-scope**(ADR-0004 Decision #3):**唔 curate `businessAlias` 嘅 SKU 就唔會入 ledger。** curation set 本身就係 scope 邊界 —— 平台冇 name denylist、冇 M365-only filter。D365 SKU 亦係一樣處理(ADR-0008 D5;runbook 見 `W27-d365-scope/CURATION-D365.md`)。

`skuId` / `skuPartNumber` / `displayName` / `active` 係 system-owned(由步 2 sync 寫),UI 改唔到。每次 curate 有 audit(`catalog.update`,ADR-0009)。

**驗證**:`GET /license/catalog` 中要 track 嘅 SKU 都有 `businessAlias`;步 4 dry-run 時 `skippedSkuLabels` 只剩你**故意唔要**嘅 row。

---

### 步 4 — 匯入 budget 數(`allocatedQuantity`)

**UI**:`Settings` › allocation import 面板(`components/settings/allocation-import.tsx`)
**API**:`POST /license/ledger/import`(body:`{ csv, dryRun }`)

**CSV 格式**(ADR-0004 Decision #1/#2;實作真相 `allocation-import.service.ts:52-92`):

```csv
SKU,RHK,RTH,RAPO/IT,...,Grand Total
M365 E3 Unified Existing Customer Sub Per User,120,45,8,...,173
Power BI Pro Sub Per User,20,,3,...,23
```

| 位置 | 規則 |
|---|---|
| Row 1(header) | 每欄**逐字** = `Opco.code`。`Grand Total` 會被忽略;對唔上嘅欄 → `unknownOpcoHeaders`(唔會靜靜食咗) |
| Column A | **逐字** = `SkuCatalog.businessAlias`(trim 後 exact,**零 fuzzy**)。對唔上 → `skippedSkuLabels`,唔入 ledger |
| 格 | 非負整數座位數。空白 / 非數字 → **0** |

流程:**dry-run 先行**(default `dryRun: true`,ADR-0004 OD4)

1. 上傳 CSV → 撳 **Preview import** → 睇 `summary`(`opcoColumns` / `skuRows` / `mappedSkuRows` / `changes`)
2. **必睇兩張跳過清單**:`skippedSkuLabels`(未 curate → 回步 3)、`unknownOpcoHeaders`(OpCo code 打錯 / OpCo 未建)
3. 確認無誤 → **Commit** → 只寫 `allocatedQuantity`

> 🔒 **硬 invariant**(ADR-0004 Decision #5):import **永遠唔會掂 `assignedQuantity`**。呢個係保護對帳 baseline 唔被 budget 數污染嘅機制屏障 —— 所以 baseline 要另行建立(步 5)。
> **Idempotent**:同一個檔 re-import → `changes: 0`。

**驗證**:`GET /license/ledger/stats` 見到 allocated 總數;Assets › By-OpCo 見到真數。

---

### 步 5 — 建立已派座位 baseline(`assignedQuantity`)

> 機制 = **一次性 ops script**([ADR-0014](../adr/0014-assigned-baseline-initialisation.md) Accepted)。本步係**唯一**建立 baseline 嘅認可方式 —— 唔好用其他方法臨時頂替(見下「唔可以咁做」)。

```bash
# dry-run(default):只印 before → target → delta + skipped,唔寫 DB
npm run baseline:assigned -w @uop/api -- --file=<assigned.csv>

# 核對過 plan 之後才 commit(--actor 令 audit trail 有名有姓)
npm run baseline:assigned -w @uop/api -- --file=<assigned.csv> --actor=<你的登入 email> --commit
```

輸出樣式(真實 dry-run):

```
Mapped: 23 OpCo columns · 8/8 SKU rows · 1 cell change(s)

  OpCo            SKU                    before → target   delta
  PFU-Asia        Microsoft_365_Copilot       0 → 7           +7

DRY RUN — nothing written. Re-run with --commit to apply.
```

- **CSV 格式與步 4 完全相同**(header = `Opco.code`、col A = `businessAlias`、格 = 整數),只係數字語意由「買咗幾多」變成「**已經派咗幾多**」→ 所以**步 4 個範本可以直接改數字當步 5 用**
- **只寫 `assignedQuantity`**(鏡像反向 invariant:此 script 絕不改 `allocatedQuantity`;有 test 鎖死,亦已對真 DB 驗過 —— commit 後 `allocatedQuantity` 仍然係 0)
- row 唔存在會 create(`allocatedQuantity` 留 0,交由步 4 補);cell 值同現況一樣就跳過 → **重跑安全**(idempotent,唔會生重複 audit)
- 每格改動寫一條 `LedgerAdjustment`(`field=assignedQuantity`,`reason='go-live baseline (init-assigned-baseline)'`)= 與 ADR-0007 手動校正同一 audit 表
- 唔傳 `--actor` 都行(`LedgerAdjustment.actorId` 可為 null),但 script 會出 warning —— **建議一律傳**
- ⚠️ **執行者權限等同 DB 直連**(script 唔經 API role guard)—— 只應由部署執行者跑
- ⚠️ **唔可以**擴呢個 script 做重複性批量更新;有該需求 = 寫新 ADR 升級成 bulk endpoint(ADR-0014 Consequences)

> **已知限制(DD-3)**:CSV 格值 0 而現況亦係 0 → **唔會建 ledger row**(no-op)。後果係:日後若 drift 落喺呢類 (OpCo, SKU) 組合,`PATCH /license/ledger/:id` 會 **404**(冇 row 可改),而平台**冇** endpoint 可以憑空建 row。
> **現有 workaround**(ADMIN / ops):喺 CSV 該格填一個真數(或用步 4 import 填 allocated)令 row 物化,之後就 PATCH 得。⚠️ **OPCO_IT 冇 workaround** —— 佢改得但 create 唔到。
> 詳情同解封條件見 `docs/01-planning/DEFERRED_REGISTER.md` **DD-3**。

**唔可以咁做**:

| 唔可以 | 點解 |
|---|---|
| 期望 import 幫你填 assigned | ADR-0004 硬 invariant,永遠唔會寫 |
| 靠 assign 流程「補回」歷史 | `assign` 只 `+1`(`assign.service.ts:163`),反映上線**之後**嘅新 assign,追溯唔到既有存量 |
| 逐格 `PATCH /license/ledger/:id` 填完 851 格 | 技術上做得(ADR-0007),但 23 × 37 不現實;而且 row 未存在會 **404**。**若你嘅實際格數遠少於 851**,呢條路可行 —— 用 Assets › By-OpCo 行內 ✎(W23-B) |
| 擴 script 做重複性批量更新 | 🔴 ADR-0014 明文:有該需求 = **寫新 ADR 升級去 bulk API(選項 B)**,唔好靜靜擴 script |

**驗證**:`GET /license/ledger/stats` 嘅 assigned 總數 ≈ tenant `consumedUnits` 總和;然後靠步 6 精確確認。

---

### 步 6 — 對帳 → 把差異清乾淨

**UI**:`Drift Alerts` 頁 → **「Run reconciliation now」**(`drift.tsx:67`)
**API**:`POST /license/reconcile`

做咗啲咩(`reconcile.service.ts`):逐個 **active** SKU 算
`delta = tenant consumedUnits(live) − Σ assignedQuantity(所有 OpCo)`,對唔上就開 `DriftAlert`。
**只有 `assignedQuantity` 參與** —— `allocatedQuantity` 純顯示(DESIGN §5)。

> 🔴 **本步同步 2 一樣硬依賴 Graph**(`consumedUnits` 係 **live** 讀,`reconcile.service.ts:22`)。冇憑證 → 乾淨 503 → **連 go-live gate 都過唔到**。所以真憑證唔係「之後補」嘅事項,係初始化嘅硬前置。

清 drift 嘅做法:

1. 跑 reconcile → 睇 `GET /license/drift` 有邊個 SKU 有 delta
2. delta ≠ 0 = 平台 baseline 同 tenant 實況唔一致 → **人手判斷差異落喺邊個 OpCo**,用 Assets › By-OpCo 行內 ✎ 改該 OpCo 嘅 `assignedQuantity`(ADR-0007 對回機制,每次改有 `LedgerAdjustment` audit)
3. 再跑 reconcile → 重複到 **零 OPEN drift**

> **冇 manual dismiss endpoint** —— drift 係下次 reconcile 自動 resolve 嘅(`drift.tsx:17-18`)。所以「清 drift」= 真係改對數字,唔係 dismiss 掉。

**驗證**:`GET /license/drift` 回**空**(或全部非 OPEN)。**呢個就係 `DESIGN.md:96` 嘅 go-live gate。**

---

### 步 7 — 開放前驗證清單

| # | 檢查 | 通過條件 |
|---|---|---|
| 1 | `GET /opcos` | 23 個(或你實際 OpCo 數) |
| 2 | `GET /license/catalog` | 要 track 嘅 SKU 齊、`active`、有 `businessAlias` |
| 3 | `GET /license/ledger/stats` | allocated / assigned 兩個總數都**唔係 0** |
| 4 | `GET /license/tenant-skus` | owned / allocated / assigned / unallocated 四層數字合理(over-allocated 有 flag 但唔阻塞,ADR-0007 §6) |
| 5 | `GET /license/drift` | **零 OPEN drift**(步 6 gate) |
| 6 | Assets › By-OpCo(以 `OPCO_IT` 身分) | 只見自己 OpCo(AUTH-3a scope 生效) |
| 7 | `GET /admin/audit` | 見到 `catalog.update` / `allocation.import` 記錄 = 初始化留痕齊 |
| 8 | 假數清查 | 生產 DB **冇跑過** `demo:ledger`;抽查幾行 ledger 數字對得返來源檔 |

---

## 驗證

跑完步 7 全部 8 項 = 數據初始化完成,可開放使用。

**最關鍵兩項**:第 5 項(零 OPEN drift)證明 baseline 同 tenant 一致;第 8 項防止假數據混入生產 —— 本地 demo seed 用隨機數,一旦誤跑落生產,drift 會永遠對唔上而且極難察覺來源。

## 常見問題

| 症狀 | 原因 | 解法 |
|---|---|---|
| 步 2 **或步 6** 回 **503** | Graph 憑證未配 / 唔通(公司 proxy 亦可能擋)—— 兩步都 live 讀 tenant | 查 `GRAPH_*` env 三個值;確認 app registration 有 `Directory.Read.All` 類權限。UAT 現係 placeholder(W33 D3)= 已知 gap。**冇憑證 = 初始化做唔完**(步 2 灌唔到 catalog、步 6 過唔到 gate) |
| dry-run `mappedSkuRows: 0` | `businessAlias` 全部未 curate,或 CSV col-A 同 alias 差咗字(空格 / 大小寫 / 全形) | 回步 3;比對 `skippedSkuLabels` 逐字對 `GET /license/catalog` 嘅 alias |
| `unknownOpcoHeaders` 有值 | header 唔係逐字 `Opco.code`,或該 OpCo 未建 / 已 deactivate | 改 CSV header,或喺 Settings › OpCos 建 OpCo(CH-004) |
| commit 後 Assets 見到 allocated 但 assigned 全 0 | **正常** —— import 唔寫 assigned(ADR-0004 invariant) | 做步 5 |
| reconcile 後每個 SKU 都爆 drift | baseline 未建(步 5 跳過咗) | 做步 5,唔好用 dismiss 掩蓋 |
| curate 完 sync 一次就冇咗 | 唔應該發生 —— sync 明確唔覆寫 curated 欄位(`catalog.service.ts:66`) | 若真係發生 = bug,開 BUG 單 |
| `PATCH /license/ledger/:id` 回 **404** | 該 (OpCo, SKU) 組合冇 ledger row | row 由步 4 import 或 assign 產生;**冇** endpoint 可以憑空建 row(W35 F4 待決) |
| `OPCO_IT` 撳唔到 sync / import | 設計如此(ADR-0004 OD2:全-OpCo 中央操作) | 用 ADMIN / REGIONAL 帳號 |

## 相關文件

- `docs/02-architecture/licenseops/DESIGN.md` §5 — 初始化流程 / ledger 兩層數字 / 對帳方案甲
- [ADR-0004](../adr/0004-allocation-import-mechanism.md) — import 機制 · curation-as-scope · `allocatedQuantity`-only invariant
- [ADR-0007](../adr/0007-opco-ledger-manual-management.md) — 逐格手動校正 / 對回機制
- [ADR-0014](../adr/0014-assigned-baseline-initialisation.md) — **步 5** baseline 機制決策
- `docs/01-planning/W27-d365-scope/CURATION-D365.md` — D365 SKU curation(步 3 嘅 D365 專門版)
- `docs/05-usage/INTEGRATION_SETUP.md` — Graph / ServiceNow 憑證配置
- `docs/13-deployment/` — 部署本身(本指南只講數據)
