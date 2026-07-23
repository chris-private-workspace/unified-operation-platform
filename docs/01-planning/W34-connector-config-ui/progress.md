# W34 Progress — Connector Config UI(Model C)

> Daily entry + retro。對應 commit(R2)。

## Day 1 — 2026-07-22

### Kickoff

- 用戶問「integration 頁面點解仲設定唔到配置」→ 查證後釐清:ADR-0010 item 4 刻意只做**唯讀觀測**,配置一律經 env(secret 邊界)。
- 拆三個 model(A 全 DB 加密 / B KV 代理 / C 非機密落 DB · secret 仍 env),owner 揀 **Model C**。
- 寫 **ADR-0013**(Proposed → Accepted),4 OQ 拍板:C2 restart / `SERVICENOW_USER` env-only / Graph+SN+n8n outbound 三 connector / 一 row 一 connector 結構化。
- 開 branch `feat/connector-config-ui`;建 phase folder(plan v1.0 / checklist / progress)。
- BACKLOG 加 W34 row(R7)。

### 進度(Day 1)

- ✅ **S1** — `ConnectorConfig` model + migration `20260722153508_add_connector_config`(additive;SQL 驗證**無 secret 欄**)+ `prisma generate`。
- ✅ **S2** — `CONNECTOR_CONFIG` metadata(single source of truth,`connectors.ts`)+ `ConnectorConfigService`(`resolve` DB-then-env / `describe` read-model / `update` validate+upsert)+ register IntegrationModule。**test 先行 19/19 pass**[G2 precedence 5 條 / 🔴 G4 secret 邊界(describe 餵真 secret 零洩漏 + update 拒 secret key)/ G7 validation url·guid·enum·空 patch];ts-jest compile 綠 = type OK。

### R3 deviation(plan 細化,唔改 scope)

- **DV-1** — S4 controller **對齊 W30 `admin/integrations`**(擴充既有 `IntegrationController` + read-model),唔另開 plan §4 寫嘅 `admin/connectors`。理由:W30 已有該表面 + 前端 panel 已 render connector row,一個 read-model 更連貫。
- **DV-2** — C2 生效:`GraphService`/`ServiceNowService` 由 constructor build client 改 **`onModuleInit`**(constructor 唔可 async;resolver 要 query DB)。屬 ADR-0013 D4 C2 預期內。

- ✅ **S3** — 三整合點經 resolver(C2 `onModuleInit`):`GraphService`/`ServiceNowService` constructor→`onModuleInit`(tenant/client id · instance URL/table DB-then-env;secret 仍 `getOrThrow`)+ factory async(provider 路由 DB-then-env)+ `N8nWorkflowProvider` url 由 factory 傳(key env)。**4 個現有 spec 更新**(graph/servicenow/n8n-provider/factory);**integration+fulfilment 174/174 pass** = G3 env fallback 不變、無迴歸。

- ✅ **S4** — 擴 W30 `IntegrationController`:`GET /admin/integrations` 每 connector 加 `config`(非機密值+source / secret 只 configured bool)+ `PATCH :key/config`(ADMIN via controller `@Roles`,`@CurrentUser` actorId)+ config DTOs + `UpdateConnectorConfigDto`。
- ✅ **S5** — audit:`update` transaction 包 upsert + `logChange`(`connector.config_update` / targetType `ConnectorConfig`,白名單只 6 個非機密欄);connector-config 19→**22** test。
- ✅ **backend 完成** — **全 api 367 test 綠**(permission snapshot 更新:新 route `PATCH /admin/integrations/:key/config → [ADMIN]` = **G5 ADMIN gating 由 matrix 直接證實**);零迴歸。

- ✅ **S6** — api-types 加 `ConnectorField/Secret/Config` + `ConnectorStatus.config`;`useUpdateConnector`(apiPatch)。
- ✅ **S7** — Integrations panel:Configure toggle → 編輯面(editable `Input` + **secret 唯讀 Badge `configured via env`,絕不 input** + C2 restart 提示 + Save/Cancel);token-only、Save=secondary 守 DS-3。**前端 build 綠**(tsc + vite)。
- ✅ **S8** — panel test 5 條(render / Configure 展開 / 🔴 secret 唯讀[textbox=editable count] / save-diff / 無 editable 無 Configure);**web 131→136 test 全綠**、無迴歸。
- **ui-design 自檢**:DS-1/2/3/5–12 ✅;**DS-4 light+dark 待 live 驗**(靠 semantic token 自動 swap,但 H6 要求行過)。

- ✅ **DS-4 live 驗**(browser dev-bypass,JS DOM):panel live render(Graph/ServiceNow Required · n8n-outbound Not in use · **n8n-inbound 無 Configure ✅**)+ 編輯面(2 editable input · **🔴 secret 唯讀「configured via env」無 input** · restart 提示 · Save/Cancel);**light bodyBg rgb(245,245,246) → dark rgb(8,8,10) token swap,兩 mode 編輯面完整 render 無爆**。
- ✅ **G9** — api 367 + web 136 test 全綠 + lint clean(--fix 後 re-run 確認)。
- ⚙️ live 驗要 `apps/web/.env`(VITE_AUTH_DEV_BYPASS=true,純 flag 無 secret;vite 只認 .env 檔唔認 inline env);gitignore,唔入 repo。

### Next(收尾)

- doc closeout(BACKLOG R7 INTEG-4→完成 / memory / progress retro)。
- commit(等授權)。

### 紀律

- H1 ✅ ADR-0013 授權。H4 🔴 全程 secret 邊界最高警覺(G4 hard gate)。R1 ✅ pre-doc = ADR-0013。R3 ✅ 兩個 deviation 已 log。

## Retro(W34 收官)

**成果**:ADR-0013 Model C 由 kickoff 到 backend+frontend 全鏈 + DS-4 live 驗;**api 345→367 · web 131→136 test 全綠 + lint clean**。

**work well**:
- **逐欄位切機密/非機密**係方案骨幹 —— 令「UI 設定」訴求滿足而 H4 secret 邊界一步唔動。
- **secret 邊界三重守**(schema 無 secret 欄 / describe read-model / audit 白名單只非機密),test-first 鎖死,每層獨立防守。
- **C2 = `onModuleInit`**:vendor client 由 constructor 改 async onModuleInit,唔重構 lifecycle,restart 生效已解 UAT 痛(唔使重 build image)。
- **對齊 W30 表面**(DV-1):擴既有 `admin/integrations` 而非另開 route,前端一個 read-model 更連貫。
- **permission matrix drift test**(W28)自動 catch 新 PATCH route → 更新 snapshot = 記錄已驗證事實。

**踩過**:
- **vite 只認 `.env` 檔,唔認 inline shell env** —— DS-4 live 驗 dev-bypass 要 create `apps/web/.env`(純 flag),inline `VITE_...=true` 無效。
- lint 19 個 prettier formatting(object literal multi-line)—— `--fix` 一次清,零邏輯問題。

**deferred**:C1 即時生效(vendor client 熱重建)= 第二期(D4)· 改 secret 的 UI = 永不做(secret 只 env)。
