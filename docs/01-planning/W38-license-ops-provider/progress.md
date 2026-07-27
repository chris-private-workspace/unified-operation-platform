---
phase: W38-license-ops-provider
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: closed         # active | closed
last_updated: 2026-07-27
---

# Phase W38 — Progress

> Daily Day-N entries(每 commit 對應一個 entry,R2)+ 結尾 retro。

---

## Day 0 — 2026-07-27:Kickoff(**plan = draft,🔴 未 approve**)

**Action**:W38 kickoff(PROCESS §2.3)

### 0. 掃號(PROCESS §2.1 —— 呢條規則就係上次撞 W36 之後加嘅)

跑咗 `git fetch --all --prune`,再掃**所有** local + remote ref 嘅 `docs/01-planning/` tree(唔止 `main`):

```
W30 … W35 · W36-n8n-intake-adapter · W36-opco-budget-gate · W37-sync-sweep
```

最大 = **W37** ⇒ **W38 可用**。remote 得兩條 branch(`main` + `feat/ch-008-ledger-empty-rows`),冇平行 session 佔緊號。

### 1. 為何呢個 phase 值得獨立開

ADR-0017 自己講明 outcome 正規化係「本 ADR 最核心嘅設計功夫」。Graph 係 `throw` / `void`,n8n 2003 係返 `already_assigned` / `not_synced` 呢啲**成功形狀嘅結果**。mapping 寫錯 = 切 provider 時**靜默行為改變**,而且係最難察覺嗰種。趁得一個實作嘅時候定死詞彙 + 鎖 test,遠比兩個實作一齊寫易驗。

### 2. 查證 code 之後,ADR-0017 D2 個表**唔可以照抄**

三樣 ADR 寫嗰陣冇嘅資訊,全部 `grep` 實查得出:

| 發現 | 實據 |
|---|---|
| `getSubscribedSkus()` 有 **4 個** consumer,唔止 assign | `assign.service:191` · `reconcile.service:50` · `catalog.service:48` · `integration-probe:76` |
| `sync-sweep` 用 `findUser`,而佢 **ADR-0017 Accepted 之後一日先存在** | `sync-sweep.service:101`(W37 = 07-27;ADR-0017 = 07-26) |
| `listUsersBySku()` 全 repo **零 caller**,`GraphService` 得 4 個公開方法 | `graph.service.ts` 83/101/129/140 |

⇒ 三個 OQ(plan §8),**全部要 Chris 拍板先開工**。

### 3. 🔴 最重要嗰個:OQ-2(sync-sweep)

ADR-0015 嘅**整個重點**係 `azureSyncedAt` 由「n8n 聲稱」升級為「平台證實」。若果 `sync-sweep.findUser` 走 n8n 2005,就變成 n8n 再一次話畀平台聽「呢個 user sync 咗」= **直接推翻 ADR-0015**。

呢個唔係「ADR-0017 寫錯」—— 係兩份 ADR 相隔一日、後者實作先出現嘅**真空位**。所以處理方式係喺 ADR-0017 加**實作補註**(鏡射 ADR-0009 Decision 5 嘅做法),**唔係改 Accepted 內容**。

### 4. 順帶揪到一個重構陷阱(plan R2)

`graph.service.ts:146` —— `assignLicense()` **內部再 `findUser` 一次**,而 `assign.service.ts:131` 已經查過。即係每次 assign 打**兩次** Graph。

呢個係既有行為。抽象化嗰陣**極易順手「優化」**掉 —— 但咁就唔再係「純重構零行為改變」。已明文寫入 F3 acceptance:**保留**。要清呢個重複 = 另開 Change。

### 5. Artifacts

```
docs/01-planning/W38-license-ops-provider/
├── plan.md        (status: draft —— 等 approve)
├── checklist.md   (D0 Gate 四項未 tick,其下全部鎖住)
└── progress.md    (本檔)
```

