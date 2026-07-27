# n8n ↔ 平台 對接設定指南(雙向 checklist)

> **用途**:一份 single reference,俾平台同 n8n team 對接時各自知道要準備 / 交付咩。整合分**兩條獨立線、方向相反、各有一個 shared-secret key**——混淆多數源自將兩個 key 當成同一個。本文只整理**已落地嘅實況**(散喺 ADR-0008 / 兩份 CONTRACT / `.env.example`),唔引入新決策。
> **相關**:ADR-0008(request 建單 + n8n + D365)· W24 `CONTRACT.md`(inbound,**LOCKED**)· W26 `CONTRACT-OUTBOUND.md`(outbound,**代表性**)· `SERVICENOW-CONTRACT-ALIGNMENT.md`(下游 SN 對齊)· W34 ADR-0013(connector 非機密配置經 UI)。
> **H4**:全文所有 key / secret 一律 placeholder;真值只落 `.env`(gitignored)/ deploy secret,**絕不 commit / 貼 chat / log**。

---

## 0. 總覽——兩條線,方向相反

| | 線 ①  Inbound | 線 ②  Outbound |
|---|---|---|
| 方向 | **n8n → 平台** | **平台 → n8n** |
| 邊個暴露 endpoint | **平台**(`POST /requests/intake` **或** `/requests/intake/n8n`,見 §1.5) | **n8n**(webhook URL) |
| 用途 | onboarding 完成 → n8n 推單入平台建 `Request` | IT 喺平台開單 → 平台叫 n8n 去 ServiceNow 開飛 |
| Auth header | `X-Intake-Key`(**平台**發 key,n8n 帶入) | `X-N8n-Key`(**n8n**發 key,平台帶出) |
| 觸發時機 | AD 建好後 fire-and-forget push | IT `POST /requests` 時 provider 選路 = `n8n` |
| 成熟度 | ✅ **平台側兩條 route 都 build + test 齊,canonical 合約 LOCKED**<br>⚠️ **但未真接過 n8n** —— n8n 側仲有 3 個接線缺口(見下) | ⚠️ **provider 已 build,合約代表性,欄名待 live 對齊** |

> **線 ① 平台側 ready,n8n 側未 ready。** W36 實讀 n8n workflow 揪出三個 blocking 缺口:
> ① 兩個 `WF1 - Call UOP Intake` **完全冇送 `X-Intake-Key`** → 一 enable 就全部 **401**;
> ② `UOP_INTAKE_URL` 要指去 `/requests/intake/n8n`(§1.5);③ 1005 個 Call node 仲係 disabled。
> 補完先算通 —— 詳見 `docs/01-planning/W36-n8n-intake-adapter/N8N-WF1-CHANGES.md §2.5`。
>
> 線 ② 要 owner 開 webhook + 對齊欄名先 live。

---

## 線 ① — Inbound:平台提供畀 n8n(n8n call 入嚟建單)

**狀態:平台側唔使再開發**(兩條 route 都 build + test 齊)**;但整條線未真接過 n8n**,見 §0 三個缺口。
實作:`intake.controller.ts` + `intake-key.guard.ts` + `intake.service.ts` + `dto/n8n-intake.dto.ts`(adapter route 另見 §1.5)。

> **驗到邊?**(W36 F4,誠實邊界)平台側 8 個 case live 打過:401 / 201 / 冪等 / 三種 resolve 失敗 / 新 OpCo / 壞信封,DB 逐行查過。
> **但 ServiceNow 反查行嘅係本地 mock**(憑證仍係 placeholder),而且 payload 係照 n8n node 嘅 `jsCode` 重砌,**唔係 n8n 真打入嚟**。
> ⇒ **真 SN + 真 n8n 端到端 = 未驗證。**

### 1.1 平台交付畀 n8n team

