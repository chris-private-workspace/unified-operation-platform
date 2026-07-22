# W33 — Deploy Exec Progress(Azure UAT 實際部署)

> 執行 `docs/13-deployment/04-deploy-runbook.md`。Runbook = 藍圖;此 doc = **實際發生咩**(資源名、成敗、偏離)。
> 前置 phase:W32-deploy-uat(準備)· PR #19。

## 決定(owner,2026-07-22)

- **認證 = break-glass 本地 admin 先行**(SP 建唔到 Entra app reg → SSO 後補,dual-provider)
- **Provision go**:落 shared RG `RG-RCITest-RAPO-N8N`,自己命名資源(唔碰 shared)
- **整合憑證 = placeholder 先跑起**(Graph/ServiceNow constructor getOrThrow → 要合格式值先 boot;真整合後補)

## 環境約束(唯讀偵察揪到)

| 約束 | 影響 |
|---|---|
| SP = **Contributor,只限 `RG-RCITest-RAPO-N8N`** | 全部資源落此 RG;開唔到新 RG |
| SP **建唔到 Entra app registration**(Insufficient privileges) | 🔴 SSO 呢個 SP 做唔到 → break-glass 先行;SSO 待 IT |
| az `containerapp` 擴充**裝唔到**(aka.ms SSL 被公司 proxy MITM) | ACA 改用 **ARM/Bicep 經 `az deployment`**(core,免擴充)部署 |
| 本地 `docker build` 撞 Docker Hub CDN 503(W32) | image 用 **`az acr build`**(Azure 側,繞開) |

## Subscription

- `Microsoft Azure (rcitest): #1023861`(subId `30dac177-…`)· tenant `4f63aaa0-…`
- RG `RG-RCITest-RAPO-N8N` @ `eastasia`(RCI1 HK)

## 資源命名(建緊 / 計劃)

| 資源 | 名 | 狀態 |
|---|---|---|
| ACR | `acruopuat`(Basic)| ✅ 建好(`acruopuat.azurecr.io`)|
| api image | `uop-api:uat-b1b737f` | 🔄 `az acr build` 進行中 |
| web image | `uop-web:uat-b1b737f`（break-glass:無 VITE_ENTRA build-arg）| ⏳ 待 api build 驗證 |
| PostgreSQL Flexible | `psql-uop-uat`(v16, Burstable)| ⏳ 待 build 驗證先 provision |
| Key Vault | `kv-uop-uat` | ⏳ |
| ACA env | `cae-uop-uat` | ⏳ |
| Container Apps | `ca-uop-api`(internal)/ `ca-uop-web`(external)| ⏳ |

## Day 1 — 2026-07-22

### 進度
- [x] 唯讀偵察 + 三約束確認
- [x] ACR `acruopuat` 建立
- [x] **api image build 成功**(ACR task `ck1` Succeeded,`uat-b1b737f`)—— Dockerfile 三假設全綠:argon2 prebuilt ✅ / `npm ci --workspace` 793 pkg ✅ / prisma generate + copy ✅。**坑**:`az acr build` CLI 尾段印 `✔` 撞 Windows charmap crash(exit 1 假象)→ 真結果查 `az acr task list-runs`;registry data-plane(`*.azurecr.io/v2/`)被 proxy 擋,`show-tags` 連唔到;下次 build 加 `PYTHONIOENCODING=utf-8`
- [x] web image build 成功(ACR task `ck2` Succeeded,`uop-web:uat-b1b737f`)
- [x] LAW `law-uop-uat` + KV `kv-uop-uat` 建立
- [x] **KV data-plane 測試 = 被 proxy 擋**(`vault.azure.net` SSL MITM)→ secret 改用 **ACA native secureString**(經 `az deployment`,management plane),KV wiring 留 hardening
- [x] **決定:migrate/seed 改由 api container 啟動時自跑**(local 連唔到 Azure PG data-plane;`az containerapp exec/job` 又要被封擴充)→ 加 `docker-entrypoint.sh`(env-flag gated)+ api Dockerfile 改 full deps + copy prisma/;seed idempotent(upsert 已驗)
- [x] api image 重 build `uop-api:uat-mig1`(self-migrate)—— log 見 Step 10/27,CLI charmap crash(cosmetic),task 狀態待 sequential 驗
- [~] Postgres `psql-uop-uat` provision(第一次 `--database-name` flag 唔識 → 重建中;之後另建 `platform` DB)
- [x] Bicep `deploy/azure/aca.bicep`(env + 2 app + secrets secureString + RUN_MIGRATIONS/SEED flag)authored
- [x] `platform` DB 建立
- [x] `az deployment group create`(ACA env + api internal + web external)—— **Succeeded**
- [x] **smoke test PASS**:`/api/docs/api` **200** · break-glass login `admin@uop.local` **200**(role ADMIN)

