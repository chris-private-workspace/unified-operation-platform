---
phase: W44-azure-dev-deploy
name: "Azure DEV 環境部署(n8n UAT 可達)"
sprint_week: W44
start_date: 2026-08-04
end_date: 2026-08-08          # planned, may slip with changelog log
status: draft                 # draft | active | closed
spec_refs:
  - docs/13-deployment/04-deploy-runbook.md
  - docs/13-deployment/01-topology.md
  - docs/13-deployment/07-uat-as-built.md
prior_phase: W43-onboarding-license-request
---

# Phase W44 — Azure DEV 環境部署(n8n UAT 可達)

> **Plan version**:1.0(initial)
> **Owner**:Chris Lai
> **Approved by**:_(status flips draft → active 時填)_

## 1. Scope

Infra team 交付咗一個**新嘅 Azure DEV 環境**(`RG-RAPO-UOP-DEV`),目的係令 UOP **同 n8n UAT 環境接得通** —— 呢個正正解封 W36/W39/W40/W42 一路 carry 落嚟嗰個「n8n 側從未真接通,所有 seam 零 live 驗證」嘅缺口。本 phase 要把 UOP(`apps/api` + `apps/web`)部署上呢個環境並驗到端到端。

**呢個唔係「照跑一次 UAT runbook」**。實測(2026-08-04,SP 真登入)顯示 DEV 同 UAT 有**六處結構性差異**,其中三處係 blocker(見 §4)。最要緊嘅一處係 **API ingress 由 internal 變 external** —— 呢個係安全邊界改變,必須先出 ADR 由 Chris 拍板(F0),**未 Accept 之前唔落任何部署 code**。

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

### F4 — web 建構調整(api base URL + nginx upstream)

- **Spec ref**:`apps/web/nginx.conf.template` · `04-deploy-runbook.md` §8.2
- **Dependencies**:F0
- **Acceptance criteria**:
  - nginx `/api` upstream 由 UAT 嘅 **http + internal** 改成 DEV 嘅 **https + external**(DEV api `allowInsecure=false`)
  - `Host` header 規則(UAT 嗰個 `$proxy_host` 坑,runbook §8.2)喺 https upstream 下重新確認
  - 改動**唔影響 UAT** —— 靠 template 變數而唔係改死值
- **Effort estimate**:3h
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
  - n8n UAT 打得到 `POST /requests/intake`(flat mode contract,W43 F1)—— **真 201 + DB 真 row**
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
| **B1** | 🔴 **冇任何可達嘅 container registry** —— `azure_container_registry` 個值係 GUID(`4a6e1474-…`),而 ACR 名只准 5–50 純字母數字 ⇒ **唔可能係 ACR 名**;實測 RG 內冇 ACR、`az acr list` 返空、嗰個 GUID 亦唔係 subscription id | **確定** | **致命** —— build/push/pull 全部做唔到 | 問 infra team 攞 registry 全名 + login server + 憑證;SP 需要 **AcrPush** |
| **B2** | 🔴 **PG credential 對唔上** —— server admin 係 `rcitadmin`,但 `.env` 畀嘅係 `rapoaiuopdev`;UOP 用嘅 database 建咗未、叫咩名,未知 | **確定** | **致命** —— `databaseUrl` 砌唔到 | 問 infra team:`rapoaiuopdev` 係 db 名定 user?pw 對應邊個?database 名? |
| **B3** | 🔴 **ACA env 連唔連到 private PG/Redis,無法確認** —— 兩者 `publicNetworkAccess=Disabled`,PE 落 `vNet-RCITest-HKG/Subnet-RCITest-D-DB`,但 SP **讀唔到** `acaen-rapo-dev`(AuthorizationFailed),而且 PE **`dnsZoneGroup=null`**(冇綁 private DNS zone group) | **中** | **致命** —— container 起得身但連唔到 DB | 問 infra team 確認 VNet 整合 + DNS 解析路徑;否則只能部署後實測 |
| **B4** | SP 對 `acaen-rapo-dev` 連 read 都冇 ⇒ 部署 container app 若需要 `managedEnvironments/join/action` 會 403 | 中 | 高 | 實測(要先過 B1);必要時問 infra 補權 |
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

## 附錄 B — DEV vs UAT 六處差異

| # | 差異 | UAT | DEV | 影響 |
|---|---|---|---|---|
| 1 | API ingress | **internal**(web 做單一 origin) | **external** | **F0 ADR** — 安全邊界改變 |
| 2 | ACA env | 自己建(`aca.json` 內) | **共用既有**,喺另一個 RG,SP 無 read 權 | **F2** — 要新 template |
| 3 | DB 網絡 | public `0.0.0.0`(allow Azure services) | **Private Endpoint,public disabled** | **B3** — 連通性未確認 |
| 4 | PG 版本 | 16 | **18** | **G8** — Prisma 未驗過 |
| 5 | Registry | 自建 ACR(RG 內) | **冇** | **B1** — blocker |
| 6 | 額外資源 | — | **Redis + App Insights + custom domain/SNI cert** | R8(Redis 唔接)· F3(appBaseUrl 用 https custom domain) |

## 附錄 C — 交畀 infra team 嘅問題

1. UOP DEV 要 push/pull container image,用邊個 ACR?請畀 **registry 全名 + login server + 憑證**(或確認 `4a6e1474-a105-4ea4-b273-3c6ae7f1923a` 呢個 GUID 代表咩)。SP `d2f094a3-…` 需要對該 registry 有 **AcrPush**。
2. `pgsql-rapo-uop-dev`:`rapoaiuopdev` 係 database 名定 DB user?配嘅 password 對應邊個?UOP 用嘅 database 建咗未、叫咩名?
3. `acaen-rapo-dev` 有冇整合 `vNet-RCITest-HKG`?兩個 PE 冇 private DNS zone group,container app 內部點解析 `pgsql-rapo-uop-dev.postgres.database.azure.com` / `redis-rapo-uop-dev.redis.cache.windows.net` 到私有 IP?
4. SP 有冇 `Microsoft.App/managedEnvironments/join/action` 落 `acaen-rapo-dev`?

---

**Lifecycle reminder**:呢份 plan locked after status=active。重大 deviation 入第 7 節 changelog,小 detail 變動可直接 inline edit。
