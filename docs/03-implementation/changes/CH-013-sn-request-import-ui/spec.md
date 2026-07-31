---
change_id: CH-013
title: "由 ServiceNow REQ 號碼喺 UI 導入測試 / 補救用嘅 onboarding request"
status: done            # draft | proposed | approved | active | done | cancelled
created: 2026-07-31
target_completion: 2026-08-04（估算 1.5–2 日,見 §5）
adr: ADR-0021（Accepted 2026-07-31）
affects_components:
  - apps/api/src/fulfilment（新 endpoint + SN lookup service）
  - apps/web（Settings 新 card）
  - apps/api/src/integration/servicenow（唯讀 lookup,無改動預期）
spec_refs:
  - ADR-0008 D3（intake 契約 LOCKED）
  - ADR-0017 D4 / OQ-3（intake adapter · 一個 caller 一個信任邊界）
  - ADR-0018 D3（catalog task 必須恰好一個 active）
  - CLAUDE.md §5.1 H1（新 API surface）· §5.3 H3（scope）· §5.4 H4（secret）
---

# CH-013 — 由 ServiceNow REQ 號碼喺 UI 導入 onboarding request

> **Spec version**:1.0(initial)
> **Owner**:AI(draft)
> **Approved by**:**Chris Lai(2026-07-31)** —— 三項 gate 全部拍板,見 §6.1

---

## ✅ 0. 開工 gate（全部已清 2026-07-31）

呢個 CH 觸發過一條 hard constraint,而家已經處理妥:

**H1 — 新 API surface + 改動 intake 嘅信任邊界。**

現時 `POST /requests/intake` 同 `POST /requests/intake/n8n` **兩條都係** `@Public()` + `IntakeKeyGuard`,即係話 `IntakeService` 目前**只有一個入口、一個 caller、一個 m2m shared secret**。ADR-0017 D4 OQ-3 係明文咁揀嘅:「one caller, one trust boundary, one secret to rotate」(逐字記錄喺 `intake.controller.ts:50-52`)。

而前端**唔可以**持有 `INTAKE_API_KEY`(H4:嗰個 key 一旦落到 browser bundle 就等於公開)。所以呢個功能**無論點做都要新開一條 user-authenticated 路入 `IntakeService`** —— 亦即 OQ-3 嗰個「一個 caller」嘅前提由呢個 CH 落地起唔再成立。

⇒ **Chris 2026-07-31 approve,`ADR-0021` 已寫並 Accepted。** 三項拍板見 §6.1。

🔴 **ADR 立咗但仍然要守嘅硬邊界**(實作時 diff 必須為 0,ADR-0021 D2):
`intake.service.ts` · `dto/n8n-intake.dto.ts` · `intake-key.guard.ts` · 既有兩條 intake route 嘅 guard / DTO / 行為。

---

## 1. Context (Why)

n8n UAT 環境一直連唔上,所以**冇任何嘢**會推 onboarding request 入平台。呢個令下游全部驗唔到:assign、預算 gate、ticket 寫回、drift —— 全部要有真單先行得。

