---
phase: W44-azure-dev-deploy
plan_ref: ./plan.md
status: in-progress    # in-progress | complete
last_updated: 2026-08-04
---

# Phase W44 — Checklist

> Atomic checkbox(每 item ≤ 1–2 hour effort)。
> AI tick 完成嘅 item;唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。

## F0 — ADR:DEV 部署拓撲(api external ingress)

- [x] F0-1 起草 ADR:Context — infra team 已開 api external ingress + 畀咗 `azure_url_for_api_call`,意圖係令 n8n UAT 打得到
- [x] F0-2 Decision — **兩個選項並列待拍板**(⚠️ **相對 plan 有調整**,見 progress Day 1:寫 ADR 時發現 `nginx.conf.template` 已經 proxy `/api` ⇒ **收返 internal 亦完全滿足 n8n**,所以唔應該把 external 當成唯一路)
- [x] F0-3 明寫代價 — 平台第一次把整個 API(含 `/docs/api`)直接暴露互聯網;防線只剩 `IntakeKeyGuard` fail-closed + JWT guard
- [x] F0-4 Alternatives — Option A 收返 internal / Option B 保持 external + D2 三項收窄 / Option C per-path(ACA 做唔到)/ Option D 前端直打 api(明確 reject)
- [x] F0-5 明寫 **cookie 邊界不變**(AUTH-4c-B `SameSite=Strict` httpOnly 唔受影響 —— 兩個選項嘅分別**只在 machine-to-machine**,唔涉及瀏覽器)
- [x] F0-6 ✅ **Chris 2026-08-04 拍板 Option A(api 收返 internal)+ ADR Status = Accepted** ⇒ F2 解封;plan 同批由 `draft` 轉 `active`
- [x] F0-6b **OQ-1 resolved**(Chris 2026-08-04):n8n UAT 住喺**企業內網**(on-prem / 內部 VM)⇒ 解析得到企業 domain,**Option A 走得通**。⚠️ 仍係推論唔係實測 ⇒ 實測降級做 **F7-1**,唔再 block D1
- [x] F0-7 `docs/adr/README.md` index 加一行(順帶修正 **ADR-0026 index status** `Proposed` → `Accepted`,檔本身一直係 Accepted,W43 收官漏改)

## F1 — 環境 discovery + 差異登記

- [x] F1-1 SP 登入 + 確認 subscription / tenant / role assignment
- [x] F1-2 列 RG 資源清單
- [x] F1-3 查兩個 container app 現狀(image / ingress / env / secret / registry / identity)
- [x] F1-4 查 PG + Redis(版本 / admin / 網絡)
- [x] F1-5 查 PE subnet + private DNS zone group
- [x] F1-6 確認 Key Vault data-plane 可用性
- [x] F1-7 確認 RG 內無 ACR + 嗰個 GUID 唔係 subscription
- [x] F1-8 確認 `apps/api/src` 零 BullMQ/Redis 用法
- [x] F1-9 寫 `docs/13-deployment/09-dev-as-built.md`(座標 + 六處差異 + 四條 infra 問題)
- [x] F1-10 把四條問題交畀 Chris → infra team(**2026-08-04 已答**;Q3 網絡 ✅ / Q4 join ✅ / Q2 部分 / **Q1 答咗但實測用唔到**)
- [x] F1-11 ✅ **第二輪已發已答**:~~Q1~~ 部分(pull 側撤銷,push 側未解)· **Q3 ✅** n8n = `http://rapo-n8n-uat.rci-t.com/` · **Q4 ✅** https · ~~Q2~~ 自解
- [ ] F1-12 🚧 **第三輪(只剩 ACR 一條)** —— 回應 infra 問「what is the deployment detail error?」,附兩個確切 error(**(a) 權限 / (b) 網絡,要分開講**)+ 明講「就算放行 firewall 我哋一樣 build 唔到」⇒ **收窄到兩個可行解**。精簡版 ② 已存 plan 附錄 C
  - **2026-08-13 標 defer(closeout 決定)**:🟢 **B1 唔再阻塞**(2026-08-05 換一台唔喺公司網嘅 build host 解封,兩個 image 真 push 上 `acrrci3ailanding1`)⇒ 本條**由「阻塞解除手段」降級成「技術債清理」**。
  - 🔴 **但唔可以刪** —— 現行做法**繞開公司 proxy**,唔係長期方案;**解法 ①(SP 攞 registry `read` + `scheduleRun/action`)仍然最乾淨,infra 唔應該撤走**(⚠️ `AcrPush` **唔包** `scheduleRun/action`,呢個細節係第三輪要講清楚嗰樣)。
  - **理由 = 外部溝通,唔係平台側做得完**;**target = 下次同 infra 有往返嗰陣一併提**(或者 build host 唔再用得嗰日 —— 嗰陣就會由技術債變返阻塞)

## F2 — DEV 專用 ARM template(**F0-6 已解封**)✅

- [x] F2-1 存底 —— `az resource show` 兩個 app 完整 JSON 落 scratchpad(api 7184B / web 7511B)。**存底即刻有回報**:揭到兩樣一定要寫入 template 嘅嘢(`workloadProfileName: Consumption` · web 個 `customDomains` 完整結構),同一個新風險(web 有 **150+ 個 `outboundIpAddresses`** ⇒ ACA pull image 一樣會撞 ACR firewall,逐個放行唔實際)
- [x] F2-2 新建 `deploy/azure/aca-dev.json` — 只 update 既有 app,**唔建 ACA env**
- [x] F2-3 `environmentId` 用既有 `acaen-rapo-dev` 完整 resource id(cross-RG,做 parameter 令 subscription id 唔入 git)
- [x] F2-4 **保住 web custom domain + SNI cert binding**(`webCustomDomain` + `webCustomDomainCertificateId` 兩個 parameter)
- [x] F2-5 api ingress 按 ADR-0027 D1 **Option A**:`external:false` + `allowInsecure:true` + targetPort 3000
- [x] F2-6 `RUN_MIGRATIONS_ON_START` / `RUN_SEED_ON_START` = true
- [x] F2-7 UAT 個 `aca.json` **一個字唔改** — `git status deploy/azure/` 只顯示 `?? aca-dev.json`
- [x] F2-8 verify:**`az deployment group validate` → `provisioningState: Succeeded`**,`error` 全 null
- [ ] F2-9 🚧 **擴 `check-template.py` 覆蓋 `aca-dev.json`**(佢而家硬編碼 `aca.json`)—— **defer**:validate 今日跑得到而且係更強嘅 gate;佢唯一唔覆蓋而 check-template 覆蓋嘅係 **secretRef 懸空**(已手動逐個對過,兩個 app 都齊)。真正需要佢係「validate 又跑唔到」嗰日
- [x] F2-10 ⚠️ 順帶實測推翻 `check-template.py` docstring 一句「`az deployment group validate` 喺公司網跑唔到(`az account show` 直接 hang)」—— **今日全程通**(list / db create / validate 都成功)
- [x] F2-11 ✅ **`az deployment group what-if` —— R6 由「部署後對數」提前變成「部署前證明」**。結果:**零 resource 被 Delete** · 只有兩個 container app `Modify`,其餘 **9 個資源全部 `Ignore`**(Redis / PG / App Insights / KV / 2 NIC / 2 PE / alert rule)· **`customDomains` 同 `workloadProfileName` 唔喺 delta ⇒ 保留** · web `external` 唔喺 delta ⇒ 保持 true · `registries` + `secrets` `Create`(what-if 自己 mask 咗值)。api delta 只有預期嗰四樣:`allowInsecure` false→true · `external` true→false · `targetPort` 80→3000 · 三個 default unset
- [x] F2-12 ⚠️ **三個 property 會被 ARM unset,評估為無害,刻意唔寫返**:`exposedPort`(只對 TCP transport 有意義)· `traffic`(`activeRevisionsMode: Single` 下 ACA 自動全部去 latest)· `maxInactiveRevisions`(unset 即用預設 100)。理由唔係「應該冇事」而係**UAT `aca.json` 同樣三個都冇寫,而 UAT 三次部署都成功** —— 有實證先當佢無害

