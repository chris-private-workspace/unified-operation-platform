# n8n Inbound Intake — 交畀 n8n team 嘅照抄範本(線 ①)

> **用途**:一份 n8n team 可以**直接照抄**嘅 payload + 真實 identifier 值,用嚟做**第一次真對接**。
> **關係**:`N8N-INTEGRATION-SETUP.md` 講「雙方各自要準備咩」(雙向 checklist);**本文只做一件事** —— 把線 ① 嘅抽象合約變成可貼落 n8n HTTP Request node 嘅具體值。
> **合約 SSOT**:W24 `CONTRACT.md`(**LOCKED**)· DTO `apps/api/src/fulfilment/dto/n8n-intake.dto.ts`。本文**唔引入任何新決策**;有衝突以 CONTRACT + DTO 為準。
> **H4**:全文零 secret。`INTAKE_API_KEY` 真值**唔喺本文**,經 secure channel 另交。SKU GUID / OpCo code **唔屬機密**(SKU GUID 係 Microsoft 全球公開值)。

---

## 0. 🔴 最重要一件事:`skuId` 必須傳 **GUID**,唔可以傳名

平台主鍵係 `skuId`(GUID),**唔會**接受 `"E5"` / `"Microsoft 365 E5"` / `"SPE_E5"` 呢類名或 part number。

**呢個唔係潔癖 —— 係因為「E5」本身有歧義。** 平台 catalog 實際有**兩個**都叫得 E5 嘅 SKU:

| displayName | skuPartNumber | `skuId`(GUID) | 係唔係你要嘅? |
|---|---|---|---|
| **Microsoft 365 E5** | `SPE_E5` | `06ebc4ee-1bb5-47dd-8120-11324bc54e06` | ✅ **正常 onboarding 用呢個** |
| Microsoft_365_E5_(no_Teams) | `Microsoft_365_E5_(no_Teams)` | `18a4bd3f-0b5b-4887-b04f-61dd0ee15f5e` | ❌ 唔含 Teams 嘅歐盟變體 |

⇒ 若果 n8n 側傳「E5」呢個字串,**冇任何一方有辦法安全咁猜出係邊個**。所以 GUID 係硬要求。

> **若 n8n workflow 手上只有名、拎唔到 GUID** —— 呢個曾經係 blocking 落差。**W36(ADR-0017 戊)已解**:平台加咗**第二條 route** `POST /requests/intake/n8n`,由 adapter 幫你 resolve 名 → GUID。
>
> **注意:LOCKED 合約一個字都冇改。** 本文 §0-§6 描述嘅係 canonical route `/requests/intake`,佢仍然只收 GUID、仍然一樣嚴。adapter route 係另一條入口、resolve 唔到就 **400 拒收兼零寫入**(唔會挑第一個候選)。詳見 **§8**。

---

## 1. 常用 SKU 真值(as-of **2026-07-26**,dev catalog)

> ⚠️ **呢張表係 snapshot,唔係 SSOT。** SKU GUID 係 Microsoft 全球一致值(唔會 per-tenant),但**平台 catalog 有冇該行、active 唔 active 係 per-環境**。落 UAT / prod 前用 §5 自己查一次。

| 用途 | displayName | skuPartNumber | `skuId` |
|---|---|---|---|
| **Base(預設 onboarding)** | Microsoft 365 E5 | `SPE_E5` | `06ebc4ee-1bb5-47dd-8120-11324bc54e06` |
| Base | Microsoft 365 E3 | `SPE_E3` | `05e9a617-0261-4cee-bb44-138d3ef5d965` |
| Base(first-line) | Office 365 F3 | `DESKLESSPACK` | `4b585984-651b-448a-9e53-3b10f069cf7f` |
| Add-on | Microsoft 365 Copilot | `Microsoft_365_Copilot` | `639dec6b-bb19-468b-871c-c5c441c4b0cb` |
| Voice | Microsoft Teams Phone | `MCOEV` | `e43b5b99-8dfb-405f-9987-dc307f34bcbd` |
| Power Platform | Power BI Pro | `POWER_BI_PRO` | `f8a1db68-be16-40ed-86d5-cb42ce701560` |
| Add-on | Visio Plan 2 | `VISIOCLIENT` | `c5928f49-12ba-48f7-ada3-0d743a3601d5` |

