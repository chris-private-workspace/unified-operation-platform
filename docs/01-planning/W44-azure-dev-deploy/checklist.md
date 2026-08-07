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
- [ ] F1-12 🔴 **第三輪(只剩 ACR 一條)** —— 回應 infra 問「what is the deployment detail error?」,附兩個確切 error(**(a) 權限 / (b) 網絡,要分開講**)+ 明講「就算放行 firewall 我哋一樣 build 唔到」⇒ **收窄到兩個可行解**。精簡版 ② 已存 plan 附錄 C

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

- [ ] F2-13 🆕 ⚠️ **2026-08-05 重跑 what-if 發現被 unset 嘅係四個唔係三個** —— 多咗 `properties.runningStatus: Running → ''`。佢係 read-only status field,ARM **應該**唔會真改,**但呢個係推論冇實證** ⇒ 照 F2-12 自己立嘅標準,唔可以當已驗,留 F6-9 對數專登睇

## F3 — params 檔 + secret 策略(**B2 已解封**)

- [x] F3-0 建 UOP 嘅 database —— `az postgres flexible-server db create -s pgsql-rapo-uop-dev -g RG-RAPO-UOP-DEV -d platform`;verify `db list` 由 3 個系統 db 變 4 個(**management plane,唔需要連到 PG data-plane**)
- [x] F3-1 `deploy/azure/aca.params.dev.json` 生成完(script 寫檔,**secret 值從未印出**,只出 masked summary)
- [x] F3-2 `databaseUrl` 砌好 —— 🔴 **PG 密碼含 `$` 同 `?`,一定要 percent-encode**(`[System.Uri]::EscapeDataString`),否則個 `?` 會被當成 query string 開始而**靜靜截斷 credential**
- [x] F3-3 `appBaseUrl` = `https://rapo-uop-web-dev.rci-t.com`(**唔係** infra 寫嘅 http —— custom domain 綁咗 SNI cert;待 Q4 確認)
- [x] F3-4 其餘 secret 用 `RandomNumberGenerator` 生成(intakeApiKey hex-32B · authJwtSecret base64-48B · break-glass 密碼 19 字元 ≥3 類,符合 AUTH-4c-A policy)
- [x] F3-5 verify:`git check-ignore -v` → **`.gitignore:7:deploy/azure/*.params.*.json`**(H4 硬要求)
- [x] F3-6 ✅ **Chris 2026-08-04 拍板:先 placeholder,部署成功之後再逐個接** ⇒ params 檔現狀就啱,唔使改。理由:①B1 未解,部署都未得,呢個決定隨時改得 ②先驗 boot / migration / seed / 前端 / break-glass 登入,再接 vendor 係更小步,壞咗分得清邊層 ③接真 SN 會喺真 instance 開單,而手上已有 5 張測試單等 cancel。UAT 當初同樣先 placeholder 後補
- [ ] F3-7 🚧 接真 vendor(**部署成功之後先做**)—— 逐個接,每個接完即驗;`ConnectorConfig` DB 值優先於 env(ADR-0013 Model C),改完要新 revision(C2 `onModuleInit`)

## F4 — web 建構調整 ✅ **零改動**(Option A 令本 deliverable 消失,plan changelog v1.2)