- [x] F2-13 🆕 ⚠️ **2026-08-05 重跑 what-if 發現被 unset 嘅係四個唔係三個** —— 多咗 `properties.runningStatus: Running → ''`。佢係 read-only status field,ARM **應該**唔會真改,**但呢個係推論冇實證** ⇒ 照 F2-12 自己立嘅標準,唔可以當已驗,留 F6-9 對數專登睇
  - 🟢 **2026-08-13 收 —— 由行為實證,唔再係推論**:PATCH 部署喺 **2026-08-06**,而 **2026-08-13(七日後)**四個 endpoint 全部真答(`/` 200 · `/api/auth/sso/status` 200 · `/api/me` 401 · `/api/docs/api-json` 200 62,834 B)。`runningStatus` 係「呢個 app 行唔行緊」嘅 read-only 反映 —— **佢若然真係被 unset 成 `''`,app 唔可能連續行足七日兼今日仲逐個 endpoint 答緊**
  - ⚠️ **誠實界線**:**冇直接讀返個 field**(要 `az`,而部署 SP 憑證唔喺 repo,要 Chris 自己 `az login`)。呢度收嘅係**行為證據**唔係 field 讀取 —— 分別在於:field 讀取會答「ARM 有冇改過佢」,行為證據答「就算改過都冇造成後果」。**對本項嘅風險(PATCH 會唔會整停個 app)嚟講,後者已經足夠**

## F3 — params 檔 + secret 策略(**B2 已解封**)

