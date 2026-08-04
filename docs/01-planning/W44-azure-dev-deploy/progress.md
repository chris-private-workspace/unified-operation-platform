---
phase: W44-azure-dev-deploy
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: in-progress    # in-progress | closed
---

# Phase W44 — Progress

> Daily progress + 結尾 retro。
> 每 commit 必須對應一個 Day-N entry mention(R2 binding rule per PROCESS.md §5)。

---

## Day 0 — 2026-08-04: Kickoff

**起因**:Chris 交出 infra team 新畀嘅 **Azure DEV 環境**憑證同座標(放咗入 `apps/api/.env` 尾段),要求把 UOP 部署上去。呢個環境嘅意義 = **可以同 n8n UAT 接通** —— 正正解封 W36/W39/W40/W42 一路 carry 落嚟嗰個「n8n 側從未真接通、三個 seam 零 live 驗證」缺口。

**Phase 號**:`git fetch --all` 掃晒**所有 remote branch** 嘅 `docs/01-planning/` tree(PROCESS §2.1 硬要求,防再出「兩個 W36」),最大 = **W43** ⇒ 本 phase = **W44**。

**Action**:
- Branch `feat/w44-azure-dev-deploy`(由 `b9ca76c` 起)
- Templates copied from `_templates/phase/`
- `plan.md` 填好(F0–F8 + G1–G10 + B1–B4/R5–R8 + 三個附錄)
- `checklist.md` 由 plan deliverables 衍生
- Carry-over from W43 retro:W43 未上 UAT(兩個環境會 diverge)· F6-3/F6-4 live close 未驗 · F5-3 前端 light+dark 未 render 驗 · G10 UAT 實搜 OpenAPI

### Done — F1 discovery(F1-1 … F1-8 全部真跑過)

用 SP 真登入(獨立 `AZURE_CONFIG_DIR`,**冇踩到 operator 現有 az session**)。所有結論都有真 tool output 支持:

| # | 查咗咩 | 結果 |
|---|---|---|
| F1-1 | 身份 | sub `30dac177-…`(**rcitest,同 UAT 同一個**)· tenant `4f63aaa0-…` · SP **Contributor 只限 `RG-RAPO-UOP-DEV`** |
| F1-2 | RG 資源 | 11 個:2 × containerApps · Redis · PG · KV · App Insights · 2 × PE + 2 × NIC · 1 alert rule |
| F1-3 | 兩個 app | **兩個都係空殼** —— 跑緊 `mcr.microsoft.com/k8se/quickstart:latest`,零 env / 零 secret / 零 registry / identity=None。api **external** port 80 `allowInsecure=false`;web external + custom domain `rapo-uop-web-dev.rci-t.com` + SNI cert。ACA env 喺 **`RG-RAPO-ContainerAPP-DEV/acaen-rapo-dev`** |
| F1-4 | PG / Redis | PG **v18**(UAT 係 16)· admin **`rcitadmin`** · public access **Disabled**。Redis 6380 TLS-only · public access **Disabled** |
| F1-5 | PE | 落 `RG-RCITest-HKG-Infra/vNet-RCITest-HKG/Subnet-RCITest-D-DB` · **`dnsZoneGroup` = null** |
| F1-6 | Key Vault | data-plane **`[SSL: CERTIFICATE_VERIFY_FAILED] self-signed certificate in certificate chain`** ⇒ 同 UAT 一樣用唔到 |
| F1-7 | ACR | 🔴 **RG 內冇** · `az acr list` 返 `[]` · 嗰個 GUID 試做 subscription = `not found` |
| F1-8 | Redis 用唔用得著 | `apps/api/src` grep BullMQ/Redis = **零 match** ⇒ 本 phase 唔接 |

### Decisions / Open-Questions Resolved

