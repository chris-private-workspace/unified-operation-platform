# ADR-0013: 整合 connector 非機密配置經 UI 管理(Model C — 非機密落 DB / secret 仍 env)

**Date**: 2026-07-22
**Status**: **Accepted**
**Approver**: Chris Lai(2026-07-22 拍板:**OQ-1 = C2 restart 生效** · **OQ-2 = `SERVICENOW_USER` env-only** · **OQ-3 = Graph + ServiceNow + n8n outbound 三 connector 一次過** · **OQ-4 = 一 row 一 connector 結構化欄**)

> 本 ADR 係 **ADR-0010 item 4 嘅擴展**:由「唯讀觀測 + test connection」擴到「**非機密** config 可經 UI 寫」。**唔 supersede** ADR-0010 —— D2(絕不回傳 secret)/ D3(三態)/ D4(派生 timestamp)/ D5(唯讀探針)全部保留並沿用。

## Context

### 觸發

Owner 要求「喺 UI 頁面設定 connector 連接」。現況(全部有 code 佐證,2026-07-22):**所有** connector config 只經環境變數,喺 service constructor `getOrThrow` 一次過讀死:

| Connector | 讀取點 | env |
|---|---|---|
| Microsoft Graph | `graph.service.ts:37-46` | `GRAPH_TENANT_ID` · `GRAPH_CLIENT_ID` · `GRAPH_CLIENT_SECRET` |
| ServiceNow | `servicenow.service.ts:22-33` | `SERVICENOW_INSTANCE_URL` · `SERVICENOW_USER` · `SERVICENOW_PASSWORD` · `SERVICENOW_DEFAULT_TABLE`(有 fallback) |
| n8n outbound | `n8n-workflow.provider.ts:41-42` · 選路 `fulfilment.module.ts:35` | `REQUEST_SUBMISSION_PROVIDER` · `N8N_OUTBOUND_WEBHOOK_URL` · `N8N_OUTBOUND_WEBHOOK_KEY` |
| n8n inbound | `intake-key.guard.ts:24` | `INTAKE_API_KEY` |

**痛點**:UAT(ACA)改任何一個值(例:換 ServiceNow instance、換 Graph app、切 provider 路由)都要**改 env → 重 build image → 重 deploy revision**。最慢係重 build image。

### 為何而家先做 / 點解 ADR-0010 冇做

ADR-0010 item 4 刻意只做**唯讀觀測**,冇做「UI 設定」,主因係 D2 定咗「status endpoint 絕不回傳 secret」。當時揀「觀測而唔設定」正正就係避開「secret 出入 UI」嘅 H4 張力。本 ADR **唔碰嗰條張力** —— secret 邊界一步都唔動,只把**非機密** config 搬到 UI 可管理。

### 觸發嘅 hard constraint

- 🟡 **H1**(`CLAUDE.md §5.1`)—— 加新 model(`ConnectorConfig`)+ 改 config 來源(env → DB-then-env fallback)= 動到資料模型 + config 假設。
- 🟢 **H4**(`§5.4`)—— **唔觸發**「secret 落 DB」:真 secret 仍只喺 env。
- 📝 **§3.1 config convention** 由「config 一律 from env(`ConfigService`)」作**有限修訂**:非機密 config 可 DB 覆蓋、機密仍 `getOrThrow` env。

### 三個 model 對比(owner 已揀 C)

| | 做法 | H4 代價 | 當前環境可行性 |
|---|---|---|---|
| A | connector config 全落 DB,secret app 層加密;vendor client 改 runtime 重讀 | 🔴 最高(secret 落 DB = 新攻擊面) | ✅ 可行,工作量最大,推翻 D2 |
| B | UI 做代理,寫入 Azure Key Vault / ACA secret,唔落 app DB | 🟢 secret 唔落 DB | ❌ UAT 唔 work(公司 proxy 擋 KV data-plane;ACA secret 改要 new revision) |
| **C**(選中)| **非機密欄落 DB 可 UI 改;真 secret 仍只經 env** | 🟢 secret 邊界唔動 | ✅ 可行,工作量中,**D2 保得住** |

