# CH-030 — Checklist

> 由 `spec.md` §3 acceptance derive。**唔可以刪未勾項** —— 只可以 `[ ]` → `[x]`,或者加 🚧 + 理由 + target。
> 🟢 spec `approved` + ADR-0035 `Accepted`(Chris,2026-08-14)⇒ 兩道閘都過咗。

---

## F1 — 平台 licence REQ 號碼(ADR-0035)

### Schema
- [x] **A1-1** `schema.prisma` `Request` 加 `serviceNowLicenceReqNumber String?`
- [x] **A1-2** 🔴 **冇 `@unique`**(ADR-0035 D1)—— 加完自己 grep 一次確認
- [x] **A1-3** comment 寫明佢同 `serviceNowNumber` 嘅分別 + 點解唔可以入 `where`(D2)
- [x] **A2-1** migration `20260814020512_ch030_licence_req_number` 生成
- [x] **A2-2** 對本機 DB 真跑過 —— `Applying migration…` + `Your database is now in sync`;🔴 **SQL 只有一行 `ALTER TABLE "Request" ADD COLUMN "serviceNowLicenceReqNumber" TEXT;`,冇 `UNIQUE` 冇 index** ⇒ D1 喺 SQL 層再確認
- [x] **A2-3** `prisma generate` 之後 tsc 認到新欄(api + web 兩邊 exit 0)

### 寫入
- [x] **A3-1** `intake-adapter.service.ts` raise 成功 ⇒ 同啲 RITM **同一個 `$transaction`** 寫 `serviceNowLicenceReqNumber`(D3)
- [x] **A3-2** test:raise 成功 ⇒ 欄 = provider 返嘅 REQ number
- [x] **A3-3** test:raise **失敗** ⇒ 欄維持 `null`(唔可以寫一半)
- [x] **A3-4** 🔴 grep 全 repo 確認新欄**冇出現喺任何 `where` / `upsert` / `findUnique`**(D2)—— 實測只 4 處:schema 宣告 · intake-adapter `data:` · api-types 宣告 · 前端讀
- [x] **A4** **falsification**:拆走 A3-1 個寫入 ⇒ **2 紅 / 55 綠,零誤傷**

### API
- [x] **A5-1** 真打 `GET /fulfilment/requests/:id` —— response key 清單含 `serviceNowLicenceReqNumber`,`hasLicenceReqCol=True`
- [x] **A5-2** 🔴 test 釘住(**BUG-011 教訓**)—— 改用 **query-shape** assert(`findUnique` 冇 top-level `select`),見 progress `D-2`
- [x] **A5-3** `api-types.ts` 加欄 ⚠️ **`RequestDto` 刻意唔加**,見 progress `D-1`

### 前端
- [x] **A6** header `Licence request` 顯示 **REQ**;RITM 另一行標明係 `Licence item(s)`(D3)
- [x] **A7-1** 🔴 舊資料(REQ null + 有 RITM)**回退到今日行為顯示 RITM**,唔可以空白(ADR-0035 D5)
- [x] **A7-2** test 釘住 A7-1(`still shows the RITMs on a request raised before ADR-0035`)
- [x] **A7-3** 兩者都冇 ⇒ 成個 section 唔出,唔印 `—`

---

## F2 — Stepper 步名

- [x] **B1-1** `Step 4/4 · Completed`(短路 ASSIGNED)
- [x] **B1-2** `Step 2/4 · READY`(短路 READY)
- [x] **B1-3** procurement 路行得通 —— 實測係 **`Step 2/7`**(6 個 stage + terminal marker),唔係 spec 起初估嘅 6
- [x] **B2** falsification:還原做 `Step {n}/{total}` ⇒ **3 紅 / 42 綠,零誤傷**

---

## F3 — Sync 時間戳

- [x] **C1-1** `Synced to Azure AD` 顯示 `azureSyncedAt`
- [x] **C1-2** `Synced to ServiceNow` 顯示 `serviceNowUserSyncedAt`
- [x] **C1-3** 時間用 mono(DS-5)+ `formatDateTime`
- [x] **C2** 🔴 `AD account created` **冇時間**,test 釘住 + **falsification 1 紅 / 6 綠**
- [x] **C3** gate 未開(`null`)⇒ 唔印時間亦唔印 `—`

---

## F4 — 右欄次序

- [x] **D1-1** `Operational history` 喺 `AI Assist` **之上**
- [x] **D1-2** test 釘住次序 —— `compareDocumentPosition` **雙向** assert(單向個 bitmask 可以永遠 truthy)

---

## 全域

- [x] **E1-1** api test 全綠 —— **1044 passed / 74 suites**(基線 1040)
- [x] **E1-2** web test —— **377 passed**(基線 368);6 紅 = pre-existing,**逐條核對過係同一批**
- [x] **E2-1** tsc api 0
- [x] **E2-2** tsc web 0
- [x] **E2-3** api lint 0
- [x] **E2-4** web lint **16 = 基線**,而且**同一批三個檔**(我掂過嘅檔零 error)
- [x] **E3-1** `ui-design` DS-1…DS-12 逐條答(見 `progress.md`)
- [x] **E3-2** 🔴 **light 真 render** —— 三行 ticket · `Step 4/4 · Completed` · 兩個時間戳而 AD 冇 · history 喺 AI Assist 之上
- [x] **E3-3** 🔴 **dark 真 render** —— 同上,零硬色 / 對比足夠
- [x] **E3-4**(render 揭到,新增)🔴 修 sync row 對齊 —— AD 步冇時間 ⇒ 矮一行,`items-center` 令三個 title 唔同水平;改 `items-start` + 連接線 `mt-[10px]` + 右邊 `self-center`
- [x] **E4** ADR-0035 → Accepted(2026-08-14)

---

## Doc sync(R2 / R7)

- [x] **F-1** `progress.md` 寫 Day-1 entry
- [x] **F-2** `BACKLOG.md` 同步
- [x] **F-3** `CLAUDE.md` §0/§9 座標
- [x] **F-4** `SESSION_SUMMARY.md` —— 🔴 **順手更正咗一句 stale**:佢寫住 CH-029「淨低 H6 真 render + live 驗」,而兩樣 08-13 都收咗(淨低 `D-A`);改之前有跟該檔自己嗰條規矩先 grep 數 entry(4 個,其中 line 10 / 24 唔使改)
- [x] **F-5** commit 對應 checklist 項(R2)

---

## 收尾(Chris 2026-08-14 兩個決定)

- [x] **G-1** **OD-1 backfill = 唔做** —— spec §5 由 🚧 改 ✅,明標「已收嘅決定,唔係遺留待辦」
- [x] **G-2** **render fixture 清返** —— `cmsq0p4ou…` 還原;🔴 原值由**證據**推返(timeline 零 `STAGE_CHANGE` + `advanceStage` 一定寫 event ⇒ `REQUESTED`;`openSyncGate` 同 transaction 寫 `azureSyncedAt` 而佢原本 NULL ⇒ `accountCreatedAt` NULL)
- [x] **G-3** 還原後逐欄驗過對得返原始形狀,`status` 仍 `OPEN`
- [x] **G-4** `ai-doc-extraction-db` 還原 —— **真 TCP probe 5433 = `True`**