- **拓撲決定升格做 ADR(F0)** —— api 由 UAT 嘅 internal 變 DEV 嘅 external,係**安全邊界改變**(平台第一次把 API 直接暴露互聯網)。按 PROCESS R5 / CLAUDE.md §5,呢個屬 architectural-adjacent ⇒ **先寫 ADR、等 Chris Accept,先落任何部署 code**。已寫入 checklist F0-6 做硬閘。
- **Redis 唔接**(R8)—— 唔係「暫時唔做」而係**而家用唔著**:`apps/api/src` 零 BullMQ 用法,接咗只係多一條未用嘅線。寫入 as-built 留待將來。
- **`aca.json` 唔改** —— DEV 要新開 `aca-dev.json`。理由唔係潔癖:現有 template **自己建 ACA env**,喺 DEV 建新 env 會令佢**唔喺 hub VNet** ⇒ 一定連唔到 private PG。

### Blockers

🔴 **三個 blocker,全部要 infra team 補資料**(問題清單見 `plan.md` 附錄 C):

- **B1 — 冇任何可達嘅 container registry**。`azure_container_registry=4a6e1474-…` 係 GUID,而 ACR 名只准 **5–50 個純字母數字**(冇 dash)⇒ **唔可能係 ACR 名**。三個獨立實測都指同一結論:RG 內冇 ACR · `az acr list` 返空 · 嗰個 GUID 唔係 subscription id。**卡死 F5/F6**。
- **B2 — PG credential 對唔上**。server admin 係 `rcitadmin`,`.env` 畀嘅係 `rapoaiuopdev`。**卡死 F3**。
- **B3 — ACA env 連唔連到 private PG/Redis,證明唔到**。SP 讀 `acaen-rapo-dev` 直接 `AuthorizationFailed`,而 PE 又冇綁 private DNS zone group。**只可以問 infra 或者部署後實測(而實測要先過 B1)**。

⚠️ **B4(待實測)**:SP 對 `acaen-rapo-dev` 連 read 都冇 ⇒ 部署 container app 若需要 `managedEnvironments/join/action` 會 403。

**Escalation owner**:Chris → infra team。**ETA**:未知 ⇒ plan §5 D3 起**刻意冇填日期**。

### 一個實際失誤(記低,唔係湊數)

`.env` 個 `azure_url_for_uop` 寫住 **`http://`**,我最初照單全收。實測 web app 個 custom domain **已經綁咗 SNI 證書**(`acaen-rapo-dev/certificates/rcit`)⇒ 實際係 **https**。如果照 `.env` 個值填 `appBaseUrl`,密碼重設信入面條 link 就會係 http —— 而呢類錯**唔會有任何紅燈**(API 照返 204,信照寄,只係條 link 錯)。同 CH-011 R1「`acsSenderAddress` 填錯係最靜嘅錯法」同一族。已寫入 checklist F3-3 做硬提醒。

### Actual vs Planned Effort

| Deliverable | Planned (h) | Actual (h) | Variance |
|---|---|---|---|
| F1 discovery | 3 | ~1.5 | −1.5(az management plane 全程通,冇撞 proxy) |

### Commits

- `897ac38` — `chore(planning): kickoff W44 azure dev deployment`

---

## Day 1 — 2026-08-04:ADR draft + as-built

### Done

- **F0-1 … F0-5、F0-7** — `docs/adr/0027-azure-dev-deployment-topology.md`(**Proposed**)。定位 = **擴充 ADR-0012,唔推翻** —— ADR-0012 定嘅係 UAT 一個環境嘅拓撲,呢份決定第二個雲環境點做。
- **F1-9** — `docs/13-deployment/09-dev-as-built.md`(座標 + 六處差異 + 三個 blocker + 部署時四個陷阱)。
- ADR README index 加 0027。

### 🔴 一個實質判斷改變(相對 kickoff 時嘅 plan)

**Kickoff 寫 plan 嗰陣,我把「api external」當咗係既定前提** —— 因為 infra team 已經開咗、又畀咗 `azure_url_for_api_call`,睇落就係要咁用。checklist F0-2 原文寫住「Decision — api 保持 external」。

