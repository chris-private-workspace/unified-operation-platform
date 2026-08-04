---
phase: W44-azure-dev-deploy
name: "Azure DEV 環境部署(n8n UAT 可達)"
sprint_week: W44
start_date: 2026-08-04
end_date: 2026-08-08          # planned, may slip with changelog log
status: active                # draft | active | closed
spec_refs:
  - docs/13-deployment/04-deploy-runbook.md
  - docs/13-deployment/01-topology.md
  - docs/13-deployment/07-uat-as-built.md
prior_phase: W43-onboarding-license-request
---

# Phase W44 — Azure DEV 環境部署(n8n UAT 可達)

> **Plan version**:1.0(initial)
> **Owner**:Chris Lai
> **Approved by**:**Chris Lai(2026-08-04)** —— 同批 Accept **ADR-0027 Option A**(api ingress 收返 internal)

## 1. Scope

Infra team 交付咗一個**新嘅 Azure DEV 環境**(`RG-RAPO-UOP-DEV`),目的係令 UOP **同 n8n UAT 環境接得通** —— 呢個正正解封 W36/W39/W40/W42 一路 carry 落嚟嗰個「n8n 側從未真接通,所有 seam 零 live 驗證」嘅缺口。本 phase 要把 UOP(`apps/api` + `apps/web`)部署上呢個環境並驗到端到端。

### 🔴 2026-08-04 Chris 更正 —— 之前嗰個「UAT」唔係 UAT

**W32/W33 部署嗰個環境唔係企業 UAT,只係一個測試用嘅 Azure 環境** —— 自建 RG(`RG-RCITest-RAPO-N8N`)+ 自建 ACR + 自建 ACA env(**冇 VNet 整合**)+ PG public `0.0.0.0`,住喺 Azure 公網上,**同企業網絡冇任何連繫**。

⇒ **佢同 n8n 兩個方向都接唔通**:inbound 冇企業 domain 入口;**outbound 打唔入企業內網**(n8n 住喺 on-prem / 內部 VM,Chris 2026-08-04 確認)。**呢個就係 W36/W39/W40/W42 嗰句「n8n 側從未真接通」嘅根本原因 —— 唔係漏做,係環境上做唔到。**

命名更正處理:**保留舊檔名 / ADR 標題**,靠 blockquote 更正(改名會令 git history 永久對唔上,W36 教訓)。已加註 `07-uat-as-built.md` + ADR-0012 頂部。

### 本 phase 唔係「照跑一次 runbook」

實測(2026-08-04,SP 真登入)顯示新環境同舊環境有**六處差異**,其中三處係 blocker(見 §4)。而呢六處**唔係六件獨立嘅事**,係「**自建孤島 → 企業託管**」同一個轉變嘅表現 —— 理解咗呢點,B1 就由「registry 唔知去咗邊」變成「registry 係**企業中央**嗰個,只有一個 RG scope 嘅 SP 梗係睇唔到」。

最要緊嘅兩處:
1. **API ingress 由 internal 變 external** —— 安全邊界改變,必須先出 ADR 由 Chris 拍板(F0),**未 Accept 之前唔落任何部署 code**。
2. 🔴 **B3(ACA env VNet 整合)由「部署細節」升格成「本環境成敗嘅關鍵」** —— outbound 半邊(ADR-0017 三個接縫)完全繫於佢。**ADR-0027 D1 揀 A 定 B 都改變唔到呢件事**(ingress 係 inbound 概念)。

## 2. Deliverables

### F0 — ADR:DEV 環境部署拓撲(api external ingress)

- **Spec ref**:`docs/13-deployment/01-topology.md` · CLAUDE.md §5.1 H1 / §5.4 H4
- **Dependencies**:Chris 拍板
- **Acceptance criteria**:
  - ADR draft 寫低「api 由 internal 改 external」嘅**理由**(n8n UAT 要打得到 intake endpoint)、**代價**(api 直接暴露到互聯網,唯一防線 = `IntakeKeyGuard` + JWT guard)、**已考慮嘅替代**(IP restriction / 只開 intake path / 保持 internal 用 web 做 relay)
  - 明寫 **cookie 邊界不變**:web 仍行自己 nginx proxy `/api` 落 api,browser 側維持同源,`SameSite=Strict` httpOnly cookie(AUTH-4c-B)唔受影響
  - Status 由 Chris 改 `Accepted` 之後,F2 先可以開始
- **Effort estimate**:2h
- **Owner**:AI 起草 / Chris 拍板

### F1 — 環境 discovery + 差異登記(已完成大半)

