# 09 — DEV As-Built(Azure DEV 環境,infra team 交付)

> **狀態(2026-08-04)**:**未部署** —— 本文記錄嘅係 **infra team 交付嘅環境現狀 + 實測結果**,唔係部署記錄。
> 兩個 container app 而家跑緊 Azure 預設 placeholder image(`mcr.microsoft.com/k8se/quickstart:latest`)。
> 部署完成後,本文加「部署記錄」節(格式跟 `07-uat-as-built.md`)。
>
> **目的**:呢個環境同 **n8n UAT 接得通** —— 解封 W36/W39/W40/W42 一路 carry 嘅「n8n 側零 live 驗證」缺口。
> **Phase**:`docs/01-planning/W44-azure-dev-deploy/`

## 🔴 點解要開呢個環境(2026-08-04 Chris 更正)

**之前部署嗰個「UAT」唔係真正嘅 UAT**,只係一個測試用嘅 Azure 環境 —— 我哋自己喺同一個 `rcitest` subscription 由零建起嘅**孤島**:自建 RG(`RG-RCITest-RAPO-N8N`)+ 自建 ACR + 自建 ACA env(**冇 VNet 整合**)+ PG public `0.0.0.0`。佢住喺 Azure 公網上,**同企業網絡冇任何連繫**。

⇒ **佢同 n8n 兩個方向都接唔通**:

| 方向 | 用途 | 舊環境點解唔通 | 新環境靠乜通 |
|---|---|---|---|
| **n8n → UOP** | `POST /requests/intake` | n8n 喺**企業內網**,舊環境只有 `azurecontainerapps.io` 公網 FQDN,冇企業 domain 入口 | custom domain **`rapo-uop-web-dev.rci-t.com`**(企業 domain + SNI cert) |
| **UOP → n8n** | outbound webhook · `LicenseOperationsProvider` · `TicketUpdateProvider`(ADR-0017 三接縫) | 🔴 ACA env **冇 VNet 整合** ⇒ **打唔入企業內網**,無論 n8n 個 URL 係咩 | 🔴 **靠共用 ACA env `acaen-rapo-dev` 有 VNet 整合** —— 即 **B3**,而 B3 **未證實** |

**呢個就係 W36/W39/W40/W42 一路 carry 嗰句「n8n 側從未真接通,三個 seam 零 live 驗證」嘅根本原因** —— 唔係漏做,係環境上做唔到。

🔴 **所以 B3 唔係一個部署細節,係本環境成敗嘅關鍵**:outbound 半邊(ADR-0017 三個接縫)完全繫於 ACA env 有冇 VNet 整合 + 路由到 on-prem。**ADR-0027 D1 揀 A 定 B 都改變唔到呢件事**(ingress 係 inbound 概念)。

> **命名更正處理**:Chris 拍板**保留舊檔名 / ADR 標題**,靠 blockquote 更正(改名會令 git history 永久對唔上,W36 教訓)。見 `07-uat-as-built.md` 同 ADR-0012 頂部。

## 🔴 三個 blocker(未解封,部署做唔到)

| # | Blocker | 實測證據 | 卡住 |
|---|---|---|---|
| **B1** | **冇任何可達嘅 container registry** | `azure_container_registry` 給定值 = `4a6e1474-a105-4ea4-b273-3c6ae7f1923a`(GUID),而 **ACR 名只准 5–50 個純字母數字**(冇 dash)⇒ 唔可能係 ACR 名。三個獨立實測:RG 內冇 `Microsoft.ContainerRegistry/registries` · `az acr list` 返 `[]` · 用該 GUID 做 subscription = `not found`。🔴 **2026-08-04 更新理解**:registry 應該係**企業中央**嗰個(舊環境自建 ACR 係因為佢係孤島)⇒ 問題唔係「registry 去咗邊」,而係「**企業中央 registry 叫咩、SP 要點攞 AcrPush**」 | build / push / pull 全部 |
| **B2** | 🟢 **已解封** | infra 2026-08-04:**`rapoaiuopdev` 係 DB admin**(唔係 database 名)。database **我哋自己建咗** —— `az postgres flexible-server db create -d platform`,實測 `db list` 由 3 個系統 db(`azure_maintenance`/`postgres`/`azure_sys`)變成 4 個。🔴 **原本被錯判成 blocker**:理由寫「PG private 連唔到所以建唔到」,但**建 database 係 management plane 操作**,唔需要連到 data-plane;SP 有 RG Contributor 就做得到(UAT runbook §2 本來就係咁建) | — |
| **B3** | 🟢 **infra 已答** | infra 2026-08-04:`acaen-rapo-dev` **已整合 `vNet-RCITest-HKG`**,DNS 解析得到 web / api / PG / Redis 四個 URL(「landing zone design,your AI cannot detect it but network level already configurated」)。⚠️ **佢列嗰四個入面冇 n8n** ⇒ **outbound 路由仍未答** | — |
| ⚠️ **B4** | 🟢 **infra 已答** | 「used contributor to replace」⇒ 用 contributor 處理 join action。**未實測**,部署時若 403 再追 | — |

