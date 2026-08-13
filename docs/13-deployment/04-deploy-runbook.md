# 04 — Deploy Runbook(Azure UAT · as-built)

> **此 runbook 反映 W33 實際成功部署嘅路徑**(2026-07-22),已用真環境驗證。實際部署記錄見 [`07-uat-as-built.md`](./07-uat-as-built.md)。
> **前置閘**:RCI 正式部署需過 PAR(見 `05-rci-par-process.md`)。W33 UAT 已喺 `rcitest` sub 實跑;PAR 由 owner 另行處理,不阻 UAT。
> 佔位:`<rg>` / `<acr>` / `<pg>` / `<kv>` / `<env>` / `<law>` / `<loc>`(= `eastasia`)。

## 🔴 0-pre. 你要部署邊個環境?(2026-08-13 補,W44 `F8-3`)

> **本 runbook 由頭到尾講嘅係 UAT。部署 DEV(`RG-RAPO-UOP-DEV`)行嘅係另一套,照跑會喺第 5 步撞 403。** 以下係分岔位;**UAT 段落一個字冇改。**

| | UAT(本檔) | **DEV** |
|---|---|---|
| Deploy 指令 | `az deployment group create`(§5) | 🔴 **行唔通** —— 撞 **`LinkedAuthorizationFailed`**(SP 冇 `managedEnvironments/join/action`,而個 env 係**企業共用兼住喺另一個 RG** `RG-RAPO-ContainerAPP-DEV`)。改行 **raw ARM PATCH**:`deploy/azure/patch-deploy-dev.ps1`(**先 dry-run**,佢會印 masked body 畀你對) |
| 🔴 點解唔可以用 `az containerapp update` / `registry set` | — | 佢哋做 **read-modify-write**,會**連 `environmentId` 一齊送返去** ⇒ 觸發同一個 linked auth ⇒ **一樣 403**。**必須** raw ARM PATCH 而 body **唔含 `environmentId`** |
| 🟢 副作用 | ARM full PUT 會 unset 冇送嘅 property | **PATCH 唔會** ⇒ infra 配嘅 `customDomains`+SNI cert / `workloadProfileName` **結構上掂唔到**(已對數,全部完好) |
| Params / template | `aca.params.uat.json` · `aca.json` | `aca.params.dev.json`(**gitignored**)· `aca-dev.json` |
| Smoke(§7)打邊個 URL | ACA 預設 FQDN | 🔴 **`https://rapo-uop-web-dev.rci-t.com/`** —— **ACA 預設 FQDN 解析唔到**(env `internal=true`,`staticIp` 係私有 IP,靠嘅 private DNS zone 冇 link 到企業網)。⚠️ **api 係 `/api/docs/api` 唔係 `/docs/api`** —— 打後者會畀 SPA fallback 食咗返 HTML,係最易誤判成「api 唔通」嗰個位 |
| 登入驗證 | — | break-glass `admin@uop.local`,密碼 = `aca.params.dev.json` 個 `localAdminInitialPassword`。⚠️ **每次容器重啟 seed 都會無條件重設佢**(`prisma/seed.ts`)⇒ 喺 UI 改咗都會變返 |
| 🔴 撳 assign 之前 | — | **先唯讀探測 gate 狀態**(RISK **R10**)—— DEV 個 Graph app 打嘅係**真 production M365 tenant**,成功嘅 assign = **真派 licence 畀真人** |

**完整 DEV as-built(含每個 blocker 點樣解封)** → **`09-dev-as-built.md`**;**live 驗證逐步** → **`10-dev-live-verification-runbook.md`**。

🔴 **做任何 `az` 操作之前一律先 `az account show` 驗身份** —— 呢台機一日內撞過 **4 個唔同 SP**,錯身份會畀出**完全誤導**嘅 error(例如講網絡問題而其實係權限)。部署 SP 憑證**唔喺 repo**,要 Chris 喺 terminal 自己 `az login`。

## ⚠️ 0. 環境規律(先讀 —— 決定成套做法)

公司網 proxy **只放行 Azure management plane(`management.azure.com`),SSL-MITM / 503 擋晒所有 data-plane**:Docker Hub CDN、ACR `/v2/`、Key Vault `vault.azure.net`、`aka.ms`(az 擴充 / bicep)、Log Analytics query。**驗證過嘅後果**:

| 想做 | 直覺做法(❌ 行唔通) | as-built 做法(✅) |
|---|---|---|
| build image | 本地 `docker build` | **`az acr build`**(Azure 側 build) |
| 存 secret | Key Vault data-plane | **ACA native secureString**(經 ARM) |
| 部署 ACA | `az containerapp create`(擴充) | **`az deployment group create` + `deploy/azure/aca.json`**(手寫 ARM) |
| 編譯 Bicep | `az bicep install` | **直接用手寫 ARM JSON**(bicep CLI 裝唔到) |
| migrate/seed | operator 對 DB 跑 | **container 啟動時自跑**(`RUN_MIGRATIONS_ON_START`) |
| 睇 container log | `az containerapp logs` / LA query | **逐層 HTTP 探測**(見 §7)+ `az rest` replica 狀態 |

**兩條操作紀律**:① `az` 一律 **sequential**(多個並發會互鎖 hang);② `az acr build` / `az deployment` 個 CLI 會因印 Unicode `✔` 撞 Windows charmap **crash(exit 1 假象)**,真結果查 management plane(`az acr task list-runs` / `az deployment group show`),背景跑就算 CLI 被殺,**server-side 照完成**。

> 若喺**唔受限網路**(冇 proxy)部署,以上多數限制消失,可用更直接嘅路(bicep、KV data-plane、operator migrate)。但 as-built 呢條路**兩種網路都 work**,建議照跟以保一致。

## 1. 前置 [SP]

- [ ] `az login`(SP)→ `az account show` 確認 sub/tenant(W33 = `rcitest` / `30dac177-…`)
- [ ] 確認 SP 權限:`az role assignment list --assignee <sp> --all`(W33 = Contributor **只限** `<rg>`;**建唔到** Entra app reg → SSO 需 IT)
- [ ] 決定命名 + region(`eastasia` = RCI1 HK)
- [ ] 產生強隨機 secret(見 §4;**只落 session-temp params 檔,絕不入 git**)

## 2. Provision 基礎資源 [SP]

```bash
# ACR（image registry）+ 開 admin（俾 ARM 攞 registry creds；hardening 可改 Managed Identity）
az acr create -n <acr> -g <rg> --sku Basic -l <loc>
az acr update -n <acr> --admin-enabled true

# PostgreSQL Flexible（v16）—— 注意：呢個 az 版本【冇】--database-name，要分兩步
az postgres flexible-server create -n <pg> -g <rg> -l <loc> \
  --tier Burstable --sku-name Standard_B1ms --version 16 --storage-size 32 \
  --admin-user uop --admin-password "$DBPW" --public-access 0.0.0.0 --yes
#   --public-access 0.0.0.0 = "Allow Azure services"（令 ACA 到到 DB）。
#   hardening：改 private access / VNet（但 operator 就更加連唔到，self-migrate 仍啱）。
az postgres flexible-server db create -s <pg> -g <rg> -d platform

# Log Analytics（ACA env 要）+ Key Vault（W33 存 secret 用唔到 data-plane，但仍建，留 hardening）
az monitor log-analytics workspace create -n <law> -g <rg> -l <loc>
az keyvault create -n <kv> -g <rg> -l <loc>
```

## 3. Build + push image [SP]

```bash
# 由 repo root。Azure 側 build，繞開本地 Docker CDN 503。
TAG=uat-$(git rev-parse --short HEAD)
az acr build --registry <acr> --image uop-api:$TAG -f apps/api/Dockerfile .
az acr build --registry <acr> --image uop-web:$TAG -f apps/web/Dockerfile .
#   ↑ CLI 可能 charmap crash（exit 1 假象）。真結果：
az acr task list-runs -r <acr> --top 3 -o table    # 睇 Status = Succeeded
```

- **SSO(可選)**:web image 要烘 Entra 值 → 加 `--build-arg VITE_ENTRA_CLIENT_ID=… VITE_ENTRA_TENANT_ID=… VITE_ENTRA_API_SCOPE=api://<uop-api-client-id>/access_as_user VITE_ENTRA_REDIRECT_URI=https://<uop-web-fqdn>`。無 app reg → 省略 → 前端跌返 break-glass 本地登入(W33 用呢個)。redirect URI 雞蛋問題:先部署攞 web FQDN → 重 build web。

## 4. Secrets → ARM params 檔(ACA native,非 KV) [SP]

KV data-plane 被擋 → secret 用 ACA native secureString,經 ARM params 檔傳。

**Secret store 策略(SSOT)** —— secret **唔存喺 `apps/api/.env`**(嗰個純本地 dev,部署唔會讀);Azure 部署嘅真值集中放一個 **gitignored persistent params 檔**:

1. Copy 範本:`deploy/azure/aca.params.example.json` → `deploy/azure/aca.params.uat.json`(**gitignored**,owner 本地 secure 保管)。
2. 填真值(範本每個 placeholder 有說明)。此檔 = 該環境 deployment secret 嘅 **single source of truth**,**persist 唔會 session 清**,重部署直接重用 —— key 一致、唔使重生成、唔會漏。
3. 部署一律 `--parameters @deploy/azure/aca.params.uat.json`(見 §5)。

**⚠️ 絕不 commit 真值檔**:`.gitignore` 已有 `deploy/azure/*.params.*.json`(只 commit template `aca.json` + 無值 `aca.params.example.json`)。

**首次生成 secret 值**(填入 params 檔;url-safe DB 密碼要 3+ 類字元、base64 JWT):
```bash
openssl rand -hex 20         # DB 密碼底（尾加 Aa9x 湊夠字類 → databaseUrl）
openssl rand -base64 48      # authJwtSecret
openssl rand -hex 32         # intakeApiKey / n8n outbound key
# law id/key + acr pw（management plane）：
az monitor log-analytics workspace show -g <rg> -n <law> --query customerId -o tsv
az monitor log-analytics workspace get-shared-keys -g <rg> -n <law> --query primarySharedKey -o tsv
az acr credential show -n <acr> --query 'passwords[0].value' -o tsv
```
- Graph/ServiceNow 首次可 placeholder(constructor getOrThrow 只需非空值先 boot)。
- **`acsConnectionString`(email,CH-012)同樣係必填 securestring** —— 未接 ACS 就填非空 placeholder,`acs-email.service.ts` 會當 malformed 而 disable email 並 log,唔會阻 boot(ADR-0019 D4)。**但 `acsSenderAddress` 填錯就係最靜嘅錯法**:ACS 會收貨但唔送達,而 API 仍返 `Succeeded`(CH-011 R1)—— 呢個 connector 冇 probe,**第一次真寄係唯一證據**。`appBaseUrl` 漏填 → 密碼重設信永遠寄唔出,但 API 照返 204。
- `databaseUrl = postgresql://uop:<DBPW>@<pg>.postgres.database.azure.com:5432/platform?sslmode=require`。
- **DB 密碼一入 params 檔即 persist** —— 唔會再重演 W34「舊 DBPW 唔知、要繞 image-only update」。

> **⚠️ n8n outbound(線②)未 wire 落 template**:`aca.json` 現時無 `N8N_OUTBOUND_WEBHOOK_*` / `REQUEST_SUBMISSION_PROVIDER` param(provider 寫死 `direct`)。要部署 n8n outbound,先擴 `aca.json`(加 3 param + secret + env),再喺 params 檔加值。
> **長遠 harden**:params 檔明文 secret → 遷 **Key Vault + Managed Identity**(見 `06-prod-hardening-checklist.md`)。

## 5. Deploy ACA via ARM [SP]

```bash
az deployment group validate -g <rg> --template-file deploy/azure/aca.json --parameters @deploy/azure/aca.params.uat.json -o json   # 先 validate
az deployment group create   -g <rg> -n uop-aca-deploy --template-file deploy/azure/aca.json --parameters @deploy/azure/aca.params.uat.json -o json
#   ↑ CLI 可能被殺，但 server-side 照跑。真結果：
az deployment group show -g <rg> -n uop-aca-deploy --query properties.provisioningState -o tsv   # Succeeded
```

`aca.json` 會建:ACA env(`cae-…`)+ `ca-uop-api`(**internal** ingress,`allowInsecure:true`)+ `ca-uop-web`(external,單一 origin)。api env 已含 `RUN_MIGRATIONS_ON_START=true` / `RUN_SEED_ON_START=true` + break-glass `AUTH_JWT_SECRET`/`LOCAL_ADMIN_INITIAL_PASSWORD`。輸出 `webFqdn` / `apiFqdn`。

## 6. Migration + seed —— **自動**(container 啟動時) [自動]

**唔使人手** —— api container entrypoint(`apps/api/docker-entrypoint.sh`)喺 `RUN_MIGRATIONS_ON_START=true`/`RUN_SEED_ON_START=true` 下自跑 `prisma migrate deploy` + `npm run seed`(兩者 idempotent,api 單 replica 無 race,失敗非致命)。原因:operator 喺公司網連唔到 Azure DB data-plane。
> operator 有得連 DB(唔受限網路)→ 可改由 operator 跑 `npm run prisma:deploy -w @uop/api` + seed,並把兩個 `RUN_*` flag 設 false。

