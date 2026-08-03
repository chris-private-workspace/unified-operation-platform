# ADR-0023: SKU catalog 批量 curation（CSV round-trip + dry-run + 重複 alias fail-closed）

**Date**: 2026-08-03
**Status**: Accepted
**Approver**: **Chris Lai**（2026-08-03）

## Context

Chris 2026-08-03:「現在是需要逐個修改它們的 alias，這樣會有些麻煩，可能批量修改嗎？」

實測現況（2026-08-03,`GET /license/catalog` dev），唔係推測：

| 事實 | 數 |
|---|---|
| Active SKU | **99** |
| 有 `businessAlias` | **8** |
| 有 `category` | **8** |
| 現存重複 alias | **0** |

即 **91 個 SKU 未 curate**,而唯一嘅 curation 路徑係 `PATCH /license/catalog/:id`（CH-003,一次一個,前端 Dialog 逐個開）。CH-018 已經加咗 `Export CSV`,但當時 Chris 明文拍板「只睇,唔做 round-trip」,並喺 `CH-018/spec.md §2.6` 預告:批量改 alias 係另一張單,而且**掂 ADR-0004 curation-as-scope,要 dry-run + audit**。

### 點解呢個係架構-adjacent（H1 觸發）

兩個獨立理由:

1. **新 write 機制 + 新 API surface** —— ADR-0004 自己嘅 Context 就係用同一條理由寫出嚟嘅（「新增一條寫入 ledger 的 import 機制 + 新 API surface 屬架構-adjacent 決定」）。
2. **佢改嘅係 scope 邊界本身**。ADR-0004 Decision #3 把 curation set 定義成 scope:一個 SKU 有冇 `businessAlias`,決定佢入唔入得到 ledger。逐個改 = 一次動一格,錯咗即刻見到;一個檔上傳 = **一次過重畫成條邊界**。

### 🔴 查證期間揭到一個既有 latent bug（批量會大幅放大佢）

`SkuCatalog.businessAlias` **schema 冇 unique constraint**（`schema.prisma:124`),而兩個 consumer 對「兩個 SKU 撞同一個 alias」嘅取態係**相反**嘅:

| Consumer | 行為 | 位置 |
|---|---|---|
| 前端 allocation 範本 | **first-wins** —— `seenAlias` 擋住,只生一行 | `allocation-template.ts:63-67` |
| 後端 allocation import | **last-wins** —— `skuByAlias.set()` 後蓋前,而 `findMany` **冇 `orderBy`** ⇒ 邊個贏唔確定 | `matrix-csv.ts:86-90` |

後果:範本嗰行填嘅 seat 數,**可以寫咗落另一個 SKU 度**,冇任何錯誤訊息、冇 audit 痕跡分辨得出。今日靠「得 8 個 alias 且全部人手逐個打」壓住;開咗批量貼上,呢個變成一個 copy-paste 就撞到嘅日常失誤。

## Decision

新建 **`POST /license/catalog/import`**（LicenseModule 內,`@Roles(ADMIN, REGIONAL)` —— 同 `PATCH catalog/:id` 一致,唔無故收緊）:

1. **輸入 = CSV 文字**（raw-text body 落 DTO string 欄,跟 ADR-0004 #1;前端 `file.text()`）。重用既有 `parseCsv`（`license/csv.ts`）—— **零新 dependency**。

2. **對帳鍵 = `SkuId` GUID,exact**（trim + case-insensitive 比較,catalog 99 行載入記憶體建 Map）。**絕不靠名 / part number / display name** —— CLAUDE.md §13 locked,而 `businessAlias` 存在嘅原因本身就係「Excel 個名對唔上 API」（DESIGN §93）。GUID 對唔到 → 列入 `skippedSkuIds`,**永不新建 catalog row**（identity 由 tenant sync 獨家擁有;打錯一個 GUID 就憑空生出一個 reconcile 永遠對唔到嘅幽靈 SKU）。

3. **可寫 = 三個 curated 欄**（`businessAlias` / `category` / `isBaseLicense`),同 `PATCH` 嘅 surface 逐字一樣,共用同一個 `normalizeOptional`。`Display name` / `Part number` / `Active` / `Last synced` 呢幾欄**照收、直接無視**（唔報錯）—— 咁 CH-018 個 export 先至原封 round-trip 得返。

4. **Dry-run default**（`dryRun: true`,跟 ADR-0004 #4）。Preview = **逐個 SKU** 嘅 before → after。要寫入必須 explicit `dryRun: false`。原封重傳一次 export = **零改動**（idempotent）。

5. **🔴 重複 alias = fail-closed,整批唔寫。** 計出「套用呢個檔之後」嘅 alias 全集 —— 範圍係**成個 active catalog**,唔止上傳嗰幾行（因為改一行嘅新 alias 可以撞到一個檔入面根本冇出現過嘅 SKU）。任何非空 alias 落喺 ≥2 個 SKU → `400`,一個字都唔寫,回報撞邊個 alias、撞邊幾個 SKU。
   - Chris 2026-08-03 三選一拍板揀「整批擋住」（否決「只擋撞嗰幾行」/「照寫出 warning」）。理由:後果係**靜默**嘅,冇人會發現,所以唔可以留一個「一半應用咗」嘅中間態。
   - **實測支持**:今日 0 個撞 ⇒ 呢道閘擋唔到任何今日行得通嘅嘢。
   - 🔴 **呢道閘同時管兩條 write path**（Chris 2026-08-03 答 OQ-1「都做」):批量 import **同** 單筆 `PATCH /license/catalog/:id` 都要過。抽一個共用 `findAliasCollisions`,兩邊 call 同一個 —— 唔各寫一份,亦唔可以只加喺批量側（否則用單筆編輯就製造到一個撞,反過嚟令下次批量上傳被整批擋)。

