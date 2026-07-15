---
phase: W24-request-intake
deliverable: D1
status: draft-representative   # 代表性合約,待 n8n / Phase 1 team 確認真實欄位後 lock
---

# W24 Phase 甲 — Inbound Intake 合約(D1,代表性)

> **用途**:定義 n8n onboarding workflow → 平台嘅 inbound intake 合約。**代表性** = 欄位形狀依現有 `Request`/`RequestLineItem` schema + ADR-0008 推導,真實 field 名 / 值格式待同 n8n + Phase 1 team 對齊(見 §5 待確認)。D2 據此落成真 DTO + endpoint + guard + service。

## 1. 為何係新 endpoint(唔重用現有 user-facing intake)

現有 `POST /fulfilment/requests`(`IntakeRequestDto`)係 **user-facing**:`@Roles(ADMIN,REGIONAL,OPCO_IT)` + `@CurrentUser`(AUTH-3a OpCo scope,靠 user token)。n8n intake 三點根本唔同,故獨立:

| | 現有 user-facing intake | n8n inbound intake(本合約) |
|---|---|---|
| Auth | Entra/local **user JWT** + role + OpCo scope | **m2m**(machine,無 user)→ 專用 key guard |
| line items | 建空殼 → 再逐個 `POST /:id/line-items` | **一次過**帶完整 onboarding SKU 清單 |
| sync gate | 之後人手 `PATCH /:id/sync` mark | n8n 建好 AD **即帶** `azureSyncedAt` |
| SN 關聯 | 只 `serviceNowNumber` | REQ sysId+number,per-line RITM(ADR-0008 D6) |

## 2. m2m auth 決策(拍板:static API key)

- **方式**:static shared-secret **API key**,HTTP header `X-Intake-Key`;值經 `ConfigService.getOrThrow('INTAKE_API_KEY')`(H4:env only,絕不 hardcode/log,guard 唔 log key 值)。
- **Guard**:新 `IntakeKeyGuard`(**fail-closed**:header 缺 / 唔啱 → **401**,零 service 執行、零寫入)。唔用 `@Roles`/`@CurrentUser`(無 user identity)。
- **Rationale**:m2m 無 user context,shared secret 最簡;n8n workflow set header 極易;**零新 runtime dep**;符合現有 env-secret pattern(同 `AUTH_DEV_BYPASS`/`AUTH_JWT_SECRET`)。
- **升級路徑**:將來要更正規 → 換 guard 做 service principal(Entra app-only token 驗證,ADR-0002 機制),endpoint/DTO 不變。此為 D5/未來,唔喺 W24。
- **⚠️ H2/H4 note**:`INTAKE_API_KEY` 係新 secret,要加入 `.env`(gitignored)+ deploy secret;**唔 commit 真值**。

## 3. 代表性 DTO(TypeScript,class-validator)

```ts
// dto/n8n-intake.dto.ts(D2 落地;此為 D1 代表性合約)

class N8nIntakeLineItemDto {
  @IsString() skuId!: string;              // SkuCatalog.skuId GUID(§13 主鍵,M365/D365 一視同仁)
                                           //  ⚠️ 待確認:n8n 傳 GUID 定 skuPartNumber?(見 §5)
  @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsString() serviceNowRitmSysId?: string;   // sc_req_item sysId(ADR-0008 D6,per-line)
  @IsOptional() @IsString() serviceNowRitmNumber?: string;  // e.g. "RITM0012345"
}

class N8nIntakeRequestDto {
  // ── onboarding target ──
  @IsString() @MinLength(1) targetUpn!: string;             // → Request.targetUpn(必)
  @IsOptional() @IsString() targetDisplayName?: string;
  @IsString() @MinLength(1) opcoCode!: string;              // Opco.code("RHK")→ 平台 map 成 opcoId
                                                            //  ⚠️ n8n 較可能有 code 而非內部 cuid(見 §5)
  @IsOptional() @IsEmail() requesterEmail?: string;
  @IsOptional() @IsString() rawRequestText?: string;        // 原始 remark(DESIGN §6,不 auto-parse)

  // ── ServiceNow sc_request(REQ)linkage ──
  @IsOptional() @IsString() serviceNowSysId?: string;       // sc_request sysId → Request.serviceNowSysId
  @IsOptional() @IsString() serviceNowNumber?: string;      // e.g. "REQ0012345" → Request.serviceNowNumber

  // ── Phase 1 n8n linkage(sync gate,DESIGN §6)──
  @IsOptional() @IsDateString() accountCreatedAt?: string;  // AD 帳號建立時點 → Request.accountCreatedAt
  @IsOptional() @IsDateString() azureSyncedAt?: string;     // n8n 確認 AD synced → Request.azureSyncedAt
                                                            //  ★ 帶咗即過 assign sync gate,免平台再 poll/mark

  // ── line items(一次過完整清單)──
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true })
  @Type(() => N8nIntakeLineItemDto)
  lineItems!: N8nIntakeLineItemDto[];
}
```