### Blockers

- 🔴 **plan 未 approve**(`status: draft`)+ **三個 OQ 未拍板** → 依 R1,**一行 code 都唔寫**
- ⚠️ 本 phase **唔依賴** UAT 部署([P]/[N] 仍未通),亦**唔掂** ServiceNow ⇒ 戊嘅 carry-over 唔阻本 phase

**Commit**:`fe07eef` — `chore(planning): kickoff W38 — LicenseOperationsProvider(ADR-0017 己)`

---

## Day 1 — 2026-07-27:**三個 OQ 拍板**,D0 Gate 解除

**Chris 三個 OQ 全部跟建議**,plan 內容零改動 ⇒ `status: draft → active`,checklist 解鎖。

| OQ | 拍板 | 落到邊度 |
|---|---|---|
| **OQ-1** | **選項 A** —— provider **只收 assign 路徑** | `reconcile` / `catalog` / `integration-probe` 明文不動 + **F4 負面斷言鎖死** |
| **OQ-2** | **選項 A** —— `sync-sweep.findUser` **永遠直接 `GraphService`** | F4 test + code comment 要寫**點解**,唔止鎖現狀 |
| **OQ-3** | **選項 B** —— **唔加** `listUsersBySku()` | 介面收窄到真有 caller 嗰幾個 |

### 呢三個拍板合埋嘅意思:介面**細過** ADR-0017 D2 個表

D2 表列 5 個方法,拍板之後實際只需要 **3 個**:

| D2 方法 | 收唔收 | 理由 |
|---|---|---|
| `listTenantSkus()` | ✅ 收 | assign 座位檢查(`assign.service:191`) |
| `findUser(upn)` | ✅ 收 | assign 前置(`assign.service:131`)。⚠️ **`sync-sweep` 嗰個 `findUser` 唔經呢度**(OQ-2) |
| `assignLicense(...)` | ✅ 收 | 核心(`assign.service:208`) |
| `checkSync(upns[])` | ❌ 唔收 | 全 repo **零 caller**,同 OQ-3 一樣嘅理由(§1.2)—— 呢個係拍板之後推導出嚟嘅**第四個發現**,plan §8 冇明文提過,但適用同一條準則 |
| `listUsersBySku()` | ❌ 唔收 | OQ-3 |

> ⚠️ `checkSync()` 唔收係我按 OQ-3 同一準則推導,**唔係 Chris 明文拍板嘅第四個 OQ**。若果你想連 `checkSync` 一齊留位,講一聲我加返 —— 但佢而家真係一個 caller 都冇。

**下一步**:F1 介面 + `AssignOutcome` 詞彙。

---

## Day 2 — 2026-07-27:F1 介面 + F2 Graph 實作(**比 plan 快一日**)

`apps/api/src/integration/license-ops/` 三個新檔,**working tree 淨係多咗呢一個目錄**(`git status --short` 得一行 `?? license-ops/`)—— 零既有檔改動。

### 落手前要 Chris 拍嘅第四個板:error 契約

ADR §D2 寫「把 Graph 例外(**現時經 `graphUnavailable()` wrap**)map 入呢個詞彙」。但 `graphUnavailable()` wrap 嘅係**網絡 / auth / throttle 失敗**,即「vendor 掛咗」。呢樣**唔係呢次 assign 嘅結果,係冇結果** —— caller 應該重試而唔係詮釋。

照字面做 ⇒ provider 返 `{status:'error'}` ⇒ `assign.service` 要**人手複製**一個逐字相同嘅 503 message,而任何一個字唔同就係行為改變。

**Chris 拍板:transport 失敗照 throw。** `error` variant 收窄成「provider 答咗,但答案係失敗語意」(例:2003 返 `{result:'failed'}`)。呢個契約對兩個實作都成立,亦令 W38 真係企得住「純重構」。已入 plan §7 changelog **D1**。

