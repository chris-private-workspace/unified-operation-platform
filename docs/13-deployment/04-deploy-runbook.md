# 04 — Deploy Runbook(Azure UAT)

> **前置閘**:RCI 部署**必先過 PAR**(見 `05-rci-par-process.md`)+ 用戶明確落令。本 runbook 係 W32 準備嘅步驟藍圖,**W32 唔執行**。
> 分工標記:**[RIT]** = RCI 團隊(PAR 後)· **[SP]** = 我哋用已登入嘅 service principal 執行。實際邊步歸邊方,**部署前同 RIT 對齊**(RCI 通常由 RIT 掌 subscription / VNet / 網路,app 層畀 project team)。
> 佔位:`<rg>` resource group · `<acr>` registry · `<kv>` key vault · `<pg>` postgres server · `<env>` ACA environment · `<loc>` 如 `eastasia`(RCI1 HK)。

## 0. 前置

- [ ] PAR **Accepted**(Section 3 全簽)
- [ ] `az login`(SP)+ `az account set --subscription <uat-sub>`;`az account show` 確認 tenant/sub 正確
- [ ] 決定命名 + region(RCI1 HK = `eastasia` 最近)
- [ ] 產生強隨機 secret:`AUTH_JWT_SECRET`(≥32 bytes)、`INTAKE_API_KEY`、DB 密碼、`LOCAL_ADMIN_INITIAL_PASSWORD` —— **只入 Key Vault**,唔落檔

## 1. Provision 基礎資源 [RIT 或 SP,視 RCI 分工]

```bash
az group create -n <rg> -l <loc>

# ACR(image registry)
az acr create -n <acr> -g <rg> --sku Basic

# PostgreSQL Flexible Server(managed;private access 對齊 RCI 安全)
az postgres flexible-server create -n <pg> -g <rg> -l <loc> \
  --tier Burstable --sku-name Standard_B1ms --version 16 \
  --admin-user uop --admin-password '<db-pw-from-kv>' \
  --database-name platform
#   ⚠ 網路:RCI 慣例 private access / VNet。臨時 public 需明確 firewall allow,收工即收。

# Key Vault
az keyvault create -n <kv> -g <rg> -l <loc>

# Log Analytics + ACA environment
az monitor log-analytics workspace create -n <law> -g <rg> -l <loc>
az containerapp env create -n <env> -g <rg> -l <loc> \
  --logs-workspace-id <law-customer-id> --logs-workspace-key <law-key>
```

## 2. 入 Key Vault(全部 secret) [SP]

```bash
az keyvault secret set --vault-name <kv> -n DATABASE-URL \
  --value 'postgresql://uop:<db-pw>@<pg>.postgres.database.azure.com:5432/platform?sslmode=require'
az keyvault secret set --vault-name <kv> -n GRAPH-CLIENT-SECRET  --value '<...>'
az keyvault secret set --vault-name <kv> -n SERVICENOW-PASSWORD  --value '<...>'
az keyvault secret set --vault-name <kv> -n INTAKE-API-KEY       --value '<...>'
az keyvault secret set --vault-name <kv> -n AUTH-JWT-SECRET      --value '<...>'
az keyvault secret set --vault-name <kv> -n LOCAL-ADMIN-INITIAL-PASSWORD --value '<...>'
```
> secret 清單來源:`02-environment-reference.md`「UAT 最小變數清單」。**絕不**將真值寫入本 runbook / git。

## 3. Build + push image [SP]

```bash
# 由 repo root。az acr build 喺 Azure 側 build(繞開公司 proxy —— 見 03 §CDN 503)。
TAG=uat-$(git rev-parse --short HEAD)
az acr build --registry <acr> --image uop-api:$TAG -f apps/api/Dockerfile .

# uop-web:Entra SSO 值係 build-time,經 --build-arg 烘死落 bundle(非 secret)。
# VITE_ENTRA_REDIRECT_URI = 最終 uop-web 對外 hostname(先建 web app 攞 FQDN,或用自訂域)。
az acr build --registry <acr> --image uop-web:$TAG -f apps/web/Dockerfile . \
  --build-arg VITE_ENTRA_CLIENT_ID=<uop-web-spa-client-id> \
  --build-arg VITE_ENTRA_TENANT_ID=<tenant-id> \
  --build-arg VITE_ENTRA_API_SCOPE=api://<uop-api-client-id>/access_as_user \
  --build-arg VITE_ENTRA_REDIRECT_URI=https://<uop-web-fqdn>
#   若 UAT app registration 未 ready → 省略 4 個 --build-arg,前端跌返 break-glass 本地登入;
#   SSO 後補時要重 build uop-web(VITE_* 係 build-time)。
```
> ⚠️ 首次 build 要**真睇綠燈**先當成功(03 §未驗證項:argon2 prebuilt / prisma engine / prisma copy 三個假設未經一次成功 build 證實)。
> ⚠️ **redirect URI 雞蛋問題**:`VITE_ENTRA_REDIRECT_URI` 要 web 嘅最終 hostname,但 hostname 部署先知。做法:先建 `uop-web`(step 5)攞 FQDN → 再 build web image → 更新 revision;或用預定自訂域。