W41 之後開咗一個過渡工具 `apps/api/scripts/intake-from-servicenow.ts`(PR #61,已 merged),由真 ServiceNow REQ 號碼反查 RITM 再推入 intake。佢**行得通**,而且已經用 `REQ0044038` live 驗證咗成條 HOLD 路徑(真 Graph findUser → 預算 gate → 真 SN task `state 1→2`)。

Chris 嘅要求(逐字):

> 「只需要在dev serviceNow環境上建立好一些request…之後就取得這些request 號碼,再在UOP有個簡單功能提供給上傳這些serviceNow request數據」
>
> 「我建議是只提供request號碼就可以自動抓取其他的id 等等」

所以要做嘅係:**把嗰個 script 嘅能力搬上 UI**,等測試唔使開 terminal、唔使有人幫手跑 npm script。

### 1.1 定位：長期 admin 補救工具（Chris 2026-07-31 拍板）

**唔係「n8n 通咗就刪」嘅臨時嘢。** 就算 n8n 接通,「一張單 n8n 漏咗 / 推失敗 / 要重推」呢個補救場景仍然長期存在,而今日嘅補救手段係叫人開 terminal 跑 npm script。

呢個定位係整件事嘅前提:**如果佢係即棄品,理性答案應該係唔做 UI、繼續用 script** —— 唔值得為一個會死嘅功能去改 intake 嘅信任邊界 + 寫一份 ADR。ADR-0021 嘅 Option D(「唔做 UI」)正正係**被定位 reject,而唔係被質素 reject**。

⇒ 所以呢個 UI **長期留喺 Settings**,唔設退場條件。

---

## 2. Scope (What)

### 2.1 Behavior Change

- **Before**:要把一張真 SN 單變成平台 request,唯一途徑係喺 repo 入面跑
  `npm run intake:from-sn -w @uop/api -- --req=... --sku=... --upn=... --post`。
  即係要有 checkout、有 `.env`(含真憑證)、識 CLI。
- **After**:有權限嘅用戶喺 Settings 入一個 REQ 號碼 → 平台反查 → 顯示 preview(有幾多張 RITM、每張幾多個 active catalog task、邊啲會 fail)→ 逐張揀 SKU + 填 target UPN → 確認導入。

### 2.2 In Scope

**後端**

1. **新 endpoint ①(唯讀 preview)**
   `GET /requests/servicenow-lookup?req=REQ0044038`
   - JWT + `@Roles`(角色見 §2.4)
   - 反查 `sc_request` → `sc_req_item` → 每張 RITM 數 `sc_task^active=true`
   - 回傳每張 RITM:`number` / `sysId` / `title` / `activeTaskCount` / **可否導入**
   - **零寫入**。任何時候重複叫都安全

2. **新 endpoint ②(導入)**
   `POST /requests/import-from-servicenow`
   - JWT + `@Roles`,body 帶 REQ number + 每張選中 RITM 嘅 `skuCatalogId` + target UPN
   - server side 再反查一次(唔信 client 傳嘅 sysId —— 見 §4 R2)
   - 組成 canonical intake payload,**直接 call `IntakeService`**(唔經 HTTP、唔經 m2m key)
   - 沿用既有 idempotency(REQ number 做 key)⇒ 重複導入唔會開多張

3. **一個共用 lookup service**,把 script 入面嗰段反查邏輯搬入 `src/fulfilment/`(或 `src/integration/servicenow/`),等 script 同 endpoint **共用同一份**,唔會各寫一次然後 drift

**前端**

4. **Settings 新增一張 card**「Import request from ServiceNow」,兩步:
   - **步驟一**:入 REQ number → 撳 Look up → 出 RITM 表(number / title / active task 數 / 狀態 badge)
   - **步驟二**:逐張 RITM 揀 SKU(Select,由既有 catalog 拉)+ 填 target UPN → 撳 Import
   - 0 或 2+ active task 嗰啲 RITM **明確標示唔可導入**並講原因(ADR-0018 D3)

5. 導入成功 → toast + 連去新建嘅 request detail

**文件**

6. `docs/05-usage/` 加一段:呢個工具幾時用、點解 SKU 要人手揀、同 n8n 正路嘅關係

### 2.3 Out of Scope（explicit）

- ❌ **CSV / 檔案上傳** —— Chris 明確講「只提供 request 號碼」,所以係一個輸入框,唔係 file upload。批量(多個 REQ)**唔做**
- ❌ **自動推導 licence code** —— 見 §4 R1,冇機械對應,一定人手揀
- ❌ **建新 SN 單** —— 已經有 `/requests/new`(W25),兩件事唔可以撈埋
- ❌ **改任何 intake 契約** —— canonical DTO 一個字都唔改(ADR-0008 D3 LOCKED)
- ❌ **改 `IntakeService` 內部邏輯** —— 新路徑只係多一個 caller,唔改佢做咩
- ❌ **碰 n8n 路徑** —— `/requests/intake` 同 `/requests/intake/n8n` 行為、guard、DTO 全部零改動
- ❌ **推 stage / 觸發 assign** —— 導入完就停,之後照行既有 UI 流程
- ❌ **自動開 sync gate** —— `azureSyncedAt` 維持 null,由 ADR-0015 sweep 或人手 break-glass 處理

### 2.4 角色範圍：`ADMIN` only（Chris 2026-07-31 拍板 = 選項 A）

兩條 endpoint 都係 `@Roles(ADMIN)`。

理由:① 佢係 ops / 補救工具,會憑一個號碼喺平台生成真 request,而且反查會打真 SN ② fail-safe —— 日後放寬易過收窄 ③ **結構理由**:OpCo 係由 SN 個 Job Function 推導,要**反查完先知**,即係「你有冇權導呢張單」要打完 SN 先答得到 —— 呢種「先做外部呼叫先答到授權」嘅 gate 形狀本身就易出錯。

🔴 放寬到 `OPCO_IT` 屬**重開 ADR-0021 D3**,唔可以喺實作裡面順手加。

---

## 3. Acceptance Criteria

### 3.1 後端

- [x] `GET /requests/servicenow-lookup?req=<REQ>` 未帶 JWT → **401**(唔可以係 `@Public()`)— live:`AUTH_DEV_BYPASS=false` 另起 instance,**control** 係 `/me` 亦 401
- [x] 帶非授權角色 JWT → **403** — live:`AUTH_DEV_USER_EMAIL=opco.it.rhk@…`,**control** 係 `/me` 真返 `role: OPCO_IT`;同刻 ADMIN 側 200/201(A-B 對照)
- [x] 有效 REQ → 200,列齊全部 RITM,`activeTaskCount` 同真 SN 一致 — 見 §3.3
- [x] 唔存在 / 見唔到嘅 REQ → **404** + message 提 row-level ACL — unit test assert `/ACL/i`
- [x] lookup **零寫入** — unit assert `intake` / `audit` / `$transaction` 全 not-called
- [x] `POST /requests/import-from-servicenow` 成功 → 201,shape 同既有 intake 一致、**`azureSyncedAt` null** — live DB 核。⚠️ **OpCo 唔係「由 Job Function 解析」**,係 operator 揀(deviation ②,§7)
- [x] **同一個 REQ 導入兩次 → 唔會開第二張** — live DB:request 1 / line item 1 / **audit 1**(API 同 UI 兩條路各驗一次)
- [x] client 傳唔屬該 REQ 嘅 RITM → **400 且零寫入** — 比 spec 更強:body **根本冇 `ritmSysId` 欄位**,結構上傳唔到
- [x] 揀咗 `activeTaskCount ≠ 1` 嘅 RITM → **400** + 原因 — unit test assert `/nothing to close/i`
- [x] **`INTAKE_API_KEY` 唔會出現喺任何 response / log / bundle** — service/controller 零引用、route 唔行 `IntakeKeyGuard`;另有 test assert view 唔洩漏任何 raw SN 欄位
- [x] 既有兩條 intake route 嘅 guard / DTO / 行為 **diff = 0** — `git diff --stat origin/main` 對**六個**檔,A 組同 B 組收工各驗一次,兩次全空
- [x] api test:lookup + import 兩組(SN 全 mock);既有全綠、數字不降 — **661 → 685 / 61 suites**,零既有 assertion 要改

### 3.2 前端

- [x] Settings 見到新 card;非授權角色**完全睇唔到** — test assert `container` 係 empty DOM;live 見到 card 喺 Integrations tab
- [x] 入 REQ → RITM 表出到,0 / 2+ active task 有明確標示 + 原因 — live `REQ0044059` 三張 RITM 顯示 `0 / 1 / 0`,兩張 blocked 各有原因同 AlertTriangle
- [x] 未揀 SKU / 未填 UPN(**+ 未揀 OpCo**)→ import 掣 disabled — live 見到 `Import 0 items` disabled → 三項齊備後變 `Import 1 item` enabled
- [x] 導入成功 → toast + 去到 request detail — live:toast `"REQ0044061 imported. / Open request"` → 撳 → URL 變 `/requests/cms8s936y…` → heading `Request detail`
- [x] 導入失敗 → 錯誤照原文顯示,唔可以吞 — 順帶修咗 `apiGet`(四個 helper 中唯一唔 surface server `message` 嗰個)
- [x] **H6**:token-only、**Settings 頁維持一個 primary**、lucide-only、**light + dark 都行過** — DS-1~DS-12 逐條答(progress Day 3);light/dark 各截一張全頁圖 + computed token 值。⚠️ **「零新 primitive」呢一項有偏離**:E5 擴咗 `Toast`(加 optional action)—— owner approve + 走 §5 合法路徑 + 登記 `design-system.md §2`(deviation ③,§7)
- [x] web test 數字不降 — **196 → 206 / 25 files**

### 3.3 Live 驗證（真 `ricohapdev`）

- [x] 用一張**未用過**嘅真 REQ 行完整流程 → 平台真係出到 request — **`REQ0044059` 全程行 UI**。DB:OpCo RHK · 當刻 `azureSyncedAt` null · line item **只有唯一 importable 嗰張**,兩張 blocked 嘅冇入
- [x] 同一張再導入一次 → 唔會出第二張 — request 1 / line item 1 / **audit 仍然 1**(冇造假紀錄)
- [x] script dry run 同 UI **逐個字一致** — 🔴 呢條差啲被誤讀成 bug:UI 顯示 `0/1/0` 而我幾個鐘前跑 `--list` 時三張都係 `1`。**即時**重跑 → 一樣 `0/1/0` ⇒ 係 SN 嗰邊期間 close 咗兩張 task。**教訓:對照要同一時間點,攞舊輸出去對幾乎一定冤枉自己**

---

## 4. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| **R1** | **licence code 冇得自動推導** —— SN 個 RITM 標題(「Create a new O365 user license maintenance request」)同平台 `skuPartNumber`(`SPE_E5`)之間**冇任何機械對應**。真人好自然會想「幫我自動填」 | **High**(一定會有人問) | Med(揀錯 SKU = 錯 ledger / 錯 assign) | UI **強制人手揀**,唔提供「猜」。🔴 **絕不可以**把 SN 標籤塞入 `businessAlias` 嚟造對應 —— 嗰個 column 屬 ADR-0004 allocation import,污染咗會連 import 一齊搞爛 |
| **R2** | client 傳嚟嘅 `ritmSysId` 唔可信(改個 request body 就可以叫平台 mirror 一張唔相干嘅 SN 單) | Med | Med | server 自己由 REQ number 反查,**只接受屬於該 REQ 嘅 sysId**;唔夾就 400 |
| **R3** | 有人用佢喺**生產**環境憑空生成 request(佢設計上係測試 / 補救工具) | Med | Med-High | ① 收窄角色(§2.4 選 A)② 每次導入寫 `AuditLog`,action 獨立(例如 `request.imported_from_servicenow`),等「呢張單點嚟」查得返 ③ UI 文案寫明用途 |
| **R4** | 反查打真 SN,一個 REQ 帶 N 張 RITM 就係 **1 + N 個 GET**;有人狂撳會嘈到 SN | Low | Low | preview 唔自動跑(要撳掣);唔加 retry;唔做批量 |
| **R5** | **呢個 CH 令 `IntakeService` 由「一個 caller」變「兩個 caller」**,而嗰個「一個」係 ADR-0017 OQ-3 刻意揀嘅 | **確定會發生** | Med | 寫 ADR 講清楚:m2m secret 邊界**冇被削弱**(新路行 JWT + role,唔碰嗰條 key),被改嘅係「入口唯一性」。並喺 ADR 明文寫死:canonical DTO 唔改、n8n 路徑零改動 |
| **R6** | 導入咗一堆測試 request 之後冇人清,污染 dev / UAT 數據 | Med | Low | 用既有 idempotency(同一 REQ 只會有一張);`docs/05-usage/` 寫低清理方法 |

---

## 5. Effort Estimate

**1.5 – 2 日**（ADR 討論唔計）

| 部分 | 估算 |
|---|---|
| ADR 撰寫 + 討論 | 唔計(gate,見 §6) |
| 後端 lookup service（由 script 抽出共用) | 0.25 日 |
| 兩條 endpoint + DTO + guard + audit | 0.5 日 |
| api test（SN mock) | 0.25 日 |
| 前端 card 兩步流程 | 0.5 日 |
| web test + light/dark + `ui-design` 自檢 | 0.25 日 |
| live 驗證 + doc | 0.25 日 |