## Decision

### D1 — 範圍:非機密 config 經 UI(ADMIN)管理,落新 `ConnectorConfig` model;secret 永遠只 env

新增一個 `ConnectorConfig`(形態見 OQ-4)存**非機密** config 值。真 secret **一粒都唔落 DB、唔入 API 回應、唔入 audit**,仍然只經 env `getOrThrow`。本 ADR 擴展 ADR-0010 item 4,唔 supersede D2/D3/D5。

### D2 — 逐欄位切機密 / 非機密(方案骨幹)

| Connector | 欄位 | 類別 | 去向 |
|---|---|---|---|
| Graph | `GRAPH_TENANT_ID` | 識別碼(非 secret) | ✅ UI 可改(DB) |
| Graph | `GRAPH_CLIENT_ID` | 識別碼(非 secret) | ✅ UI 可改(DB) |
| Graph | `GRAPH_CLIENT_SECRET` | 🔴 secret | env-only,唯讀顯示狀態 |
| ServiceNow | `SERVICENOW_INSTANCE_URL` | 端點 | ✅ UI 可改 |
| ServiceNow | `SERVICENOW_DEFAULT_TABLE` | config | ✅ UI 可改 |
| ServiceNow | `SERVICENOW_USER` | 憑證一半 | env-only(**OQ-2 拍板** — 同 password 綁 basic-auth pair,唔拆) |
| ServiceNow | `SERVICENOW_PASSWORD` | 🔴 secret | env-only,唯讀顯示狀態 |
| n8n out | `REQUEST_SUBMISSION_PROVIDER` | 路由 direct/n8n | ✅ UI 可改(最抵 — toggle 唔使重部署) |
| n8n out | `N8N_OUTBOUND_WEBHOOK_URL` | 端點 | ✅ UI 可改 |
| n8n out | `N8N_OUTBOUND_WEBHOOK_KEY` | 🔴 secret | env-only,唯讀顯示狀態 |
| n8n in | `INTAKE_API_KEY` | 🔴 secret | env-only,純狀態顯示 |

### D3 — config precedence:非機密欄 DB-then-env;機密欄仍 `getOrThrow` env

引入一個 **config resolver**:非機密欄 **DB 有值就用,冇就 fallback env**(令未設定嘅部署行為完全不變);機密欄一律 `ConfigService.getOrThrow`。三個整合點(`GraphService` / `ServiceNowService` / `requestSubmissionProviderFactory`)由「直接 `getOrThrow` 全部」改成「機密 `getOrThrow` + 非機密經 resolver」。**唯一真相由 resolver 統一**,唔喺 service 各自散讀。

### D4 — 生效方式:C2 restart 生效【OQ-1 — 2026-07-22 拍板】

`GraphService` / `ServiceNowService` 而家喺 **constructor 一次過讀死 env** 建 client。要 UI 改嘅非機密值生效,兩條路:

| | 做法 | 生效 | 工作量 / 風險 |
|---|---|---|---|
| **C2**(draft 傾向)| UI 寫 DB;app **開機時** 經 resolver(DB 覆蓋 env)建 client | 改完**要 restart 一個 revision** | 細 — 唔郁 vendor client lifecycle。UAT 已賺到「唔使重 build image」 |
| C1 | vendor client 改成 runtime 由 resolver 攞當前值,可熱重建 | **即時生效** | 大 — 要重構 Graph/SN client 生命週期,H1 更重 |

**拍板(2026-07-22)**:C2 起步。UAT 最慢係「重 build image」,C2 已把流程變成「UI 改 DB → restart revision」;C1 嘅即時生效係 nice-to-have,第二期先加,唔一開波孭重構風險。

### D5 — secret 邊界(承 ADR-0010 D2)

