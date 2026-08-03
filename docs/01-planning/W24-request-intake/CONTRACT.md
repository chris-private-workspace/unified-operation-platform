---
phase: W24-request-intake
deliverable: D1
status: locked   # AGENDA 10 條 2026-07-15 Chris(= n8n workflow 管理者本人)自答齊 → lock;D2 據此落 code
---

# W24 Phase 甲 — Inbound Intake 合約(D1,代表性)

> **用途**:定義 n8n onboarding workflow → 平台嘅 inbound intake 合約。**代表性** = 欄位形狀依現有 `Request`/`RequestLineItem` schema + ADR-0008 推導,真實 field 名 / 值格式待同 n8n + Phase 1 team 對齊(見 §5 待確認)。D2 據此落成真 DTO + endpoint + guard + service。**2026-07-15 LOCK**:Chris = onboarding workflow 管理者本人,AGENDA 10 條答齊,§5 由「待確認」轉「已確認」,合約定案。

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
                                           //  ✅ AGENDA B1:n8n 傳 GUID(skuId)→ 直接對主鍵,零 map
  @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsString() serviceNowRitmSysId?: string;   // sc_req_item sysId(ADR-0008 D6,per-line)— ✅ AGENDA B3:每 line 有 RITM(sysId+number),two-level 確立
  @IsOptional() @IsString() serviceNowRitmNumber?: string;  // e.g. "RITM0012345"
}

class N8nIntakeRequestDto {
  // ── onboarding target ──
  @IsString() @MinLength(1) targetUpn!: string;             // → Request.targetUpn(必)
  @IsOptional() @IsString() targetDisplayName?: string;
  @IsString() @MinLength(1) opcoCode!: string;              // Opco.code("RHK")→ 平台 map 成 opcoId
                                                            //  ✅ AGENDA B2:n8n 傳 Opco.code(如 "RHK"),同 seed 一致
  @IsOptional() @IsEmail() requesterEmail?: string;
  @IsOptional() @IsString() rawRequestText?: string;        // 原始 remark(DESIGN §6,不 auto-parse)

  // ── ServiceNow sc_request(REQ)linkage ──
  @IsString() serviceNowSysId!: string;                     // sc_request sysId → Request.serviceNowSysId(REQ)
                                                            //  ✅ AGENDA B3/B5:REQ 必有 → 收緊為必填,做 idempotency key(@unique upsert-or-skip)
  @IsOptional() @IsString() serviceNowNumber?: string;      // e.g. "REQ0012345" → Request.serviceNowNumber

