# W34 Checklist — Connector Config UI(Model C)

> 逐項 tick;對應 `plan.md` §4 Steps + §3 Acceptance。

## Backend

- [x] **S1** `ConnectorConfig` Prisma model(一 row 一 connector,非機密欄 nullable)
- [x] **S1** migration `20260722153508_add_connector_config` apply 乾淨 + `prisma generate`(G1;SQL 驗證無 secret 欄)
- [x] **S2** `ConnectorConfigService`:`resolve(connector, field)` DB-then-env(非機密)
- [x] **S2** 機密欄仍 `getOrThrow` env,唔經 DB 路徑
- [x] **S2** status 派生(configured via db / env / unset — secret 只回狀態唔回值)
- [x] **S3** `GraphService` tenant/client id 經 resolver(secret 直讀 env)
- [x] **S3** `ServiceNowService` instance url / default table 經 resolver(user+pass 直讀 env)
- [x] **S3** `requestSubmissionProviderFactory` + `N8nWorkflowProvider` provider 路由 / webhook url 經 resolver(key 直讀 env)
- [x] **S4** `GET /admin/integrations`(DV-1)每 connector 加 config — 非機密欄值 + secret 狀態(唔回 secret 值)
- [x] **S4** `PATCH /admin/integrations/:key/config` — 改非機密欄,controller `@Roles(ADMIN)`
- [x] **S4** DTO validation(URL 格式 / provider enum / GUID — service 層)
- [x] **S5** 寫入落 `AuditLog`(白名單非機密欄 before/after,同一 transaction)
- [x] **S5** secret 邊界守衛:`PATCH` 拒收 secret 欄 / `GET` 不含 secret 值

## Backend test(H5)

- [x] **G2** resolver precedence(DB 有→DB / DB 無→env / 機密→env-only)
- [x] **G4** 🔴 secret 永不入 response / 永不寫 DB / 永不入 audit(白名單只 6 非機密欄)
- [x] **G5** PATCH ADMIN-only(permission matrix 證實 `→ [ADMIN]`)
- [x] **G6** 寫入 audit 有 before/after(same-transaction test)
- [x] **G7** bad URL / bad enum / bad GUID 拒絕
- [x] **G3** 三整合點 env fallback 不變(現有整合 test 174/174 pass)

## Frontend

- [x] **S6** query(`useIntegrations`)+ mutation(`useUpdateConnector`)+ api-types(config 欄)
- [x] **S7** Integrations panel 加編輯面:非機密欄可改(Configure toggle → `Input`)
- [x] **S7** secret 欄唯讀顯示 `configured via env` / `not set`(絕不輸入框;test 證 textbox=editable count)
- [x] **S7** C2 文案:「Changes take effect after the API restarts」
- [x] **G8** ui-design DS-1–12 全 ✅(**DS-4 live 驗**:light rgb(245,245,246) / dark rgb(8,8,10),編輯面兩 mode 完整 render、secret 唯讀 live 確認)
- [x] **S8** 前端 test(編輯 / 🔴 secret 唯讀 / save-diff / 無 editable 無 Configure);web 131→**136**

## Closeout

- [x] **G9** api 367 + web 136 test 全綠 + lint clean(--fix 後 re-run 確認)
- [ ] doc sync(design-system 若加新 pattern → 更新;否則 N/A)
- [ ] BACKLOG 更新(R7)· progress retro · memory 更新
- [ ] commit(Conventional Commits,對應 progress Day-N)
