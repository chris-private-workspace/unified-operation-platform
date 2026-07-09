---
phase: W06-fe-overview-assets
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: closed    # in-progress | closed
---

# Phase W06(FE-1)— Progress

> Daily progress + 結尾 retro。
> 每 commit 必須對應一個 Day-N entry mention（R2 binding rule per PROCESS.md §5）。

---

## Day 0 — 2026-07-09: Kickoff

**Action**:Phase W06（FE-1）kickoff —— 前端第一個真實畫面 phase（Overview dashboard + License Assets;首次接後端真數）。

- **H6 對齊**:重讀 `docs/02-architecture/design-system.md`（SSOT,五條 non-negotiables + anti-drift）;prototype 視覺細節留 code 階段用 browser render 逐 section 抽（`ui_kits` 版係 self-unpacking bundle,靜態讀唔到;同 W05 shell 做法一致）。
- **後端資料 ground（已核 controller + DTO）**:可消費 GET 得 3 條 —— `/license/catalog`（`SkuCatalogDto[]`）、`/license/drift`（`DriftAlertDto[]`）、`/fulfilment/requests`（`RequestDto[]`）。
  - ⚠️ **資料落差**:per-OpCo ledger tier（每 OpCo 每 SKU allocated/assigned）、seat 用量 / utilization（需 prepaid `allocatedQuantity`,import 本身 deferred）、activity feed（RequestEvent）**皆無 read endpoint** → 缺資料 section 走 EmptyState + BACKLOG（誠實原則,絕不砌假數）。此落差 = FE-1 最核心 scope 決定（OD1）。
- **接後端方式**:vite dev `server.proxy` `/api`→`:3100`（避 CORS,唔改 apps/api;OD4）。
- `plan.md` 填好,status=`draft`（**等 Chris approve flip active + 定 OD1–OD4**）。
- `checklist.md` derived（F1–F6,每 UI item 綁 DS 自檢 + 誠實資料原則）。
- Carry-over:W05 scaffold 就緒（app shell / token/theme / 7 primitive / routing / QueryClientProvider）;2 flag（Avatar gradient DS-7 / npm vuln）未動;auth guard 未做。

**Commit**:_(pending — kickoff 連 F1–F6 code 一併 closeout commit)_

**下一步**:Chris review plan → 定 OD1–OD4 → approve flip `active` → 由 F1（data layer）開工。

---

## Day 1 — 2026-07-09

**Chris approve plan → status `active`;OD1–OD4 全照 default = A**(純前端 + EmptyState 缺資料 / 手寫 typed hooks 無新 dep / vite proxy 唔改 apps/api)。開始 F1–F6。

### Done
- **F1 data layer ✓**:`vite.config.ts` `server.proxy` `/api`→`:3100`(OD4);`src/lib/api.ts` fetch wrapper + `ApiError`;`src/lib/api-types.ts`(手寫 mirror DTO,date=ISO string,OD2);`src/vite-env.d.ts`(補 `import.meta.env` 型別);`src/hooks/queries.ts`(`useCatalog`/`useDrift`/`useRequests`)。
- **F2 display primitive ✓**:StatCard / Card / Badge / EmptyState(對 handoff `components/display|feedback/*.jsx` 1:1;token class + arbitrary px 照 Button pattern)。

### 🔴 Deviation（R3）— 第二個 screen License Assets → SKU Catalog
- **點解**:browser render prototype 對照後發現 **License Assets 成個畫面 = owned/allocated/assigned ledger 數量**(3 個 KPI + 每 SKU 用量 bar + Headroom/Over-allocated)——現有 endpoint 一個都冇支撐(allocated 欄連 import 都 deferred)。OD1-A 下只可砌空殼(marquee 數字全空,違誠實資料原則)。
- **關鍵辨識**:字典內容其實屬 prototype **另一個 nav「SKU Catalog」**,而佢 **1:1 對 `/license/catalog`**(顯 DISPLAY NAME/PART NUMBER/SKUID/ALIAS/CATEGORY/BASE/ACTIVE/Edit + Sync + "10 SKUs · synced Jul 8 06:00")。
- **決定**:Chris 拍板選項 A —— **FE-1 第二個 screen 換成 SKU Catalog**(完整真數);License Assets 移將來 phase,配 **BE-ledger-read** endpoint + allocation import。
- **同步**:plan §1/§1.1/§2/§4/§9、checklist F4、BACKLOG(License Assets → 未來項)已改。