- **Spec ref**:`docs/13-deployment/07-uat-as-built.md`
- **Dependencies**:無
- **Acceptance criteria**:
  - `docs/13-deployment/09-dev-as-built.md` 記低所有實測到嘅資源座標(見 §附錄 A)
  - 逐條列出 **DEV vs UAT 六處差異** + 每處對部署路徑嘅影響
  - 三個 blocker(B1/B2/B3)+ 一個待實測項(B4)寫成可以直接交畀 infra team 嘅問題清單
- **Effort estimate**:3h
- **Owner**:AI

### F2 — DEV 專用 ARM template

- **Spec ref**:`deploy/azure/aca.json`(UAT 版,**不改**)
- **Dependencies**:**F0 Accepted**
- **Acceptance criteria**:
  - 新檔 `deploy/azure/aca-dev.json`,**只 update 兩個既有 container app**,唔建 ACA env(現有 `aca.json` 會建 env —— 喺 DEV 建新 env 會令佢唔喺 hub VNet,一定連唔到 private PG)
  - `managedEnvironmentId` 指向既有 `acaen-rapo-dev`(cross-RG 引用)
  - **保住 web 個 custom domain 綁定**(`rapo-uop-web-dev.rci-t.com` + SNI cert)—— ARM 係宣告式,漏寫會刪走
  - api ingress 按 F0 拍板結果設定;`RUN_MIGRATIONS_ON_START` / `RUN_SEED_ON_START` 沿用 UAT(operator 連唔到 private DB,只能 self-migrate)
  - `az deployment group validate` 過
- **Effort estimate**:6h
- **Owner**:AI

### F3 — params 檔 + secret 策略

- **Spec ref**:`04-deploy-runbook.md` §4
- **Dependencies**:**B2 解封**(PG database 名 + credential)
- **Acceptance criteria**:
  - `deploy/azure/aca.params.dev.json`(**gitignored**,沿用 `deploy/azure/*.params.*.json` 規則)
  - Key Vault **確認用唔到**(實測 data-plane 被 SSL-MITM 擋,同 UAT)⇒ 照用 ACA native secureString
  - `databaseUrl` 用 B2 答案砌;`sslmode=require`
  - `appBaseUrl` = **`https://rapo-uop-web-dev.rci-t.com`**(注意 infra 畀嘅 `.env` 寫 `http://`,但 custom domain 已綁 SNI 證書 ⇒ 實際係 https)
  - `git check-ignore` 證實 params 檔唔會入 git
- **Effort estimate**:2h
- **Owner**:AI

### F4 — web 建構調整 —— ✅ **零改動(ADR-0027 Option A 之後,本 deliverable 消失)**

- **Spec ref**:`apps/web/nginx.conf.template` · `04-deploy-runbook.md` §8.2
- **Dependencies**:F0(**已 Accept = Option A**)
- **原本 acceptance**(前提已冇):「nginx `/api` upstream 由 http+internal 改成 **https+external**」—— 呢條寫嘅時候 assume 咗 api 會保持 external。
- **實際結果**:Option A 令 DEV 嘅 upstream 形狀**同 UAT 一模一樣**(`http://` + **internal** FQDN + `Host $proxy_host` + api `allowInsecure:true`)⇒ **`nginx.conf.template` 一個字都唔使改**,`API_UPSTREAM` 本來就係 env 渲染。
- **保留驗證**:
  - [x] 邏輯核對 —— `aca-dev.json` 出嘅 `API_UPSTREAM` = `http://` + api internal fqdn,配 nginx `proxy_pass ${API_UPSTREAM}/` + `proxy_set_header Host $proxy_host`,同 UAT as-built 逐項對得上
  - 🚧 實際渲染出嚟嘅 `nginx.conf` 逐行睇 —— **卡 B1**(起唔到 web container:`docker pull` base image 撞 Docker Hub 503)⇒ 移去 **F6** 部署後驗
- **Effort estimate**:3h → **實際 ~0.25h**
- **Owner**:AI

### F5 — image build + push

- **Spec ref**:`03-build-images.md`
- **Dependencies**:🔴 **B1 解封**(冇 registry 就做唔到)
- **Acceptance criteria**:
  - `az acr build` 兩個 image(tag `dev-<short-sha>`)
  - `az acr task list-runs` 證 `Succeeded`(CLI 會 charmap crash,唔可以信 exit code)
  - container app `registries` + credential 配好,`imagePullSecrets` 通
- **Effort estimate**:3h
- **Owner**:AI

### F6 — 部署 + smoke test

