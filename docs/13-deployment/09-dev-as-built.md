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

## 🟢 B1 已解封 / 🔴 **B4 兌現咗,變成新嘅硬 blocker**(2026-08-05)

> **2026-08-05 更新**:B1 卡咗兩日,**換一台唔喺公司網嘅 build host 之後完全解封** —— 兩個 image 已 build + **真 push 上 `acrrci3ailanding1`**,`what-if` 重跑同 baseline 一致。詳見下面「🟢 2026-08-05 第四輪」。
>
> 🔴 **但 `az deployment group create` 隨即撞 `LinkedAuthorizationFailed`** —— 即係一直標住「infra 已答、**未實測**」嘅 **B4**。詳見下面「🔴 2026-08-05 部署嘗試 #1」。
> 🟢 **零破壞**:ARM 喺 pre-flight 授權檢查就斷,兩個 app 完全保持原狀(custom domain / workloadProfile 都喺)。
> ⚠️ **本節以下由「三個 blocker」到「解法 ④」保留原文** —— 記錄當時嘅實測同判斷,唔係現況。

## 🔴 三個 blocker(未解封,部署做唔到)

| # | Blocker | 實測證據 | 卡住 |
|---|---|---|---|
| **B1** | **冇任何可達嘅 container registry** | `azure_container_registry` 給定值 = `4a6e1474-a105-4ea4-b273-3c6ae7f1923a`(GUID),而 **ACR 名只准 5–50 個純字母數字**(冇 dash)⇒ 唔可能係 ACR 名。三個獨立實測:RG 內冇 `Microsoft.ContainerRegistry/registries` · `az acr list` 返 `[]` · 用該 GUID 做 subscription = `not found`。🔴 **2026-08-04 更新理解**:registry 應該係**企業中央**嗰個(舊環境自建 ACR 係因為佢係孤島)⇒ 問題唔係「registry 去咗邊」,而係「**企業中央 registry 叫咩、SP 要點攞 AcrPush**」 | build / push / pull 全部 |
| **B2** | 🟢 **已解封** | infra 2026-08-04:**`rapoaiuopdev` 係 DB admin**(唔係 database 名)。database **我哋自己建咗** —— `az postgres flexible-server db create -d platform`,實測 `db list` 由 3 個系統 db(`azure_maintenance`/`postgres`/`azure_sys`)變成 4 個。🔴 **原本被錯判成 blocker**:理由寫「PG private 連唔到所以建唔到」,但**建 database 係 management plane 操作**,唔需要連到 data-plane;SP 有 RG Contributor 就做得到(UAT runbook §2 本來就係咁建) | — |
| **B3** | 🟢 **infra 已答** | infra 2026-08-04:`acaen-rapo-dev` **已整合 `vNet-RCITest-HKG`**,DNS 解析得到 web / api / PG / Redis 四個 URL(「landing zone design,your AI cannot detect it but network level already configurated」)。⚠️ **佢列嗰四個入面冇 n8n** ⇒ **outbound 路由仍未答** | — |
| ⚠️ **B4** | 🟢 **infra 已答** | 「used contributor to replace」⇒ 用 contributor 處理 join action。**未實測**,部署時若 403 再追 | — |

### 🟢 B3 兩半邊都有答案(2026-08-04 第二輪)

- **DB / Redis** —— `acaen-rapo-dev` 已整合 `vNet-RCITest-HKG`,DNS 解析得到四個目標
- **n8n** —— base URL = **`http://rapo-n8n-uat.rci-t.com/`**

⚠️ **但「有 URL」唔等於「container 到得到」。** 呢個係本環境存在嘅意義,**唔可以當佢已驗** —— 留 F7 由 container 側真打一次。舊環境嘅教訓正正係:網絡層面睇落合理,實際打唔通。

🔴 **順帶一個安全點(登 B6)**:個 n8n URL 係 **`http://`**。將來接 outbound 嗰陣,`N8N_OUTBOUND_WEBHOOK_KEY` 會**明文過線**。內網 http 喺企業環境常見,但呢個係一個要**明確接受**嘅取捨,唔應該靜靜咁行過去。

### 🟢 web portal scheme 已確認 = **https**

infra 第二輪回「**https:**」⇒ `appBaseUrl` 用 `https://rapo-uop-web-dev.rci-t.com`,同 `aca.params.dev.json` 本來填嘅一致 ⇒ **零改動**。(原本 B5 消除。)

**交畀 infra team 嘅問題**:見 `W44-azure-dev-deploy/plan.md` 附錄 C。

### 🔴 B1 深化(2026-08-04 下午,infra 回覆後實測)—— **image 兩條路都斷**

Infra 回覆:registry = **`acrrci3ailanding1.azurecr.io`**(RCI AI landing zone),用 **cross-tenant SP `4a6e1474-…`** 有 AcrPush。實測之後,**兩條 build 路都行唔通**:

| 路 | 實測結果 | 出處 |
|---|---|---|
| **`az acr build`**(Azure 側 build,UAT 嗰條路) | ❌ SP login **成功**,但 `az acr show -n acrrci3ailanding1` → **`could not be found in subscription`**;`az role assignment list` 顯示佢喺我哋 sub **只有 `Reader`**(scope `RG-RAPO-UOP-DEV`)⇒ **registry 唔喺我哋 subscription,冇 management plane 存取**,開唔到 task run | 本節 |
| **本地 `docker build` + `docker push`** | ❌ **兩重失敗**:①`docker pull node:20-slim` → Docker Hub CDN `production.cloudfront.docker.com` **503**(runbook §0 嗰條環境規律仍然成立)②`docker login acrrci3ailanding1.azurecr.io` → **`DENIED: client with IP '165.85.7.2' is not allowed access`**(ACR firewall) | 本節 |

**⚠️ 一個 runbook §0 需要更正嘅點**:§0 寫「ACR `/v2/` 被公司 proxy 擋」。實測**呢個 registry 唔係咁** —— `/v2/` **通得過 proxy**,我哋收到嘅係 **ACR 自己嘅 firewall 拒絕訊息**(真回應,唔係 MITM / 503)。⇒ 兩者要分開講:**Docker Hub CDN 確實被 proxy 503;ACR data-plane 通得到,但被 registry firewall 擋**。

**兩個解法(2026-08-04 由三個收窄,要 infra team 揀一個)**:
1. 🥇 **畀 management plane 權限 + firewall 放行** —— SP 對 `acrrci3ailanding1` 要 `Contributor`(或者 `AcrPush` + `Microsoft.ContainerRegistry/registries/scheduleRun/action`,因為 **`AcrPush` 唔包 scheduleRun**),**同時**把出口 IP **`165.85.7.2`** 加入 ACR firewall allow list(`az acr build` 要上傳 source context,嗰步係 data-plane)。呢條路最乾淨 —— **base image 喺 Azure 側 pull,完全繞開公司 proxy**。
2. **infra team 代 build + push** —— 佢哋喺 allowed 網絡,由 repo build 兩個 image 推上 registry。最少改權限,但每次部署都要人手。

🔴 **原本有第三個「只放行 firewall + 我哋自己 build」,已剔走** —— 放行咗我哋 push 得,但**仍然 build 唔到**:本地 `docker build` 要 pull `node:20-slim` / `nginx:1.27-alpine`,而 Docker Hub CDN 經公司 proxy **503**。除非 registry 內有 base image mirror,否則呢條路一定斷。**留住一個死路選項唔係保留彈性,係引人揀錯。**

### 🔄 2026-08-05 第三輪:**firewall 通咗,但 build 仍然斷**

infra 回覆:①「`4a6e1474-…` is the login for registry server；the one have permission to deploy is `d2f094a3-…`」②「i think it is fixed now, the new network having issue. I edited the setting」

**逐條實測**:

| 測乜 | 結果 |
|---|---|
| `docker login acrrci3ailanding1.azurecr.io`(用 `4a6e1474`) | ✅ **`Login Succeeded`** —— firewall 真係修好咗,**push 側解封** |
| `az acr show -n acrrci3ailanding1`(用 **`d2f094a3`**,infra 話有 deploy 權嗰個) | ❌ **`could not be found in subscription`** —— 同 `4a6e1474` 一樣,**兩個 SP 都冇 management plane 存取** ⇒ `az acr build` 仍然做唔到 |
| `/v2/_catalog`(data-plane,firewall 開咗之後) | ✅ 通。**7 個 repo,全部係應用 image**:`ai-document-processor` · `document-processor` · `document-processor-integrated` · `document-processor-stage1` · `myopenwebui` · **`n8n`** · `simple-document-processor` ⇒ **冇 `node` / `nginx` base image mirror 可以借** |

> 🔍 順帶:registry 入面有 **`n8n`** —— 側面印證 n8n 同 UOP 住喺同一個 landing zone。

⇒ **B1 而家卡喺一個唔同嘅位**:唔再係「入唔到 registry」,而係「**攞唔到 base image 嚟 build**」。

**三個解法(2026-08-05 更新 —— 由兩個變三個,因為 firewall 通咗令一條新路可行)**:

| # | 做法 | 評價 |
|---|---|---|
| **①🥇** | infra 畀 SP 對 `acrrci3ailanding1` 嘅 **management plane** 權 —— 最小需要 `Microsoft.ContainerRegistry/registries/**read**` + `.../**scheduleRun/action**`(後者**唔喺 `AcrPush` 入面**,喺 `Contributor`)⇒ 我哋跑 `az acr build` | 最乾淨:**base image 喺 Azure 側 pull**,一次過繞開公司 proxy;將來每次重 build 都自助 |
| **②** | infra **代 build + push** | 可行,但每次部署都要人手。指引已預先寫定(見下面「附:B1 解法 ②」) |
| **③🆕** | infra 用 `az acr import` 把兩個 base image 拉入 registry(`docker.io/library/node:20-slim` · `docker.io/library/nginx:1.27-alpine`),我哋改 Dockerfile 加 `ARG BASE_REGISTRY` 指去佢 | 我哋自助 build 得返。**代價**:base image 要有人定期更新;Dockerfile 多一個 ARG(**要預設空值令 UAT 逐字不變**) |

⚠️ **push 側只證到 `login`,未證到 `push`** —— 因為我哋根本冇 image 可以推(build 唔到)。要真證明 push 通,要等有第一個 image。

### 🚫 解法 ④ —— 自建 ACR:**技術上可行,但 Chris 2026-08-05 決定唔採用**

> **決定**:唔自建,等 infra 回覆 ①②③。**保持同 infra 交付嘅 landing zone 設計一致**,唔為咗快而開一個要日後搬返去嘅平行 registry。
> **點解仍然完整記低**:呢個評估本身花咗一輪真實測(provider 狀態 / ARM validate / MCR 探測),而且**若日後 infra 一直卡住、或者將來另一個環境撞同一個牆,唔使由頭查一次**。以下全部係當時嘅實測結果,唔係建議。

Chris 質疑「係咪真係唔部署得到」之後重新查一輪,發現**之前三個解法全部 assume 咗「registry 一定要係 `acrrci3ailanding1`」,而呢個 assumption 從來冇人立過**。

**實測(全部有真 output)**:

| 檢查 | 結果 |
|---|---|
| `Microsoft.ContainerRegistry` provider 註冊狀態 | **`Registered`** |
| `az deployment group validate`(建一個 Basic ACR 落 `RG-RAPO-UOP-DEV`) | **`provisioningState: Succeeded`**,`error` 全 null |
| MCR(`mcr.microsoft.com`)可達性 | ✅ **通**(`docker pull mcr/hello-world` → `exit=0`) |
| Docker Hub CDN | ❌ 仍然 **503**(同一 layer 再撞) |

⇒ `d2f094a3` 個 `RG-RAPO-UOP-DEV` Contributor **建得到我哋自己嘅 registry**。而**自己建嘅 registry 我哋有 management plane** ⇒ `az acr build` 跑得,**base image 喺 Azure 側 pull**,完全繞開公司 proxy —— 同 UAT 一直行嗰條路一模一樣。

**流程**:`az acr create -g RG-RAPO-UOP-DEV --sku Basic` → `az acr build` 兩個 image → `aca.params.dev.json` 個 `acrServer` / `acrUsername` / `acrPassword` 改指自己個 ACR → 部署。

🔴 **但呢個係一個決定,唔係純技術問題,要 owner 拍板**:
- **偏離 infra 交付嘅設計** —— 佢哋特登畀咗中央 registry `acrrci3ailanding1`,自建等於行返 UAT 嗰條「孤島」路
- **多一個資源**(Basic ACR,成本細但要記入環境清單)· 將來 image 要由自建 registry 搬返中央
- **治理**:RCI 側對自建資源有冇要求(PAR),要問

⚠️ **仲有兩件未驗證,唔可以當通**:
1. **`validate` Succeeded ≠ 一定建得成** —— validate 唔跑 Azure Policy;若 landing zone 有 policy 擋自建 registry,要 `create` 先知。
2. 🔴 **ACA 喺 VNet 內 pull 唔 pull 到我哋個新 ACR,未驗。** 新 ACR 預設 public,而 ACA 明顯出得到公網(佢而家跑緊 `mcr.microsoft.com/k8se/quickstart`),所以**大機會通** —— 但呢個係推論,唔係實測。

### 順帶:MCR 有 node 但**冇 nginx** ⇒ 換 base image 嗰條路唔完整

`docker manifest inspect` 探過五個候選:
- ✅ `mcr.microsoft.com/devcontainers/javascript-node:20`
- ✅ `mcr.microsoft.com/azurelinux/base/nodejs:20`
- ❌ `mcr.microsoft.com/mirror/docker/library/node:20-slim` · `.../nginx:1.27-alpine` · `mcr.microsoft.com/cbl-mariner/base/nodejs:20`

⇒ **web image 個 `nginx:1.27-alpine` 喺 MCR 冇對應**,所以「改用 MCR base image」呢條路**只解到一半**。而且就算解到,代價亦唔細:Azure Linux 用 `tdnf` 唔係 `apt-get`(Dockerfile 要改)、Prisma engine binary target 要重驗、兩個環境 base image diverge。**⇒ 唔建議,已記低免得下次再查一次。**

### ✅ pull 側擔心已撤銷(2026-08-04 infra 回覆)

原本擔心:web app 有 150+ 個 `outboundIpAddresses` ⇒ ACA pull 一樣撞 ACR firewall,逐個放行唔實際。

**infra 回覆:「We have private dns and endpoint for the ACR, so it will not use public egress IP」—— 佢哋講得啱。** ACA 有 VNet 整合,經 private endpoint 到 registry,**根本唔行 public egress** ⇒ outbound IP 清單唔關事。

⇒ **B1 純粹係 push 側問題**:我哋喺**公司網** build / push,**唔喺 VNet 入面**,所以一定行 public IP。呢個分辨好重要 —— 唔講清楚嘅話,infra 好容易以為我哋描述緊一個佢哋已經解決咗嘅問題。

**仍要配嘅**:container app `registries` 而家係 `[]`,pull credential 要落 template(已喺 `aca-dev.json` 做咗 parameter)。

## 🟢 2026-08-05 第四輪:**B1 解封** —— 靠一條從來冇列過嘅路

Chris 把 project 搬去一台**接得通 Azure DEV 環境**嘅機再重驗。出口 IP 由公司網嘅 `165.85.7.2` 變成 **`52.187.129.166`**(Azure 段)。

**逐項實測(全部有真 tool output)**:

| 檢查 | 公司網嗰台 | 呢台 | 證據 |
|---|---|---|---|
| **Docker Hub** | ❌ CDN 503 | ✅ **通** | `node:20-slim` · `nginx:1.27-alpine` 兩個都 pull 到 |
| **ACR firewall** | 一度 DENIED,infra 後來修好 | ✅ **通** | `Login Succeeded`(**新 IP 一樣放行**) |
| **api image build** | 卡 prisma TLS → `0d01f0c` 修好 | ✅ **成功** | BUG-008 個 `RUN test -f dist/main.js` 硬閘 **DONE** |
| **web image build** | **從未試過** | ✅ **成功** | vite `✓ built in 7.16s`,5 個 chunk |
| **push** | 🔴 **從未證過**(冇 image 可推) | ✅ **兩個都成功** | api `sha256:5a8d48cd…` · web `sha256:1d543670…` |

⇒ B1 三個未知數(base image 攞唔攞到 · firewall 放唔放行 · **push 通唔通**)全部有真 output,**最後嗰個係史上第一次證到**。

### 🔴 呢個係第 ⑤ 條路,而佢冇出現喺任何一份解法清單

列過嘅四條(①SP 攞 `scheduleRun/action` ②infra 代 build ③`az acr import` ④自建 ACR)**全部 assume 咗「build 一定要喺公司網嗰台機做」**。呢個 assumption 同 Day 2 揭嗰個「registry 一定要係 `acrrci3ailanding1`」係**同一個病** —— 唔係有人立過,係「一直喺嗰度做」滑成「只可以喺嗰度做」。

**⇒ 條件變咗要重驗嘅唔止係清單入面嘅前提,仲有「有咩前提我根本冇寫落嚟」。**

### ⚠️ 兩件唔可以靜靜當佢消失

1. **呢條路唔係長期方案** —— 佢等於「換一台唔受公司 proxy 影響嘅機」,**唔係**令部署鏈喺公司網跑得到。**解法 ① 仍然係最乾淨嗰個,infra 嗰邊唔應該因為我哋通咗就撤走。**
2. **`0d01f0c` 個 root CA 注入喺呢台機用唔着**(冇 TLS 重簽),但**保留** —— 佢只落 build stage、Azure 側 build 一樣用唔着(commit message 已寫),而公司網嗰台機仍然需要佢。

### ✅ 部署前 gate 重跑

