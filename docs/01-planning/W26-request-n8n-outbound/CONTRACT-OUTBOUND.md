---
phase: W26-request-n8n-outbound
deliverable: D1
status: representative   # 代表性(Fork 1 = 代表性先行 + mock);真 URL/欄位/response live 同 Chris(n8n owner)對齊後轉 locked
---

# W26 Phase 丙 — Outbound n8n webhook 合約(D1,代表性)

> **用途**:定義平台 → n8n 嘅 **outbound 建單** 合約(方向②,ADR-0008 D2/D3)。平台 POST n8n webhook,由 n8n 既有 workflow 建 `sc_request`+`sc_req_item`,**同步回** REQ/RITM sysId+number(Fork 2 = 同步回),平台收到即建本地 mirror(重用乙 `OutboundRequestService`,consumer 零改)。
> **代表性**(Fork 1)= 欄位形狀依乙 `SubmitRequestPayload`/`SubmittedRequest` 抽象 + ADR-0008 D6 推導;真 webhook URL / payload 欄名 / response shape / auth 待同 Chris(n8n owner)對齊後轉 `locked`。**provider 抽象隔離令 live 只改 provider 內 mapping + env**。
> **方向對照甲**:甲(inbound)= n8n → 平台(`POST /requests/intake`,平台被動暴露 endpoint);丙(outbound)= 平台 → n8n(平台主動 call webhook)。auth key 方向相反。

## 1. Endpoint / 方向

| | 甲 inbound intake | 丙 outbound(本合約) |
|---|---|---|
| 方向 | n8n → 平台 | **平台 → n8n** |
| 誰暴露 endpoint | 平台(`POST /requests/intake`) | **n8n(webhook URL)** |
| 觸發 | onboarding workflow 完結前 push | IT 喺平台開單(`POST /requests`)→ provider call |
| auth | n8n 帶 `X-Intake-Key`(平台驗) | **平台帶 `X-N8n-Key`(n8n 驗)** |
| 回應 | 平台回 201 + mirror id | **n8n 同步回 REQ+RITM sysId/number** |

- **Webhook URL**:`N8N_OUTBOUND_WEBHOOK_URL`(env,`ConfigService.getOrThrow`;代表性 placeholder,真值 live)。
- **Method**:`POST`,`Content-Type: application/json`。

## 2. Auth 決策(拍板:static webhook key,mirror 甲 方向相反)

- **方式**:static shared-secret key,HTTP header `X-N8n-Key`;值經 `ConfigService.getOrThrow('N8N_OUTBOUND_WEBHOOK_KEY')`(H4:env only,**絕不 hardcode/log**;provider 唔 log key 值)。
- **Rationale**:同甲對稱 —— m2m、shared secret 最簡、n8n webhook node 易驗、**零新 runtime dep**(global `fetch`)、符合現有 env-secret pattern。
- **升級路徑**:將來要更正規 → 換做 OAuth client-credential / signed payload,provider 內部改,`submit()` 契約不變。非本 phase。
- **⚠️ H2/H4**:`N8N_OUTBOUND_WEBHOOK_URL` + `N8N_OUTBOUND_WEBHOOK_KEY` 係新 config,加入 `.env`(gitignored)+ `.env.example`(placeholder);**唔 commit 真值**。

## 3. Request payload(平台 → n8n,代表性)

> 由乙 `SubmitRequestPayload`(`request-submission.provider.ts`)直接映;provider 唔加新 domain 概念,只序列化。

```json
{
  "targetUpn": "jane.doe@rapo.com.hk",
  "opcoCode": "RHK",
  "requesterEmail": "it.rhk@rapo.com.hk",
  "remark": "New hire — standard bundle",
  "lineItems": [
    { "skuId": "<SkuCatalog.skuId GUID>", "skuPartNumber": "SPE_E3", "quantity": 1 }
  ]
}
```

