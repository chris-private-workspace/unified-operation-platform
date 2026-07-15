---
phase: W24-request-intake
name: "Phase 甲(inbound intake)— n8n onboarding request push → 平台接收 + 建本地 Request mirror"
sprint_week: W24
backlog_id: REQ-INTAKE (ADR-0008 Phase 甲)
start_date: 2026-07-15
end_date: TBD
status: active            # draft → active(Chris approve ADR-0008 Accepted + 開 Phase 甲)→ closed
adr: ADR-0008 (Accepted)
spec_refs:
  - docs/adr/0008-request-creation-n8n-d365-scope.md（D2 inbound · D4 mirror · D6 對映,Accepted）
  - docs/02-architecture/licenseops/DESIGN.md §1(定位)·§4.4(OpenAPI=n8n 接入點)·§6(domain model / azureSyncedAt sync gate)·§7(request 生命週期)
  - CLAUDE.md §5.2 H2(n8n active)·§5.4 H4(m2m secret 唔 log/hardcode)·§5.5 H5(建 request mirror = critical path adjacent)
  - apps/api/src/fulfilment/*（既有 module D 履行,intake 係其上游)
prior_phase: W23-B-assets-inline-edit
---

# Phase 甲 — Inbound intake(n8n onboarding request → 平台)

> **Plan version**:1.0(**active** — Chris approve ADR-0008 Accepted 2026-07-15)· **Owner**:Chris Lai · **ADR**:ADR-0008(Accepted)
> **緣起**:onboarding 由 n8n 執行(requester ServiceNow 開單 → 觸發 n8n → n8n 喺 AD 整好帳號)。workflow 完結前,n8n call 平台 API push request(帶 ServiceNow ticket 關聯 + 「已 synced」狀態)。呢個係既有 module D 履行嘅**上游來源**。方向① inbound,H2 較輕(平台被動暴露 REST endpoint)。

## 0. 前置 gate
- ADR-0008 Accepted ✅
- **doc-sync(本 phase D0,先做)**:`DESIGN §2` scope in/out + `§9 #5`(M365 only → M365+D365 + 獨立 request)+ `architecture.md §2/§11`(D365 tier)+ `BACKLOG`(R7)—— ADR Accepted 帶嚟嘅 scope 真相同步。

## 1. Scope

### In(W24 / Phase 甲)
- **Inbound intake endpoint**:平台暴露受控 REST endpoint(e.g. `POST /requests/intake`)接 n8n onboarding push;payload = requester / ServiceNow ticket 關聯(sysId/number)/ line items(SKU + qty)/ synced 狀態(`azureSyncedAt`)。
- **m2m auth**:n8n → 平台嘅 machine-to-machine 認證(非 Entra user token;e.g. static API key / service principal,細節 §2 決定)。secret 經 `ConfigService`,絕不 hardcode/log(H4)。
- **建本地 mirror**:即時建 `Request` + `RequestLineItem`(D4),帶 SN ticket 關聯 + sync gate 狀態;接返既有 module D 履行。
- **schema(additive,若需要)**:`Request` origin/type 標記(區分 onboarding-intake vs 將來 platform-created);migration additive。
- **Tests(H5)**:intake happy path(建 mirror)· 缺 auth 401 · payload validation · sync gate 狀態正確落 `azureSyncedAt` · idempotent(同 ticket 重推唔 double)。

### Out(→ 後續 phase 或明確唔做)
- Outbound 建單(`createRecord` / provider 抽象)→ **Phase 乙/丙**。
- n8n 端 workflow 實作(平台只定 API 合約;n8n 對接係 ops)→ 協調項。
- D365 catalog/ledger/對帳擴展 → **Phase 丁**。
- 前端「開單」畫面 → Phase 乙。

## 2. Approach（待 D1 落實）
- **新 controller/endpoint**:fulfilment module 內(intake 係履行上游);DTO validation(class-validator);`@Roles` 唔適用(m2m,唔係 user)→ 用專用 guard 校 m2m credential。
- **m2m auth 決策**:static API key(`INTAKE_API_KEY` via env)最簡 vs service principal —— D1 拍板。fail-closed:無/錯 key → 401,唔建任何嘢。
- **建 mirror service**:map payload → `Request`(+ line items),set `serviceNowSysId/Number` + `azureSyncedAt`;idempotent on ServiceNow number/sysId。
- **驗證**:build/lint/test + live curl(帶/唔帶 key、重推同 ticket、sync 狀態)。

## 3. Deliverables

> **命名注意**:本 phase 嘅 **D0–D4 = 交付項編號**,與 **ADR-0008 嘅 D1–D6(decision 編號)唔同**;引用 ADR 決定一律寫全稱「ADR-0008 D2」。
- **D0** — doc-sync(§0 前置 gate)。
- **D1** — m2m auth 方式拍板 + intake DTO/合約定義。
- **D2** — intake endpoint + m2m guard + 建 mirror service + module 註冊。
- **D3** — H5 tests(§1)。
- **D4** — verify(build/lint/test + live curl)+ BACKLOG/memory 同步 + progress retro + plan closed + Phase 乙 carry。

## 4. Phase Gates
- **G1** doc-sync:DESIGN/architecture/BACKLOG 反映 ADR-0008 scope。
- **G2** auth fail-closed:無/錯 m2m credential → 401,零寫入。
- **G3** intake happy:合法 payload → 建 `Request`+line items,SN 關聯 + `azureSyncedAt` 正確。
- **G4** idempotent:同 ServiceNow number 重推唔 double(update-or-skip)。
- **G5** H5 test 全綠 + 端到端 curl。
- **G6** regression:既有 module D 履行 / fulfilment spec 不破;dev-bypass 不受影響。

## 5. Risks / 誠實限制
- **m2m secret 管理**(H4):intake key 係新 secret,經 env,絕不 log/commit。
- **payload 合約依賴 n8n 端**:真實 field 名要同 n8n team 對(暫用代表性 DTO,mock 驗;真對接屬 ops)。
- **sync gate 語意**:`azureSyncedAt` 由 n8n push 帶入,取代/補充既有機制 —— 確保 assign 前檢查邏輯(DESIGN §6)一致。

## 6. Changelog
- 1.0(2026-07-15)— **active**;ADR-0008 Accepted + Chris 開 Phase 甲。inbound intake(endpoint + m2m auth + 建 mirror)。開 D0 doc-sync。
