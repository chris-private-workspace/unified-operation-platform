---
change_id: CH-014
title: "SN onboarding fixture ops script — 經 Service Catalog API 造真 REQ/RITM/catalog task"
status: approved          # draft | proposed | approved | active | done | cancelled
created: 2026-08-01
target_completion: 2026-08-01(已交付)
affects_components:
  - apps/api/scripts/seed-servicenow-onboarding.ts(新增 — 唯一實質新 code)
  - apps/api/package.json(+1 npm script;順帶修 intake:from-sn 嘅 TLS)
spec_refs:
  - ADR-0018 D3(平台只認「RITM 底下剛好一個 active catalog task」)
  - ADR-0021 D6 / CH-013(import UI + ServiceNowLookupService 單一 walk)
  - ADR-0013 D3(connector config DB-then-env precedence)
  - BUG-010(本 change 途中撞到嘅 sc_request insert 403)
---

# CH-014 — SN onboarding fixture ops script

> **Spec version**:1.0
> **Owner**:AI(執行)· 決策 = Chris Lai
> **Status**:**`approved`** —— 2026-08-01 Chris 逐步授權(路線、payload、真 POST 各一次明示批准)
>
> 🔴 **R1 deviation,如實記錄**:本 change 嘅 code 先於 spec。工作由「可唔可以幫我建 SN onboarding request」嘅探索開始,路線同可行性喺探索途中先確定(直接 insert 死咗、改走 catalog API),spec 喺交付後補寫。冇 pre-doc gate,係 PROCESS R1 嘅例外實例 —— 見 §7。

## 1. Context (Why)

CH-013 交付咗「Settings › Integrations › Import request from ServiceNow」,`intake-from-servicenow.ts` 亦可以由 REQ number 匯入。**兩者都假設有一張合用嘅 REQ 存在。**

而 ADR-0018 D3 要求嚴格:RITM 底下**剛好一個** active catalog task,0 或 2+ 一律 fail closed。真 instance 上呢個條件唔係穩定滿足 —— `--list` 經常見到 0 或 2+(memory 記過 RITM0047290 就有兩張)。⇒ 測試要靠彩數等一張啱嘅單出現。

本 change 令佢變成可以隨時造一張。

## 2. Scope

### 2.1 In

1. 新 ops script `seed-servicenow-onboarding.ts`:經 Service Catalog API 落單,建 REQ + RITM + catalog task
2. `--shape=single`(1 REQ + 1 RITM + 1 task)/ `--shape=multi`(1 REQ + N RITM,行 cart)
3. **dry-run 係 default**,`--post` 先寫
4. 落單後用**真** `ServiceNowLookupService` 驗返「import 側睇到乜」
5. 落單後 PATCH RITM 加 `[UOP TEST]` 標題前綴 + work note
6. npm script `seed:sn-onboarding`(內置 `--use-system-ca`)
7. 順帶:`intake:from-sn` 加同一個 flag(佢當時因為 TLS 攔截而跑唔到)

### 2.2 Out(明確唔做)

- **唔修 BUG-010**(`DirectServiceNowProvider` 403)—— 屬 ADR-0008 D3 已 lock 嘅決定,H1,要另行 ADR
- **唔碰 production code path** —— script 走自己嘅 `fetch` 打 `/api/sn_sc`,唔為咗一個 test-data 工具去擴 `ServiceNowService` 嘅 public 介面
- **唔做 edge-case fixture**(0 task / 2 task)—— Chris 明示唔要
- **唔自動清 SN cart** —— 見 D3
- **唔 cancel 已建嘅單** —— SN 冇 delete,cancel 屬人手操作

## 3. 設計決定

### D1 — 走 Service Catalog API,唔走 Table API insert

原設計係手砌三次 `POST /api/now/table/...`。實測即刻死:`sc_request` insert 403,連只有一個 field 嘅 payload 都 403 ⇒ table-level(詳見 BUG-010)。

改走 `order_now` / `add_to_cart`+`submit_order` 之後**反而更好**:catalog workflow 自己行,所以 **catalog task 係 ServiceNow 真起嘅**,同真單同一形狀 —— 手砌 insert 永遠做唔到呢步。

### D2 — variable 值抄真單,唔自己作

4 個 mandatory variable 全部收喺 variable set 入面,item 層 API 只見到 3 個 container,唔展開就 400 `Mandatory Variables are required`。值由真 RITM(RITM0047329-31 / 0046765-66)讀返:

| variable | 值 | 備註 |
|---|---|---|
| `requester_name` / `target_user` | sys_user sys_id | 用 integration account(見 D4) |
| `target_users_email` | email | 見 D4 |
| `target_user_opcos` / `opcos` | `rhk` / `rapo` | 小寫 opco code,choice_table `u_opcos_approval_matrix.u_opcos` |
| `action_type` | `new_license_assignment` | 另一個值係 `license_modification` |
| `license_type` | `Microsoft 365 E3` 等 | **48 個 choice** |

🔴 `license_type` 值得單獨記住:`intake-from-servicenow.ts:283` 寫「licence code 無法從 SN 推導」係針對 RITM **title** 講,而 `license_type` 係結構化答案 —— **佢先係將來做 SN↔平台 SKU 對照嘅基礎**。但注意 2025 年嘅單用 `"e3"` 而該 choice 已 **inactive**(現行 `"Microsoft 365 E3"`),對照要食得落新舊兩種。