`what-if`(tag 更新做 `dev-0d01f0c` 之後)**同 2026-08-04 baseline 一致**:`Succeeded` · **零 Delete** · **9 個 `Ignore`** · 只有 2 個 container app `Modify` · 🟢 **`customDomains` / `workloadProfileName` 保留** · web `external` 保持 true。api delta = ADR-0027 Option A 預期(`allowInsecure` false→true · `external` true→**false** · `targetPort` 80→**3000**);web = `targetPort` 80→**8080**;兩個都 `registries` + `secrets` **Create**。

⚠️ **被 unset 嘅 property 今次係四個唔係三個** —— 多咗 **`properties.runningStatus: Running → ''`**。佢係 read-only status field,ARM **應該**唔會真改,但**冇實證,係推論** ⇒ 照上面「有實證先當佢無害」嘅標準,留部署後對數專登睇。

## 🔴 2026-08-05 部署嘗試 #1:`LinkedAuthorizationFailed` —— **B4 兌現**

B1 解封之後即刻跑 `az deployment group create -n uop-dev-w44-0d01f0c`。**失敗**,error 原文:

```
LinkedAuthorizationFailed:
The client 'd2f094a3-b1ec-4c05-b71a-7fae91e08af0' with object id
'd6a6b91e-e98d-4c38-8103-45e70f410006' has permission to perform action
'Microsoft.App/containerApps/write' on scope
'/subscriptions/30dac177-…/resourcegroups/RG-RAPO-UOP-DEV/providers/
 Microsoft.App/containerApps/aca-rapo-uop-api-dev';
however, it does not have permission to perform action(s)
'Microsoft.App/managedEnvironments/join/action' on the linked scope(s)
'/subscriptions/30dac177-…/resourceGroups/RG-RAPO-ContainerAPP-DEV/providers/
 Microsoft.App/managedEnvironments/acaen-rapo-dev'
```

### 🟢 零破壞 —— ARM 喺 pre-flight 就斷

部署後 `az containerapp list` 實測,兩個 app **完全保持原狀**:

| 檢查 | api | web |
|---|---|---|
| `provisioningState` / `runningStatus` | `Succeeded` / `Running` | `Succeeded` / `Running` |
| image | 仍係 `mcr.microsoft.com/k8se/quickstart:latest` | 同左 |
| `customDomains` | — | 🟢 **`rapo-uop-web-dev.rci-t.com` 完好** |
| `workloadProfileName` | `Consumption` 保留 | `Consumption` 保留 |
| `registries` | 仍然空 | 仍然空 |

⇒ `LinkedAuthorization` 係**授權 pre-flight**,行喺任何 resource 改動之前。**what-if 個「零 Delete」保證冇被破壞。**

### 🔴 B4 唔係「未實測」,係「答錯咗」

`az role assignment list --assignee-object-id d6a6b91e-… --all` 實測 —— SP **只有一個** role assignment:

```
[Contributor] scope = /subscriptions/30dac177-…/resourceGroups/RG-RAPO-UOP-DEV
```

infra 2026-08-04 答 B4 嗰句「used contributor to replace」**係畀咗 UOP 個 RG 嘅 Contributor**,而 ACA env 住喺**另一個 RG `RG-RAPO-ContainerAPP-DEV`** ⇒ 嗰個 Contributor 覆蓋唔到。B4 原文本來就寫住「SP 對 `acaen-rapo-dev` 連 read 都冇」,而我哋當時標咗 🟢 **`未實測`** 就當佢過咗。

> 🔴 **教訓同 Day 3 嗰條係同一族,而且更直接**:B4 一直掛住「🟢 infra 已答」,而「已答」被當成「已解決」。**一個未實測嘅答覆,同一個未問嘅問題,喺風險上係同一樣嘢** —— 分別只在於前者令人唔再追。

### 需要 infra 做嘅嘢(精確)

SP(app id `d2f094a3-b1ec-4c05-b71a-7fae91e08af0` · object id `d6a6b91e-e98d-4c38-8103-45e70f410006`)需要 **`Microsoft.App/managedEnvironments/join/action`**,scope:

```
/subscriptions/30dac177-6dcb-412e-94f6-da9308fd1d09/resourceGroups/
  RG-RAPO-ContainerAPP-DEV/providers/Microsoft.App/managedEnvironments/acaen-rapo-dev
```

**scope 只需要嗰一個 env resource,唔需要成個 RG。** 內建角色定自訂角色由 infra 揀 —— 我哋唯一硬要求係嗰個 `join/action`(順帶畀埋 `managedEnvironments/read` 會方便診斷,但唔係必需)。

### 🔴→🟢 繞道:**有路**,但我一度判錯(2026-08-05 → 08-06)

**第一輪判斷(錯)**:試咗 `az containerapp registry set`,一樣 `LinkedAuthorizationFailed` ⇒ 我寫低「**任何** `containerApps/write` 都觸發 linked auth 檢查,冇繞道」。

**第二輪實測(推翻上面)**:用 `az rest` 直接打 ARM PATCH,body 只有 `{"properties":{"template":{"scale":{"minReplicas":1}}}}` —— **成功**,`minReplicas` 由 0 變 1 實測確認。

| 路徑 | 結果 | 真正原因 |
|---|---|---|
| ARM template full PUT | 🔴 403 | template **明確送 `environmentId`** |
| `az containerapp registry set` / `update`(CLI) | 🔴 403 | **CLI 做 read-modify-write** —— 佢讀返成個 resource 再送返去,連 `environmentId` 一齊送 |
| **`az rest` PATCH,body 唔含 `environmentId`** | 🟢 **成功** | ARM 冇 linked resource 要驗 |

⇒ **觸發條件係「request body 有冇宣告 `environmentId`」,唔係「有冇 write」。**

🔴 **我錯喺邊**:由「CLI PATCH 403」推去「任何 write 都 403」。呢個係**同一個錯誤模式嘅第四次**(B2 建 database / pull 側 IP / Day 2 `az acr show`)—— 由一個真觀察推去一個更強嘅結論。今次特別要記,因為我當時仲寫咗「今次係實測企住,唔係推理企住」,而嗰個「實測」只覆蓋咗 CLI 一條路。

> **順帶:infra 講「`join/action` is used to create new container app」方向係啱嘅** —— app 已經建好、已經 in the environment,我哋唔需要重新宣告佢屬於邊個 env,所以唔使 join 權。佢哋嘅措辭唔精確(更新既有 app 只要 body 含 `environmentId` 一樣要),但結論成立。

### 🟢 PATCH 路徑仲有一個結構性優勢

ARM full PUT 會 **unset 冇寫嘅 property**(what-if 顯示四個:`exposedPort`/`traffic`/`maxInactiveRevisions`/`runningStatus`)。**PATCH 只改你送嗰啲**,所以:

- **唔送 `environmentId`** ⇒ 唔觸發 join 檢查
- **唔送 `workloadProfileName`** ⇒ 自動保留
- **web 唔送 `customDomains` / `external`** ⇒ infra 配嘅 custom domain + SNI binding **結構上掂唔到**

⇒ 對「唔好整爛 infra 配好嘅嘢」呢個目標,**PATCH 比 ARM template 更安全**。代價係可重現性:要用一個 PATCH body 腳本代替宣告式 template。

## 附:B1 解法 ② —— 若 infra team 代 build,交畀佢哋嘅嘢

> 🟢 **2026-08-05:B1 已解封,本節唔使用。** 完整保留 —— 若日後 build host 冇咗、或者另一個環境撞同一個牆,呢節可以即刻發得出。
> **預先寫定,等 infra 一揀就即刻發得出。** 解法 ① 若通過(SP 攞 Contributor + firewall 放行)呢節唔使用。
> **本節所有事實都實測過**(2026-08-05),唔係憑 Dockerfile 讀出嚟嘅推測 —— 除咗最後嗰個 build 本身,原因見下面「⚠️ 我證到咩、證唔到咩」。

### 先決定:source code 點交

| 做法 | 說明 |
|---|---|
| 🥇 **畀 infra GitHub repo access** | repo 係 **private**(`chris-private-workspace/unified-operation-platform`)。最乾淨 —— 佢哋自己 clone,tag 對得返 commit,將來重 build 唔使再傳一次 |
| **`git archive` 交一個 tarball** | 若唔想開 repo access。**實測(HEAD)**:`git archive --format=tar -o uop-src.tar HEAD` → **1065 個檔 / 8.9 MB**,包含兩個 Dockerfile · `docker-entrypoint.sh` · `nginx.conf.template` · `design_handoff_licenseops/` · `package-lock.json`。<br>✅ **天然唔含 secret**:`git archive` 只包 **tracked** 檔,而 `.env` / `deploy/azure/*.params.*.json` 全部 gitignored ⇒ **實測 archive 入面一個都冇**。只有兩個 `.env.example`(已逐行看過,全部 placeholder;兩個 `SERVICENOW_*_CATALOG_ITEM_SYS_ID` 係真值但**係識別碼唔係 secret**,一直喺 repo) |

### 🔴 三個一定要講清楚嘅點(唔講就會 build 失敗或者 build 錯)

1. **Build context = repo ROOT**,唔係 `apps/api/` / `apps/web/`。兩個 Dockerfile 都靠 root 個 `package-lock.json` 解 workspace。
2. **`apps/web` 個 build 依賴 repo root 嘅 `design_handoff_licenseops/`** —— `apps/web/src/index.css:4` 有 `@import '../../../design_handoff_licenseops/design-system/styles.css'`,而 Dockerfile 有 `COPY design_handoff_licenseops ./design_handoff_licenseops`。**呢個目錄唔喺 `apps/web` 入面**,所以 context 一錯就直接掛。(`.dockerignore` 特登冇排除佢,仲寫咗註釋講點解。)
3. **兩個 image 都唔使傳 build arg。** `apps/web/Dockerfile` 有四個 `VITE_ENTRA_*` ARG,但**留空 = 跌返 break-glass 本地登入**,正正係 DEV 而家要嘅(W44 F3-6:先唔接 vendor;而且 DEV 冇 Entra app registration)。

### 發畀 infra 嘅指引(英文)

```
Build context is the repo ROOT for both images (not apps/api or apps/web).
The web build reads design_handoff_licenseops/ from the repo root, so the
context must include it.

From the repo root:

  TAG=dev-<short-git-sha>        # we'll tell you the exact sha

  docker build -f apps/api/Dockerfile \
      -t acrrci3ailanding1.azurecr.io/uop-api:$TAG .

  docker build -f apps/web/Dockerfile \
      -t acrrci3ailanding1.azurecr.io/uop-web:$TAG .

  docker push acrrci3ailanding1.azurecr.io/uop-api:$TAG
  docker push acrrci3ailanding1.azurecr.io/uop-web:$TAG

No build arguments are needed — the web image's VITE_ENTRA_* args are meant
to be left empty for this environment.

Please confirm the exact tag you pushed, and that the two container apps
(aca-rapo-uop-api-dev / aca-rapo-uop-web-dev) can pull from the registry —
they currently have no registry credentials configured.
```

### 收到之後我哋做咩

1. `deploy/azure/aca.params.dev.json` 更新 `apiImage` / `webImage` 個 tag 做 infra 實際 push 嗰個
2. 重跑 `az deployment group what-if` —— 今次應該淨係多咗兩個 image 改動
3. `az deployment group create` → 驗 revision **Running/Healthy**(⚠️ `az acr build` Succeeded / push 成功 **都唔證明容器起得身**,BUG-008)
4. Smoke:`https://rapo-uop-web-dev.rci-t.com/` → `/api/docs/api` → break-glass login

### ⚠️ 我證到咩、證唔到咩

**證到**(全部有真 tool output):archive 內容齊全兼零 secret · `.dockerignore` 唔排除 design handoff · `index.css` 真係 `@import` 佢 · 85 個 handoff 檔 tracked · 兩個 Dockerfile 寫明 context = root。

🔴 **證唔到:呢兩個 image 實際 build 得成。** 我哋本機 `docker build` **跑唔到**(pull `node:20-slim` 撞 Docker Hub CDN 503),所以**冇任何人喺呢個 repo 狀態下真正 build 過**。infra 第一次 build 撞到嘢係有可能嘅 —— 尤其 `apps/api/Dockerfile` 有一道 `RUN test -f dist/main.js` 硬閘(BUG-008 留低),佢會令「編譯綠但輸出唔喺度」直接 build fail 而唔係出一個壞 image。**呢個係 feature,唔係問題** —— 但要同 infra 講定,否則佢哋見到會以為係我哋 Dockerfile 有 bug。

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

## ✅ 部署前已用 `what-if` 證明唔會刪嘢(2026-08-04)

`az deployment group what-if -g RG-RAPO-UOP-DEV --template-file deploy/azure/aca-dev.json --parameters @deploy/azure/aca.params.dev.json`

| 檢查 | 結果 |
|---|---|
| 有冇 resource 被 **Delete** | **零** |
| 邊啲 resource 被改 | **只有兩個 container app**(`Modify`) |
| 其餘 9 個資源 | **全部 `Ignore`** —— Redis · PG · App Insights · KV · 2 NIC · 2 PE · alert rule,ARM 完全唔會掂 |
| `customDomains`(對外唯一入口) | **唔喺 delta ⇒ 保留** ✅ |
| `workloadProfileName` | **唔喺 delta ⇒ 保留** ✅ |
| web `external` | 唔喺 delta ⇒ 保持 `true` ✅ |
| `registries` / `secrets` | `Create`(what-if 自己 mask 咗值) |
| api ingress | `allowInsecure` false→**true** · `external` true→**false** · `targetPort` 80→**3000**(全部係 ADR-0027 Option A 預期) |

⚠️ **三個 property 會被 ARM unset,判斷為無害**:`exposedPort`(只對 TCP transport 有意義)· `traffic`(`activeRevisionsMode: Single` 下 ACA 自動全部去 latest revision)· `maxInactiveRevisions`(unset 即用預設 100)。**判斷依據唔係「睇落應該冇事」,而係 UAT 個 `aca.json` 同樣三個都冇寫,而 UAT 三次部署都成功。**

> 🔴 **`what-if` 值得寫入 runbook 做標準步驟。** 佢把 R6(「ARM 會唔會刪走 infra 配好嘅嘢」)由**部署後補救**變成**部署前證明**,而且唔需要 image 存在、零副作用。UAT runbook §5 只有 `validate`,而 `validate` **唔會**話你會刪咩。

## ⚠️ 部署時要特別小心

1. **ARM 係宣告式,會刪走冇寫嘅嘢。** infra team 已配好嘅 **web custom domain + SNI cert binding** 若冇寫入 template,一次部署就會消失。⇒ 部署前先 `az resource show` 存底 + 跑 `what-if`,部署後逐項對返(W44 F2-1 / F2-11 / F6-9)。
2. **`az acr build` Succeeded ≠ 容器起得身。** BUG-008 實證:626 test 綠 + build 成功 + lint 零 output + ACR build Succeeded,**四道 gate 全部攔唔到** `dist/main.js` 唔存在。真 pass 標準 = revision **Running/Healthy** + smoke 過。
3. **`az` CLI 印 Unicode `✔` 會 charmap crash(exit 1 假象)** —— 真結果查 management plane(`az acr task list-runs` / `az deployment group show`)。
4. **`az` 一律 sequential** —— 多個並發會互鎖 hang。

## 認證(as-built)

**而家行緊 = break-glass 本地登入**(seeded `admin@uop.local`,`AUTH_JWT_SECRET` + `LOCAL_ADMIN_INITIAL_PASSWORD`)。
沿用 ADR-0012 D2 / ADR-0005 dual-provider:兩個 provider 並存,SSO 接通之後 break-glass **唔會拆**。