### Done（F3–F6 + gates,一日內完成）
- **F3 Overview ✓**（`src/pages/overview.tsx`）:Summary/Analytics tab（Analytics→EmptyState）;4 KPI StatCard（honest metric:Open requests/In progress/Open drift/Tracked SKUs——**無 ledger 假數**）;Needs-attention（`/requests` 篩未完成,COMPLETED 正確排除,dot+mono REQ/UPN+status Badge+relative time）;Drift summary（`/drift` open 計數 + 每 SKU delta badge +3/-2/+1）;roadmap（靜態,purple dot+badge）;Recent activity EmptyState（無 events endpoint）。
- **F4 SKU Catalog ✓**（`src/pages/catalog.tsx`）:1:1 對 `/license/catalog` 表（displayName/part-mono/skuId-mono muted/alias/category badge/BASE/active 綠點/Edit disabled）;副題 "N SKUs · synced …" + Sync 按鈕（`POST /catalog/sync`→invalidate+toast,`useMutation`）;client 分頁 8/頁 + prev/next;頁尾 note。
- **F5 Query 狀態 ✓**:共用 `Loading`（spinner）/ `LoadError`（danger EmptyState）（`src/components/ui/feedback-states.tsx`）;三 hook 各 loading/error/empty;**絕不砌假數**。
- **F2 支援**:`api.ts` 加 `apiPost`;`api-types.ts` 加 `CatalogSyncResult`;`lib/format.ts`（relativeTime/formatDateTime/signed）。
- **F1 wire**:`router.tsx` index→Overview、`/catalog`→Catalog、`/assets`→Placeholder(FE-Assets deferred)。

### Gates
- **G1 build ✓**:`tsc --noEmit && vite build` 0 error（1661 modules;CSS 16.81kB = token + 新畫面 class）。
- **G2 render light+dark ✓**:Overview + SKU Catalog 兩 theme 都 render 冇爆（browser 截圖對照 prototype 1:1）。
- **G3 真數流通 ✓**:後端起（docker postgres 5433 + api 3100）;本地 seed 10 catalog/3 drift/5 request（**本地 dev DB only,唔 commit**;scratchpad 一次性 script）;vite proxy `/api`→3100 打真 JSON,兩畫面 render 真數。
- **G4 DS 自檢 ✓**:DS-1~12 全 ✅（見下;**0 flag**——StatCard mono→sans 已對 prototype 修正）。
- **G5 誠實狀態 ✓**:activity/analytics/all-clear/in-sync 皆 EmptyState;error→LoadError（coded）;無假數;無 crash。
- **G6 lint ✓**:eslint exit 0（`--fix` 格式 + react-hooks warning 修好）。

### DS 自檢（`.claude/skills/ui-design` DS-1~12）
- DS-1 token-only ✅（唯一 arbitrary radius = EmptyState `rounded-[11px]` 照 handoff spec,已註;其餘 arbitrary 值 = 控件 px 照既有 Button precedent）· DS-2 唔 eyeball ✅（**computed 查證 KPI hero = sans 非 mono → 修正 StatCard**;category tone 讀 prototype）· DS-3 單一 accent ✅（Overview 零 primary / Catalog 一個 Sync primary）· DS-4 light+dark ✅（兩畫面兩 theme 截圖）· DS-5 數字/識別碼 mono ✅（req id/UPN/GUID/part/time mono;KPI hero sans 對 prototype）· DS-6 lucide ✅ · DS-7 平面 ✅（border+tint+resting shadow,無 blur/新 gradient）· DS-8 semantic badge ✅（status/drift/category/roadmap 全 6 tint）· DS-9 motion ✅（只 spin）· DS-10 voice ✅（caps 只表頭）· DS-11 對 prototype ✅（1:1;honest deviation:seat/procurement KPI 換 metric、License Assets→Catalog、activity EmptyState 已 log）· DS-12 唔捏 logo ✅（用 W05 glyph）。

**Commit**:_(pending — 待 Chris approve commit+push)_

**下一步**:Chris approve → closeout commit + push;然後 W06 closed,下一個 = FE-2 Requests。

---

## Retro（2026-07-09 收尾）