  // ── Phase 1 n8n linkage(sync gate,DESIGN §6)──
  @IsOptional() @IsDateString() accountCreatedAt?: string;  // AD 帳號建立時點 → Request.accountCreatedAt
  @IsOptional() @IsDateString() azureSyncedAt?: string;     // n8n 確認 AD synced → Request.azureSyncedAt
                                                            //  ✅ AGENDA A4:on-prem AD → Entra Connect 有延遲,故此值=n8n 聲稱 synced,≠Graph 即見;assign 以 findUser(upn) 真命中為 gate + retry(RISK R3)

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

> **REQ/RITM 語意 — two-level 統一(Chris 拍板 2026-07-15,option a)**:`Request.serviceNow*` = **REQ**(`sc_request` 父)、`RequestLineItem.serviceNow*` = **RITM**(`sc_req_item` 子)。
> **⚠️ 遷移現實**:現有 W03 user-facing intake + schema 一直將 `Request.serviceNow*` 當 **RITM** 用(`assign.service` 回寫 `addWorkNote(request.serviceNowSysId)` 打 `sc_req_item`;`intake.dto` desc 寫「RITM」)。**(a) 決定 = 兩條 intake(n8n + user-facing)一齊升 two-level**:`Request` 改存 REQ、RITM 落 line item、**回寫改逐 line item 打自己 RITM**(`servicenow.service` 加 table 參數,**touch W04 assign critical path → H5 test 必跟**)。
> 因 **seed 零 SN 數據**(已驗),**零 migration 包袱**;schema 兩層 SN 欄皆 nullable。詳細 reconcile 分析見對話記錄 / 待補入 Phase 甲(n8n)+ Phase 乙(user-facing)plan。

## 5. ✅ 已確認(AGENDA 2026-07-15,Chris = n8n workflow 管理者本人自答)

> 原「待 n8n / Phase 1 team 確認」6 條全部 close。決定總結表見 `N8N-AGENDA.md` 頂部。

1. **SKU 識別**(B1):n8n 傳 **GUID `skuId`** → 直接對 `SkuCatalog.skuId` 主鍵,零 map。
2. **OpCo 識別**(B2):傳 **`Opco.code`**(如 "RHK"),同 seed 一致 → resolve `opcoId`;code 唔存在 → 404。
3. **REQ vs RITM**(B3):onboarding **REQ 必有**(sysId+number)+ **每 line 一個 RITM**(sysId+number)→ **two-level 確立**(`Request`=REQ / `RequestLineItem`=RITM,§4)。
4. **sync gate 語意**(A4):n8n 建 **on-prem AD**,經 Entra Connect **有延遲** → `azureSyncedAt`=n8n 聲稱,**≠**Graph 即見;assign 以 `findUser(upn)` 命中為 gate + retry(**RISK R3**)。
5. **idempotency key**(B5/A1):intake **只走 n8n push**(唔 poll SN);**REQ sysId**(`@unique`)做 **upsert-or-skip**,重推唔 double。
6. **handledById**(B6/A2):intake 入嚟 **unassigned**(null)→ 入 Regional queue **人手** assign(**非自動**;A2 唔觸 auto-assign orchestration → 唔觸 H1/ADR)。

**A3(push 位置,補)**:AD 建好後 **non-blocking push**(fire-and-forget,失敗只 log 唔中斷 onboarding)→ 平台唔做 onboarding single point of failure。記入 `DESIGN §7`。

## 6. D1 產出 / 下一步

- **D1 完成 + LOCK**(2026-07-15):m2m auth 拍板(static key)+ DTO 合約 + 對映 + **AGENDA 10 條答齊**(§5 已確認)✅。合約 lock,D2 據此落 code。
- **D2**(下一)据本合約落地:`n8n-intake.dto.ts` + `IntakeKeyGuard` + intake service(resolve opcoCode/skuId → 建 `Request`+lineItems mirror,set sync gate)+ additive migration(line item SN 欄位)+ endpoint `POST /requests/intake`。
- **D3** H5 test(happy / 401 fail-closed / validation / sync gate / idempotent)。

## 7. Addendum(CH-020 / ADR-0024,2026-08-03)—— 同一條 URL,兩張合約

> 🔴 **本節唔改上面任何 locked 內容。** §3 個 DTO、§4 對映、§5 十條決定,對「唔帶 `mode` 嘅 caller」逐字有效。本節只係記低:呢條 URL 而家仲會接另一張合約。

`POST /requests/intake` 由 CH-020 起靠 **body 有冇 `mode`** 分流:

| body | 綁 | 行為 |
|---|---|---|
| 冇 `mode` | `N8nIntakeRequestDto`(**本文件 §3,一個字唔改**) | 同 2026-07-15 lock 完全一樣 |
| `mode: 1` | `N8nFlatIntakeDto`(`dto/n8n-flat-intake.dto.ts`) | n8n workflow 1001 今日實際送嘅 flat 形狀 |
| `mode` 其他值 | — | **400,零寫入**(唔估) |

**點解係「加一張」唔係「放寬一張」**:1001 冇送 `serviceNowSysId` 同 `lineItems`。要令佢過到 §3,就要把兩個 required 欄變 optional —— 而 `serviceNowSysId` 正正係 §5.5 嗰個 `@unique` idempotency key,一放寬,**所有** caller 嘅 upsert-or-skip 保護就冇埋。分流做到同樣效果而本文件嘅 caller 零影響。

Flat 路自己有兩件事同 §3 唔同,兩件都唔動本合約:

1. **REQ 用 number 唔用 sysId** —— 平台自己 `getRecordByNumber(..., 'sc_request')` 反查(ADR-0017 D4 OQ-3 先例)。**idempotency key 一個字冇變**,仍然係 `Request.serviceNowSysId`。
2. **多兩個 line item 欄** `serviceNowTaskSysId` / `serviceNowTaskNumber`(ADR-0024 D1)。⚠️ 佢哋**刻意唔喺 §3 個 DTO 出現** —— 帶住 task sys_id 嘅 line 會行 by-task close,而嗰條路由構造上繞過 ADR-0018 D3 嘅「唯一 active task」保護。唔開放畀 canonical caller = 爆炸半徑細一格。

Auth 不變:同一個 `IntakeKeyGuard` / 同一個 `X-Intake-Key`(§2),兩張合約共用。
🔴 **部署前提(ADR-0024 OQ-3)**:1001 個 HTTP node 用嘅 credential 叫「n8n Academy API Key」,workflow JSON 睇唔到佢送咩 header。若唔係 `X-Intake-Key`,呢條鏈連 401 都過唔到 —— 要 n8n 側確認。