> ## 🔴 2026-08-07 更正:SSO 設計已改,下面 B9 三樣缺失嘅**應對方式已經唔同**
>
> **`ADR-0028` Accepted(supersedes ADR-0003)** —— SSO 由 MSAL 前端 flow 改成 **server-side authorization code exchange**。
>
> **下面 B9 嗰三樣缺失,實測記錄全部仍然準確**(佢係點解要改設計嘅證據),但**結論變咗**:
>
> | # | 缺乜 | 舊設計(ADR-0003) | **新設計(ADR-0028)** |
> |---|---|---|---|
> | ① | redirect URI | 必需 | 必需(infra 已補 ✅) |
> | ② | Application ID URI / scope | 🔴 **必需,而三輪都攞唔到** | 🟢 **完全唔需要** —— scope 只用 `openid profile email`,id_token 個 `aud` 本身就係 client id |
> | ③ | token v1 issuer | 必需處理 | 已處理(dual-issuer),照用 |
> | — | client **secret** | 「唔使畀」(PKCE) | 🔴 **必需** —— 而 infra 一開始就畀咗 |
>
> ⇒ **infra 配嗰個 app,啱啱好就係新設計要嘅完整形狀**,零項要對方再做嘢。
>
> 🔴 **下面第 442 行嗰句「唔使畀 client secret —— SPA 行 PKCE」已經作廢。** 而家 client secret 係必需品,而且係 SSO 唯一嘅 secret(`ENTRA_CLIENT_SECRET`,只喺 server 側用)。
>
> 🔴 **另一個作廢咗嘅前提:`VITE_ENTRA_*` build-time**。四個 `ENTRA_*` 而家全部由 **API runtime** 讀 ⇒ 改配置**唔使重 build web image**,亦即下面幾處講「估錯要重 build」嘅風險已經冇咗。
>
> **部署要設嘅 env**:`ENTRA_TENANT_ID` · `ENTRA_CLIENT_ID` · `ENTRA_CLIENT_SECRET`(走 secretRef,唔係明文 env)· `ENTRA_REDIRECT_URI=https://rapo-uop-web-dev.rci-t.com`。範本見 `apps/api/.env.example` 認證段。
> 🟢 **F9-7 已做(2026-08-07 部署 #2,`dev-3971ad3`)** —— container log 原文 `[EntraSsoService] Entra SSO is configured (server-side code exchange).` ⇒ 四個 env 真係到位。詳見下面「部署記錄」。
> 🔴 **F9-8 仍未做** —— 要**喺公司網**驗(build host 喺 Azure 段,解析唔到 `rapo-uop-web-dev.rci-t.com`)⇒ **未有任何一次真人 SSO 登入嘅證據。**
> 🔴 **一個未拆嘅風險**:infra 當初被要求把 redirect URI 加喺 **SPA** platform,而 ADR-0028 要 **Web**。若真係 SPA,exchange 會撞 **`AADSTS9002327`**。試過用假 code 提前拆,但**測試冇區分度**(真/錯 redirect_uri/錯 secret 三個都返 `AADSTS9002313`)⇒ 只可以靠一次真登入。修法好具體:叫 infra 把 redirect URI 搬去 **Web** platform。

### 🔴 B9 —— infra 交嘅 SSO app registration **淨係配咗程式對程式,用戶登入三樣缺晒**

infra 2026-08-06 交出:`APP - unified operations portal - SSO - UAT` · appId **`08fa14bf-03f7-4a1a-9c48-da31da9c47e3`** · tenant **`d1ea071a-…`** · 一個 client secret(exp **2028-07-28**)。

🔍 **先確認咗兩件事**:①個 app 喺**公司 M365 tenant**(`d1ea071a`),同 Graph app 同一個 tenant,但**唔同 app**(Graph 係 `27d329e5`)⇒ 佢真係為 SSO 而建,唔係重發 Graph 嗰組 ②佢 `roles` 係**空**(冇 Graph application permission)⇒ 確認唔係畀 Graph 用。

**三樣缺失,全部有錯誤碼佐證**:

| # | 缺乜 | 實測證據 |
|---|---|---|
| 1 | **一條 redirect URI 都冇** | 瀏覽器打 authorize → **`AADSTS900971: No reply address provided`**(Req Id `e2ff51a9-779f-4b3b-93e2-10da97575300`)。🔴 呢個唔係「登記咗但唔啱」(嗰個係 `AADSTS50011`),係**一條都冇** |
| 2 | **冇 Expose an API / scope** | 帶 `api://08fa14bf-…/access_as_user` → **`AADSTS500011: resource principal not found`**(Req Id `29f91e96-197c-4a6b-8a24-56ebf9a65400`) |
| 3 | **token 係 v1** | client credentials 攞 token → claim **`ver: 1.0`**。而 `apps/api/src/auth/jwt-auth.guard.ts:170-177` 用 `jwt.verify(…, { issuer })` **精確比對** `https://login.microsoftonline.com/{tid}/v2.0`;v1 token 個 issuer 係 `https://sts.windows.net/{tid}/` ⇒ **一定 401** |

🔴 **第 3 樣最危險** —— 登入會**睇落完全成功**,但入到系統全部 401,而錯誤訊息**一個字都唔提版本**。呢個係典型「紅得靜」,同 F7 outbound 嗰種同族。

### 📌 三樣嘅最新狀態(2026-08-06 尾)

| # | 項 | 狀態 |
|---|---|---|
| ① redirect URI | 🟢 **infra 已補** —— 同一條 authorize URL 由 `AADSTS900971` 變成正常 login 頁(**有前後對比,可信**) |
| ② Application ID URI / scope | 🔴 **仍然差** —— `api://<client-id>` 實測唔存在。⚠️ **但 infra 可能設咗另一個名**,我哋窮舉唔到 ⇒ **要問「係咩」,唔係叫佢「設定」** |
| ③ token version v1 | 🟢 **我哋自己解咗**(見下)—— 唔再需要 infra 郁 manifest |

**唔使畀 client secret** —— SPA 行 PKCE。infra 畀嗰個保留但前端唔會用。

### 🟢 第 ③ 樣:改咗 API 同時接受兩個 issuer(Chris 2026-08-06 拍板走「路 B」)

`apps/api/src/auth/jwt-auth.guard.ts` —— `issuer` 由單一字串變成**同一 tenant 嘅兩個形式**:

```ts
this.issuer = [
  `https://login.microsoftonline.com/${tenantId}/v2.0`,  // accessTokenAcceptedVersion: 2
  `https://sts.windows.net/${tenantId}/`,                // 1 / null(legacy)
];
```

**點解呢個係啱嘅取捨,唔係放鬆安全**:
- 兩個值都由**同一個 `tenantId`** 推導 ⇒ **跨 tenant 完全冇放寬**
- `audience` 仍然係**單一精確值** —— 放寬佢先至係真窿(test 有明文 assert 守住)
- token 用邊個 issuer 係 **app registration 嘅屬性**(`accessTokenAcceptedVersion`),唔係我哋 code 嘅屬性。只認 v2 就等於**把一個 infra 側配置變成我哋側嘅硬失敗**,而且係**最貴嗰種失敗**:登入成功、之後每個 request 401、錯誤訊息一個字都唔提版本

⚠️ **型別陷阱**(實撞):`@types/jsonwebtoken` 個 `issuer` 係 `string | [string, ...string[]]`(**非空 tuple**),唔收 `string[]` ⇒ field 要宣告成 tuple,否則 overload 解析失敗,連 callback 參數都會變 implicit `any`。

**Test**:`jwt-auth.guard.spec.ts` 新增 `verifies against BOTH tenant issuer forms (v2.0 and legacy v1)` —— 捕獲傳畀 `jwt.verify` 嘅 options,assert `issuer` 係嗰兩個值 **兼且** `audience` 仍然係單一精確值。**879 test / 68 suite 全過**(之前 878)。

**點解唔開新 ADR**:唔改 vendor / module 邊界 / storage / 任何 locked 決策,亦冇推翻 ADR-0002 —— 佢仍然係「Entra token,RS256 + JWKS + aud/iss/exp」。變嘅只係 `iss` 由認一個變認同一 tenant 嘅兩個。屬 §5.1 明文嘅「唔屬架構改動」。

🔴 **⇒ 而家淨係差第 ② 樣一個答案(確切嘅 Application ID URI),SSO 就可以 build + 上。**

### 🟢 接 SSO 係可回退嘅(查過 code)

- `apps/web/src/lib/api.ts:25` —— `if (getLocalProfile()) return {}` **喺 `msalConfigured` 檢查之前** ⇒ break-glass session **完全唔受影響**
- `apps/web/src/pages/login.tsx:167-174` —— SSO 按鈕之後有 `or with a local account` + **真嘅本地登入表單**;`msalConfigured` 只控制個按鈕 `disabled`

⇒ 最壞情況只係「SSO 按鈕撳落去報錯」,**break-glass 照用**。

### ⚠️ 兩個方法論記錄(唔係湊數,兩個都改變咗結論)

1. **一個假陽性被對照組接住** —— 我最初用 PowerShell 打 authorize endpoint 測 redirect URI,得到「200,冇 AADSTS」,差啲寫成「redirect URI 已登記」。跑對照組(**故意錯**嘅 URI)一樣係 200 冇錯誤 ⇒ **個方法本身無效**。真相係現代 Azure 登入頁係 SPA,**錯誤由瀏覽器 JS 畫出嚟**,命令列只攞到空殼 HTML。⇒ **要喺真瀏覽器開先睇到。**
2. **一個措辭要收返** —— 「冇 Expose an API」實測到嘅只係「叫 `api://<client-id>` 嗰個唔存在」。Application ID URI **可以係任何名**,infra 設咗第二個名嘅話其實已經配好。⇒ 畀 infra 嘅問法改成「**係咩**」而唔係「**請設定**」。

### 🔴 順帶:client secret 有 expiry = **2028-07-28**

到期嗰日相關認證會**靜靜咁全部 401**,而症狀係「突然登入唔到 / 對帳唔 work」,冇人會即刻諗到係憑證過期。**要入 `RISK_REGISTER.md`。**

### 🟢 順帶查到:Graph app 權限齊

`App-N8N-LicenseManagement`(appId `27d329e5-…`)`roles` = **`LicenseAssignment.Read.All` · `User.Read.All` · `LicenseAssignment.ReadWrite.All`** ⇒ **正好係 LicenseOps 要嘅**,F3-7 接真 Graph **冇權限障礙**。

## 部署記錄

> ℹ️ **部署 #3**(2026-08-10,ADR-0030 / CH-022 接真 Graph + ServiceNow)記喺 `W44-azure-dev-deploy/progress.md` Day 7,冇搬過嚟。
> ℹ️ **部署 #7**(2026-08-13,`dev-2a68f8d`,追 CH-029)記喺 `CH-029-ledger-truth-gaps/progress.md` Day 1,冇搬過嚟。

### 2026-08-21 · 部署 #15(`dev-7dc3811`)— **BUG-012 上機;第一次「部署之後嗰一撳」同時收 acceptance 同答根因**

**點解要有呢次部署**:`main` 由 #14 之後行前 6 個 commit,入面 **BUG-012**(agent 開唔到嗰陣畫面唔講)有 DEV carry-over(`G8`)。

**開工四條事實**(全部實測):

