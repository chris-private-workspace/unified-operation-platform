---
phase: W06-fe-overview-assets
name: "前端畫面 1 — Overview dashboard + SKU Catalog(首次接後端 data)"  # 2026-07-09 deviation: 2nd screen License Assets → SKU Catalog（見 §9）
sprint_week: W06
backlog_id: FE-1
start_date: 2026-07-09
end_date: 2026-07-16          # planned, may slip with changelog log
status: closed               # draft | active | closed — progress closed + checklist complete（2026-07-20 status 回填）
spec_refs:
  - docs/02-architecture/design-system.md（設計系統 SSOT + anti-drift）
  - design_handoff_licenseops/prototype/full-console.html（Overview + Assets 視覺真相 — browser render 抽 section）
  - docs/02-architecture/licenseops/DESIGN.md（LicenseOps 業務語意 — 對帳方案甲 / ledger 兩層數字 / stage）
  - apps/api OpenAPI /docs/api（endpoint 契約:/license/* /fulfilment/*）
  - CLAUDE.md §3.2 前端 conventions / §5 H6 Design Fidelity
prior_phase: W05-fe-scaffold
---

# Phase W06(FE-1)— Overview dashboard + License Assets

> **Plan version**:1.0（draft）
> **Owner**:Chris Lai
> **Approved by**:Chris Lai(2026-07-09;OD1–OD4 全照 default = A)
> **H6 提醒**:token-only、唔 eyeball、light+dark、lucide-only、數字 mono;每 commit 前跑 `.claude/skills/ui-design`（DS-1~12）。**偏離設計 / 要新 primitive → STOP 問 owner。**

## 1. Scope

W05 scaffold 完成(app shell + token/theme + 7 shell primitive + routing + Query provider 就位)。本 phase = **前端第一個真實畫面 phase**,砌兩個**後端真數完整支撐**嘅畫面 + **首次接後端真數**:

1. **Overview dashboard**(`/`)—— KPI stat cards + needs-attention + drift 摘要 + requests + roadmap,對 prototype 1:1(seat KPI + activity 缺 endpoint → 換 honest metric / EmptyState)。
2. **SKU Catalog**(`/catalog`)—— SKU 字典表,**1:1 對 `/license/catalog`**(displayName / skuPartNumber-mono / skuId-mono GUID / alias / category badge / BASE / active / lastSynced)+ Sync 觸發 + 分頁,對 prototype 1:1。
3. **Data layer** —— TanStack Query hooks 對**現有** GET endpoint(`/license/catalog`、`/license/drift`、`/fulfilment/requests`);vite dev **proxy** `/api` → `localhost:3100`(避 CORS,**唔改 apps/api**);loading / error / empty 狀態走設計系統(EmptyState + spinner + toast)。

> **⚠️ 2026-07-09 deviation(R3,§9 changelog)**:原 plan 第二個 screen = **License Assets**。對 prototype ground 後發現 License Assets 成個畫面 = owned/allocated/assigned **ledger 數量**(無 read endpoint;allocated 欄連 import 都 deferred)—— OD1-A 下只可砌空殼。字典內容其實屬 **SKU Catalog** screen,而佢 100% 對得上 `/license/catalog`。Chris 拍板(選項 A)**換第二個 screen = SKU Catalog**;License Assets 移去將來 phase,配 **BE-ledger-read** endpoint + allocation import 一齊做(有真數先砌)。

**誠實資料原則(non-negotiable)**:只 bind 後端真有嘅資料;**冇 endpoint 支撐嘅 section 一律 EmptyState / "no data yet",絕不砌假數**。

### 1.1 後端資料現況(scope 根據 — 已核 controller/DTO)

| 前端要 | 後端 endpoint | 狀態 |
|---|---|---|
| **SKU 字典(name/part/skuId/alias/category/base/active/lastSynced)** | `GET /license/catalog` → `SkuCatalogDto[]` | ✅ **100% 支撐 SKU Catalog screen** |
| Catalog sync 觸發 | `POST /license/catalog/sync` → `CatalogSyncResultDto` | ✅ 有(Sync 按鈕) |
| Drift 警報(delta/consumed/ledgerSum/status/sku ref) | `GET /license/drift` → `DriftAlertDto[]` | ✅ 有(Overview drift 摘要) |
| 請求列表(upn/opco/status/SN number) | `GET /fulfilment/requests` → `RequestDto[]` | ✅ 有(Overview needs-attention,aggregate status) |
| **owned/allocated/assigned ledger 數量(License Assets 全畫面)** | — | ❌ 無 read endpoint → **License Assets 整個 defer**(BE-ledger-read) |
| **seat 用量 / utilization %(需 prepaid + `allocatedQuantity`)** | — | ❌ 無 endpoint + allocation import 本身 deferred |
| **Overview seat KPI(1,053 in use)** | — | ❌ ledger → 換 honest metric(active SKU 數 / in-progress 數) |
| **Overview "In procurement" KPI(line-item stage)** | — | ❌ 只有 aggregate status → 換 honest metric |
| **activity feed(RequestEvent)** | — | ❌ 冇 endpoint → EmptyState |

→ SKU Catalog + Overview(替代 metric)= 完整真數;License Assets + activity = defer / EmptyState(見 §2)。

## 2. 明確 out-of-scope（H3 / H6 — 唔可以順手做）

| 排除項 | 去向 |
|---|---|
| **後端改動**(新 read endpoint / ledger stats / events API / CORS 改 main.ts) | 純 `apps/web`;接後端用 **vite proxy**,唔掂 apps/api |
| **License Assets 整個畫面**(owned/allocated/assigned ledger 數量表 + utilization bar + Manage) | 移去將來 phase,配 **BE-ledger-read** endpoint + allocation import(有真數先砌) |
| **Requests 畫面 / request detail / stage stepper / assign 操作 UI** | FE-2 |
| **Drift 專頁 / Settings / Login** | FE-3 |
| **SKU Catalog 的 Edit(改 alias/category/base-flag)寫操作** | 本 phase **只讀 + Sync**;Edit 寫入留後(需 PATCH endpoint,未有) |
| **寫操作 UI**(intake / sync / reconcile / assign 觸發) | 各自畫面 phase;本 phase 只**讀** |
| **auth / login / role guard** | AUTH phase |
| **新 primitive / 新 pattern / 改 token / 加新色** | **STOP（H6）** → 傾 owner → 更新 design-system.md（+ 架構級 ADR）先做 |

## 3. Open Decisions（✅ 2026-07-09 敲定:OD1–OD4 全照 default = A）

| # | 決策 | 選項 | 建議 default |
|---|---|---|---|
| **OD1** | License Assets 三層 / seat 用量需 ledger read model(後端未 expose)。點做? | **A** 純前端 — ledger tier / seat KPI 留 EmptyState + BACKLOG 記後端 mini-phase;FE-1 保持 pure-frontend。**B** FE-1 內加後端 read-only ledger/stats endpoint（+ test），Assets 三層有真數(BE+FE 混合,較大) | **A**(simplicity first;allocation deferred 令 B 只得半塊資料) |
| **OD2** | 前端點對後端型別 | **A** 手寫 typed fetch wrapper + Query hooks(無新 dep,對現有 4 endpoint 手寫 return type)。**B** `openapi-typescript` 由 `/docs/api-json` 生 TS 型別(加 1 個 **dev** dependency;型別自動同步後端契約) | **A**(無新 dep,4 endpoint 手寫成本低;H2 dev-dep 雖屬例外仍傾向少) |
| **OD3** | 缺資料 section 點 render | **A** 設計系統 EmptyState("no data yet")+ BACKLOG。**B** 完全唔 render 嗰啲 section | **A**(保 prototype layout 完整度 + 誠實;絕不砌假數) |
| **OD4** | 後端接駁方式 | **A** vite dev `server.proxy` `/api`→`:3100`(唔改 apps/api)。**B** apps/api `enableCors()`(改 main.ts) | **A**(唔掂後端;prod 由 reverse proxy 對等處理) |

> OD2 若選 B → `openapi-typescript` 屬 **dev dependency**(H2 §5.2 例外容許),plan 標明免誤觸;non-dev runtime dep 一律唔加。

## 4. Deliverables

### F1 — Data layer(TanStack Query + fetch wrapper + vite proxy)
- **Spec ref**:CLAUDE.md §3.2(server state = TanStack Query);OpenAPI `/docs/api`
- **Acceptance criteria**:
  - `vite.config.ts` 加 `server.proxy`:`/api` → `http://localhost:3100`(OD4-A;env `VITE_API_BASE_URL` 可覆寫)。
  - `src/lib/api.ts`:輕量 fetch wrapper(baseURL + JSON + error → throw)。
  - `src/hooks/`:`useCatalog()` / `useDrift()` / `useRequests()` —— TanStack Query,return type 按 OD2。
  - **驗**:後端起(docker + api :3100),前端 Query devtools / network 見到打去 `/api/license/catalog` 等,收到真 JSON。
- **H5**:N/A(前端無 critical-path business logic;無 mock 後端邏輯)。
- **Effort**:3h · **Owner**:AI

### F2 — 畫面用 display primitive re-skin(DS-1/5/6/7)
- **Spec ref**:design-system.md §2;handoff `components/display/*.jsx`(StatCard/Card/Badge/…)+ `.prompt.md`(**inline-style spec,唔照抄**,重建視覺 1:1)
- **Acceptance criteria**:
  - 補建 Overview/Assets 用到嘅 display primitive:**StatCard**(`label value tone icon delta sub` — tone 只 tint icon chip,value 中性)、**Card**、**Badge**(`tone dot` + stage→tone map)、**EmptyState**。若表格需要 → 用既有 primitive 組合,唔自創(Table 未 wire → 用 `.prompt.md`)。
  - 全用既有 token;數字 mono(DS-5);badge 跟 stage→tone map(DS-8);icon 全 lucide(DS-6)。
  - **屬「組合既有 primitive / 用 token 砌」= 唔算 violate H6**(design-system.md §5)。要新 primitive/pattern → STOP 問 owner。
- **Effort**:4h · **Owner**:AI

### F3 — Overview dashboard(`/overview`,DS-4/11)⭐
- **Spec ref**:`prototype/full-console.html`(browser render 抽 Overview section)
- **Acceptance criteria**:
  - KPI stat cards(4 個,對 prototype)—— **只用現有資料誠實得出**:Open requests(`/requests` 未完成計數)/ In-progress requests(IN_PROGRESS 計數,代替 prototype「In procurement」line-item stage 無 endpoint)/ Open drift alerts(`/drift` OPEN 計數)/ Tracked SKUs(`/catalog` active 計數,代替 prototype「seats in use」ledger)。**唔砌 ledger 假數**。
  - Needs-attention card:未完成 request(`/requests` 篩 != COMPLETED/CANCELLED),每 row 狀態 dot + "REQ/UPN" + aggregate status Badge + relative createdAt。
  - Drift 摘要 card:open 計數 + 每 SKU delta badge(`/drift`);roadmap card(靜態,對 prototype)。
  - Activity feed = EmptyState("no activity yet",無 events endpoint,OD3)。
  - **light + dark 都 render 冇爆**(DS-4);對 prototype 1:1(DS-11);loading = skeleton/spinner,error = toast。
- **Effort**:5h · **Owner**:AI

### F4 — SKU Catalog(`/catalog`,DS-4/11)⭐ ← 2026-07-09 deviation(原 License Assets)
- **Spec ref**:`prototype/full-console.html` SKU Catalog view(browser render 已抽);`SkuCatalogDto`;DESIGN.md(skuId 主鍵)
- **Acceptance criteria**:
  - 字典表 1:1 對 `/license/catalog`,每 row:**displayName**(bold)/ **skuPartNumber**(mono)/ **skuId** GUID(mono,muted)/ **businessAlias**(chip)/ **category**(badge,tone by category)/ **BASE** badge(isBaseLicense,否則 "—")/ **active**(綠點)/ **Edit**(disabled — 無 PATCH endpoint,本 phase 只讀)。
  - 副題 "N SKUs · synced from tenant {lastSyncedAt}";右上 **Sync catalog from tenant** 按鈕(`POST /license/catalog/sync` → 成功 invalidate catalog query + toast)。
  - client-side 分頁(prototype 8/頁)+ 頁尾 note "Part number & skuId are system-owned…"。
  - id/GUID/part number **mono**(DS-5);category/BASE 用 Badge(DS-8 semantic tint);light + dark(DS-4);對 prototype 1:1(DS-11)。
- **H5**:Sync 係唯一寫觸發(呼既有 endpoint,前端無 business logic)→ 前端 test N/A;手動驗 sync round-trip。
- **Effort**:5h · **Owner**:AI

### F5 — Query 狀態(loading / error / empty)整合
- **Acceptance criteria**:三個 hook 各有 loading(spinner/skeleton)/ error(toast + retry)/ empty(EmptyState)態;**絕不砌假數**;後端未起時畫面唔白爆(顯示 error/empty 而非 crash)。
- **Effort**:2h · **Owner**:AI

### F6 — DS 自檢 + gate
- **Acceptance criteria**:`.claude/skills/ui-design` DS-1~12 全 ✅(特別 DS-11 對 prototype、DS-5 mono、DS-8 badge tone);`npm run lint -w @uop/web` clean;`npm run build -w @uop/web` 0 error。
- **Effort**:1.5h · **Owner**:AI

## 5. Success Criteria（Phase Gate）

| # | Criterion | Target | Measure | Block closeout? |
|---|---|---|---|---|
| G1 | Build passes | 0 error | `npm run build -w @uop/web` | Yes |
| G2 | 兩畫面 render（light + dark） | Overview + Assets 出、theme swap 唔爆、對 prototype 一致 | `npm run dev` + browser 截圖（DS-4/11） | Yes |
| G3 | **真數流通** | Query 打到後端、收真 JSON、render 出嚟 | 後端起 + network / devtools（vite proxy） | Yes |
| G4 | ui-design DS 自檢 | DS-1~12 全 ✅ | skill 逐條 | Yes（H6） |
| G5 | 誠實狀態 | loading/error/empty 皆走設計系統;無假數;無 crash | 斷後端試 error/empty 態 | Yes |
| G6 | Lint clean | 0 warning | `npm run lint -w @uop/web` | No |

## 6. Risks（Phase-Specific）

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **後端資料落差**(ledger/seat/activity 無 endpoint) | High(已知) | Med | OD1-A:EmptyState + BACKLOG;誠實原則唔砌假數 |
| R2 | 接後端撞 CORS | Med | Low | OD4-A vite proxy `/api`→:3100,唔改 apps/api |
| R3 | Prisma engine CDN / 後端起唔到(承 R1 環境坑) | Med | Med | 起前 docker up + 轉流動網路 cache engine(見 memory);G3 需後端在線 |
| R4 | 畫面偏離 prototype（H6 drift） | Med | High | browser render prototype 抽 section 對照;G4 DS-11 |
| R5 | seat/utilization 卡想砌假數填 layout | Med | High | **禁**;OD3-A EmptyState;誠實原則 |
| R6 | stale :3100 / vite :5173 佔用 | Low | Low | 驗前 `Get-NetTCPConnection -LocalPort 3100/5173 -State Listen` 清 stale(見 memory) |

## 7. Day-by-Day Breakdown（rough）

| Day | Date | Focus | Deliverables |
|---|---|---|---|
| D1 | 2026-07-09 | data layer + vite proxy + display primitive | F1, F2 |
| D2 | 2026-07-10 | Overview dashboard（對 prototype） | F3 |
| D3 | 2026-07-11 | License Assets + Query 狀態整合 + DS 自檢 + gates | F4, F5, F6, G1–G6 |

## 8. Dependencies on Prior Phase

W05 scaffold(app shell + token/theme + 7 primitive + routing + Zustand + **QueryClientProvider 已就位**)。後端 `/license/*` `/fulfilment/*`(W02–W04)在線供 G3。design-system.md SSOT + prototype 視覺真相就緒。

## 9. Plan Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-09 | Initial draft（FE-1 Overview + Assets） | W05 scaffold 完,前端第一個畫面 phase | Chris Lai |
| 2026-07-09 | Approved → status active;OD1–OD4 全照 default = A（純前端+EmptyState / 手寫 typed hooks / EmptyState 缺資料 / vite proxy） | Chris approve 開工 | Chris Lai |
| 2026-07-09 | **Deviation(R3):第二個 screen License Assets → SKU Catalog** | 對 prototype ground 後發現 License Assets 成個畫面 = ledger 數量(無 read endpoint,OD1-A 已 defer),只可砌空殼;SKU Catalog 100% 對 `/license/catalog`,完整真數。License Assets 移將來 phase(配 BE-ledger-read + allocation import) | Chris Lai(選項 A) |

---

**Lifecycle reminder**:plan locked after status=active。重大 deviation → 第 9 節 changelog + progress Day-N;approve 前唔 code（R1）。**H6**:偏離設計（新 primitive/pattern/token/色）→ STOP 問 owner。**誠實資料**:缺 endpoint 一律 EmptyState,絕不砌假數。
