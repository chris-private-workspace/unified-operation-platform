# ADR-0012 — Azure UAT 部署 topology(Container Apps 單一 origin)

- **Status**:Accepted
- **Date**:2026-07-22
- **Owner**:Chris Lai
- **Deciders**:Chris Lai(2026-07-22,透過部署準備 kickoff 三問拍板)
- **觸發**:CLAUDE.md §5 **H2**(locked stack 原寫「部署:Docker Compose」)+ **H1**(部署 topology = 架構決定)
- **Phase**:W32-deploy-uat
- **Supersedes(部分)**:`docs/architecture.md §7` / CLAUDE.md §5 H2 表「部署 = Docker Compose(app + postgres + redis)」—— 見下 §Decision 對「Docker Compose 去留」嘅澄清

---

## Context

`architecture.md §7` / CLAUDE.md §5 H2 將部署 stack lock 為「Docker Compose(app + postgres + redis)」。呢個係 **W01 本地開發** 起步時嘅 baseline,從未意圖描述雲上生產/UAT 部署。用戶本機已登入 Azure service principal(可對 **UAT** 執行動作),要求準備部署 —— 目標平台 = Ricoh **RCI**(Regional Cloud Infrastructure,AP 區 MS Azure 資料中心)。故需一個雲部署 topology 決定,並經 ADR 解鎖 H2。

**約束一(決定性)—— cookie 語意**:本地帳密 session(ADR-0006 §7 / AUTH-4c-B)嘅 access / refresh token 坐喺 **httpOnly + `SameSite=Strict`** cookie。`SameSite=Strict` 令**跨 site 請求永遠唔帶呢個 cookie**。若前端(web)同後端(api)分屬兩個 hostname,登入後每個 API 請求都唔會帶 cookie → 認證直接壞。而 `main.ts` 至今**無** `enableCors`,本地靠 vite proxy 做到同源。

**約束二 —— 認證模式(owner 需求,2026-07-22 釐清)**:專案要求 = **本地開發用帳密登入,Azure 環境用 Entra SSO 登入**。呢個正正係 ADR-0005 **dual-provider** 設計(本地密碼 + Entra 並存)。故 Azure UAT **主認證 = Entra SSO**(MSAL → Bearer header);另保留**一個 seeded 本地 admin 做 break-glass**(解決 SSO 首次 bootstrap 嘅雞蛋問題 —— 要先有 admin 先可以 provision / 授權 Entra users;兼緊急存取)。break-glass 本地登入用 `SameSite=Strict` cookie。→ **單一 origin 仍然必需**:(a) Entra 走 Bearer,**同源**即零 CORS(`main.ts` 唔使加 `enableCors`);(b) break-glass 本地 cookie 係 Strict,跨 origin 唔帶。兩條都指向單一 origin。

> ⚠️ **Entra SSO 前置**:需 UAT 嘅 Entra **app registration**(client id / tenant id / API audience+scope / redirect URI = UAT hostname)—— 即 AUTH-2b 一直等緊嘅嘢。用戶已有 Azure 存取,呢啲值喺部署時提供(見 `02-environment-reference.md`)。若部署當刻未有 app registration,可先淨用 break-glass 本地 admin 起 UAT,SSO 後補(dual-provider 容許)。

**約束三 —— RCI PAR 治理**:RCI 開資源前必經 Project Authorization Request(PAR,1-2 週審批;`docs/13-deployment/RCI Project Authorization Request Process v1.9.docx`)。PAR 表「Other Resources」**明列 Azure Container Apps、Key Vault、ACR** 為可選資源 → 容器化 + ACA + Key Vault 係 RCI 一等公民路徑。

**約束四 —— 現狀事實**:
- 後端 `nest build`→`dist/`、`node dist/main`、listen `PORT ?? 3000`(容器友好)。
- 前端 Vite SPA build 出**靜態檔**,需反向代理補返 `/api`。
- **Redis / BullMQ code 完全未 wired**(只 `@nestjs/schedule` @Cron)→ UAT 唔需要 Redis 資源。
- web build **依賴 repo root** `design_handoff_licenseops/`(`src/index.css` `@import`)。

## Decision

UAT 部署採 **Azure Container Apps(ACA)+ 單一 origin**:

```
Internet ─HTTPS─▶ ACA ingress(單一 hostname)
                   ├─ /        ▶ web container(nginx:serve SPA static + proxy /api)
                   └─ /api/*    ▶ api container(NestJS,internal ingress)
                                   └─▶ Azure Database for PostgreSQL Flexible Server(managed)
Secrets ─────────▶ Azure Key Vault(app 經 Managed Identity 讀)
Images ──────────▶ Azure Container Registry(ACR)
Logs ────────────▶ Log Analytics workspace(RCI 標準)
Redis:暫不開(BullMQ 未 wired)
```