**唔可以用嘅值**(catalog 內存在但 `active = false`,傳去會 **400**):`test-e3` · `test-e1` · `b2c3d4e5-7777-8888-9999-aaaabbbbcccc`(Visio Plan 1)· `a1b2c3d4-1111-2222-3333-444455556666`(Defender for O365)。呢啲係 dev seed / 測試殘留。

---

## 2. `opcoCode` 真值(as-of 2026-07-26,**23 個 active**)

要**一字不差**(大小寫、斜線、空格、括號全部算)。對唔上 → **404**。

```
PFU-Asia     PFU-HK        RAP           RAPO/APTC     RAPO/ASPC
RAPO/FNA     RAPO/IT       RAPO/IT (RBS) RAPO/SCM      RAPP
RBS          RCN           RHK           RKR           RMS
RNZ          RPH           RSP           RTH           RTMAP
RTMEAP       RTW           RVN
```

⚠️ 三個特別容易打錯:**`RAPO/IT (RBS)`**(斜線 + 空格 + 括號)· **`PFU-Asia`**(大寫 A)· `RAPO/*` 系列全部用**正斜線**。
⚠️ `CH004-TEST` 係 inactive 測試 OpCo,**唔好用**。

> 🆕 **W36 加咗第 24 個:`RAPO/IT (RDC2)`**(對 Job Function `RAPO IT (RDC2)`)。已入 `seed.ts`,但**每個環境要各自補一次**(`POST /admin/opcos`,唔使重跑全 seed)—— 上面個 list 係 2026-07-26 snapshot,未包佢。冇補 → 該 Job Function 一律 400。

---

## 3. 照抄 payload —— 一個 E5 onboarding

貼落 n8n **HTTP Request node** 嘅 body(把 `<...>` 換成真值):

```jsonc
{
  "targetUpn": "jane.doe@rapo.com.hk",
  "targetDisplayName": "Jane Doe",
  "opcoCode": "RHK",
  "requesterEmail": "it.rhk@rapo.com.hk",
  "rawRequestText": "New hire — standard onboarding bundle",

  "serviceNowSysId": "<sc_request sysId>",
  "serviceNowNumber": "REQ0012345",

  "accountCreatedAt": "2026-07-26T01:55:00Z",
  "azureSyncedAt": "2026-07-26T02:00:00Z",

  "lineItems": [
    {
      "skuId": "06ebc4ee-1bb5-47dd-8120-11324bc54e06",
      "quantity": 1,
      "serviceNowRitmSysId": "<sc_req_item sysId>",
      "serviceNowRitmNumber": "RITM0012345"
    }
  ]
}
```

**Node 設定**:`POST` · `Content-Type: application/json` · header **`X-Intake-Key: <平台交嘅 INTAKE_API_KEY>`** · URL `{平台 base}/requests/intake`(backend 無 global prefix)。

### 必 / 選

| 欄 | 必? | 備註 |
|---|---|---|
| `targetUpn` | ✅ | onboarding 對象 |
| `opcoCode` | ✅ | §2 真值,對唔上 404 |
| `serviceNowSysId` | ✅ | **REQ 父,`@unique` = idempotency key** |
| `lineItems` | ✅ ≥1 | 空 array → 400 |
| `lineItems[].skuId` | ✅ | **GUID**(§0/§1) |
| `lineItems[].quantity` | ✅ | 整數 ≥1 |
| 其餘全部 | 選 | 缺就 null,唔會 fail |

### 兩個語意務必知

1. **重推同一張唔會 double**。`serviceNowSysId` `@unique` → 第二次 POST 回**原本嗰張**(連 concurrent retry 都 catch 返 existing)。所以 n8n **retry 係安全**。
2. **`azureSyncedAt` 唔等於平台會即刻 assign**。呢個 timestamp 只係「n8n 聲稱 AD→Entra 已 sync」。平台真正 assign 前仍然要 `findUser(upn)` 喺 Graph **真命中**(on-prem AD → Entra Connect 有延遲,**RISK R3**)。傳唔傳都唔會 block 建單。

---

## 4. 掛喺 workflow 邊 + 失敗點算

- 掛喺 onboarding workflow **尾段**(AD 帳號建好之後)。
- **建議 fire-and-forget** —— 平台回非 2xx 只 log,**唔好 fail 或 retry 到阻住 onboarding**。平台刻意唔做 onboarding 嘅 single point of failure(CONTRACT A3)。
- 入嚟之後 `handledById = null` → 落 Regional queue,**由平台操作員人手處理**,平台唔會 auto-assign。

### 回應碼對照