| 欄 | 來源(`SubmitRequestPayload`) | 備註 |
|---|---|---|
| `targetUpn` | `payload.targetUpn` | licenses 對象;**H4:唔 log** |
| `opcoCode` | `payload.opcoCode` | `Opco.code`(如 "RHK") |
| `requesterEmail` | `payload.requesterEmail?` | optional |
| `remark` | `payload.remark?` | optional,→ ticket comments |
| `lineItems[].skuId` | `SubmitLineItem.skuId` | GUID 主鍵(M365/D365 一視同仁) |
| `lineItems[].skuPartNumber` | `SubmitLineItem.skuPartNumber?` | 可讀 ticket line |
| `lineItems[].quantity` | `SubmitLineItem.quantity` | ≥1 |

## 4. Response shape(n8n → 平台,**同步回**,代表性)

> Fork 2 = 同步回:n8n「Respond to Webhook」node 建好 tickets 後即回 REQ + 每 line RITM 嘅 sysId/number。provider 解析 → 組 `SubmittedRequest`(`request-submission.provider.ts`)。**line 對映靠 index 次序**(payload.lineItems[i] ↔ response.lineItems[i],同乙 zip-by-index)。

```json
{
  "request": { "sysId": "<sc_request sysId>", "number": "REQ0012345" },
  "lineItems": [
    { "skuId": "<GUID>", "sysId": "<sc_req_item sysId>", "number": "RITM0012345" }
  ]
}
```

| response 欄 | → `SubmittedRequest` | 備註 |
|---|---|---|
| `request.sysId` | `serviceNowSysId`(REQ 父) | **必**;缺 → throw(fail-closed) |
| `request.number` | `serviceNowNumber?` | e.g. "REQ0012345" |
| `lineItems[].sysId` | `lineItems[].serviceNowSysId`(RITM) | **每 line 必**;缺/長度唔對 → throw |
| `lineItems[].number` | `lineItems[].serviceNowNumber?` | e.g. "RITM0012345" |
| `lineItems[].skuId` | 對回 payload skuId 核對(次序 + 值) | 防 n8n 亂序;唔對 → throw |
| `lineItems[].quantity` | `lineItems[].quantity`(由 payload 帶回) | provider 用 payload 值(response 唔靠) |

## 5. Fail-closed 規則(critical path,H5 test 必覆)

provider `submit()` 以下任一 → **throw**;`OutboundRequestService` 收到 throw → **唔建任何 local mirror**(同乙 SN-first ordering):

1. webhook HTTP **非 2xx**(含 timeout / network error)。
2. response 缺 `request.sysId`。
3. response `lineItems` 長度 ≠ payload lineItems 長度。
4. 任一 `lineItems[].sysId` 缺,或 `skuId` 對唔返 payload 次序。

> **orphan 風險**(同乙):n8n 已建單但平台 mirror 失敗(response 收到後、`prisma.create` 拋)→ SN 有單、平台冇 mirror。緩解:`OutboundRequestService` 已 log warn(乙既有);真補償非本 phase。

## 6. 待同 Chris(n8n owner)live 對齊(代表性 → locked)

以下轉 `locked` 前需確認(non-blocking,mock 先行):
1. 真 webhook URL 形態(path / query / 是否 per-env)。
2. 真 request payload 欄名(是否直收上述 JSON,定要 n8n-specific 包裝 / catalog item variables)。
3. 真 response shape(n8n「Respond to Webhook」實際回咩;REQ+RITM 是否同步齊)。
4. auth 真機制(header key 定 n8n webhook built-in auth / signature)。
5. n8n 端建單 workflow 是否已存在(ADR D3「既有 workflow 已識建」)定要新做。

## 7. D1 產出 / 下一步
- **D1 完成**(2026-07-15):outbound webhook 合約(方向 / auth / payload / **同步 response** / fail-closed / 對映)代表性定案 ✅。
- **D2**(下一)据本合約落地:`N8nWorkflowProvider.submit()`(POST webhook → parse response → `SubmittedRequest`;fail-closed §5)+ config(env)+ unit test。
- **D3** 選路 `useFactory`(env default direct)+ `.env.example`。**D4** H5 test 全套 + regression。**D5** verify + closeout。