**寫 ADR 期間讀 `apps/web/nginx.conf.template` 揭穿咗呢個前提**:web container 個 nginx **已經**把 `/api/*` 反向代理落 api,而 `API_UPSTREAM` 係 env 渲染。即係話 —— **n8n 打 `https://rapo-uop-web-dev.rci-t.com/api/requests/intake` 就已經到得到 intake endpoint,完全唔需要 api 對外**。

⇒ 「api external」由**需求**降格成**多出嚟嘅暴露**。ADR 改成兩個選項並列,**推薦 Option A(收返 internal)**,理由:①ADR-0012 嗰兩條認證約束嘅設計意圖係「對外只有一個 hostname」,唔止為咗 cookie ②DEV 開嚟就係為咗接 n8n,而 n8n 要嘅嘢 Option A 已經滿足 ③兩個環境同一套拓撲,template / runbook / 排錯經驗全部通用。

**呢個係 R3 deviation** —— plan 仲係 `draft`(未 locked)所以直接改得,但值得寫低,因為佢係一個**方法論教訓**:我差啲就把「infra 配咗乜」當成「平台應該用乜」。infra team 配置反映佢哋嘅**假設**,唔係平台嘅**需求** —— 呢兩樣要分開睇。同 W42 retro 嗰條「外部系統點做唔一定係外部未知數,先搵 repo 有冇佢嘅 export」係同一族:**答案好多時已經喺 repo 入面**,今次係 `nginx.conf.template`。

**順帶好消息**:F4(web 建構調整)大機會**唔使改 code** —— `API_UPSTREAM` 已經係 env 渲染,`Host $proxy_host` 對 https upstream 一樣啱。實作時再確認。

### 順手修正一個 index drift

`docs/adr/README.md` 嗰行 ADR-0026 寫住 status **`Proposed`**,但 `0026-*.md` 檔本身由頭到尾寫 **`Accepted`**(Approver:Chris Lai,2026-08-04)。W43 收官 doc-sync 漏改。已改正 —— 呢個唔屬「順手改 adjacent」(§1.3),係一個**互相矛盾嘅事實**,而 index 正正係下一個 session 會先睇嘅嘢。

### 🔴🔴 Chris 更正:之前嗰個「UAT」根本唔係 UAT(本 phase 到目前為止**最重要**嘅一件事)

Chris 喺我交完 ADR draft 之後更正:**W32/W33 部署嗰個環境唔係企業 UAT,只係一個測試用嘅 Azure 環境** —— 我哋自己喺 `rcitest` subscription 由零建起嘅孤島(自建 RG `RG-RCITest-RAPO-N8N` + 自建 ACR + 自建 ACA env **冇 VNet 整合** + PG public `0.0.0.0`),住喺 Azure 公網,**同企業網絡冇任何連繫**。

**呢個一次過解釋咗三件我原本當成獨立嘅事:**

**① W36–W42 嗰句「n8n 側從未真接通,三個 seam 零 live 驗證」嘅根本原因。** 唔係漏做,係**環境上做唔到**,而且係雙向:inbound 冇企業 domain 入口;outbound 打唔入內網(n8n 住 on-prem,Chris 同日確認)。呢句 carry 咗四個 phase,而**冇一次寫低過原因** —— 一直當咗係「n8n 側未配好」。

**② 我列嘅「六處差異」唔係六件事。** 佢哋係「**自建孤島 → 企業託管**」同一個轉變嘅六個表現。連帶一個實際收穫:**B1 由「registry 唔知去咗邊」變成「企業中央 registry 叫咩、SP 點攞 AcrPush」** —— 舊環境要自建 ACR 正正因為佢係孤島。問題由「搵嘢」變成「攞權」,問法完全唔同。

**③ 🔴 B3 由部署細節升格成本環境成敗嘅關鍵。** 佢原本只係「container 連唔連到 private PG/Redis」。而家:**UOP → n8n outbound 一樣繫於佢**(ACA env 冇 VNet 整合就打唔入內網)。⇒ **ADR-0027 D1 揀 A 定 B 都改變唔到呢件事** —— ingress 係 inbound 概念,同 outbound 無關。呢個範圍澄清已寫入 ADR-0027 Context。

