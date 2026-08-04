# 09 — DEV As-Built(Azure DEV 環境,infra team 交付)

> **狀態(2026-08-04)**:**未部署** —— 本文記錄嘅係 **infra team 交付嘅環境現狀 + 實測結果**,唔係部署記錄。
> 兩個 container app 而家跑緊 Azure 預設 placeholder image(`mcr.microsoft.com/k8se/quickstart:latest`)。
> 部署完成後,本文加「部署記錄」節(格式跟 `07-uat-as-built.md`)。
>
> **目的**:呢個環境同 **n8n UAT 接得通** —— 解封 W36/W39/W40/W42 一路 carry 嘅「n8n 側零 live 驗證」缺口。
> **Phase**:`docs/01-planning/W44-azure-dev-deploy/`

## 🔴 三個 blocker(未解封,部署做唔到)

| # | Blocker | 實測證據 | 卡住 |
|---|---|---|---|
| **B1** | **冇任何可達嘅 container registry** | `azure_container_registry` 給定值 = `4a6e1474-a105-4ea4-b273-3c6ae7f1923a`(GUID),而 **ACR 名只准 5–50 個純字母數字**(冇 dash)⇒ 唔可能係 ACR 名。三個獨立實測:RG 內冇 `Microsoft.ContainerRegistry/registries` · `az acr list` 返 `[]` · 用該 GUID 做 subscription = `not found` | build / push / pull 全部 |
| **B2** | **PG credential 對唔上** | server `administratorLogin` = **`rcitadmin`**,但交付值係 `azure_postgresql_id=rapoaiuopdev` | `databaseUrl` 砌唔到 |
| **B3** | **ACA env 連唔連到 private PG/Redis,證明唔到** | SP 讀 `acaen-rapo-dev` → `AuthorizationFailed`;PE `dnsZoneGroup` = **null** | 部署後先知(而部署要先過 B1) |
| ⚠️ **B4** | SP 對 ACA env 連 read 都冇 ⇒ 部署可能需要 `managedEnvironments/join/action` 而 403 | 同上 | 待實測 |

**交畀 infra team 嘅問題**:見 `W44-azure-dev-deploy/plan.md` 附錄 C。

## Subscription / 位置

