---
change_id: CH-026
spec_ref: ./spec.md
status: in-progress            # in-progress | done —— 卡 D-9 / A-2(本地 stack 停咗)
last_updated: 2026-08-12
---

# CH-026 — Checklist

> 由 `spec.md §3` scope 衍生。每 item ≤ 1-2h。
> 唔可以 tick 嘅 item 喺 `progress.md` Day-N 寫原因(唔可以刪)。
> **決策 SSOT** = `ADR-0032`(Accepted 2026-08-12)。

## A — Schema + migration（H1,ADR-0032 D1 / D5）

- [x] **A-1** `SkuCatalog.seatModel String @default("prepaid")` + comment 寫明兩個值同點解唔用 enum
- [ ] **A-2** 🚧 migration:**淨係 ADD COLUMN + DEFAULT**,零 data migration(D5 —— 自動標 unlimited = 偷偷實施被否決嘅 threshold)
  → 檔已寫(`20260812135934_ch026_sku_seat_model`)兼且**刻意零 data migration**,但 **SQL 未對真 DB 跑過**(本地 stack 停咗,`migrate dev` 連唔到)。**唔可以當 migration 驗過**
- [x] **A-3** `prisma generate`(client 出到 `seatModel`)
- [x] **A-4** 🔴 `syncFromTenant` **唔可以** overwrite `seatModel` —— create / update 兩條 path 都查過,冇掂

## B — Curation 兩條路 + validate（spec §3.1 B）

- [x] **B-1** 新 `seat-model.ts`:`SEAT_MODELS` const + `isSeatModel()` —— **一份清單**,PATCH / CSV 兩條路共用
- [x] **B-2** `UpdateSkuCatalogDto` 加 `seatModel?: string` + `@IsIn(SEAT_MODELS)`(**唔 nullable**)
- [x] **B-3** `catalog.service.updateEntry` 寫入 + audit 照舊
- [x] **B-4** `catalog-csv.ts` 加 `Seat model` 欄:入 `EDITABLE_COLUMNS`、空白 = 唔改、非法值 → 400 `invalid-seat-model-value`
- [x] **B-5** `catalog-export.ts` header + 值帶埋佢
- [x] **B-6** `catalog-import.service.diff()` + `toUpdateInput()` 加 `seatModel`
- [x] **B-7** `CatalogSeatModelChangeDto`(自己一個 shape —— `seatModel` 永遠唔 null,唔可以借 nullable 嗰個)
- [x] **B-8** test:PATCH 寫 / PATCH 唔掂未送嘅欄 / CSV 三個值 / CSV 空白唔改 / CSV 非法值 400 兼且訊息講得出合法值 / CSV 只有呢一欄都 import 得 / round-trip / import diff + **真寫入** / 重複值零改動

## C — Read-model（spec §3.1 C）

- [x] **C-1** `tenant-owned.service` catalog select 加 `seatModel`
- [x] **C-2** row 出 `seatModel` + derived `noPrepaidSeats`(ADR-0032 D2)
- [x] **C-3** `unlimited` 行:`unallocated = null`、`overAllocated = false`(`owned` 照出原值)
  ⚠️ `noPrepaidSeats` 行 **`unallocated` 一樣 null** —— 對返 ADR-0032 D3 個表先補返(見 progress 決定 #1)
- [x] **C-4** stats:`totalOwned` / `totalUnallocated` 只計 prepaid;`totalAllocated` / `totalAssigned` 照計全部
- [x] **C-5** stats 加 `unlimitedSkus`
- [x] **C-6** DTO 更新(`TenantSkuRowDto` / `TenantSkuStatsDto`)
- [x] **C-7** test:unlimited 行 / `owned=0` 行 /(`owned=0` 而冇人用 = 普通空 SKU,唔算)/ 常態行**逐字不變** / stats 四個總數各自對(數字 **hard-code**,唔由 fixture 推導)

## D — Platform view（spec §3.1 D · H6）

- [x] **D-1** `Owned` 欄:unlimited → `Unlimited`(非 mono)
- [x] **D-2** `Unalloc.` 欄:unlimited → `—`(靠後端出 `null`,前端 `numOr` 原本就係咁,零新分支)
- [x] **D-3** status badge:`Unlimited`(neutral)/ `No prepaid seats`(warn)
- [x] **D-4** `OwnedBar` 對 unlimited **唔 render**
- [x] **D-5** KPI card 改名 `Prepaid seats` + sub 講明剔走幾多個 unlimited SKU
- [x] **D-6** grand total / category subtotal 跟 C-4 同一條界(subtotal 多一個 `unlimited` 計數)
- [x] **D-7** `lib/tenant-skus.ts` 兩個 pure fn 同步 + test
- [x] **D-8** UI test:新 `platform-view.test.tsx` 6 條(unlimited 行 / bar / `No prepaid seats` / 常態行不變 / KPI 改名 + 兩句 scope 文案 / 冇 unlimited 時唔出嗰句)
- [ ] **D-9** 🚧 H6:`ui-design` skill **逐條做咗**(結果喺 `progress.md`),但 **light + dark 真 render 未做** —— 本地 stack 停咗(另一個項目佔用),Platform view 冇 API 數據 render 唔到表

## E — Assign gate（spec §3.1 E · **H5**,ADR-0032 D4）

- [x] **E-1** `unlimited` → **明確跳過** tenant seat gate,連 Graph inventory read 都唔行
- [x] **E-2** `prepaid` 而 `prepaidEnabled = 0` → **仍然擋**,訊息改成講真相
- [x] **E-3** `prepaid` 正常路 **逐字不變**(用晒 / `!tenantSku` 兩條都係)
- [x] **E-4** test ×4:unlimited 過閘兼且**冇打過 Graph** / `owned=0` 擋兼訊息逐字 / 用晒照擋(原訊息逐字)/ 正常有位過閘(既有 73 條照綠)
- [x] **E-5** 🔴 Falsification:拆走 E-1 ⇒ **真跑,真紅**(`1 failed, 73 passed`)

## F — SKU Catalog 頁（spec §3.1 F）

- [x] **F-1** Edit dialog 加 `Seat model`(既有 `SegmentedControl`,零新 primitive)
- [x] **F-2** 表格加 `Seats` 欄(兩個值都出字,**唔用 `—`** —— 兩個都係真答案)
- [x] **F-3** import 說明列提埋新欄 + 400 detail 出 `invalidSeatModelValues` 清單
- [x] **F-4** test(export header / 值 / 位置;import 說明同 change row 經既有 test 覆蓋)

## G — 驗證 + doc-sync

- [x] **G-1** `npm test -w @uop/api` **995 / 995 全綠**(982 → 995)
- [x] **G-2** `npm test -w @uop/web` **337 pass / 343**(pre-existing 6 條紅唔計;332 → 343)
- [x] **G-3** api lint **exit 0** · web tsc **exit 0**(web lint 16 個全部 pre-existing,我 touch 過嘅檔 0 個)
- [x] **G-4** `progress.md` Day-1 + 五條決定 / 偏離
- [x] **G-5** `BACKLOG.md` 同步(R7)
- [x] **G-6** OpenAPI 出到新欄 —— 查過 `license.controller.ts` **直接返 service 結果、冇逐欄砌**(BUG-011 個縫喺呢度唔存在),DTO 亦宣告咗
- [ ] **G-7** 🚧 人手 curate 嗰 22 個 SKU —— **Chris 落 UI 做**,唔喺本單