6. **🔴 清空 alias 要額外確認。** Preview 把 `aliasClears`（alias 由有值 → null）同普通改動**分開兩區顯示**;commit 時只要有任何一個 clear,就必須 `confirmClears: true`,否則 `400`。
   - 理由:清 alias 令個 SKU 退出 import scope,**但佢喺 ledger 嘅既有 `allocatedQuantity` 唔會清,會凍結喺舊值** —— 之後每次 import 佢都變 `skipped`,而 Assets 畫面照樣顯示嗰個舊數。呢個係本 CH 入面**唯一一個後果喺 catalog 畫面完全睇唔到**嘅改動。
   - Chris 2026-08-03 拍板揀「preview 獨立標示 + 額外確認」（否決「當普通改動」/「完全唔准清」）。
   - 用 boolean 而唔用 CH-017 嗰種打字確認:呢個操作**可復原**（再傳一次就補返 alias）,打字確認留返畀真係冇回頭路嘅 `assignedQuantity` 清零。

7. **Audit 兩層**:每個真正改咗嘢嘅 SKU 一條 `CATALOG_UPDATE`（**重用既有 action**,before/after 同單筆編輯一模一樣 ⇒ Audit log 畫面唔使改就 render 到,alias 歷史照樣逐個 SKU 查得返）+ 一條 `CATALOG_BULK_CURATE` summary 做批次歸屬。呢個分工同 ADR-0022 D4 嘅講法同源:「per-cell 嘅 trail 喺 X,呢一行係 batch attribution」。

8. **一個 `$transaction`** 包晒 update + 兩層 audit（allocation-import 先例）。

## Alternatives Considered

- **擴 `PATCH /license/catalog/:id` 收 array** — rejected:冇咗 dry-run / preview 語意（PATCH 應該即刻生效）,而且重複 alias 呢道閘無論如何都要睇成個 catalog,唔係「多改幾個」咁簡單。
- **Multipart 檔案上傳（multer）** — rejected:同 ADR-0004 最後一項一樣,raw-text + `file.text()` 更 surgical,零 `@types/multer`。
- **靠 part number / display name 對帳** — rejected:§13 locked;而且 `businessAlias` 呢個欄存在嘅全部意義就係「唔可以信名」。
- **准許由檔案新建 catalog row** — rejected:identity 係 sync-owned（見 D2）。
- **Summary-only audit（ADR-0004 風格）** — rejected:嗰度係因為一次 import 掂數百個 ledger 格;呢度上限 99 行,而 alias 逐個 SKU 嘅歷史正正係最有價值嗰條 trail。
- **順手加 `@@unique` 落 `businessAlias`** — rejected（**留返做 OQ-1**):schema 改動屬 H1 另一條線,而且 `null` 喺 Postgres unique index 唔算重複、要 partial index,值得獨立決定。本 ADR 先用 application-level 閘門把洞封住。

## Consequences

- **Positive**:91 個未 curate 嘅 SKU 一個 pass 搞掂;**批量嘅副產品係把一個既有 silent-corruption 洞封咗**（重複 alias);dry-run + 兩道閘令 human 仍然喺 loop 入面;零新 dependency、零 schema。
- **Negative**:同三個 curated 欄之間多咗第二條 write path —— 兩邊嘅 normalize 語意同重複 alias 閘門都必須永遠一致（分別用同一個 `normalizeOptional` 同同一個 `findAliasCollisions` 壓住,唔各寫一份）。`PATCH` 加閘之後,**一個本來會成功嘅單筆編輯而家會 400**（見 OQ-1 —— 實測今日 0 個撞,所以呢個行為改動擋唔到任何今日做得到嘅嘢）。
- **Neutral**:唔掂 ledger、唔掂 `reconcile`、唔改 ADR-0004 任何一條對帳規則。改嘅只係 curation set **入面有咩**,而嗰樣嘢本來就一直係人手可改。

## Open Questions

| # | 問題 | 決議 |
|---|---|---|
| **OQ-1** | 重複 alias 呢道閘要唔要**一併加落 `PATCH /license/catalog/:id`**? | ✅ **要 —— Chris 2026-08-03 拍板「都做」**。⇒ 本 ADR D5 嘅閘門**同時管兩條 write path**,實作上抽一個共用 `findAliasCollisions`,兩邊 call 同一個。單筆側嘅語意:PATCH 之後個 alias 會撞到另一個 SKU → `400`,唔寫。落地喺 **CH-019**（唔另開單 —— 唔加就等於留返一道後門:用單筆編輯製造一個撞,令下次批量上傳被整批擋）。 |
| **OQ-2** | 要唔要順埋 export / import **inactive SKU**? | ❌ **唔要** —— CH-018 §2.6 已經界定咗係另一張單（要改 `listCatalog()` read model,連帶影響 Assets / template)。本 CH 維持 active-only。 |

## References

- [ADR-0004](0004-allocation-import-mechanism.md)（curation-as-scope = scope 邊界;raw-text + dry-run 先例）
- [ADR-0022](0022-ledger-full-reset.md)（per-item trail + batch attribution 嘅 audit 分工）
- `docs/03-implementation/changes/CH-018-catalog-export/spec.md` §2.6（本張單被明文預告）
- `apps/api/prisma/schema.prisma:124`（`businessAlias` 冇 unique constraint）· `matrix-csv.ts:86-90`（last-wins）· `allocation-template.ts:63-67`（first-wins）
- CLAUDE.md §5 H1（新 API surface + 動 locked 決策）/ H2（零新 dep）/ H5（curation = ledger scope gate → 必 test）/ H6（前端 token-only）· §13（`skuId` GUID 唔靠名）
- 落地 = **CH-019**
