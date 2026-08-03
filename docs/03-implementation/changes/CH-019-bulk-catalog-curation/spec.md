---
change_id: CH-019
title: "SKU Catalog 批量 curation — 匯出改完傳返上去,一次過改 alias / category / base"
status: approved        # draft | proposed | approved | active | done | cancelled
created: 2026-08-03
target_completion: 2026-08-05
affects_components: [apps/api, apps/web]
spec_refs:
  - ADR-0023(本 CH 嘅架構決定 — Accepted 2026-08-03)
  - ADR-0004(curation-as-scope;raw-text + dry-run import 先例)
  - CH-018 spec §2.6(明文預告呢張單)
---

# CH-019 — SKU Catalog 批量 curation

> **Spec version**:1.0(initial)
> **Owner**:Chris(提出)/ AI(起草)
> **Approved by**:**Chris Lai**(2026-08-03)

## 1. Context (Why)

Chris 2026-08-03:「現在是需要逐個修改它們的 alias，這樣會有些麻煩，可能批量修改嗎？例如現在可以下載，也準備一個上傳去批量修改 alias 和 Category、Base 的功能。」

實測(2026-08-03,`GET /license/catalog` dev),唔係推測:

| 事實 | 數 | 出處 |
|---|---|---|
| Active SKU | **99** | live |
| 有 `businessAlias` | **8** | live |
| 有 `category` | **8** | live |
| 現存重複 alias | **0** | live |
| 唯一 curation 路徑 | `PATCH /license/catalog/:id`,一次一個 | `license.controller.ts:92` |
| 前端 curation UI | Dialog 逐個 SKU 開 | `catalog.tsx:65` |

⇒ 要 curate 餘下 **91 個**,今日要開 91 次 Dialog、揭 12 頁。

CH-018 已經有 `Export CSV`(8 欄,含 `SkuId`)。本 CH = **把嗰份檔變成可以傳返上去**。

## 2. Scope (What)

### 2.1 Behavior Change

- **Before**:curate 一個 SKU = 開一次 Dialog、改、Save。冇批量路徑。
- **After**:SKU Catalog 頁多一個 `Import CSV` —— 揀 CH-018 export 出嗰份檔(改咗 alias / Category / Base licence),先睇 dry-run preview,確認後一次過寫入。

### 2.2 後端 — 新 `POST /license/catalog/import`

完整決策見 **ADR-0023**。落地摘要:

| 項 | 定案 |
|---|---|
| Role | `ADMIN` + `REGIONAL`(= class default,同 `PATCH catalog/:id` 一致) |
| 對帳鍵 | `SkuId` GUID exact(trim + case-insensitive)。**永不新建 row** |
| 可寫欄 | `businessAlias` / `category` / `isBaseLicense` —— 同 PATCH 一模一樣,共用 `normalizeOptional` |
| 其餘欄 | `Display name` / `Part number` / `Active` / `Last synced` **照收、無視**(唔報錯)⇒ export 原封 round-trip |
| Dry-run | default `true`;寫入要 explicit `dryRun: false` |
| 重複 alias | **整批 400,一個字都唔寫**(§2.4) |
| 清空 alias | 要 `confirmClears: true`,否則 400(§2.5) |
| Audit | 每 SKU 一條 `CATALOG_UPDATE`(重用)+ 一條 `CATALOG_BULK_CURATE` summary |
| 交易 | 一個 `$transaction` 包 update + audit |
| 新 dependency | **零** —— 重用 `license/csv.ts` 嘅 `parseCsv` |
| Schema | **零改動** |

**新檔**:
- `apps/api/src/license/catalog-csv.ts` —— 純 parse + 形狀驗證(唔掂 DB,獨立可測)。同 `matrix-csv.ts` 對稱。
- `apps/api/src/license/catalog-import.service.ts`
- `apps/api/src/license/dto/catalog-import.dto.ts`

**改動**:`license.controller.ts`(加 endpoint)· `license.module.ts`(provider)· `audit-fields.ts`(加 `CATALOG_BULK_CURATE` + allowlist)。

### 2.3 CSV 格式契約

Header **按名對應,唔按位置**(Excel 用戶會搬欄):