**我自己嘅 miss**:F7 acceptance 原本**只寫咗 inbound**(「n8n 打得到 intake → 201 + DB row」)。若照原文做,會出現一個典型假驗證 —— **「接通」驗一半當全部**,而 outbound 唔通嘅話係**靜態失敗**(provider fail 但 app 照起得身、smoke 照綠)。已補 F7-9/10/11。呢個同 `feedback_verification-that-proves-nothing` 嗰條「每個 assertion 問『行為壞咗佢會唔會變紅』」係同一族。

**命名更正處理(Chris 拍板)**:**保留檔名 / ADR 標題**,靠 blockquote 更正 —— 改名會令 commit message / PR / 舊 progress 入面寫死嘅「UAT」永久對唔上(**W36 同一判斷**)。已加註 `07-uat-as-built.md` 頂 + `ADR-0012` 頂。

### Decisions / Open-Questions Resolved

- **OQ-1 — resolved(Chris 2026-08-04)**:n8n UAT 住喺**企業內網**(on-prem / 內部 VM)⇒ 企業 DNS 解析企業 domain,**Option A 走得通**。⚠️ **仍係推論唔係實測** —— 「內網解析到企業 domain」冇 curl 過,而且個 A record 指住 ACA 公網 IP ⇒ n8n 仲要出得到公網。**降級做 F7-1 實測,唔再 block D1**。
- **OQ-2(新增,唔阻)**:infra team 除咗 n8n,仲有冇其他系統打算直接打 `azure_url_for_api_call`?
- **OQ-3(新增 —— 唔阻 D1,但阻成個環境)**:🔴 UOP 由 ACA 打唔打得入企業內網嘅 n8n?即 **B3**。已加做交畀 infra 嘅第 5 條問題。

### infra team 第一輪回覆 + 實測(F1-10 ✅ 交出並收到回覆)

四條問題全部有答,但**實測之後,最要緊嗰條答咗等於冇答**:

| # | infra 回覆 | 實測結果 |
|---|---|---|
| 1 ACR | `acrrci3ailanding1.azurecr.io`;cross-tenant SP `4a6e1474-…` 有 **AcrPush** | 🔴 **兩條 build 路都斷**(見下) |
| 2 PG | `rapoaiuopdev` 係 **DB admin**(唔係 db 名) | 🟡 credential 有齊,**但 database 名仍未答** |
| 3 網絡 | `acaen-rapo-dev` **已整合 `vNet-RCITest-HKG`**,DNS 解析得到 web/api/PG/Redis | 🟢 DB 半邊解封。⚠️ **四個目標入面冇 n8n** |
| 4 join | 「used contributor to replace」 | 🟢 接受,未實測 |

#### 🔴 B1 實測:image 兩條路都斷(呢個係本 phase 至今最硬嘅嘢)

**路一 `az acr build`(UAT 一直行嗰條)** —— SP login **成功**,而且見到 `30dac177-…` subscription。但:
- `az acr show -n acrrci3ailanding1` → **`could not be found in subscription`**
- `az role assignment list --assignee 4a6e1474-…` → 佢喺我哋 sub **只有 `Reader`**(scope `RG-RAPO-UOP-DEV`)

⇒ registry 喺**另一個 subscription/tenant**,我哋**冇 management plane 存取**,開唔到 ACR task run。而 **`AcrPush` 係 data-plane role,唔包 `scheduleRun/action`** —— infra 畀嘅權限岩岩好唔覆蓋 `az acr build` 需要嗰樣。

**路二 本地 `docker build` + push** —— 兩重失敗:
- `docker pull node:20-slim` → Docker Hub CDN `production.cloudfront.docker.com` **503**(runbook §0 嗰條規律仍然成立)
- `docker login acrrci3ailanding1.azurecr.io` → **`DENIED: client with IP '165.85.7.2' is not allowed access`**