## 7. Smoke test [SP]

逐層 curl(container log 睇唔到時,HTTP code 精準指層):

```bash
WEB=https://<web-fqdn>
curl -sS -k -m 30 -o /dev/null -w "%{http_code}\n" $WEB/            # SPA → 200
curl -sS -k -m 30 -L -o /dev/null -w "%{http_code}\n" $WEB/api/docs/api   # api via proxy → 200
curl -sS -k -m 30 -X POST $WEB/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@uop.local","password":"<ADMINPW>"}' -w "\n%{http_code}\n"   # break-glass → 200 (ADMIN)
```

**HTTP code → 邊層壞咗**(W33 實戰對照):`404`「app does not exist」= nginx Host header 錯 / api replica 未 ready · `301` = ACA internal ingress 迫 https(要 `allowInsecure`)· `401` login = admin 未 seed(seed 失敗)· `500` = DB 連唔到(migrate 失敗)· `200` = 該層通。瀏覽器(信公司 CA)唔使 `-k`。

## 8. 已烘入 artifact 嘅 5 個配置(唔使再踩)

落地踩過,已 fix 入 artifact —— **重部署唔會再遇**,但改動時要知:
1. **entrypoint 非致命**(migrate/seed 失敗唔 crash container)—— `docker-entrypoint.sh`
2. **nginx `Host $proxy_host`**(唔可 `$host`,否則 ACA internal ingress 404)—— `nginx.conf.template`
3. **api ingress `allowInsecure:true`**(否則 http upstream 被 301→https)—— `aca.json`
4. **runtime `npm ci --include=dev`**(否則 `NODE_ENV=production` omit ts-node → seed 跑唔到)—— `apps/api/Dockerfile`
5. **`rootDir: "./src"` 釘死 emit 佈局 + `RUN test -f dist/main.js` build gate**(BUG-008,2026-07-29)—— `apps/api/tsconfig.build.json` + `apps/api/Dockerfile`

> **第 5 項嘅背景**:冇 `rootDir` 嗰陣,tsc 用「所有被編譯檔案嘅共同父目錄」做輸出根。CH-011 加咗 `src/` 以外第一個 `.ts`,輸出根即由 `src/` 抬升到 `apps/api/`,`dist/main.js` 唔再存在,**每個容器一起身就 `MODULE_NOT_FOUND` → CrashLoopBackOff**(UAT 同步 `2b5057a` 全掛,rollback 到 `uat-0cf0cf3`)。
>
> 🔴 而 626 test 綠 · `npm run build` 成功 · lint 零 output · `az acr build` Succeeded —— **四道 gate 全部攔唔到**。所以呢啲綠燈唔可以當部署會成功;真正嘅 pass 標準係 revision Running/Healthy + smoke 過。詳見 `03-build-images.md`「emit 佈局」同 `docs/03-implementation/bugs/BUG-008-dist-entrypoint-path-drift/`。

## 9. Rollback

- ACA revision:每個 image tag = 一個 revision。改 `aca.params.json` 個 `apiImage`/`webImage` 返舊 tag → 重跑 §5 `az deployment group create`(宣告式,會 roll)。
- DB:Prisma migrate 無 auto-down → 靠 RCI daily 備份還原(PAR Appendix)。部署前確認備份生效。

## 10. Gotchas 清單

- `az` **sequential**(並發互鎖 hang)· CLI charmap crash 查 management plane · 背景被殺 server-side 照完
- `az postgres flexible-server create` 呢版本**無** `--database-name` → 分步建 DB
- `NODE_ENV=production` + `npm ci` 會 omit devDeps(連累 ts-node seed)→ `--include=dev`
- **加 `src/` 以外嘅 `.ts` 落 api 會搬走編譯輸出根** → 已由 `rootDir` 攔住(§8.5);見到 tsc 報 TS6059 就係呢道閘響,唔好靠改 entrypoint 兜
- **`az acr build` Succeeded 唔證明容器起得身** → 一定要驗 revision `Running/Healthy`
- ACA app-to-app:Host = upstream host、internal ingress 要 `allowInsecure` 或 https upstream
- `--public-access 0.0.0.0` = allow Azure services(ACA 到到);hardening 收窄

## 附:資源命名(填 PAR Section 1 + as-built)

`<rg>`/`<acr>`/`<pg>`/`<kv>`/`<env>`/`<law>`/region → `05-rci-par-process.md` Section 1 + `07-uat-as-built.md`。