| # | 交付項 | 值 / 來源 |
|---|---|---|
| 1 | **Endpoint URL** | `{平台 base}/requests/intake`(backend 無 global prefix;UAT = Azure ACA domain / local = `http://localhost:3100/requests/intake`) |
| 2 | **Method / type** | `POST` · `Content-Type: application/json` |
| 3 | **Auth key**(平台生成) | `INTAKE_API_KEY` 值 → n8n 放入 `X-Intake-Key` header。經 secure channel 交,**唔貼 chat** |
| 4 | **Payload 合約** | 見 §1.2(`N8nIntakeRequestDto`) |
| 5 | **Response** | 回建立(或已存在)嘅 `Request` JSON(含 `id` + `lineItems`) |
| 6 | **互動文檔** | `{平台 base}/docs/api`,`intake` tag 有完整 schema |

### 1.2 Payload 合約(n8n HTTP Request node 要砌成噉)

```jsonc
{
  "targetUpn": "jane.doe@rapo.com.hk",       // 必:onboarding 對象 UPN
  "targetDisplayName": "Jane Doe",           // 選
  "opcoCode": "RHK",                         // 必:要對到平台 Opco.code,唔存在 → 404
  "requesterEmail": "it.rhk@rapo.com.hk",    // 選
  "rawRequestText": "New hire standard bundle", // 選:remark,平台唔 auto-parse 成 line
  "serviceNowSysId": "<sc_request sysId>",   // 必:REQ 父;@unique → idempotency key
  "serviceNowNumber": "REQ0012345",          // 選
  "accountCreatedAt": "2026-07-23T01:55:00Z",// 選:AD 帳號建立(ISO 8601)
  "azureSyncedAt":   "2026-07-23T02:00:00Z", // 選:n8n 聲稱 AD→Entra synced(sync gate)
  "lineItems": [                             // 必:≥1
    {
      "skuId": "<SkuCatalog.skuId GUID>",    // 必:傳 GUID,直對主鍵,零 map
      "quantity": 1,                         // 必:≥1
      "serviceNowRitmSysId": "<RITM sysId>", // 選:per-line RITM 子
      "serviceNowRitmNumber": "RITM0012345"  // 選
    }
  ]
}
```

**關鍵語意(CONTRACT §5 已 LOCK):**
- **Idempotent**:`serviceNowSysId`(REQ)`@unique` → 同一張重推**唔會 double**(連 concurrent retry P2002 都 catch 返 existing)。
- **`skuId` 傳 GUID**,唔好傳 part number / 名(平台主鍵靠 GUID)。SKU 唔存在 / inactive → 400。
- **`opcoCode` 傳 code**(如 `RHK`),同 seed 一致 → 平台 resolve 成 `opcoId`。
- **`azureSyncedAt` ≠ Graph 即見**:on-prem AD → Entra Connect 有延遲。平台 assign 仍以 `findUser(upn)` 真命中為 gate(RISK R3),呢個 timestamp 只係 n8n 聲稱。
- 入嚟 `handledById = null` → 入 Regional queue,**人手** assign(唔觸 auto-assign)。

### 1.3 n8n team 要準備

- [ ] 攞平台畀嘅 **URL + `INTAKE_API_KEY`**
- [ ] HTTP Request node:`POST`、set `X-Intake-Key` header、body 跟 §1.2
- [ ] 掛喺 onboarding workflow **尾段**,建議 **fire-and-forget**(失敗只 log,唔阻 onboarding——CONTRACT A3,平台唔做 onboarding single point of failure)
- [ ] 確保有齊 `targetUpn` / `opcoCode` / `serviceNowSysId`(REQ)/ ≥1 個 `skuId`(GUID)

### 1.4 平台側前提(deploy 要 confirm)

- [ ] `INTAKE_API_KEY` 喺目標環境(UAT / prod)**已設真值**(`.env.example` 只係 `change-me-intake-secret` placeholder;`IntakeKeyGuard` getOrThrow → 未設會 boot fail)
- [ ] 若行 §1.5 adapter route:目標環境**已補 OpCo `RAPO/IT (RDC2)`**(W36 新增,`POST /admin/opcos`)

