---
change_id: CH-026
spec_ref: ./spec.md
status: done                   # 2026-08-12 D-9 / A-2 收咗;G-7(22 個 SKU curate)2026-08-13 亦做咗 ⇒ 全部收
last_updated: 2026-08-12
---

# CH-026 — Checklist

> 由 `spec.md §3` scope 衍生。每 item ≤ 1-2h。
> 唔可以 tick 嘅 item 喺 `progress.md` Day-N 寫原因(唔可以刪)。
> **決策 SSOT** = `ADR-0032`(Accepted 2026-08-12)。

## A — Schema + migration（H1,ADR-0032 D1 / D5）

- [x] **A-1** `SkuCatalog.seatModel String @default("prepaid")` + comment 寫明兩個值同點解唔用 enum
- [x] **A-2** migration:**淨係 ADD COLUMN + DEFAULT**,零 data migration(D5 —— 自動標 unlimited = 偷偷實施被否決嘅 threshold)。🟢 **2026-08-12 對真 DB 跑過**(Chris 批准停 `ai-doc-extraction-db`):`prisma migrate deploy` → `localhost:5433` db `platform` **21/21 applied**,同 CH-027 `B-4` 一次過收。**D5 實測**:101 個 `SkuCatalog` row **全部落 `prepaid`**,零 row 被自動標 unlimited
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
- [x] **D-9** H6:`ui-design` skill 逐條做咗(結果喺 `progress.md`)+ 🟢 **light + dark 真 render 收咗**(2026-08-12,同 CH-027 `V-5` 一次過):Platform view `POWER_BI_STANDARD` 出 **`Unlimited`** cell + `Unalloc.` **`—`** + `Unlimited` neutral badge;SKU Catalog `SEATS` 欄出 `Prepaid` + **`UNLIMITED`** badge,兩個 mode 對比度都夠。⚠️ **`G-7` 未做 ⇒ 零 SKU 標咗 unlimited**,所以暫時 PATCH `POWER_BI_STANDARD` 做 fixture,**驗完已還原**(`unlimited SKUs remaining = 0` 實測)

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
- [x] **G-7** 🟢🟢 **2026-08-13 做咗** —— 人手 curate 嗰 22 個 SKU(~~Chris 落 UI 做~~ **Chris 2026-08-13 批准由 AI 經 API 做**:①環境 = **本機**(DEV 做唔到,佢跑緊 `dev-86ed450` **冇 CH-026 code** —— row 冇 `seatModel`、stats 冇 `unlimitedSkus`)②名單 = **22 個全部標 `unlimited`**)
  - **點做**:22 × `PATCH /license/catalog/:id` body `{"seatModel":"unlimited"}`(= spec §3.1 B 兩條 curation 路之一,唔係直接改 DB)⇒ **22/22 全部 `200` 兼回應 `seatModel: unlimited`**
  - **名單點嚟**:唯讀查真數據 `owned >= 10000` ⇒ **22 個,三個哨兵值 `1000000`×4 / `50000`×1 / `10000`×17,同 spec §2 逐字對上**。⚠️ 名單本身就係最強嘅 curate 理由:**22 個全部係 free / trial / viral / dev / preview SKU**(`FLOW_FREE` / `POWERAPPS_VIRAL` / `*_TRIAL` / `WINDOWS_STORE` …)—— 呢個係**語意**判斷,唔係 ADR-0032 否決咗嗰個 threshold
  - 🟢 **效果(三條獨立路徑對得住)**:`unlimitedSkus` 0 → **22** · **`totalOwned` 4,270,779 → 50,779** · 我自己由 79 個 prepaid row 加返 `owned` 總和 = **50,779**(cross-check)· 算術 4,270,779 − 4,220,000(= 4×1M + 50K + 17×10K)= **50,779**
  - 🟢 **row 級**:22 行 `unallocated` **全部 `null`**(C-3)· `overAllocated` 全部 `false` · sample `FLOW_FREE` = `{seatModel:'unlimited', owned:10000, unallocated:null, tenantConsumed:4521}`
  - 🟢 **真 render(light + dark 各一張,Playwright)**:KPI **`Available seats` = `50779`** + sub-line **`22 unlimited SKUs excluded`** · 表頭 `ALL SKUS · TOTAL` = `50779 / 0 / 1 / 25275 / 50779` · unlimited 行 `Owned` 出 **`Unlimited`**(sans 非 mono,D-1)、`Unalloc.` 出 **`—`**(D-2)、Status **neutral `Unlimited` badge**(D-4)、**冇 render owned bar**;隔離 `AAD_PREMIUM_P2` 照出 `0 + 10 grace` breakdown(CH-027)⇒ **常態行一個字冇郁**。🔴 **`4,270,779` 喺頁面上完全搵唔返**(`sentinelStillShown: false`)
  - 📌 **順帶對到一個文檔落差**:spec OQ-4 / ADR-0032 D3 / 本 progress D 段都寫 KPI 改名 **`Prepaid seats`**,而實際 render 係 **`Available seats`** —— 係 **CH-027 之後嘅名**(CLAUDE.md §0 亦係咁寫)。**唔改 code**(而家個名先啱,講緊「而家派得出幾多個 seat」),但 CH-026 幾份 doc 寫 `Prepaid seats` 嗰啲**當作已被 CH-027 覆蓋**