**⚠️ 順帶更正咗 runbook §0 一句**:§0 寫「ACR `/v2/` 被公司 proxy 擋」。實測**呢個 registry 唔係咁** —— `/v2/` **通得過 proxy**,我哋收到嘅係 **ACR 自己嘅 firewall 拒絕**(真回應,有 CorrelationId,唔係 MITM/503)。⇒ 「Docker Hub CDN 被 proxy 503」同「ACR 被 registry firewall 擋」係**兩件唔同嘅事**,之前混埋一齊講。呢個分辨好重要,因為**解法完全唔同**:前者要 base image 來源,後者要 firewall 放行。

⇒ 已整理成**三個解法**畀 infra 揀(plan 附錄 C **Q1**),推薦第一個(SP 攞 `Contributor` + firewall 放行 `165.85.7.2`)—— 因為佢令 base image 喺 **Azure 側** pull,**一次過繞開公司 proxy 同 registry firewall 兩個問題**。

#### 🆕 B5(新登)—— web portal scheme 對唔上

infra 寫 `http://rapo-uop-web-dev.rci-t.com/`,但實測 custom domain 綁咗 **SNI cert**。⇒ 兩個 scheme 部署後都要實測。呢個唔 blocking,但**填錯係最靜嘅錯法**(密碼重設信條 link 錯,API 照返 204),同 CH-011 R1 同族。

#### 🔴 B2 解封 —— 而且係 **Chris 一句反問揭穿我一個錯誤斷言**

我原本把 B2 寫成 blocker,理由係:「Prisma `migrate deploy` 唔會建 database,而 PG private-only 我哋連唔到,**自己建唔到**」,仲寫咗做交畀 infra 嘅 **Q2**。

Chris 反問:「我們不能夠自行建立 DB 的嗎?即使有帳號?」

**佢啱,我錯。** 我把兩件事混埋咗:
- 「**連唔到 PG 嘅 data-plane**」← 真(private endpoint,公司網未證實通)
- 「**建唔到 database**」← **假** —— Azure PG 建 database 有 **management plane 路徑**(`az postgres flexible-server db create`,純 ARM),同網絡連唔連到 PG **完全無關**。我哋個 SP 係 RG **Contributor** ⇒ 做得到。而且 **UAT runbook §2 本來就係咁建 `platform` 嘅** —— 答案一直喺我自己份 runbook 入面。

實測:`db list` → 只有 `azure_maintenance` / `postgres` / `azure_sys`(UOP 嗰個確實未建)→ `db create -d platform` 成功 → 再 `db list` 見到 **`platform`**。⇒ **B2 完全解封,Q2 由問題清單拎走。**

**值得記嘅教訓 —— 「我做唔到」呢類斷言,同「我做得到」一樣要有證據。** 我對「做得到」一向要求 tool output(H7),但對「**做唔到**」就容許自己憑推理下結論,而呢次個推理錯咗一層。代價唔止係多問一條 —— 係**叫外部團隊做一件我哋自己做得到嘅嘢**,而佢哋照做嘅話冇人會發現我判斷錯。

而且呢個同 **ADR-0026** 嗰條記得好熟嘅規矩係**鏡像**:嗰次係「唔可以由『某張 table 寫得』推論『另一張寫得』」(由通推通);今次係「唔可以由『data-plane 唔通』推論『件事做唔到』」(**由唔通推唔通**)。同一個結構,反方向,而我只防住咗一邊。

### Blockers

- **F0-6** — 等 Chris 拍板 ADR-0027 D1 + 改 Status。**未 Accept 唔開 F2**(PROCESS R5)。
- 🔴 **B1 仍然係唯一硬 blocker** —— 三個解法要 infra 揀(Q1)。**冇 image 就乜都部署唔到**,F5/F6/F7 全部卡死。
- ⚠️ **B3 outbound 半邊未答**(Q3)—— 呢個係本環境存在嘅意義。
- ~~B2~~ 🟢 **已自己解決**(見上)。

