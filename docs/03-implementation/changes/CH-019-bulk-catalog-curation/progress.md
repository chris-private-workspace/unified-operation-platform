# CH-019 Progress — SKU Catalog 批量 curation

## Day 1 — 2026-08-03

**Commit**:`62bc64a` `feat(license): CH-019 SKU catalog 批量 curation(CSV round-trip)` —— 對應 checklist 全部 B1-B16 / T1-T16 / F1-F12 / V1-V9(R2)。

### 做咗咩

**Gate**:Chris approve ADR-0023(→ Accepted)+ spec(→ approved),並答 OQ-1 =「都做」⇒ 重複 alias 閘門一併落單筆 `PATCH catalog/:id`。ADR README + BACKLOG 同步。

**後端**(`apps/api`)
| 檔 | 做咗咩 |
|---|---|
| `license/alias-collision.ts`(新) | `findAliasCollisions()` 純函數。**兩條 write path 共用**(D5 / OQ-1) |
| `license/catalog-csv.ts`(新) | header **按名對應**、`SkuId` 必需、`normalizeOptional` 搬咗入嚟做單一實作 |
| `license/catalog-import.service.ts`(新) | dry-run default · GUID Map(case-insensitive)· 兩道閘 · 一個 `$transaction` |
| `license/dto/catalog-import.dto.ts`(新) | request + result DTO |
| `audit/audit-fields.ts` | `CATALOG_BULK_CURATE` + `CatalogImport` targetType + 5 欄 allowlist |
| `license/catalog.service.ts` | **OQ-1**:PATCH 加同一道閘;`normalizeOptional` 改為 import |
| `license.controller.ts` / `license.module.ts` | `POST catalog/import` + provider |

**前端**(`apps/web`)
| 檔 | 做咗咩 |
|---|---|
| `components/catalog/catalog-import.tsx`(新) | inline panel:揀檔 → preview → 兩區 → checkbox → apply |
| `pages/catalog.tsx` | `Import CSV` secondary + panel 插喺 toolbar/table 之間 + Info 句改寫 |
| `lib/api.ts` | `ApiError` 加 optional `detail`(additive);`apiPost` 改用新 `errorFrom` |
| `lib/api-types.ts` / `hooks/mutations.ts` | 型別 + `useCatalogImport` |

### Gate 結果(全部真 output)

| Gate | 結果 |
|---|---|
| `apps/api npm test` | **797 / 67 suites**(前 746 / 64)—— +51 |
| `apps/web npm test` | **265 / 29 files**(前 253 / 28)—— +12 |
| `apps/api tsc --noEmit` | exit 0 |
| `apps/web tsc --noEmit` | exit 0 |
| `npm run lint`(repo root = CI gate) | exit 0 |
| `ui-design` skill | 見下 |

### Live 驗證(dev DB,做完全部還原)

**API 端到端**:commit 3 個 SKU → DB 反映 → 原檔重傳 **changes=0** → 撞 alias **400 + DB 一個字冇變** → 清 alias 冇 confirm **400 + DB 冇變** → 加 confirm 成功 → DB 還原。**`catalogCount` 全程 99**(從來冇建過 row)。

**OQ-1 PATCH 閘門**:把 `DESKLESSPACK` 個 `F3 Frontline` 設落 `AAD_PREMIUM_P2` → **400**,message 只列**對方** SKU、DB 冇變;改成唯一 alias → 成功;清空 → 成功(唔被擋)。

**8 欄真 export round-trip**:`changes=0`,`unknownColumns` = `Display name | Part number | Active | Last synced`。

**Audit**:`catalog.bulk_curate` 3 條 summary(`{rows,changes,matched,skipped,aliasClears}`)+ `catalog.update` 7 條 per-SKU,`before`/`after` 只載變咗嘅欄。