| 項 | 值 |
|---|---|
| Subscription | `30dac177-…`(**Microsoft Azure (rcitest): #1023861** —— **同 UAT 同一個**) |
| Tenant | `4f63aaa0-…` |
| Deployment SP | `d2f094a3-…` · **Contributor,scope 只限 `RG-RAPO-UOP-DEV`**(同 UAT 一樣窄) |
| Resource group | **`RG-RAPO-UOP-DEV`** |
| Region | `eastasia`(RCI1 HK) |

> SP 憑證放喺 `apps/api/.env` 尾段(`azure_tenant_id` / `azure_client_id` / `azure_secret`)。**呢個檔 gitignored,絕不 commit**(H4)。
> 做 az 操作時建議設獨立 `AZURE_CONFIG_DIR`,避免踩到 operator 現有嘅 az login session。

## 資源清單(11 個,2026-08-04 實測)

| 資源 | 名 | 關鍵事實 |
|---|---|---|
| Container App(api) | `aca-rapo-uop-api-dev` | **空殼**(quickstart image)· ingress **external** · targetPort **80** · `allowInsecure=false` · `registries: []` · secrets `null` · env `null` · identity **None** |
| Container App(web) | `aca-rapo-uop-web-dev` | **空殼** · external · port 80 · **custom domain `rapo-uop-web-dev.rci-t.com`**,`bindingType=SniEnabled`,cert = `acaen-rapo-dev/certificates/rcit` |
| ACA managed env | `acaen-rapo-dev` | 🔴 喺 **`RG-RAPO-ContainerAPP-DEV`**(另一個 RG,**共用**)· **SP 冇 read 權** |
| PostgreSQL Flexible | `pgsql-rapo-uop-dev` | FQDN `pgsql-rapo-uop-dev.postgres.database.azure.com` · **v18**(UAT 係 16)· admin **`rcitadmin`** · `Standard_B1ms` · **`publicNetworkAccess = Disabled`** · `delegatedSubnet = null`(行 PE 模式唔係 VNet-injected) |
| Redis | `redis-rapo-uop-dev` | `redis-rapo-uop-dev.redis.cache.windows.net` · sslPort **6380** · `enableNonSslPort = false` · Basic C0 · **public access Disabled** |
| Key Vault | `kv-rapo-uop-dev` | RBAC 模式 · 🔴 **data-plane 用唔到**(見下) |
| App Insights | `appi-rapo-uop-dev` | connection string 攞得到(management plane) |
| Private Endpoint ×2 | `pe-pgsql-rapo-uop-dev` / `pe-redis-rapo-uop-dev` | subnet = **`RG-RCITest-HKG-Infra/vNet-RCITest-HKG/Subnet-RCITest-D-DB`**(企業 hub)· 🔴 **`privateDnsZoneConfigs` = null** |
| NIC ×2 | `pe-…-nic` | PE 附屬 |
| Alert rule | `Failure Anomalies - appi-rapo-uop-dev` | App Insights 預設 smart detector |

### Key Vault 用唔到(同 UAT 同一個成因)

```
az keyvault secret list --vault-name kv-rapo-uop-dev
ERROR: [SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed:
       self-signed certificate in certificate chain (_ssl.c:1032)
```

公司 proxy SSL-MITM 擋 data-plane(`vault.azure.net`)—— 完全對應 `04-deploy-runbook.md` §0 記錄嘅環境規律。⇒ **secret 照走 ACA native secureString**,唔用 KV。

## URL

| 用途 | URL |
|---|---|
| Web(對外,**正式入口**) | **`https://rapo-uop-web-dev.rci-t.com/`** |
| Web(ACA 預設 FQDN) | `https://aca-rapo-uop-web-dev.nicesea-c3849dba.eastasia.azurecontainerapps.io` |
| API(ACA 預設 FQDN) | `https://aca-rapo-uop-api-dev.nicesea-c3849dba.eastasia.azurecontainerapps.io` — **用唔用視乎 ADR-0027 D1 拍板** |

> 🔴 **`.env` 個 `azure_url_for_uop` 寫住 `http://`,但實際係 `https://`** —— custom domain 已綁 SNI 證書。
> 呢個唔係小事:`appBaseUrl` 填錯 scheme ⇒ 密碼重設信入面條 link 係 http,而 **API 照返 204、信照寄**,冇任何紅燈。同 CH-011 R1(`acsSenderAddress` 填錯係最靜嘅錯法)同一族。

## DEV vs UAT — 六處結構性差異

| # | 差異 | UAT | DEV | 影響 |
|---|---|---|---|---|
| 1 | **API ingress** | **internal**(web 做單一 origin,ADR-0012 D1) | **external** | 🔴 **ADR-0027** — 安全邊界改變,待拍板 |
| 2 | **ACA env** | 自己建(`aca.json` 內) | **共用既有**,另一個 RG,SP 無 read 權 | 要新 template `aca-dev.json` —— 現有 `aca.json` **自己建 env**,喺 DEV 建新 env 會令佢**唔喺 hub VNet** ⇒ 一定連唔到 private PG |
| 3 | **DB 網絡** | public `--public-access 0.0.0.0` | **Private Endpoint,public disabled** | **B3**;`RUN_MIGRATIONS_ON_START` self-migrate 更加必要(operator 一定連唔到) |
| 4 | **PG 版本** | 16 | **18** | Prisma migration 未喺 v18 跑過 → W44 **G8** 明確驗 |
| 5 | **Registry** | 自建 ACR(RG 內) | **冇** | 🔴 **B1** |
| 6 | **額外資源** | — | **Redis + App Insights + custom domain/SNI cert** | Redis **唔接**(`apps/api/src` 實測零 BullMQ 用法,ADR-0012 §D4 不預批)· App Insights 未接線 · custom domain ⇒ `appBaseUrl` 用 https |

## ⚠️ 部署時要特別小心

1. **ARM 係宣告式,會刪走冇寫嘅嘢。** infra team 已配好嘅 **web custom domain + SNI cert binding** 若冇寫入 template,一次部署就會消失。⇒ 部署前先 `az resource show` 存底,部署後逐項對返(W44 F2-1 / F6-9)。
2. **`az acr build` Succeeded ≠ 容器起得身。** BUG-008 實證:626 test 綠 + build 成功 + lint 零 output + ACR build Succeeded,**四道 gate 全部攔唔到** `dist/main.js` 唔存在。真 pass 標準 = revision **Running/Healthy** + smoke 過。
3. **`az` CLI 印 Unicode `✔` 會 charmap crash(exit 1 假象)** —— 真結果查 management plane(`az acr task list-runs` / `az deployment group show`)。
4. **`az` 一律 sequential** —— 多個並發會互鎖 hang。

## 認證(as-built)

**未部署,尚未適用。** 計劃沿用 ADR-0012 D2:Entra SSO 為主 + seeded 本地 admin 做 break-glass(dual-provider,ADR-0005)。DEV 嘅 Entra app registration **未有** —— 同 UAT 一樣,先用 break-glass 起,SSO 後補(AUTH-2b 仍卡 IT app registration)。

## 部署記錄

_(未部署 —— 部署後喺呢度加,格式跟 `07-uat-as-built.md`)_

## References

- `docs/adr/0027-azure-dev-deployment-topology.md`(**Proposed**,D1 待拍板)
- `docs/adr/0012-azure-uat-deployment-topology.md`(UAT 拓撲,本環境擴充佢)
- `docs/13-deployment/04-deploy-runbook.md`(as-built 部署路徑;§0 環境規律)
- `docs/13-deployment/07-uat-as-built.md`(UAT 對照)
- `docs/01-planning/W44-azure-dev-deploy/`(plan / checklist / progress)