## 4. Migration + seed(對 UAT DB,由 operator/pipeline) [SP]

**唔喺 container 內跑** —— 由 operator 機(已 cache Prisma engine)對 UAT DB 執行:

```bash
# operator 機需能連到 UAT Postgres(firewall allow operator IP,或喺 VNet 內)
export DATABASE_URL='postgresql://uop:<db-pw>@<pg>.postgres.database.azure.com:5432/platform?sslmode=require'
npm run prisma:deploy -w @uop/api        # prisma migrate deploy(唔用 migrate dev)
LOCAL_ADMIN_INITIAL_PASSWORD='<...>' npm run seed   # 23 OpCos + 本地 admin
```
> 真數 curation(真 tenant catalog sync + 37-SKU businessAlias,DD-1 殘留)= 部署後 ops step,見 module spec / ADR-0004;**唔喺首次 bring-up 必需**。

## 5. Deploy container apps [SP]

```bash
# api —— internal ingress(只俾 web + 環境內部叫);KV secret ref 注入
az containerapp create -n uop-api -g <rg> --environment <env> \
  --image <acr>.azurecr.io/uop-api:uat-<sha> \
  --ingress internal --target-port 3000 \
  --min-replicas 1 --max-replicas 1 \
  --system-assigned \
  --registry-server <acr>.azurecr.io
#   → 授 uop-api 嘅 managed identity 讀 <kv>(RBAC: Key Vault Secrets User)
#   → 用 `az containerapp secret set --secrets xxx=keyvaultref:...` 綁 KV,再
#     `--env-vars` 將 GRAPH_CLIENT_SECRET=secretref:xxx / AUTH_JWT_SECRET=secretref:xxx 等注入;
#     非 secret 直接 --env-vars:
#       NODE_ENV=production PORT=3000 REQUEST_SUBMISSION_PROVIDER=direct
#       GRAPH_TENANT_ID=... GRAPH_CLIENT_ID=... SERVICENOW_INSTANCE_URL=... SERVICENOW_USER=...
#       SERVICENOW_DEFAULT_TABLE=sc_req_item
#       ENTRA_TENANT_ID=<tenant> ENTRA_API_AUDIENCE=api://<uop-api-client-id>   ← Entra SSO
#   → break-glass:AUTH_JWT_SECRET(KV)必設,令本地 admin 可登入(dual-provider)
#   → 確認 AUTH_DEV_BYPASS 冇設(留空)

# web —— external ingress(單一對外 hostname);API_UPSTREAM 指 api internal FQDN
az containerapp create -n uop-web -g <rg> --environment <env> \
  --image <acr>.azurecr.io/uop-web:uat-<sha> \
  --ingress external --target-port 8080 \
  --min-replicas 1 --max-replicas 2 \
  --registry-server <acr>.azurecr.io \
  --env-vars API_UPSTREAM=https://uop-api.internal.<env-default-domain>
```
> `uop-api` 嘅 internal FQDN 由 `az containerapp show -n uop-api --query properties.configuration.ingress.fqdn` 攞。

## 6. Smoke test [SP]

- [ ] `curl -sf https://<uop-web-fqdn>/api/docs/api` → 200(前端 origin 反代到 api OpenAPI)
- [ ] 瀏覽器開 `https://<uop-web-fqdn>` → Login 畫面(**唔係** dev-bypass 直入)
- [ ] **Entra SSO**:撳 Microsoft 登入 → redirect login.microsoftonline.com → 回來已登入 → Overview 有 data(SSO user 需已 provision + 有 role)
- [ ] **Break-glass**:`admin@uop.local` + `LOCAL_ADMIN_INITIAL_PASSWORD` 登入 → **強制改密** gate 出現(首個 admin,用嚟 provision SSO users)
- [ ] DevTools:break-glass 登入後 cookie `uop_access` = `HttpOnly` + `Secure` + `SameSite=Strict`;SSO 登入後 API call 帶 `Authorization: Bearer`
- [ ] 無 CORS error(單一 origin 應零 CORS)

## 7. Rollback

- ACA revision-based:`az containerapp revision list` → `az containerapp ingress traffic set` 將 100% 導返上一個 good revision(對應舊 image tag)。
- DB migration:Prisma migrate **無自動 down**;若 migration 有問題 → 由備份還原(RCI 預設 daily 備份,PAR Appendix)。故**部署前確認 DB 備份策略已生效**。

## 附:資源命名 checklist(填 PAR Section 1 用)

`<rg>` / `<acr>` / `<pg>` / `<kv>` / `<env>` / `<law>` / region —— 一併填入 `05-rci-par-process.md` 嘅 Section 1 輸入 pack。
