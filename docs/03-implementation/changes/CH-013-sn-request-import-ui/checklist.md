---
change_id: CH-013
spec_ref: ./spec.md
adr_ref: ../../../adr/0021-user-authenticated-servicenow-request-import.md
status: in-progress     # in-progress | done
last_updated: 2026-07-31
---

# CH-013 — Checklist

> 由 `spec.md §3` acceptance criteria 衍生。每 item ≤ 1-2h。
> AI tick 完成嘅 item;tick 唔到嘅喺 `progress.md` Day-N 寫原因(**唔可以刪未勾項**)。

## Gate（開工前）

- [x] Chris approve spec(§6.1 三項拍板)— 2026-07-31
- [x] ADR-0021 寫好 + Accepted + 入 `docs/adr/README.md` index — 2026-07-31
- [x] BACKLOG 同步(R7)— C 區 CH-013 行

## A — 後端：共用 lookup service（ADR-0021 D6）

- [x] A1 抽 `ServiceNowLookupService`:REQ number → `sc_request` → `sc_req_item[]` → 每張數 `sc_task^active=true` — 落 `src/integration/servicenow/`,module provider + export 已佈線
- [x] A2 `intake-from-servicenow.ts` 改為 consume 佢(script 唔刪,同 endpoint 共用同一份,免 drift)— `--req` 同 `--list` 兩個 mode 都行 service;**refactor 前後真 SN 輸出逐個字一致**
- [x] A3 unit test:REQ 查唔到 / RITM 零張 / active task 0·1·2+ 三種 count(**SN 一律 mock**,§3.4)— **11 test**,含 fails-before 實證 + 兩條「零寫入」assertion

## B — 後端：兩條 endpoint（ADR-0021 D1）

- [x] B1 `GET /requests/servicenow-lookup?req=` — JWT + `@Roles(ADMIN)`,回傳 RITM 列表 + `activeTaskCount` + 可否導入 — 新 `ServiceNowImportController`(**唔加落 `IntakeController`**:嗰個成個 controller 都係 `@Public()`+`IntakeKeyGuard`,而且一個 controller 揸兩種信任模型就係「route 落錯邊」嘅溫床)
- [x] B2 404 message 同時提「可能係 row-level ACL」(Table API 分唔開「唔存在」同「見唔到」)
- [x] B3 `POST /requests/import-from-servicenow` — DTO(REQ number + `opcoCode` + `ritmNumber` + **`skuId` GUID** + target UPN)⚠️ **spec 原寫 `skuCatalogId`,實作改用 `skuId` GUID** —— canonical DTO 收 GUID 且 `IntakeService` 自己 resolve,傳 GUID 即係「一個地方決定 SKU 存唔存在」(§7 changelog)
- [x] B4 **server 自己反查**,client 傳嘅 RITM 唔屬該 REQ → 400 零寫入(D5)— body **冇 `ritmSysId` 欄位**,結構上就傳唔到
- [x] B5 揀咗 `activeTaskCount ≠ 1` 嘅 RITM → 400,message 引 `blockedReason`(ADR-0018 D3)
- [x] B6 組 canonical payload → **直接 call `IntakeService`**(唔經 HTTP、唔經 m2m key);`azureSyncedAt` 刻意留空(RISK R3)
- [x] B7 `AuditLog` action `request.imported_from_servicenow` + 新 targetType `Request`(白名單 `[]` event-only);metadata 用**既有** `reason`/`source` key —— **冇擴 `AUDIT_METADATA_KEYS`**(擴佢係 privacy 決定;W36 D6 就係喺呢度中過招,自訂 key 會被 `pickAuditMetadata` 靜靜丟棄)
- [x] B8 兩條 route 都唔接受 `X-Intake-Key` — controller 零 `IntakeKeyGuard` / 零 `@ApiHeader` 引用

## C — 後端：硬邊界驗證（ADR-0021 D2）

- [x] C1 `git diff` 確認以下四項 **diff = 0**:`intake.service.ts` · `dto/n8n-intake.dto.ts` · `intake-key.guard.ts` · 既有兩條 intake route — **實跑 `git diff --stat origin/main` 六項全空**(順帶加驗 `n8n-native-intake.dto.ts` + `intake-adapter.service.ts`)
- [x] C2 既有 intake test 全綠、一條 assertion 都唔使改 — **api 672 passed / 60 suites**(A 組前 661,+11 全部係新檔)