- **Spec ref**:`04-deploy-runbook.md` §5 §7
- **Dependencies**:F2 + F3 + F5;🔴 **B3 未知**(ACA env 連唔連到 private PG/Redis)
- **Acceptance criteria**:
  - `az deployment group create` → `provisioningState = Succeeded`
  - revision **Running / Healthy**(runbook §8:`az acr build` Succeeded **唔證明**容器起得身)
  - 逐層 smoke:`GET /` 200 · `GET /api/docs/api` 200 · break-glass login 200
  - **PG v18 相容性實證** —— migration 真跑得過(UAT 係 v16,呢個 phase 第一次踩 v18)
  - seed 完成(24 OpCo + admin + catalog SKU)
- **Effort estimate**:4h
- **Owner**:AI

### F7 — n8n UAT 接線驗證

- **Spec ref**:`docs/13-deployment/08-n8n-integration-go-live.md` · `N8N-INTEGRATION-SETUP`
- **Dependencies**:F6
- **Acceptance criteria**:
  - **兩個方向都要驗,唔可以只驗 inbound**:
    - **inbound** — n8n UAT 打得到 `POST /requests/intake`(flat mode contract,W43 F1)—— **真 201 + DB 真 row**
    - 🔴 **outbound** — UOP container **打得入企業內網嘅 n8n**(ADR-0017 三個接縫嘅另一半)。呢個先係舊環境做唔到嗰樣;若 B3 唔通,呢項一定紅,而且**紅得靜**(provider 會 fail 但唔會令 app 起唔到身)
  - W42 retro 列低嗰 **五個 n8n 側缺口**逐個對(URL `/api` 前綴 · `X-Intake-Key` 冇送 · `resolveOpco` 只認 RHK/RAPO · `requestId` 用 REQ number 唔係 sysId · 2003 sticky skip 已持有 E5)
  - 未通嘅逐項標明係 **n8n 側要改** 定 **平台側要改**,唔可以含糊
- **Effort estimate**:6h
- **Owner**:AI + Chris(n8n UI 側)

### F8 — doc sync + closeout

- **Spec ref**:CLAUDE.md §14 · PROCESS.md §2.3
- **Dependencies**:F6
- **Acceptance criteria**:
  - `09-dev-as-built.md` 補實際部署結果 · `01-topology.md` 加 DEV 欄 · `04-deploy-runbook.md` 加 DEV 分支說明
  - CLAUDE.md §0/§9 + `SESSION_SUMMARY.md` 更新(§14 明文要求每個 closeout 掃一次)
  - `BACKLOG.md` 同步(R7);`RISK_REGISTER.md` 加本 phase 揭到嘅 risk
  - retro 寫低
- **Effort estimate**:3h
- **Owner**:AI

## 3. Success Criteria(Phase Gate)

| # | Criterion | Target | Measure | Block closeout? |
|---|---|---|---|---|
| G1 | ADR(api external ingress)Accepted | Status=Accepted | `docs/adr/` | **Yes** |
| G2 | DEV as-built doc 齊 | 所有資源座標 + 六處差異 | `09-dev-as-built.md` | Yes |
| G3 | ARM template validate 過 | `Succeeded` | `az deployment group validate` | Yes |
| G4 | params 檔唔入 git | ignored | `git check-ignore -v` | **Yes**(H4) |
| G5 | 兩個 image build 成功 | `Succeeded` | `az acr task list-runs` | Yes |
| G6 | 兩個 revision Running/Healthy | 都 healthy | `az rest` replica 狀態 | **Yes** |
| G7 | Smoke 三層真 200 | 200/200/200 | curl(貼真 output) | **Yes** |
| G8 | PG v18 migration 真跑得過 | 無 error | container 啟動 log / DB 表存在 | **Yes** |
| G9 | n8n UAT → intake 真 201 + DB row | 1 真 row | curl + DB 查 | Yes |
| G10 | Web custom domain https 通 | 200 | `https://rapo-uop-web-dev.rci-t.com/` | Yes |

> **G6/G7 唔可以用 G5 代替** —— BUG-008 實證:626 test 綠 + build 成功 + lint 零 output + `az acr build` Succeeded,**四道 gate 全部攔唔到**容器起唔到身。

