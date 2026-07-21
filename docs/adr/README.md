# Unified Operation Platform — Architecture Decision Records (ADRs)

> Format per `CLAUDE.md §6` + `0000-TEMPLATE.md`。Filename pattern:`NNNN-short-kebab-title.md`（NNNN = 4-digit zero-padded sequential）。

## 咩情況要寫 ADR
任何觸發 `CLAUDE.md §5` hard constraint（架構變更 / vendor 換 / storage layout / scope 邊界）嘅改動,喺用戶 approve 之後 **必寫一份**。ADR = 架構紅線嘅「解鎖記錄」。

## 慣例
- 一旦 `Accepted` **唔改內容**;要推翻 → 寫新 ADR 標 `Superseded by ADR-MMMM`,舊嗰個 status 改埋。
- Status:`Proposed`(起草,未拍板)→ `Accepted`(owner 拍板)→ `Superseded`。
- 每寫一份 → 喺下面 index 加一行。

## Index

| ADR | Title | Status | Date | Source |
|---|---|---|---|---|
| [0001](./0001-frontend-in-repo-monorepo.md) | 前端納入本 repo,採 monorepo(`apps/api` + `apps/web`) | Accepted | 2026-07-09 | 用戶 approval(H1/H3);design handoff 入 repo |
| [0002](./0002-entra-jwt-validation.md) | 後端 Entra ID JWT 驗證策略(`jwks-rsa`+`jsonwebtoken` · 全域 guard · dev-bypass) | Accepted | 2026-07-10 | 用戶 approval(H2);W09 AUTH-1 |
| [0003](./0003-msal-frontend-sso.md) | 前端 Entra ID SSO 策略(MSAL `@azure/msal-browser`+`@azure/msal-react` · auth code PKCE · redirect · dev-bypass 相容) | Accepted | 2026-07-10 | 用戶 approval(H2);W10 AUTH-2 |
| [0004](./0004-allocation-import-mechanism.md) | Allocation import 機制(admin CSV upload + dry-run + `businessAlias` 對映 + curation-as-scope + allocatedQuantity-only) | Accepted | 2026-07-13 | 用戶 approval(H1/R5);W13 allocation-import。**適用範圍隨 ADR-0008 擴至含 D365 SKU curation** |
| [0005](./0005-local-password-auth.md) | 本地密碼認證,與 Entra SSO 並存(dual-provider AppUser · argon2 · 本地簽發 JWT · dual-issuer guard;分階段 AUTH-4a/b/c) | Accepted | 2026-07-13 | 用戶 approval(H1/H2/H4);AUTH-4a(W18)起 |
| [0006](./0006-password-lifecycle-session-hardening.md) | AUTH-4c 密碼生命週期 + session hardening(嚴格 policy · force-change · lockout · admin-reset · refresh + httpOnly cookie;分階段 4c-A/4c-B/4c-C) | Accepted | 2026-07-13 | 用戶 approval(H1/H4);AUTH-4c-A(W20)起 |
| [0007](./0007-opco-ledger-manual-management.md) | OpCo ledger 手動管理(逐格校正 allocated/assigned · `PATCH /license/ledger/:id` · `LedgerAdjustment` audit · 對回機制啟動 · assigned 語意擴展) | Accepted | 2026-07-14 | 用戶 approval(H1);W23-assets-manual-ledger |
| [0008](./0008-request-creation-n8n-d365-scope.md) | 獨立 license request 建單 + n8n 雙向整合啟用 + D365 完整納入 scope(thin create-ticket · inbound intake API · `RequestSubmissionProvider`[direct/n8n] · sc_request/sc_req_item · D365 catalog/ledger/對帳) | Accepted | 2026-07-15 | 用戶 approval(H1+H2+H3);rollout W24+(甲 inbound 起) |
| [0010](./0010-integration-observability-delivery.md) | 整合可觀測性 + 交付保證(connector 狀態三態 + 唯讀 test connection · 絕不回傳 secret / masked · 最後成功時間由既有 domain timestamp 派生 · n8n 回程只可經 stage machine · outbound retry 路線) | Accepted | 2026-07-21 | 用戶 approval(H1/H4);Chris 拍板 **OQ-A = 容許唯讀主動探針** · **OQ-B = 派生既有 timestamp(零新 schema)** · **OQ-C = 先做人手 retry(唔啟用 BullMQ)**;OQ-D(n8n 合約會)仍 open → **item 4 = INTEG-1 解封**;前置分析 `02-architecture/audit-and-integration-observability.md` §6 item 4-6 |
| [0009](./0009-platform-audit-trail.md) | 平台 audit trail(通用 `AuditLog` 與 `RequestEvent`/`LedgerAdjustment` **共存** · 白名單 before/after · 權限矩陣 code-derive 不起 permission table · 平台 vs ServiceNow audit 分工) | Accepted | 2026-07-20 | 用戶 approval(H1);Chris 提 audit 需求 → 拍板 **OQ-1 = 記白名單 before/after** · **OQ-2 = P-B(白名單可含 PII)**;前置分析 `02-architecture/audit-and-integration-observability.md`;rollout AUDIT-2(權限矩陣)起 |