具體:
1. **兩個 container image**:`uop-api`(NestJS)+ `uop-web`(nginx serve static + `/api` 反向代理到 api container 內部位址)。單一對外 ingress hostname → `SameSite=Strict` cookie 直接 work、**零 CORS 改動**。
2. **DB** = Azure Database for **PostgreSQL Flexible Server**(managed,取代本地 postgres container);Prisma prod 用 `migrate deploy`(非 `migrate dev`)。
3. **Secrets** 全入 **Key Vault**,container 經 Managed Identity 讀;**唔落** env 檔、唔入 image、唔入 git(H4)。
4. **Redis 暫緩** —— 到 BullMQ 真正 wired(另 phase)先開 Azure Cache for Redis;届時屬另一次 H2 評估。
5. **`NODE_ENV=production`** → cookie 自動 `Secure` → **全程 HTTPS 強制**;dev-bypass(`AUTH_DEV_BYPASS` / `VITE_AUTH_DEV_BYPASS`)prod **必 OFF**。
6. **認證**(約束二):Azure UAT 開 **Entra SSO**(後端 `ENTRA_TENANT_ID` + `ENTRA_API_AUDIENCE`;前端 build 時 `VITE_ENTRA_*`)+ seeded 本地 admin 做 **break-glass**(`AUTH_JWT_SECRET` + `LOCAL_ADMIN_INITIAL_PASSWORD`,dual-provider ADR-0005)。**本地開發**維持帳密登入(或 dev-bypass)。

**「Docker Compose」去留澄清(對 supersede 精確界定)**:
- 本地開發 infra(`docker-compose.yml`:postgres + redis)**維持不變、繼續有效** —— 佢從來就係 dev-only。
- 被 supersede 嘅只係「**雲部署**都用 Docker Compose」呢個隱含意思。雲上 = ACA + managed Postgres。
- 即:**dev = Docker Compose;UAT/prod = Azure Container Apps**。CLAUDE.md §5 H2 表 + `architecture.md §7` 會相應加註(唔刪 dev 用法)。

## Alternatives Considered

| 方案 | 為何否決 |
|---|---|
| **App Service(api/web 各一個 Web App)** | 兩個 Web App = 兩個 hostname = 跨 origin。要再加 Front Door / App Gateway 合 origin 或改 cookie 為 `SameSite=None`(削弱 CSRF 防護,ADR-0006 特意揀 Strict)。多一層 gateway 成本 + 複雜度,無淨得益。 |
| **單一 VM + docker compose(最貼 locked stack)** | 最少改架構,但 OS patching / 備份 / TLS / 監控全人手,違反 RCI「managed、best-practice」定位(PAR Appendix 明列 backup/log/SLA 由平台服務提供)。UAT 維運負擔最大,回報最低。 |
| **AKS** | UAT 單體應用,K8s 屬過度工程(§1.2 Simplicity)。PAR 表雖列 AKS,但 ACA 對呢個規模係更貼身嘅 managed 容器路徑。 |
| **web 用 `@nestjs/serve-static` 由 api serve SPA(單 container)** | 真單一 origin 且省一個 container,但要**加 runtime dependency** → 再觸發 H2;且把靜態服務混入 API 進程,失去 nginx 快取 / 壓縮 / 獨立 scale。nginx = infra 非 app dep,更清。 |
| **Azure Static Web Apps(web)+ ACA(api)** | SWA 係另一 hostname → 跨 origin cookie 問題重現;且 SWA 嘅 linked-backend 對非 Functions 後端支援有限。 |

## Consequences

**正面**:
- 單一 origin 同時服務兩種認證:Entra Bearer **同源零 CORS**、break-glass 本地 `SameSite=Strict` cookie 照 work;`main.ts` 唔使加 `enableCors`(維持攻擊面最細)。
- Managed Postgres / Key Vault / ACR / Log Analytics 全對齊 RCI PAR 標準資源 → 審批路徑順。
- container 化令 dev(compose)同 UAT(ACA)嘅 app 產物一致(同一 Dockerfile 產出)。
- Redis 暫緩 = UAT 成本 + PAR 元件更少。

**代價 / 後續**:
- 需新增兩個 **Dockerfile** + nginx conf + `.dockerignore`(W32 F3)。
- 需 `prisma:deploy` script(prod migration)。
- **RISK R1**(公司 proxy 封 `binaries.prisma.sh`)可能影響 `docker build` 內 `prisma generate` → 需 workaround(見 runbook)。
- 未來 BullMQ wired 時開 Redis = 另一次 H2 評估(本 ADR 不預批)。
- **Entra SSO 需 UAT app registration**(client id / tenant / audience+scope / redirect URI)—— 即 AUTH-2b。用戶已有 Azure 存取,部署時提供;未有時可先用 break-glass 本地 admin 起 UAT,SSO 後補。
- 前端 `VITE_ENTRA_*` 係 **build-time** 烘死落 bundle → `uop-web` image 對特定 UAT app registration + hostname specific;換 tenant / hostname 要重 build（見 `03-build-images.md`）。

## References

- `docs/architecture.md §7`(locked stack)· CLAUDE.md §5 **H2**(vendor/dep lock)/ **H1**(架構決定)
- ADR-0006 §7(httpOnly + `SameSite=Strict` cookie session)— cookie 語意約束來源
- ADR-0005(dual-provider:本地密碼 + Entra 並存)— dev=帳密 / Azure=SSO 嘅設計來源
- ADR-0002 / ADR-0003(Entra SSO 後端 + 前端 MSAL,已建)· AUTH-2b(UAT app registration 前置)
- `docs/13-deployment/`(W32 部署文件集)· `docs/13-deployment/RCI Project Authorization Request Process v1.9.docx`(PAR 治理)
- `docs/01-planning/W32-deploy-uat/plan.md`(執行計劃)