## 4. Risks(Phase-Specific)

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| **B1** | 🔴 **仍未解(2026-08-04 深化)** —— registry 知道咗係 **`acrrci3ailanding1.azurecr.io`**(cross-tenant SP `4a6e1474-…` 有 AcrPush),但**兩條 build 路實測都斷**:①`az acr build` —— SP 對該 registry **冇 management plane 存取**(`could not be found in subscription`;佢喺我哋 sub 只有 `Reader`)⇒ 開唔到 task run ②本地 `docker build`+push —— Docker Hub CDN **503**(pull 唔到 `node:20-slim`)**兼** ACR firewall **`DENIED: client with IP '165.85.7.2' is not allowed access`** | **確定** | **致命** —— 冇 image 就乜都部署唔到 | **二選一**(2026-08-04 由三個收窄):①🥇 SP 攞 `Contributor` + firewall 放行 `165.85.7.2` ⇒ 行 `az acr build`,base image **Azure 側 pull** ②infra 代 build + push。<br>🔴 **原本嗰個「只放行 firewall」已剔走** —— 放行咗我哋 push 得,但**仍然 build 唔到**(Docker Hub 503),留住只會令人揀一條死路。<br>✅ **pull 側擔心已撤銷**:infra 確認 ACR 有 private DNS + endpoint ⇒ ACA 唔行 public egress,150+ outbound IP 唔關事 |
| **B2** | 🟢 **已解封(2026-08-04)** —— infra 答咗 `rapoaiuopdev` 係 **DB admin**;而 database **我哋自己建咗** `platform`(`az postgres flexible-server db create`,management plane,唔需要連到 PG data-plane)。🔴 呢條原本被我錯判成 blocker,理由係「連唔到 PG 所以建唔到」—— **把「連唔到 data-plane」同「做唔到嗰件事」混埋** | — | — | 完成。`databaseUrl` = `postgresql://rapoaiuopdev:<pw>@pgsql-rapo-uop-dev.postgres.database.azure.com:5432/platform?sslmode=require` |
| **B3** | 🟢 **兩半邊都有答案(2026-08-04)** —— DB/Redis:`acaen-rapo-dev` **已整合 `vNet-RCITest-HKG`**,DNS 解析得到 web / api / PG / Redis。n8n:第二輪答 **`http://rapo-n8n-uat.rci-t.com/`** | 低 | 高(若實測唔通) | ⚠️ **「有 URL」≠「container 到得到」** —— 呢個係本環境存在嘅意義,**唔可以當佢已驗**。留 **F7-9/10/11** 由 container 側真打一次。同時登 **B6**(個 URL 係 http) |
| **B4** | 🟢 **infra 已答**(「used contributor to replace」)—— 用 contributor 處理 `managedEnvironments/join/action` | 低 | 中 | **未實測**;部署時若 403 再追 |
| ~~B5~~ | 🟢 **已消除(2026-08-04)** —— infra 第二輪回「**https:**」⇒ 用 https。`aca.params.dev.json` 個 `appBaseUrl` 本來就填咗 `https://…` ⇒ **零改動** | — | — | 完成 |
| **B6** | 🆕 🔴 **n8n base URL 係 `http://rapo-n8n-uat.rci-t.com/`(明文)** —— 將來接 outbound 嗰陣,`N8N_OUTBOUND_WEBHOOK_KEY` 會**明文過線**。內網 http 喺企業環境常見,但呢個係一個要**明確接受**嘅取捨,唔應該靜靜咁行(H4 相關) | 確定(若接 n8n outbound) | 中 | 接 n8n outbound 之前同 Chris 確認;或者問 infra 有冇 https endpoint。**本 phase 唔接 n8n**(F3-6 同一原則),所以唔阻部署 |
| R5 | **PG v18**(UAT 係 v16)—— Prisma migration 未喺 v18 跑過 | 中 | 中 | F6 G8 明確驗;失敗即回報,唔靜靜兜 |
| R6 | ARM 宣告式覆蓋會**刪走 infra team 已配好嘅嘢**(尤其 web custom domain + SNI cert binding) | 中 | 高 | F2 明確保留;部署前先 `az resource show` 存底,部署後逐項對返 |
| R7 | api external ingress = **平台第一次把 API 直接暴露到互聯網** | 確定(若 F0 通過) | 高 | F0 ADR 明寫代價;`IntakeKeyGuard` fail-closed 已有;考慮 IP restriction |
| R8 | Redis 首次出現喺環境,但 `apps/api/src` **實測零 BullMQ/Redis 用法** | 低 | 低 | 本 phase **唔接** Redis;寫入 as-built 留待將來 |

## 5. Day-by-Day Breakdown(rough)