- secret 值 **唔落 DB、唔入任何 API 回應、唔入 AuditLog**。
- UI 對 secret 欄**唔回顯、唔可改**,只顯示 `configured via env ✓ / 未設定`(承 ADR-0010 D2「連 masked 都唔回」)。
- 想改 secret → 仍然改部署層 env(本機 `.env` / UAT ACA native secret)。UI 唔提供改 secret 嘅入口 —— **唔向用戶承諾一個刻意唔做嘅嘢**(同 ADR-0010 D6 DocuWare 文案處理同一原則)。

### D6 — 安全 gating + audit

- 讀狀態沿用 ADR-0010 item 4 現狀(`useIntegrations`,ADMIN-only);寫入 `PATCH` **`@Roles(ADMIN)`**(同 W28/W29/ADR-0010 D5 一致)。
- 每次寫入落 **`AuditLog`**(ADR-0009 已支援,`actorType` = 真人 ADMIN),白名單 before/after —— **只記非機密欄**;secret 欄根本唔經呢條路,天然唔會入 audit。

### D7 — 寫入前 validate,唔做 test-on-write

寫入前做結構 validation(URL 格式、`REQUEST_SUBMISSION_PROVIDER` enum、GUID 格式)。**唔**喺寫入時自動打 vendor 測連線 —— 測連線係另一個明確、用戶觸發嘅動作(ADR-0010 D5 Test connection),兩者唔混。

## 實作補註(implementation notes)

> **性質**:落地時查證先浮出嚟嘅資訊。上面已 Accepted 嘅決定**一個字都冇改** —— 呢度只係**補一個連帶後果**同**加一個 connector**。要推翻上面任何一條,寫新 ADR。

### W39(2026-07-28)— 第四個 connector:`n8n-license`

D2 個表補兩行(secret 邊界照舊):

| Connector | 欄位 | 類別 | 去向 |
|---|---|---|---|
| n8n license | `LICENSE_OPS_PROVIDER` | 路由 graph/n8n | ✅ UI 可改(DB `licenseOpsProvider`) |
| n8n license | `N8N_LICENSE_BASE_URL` | 端點 | ✅ UI 可改(DB `n8nLicenseBaseUrl`) |
| n8n license | `N8N_LICENSE_WEBHOOK_KEY` | 🔴 secret | env-only,唯讀顯示狀態 |

呢個掣就係 **ADR-0017 D1 要求嘅「逐接縫一個掣」**嘅第二個(第一個 = `REQUEST_SUBMISSION_PROVIDER`)。**預設 `graph`,而且任何非 `'n8n'` 字串(unset / typo / 半完成配置)一律 resolve 落 Graph** —— 唔完整嘅配置絕不可以靜靜把真 licence 派發路由去第三方。

### 🔴 連帶後果:加 connector = 改 schema,呢點原文冇講

**`ConnectorConfig` 係具名 column model,唔係 key-value bag**(見 OQ-4「一 row 一 connector」)。所以**任何新 connector 嘅非機密欄位,都必然要 `ALTER TABLE` 加 column** —— 即係**每次加 connector 都觸發 H1**,要 owner approve。

W39 kickoff 時把「零 schema」寫入 plan 做 gate,寫實作先發現呢個假設破產。**下一個加 connector 嘅人會踩同一個坑**,所以記喺呢度而唔係只記喺 W39 progress。

W39 嘅 migration(`20260728021452_w39_n8n_license_connector`)純 additive、兩個 nullable TEXT、零遷移風險,Chris 2026-07-28 approve。

> **點解揀加 column 而唔係全走 env**:`n8n-inbound` 已經有 `editable: []` 嘅先例(只有 secret),所以「connector 冇可編輯欄位」係已存在形態,技術上行得通。但走 env 就冇 UI 掣,而 UAT 改 env 要經 Azure —— 直接違背 ADR-0017 D1「逐接縫可切換」嘅目的。

### 點解唔開新 ADR