### What worked
- **對 prototype ground 先落 code（H6 DS-11）救返兩個偏差**:①computed 查證 KPI hero 數字係 sans 非 mono → 即刻改 StatCard(否則 eyeball 就錯);②發現 License Assets 成個畫面靠 ledger 無 endpoint → 及時 surface + 換 SKU Catalog。**唔對 prototype 就會靜靜砌錯 + 砌空殼**。
- **誠實資料原則硬守**:seat/procurement KPI 換 honest metric、activity/analytics EmptyState、License Assets 唔砌假數。寧願 surface 落差改 scope,唔砌 marquee 假數。
- **本地 seed 驗真數**:10 catalog/3 drift/5 request(本地 dev DB,唔 commit)→ 兩畫面 render 真數,對 prototype 1:1,分頁/badge/mono/delta 全部有圖為證。
- **vite proxy 唔改後端**:`/api`→3100,零 CORS 改動,apps/api 一行冇郁(OD4-A)。

### What didn't work / unexpected friction
- **原 plan 第二個 screen 揀錯咗對象**:OD1 問嘅時候我當 License Assets = 字典+drift,但 prototype 揭示佢純 ledger 數量、字典其實喺 SKU Catalog screen。教訓:**scope 決定前要對 prototype 睇清楚每個畫面實際內容**,唔好靠畫面名估。已及時 surface + Chris 拍板換,R3 log。
- **claude-in-chrome 唔食 `file://`**:要起臨時 Node 靜態 server serve prototype(path guard forward/back-slash bug 撞咗一次)。
- **screenshot 首次常 timeout**(renderer busy/layout 未 settle):要 wait + retry;一次 stale frame 令我誤以為有橫向溢出,JS 查 scrollWidth 證實冇,係 stale。教訓:**layout 存疑先用 JS 量度(scrollWidth/getBoundingClientRect)唔靠 stale 截圖**。
- **theme 唔 persist**:navigate full-reload → zustand reset 返 light。非 FE-1 scope(W05 decision),但記低——將來或加 localStorage persist。

### Surprises / discoveries
- **License Assets 是純 ledger 畫面**——最大發現,直接改咗 phase 交付物。
- **KPI hero 數字係 sans 非 mono**(DS-5 只適用 inline 識別碼/count,唔適用 hero display 數字)——computed 查證先知。
- 後端 read model 缺口比預期大:per-OpCo ledger / seat / activity / line-item stage 全部無 read endpoint → 多個 honest substitution。→ **BE-ledger-read** mini-phase 成為 License Assets + 未來 seat 視圖嘅前置。

### Carry-overs to 下一個 phase（FE-2 Requests）
- **下一個 = FE-2**:Requests 列表 + request detail（stage stepper）+ 可能 assign/sync 操作 UI（寫操作,需評估 endpoint）。首個接寫操作前端。
- **🚩 承前 flags**:Avatar gradient DS-7（W05,待 owner）· npm dev vulnerabilities（W05）。
- **新候選(BACKLOG)**:**BE-ledger-read**(後端 read model)+ **FE-Assets**(前端 License Assets,前置 BE-ledger-read + allocation import)。
- SKU Catalog **Edit 寫操作**(改 alias/category/base-flag)需 PATCH endpoint,未有 → 現 disabled。
- auth guard 仍未做(endpoint unguarded)。theme persist(localStorage)可考慮。

### ADR triggers
- **無新 ADR** — 純前端組合既有 primitive(StatCard/Card/Badge/EmptyState 對 handoff spec 重建)+ 用 token 砌,OD 全選 A(無新 vendor/primitive/pattern/token)。第二 screen 換 = scope deviation(R3 changelog),非架構級。

### Phase Gate result
- **G1 build:Pass** · **G2 render light+dark:Pass**(兩畫面) · **G3 真數流通:Pass**(seed + proxy) · **G4 DS 自檢:Pass（0 flag）** · **G5 誠實狀態:Pass** · **G6 lint:Pass**

### Phase status
- Frontmatter status → `closed`。BACKLOG 已同步(FE-1 進行中、License Assets 移未來、BE-ledger-read/FE-Assets 候選)。
- 下一個 phase kickoff trigger:**FE-2 = Requests**(列表 + detail + 首個寫操作 UI)。

---

**End of W06 progress**