| Day | Date | Focus | Deliverables targeted |
|---|---|---|---|
| D0 | 2026-08-04 | Kickoff + discovery | F1(大半已做) |
| D1 | 2026-08-04 | ADR draft + as-built doc | F0 draft, F1 |
| D2 | 2026-08-05 | template + params(等 B1/B2 期間可做嘅嘢) | F2, F3, F4 |
| D3 | — | build + deploy(**卡 B1**) | F5, F6 |
| D4 | — | n8n 接線 | F7 |
| D5 | — | doc sync + closeout | F8 |

> D3 起**冇日期** —— 因為 B1/B2 幾時解封唔喺我哋手。唔預填日期好過填一個一定會 slip 嘅日期。

## 6. Dependencies on Prior Phase

Carry-over from `W43-onboarding-license-request/progress.md` retro:
- **W43 未部署上 UAT**(running image 仍 `uat-a71bbdf`)—— 本 phase 部署嘅係 DEV,**UAT 仍然停留喺 W42 之前**,兩個環境會 diverge,as-built 要寫清楚
- **F6-3/F6-4/G8 live close 未驗**(Chris 叫停;fixture REQ0044072 ready)—— 同本 phase 冇直接依賴,但 DEV 通咗之後多咗一個安全嘅驗證場
- **F5-3/G9 前端 light+dark 未 render 驗** —— DEV 部署後有真 URL,可以喺呢度補
- **G10 UAT 實搜 OpenAPI** —— 原本卡「W43 未上 UAT」,DEV 通咗之後可以喺 DEV 做

## 7. Plan Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-08-04 | Initial plan | — | Chris Lai |
| 2026-08-04 | **v1.2 — F0 Accepted(Option A)⇒ F4 deliverable 消失;B2 自解** | ①Chris Accept **ADR-0027 D1 = Option A**(api 收返 internal)⇒ DEV upstream 形狀**同 UAT 一模一樣**,原本 F4「nginx 改 https+external」嘅**前提冇咗**,`nginx.conf.template` 零改動(3h → 0.25h)。呢個係 Option A 一個落 plan 時冇預見嘅好處。②**B2 由 blocker 變自解** —— 原判斷「PG private 連唔到所以建唔到 database」錯,建 database 係 management plane 操作;已自建 `platform`,Q2 由 infra 問題清單拎走。③新增 **B5**(web portal scheme 對唔上)| Chris Lai |
| 2026-08-04 | **v1.1 — 「UAT」正名 + B3 升級 + F7 加 outbound 半邊** | Chris 更正:之前部署嗰個唔係真 UAT,只係自建測試環境(冇 VNet)⇒ 同 n8n **兩個方向都接唔通**,而呢個就係 W36–W42 嗰句「n8n 側零 live 驗證」嘅根本原因。連帶三項:①六處差異塌縮成「自建孤島 → 企業託管」一個轉變(B1 隨之由「registry 唔知去咗邊」變「企業中央 registry 座標同權限」)②**B3 由部署細節升格成本環境成敗關鍵**(outbound 繫於 ACA env VNet 整合,而 **ADR-0027 D1 揀 A 定 B 都改變唔到**)③F7 acceptance 補 outbound —— 原本只寫 inbound,會令「接通」驗一半當全部 | Chris Lai |

---

## 附錄 A — DEV 環境實測座標(2026-08-04,SP 真登入)

| 項 | 值 |
|---|---|
| Subscription | `30dac177-…`(**rcitest** — 同 UAT 同一個) |
| Tenant | `4f63aaa0-…` |
| SP | `d2f094a3-…` · **Contributor,只限 `RG-RAPO-UOP-DEV`** |
| Resource group | `RG-RAPO-UOP-DEV`(eastasia) |
| ACA env | `RG-RAPO-ContainerAPP-DEV/acaen-rapo-dev` — **共用,SP 無 read 權** |
| API app | `aca-rapo-uop-api-dev` · **external** · port 80 · `allowInsecure=false` · 現跑 `mcr.microsoft.com/k8se/quickstart:latest`(空殼) |
| Web app | `aca-rapo-uop-web-dev` · external · port 80 · custom domain **`rapo-uop-web-dev.rci-t.com`** + SNI cert(`acaen-rapo-dev/certificates/rcit`) · 同樣空殼 |
| PostgreSQL | `pgsql-rapo-uop-dev.postgres.database.azure.com` · **v18** · admin `rcitadmin` · `Standard_B1ms` · **public access Disabled** |
| Redis | `redis-rapo-uop-dev.redis.cache.windows.net` · 6380 TLS-only · Basic C0 · **public access Disabled** |
| Private Endpoint | `pe-pgsql-…` / `pe-redis-…` → `RG-RCITest-HKG-Infra/vNet-RCITest-HKG/Subnet-RCITest-D-DB` · **`dnsZoneGroup` = null** |
| Key Vault | `kv-rapo-uop-dev`(RBAC)· **data-plane 被 SSL-MITM 擋**(同 UAT,用唔到) |
| App Insights | `appi-rapo-uop-dev` · connection string 攞到 |
| Container Registry | 🔴 **RG 內冇,sub-level list 返空** |

