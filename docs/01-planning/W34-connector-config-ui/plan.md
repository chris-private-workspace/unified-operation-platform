---
phase: W34-connector-config-ui
name: "Connector 非機密配置經 UI 管理 — Model C(ADR-0013)"
sprint_week: W34
start_date: 2026-07-22
end_date:
status: closed                # draft | active | closed — 🟢 2026-08-20 補 flip。原本係裸 `active`,**零 comment 零 blocker**。26/29 勾,**功能項全勾**,三條未勾全部係收尾雜務(doc sync · BACKLOG 更新 · commit)。BACKLOG `INTEG-4` ✅ 2026-07-23(ADR-0013 Accepted,四條 OQ 全答);兩個 deferral 喺 `progress.md` 已定性(C1 熱重建 = 第二期 D4 · 改 secret 的 UI = **永不做**)⇒ 係已收嘅決定唔係遺留待辦。⚠️ **自證一則**:嗰條未勾嘅「BACKLOG 更新(R7)」——BACKLOG 其實早就更新咗,即**連未勾項本身都係 stale**
spec_refs:
  - docs/adr/0013-connector-config-ui-management.md（本 phase 執行嘅決定 = R1 pre-doc）
  - docs/adr/0010-integration-observability-delivery.md（item 4 觀測面,本 phase 擴展）
  - docs/05-usage/INTEGRATION_SETUP.md（connector env 真相）
prior_phase: W33-deploy-exec
---

# Phase W34 — Connector 配置 UI 管理(Model C)

> **Plan version**:1.0
> **Owner**:AI(執行)/ Chris Lai(decision)
> **R1 pre-doc**:`docs/adr/0013-connector-config-ui-management.md`(2026-07-22 Accepted,4 OQ 已拍板)。

## 1. Scope

把 connector 嘅**非機密** config(tenant/client id、instance URL、default table、provider 路由、webhook URL)搬到 UI(ADMIN)可管理,落新 `ConnectorConfig` model + DB-then-env resolver。**真 secret 一步唔動** —— 仍只經部署層 env,唔落 DB / 唔入 API 回應 / 唔入 audit。

### 拍板(ADR-0013,2026-07-22)

| OQ | 拍板 |
|---|---|
| OQ-1 生效方式 | **C2** — restart 生效,唔重構 vendor client(constructor 仍讀一次,來源由 env 改 resolver) |
| OQ-2 `SERVICENOW_USER` | **env-only**(同 password 綁 basic-auth,唔拆) |
| OQ-3 首期範圍 | **Graph + ServiceNow + n8n outbound** 三 connector 有非機密欄;intake 全 secret → 只顯示狀態 |
| OQ-4 model 形態 | **一 row 一 connector + 結構化欄**(唔用通用 key-value) |

### 可 UI 改(非機密)vs env-only(機密)

| Connector | UI 可改(DB-then-env) | env-only 機密(唯讀顯示狀態) |
|---|---|---|
| Graph | `GRAPH_TENANT_ID` · `GRAPH_CLIENT_ID` | `GRAPH_CLIENT_SECRET` |
| ServiceNow | `SERVICENOW_INSTANCE_URL` · `SERVICENOW_DEFAULT_TABLE` | `SERVICENOW_USER` · `SERVICENOW_PASSWORD` |
| n8n outbound | `REQUEST_SUBMISSION_PROVIDER` · `N8N_OUTBOUND_WEBHOOK_URL` | `N8N_OUTBOUND_WEBHOOK_KEY` |
| n8n inbound | (無) | `INTAKE_API_KEY`(純狀態) |

### 唔喺本 phase

- ❌ **C1 即時生效 / vendor client 熱重建**(第二期,ADR-0013 D4)
- ❌ **改 secret 嘅 UI 入口**(secret 永遠只經 env)
- ❌ 接真 Graph / ServiceNow / n8n 憑證(仍係 deploy-time / DEPLOY-harden)
- ❌ Test-on-write 自動探針(用返 ADR-0010 D5 現有 Test connection)

## 2. Deliverables