### ⚠️ B3 答咗一半 —— **outbound 到 n8n 仍未確認**

infra 列嘅四個 DNS 目標(web portal / api / PG / Redis)**全部係 UOP 自己嘅資源**,冇一個係 n8n。而呢個環境開嚟就係為咗接 n8n,**outbound 半邊(ADR-0017 三個接縫)先係舊環境做唔到嗰樣**。⇒ 仍要問:**container app 打唔打得入企業內網嘅 n8n?UOP 應該用邊個 n8n base URL?**

### ⚠️ 另一個對唔上嘅細節:web portal 個 scheme

infra 寫 **`http://rapo-uop-web-dev.rci-t.com/`**,但實測 container app 個 `customDomains` 有 **`bindingType: SniEnabled`** + certificateId(`acaen-rapo-dev/certificates/rcit`)⇒ ACA 側支援 **https**。兩個 scheme 部署後都要實測,而 **`appBaseUrl` 填錯 scheme 係最靜嘅錯法**(密碼重設信條 link 錯,而 API 照返 204)。

**交畀 infra team 嘅問題**:見 `W44-azure-dev-deploy/plan.md` 附錄 C。

### 🔴 B1 深化(2026-08-04 下午,infra 回覆後實測)—— **image 兩條路都斷**

Infra 回覆:registry = **`acrrci3ailanding1.azurecr.io`**(RCI AI landing zone),用 **cross-tenant SP `4a6e1474-…`** 有 AcrPush。實測之後,**兩條 build 路都行唔通**:

| 路 | 實測結果 | 出處 |
|---|---|---|
| **`az acr build`**(Azure 側 build,UAT 嗰條路) | ❌ SP login **成功**,但 `az acr show -n acrrci3ailanding1` → **`could not be found in subscription`**;`az role assignment list` 顯示佢喺我哋 sub **只有 `Reader`**(scope `RG-RAPO-UOP-DEV`)⇒ **registry 唔喺我哋 subscription,冇 management plane 存取**,開唔到 task run | 本節 |
| **本地 `docker build` + `docker push`** | ❌ **兩重失敗**:①`docker pull node:20-slim` → Docker Hub CDN `production.cloudfront.docker.com` **503**(runbook §0 嗰條環境規律仍然成立)②`docker login acrrci3ailanding1.azurecr.io` → **`DENIED: client with IP '165.85.7.2' is not allowed access`**(ACR firewall) | 本節 |

**⚠️ 一個 runbook §0 需要更正嘅點**:§0 寫「ACR `/v2/` 被公司 proxy 擋」。實測**呢個 registry 唔係咁** —— `/v2/` **通得過 proxy**,我哋收到嘅係 **ACR 自己嘅 firewall 拒絕訊息**(真回應,唔係 MITM / 503)。⇒ 兩者要分開講:**Docker Hub CDN 確實被 proxy 503;ACR data-plane 通得到,但被 registry firewall 擋**。

**三個解法(要 infra team 揀一個)**:
1. 🥇 **畀 management plane 權限 + firewall 放行** —— SP 對 `acrrci3ailanding1` 要 `Contributor`(或者 `AcrPush` + `Microsoft.ContainerRegistry/registries/scheduleRun/action`,因為 **`AcrPush` 唔包 scheduleRun**),**同時**把出口 IP **`165.85.7.2`** 加入 ACR firewall allow list(`az acr build` 要上傳 source context,嗰步係 data-plane)。呢條路最乾淨 —— **base image 喺 Azure 側 pull,完全繞開公司 proxy**。
2. **只放行 firewall + 提供 base image 來源** —— 咁本地 push 得,但 `docker build` 仍然要 `node:20-slim` / `nginx:1.27-alpine`。除非 ACR 內已有 mirror(可改 Dockerfile `FROM acrrci3ailanding1.azurecr.io/node:20-slim`),否則呢條路仍然斷喺 Docker Hub。
3. **infra team 代 build + push** —— 佢哋喺 allowed 網絡,由 repo build 兩個 image 推上 registry。最少改權限,但每次部署都要人手。

**ACA pull 側仲有一個未驗嘅點**:即使我哋 push 得,`aca-rapo-uop-api-dev` / `-web-dev` 都要 pull 得到 —— container app `registries` 而家係 `[]`,要配 credential,而 ACR 喺 VNet 側嘅可達性(private endpoint / service endpoint)未確認。

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

## DEV vs 舊測試環境 — 六處差異(其實係**同一個轉變**嘅六個表現)

> 呢六樣**唔係六件獨立嘅事**,係「**自建孤島 → 企業託管**」呢一個轉變嘅衍生。理解咗呢點,連 B1 都由「registry 唔知去咗邊」變成「**registry 係企業中央嗰個,所以只有一個 RG scope 嘅 SP 梗係睇唔到**」。

| # | 差異 | 舊測試環境 | DEV | 影響 |
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