| Header | 必需 | 語意 |
|---|---|---|
| `SkuId` | ✅ | 對帳鍵。空白行 = spacer,直接跳過(跟 `matrix-csv.ts:79`) |
| `Business alias` | 三揀一 | trim;空 = **清空成 null**(同 PATCH `""` 語意) |
| `Category` | 三揀一 | 同上 |
| `Base licence` | 三揀一 | `Yes`/`No`/`True`/`False`/`1`/`0`,**case-insensitive**;**空白 = 唔改**(呢欄唔可以係 null,所以空白唔可以解讀成 false) |

**整批 400(一個字都唔寫)嘅情況**:冇 `SkuId` 欄 · 三個可寫欄一個都冇 · 同一個 `SkuId` 喺檔內出現兩次(意圖矛盾) · `Base licence` 有無法辨識嘅值 · §2.4 alias 撞 · §2.5 未確認清空。

**逐行 skip(其餘照過)**:`SkuId` 對唔到任何 active catalog entry → `skippedSkuIds`。

### 2.4 🔴 重複 alias:整批擋(Chris 2026-08-03 拍板)

**點解要有呢道閘** —— 起草期間查證揭到嘅既有 latent bug:`businessAlias` schema **冇 unique constraint**(`schema.prisma:124`),而兩個 consumer 取態相反:

| Consumer | 行為 | 位置 |
|---|---|---|
| 前端範本 | **first-wins**,只生一行 | `allocation-template.ts:63-67` |
| 後端 import | **last-wins**,`findMany` 冇 `orderBy` ⇒ 邊個贏唔確定 | `matrix-csv.ts:86-90` |

⇒ 範本嗰行填嘅 seat 數,可以靜靜寫咗落另一個 SKU。今日靠「得 8 個 alias 且逐個人手打」壓住;開咗批量貼上就變成日常失誤。

**規則**:計「套用呢個檔之後」嘅 alias 全集,範圍係**成個 active catalog**(唔止上傳嗰幾行 —— 改一行嘅新 alias 可以撞到一個檔入面根本冇出現過嘅 SKU)。任何非空 alias 落喺 ≥2 個 SKU → `400`,回報撞邊個 alias、撞邊幾個 SKU part number。

**實測支持**:今日 0 個撞 ⇒ 呢道閘擋唔到任何今日行得通嘅嘢。

#### 🔴 同一道閘要**一併加落單筆 `PATCH /license/catalog/:id`**(Chris 2026-08-03 答 ADR-0023 OQ-1「都做」)

抽共用 `apps/api/src/license/alias-collision.ts`,批量同單筆 call 同一個 —— 唔各寫一份。單筆語意:PATCH 之後個 alias 會撞到另一個 SKU → `400`,唔寫。

⚠️ 呢個係**既有 endpoint 嘅行為改動**(本來會成功嘅 PATCH 而家會 400)。點解仍然要做:唔加就等於留返一道後門 —— 用單筆編輯製造一個撞,反過嚟令下次批量上傳被整批擋,而用戶會完全唔知點解。實測今日 0 個撞 ⇒ 呢個行為改動擋唔到任何今日做得到嘅嘢。

### 2.5 🔴 清空 alias:獨立標示 + 額外確認(Chris 2026-08-03 拍板)

清一個 SKU 嘅 alias = 佢退出 import scope,**但佢喺 ledger 嘅 `allocatedQuantity` 唔會清,會凍結喺舊值** —— 之後每次 allocation import 佢都變 `skipped`,而 Assets 畫面照樣顯示嗰個舊數。呢個係本 CH 入面**唯一一個後果喺 catalog 畫面完全睇唔到**嘅改動。

- Preview 把 `aliasClears` 同普通改動**分兩區**顯示。
- Commit 時只要有任何一個 clear → 必須 `confirmClears: true`,否則 400。
- 前端 = 一個 checkbox,文案要講出「ledger 舊數會留低」呢個後果,唔止講「你要清 N 個 alias」。
- 用 boolean 而唔用 CH-017 嗰種打字確認:**呢個操作可復原**(再傳一次補返 alias)。打字確認留返畀真係冇回頭路嘅 `assignedQuantity` 清零。

### 2.6 API 形狀