| Code | 意思 | 通常原因 |
|---|---|---|
| **201** | 建好(或 idempotent 回原單) | — |
| **401** | key 錯 / 冇帶 | `X-Intake-Key` header 名或值錯 |
| **400** | payload 唔合法 | `skuId` 唔存在 / **inactive** · `lineItems` 空 · `quantity < 1` · 日期唔係 ISO 8601 |
| **404** | `opcoCode` 唔存在 | §2 拼錯(斜線 / 空格 / 大小寫) |

---

## 5. 自己查真值(唔好靠本文 snapshot)

**由平台 API**(要 token / dev-bypass):

```bash
curl -s "{平台 base}/license/catalog" | jq '.[] | select(.active) | {skuPartNumber, displayName, skuId}'
```

**或者互動文檔**:`{平台 base}/docs/api` → `intake` tag 有完整 schema;`license` tag 有 catalog。

**OpCo**:`GET /opcos`(active 清單)。

---

## 6. 對接前後嘅驗證

**平台側先自測**(唔需要 n8n) —— 用既有 harness,**唔另造 script**:
`apps/api/scripts/demo-harness/README.md` **Scenario 3**(401 / 201 / 201 三段 curl,證 guard fail-closed + idempotent)。把裡面嘅 `<catalog skuId>` 換成 §1 嘅 E5 GUID 即可。
做完記得清:`npm run demo:cleanup -- <你用嘅 REQ sysId>`。

**真對接時要一齊睇**:
- [ ] n8n 側:HTTP node 回 **201**
- [ ] 平台側:`GET /requests` 見到新單(`origin = onboarding-intake`)
- [ ] 該單 line item 有 E5、`stage = REQUESTED`
- [ ] `opcoCode` resolve 正確(單上 OpCo 冇錯)
- [ ] 重推一次 → 仍然一張(idempotent)

---

## 7. 已知落差(對接時要一齊確認)

| # | 落差 | 影響 |
|---|---|---|
| 1 | ~~**n8n 能否提供 `skuId` GUID**~~ | ✅ **W36 已解** —— 唔使畀 GUID,改用 §8 adapter route(合約無改) |
| 2 | n8n 是否真會把 **E5 放入 `lineItems`** | 「default 派 E5」係 n8n 側決定;平台 SKU-agnostic,收到咩建咩 |
| 3 | 目標環境 `INTAKE_API_KEY` 有冇設真值 | 未設 → guard `getOrThrow` boot fail(**兩條 route 共用同一個 key**) |
| 4 | 目標環境 catalog 有冇 sync(E5 行存在且 active) | 冇 → 400。**adapter route 更嚴**:名要**唯一命中**一個 active SKU,≥2 個候選都係 400 |
| 5 | ~~intake **唔檢查 OpCo `active`**~~ | ✅ **adapter route 已收緊**(resolve 完會 check `active`,inactive → 400)。⚠️ **canonical route 行為不變** —— 佢仍然收 inactive OpCo,呢個係刻意唔郁 LOCKED 合約 |
| 6 | 🆕 目標環境有冇 `RAPO/IT (RDC2)` 呢個 OpCo | W36 新增。冇 → 該 Job Function 一律 400。**每個環境要各自補一次**(`POST /admin/opcos`) |

---

## 8. 🆕 Adapter route —— n8n 唔使識平台識條數(W36 / ADR-0017 戊)

**存在理由**:上面 §0-§6 要求 n8n 交出 `skuId` GUID、`opcoCode`、REQ **sysId** 三個平台內部 identifier。n8n workflow 手上只有 **licence 名 / Job Function / REQ number**。與其為咗遷就一個 caller 而放鬆 LOCKED 合約,不如**加一條 route** 幫佢 resolve。

| | canonical route | **adapter route** |
|---|---|---|
| URL | `POST /requests/intake` | **`POST /requests/intake/n8n`** |
| Key | `X-Intake-Key` | **同一個 key**(OQ-3:一個 caller、一條信任邊界、一個 secret 要 rotate) |
| SKU | `skuId` GUID | **licence 名**(`licenseCode`) |
| OpCo | `opcoCode` | **Job Function**(`department`) |
| REQ | `serviceNowSysId` | **REQ number**(`requestId`) |
| Body 形狀 | 扁平 | n8n 自己個信封(nested) |
| 合約狀態 | **LOCKED,零改動** | 跟住 n8n 實際送咩 |

兩條 route **最終都行同一個 `IntakeService`** —— 建單邏輯只有一份,冇第二條寫入路徑。