| 問題 | 答案 |
|---|---|
| DEV 而家跑咩 | `az containerapp list` ⇒ 兩個 app 都 `dev-4a92be0`(= #14) |
| 有冇 migration | `git diff 4a92be0..HEAD -- '*prisma*'` **完全空** ⇒ **連續第四次零 migration** |
| 有冇新 dep | **完全空** ⇒ vendor chunk 應該唔變 |
| 改咗邊度 | **4 個 web 檔,零 api** ⇒ 見下面「api 側冇獨立證據」 |

#### Marker:兩個都要用**次數**,而兩個都驗過先用

BUG-012 個 fallback 文案係**逐字抄 dock** 嘅(CH-032 `D2` 同一理由),所以「有冇出現」呢個維度**結構上冇答案** —— 沿用 #13 嗰個做法改數次數,兼且**部署之前由 live 攞 baseline**:

| 層 | Marker | 舊版 | 預期 |
|---|---|---|---|
| JS | `That could not be started.` | ×1(只喺 dock) | **×2** |
| JS | `text-[12.5px] text-danger` | ×3 | **×4** |

🟢 **三個數字同 #14 記載逐字一致**(`index-9VsTcD40.js` · `index-BPOsyRyz.css` · js length **286,353**)⇒ 印證量法同 #14 同一套。

#### 七步(同 #6–#14 逐步一致)

| 步 | 結果 |
|---|---|
| 0 `az account show` | `d2f094a3-…` · sub `30dac177…` · tenant `4f63aaa0-…` ⇒ 部署 SP,**一次就對** |
| 1 `docker login`(`--password-stdin`) | `Login Succeeded` exit 0 |
| 2 真 pull(base image 由 Dockerfile `^FROM` **讀返**) | `node:20-slim` · `nginx:1.27-alpine` 兩個 exit 0 |
| 3 `docker build` × 2 | 兩個 exit 0 ⇒ BUG-008 gate 過 |
| 3.5 **push 之前喺 image 內部驗** | **五個 marker 全 PASS**(兩新三 sanity)+ 舊 asset 名喺新 html **0 次** |
| 4 `docker push` × 2 | api `sha256:e514d785…d90f` · web `sha256:2594e2c3…8c3a`,**同本地 manifest 逐字對上**;另用 registry 憑證 `docker manifest inspect` 獨立確認 ACR 真係收到 |
| 5 params tag 換 | 2 處 · `lengthDelta = 0` · 舊 tag 殘留 **0** · 33 個 parameter · `git check-ignore` 命中 + `git status` **空** |
| 6 dry-run | api secrets **11** / env **30** · web 1 / 1 · **四個 sanity 全 `False`** · 舊 tag 零命中 · **leak scan(見下)** |
| 7 `-Send` | 兩個 **`PATCH exit = 0`** |

🟢 **leak scan 今次做深咗一層**:唔靠名 filter(#14 靠名查 11 個),而係**33 個 parameter 逐個問「真值有冇原文出現喺 output」**,再按結果分四類。得出:**唔喺 output 嗰 13 個,正正就係 11 個真 secret + 2 個 PATCH 刻意唔送嘅**(`managedEnvironmentId` / `webCustomDomainCertificateId`)⇒ 同 #14 個結論一致,但**由結果反推**而唔係由名 filter 決定要查邊個。⚠️ 另外 7 個「真值喺 output」嘅係 env var(`agentModel` / `azureOpenAiEndpoint` / `servicenowUser` 等)—— **設計上就要送**,唔係洩漏。

**PATCH 之後對數**:兩個 app 都 `dev-7dc3811`;🟢 api `external: false` · web `external: true` + `customDomains: rapo-uop-web-dev.rci-t.com`(`SniEnabled`)· `workloadProfileName: Consumption` **全部完好**。rollout **第一次打就已經係新 bundle**(0 秒)。

#### 五條驗證證據(冇一條靠 revision status)

| # | 證據 | 結果 |
|---|---|---|
| 1 | live asset 名 vs **image 內部** `docker cp` 抽出嗰個 | `index-DadJbgf7.js` **逐字對上**;`index-BPOsyRyz.css` **同 #14 一樣冇變**(本次零新 Tailwind class ⇒ CSS bundle 應該逐 byte 一樣,而佢真係一樣 —— **一個額外正面證據**) |
| 2 | 負面命中:#14 個 bundle | `/assets/index-9VsTcD40.js` → **404** ⇒ 排除 cache / CDN |
| 3 | BUG-012 marker(次數) | `That could not be started.` **×1 → ×2** · `text-[12.5px] text-danger` **×3 → ×4** |
| 4 | 三個 sanity marker | `No run yet` ×1 · `Live updates stopped` ×2 · `This one is ours` ×1 —— **全部不變** ⇒ 計數方法冇漂 |
| 5 | `api-json` | **90,349 → 90,349 逐 byte 一致**;schemas 111 / paths 73 不變 ⇒ **零後端改動嘅正面印證** |

**未認證探測**:`/api/me` **401** · `/api/auth/sso/status` `{"enabled":true}` · `/login` 200。

#### 🔴 三樣要誠實講

**① api 側今次結構上冇獨立證據。** 佢一個字都冇改 ⇒「`api-json` 一樣」**同時符合新舊 revision**。我有嘅只係 ARM image 欄 = `dev-7dc3811`,加上「同一次 PATCH,web 側 rollout 已證」。📌 **形狀同 #12 嗰個「零 migration 令判準失效」同族,但今次係零改動令『上咗機』冇得驗** —— 一個改動越細,證明佢上咗機就越難。

**② 兩個數字同 #14 記載對唔上,而我冇解釋(刻意唔編)**:

| | #14 記載 | 本次實測 |
|---|---|---|
| `api-json`(部署後) | 90,596 B | **90,349 B** |
| image vs live js length | 差 **452**(286,805 / 286,353) | **完全一樣**(286,515 / 286,515) |

⚠️ 已排除「量度不穩」:`api-json` 連打三次都係 90,349,而 `AgentConversationRunDto.whoFixes` **確實在**(enum 六值齊)⇒ DEV 真係跑緊 #14 嘅 code。**點解對唔上,今日冇答案。** 本次結論唔受影響,因為用咗 #14 自己寫低嗰條規矩:**baseline 同驗證兩邊用同一量法**。📌 **同 §9 嗰句同源:一個「解釋得通」嘅無害解釋,比冇解釋更危險** —— 所以呢度只記現象。

**③ `G8` 由 Chris 人手收**(AI 側唔喺瀏覽器打 break-glass 密碼,H4,沿用 CH-015 先例)。

#### 🟢🟢 本次最值得記:**部署之後嗰一撳,同時收咗 acceptance 同答咗根因**

BUG-012 開單時分咗兩件事:**B**(畫面唔講,已證)同 **A**(400 究竟係邊條,未知)。部署之後 Chris 喺 DEV 撳一次 `Run AI Assist`,**紅框出咗**:

```
This request has no free-text wording for AI-Assist to read
```

⇒ **`G8` 收**(banner 真係出到)**兼且 A = `A3`**。

🔴 **而我原本估 `A1`(零 active profile),估錯咗** —— 理由係部署 #12 收工紀錄寫住 DEV 三個 profile 全部 `active: false`。🟢 **擋住個錯結論嘅,係當時同時寫低咗「呢個係紀錄唔係當日實測,唔可以當答案」**:如果當時當咗事實,下一步就會去開返一個 profile,而**開完之後個 400 照出**。

🔴 **順帶一個唔可以推落去嘅位**:**`A3` 出現,推論唔到 DEV profile 狀態** —— `assertHasText` 喺 `ai-assist.service.ts:150`,`resolveForRun` 喺 `:258` ⇒ 執行停咗喺文字檢查,profile 三條閘**由頭到尾冇跑過**。📌 同「`sync-check` 返 `FOUND` 證明唔到個 user 存在」同族:**一個閘冇報錯,唔等於佢後面嗰啲閘過咗。**

---

### 2026-08-21 · 部署 #14(`dev-4a92be0`)— **CH-034 + CH-035 上機;一個「睇落啱」嘅 marker 喺用之前就被否決**

**點解要有呢次部署**:`main` 由 #13 之後行前 **12 個 commit**,入面兩單有 DEV carry-over —— **CH-034**(request header 收窄)同 **CH-035**(run 失敗要講出嚟)。

**開工三條事實**(全部實測):

| 問題 | 答案 |
|---|---|
| DEV 而家跑咩 | `az containerapp list` ⇒ 兩個 app 都 `dev-9053bcd`(= #13) |
| 有冇 migration | `git diff 9053bcd..main -- '*prisma*'` **完全空** ⇒ **連續第三次零 migration** |
| 有冇新 dep | `git diff … -- '*package*.json'` **完全空** ⇒ vendor chunk 應該唔變 |

#### 🔴🔴 本次最重要:**一個「睇落啱」嘅 marker,喺用之前就被否決**

CH-034 一個新字串都冇(純 class + 版面),而 CH-035 收單文件同 `SESSION_SUMMARY` 都寫住「marker 只可能喺 CSS(`self-start`)」。**開工驗一驗就發現嗰個 marker 係假嘅**:

```
git grep -c -F 'self-start' 9053bcd -- apps/web/src
  → change-password-form.tsx:1 · sidebar.tsx:1 · top-bar.tsx:1 · settings.tsx:2
```

⇒ 舊版**四個檔**已經用緊 `self-start` ⇒ Tailwind **一早生成咗 `.self-start` 呢條 CSS rule** ⇒ 「CSS ×0 → ×1」結構上冇可能成立。

🟢 **搵返兩個真 marker,而佢哋喺舊版都係實測 0 檔**:

| 層 | Marker | 點解成立 |
|---|---|---|
| JS | `max-w-full flex-wrap`(className 相鄰組合) | CH-034 加咗 `max-w-full`,而個 class 字串原樣入 JS bundle |
| CSS | `.max-w-full` | `max-w-full` 喺 `9053bcd` **零檔** ⇒ Tailwind 從來冇生成過嗰條 rule |

📌 **同 #12 嗰條規矩同源**(「一個字串要做 marker,先要驗佢喺舊版真係冇」),但本次嘅**新意思係:被否決嗰個 marker,係我哋自己喺上一單收尾時寫落文件嘅**。⇒ **一份交接文件推薦嘅 marker,同一個外人推薦嘅 marker,一樣要驗。**

⚠️ **順帶第二個假 marker,同樣驗咗先知**:`whoFixes` 呢個字**舊版 `api-json` 已經出現 2 次**(來自 `AgentStepDto`)⇒ 「api-json 有冇 `whoFixes`」答唔到問題。改用 **schema-level**:`components.schemas.AgentConversationRunDto` 有冇 `whoFixes` 呢個 property。

⚠️ **第三個唔可以用嘅**:`WHO_FIXES` 五句由 `assign-result-dialog.tsx` 搬去 `lib/who-fixes.ts` ⇒ **bundle 入面總數一個字冇變**(實測 image 內部同 live 都係 ×1)。

#### Baseline(部署**之前**由 live 攞,#13 個做法)

🟢 **三個數字同 #13 記載逐字一致** ⇒ 印證咗「我個測量方法同 #13 係同一套」,唔係另起爐灶:

| | baseline(#13 記載) | baseline(本次實測) |
|---|---|---|
| asset | `index-CQjd-n6b.js` / `index-Bdx9QGmI.css` | **逐字一樣** |
| js length | 285,165 | **285,165** |
| `api-json` | 90,341 B | **90,341 B** |

#### 五條驗證證據(冇一條靠 revision status)

| # | 證據 | 結果 |
|---|---|---|
| 1 | live asset 名 vs **image 內部** `docker cp` 抽出嗰個 | `index-9VsTcD40.js` / `index-BPOsyRyz.css` **逐字對上** |
| 2 | 負面命中:#13 個 bundle | `/assets/index-CQjd-n6b.js` → **404** ⇒ 排除 cache / CDN |
| 3 | CH-035 主句 | **×0 → ×2**(assistant + dock) |
| 4 | CH-034 兩個 marker | JS `max-w-full flex-wrap` **×0 → ×1** · CSS `.max-w-full` **×0 → ×1** |
| 5 | `AgentConversationRunDto` schema | props 由 `id, status, startedAt` → **`id, status, startedAt, whoFixes`**,enum 六個值逐個對上;`api-json` **90,341 → 90,596 B** |

🟢 **三個 sanity marker 全部不變**(`Live updates stopped` ×2 · `.lg\:grid-cols-2` ×1 · `This one is ours` ×1)⇒ 證明個計數方法冇漂,唔係「乜都變咗」。

**未認證探測**:`/api/me` **401** · `/api/auth/sso/status` `{"enabled":true}` · `/login` 200。

⚠️ **一個要記住嘅量度 artifact**:image 內部 `Get-Content -Raw` 量到 js length **286,805**,而 live `Invoke-WebRequest.Content` 量到 **286,353**(差 452)。**唔影響結論** —— asset 名係 Vite 嘅 content hash,**名一樣就代表 byte 一樣**,兩個數字嘅差係兩種讀法嘅 artifact 唔係內容差異。📌 但值得寫低:**「同一個數字」呢種證據,要兩邊用同一個量法先有意義。**

#### 七步(同 #6 / #7 / #8 / #10 / #11 / #12 / #13 逐步一致)

| 步 | 結果 |
|---|---|
| 0 `az account show` | `d2f094a3-…` · sub `30dac177…` · tenant `4f63aaa0-…` ⇒ 部署 SP,**一次就對** |
| 1 `docker login`(`--password-stdin`) | `Login Succeeded` exit 0 |
| 2 真 pull(base image 由 Dockerfile `^FROM` **讀返**) | `node:20-slim` · `nginx:1.27-alpine` 兩個 exit 0 |
| 3 `docker build` × 2 | 兩個 exit 0 ⇒ BUG-008 gate 過 |
| 3.5 **push 之前喺 image 內部驗** | **六個 marker 全 PASS**(三新三 sanity)⇒ build 錯咗喺部署之前就知 |
| 4 `docker push` × 2 | api `sha256:0cdd256a…dde80` · web `sha256:4dabf3ce…222b`,**同本地 manifest 逐字對上** |
| 5 params tag 換 | 2 處 · `lengthDelta = 0` · 舊 tag 殘留 **0** · 33 個 parameter · `git check-ignore` 命中 + `git status` **空** |
| 6 dry-run | api secrets **11** / env **30** · web 1 / 1 · **四個 sanity 全 `False`** · 舊 tag 零命中 · **leak scan 11 個 secret,0 命中** |
| 7 `-Send` | 兩個 **`PATCH exit = 0`** |

**PATCH 之後對數**:兩個 app 都 `dev-4a92be0`;🟢 api `external: false` · web `external: true` + `customDomains: rapo-uop-web-dev.rci-t.com`(`SniEnabled`)· `workloadProfileName: Consumption` **全部完好**。

🟢 **rollout 快過預期**:驗證 script 寫咗 poll 最多 6 分鐘,實際 **第一次打就已經係新 bundle**(0 秒)。

#### ⚠️ 兩樣本次冇做,要講明

1. **live 行為驗證(睇實物)交返 Chris 人手** —— CH-034 個收窄 gate 同 CH-035 個失敗提示都要登入先睇到,而 AI 側刻意唔喺瀏覽器打 break-glass 密碼(H4)。⇒ **本次收嘅係「code 上咗機」,唔係「畫面睇落啱」**(沿用 `CH-015` 先例)。
   📌 而 **CH-035 個提示喺 DEV 平時唔會出** —— 佢要一條真失敗嘅 run,而 DEV 側 Azure OpenAI 通(#11 實測)⇒ 同 CH-032 個 disconnected banner 一樣,**上到機唔等於見到**。
2. **`RISK R35` 最後一條(api 返唔到嚟)照樣未驗** —— 同 #13 一樣,要 scale-to-0,Chris 決定唔做。

---

### 2026-08-20 · 部署 #13(`dev-9053bcd`)— **CH-032 + CH-033 上機;marker 由「有冇」變「幾多次」**

**點解要有呢次部署**:`main` 由 #12 之後行前咗 **25 個 commit**,入面有兩單有 DEV carry-over 嘅改動 —— **CH-032**(`/assistant` honesty)同 **CH-033**(request detail 版面),另加 `SSE-HEARTBEAT-COUPLING` 個 test(`STALE_AFTER_MS` 由 `const` 變 `export const`)。

**開工三條事實**(全部實測,唔靠記憶):

| 問題 | 答案 |
|---|---|
| DEV 而家跑咩 | `dev-04f3c86` 兩個 app 都係(= #12)⇒ 落後兩單 |
| 有冇 migration | `git diff 04f3c86..9053bcd -- apps/api/prisma/ prisma/` **完全空** ⇒ **連續第二次零 migration** |
| 後端有冇改 | `git diff … -- apps/api/src/` **完全空** ⇒ 純前端 |

#### 🔴🔴 本次最重要:**#12 個教訓喺呢度變成結構性問題,而解法係換一個維度**

#12 學到「**一個字串要做 marker,先要驗佢喺舊版真係冇**」。今次一驗就發現 **CH-032 三句文案喺 `04f3c86` 全部已經存在**:

```
git grep -F 'Could not load the agent list. Try again in a moment.' 04f3c86 -- apps/web/src
  → 04f3c86:apps/web/src/components/shell/agent-dock.tsx      (三句都係)
```

⚠️ **而且唔係意外,係設計** —— CH-032 個 `D2` 就係「**逐字抄 dock**」,所以嗰三句**必然**喺舊版存在。⇒ **「有冇出現」呢個維度,對本單結構上冇可能有答案。**

🟢 **解法:唔問「有冇」,問「幾多次」。** dock 用一次,`/assistant` 用一次 ⇒ 舊版 ×1、新版 ×2。部署**之前**先由 live bundle 攞 baseline,咁個對照就唔係推論:

| marker | live(部署前 `dev-04f3c86`) | image 內部(新 build) | live(部署後) |
|---|---|---|---|
| `Live updates stopped. Replies may not appear on their own.` | **×1** | ×2 | **×2** ✅ |
| `No agent is switched on. An admin can turn one on under Agent.` | **×1** | ×2 | **×2** ✅ |
| `Could not load the agent list. Try again in a moment.` | **×1** | ×2 | **×2** ✅ |
| `Reconnect` | **×1** | ×2 | **×2** ✅ |
| CSS `.lg\:grid-cols-2` | **×0** | ×1 | **×1** ✅ |
| CSS `.lg\:grid-cols-3` | ×1 | ×1 | ×1 |

🔴 **CH-033 一個新字串都冇**(佢淨係改 class 同版面)⇒ 佢個 marker **只可能喺 CSS**。`lg:grid-cols-2` 喺 `04f3c86` **零檔**、`9053bcd` 有 ⇒ Tailwind 生成 `.lg\:grid-cols-2` rule,而**舊 CSS bundle 真係冇**(實測 ×0)。📌 **一單「純版面」改動,唯一嘅 bundle 證據喺 CSS 唔喺 JS。**

#### 五條驗證證據(冇一條靠 revision status)

| # | 證據 | 結果 |
|---|---|---|
| 1 | live asset 名 vs **image 內部** `docker cp` 抽出嗰個 | `index-CQjd-n6b.js` / `index-Bdx9QGmI.css` **逐字對上**,連 `js length 285165` 都一樣 |
| 2 | 負面命中:#12 個 bundle | `/assets/index-aKcTA3up.js` → **404** ⇒ 排除 cache / CDN |
| 3 | CH-032 四個 marker | 全部由 **×1 → ×2** |
| 4 | CH-033 CSS marker | `.lg\:grid-cols-2` 由 **×0 → ×1** |
| 5 | `/api/docs/api-json` | **90,341 B —— 同 #12 逐 byte 一致** ⇒ 正面印證「零後端改動」 |

🟢 **順帶一條免費對數**:`query-vendor-B-CFovtL.js` 同 `react-vendor-DANtqp6M.js` 兩個 hash **同 #12 完全一樣** ⇒ vendor chunk 一個字冇變,同「零新 dependency」對得上。

**未認證探測**:`/api/me` **401 `Missing credentials`**(guard 正常)· `/api/auth/sso/status` `{"enabled":true}` · `/login` 200。

#### 七步(同 #6 / #7 / #8 / #10 / #11 / #12 逐步一致)

| 步 | 結果 |
|---|---|
| 0 `az account show` | `d2f094a3-…` · sub `30dac177…` · tenant `4f63aaa0-…` ⇒ 部署 SP,**一次就對**(唔似 #12 要先 re-login) |
| 1 `docker login`(`--password-stdin`) | `Login Succeeded` |
| 2 真 pull(base image 由 Dockerfile `^FROM` **讀返**:`node:20-slim` / `nginx:1.27-alpine`) | 兩個 `exit 0` |
| 3 `docker build` × 2 | 兩個 `exit 0` ⇒ BUG-008 gate 過 |
| 3.5 **push 之前喺 image 內部驗**(#12 個做法,再用一次) | `docker create` + `docker cp` 抽 assets ⇒ 四個 marker 喺 push 之前已經確認 |
| 4 `docker push` × 2 | api `sha256:8b8fd89d…2d95` · web `sha256:166679a2…e244`,**同本地 manifest 逐字對上** |
| 5 params tag 換 | 2 處 · `lengthDelta = 0` · 舊 tag 殘留 **0** · 33 個 parameter · `git check-ignore` 命中 + `git status` **空** |
| 6 dry-run | api secrets **11** / env **30** · web 1 / 1 · **四個 sanity 全 `False`** · 舊 tag 零命中 · **leak scan:逐個 secret 對 output 做 `Contains`,0 命中** |
| 7 `-Send` | 兩個 **`PATCH exit = 0`** · api `--0000016` · web `--0000012` |

**PATCH 之後對數**:兩個 app 都 `dev-9053bcd`;🟢 api `external: false` · web `external: true` + `customDomains: rapo-uop-web-dev.rci-t.com`(`SniEnabled`)· `workloadProfileName: Consumption` **全部完好** ⇒ infra 配嘅嘢結構上冇被掂。

🟢 **`-Send` 之前個 masking 檢查今次做深咗一層**:唔止睇 output 有冇 `<len N>`,而係**由 params 檔逐個讀返真值,再問 output 有冇 `Contains` 佢** ⇒ `leaks found = 0`。**「睇落 masked」同「真值唔喺入面」係兩件事**,而後者先係 H4 要嘅。

#### ⚠️ 兩樣本次冇做,要講明

1. **live 行為驗證(睇實物)交返 Chris 人手做** —— CH-033 三欄同 CH-032 兩句都要登入先睇到,而 AI 側刻意唔喺瀏覽器打 break-glass 密碼(H4)。⇒ **本次收嘅係「code 上咗機」,唔係「畫面睇落啱」。** 兩者證據來源唔同,沿用 `CH-015` 先例分開寫。
   📌 有一個樣**本機結構上驗唔到**:Chris 原本睇嗰張 `REQ0044105` **冇 agent run**,而本機三張單全部有 ⇒「`No run yet` 佔一整欄」要 DEV 先睇到。
2. **`RISK R35` 最後一條未驗嘅路(api 返唔到嚟)照樣未驗** —— Chris 決定唔做 scale-to-0(要一條開住嘅 SSE 連線 = 要 session,兼且會令 DEV api 停幾分鐘)。⇒ **`R35` 個已知缺口原樣保留**,下次有 session 嗰陣順手做。

---

### 2026-08-20 · 部署 #12(`dev-04f3c86`)— **W49 agent dock 上機;第一次「零 migration」部署**

**點解要有呢次部署**:2026-08-19 merge 咗 **W49 `agent-dock`(PR #127)**,16 個 commit。W49 最後一條 acceptance `F5-4`(DEV live)結構上要部署先做得到。

⚠️ **開工先問「DEV 上面係邊個版本」**:`az containerapp list` 實測兩個 app 都係 `dev-b4915e9`(部署 #11)⇒ 落後成個 W49。

#### 🔴 本次同 #6–#11 最大分別:**W49 零 migration ⇒ 驗證方法要換**

`git diff --stat b4915e9..04f3c86 -- apps/api/prisma/ prisma/` **完全空**(0 行)。

⇒ 過去六次部署慣用嗰個「**新表 / 新欄讀得到**」判準(#10 `GET /agent/profiles` 200 · #11 `GET /agent/conversations` 200 唔係 500)**結構上用唔到**,因為冇新表。**照抄 #11 個驗證段就係「驗咗等於冇驗」。**

**改用兩條,而佢哋比字串命中更硬**:

| 證據 | 結果 |
|---|---|
| **live asset 名 vs image 內部抽出嗰個** | 兩個都係 `index-aKcTA3up.js` —— **逐字對上** ⇒ DEV 跑緊嘅**就係我 build 嗰個 image**,唔係「有個新 bundle」呢種推論 |
| **負面命中**:部署 #11 個 bundle | `/assets/index-Bo38NJHT.js` → **404** ⇒ 排除舊 cache / CDN |
| (輔證)W49 獨有字串 | `aria-label":"Assistant`(dock launcher)· `Open in Assistant` · `Ask in the full Assistant` **三個全中**;W48 baseline(`Agent for new conversations` / `No request context`)仍在;`No seats enabled` **False** |

🔴 **四個 marker 入面有一個唔係 marker,而係查 git 先知** —— 交接寫住「`Ask about a licence request…` ← dock placeholder,**W49 新加**,`/assistant` 個版本唔係呢句」。實查 `git grep -F 'Ask about a licence request' b4915e9 -- apps/web/src` ⇒ **`assistant.tsx` 一早有**。⇒ 佢喺 W48 bundle 一樣命中,**證明唔到 W49 上咗機**。另外三個 `b4915e9` **0 檔 / `04f3c86` 1 檔** ⇒ 先係真 marker。
📌 **同 W49 `progress.md` Day 4(續)嗰個「grep 命中 ≠ 嗰件嘢喺度」同族,但唔同機制** —— 嗰次係 **substring 命中**,今次係「**以為新加,其實舊有**」。⇒ **一個字串要做 marker,先要驗佢喺舊版真係冇**;而做呢件事嘅成本係一條 `git grep`。
| (輔證)`/api/docs/api-json` | **90,341 B — 同 #11 逐 byte 一致** ⇒ 正好印證「W49 零後端改動」 |

🔴 **一個做法值得抄**:字串檢查**喺 push 之前先喺 image 內部做咗一次**(`docker create` + `docker cp` 抽 `/usr/share/nginx/html/assets` 出嚟再用 Grep 工具搜)。⇒ **build 錯咗喺部署之前就知**,唔使部署完先發現。

#### ⚠️ 前置撞咗一次身份問題(§9 講嗰個,實際發生)

第一次 `az account show` 返 **`2ae44f00-…`**(唔係部署 SP `d2f094a3-…`),`az containerapp list` 直接 `AuthorizationFailed`。Chris `az login` 之後再驗先對。**錯身份個 error 完全唔提權限來源**,呢個就係「az 操作之前一律先驗身份」呢條規矩存在嘅原因。

🟢 **順帶**:`aca.params.dev.json` **gitignored 唔跨 worktree**,開工前 `Test-Path` 驗過(在,33 個 parameter)。

#### 七步(同 #6 / #7 / #8 / #10 / #11 逐步一致)

| 步 | 結果 |
|---|---|
| 0 `az account show` | `d2f094a3-…` · sub `30dac177…` · tenant `4f63aaa0-…` —— 三個都同腳本 hardcode 逐字對 |
| 1 `docker login`(`--password-stdin`) | `Login Succeeded` |
| 2 真 pull(base image 由 Dockerfile `^FROM` **讀返**) | 兩個 `exit 0` |
| 3 `docker build` × 2 | 兩個 `exit 0` ⇒ BUG-008 gate 過 |
| 4 `docker push` × 2 | api `sha256:a1d336a9…9220` · web `sha256:e21b983a…3216`,**同本地 manifest list 逐字對上** |
| 5 params tag 換 | 2 處 · `lengthDelta = 0` · 33 個 parameter · 舊 tag 殘留 0 · `git check-ignore` + `git status` 兩重驗 |
| 6 dry-run | secrets 11 / env 30 · **四個 sanity 全 `False`** · **12 個 secret 全部 masked** · 舊 tag 零命中 |
| 7 `-Send` | 兩個 `PATCH exit = 0` · api `--0000015` · web `--0000011` |

**PATCH 之後對數**:兩個 app 都 `dev-04f3c86`;🟢 api `external: false` · web `external: true` + `customDomains: rapo-uop-web-dev.rci-t.com` **完好** ⇒ infra 配嘅嘢結構上冇被掂。

#### 🟢🟢 `F5-4`(W49 最後一條)—— **要人做一次,唔係部署完自動收**

⚠️ **開工前一個坑**:DEV 三個 `AgentProfile` 上次收工全部停咗,而 **`GET /agent/profiles` 預設只返 active** ⇒ 打去見到 `[]` **唔代表冇 profile**。`?includeInactive=true` 見到三個,開返一個(用完停返)。

| # | 驗咩 | 實測 |
|---|---|---|
| 1 | launcher 開得到兼**唔推窄內容**(`OQ-D`) | **前後對照**:`mainWidth` 1224 → **1224** · `mainRight` 1472 → **1472** · `docScrollWidth` 1472 → **1472**。`fullScreenOverlays: 0`(**真量度有冇嘢覆蓋全屏**,唔係揾 class 名)· `aria-modal: null` · `boxShadow: none` |
| 2 | drawer 由 top bar **下面**開始 | `dockTop = 56`,而**同一次量到 `topbarHeight = 56`** ⇒ 兩個數互相對得上,唔係抄常數。top bar **四個控制全部 `blocked: false`** ⇒ `F2-5` 修正兌現 |
| 3 | context passing 兩邊 | `/requests/:id` dock 顯示 **`REQ0044097`**,而**同頁面自己個 number 逐字一致**;列表頁重開 ⇒ **冇 REQ**,文案由「about **this request**」變「about **licences**」 |
| 4 | dock 內真傾到,答案**自己出** | 送完之後**冇 reload / 冇 navigate / 冇撳任何掣** ⇒ `Thinking…` 自己消失兼答案自己出現 |
| (順帶)| `G2` non-modal | dock 開住撳 Requests 第一行 ⇒ URL 真變 `/requests/cmswq1v10…` |
| (順帶)| `G3` 唔可以繞過 approval | dock 內**只有 `Close` / `Send`** 兩個掣 |

🔴 **`G4` 唔靠答案文字判斷** —— agent 個回覆講「The request **list**」,似講緊 `list_pending_requests`。真證據係**落 DB 對數**:`conversation.requestId` 逐字 = `cmswq1v100021pg01jwtfkfdp`,run step detail 寫住 `Run started from conversation cmt0unsws… on request cmswq1v10…`。`proposals: 0` ⇒ **零副作用,冇掂 Graph**。

🟢 **順帶 live 證到 `F3-8` owner-only**:用 Chris 個 session 打 `GET /agent/conversations` **見唔到**部署 #11 用 break-glass admin 開嗰條。

#### 🎯 順手答咗一條之前未知嘅嘢:**DEV 嘅 SSE 斷線係邊種**

instrument 一條自己嘅 `EventSource`,再 `az containerapp revision restart`:

```
ms     61  open       rs=1
ms     73  message
ms  25074  message              <- ping,25s heartbeat
ms  50075  message              <- ping
ms  50990  error      rs=0      <- api 死咗,DEV 真係 close 咗個 stream
ms  54206  open       rs=1      <- 3.2 秒後自動重連成功
ms  54229  message
```

⇒ **DEV(nginx + ACA)= close + fire `error` + 自動重連**,而**本機(vite dev proxy)係「零 event · `readyState` 一直 OPEN」** —— 兩個環境真係唔同行為,所以 W49 `F4-3` 決定「兩種都蓋到」係啱嘅。
🟢 dock **冇出 banner,而佢唔應該出**(1 次 error 就重連成功,`MAX_CONSECUTIVE_FAILURES = 3` 數唔到)。
🟢 `ping` 實測**真係 25 秒** = `AGENT_SSE_HEARTBEAT_MS` default ⇒ `F4-3` 個 60s staleness timer **由 heartbeat 推導**呢件事成立,唔會誤報。
⚠️ **未驗嗰半仍在,只係細咗**:本次係一次**乾淨嘅 restart(~3 秒)**;「api 長時間唔返嚟」之下會唔會累積到 3 次 failure 出 banner,**結構上撞唔到** ⇒ 冇驗。

#### ⚠️ 一樣驗唔到,要講明

**`/requests/new` 喺 DEV 去唔到** —— 條 route 存在(`router.tsx:46`)但畀 feature flag redirect 返 `/requests`(`requests.new-request-flag.test.tsx`)⇒ 「create form 唔送 context」呢條路 **live 驗唔到**,只有 `route-context.test.ts:30` 蓋住。改驗**同一個 `null` 分支嘅另一半**(列表頁)⇒ **分支邏輯有 live 證據,但嗰條特定 pathname 冇**。

**收工**:profile 停返 `active: false`(三個全部 inactive,同開工前一樣)· 對話保留做證據 · api restart 之後 `GET /api/me` 返 401(guard 正常)。

---

### 2026-08-19 · 部署 #11(`dev-b4915e9`)— **W48 agent conversation 上機 ⇒ SSE 第一次真捱過 proxy**

**點解要有呢次部署**:2026-08-18 merge 咗 **W48 `agent-conversation`(PR #124/#125)**,一個新 migration(`20260818055347_w48_agent_conversation`,**純 additive:`CREATE TABLE` ×2 · `ADD COLUMN` ×1 · `CREATE INDEX` ×4 · FK ×5,零 DROP**)、七條新 route、一個新前端畫面 `/assistant`。W48 三條 acceptance(`F2-6` / `F7-3` / `F7-4`)**結構上要部署先驗得到**。

⚠️ **開工先問「DEV 上面係邊個版本」**(部署 #6 立嘅規矩):`az containerapp list` 實測兩個 app 都係 `dev-df03563`(部署 #10)⇒ 落後成個 W48。

#### 部署本身(七步同 #6 / #7 / #8 / #10 逐步一致)

| 步 | 結果 |
|---|---|
| 0 `az account show` | `d2f094a3-…`(部署 SP)· sub `rcitest` · tenant `4f63aaa0-…` —— 同腳本 hardcode 嗰個逐字對上 |
| 1 `docker login`(params 嗰組,`--password-stdin`) | **`Login Succeeded`** |
| 2 🔴 **真 pull** `node:20-slim` + `nginx:1.27-alpine`(由 Dockerfile `^FROM` 讀返,唔靠 doc 抄) | 兩個 `exit 0`,都 `Image is up to date` |
| 3 `docker build` × 2(context = repo root) | 兩個 **`exit 0`** ⇒ BUG-008 個 `RUN test -f dist/main.js` gate 過 |
| 4 `docker push` × 2 | api `sha256:67d1dba0…7c1c` · web `sha256:8076bc73…ca2c` —— **同本地 manifest list digest 逐字對上** |
| 5 params tag `dev-df03563` → `dev-b4915e9`(**字串替換,唔 JSON round-trip**) | 2 處 · **`lengthDelta = 0`** · re-parse 仍然 **33** 個 parameter · 舊 tag 殘留 **0** · `git check-ignore` 再驗一次 |
| 6 dry-run | api secrets **11** / env **30** · web 1 / 1 · **四個 sanity 全 `False`** · 11 個 secret 全部 masked 成 `<len N>` |
| 7 `-Send` | 兩個 **`PATCH exit = 0`** |

**PATCH 之後對數**:兩個 app 都 `dev-b4915e9`,api revision `--0000014` · web `--0000010`。

#### 驗證 —— 唔睇 revision status(`F7-4`)

**Step 0**(四個 endpoint 真打):`/` **200** 561 B · `/api/docs/api-json` **200 · 90,341 B**(部署 #10 嗰次 84,518 B)· `/api/me` **401**(唔係 502/504)· `/api/agent/conversations` **401 唔係 404** ⇒ route 已註冊。

**OpenAPI 對數**:73 條 path,W48 七條全在 —— `/agent/conversations` · `/{id}` · `/{id}/turns` · `/{id}/events` · `/{id}/archive` · `/{id}/unarchive` · `/agent/profiles/options`。

🟢🟢 **`F2-6` migration 真 apply** —— break-glass 登入後 `GET /api/agent/conversations` → **200 `[]`**。🔴 **`200 唔係 500` 先係佐證**(表唔存在 Prisma 會掟 `PrismaClientValidationError` ⇒ 500);`[]` 只係未有 row。同部署 #10 `w47_agent_profile` 嗰條**同一個判準**。

#### 🟢🟢 `F7-3` — 真對話 + **SSE 真通**

⚠️ **驗嘅唔係 token stream** —— `F4` 08-18 收窄咗做 turn-level notify(plan §8 deviation)。

🔴 **SSE 用直讀 wire 驗,唔用瀏覽器,而呢個係刻意揀嘅**:DEV 側真正未知數係「**SSE 捱唔捱得過 ACA ingress + nginx**」(同 `F6-14` 400 body 嗰條同族),而 buffering 呢種失敗**喺瀏覽器睇落同「agent 未答完」一模一樣**。前端 refetch 嗰半本機 `F5-11` 已經驗過。順帶好處:密碼唔使入瀏覽器。

**連線喺送 turn 之前開好** ⇒ 收到嘅一定係 server push:

| 時間 | 事件 |
|---|---|
| 10:26:42.183 | `POST /turns` → **201** `{turn, runId}` |
| **10:26:42.262** | `data: {"conversationId":"…","type":"changed"}` ← **79 ms**(user turn) |
| **10:26:44.134** | `changed` ← 1.9 s(assistant turn) |
| 10:27:06 / :31 / :56 | `type:"ping"` ×3,每 **25 秒** |

`content-type: text/event-stream`,event **逐個即時到**(唔係最後一次過吐出嚟)⇒ **proxy 冇 buffer 住個 stream**。⚠️ 順帶記低:回應**冇** `x-accel-buffering` header ⇒ 唔 buffer **唔係靠嗰個 header 擋**,而係 nginx 配置本身唔 buffer;將來有人改 nginx.conf 就冇咗呢道保險而**冇任何嘢會紅**。

對話最後 **4 個 turn**(兩問兩答),兩個 run 都 `completed` ⇒ Azure OpenAI env(部署 #9b 配)冇被 PATCH 洗走。

#### 🔴 一件唔部署就唔會知嘅事:DEV **零 profile**,W48 開唔到對話

`GET /api/agent/profiles` 返 **`[]`**(連 inactive 都冇)⇒ 而 W47 刻意**冇 default profile**,`/assistant` 每條新對話都會 400。**profile 係 DB 資料唔係 code,唔會跟部署走**(同 `CH-026 G-7` curate 同族,部署 #10 `G8` 亦撞過同一件事)。

⇒ 本次建咗 `w48-deploy-check`(model = `gpt-5.6-luna`,即 `AGENT_MODEL`),驗完 `active=false`(W47 冇 DELETE)。

#### 🔴 `AgentRun.conversationId` 寫得入 DB,但**冇經 API 出去**

`GET /agent/runs` 同 `GET /agent/runs/:id` **兩邊都冇 `conversationId` 鍵**。

🟢 **但唔可以由此推論「DB 冇寫」** —— `agent-conversation.service.ts:97-99` 靠 `agentRun.findUnique({ select: { conversationId: true } })` 攞值,`if (!run?.conversationId) return;`;而 **assistant turn 真係寫咗兩條** ⇒ **`AgentRun.conversationId` 一定有值**,否則嗰兩條 turn 結構上唔會存在。**呢個係一個唔使查 DB 就成立嘅證明。**

⇒ 缺嘅只係 **read model**:W48 加咗個欄,而 W47 個全域 run 列表 select **喺自己嗰條 branch 上面唔知有呢個欄**。**同 `CH-031` × `W47` 嗰個 auto-merge 縫隙同族** —— 兩邊各自完全正確。**後果**:admin 喺全域 run 列表見到對話開嘅 run(`requestId` = null),但**冇任何嘢講佢由對話嚟**。已登 `BACKLOG`,**本次刻意唔喺部署入面修**(郁 API contract)。

#### 順手 live 驗埋 `archive`(唔喺原 acceptance)

`POST /agent/conversations/:id/archive` → **200** `archivedAt` 有值 · list **0 items** · **`GET :id` 仍然 200 兼 4 個 turn 齊** ⇒ soft archive **兩半都驗**(同 CH-031 `G1`/`G2` 一樣嘅雙邊驗法)。

**收工狀態**:profile `active=false` · 對話 archived · **2 個 run 刻意保留**(佢哋係 W48 喺 DEV 第一次真跑嘅證據)。

---

### 2026-08-17 · 部署 #10(`dev-df03563`)— **W47 agent registry + CH-031 soft-hide 一次過上機**

**點解要有呢次部署**:同日 merge 咗 **W47 `agent-registry`(PR #119/#120)** 同 **CH-031 / ADR-0040(PR #117/#118)**,兩單合共 **31 個 commit、2 個新 migration**;而兩邊都各有 acceptance **結構上要部署先收得到**(W47 `G1` · CH-031 `G1`/`G2`)。

⚠️ **開工先問「DEV 上面係邊個版本」**(部署 #6 立嘅規矩):`az rest` 實測兩個 app 都係 `dev-45ad525`(部署 #9/#9b)⇒ 落後 31 個 commit,`git rev-list --count 45ad525..df03563` 對數。

#### 🟢 一個 handoff 前提實測成立,一個要更正

| 前提 | 實測 |
|---|---|
| 「要 Chris 自己 `az login`」 | 🟢 **唔使** —— `az account show` 返 `d2f094a3-…` / sub `30dac177…`,session 仲喺度,同腳本 hardcode 嗰個逐字對上 |
| 「做完部署 W47 就全收」 | 🔴 **唔啱** —— `G8` 逐字要求「**兩個 profile 分得開**」(同一段 text · 同一個 model · 唯一變數係 prompt),而 DEV `/agent/profiles` 實測 **`[]`**,一個 profile 都未有 ⇒ **`G8` 唔係部署收得到嘅嘢**,要真開兩個 profile 各跑一次。`G1` 收得到 |

#### 部署本身(七步同 #6 / #7 / #8 逐步一致)

| 步 | 結果 |
|---|---|
| 0 `az account show` | `d2f094a3-…`(部署 SP)· sub `rcitest` |
| 1 `docker login`(params 嗰組,`--password-stdin`) | **`Login Succeeded`** |
| 2 🔴 **真 pull** `node:20-slim` + `nginx:1.27-alpine`(由 Dockerfile 讀返,唔靠 doc 抄) | 兩個 `exit 0` |
| 3 `docker build` × 2 | 兩個 **`exit 0`** ⇒ BUG-008 個 `RUN test -f dist/main.js` gate 過 |
| 4 `docker push` × 2 | api `sha256:3d563966…` · web `sha256:be7d5b3c…` —— **同本地 manifest list digest 逐字對上** |
| 5 params tag `dev-45ad525` → `dev-df03563`(**字串替換,唔 JSON round-trip**) | 2 處 · **`lengthDelta = 0`** · re-parse 仍然 **33** 個 parameter · 舊 tag 殘留 **0** |
| 6 dry-run | api secrets **11** / env **30** · web 1 / 1 · **四個 sanity 全 `False`**;body 兩個 image 都係新 tag、舊 tag 殘留 0、**12 個 secret 全部 masked 成 `<len N>`** |
| 7 `-Send` | 兩個 **`PATCH exit = 0`** |

**PATCH 之後 `az rest` 對數**:兩個 app 都 `dev-df03563`;🟢 **web `customDomains` 仍然係 `rapo-uop-web-dev.rci-t.com`、`external: True`;api `external: False`** ⇒ infra 配嘅嘢結構上冇被掂(dry-run 四個 `False` 已預先證咗)。api revision **`--0000013` `RunningAtMaxScale`**,15 秒就起到。

#### 驗證 —— 唔睇 revision status,睇「只有新 build 先出到」嘅嘢

**Step 0**(四個 endpoint 真打):`/` **200** 561 B · `/api/auth/sso/status` **200** · `/api/me` **401**(唔係 502/504)· `/api/docs/api-json` **200 · 84,518 B**(部署 #8 嗰次 66,893 B)。

**agent route 由 8 條變 13 條**(同一日部署前我自己 down 過一份 OpenAPI 做對照):新增 `/agent/runs/latest` · `/agent/profiles` · `/agent/profiles/{id}`(W47)· `/agent/runs/{id}/hide` · `/unhide`(CH-031)。

🟢🟢 **兩個 migration 各自有獨立佐證,唔靠 migrate summary**:

| Migration | 獨立 runtime 佐證 |
|---|---|
| `w47_agent_profile` | `GET /api/agent/profiles` → **200**(唔係 500)。🔴 **`200 唔係 500` 先係佐證** —— 表唔存在 Prisma 會掟 `PrismaClientValidationError` ⇒ 500。回應 `[]` 只係未有 row |
| `ch031_agent_run_hidden_at` | `GET /api/agent/runs/latest?requestId=…` 個 run **帶 `hiddenAt` 鍵**;而 hide 之後真係寫得入去(見下) |
| (兩者交集) | `GET /api/agent/runs` 每行有 **`profileId`** 鍵 |

🟢 **負面命中(最強嗰個)**:`GET /api/agent/runs?requestId=<id>` **唔再返單一 run** —— 而家返 `{items,nextCursor}`,**top-level 冇 `id` 鍵**(舊 shape 先有)⇒ 舊路真係搬咗去 `/latest`,同時排除「舊 build」。

**web 側**:bundle 由 `index-BS3gkJAb.js` 換成 **`index-FUwzprWp.js`(268,847 B**,部署 #8 嗰次 240,346 B)。新字串 `All profiles` / `All statuses` / `Could not save the profile` / `Filter by status` / `/agent/runs/latest` / `agent/profiles` / `/hide` **全部 PRESENT**;🟢 **舊 bundle `/assets/index-BS3gkJAb.js` → 404** ⇒ 排除 CDN 舊 cache。

#### 🟢🟢 順手收埋 CH-031 `G1` / `G2` —— 而兩半都要驗,只驗一半證唔到 `ADR-0040 D3`

DEV 嗰兩個測試 run(部署 #9/#9b 留低,當時只 abort 到)hide 走:

```
POST /api/agent/runs/cmswz56uk…/hide  -> 200  hiddenAt=2026-08-17 14:43:11
POST /api/agent/runs/cmswylt7c…/hide  -> 200  hiddenAt=2026-08-17 14:43:11
```

| 半邊 | 實測 |
|---|---|
| 唔再喺工作流程出現 | `GET /agent/runs/latest?requestId=` → **空 body** · `GET /agent/runs` → **0 items** |
| **攞住 id 仍然拎得返(`D3`)** | 兩個都 **200**,`status` 完好,而且 **`steps=5`/`proposals=1`** 同 **`steps=2`/`proposals=0`** |

🔴 **第二行先係 ADR-0040 喺真環境嘅兌現** —— 如果當初做咗 `DELETE`,嗰啲 `AgentStep` / `AgentProposal` 會經 `onDelete: Cascade` 一齊消失。**佢哋仲喺度。**

#### ⚠️ 一個驗唔到嘅位,唔可以當收

`ADR-0040 D4`(hide 唔會郁 R13)**喺 DEV 未驗證**。`GET /api/agent/review-stats` 返 `decided: 0`,但**唔係因為 hide** —— DEV 由頭到尾冇人真決定過任何 proposal(唯一嗰個係 `abortRun` bulk-reject,而佢**刻意唔寫 `decidedAt`**)⇒ **hide 唔 hide 個數都係 0**,而且我冇「hide 之前」嘅讀數。**D4 目前只有 unit test + falsification 撐住。**

順帶有用:`pending: 0` ⇒ terminal-only 閘冇留低孤兒 proposal。

---

### 2026-08-17 · 部署 #9b(同一個 image `dev-45ad525`)— **配 Azure OpenAI ⇒ agent 喺 DEV 第一次真行到底**

**冇重 build**,只係 env + secret 改動 ⇒ 同一個 image,新 revision `--0000012`。

#### 點解要有呢一步

部署 #9 之後 `B6` 收咗,但個 run 最後 `failed` —— 因為 DEV 冇配 `AZURE_OPENAI_*`。三個 key 全部係 `config.get` + lazy 503(`openai-agents.provider.ts:102-121`),所以**唔會令 container boot 唔起**,只會令「一開 run 就 503」。

#### 值由邊度嚟(⚠️ 呢個本身係一個發現)

🔴 **`rcitest` subscription 冇任何 Azure OpenAI resource**(`az cognitiveservices account list` → `[]`,而 `az account list --all` 只有一個 sub)⇒ **部署 SP 睇唔到 Chris 開嗰個**。值最後喺 **W46 worktree 嗰份 `apps/api/.env`** 攞到(`orca/workspaces/…/ai-agent/apps/api/.env`)。

⚠️ **主 worktree 嗰份 `.env` 冇呢啲 key** —— 28 個 key 入面一個 `AZURE_OPENAI_*` / `ANTHROPIC_*` 都冇。**兩個 worktree 嘅 `.env` 內容唔同**,凡係「`.env` 入面有 X」嘅講法都要講明係邊一份。

#### 配咗乜

| Env | 形式 | 值 |
|---|---|---|
| `AZURE_OPENAI_ENDPOINT` | plain | 由 W46 `.env` 搬(59 字元) |
| `AZURE_OPENAI_API_KEY` | **secretRef** `azure-openai-api-key` | 由 W46 `.env` 搬(84 字元) |
| `AZURE_OPENAI_API_VERSION` | plain | **`2025-03-01-preview`** —— **刻意唔照抄 `.env`**(嗰度係 `2024-12-01-preview`,舊值,會 400) |
| `AGENT_MODEL` | plain | `gpt-5.6-luna`(**deployment name,唔係 model id**) |

🔴 **`AGENT_RUNTIME` 刻意冇配** —— 佢行 `ConnectorConfigService` **DB-first**,擺個 env fallback 落去會同 operator 喺 Integrations panel 揀嘅嘢**靜靜競爭**,而邊個贏取決於 DB 有冇 row,唔係取決於邊個「比較新」。

dry-run sanity:secrets **10 → 11** · env **26 → 30** · `has environmentId: False`。

#### 驗證 —— 真跑一次,唔靠讀 env

「有設定」同「設定啱」係兩件事(§9 反覆記過),所以冇讀 container env 落結論,直接開一個 run:

```
POST /api/agent/runs → 201
status    : awaiting_approval     ← 部署 #9 嗰次係 failed
steps     : 4
proposals : 1                     ← agent 真係出咗建議
```

⇒ **Azure OpenAI 通,agent 喺 DEV 第一次行到底。**

#### 🔴 收尾:test run 清唔走,只 abort 到

`/agent/runs/{id}` **冇 `DELETE`**(OpenAPI 逐個 method 查過:`get` only),而 DEV DB 係 private endpoint,operator 側連唔到 ⇒ **平台今日冇任何路徑刪一個 run**。

做到嘅只有:

```
cmswz56uk…  awaiting_approval → POST abort 200 → aborted   (proposal 唔會執行)
cmswylt7c…  failed            → POST abort 409           (已 terminal)
```

⇒ 兩個 run 都係 terminal state、冇 pending proposal,**但兩行 row 仍然留喺 DEV DB 兼且會出現喺 UI**。要真刪要麼加一個 `DELETE /agent/runs/:id`(**H1,要開單**),要麼由連得到 DB 嗰邊執行 SQL。**未開單。**

---

### 2026-08-17 · 部署 #9(`dev-45ad525`)— **W46 agent runtime 上機 + DEV 第一次有 Redis**

**點解要有呢次部署**:W46 `agent-runtime` 2026-08-17 經 PR #114 merge 落 main(tip `45ad525`),而 W46 淨低兩條 acceptance(`A1` DEV 半邊 · `B6` SSE 喺 DEV 真通)**結構上要部署先收得到**。

#### 🔴 開工前推翻咗一個 handoff 前提:「Redis 要等 infra 開」唔成立

handoff 寫住「Redis 要先喺 DEV,`docs/13-deployment/11-azure-openai-infra-request.md` 寫好晒但未發」。逐樣實測之後,**要 infra 做嘅嘢一件都冇**:

| 前提 | 實測 |
|---|---|
| Redis 資源 | `redis-rapo-uop-dev` **`provisioningState: Succeeded`**(Redis 6.0 · Basic · SSL 6380 · `enableNonSslPort: false` · `publicNetworkAccess: Disabled`) |
| 網絡路徑 | `pe-redis-rapo-uop-dev` `Succeeded` → **`Subnet-RCITest-D-DB`** —— **同 `pe-pgsql-…` 同一個 subnet**,而 PG 嗰條由 2026-08-06 起跑過 19 個 migration |
| Access key | 部署 SP(`d2f094a3-…`,RG Contributor)**攞得到**(只驗存在性,值從未印出) |

⇒ 缺嘅唔係資源,係 **connection string 冇配落 container app**,而嗰個係改 params 一個 parameter + 部署腳本兩行嘅事。

📌 **同 W44 `B2` 同一形狀** —— 當時判斷「PG private,我哋連唔到 data-plane,所以建唔到 database」,而實際上建 database 係 **management plane** 操作,SP 一直做得到,問題白白掛咗一輪喺 infra 清單上。**「要人幫手」呢個判斷本身要有實測撐,唔可以由「個資源睇落唔喺我哋手」推出嚟。**

#### 🔴 配 Redis 兩個會靜靜失敗嘅位

1. **scheme 必須 `rediss://`(兩個 s)** —— `agentRedisConnection()`(`apps/api/src/agent/agent-run.queue.ts:110-121`)只傳 `{ url, skipWaitingForReady }`,**完全冇 TLS option**,TLS 純粹靠 URL scheme 決定;而 DEV Redis 係 6380 TLS-only。⚠️ **`.env.example` 個 default 正正係 `redis://`** ⇒ 照抄就係「配咗、部署咗、睇落 OK、一撳 agent 照樣 503」。
2. **key 必須 percent-encode** —— Azure Redis key 係 base64,含 `+` `/` `=`。實測今次個 key **44 → 46 字元**(一個 `=` 變 `%3D`)。同 W44 `F3-2`(PG 密碼個 `$` 同 `?` 靜靜截斷 credential)同族。

#### 部署本身

- image `dev-45ad525` 兩個 build + 真 push(api `sha256:3eca2aa8…` / web `sha256:20db4a6c…`);build host 出口 IP 實測 `52.187.129.166`(Azure 段,唔經公司 proxy)
- `patch-deploy-dev.ps1` raw ARM PATCH,兩個都 `exit 0`;dry-run sanity:api secrets **9 → 10** · env **25 → 26** · `has environmentId: False` · web `sends external/customDomains: False`
- api revision `--0000011` `RunningAtMaxScale`(舊 `--0000010` `Deprovisioning`)· web `--0000008`

#### 驗證 —— 三個 migration 各自有獨立佐證,唔靠 migrate summary

container log 原文:`25 migrations found` → `Applying migration 20260815030000_w46_agent_runtime` / `…_w46_agent_connector` / `…_w46_agent_run_actor` → `All migrations have been successfully applied.` → `Seeded 24 OpCos + admin + RHK OPCO_IT user.` → `Nest application successfully started`。

🔴 **但 summary 講嘅係「跑咗」唔係「跑出咗嘢」,而 `docker-entrypoint.sh` 令失敗 NON-FATAL** ⇒ 三個各自再驗一次:

| Migration | 獨立 runtime 佐證 |
|---|---|
| `w46_agent_runtime` | `GET /api/agent/runs?requestId=…` **200**,run row 讀得返 ⇒ `AgentRun` 表真存在 |
| `w46_agent_connector` | `GET /api/admin/integrations` 回應帶 `"column": "agentRuntime"` / `"agentModel"` |
| `w46_agent_run_actor` | run 回應個 **`startedById` 有值** |

**`B6`(SSE)**:`POST /api/agent/runs` → **201** `{"runId":"cmswylt7c…","status":"running"}`(⇒ Redis 通,job 真 enqueue);`GET /api/agent/runs/{id}/events` → **HTTP 200** · `Content-Type: text/event-stream` · 真收到 `id: 1` + `data: {"runId":"…","type":"changed"}` ⇒ **nginx / ACA ingress / api 三層都通**。

⚠️ **誠實界線**:嗰個 run 最後 `status: failed`,因為 **DEV 側冇配 `AZURE_OPENAI_*`**。所以收到嘅係「**SSE 管道通、event 推得到 client**」,**唔係**「run 由 `running` 行到 `completed` 全程 SSE 推送」。

#### ⚠️ 順帶揪到嘅兩件事

1. **`GET /agent/runs` 缺 `requestId` 會 500 唔係 400** —— OpenAPI 標 `required: true`,但 runtime 冇 enforce,直接落到 `prisma.request.findUnique({ where: { id: undefined } })` ⇒ `PrismaClientValidationError` → 500。1362 條 test 全綠冇捉到。
2. **`N8N_OUTBOUND_WEBHOOK_KEY` 係 `getOrThrow` 但唔喺 DEV 嘅 env 入面** —— 今日冇事,因為 `REQUEST_SUBMISSION_PROVIDER=direct` 令個 provider 唔會被建。但 BUG-011 個 Integrations panel 就係畀 operator 喺 UI 轉 provider 去 n8n 嘅。未深挖,未開單。

---

### 2026-08-15 · 部署 #8(`dev-4bbbe0f`)— **追返 CH-030 / ADR-0035**

**點解要有呢次部署**:CH-030 喺 2026-08-14 merge(PR #104 → #105 → #106),DEV 仍然跑 `dev-2a68f8d` ⇒ 落後一個 CH。

🔴 **落手之前要講清楚呢次部署換唔到咩** —— ADR-0035 個 `serviceNowLicenceReqNumber` **只對部署之後開嘅 request 有值**(`OD-1` backfill = Chris 2026-08-14 拍板**唔做**)⇒ **部署完即刻去 DEV 睇,一條 REQ 都唔會見到**。實測兌現:部署後 `GET /api/fulfilment/requests` **10 條全部 `null`**(10/10),即全部仍然行 `A7` 回退路顯示 RITM。**呢次部署嘅價值係「下一張真 intake 入嚟就有」,唔係「而家睇得到」** —— Chris 2026-08-15 明知呢點之下仍然揀「而家就做」,理由係唔想再累積 drift。

**流程**(同部署 #6 / #7 逐步一致,行 `04-deploy-runbook.md` §0-pre 個 DEV 分支):

| 步 | 做咗乜 | 結果 |
|---|---|---|
| 0 | `az account show` **先驗身份**(呢台機撞過 4 個 SP) | `d2f094a3-…` = **部署 SP**,sub `30dac177…` ⇒ 同腳本 hardcode 嗰個逐字對上。🟢 **session 仲喺度,唔使 Chris 重新 `az login`** |
| 1 | `docker login acrrci3ailanding1.azurecr.io`(params 檔嗰組 `4a6e1474`,**唔用 `az acr login`**;密碼經 `--password-stdin`) | **`Login Succeeded`** |
| 2 | 🔴 **真試 `docker pull node:20-slim` + `nginx:1.27-alpine`** | 兩個都 `exit 0`(`Image is up to date`) |
| 3 | `docker build` × 2(context = repo root) | 兩個都 **`exit 0`** ⇒ BUG-008 嗰道 `RUN test -f dist/main.js` gate 過咗 |
| 4 | `docker push` × 2 | api `sha256:42190e1c…` · web `sha256:57ccdadb…` —— **同本地 manifest list digest 逐字對上** |
| 5 | 改 `aca.params.dev.json` 個 image tag(`dev-2a68f8d` → `dev-4bbbe0f`) | **字串替換唔用 JSON round-trip** ⇒ 2 處、`lengthDelta = 0`、re-parse 仍然 28 個 parameter |
| 6 | `patch-deploy-dev.ps1`(dry-run) | api secrets **9** / env **25** · web 1 / 1 · **四個 sanity 全 `False`**:`environmentId` · `workloadProfileName` · web `external` · web `customDomains` |
| 7 | `patch-deploy-dev.ps1 -Send` | 兩個 **`PATCH exit = 0`**,腳本 exit 0 |

#### 驗證 —— 唔睇 revision status,睇新版本特徵

🔴 沿用部署 #6 立嘅判準:entrypoint 令 migrate/seed 失敗 **NON-FATAL**,所以 `Healthy` 證明唔到 DB 通。

**Step 0**(四個 endpoint 真打):`/` **200** 561 B · `/api/auth/sso/status` **200** · `/api/me` **401**(唔係 502/504)· `/api/docs/api-json` **200** 66,893 B(08-13 嗰次係 62,834 B)。

🟢🟢 **api 側 —— 一個 request 同時證兩樣**:break-glass login **200** → `GET /api/fulfilment/requests` **200**,row 個 key 清單有 **`serviceNowLicenceReqNumber`**。

- **新 code**:嗰個 key 係 CH-030 先加,舊 build 出唔到
- **migration 真跑咗**:Prisma 預設 select 會把嗰條 column 寫入 `SELECT`,**column 唔存在就係 500 唔係 200** ⇒ 拎到 200 就等於 column 喺真 DB 存在(同部署 #6 用 `seatModel` 嗰條推理一模一樣)

**web 側**(冇版本 endpoint;唔用瀏覽器登入 —— 會令密碼出現喺對話):直接 fetch `/assets/index-BS3gkJAb.js`(240,346 chars)搜字串:

| 字串 | 屬 | 期望 | 結果 |
|---|---|---|---|
| `raised by this platform for this joiner` | CH-030 F1 **新增** | True | ✅ |
| `one per SKU` | CH-030 F1 **新增** | True | ✅ |
| **`raised by this platform, closed on assign`** | **CH-030 之前嘅舊 sub,已被刪走** | **False** | ✅ **唔喺度** |

> 🔴 **第三行先係最強嗰個** —— 一個「應該唔喺度」嘅字串真係唔喺度,同時排除「舊 bundle」同「CDN 舊 cache」兩個解釋。呢個手法由部署 #6 個 `No seats enabled` 立低。

**R6 對數**:`/` 經 **custom domain + SNI** 返 200 ⇒ infra 配嘅 `customDomains` 綁定完好(PATCH 結構上掂唔到佢,dry-run 四個 `False` 已預先證咗)。

### 2026-08-13 · 部署 #6(`dev-53965f3`)— **DEV-SYNC:追返落後嘅五個 CH**

**點解要有呢次部署**:同日較早做 `CH-026 G-7` 落手前唯讀查 DEV,發現 **row 冇 `seatModel`、stats 冇 `unlimitedSkus` 同 `totalConsumed`** ⇒ **DEV 跑緊嘅 `dev-86ed450`(部署 #5,08-10)冇 CH-024 / 025 / 026 / 027 / 028** —— 嗰五單全部 **08-12** 先 merge。呢個 gap **之前冇任何地方記低過**,連 W44 closeout 都冇捉到,**因為 closeout 只問「DEV 通唔通」,冇問「DEV 上面係邊個版本」**。

**流程**(全程行 §0-pre 個 DEV 分支,唔係 UAT runbook):

| 步 | 做咗乜 | 結果 |
|---|---|---|
| 0 | `az account show` **先驗身份**(呢台機撞過 4 個 SP) | `d2f094a3-…` = **部署 SP**,sub `30dac177…` **同腳本 hardcode 嗰個逐字對上** |
| 1 | `docker login acrrci3ailanding1.azurecr.io`(params 檔嗰組 `4a6e1474`,**唔用 `az acr login`**) | **`Login Succeeded`** |
| 2 | 🔴 **真試 `docker pull node:20-slim` + `nginx:1.27-alpine`** | **兩個都 `exit 0`** ⇒ 本地 build 冇阻塞 |
| 3 | `docker build` × 2(context = repo root) | 兩個都 **`exit 0`** ⇒ BUG-008 嗰道 `RUN test -f dist/main.js` gate 過咗 |
| 4 | `docker push` × 2 | api `sha256:e3b2044a…` · web `sha256:89bfcf59…` |
| 5 | 改 `aca.params.dev.json` 個 image tag | **字串替換唔用 JSON round-trip** ⇒ 2 處、`lengthDelta = 0`、JSON 仍然 parse |
| 6 | `patch-deploy-dev.ps1`(dry-run) | api secrets **9** / env **25** · web 1 / 1 · **`has environmentId: False`** · **`has workloadProfile: False`**(兩者都必須 False) |
| 7 | `patch-deploy-dev.ps1 -Send` | 兩個 **`PATCH exit = 0`**,腳本 exit 0 |

> 🔴 **步 2 唔係多餘** —— `09` 本檔上面記住「本地 `docker build` 兩重失敗:Docker Hub CDN **503** + ACR firewall」,而 `docker login` 成功**證明唔到** `docker build` 得(**同 W44 Day 7「`docker login` vs `push`」同族**)。所以真 pull 一次先算數。結果:**兩個 base image 都 `Image is up to date`** ⇒ 本機早有 cache,**呢台機好可能就係當初解封 B1 嗰台 build host**。

#### 驗證 —— 唔睇 revision status,睇新版本特徵

🔴 **刻意唔用 `revision.Healthy` 做判準**:entrypoint 令 migrate/seed 失敗 **NON-FATAL**,所以 `Healthy` 證明唔到 DB 通(本檔已記低呢個陷阱)。改為打 API 睇**只有新 code 先出到嘅欄**:

| 證據 | 結果 |
|---|---|
| `GET /api/license/tenant-skus` row | **有 `seatModel`**(CH-026)⇒ 順帶證明 **migration 真跑咗** —— 冇嗰條 column,Prisma query 會爆 500 |
| `GET /api/license/tenant-skus/stats` | `{"totalOwned":4240459,…,"totalConsumed":**25292**,…,"unlimitedSkus":**0**}` ⇒ **`totalConsumed` = CH-028 · `unlimitedSkus` = CH-026** |
| break-glass login | **200**(驗證過程本身要登入)⇒ auth + DB 都通 |

**web image 側**(冇版本 endpoint,唔用瀏覽器登入 —— 會令密碼出現喺對話):直接 fetch `/assets/index-d33tGxDI.js`(239,313 B)搜字串:

| 字串 | 屬 | 結果 |
|---|---|---|
| `In M365` | CH-028 | ✅ |
| `unlimited excluded` | CH-026(同 `platform-view.tsx:388` 逐字一樣) | ✅ |
| `Unlimited` | CH-026 | ✅ |
| `grace` | CH-027 | ✅ |
| `Completed` | CH-025 | ✅ |
| **`No seats enabled`** | **ADR-0033 移走咗嘅舊字串** | **❌ 唔喺度 —— 呢個先係最強證據**(一個「應該唔喺度」嘅字串真係唔喺度,證明唔係舊 bundle) |

> ⚠️ **第一次搜錯字串,差啲推錯結論**:原本搜 `unlimited SKUs excluded` 同 `No seats enabled`,兩個都 False,一度懷疑 web image 冇上到。實查 source 之後先知 —— 前者**只存在於 test 檔**(實際 code 係 `unlimited excluded`,KPI 嗰句係拼出嚟),後者**已經被 ADR-0033 移走**。⇒ **同一族(由唔對位嘅觀察推去更強結論)當日第 N 次,今次喺落結論之前捉到。**

🚧 **淨低**:**DEV 側嘅 `G-7` 未做** —— `totalOwned` 喺 DEV 仍然係 **4,240,459**、`unlimitedSkus` **0**。同日喺**本機**做嘅 curate 唔會跟住 code 過嚟(佢係 DB 資料唔係 code)。DEV 而家**做得到**(有 `seatModel` 欄),要唔要做係另一個決定。

### 2026-08-13 · **驗證 —— 無新部署**(W44 closeout `F8-1`)

DEV 仍然行 `dev-86ed450`(部署 #5)。本次**冇 push 任何 image、冇 PATCH 任何 revision** —— 純粹用 `B8` 解封之後嘅通路,把一路卡住嘅驗證收返。

**Step 0(每次 live 驗第一件事,唔靠上次記錄)** —— `https://rapo-uop-web-dev.rci-t.com/` 四個 endpoint 真打:

| Endpoint | 結果 |
|---|---|
| `/` | **200**(561 B,SPA shell) |
| `/api/auth/sso/status` | **200** `{"enabled":true}` |
| `/api/me`(無憑證) | **401**(唔係 502/504 ⇒ api 真喺度兼 guard 正常) |
| `/api/docs/api-json` | **200**(62,834 B 真 OpenAPI) |

#### 🟢🟢 `F6-6` — break-glass 登入(**本 phase 第一次真人登入 DEV**)

`POST /api/auth/login`(`admin@uop.local`,密碼由 `aca.params.dev.json` 讀入變數、**全程冇印出**)→ **200**,`Set-Cookie` 兩個:**`uop_access` + `uop_refresh`** ⇒ ADR-0006 §7 嘅 rotating refresh 設計喺 ACA ingress 後面**完好**,`Secure` cookie 冇被擋。跟住 `GET /api/me` → **200**:

```json
{"email":"admin@uop.local","displayName":"Local Admin","role":"ADMIN","opcoScopeId":null,"opcoScope":null,"mustChangePassword":false}
```

⇒ role 真係 **`ADMIN`**;`mustChangePassword: false` **由讀 code 嘅推論升做實測**(見 `F3-7e`)。

#### 🟢🟢 `F6-14` — 400 body 捱唔捱得過 ACA ingress + nginx proxy

`PATCH /api/fulfilment/requests/{id}/line-items/{liId}/assign`,body `{}`(**刻意唔送 `budgetOverrideReason`**)⇒ **400** · `application/json` · **290 B 完整**:

```json
{"outcome":"blocked","failedAt":"sync-azure","steps":[{"key":"stage","status":"ok"},{"key":"sync-azure","status":"failed","detail":"Phase 1 sync gate not passed: azureSyncedAt is null","retryable":true,"whoFixes":"identity"}],"message":"Phase 1 sync gate not passed: azureSyncedAt is null"}
```

⇒ `outcome` / `failedAt` / `steps[]` / `whoFixes` **逐個過得到 proxy**,而 ADR-0029 刻意保留嘅舊 shape `message` **同時在** ⇒ **`AssignResultDialog` 喺 DEV 一定開得到**(前端解析本機已 100% 驗過)。`outcome=blocked` ⇒ **零副作用**。

> 🔴 **執行之前嗰次唯讀探測,先至係本次最要緊嘅產出 —— 已升做 RISK `R10`。**
> DEV 得 **9 條 line item、全部 `RAPO/IT`、全部真嘢**,而其中**三條 `READY` 嘅兩個 sync gate 都已經開咗** ⇒ 撳落去**直達 Graph,只剩 budget 一道閘**;而 DEV 個 `GRAPH_TENANT_ID` 就係**公司 M365 tenant** ⇒ **閘一唔中就真派一個 licence 畀一個真人**。
> 改揀 **`REQ0043934`**(兩個 gate 都 null)⇒ **結構上到唔到 Graph**。**換閘對驗證目標零損失**(本項驗嘅係「400 body 過唔過 proxy」,而兩道閘行 ADR-0029 **同一條組裝路**),但換返嚟**零真派風險**。
> 🔴 **唔好靠 budget 閘做安全網** —— 佢係業務規則唔係安全邊界,`budgetOverrideReason` 一送就過。

#### 🟢 `F2-13` — `runningStatus` 被 unset 嘅疑慮,由行為收咗

部署 #1(raw ARM PATCH)喺 **2026-08-06**;**七日後(08-13)四個 endpoint 全部真答** ⇒ `runningStatus`(read-only status field)若然真係被 unset 成 `''`,個 app 唔可能一路行到今日仲逐個答。
⚠️ **誠實界線**:**冇直接讀返個 field**(要 `az`,而部署 SP 憑證唔喺 repo,要 Chris 自己 `az login`)。呢度收嘅係**行為證據** —— 佢答嘅唔係「ARM 有冇改過佢」,而係「**就算改過都冇造成後果**」。對本項要防嘅風險(PATCH 會唔會整停個 app)嚟講已經足夠。

### 2026-08-10 · 部署 #5(`dev-86ed450`)— **CH-023 ServiceNow 結果留 timeline 上機**

**內容**:CH-023(`f219676`)+ merge 咗嘅 `main`(PR #77 + #78)。走同一條 raw ARM PATCH 路,零流程改動。

> 🔴 **點解要有呢次部署 —— 一個差啲漏咗嘅前提**:準備做 live 驗嗰陣先發現 **DEV 跑緊 `dev-211001e`,而 CH-023 個 code 喺 `f219676`,即係部署 #4 之後三個 commit** ⇒ **G9 根本驗唔到**。`git log 211001e..f219676` 實測確認,唔係靠記憶。**教訓**:「code 已 merge 入 main」同「code 已經喺 DEV」係兩件事,而 live 驗計劃只寫「去撳」嗰陣好易當咗係一件事。

| 步 | 結果 |
|---|---|
| az 身份 | `az account show` 實測 = SP **`d2f094a3-…`**(部署 SP,sub `rcitest`)—— §9 講明呢台機一日撞過 4 個 SP,所以做嘢前先驗身份,唔靠「應該係啱嗰個」 |
| ACR login | `Login Succeeded`(`docker login --password-stdin`,憑證由 `aca.params.dev.json` 讀入變數,冇印出) |
| Build | api + web 兩個 `exit 0`;api 過咗 BUG-008 嗰道 `RUN test -f dist/main.js` 硬閘 |
| Push | 🟢 **兩個都 exit 0 + 有 digest** —— api `sha256:68faaa7d…` · web `sha256:90a69728…` |
| Dry-run | `has environmentId: False` · `has workloadProfile: False` · web `sends external?: False` / `sends customDomains?: False` · api 9 secret / 25 env · web 1 secret / 1 env · 零 `<len 0>` secret |
| PATCH | 兩個 `exit 0` |
| Revision | api **`--0000007`** · web **`--0000004`**,兩個都 `Healthy` / traffic 100,舊 revision 退到 traffic 0。⚠️ api 第一次查係 `Activating`(要行 migration + seed),**第二次查先 `RunningAtMaxScale`** —— 查一次就下結論會誤判成部署失敗 |

🟢 **決定性證據仍然係 container log**(`Healthy` 證明唔到 DB 通,呢個陷阱冇變):

```
19 migrations found in prisma/migrations
No pending migrations to apply.
Seeded local admin (admin@uop.local).
Seeded 24 OpCos + admin + RHK OPCO_IT user.
Nest application successfully started
```

零 `WARN: … failed`。**`No pending migrations` 正正係 CH-023 應有嘅樣** —— 本單零 schema 改動,所以「冇新 migration」係預期而唔係漏做。

🔴 **未驗到**:CH-023 **G9**(閂咗 dialog 之後喺 Operational history 睇返 ServiceNow 嗰行)同 W45 **F4-4b**,兩個都卡 `B8`,**一定要喺公司網做**。到此刻證到嘅只係「帶住嗰個 code 嘅 container 起到身兼連到 DB」。

### 2026-08-10 · 部署 #4(`dev-211001e`)— **W45 / ADR-0029 assign step breakdown 上機**

**內容**:W45 全部(ADR-0029 十步 breakdown · `budget: overridden` · 前端 `AssignResultDialog` · `apiPatch` 帶 `detail` 修復)。走同一條 raw ARM PATCH 路,零流程改動。

| 步 | 結果 |
|---|---|
| Build host | 🟢 **就係開發嗰台機** —— egress IP 實測 `52.187.129.166`,同 B1 解封記低嗰個逐字一樣;ACR `/v2/` 返 `401`(= 打得通,要 auth) |
| ACR login | `Login Succeeded`(`docker login --password-stdin`,ACR 憑證 `4a6e1474`)。⚠️ **仍然唔可以由 login 推 push** —— W44 Day 7 就係咁錯過一次 |
| Build | api + web 兩個成功;api 過咗 BUG-008 嗰道 `RUN test -f dist/main.js` 硬閘 |
| Push | 🟢 **兩個都 exit 0 + 有 digest** —— api `sha256:b2429458…` · web `sha256:412c5b4f…` |
| Dry-run | `has environmentId: False` · `has workloadProfile: False` · web `sends external?: False` / `sends customDomains?: False` · api 9 secret / 25 env · web 1 secret / 1 env。**順帶查咗空值**:九個 secret 冇一個 `<len 0>`;唯一空 env = `ACS_SENDER_ADDRESS`(= 已知 CH-021 blocker,唔係新嘢) |
| PATCH | 兩個 `exit 0` |
| Revision | api `--0000006` `Healthy`/`RunningAtMaxScale` · web `--0000003` `Healthy`/`Running`,**兩個都 traffic 100 兼舊 revision 已退場** |
| infra 配置 | 🟢 完好:`customDomains: rapo-uop-web-dev.rci-t.com` · `external: true`。**再一次印證 PATCH 唔 unset 冇送嘅 property** |

🟢 **決定性證據仍然係 container log**(`Healthy` 證明唔到 DB 通,呢個陷阱冇變):

```
[entrypoint] prisma migrate deploy
19 migrations found in prisma/migrations
No pending migrations to apply.
[entrypoint] seeding (idempotent upserts)
Seeded 24 OpCos + admin + RHK OPCO_IT user.
Nest application successfully started
```

零 `WARN: … failed`(唯一 stderr = Prisma 個 `package.json#prisma` deprecation warn,唔係失敗)。⇒ **DB 通 · schema 已係最新 · seed 行到**。

🔴 **未驗到嘅嘢 —— 唔可以當 W45 收官**:
- **W45 G11(live 撳一次)仍然做唔到**,卡 `B8`(private DNS 完全冇配)。呢台 build host 喺 Azure 段,`rapo-uop-web-dev.rci-t.com` 解析唔到 ⇒ **一定要喺公司網做**。
- 所以「ADR-0029 個 dialog 喺 DEV 出唔出到」到此刻**零證據** —— 證到嘅只係「帶住嗰個 code 嘅 container 起到身兼連到 DB」。

### 2026-08-07 · 部署 #2(`dev-3971ad3`)— **ADR-0028 SSO 上線,但仍未有真登入證據**

**內容**:ADR-0028(SSO server-side code exchange)+ 四個 `ENTRA_*` env。走同一條 raw ARM PATCH 路。

| 步 | 結果 |
|---|---|
| ACR 存取 | ⚠️ **`az acr login` 用錯身份就死** —— 部署 SP `d2f094a3` 冇 registry 權限,az CLI 會 **fallback 去互動式問 username** 然後 `EOFError: EOF when reading a line`。🔴 呢個錯誤訊息**完全唔提權限**,好易讀成「CLI 壞咗」。改用 `docker login` 配 `aca.params.dev.json` 入面嗰組 ACR 憑證(`4a6e1474`)⇒ `Login Succeeded` |
| Build | api + web 兩個 `exit 0`。**零 build arg** —— Entra 嗰四個 `ARG VITE_ENTRA_*` 已由 Dockerfile 拆走 |
| Push | 🟢 api `sha256:eecd2521…` · web `sha256:070c4967…` |
| PATCH | 兩個 `exit 0`。dry-run 先核對:`has environmentId: False` · `has workloadProfile: False` · web 唔送 `external`/`customDomains` |
| Revision | api `--0000003` `RunningAtMaxScale`/`Healthy` · web `--0000002` `Running`/`Healthy` |
| infra 配置 | 🟢 完好:`customDomains` + **`SniEnabled`** · `external:true` · `workloadProfileName:Consumption` · `environmentId` |

🟢 **決定性證據係 container log,唔係 `Healthy`**:

```
[EntraSsoService] Entra SSO is configured (server-side code exchange).
19 migrations found in prisma/migrations
Seeded 24 OpCos + admin + RHK OPCO_IT user.
Nest application successfully started
```

零 `WARN: … failed`。**第一行係關鍵** —— `EntraSsoService` 個 constructor 要**四個 env 齊晒**先會 log 呢句,所以佢直接證到配置到位。(`Healthy` 本身仍然證明唔到嘢 —— entrypoint fail-soft,呢個陷阱冇變。)

🟢 **bundle 實證**:`dist/assets/*.js` grep `msal|login.microsoftonline|VITE_ENTRA|acquireTokenSilent|PublicClientApplication|access_as_user` ⇒ **零命中**;**對照組**(grep 三條新 endpoint)⇒ **全部搵到** ⇒ 方法有效,零命中係真嘅零。

🔴 **仍未做 = F9-8(真登入)**,而且**喺 build host 做唔到** —— 佢喺 Azure 段,`rapo-uop-web-dev.rci-t.com` → `No such host is known`(企業內部 DNS,符合 B8)。⇒ **要喺公司網做。**

🔴 **一個試過拆但拆唔到嘅風險**:見上面認證節頂部嘅 `AADSTS9002327` blockquote。

---

### 2026-08-06 · 部署 #1(raw ARM PATCH)— **配置全部落到,但下游三樣未驗證**

**方式**:唔用 `aca-dev.json`(ARM full PUT 會 403,見上面 B4)。用兩個 `az rest --method patch`,body 對齊 template 內容但**刻意唔含 `environmentId` / `workloadProfileName` / web 嘅 `customDomains`+`external`**。腳本先 dry-run 印 masked 結構驗過(19 env · 8 secret · array 型別 · 零 `environmentId`)先送。

**image**:`uop-api:dev-0d01f0c` · `uop-web:dev-0d01f0c`(commit `0d01f0c`)

| 驗到嘅嘢(有真 tool output) | 結果 |
|---|---|
| api PATCH / web PATCH | `exit=0` |
| api revision `--0000002` | **`Healthy` / `RunningAtMaxScale`** · replicas 1 |
| web revision `--0000001` | **`Healthy` / `Running`** · replicas 1 |
| **ACA 由 VNet 內 pull 到 `acrrci3ailanding1`** | 🟢 **通** —— revision 真係跑緊我哋個 image(pull 唔到就唔會 Healthy) |
| api 配置 | image ✅ · 19 env ✅ · 8 secret ✅ · registry ✅ · ingress **internal + 3000 + allowInsecure**(ADR-0027 Option A)✅ |
| web 配置 | image ✅ · `API_UPSTREAM` = api internal FQDN ✅ · targetPort **8080** ✅ |
| 🟢 **`customDomains`** | **`rapo-uop-web-dev.rci-t.com[SniEnabled]` 完好** |
| 🟢 `workloadProfileName` / `environmentId` | 兩個 app 都保留(PATCH 冇 unset) |

### 🔴 驗證唔到嘅嘢 —— **唔可以當部署成功**

**`Healthy` 喺呢個 image 上證明唔到 DB 通。** `apps/api/docker-entrypoint.sh` 明文設計成 migrate / seed 失敗 **NON-FATAL**:

```sh
npx prisma migrate deploy || echo "[entrypoint] WARN: migrate deploy failed (continuing)"
npm run seed             || echo "[entrypoint] WARN: seed failed (continuing)"
exec node dist/main
```

⇒ 就算 PG 完全連唔到,容器一樣 `Healthy`。呢個係 W33 為 UAT 做嘅有意取捨(唔想 crash-loop),但代價正正係 F7 記錄嗰種「**紅得靜**」。

**三條驗證路全部封死**:

| 路 | 結果 |
|---|---|
| `az containerapp logs show` | ❌ `AuthorizationFailed` — 要 **`managedEnvironments/read`** |
| `az containerapp exec` | ❌ 同上 |
| HTTP smoke | ❌ 四個 URL 全部 `000`(連接失敗) |

**HTTP 打唔到嘅原因唔係部署壞咗,係網絡** —— 而呢個唔再係推論,有對照實測:

**① `acaen-rapo-dev` 係 internal-only env(已實證)**

| FQDN | 公網 DNS(8.8.8.8) |
|---|---|
| 舊 UAT(**external** env,自建孤島)`ca-uop-web.lemonhill-2df17b88.eastasia.azurecontainerapps.io` | 🟢 **`20.239.118.203`** |
| 新 DEV `aca-rapo-uop-web-dev.nicesea-c3849dba.eastasia.azurecontainerapps.io` | 🔴 **Non-existent domain** |

同一個 subscription、同一個 region,一個有公網 A record 一個完全冇 ⇒ **新 env 嘅 app FQDN 只喺 hub VNet 嘅 private DNS 註冊**。

**② custom domain 係企業 split-horizon(對照組:一個已知在用嘅服務)**

| Hostname | 公網 | 呢台機(`az-sgp-dc1` 10.160.50.4) |
|---|---|---|
| `rci-t.com` | 🟢 `3.33.130.190` / `15.197.148.33` | 🟢 同上 |
| **`rapo-n8n-uat.rci-t.com`**(infra 話 n8n 用緊,**已知在用**) | 🔴 冇 | 🔴 冇 |
| `rapo-uop-web-dev.rci-t.com`(我哋) | 🔴 冇 | 🔴 冇 |

🔴 **關鍵**:我哋同**一個已知在用嘅服務**表現一模一樣 ⇒ **冇證據話我哋條 DNS 記錄「未建」**,亦**冇證據話佢「建咗」**。呢台 build host 喺 **SGP VNet**,唔喺 hub VNet 亦唔喺解析得到企業內部記錄嘅網絡。

### 🟢 B8 已解決(2026-08-06 稍後)—— custom domain 通,**而且係 https**

infra 建咗 DNS 記錄之後,Chris 由公司網絡實測:**`https://rapo-uop-web-dev.rci-t.com/` 開到 login 頁面**。

⇒ **F6-4 收**(前端經 custom domain + SNI render 到)。同 ingress 配置對得上:`external=true` · `targetPort=8080` · **`allowInsecure=false`**(http 會 301 去 https)· `customDomains: rapo-uop-web-dev.rci-t.com [SniEnabled]`。
🟢 **順帶消除一個潛在靜態 bug**:`APP_BASE_URL` 我哋填咗 **https**(F3-3,對抗 infra 最初寫嘅 http)—— 而家證實填啱。若當時照 infra 個 http 填,密碼重設信入面條 link 會壞,而 **API 照返 204、信照寄,冇任何紅燈**。
🟢 cookie `Secure` flag 嘅擔心亦同時消除(走 https)。

⬇️ **以下保留 B8 當時嘅實測記錄** —— 佢係「custom domain binding 存在 ≠ DNS 記錄存在」呢個教訓嘅證據。

### 🔴 B8(當時)—— **企業 DNS 冇我哋條記錄**(2026-08-06 由公司網絡實測)

Chris 喺**公司網絡嘅電腦**(DNS server `10.160.92.1`)跑分診:

```
nslookup rapo-n8n-uat.rci-t.com     → 10.160.71.243        ✅
nslookup rapo-uop-web-dev.rci-t.com → Non-existent domain  ❌
```

⇒ **同一個企業 DNS、同一個 domain,n8n 有 A record 而我哋冇。** 之前嗰個「支持性論據」(ACA 綁 custom domain 要 hostname 驗證 ⇒ DNS 應該配好咗)**唔成立** —— 又一次「睇落合理嘅推論」被一條 `nslookup` 推翻。

🔴 **⇒ `https://rapo-uop-web-dev.rci-t.com/` 而家喺企業網絡入面都訪問唔到**,直到 infra 建咗條記錄。呢個係 **B8**,獨立於 B7(觀測權限)。

**要 infra 做**:喺企業 DNS 為 **`rapo-uop-web-dev.rci-t.com`** 建一條記錄指向 `acaen-rapo-dev` 個 internal static IP(ACA custom domain 通常仲要一條 `asuid.rapo-uop-web-dev` TXT 做 hostname 驗證 —— binding 已經存在,所以嗰條可能一早有)。
🔍 **順帶一條線索**:`rapo-n8n-uat.rci-t.com` 解析到 **`10.160.71.243`**。若 n8n 都係跑喺同一個 ACA env(registry 入面確實有個 `n8n` repo),咁條記錄好可能係指同一個 IP ——**但呢個係推論,由 infra 確認**。

### ⛔ ~~🟢 但 B8 **唔 block 驗證** —— ACA 預設 FQDN 係另一條路~~ — **本段兩個結論都已被實測推翻**

> 🔴 **2026-08-13 更正(W44 closeout `F8-1`)。原文一個字冇改,保留喺下面做方法論記錄。**
>
> 1. **「ACA 預設 FQDN 喺 private DNS *一定* 有記錄」** —— 嗰個「**一定**」係**推論唔係實測**。2026-08-10 Chris 實測 **ACA 預設 FQDN 一樣訪問唔到**:web ingress `external: true`**但** env `vnetConfiguration.internal = true` 而 `staticIp = 10.160.71.70`(**私有 IP**)⇒ 個 FQDN 要靠 private DNS zone `nicesea-c3849dba.eastasia.azurecontainerapps.io` 解析,而**嗰個 zone 冇 link 到企業網**。
> 2. **「F6-4/5/6 可以即刻收」** —— 上面一錯,呢句跟住錯,**而佢被當成事實用咗四日**。
>
> 🟢 **真相仲有第三層(2026-08-11 再更正)**:「咁即係兩個 hostname 都打唔到」呢個收尾**自己又係一個冇標明嘅推論** —— 08-10 **只實測過 ACA 預設 FQDN**;**custom domain 行嘅係企業 DNS 一條 A record,係另一條解析路**。本檔上面 `🟢 B8 已解決(2026-08-06 稍後)` 嗰段就記住 custom domain **當時已經實測開到**。
>
> ⇒ **實際結局:`F6-5` / `F6-6` / `F6-14` 全部經 custom domain `https://rapo-uop-web-dev.rci-t.com/` 收咗**(2026-08-12 / 08-13),**ACA 預設 FQDN 呢條路由頭到尾冇用過一次**。
>
> 📌 **方法論**:同一族錯誤(**由一個相關但唔對位嘅觀察,推去一個更強嘅結論**)喺本 phase 出現咗四次。⇒ **凡要 live 驗,第一件事係真打一次 `https://rapo-uop-web-dev.rci-t.com/`** —— 30 秒,兩個結果都有路行,唔使推。全套見 `10-dev-live-verification-runbook.md`。

custom domain 只係**一個** hostname。app 本身仲有 ACA 預設 FQDN,而佢喺 hub VNet 嘅 private DNS **一定有記錄**(internal env 就係咁註冊)。⇒ 喺**公司網絡**嘅機直接打:

```
https://aca-rapo-uop-web-dev.nicesea-c3849dba.eastasia.azurecontainerapps.io/
https://aca-rapo-uop-web-dev.nicesea-c3849dba.eastasia.azurecontainerapps.io/api/docs/api
```

⇒ **F6-4/5/6(前端 200 · `/docs/api` 200 · break-glass login)可以即刻收**,唔使等 infra 建 DNS。custom domain 嗰半留返 B8 解封之後補驗。

> 🔍 **順帶:公網打唔到係功能正常嘅表現,唔係故障。** W44 開呢個環境正正就係為咗「**只喺企業網絡內可達 + 打得入 n8n**」;舊環境嘅問題就係佢住喺公網孤島。

### 🟢 但 management plane metrics 補到大部分 —— **`storage_used` 係決定性嗰個**

三條直接驗證路封死之後,轉去查 **PG 嘅 management plane metrics**(`pgsql-rapo-uop-dev` 住喺我哋有 Contributor 嘅 RG ⇒ 讀得到,唔使 log / exec / 企業網)。

**`storage_used`(bytes)—— api revision `--0000002` 建於 `04:14:08Z`**:

```
03:40 – 04:10   4,421,869,568   ← 連續 7 個點完全一樣,平穩
04:15           4,422,836,224   ← 跳升 +966,656 bytes (≈944 KB)
04:20 – 05:35   4,422,836,224   ← 之後零變動
```

🟢 **跳升精確落喺容器起身嗰個 5 分鐘窗口**,增量同「建 schema + seed(24 OpCo + admin + catalog SKU)」嘅量級吻合,而且之後**完全平穩**(冇 retry loop、冇持續寫入)。

**其餘三個 metric(同一窗口)**:

| Metric | 讀數 | 意義 |
|---|---|---|
| `connections_failed` | **全程 0** | 排除「到達 server 但被拒」(密碼錯 / 連接上限)。⚠️ **但單獨證明唔到連得到** —— 網絡唔通嘅話請求連 server 都未到,唔會計入 |
| `active_connections` | 部署前 total ≈ **68** → 部署後 ≈ **79** | 約 **+2 個持續連接**,同單 replica Prisma idle pool 吻合。弱正面 |
| `cpu_percent` | 12–13% 平穩,**無 spike** | 唔矛盾 —— migration + seed 對 B1ms 嘅工作量細,淹冇喺 12% 基線噪音入面 |

### 🟢🟢 B7 解封 → **三個未知數全部收齊(2026-08-06,container log 原文)**

infra 2026-08-06 畀咗 SP `managedEnvironments/read`(同時 enable 咗 log)⇒ `az containerapp logs show` 通。**而且啟動嗰刻嘅 log 仲喺度**:

```
04:14:26.13  [entrypoint] prisma migrate deploy
04:14:27.47  Prisma schema loaded from prisma/schema.prisma
04:14:27.60  19 migrations found in prisma/migrations
04:14:27.77  Applying migration `20260709070246_init`
   …         (逐個 apply,共 19 個)
04:14:28.37  Applying migration `20260804032725_w43_gate2_sn_user_sync`
04:14:28.40  The following migration(s) have been applied:
04:14:28.42  [entrypoint] seeding (idempotent upserts)
04:14:30.91  Seeded local admin (admin@uop.local).
04:14:30.91  Seeded 24 OpCos + admin + RHK OPCO_IT user.
04:14:30.93  [entrypoint] starting api (node dist/main)
04:14:31.74  [NestFactory] Starting Nest application...
04:14:31.96  [NestApplication] Nest application successfully started
```

🟢 **零 `WARN: migrate deploy failed` · 零 `WARN: seed failed` · 零 Error。**

| # | 項 | 狀態 | 依據 |
|---|---|---|---|
| 1 | **B3 — ACA 連到 private endpoint 嘅 PG** | 🟢 **已證** | migration 真跑咗 19 個 —— 冇連接根本做唔到 |
| 2 | **PG v18 migration**(G8,第一次踩 v18) | 🟢 **已證** | **19 個全部 applied**,零 error |
| 3 | **seed** | 🟢 **已證** | 原文 **`Seeded 24 OpCos + admin + RHK OPCO_IT user.`** —— 精確 24 個 |

> **順帶記低一個無害 warn**(將來要處理):`The configuration property package.json#prisma is deprecated and will be removed in Prisma 7`。而家唔影響,但 Prisma 7 升級嗰陣要轉 `prisma.config.ts`。

### metrics 推論事後對照 —— **啱晒,但強度標對咗先係重點**

之前(冇 log 嗰陣)靠 `storage_used` +944 KB 推斷「連得到 + 寫咗嘢」,並**刻意**把 seed 標做 🟡(「證到有寫入,證唔到 24 個齊」)。log 出嚟之後三項全中,而 seed 嗰個 🟡 **正正係應該嘅強度** —— 當時真係分唔開 schema 同 data。**推論啱唔啱係一回事,標啱信心強度係另一回事**,後者先係可以複製嘅做法。

🔴 **仍未驗**:HTTP 層(前端 render / `/docs/api` 200 / break-glass login)—— 見下面 B8。

### 下一步(三個都做得到,唔互相排斥)

| # | 做法 | 攞到咩 |
|---|---|---|
| ① | **infra 畀 SP `Microsoft.App/managedEnvironments/read`**(純唯讀,比 `join/action` 細得多) | 解封 `logs show` + `exec` ⇒ 直接見到 migrate / seed 真結果 |
| ② | **Chris 用自己帳號喺 Azure Portal 睇 container log** | 同上,唔使等 infra(前提:個人帳號有 env read) |
| ③ | **由企業網絡內嘅機 curl** `https://rapo-uop-web-dev.rci-t.com/` + `/api/docs/api` | 真 smoke;順帶驗 custom domain + nginx proxy |

## References

- `docs/adr/0027-azure-dev-deployment-topology.md`(**Proposed**,D1 待拍板)
- `docs/adr/0012-azure-uat-deployment-topology.md`(UAT 拓撲,本環境擴充佢)
- `docs/13-deployment/04-deploy-runbook.md`(as-built 部署路徑;§0 環境規律)
- `docs/13-deployment/07-uat-as-built.md`(UAT 對照)
- `docs/01-planning/W44-azure-dev-deploy/`(plan / checklist / progress)