### 🔴 寫實作先發現 plan G3 做唔到 —— 而且**唔應該**做到

plan 寫「5 個 variant 全覆蓋」。但 `GraphLicenseProvider` **只產生得到 `assigned`**:

| variant | 點解 Graph 產生唔到 |
|---|---|
| `not_synced` / `no_seats` | caller 喺**入 provider 之前**已經攔截(sync gate + 座位檢查)。移入嚟 = provider 開始做決策 = **違反 D0** |
| `already_assigned` | Graph 個 POST **冪等而且唔報告** —— 呢個實作**根本分唔到**。n8n 2003 分得到 |
| `error` | Graph 靠 throw,而 throw = transport = 503(見上) |

為咗夾夠 5 個而喺 Graph 側虛構 mapping,就係**憑空造行為**。G3 改成「實際產生得到嘅 variant 全覆蓋」,plan §7 changelog **D2**。

➕ **順帶留低一個庚必須面對嘅真問題**(已寫入 provider doc comment,唔係散落喺 progress):**同一個 replay,Graph 會講 `assigned`,n8n 會講 `already_assigned`。** 呢個係真 cross-provider 不對稱。庚要拍板係「caller 一視同仁」(今日就係咁 —— replay 唔當錯)定係「Graph 側先探一次 user licenses」(每次 assign 多一個 round-trip)。**唔准喺 Graph 側靜靜加個 probe 當修好咗。**

### 🔴 條 test 意外揪到一個**既有** H4 缺陷

跑 F2 個 H4 test 見到:

```
[GraphLicenseProvider] Microsoft Graph unavailable while trying to
look up the target user: Request failed for /users/sensitive.person@example.com
```

Exception message 乾淨(test 證到),但 **`graphUnavailable()` 把 vendor error 原封放入 `logger.error`**,而 Graph 404 body 個 request path 帶 UPN ⇒ **UPN 真係入咗 log**。

`graph-unavailable.ts` 自己個 comment 仲寫住「H4: never log the target UPN」—— **佢做唔到自己聲稱嘅嘢**。

- **唔係 W38 引入**:影響**全部**直接 Graph caller(assign / reconcile / catalog / sweep),由 BE-graph-harden 起就存在
- **唔喺 W38 修**:修佢 = 改 log 行為 = 唔再係純重構
- **即刻做咗嘅事**:把 test 描述由「no PII escapes through the error path」**收窄**成「the 503 **MESSAGE** never carries the target UPN」+ 喺 test 檔寫明 log 側仍然漏。原本個名會被讀成「H4 呢條路徑已經守住」,而佢只證到一半 —— 呢個正正係 `feedback_verification-that-proves-nothing` 講嗰種

⇒ 登 **BUG 候選**(Sev3,H4;fix = `graphUnavailable()` 唔好把 `err.message` 原封 log,或者 scrub UPN pattern)。closeout 時入 BACKLOG。

### 交付 + verify(全部實跑)

| 項 | 結果 |
|---|---|
| `graph-license.provider.spec.ts` | **9 passed / 9 total** |
| 介面檔 vendor import | `grep -c` = **0** |
| `git diff apps/api/src/integration/graph/` | **空**(`graph.service.ts` 一行冇郁) |
| `schema.prisma` + 3 個 `package.json` diff | **空**(G4) |
| working tree | 得一行 `?? license-ops/` |

介面按三個 OQ 收窄到 **3 個方法**(D2 表 5 個),加咗兩個 vendor-neutral type(`TenantSkuSeats` / `DirectoryUser`)**刻意窄過** Graph 型別 —— 唔逼 n8n 實作虛構 `capabilityStatus`/`appliesTo`,亦唔畀 `displayName`/`accountEnabled` 呢啲冇人讀嘅 PII 過 seam。

**下一步**:F3 —— `assign.service` 換依賴,G2「既有 spec assertion 零改動」係硬 gate。

---