## D — 後端測試

- [x] D1 lookup:**401 · 403 · 200 · 404 四樣全部 live 驗到** —— 用同一份 `dist` 另起 instance 喺 3200 做對照,唔郁 running stack:**403** = `AUTH_DEV_USER_EMAIL=opco.it.rhk@…` 令 `/me` 真返 `role: OPCO_IT`(control),兩條 route 都 `403 Insufficient role`,而同刻 3100 嘅 ADMIN 200/201;**401** = `AUTH_DEV_BYPASS=false`,`/me` 亦 401(control,證明 bypass 真係關咗)⇒ 兩條 route 都 401,即**唔係 `@Public()`**;404 有 unit test
- [x] D2 lookup **零寫入** — unit 層 assert `intake` / `audit` / `$transaction` 全部 not-called
- [x] D3 import:成功 · idempotent(re-import 唔再 audit)· 400×2(B4 / B5,兩者都 assert 零寫入)
- [x] D4 assert **`INTAKE_API_KEY` 唔出現喺任何 response** — service/controller **零引用**該 env、route 唔行 `IntakeKeyGuard`;另有 test assert preview view 唔洩漏任何 raw SN 欄位(`assigned_to` / 內部描述 / sys_id)
- [x] D5 api test 總數不降、lint 0 — **672 → 685 / 61 suites**,`lint exit=0`

## E — 前端（Settings 新 card）

- [x] E1 步驟一:REQ number input + Look up → RITM 表(number / title / active task 數 / badge)— lookup 走 `useMutation` 而唔係 `useQuery`,因為每次都打真 SN(1+N GET),唔應該 mount / focus / reconnect 自動重跑
- [x] E2 步驟二:逐張 RITM 揀 SKU(既有 `select`,由 `/license/catalog` 拉)+ target UPN input + **OpCo 下拉**(deviation ②)
- [x] E3 `activeTaskCount ≠ 1` 嘅行明確標唔可導入 + 原因 — 直接用 server 個 `blockedReason` 原文,**唔另寫一套文案**(免兩處 drift)
- [x] E4 未揀 SKU / 未填 UPN / 未揀 OpCo → import 掣 disabled
- [ ] 🚧 E5 成功 → toast + **連去 request detail**;失敗 → 錯誤原文顯示唔吞 —— **toast ✅ · 錯誤原文 ✅**(順帶修咗 `apiGet`:佢係四個 api helper 入面**唯一**唔 surface server `message` 嗰個,而我個 404「可能係 row-level ACL」正正靠佢傳到 UI;零 test 依賴舊格式);**「連去 detail」冇做** —— `Toast` primitive 得 `message` + `tone`,冇 action slot,加 slot = 改共用 primitive = **H6 要先問 owner**,唔喺呢個 CH 順手做。現時 toast 講明 request number,操作員去 Requests 頁搵得返。<br>⚠️ **toast 本身冇直接影到**:佢 5 秒自動消失,而 MCP 每次 tool round-trip 都追唔切(試咗兩次,`wait_for` 都 timeout)。間接證據充分 —— 表單完全 reset(`reqInput` 清空、結果區消失、Import 掣冇咗)**只可能發生喺 `onSuccess`**(`onError` 只 `setToast` 唔 reset),而 DB 亦證實 request 真係建咗
- [x] E6 非 ADMIN **完全唔 render**(唔係 disable)— test assert `container` 係 empty DOM
- [x] E7 web test 不降 — **196 → 204 / 25 files**

## F — H6 設計自檢

- [x] F1 跑 `.claude/skills/ui-design`,DS-1 ~ DS-12 逐條答 — DS-1/2/3/5/6/7/8/10 全 ✅(見 progress Day 3);DS-4 見 F4
- [x] F2 token-only、零新 primitive(用既有 `select`/`input`/`badge`/`card`/`button`/`toast`)— 零 hex、零新 component
- [x] F3 Settings 頁**維持一個 primary action** — 只有 `Import` 係 primary;`Look up` = secondary、`Cancel` = ghost。⚠️ 順帶記低一個**既有結構性張力**:integrations tab 同時 render `AllocationImportPanel` + 本 panel,而前者喺「揀咗 CSV」之後亦會出一個 primary ⇒ 嗰一刻同一 view 會有兩個。唔屬本 CH 引入,但**本 CH 令佢更易撞到**
- [x] F4 light + dark 都**實際行過** — Playwright MCP 重新連上後真跑:**dark** `html.dark` / body `rgb(8,8,10)` / 文字 `rgb(243,243,245)` / badge 綠 `rgb(67,209,127)` on `rgb(16,36,26)` / primary 掣 `rgb(255,51,85)`(accent 嘅 dark token,唔係 hardcode);**light** 白底深字、badge 紅/綠淺底。**兩張全頁截圖都肉眼核過**,結構、對比、mono、icon 全部一致;切 theme 後表單 state 唔會 reset

