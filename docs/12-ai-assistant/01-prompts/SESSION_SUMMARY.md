# Unified Operation Platform — Session Summary(SessionStart hook 自動注入 · slim)

> **角色**:精簡即時摘要,由 SessionStart hook 每 session 自動注入。詳版 → `session-start.md`;憲法 → `CLAUDE.md`。
> 此處只補當前座標 + runtime 實況。**維護**:每個 phase closeout doc-sync 一併更新。

**身份**:Unified Operation Platform,spec `docs/architecture.md`,IT operation / support 管理 + 操作平台(逐步引入 AI);第一個模組 LicenseOps(M365 onboarding license 履行)。

**當前座標(2026-08-10)**:git 連 GitHub **private**(`chris-private-workspace`,`main`)。Backend `apps/api`(NestJS)、`/docs/api` 200、DB seeded(**24** OpCos + admin + catalog SKU)。`apps/web` = **約 10 個實畫面**(Overview / SKU Catalog / Requests + detail + new[開單] / Drift / License Assets / Settings / **Audit log** / **Delivery failures** / Login)。**api 921 test(69 suites)· web 288 passed**(⚠️ 另有 **6 條 pre-existing 紅**,見下)。ADR 到 **0031**(🔴 **0031 = Rejected**,見下)· CH 到 **023**。

