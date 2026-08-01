# CH-014 — Progress

## Day 1 — 2026-08-01

### 起點

Chris 問「可唔可以幫我建立一些 ServiceNow 的 user onboarding request 和相關的 requested item、catalog task item」。

冇 pre-doc(R1 deviation,spec §7 已記錄)。原因係路線本身要靠實測先定得到 —— 落 code 之前根本唔知道直接 insert 係死嘅。

### 過程

**1. 探索(全部 read-only)**

第一次連 SN 就 `fetch failed`。根因 `SELF_SIGNED_CERT_IN_CHAIN`(公司 TLS 攔截),`node --use-system-ca` 解決。順帶發現 **`npm run intake:from-sn` 當時亦跑唔到**(同一原因),本 change 一併修。

讀真單形狀,拎到幾件關鍵嘢:

- `User Onboarding` 係 **order guide**,一張 REQ 底下 spawn 多個 RITM,每個 RITM 一張 SCTASK
- 真單 `sys_created_by` = n8n 嘅 service account,而 SCTASK 由另一個 account 建 ⇒ task 唔係跟住 RITM insert 自動出
- 真 RITM/SCTASK 都填住 `assignment_group`(`Desktop Support`、`RAPO SAAC Domain`)⇒ fixture 唔可以照抄,否則假單跌入真團隊 queue

**2. 原設計死咗**

原本手砌三次 Table API insert。dry-run 過咗,`--post` 第一步就 403。再試最小 payload(淨係 `short_description`)一樣 403 ⇒ **table level,唔係 field**。查 role:71 個,含 `sn_request_write` ⇒ 唔係單純冇權,係 SN 唔畀 insert REQ。

呢個發現超出 fixture 本身 —— `DirectServiceNowProvider`(ADR-0008 乙)第一步就係同一個 call。開咗 **BUG-010**。

**3. 改走 Service Catalog API**

Chris 揀咗呢條路(明示知悉會行真 workflow)。

`order_now` 空 variables → 400 `Mandatory Variables are required`,但唔講邊個。item 層 API 只見到 3 個 container —— 必填嘅收喺 variable set。經 `io_set_item` → `item_option_new` 展開,搵到 4 個 mandatory。再經 `sc_item_option_mtom` 讀真單答案,拎到實際值(`rhk` / `new_license_assignment` / `Microsoft 365 E3`)。

**4. 落單**

- `--shape=single` → **REQ0044067 / RITM0047363**,1 active task ✅
- `--shape=multi` → **REQ0044068 / RITM0047364 + RITM0047365**,各 1 active task ✅

importable 判斷由真 `ServiceNowLookupService` 出(import endpoint 同一個 class)。

**5. 補鑊:標記**

落完單先意識到走 catalog API 之後,原本嘅 `[UOP TEST]` 標記冇咗 —— catalog 決定 RITM title,而我冇再 PATCH。即係嗰兩張單喺 SN 睇落同真單一模一樣。

即刻補:3 張 RITM 都加咗 work note + 標題前綴(PATCH 各 200),並把呢步加返落 script。

**6. 端到端匯入驗證**

Stack 已經健康跑緊(preflight:`:3100/docs/api` 同 `:5173/` 都真 200,進程 11 個喺健康範圍,
pid=36384 路徑確認係本 checkout)⇒ 冇無謂重啟。

- `GET /requests/servicenow-lookup?req=REQ0044067` → `importable:true`,title 帶 `[UOP TEST]`(順帶證實標記真係寫入咗 SN)
- `POST /requests/import-from-servicenow` → **HTTP 201**,平台 request `cmsa93hun0001…`,line item 掛住 `RITM0047363`,stage `REQUESTED`
- **`azureSyncedAt: null`** —— D4 嗰個安全網照計劃生效

⇒ SN 落單 → lookup → import → 平台 request,成條鏈通。

### 🔴 未驗嘅嘢(唔 tick)

- **A7 / V7** — 後加嘅標記 block 未經 `--post` 真跑。同一個 PATCH 喺 scratchpad 對同樣 3 張 RITM 跑成功(200),但 repo script 嗰段只過咗 type-check + dry-run。**兩者唔係同一件事**,唔混為一談。
- **A6 / V6** — cart 非空即停,邏輯寫咗但未製造非空 cart 撞過。
- **A8 / V8** — 未經 import UI 真匯入。

### 教訓

1. **「有 write role」同「寫得入」係兩件事。** 71 個 role 包住 `sn_request_write`,一樣 insert 唔到 —— insert / update 係分開嘅 ACL(同一帳號 `sc_req_item` PATCH 得 200)。
2. **換咗實作路線,要重新數一次原本嘅保護仲喺唔喺。** 手砌 insert 版本嘅 `[UOP TEST]` 標記係喺 payload 入面,換成 catalog API 之後嗰個保護靜靜消失,而兩個版本嘅「成功」輸出睇落一樣。
3. **`license_type` 有 48 個結構化 choice** —— 一直以為 SN 側冇 SKU 資訊(`intake-from-servicenow.ts:283` 嗰句係針對 RITM title 講),原來有。將來做對照表要由呢度入手,並且要食得落已 inactive 嘅舊值(`"e3"`)。