## 4. DTO → schema 欄位對映

| DTO 欄 | → `Request` / `RequestLineItem` | 備註 |
|---|---|---|
| `targetUpn` | `Request.targetUpn` | 必;onboarding 對象 |
| `opcoCode` | → resolve `Opco.code` → `Request.opcoId` | 404 if code 唔存在 |
| `serviceNowSysId`/`Number` | `Request.serviceNowSysId`/`serviceNowNumber` | REQ 層;sysId `@unique` → idempotent key |
| `accountCreatedAt`/`azureSyncedAt` | `Request.accountCreatedAt`/`azureSyncedAt` | sync gate(§6);ISO string → DateTime |
| `rawRequestText`/`requesterEmail`/`targetDisplayName` | 同名 | optional mirror |
| `lineItems[].skuId` | → resolve `SkuCatalog.skuId` → `RequestLineItem.skuCatalogId` | 400 if SKU 唔存在/inactive |
| `lineItems[].quantity` | `RequestLineItem.quantity` | ≥1 |
| `lineItems[].serviceNowRitm*` | **schema 待加**(ADR-0008 D6:`RequestLineItem.serviceNowSysId/Number`) | D2 additive migration |
| — | `Request.status` = OPEN(default)· line `stage` = REQUESTED(default) | intake 唔定 stage,triage 先定 `procurementRequired` |
| — | `Request.handledById` = **null**(unassigned queue,待 Regional pick up) | ⚠️ 待確認要唔要 default operator |

## 5. 待 n8n / Phase 1 team 確認(lock 前必對)

1. **SKU 識別**:n8n push `skuId`(GUID,理想,§13)定 `skuPartNumber`/business name?若後者 → 平台經 `SkuCatalog.skuPartNumber`/`businessAlias` map(容錯設計)。
2. **OpCo 識別**:`opcoCode`(=`Opco.code`)定其他?確認值格式(seed code 如 "RHK"/"RAPO/IT")。
3. **REQ vs RITM**:`sc_request` sysId/number 一定有?每個 line 對一個 `sc_req_item`?(ADR-0008 目標建 REQ+RITM,intake 反向要接返)。
4. **sync gate 語意**:`azureSyncedAt` 由 n8n 帶 = AD 真 synced?抑或只係 accountCreated?(決定 assign gate 準確性)。
5. **idempotency key**:重推同 onboarding 用 `serviceNowSysId`(REQ sysId,`@unique`)做 upsert-or-skip?確認 n8n 重試行為。
6. **handledById**:intake 入嚟 unassigned(null)定指定 Regional default?

## 6. D1 產出 / 下一步

- **D1 完成**:m2m auth 拍板(static key)+ 代表性 DTO 合約 + 對映 + 待確認清單 ✅(本檔)。
- **D2**(下一)据本合約落地:`n8n-intake.dto.ts` + `IntakeKeyGuard` + intake service(resolve opcoCode/skuId → 建 `Request`+lineItems mirror,set sync gate)+ additive migration(line item SN 欄位)+ endpoint `POST /requests/intake`。
- **D3** H5 test(happy / 401 fail-closed / validation / sync gate / idempotent)。