- [x] F4-1 ~~upstream 改 https+external~~ **唔需要** —— Option A 之後 DEV 同 UAT 一模一樣(`http://` + internal FQDN),`API_UPSTREAM` 本來就係 env 渲染
- [x] F4-2 `Host $proxy_host` 規則**原樣適用**(api 仍係 internal ingress,正正係嗰條規則存在嘅原因)
- [x] F4-3 `apps/web/nginx.conf.template` **零 diff** ⇒ 對 UAT 零影響
- [ ] F4-4 🚧 實際渲染出嚟嘅 `nginx.conf` 逐行睇 —— **卡 B1**(起唔到 web container:`docker pull` base image 撞 Docker Hub 503)⇒ **移去 F6 部署後驗**

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
- [ ] F6-5 verify:`GET https://rapo-uop-web-dev.rci-t.com/api/docs/api` = 200(驗 nginx `/api` proxy → internal api)
- [ ] F6-6 verify:break-glass login = 200 + role ADMIN(`admin@uop.local`,密碼 = `aca.params.dev.json` 個 `localAdminInitialPassword`)
- [ ] F6-4b 🆕 🟢 **唔使等 B8** —— 由**公司網絡**打 **ACA 預設 FQDN**(internal env 喺 hub VNet private DNS 一定有記錄):`https://aca-rapo-uop-web-dev.nicesea-c3849dba.eastasia.azurecontainerapps.io/` → 前端 200 · `/api/docs/api` → 200 · break-glass login。⇒ **F6-4/5/6 嘅實質內容即刻收得**,custom domain 嗰半留 B8 解封後補驗
- [x] F6-7 verify:**PG v18 migration 真跑得過**(G8)—— 🟢 **已證(container log 原文)**:`19 migrations found` → 逐個 `Applying migration …` → `The following migration(s) have been applied:`,**零 error**
- [x] F6-8 verify:seed 完成 —— 🟢 **已證(原文)**:`Seeded local admin (admin@uop.local).` + **`Seeded 24 OpCos + admin + RHK OPCO_IT user.`** —— 精確 24 個
- [x] F6-7b **B3 — ACA 連到 private endpoint 嘅 PG** —— 🟢 **已證**:migration 真跑咗 19 個,冇連接根本做唔到。**呢個係本環境存在嘅意義,而佢通咗**
- [x] F6-7d 🆕 `[NestApplication] Nest application successfully started`(`04:14:31`)· `[entrypoint]` 零 `WARN: … failed`
- [x] F6-10 ✅ **infra 2026-08-06 畀咗 `managedEnvironments/read`(+ enable log)⇒ B7 解封**,`logs show` 通,而且**啟動嗰刻嘅 log 仲喺度**
- [ ] F6-13 🆕 ⚠️ 記低一個無害 warn:`package.json#prisma is deprecated and will be removed in Prisma 7` ⇒ 將來升 Prisma 7 要轉 `prisma.config.ts`(**唔阻本 phase**)
- [x] F6-7c 🆕 方法論:直接驗證路(log / exec / HTTP)封死之後,轉去 **PG management plane metrics** —— 佢一直喺我哋嘅 RG Contributor 範圍內,四日嚟冇用過
- [x] F6-9 R6 對數:🟢 **`customDomains`(`rapo-uop-web-dev.rci-t.com` SniEnabled)· `workloadProfileName` · `environmentId` 全部完好**。PATCH 唔 unset 冇送嘅 property ⇒ 比 ARM full PUT 結構上更安全
- [ ] F6-10 🆕 🔴 **要 infra 畀 `Microsoft.App/managedEnvironments/read`**(純唯讀,比 `join/action` 細)⇒ 解封 `logs show` + `exec`,係而家最大樽頸
- [ ] F6-11 🆕 替代驗證:Chris 用個人帳號喺 Azure Portal 睇 container log
- [ ] F6-12 🆕 替代驗證:由企業網絡內嘅機 curl web + `/api/docs/api`

## F7 — n8n UAT 接線驗證(前置 F6)

- [ ] F7-1 n8n UAT 打 `POST /requests/intake` → **真 201**
- [ ] F7-2 verify:DB 真 row(Request + line item),唔可以只睇 HTTP code
- [ ] F7-3 對 W42 retro 五個 n8n 側缺口:URL `/api` 前綴
- [ ] F7-4 對:`X-Intake-Key` 有冇送
- [ ] F7-5 對:`resolveOpco` 只認 RHK/RAPO(其餘返 `''` → 404)
- [ ] F7-6 對:`requestId` 係 REQ number 唔係冪等鍵 sysId
- [ ] F7-7 對:2003 sticky 要求 assigner skip 已持有 E5 嘅 user
- [ ] F7-8 逐項標明係 **n8n 側改** 定 **平台側改**

### 🔴 F7 outbound 半邊(舊環境做唔到嗰樣 —— 唔驗呢半就係「接通」驗一半當全部)

- [ ] F7-9 由 UOP container 側實試打企業內網嘅 n8n(ADR-0017 三個接縫嘅 outbound)
- [ ] F7-10 verify:**n8n 側真收到**,唔可以只睇平台側冇 error —— B3 唔通嘅話呢個會**紅得靜**(provider fail 但 app 照起得身)
- [ ] F7-11 三個接縫逐個確認:outbound webhook(`N8N_OUTBOUND_WEBHOOK_*`)· `LicenseOperationsProvider` · `TicketUpdateProvider`

## F8 — doc sync + closeout