### 8.1 n8n 送嘅 body

```jsonc
{
  "event": "license_request_received",   // 必:只接受呢一個值
  "idempotencyKey": "REQ0043858",        // 選:淨係做 tracing
  "sentAt": "2026-07-27T02:00:00Z",      // 選:ISO 8601

  "request": {
    "requestId": "REQ0043858",           // 必:REQ **number**,平台自己反查 sysId
    "department": "RHK IT",              // 必:18 條 Job Function 之一
    "openedDate": "2026-07-27T01:00:00Z",// 選
    "remarks": "New hire",               // 選 → 落 rawRequestText
    "source": { "subject": "...", "sender": "it.rhk@rapo.com.hk" }  // 選
  },

  "targetUser": {
    "email": "jane.doe@rapo.com.hk",     // 必:建咗嘅 AD 帳號 UPN → targetUpn
    "firstName": "Jane", "lastName": "Doe",   // 選 → 合併成 displayName
    "username": "jdoe", "sAMAccountName": "jdoe",  // 選
    "validated": true                    // 選:記錄,平台唔會據此攔截
  },

  "licenseItems": [                      // 必:≥1
    {
      "licenseCode": "E5",               // 必:名,平台 resolve 成 GUID
      "ritmNumber": "RITM0012345",       // 選
      "ritmSysId": "<sc_req_item sysId>",// 選
      "ritmTitle": "...", "variables": {}// 選,診斷用
    }
  ]
}
```

### 8.2 平台點 resolve(三個都係 fail-closed)

| 收到 | 點 resolve | 唔掂點算 |
|---|---|---|
| `department` | 對 code 內 **18 條精確 Job Function 常數表**(`opco-department-map.ts`),再要求該 OpCo **存在且 `active`** | **400**,訊息講明收到咗咩 Job Function |
| `licenseCode` | `SkuCatalog` `businessAlias` → 唔中先試 `skuPartNumber`;只計 `active`、大小寫不敏感、**必須唯一命中** | 冇命中 → **400**;**≥2 個候選都係 400**(訊息列出撞到邊幾個 SKU) |
| `requestId` | `sc_request` 反查 sysId | 搵唔到 → **400**;ServiceNow **連唔到** → **503**(retry 有用 vs 冇用,分得清) |

🔴 **三個 resolve 全部係「唯一命中,否則拒收兼零寫入」。** 猜錯嘅代價唔對稱 —— 猜錯 OpCo = 帳落錯公司,猜錯 SKU = **真係派咗個產品落一個真人個 account**。所以寧願拒單。

⚠️ 兩個刻意**唔**做嘅推導:
- **`quantity` 一律當 1** —— n8n 一張 RITM = 一個 seat,佢根本冇送數量。
- **`accountCreatedAt` / `azureSyncedAt` 一律留空**,唔會由 `sentAt` 推。「n8n 幾時 POST」唔等於「AD 已 sync 落 Entra」;拿一個推另一個就係**靠估開 sync gate**。平台照舊要 `findUser(upn)` 喺 Graph 真命中先 assign。

### 8.3 揀邊條?

- **n8n onboarding workflow → 用 adapter route**(唔使幫平台查 GUID)。
- **其他 caller / 手上已經有 GUID → 用 canonical route**(更嚴、合約 LOCKED、有 W24 CONTRACT 保證)。

---

## 9. 檔案索引

| 關注 | 位置 |
|---|---|
| 雙向對接 checklist(兩個 key 分辨) | `docs/05-usage/N8N-INTEGRATION-SETUP.md` |
| 合約 SSOT(LOCKED) | `docs/01-planning/W24-request-intake/CONTRACT.md` |
| DTO / guard / service | `apps/api/src/fulfilment/dto/n8n-intake.dto.ts` · `intake-key.guard.ts` · `intake.service.ts` |
| **Adapter route(§8)** | `apps/api/src/fulfilment/intake-adapter.service.ts` · `dto/n8n-native-intake.dto.ts` · `opco-department-map.ts` |
| **Job Function ↔ OpCo 18 條對照 + 推導** | `docs/01-planning/W36-n8n-intake-adapter/MAPPING.md` |
| 本地 smoke | `apps/api/scripts/demo-harness/README.md` Scenario 3 |
| 決策 | `docs/adr/0008-request-creation-n8n-d365-scope.md` · **`docs/adr/0017-n8n-execution-seams-switchable-integration.md`(D4 = 本文 §8)** |
