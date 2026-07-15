# ServiceNow 建單合約對齊 Checklist（代表性 → live）

> **用途**:平台目前用**代表性** ServiceNow 建單合約(mirror W24/W25/W26 做法)。要真正喺 production ServiceNow 開到單,以下每項需 **ServiceNow owner / Phase 1 team 確認**。填答後,改動**只落 provider 內 mapping + env**(抽象已隔離),唔郁 domain / 對帳 / schema。
> **格式**:每項 = 【現時代表值(+ file:line)】→【待確認問題】→【✍️ 你答】。
> **相關**:ADR-0008 D3/D6 · W24 `CONTRACT.md`(inbound)· W26 `CONTRACT-OUTBOUND.md`(n8n outbound)· ADR-0002(audience)。
> **狀態**:🔴 未對齊(代表性);答齊 → 轉 locked → provider mapping 收 live。

---

## 🅐 機制(最關鍵一岔口)

平台而家用 **Table API 直插** `sc_request` + `sc_req_item`(`servicenow.service.ts:109` `POST /api/now/table/{table}`)。

- **現時代表**:direct insert 兩張表(REQ 父 + RITM 子,RITM `request` 欄掛父 sysId)。
- **待確認**:
  - **A1** — 你哋容許 integration account **直接 Table-API insert** `sc_request`/`sc_req_item` 嗎?定必須行 **Catalog Request API**(如 `/api/sn_sc/servicecatalog/items/{cat_item_sysid}/order_now` 或 `add_to_cart`+`submit_order`)先會**觸發 catalog workflow / 審批 / 履行自動化**?
  - **A2** — 若直插:會唔會**繞過** catalog workflow(approval / assignment rule / SLA / notification)而造成孤兒單?你哋接唔接受直插?
  - **A3** — 若要行 Catalog API:提供 **order 用嘅 endpoint + cat_item sys_id + 需要嘅 variables**(見 🅒)。
- **✍️ 你答**:______________________________________________
  - （影響:若係 Catalog API → provider 由 `createRecord(table)` 改為 call catalog order endpoint;抽象仍係 `submit()→SubmittedRequest`,只換內部實作。）

---

## 🅑 `sc_request`（REQ 父單）欄位

- **現時代表**(`direct-servicenow.provider.ts:28-34`):
  ```
  short_description = "M365/D365 license request — <targetUpn>"
  comments          = <remark>
  ```
- **待確認**:
  - **B1** — REQ **required fields** 全清單?(如 `requested_for` / `requested_by` / `opened_by` / `company` / `assignment_group` / `u_*` 自訂欄…)
  - **B2** — **requested_for**(申請對象)點 set?平台有 `targetUpn`(email/UPN)—— 要 **sys_user sys_id**(需先 query sys_user by email)定收 email 字串?
  - **B3** — REQ 需唔需要指定 **company / location / department**(對應 OpCo)?收 sys_id 定 code?(平台有 `opcoCode` 如 "RHK")
  - **B4** — 初始 **state / approval** 點?直插會停喺邊個 state?
- **✍️ 你答**:
  - required fields:______________________________________
  - requested_for 機制:__________________________________
  - company/OpCo 欄:____________________________________

---

## 🅒 `sc_req_item`（RITM 子項，一 REQ 多 RITM）欄位 — ⚠️ 最可能要改

- **現時代表**(`direct-servicenow.provider.ts:42-50`):
  ```
  request           = <父 REQ sys_id>          ← 掛父,應該啱
  cat_item          = <SkuCatalog.skuId GUID>  ← ⚠️ 幾乎肯定係 placeholder
  quantity          = <qty>
  short_description = "<skuPartNumber> ×<qty>"
  ```
- **待確認**:
  - **C1(重點)** — `cat_item` 必須係 **ServiceNow Catalog Item 的 sys_id**,唔係 M365/D365 SKU GUID。**每個 license SKU 對應一個 catalog item?** 定係**一個通用「License Request」cat_item + 一個 SKU variable**?請畀 **SKU → cat_item sys_id 對映**(或通用 cat_item sys_id + variable 名)。
  - **C2** — RITM 需要嘅 **variables / order guide**?(catalog item 通常有 variable set,如 licenseType / userEmail / quantity …)
  - **C3** — `quantity` 欄名 + 意思正確?(一個 RITM 代表一個 SKU × qty,定要逐 seat 開?)
  - **C4** — RITM 其他 required(`price` / `assignment_group` / `u_*`)?
- **✍️ 你答**:
  - cat_item 對映（SKU→sys_id / 通用+variable）:__________
  - variables:____________________________________________
  - quantity 語意:________________________________________

---

## 🅓 User / OpCo 參照解析

- **現時代表**:平台傳 `targetUpn`(email/UPN)、`opcoCode`("RHK")、`requesterEmail`。SN 側點對應未定。
- **待確認**:
  - **D1** — 平台要唔要**先 query sys_user**(by email/UPN)攞 sys_id 再放落 ticket?定 SN 側自己 resolve?(若要 query → provider 加一個 sys_user lookup step)
  - **D2** — OpCo → SN 的 **company/location** 對映表(`opcoCode` → sys_id)?
- **✍️ 你答**:______________________________________________

---

## 🅔 建單 response（平台要攞返嘅值）