## Day 3 — 2026-07-27:F3 換依賴 + F4 邊界鎖(**G2 / G5 兩個硬 gate 都真證咗**)

### G2 = `16 insertions, 0 deletions` —— 零刪除,即零 assertion 改動

第一次跑 `assign.service.spec` 全部炸(42 failed):spec 一直 `{ provide: GraphService, useValue: graph }`,而 `AssignService` 而家要 `LicenseOperationsProvider`。

直覺做法係 mock 走個 provider,再逐處 `graph.` 改 `licenseOps.`(33 處)。**冇咁做,因為咁會靜靜整死兩條 BUG-002 regression**:

```
611  graph.assignLicense.mockRejectedValue(new Error('graph 500'))   ← RAW vendor error
618  .rejects.toThrow(ServiceUnavailableException)                    ← 期望 clean 503
```

mock 走 provider ⇒ raw→503 嗰個 wrap **跌出測試鏈** ⇒ 條 test 變成「我 mock 咗 503,佢真係 503」= 廢話,但**照樣綠**。

改為 wire **真嘅 `GraphLicenseProvider` 包住原本個 `GraphService` mock`**:

```ts
{ provide: GraphService, useValue: graph },
{ provide: LicenseOperationsProvider,
  useFactory: (g) => new GraphLicenseProvider(g), inject: [GraphService] },
```

結果:**33 處引用一處都唔使改**,而且測到嘅係 `AssignService + GraphLicenseProvider` 成條真鏈。跑出嚟 log 亦印住 raw error 真係經 provider wrap:

```
[GraphLicenseProvider] Microsoft Graph unavailable while trying to
assign the license in Microsoft Graph: graph 500
```

⇒ `git diff --numstat` = **`16  0`**。零刪除係最硬嘅「零行為改變」證據。

### 非 `assigned` outcome:fail loud,唔幫庚預先揀

`GraphLicenseProvider` 今日只返 `assigned`,所以呢個分支 unreachable。但**唔可以就咁當成功往下行** —— 庚一落地就會行到。同時亦**唔喺度預先決定**「replay 應該點影響 stage machine 同 ledger」:嗰個係真決策,埋喺一個冇 test 到得到嘅分支入面 = 最差做法。所以 throw 一個講明「呢條路仲未處理呢個 outcome」嘅 503,庚必須正面處理佢。

### G5 —— 條邊界 test 真係捉得到

淨係「寫咗 test 而且綠」證明唔到嘢。喺 `reconcile.service.ts` 插一行 seam import:

```
Tests:  1 failed, 7 passed, 8 total      ← 啱啱好紅嗰條,其餘七條照綠
```

`git checkout --` 還原 → diff 空 + `grep -c license-ops` = **0**。

F4 另外加咗兩樣 plan 冇要求但缺咗就唔成立嘅嘢:
- **每個 case 加正面半邊**「still talks to GraphService directly」—— 淨係 assert「冇 import seam」,個檔被刪 / 唔再打 vendor 都會照綠
- **`assign.service` 係唯一過 seam 嗰個**呢條正面斷言,兼驗佢**唔再自己掂 vendor**(否則兩條路並存,庚只換到一半)

### Verify(全部實跑)

| 項 | 結果 |
|---|---|
| api test | **467 / 467**(45 suites)—— 基線 450 + F2 9 + F4 8 |
| lint | **exit 0**(修咗一個 prettier 引號:字串含 apostrophe 要雙引號) |
| `tsc --noEmit` | **exit 0** |
| G2 `assign.service.spec` diff | **16 加 / 0 刪** |
| G5 fails-before | **1 failed / 7 passed** → 還原乾淨 |
| 改動檔數 | **3 個改 + 2 個新**(`fulfilment.module` 零改動 —— 佢 import `IntegrationModule`,新 export 自動到手) |

### 🔴 登 BUG-004(Day 2 揪到嘅 H4 缺陷,Chris 2026-07-27 批准登記)

`graphUnavailable()` 把 vendor error 原封 `logger.error`,而 Graph 404 body 帶 UPN ⇒ UPN 入咗 log。**非 W38 引入**,影響全部直接 Graph caller。已入 BACKLOG A 區。

**下一步**:F5 doc-sync + live 驗證(G8)+ retro。

---

## Day 4 — 2026-07-27:F5 doc-sync + G8 live + closeout

### G8 —— 做到嘅做足,做唔到嘅唔扮

**先撞咗 AP-11。** plan 寫「dev 真跑一次 assign」,但查 process ancestry 揭穿:

```
port 3100 → node C:\Users\CLai03\unified-operation-platform\apps\api\dist\main
                  ↑ 另一個 checkout,而且係 dist build,一行 W38 code 都冇