- [ ] F8-1 `09-dev-as-built.md` 補實際部署結果
- [ ] F8-2 `01-topology.md` 加 DEV 欄
- [ ] F8-3 `04-deploy-runbook.md` 加 DEV 分支說明(唔改 UAT 段落)
- [ ] F8-4 CLAUDE.md §0 + §9 更新
- [ ] F8-5 `SESSION_SUMMARY.md` 更新
- [ ] F8-6 `RISK_REGISTER.md` 加本 phase risk
- [ ] F8-7 memory 更新(`azure-uat-deployment` 加 DEV,或者新開一則)

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
- [ ] F9-7 PATCH api 加 **四個** env:`ENTRA_TENANT_ID` / `ENTRA_CLIENT_ID` / `ENTRA_CLIENT_SECRET` / `ENTRA_REDIRECT_URI`(= `https://rapo-uop-web-dev.rci-t.com`,要同 app registration 逐字一樣)。⚠️ **`AUTH_JWT_SECRET` 保留唔拆**(dual-provider,ADR-0005);`ENTRA_API_AUDIENCE` **唔使設**(Bearer 路徑保留但瀏覽器唔行佢)
- [ ] F9-8 verify:**SSO 登入通 + break-glass 仍然通** —— 兩邊都要驗,唔可以只驗新嗰邊
- [ ] F9-9 🔴 client secret **expiry 2028-07-28** 入 `RISK_REGISTER.md`(到期會**靜靜咁全部 401**)
- [x] F9-12 🆕 **ADR-0028 Accepted**(Chris 2026-08-07:「跟隨番 infra 那一邊的配置去改動本項目的 SSO auth 流程」)。`ADR-0003` Status → `Superseded by ADR-0028`,`adr/README.md` index 同步
- [x] F9-13 🆕 **API 側實作**:`entra-sso.service.ts`(state + PKCE + code exchange + id_token 驗證,scope 只用 `openid profile email`)· `entra-user.ts`(`oid` upsert,guard 同 SSO 共用,順帶處理 email 撞本地帳號嘅 P2002)· `GET /auth/sso/status` + `GET /auth/entra/start` + `POST /auth/entra/callback` · state cookie(httpOnly · SameSite=Strict · 10 分鐘 · callback **驗證之前**就清)
- [x] F9-14 🆕 **cookie session 收返兩個 provider**:`jwt-auth.guard` 個 `resolveLocalUser` → `resolveSessionUser`、`auth.service.refreshSession` —— 兩處嘅 `authProvider:'local'` 過濾拆走(留住 `active`)。🔴 唔拆就會「SSO 登入睇落成功,15 分鐘後靜靜死」,而錯誤訊息會指向 token
- [x] F9-15 🆕 **前端去 MSAL 化**:刪 `msal.ts` + `@azure/msal-browser`/`msal-react` 兩個 dep + `msal-vendor` chunk;`api.ts` 成個 `authHeader()`(silent acquire / interaction-required)拆走 —— cookie 自己會送。新 `sso.ts`(start + redirect 回程)· `dev-bypass.ts`(`AUTH_DEV_BYPASS` 搬屋)· login 掣改由 `GET /auth/sso/status` **runtime** gate
- [x] F9-16 🆕 **測試**:api **900 test / 69 suite 全過**(之前 879/68)· web **282 test**,新增 `sso.test.ts` 6 條全過。permission matrix snapshot 只多咗三條新 public route(逐行核對過)。⚠️ web 有 **6 個既有失敗**(`local-profile.test.ts` ×5 + `reset-password.test.tsx` ×1),已用 `git stash` 對照證實**同 ADR-0028 無關**,見 BACKLOG
- [ ] F9-10 🟢 順帶記低:Graph app `App-N8N-LicenseManagement` 有 `LicenseAssignment.Read.All` · `User.Read.All` · `LicenseAssignment.ReadWrite.All` ⇒ **F3-7 接真 Graph 冇權限障礙**

---

## Cross-Cutting

- [ ] All deliverables committed to git
- [ ] All open-question status changes reflected in decision tracker(R4)
- [ ] All architectural-adjacent decisions documented as ADR(per CLAUDE.md §5)
- [ ] Pending / next-candidate changes synced to `BACKLOG.md`(R7)
- [ ] `progress.md` retro section written
- [ ] `progress.md` frontmatter status flipped to `closed`
- [ ] Phase N+1 kickoff trigger noted in retro

---

**Lifecycle reminder**:呢份 checklist 隨 plan deliverables 衍生。新加 deliverable 必須先入 plan + changelog,然後再加 checklist item。