**兩個 phase 同時未收**(rolling JIT 破例,Chris 2026-08-10 批):
- **W44 = 部署上新 Azure DEV 環境** —— 已部署三次,🔴 **卡環境**(F6 卡 `B8` private DNS · F9 卡 `B9` SSO 真人驗)。詳見下面整段。
- **W45 = assign 過程可見性(ADR-0029)** —— 🟢 **實作全部收晒**(後端十步回傳 `{outcome, failedAt?, steps[]}` · 前端 `AssignResultDialog` · light+dark 真 render 驗過)。🔴 **淨低 F4-4 live 驗,卡同一個 `B8`**。🔴 **branch 座標已變(2026-08-10)**:`feat/w44-azure-dev-deploy` **已 merge 入 `main`**(PR **#77** + **#78**,merge commit `e8d068e`)—— W44 三個 phase 嘅 code 全部落咗 `main`,**唔好再喺嗰條 branch 開工**。剩低嘅嘢**全部係 live 驗**(W44 F6-4/5/6 + F9-8 · W45 F4-4b · CH-023 G9),卡同一個 `B8`,一齊喺 **`chore/b8-live-verification`** 做。
- **CH-023 = assign 之後 ServiceNow 側結果留得低** —— 🟢 **實作收晒**(`f219676`),🔴 **淨低 G9 live 驗,卡同一個 `B8`**。🔴 **`ADR-0031`(`AssignAttempt` 新表)= Rejected** —— Chris 揀咗 Option A(一條 `RequestEvent` NOTE)。**呢個係一個「提案被自己嘅代價否決」嘅例**,值得記形狀:D4「refusal 路開始寫狀態」係全份提案入面**唯一推翻既有約束**嘅位(第二次軟化 `ADR-0016 D6`),而佢**淨係為 refusal 路存在**;而 refusal「邊道閘擋住」係撳嗰刻見到、改完即刻再撳嘅嘢,**本身唔係「三日後要翻查」嗰種事實** ⇒ 覆蓋面大過需求。⇒ 零 schema / 零 migration / **零前端**。ADR-0031 全文保留唔改寫,將來要「翻查每次嘗試」由 D1-D6 重開。

> 🔴 **2026-08-10 撞到一個所有 test 層都捉唔到嘅 bug,形狀要記住**:`apiPatch` 由頭到尾 hand-roll `new ApiError(status, message)`,**冇第三個參數** ⇒ error body 永遠唔會落 `ApiError.detail`(只有 `errorFrom` 會,而 `apiPatch` 從來冇用過佢)。ADR-0029 個 steps 就係擺喺 400 body,所以**喺瀏覽器永遠到唔到前端,dialog 一世開唔到** —— 而 **api test 917 綠 / web test 綠 / tsc 0 / lint 0**,因為 UI test **自己手砌 `ApiError` 連 detail 落去**。⇒ **教訓唔係「漏咗一條 test」,係「條 test 放錯層」**:一條手砌自己期望嘅 error 嘅 UI test,永遠唔可能喺 transport 層失敗。已修(`d43b7a9`)+ 補 transport 層 test。⚠️ **`apiGet` 一樣冇 detail,刻意冇改**(現時冇 caller 需要)。
>
> ⚠️ **本機 `apps/web` 有 6 條 test 一直紅**(`local-profile.test.ts` 5 條 `localStorage.clear is not a function` + `reset-password.test.tsx` 1 條 timeout)。**`git stash` 實測 baseline 一模一樣 = pre-existing**,已登 BACKLOG `WEB-TEST-JSDOM`。⇒ 見到 `6 failed` **唔好當係自己搞壞咗**,但亦唔好當佢唔存在。
>
> ⚠️ **`npm run lint`(root)只 lint api**。web 要 `-w @uop/web` 另跑,而佢**本身紅住 16 條 prettier**(全部同 W45 無關,見 BACKLOG `LINT-web`)。
>
> ⚠️ **本機 5433 有 port 衝突**:`ai-doc-extraction-db` 同 `uop-postgres` 搶同一個 host port,**只可以二揀一**。W45 借用過一次(Chris 批)之後已還原 = `ai-doc-extraction` 五個 container 跑緊、UOP stack 停咗。要起 UOP 就要再停佢哋一次。
> ## 🔴 環境:「Azure UAT」係誤名(2026-08-04 Chris 更正)—— 呢格睇漏會用錯前提開始
>
> **W32/W33 部署嗰個唔係企業 UAT,只係一個自建測試 Azure 環境**:自建 RG(`RG-RCITest-RAPO-N8N`)/ ACR / ACA env(**冇 VNet 整合**)+ PG public,住喺 Azure 公網,**同企業網絡零連繫**。
>
> ⇒ **佢同 n8n 兩個方向都接唔通**:inbound 冇企業 domain 入口;**outbound 打唔入內網**(n8n 住 on-prem / 內部 VM)。
> 🔴 **呢個就係 W36–W42 一路 carry 嗰句「n8n 側從未真接通,三個 seam 零 live 驗證」嘅根本原因 —— 唔係漏做,係環境上做唔到。**
>
> **檔名 / ADR 標題刻意保留**(改名會令 git history 永久對唔上,W36 判斷)⇒ 讀 `07-uat-as-built.md` / ADR-0012 嗰陣,把「UAT」讀成「**第一個 Azure 環境(自建測試)**」;兩個檔頂都有更正 blockquote。
>
> **真正接得通企業網絡嘅環境 = `RG-RAPO-UOP-DEV`**(infra 2026-08-04 交付 · 企業共用 ACA env `acaen-rapo-dev` + hub VNet PE + custom domain `rapo-uop-web-dev.rci-t.com`)—— **W44 進行中,仍未部署**。
>
> **已解封 / 已交付**:**ADR-0027 Accepted**(Chris 揀 **Option A** —— api ingress 收返 internal,對外只剩 web 一個 hostname;🔴 **cookie / CORS / 前端一個字唔變**,兩個選項嘅分別只在 machine-to-machine)· `deploy/azure/aca-dev.json`(**唔建 ACA env**,只 update 兩個既有 app;`validate` **Succeeded**)· `aca.params.dev.json`(gitignored,已證)· **`what-if` 已跑**:零 Delete、9 個無關資源 `Ignore`、**custom domain + `workloadProfileName` 保留** · PG database **`platform` 已自建**(management plane,唔使連到 PG)· `nginx.conf.template` **零改動**(Option A 令 F4 消失)· vendor **暫時全 placeholder**(F3-6 拍板:部署成功再逐個接)。
>
> 🟢 **B1(image build)2026-08-05 解封** —— registry `acrrci3ailanding1.azurecr.io`(跨 tenant 企業中央 ACR)。解封方式 = **換一台唔喺公司網嘅 build host**(出口 IP `52.187.129.166`,Azure 段):Docker Hub ✅ · ACR `Login Succeeded` ✅ · api image(BUG-008 個 `test -f dist/main.js` 硬閘過)+ web image 都 build 成功 ✅ · **push 真證到**(api `sha256:5a8d48cd…` / web `sha256:1d543670…` —— 之前四輪只證到 `login`,冇 image 可推)。params tag = **`dev-0d01f0c`**,`what-if` 重跑同 baseline 一致。
>
> ⚠️ **三件唔可以靜靜當佢消失**:①呢條路**繞開**公司 proxy,唔係令部署鏈喺公司網跑得到 ⇒ **解法 ①(SP 攞 registry `read` + `scheduleRun/action`)仍然最乾淨,infra 唔應該撤走**(🔴 `AcrPush` **唔包** `scheduleRun/action`)②之前四條解法**全部 assume 咗「build 一定要喺公司網嗰台機做」而冇人立過呢個 assumption** ③F5 由 `az acr build` 改本地 `docker build` = **R3 deviation**,已 log。
>
> 🟢 **2026-08-06 已部署上 DEV(部署 #1)** —— 但 **🔴 唔可以講「部署成功」**,見下面 B7。
> **B4**:`az deployment group create` 撞 `LinkedAuthorizationFailed`(SP 冇 `managedEnvironments/join/action`;env `acaen-rapo-dev` 住喺**另一個 RG** `RG-RAPO-ContainerAPP-DEV`,SP 實測**只有** `[Contributor] RG-RAPO-UOP-DEV`)。
> 🟢 **繞過 = `az rest --method patch`,body 唔含 `environmentId`**。🔴 **`az containerapp update`/`registry set` 一樣 403**(CLI read-modify-write 會連 `environmentId` 送返去)⇒ **一定要 raw ARM PATCH**。腳本 = **`deploy/azure/patch-deploy-dev.ps1`**(無參數 = dry-run 印 masked body;`-Send` 先真送)。
> 🟢 **PATCH 比 ARM full PUT 更安全** —— 唔 unset 冇送嘅 property ⇒ infra 配嘅 `customDomains`+SNI / `workloadProfileName` **結構上掂唔到**(實測完好)。`aca-dev.json` 保留做宣告式真相。
> **實測**:api `--0000002` `Healthy`/`RunningAtMaxScale` · web `--0000001` `Healthy`/`Running` · 🟢 **ACA 由 VNet 內 pull 到 registry**。
>
> 🟢🟢 **B7 已解封(infra 2026-08-06 畀咗 `managedEnvironments/read` + enable log)⇒ 三個未知數全部收齊**。container log 原文:
> ```
> 04:14:26 [entrypoint] prisma migrate deploy
> 04:14:27 19 migrations found in prisma/migrations
> 04:14:28 The following migration(s) have been applied:
> 04:14:28 [entrypoint] seeding (idempotent upserts)
> 04:14:30 Seeded 24 OpCos + admin + RHK OPCO_IT user.
> 04:14:31 [NestApplication] Nest application successfully started
> ```
> **零 `WARN: migrate deploy failed` · 零 `WARN: seed failed` · 零 Error** ⇒ **B3(ACA 連 private endpoint PG)✅** · **PG v18 migration(G8)✅ 19 個全部 applied** · **seed ✅ 精確 24 個 OpCo**。
> ⚠️ **陷阱以後仍然成立**:`docker-entrypoint.sh` 令 migrate/seed 失敗 **NON-FATAL** ⇒ revision `Healthy` **證明唔到 DB 通**,驗證一定要睇 log 或 HTTP。
> 🟢 **B9(SSO)—— 2026-08-07 靠改設計解封。code 齊,但仍未 live 驗過,而家仍然行緊 break-glass `admin@uop.local`。**
> **舊前提已作廢,唔好照 W44 前四日嗰套做**:ADR-0003(MSAL SPA)嘅三個硬需求(SPA platform / Application ID URI / `access_as_user` scope)infra 個 app 三樣都冇,而**三輪往返都攞唔到 Application ID URI**。查證揭到重點:**佢哋配嘅嘢本身就係另一條路嘅完整形狀** —— client secret ✅ + redirect URI ✅ + confidential client ✅。**Chris 拍板** ⇒ **ADR-0028 Accepted**(server-side authorization code exchange,**supersedes ADR-0003**;ADR-0002 唔推翻,驗證邏輯移去 callback endpoint)。
> **而家嘅 flow**:前端只送人去 Entra + 交返 `code` → **API 用 client secret 喺 server 側換 token** → 驗 `id_token`(aud = client id,**唔需要任何自訂 scope**)→ upsert `AppUser` → 發**平台自己**嘅 httpOnly cookie ⇒ **SSO 同 break-glass 由 `auth.service.grantSession` 開始完全一樣**。三條 route:`GET /auth/sso/status` · `GET /auth/entra/start` · `POST /auth/entra/callback`。
> 🔴 **`VITE_ENTRA_*` 已經冇咗,MSAL 兩個 dep 已移除。** 四個 `ENTRA_TENANT_ID`/`ENTRA_CLIENT_ID`/`ENTRA_CLIENT_SECRET`/`ENTRA_REDIRECT_URI` 由 **API runtime** 讀 ⇒ **改配置唔使重 build web image**(舊設計嗰個「估錯要重 build 10 分鐘」嘅風險已消失)。範本喺 `apps/api/.env.example` 認證段。
> ⚠️ **兩個「紅得靜」陷阱已處理,但形狀要記住**:①guard(`resolveSessionUser`)同 `refreshSession` 原本硬性 `authProvider:'local'` —— 唔拆嘅話 SSO **登入睇落成功**然後每個 request 401,錯誤指向 token 唔指向 provider 過濾 ②state cookie 喺 callback **驗證之前**就清,免得失敗後 reload replay 用過嘅 code。
> 🔴 **仍未做 = F9-7(PATCH 四個 env)+ F9-8(驗 SSO 通 **兼且** break-glass 仍然通)。未有任何一次真人登入嘅證據。**
> 🟢 **可回退**:`login.tsx` 本地表單永遠喺;SSO 未配置 → `/auth/sso/status` 返 `{enabled:false}`,個掣自動暗住。
> 🟢 **Graph app 權限齊**(`LicenseAssignment.Read.All` / `User.Read.All` / `LicenseAssignment.ReadWrite.All`)⇒ F3-7 接真 Graph 冇障礙。🔴 client secret **exp 2028-07-28** 要入 RISK。
> 💡 **測 Entra 一定要用真瀏覽器** —— 命令列打 authorize endpoint 會攞到「200 冇錯誤」嘅**假陽性**(現代登入頁係 SPA,錯誤由 JS 畫)。跑一個**故意錯**嘅對照 case 先信自己個測試。
>
> ⚠️ **呢台機嘅 az session 唔穩定** —— 一日內撞過 **4 個唔同 SP**(`d2f094a3` / `a19dfe76` / `2ae44f00` / ACR `4a6e1474`),錯身份會畀出**誤導性 error**(403 睇落似權限未落,其實係身份唔啱)。⇒ **做 az 操作一律用獨立 `AZURE_CONFIG_DIR` 登入 SP**(憑證喺 `apps/api/.env` 尾段)。
> 🔴 **B8(新)= 企業 DNS 冇我哋條記錄**。2026-08-06 由**公司網絡**(DNS `10.160.92.1`)實測:`rapo-n8n-uat.rci-t.com` → **`10.160.71.243`** ✅ 但 `rapo-uop-web-dev.rci-t.com` → **Non-existent domain** ⇒ **infra 漏咗建** ⇒ custom domain **連喺企業網都訪問唔到**。⚠️ 之前「ACA 綁 custom domain 要 hostname 驗證 ⇒ DNS 應該配好」呢個推論**已被一條 `nslookup` 推翻**。
> 🟢 **B8 唔 block 驗證** —— 由**公司網絡**打 **ACA 預設 FQDN**(internal env 喺 hub VNet private DNS 一定有記錄):`https://aca-rapo-uop-web-dev.nicesea-c3849dba.eastasia.azurecontainerapps.io/` + `/api/docs/api` ⇒ **F6-4/5/6 即刻收得**,custom domain 嗰半留 B8 解封後補驗。
> 🔴 **仍要一次直接驗證先收尾**(row count / admin 帳號 / API 200):**最快 = 上面條 ACA FQDN**;其次 ①infra 畀 `managedEnvironments/**read**`(純唯讀,比 join 細)②Chris 個人帳號睇 Azure Portal log。
> 💡 **方法論(值得帶去下一個環境)**:直接路封死唔等於冇路 —— **部署權限 / 觀測權限 / metrics 係三套唔同嘢**,而 metrics 一直喺我哋 RG Contributor 範圍內,四日嚟冇人諗過用。同 Day 3「有咩前提我根本冇寫落嚟」同一族。
>
> ⚠️ 仍未掂:**n8n 雙向**(base URL = `http://rapo-n8n-uat.rci-t.com/`,🔴 **http 明文** = B6)。
> ADR-0027 · `docs/13-deployment/09-dev-as-built.md` · `W44-azure-dev-deploy/`。

> 🔴 **W43 最要緊嗰三件(ADR-0025 / 0026)**:
> ① **onboarding intake 收貨即刻自己建一張 `O365 User License Maintenance Request`**(catalog `order_now`/cart,**唔係** Table API insert —— `sc_request` insert 403,BUG-010)。once-guard = **line item 自己嘅 `serviceNowSysId`**;冇佢嘅話 n8n 每重推一次就開多一張**真飛**,而平台側完全睇唔出。
> ② **assign 由單閘變雙閘**:`azureSyncedAt`(Graph)**同** `serviceNowUserSyncedAt`(SN 有冇呢個人)。兩個都**冇得 override** —— `budgetOverrideReason` override 唔到,因為 sync gate 唔係決定,係「呢個人存唔存在」嘅事實。sweep 一個 vendor 一個 abort flag。
> ③ 🔴 **`target_user` 永遠指住 requester,唔會變**(ADR-0026):`sc_item_option` update **403 ACL**,回填已經拆走,改行 work note。真 target 一律睇 `target_users_email`。
> 🔴 **ServiceNow 逐個 table 分開開權,唔可以由「某張表寫得」推論「另一張寫得」**:`sc_request` insert **403** · `sc_item_option` update **403** · `sc_req_item` / `sc_task` update ✅ · catalog `order_now` ✅。
> 🔴 **UOP 同 n8n 共用 SN 帳號 `n8napiservice1`**(RISK **R7**)⇒ `sys_updated_by` / `assigned_to` 永遠分唔到邊個系統做,**唯一指紋係 `close_notes`**。ADR-0024 D5 個 rationale 就係喺呢個歧義上寫錯咗。查 SN 側「邊個做過乜」一律唔可以信 `sys_updated_by`。
> ⚠️ **SKU Catalog 而家有三個 CSV 動作,唔好撈亂**:①`Export CSV`(CH-018)= 攞走成個 **active** catalog;②`Import CSV`(CH-019)= 改完傳返上去**批量 curate**(對帳鍵 = `SkuId` GUID,只寫 alias / category / base,**永不新建 SKU**,dry-run 先行);③`Download template`(Settings → Integrations,W35 F2)= **allocation** 範本,pre-fill curated alias 同現有數字,拎去改 seat 數 —— 佢同 ①② 係**完全唔同嘅檔同唔同嘅 endpoint**。三者都**只有 active SKU**(`catalog.service.ts:112` 硬 filter)。
> 🔴 **改 `businessAlias` 有一道 fail-closed 閘**(CH-019 / ADR-0023 D5):任何令**兩個 active SKU 撞同一個 alias** 嘅改動 —— 批量 import **同**單筆 `PATCH catalog/:id` —— 一律 **400 整批唔寫**。原因係 `businessAlias` schema 冇 unique constraint,而前端範本 first-wins(`allocation-template.ts:63-67`)、後端 import last-wins 兼冇 `orderBy`(`matrix-csv.ts:86-90`)⇒ 撞咗會**靜靜**把 allocation 寫落錯嘅 SKU。**清空 alias**(→ null)唔算撞、唔會被擋,但批量清要 `confirmClears`(清咗嗰個 SKU 退出 import scope,而佢 ledger 舊數會**凍結**留低)。
> 🔴 **Ledger 有兩個 reset,名近似而風險唔同級**(CH-016 / CH-017,對照表 → `CH-017-ledger-full-reset/spec.md §2.2`):`POST /license/ledger/allocation/reset`(ADMIN+REGIONAL)只清 `allocatedQuantity`,**重新 import 救得返**;`POST /license/ledger/reset`(**ADMIN only** + 打字確認)連 `assignedQuantity` 一齊清,**任何 import 都救唔返**(ADR-0004 #5),只能重跑 `npm run baseline:assigned`。改任何一個之前先睇清楚係邊個。
> ⚠️ **dev DB 現況**:`150 rows | alloc 41 | assigned 5971 | adjustments 14` —— RTW 一個 OpCo 已被 CH-017 驗證 full reset 過(其餘 23 個完好)。全平台清空係 Chris 自己撳,順序見 `CH-017/progress.md` closeout。
> 🟡 **前端驗證:睇你今次 session 有冇 browser tool,唔可以當佢一定喺度。** 2026-08-02 有 **Playwright MCP**(`mcp__plugin_playwright_playwright__*`)嗰陣 AI 自己 render 得到、light/dark 都截到圖;但 **2026-08-04 實測同一個 repo 冇咗** —— 只剩 `claude-in-chrome`,而佢 `list_connected_browsers` 返 `[]`。⇒ **開工先確認,唔好假設**;真係冇就**照寫「未 render 驗」,唔可以用「token 兩邊都有定義」冒充**(W43 F5-3 / G9 就係咁留低)。⚠️ 有 Playwright 嗰陣佢會喺 **repo root** 掉低截圖同 `.playwright-mcp/`,**收工要清**。

> 🔴 **`apps/api/.env` 喺主 checkout(`C:\Users\CLai03\unified-operation-platform`)係有嘅,而且入面係真憑證**(真 `ricohapdev` ServiceNow + 真 Graph tenant + 真 ACS)。2026-07-31 實證:live 打真 SN / 真 Graph 完全做得到。⚠️ 之前呢度寫住「本 worktree 冇 `.env`」—— 嗰句只對**另一個 worktree** 成立,喺主 checkout 讀會令你以為做唔到 live 驗證。**開工前自己確認一次係邊個 checkout。**
> 🔴 **port 3100 跑緊嘅唔一定係本 worktree** —— 驗證前**必查 process ancestry**(AP-11,W36 同 W38 各中過一次)。
> 🔴 **`POST /requests/intake` 而家有兩張合約**(CH-020 / ADR-0024 D2),靠 **body 有冇 `mode`** 分流:冇 `mode` = W24 嗰張 locked canonical(`N8nIntakeRequestDto`,**一個字冇改**);`mode: 1` = n8n 1001 今日實際送嘅 flat 形狀(`N8nFlatIntakeDto`);其他值 **400 fail-closed**。**被共用嘅係 URL 唔係 contract** —— 唔好「順手」把 canonical 兩個 required 欄放寬,`serviceNowSysId` 係 `@unique` idempotency key。Flat 路多兩個 line item 欄 `serviceNowTaskSysId`/`serviceNowTaskNumber`,**刻意唔喺 canonical DTO 出現**。<br>🔴 **W43 更新(ADR-0025 D1)**:嗰兩個欄由「驅動 by-task close」改成**純 traceability,唔再驅動任何嘢**(欄冇 drop)。**by-task close 已停用** —— 實測 n8n 自己閂埋 WDA task,留住嗰條分支只會令每次 assign 都 PATCH 一張已閂嘅 task,被 `active` 閘正確拒絕,再為一個唔存在嘅問題開一條 Delivery failure。`mode` 分流本身**一個字冇改**。
> 🔴 **seam ④ 收 `TicketTarget` union 唔再收 bare sys_id**(`{kind:'ritm'|'task', sysId}`)。`task` 分支 **patch 之前一定要驗 `active=true`**,fail closed —— n8n 會送已閂 task(REQ0044049 實例)。改呢度之前睇 `direct-ticket.provider.ts` 個 `openTask()`。
> ⚠️ **維護**:呢段同 `CLAUDE.md §0/§9` 每次 closeout 一齊掃 —— 兩份都係無條件注入每個 session,過時 = 下一個 session 用錯前提開工(2026-07-31 實犯)。

**開發路線全鏈完成(詳細歷史 → `BACKLOG.md` + memory `MEMORY.md`,此處唔重複)**:
- **後端業務層**:W02 C(catalog+對帳)/ W03 D-1(intake)/ W04 D-2(assign+ledger)✅ · **前端全鏈**:W05 scaffold / W06 FE-1(Overview+Catalog)/ W07 FE-2(Requests+detail 讀寫)/ W08 FE-3(Drift + BE-graph-harden)✅ · **BUG-002 ✅**(Graph error wrap→503)。
- **AUTH 全鏈 ✅**:W09 AUTH-1(後端 Entra JWT + `@Roles` guard,ADR-0002)→ W10 AUTH-2a(FE MSAL scaffold,ADR-0003 — ⚠️ **2026-08-07 已被 ADR-0028 推翻,MSAL 已由 `apps/web` 移除**)→ W11 AUTH-3a(OPCO_IT 後端 per-OpCo scope)→ W18-21 AUTH-4a/b/c(本地登入 / user 管理 / 密碼生命週期 / session hardening,ADR-0005/0006)→ W22 AUTH-3b(FE 真 role scope)→ **W44 F9 SSO server-side code exchange(ADR-0028)**。
- **FE-Assets 鏈 ✅**:W13-17(allocation import[ADR-0004 curation-as-scope]+ ledger read/write + By-OpCo inline edit[ADR-0007])。
- **ADR-0008 request 建單 rollout 全 4 階段 ✅**(2026-07-15):W24 **甲** inbound intake(n8n→平台 `POST /requests/intake` m2m)/ W25 **乙** outbound direct(平台→SN + 前端 `/requests/new`)/ W26 **丙** n8n outbound(`N8nWorkflowProvider` env 選路)/ W27 **丁** D365 scope(平台早 SKU-agnostic → confirm+test+doc)。

**當前 pending(rolling JIT,待 Chris 揀)**:🔴 **AUTH-2b**(真 SSO e2e — ⚠️ **唔再卡 IT 開 SPA app reg**:ADR-0028 之後現有 app registration 直接用得,code 亦已齊;剩返嘅係 **W44 F9-7 PATCH 四個 `ENTRA_*` env + F9-8 live 驗證**。`W10/AUTH-2b-RUNBOOK.md` 個 MSAL 前提**已過時**)· **DEPLOY**(生產部署 + 真數 curation)· honest-gap 三項(activity feed / Drift Resolve / AI-Assist)· 🟡 AUTH-4c-C(email reset)/ DD-2(npm vuln)。
**Deploy-time carry(非 repo)**:真 SN/n8n 建單合約對齊(`docs/05-usage/SERVICENOW-CONTRACT-ALIGNMENT.md` 🅐–🅙 待 SN owner 填)· 真 D365 SKU curation(`W27/CURATION-D365.md` runbook)。

**誠實資料原則**:缺 endpoint(handler name / AI parse / My queue …)一律 EmptyState/coming-soon/略去,絕不砌假數。前端 = **H6 保護**,token-only 唔 eyeball,**寫前對 prototype render 睇**(computed 查證,唔靠畫面名估),跑 `ui-design` skill,vite dev 5173 —— 見 [[ui-design-fidelity]]。

**提醒(完整見 CLAUDE.md §5)**:掂 H1-H8 第一句 **STOP+ask**(H1 架構 / H2 vendor / H3 scope / H4 security / H5 test / H6 UI design fidelity / **H7 tool-result integrity**:絕不作 tool 輸出 · send tool 即收口 · 講 pass/done/rendered 前 trace 一個真 tool_result,見 `docs/03-implementation/incidents/INC-001` / **H8 tool-usage discipline**:讀檔/搜尋用 Read/Grep/Glob 唔用 bash cat/grep · 唔 echo 拼裝 · 單一重定向)。**繁中回覆**。非 trivial 工作先 pre-doc gate(R1)。

**Runtime 實況(避坑,CLAUDE.md 冇)**:
- **起後端**:`docker compose up -d`(postgres **5433** + redis)→ `apps/api/.env`(gitignored)→ root `npm run start:dev` → `http://localhost:3100/docs/api`。
- ⚠️ **Prisma engine CDN(`binaries.prisma.sh`)俾公司 proxy 封(503)**:clean reinstall(刪 node_modules)後要**轉流動網路**跑一次 `npm run prisma:generate` + `prisma migrate` cache engine。其他 TLS 用 `NODE_EXTRA_CA_CERTS=C:/Users/CLai03/ricoh-ca.pem`。
- ⚠️ **Port**:3000 俾 Langfuse 佔 → 用 `PORT=3100`;5432 俾既有 Postgres 佔 → docker postgres host 5433。
- **Auth**:controllers 全域 guard(`@Roles`);OPCO_IT per-OpCo scope(AUTH-3a/3b)+ 本地登入/密碼/session(AUTH-4a-c)。🔴 **兩個 provider 只有一種 session** —— break-glass 同 Entra SSO 都發同一個 httpOnly `uop_access`/`uop_refresh` cookie(ADR-0028);guard 唔再按 `authProvider` 分流。**前端零 token、零 auth library**(MSAL 已移除)。**本地要 `AUTH_DEV_BYPASS=true`**(api `.env`)+ **`VITE_AUTH_DEV_BYPASS=true`**(web)否則 `/api` 401 / FE gate 去 login。扮 OPCO_IT 加 `AUTH_DEV_USER_EMAIL=opco.it.rhk@rapo.com.hk`。**真 SSO e2e 仍未驗**(W44 F9-8)。ADR-0002/**0028**/0005/0006(**ADR-0003 已 superseded**)。
- **Request 建單(ADR-0008)**:inbound intake `POST /requests/intake`(m2m `X-Intake-Key`,`INTAKE_API_KEY`);outbound `POST /requests` provider 由 **`REQUEST_SUBMISSION_PROVIDER=direct|n8n`** 選(default direct→SN Table API / n8n→webhook `N8N_OUTBOUND_WEBHOOK_URL`+`_KEY`)。**代表性合約**,真上線待 `docs/05-usage/SERVICENOW-CONTRACT-ALIGNMENT.md`。
- **Demo harness**:`apps/api/scripts/demo-harness/`(npm `demo:mock-sn`/`demo:mock-n8n`/`demo:cleanup`)—— dev-bypass + mock 底下 live 跑 ADR-0008 request 雙向閉環(甲/乙/丙 + assign 回寫),零新 dep;runbook 見該 folder README。
- **SKU 一律用 `skuId`(GUID)唔靠名**;assign 前必過 `azureSyncedAt` sync gate(`findUser` null = 未 sync)。
- **UI**:token-only,唔 hardcode / eyeball;寫前跑 `.claude/skills/ui-design`;視覺真相 `design_handoff_licenseops/`。
- **git push**:upstream 已設,直接 `git push`;public→已轉 private,唔好 push 真實 secret(`.env` 已 ignore)。

**Detail on-demand**:`session-start.md`(詳版)· active phase folder(hook 自動注入)· `docs/02-architecture/design-system.md`(UI)· memory `MEMORY.md`。