## ✅ 部署成功(2026-07-22)

- **Public URL**:`https://ca-uop-web.lemonhill-2df17b88.eastasia.azurecontainerapps.io`
- **api internal**:`ca-uop-api.internal.lemonhill-2df17b88.eastasia.azurecontainerapps.io`
- 全鏈路驗證:browser → web nginx(SPA 200)→ `/api` proxy → api(docs 200)→ Postgres(migrate 成功、表存在)→ seed(admin + 23 OpCo)→ break-glass login 200(ADMIN)。

### Deploy 過程 4 個 debug fix(全部環境/配置,非 app code bug)

| # | 症狀 | 根因 | fix |
|---|---|---|---|
| 1 | api replica 起唔到(migrate/seed crash) | entrypoint `set -e` 令 migrate/seed 失敗即 crash-loop;container log 又睇唔到(proxy 擋 data-plane) | entrypoint 改**非致命**(log + continue)`uat-mig2` |
| 2 | `/api/*` → 404「app does not exist」 | nginx `proxy_set_header Host $host` 送 web public FQDN,ACA internal ingress 認唔到 | Host 改 `$proxy_host` + API_UPSTREAM 用 api internal FQDN(`uat-web2`) |
| 3 | `/api/*` → 301 | ACA api ingress 預設 `allowInsecure:false`,將 nginx http upstream 301→https | api ingress 設 `allowInsecure:true`(ARM) |
| 4 | login 401(admin 唔存在,但表存在) | runtime `ENV NODE_ENV=production` 喺 `npm ci` 之前 → devDeps(ts-node)被 omit → `npm run seed` 搵唔到 ts-node(migrate 靠 npx fetch 反而 work)| npm ci 加 `--include=dev`(`uat-mig3`) |

**教訓**:①container log data-plane 被擋時,entrypoint 非致命 + 逐層 HTTP 探測(404 vs 301 vs 401 vs 500)係唯一 debug 途徑 —— 每個 code 精準指向唔同層。②`NODE_ENV=production` + `npm ci` 會靜靜 omit devDeps,連累 ts-node seed;migrate 靠 `npx` on-demand fetch 遮盞咗半個問題。③ACA app-to-app:Host 要 upstream host、internal ingress 要 allowInsecure 或 https upstream。

### 認證現實(已驗)

- break-glass 本地 admin **work**(role ADMIN)· SSO 未啟(SP 建唔到 app reg,ENTRA env 未設)
- Graph/ServiceNow = placeholder(app boot OK;真整合未接)
- ⚠️ 登入後 `mustChangePassword: false` —— **提醒 Chris 首次登入後手動改密**(初始密碼喺部署輸出)

### 環境規律(關鍵)

**management plane（management.azure.com）通;所有 data-plane 被公司 proxy SSL MITM 擋**:ACR `/v2/`、KV `vault.azure.net`、`aka.ms`(擴充)全 503/SSL-fail。故策略全走 management plane：資源建立、`az acr build`(server-side)、`az deployment`(ARM)、secret 用 ARM secureString(非 KV data-plane)、app 自 migrate(非 operator)。

**坑**:①`az acr build` CLI 印 `✔`/`✓` 撞 Windows charmap crash(exit 1 假象;build server-side 照成功,查 `az acr task list-runs`)→ deploy 用 `-o json`/`-o none` 減 fancy output。②多個 `az` 並發(背景 job + 前景查詢)會互鎖 hang → **az 一律 sequential**。③`az postgres flexible-server create` 呢版本無 `--database-name`。