### D3 — cart 非空即停,唔自動清

`multi` 要一張 REQ 多個 RITM,只能行 cart。而 **cart 屬於帳號唔屬於今次執行**,`submit_order` 會提交成個 cart。

⇒ 提交前檢查 cart,非空就 **throw 唔繼續**。唔自動清:清咗就係刪咗另一個 process(例如 n8n)嘅 pending order,而且無聲無息。

### D4 — target 用 integration account + 唔存在嘅 email

`target_user` = integration account 自己。指向真同事會把佢個名寫落一張佢冇提出過嘅 request(H4),而且**若平台跟住 fulfil,就會真派一個 license seat 畀一個真人**。

`target_users_email` 預設 `uop.test@rapo.com.hk` —— **Entra 冇呢個人**,所以 `findUser` 返 null,平台停喺 Phase 1 sync gate。呢個唔係將就,係**刻意嘅安全網**:fixture 可以行到 import 同大部分流程,但踩唔到真 assign。

要測真 assign 就 `--email=<真 mailbox>`,script 會喺輸出用 🔴 標出嚟。

### D5 — 標記 `[UOP TEST]`

catalog 決定 RITM title,所以唔似手砌 insert 可以一開始就設 —— 只能落單後 PATCH。work note 載說明,**title 前綴先係 list view 入面唯一睇得到嘅嘢**,而 list view 正正就係有人會把佢當成真單嘅地方。

`sc_req_item` PATCH 得(200)雖然 `sc_request` INSERT 唔得(403)—— insert 同 update 兩套 ACL。

## 4. Acceptance criteria

| # | 判準 | 狀態 | 依據 |
|---|---|:---:|---|
| A1 | dry-run 唔寫任何嘢,印出完整 payload | ✅ | 跑咗 3 次 dry-run,SN 側零記錄 |
| A2 | `--shape=single` 建到 1 REQ + 1 RITM + 1 active task | ✅ | **REQ0044067 / RITM0047363**,1 active task |
| A3 | `--shape=multi` 建到 1 REQ + 2 RITM,每個 1 active task | ✅ | **REQ0044068 / RITM0047364 + RITM0047365**,各 1 |
| A4 | importable 判斷由**真** `ServiceNowLookupService` 出,唔係 script 自稱 | ✅ | script 直接 `new ServiceNowLookupService(snow)` — 同 import endpoint 同一個 class(ADR-0021 D6) |
| A5 | 3 張 RITM 都有 `[UOP TEST]` 標記 | ✅ | work_notes + short_description PATCH 各 200 |
| A6 | cart 非空會停 | ❌ 未驗 | 邏輯已寫(D3),但未製造過非空 cart 去撞佢 |
| A7 | 自動標記 block 喺 `--post` 真跑一次 | ❌ 未驗 | 該 block 係**後加**;同樣 PATCH 已對同樣 3 張 RITM 實跑成功(200),但 repo script 內嗰段只過咗 type-check + dry-run。**唔想淨係為驗證再建一張真單** |
| A8 | 匯入平台行到尾(REQ0044067 → 平台 request) | ✅ | `GET /requests/servicenow-lookup?req=REQ0044067` → `importable:true` · `POST /requests/import-from-servicenow` → **HTTP 201**,request `cmsa93hun0001…` / line item `RITM0047363` / stage `REQUESTED` / **`azureSyncedAt: null`**(D4 安全網生效,唔會真派 seat) |

> A7 特別註明:「同一個 PATCH 喺 scratchpad 跑得成功」**唔等於**「repo script 嗰段跑得成功」。下次任何人跑 `--post` 就會順帶驗到,到時 tick。

## 5. Open questions

| # | 問題 | 狀態 |
|---|---|---|
| OQ-1 | 平台側 `license_type` ↔ skuPartNumber 對照表要唔要做? | **未答** — 本 change 只發現咗 SN 側有結構化值,冇做對照 |
| OQ-2 | 已建嘅 3 張測試單幾時 cancel? | **未答** — SN 刪唔到,只能 cancel;而家標住 `[UOP TEST]` |

## 6. Risk

| 風險 | 緩解 |
|---|---|
| 有人誤把測試單當真單處理 | `[UOP TEST]` 前綴(list view 睇到)+ work note |
| `--email` 指向真人 → 真派 license seat | default 係 Entra 唔存在嘅地址;override 時輸出用 🔴 標明 |
| `submit_order` 掃埋人哋 cart | D3 非空即停 |
| 建咗就刪唔到 | dry-run 做 default;每次 `--post` 都要明示 |

## 7. Spec Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-08-01 | Initial spec,status 直接 `approved` | 🔴 **R1 deviation** — code 先於 doc。工作由探索開始(「可唔可以幫我建 SN request」),而路線本身要靠實測先定得到:原定 Table API insert 喺實測時死咗,改走 catalog API。Chris 喺過程中逐步明示授權(揀 repo script 路線 → 批准 payload → 批准真 POST → 批准補 doc)。如實記錄而唔補鑊成「事前有 spec」 | Chris |
| 2026-08-01 | D1 由 Table API insert 改為 Service Catalog API | 實測 403 table-level(BUG-010) | Chris |