**Backend(`apps/api`,fulfilment / integration 層)**
- `ConnectorConfig` Prisma model + migration(一 row 一 connector,非機密欄 nullable)
- `ConnectorConfigService` — resolver(非機密 DB-then-env;機密 `getOrThrow` env)+ status 派生
- wire `GraphService` / `ServiceNowService` / `requestSubmissionProviderFactory` 經 resolver 攞非機密值(機密仍直讀 env)
- ADMIN controller:`GET /admin/connectors`(值 + secret 狀態,唔回 secret 值)· `PATCH /admin/connectors/:connector`(改非機密欄 + validate + audit)
- audit 寫入(ADR-0009 `AuditLog`,白名單非機密欄 before/after)

**Frontend(`apps/web`)**
- Integrations panel 加編輯面:非機密欄可改、機密欄唯讀顯示 `configured via env ✓ / 未設定`
- query/mutation hooks + api-types
- 跑 `ui-design` skill 自檢(token-only / 一 primary / light+dark / lucide)

## 3. Acceptance(G-gates)

- [ ] **G1** — `ConnectorConfig` migration apply 乾淨,schema 對得上 `prisma/schema.prisma`
- [ ] **G2** — resolver precedence 正確:DB 有值→用 DB;DB 無→fallback env;機密→只 env(**test**)
- [ ] **G3** — 三整合點行 resolver;**未設定 DB override 時行為與現況完全一致**(env fallback,零迴歸)
- [ ] **G4** — 🔴 **secret 邊界**:secret 值永不入 `GET` 回應、永不寫 DB、永不入 audit(**test 證明**)
- [ ] **G5** — `PATCH` `@Roles(ADMIN)`;非 ADMIN → 403(**test**)
- [ ] **G6** — 寫入落 `AuditLog`,白名單非機密欄 before/after(**test**)
- [ ] **G7** — validation:bad URL / bad `REQUEST_SUBMISSION_PROVIDER` enum / bad GUID 一律拒絕(**test**)
- [ ] **G8** — 前端編輯面 token-only、一 primary、light+dark、secret 欄唯讀(**ui-design skill 過**)
- [ ] **G9** — api test 全 pass(現 345)+ web test 全 pass;無 linter warning

## 4. Steps(implementation order)

| # | Step | verify |
|---|---|---|
| S1 | `ConnectorConfig` model + migration | migrate deploy 乾淨 + `prisma generate`(G1) |
| S2 | `ConnectorConfigService` resolver + status | precedence unit test(G2) |
| S3 | wire Graph / SN / n8n outbound 經 resolver | 現有整合 test 仍 pass,env fallback 不變(G3) |
| S4 | ADMIN controller GET/PATCH + DTO validation | ADMIN gating + validation test(G5/G7) |
| S5 | audit 寫入 + secret 邊界守衛 | secret-never-leaks + audit test(G4/G6) |
| S6 | 前端 hooks + api-types | — |
| S7 | Integrations panel 編輯面(secret 唯讀)+ ui-design | ui-design 自檢(G8) |
| S8 | 前端 test | web test pass |
| S9 | doc sync(design-system 若需)+ BACKLOG + memory | G9 全綠 + checklist tick |

## 5. Hard-constraint 自檢(貫穿全 phase)

- **H1** ✅ 已 ADR-0013 授權(新 model + config resolver)。實作唔可超出 ADR scope。
- **H4** 🔴 **最高警覺** — secret 永不落 DB / response / audit(G4 係 hard gate,唔過唔收)。
- **H5** — secret 邊界 + resolver precedence + ADMIN gating = critical,必寫 test。
- **H6** — 前端 commit 前跑 ui-design;secret 唯讀顯示唔可 hardcode 色。
- **H7/H8** — 跑 test / migrate 一 command 一 turn 貼真 output;讀檔用 Read/Grep。

## 6. Dependencies / 風險

- 依賴 ADR-0009 `AuditLog`(已存在)、ADR-0008 `REQUEST_SUBMISSION_PROVIDER` 選路(已存在)。
- 🟡 風險:config 兩處來源(DB + env)→ 靠 resolver 統一,避免 service 各自散讀 → S2 集中,S3 只調用。
- 🟡 風險:C2 之下「UI 改完要 restart 先生效」對用戶要清楚標示(UI 文案 + design-system voice)。

---

**Lifecycle**:plan v1.0 locked(2026-07-22)。偏離 → changelog(R3)。daily commit 對應 `progress.md` Day-N(R2)。