### 1.5 🆕 兩條 inbound route —— canonical vs adapter(W36 / ADR-0017 戊)

線 ① 而家有**兩個入口,同一個 `X-Intake-Key`,同一個 `IntakeService` 寫入**:

| | `POST /requests/intake`(canonical) | `POST /requests/intake/n8n`(**adapter**) |
|---|---|---|
| Body | §1.2 扁平合約 | n8n 自己個 nested 信封 |
| 要平台內部 identifier? | ✅ 要 `skuId` GUID · `opcoCode` · REQ **sysId** | ❌ 唔使 —— 送 **licence 名 · Job Function · REQ number** 就得 |
| 合約 | W24 `CONTRACT.md` **LOCKED**(W36 零改動) | 跟 n8n 實際 payload,`N8N-INTAKE-HANDOFF.md §8` |
| 用嚟做咩 | 手上已有 GUID 嘅 caller | **n8n onboarding workflow(1001 即時 / 1005 排程)** |

**點解要開第二條而唔係放鬆第一條**:n8n 手上根本冇 GUID。改 LOCKED 合約去遷就一個 caller,等於所有 caller 都失去「GUID 直對主鍵、零 map」呢個保證。改為喺 adapter 入面 resolve —— 唯一命中先收,否則 **400 兼零寫入**(ADR-0017 D0 fail-closed)。

