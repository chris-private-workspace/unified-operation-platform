---
change_id: CH-026
spec_ref: ./spec.md
checklist_ref: ./checklist.md
last_updated: 2026-08-12
---

# CH-026 — Progress

## Day 1 — 2026-08-12

### 閘

兩道閘同日過:`ADR-0032` `Proposed → Accepted` · 本單 spec `proposed → approved`(Chris)。**閘過咗先寫第一行 code**,次序有記錄。

### 做咗乜(A–F)

| 區 | 交付 |
|---|---|
| **A** schema | `SkuCatalog.seatModel String @default("prepaid")` + migration `20260812135934_ch026_sku_seat_model`(**淨係 ADD COLUMN**,零 data migration —— D5)· `prisma generate` ✅ · 查過 `syncFromTenant` 兩條 path(create / update)**都冇掂** `seatModel` |
| **B** curation | 新 `seat-model.ts`(一份清單,PATCH / CSV 共用)· `UpdateSkuCatalogDto` `@IsIn` · `catalog-csv.ts` 加 `Seat model` 欄(空白 = 唔改 · 非法值 `invalid-seat-model-value` 400)· export 帶埋(前端 `catalog-export.ts`)· import `diff()` + `toUpdateInput()` · `CatalogSeatModelChangeDto` |
| **C** read-model | `tenant-owned.service` 出 `seatModel` + derived `noPrepaidSeats`;`unallocated` 對 unlimited **同** `noPrepaidSeats` 一律 `null`;stats `totalOwned` / `totalUnallocated` 只計 prepaid,`totalAllocated` / `totalAssigned` 照計全部,新 `unlimitedSkus` |
| **D** Platform view | `Unlimited`(sans,唔係 mono)· `Unalloc. —` · 兩個新 status(`Unlimited` neutral / `No prepaid seats` warn)· unlimited **唔 render** owned bar · KPI 改名 **`Prepaid seats`** + sub 講明剔走幾多個 · category subtotal 同一條界 + `N unlimited excluded` |
| **E** assign gate(H5) | `unlimited` → step `skipped`(**連 Graph inventory read 都唔行**)· `prepaidEnabled = 0` → 仍然擋,訊息改成講真相 · 常態兩條路(用晒 / `!tenantSku`)**逐字不變** |
| **F** SKU Catalog 頁 | Edit dialog 加 `Seat model`(既有 `SegmentedControl`,零新 primitive)· 表格加 `Seats` 欄 · import 說明列 + 400 detail list |

### 順手清理(我自己改動製造嘅)

`assign-result-dialog.tsx` 個 collapsed summary 本來寫死 `{gates.length} checks passed`。unlimited 令 `seats` 變 `skipped` ⇒ 個 summary 會**claim 一個從來冇跑過嘅 check**。改成 `6 checks passed · 1 skipped`。呢個唔係順手改 adjacent code,係本單改動嘅直接後果。

### 測試

| | 前 | 後 |
|---|---|---|
| api | 982 / 73 suites | **995 / 73**(+13) |
| web | 332 | **343**(337 pass + **6 pre-existing 紅**,`reset-password` 1 + `local-profile` 5) |

- api lint **exit 0** · web tsc **exit 0**
- 🔴 web lint **16 個 prettier error,全部 pre-existing**(`allocation-reset.test.tsx` 11 · `allocation-reset.tsx` 4 · `request-detail.sync-check.test.tsx` 1)—— **我 touch 過嘅檔 0 個**。⚠️ BACKLOG `LINT-web` 之前記 15,**本 branch 實測 16**,已更新
- ⚠️ 中途撞過一次 `requests.new-request-flag` **timeout flake**(5000ms),重跑即過 —— 唔係本單改動,記低個形狀

### 🔴 Falsification(兩個,都真跑真紅)

| 拆走乜 | 結果 |
|---|---|
| assign 個 `seatModel === UNLIMITED` 分支 | `1 failed, 73 passed` —— **只有** unlimited 條紅,其餘 73 條照綠 ⇒ 條 test 真係釘住新行為,而常態路真係冇郁 |
| `OwnedBar` 個 unlimited early-return | `1 failed | 5 passed` —— 只有 bar 條紅 |

⚠️ unlimited 條 test 特登叫 `getSubscribedSkus` 返 `[]`:咁樣拆走分支就會撞 `!tenantSku` 而 refuse。**只 assert outcome 嘅版本捉唔到「照樣打咗 Graph 一轉」**,呢個係 E-1 真正要守嘅嘢。

### H6 自檢(`ui-design` skill 逐條)

