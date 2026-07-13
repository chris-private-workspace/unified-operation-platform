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
| [0004](./0004-allocation-import-mechanism.md) | Allocation import 機制(admin CSV upload + dry-run + `businessAlias` 對映 + curation-as-scope + allocatedQuantity-only) | Accepted | 2026-07-13 | 用戶 approval(H1/R5);W13 allocation-import |
| [0005](./0005-local-password-auth.md) | 本地密碼認證,與 Entra SSO 並存(dual-provider AppUser · argon2 · 本地簽發 JWT · dual-issuer guard;分階段 AUTH-4a/b/c) | Accepted | 2026-07-13 | 用戶 approval(H1/H2/H4);AUTH-4a(W18)起 |
