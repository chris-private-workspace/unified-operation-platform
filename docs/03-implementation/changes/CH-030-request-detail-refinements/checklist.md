# CH-030 — Checklist

> 由 `spec.md` §3 acceptance derive。**唔可以刪未勾項** —— 只可以 `[ ]` → `[x]`,或者加 🚧 + 理由 + target。
> 🟢 spec `approved` + ADR-0035 `Accepted`(Chris,2026-08-14)⇒ 兩道閘都過咗。

---

## F1 — 平台 licence REQ 號碼(ADR-0035)

### Schema
- [x] **A1-1** `schema.prisma` `Request` 加 `serviceNowLicenceReqNumber String?`
- [x] **A1-2** 🔴 **冇 `@unique`**(ADR-0035 D1)—— 加完自己 grep 一次確認
- [x] **A1-3** comment 寫明佢同 `serviceNowNumber` 嘅分別 + 點解唔可以入 `where`(D2)
- [ ] **A2-1** `prisma migrate dev` 生成 migration 🚧 **卡本機 5433**(`ai-doc-extraction-db` 佔住,停佢要 Chris 批)
- [ ] **A2-2** 對本機 DB 真跑過,輸出貼落 `progress.md` 🚧 **同上**
- [x] **A2-3** `prisma generate` 之後 tsc 認到新欄(api + web 兩邊 exit 0)

### 寫入
- [x] **A3-1** `intake-adapter.service.ts` raise 成功 ⇒ 同啲 RITM **同一個 `$transaction`** 寫 `serviceNowLicenceReqNumber`(D3)
- [x] **A3-2** test:raise 成功 ⇒ 欄 = provider 返嘅 REQ number
- [x] **A3-3** test:raise **失敗** ⇒ 欄維持 `null`(唔可以寫一半)
- [x] **A3-4** 🔴 grep 全 repo 確認新欄**冇出現喺任何 `where` / `upsert` / `findUnique`**(D2)—— 實測只 4 處:schema 宣告 · intake-adapter `data:` · api-types 宣告 · 前端讀
- [x] **A4** **falsification**:拆走 A3-1 個寫入 ⇒ **2 紅 / 55 綠,零誤傷**

### API
- [ ] **A5-1** 真打一次 API 確認新欄出到 wire 🚧 **卡本機 5433**
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
- [ ] **E3-1** `ui-design` skill DS-1…DS-12 逐條答 🚧 **等 render**
- [ ] **E3-2** 🔴 **light 真 render** 🚧 **卡本機 5433**
- [ ] **E3-3** 🔴 **dark 真 render** 🚧 **卡本機 5433**
- [x] **E4** ADR-0035 → Accepted(2026-08-14)

---

## Doc sync(R2 / R7)

- [x] **F-1** `progress.md` 寫 Day-1 entry
- [ ] **F-2** `BACKLOG.md` 同步
- [ ] **F-3** `CLAUDE.md` §0/§9 座標
- [ ] **F-4** `SESSION_SUMMARY.md`
- [x] **F-5** commit 對應 checklist 項(R2)