```ts
// body
{ csv: string; dryRun?: boolean; confirmClears?: boolean }

// result
{
  dryRun: boolean;
  committed: number;                 // 真正寫咗嘅 SKU 數
  summary: { rows; matched; changes; aliasClears };
  changes: {
    skuId; skuPartNumber; displayName;
    alias?:         { before: string | null; after: string | null };
    category?:      { before: string | null; after: string | null };
    isBaseLicense?: { before: boolean; after: boolean };
    clearsAlias: boolean;
  }[];
  skippedSkuIds: string[];           // GUID 對唔到
  unknownColumns: string[];          // 收咗但無視,報返出嚟
}
```

400 body 帶結構化 detail(`collisions: [{ alias, skuPartNumbers[] }]` / `duplicateSkuIds` / `invalidBaseValues`),前端要 render 得出,唔可以淨係一句 "Bad Request"。

### 2.7 前端 — SKU Catalog 頁

**`Import CSV` = `secondary`**,擺喺 `Export CSV` 隔籬。呢頁唯一 primary 仍然係 `Sync catalog from tenant`(H6)。

**preview 用 inline panel,唔用 Dialog** —— 查證:`Dialog` body 冇 max-height / 冇 scroll,外層仲係 `overflow-hidden`(`dialog.tsx:47,60`)⇒ 99 行 preview 會被切走。為咗一個畫面去改一個共用 primitive 係錯嘅交易。改用 `allocation-import.tsx` 已經行得通嘅 pattern:panel 插喺 toolbar 同 table 之間(唔使碌過 8 行表先見到 preview)。

**新檔**:`apps/web/src/components/catalog/catalog-import.tsx`
**改動**:`catalog.tsx`(掣 + panel)· `api-types.ts`(型別)· `mutations.ts`(`useCatalogImport`)

流程 = `Choose CSV file` → `file.text()` → `Preview import`(dry-run)→ 兩區 preview →(有 clear 就要剔 checkbox)→ `Apply N changes` → 成功後 `invalidateQueries(['license','catalog'])`。

Panel 內文要講清楚格式契約(§2.3),同 `allocation-import.tsx:166-208` 一樣 —— 對帳係 exact,唔講就一定有人餵錯檔。

### 2.8 Out of Scope（explicit）

- ❌ **唔加 `@@unique` 落 `businessAlias`** —— schema 改動屬 H1 另一條線(`null` 喺 Postgres unique index 要 partial index),要獨立拍板。本 CH 用 application-level 閘門(§2.4)把洞封住。
- ✅ ~~唔改 `PATCH /license/catalog/:id`~~ —— **已改為 in-scope**(Chris 2026-08-03 答 OQ-1「都做」),見 §2.4 尾段。
- ❌ **唔加 inactive SKU** —— CH-018 §2.6 已界定;要改 `listCatalog()` read model,連帶影響 Assets / template。
- ❌ **唔改 `Display name` / `Part number` / `Active`** —— system-owned,由 tenant sync 獨家寫。
- ❌ **唔由檔案新建 catalog row** —— identity 係 sync-owned(ADR-0023 D2)。
- ❌ **唔加 search / filter / 改 `PAGE_SIZE`** —— 同 CH-018 §2.6 一樣,獨立 UX 改動。

## 3. Acceptance Criteria

**後端**
- [ ] `POST /license/catalog/import` 存在,`ADMIN` + `REGIONAL`;`OPCO_IT` → 403
- [ ] CH-018 export **原封重傳** = `changes: 0`(idempotent),`unknownColumns` 列出 4 個被無視嘅欄
- [ ] 只改一行 alias → 只有嗰個 SKU 出現喺 `changes`,before/after 正確
- [ ] `dryRun: true`(default)**零 DB 寫入**(用 scratch DB 真驗,唔淨靠 mock)
- [ ] `SkuId` 對唔到 → `skippedSkuIds`,**冇新 catalog row 生出**
- [ ] 欄可以隨意調位、多餘欄可以留低,行為不變
- [ ] `Base licence` 空白 = 唔改(唔係變 false);無法辨識嘅值 → 400
- [ ] 同一 `SkuId` 出現兩次 → 400,零寫入
- [ ] **重複 alias → 400,零寫入**,body 列出撞邊個 alias / 邊幾個 SKU(含「新 alias 撞到一個檔入面冇出現過嘅 SKU」呢個 case)
- [ ] **有 clear 但冇 `confirmClears` → 400,零寫入**;加咗 → 寫得入
- [ ] 每個改咗嘅 SKU 有一條 `CATALOG_UPDATE` audit(before/after 同單筆編輯同形狀)+ 一條 `CATALOG_BULK_CURATE` summary
- [ ] **`PATCH /license/catalog/:id` 改到一個會撞嘅 alias → 400,唔寫**(OQ-1);改成唔撞嘅 → 照樣成功;**清空 alias 唔會被閘門擋**(null 唔算撞)
- [ ] 兩條 path call **同一個** `findAliasCollisions`(唔各寫一份)
- [ ] `apps/api npm test` 全綠(現行 746)