Model C 決定冇變 · secret 邊界(D2/D5)冇變 · resolver 機制(D3)冇變 · 生效方式(D4 C2 restart)冇變。只係**多一個 connector 沿用同一模式**。同 W29 對 ADR-0009 Decision 5、W38 對 ADR-0017 嘅做法同構:**收緊 / 補充,唔推翻**。

---

## Alternatives Considered

- **Model A(全 DB app 層加密)** — rejected:secret 落 DB = 新攻擊面(DB dump + master key 洩漏即全洩),實質降低現有「secret 只喺 env」保證;且要重構 vendor client lifecycle;且推翻 ADR-0010 D2。
- **Model B(UI 寫 KV / ACA secret)** — rejected:UAT 公司 proxy 擋 KV data-plane(見 `project_azure-uat-deployment` 環境規律),ACA secret 改要 new revision,當前環境唔順。
- **維持現狀(env-only)** — rejected:UAT 改任何 connector 都要重 build image,運維痛,正正係本 ADR 要解嘅問題。
- **`SERVICENOW_USER` 落 DB(UI 可改)** — draft 傾向 rejected(見 OQ-2):user + password 綁埋組成 basic-auth header(`servicenow.service.ts:26-29`),拆開令 auth header 橫跨兩來源,增加組裝出錯面;整對 basic-auth 當 env-only 更乾淨。
- **Chosen: Model C** — 因為滿足「非機密 config UI 可改(含 UAT 唔使重 build)」嘅同時,secret 邊界一步唔動、ADR-0010 D2 保得住、H4 唔觸發。

## Consequences

- **Positive**:UAT / prod 改非機密 config 唔使重 build image;`REQUEST_SUBMISSION_PROVIDER` 可 UI toggle;secret 邊界唔動、D2 保住;寫入有 audit 跡;Integrations tab 由「唯讀」進化到「可管理非機密面」。
- **Negative**:新 model + migration(H1);config 來源由純 env 變成 DB-then-env(兩處來源,靠 resolver 統一真相,理解成本上升);C2 之下改完要 restart 一個 revision 先生效。
- **Neutral**:對帳方案甲 / ledger 兩層數字 / sync gate / ADR-0008 provider 選路 / ADR-0009 audit / ADR-0010 item 4 觀測面 全部不受影響。

## Open Questions

| # | 問題 | 拍板(2026-07-22) |
|---|---|---|
| **OQ-1** | 生效方式 C1(即時,重構 client)vs C2(restart)? | ✅ **C2** — restart 生效,唔重構 vendor client(D4) |
| **OQ-2** | `SERVICENOW_USER` 當非機密(UI 可改)定機密(env-only)? | ✅ **env-only** — 同 password 綁 basic-auth pair,唔拆 |
| **OQ-3** | 首期做晒 4 個 connector,定先做 subset? | ✅ **Graph + ServiceNow + n8n outbound 三 connector 一次過** — intake 全 secret 只顯示狀態;overhead 一次起,subset 反而要第二 phase 重複 |
| **OQ-4** | `ConnectorConfig` 形態:一 row 一 connector vs 通用 key-value? | ✅ **一 row 一 connector + 結構化欄** — connector 固定,type-safe + audit before/after 清晰;通用 key-value = over-engineering(§1.2) |

## References

- **ADR-0010**(item 4 唯讀觀測 + test connection;本 ADR 擴展,唔 supersede)· **ADR-0008**(provider 選路 `REQUEST_SUBMISSION_PROVIDER`)· **ADR-0009**(audit trail — 寫入落 `AuditLog`)
- `CLAUDE.md` §5.1 H1 · §5.4 H4 · §3.1 config convention · §5.3 H3(secret 邊界)
- `docs/05-usage/INTEGRATION_SETUP.md` · `apps/api/.env.example`
- code:`graph.service.ts:37-46` · `servicenow.service.ts:22-33` · `n8n-workflow.provider.ts:41-42` · `intake-key.guard.ts:24` · `fulfilment.module.ts:35`
- `project_azure-uat-deployment`(UAT 環境規律 — 點解 Model B 唔可行)