## 附錄 B — DEV vs 舊測試環境 六處差異

> **全部係「自建孤島 → 企業託管」同一個轉變嘅表現**,唔係六件獨立嘅事。

| # | 差異 | 舊測試環境 | DEV | 影響 |
|---|---|---|---|---|
| 1 | API ingress | **internal**(web 做單一 origin) | **external** | **F0 ADR** — 安全邊界改變 |
| 2 | ACA env | 自己建(`aca.json` 內)**冇 VNet** | **共用既有**,喺另一個 RG,SP 無 read 權 | **F2** — 要新 template;**B3** — outbound 命脈 |
| 3 | DB 網絡 | public `0.0.0.0`(allow Azure services) | **Private Endpoint,public disabled** | **B3** — 連通性未確認 |
| 4 | PG 版本 | 16 | **18** | **G8** — Prisma 未驗過 |
| 5 | Registry | 自建 ACR(RG 內) | **冇 —— 應該係企業中央嗰個** | **B1** — blocker |
| 6 | 額外資源 | — | **Redis + App Insights + custom domain/SNI cert** | R8(Redis 唔接)· F3(appBaseUrl 用 https custom domain)· **custom domain = n8n inbound 嘅入口** |

## 附錄 C — 交畀 infra team 嘅問題

### 第一輪(2026-08-04 已答)

| # | 問題 | 回覆 | 狀態 |
|---|---|---|---|
| 1 | 用邊個 ACR + 憑證 | `acrrci3ailanding1.azurecr.io`;cross-tenant SP `4a6e1474-…` 有 **AcrPush**;`d2f094a3-…` = RG contributor | 🔴 **答咗但用唔到** → Q1 |
| 2 | PG credential / database | `rapoaiuopdev` 係 **DB admin**,對 server 內所有 DB 有權 | 🟡 **database 名未答** → Q2 |
| 3 | ACA env VNet 整合 | **已整合 `vNet-RCITest-HKG`**,DNS 解析得到 web / api / PG / Redis(landing zone design) | 🟢 ✅ **但冇提 n8n** → Q3 |
| 4 | `managedEnvironments/join/action` | 「used contributor to replace」 | 🟢 ✅(未實測) |

### 🔴 第二輪(三條,全部 blocking)

**Q1 — image 推唔上去,兩條路都斷,要你哋揀一個解法。**
> 實測結果:①**`az acr build` 做唔到** —— SP `4a6e1474-…` 對 `acrrci3ailanding1` **冇 management plane 存取**(`az acr show` → `could not be found in subscription`;`az role assignment list` 顯示佢喺 `30dac177-…` 只有 `Reader`),開唔到 ACR task run。②**本地 `docker build` + push 亦唔得** —— `docker pull node:20-slim` 撞 Docker Hub CDN **503**(公司 proxy),而 `docker login acrrci3ailanding1.azurecr.io` 返 **`DENIED: client with IP '165.85.7.2' is not allowed access`**(ACR firewall)。
>
> **三個解法揀一個**:
> 1. 🥇 **畀 SP `Contributor` 落 `acrrci3ailanding1` + firewall 放行 `165.85.7.2`** —— 注意 **`AcrPush` 唔包 `Microsoft.ContainerRegistry/registries/scheduleRun/action`**,所以淨係 AcrPush 開唔到 build task。呢條路最乾淨:base image 喺 **Azure 側** pull,完全繞開公司 proxy。
> 2. **只放行 firewall** —— 咁 push 得,但本地 `docker build` 仍然要 `node:20-slim` / `nginx:1.27-alpine`。除非 registry 內已有 mirror(我哋可改 Dockerfile 指去 `acrrci3ailanding1.azurecr.io/node:20-slim`),否則仍斷。
> 3. **你哋代 build + push** —— 由 repo build 兩個 image 推上去。最少改權限,但每次部署都要人手。
>
> 另外:`aca-rapo-uop-api-dev` / `-web-dev` 個 `registries` 而家係空,**pull 側都要配 credential**,而 ACR 喺 VNet 內嘅可達性未確認。

