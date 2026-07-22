# 04 — Deploy Runbook(Azure UAT · as-built)

> **此 runbook 反映 W33 實際成功部署嘅路徑**(2026-07-22),已用真環境驗證。實際部署記錄見 [`07-uat-as-built.md`](./07-uat-as-built.md)。
> **前置閘**:RCI 正式部署需過 PAR(見 `05-rci-par-process.md`)。W33 UAT 已喺 `rcitest` sub 實跑;PAR 由 owner 另行處理,不阻 UAT。
> 佔位:`<rg>` / `<acr>` / `<pg>` / `<kv>` / `<env>` / `<law>` / `<loc>`(= `eastasia`)。

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

KV data-plane 被擋 → secret 用 ACA native secureString,經 ARM params 檔傳。**params 檔只落 session-temp,絕不入 git**(`deploy/azure/aca.json` 只有 `@secure()` param 定義,無值)。

```bash
# 生成 secret（url-safe DB 密碼要 3+ 類字元；base64 JWT）
DBPW="$(openssl rand -hex 20)Aa9x"; JWT="$(openssl rand -base64 48|tr -d '\n')"
INTAKE="$(openssl rand -hex 32)"; ADMINPW="Uop-$(openssl rand -hex 6)-Aa9"
# 攞 law id/key + acr pw（management plane）
LAWID=$(az monitor log-analytics workspace show -g <rg> -n <law> --query customerId -o tsv)
LAWKEY=$(az monitor log-analytics workspace get-shared-keys -g <rg> -n <law> --query primarySharedKey -o tsv)
ACRPW=$(az acr credential show -n <acr> --query 'passwords[0].value' -o tsv)
# 寫 <tmp>/aca.params.json：每個 param = {"value": …}；apiImage/webImage 用上面 $TAG；
# Graph/ServiceNow 首次可 placeholder（constructor getOrThrow 只需非空值先 boot）；
# databaseUrl = postgresql://uop:$DBPW@<pg>.postgres.database.azure.com:5432/platform?sslmode=require
# （template 參數清單見 deploy/azure/aca.json 頂部 parameters）
```

## 5. Deploy ACA via ARM [SP]

```bash
az deployment group validate -g <rg> --template-file deploy/azure/aca.json --parameters @<tmp>/aca.params.json -o json   # 先 validate
az deployment group create   -g <rg> -n uop-aca-deploy --template-file deploy/azure/aca.json --parameters @<tmp>/aca.params.json -o json
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

## 8. 已烘入 artifact 嘅 4 個配置(唔使再踩)

W33 落地踩過,已 fix 入 artifact —— **重部署唔會再遇**,但改動時要知:
1. **entrypoint 非致命**(migrate/seed 失敗唔 crash container)—— `docker-entrypoint.sh`
2. **nginx `Host $proxy_host`**(唔可 `$host`,否則 ACA internal ingress 404)—— `nginx.conf.template`
3. **api ingress `allowInsecure:true`**(否則 http upstream 被 301→https)—— `aca.json`
4. **runtime `npm ci --include=dev`**(否則 `NODE_ENV=production` omit ts-node → seed 跑唔到)—— `apps/api/Dockerfile`

## 9. Rollback

- ACA revision:每個 image tag = 一個 revision。改 `aca.params.json` 個 `apiImage`/`webImage` 返舊 tag → 重跑 §5 `az deployment group create`(宣告式,會 roll)。
- DB:Prisma migrate 無 auto-down → 靠 RCI daily 備份還原(PAR Appendix)。部署前確認備份生效。

## 10. Gotchas 清單

- `az` **sequential**(並發互鎖 hang)· CLI charmap crash 查 management plane · 背景被殺 server-side 照完
- `az postgres flexible-server create` 呢版本**無** `--database-name` → 分步建 DB
- `NODE_ENV=production` + `npm ci` 會 omit devDeps(連累 ts-node seed)→ `--include=dev`
- ACA app-to-app:Host = upstream host、internal ingress 要 `allowInsecure` 或 https upstream
- `--public-access 0.0.0.0` = allow Azure services(ACA 到到);hardening 收窄

## 附:資源命名(填 PAR Section 1 + as-built)

`<rg>`/`<acr>`/`<pg>`/`<kv>`/`<env>`/`<law>`/region → `05-rci-par-process.md` Section 1 + `07-uat-as-built.md`。