## G — Live 驗證（真 `ricohapdev`）

- [x] G1 用一張**未用過**嘅真 REQ 行完整流程 → 平台真出到 request — **`REQ0044059` 全程行 UI**(打字 → Enter 觸發 lookup → 揀 SKU/OpCo/UPN → Import)。DB 證實:request 建咗 · OpCo **RHK** · **`azureSyncedAt` 當刻仍係 null**;line item **只有 `RITM0047352`**,另外兩張 `0 active task` 嘅**冇入** ⇒ UI 過濾邏輯有硬證據
- [x] G2 同一張再導入一次 → 唔會出第二張 — `REQ0044061` POST 兩次:**request 1 行 · line item 1 行 · audit 1 行**(DB 真查)
- [x] G3 UI 顯示嘅 RITM / task 數,同 `npm run intake:from-sn -- --req=<REQ>`(dry run)**逐個字一致** — 🔴 **呢條差啲被誤讀成 bug**:UI 顯示 `0/1/0`,但我幾個鐘前跑 `--list` 時三張都係 `1`。**即時**重跑 script → 同樣 `0/1/0` ⇒ 唔一致嘅原因係**期間 SN 嗰邊真係有人 close 咗兩張 task**,唔係平台有問題。呢個亦順帶證明 UI 同 script 真係食同一份 lookup(D6)
- [x] G4 DB 抽查 audit row:有 `request.imported_from_servicenow`,而且 **payload 冇 UPN** — 兩條(REQ0044059 + REQ0044061)· targetType `Request` · **actor 有記到人**(UI 路徑嘅重點)· metadata `reason`+`source` 完整 · 掃 `metadata`/`before`/`after` 搵 UPN → **0 rows**
- [x] G5 **UI 層 idempotent** — 同一張 REQ 喺 UI 再導入一次:request 仍 1 行 · line item 仍 1 行 · **audit 仍然 2 行**(冇再寫)
- [x] G6 **sync gate 由 sweep 接手(非本 CH 行為,但正好反證 D6)** — 第一次查 `azureSyncedAt` = null,約十分鐘後再查已有值。唔係 import 開嘅,係 **ADR-0015 個 `@Cron` sweep** 向 Graph 證實咗 target user 之後自動開 ⇒ 證明 import 確實**冇**設佢

## H — 文件

- [x] H1 `docs/05-usage/SERVICENOW-REQUEST-IMPORT.md` — 幾時用/唔用 · 兩步操作 · 🔴 licence 唔猜 + 絕不污染 `businessAlias` · sync gate 唔會因導入而開 · idempotent · **🔴 AD 類 RITM 導入得但唔好推去 assign**(ADR-0017 D3,平台分唔出類別 ⇒ 屬操作紀律)· 權限同點解唔開 OPCO_IT · 清理(含「已 assign 過就會整出 drift」)· CLI 等價 · 已知限制
- [x] H2 `intake-from-servicenow.ts` 檔頭註解補一句指向呢個 UI — 並寫明兩者**共用同一份 lookup**(唔會就「導唔導得」答唔同答案)、以及唯一分別:script 行 m2m route 冇 actor 可記,UI 行 user-authenticated route 會記低邊個導入

## Cross-Cutting

- [ ] 每個 commit 對應 `progress.md` Day-N entry(R2)
- [x] ADR written(R5)— ADR-0021
- [ ] BACKLOG 由「blocked on 用戶決定」→ 進行中 → 完成(R7)
- [ ] `progress.md` closeout summary 寫好
- [ ] `progress.md` frontmatter status → `closed`

---

**Lifecycle reminder**:本 checklist 隨 spec §3 衍生。新加 item 必須**先入 spec + §7 changelog**,然後先加落嚟。