### ✅ F0 Accepted → F2 + F3 一次過交付

**Chris 2026-08-04 拍板 ADR-0027 D1 = Option A(api 收返 internal)** ⇒ ADR Status `Accepted`,plan 由 `draft` 轉 `active`,F2 解封。

**F2 — `deploy/azure/aca-dev.json`**(唔改 UAT 個 `aca.json` 一個字,`git status` 證)
- 唔建 ACA env,用既有 `acaen-rapo-dev` 完整 resource id 做 parameter(cross-RG;做 parameter 而唔係寫死,令 **subscription id 唔入 git**)
- api ingress `external:false` + `allowInsecure:true` + port 3000(後者係 UAT 血淚 —— 冇佢 http upstream 會被 301 去 https,runbook §8.3)
- web ingress external + port 8080 + **完整 `customDomains`**
- ✅ **`az deployment group validate` → `Succeeded`**,`error` 全 null

🔴 **F2-1 存底即刻有回報 —— 呢個唔係走過場。** `az resource show` 兩個 app 之後揭到**兩樣唔存底就一定會刪走**嘅嘢:
1. **`workloadProfileName: "Consumption"`** —— 我原本冇諗過要寫
2. **web 個 `customDomains` 完整結構**(含指向 shared env 嘅 `certificateId`)—— 呢個係對外唯一入口,刪咗即係成個站冇咗 domain

同時揭到一個**新風險**:web app 有 **150+ 個 `outboundIpAddresses`**(Consumption 共用池)⇒ **ACA pull image 一樣會撞 ACR firewall**,而逐個放行唔實際。呢個令 B1 個 Q1 更有意思 —— 就算 infra 放行咗我哋公司 IP,**pull 側仲有第二道**。已寫入 as-built。

**F3 — `deploy/azure/aca.params.dev.json`**(gitignored,`git check-ignore` 證 `.gitignore:7`)
- Script 生成 + 直接寫檔,**secret 值由頭到尾冇印過**,只出 masked summary(key 名 + 長度)
- 🔴 **一個差啲踩中嘅坑**:PG 密碼含 **`$` 同 `?`**。`?` 唔 percent-encode 嘅話會被當成 **query string 開始**,connection string 靜靜截斷 —— 而症狀會係「連唔到 DB」,冇人會諗到係密碼被切爛。用 `[System.Uri]::EscapeDataString` 解決。
- `appBaseUrl` 用 **https**(infra 寫 http,但 custom domain 綁咗 SNI cert)—— 已列做 infra Q4

**⚠️ 順帶推翻 `check-template.py` docstring 一句**:佢寫「`az deployment group validate` 喺公司網跑唔到(`az account show` 直接 hang 到 timeout)」。**今日全程通** —— `az account show` / `resource list` / `db create` / `validate` 全部成功。呢句可能係當時嘅 proxy 狀態或者當時未 login,但佢而家會令人**唔去試一個其實跑得到嘅 gate**。已標入 checklist F2-10。

### Actual vs Planned Effort

| Deliverable | Planned (h) | Actual (h) | Variance |
|---|---|---|---|
| F0 ADR draft | 2 | ~1.5 | −0.5 |
| F1-9 as-built | (F1 3h 內) | ~1 | — |
| F2 template | 6 | ~1.5 | **−4.5** —— 因為唔使建 env、又有 UAT `aca.json` 做藍本,實際工作係「刪走 env resource + 換名 + 加 customDomains」 |
| F3 params | 2 | ~0.75 | −1.25 |

### Commits

- `5b33fb4` — `docs(adr): ADR-0027 draft — Azure DEV 部署拓撲 + DEV as-built`
- `b5ec5d8` — `docs: 正名「Azure UAT」= 自建測試環境 + B3 升格成本環境成敗關鍵`
- `<pending>` — `docs(planning): W44 kickoff 同步落 BACKLOG(R7)`

---

**End of W44 progress**(進行中)