- **現時代表**(`servicenow.service.ts:117`):create 回 `result.sys_id` + `result.number`;平台存 REQ→`Request.serviceNowSysId/Number`、每 RITM→`RequestLineItem.serviceNowSysId/Number`(two-level,ADR-0008 D6)。
- **待確認**:
  - **E1** — Table API insert 回 `sys_id` + `number`(REQ0…/RITM0…)確認?
  - **E2** — 若行 Catalog Request API,order response 有冇同步回 **REQ + 每個 RITM 的 sys_id + number**?(平台即時建 mirror 需要;n8n 同步路徑 [🅗] 亦然)
- **✍️ 你答**:______________________________________________

---

## 🅕 Integration account / 權限

- **現時代表**:`SERVICENOW_INSTANCE_URL` + `SERVICENOW_USER` + `SERVICENOW_PASSWORD`(Basic auth,env);`SERVICENOW_DEFAULT_TABLE=sc_req_item`。
- **待確認**:
  - **F1** — 提供 **integration user + 建單所需 roles/ACL**(insert sc_request/sc_req_item,或 catalog order 權限)。
  - **F2** — auth 用 Basic 定要 OAuth?instance URL(prod vs test sub-instance)?
- **✍️ 你答**:______________________________________________
  - （H4:creds 只入 `.env`(gitignored),絕不 commit/log。）

---

## 🅖 回寫（履行後 update ticket）

- **現時代表**(`assign.service.ts:186-196`):assign 成功後 `updateRecord(<RITM sysId, fallback REQ>, { work_notes: "License <part> assigned via platform." }, 'sc_req_item')`。
- **待確認**:
  - **G1** — 回寫目標 = 該 line 的 **RITM**(`sc_req_item`)+ 欄位 `work_notes` 正確?
  - **G2** — 履行完要唔要**推 RITM/REQ state**(如 fulfilled / closed complete)?定只留 work note?
- **✍️ 你答**:______________________________________________

---

## 🅗 n8n outbound webhook（只在行 `REQUEST_SUBMISSION_PROVIDER=n8n` 時）

- **現時代表**(`n8n-workflow.provider.ts` + `CONTRACT-OUTBOUND.md`):平台 POST webhook,header `X-N8n-Key`,payload `{targetUpn, opcoCode, requesterEmail, remark, lineItems:[{skuId, skuPartNumber, quantity}]}`;**期望同步回** `{request:{sysId,number}, lineItems:[{skuId,sysId,number}]}`。
- **待確認**:
  - **H1** — 真 **webhook URL**(per-env)+ auth(header key `X-N8n-Key` 定 n8n built-in / signature)?
  - **H2** — n8n 收唔收上述 payload 形狀?定要 n8n-specific 包裝?
  - **H3** — n8n「Respond to Webhook」**同步回 REQ+RITM sysId/number** 得唔得?(Fork 2 = 同步;若只能 fire-and-forget → 要改異步流程,另議)
  - **H4** — n8n workflow 建 `sc_request`+`sc_req_item` 已存在定要新做?(既有 onboarding workflow 可否重用建單邏輯)
- **✍️ 你答**:______________________________________________

---

## 🅘 Inbound reciprocity（甲 onboarding intake — 反方向核對）

> n8n onboarding push 入平台(`POST /requests/intake`,W24)—— 與建單反向,但同一套 REQ/RITM 語意,順帶核對。

- **現時代表**(W24 `CONTRACT.md`,Chris 已以 n8n owner 身份答 §5):REQ sysId+number(必,idempotency key)+ 每 line RITM sysId+number + `azureSyncedAt` + `skuId` GUID + `opcoCode`。
- **待確認**:
  - **I1** — onboarding n8n workflow **實際**有冇喺 push 時帶齊 REQ + per-line RITM 的 sys_id + number?(建單方向嘅 RITM sysId 由 SN 回;intake 方向由 n8n 帶)
- **✍️ 你答**:______________________________________________

---

## 🅙 Idempotency / correlation

- **現時代表**:outbound **無**天然去重(每 POST 建新單;前端防雙擊);inbound 用 REQ sysId `@unique` upsert-or-skip。
- **待確認**:
  - **J1** — outbound 建單要唔要平台傳一個 **correlation id / external ref**(如 `u_platform_ref`)落 ticket,方便重試去重 + trace?
- **✍️ 你答**:______________________________________________

---

## 對齊完成後（收 live 步驟）
1. 填答 🅐–🅙 → 本 doc 轉 **locked**。
2. 改 **provider mapping**:`direct-servicenow.provider.ts`(欄位 + 若 Catalog API 換 endpoint)/ `n8n-workflow.provider.ts`(payload/response)/ 若需 sys_user·company lookup 加 step;`assign.service.ts` 回寫欄位/ state。
3. 填真 **env**(`SERVICENOW_*` / `N8N_OUTBOUND_*`,H4 唔 commit)。
4. **H5**:mapping 改動更新對應 spec(direct/n8n provider spec + assign spec);Graph/SN 一律 mock。
5. 一條 **live 建單**(test sub-instance)驗:平台開單 → SN 真建 REQ+RITM → 平台 mirror sysId/number → assign 回寫 work note。
6. 更新 W25 `CONTRACT` 代表性註 + BACKLOG carry 清除。

> **抽象保證**:以上全部集中喺 `RequestSubmissionProvider` 實作 + `ServiceNowService` + env;domain(`OutboundRequestService`/mirror/對帳/schema)零改。
