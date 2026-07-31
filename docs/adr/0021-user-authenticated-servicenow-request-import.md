# ADR-0021: 由真 ServiceNow REQ 號碼導入 request —— `IntakeService` 開第二個 caller(user-authenticated)

**Date**: 2026-07-31
**Status**: Accepted
**Approver**: Chris Lai

## Context

### 觸發

n8n UAT 一直連唔上,冇任何嘢會推 onboarding request 入平台,令下游(assign / 預算 gate / ticket 回寫 / drift)全部驗唔到 —— 全部都要有真單先行得。

W41 之後開咗過渡工具 `apps/api/scripts/intake-from-servicenow.ts`(PR #61),由真 REQ 號碼反查 RITM 再推入 intake,並且已用 `REQ0044038` live 驗通成條 HOLD 路徑(真 Graph `findUser` → 預算 gate → 真 SN catalog task `SCTASK0071802` 由 `state=1` 變 `state=2`)。

Chris 要求把呢個能力搬上 UI(逐字):

> 「再在UOP有個簡單功能提供給上傳這些serviceNow request數據」
> 「我建議是只提供request號碼就可以自動抓取其他的id 等等」

### 現況:`IntakeService` 今日只有一個 caller

| Route | Guard | 誰打 |
|---|---|---|
| `POST /requests/intake` | `@Public()` + `IntakeKeyGuard` | n8n(canonical 合約,W24 LOCKED) |
| `POST /requests/intake/n8n` | `@Public()` + `IntakeKeyGuard`(**同一條 key**) | n8n(原生信封,ADR-0017 D4) |

兩條都係 m2m shared secret,**冇 user JWT、冇 role**。呢個唔係巧合 —— ADR-0017 D4 落地時嘅 OQ-3 係明文咁揀:**one caller, one trust boundary, one secret to rotate**(逐字記錄喺 `apps/api/src/fulfilment/intake.controller.ts:50-52`)。

### 點解「照用既有 route」行唔通

前端**唔可以**持有 `INTAKE_API_KEY`。任何落到 browser bundle 嘅值都等於公開(**§5.4 H4**),而嗰條 key 嘅能力係「憑一個 payload 喺平台生成 request」。

⇒ 呢個功能**無論點實作**都要有一條 user-authenticated 路入 `IntakeService`,亦即 OQ-3 嗰個「一個 caller」嘅前提由此唔再成立。

### 觸發嘅 hard constraint

- **§5.1 H1** — 新增 API surface;改動 `IntakeService` 嘅入口拓撲(由一個 caller 變兩個)、亦即改動 intake 嘅信任邊界設計
- **§5.3 H3**(已檢視,**唔違反**)— LicenseOps 排除項係「ticket 申請表單 / 審批鏈 / SLA」。本決定唔開表單畀 end user 申請,而係畀 ADMIN 由**已存在**嘅 SN 單導入,屬 ops / 補救面
- **§5.4 H4** — 見上,正正係呢條逼出本 ADR

### 定位(Chris 2026-07-31 拍板)

**唔係「n8n 通咗就刪」嘅臨時嘢。** 就算 n8n 接通,「一張單 n8n 漏咗 / 推失敗 / 要重推」呢個補救場景仍然長期存在,而今日嘅補救手段係叫人開 terminal 跑 npm script。

呢個定位係本 ADR 值唔值得寫嘅前提:如果佢係即棄品,理性答案應該係**唔做 UI、繼續用 script**,唔好為咗一個會死嘅功能去改 intake 嘅信任邊界。

## Decision

### D1 — 新增兩條 user-authenticated endpoint

| Route | 性質 | Guard |
|---|---|---|
| `GET /requests/servicenow-lookup?req=<REQ>` | **唯讀**。反查 `sc_request` → `sc_req_item` → 每張 RITM 數 `sc_task^active=true`,回傳可否導入 | JWT + `@Roles(ADMIN)` |
| `POST /requests/import-from-servicenow` | 導入。組 canonical payload → **直接 call `IntakeService`** | JWT + `@Roles(ADMIN)` |

兩條都**唔碰** `IntakeKeyGuard`,亦**唔接受** `X-Intake-Key`。m2m secret 嘅邊界一個字唔動 —— 被改嘅係「入口唯一性」,唔係「secret 強度」。呢個區分係本 ADR 嘅核心:**新路徑用一個完全獨立、更嚴格(具名 + role + audit)嘅信任模型**,而唔係把既有嗰個放寬。

### D2 — canonical 合約零改動,沿用 ADR-0017 D4 立嘅 pattern

ADR-0017 D4 面對同類問題(n8n 信封同 canonical DTO 對唔上)時嘅答案係:**唔改 LOCKED 合約,另開一條 route 做 resolve**,並明文寫低「adapter 係另一條 route,LOCKED 合約嘅嚴格性對其他 caller 完全保留」。

本決定係同一 pattern 嘅**第三次應用**:再加一條 route,`CONTRACT.md` canonical DTO 同 `IntakeService` 內部邏輯**一個字都唔改**。

🔴 **硬邊界(實作時 diff 必須為 0)**:
- `apps/api/src/fulfilment/intake.service.ts`
- `apps/api/src/fulfilment/dto/n8n-intake.dto.ts`
- `apps/api/src/fulfilment/intake-key.guard.ts`
- 既有兩條 intake route 嘅 guard / DTO / 行為

### D3 — 角色:`ADMIN` only(Chris 拍板)

唔開 `OPCO_IT`。除咗 fail-safe(放寬易過收窄)之外有一個結構理由:**OpCo 係由 SN 個 Job Function 推導,要反查完先知**,即係「你有冇權導呢張單」要打完 SN 先答得到 —— 呢種「先做外部呼叫先答得到授權」嘅 gate 形狀本身就易出錯。

放寬到 OPCO_IT 屬**重開本 ADR**,唔可以喺實作裡面順手加。

### D4 — licence code 必須人手揀,平台**唔猜**

SN 個 RITM 標題(「Create a new O365 user license maintenance request」)同平台 `skuPartNumber`(`SPE_E5`)之間**冇任何機械對應**。UI 強制人手揀,唔提供任何「自動填」。

🔴 **絕不可以**把 SN 標籤塞入 `SkuCatalog.businessAlias` 嚟造對應 —— 嗰個 column 屬 ADR-0004 allocation import,污染咗會連 import 一齊搞爛。

呢條同 ADR-0017 D4 嘅「兩個 E5 ⇒ 必須唯一命中,多過一個候選即 fail-closed」係同一條原則(CLAUDE.md「SKU 一律 `skuId` GUID,唔靠名」)嘅延伸:**分唔清就停,唔好揀第一個。**

### D5 — server 自己反查,唔信 client 傳嘅 `ritmSysId`

client 只可以傳 REQ number + 佢揀咗嘅 RITM number + `skuCatalogId` + target UPN。`ritmSysId` 一律由 server 反查得出;client 送嚟嘅 RITM 若唔屬該 REQ → **400 且零寫入**。

否則改個 request body 就可以叫平台 mirror 一張唔相干嘅 SN 單。

### D6 — 一個共用 lookup service,script 同 endpoint 唔各寫一次

反查邏輯抽入 `src/fulfilment/`(或 `src/integration/servicenow/`),`intake-from-servicenow.ts` 改為 consume 佢。

**script 唔刪** —— 佢係呢條 UI 路徑嘅可執行規格,而且 ops / CI 場景(無 browser)仍然用得著。兩者共用同一份 lookup 就唔會 drift。

### D7 — 每次導入寫 `AuditLog`,action 獨立

`request.imported_from_servicenow`(具體 key 實作時對 ADR-0009 白名單)。理由:呢條路可以憑一個號碼喺平台生成真 request,「呢張單點嚟」必須查得返。

沿用 ADR-0009 三層白名單 —— metadata 只放 REQ number / RITM number / `skuCatalogId` 呢類**非 PII** 值,**唔放 target UPN**(跟 `OutboundFailure` 先例)。

### D8 — 唔做嘅嘢(明文)

- ❌ CSV / 檔案上傳、批量多個 REQ —— Chris 明確講「只提供 request 號碼」
- ❌ 建新 SN 單 —— 已有 `/requests/new`(W25),兩件事唔可以撈埋
- ❌ 推 stage / 觸發 assign —— 導入完就停,之後照行既有 UI 流程
- ❌ 自動開 sync gate —— `azureSyncedAt` 維持 null,交 ADR-0015 sweep 或人手 break-glass
- ❌ 碰 n8n 任何路徑

## Alternatives Considered

- **Option A:前端直接持 `INTAKE_API_KEY` 打既有 route** — **rejected**。任何落到 browser bundle 嘅值等於公開(H4)。而嗰條 key 嘅能力係「憑 payload 生成 request」,公開咗即係任何人都做得到。呢個選項唔係「風險高」,係**直接違反 H4**。

- **Option B:新 endpoint 收 JWT,server 再用 m2m key HTTP call 自己** — **rejected**。信任邊界冇任何實質改善(`IntakeService` 一樣多咗一個 user-authenticated 起點,只係中間包咗一層),但代價係平台要知道自己嘅 URL、多一個網絡 hop、多一個會 timeout 嘅位。用複雜度換一個假嘅「冇加 caller」。

- **Option C:擴 `IntakeKeyGuard` 令佢同時接受 JWT** — **rejected**。一個 guard 兩種信任模型係最容易出事嘅形狀:日後改其中一邊嘅邏輯,好易靜靜影響另一邊。分開兩條 route、兩個 guard,錯嘅時候至少錯得清楚。

- **Option D:唔做 UI,繼續用 script** — **rejected**,但**唔係因為佢差**。如果呢個功能係「n8n 通咗就刪」嘅即棄品,呢個就係正確答案(spec §1.1 / §6.2 曾明文建議考慮)。Chris 拍板定位為**長期補救工具**之後先被 reject:補救場景長期存在,而補救手段唔應該係「開 terminal + 有 checkout + 有 `.env` 真憑證」。

- **Chosen:D — 新增獨立 user-authenticated route,直接 call `IntakeService`** — 因為佢係唯一同時滿足以下三項嘅做法:前端唔掂 m2m secret(H4)、canonical 合約零改動(ADR-0008 D3 LOCKED)、新路徑嘅信任模型比舊嗰個**更嚴格**而唔係更鬆。

## Consequences

### Positive

- 補救一張漏咗嘅單唔再需要 terminal / checkout / 真憑證 `.env`
- 新路徑係**具名**嘅(JWT + ADMIN + audit),比 m2m shared secret 嗰條**問責性更強** —— m2m 那邊只知「有人用咗 key」
- script 同 UI 共用同一份 lookup(D6),唔會出現兩套反查邏輯各自 drift
- 反查(D1 lookup)本身把 ADR-0018 D3 嘅「恰好一個 active task」規則**提前**曝露畀操作員,唔使等 assign 完先發現張單 close 唔到

### Negative

- 🔴 **`IntakeService` 由一個 caller 變兩個。** 日後改 intake 行為,要同時諗兩條路 —— ADR-0017 OQ-3 揀「一個 caller」正正係想避開呢件事。本 ADR 正式更新嗰個前提。
- 🔴 **多咗一個可以憑號碼喺平台生成真 request 嘅入口。** 緩解係程序性 + 技術性各半:D3 收窄到 ADMIN、D7 每次寫 audit。但**冇任何嘢阻止一個 ADMIN 大量導入** —— 呢點唔扮睇唔見。
- 反查打真 SN:一個 REQ 帶 N 張 RITM = `1 + N` 個 GET。preview 唔自動跑(要撳掣)、唔加 retry、唔做批量,但仍然係新增嘅 SN 流量。

### Neutral

- `intake-from-servicenow.ts` 保留,唔因為有 UI 就刪
- ADR-0017 OQ-3 **唔標 superseded** —— 佢當時嘅推理(對 n8n 呢個 caller 而言,一條 key 一個邊界)今日仍然成立。本 ADR 只係加咗一個**唔用嗰條 key** 嘅 caller
- 前端零新 primitive / 零新 token(H6):用既有 `dialog` / `select` / `input` / `badge`

## References

- **CH-013** — `docs/03-implementation/changes/CH-013-sn-request-import-ui/spec.md`(本 ADR 係佢 §6.1 嘅 blocking gate)
- **ADR-0008** D3 — intake canonical 合約 LOCKED
- **ADR-0017** D4 — n8n intake adapter;「另開一條 route、canonical 合約唔改」pattern 嘅來源;OQ-3「one caller, one trust boundary, one secret to rotate」= 本 ADR 更新嘅前提
- **ADR-0018** D3 — catalog task 必須恰好一個 active(lookup 提前曝露呢條規則)
- **ADR-0009** — audit 三層白名單(D7)
- **ADR-0004** — allocation import;`businessAlias` 嘅歸屬(D4 紅線)
- **ADR-0015** — sync sweep(D8:導入唔開 sync gate)
- **PR #61** — `apps/api/scripts/intake-from-servicenow.ts` + RISK R6
- `apps/api/src/fulfilment/intake.controller.ts:50-52` — OQ-3 逐字記錄
- CLAUDE.md §5.1 H1 · §5.3 H3 · §5.4 H4