---

## 6. Dependencies

### 6.1 ✅ Gate ①：H1 approval + ADR（**已清 2026-07-31**）

Chris 2026-07-31 三項拍板:

| # | 決定 | 落喺邊 |
|---|---|---|
| ① | **H1 approved** —— `IntakeService` 可以有第二個 caller(user-authenticated),ADR-0017 D4 OQ-3「一個 caller」前提正式更新;新增兩條 API surface | ADR-0021 D1 / D2 |
| ② | **定位 = 長期 admin 補救工具**(唔係「n8n 通咗就刪」) | ADR-0021 Context / §1.1 |
| ③ | **角色 = `ADMIN` only** | ADR-0021 D3 / §2.4 |

**ADR-0021 已寫並 Accepted**(`docs/adr/0021-user-authenticated-servicenow-request-import.md`;編號經 `git fetch --all` 掃晒所有 remote branch 嘅 `docs/adr/` 確認,`0000`–`0020` 已用)。

### 6.2 ✅ Gate ②：定位確認（**已清**,見 §1.1）

### 6.3 非 blocking

- SKU catalog 要有得揀 —— 已有(`/license/catalog`)
- `ServiceNowService.query` 已足夠,**預期零改動**

---

## 7. Spec Changelog（deviation log）

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-31 | Initial draft(status: proposed) | Chris 要求把 PR #61 個 script 嘅能力搬上 UI | — |
| 2026-07-31 | status → **approved**;§0 / §6.1 / §6.2 gate 標記已清;§1.1 定位、§2.4 角色由「待定」改為決定內容;frontmatter 加 `adr: ADR-0021` + `target_completion` | Chris 三項拍板(H1 approved · 定位 = 長期補救工具 · ADMIN only),ADR-0021 已 Accepted | **Chris Lai** |
| 2026-07-31 | **§2.2 deviation ①** — import body 收 **`skuId`(GUID)**,唔係 §2.2 原寫嘅 `skuCatalogId` | canonical DTO 本身收 `skuId` 而 `IntakeService` 自己 resolve SkuCatalog(唔存在 / inactive → 400)。傳 GUID 即係「**得一個地方**決定 SKU 存唔存在」;傳 `skuCatalogId` 就要多一層自己轉換,等於多一個會同 canonical 判斷唔一致嘅位。亦係 CLAUDE.md §13「SKU 一律 `skuId` GUID」嘅直接落實 | AI(實作發現;非架構改動,唔觸 ADR) |
| 2026-07-31 | **§2.2 deviation ②** — import body **新增必填 `opcoCode`**(spec 完全冇提 OpCo 由邊度嚟) | canonical DTO 要 `opcoCode`,但一張 SN 單唔帶平台嘅 OpCo 概念。n8n 路徑由 Job Function 推導,而**嗰個 Job Function 係 n8n 送嘅**;ops script 一直係 operator 自己指定(`--job-function` 預設 hardcode `'RHK IT'`)⇒「自動推導」對呢條路嚟講係假象,只係換個方式問同一條問題。所以**直接叫 ADMIN 揀 OpCo**。連帶:UI(E 組)要多一個 OpCo 下拉,由既有 `GET /opcos` 拉 | AI(spec gap,實作時發現) |
| 2026-07-31 | **§3.2 deviation ③** — 「**零新 primitive**」呢項有偏離:E5 擴咗 **`Toast`**,加一個 optional `action` | 原本 E5 標咗 🚧 唔做,理由正正係「加 action slot = 改共用 primitive = H6 要先問 owner」。Chris 之後明確話「要」⇒ 走 §5 合法路徑:owner 同意 → 更新 `design-system.md §2`(登記四條約束:text-link 唔係 button · 最多一個 · caller 必須畀更長時間 · action 唔可以係唯一路徑)→ 先落 code。**唔加新 component,只擴既有一個,而且 `action` optional ⇒ 既有 caller 零改動** | **Chris Lai**(2026-07-31 明確 approve) |
| 2026-07-31 | status → **done**;§3 acceptance 三組逐條核完 | 全部項目交付並 live 驗證;無未清 🚧 | AI(收官) |

---

**Lifecycle reminder**:呢份 spec **已 locked**(status=approved)。重大 deviation → §7 changelog,唔可以 silent drift(PROCESS R3)。
**Gate status**:✅ spec approved · ✅ ADR-0021 Accepted ⇒ **可以開始 code**。
🔴 實作期間仍受 ADR-0021 D2 硬邊界約束(見 §0 尾):四項檔案 diff 必須為 0。