**~~Q2 — UOP 用嘅 database~~ 🟢 已自己解決(2026-08-04),唔使問 infra**
> 🔴 **原本呢條問題係基於我一個錯誤斷言** —— 我寫「PG 係 private-only,我哋連唔到,自己建唔到」,把「**連唔到 data-plane**」同「**做唔到嗰件事**」混埋咗。Azure PG 建 database 有 **management plane 路徑**(`az postgres flexible-server db create`,ARM 操作),完全唔需要網絡連得到 PG,而我哋個 SP `d2f094a3-…` 係 `RG-RAPO-UOP-DEV` **Contributor** ⇒ 做得到。UAT runbook §2 本來就係咁建 `platform` 嘅。
> **實測**:`db list` 顯示 server 上只有三個系統 database(`azure_maintenance` / `postgres` / `azure_sys`)⇒ UOP 嗰個確實未建。跟住 `db create -d platform` 成功,再 `db list` 覆核見到 **`platform`**。
> ⇒ **B2 完全解封**,`databaseUrl` = `postgresql://rapoaiuopdev:<pw>@pgsql-rapo-uop-dev.postgres.database.azure.com:5432/platform?sslmode=require`。

**~~Q3 — container app 打唔打得入企業內網嘅 n8n?~~ 🟢 已答(2026-08-04 第二輪)**
> infra:「N8N also can access by **`http://rapo-n8n-uat.rci-t.com/`**」⇒ **n8n base URL 有咗**。
> ⚠️ **仍要實測**:「有 URL」唔等於「container 到得到」—— 呢個係本環境存在嘅意義,留 **F7-9/10/11** 由 container 側真打一次。
> 🔴 **順帶一個安全點**:個 URL 係 **`http://`**。將來接 n8n outbound 嗰陣,`N8N_OUTBOUND_WEBHOOK_KEY` 會**明文過線**。內網 http 喺企業環境常見,但呢個要 Chris 知同埋接受(H4 相關),已登做 **B6**。

**~~Q4~~ 🟢 已答(2026-08-04 第二輪)** — infra 回「**https:**」⇒ 用 **https**。`aca.params.dev.json` 個 `appBaseUrl` 本來就填咗 `https://rapo-uop-web-dev.rci-t.com` ⇒ **零改動**,B5 消除。

### 🔴 第三輪(只剩 ACR 一條 —— 回應 infra 問「what is the deployment detail error?」)

infra 第二輪回:「We have private dns and endpoint for the ACR, so it will not use public egress IP」。

**佢哋講得啱,而且我嗰個擔心係多餘嘅** —— 若 ACA 經 private endpoint 到 registry,咁 **pull 側根本唔行 public egress**,150+ outbound IP 唔關事。**B1 個 pull 半邊 ✅ 撤銷。**

⇒ 但**我哋個問題由頭到尾喺 push 側**:我哋喺**公司網** build / push,**唔喺 VNet 入面**,所以一定行 public egress。兩個 error 要分開講,因為**一個係權限一個係網絡**:

```
(a) az acr build  —— 權限,唔關網絡事
    az acr show -n acrrci3ailanding1
    ERROR: The resource with name 'acrrci3ailanding1' and type
    'Microsoft.ContainerRegistry/registries' could not be found in
    subscription 'Microsoft Azure (rcitest): #1023861 (30dac177-…)'.

    az role assignment list --assignee 4a6e1474-… --all
    [ { "role": "Reader", "scope": ".../resourceGroups/RG-RAPO-UOP-DEV" } ]

(b) docker push  —— 網絡
    docker login acrrci3ailanding1.azurecr.io
    Error response from daemon: Get "https://acrrci3ailanding1.azurecr.io/v2/":
    denied: client with IP '165.85.7.2' is not allowed access.
    CorrelationId: 9c671932-bc21-4b1b-bcae-4a0baf3a2caf
```

🔴 **順帶把三個解法收窄到兩個** —— 原本第 2 個(「只放行 firewall」)**其實唔可行**:放行咗我哋 push 得,但**仍然 build 唔到 image**,因為本地 `docker build` 要 pull `node:20-slim` / `nginx:1.27-alpine`,而 Docker Hub CDN 經公司 proxy **503**。⇒ 真正可行嘅只有:
1. **SP 攞 `Contributor` + firewall 放行 `165.85.7.2`** ⇒ 行 `az acr build`,**base image 喺 Azure 側 pull**,一次過繞開 proxy
2. **infra 代 build + push**

---

### 📤 精簡版 ①(2026-08-04 第一輪,已發 —— 保留做記錄)