⚠️ **兩條 route 唯一嘅行為差異**:adapter route resolve OpCo 之後**會 check `active`**(收緊咗 HANDOFF §7 落差 #5);canonical route **維持原狀**,仍然接受 inactive OpCo —— 刻意唔郁 LOCKED 合約。

---

## 線 ② — Outbound:n8n 準備並交畀平台(平台 call 出去開單)

**狀態:平台 code ready,合約代表性——真欄名 / URL / auth 要同 n8n owner live 對齊先 live。** 實作:`n8n-workflow.provider.ts` + `fulfilment.module.ts:32`(provider 選路)。

### 2.1 n8n team 要準備並交付畀平台

| # | n8n 提供 | 平台點用 | 機密? |
|---|---|---|---|
| 1 | **Webhook URL**(n8n 建 Webhook node) | 填 `N8N_OUTBOUND_WEBHOOK_URL` | 非機密(可經 UI 設,見 §4) |
| 2 | **Webhook 驗證 key**(n8n 側設,認平台) | 平台帶 `X-N8n-Key`;填 `N8N_OUTBOUND_WEBHOOK_KEY` | 🔴 **機密,只落 env** |
| 3 | **實際 payload / response 欄名** | 對齊 provider mapping | 合約(見 §2.4) |

> ### ⚠️ n8n Public API key ≠ webhook auth key(對接最常見混淆)
>
> 上表第 2 項嘅「Webhook 驗證 key」**唔係** n8n `Settings › n8n API` 版嗰啲 API key(截圖見到嘅 `n8n PROJ002_key` / `n8n MCP` / `n8n chat api test` / `n8n backup API`)。兩者係完全唔同嘅嘢,唔可以攞錯:
>
> | | n8n Public REST API key | 本整合線 ② 要嘅 |
> |---|---|---|
> | 位置 | `Settings › n8n API`(`Create an API Key` 生成) | 你喺 **Webhook node** 自己設嘅 Header Auth secret |
> | 用途 | 程式化**控制 n8n instance 本身**(`/api/v1/*`:列 / 管 / 啟停 workflow、管 credential) | 淨係驗證**邊個可以 call 你個 webhook** |
> | 來源 | 該版產生嘅 token | **唔喺該版產生** —— webhook node 內自訂任意字串 |
> | 本整合用? | ❌ 唔用 | ✅ 就係佢 → 填 `N8N_OUTBOUND_WEBHOOK_KEY` |
>
> **n8n 自己都指路**:`n8n API` 版頂部原文寫「if you only want to trigger workflows, consider using the webhook node instead」。線 ②(平台開單 → 觸發 workflow)**正正係 trigger workflow** → 行 webhook node,唔掂 Public API key。
>
> **幾時先真係要 Public API key?** 只有將來平台要**反向程式化管理** n8n instance(列 workflow / 非 webhook 觸發 / 同步 credential)先需要 —— 目前 ADR-0008 設計**冇此需求**;若要行 = 新 scope,先傾(H3)。

### 2.2 平台側要準備(大部分已 build)

- [ ] `REQUEST_SUBMISSION_PROVIDER=n8n`(唔設 = 預設 `direct` 直打 ServiceNow Table API,行為不變)
- [ ] `N8N_OUTBOUND_WEBHOOK_URL` = n8n 畀嘅 URL
- [ ] `N8N_OUTBOUND_WEBHOOK_KEY` = n8n 畀嘅 key(env only)
- [x] `N8nWorkflowProvider` **已寫好**——fail-closed:非 2xx / 缺 `request.sysId` / line 數唔對 / `skuId` 亂序 → **throw,唔建任何 local mirror**(同 Direct provider 一致 ordering)

### 2.3 平台 POST 畀 n8n 嘅 body(代表性)

```jsonc
{
  "targetUpn": "jane.doe@rapo.com.hk",
  "opcoCode": "RHK",
  "requesterEmail": "it.rhk@rapo.com.hk",
  "remark": "New hire — standard bundle",
  "lineItems": [
    { "skuId": "<GUID>", "skuPartNumber": "SPE_E3", "quantity": 1 }
  ]
}
```

### 2.4 n8n「Respond to Webhook」要同步回(代表性)

```jsonc
{
  "request": { "sysId": "<sc_request sysId>", "number": "REQ0012345" },
  "lineItems": [
    { "skuId": "<GUID>", "sysId": "<sc_req_item sysId>", "number": "RITM0012345" }
  ]
}
```
- `request.sysId` **必**(缺 → throw)· `lineItems` 長度**必等於** payload · 每 line `sysId` **必** · `skuId` 對回 payload 次序核對(防亂序)。
- `quantity` 平台用 payload 值(response 唔靠)。

### 2.5 ⚠️ Live 對齊前 5 條待確認(CONTRACT-OUTBOUND §6)

轉 `locked` 前要同 n8n owner 落實(non-blocking,provider 抽象已隔離,live 只改 mapping + env):
1. 真 webhook URL 形態(path / query / 是否 per-env)。
2. 真 request payload 欄名(直收 §2.3 JSON,定要 n8n-specific 包裝 / catalog item variables)。
3. 真 response shape(「Respond to Webhook」實際回咩;REQ + RITM 是否同步齊)。
4. 真 auth 機制(header key 定 n8n webhook built-in auth / signature)。
5. n8n 端建單 workflow 是否已存在(定要新做)。

---

## 3. 🔑 兩個 key 唔好搞亂(最易錯)

| Key | 邊個生成 | 邊個帶 | 落邊 | header |
|---|---|---|---|---|
| `INTAKE_API_KEY` | **平台** | n8n 帶入嚟 | 平台 env | `X-Intake-Key` |
| `N8N_OUTBOUND_WEBHOOK_KEY` | **n8n** | 平台帶出去 | 平台 env(機密) | `X-N8n-Key` |

兩個都係 shared secret、方向相反、絕不落 code / DB / log(H4)。fail-closed:key 缺 / 錯 → 401(inbound)/ throw(outbound),零副作用。

---

## 4. env 清單(`apps/api/.env`)+ W34 UI 補充

`.env.example` 相關段(填真值做 `.env`,gitignored):

```bash
# n8n inbound intake(線 ①,ADR-0008 甲)
INTAKE_API_KEY=change-me-intake-secret          # 🔴 平台發,n8n 帶 X-Intake-Key

# outbound 選路(線 ②,ADR-0008 丙)
REQUEST_SUBMISSION_PROVIDER=direct              # direct(預設)| n8n
N8N_OUTBOUND_WEBHOOK_URL=https://n8n.example.com/webhook/create-license-request
N8N_OUTBOUND_WEBHOOK_KEY=change-me-n8n-outbound-secret  # 🔴 n8n 發,平台帶 X-N8n-Key
```

**W34 / ADR-0013(Model C)之後**——非機密欄可經平台 UI(**Settings › Integrations › `n8n (outbound)` › Configure**,ADMIN)改,DB-then-env resolve,**restart 生效**:

| Connector | 可 UI 設(非機密) | 只 env(機密) |
|---|---|---|
| `n8n (outbound)` | `REQUEST_SUBMISSION_PROVIDER` · `N8N_OUTBOUND_WEBHOOK_URL` | `N8N_OUTBOUND_WEBHOOK_KEY` |
| `n8n (inbound intake)` | (無非機密設定) | `INTAKE_API_KEY` |

> 🔴 **兩個 key 永遠只經 env**,UI 只顯示 `configured / not set`,絕不回值、絕不接受輸入(secret 邊界,ADR-0013)。來源實況:`connectors.ts` `CONNECTOR_CONFIG`。

---

## 5. Deploy checklist(雙方對接)

**平台側:**
- [ ] `INTAKE_API_KEY` 設真值(線 ① 必需)
- [ ] 決定線 ②:`REQUEST_SUBMISSION_PROVIDER`(唔用 n8n outbound = 留 `direct`)
- [ ] 若用 n8n outbound:填 `N8N_OUTBOUND_WEBHOOK_URL` + `N8N_OUTBOUND_WEBHOOK_KEY`
- [ ] 交平台 base URL + `/requests/intake`(**或 `/requests/intake/n8n`**)+ `INTAKE_API_KEY` 畀 n8n(線 ①)
- [ ] 若行 adapter route:補 OpCo `RAPO/IT (RDC2)`(§1.4)

**n8n 側:**
- [ ] 線 ①:HTTP Request node POST **`/requests/intake/n8n`**(onboarding workflow 用呢條,§1.5),帶 `X-Intake-Key`,body 跟 `N8N-INTAKE-HANDOFF.md §8.1`,掛 onboarding 尾段 fire-and-forget
- [ ] 線 ①:1005(排程路徑)個 `WF1 - Call UOP Intake` node **要 enable** —— 未到入職日走呢條,disabled = 排程單永遠唔會入平台
- [ ] 線 ②(如啟用):建 Webhook node → 畀 URL + 驗證 key 畀平台;落實收 §2.3 / 回 §2.4;答齊 §2.5 五條

---

## 6. 檔案索引(source of truth)

| 關注 | 檔案 |
|---|---|
| Inbound endpoint / guard / DTO / service | `apps/api/src/fulfilment/intake.controller.ts` · `intake-key.guard.ts` · `dto/n8n-intake.dto.ts` · `intake.service.ts` |
| Inbound **adapter** route(§1.5) | `apps/api/src/fulfilment/intake-adapter.service.ts` · `dto/n8n-native-intake.dto.ts` · `opco-department-map.ts` |
| Outbound provider / 選路 | `apps/api/src/fulfilment/n8n-workflow.provider.ts` · `fulfilment.module.ts`(`requestSubmissionProviderFactory`) |
| Outbound payload 抽象 | `apps/api/src/fulfilment/request-submission.provider.ts` |
| Connector config(W34 非機密欄 vs secret) | `apps/api/src/integration/connectors.ts`(`CONNECTOR_CONFIG`) |
| env 範本 | `apps/api/.env.example` |
| 決策 / 合約 | `docs/adr/0008-request-creation-n8n-d365-scope.md` · **`docs/adr/0017-n8n-execution-seams-switchable-integration.md`** · `docs/01-planning/W24-request-intake/CONTRACT.md` · `docs/01-planning/W26-request-n8n-outbound/CONTRACT-OUTBOUND.md` |