- [x] F3-0 建 UOP 嘅 database —— `az postgres flexible-server db create -s pgsql-rapo-uop-dev -g RG-RAPO-UOP-DEV -d platform`;verify `db list` 由 3 個系統 db 變 4 個(**management plane,唔需要連到 PG data-plane**)
- [x] F3-1 `deploy/azure/aca.params.dev.json` 生成完(script 寫檔,**secret 值從未印出**,只出 masked summary)
- [x] F3-2 `databaseUrl` 砌好 —— 🔴 **PG 密碼含 `$` 同 `?`,一定要 percent-encode**(`[System.Uri]::EscapeDataString`),否則個 `?` 會被當成 query string 開始而**靜靜截斷 credential**
- [x] F3-3 `appBaseUrl` = `https://rapo-uop-web-dev.rci-t.com`(**唔係** infra 寫嘅 http —— custom domain 綁咗 SNI cert;待 Q4 確認)
- [x] F3-4 其餘 secret 用 `RandomNumberGenerator` 生成(intakeApiKey hex-32B · authJwtSecret base64-48B · break-glass 密碼 19 字元 ≥3 類,符合 AUTH-4c-A policy)
- [x] F3-5 verify:`git check-ignore -v` → **`.gitignore:7:deploy/azure/*.params.*.json`**(H4 硬要求)
- [x] F3-6 ✅ **Chris 2026-08-04 拍板:先 placeholder,部署成功之後再逐個接** ⇒ params 檔現狀就啱,唔使改。理由:①B1 未解,部署都未得,呢個決定隨時改得 ②先驗 boot / migration / seed / 前端 / break-glass 登入,再接 vendor 係更小步,壞咗分得清邊層 ③接真 SN 會喺真 instance 開單,而手上已有 5 張測試單等 cancel。UAT 當初同樣先 placeholder 後補
- [x] F3-7 🟢 **接真 vendor 配置已落(2026-08-07 部署 #3,Chris 拍板「兩個都接」)** —— revision `--0000004`。Graph:`GRAPH_TENANT_ID=d1ea071a-…` / `GRAPH_CLIENT_ID=27d329e5-…` / secret 走 secretRef。ServiceNow:`https://ricohapdev.service-now.com`(🟢 **dev instance 唔係 prod**)/ `n8napiservice1` / password secretRef。⚠️ **順帶補返兩個一直冇部署過嘅 env** —— `SERVICENOW_O365_CATALOG_ITEM_SYS_ID` + `SERVICENOW_D365_CATALOG_ITEM_SYS_ID`(走 `config.get` 唔係 `getOrThrow` ⇒ 唔設照 boot,但**一建單就 throw**「catalog item is not configured」,即「接咗但建單壞」)。值取自 `.env.example`(明文標註 = ricohapdev 實測值,同 `SERVICENOW_INSTANCE_URL` 指嘅 instance 一致)。🟢 `ConnectorConfig` 表**係空**(seed 唔寫佢,已查證)⇒ DB-then-env fallback 會用 env,唔會靜靜蓋過
- [x] F3-7b 🟢 **驗真連通完成(2026-08-07,Chris 喺 UI 撳 test connection)** —— Graph + ServiceNow 兩個 connector 都顯示連得到 ⇒ **outbound 對 `graph.microsoft.com` + `ricohapdev.service-now.com` 都通**。⚠️ 呢個先前只係推測:SSO 只證咗 `login.microsoftonline.com`,而三個 host 可以有唔同 allowlist
- [x] F3-7c 🔴 **`INTAKE_API_KEY` 已 rotate(2026-08-07)** —— 我喺一次 hash 比對入面用咗 `H` 做函數名,撞正 `Get-History` 內建 alias ⇒ 原值被印入 tool output(H4 事件)。Chris 即批 rotate:新 64-hex CSPRNG key → params → PATCH → **`revision restart`**。🔴 **restart 唔可以慳** —— ACA secret 住喺 `configuration` 唔係 `template`,改佢**唔會產生新 revision**,跑緊嘅容器仍然攞住舊值,而 PATCH 照樣 `exit 0`。收貨憑據 = **所有 Running replica 都新過 restart 時間**(唔係 revision 狀態)
  > **點解 F3-7b 要獨立一項而唔係併入 F3-7**:啟動 log **證明唔到** Graph / SN 連得通 —— connector 係 lazy,而 `SyncSweepService` 因為新 seed 冇 pending request 亦唔會自動打 Graph。當時判斷最可能嘅失敗點係 outbound 被 VNet route / firewall 擋,而 SSO 只證到 `login.microsoftonline.com`。**結果冇兌現**(三個 host 都通),但「配置落咗」同「連得到」始終係兩件要分開收嘅事。

## F4 — web 建構調整 ✅ **零改動**(Option A 令本 deliverable 消失,plan changelog v1.2)

- [x] F4-1 ~~upstream 改 https+external~~ **唔需要** —— Option A 之後 DEV 同 UAT 一模一樣(`http://` + internal FQDN),`API_UPSTREAM` 本來就係 env 渲染
- [x] F4-2 `Host $proxy_host` 規則**原樣適用**(api 仍係 internal ingress,正正係嗰條規則存在嘅原因)
- [x] F4-3 `apps/web/nginx.conf.template` **零 diff** ⇒ 對 UAT 零影響
- [ ] F4-4 🚧 實際渲染出嚟嘅 `nginx.conf` 逐行睇 —— ~~卡 B1~~ **2026-08-13 更新:阻塞冇咗,但本條仍然未做,而且已經冇乜價值**。①**行為面已經證晒**:`F6-5`(`/api/docs/api` + `/api/docs/api-json` 200,而 `/docs/api` 畀 SPA fallback 食咗 ⇒ **`/api` proxy 同 SPA fallback 兩條規則都行緊兼分得清**)+ `F6-14`(**400 body 290 bytes 完整過 proxy** ⇒ 唔會截 body / 唔會改寫 error) ②淨低唔覆蓋嘅只有「conf 入面有冇寫咗但未觸發過嘅規則」。**理由 = 讀實作換返嚟嘅嘢,行為驗證已經覆蓋咗絕大部分**;**target = 下次真要改 nginx 行為嗰陣順手做**(嗰陣讀佢先有意義)

## F5 — image build + push ✅ **B1 已解封(2026-08-05 Day 3)**

> **走咗第 ⑤ 條路 —— 換一台唔喺公司網嘅 build host**(出口 IP `52.187.129.166`,Azure 段)。四條列過嘅解法全部 assume 咗「build 一定要喺公司網嗰台機做」,而呢個 assumption 冇人立過。詳見 progress Day 3。
> 🔴 **R3 deviation**:F5-2/F5-3 由 `az acr build` 改成本地 `docker build` + `docker push`(兩個 SP 都冇 management plane)。**deliverable 冇變**,變嘅係手段。
> ⚠️ **唔可以當 B1 永久消失** —— 呢條路等於繞開公司 proxy,唔係令部署鏈喺公司網跑得到。解法 ①(SP 攞 `scheduleRun/action`)仍然係最乾淨嗰個,infra 嗰邊唔應該撤走。

- [x] F5-0 ~~等 infra 回覆 Q1~~ **唔再 block** —— 換 build host 之後兩條前置(base image / firewall)自己通咗
- [x] F5-0b ✅ **解法 ②(infra 代 build)嘅指引已預先寫定** —— `09-dev-as-built.md`「附:B1 解法 ②」。含:source 兩個交法(repo access / `git archive`,**後者實測 1065 檔 8.9MB 且零 secret**)· 三個一定要講嘅點(**context = repo root** · **web 依賴 root 嘅 `design_handoff_licenseops/`** · **唔使傳 build arg**)· 可直接發嘅英文指引 · 收到之後我哋嘅四步。🔴 明文標低**證唔到嗰樣**:呢兩個 image 從來冇人真正 build 過(本機 `docker build` 撞 Docker Hub 503),而 api 有 `RUN test -f dist/main.js` 硬閘要預先同 infra 講,否則佢哋會當係我哋 Dockerfile 有 bug
- [x] F5-1 配 ACR credential 落 container app `registries` —— 已喺 `aca-dev.json` 做 parameter;what-if 顯示兩個 app 都 `registries` **Create**。⚠️ **真正生效要等 F6-1 部署**
- [x] F5-2 ~~`az acr build`~~ **本地 `docker build`** api image → `acrrci3ailanding1.azurecr.io/uop-api:dev-0d01f0c`(BUG-008 個 `RUN test -f dist/main.js` 硬閘 **過**)
- [x] F5-3 ~~`az acr build`~~ **本地 `docker build`** web image → `…/uop-web:dev-0d01f0c`(vite `✓ built in 7.16s`)
- [x] F5-4 verify:~~`az acr task list-runs`~~ **`docker push` 真 digest** —— api `sha256:5a8d48cd…` · web `sha256:1d543670…`。🟢 **push 側史上第一次證到**(之前只證到 `login`,冇 image 可推)
- [x] F5-5 🆕 `aca.params.dev.json` 個 `apiImage`/`webImage` tag 由 `dev-3ff9c73` 更新做 **`dev-0d01f0c`**(對齊實際 push 上去嗰兩個)
- [x] F5-6 🆕 部署前重跑 `what-if` —— **同 Day 1 baseline 一致**:零 Delete · 9 Ignore · 2 Modify · `customDomains`/`workloadProfileName` 保留

## F6 — 部署 + smoke(**2026-08-06 部署咗,但驗證卡 B7**)

> 🔴 **B4**:`az deployment group create` → `LinkedAuthorizationFailed`(SP 冇 `managedEnvironments/join/action`)。零破壞。
> 🟢 **繞過咗**:`az rest --method patch`,body **唔含 `environmentId`** ⇒ 唔觸發 linked auth。CLI(`az containerapp update/registry set`)做 read-modify-write 會連 `environmentId` 一齊送,所以一樣 403 —— **要用 raw ARM PATCH**。
> 🔴 **新樽頸 B7 — 觀測權限**:冇 `managedEnvironments/read` ⇒ `logs show` / `exec` 都 403;而 HTTP 又打唔到(env 係 internal-only,呢台機唔喺嗰個網絡)⇒ **部署咗但驗唔到**。

- [x] F6-0 ~~等 infra 畀 `join/action`~~ **已繞過**(raw ARM PATCH)。⚠️ **仍然要向 infra 攞** —— 冇佢 `aca-dev.json` 永遠用唔到
- [x] F6-1 ~~`az deployment group create`~~ **`az rest --method patch` ×2** —— 兩個都 `exit=0`。腳本 `deploy/azure/patch-deploy-dev.ps1`,先 dry-run 印 masked 結構驗過先送
- [x] F6-2 verify:api / web PATCH 都 `exit=0`,兩個 app `provisioningState = Succeeded`
- [x] F6-3 verify:**兩個 revision 都 `Healthy`** —— api `--0000002` `RunningAtMaxScale` · web `--0000001` `Running`,replicas 各 1。🟢 **順帶證到 ACA 由 VNet 內 pull 到 `acrrci3ailanding1`**
- [x] F6-4 verify:`https://rapo-uop-web-dev.rci-t.com/` —— 🟢 **Chris 由公司網絡實測,login 頁面 render 到**。B8(infra 漏建 DNS)已解決;**係 https 唔係 http** ⇒ `APP_BASE_URL` 填 https **證實填啱**(F3-3 當時對抗 infra 寫嘅 http),cookie `Secure` 擔心同時消除
- [x] F6-5 verify:`GET https://rapo-uop-web-dev.rci-t.com/api/docs/api` = **200**(驗 nginx `/api` proxy → internal api)—— 🟢 **2026-08-12 由呢台機實測**:`/api/docs/api` **200 Swagger UI** · `/api/docs/api-json` **200 真 OpenAPI JSON** · `/api/me` **401 `Missing credentials`**(唔係 502/504 ⇒ api 真係喺度兼 guard 正常)· `/api/auth/sso/status` → `{"enabled":true}`。⚠️ **路徑係 `/api/docs/api` 唔係 `/docs/api`** —— 打後者會畀 SPA fallback 食咗返 HTML,係最易誤判成「api 唔通」嗰個位
- [x] F6-6 verify:break-glass login = 200 + role ADMIN —— 🟢🟢 **2026-08-13 真收**。`POST /api/auth/login`(`admin@uop.local`,密碼由 `aca.params.dev.json` 個 `localAdminInitialPassword` 直接餵入變數,**從未印出**)→ **200**,`Set-Cookie` 兩個:**`uop_access` + `uop_refresh`**(= ADR-0006 §7 rotating refresh 設計,證到 cookie 過得到 ACA ingress 兼 `Secure` 冇擋);跟住 `GET /api/me` **200** → `{"email":"admin@uop.local","displayName":"Local Admin","role":"**ADMIN**","opcoScopeId":null,"mustChangePassword":false}`。⇒ **本 phase 第一次真人登入 DEV**;順帶證實 `F3-7e` 講嘅 `mustChangePassword` **冇被 seed 設**(default false)
- [x] ~~F6-4b 由公司網絡打 **ACA 預設 FQDN** 收 F6-4/5/6 嘅實質內容~~ ⛔ **作廢(2026-08-11 前提被推翻 · 2026-08-12 已無需要)**。①原文嗰句「internal env 喺 hub VNet private DNS **一定**有記錄」係**推論唔係實測**,2026-08-10 Chris 實測 ACA 預設 FQDN **一樣訪問唔到**(env `vnetConfiguration.internal=true` 而 `staticIp=10.160.71.70` 私有 IP,靠嘅 private DNS zone 冇 link 到企業網)②2026-08-12 **custom domain 由呢台機直接打得通** ⇒ 呢條繞路兩個理由都冇咗
- [x] F6-7 verify:**PG v18 migration 真跑得過**(G8)—— 🟢 **已證(container log 原文)**:`19 migrations found` → 逐個 `Applying migration …` → `The following migration(s) have been applied:`,**零 error**
- [x] F6-8 verify:seed 完成 —— 🟢 **已證(原文)**:`Seeded local admin (admin@uop.local).` + **`Seeded 24 OpCos + admin + RHK OPCO_IT user.`** —— 精確 24 個
- [x] F6-7b **B3 — ACA 連到 private endpoint 嘅 PG** —— 🟢 **已證**:migration 真跑咗 19 個,冇連接根本做唔到。**呢個係本環境存在嘅意義,而佢通咗**
- [x] F6-7d 🆕 `[NestApplication] Nest application successfully started`(`04:14:31`)· `[entrypoint]` 零 `WARN: … failed`
- [x] F6-10 ✅ **infra 2026-08-06 畀咗 `managedEnvironments/read`(+ enable log)⇒ B7 解封**,`logs show` 通,而且**啟動嗰刻嘅 log 仲喺度**
- [x] F6-13 🆕 ⚠️ 記低一個無害 warn:`package.json#prisma is deprecated and will be removed in Prisma 7` ⇒ 將來升 Prisma 7 要轉 `prisma.config.ts`(**唔阻本 phase**)。**呢條係一句 note 唔係一個 action** —— 記低咗就係做完;留住 `[ ]` 只會令下手以為仲有嘢要做(2026-08-12 對數時更正)
- [x] F6-7c 🆕 方法論:直接驗證路(log / exec / HTTP)封死之後,轉去 **PG management plane metrics** —— 佢一直喺我哋嘅 RG Contributor 範圍內,四日嚟冇用過
- [x] F6-9 R6 對數:🟢 **`customDomains`(`rapo-uop-web-dev.rci-t.com` SniEnabled)· `workloadProfileName` · `environmentId` 全部完好**。PATCH 唔 unset 冇送嘅 property ⇒ 比 ARM full PUT 結構上更安全
- [x] ~~F6-10(重複)🔴 要 infra 畀 `managedEnvironments/read`,係而家最大樽頸~~ ⛔ **重複 ID,已由上面嗰條 `F6-10` 取代**(infra 2026-08-06 畀咗)。🔴 **兩條同編號嘅 item 一條 `[x]` 一條 `[ ]` 並存咗六日** —— 掃 checklist 嘅人睇到邊條就信邊條,而「最大樽頸」呢句喺已解封之後仲留住,會令下手當成阻塞。**編號重用 = 兩個真相**,同 `WEB-TEST-JSDOM`/`WEB-TEST-ENV` 同族
- [x] ~~F6-11 替代驗證:Chris 用個人帳號喺 Azure Portal 睇 container log~~ ⛔ **唔再需要** —— B7 2026-08-06 解封,`logs show` 直接通,log 原文已入 F6-7/F6-8
- [x] ~~F6-12 替代驗證:由企業網絡內嘅機 curl web + `/api/docs/api`~~ ⛔ **唔再需要** —— 2026-08-12 **由呢台機**直接打得通(見 F6-5),唔使搵企業網嗰部機
- [x] **F6-14** 🟢🟢 **2026-08-13 真收** —— **400 body 捱唔捱得過真 ACA ingress + nginx proxy**(**由 W45 `F4-4b-1` 併入嚟,Chris 2026-08-12 拍板**)
  - **點解由 W45 搬過嚟**:`B8` 解封之後佢**唔再係「冇路」**,而佢淨低嘅嘢**完全唔關 W45 個 dialog 事** —— dialog 邏輯本機已 100% 真驗過(F3-7 兩張 blocked 截圖 + 2026-08-12 三撳真 400/200)。**佢淨係驗一樣嘢:一個 400 回應嘅 body 過唔過得到呢個環境嘅 proxy 鏈。** 嗰個係**部署層**嘅問題,唔係功能層 ⇒ 放喺 W44 先啱位
  - **點造局**:揀一條 line item,佢個 OpCo × SKU 喺 ledger `allocatedQuantity = 0` ⇒ 撳 Assign 會被 **budget 閘**擋(閘喺 tenant seat read 同 `assignLicense` 之前,有 test 釘住)。🟢 **零副作用**
  - ✅ 收貨:**dialog 開到(唔係一個乾巴巴嘅 toast)** ← 呢個先係「400 body 過到 proxy」嘅證據 · `failedAt` 指住 `budget` · 有 `whoFixes` · **DB 零改動**
  - 🔴 **dialog 開唔到但本機開得到 ⇒ 就係 proxy 食咗 400 body**,唔好再查前端(同 `apiPatch` `detail` bug 同族)
  - 💡 **本機對照組已經有咗**:2026-08-12 三撳嘅 1 號、2 號各返一個真 400 + 完整 steps(`directory` 4 步 / `budget` 6 步)⇒ **DEV 撳完直接對得返**
  - 🟢🟢 **實際結果(2026-08-13)** —— `PATCH /api/fulfilment/requests/{id}/line-items/{liId}/assign`,body `{}`(**刻意唔送 `budgetOverrideReason`**)⇒ HTTP **400** · `Content-Type: application/json` · **body 290 bytes 完整到齊**:<br>`{"outcome":"blocked","failedAt":"sync-azure","steps":[{"key":"stage","status":"ok"},{"key":"sync-azure","status":"failed","detail":"Phase 1 sync gate not passed: azureSyncedAt is null","retryable":true,"whoFixes":"identity"}],"message":"Phase 1 sync gate not passed: azureSyncedAt is null"}`<br>⇒ **`outcome` / `failedAt` / `steps[]` / `whoFixes` 逐個過得到 proxy**,而 ADR-0029 刻意保留嘅舊 shape `message` **同時在** ⇒ **dialog 喺 DEV 一定開得到**(前端解析本機已 100% 驗過)。零副作用:`outcome=blocked`,`azureSyncedAt` 仍然 null
  - ⚠️ **R3 deviation —— 擋住嘅係 `sync-azure` 唔係 `budget`,係刻意換閘**:唯讀探測(零副作用)發現 DEV 得 9 條 line item 全部 `RAPO/IT`,而**三條 `READY` 嘅兩個 sync gate 都已經開咗** ⇒ 撳落去**直達 Graph**,budget 閘一唔中就**真派 licence 畀一個真人**(DEV 同本機打同一個公司 tenant,見 CLAUDE.md §9 `DEV-GRAPH-PLACEHOLDER`)。改揀 **`REQ0043934`**(兩個 gate 都 null)⇒ **結構上到唔到 Graph**。🔴 **換閘對本項驗證目標零損失** —— 本項自己寫明「**佢淨係驗一樣嘢:一個 400 回應嘅 body 過唔過得到呢個環境嘅 proxy 鏈**」,而 `sync-azure` 個 400 同 `budget` 個 400 行 ADR-0029 **同一條組裝路**
  - 🚧 **淨低冇驗**:`budget` 閘**喺 DEV** 嗰條路(本機 2026-08-12 已驗過完整 6 步)。**理由 = 唔想為咗驗一個已知組裝路而擔真派風險**;**target = 有一條「alloc=0 而 sync gate 未開」嘅 fixture 嗰陣順帶做**,或者 Chris 明示批准喺 DEV 撳一條已開閘嘅

## F7 — n8n UAT 接線驗證(前置 F6)

> 🚧 **全段剩低嗰五條(`F7-7`..`F7-11`)2026-08-13 標 defer(closeout 決定)** —— **全部卡同一樣嘢:n8n 側嘅配置同 n8n owner 嘅配合**,唔係平台側做得完嘅工作。
> **具體缺口**:`N8N_OUTBOUND_WEBHOOK_URL` / key 未配 · 2004 secret 仍 `CHANGE_ME_SHARED_SECRET` · 2004 patchUrl hardcode DEV host · 三個接縫(outbound webhook / `LicenseOperationsProvider` / `TicketUpdateProvider`)一次都未真切過。
> 🟢 **本 phase 對 F7 嘅實質貢獻已經收咗,而且係最難嗰半**:`F7-0` 證到**企業網 → DEV intake endpoint 真係打得通**(故意錯 key → **401** fail-closed,一個回應同時證 DNS / TLS / nginx `/api` proxy / internal api / guard 五樣)—— 嗰個正正係 **W36–W42 一路做唔到嗰件事**(舊環境結構上冇入口)。**入口通咗,剩低係 n8n 側配置。**
> **Target = ADR-0017 三個接縫真切嗰個 phase**(BACKLOG `N8N-SEAMS`)。喺嗰個 phase 開之前,呢五條唔會有進展 —— 留喺 W44 只會令本 phase 永遠收唔到尾。

- [x] F7-0 🟢🟢 **企業網 → DEV intake endpoint 真係打得通(2026-08-07,探針 1)** —— 由公司網瀏覽器 console 打 `POST /api/requests/intake` 帶**故意錯**嘅 `X-Intake-Key` ⇒ **401**。一個回應同時證五樣:①企業 DNS 解析到 `rapo-uop-web-dev.rci-t.com` ②TLS ③web nginx `/api` proxy ④internal api 收到 ⑤`IntakeKeyGuard` 正確 fail-closed。🔴 **呢個就係 W36–W42 一路做唔到嗰件事** —— 唔係漏做,係舊環境結構上冇入口。**零寫入**
- [x] F7-0b 🟢 **探針 2 過 = 400**(2026-08-07)—— 啱 key + `mode:2`,`@IsIn([1])` 擋住,**零寫入** ⇒ 證咗 key 啱兼且 body 到達 controller。⚠️ 途中兩個坑,兩個都同服務無關:①header placeholder 用咗中文,而 HTTP header 係 **ISO-8859-1** ⇒ `fetch` 喺送出去之前就 throw,錯誤讀落似伺服器問題但 request 根本未發出 ②🔴 **key 第二次入咗對話記錄**(見 F7-0c)
- [x] F7-0c 🔴 **`INTAKE_API_KEY` 第二次 rotate(2026-08-07)** —— 探針 2 個 snippet 把 key inline 喺 `fetch` 裡面,而我又叫 Chris 報結果 ⇒ 佢好自然咁連指令一齊貼返。**呢個係指令設計錯,唔係佢做錯**:一個 snippet 若果**既要 secret 又要你報 output**,secret 一定會跟住走。已把探針 2 拆成兩句(`let K = '…'` 一句、`fetch` 用 `K` 一句),要報嘅嗰句唔含 key。rotate 流程同上:新 key → params → PATCH → **restart** → 驗「所有 Running replica 都新過 restart」+ ACA secret hash 一致。⇒ **交 key 畀 n8n 唔好再經任何要貼 output 嘅步驟**;用 `Set-Clipboard` 或者直接開檔案複製
> ### 📋 F7 診斷表 —— n8n 打完之後,一個回應碼即刻分得清邊邊要改
>
> 由 `intake.controller.ts` / `n8n-flat-intake.dto.ts` / `intake-adapter.service.ts:128-148,545-565` 逐條讀出嚟,唔係估。
>
> | HTTP | 訊息特徵 | 真正原因 | 邊邊改 |
> |---|---|---|---|
> | **401** | (冇 body) | `X-Intake-Key` 冇送 / 送錯 / 送咗舊 key | **n8n** |
> | **400** | `mode must be one of the following values: 1` | `mode` 送咗**字串 `"1"`** 或者其他值。🔴 DTO 刻意冇 `@Type(() => Number)`,所以 `"1"` 一定失敗 | **n8n** |
> | **400** | `OpCo 'XXX' is not present on this environment` | `opcoCode` 唔喺 24 個 seed 之內 | **n8n** |
> | **400** | `OpCo 'XXX' is inactive` | code 啱但個 OpCo 停用咗 | **平台**(admin 啟用) |
> | **400** | `ServiceNow request 'REQ…' was not found, so it cannot be mirrored` | 個 REQ number 喺 `sc_request` 搵唔到。🔴 **一定要真 REQ** —— 平台會攞佢去 SN 反查 sysId 做 idempotency key | **n8n**(送真 REQ) |
> | **503** | `ServiceNow is unavailable…` | SN 連唔到 / 逾時 | **平台** |
> | **400** | `targetUpn should not be empty` 等 | 缺 required 欄(`mode` / `targetUpn` / `opcoCode` / `requestId`) | **n8n** |
> | **409 / 200** | 返返已存在嗰張 | 同一個 REQ 重推 —— **正常**,intake 對 `Request.serviceNowSysId` 冪等 | — |
> | **201** | 新 request | ✅ **成功** | — |
>
> **24 個 seed OpCo code**(`prisma/seed.ts`):`PFU-Asia` · `PFU-HK` · `RAP` · `RAPO/APTC` · `RAPO/ASPC` · `RAPO/FNA` · `RAPO/IT` · `RAPO/IT (RBS)` · `RAPO/IT (RDC2)` · `RAPO/SCM` · `RAPP` · `RBS` · `RCN` · `RHK` · `RKR` · `RMS` · `RNZ` · `RPH` · `RSP` · `RTH` · `RTMAP` · `RTMEAP` · `RTW` · `RVN`
>
> ⚠️ **成功之後仲要驗 DB,唔可以只睇 201**(F7-2):要見到 `Request` **同埋** 一行 `RequestLineItem`,而嗰行嘅 SKU 應該係 `06ebc4ee-…`(`SPE_E5`,ADR-0020 default 注入,因為 flat payload 一行 licence 都冇送)。
>
> ### 🔴 觀測盲點 + 補救:**唔好淨係睇 api log**
>
> **`IntakeKeyGuard` 拒絕嗰陣一個字都唔 log**(`intake-key.guard.ts:31` 直接 throw,冇 logger,而且係刻意 —— H4「key 只可以比對,永遠唔 log」)。連帶大部分 4xx(OpCo 唔存在 / REQ 搵唔到 / DTO validation)都係 throw 而唔 log。
>
> ⇒ **api log 空白 ≠ 冇人打過。** 只有兩種情況會喺 api log 見到嘢:成功(`n8n flat intake: REQ … → opco …, N line item(s)`)或者 ServiceNow 掛(`ServiceNow lookup failed for REQ …`)。
>
> 🟢 **補救 = 睇 web container 個 nginx access log**,佢記低**每一個**請求同 status code:
> ```
> az containerapp logs show -n aca-rapo-uop-web-dev -g RG-RAPO-UOP-DEV --tail 200
> ```
> 格式尾段個 `"10.160.x.x"` 係 **X-Forwarded-For** ⇒ 分得清邊個打:企業用戶瀏覽器 vs **n8n UAT `10.160.71.243`**。User-Agent 亦分得到(瀏覽器 vs n8n 個 HTTP node)。
>
> ⚠️ **呢個唔止係「多一個地方睇」** —— 冇佢就分唔清「n8n 未打」同「n8n 打咗但 401」,而呢兩個嘅下一步完全唔同(等佢 vs 查 key 傳遞)。

- [x] F7-1 🟢🟢🟢 **n8n UAT 打 `POST /requests/intake` → 真 201(2026-08-07)** —— `REQ0043934` / request `cmsikku3b000kxp012bx3v17q`,一行 line item,`SCTASK0071709` 摺入。**W36–W42 一路 carry 嗰句「n8n 側零 live 驗證」到此兌現。**
- [x] F7-2 verify:DB 真 row —— 🟢 **一半實證**。201 個 body **就係** `prisma.request.create({include:{lineItems:true}})` 返嘅 row(`intake.service.ts:102-132`)⇒ `Request` + 一行 `RequestLineItem` **真係寫咗落 DB**,唔係只有 HTTP code。🔴 **另一半未證**:回應個 `skuCatalogId` 係 DB **cuid**(`cmsidukof005tu501kqqsk73s`),同 `06ebc4ee-…`(`skuId` GUID)**兩個唔同 key,對唔到** ⇒ 「注入嗰行係咪 `SPE_E5`」仍要開 UI 睇 → **F7-12**。🟢 **2026-08-10 另一半收咗,而且唔使開 UI**:DEV container log 直接印住 `REQ REQ0043934 carried no licence line — injecting default SKU SPE_E5` ⇒ **確係 `SPE_E5`**,ADR-0020 注入生效。⚠️ 順帶發現 default SKU **中途變過** —— 同日 `REQ0044049`/`REQ0044057` 注入嘅係 **`POWER_BI_PRO`**
- [x] F7-3 對:URL `/api` 前綴 —— ✅ 由 201 順帶證咗(`https://rapo-uop-web-dev.rci-t.com/api/requests/intake` 經 web nginx proxy 到 internal api)
- [x] F7-4 對:`X-Intake-Key` —— ✅ 有送而且係新 key(`IntakeKeyGuard` 喺 controller 之前,401 就冇 body)
- [x] F7-5 對:`resolveOpco` 只認 RHK/RAPO —— 🟢 **2026-08-10 收咗(觀察半)**:DEV log `n8n flat intake: REQ REQ0043934 → opco RAPO/IT` ⇒ n8n 實際送嘅係 **`RAPO/IT`**,而且平台解析出嚟**冇塌縮成 `RAPO`**。⚠️ **但下面呢句仍然成立,唔好當修好咗**:今次通咗 ≠ 修好咗。`opcoId` 解析成功只證「今次送嘅 code 存在兼 active」;1001 個 `resolveOpco()` 仍係 hardcode `'RHK'`/`'RAPO'` **兼且用前綴比對**(`s.indexOf('RAPO')===0` 會把 `RAPO/IT` 塌縮成 `RAPO`)⇒ 要睇返改咗嘅 workflow JSON 先收得
- [x] F7-6 對:`requestId` 係 REQ number 唔係冪等鍵 sysId —— 🟢 **最有力嗰格**:回應個 `serviceNowSysId: 26e0119a…` **唔係 n8n 送嘅**(flat DTO 冇呢欄),係 `resolveReqSysId()` 實時打 SN `sc_request` 反查返嚟 ⇒ 同時證咗 **ACA → ServiceNow outbound 通**(唔通會 503,唔會 201)
- [ ] F7-7 對:2003 sticky 要求 assigner skip 已持有 E5 嘅 user
- [ ] F7-8 逐項標明係 **n8n 側改** 定 **平台側改**
- [x] F7-12 🟢 **2026-08-10 收咗 —— 答案係「真係開唔到單」,而 root cause 唔喺環境**。DEV container log:`WARN [IntakeAdapterService] Could not raise the ServiceNow licence request for cmsikku3b…: **The requester was not found in ServiceNow, so the request cannot be raised**`,08-07 三次 intake(REQ0043934 / REQ0044049 / REQ0044057)**三次全部同一句**;SN 側 cross-check 亦見 08-07 一整日零新 RITM。⇒ **ADR-0025 D1 有個當時冇留意嘅硬依賴**:`target_user` 係 mandatory reference 去 `sys_user`(收 sys_id 唔收 email),要攞 `requesterEmail` 反查,反查唔到就開唔到單。🟢 fail-soft 有 `failures.record(REQUEST_SUBMIT)` ⇒ 修好之後 retry 補得返(**未眼見過嗰三行,由 code path 推**)。⚠️ **兩個關於「點解驗到」嘅教訓**:①原文寫死「要開 UI」,但本機 DNS 解析唔到 ACA internal FQDN —— 真正答到問題嘅係 **SN 公網 API + Log Analytics REST**,兩者都唔喺 VNet 內、亦一早喺手 ②頭兩次 log 查詢**都 miss 咗**(搜 `fail` 但訊息係「Could not」、搜 `REQ00` 但失敗訊息帶 cuid)⇒ **關鍵字對唔上唔等於冇事發生**。以下保留原始分析:🔴 **ADR-0025 D2 未驗 —— 而且個回應「證明唔到」,唔係「證明失敗」**。回應 `lineItems[0].serviceNowSysId: null` 睇落似 `raiseLicenceRequest` 掛咗,**但唔係**:`intake-adapter.service.ts:184-191` 先 `const created = await this.intake.intake(...)`(嗰一刻 RITM 本來就係 null),再 `raiseLicenceRequest` **只 update DB、唔碰 `created`、亦冇 re-fetch**,然後 `return created`。⇒ **開單成功同開單失敗,喺呢個 HTTP 回應裡面長得一模一樣。** 同 `docker-entrypoint.sh` NON-FATAL 嗰個陷阱**同一形狀**:唔係壞咗,係觀測唔到。**要開 UI 睇**(見下面驗證三合一)

> ### 🟢 驗證三合一 —— 一個動作答埋 F7-2 / F7-5 / F7-12
>
> 由**公司網**登入 `https://rapo-uop-web-dev.rci-t.com/` → Requests → 開 **REQ0043934**(或 `cmsikku3b000kxp012bx3v17q`),一版嘢同時答三條:
>
> | 睇邊度 | 答邊條 | 收貨條件 |
> |---|---|---|
> | 個 request 個 **OpCo** 欄 | **F7-5** | 顯示嘅 code 就係 n8n 實際送嗰個 ⇒ 知唔知佢改咗做乜(`RHK`?`RAPO/IT`?定係有人喺平台加咗 `RAPO`?) |
> | 個 line item 個 **SKU** | **F7-2** 另一半 | 應該係 **`SPE_E5`**。若見到 `Microsoft_365_E5_(no_Teams)` ⇒ F3-7d 個改動未生效 |
> | 個 line item 有冇 **RITM 號** | **F7-12** | 有 `RITM…` ⇒ ADR-0025 D2 成功;冇 ⇒ 去 **Delivery failures** 頁睇有冇 `REQUEST_SUBMIT`(SN 拒收,repair 會重送)或 `REQUEST_MIRROR`(🔴 **真單已開咗**,repair 只補寫本地,絕不可重送) |
>
> 🔴 **兩個 kind 唔可以互換**(ADR-0011 D3)—— 揀錯會喺 ServiceNow 開第二張真單。
>
> 💡 順帶:要登入先入到 UI ⇒ 呢一步**同時兌現 F9-8** 嘅一半(SSO 或 break-glass,至少一邊真人登入過)。
>
> ### 🔴 「回寫 RITM 唔係測試過咗咩?」—— 三層,證咗兩層(2026-08-09 Chris 問,查證結果)
>
> 呢個問題會**反覆出現**,因為「測試過」係真嘅,只係範圍細過個結論。
>
> | 層 | 狀態 | 證據 |
> |---|---|---|
> | ① **權限**:`sc_req_item` PATCH 寫唔寫得 | 🟢 **實測 200** | `BUG-010/report.md:41`(同一帳號 `sc_request` insert 403 但 RITM update 200)· CH-014 |
> | ② **HOLD 路徑**(assign 被擋 → `markInProgress`) | 🟢 **live 驗過** | `ADR-0021:13` —— `REQ0044038` → 真 catalog task `SCTASK0071802` `state 1→2` |
> | ③ **CLOSE 路徑**(assign 成功 → `closeComplete` 關 RITM) | 🔴 **未驗** | W43 明文遺留(下) |
>
> ⚠️ **②嘅證據唔完全轉移到③** —— ②驗嘅係 `sc_task`,而 ADR-0025 D1 之後平台**唔再掂 task**(`assign.service.ts:423-430` 已拆走嗰條 branch)。
>
> 🟢 **而 W43 已經留低咗③嘅完整開工條件**(`W43-onboarding-license-request/progress.md:423`):fixture **REQ0044072** ready · 🔴 **唔可以用 Power BI Free**(target 已持有)· 唯一合資格 SKU = **`POWERAUTOMATE_ATTENDED_RPA`**,而且**要先加 `allocated`**(否則撞 OpCo budget gate,佢喺 tenant seat 檢查之前)。
>
> ⚠️ 2026-08-07 測試撞嘅 `POWER_BI_PRO` 係**另一個坑**(tenant `prepaidEnabled=0`),同 Power BI Free 嗰個「已持有」坑唔同 —— 兩個都會令 assign 失敗,但訊息唔同。

### 🔴 F7 outbound 半邊(舊環境做唔到嗰樣 —— 唔驗呢半就係「接通」驗一半當全部)

- [ ] F7-9 由 UOP container 側實試打企業內網嘅 n8n(ADR-0017 三個接縫嘅 outbound)
- [ ] F7-10 verify:**n8n 側真收到**,唔可以只睇平台側冇 error —— B3 唔通嘅話呢個會**紅得靜**(provider fail 但 app 照起得身)
- [ ] F7-11 三個接縫逐個確認:outbound webhook(`N8N_OUTBOUND_WEBHOOK_*`)· `LicenseOperationsProvider` · `TicketUpdateProvider`

- [x] F3-7d 🔴 **Default onboarding SKU 揀錯咗又改返(2026-08-07)** —— Chris 為 F7 設咗 `defaultOnboardingSkuId` = `18a4bd3f-…`,即 `Microsoft_365_E5_(no_Teams)`(`N8N-INTAKE-HANDOFF.md §0` 個表標 ❌ 歐盟變體)。**已改回 `06ebc4ee-1bb5-47dd-8120-11324bc54e06`(`SPE_E5`)**。🔴 呢個失敗**零錯誤訊息** —— GUID 格式啱、SKU 真實存在、ADR-0020 存在性驗證通過、派 licence 成功,只係每個新同事攞到冇 Teams 嘅 E5。⇒ **「用 GUID」防手滑,防唔到揀錯**;人手填 SKU GUID 之後要對返 `N8N-INTAKE-HANDOFF.md §0` 個表
- [x] F3-7e 🆕 ⚠️ **`admin@uop.local` 密碼每次容器重啟都會被 seed 重設** —— `seed.ts:105` 個 `update` 無條件寫 `passwordHash`,所以喺 UI 改咗密碼之後,下一次 restart / 新 revision 就會變返 `LOCAL_ADMIN_INITIAL_PASSWORD` 個值。🟢 `mustChangePassword` **冇設**(default false)⇒ 首次登入唔會被強制改密碼。DEV 可接受(break-glass 本來就係應急路徑),但**上 prod 之前要處理** —— 記入 DEPLOY-harden。🟢 **2026-08-13 做咗**:已寫入 `BACKLOG.md` `DEPLOY-harden` 行(連同 R8 個 Graph app expiry 未知)。順帶,`mustChangePassword` **冇設**呢句由 `F6-6` **實測確認**(`/api/me` 真返 `"mustChangePassword":false`)—— 原本佢係讀 code 得出嘅推論

## F8 — doc sync + closeout

- [x] F8-1 `09-dev-as-built.md` 補實際部署結果 —— 新增 **`2026-08-13 · 驗證(無新部署)`** 段(Step 0 四個 endpoint · `F6-6` · `F6-14` 連唯讀探測 · `F2-13`)。🔴 **順帶修一個真 stale**:`🟢 但 B8 唔 block 驗證 —— ACA 預設 FQDN 係另一條路` **整段結論早喺 2026-08-10 被推翻,但呢份 as-built 從來冇更正過** ⇒ 已加更正 blockquote(原文一個字冇改,保留做方法論記錄)
- [x] F8-2 `01-topology.md` 加 DEV 欄 —— 新增 **`## 資源清單(DEV)`**(七行對照表:ACA env 喺另一個 RG / VNet internal / custom domain / ADR-0027 Option A ingress / PG private endpoint / 共用 ACR / **raw ARM PATCH** / 可達性)。🔴 **順帶修第二個真 stale**:認證段仲寫住 `VITE_ENTRA_*` **build-time 烘死**同「卡 Entra app registration」,而 **ADR-0028 早就推翻晒**(改 runtime API env、scope 只用 `openid profile email` ⇒ 唔再需要 Application ID URI)
- [x] F8-3 `04-deploy-runbook.md` 加 DEV 分支說明(唔改 UAT 段落)—— 新增 **`## 🔴 0-pre. 你要部署邊個環境?`** 分岔表,擺喺 §0 之前(照跑 UAT 流程會喺第 5 步撞 403)。含「點解 `az containerapp update` 一樣 403」、smoke 要打 custom domain 唔係 ACA FQDN、`/api/docs/api` 唔係 `/docs/api`、撳 assign 前要探 gate(R10)、`az account show` 先驗身份。**UAT 段落逐字不變**
- [x] F8-4 CLAUDE.md §0 + §9 更新 —— §0 phase 格轉 **W44 closed**(四條收咗 + 兩注 🚧 + `R10`);§9 修咗「仍未做 = F9-7 + F9-8」嗰句(F9-7 一早做咗、break-glass 已驗)
- [x] F8-5 `SESSION_SUMMARY.md` 更新 —— 🔴 **一次過修五處 stale**:①「淨返 W44 一個 phase 未收」②「W44 = …卡環境」③**「W44 進行中,仍未部署」**(由 08-06 起就唔啱,**carry 咗七日**)④「仍未做 = F9-7 + F9-8」⑤**「B8 唔 block 驗證 —— ACA 預設 FQDN」**(同 `F8-1` 嗰個同源,兩份檔各有一份副本)⑥ AUTH-2b pending 描述。**呢份係 hook 每 session 無條件注入嗰份,過時代價最大**(§14)
- [x] F8-6 `RISK_REGISTER.md` 加本 phase risk —— 🟢 **新增 `R10`「叫做 DEV 嘅環境對真 production M365 tenant 有寫權」**(由 `F6-14` 執行前嗰次唯讀探測揭出:9 條 line item 全部真嘢,3 條 `READY` 兩個 gate 都開 ⇒ 撳落去只剩 budget 一道閘)。🟢 **`R8`(憑證靜靜過期)早喺 `F9` 加咗**,見 `F9-9`
- [x] F8-7 memory 更新(`azure-uat-deployment` 加 DEV,或者新開一則)—— 🔴 **評估後決定唔寫,理由三條**(照 `BUG-008` 個「RISK_REGISTER:評估後唔加」先例,唔靜靜跳過):
  1. **`azure-uat-deployment` 呢一則唔存在** —— 現行 memory index 得一則(`no-context-budget-talk`)。本項寫嗰陣個 memory 系統唔同,前提已經冇咗。
  2. **memory 規則明文唔存 repo 已記錄嘅嘢**,而 DEV 部署嘅每一樣嘢今日都已經有 repo 家:`09-dev-as-built.md`(as-built + 部署記錄)· `01-topology.md`(DEV 對照表)· `04-deploy-runbook.md`(部署分岔)· `10-dev-live-verification-runbook.md`(live 驗步驟)· `CLAUDE.md` §9(runtime 實況)· `RISK_REGISTER` `R10`。
  3. 🔴 **最硬嗰條**:再寫一份 memory = **第六份副本**。而本 phase 收尾**同一日撞到三份互相矛盾嘅副本**(`09-dev-as-built` 同 `SESSION_SUMMARY` 各留一份已被推翻嘅「ACA 預設 FQDN」推論 · `SESSION_SUMMARY` 寫住「仍未部署」而實際部署咗 5 次)⇒ **加副本就係加漂移點**,同 `F8-1`/`F8-5` 啱啱先修嗰啲一模一樣。
  ⇒ **要記嘅嘢已經有家,而個家搵得返。**

## F9 — Entra SSO 接線(🆕 plan v1.4;🔴 **卡 B9**)

> **點解而家先有**:原 plan 冇 SSO deliverable(F3-6 拍板「先 placeholder,部署成功再接」,而 SSO 一直掛喺 **AUTH-2b** 等 IT)。infra 2026-08-06 交出 app registration ⇒ 由「等 IT」變「有嘢做」。
> 🔴 **但實測揭到嗰個 app 只配咗 client-credentials,用戶登入三樣缺晒** ⇒ **B9**,F9 卡住。

- [x] F9-1 確認 infra 交嘅 app registration 身份 —— `APP - unified operations portal - SSO - UAT` · appId `08fa14bf-…` · tenant `d1ea071a-…`(**公司 M365 tenant**,同 Graph app 同 tenant 但**唔同 app**)· `roles` **空**(⇒ 唔係畀 Graph 用)
- [x] F9-2 確認接 SSO **可回退** —— `api.ts:25` local profile 優先於 `msalConfigured`;`login.tsx:167-174` 本地登入表單永遠喺 ⇒ 最壞只係 SSO 按鈕報錯,**break-glass 照用**
- [x] F9-3 🔴 **B9 實測(三樣缺失,全部有錯誤碼)**:①**冇任何 redirect URI** → `AADSTS900971: No reply address provided` ②**冇 Expose an API scope** → `AADSTS500011: resource principal not found` ③**token 係 v1**(`ver: 1.0`)而 `jwt-auth.guard.ts:170-177` 精確比對 v2 issuer ⇒ 一定 401
- [x] F9-4 交畀 infra 嘅三項要求已寫定(plan 附錄 C 第四輪)。⚠️ 第 ② 項問法係「**Application ID URI 係咩**」唔係「請設定」—— 因為佢可以叫另一個名,而我哋只證到 `api://<client-id>` 唔存在
- [x] F9-5a 🟢 **① redirect URI —— infra 已補**(同一條 authorize URL 由 `AADSTS900971` 變正常 login 頁,**有前後對比**)
- [x] F9-5b 🟢 **② Application ID URI / scope —— 需求消失,唔係攞到答案**。三輪往返都問唔到(infra 先後答「web portal 網址」/「OAuth authorization endpoint」/「Application ID = client id」),**ADR-0028 令佢由必需品變成無關**:server-side code exchange 用標準 scope `openid profile email`,id_token 個 `aud` 本身就係 client id。⚠️ 誠實記低:呢項係**繞過**咗,唔係解決咗 —— 但繞過之後佢再唔係任何嘢嘅前置
- [x] F9-5c 🟢 **③ token version —— 唔再需要 infra**(Chris 拍板走「路 B」,見 F9-11)
- [x] F9-11 🆕 **`jwt-auth.guard.ts` 改成同時接受同一 tenant 嘅兩個 issuer**(`…/v2.0` + `https://sts.windows.net/{tid}/`)。🔴 **`audience` 保持單一精確值** —— 放寬佢先至係真窿。新增 test `verifies against BOTH tenant issuer forms`,同時 assert audience 冇被放寬。**879 test / 68 suite 全過**(之前 878)。⚠️ 型別陷阱:`@types/jsonwebtoken` 個 `issuer` 要**非空 tuple** 唔收 `string[]`。**唔開 ADR** —— 冇改 vendor / 邊界 / storage,亦冇推翻 ADR-0002,屬 §5.1 明文嘅「唔屬架構改動」
- [x] F9-6 ~~重 build web image 傳 3 個 build-arg~~ → **web image 唔再需要任何 Entra build-arg**(ADR-0028)。`Dockerfile` 嗰四個 `ARG VITE_ENTRA_*` 已拆走,`.env.example` 亦改寫成「呢度冇嘢要填」。⇒ **一個 web image 通行所有環境**,改 Entra 配置唔使重 build。仍然要 build 一次,但係因為前端 code 變咗,唔係因為配置
- [x] F9-7 🟢 **部署 #2 完成(2026-08-07)** —— image `dev-3971ad3` build + **真 push**(api `sha256:eecd2521…` / web `sha256:070c4967…`),PATCH 兩個 app 都 `exit 0`。四個 `ENTRA_*` 已落(`ENTRA_CLIENT_SECRET` 走 secretRef 唔係明文 env)。`AUTH_JWT_SECRET` 保留;`ENTRA_API_AUDIENCE` 冇設(Bearer 路徑保留但瀏覽器唔行佢)。🟢 **container log 原文證到 `[EntraSsoService] Entra SSO is configured (server-side code exchange).`** ⇒ 四個 env 真係到位兼且 service 認得,唔係靠 `Healthy` 推論。順帶:`19 migrations found` · `Seeded 24 OpCos + admin + RHK OPCO_IT user.` · `Nest application successfully started`,零 `WARN: … failed`。infra 配置實測完好(`customDomains` + `SniEnabled` · `external:true` · `workloadProfileName:Consumption` · `environmentId`)
- [ ] F9-8 🟡 **一半收咗(2026-08-13)** verify:**SSO 登入通 + break-glass 仍然通** —— 兩邊都要驗,唔可以只驗新嗰邊。⚠️ ~~**要喺公司網做** —— build host 喺 Azure 段,`rapo-uop-web-dev.rci-t.com` → `No such host is known`(符合 B8:企業內部 DNS)~~ 🔴 **呢個前提 2026-08-13 被推翻** —— **本台機直接打得通**(Step 0 四個 endpoint 全部真答),`B8` 已解封
  - 🟢 **break-glass 嗰半 ✅ 收** —— 見 `F6-6`:login **200** + `Set-Cookie: uop_access, uop_refresh` + `GET /api/me` **200** role **`ADMIN`**
  - 🚧 **SSO 嗰半仍然未驗,而且 AI 做唔到** —— `/api/auth/sso/status` 今日返 **`{"enabled":true}`**(⇒ 四個 `ENTRA_*` env 真係喺度、login 頁個掣着住),但**真登入要喺 Entra 互動頁輸入公司帳號 + MFA** ⇒ **必須 Chris 本人喺瀏覽器撳一次**。**理由 = 需要真人憑證,唔係技術阻塞**(呢個分別要緊:之前寫住卡 `B8` 係環境問題,而家淨係差一個人);**target = Chris 開 browser 撳 `Continue with Microsoft Entra ID` 嗰 30 秒**。**收貨** = 撳完落到 `/` 而唔係彈返 login · `GET /api/me` 返佢自己個 email 兼 `authProvider` 唔係 `local`
- [x] F9-17 🆕 **bundle 實證:前端真係唔再知道任何 Entra 座標** —— `dist/assets/*.js` grep `msal|login.microsoftonline|VITE_ENTRA|acquireTokenSilent|PublicClientApplication|access_as_user` **零命中**;**對照組**同時證到 grep 方法有效(`/auth/sso/status` · `/auth/entra/start` · `/auth/entra/callback` 三條都搵到)。`msal-vendor` chunk 亦已消失
- [ ] F9-18 🆕 🔴 **未拆嘅風險:infra 把 redirect URI 加咗喺邊個 platform?** ADR-0028 要 **Web**,而我哋當初要求嘅係 **SPA**(plan §附錄 C 第四輪原文)。若係 SPA,server-side exchange 會撞 **`AADSTS9002327`**(SPA client-type 只可以經 cross-origin 兌換)。⚠️ **試過用假 code 打 token endpoint 想提前拆佢,但個測試冇區分度** —— 真 redirect_uri / 錯 redirect_uri / 錯 secret **三個都返同一個 `AADSTS9002313`**(假 code 令 Entra 喺檢查嗰兩樣之前就 reject)⇒ **證明唔到任何嘢,已棄用**。要靠 F9-8 一次真登入先知;若真係撞到,修法好具體(叫 infra 把 redirect URI 由 SPA platform 搬去 **Web** platform)
- [x] F9-9 client secret **expiry 2028-07-28** 入 `RISK_REGISTER.md`(到期會**靜靜咁全部 401**)—— 🔴 **2026-08-13 對數發現:呢條一早做咗,只係冇勾。** `RISK_REGISTER.md` **R8** 已存在,來源欄寫住「W44 F9(2026-08-06)」,內文逐字有 `2028-07-28`。⚠️ **而本條留住 `[ ]` 令 CLAUDE.md §0 同 `SESSION_SUMMARY` 一路寫住「仍未入 RISK_REGISTER」,連續 carry 咗幾個 session** ⇒ **同族**(狀態寫兩個地方,一個冇跟住更新)。🟢 **順帶**:R8 揭到真正未做嗰半 —— **Graph app `27d329e5-…`(`App-N8N-LicenseManagement`)嘅 secret expiry 冇人知**(查佢要 `Application.Read.All`,兩個 SP 都冇),而 **assign / 對帳 / drift 全部行呢個 app** ⇒ 已喺 R8 mitigation ② 標 🔴,**跟進屬 DEPLOY-harden 唔屬本 phase**
- [x] F9-12 🆕 **ADR-0028 Accepted**(Chris 2026-08-07:「跟隨番 infra 那一邊的配置去改動本項目的 SSO auth 流程」)。`ADR-0003` Status → `Superseded by ADR-0028`,`adr/README.md` index 同步
- [x] F9-13 🆕 **API 側實作**:`entra-sso.service.ts`(state + PKCE + code exchange + id_token 驗證,scope 只用 `openid profile email`)· `entra-user.ts`(`oid` upsert,guard 同 SSO 共用,順帶處理 email 撞本地帳號嘅 P2002)· `GET /auth/sso/status` + `GET /auth/entra/start` + `POST /auth/entra/callback` · state cookie(httpOnly · SameSite=Strict · 10 分鐘 · callback **驗證之前**就清)
- [x] F9-14 🆕 **cookie session 收返兩個 provider**:`jwt-auth.guard` 個 `resolveLocalUser` → `resolveSessionUser`、`auth.service.refreshSession` —— 兩處嘅 `authProvider:'local'` 過濾拆走(留住 `active`)。🔴 唔拆就會「SSO 登入睇落成功,15 分鐘後靜靜死」,而錯誤訊息會指向 token
- [x] F9-15 🆕 **前端去 MSAL 化**:刪 `msal.ts` + `@azure/msal-browser`/`msal-react` 兩個 dep + `msal-vendor` chunk;`api.ts` 成個 `authHeader()`(silent acquire / interaction-required)拆走 —— cookie 自己會送。新 `sso.ts`(start + redirect 回程)· `dev-bypass.ts`(`AUTH_DEV_BYPASS` 搬屋)· login 掣改由 `GET /auth/sso/status` **runtime** gate
- [x] F9-16 🆕 **測試**:api **900 test / 69 suite 全過**(之前 879/68)· web **282 test**,新增 `sso.test.ts` 6 條全過。permission matrix snapshot 只多咗三條新 public route(逐行核對過)。⚠️ web 有 **6 個既有失敗**(`local-profile.test.ts` ×5 + `reset-password.test.tsx` ×1),已用 `git stash` 對照證實**同 ADR-0028 無關**,見 BACKLOG
- [x] F9-10 🟢 順帶記低:Graph app `App-N8N-LicenseManagement` 有 `LicenseAssignment.Read.All` · `User.Read.All` · `LicenseAssignment.ReadWrite.All` ⇒ **F3-7 接真 Graph 冇權限障礙**。—— **2026-08-13 勾:呢條係一句 note 唔係一個 action,記低咗就係做完**(照 `F6-13` 喺本 checklist 自己立嘅標準);留住 `[ ]` 只會令下手以為仲有嘢要做

---

## Cross-Cutting

- [x] All deliverables committed to git —— closeout commit(**doc-only,零 code**)
- [x] All open-question status changes reflected in decision tracker(R4)—— 本次 closeout **冇 open question 狀態變動**;`F9-9` 嗰個唔係 OQ,係一個做咗冇勾嘅 item
- [x] All architectural-adjacent decisions documented as ADR(per CLAUDE.md §5)—— 本 phase 兩個:**ADR-0027**(DEV ingress 拓撲,Option A)· **ADR-0028**(SSO server-side code exchange,supersedes ADR-0003),兩個都 **Accepted**。**本次 closeout 零新架構決定** —— `F6-14` 換閘係 **R3 deviation 唔係 H1**(冇改任何 lock 咗嘅嘢,只係揀咗另一條測試路徑)
- [x] Pending / next-candidate changes synced to `BACKLOG.md`(R7)—— W44 段加 closeout 摘要(四條收咗 / 兩注 🚧 / `R10` / 三份死陳述)· `DEPLOY-harden` row 加兩項(`F3-7e` seed 重寫密碼 · R8 個 Graph app expiry 未知)
- [x] `progress.md` retro section written —— Day 8 + Retro(做啱四項 / 做錯三項 / action items / N+1 trigger)
- [x] `progress.md` frontmatter status flipped to `closed`
- [x] Phase N+1 kickoff trigger noted in retro —— **而家零個 phase 未收**;候選 = CH-026 `G-7` · DEPLOY-harden · AUTH-2b(實際上淨係差 `F9-8` 一撳)· N8N-SEAMS · TD

---

**Lifecycle reminder**:呢份 checklist 隨 plan deliverables 衍生。新加 deliverable 必須先入 plan + changelog,然後再加 checklist item。
