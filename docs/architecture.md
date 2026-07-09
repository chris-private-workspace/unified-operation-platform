# Unified Operation Platform — Architecture Spec

> **平台級主 spec(source of truth for WHAT + WHY)。** CLAUDE.md / 各 phase plan cite 返呢度。
> **模組級決策**(LicenseOps 定位 / scope / 對帳 / domain model / request 生命週期)唔喺呢度重複 —— 睇 `docs/02-architecture/licenseops/DESIGN.md`(決策 SSOT)。
> **Frozen 慣例**:核心 section lock 後只有 owner approve 先 increment version;改架構經 ADR(CLAUDE.md §5 H1)。

**Version**: 0.1(draft) · **Status**: draft · **Owner**: Chris Lai · **Last Updated**: 2026-07-09

---

## 1. Overview / Goals

Unified Operation Platform 係一個自建嘅 **admin portal**,統一管理 IT operation / support 工作,並逐步引入 AI 功能。核心定位係 **System of Action**:

| | 角色 | 擁有 |
|---|---|---|
| **ServiceNow** | System of Record | request intake / approval / SLA / audit —「誰申請、誰批、記錄」 |
| **本平台** | System of Action | live state / orchestration / 實際執行 / 人手介入 —「事情實際點被做完」 |

平台獨特身份「live state + action layer」**同時就係引入 n8n / AI 嘅基礎**:AI 需要 (1) 可讀嘅即時狀態去 observe、(2) 受控嘅 action API 去 act —— ServiceNow 嘅 ticket 層畀唔到呢兩樣。

**第一個模組 = LicenseOps**(M365 onboarding license 履行)。詳細業務決策見 module spec。

## 2. Scope & Tiers

- **In scope(當前)**:
  - 平台四層地基(見 §3)+ integration layer。
  - **LicenseOps 模組**:onboarding 當下 M365 加 license、消費 ServiceNow request 回寫、per-OpCo ledger + 總量層對帳 + drift alert、指派 license。
- **Out of scope / 未來 Tier**(對應 CLAUDE.md §5 H3):
  - 平台層:其他 IT ops 模組(offboarding / cost insights / D365 / 其他 support 工作流)—— 未 approve 前唔起。
  - LicenseOps 層排除項(ticket 表單 / 審批鏈 / SLA / 成本發票 / offboarding / D365 …)見 module spec §2。

## 3. Core Architecture — 四層地基

1. **State layer** — 平台真相:live M365(Graph)、AD/sync 狀態、entitlement/allocation ledger(Postgres via Prisma)。
2. **Integration layer**(✅ 已建,`src/integration/`)— 對外唯一邊界;Graph + ServiceNow client;domain 層唔掂 vendor SDK。
3. **Orchestration / Action layer** — 執行 + 人手介入控制點;`@nestjs/schedule` `@Cron`(sync poll / daily reconcile)+(planned)Redis + BullMQ。n8n 今天、AI 明天接呢層。
4. **API + UI layer** — REST + OpenAPI(`/docs/api`);呢個 OpenAPI contract 就係 n8n / AI 未來受控接入點。

## 4. Application Architecture

- **NestJS modular monolith**;每個 module 對齊四層地基。前後端分開(方案甲)。
- **模組地圖**:`integration`(✅ built)/ `prisma`(`@Global`,planned)/ `license`(module C:catalog + 對帳 + ledger,planned)/ `fulfilment`(module D:request 生命週期,planned)。
- **Data**:`prisma/schema.prisma` = domain model 真相(10 models,見 module spec §6)。
- ⚠️ **當前 scaffold 現狀**(entry 檔位置、缺 module、無 build config)見 `docs/setup.md`。

## 5. UI / Views(LicenseOps)

LicenseOps 前端由 `design_handoff_licenseops/`(**hifi 設計 SSOT**)定義:app shell(sidebar + top bar,role-scoped)→ Overview dashboard → **License Assets**(Platform / By-OpCo / Compare 三層 + allocation/adjust/edit operations)→ Requests console → **Request detail**(per-line stage stepper + assign flow + sync gate + AI Assist preview)→ Drift alerts → SKU Catalog → Settings/Integrations。受 CLAUDE.md §5(將來 H6)+ §7 保護。

## 6. Delivery Plan

Rolling / JIT phases —— 每 phase kickoff 建 `docs/01-planning/W{NN}-{name}/`,見 `BACKLOG.md`。
**下一步候選**(module spec §11):(C)Catalog 初始化 + 對帳服務;(D)Request 履行 use case。**建議先 C**。

## 7. Vendor / Tech Stack(locked)

見 CLAUDE.md §5 H2 locked 表(後端 NestJS·Prisma/Postgres·Redis/BullMQ·Graph+ServiceNow·REST/OpenAPI·Entra SSO·React/shadcn 前端·Docker Compose)。改動 = H2 trigger → STOP + ADR。

## 8. Risks(frozen baseline)

- 整合層打真 M365 tenant(`assignLicense` 會實際改動)—— test 必 mock(H5)。
- ServiceNow table/field 需對齊 Phase 1 實際設定(見 open questions)。
- Living 追蹤喺 `docs/01-planning/RISK_REGISTER.md`。

## 9. Auth / Security

- Entra ID SSO + app roles:`ADMIN` / `REGIONAL`(看全部)/ `OPCO_IT`(scoped 自己 OpCo,future self-service)。model 已有(`AppUser.role` + `opcoScopeId`),**guard 層未建** —— controllers 現時 unguarded(找 `TODO: @Roles`)。真實曝露前必做。
- Secret / PII 規則見 CLAUDE.md §5 H4。

## 10. Open Questions

見 module spec `docs/02-architecture/licenseops/DESIGN.md §10`:成本可見度、`isBaseLicense` 去留、ServiceNow 實際 table/field、對帳「對回」機制、OpCo self-service 開放時機。

## 11. Tier 2 / Future Trigger Matrix

其他 IT ops 模組(offboarding / cost insights / D365 / support 工作流)= 未來 tier;開新模組前必須 STOP + approval + 平台級 ADR(H1/H3)。

---

## Decision Log

重大平台決定促成後 promote 做 ADR(`docs/adr/`)。LicenseOps 已鎖定決策清單見 module spec §9。

---

**Change protocol**:本 spec frozen section 改動 = 架構級 → 觸發 CLAUDE.md §5 H1 → STOP + ask + ADR。