> **點解要兩個版本**:上面詳版係**我哋自己嘅工作記錄**(含實測指令、Prisma / ACA / proxy 內部細節、被否決嘅選項)。infra team 唔需要嗰啲 —— 佢哋需要嘅係「**壞咗乜 + 要你做乜**」。刪走內部細節唔係簡化,係**移走會分散注意嘅嘢**。
> ⚠️ 尤其 **Q1 兩道牆要分開列** —— 放行 IP 而唔畀 Contributor 係**解決唔到**嘅,唔分開寫佢哋好易只做一半。

```
Hi team,

Thanks — 3 of the 4 are sorted, and we've handled the database
ourselves. Two things still block us:


1. We can't push images to acrrci3ailanding1

Two separate walls:
  - SP 4a6e1474-... has no access to the registry resource
    (only "Reader" in our subscription) -> az acr build can't run.
    Note: AcrPush alone is not enough for ACR Tasks.
  - Our egress IP 165.85.7.2 is blocked by the ACR firewall
    -> docker push fails too.

  Simplest fix: give that SP Contributor on acrrci3ailanding1
  AND allow-list 165.85.7.2.
  (Alternative: your team builds + pushes the two images for us.)

  Please also cover the PULL side: the container apps have no
  registry credentials set yet, and the web app alone reports
  150+ outbound IPs (Consumption profile) - so IP allow-listing
  won't make ACA able to pull the image. Please confirm the
  container apps can reach acrrci3ailanding1 as well.


2. Can the container apps reach n8n?

  The four DNS targets you listed are all UOP's own resources -
  none of them is n8n. This environment exists to integrate with
  n8n, and traffic goes BOTH ways (n8n calls us, we also call n8n).

  Please confirm outbound access to n8n, and give us the n8n
  base URL to use.


3. Minor: you listed the web portal as http:// but the custom
   domain has an SSL certificate bound. Should we use https://?

Thanks!
```

### 📤 精簡版 ②(2026-08-04 第二輪 —— 回應 infra 問「what is the deployment detail error?」)

> **只剩 ACR 一條。** 兩個關鍵訊息:①**佢哋問嘅 pull 側,佢哋講得啱** —— 要先承認,唔好含糊帶過,否則佢哋會以為我哋冇睇佢答案 ②**收窄到兩個選項** —— 原本「只放行 firewall」睇落係一個中間路線,但**放行咗我哋一樣 build 唔到 image**(Docker Hub 503),留住佢只會令人揀一個死路。

```
Hi team,

Thanks — https for the portal, and noted on the n8n URL.

On the ACR: you're right that pull won't use the public egress IP
if ACA reaches the registry over the private endpoint — so please
ignore my earlier note about the 150+ outbound IPs.

Our problem is the PUSH side. We build and push from the corporate
network, not from inside the VNet, so we do go out over the public
IP. Two separate errors — one permission, one network:

(a) az acr build — permission, not network:

    az acr show -n acrrci3ailanding1
    ERROR: The resource with name 'acrrci3ailanding1' and type
    'Microsoft.ContainerRegistry/registries' could not be found in
    subscription 'Microsoft Azure (rcitest): #1023861
    (30dac177-6dcb-412e-94f6-da9308fd1d09)'.

    az role assignment list --assignee 4a6e1474-... --all
    [ { "role": "Reader",
        "scope": ".../resourceGroups/RG-RAPO-UOP-DEV" } ]

    The SP cannot see the registry resource at all, so ACR Tasks
    cannot be scheduled. AcrPush is a data-plane role and does not
    include Microsoft.ContainerRegistry/registries/scheduleRun/action.

(b) docker push — network:

    docker login acrrci3ailanding1.azurecr.io
    Error response from daemon:
    Get "https://acrrci3ailanding1.azurecr.io/v2/": denied:
    client with IP '165.85.7.2' is not allowed access.
    CorrelationId: 9c671932-bc21-4b1b-bcae-4a0baf3a2caf

    (This is a real ACR response, not a proxy failure — the data
    plane is reachable, the registry just rejects our IP.)

One more constraint on our side: even with the firewall opened, we
still cannot build locally — pulling the base images (node:20-slim,
nginx:1.27-alpine) fails with a 503 from the Docker Hub CDN through
our proxy. az acr build avoids this because base images are pulled
Azure-side.

So there are really only two workable options:
  1. Grant the SP Contributor on acrrci3ailanding1 AND allow-list
     165.85.7.2  -> we run az acr build.
  2. Your team builds and pushes the two images for us.

Thanks!
```

---

**Lifecycle reminder**:呢份 plan locked after status=active。重大 deviation 入第 7 節 changelog,小 detail 變動可直接 inline edit。