```

用佢驗證就係 W36 踩過嗰個坑(**驗錯咗第二棵樹**)。改為喺 **3200** 自起本 worktree 嘅 code。

**再發現本 worktree 根本冇 `apps/api/.env`**(得 `.env.example`)—— 即係呢個 worktree 從來冇跑過 runtime。Boot 硬性要 5 個 `getOrThrow` key + `DATABASE_URL`。跟 restart-stack skill 硬規則:**唔改 `.env`**,6 個值全部用 placeholder 由 `Start-Process` 傳。

⚠️ **連帶後果要講清楚**:`GRAPH_CLIENT_SECRET` 只可以係 placeholder ⇒ **驗到嘅係 503 路徑,唔係 assign 成功路徑**。

#### 驗到嘅(全部真 output)

| # | 證據 |
|---|---|
| 1 | **真 boot OK**(~15s)—— DI graph 完整,`LicenseOperationsProvider` 喺真 Nest app 解析得到。**呢樣 unit test 驗唔到**(`Test.createTestingModule` 只砌得到自己列嗰幾個 provider,驗唔到 `IntegrationModule` 有冇漏 export) |
| 2 | 真 HTTP `PATCH /fulfilment/requests/…/assign` → **503**,message **逐字**同重構前一致:`Microsoft Graph is unavailable — could not look up the target user. Please retry.` |
| 3 | log 出自 **`[GraphLicenseProvider]`** 而唔係 `[AssignService]` ⇒ 真係經咗 seam;錯誤內容係真 **`AADSTS900021`**(dummy tenant GUID 被 Microsoft 拒絕)⇒ 真係打咗出去,唔係 mock |
| 4 | **零副作用**:`2 \| 6049 \| 18 \| 16` 前後一模一樣(ASSIGNED line items / ledger assigned 總和 / RequestEvent / AuditLog) |
| 5 | `SYNC_SWEEP_ENABLED=false` 生效 —— log **零 sweep 活動**。唔關佢就會每 10 分鐘打真 Graph **兼寫 `azureSyncedAt`** |

#### 🚧 驗唔到嘅(明寫,唔當 pass)

**assign 成功路徑。** 要真 Graph 憑證,而跑得通就會**真派一個 licence 畀一個真人** —— W36 用同一個理由拒絕過(gate 一有 bug 就真嘢出街)。W38 唔開呢個先例。

**點解可以收貨**:呢條路徑嘅回歸保護喺 `assign.service.spec` 52 條 test 入面,而 **G2 證咗嗰 52 條一條都冇改過**。live 補嘅係 test 覆蓋唔到嘅嗰兩樣 —— DI graph 同真 HTTP 邊界 —— 兩樣都驗到咗。

---

## Retro

### 做啱咗嘅

**① 唔 mock provider,改為 wire 真 provider 包住既有 mock。** 呢個決定令 G2 由「勉強達成」變成 `16 加 / 0 刪`,而且**救返兩條 BUG-002 regression 嘅意義**。當時嘅誘惑係「改 33 個引用,快手」——結果會係兩條 test 照樣綠,但已經冇再測緊當初要佢測嗰樣嘢。

**② 三個 OQ 落手前問。** 全部係查 code 先浮出嚟,ADR 寫嗰陣冇。特別係 OQ-2:**若果照 D2 個表做落去,W37 一日之前先做嘅嘢就會被靜靜推翻。**

**③ G5 fails-before。** 冇佢,「8 條 boundary test 全綠」同「8 條 test 乜都冇鎖住」外觀一模一樣。

**④ 唔幫庚預先揀。** 非 `assigned` outcome 寫 fail-loud 而唔係「順手處理埋」。replay 語意係真決策,埋喺一個今日 unreachable 嘅分支 = 將來冇人記得有得揀過。

### 學到 / 下次注意

**① `graph.service.ts` 「一行冇郁」係整個 phase 最抵嗰條 acceptance。** 佢令好幾個「順手優化」嘅衝動(清走重複 `findUser`、統一 error 處理)自動出局 —— 唔使每次都重新辯論。

**② live 驗證前必查 process ancestry。** AP-11 已經係第二次喺同一部機出現(W36 一次、W38 一次)。`preflight.ps1` 個 [3] 段其實已經印咗線索(3100 個 pid **唔喺**本項目名單),但要特登去對先睇得出。

**③ 一個未解嘅張力**:本 worktree 冇 `.env` ⇒ 每次 live 驗證都要手砌 6 個 placeholder env。今次可以接受(唯讀路徑),但下個 phase 若要驗**寫入**路徑,應該學 W36 起 scratch DB,唔好對住 dev DB 玩。

### anti-patterns 自檢

| AP | 判定 |
|---|---|
| **AP-1 假驗收** | ✅ 有真行 HTTP + 真 boot,唔淨係睇 test 綠 |
| **AP-2 mock 當 real** | ✅ live 段落明寫「Graph 憑證係 placeholder」;成功路徑**明標未驗** |
| **AP-3 stale 數字** | ✅ 順帶捉到 ADR-0017 Consequences 一句因 OQ-3 而 stale,已標 |
| **AP-4 silent scope drift** | ✅ 兩處偏離全部入 plan §7 changelog(D1 error 契約 / D2 G3 修正) |
| **AP-5 over-engineering** | ✅ 介面由 5 個方法收到 3 個;`checkSync`/`listUsersBySku` 零 caller 唔加 |
| **AP-6 fallback 假象** | N/A |
| **AP-7 stale running process** | 🔴 **中過招** —— 見上,已即場改用 3200 |
| **AP-8 SKU 靠名** | ✅ 介面 `skuId` GUID;`TenantSkuSeats` 註明「Never the part number」 |
| **AP-9 跳 sync gate** | ✅ gate 位置冇郁,live 個 503 正是過咗 gate 之後先出 |
| **AP-10 對帳撈錯數字** | ✅ `reconcile` 零改動 + boundary test 鎖死 |
| **AP-11 驗錯 checkout** | 🔴 **中過招**,已修正(呢條 AP 就係 W36 寫落嚟嘅,今次真係捉到嘢) |
| **AP-12 冇驗「唔應該發生嘅嘢」** | ✅ 零副作用四個 count + log 零 sweep + boundary 負面斷言 |

### 🚧 Carry-over

1. **BUG-004**(H4 log 洩 UPN)—— 已登 BACKLOG A 區,W38 刻意唔修
2. **assign 成功路徑 live 未驗** —— 隨真憑證環境(`DEPLOY-harden`)
3. **🔴 留畀庚**:Graph 講 `assigned` / n8n 講 `already_assigned` 嘅 replay 不對稱,已寫入 ADR-0017 補註 + provider doc comment + `assign.service` fail-loud 三處

**Status**:✅ **closed**。G1–G8 全部達標(G8 部分,邊界明寫)。**下一個 = 庚**(`N8nLicenseProvider`)。

---