**前端**
- [ ] Catalog 頁見到 `Import CSV`,`secondary`(**Sync 仍然係唯一 primary**)
- [ ] 揀檔 → preview → apply 全程行得通;apply 後表即刻反映新值
- [ ] Preview 把「清空 alias」同普通改動**分兩區**,清空區有 checkbox + 講明 ledger 舊數會留低
- [ ] 400 嘅結構化 detail render 得出(撞 alias 要睇到係邊個 alias / 邊幾個 SKU),唔係一句 "Bad Request"
- [ ] `apps/web npm test` 全綠(現行 253)

**Gate**
- [ ] `npm run lint`(repo root,CI 同一條)exit 0
- [ ] `ui-design` skill 跑過,零 violation(**特別留意 DS-2** —— CH-016 / CH-017 連續兩次喺尺寸新數值上中招)
- [ ] Browser 驗:light + dark · 真上傳一次改幾個 SKU · 真撞一次 alias 睇 400 · 真清一次 alias 睇 checkbox gate

## 4. Risks

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | 批量貼 alias 撞咗,allocation 靜靜寫錯 SKU | **High** | **High** | §2.4 整批 fail-closed —— 呢個 risk 正正係本 CH 順帶封嘅洞 |
| R2 | 清 alias 後 ledger 舊數凍結,冇人察覺 | Med | **High** | §2.5 獨立區 + checkbox,文案講後果唔止講數量 |
| R3 | 用戶以為 import 可以新建 SKU / 改 part number | Med | Med | §2.3 契約明文 + panel 內文 + `unknownColumns` 照報 |
| R4 | 第二條 write path 同 PATCH normalize 語意漂移 | Med | Med | 共用 `normalizeOptional`,唔各寫一份 |
| R5 | 順手擴去做 schema unique / 改 PATCH / inactive | Med | Med | §2.8 明文 + ADR-0023 OQ |

## 5. Effort Estimate

**~1.7 日**(後端 parse + service + test ~0.7 · OQ-1 共用閘門落 PATCH + test ~0.2 · 前端 panel + test ~0.5 · browser 驗 ~0.3)。

## 6. Dependencies

- **ADR-0023 Accepted**(2026-08-03,H1 gate 已過)。
- 零新 dependency、零 schema、零 migration。

## 7. Spec Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-08-03 | Initial draft(proposed) | Chris 要求批量改 alias / Category / Base | — |
| 2026-08-03 | 三項拍板:**重複 alias 整批擋** · **清空 alias 獨立標示 + 額外確認** · **UI 放 Catalog 頁 Export 隔籬** | 起草前提問,即場定案 | Chris |
| 2026-08-03 | **OQ-1 = 都做** ⇒ 重複 alias 閘門一併加落單筆 `PATCH catalog/:id`,由 §2.8 out-of-scope 移入 §2.4 in-scope(+2 條 acceptance / B16 / T14-T16)。effort 1.5 → **~1.7 日** | Chris approve 時追加 | Chris |
| 2026-08-03 | status `proposed` → **`approved`**;ADR-0023 → **Accepted** | H1 gate 過 | Chris |

---

**Lifecycle reminder**:呢份 spec locked after status=approved。重大 deviation → §7 changelog。
**Gate reminder**:status 而家係 `proposed`,而且 **ADR-0023 仲係 `Proposed`** —— 兩個都要 Chris approve 先可以開始 code(CLAUDE.md §5.1 H1 + PROCESS R1.change)。
