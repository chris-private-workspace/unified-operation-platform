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

**未部署,尚未適用。** 計劃沿用 ADR-0012 D2:Entra SSO 為主 + seeded 本地 admin 做 break-glass(dual-provider,ADR-0005)。DEV 嘅 Entra app registration **未有** —— 同 UAT 一樣,先用 break-glass 起,SSO 後補(AUTH-2b 仍卡 IT app registration)。

## 部署記錄

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

⚠️ **一個仍未排除嘅可能**:custom domain 喺**真正嘅企業 DNS** 到底建咗未,我哋喺呢度驗唔到。
一個支持性(**唔係證明**)論據:ACA 綁 custom domain 需要 hostname 驗證,而 binding 連 SNI cert 都存在 ⇒ **綁嗰陣** DNS 應該係配好嘅。

**⇒ 由公司電腦跑兩條 `nslookup` 就一次過分診**:

| 結果 | 意思 |
|---|---|
| 兩個都解析到 | DNS 齊 ⇒ 直接 curl,F6-4/5/6 一次過收 |
| n8n 解析到、我哋嘅解析唔到 | 🔴 **infra 漏咗建我哋條記錄**,要補 |
| 兩個都解析唔到 | 連公司電腦都唔喺對嘅網絡 ⇒ 要問返 infra「邊度打得到 n8n」 |

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

### 三個未知數嘅最新狀態(**要分開講強度**)

| # | 項 | 狀態 | 依據 |
|---|---|---|---|
| 1 | **B3 — ACA 連唔連到 private endpoint 嘅 PG** | 🟢 **實質已證** | 冇連接就**唔可能**有 storage 寫入。呢個係本環境存在嘅意義,而佢通咗 |
| 2 | **PG v18 migration**(G8,第一次踩 v18) | 🟢 **強證據** | storage 跳升 = 建表;若 migration fail,entrypoint 會 `WARN` 然後照起,**唔會有寫入** |
| 3 | **seed**(24 OpCo + admin + catalog SKU) | 🟡 **有證據但分唔開** | 944 KB 入面 schema 同 data **拆唔開**;證到「有寫入」,證唔到「24 個 OpCo 齊」 |

🔴 **仍然要一次直接驗證先收得尾** —— metrics 證到「連得到 + 寫咗嘢」,證唔到 **row count / admin 帳號存在 / API 起得到 200**。⇒ 下面三條路仍然要行一條。

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