**Browser(Playwright,light + dark 都截圖)**:
- `Import CSV` **唔係** `bg-accent`;panel 一開,accent 掣數 = **0**(Sync 降做 secondary)
- 上傳含 clear 嘅檔 → `Apply 2 changes` **disabled** + checkbox 未剔 → 剔完 **enabled**
- **換檔即刻清走舊 preview 同已剔嘅確認**(防 commit 錯檔)
- 真 Apply → panel 自動閂、表即刻反映三行
- 真撞 alias → 畫面出 `CH019 Browser A → AAD_PREMIUM_P2, AX7_USER_TRIAL`,冇 Apply 可撳,表冇變

### ui-design 自檢

| # | 結果 |
|---|---|
| DS-1 token-only | ✅ |
| **DS-2 唔 eyeball** | ❌→✅ **捉到 3 個**:`p-[13px]` / `max-w-[720px]` / `mt-[11px]` —— 用 memory 記低嗰招(grep 全 repo,只喺自己個檔出現 = 自己開嘅)。改用既有值後重掃,**零 sole-use**。另把表格 cell 由 `px-[14px]` 對齊 allocation-import 嘅 `px-[16px]` |
| DS-3 一 view 一 primary | ❌→✅ panel 開住時 view 會有兩個 primary(Sync + Preview)⇒ Sync 改為 `importing ? 'secondary' : 'primary'` |
| DS-4 light + dark | ✅ 兩個都截圖 |
| DS-5 數字 / 識別碼 mono | ✅ |
| DS-6 lucide only | ✅ |
| **DS-7 平面美學** | ❌→✅ 原本用 `border-warn-soft` / `border-danger-soft` 有色邊,**全 repo 冇先例**;改回房子做法 `border-border bg-hover` + tone 色 icon |
| DS-8 ~ DS-12 | ✅ |

### 揀咗咩、點解(唔喺 spec 入面嘅落地決定)

1. **`normalizeOptional` 搬去 `catalog-csv.ts`**(spec B7 原本寫留喺 `catalog.service.ts`)—— 依賴方向倒返轉:純模組唔應該反過嚟 import 一個拉住 Prisma / Graph 嘅 service。共用單一實作嘅**意圖不變**。
2. **`ApiError` 加 optional `detail`** —— acceptance 要求 400 嘅 list render 得出,而原本個 wrapper 掉晒 response body。只改 `apiPost`(本 CH 用嗰個 verb),`apiGet`/`apiPatch`/`apiDelete` **冇掂**(§1.3)。
3. **重複 header 欄 → 400** —— spec §2.3 冇明文列,但同「同一個 `SkuId` 出現兩次」同源(意圖矛盾,唔可以靜靜揀一個)。見 §7 changelog。
4. **preview 唔用 Dialog** —— 查證 `dialog.tsx:47,60` body 冇 scroll 兼 `overflow-hidden`。已寫入 spec §2.7。

### 🔴 順帶發現(唔喺本 CH 修)

**`apps/web` 嘅 lint 本身已經紅**:`npx eslint src/**/*.{ts,tsx}` 出 25 個 prettier error,其中 **18 個喺我完全冇掂過嘅檔**(`allocation-reset.tsx` / `allocation-reset.test.tsx` / `request-detail.tsx` / `request-detail.sync-check.test.tsx`)。成因:repo root 個 `lint` script 只跑 `-w @uop/api` ⇒ **web 側嘅格式債一直冇 gate 攔住,靜靜累積**。

本 CH 只修咗自己掂過嘅檔(含 `catalog.tsx` 一行 CH-018 遺留),其餘冇動(§1.3)。**建議開一張獨立單**:`npm run lint` 加埋 `-w @uop/web`,一次過清咗嗰 18 個。已入 BACKLOG。

### 冇做 / 明文留低

- ❌ `@@unique` 落 `businessAlias`(schema 級,`null` 要 partial index)—— 本 CH 用 application-level 閘門封住
- ❌ inactive SKU export / import(CH-018 §2.6 已界定)
- ⚠️ Toast「Updated N SKUs」**冇喺 browser 捕捉到**(2.6s 自動消失,查嗰陣已過)。`onCommitted` 嘅 wiring 由 unit test 守住,但視覺上我唔當佢驗過。