| | 結果 |
|---|---|
| DS-1 token-only | ✅ 零 hex;新加 class 全部係既有 token(`text-fg-muted` / `text-fg-subtle` / `bg-neutral-soft` 經 `Badge`) |
| DS-2 唔 eyeball | ✅ 冇新數值,全部沿用既有 `TD` / `NUM` / `TH` |
| DS-3 單一 accent · 一 primary | ✅ 零新 accent;Edit dialog 仍然一個 primary(`Save changes`) |
| DS-4 light + dark | 🚧 **未真 render** —— 見下 |
| DS-5 數字 mono | ✅ `Unlimited` **特登唔 mono**(佢係字唔係數字,ADR-0032 D3 同一理由否決 `∞`);subtotal 數字照舊 mono |
| DS-6 lucide only | ✅ 零新 icon |
| DS-7 平面 | ✅ 零新陰影 / gradient |
| DS-8 狀態走 Badge | ✅ 兩個新 state 都行 `Badge` + semantic tone(`neutral` / `warn`) |
| DS-9 motion | N/A |
| DS-10 voice | ✅ Sentence case、短名詞(`Unlimited` / `No prepaid seats` / `Prepaid seats` / `Seats`) |
| DS-11 對 prototype | ✅ 表格結構 / KPI 卡形狀一個字冇郁,只換文字同一欄內容 |
| DS-12 logo | N/A |

### 🚧 未收(唔可以 tick,理由喺度)

1. **D-9 — light + dark 真 render** 🚧
   **理由**:Chris 2026-08-12 講明**本項目本地服務暫時停咗**(另一個項目要起動)。Platform view 要 API 真數據先 render 到表,只起 vite 會見到 `LoadError`。
   ⚠️ **唔自己起返 stack**:`uop-postgres` 同 `ai-doc-extraction-db` 硬搶 5433,停後者係另一個項目嘅事,要 Chris 批(CLAUDE.md §9)。
   **點收**:本地 stack 一放返 → 起 stack → Assets › Platform,light + dark 各一張(要有 unlimited 行先睇到,所以要先 curate 至少一個 SKU)。
2. **A-2 migration 未對真 DB 跑過** 🚧
   SQL 係**手寫**嘅(`prisma migrate dev` 要連 DB)。`prisma generate` 過到 = schema 有效,但 `ALTER TABLE` 本身**未真行過**。⚠️ 唔可以當「migration OK」。
   **點收**:stack 放返 → `npm run prisma:deploy -w @uop/api` → 睇 `_prisma_migrations` 有無新行。
3. **G-7 人手 curate 22 個 SKU** 🚧 —— 本來就唔喺本單(Chris 落 UI 做)。

### 決定 / 偏離(R3)

| # | 事 | 點解 |
|---|---|---|
| 1 | `noPrepaidSeats` 嘅 `unallocated` **一樣出 `null`** | ADR-0032 D3 個表明文寫 `—`。原本我第一版只對 unlimited 出 null,對返 ADR 表先發現。**已改**,唔算偏離,係漏睇後補返 |
| 2 | stats 加 `unlimitedSkus`(spec §3.1 C 冇明文列) | 冇佢個 total 就會**靜靜細咗四百萬**而冇人知點解 —— 同 ADR「唔好畀一個會自己跑而冇人知嘅規則」同源。屬 D3 落地嘅必要部分 |
| 3 | category **subtotal** 跟 grand total 同一條界(ADR 只講 grand total) | 唔跟嘅話 Base 個 subtotal 仍然係七位數,而 grand total 唔係 —— 兩個數喺同一張表對唔上,比兩個都錯更難讀 |
| 4 | `totalAllocated` / `totalAssigned` **唔剔** unlimited | 佢哋喺 unlimited SKU 上係**真數字**(OpCo budget 仍然 gate 緊 assign,人真係用緊)。剔走 = 少報。代價係兩個 KPI 範圍唔同 ⇒ 靠 sub-line 明文講(`(prepaid SKUs)`) |
| 5 | assign 個 `!tenantSku` 分支**一個字唔改** | 佢返「No available seats」對「SKU 唔喺 tenant inventory」其實都係誤導,但**唔喺本單 scope**。記低,唔順手改 |

### 下一手

1. Chris 放返本地 stack → **D-9 render 驗** + **A-2 migration 真跑**
2. 之後 Chris 落 SKU Catalog curate 22 個(`Seat model → Unlimited`),或者一次過用 export → 改 `Seat model` 欄 → import
3. **OQ-5**(`prepaidEnabled = 0` 嗰批到底點嚟)仍然未答 —— 答咗先決定放唔放行 assign
