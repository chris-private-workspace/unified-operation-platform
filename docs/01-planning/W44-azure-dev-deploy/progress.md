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

### Decisions(Day 1 尾)

- **ADR-0027 D1 = Option A**(Chris 2026-08-04)—— api ingress 收返 internal。
- **F3-6 = 先 placeholder**(Chris 2026-08-04)—— DEV **暫時唔接**真 Graph / ServiceNow,部署成功之後再逐個接。理由:B1 未解部署都未得(決定隨時改得)· 先驗 boot/migration/seed/前端/break-glass 再接 vendor,壞咗分得清邊層 · 接真 SN 會喺真 instance 開單而手上已有 5 張等 cancel。
- ⚠️ **`azure_url_for_api_call` 由今日起用唔著** —— Option A 令 api ingress 收返 internal。要同 infra 講(ADR-0027 OQ-2)。

### infra 第二輪回覆 —— 三條答齊,其中一條**證明我睇錯咗**

| 問 | 回覆 | 結果 |
|---|---|---|
| Q1 ACR | 「what is the deployment detail error? **We have private dns and endpoint for the ACR, so it will not use public egress IP**」 | ✅ **pull 側佢哋講得啱,我嗰個擔心係多餘嘅**;push 側仍未解 → 第三輪 |
| Q3 n8n | 「N8N also can access by **`http://rapo-n8n-uat.rci-t.com/`**」 | 🟢 **B3 兩半邊都有答案**;新登 **B6**(URL 係 http) |
| Q4 scheme | 「**https:**」 | 🟢 **B5 消除** —— params 檔本來就填咗 https,零改動 |

#### ✅ 我要收返一個講法:pull 側嗰個擔心係多餘嘅

F2-1 存底見到 web app 有 150+ 個 `outboundIpAddresses`,我由此推論「**ACA pull image 一樣會撞 ACR firewall,逐個放行唔實際**」,仲寫入咗 as-built 同精簡版 message。

**infra 一句就拆咗**:ACR 有 **private DNS + private endpoint**,而 ACA 有 VNet 整合 ⇒ pull **根本唔行 public egress**,個 IP 清單同呢件事無關。

⇒ **同 B2 嗰次一樣係「由一個真事實推去一個錯結論」**:嗰次係「連唔到 data-plane ⇒ 建唔到 database」,今次係「有 150 個 outbound IP ⇒ pull 會撞 firewall」。兩次嘅**前半都係實測嚟嘅真嘢**,錯喺後半嗰步推論,而且兩次都係**我漏咗一條我未睇過嘅路徑**(management plane / private endpoint)。已喺 as-built 明文撤銷。

#### 🔴 順帶把 B1 三個解法收窄到兩個

原本第 2 個係「只放行 firewall,我哋自己 build」。**佢其實唔可行** —— 放行咗我哋 push 得,但**仍然 build 唔到**,因為本地 `docker build` 要 pull `node:20-slim` / `nginx:1.27-alpine` 而 Docker Hub CDN **503**。⇒ 剔走。**留住一個死路選項唔係保留彈性,係引人揀錯**,而且揀完要行到一半先發現。

真正可行:①SP 攞 `Contributor` + firewall 放行 ⇒ `az acr build`(base image Azure 側 pull)②infra 代 build + push。

### ✅ `what-if` —— 等 infra 期間做嘅,而且把 R6 由「部署後補救」變成「部署前證明」

等緊 infra 回第三輪嗰陣,想到一個**而家做得到**嘅嘢:`az deployment group what-if`。佢喺**唔部署**嘅情況下顯示呢次 ARM 會改 / 刪咩,零副作用,而且**唔需要 image 存在**(所以唔受 B1 影響)。

呢個直接答咗 R6 最大嗰條問題 ——「ARM 全量 PUT 會唔會刪走 infra 配好嘅 custom domain?」

**結果**:零 resource 被 Delete · 只有兩個 container app `Modify` · **其餘 9 個資源全部 `Ignore`**(Redis / PG / App Insights / KV / 2 NIC / 2 PE / alert rule)· **`customDomains` 同 `workloadProfileName` 唔喺 delta ⇒ 保留** · web `external` 保持 true · `registries` + `secrets` `Create`(what-if 自己 mask 咗值)。api 個 delta 只有 ADR-0027 Option A 預期嗰三樣(`allowInsecure` false→true · `external` true→false · `targetPort` 80→3000)。

⚠️ **三個 property 會被 unset,判斷為無害**:`exposedPort` · `traffic` · `maxInactiveRevisions`。**判斷依據唔係「睇落應該冇事」,而係 UAT 個 `aca.json` 同樣三個都冇寫、而 UAT 三次部署都成功** —— 有實證先當佢無害,冇實證就唔會咁講。

🔴 **值得帶返去 UAT runbook**(留 F8-3):runbook §5 只有 `validate`,而 **`validate` 唔會話你會刪咩**。`what-if` 應該做標準步驟 —— 尤其當 template 打落一個**唔係我哋建**嘅環境。

### Blockers(Day 1 收工狀態)

**🔴 B1 = 唯一硬 blocker,而且卡死晒下游。** 二選一要 infra 揀。冇 image ⇒ F5/F6/F7 全部做唔到,連 F4-4(渲染 nginx.conf 逐行睇)都做唔到 —— 因為起唔到 web container。

⚠️ **B3 有答案但未驗** —— n8n URL 有咗,但「有 URL」≠「container 到得到」,留 F7 實測。**唔阻部署。**

~~B2~~ 🟢 自解 · ~~B5~~ 🟢 消除 · ~~F0-6~~ ✅ Accept · ~~F3-6~~ ✅ 拍板 · 🆕 **B6**(n8n http 明文,接 outbound 前要 Chris 明確接受)。

**⇒ 所有唔受 B1 影響嘅嘢已經做晒。** 下一步唔喺我哋手。

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

## Day 2 — 2026-08-05:infra 第三輪 —— firewall 通咗,但 build 仍然斷

### infra 回覆

1. 「`4a6e1474-…` is the login for registry server；the one have permission to deploy is `d2f094a3-…`」
2. 「i think it is fixed now, the new network having issue. I edited the setting」

### 逐條實測(唔靠推論)

| 測乜 | 結果 |
|---|---|
| `docker login`(用 `4a6e1474`) | ✅ **`Login Succeeded`** —— firewall 真係修好咗 |
| `az acr show -n acrrci3ailanding1` 用 **`d2f094a3`** | ❌ **`could not be found in subscription`** |
| `/v2/_catalog`(firewall 開咗之後) | ✅ 通,**7 個 repo 全部係應用 image,冇 base image mirror** |

#### 🔴 (a) 揭到我一個真嘅疏忽

infra 話「有 deploy 權嗰個係 `d2f094a3`」。我 check 返自己做過乜:**我一直用 `4a6e1474` 試 `az acr show`,而 `d2f094a3` 我只用佢跑過 `az acr list`** —— 而 `list` 同 `show` 唔同(前者要 subscription-level read,返空唔代表 show 唔到)。即係話 **我從來冇用正確嗰個 SP 試過正確嗰條命令**,而我之前已經把「冇 management plane」寫成結論。

補測之後結論**冇變**(`d2f094a3` 一樣 `could not be found`),但**呢個係運氣好,唔係方法對**。教訓同 Day 1 嗰兩次(B2 建 database / pull 側 IP)同一族:**由一個相關但唔對位嘅觀察,推去一個更強嘅結論**。分別係前兩次錯咗,今次啱,而**啱咗唔代表方法企得住**。

#### B1 卡位變咗

由「入唔到 registry」變成「**攞唔到 base image 嚟 build**」:
- ✅ push 側解封(⚠️ 但只證到 `login`,**未證到 `push`** —— 因為冇 image 可以推)
- ❌ `az acr build`:兩個 SP 都冇 management plane
- ❌ 本地 `docker build`:Docker Hub 503,而且 registry **冇 mirror 可以借**

⇒ 解法由兩個變**三個**(firewall 通咗令一條新路可行):①SP 攞 registry `read` + **`scheduleRun/action`**(🔴 **後者唔喺 `AcrPush` 入面**,呢個係整件事嘅關鍵誤解)②infra 代 build ③🆕 infra `az acr import` 兩個 base image 入 registry + 我哋加 `ARG BASE_REGISTRY`(**預設空值令 UAT 逐字不變**)。

> 🔍 順帶:registry 有一個 **`n8n`** repo ⇒ 側面印證 n8n 同 UOP 住喺同一個 landing zone。

### 🔴 Chris 質疑「係咪真係唔部署得到」→ 重新查一輪,揭到一個未立過嘅 assumption

Chris 叫我重新檢查。查嘅時候先發現:**我前三個解法全部 assume 咗「registry 一定要係 `acrrci3ailanding1`」,而呢個 assumption 由頭到尾冇人立過** —— 佢只係「infra 畀咗呢個」自然滑成「只可以用呢個」。

同時亦發現**我漏咗兩個最基本嘅檢查**:
1. **從來冇睇過本機有冇 base image**(`docker images`)—— 之前 `docker pull` 一 fail 就下結論,但 `docker build` **唔一定要 pull**。查完:本機有 `node:20-**alpine**` 但冇 `20-slim`、冇 `nginx:1.27-alpine` ⇒ 結論冇變,但**又係一次「啱咗但方法唔對」**。
2. **從來冇分辨過「Docker Hub 唔通」同「所有 registry 都唔通」** —— 實測 **MCR 通**(`docker pull mcr/hello-world` exit=0),淨係 Docker Hub CDN 503。本機仲有一個 `mcr.microsoft.com/mcr/hello-world` image 一直擺喺度,即係**線索一早喺 `docker images` 裡面**。

#### 解法 ④:自建 ACR(唔使等 infra)

| 檢查 | 結果 |
|---|---|
| `Microsoft.ContainerRegistry` provider | **`Registered`** |
| `az deployment group validate`(建 Basic ACR 落 `RG-RAPO-UOP-DEV`) | **`Succeeded`**,error 全 null |

⇒ `d2f094a3` 個 RG Contributor **建得到我哋自己嘅 registry**,而自己建嘅 registry **有 management plane** ⇒ `az acr build` 跑得,**base image Azure 側 pull** —— 同 UAT 一直行嗰條路一樣。

🔴 **但呢個係 owner 決定唔係純技術**:偏離 infra 交付嘅中央 registry 設計 · 多一個資源同成本 · 將來 image 要搬返中央 · RCI 治理(PAR)未問。
⚠️ **兩件未驗**:`validate` 唔跑 Azure Policy(policy 擋自建就要 `create` 先知)· **ACA 喺 VNet 內 pull 唔 pull 到新 ACR 未實測**(大機會通 —— 佢而家跑緊 `mcr.microsoft.com/k8se/quickstart` ⇒ 出得到公網 —— 但呢個係推論)。

#### 順帶排除咗「換 MCR base image」

`docker manifest inspect` 探五個候選:node 有兩個(`devcontainers/javascript-node:20` · `azurelinux/base/nodejs:20`),**但 nginx 一個都冇** ⇒ 只解到一半。加上 Azure Linux 用 `tdnf` 唔係 `apt-get`、Prisma binary target 要重驗、兩環境 base image diverge ⇒ **唔建議**,記低免得下次再查一次。

#### 🚫 Chris 決定:唔自建,等 infra

**Chris 2026-08-05 拍板** —— 解法 ④ 技術上驗咗可行,但**唔採用**:保持同 infra 交付嘅 landing zone 設計一致,唔為咗快而開一個日後要搬返去嘅平行 registry。

⇒ **B1 繼續係硬 blocker,等 infra 回覆 ①②③。** 評估本身完整保留喺 `09-dev-as-built.md`(標咗「唔採用」)—— 唔係因為想留後路,而係嗰輪實測(provider 狀態 / ARM validate / MCR 五個候選)花咗真功夫,**若日後另一個環境撞同一個牆,唔使由頭查一次**。

⚠️ **要接受嘅代價**:成個部署鏈繼續驗唔到 —— ARM template 打真環境 · **PG v18 migration**(第一次踩)· **ACA 連唔連到 private endpoint 嘅 PG** · seed · smoke · n8n 雙向。呢啲每樣都可能有自己嘅坑,而佢哋**同 registry 完全無關**,只係一齊卡喺同一道閘後面。⇒ infra 一通,呢堆風險會**一次過湧出嚟**,唔會逐個嚟。

#### 呢輪最值得記嘅

**「做唔到」呢類結論,同「做得到」一樣會 rot。** 我第一次講「兩條路都斷」係啱嘅(當時 firewall 未開),但之後環境變咗兩次(firewall 修好、infra 澄清邊個 SP),而**我每次都只係更新結論嘅措辭,冇重新問「個 assumption 仲成唔成立」**。Chris 一句「重新檢查一次」就揭到三樣嘢。⇒ 條件變咗之後,**要重驗嘅唔止係結論,係推出結論嗰個前提**。

---

## Day 3 — 2026-08-05:B1 **完全解封** —— 但解封佢嘅係一條從來冇人列過嘅路

### 先補一件冇入 progress 嘅事(R2 gap,自報)

commit **`0d01f0c`**(`fix(deploy): api build stage 注入公司 root CA 解 prisma generate TLS`)**冇對應 Day-N entry** —— 佢喺 Day 2 收工 doc-sync(`619619f`)之後先 commit,而我冇補返。R2 要求每個 commit 對應一個 Day-N mention,呢度補返:

Day 2 尾段實際上 Docker Hub **一度通返**,於是本機 `docker build` 行得到 —— 但**死喺 `npx prisma generate`**:`self-signed certificate in certificate chain`。公司網對 `binaries.prisma.sh` 做 TLS 重簽,乾淨容器驗唔到 chain。

修法同一個**唔可以靠估**嘅位:實測個 chain 係 `leaf ← CN=RicohCA ← CN=RICOHAP-ROOT-CA`,**唔係**名字最似 proxy 嗰兩張 `Forward Trust CA`(佢哋 2025-02 已過期)。⇒ 揀錯就會「裝咗張 CA 但仲係 fail」,而症狀一模一樣。另加 `NODE_EXTRA_CA_CERTS` —— **Node 唔讀 OS trust store**,單靠 `update-ca-certificates` 無效(`--use-system-ca` 係 Node 22+ 先有,呢度係 node:20)。**只落 build stage**,runtime image 唔會信呢張 CA。

### 🔴 Chris 換咗一台機 —— 而呢個一次過拆晒 B1

Chris 把 project 搬去一台**接得通 Azure DEV 環境**嘅機再叫我重驗。逐項實測(全部真 output):

| 檢查 | 公司網嗰台 | 呢台 | 證據 |
|---|---|---|---|
| **出口 IP** | `165.85.7.2`(公司網) | **`52.187.129.166`**(Azure 段) | `curl ifconfig.me` |
| **Docker Hub** | ❌ CDN 503(反覆) | ✅ **通** | `node:20-slim` · `nginx:1.27-alpine` 兩個都 pull 到 |
| **ACR firewall** | 一度 DENIED,後來 infra 修好 | ✅ **通** | `Login Succeeded` —— **新 IP 一樣放行** |
| **api image build** | 卡 prisma TLS → `0d01f0c` 修好 | ✅ **成功** | BUG-008 個 `RUN test -f dist/main.js` 硬閘 **DONE** |
| **web image build** | **從未試過** | ✅ **成功** | vite `✓ built in 7.16s`,5 個 chunk |
| **push** | 🔴 **從未證過**(冇 image 可推) | ✅ **兩個都成功** | api `sha256:5a8d48…` · web `sha256:1d5436…` |

⇒ **B1 由頭到尾嘅三個未知數(base image 攞唔攞到 · firewall 放唔放行 · push 通唔通)全部有真 output**,而最後嗰個**係史上第一次證到**。

### 🔴 呢個係第 **⑤** 條路,而佢由頭到尾冇出現喺任何一份解法清單

我列過四條:①SP 攞 `scheduleRun/action` ②infra 代 build ③`az acr import` base image ④自建 ACR。**四條全部 assume 咗「build 一定要喺公司網嗰台機做」** —— 而呢個 assumption **同 Day 2 揭嗰個「registry 一定要係 `acrrci3ailanding1`」係同一個病**:唔係有人立過,係「一直喺嗰度做」自然滑成「只可以喺嗰度做」。

**Day 2 retro 我自己寫咗**:「條件變咗之後,要重驗嘅唔止係結論,係推出結論嗰個前提。」今次係同一句嘅**下一層** —— 我當時重驗嘅係「firewall 通咗未」「邊個 SP 有權」,即係**清單入面嘅前提**;但「build host 一定係呢台機」**根本冇入過清單**,所以重驗幾多次都掃唔到佢。⇒ 真正要問嘅唔係「呢幾個前提仲成唔成立」,而係「**有咩前提我根本冇寫落嚟**」。

⚠️ **同時要講清楚一件事**:呢條路解決咗 build/push,**但佢唔係一個更好嘅長期方案** —— 佢等於「換一台唔受公司 proxy 影響嘅機」,而唔係「令部署鏈喺公司網跑得到」。解法 ①(SP 攞 management plane 跑 `az acr build`)仍然係最乾淨嗰個,**infra 嗰邊唔應該因為我哋通咗就撤走**。呢點要同 Chris 講,唔可以靜靜當 B1 消失咗。

### ✅ 部署前 gate 重跑(F2-11 baseline 對數)

`az deployment group what-if` —— tag 更新做 `dev-0d01f0c` 之後重跑,**同 Day 1 baseline 一致**:

- `status: Succeeded` · **零 resource 被 Delete** · **9 個 Ignore** · 只有 2 個 container app `Modify`
- 🟢 **`customDomains` / `workloadProfileName` 都唔喺 delta ⇒ 保留**;web `external` 保持 true
- api delta = ADR-0027 Option A 預期嗰三樣(`allowInsecure` false→true · `external` true→**false** · `targetPort` 80→**3000**)
- web delta = `targetPort` 80→**8080**
- 兩個都 `registries` + `secrets` **Create**;scale `min 0→1`

⚠️ **被 unset 嘅 property 今次係四個,唔係三個**。F2-12 記錄咗三個(`exposedPort` / `traffic` / `maxInactiveRevisions`,有 UAT 實證),今次多咗 **`properties.runningStatus: Running → ''`**。佢係 read-only status field,ARM 應該唔會真改 —— **但我冇實證,呢個係推論**,照 F2-12 自己立嘅標準(「有實證先當佢無害」)就唔可以當佢已驗 ⇒ 部署後 F6-9 對數要專登睇佢。

### Decisions

- **F5 走本地 `docker build` + `docker push`,唔係 `az acr build`**(R3 deviation)。原 plan F5-2/F5-3 寫 `az acr build`,因為 UAT 一直行嗰條;而家兩個 SP 都冇 management plane,而本機 build 通咗 ⇒ 改走本地。**deliverable 冇變**(兩個 image 上到 registry),變嘅係手段。F5-4 個 verify 亦由 `az acr task list-runs` 改成 `docker push` digest。
- **params tag `dev-3ff9c73` → `dev-0d01f0c`** —— 對齊實際 push 上去嗰兩個 image。

### 🔴 部署嘗試 #1 —— `LinkedAuthorizationFailed`,**B4 兌現**

B1 一通即刻跑 `az deployment group create -n uop-dev-w44-0d01f0c`。**失敗**:

```
LinkedAuthorizationFailed: client 'd2f094a3-…' has permission to perform
'Microsoft.App/containerApps/write' on '…/RG-RAPO-UOP-DEV/…/aca-rapo-uop-api-dev';
however, it does not have permission to perform
'Microsoft.App/managedEnvironments/join/action' on the linked scope
'…/RG-RAPO-ContainerAPP-DEV/…/managedEnvironments/acaen-rapo-dev'
```

**🟢 零破壞** —— 部署後 `az containerapp list` 實測:兩個 app `Succeeded`/`Running`、仍係 quickstart image、**web `customDomains` 完好**、`workloadProfileName` 保留、`registries` 仍空。`LinkedAuthorization` 係**授權 pre-flight**,行喺任何 resource 改動之前 ⇒ **what-if 個「零 Delete」保證冇被破壞**。

**🔴 B4 唔係「未實測」,係「答錯咗」。** `az role assignment list --assignee-object-id d6a6b91e-…  --all` 實測 —— SP **只有一個** assignment:`[Contributor] /subscriptions/30dac177-…/resourceGroups/RG-RAPO-UOP-DEV`。infra 答 B4 嗰句「used contributor to replace」係畀咗 **UOP 個 RG** 嘅 Contributor,而 ACA env 住喺**另一個 RG**。B4 原文本身就寫住「SP 對 `acaen-rapo-dev` 連 read 都冇」—— 資料一直喺度,只係我哋見到「infra 已答」就唔再追。

> 🔴 **今日第二個同類教訓,而且更直接**:B4 掛咗兩日「🟢 infra 已答(未實測)」,而**「已答」被當成「已解決」**。一個未實測嘅答覆同一個未問嘅問題,喺風險上係同一樣嘢 —— 分別只在於前者**令人唔再追**。
> 同 Day 3 上半嗰條(「有咩前提我根本冇寫落嚟」)加埋一齊睇:**今日兩次卡位,兩次都唔係技術問題,係「我以為呢格已經冇嘢」**。

**要 infra 做嘅嘢(精確)**:SP object id `d6a6b91e-e98d-4c38-8103-45e70f410006` 要 **`Microsoft.App/managedEnvironments/join/action`**,scope 只需要 `…/RG-RAPO-ContainerAPP-DEV/providers/Microsoft.App/managedEnvironments/acaen-rapo-dev` 嗰一個 resource(唔使成個 RG)。

### 🔴 繞道實測 —— PATCH 一樣 403,**冇路可繞**

Chris 問「係咪真係部署唔到」(同 Day 2 嗰句一樣,而嗰次揭穿咗三個 assumption)⇒ 唔用結論答,去實測。

原本估「`az containerapp` PATCH 可能唔送 `environmentId`」。**用一個最小、部署本身需要、可逆嘅步驟做探針**(`az containerapp registry set`,唔掂 image)—— **一模一樣嘅 `LinkedAuthorizationFailed`**。零改變(`registries`/`secrets` 實測仍空)。

⇒ **任何 `Microsoft.App/containerApps/write` 都觸發 linked auth 檢查**,唔理 ARM full PUT 定 CLI PATCH —— 因為既有 resource 本身已經 linked 住嗰個 env,RP 每次 write 都要驗。**`join/action` 係硬需求,唔係 template 寫法問題。**

> 順帶:呢次探針**冇重複 Day 2 嘅模式**。Day 2 Chris 一問就揭到三個未立過嘅 assumption;今次同樣去查,但查完結論企得住 —— **分別在於今次係實測企住,唔係推理企住**。

### Blockers

🟢 **B1 CLOSED** · 🔴 **B4 OPEN(新嘅唯一硬 blocker)** —— 等 infra 畀 `join/action`。
⚠️ B3(ACA → private PG / n8n outbound)· B6(n8n http 明文)未動,兩個都要部署後先驗得到。

**⇒ 一直卡喺 B1 後面嗰堆風險而家全部搬去卡喺 B4 後面**(Day 2 已預告佢哋會一次過湧出嚟):ARM template 打真環境 · **PG v18 migration 第一次踩** · ACA 由 VNet 內 pull 唔 pull 到 registry · ACA 連唔連到 private endpoint 嘅 PG · seed · smoke · n8n 雙向。呢啲同 registry / 權限 **完全無關**,只係一齊卡喺同一道閘後面。

### Commits

- `0d01f0c` — `fix(deploy): api build stage 注入公司 root CA 解 prisma generate TLS`(**補記**,見本節開頭)
- `<pending>` — `docs(deploy): W44 Day 3 — B1 解封,image build + push 實證`

---

## Day 4 — 2026-08-06:**部署咗** —— 但「部署成功」同「驗證到成功」係兩件事

### infra 第四輪:兩個問題,而兩個都揭到嘢

**問題一:「environment setting you need to change what? 點解部署要改 environment setting?」**

呢個係我表達失誤引起 —— 我上一輪寫 `--role Contributor --scope <env>`,佢哋見到 "Contributor" 自然以為我哋要改佢哋個 env。**實情係我哋一個 environment setting 都唔使改**:`join/action` 唔係「改 environment」嘅權,係「**把 app 掛落 environment**」嘅權。已用 template 實證回覆(`aca-dev.json` 有**兩個** `Microsoft.App/containerApps` resource、**零個** `managedEnvironments` resource),並改推**只含 `join/action` 嘅自訂角色** —— 佢結構上做唔到任何修改 env 嘅嘢,直接消除佢哋嘅顧慮。

**問題二:「`join/action` is used to create new container app. The container app is already created, please use aca-rapo-uop-api-dev & aca-rapo-uop-web-dev」**

### 🔴 佢哋啱,我錯 —— 而我錯嘅方式係第四次重複同一個模式

我上一輪寫低「**任何** `containerApps/write` 都觸發 linked auth 檢查,冇繞道」,依據係 `az containerapp registry set` 都 403。**實測推翻**:

```
az rest --method patch --url ".../containerApps/aca-rapo-uop-api-dev?api-version=2024-03-01" \
        --body '{"properties":{"template":{"scale":{"minReplicas":1}}}}'
→ 成功。minReplicas 由 0 變 1(實測確認)
```

| 路徑 | 結果 | 真正原因 |
|---|---|---|
| ARM template full PUT | 🔴 403 | template **明確送 `environmentId`** |
| `az containerapp registry set`(CLI) | 🔴 403 | **CLI 做 read-modify-write**,連 `environmentId` 一齊送返去 |
| **`az rest` PATCH,body 唔含 `environmentId`** | 🟢 **成功** | ARM 冇 linked resource 要驗 |

⇒ 觸發條件係「**body 有冇宣告 `environmentId`**」,唔係「有冇 write」。

🔴 **呢個係 B2(建 database)/ pull 側 IP / Day 2 `az acr show` 之後第四次同一個模式**:由一個真觀察推去一個更強嘅結論。今次最要記,因為我上一輪仲寫低咗「今次係實測企住,唔係推理企住」—— 而嗰個「實測」只覆蓋咗 CLI 一條路,我把佢推廣成「任何 write」。**「我實測過」唔等於「我實測嘅範圍覆蓋到我個結論」。**

### ✅ 部署執行(Chris 拍板走 PATCH)

兩個 `az rest --method patch`,body 對齊 `aca-dev.json` 但**刻意唔含 `environmentId` / `workloadProfileName` / web 嘅 `customDomains`+`external`**。腳本先 dry-run 印 masked 結構驗過先送(19 env · 8 secret · array 型別 · 零 `environmentId`)。

**結果**:api revision `--0000002` **`Healthy`/`RunningAtMaxScale`** · web revision `--0000001` **`Healthy`/`Running`** · 🟢 **ACA 由 VNet 內成功 pull `acrrci3ailanding1`** · 🟢 **`customDomains` + `workloadProfileName` + `environmentId` 全部完好**。

**PATCH 一個原本冇諗到嘅優勢**:ARM full PUT 會 unset 冇寫嘅 property(what-if 顯示四個);PATCH 只改你送嗰啲 ⇒ **infra 配嘅 custom domain / SNI binding 結構上掂唔到**。對「唔好整爛 infra 配好嘅嘢」呢個目標,**PATCH 比 template 更安全**。

### 🔴 但 —— 三樣核心嘢仍然**未驗證**,`Healthy` 係假安心

`apps/api/docker-entrypoint.sh` 第 12–16 行明文設計成 migrate / seed 失敗 **NON-FATAL**(`|| echo WARN` 之後照 `exec node dist/main`)⇒ **PG 完全連唔到,容器一樣 `Healthy`**。呢個係 W33 為 UAT 做嘅有意取捨,但代價正正係 F7 記錄嗰種「**紅得靜**」。

**三條驗證路全部封死**:`logs show` ❌ 要 `managedEnvironments/read` · `exec` ❌ 同上 · HTTP smoke ❌ 四個 URL 全部 `000`。

**HTTP 打唔到唔係部署壞咗** —— `aca-…azurecontainerapps.io` 同 `rapo-uop-web-dev.rci-t.com` 喺**企業 DNS(`az-sgp-dc1` 10.160.50.4)同公網 DNS(8.8.8.8)都解析唔到** ⇒ `acaen-rapo-dev` 係 **internal-only env**;custom domain 係企業 split-horizon DNS。**呢台 build host 喺 SGP VNet,結構上打唔到嗰兩個網絡。**

🔴 **⇒ B3(ACA 連 private PG)· PG v18 migration(G8)· seed 三樣仍然係未知數。** 唔可以喺任何地方寫成「已驗」。

> **今日最值得記嘅**:B1 通咗、B4 繞過咗、部署真係落咗 —— 但**驗證能力反而係新嘅樽頸**。之前四日一直當「部署到就驗到」,而實際上**部署權限同觀測權限係兩套嘢**,我哋只爭取過前者。

### 🟢 轉去 management plane metrics —— **`storage_used` 補返大部分**

三條直接驗證路封死之後,唔應該就咁停喺「等 infra / 等 Chris」。PG 住喺我哋有 Contributor 嘅 RG ⇒ **metrics 讀得到**,唔使 log / exec / 企業網。

**`storage_used`(api revision 建於 `04:14:08Z`)**:

```
03:40 – 04:10   4,421,869,568   ← 連續 7 點完全一樣
04:15           4,422,836,224   ← +966,656 bytes (≈944 KB)
04:20 – 05:35   4,422,836,224   ← 之後零變動
```

🟢 跳升**精確落喺容器起身嗰個窗口**,量級同「建 schema + seed」吻合,之後平穩(冇 retry loop)。
配合 `connections_failed` **全程 0**(排除密碼錯 / 連接上限)+ `active_connections` **+2**(單 replica idle pool)。

| # | 項 | 狀態 |
|---|---|---|
| 1 | **B3 — ACA 連 private endpoint PG** | 🟢 **實質已證**(冇連接就唔可能有寫入)—— **本環境存在嘅意義,通咗** |
| 2 | **PG v18 migration**(G8) | 🟢 **強證據**(migration fail 嘅話 entrypoint 只 `WARN`,唔會有寫入) |
| 3 | **seed** | 🟡 **證到「有寫入」,證唔到「24 個 OpCo 齊」** —— 944 KB 入面 schema 同 data 拆唔開 |

> **方法論收穫**:直接路封死唔等於冇路。**部署權限同觀測權限係兩套,但 metrics 係第三套** —— 佢喺我哋一直有嘅 RG Contributor 入面,四日嚟冇人諗過用佢。同 Day 3 嗰條「有咩前提我根本冇寫落嚟」係同一族:**唔係搵唔到答案,係冇問「仲有邊度可以問」。**
> ⚠️ 但要守住強度:metrics 證到「連得到 + 寫咗嘢」,**證唔到 row count / admin 帳號 / API 200**。仍然要一次直接驗證先收得尾。

### 🟢🟢 B7 解封 → 三個未知數**全部收齊**(container log 原文)

infra 2026-08-06 畀咗 SP `managedEnvironments/read` + enable log。⚠️ **一個中途插曲**:第一次重試 `logs show` 仍然 403,但 error 入面個 client id 係 **`2ae44f00-…`** —— **第四個唔同嘅身份**(之前仲撞過 `a19dfe76`)。呢台機嘅 az session 唔穩定,而錯身份會畀出**誤導性 error**。⇒ 按 Day 0 做法,用**獨立 `AZURE_CONFIG_DIR`** 登入我哋自己個 SP,身份即刻穩定,亦冇踩到 operator 嘅 session。

log 攞到之後,**啟動嗰刻嘅記錄仲喺度**:

```
04:14:26  [entrypoint] prisma migrate deploy
04:14:27  19 migrations found in prisma/migrations
04:14:28  The following migration(s) have been applied:      ← 19 個全部
04:14:28  [entrypoint] seeding (idempotent upserts)
04:14:30  Seeded local admin (admin@uop.local).
04:14:30  Seeded 24 OpCos + admin + RHK OPCO_IT user.        ← 精確 24 個
04:14:31  [NestApplication] Nest application successfully started
```

🟢 零 `WARN: migrate deploy failed` · 零 `WARN: seed failed` · 零 Error。

| # | 項 | 狀態 |
|---|---|---|
| 1 | **B3 — ACA 連 private endpoint PG** | 🟢 **已證** —— migration 真跑咗,冇連接做唔到 |
| 2 | **PG v18 migration(G8)** | 🟢 **已證** —— 19 個全部 applied |
| 3 | **seed** | 🟢 **已證** —— 原文 `Seeded 24 OpCos + admin + RHK OPCO_IT user.` |

> **metrics 推論事後對照**:之前靠 `storage_used` +944 KB 推「連得到 + 寫咗嘢」,並**刻意**把 seed 標 🟡(分唔開 schema 同 data)。log 出嚟三項全中,而 seed 嗰個 🟡 **正正係應該嘅強度**。
> 🔴 **值得記嘅唔係「我推啱咗」,係「我標啱咗信心強度」** —— 前者靠彩數,後者可以複製。本 phase 之前五次錯,全部都係**強度標錯**(把「一條路實測」當「所有路實測」),唔係推論方向錯。

### 🔴 SSO(新 F9)—— infra 交嘅 app registration **只配咗程式對程式**

部署成功之後 Chris 提出「上咗 Azure 就應該開 SSO」。infra 同日交出 `APP - unified operations portal - SSO - UAT`(appId `08fa14bf-…`)+ 一個 client secret(exp 2028-07-28)。

**先排除咗兩個誤判**:
- 我最初以為嗰組 `tenant + client + secret` **係 Graph 嗰組**(形狀完全對得上 client credentials)。**Chris 一句「Graph 嘅 `.env` 一直有」就推翻咗** —— 實測 confirm:新 app 喺同一個公司 M365 tenant(`d1ea071a`)但**係另一個 app**(Graph 係 `27d329e5`),而且新 app `roles` **空**(冇 Graph permission)⇒ 佢真係為 SSO 而建。

**三樣缺失,全部有錯誤碼**(Chris 喺瀏覽器實測):

| # | 缺乜 | 證據 |
|---|---|---|
| 1 | **一條 redirect URI 都冇** | `AADSTS900971: No reply address provided` —— 🔴 唔係「登記咗但唔啱」(嗰個係 50011),係**一條都冇** |
| 2 | **冇 Expose an API scope** | `AADSTS500011: resource principal not found` |
| 3 | **token 係 v1** | claim `ver: 1.0`;而 `jwt-auth.guard.ts:170-177` 用 `jwt.verify(…, { issuer })` **精確比對** v2 issuer ⇒ 一定 401 |

🔴 **第 3 樣最危險**:登入**睇落完全成功**,入到系統全部 401,錯誤訊息一個字都唔提版本。同 F7 outbound 嗰種「紅得靜」同族。

**先查咗可回退性再落任何嘢**:`api.ts:25` local profile 優先於 `msalConfigured` · `login.tsx:167-174` 本地登入表單永遠喺 ⇒ 最壞只係 SSO 按鈕報錯,break-glass 照用。**確認安全先繼續。**

**唔重 build 嘅理由**:`VITE_ENTRA_API_SCOPE` 係 build-time 烘死落 image,而個 scope 根本唔存在 ⇒ build 咗係浪費一次(~10 分鐘)。等 infra 補齊一次過做。

#### 🔴 兩個方法論事件(兩個都改咗結論)

**① 一個假陽性,被對照組接住。** 最初用 PowerShell 打 authorize endpoint 測 redirect URI,得到「200,冇 AADSTS」,**差啲寫成「redirect URI 已登記」**。跑對照組(**故意錯**嘅 URI)一樣 200 冇錯誤 ⇒ **個方法本身無效**。真相:現代 Azure 登入頁係 SPA,**錯誤由瀏覽器 JS 畫**,命令列只攞到空殼 HTML ⇒ 要喺**真瀏覽器**開。
> 呢個係今日**第二次**靠對照組接住自己(第一次係攞 n8n DNS 做對照)。**「加一個已知應該失敗嘅 case」而家係我測任何嘢嘅預設動作。**

**② 一個措辭要收返。** 我寫「冇 Expose an API」,但實測到嘅只係「叫 `api://<client-id>` 嗰個唔存在」—— Application ID URI **可以係任何名**。⇒ 問法改成「**係咩**」唔係「請設定」。
> 🔴 **同 Chris 問「你肯定冇睇漏?」直接相關** —— 佢問嗰陣我本來可以答「我肯定」,但去翻查就揭到呢兩樣。**「你肯定嗎」唔應該用重申答,要用重查答。**

### 🟢 第 ③ 樣自己解咗 —— guard 同時接受兩個 issuer(Chris 拍板「路 B」)

infra 補咗 redirect URI(①)之後,重測發現 ② ③ 仍然差。**Chris 拍板:第 ③ 樣唔等 infra,我哋自己喺 API 側解。**

```ts
this.issuer = [
  `https://login.microsoftonline.com/${tenantId}/v2.0`,  // accessTokenAcceptedVersion: 2
  `https://sts.windows.net/${tenantId}/`,                // 1 / null(legacy)
];
```

**點解呢個唔係放鬆安全**:
- 兩個值都由**同一個 `tenantId`** 推導 ⇒ 跨 tenant **零放寬**
- `audience` 保持**單一精確值** —— 放寬佢先至係真窿(test 有明文 assert 守住呢條線)
- token 用邊個 issuer 係 **app registration 嘅屬性**,唔係我哋 code 嘅屬性。只認 v2 等於把一個 infra 側配置變成我哋側嘅硬失敗,而且係**最貴嗰種**(登入成功 → 之後全部 401 → 錯誤唔提版本)

⚠️ **型別陷阱(實撞,值得記)**:`@types/jsonwebtoken` 個 `issuer` 係 `string | [string, ...string[]]`(**非空 tuple**)。用 `string[]` 會令 **7 個 overload 全部唔匹配**,連帶 callback 兩個參數變 implicit `any` —— 即係**一個型別錯會偽裝成三個唔相關嘅錯誤**。改宣告成 tuple 就三個一齊消失。

**驗證**:新增 test `verifies against BOTH tenant issuer forms (v2.0 and legacy v1)` —— 捕獲傳畀 `jwt.verify` 嘅 options,assert `issuer` 係嗰兩個值 **兼且** `audience` 仍然單一。**879 test / 68 suite 全過**(之前 878,新增嘅正好係呢個)。

**點解唔開 ADR**:冇改 vendor / module 邊界 / storage / 任何 locked 決策,亦**冇推翻 ADR-0002**(佢仍然係「Entra token,RS256 + JWKS + aud/iss/exp」)—— 變嘅只係 `iss` 由認一個變認同一 tenant 嘅兩個。屬 §5.1 明文列出嘅「唔屬架構改動」。**但因為佢掂到認證,落手前有攞 Chris 明確拍板。**

🔴 **⇒ SSO 而家淨係差一個答案:確切嘅 Application ID URI。**

### Decisions

- **走 raw ARM PATCH 部署**(Chris 2026-08-06 拍板)。`aca-dev.json` 保留 —— 佢仍然係 topology 嘅宣告式真相,而且 infra 一畀 `join/action` 就用得返。⚠️ **部署機制由宣告式 template 變成 PATCH 腳本,係一個要記入 ADR-0027 嘅補充**(未做,見下)。
- **仍然向 infra 要 `join/action`** —— PATCH 係 unblock,唔係取代;冇佢 ARM template 永遠用唔到。
- 🆕 **新增向 infra 要 `managedEnvironments/read`** —— 純唯讀,解封 log + exec,係而家最大嘅樽頸。

### Blockers

🟢 B1 CLOSED · 🟢 B4 **繞過**(PATCH)· 🔴 **B7 新登 —— 觀測權限**:冇 `managedEnvironments/read` ⇒ 睇唔到 log、入唔到 container,而 entrypoint 又係 fail-soft ⇒ **部署咗但驗唔到**。
⚠️ B3 / PG v18 / seed 三樣由「卡喺閘後面」變成「**部署咗但睇唔到結果**」。

### Commits

- `dbf4cc9` / `aaef7cd` / `2501213`(Day 3 + B4;⚠️ `2501213` 個結論**本日已推翻並更正**)
- `<pending>` — `feat(deploy): W44 DEV 部署 #1 — raw ARM PATCH 繞過 join/action`

---

## Day 5 — 2026-08-07:**唔再堅持** —— SSO 改成配合 infra 已經配好嘅嘢

### 🔴 決定性嘅一句唔係技術判斷,係 Chris 嘅

> 「跟隨番 infra 那一邊的配置去改動本項目的 SSO auth 流程,不要再浪費時間去堅持原來的設計」

之前四日,我哋一直做同一件事:**要求 infra 把一個已經配好嘅 app,改成 ADR-0003 需要嘅形狀**。三輪往返,佢哋三次答唔到「Application ID URI 係咩」(先後答「web portal 網址」/「OAuth authorization endpoint」/「Application ID = client id」)。

我一直把呢個讀成溝通問題。**實際上佢係一個訊號** —— 呢個詞對唔熟 OAuth 嘅人根本讀成「應用程式嘅網址」,而佢哋每次答嘅都係一個**合理**嘅解讀。三次都答唔到同一條問題,值得懷疑嘅唔係對方,係「呢條問題係咪一定要問」。

### 🔴 一查就見到:佢哋配嘅嘢,本身就係另一條路嘅完整形狀

| infra 已配 | 對 MSAL SPA(ADR-0003) | 對 server-side code exchange |
|---|---|---|
| client **secret** | 用唔着(PKCE 唔要 secret) | **必需** ✅ |
| redirect URI | 要,但要喺 SPA platform 下 | **必需** ✅ |
| **冇**開 public client flows | ⇒ 唔係 SPA platform ❌ | **正常**(confidential client)✅ |
| **冇** Application ID URI / scope | 🔴 **缺** | **唔需要** ✅ |

⇒ **四項全中,零項要對方再做嘢。** 而同一個 tenant 已上線嘅 `ai-it-project-process-management-webapp` 行 NextAuth + AzureAD provider,走嘅正正係呢條路 —— 所以佢從來唔需要 Application ID URI。

**⇒ ADR-0028,Chris Accepted。** supersedes ADR-0003;ADR-0002 唔推翻(驗證邏輯照用,只係由 guard 移去 callback endpoint)。

### 落地

| 層 | 改動 |
|---|---|
| API | 🆕 `entra-sso.service.ts` —— state + PKCE、code exchange(client secret 喺 server 側)、id_token 驗證(JWKS · aud = client id · **兩個 issuer**)· 🆕 `entra-user.ts` —— `oid` upsert,guard 同 SSO **共用一份** · 三條新 route:`GET /auth/sso/status` · `GET /auth/entra/start` · `POST /auth/entra/callback` |
| Session | `auth.service.grantSession` 由 private 變 public ⇒ **SSO 同 break-glass 喺呢一點匯合**,落面全部一樣(cookie / guard / refresh / logout) |
| 🔴 Guard | `resolveLocalUser` → `resolveSessionUser`,同 `refreshSession` 一齊拆走 `authProvider:'local'` 過濾 |
| 前端 | 刪 `msal.ts` + 兩個 `@azure/msal-*` dep + `msal-vendor` chunk;`api.ts` 成個 `authHeader()` 拆走(cookie 自己會送)· 🆕 `sso.ts` / `dev-bypass.ts` · login 掣改由 `GET /auth/sso/status` **runtime** gate |

### 🟢 一個落 plan 時冇預見嘅收穫:配置由 build-time 降做 runtime

`VITE_*` 係 **vite 編譯期烘死落 bundle** 嘅。ADR-0003 之下,「改一個 client id」= 重 build image ≈ 10 分鐘,而且**估錯咗要重來一次** —— 呢個就係 F9-5b 嗰句「⚠️ 佢係 build-time 烘死,估錯要重 build」嘅實質風險。

而家四個 `ENTRA_*` 全部由 **API runtime** 讀,`Dockerfile` 嗰四個 `ARG VITE_ENTRA_*` 已拆走。

⇒ **一個 web image 通行所有環境;換 app registration / 改 redirect URI = 改 env + restart。**

### ⚠️ 兩個「唔拆就會紅得靜」嘅位,值得記低

1. **`authProvider:'local'` 過濾**(guard + `refreshSession`)。唔拆嘅話:SSO 登入**睇落完全成功**,cookie 都發咗,然後每一個 request 401,而錯誤訊息會指向 token 而唔係指向 provider 過濾。呢個同 B9 第 ③ 樣(v1 issuer)係**一模一樣嘅失敗形狀** —— 登入成功、之後全錯、訊息唔提真因。撞過一次,所以今次係搵出嚟嘅,唔係踩到嘅。
2. **state cookie 喺 callback 驗證之前就清**。一次 attempt 一次機會 —— 失敗最有機會令人 reload,而 reload 帶住未清嘅 code 就係 replay 一個已經用過嘅 code。

### ✅ 驗證

- **api:900 test / 69 suite 全過**(之前 879 / 68)
- **web:282 test**,新增 `sso.test.ts` 6 條全過;`npm run build`(含 `tsc --noEmit`)**exit 0**,`msal-vendor` chunk 已經冇咗
- permission matrix snapshot **逐行核對**:淨係多咗三條新 public route,零其他改動
- 每個新 test 都有**對照組**(state 對 vs 唔對 · SSO enabled vs disabled · 有 code 冇 state · 有 session vs 冇)—— 呢個而家係預設動作

### 🔴 web 有 6 個既有失敗,**唔係本次造成**(有對照組)

`local-profile.test.ts` ×5(`localStorage.clear is not a function`)+ `reset-password.test.tsx` ×1。**用 `git stash` 把本次全部改動撤走後重跑,6 個失敗一模一樣** ⇒ 因果排除。

⚠️ **而我第一個診斷係錯嘅,值得記**:我推測係「vitest 把 window 屬性複製去 global 時漏咗原型方法」,聽落好合理。**但寫入 doc 之前真跑咗一次**(臨時 test 檔,跑完即刪),結果係 —— `window.localStorage` **一樣**冇 `getItem`/`setItem`/`clear`,而且同 `globalThis.localStorage` 係**同一個物件**。

⇒ 真相係 vitest+jsdom 環境提供咗一個**無方法嘅空殼 Storage**,唔係 global 複製問題。**修法唔係一行**,要查 vitest 2.1 / jsdom 25 嘅組合 ⇒ 已入 BACKLOG,唔喺本次 commit 夾帶。

呢個正正就係 phase 紅旗嗰個「由一個真觀察推去一個更強嘅結論」嘅模式 —— 分別只在於**今次喺寫低之前真跑咗**。

### Decisions

- **ADR-0028 Accepted**(Chris)。ADR-0003 → `Superseded by ADR-0028`,`adr/README.md` index 同步。
- **guard 個 Entra Bearer 路徑保留唔刪** —— 有 test、零維護成本、ADR-0002 仍然成立,而且 m2m 將來要用就唔使重寫。新路徑係**加**一條,唔係換走一條。
- **`local-profile.ts` 檔名同函數名唔改**,雖然佢而家承載兩個 provider。改名要動 8+ 個檔而零功能收益;改咗註釋講清楚就夠(§1.3)。
- **唔做 federated sign-out**。登出只清平台 session,Entra session 唔掂 ⇒ 再撳「Continue with Microsoft」會即刻入返。呢個係正常 SSO 行為(同 tenant 其他 app 一樣),而 federated sign-out 會**順帶登出 Outlook / Teams** ⇒ 屬產品決定唔屬缺口,已寫入 `use-sign-out.ts`。

### ✅ 部署 #2(同日稍後)—— image `dev-3971ad3` 上咗 DEV

| 步 | 結果 |
|---|---|
| ACR 存取 | ⚠️ **`az acr login` 用錯身份就死** —— SP `d2f094a3` 冇 registry 權限,az 會 fallback 去互動式問 username 然後 `EOFError`。改用 `docker login` 配 params 入面嗰組 ACR 憑證(`4a6e1474`)⇒ `Login Succeeded` |
| Build | api + web 兩個 `exit 0`(無 build arg —— **Entra 嘅已經拆晒**) |
| Push | 🟢 **真 push**:api `sha256:eecd2521…` · web `sha256:070c4967…` |
| PATCH | 兩個 app 都 `exit 0`。dry-run 先核對過:`has environmentId: False` · `has workloadProfile: False` · web 唔送 `external`/`customDomains` |
| Revision | api `--0000003` `RunningAtMaxScale`/`Healthy` · web `--0000002` `Running`/`Healthy` |
| infra 配置 | 🟢 實測完好:`customDomains` + **`SniEnabled`** · `external:true` · `workloadProfileName:Consumption` · `environmentId` 原封 |

🟢 **決定性證據唔係 `Healthy`,係 container log 原文**:

```
[EntraSsoService] Entra SSO is configured (server-side code exchange).
19 migrations found in prisma/migrations
Seeded 24 OpCos + admin + RHK OPCO_IT user.
Nest application successfully started
```

零 `WARN: … failed`。第一行係關鍵 —— `EntraSsoService` 個 constructor **四個 env 齊晒先會 log 呢句**,所以佢直接證到配置到位,唔使靠 `Healthy` 推論(而 `Healthy` 本來就證明唔到,entrypoint fail-soft)。

### 🟢 bundle 實證 —— 前端真係唔再知道任何 Entra 座標

`dist/assets/*.js` grep `msal|login.microsoftonline|VITE_ENTRA|acquireTokenSilent|PublicClientApplication|access_as_user` ⇒ **零命中**。
**對照組**:同一個 grep 方法搵 `/auth/sso/status` · `/auth/entra/start` · `/auth/entra/callback` ⇒ **三條都搵到** ⇒ 方法有效,「零命中」係真嘅零。`msal-vendor` chunk 亦已喺 build output 消失。

### 🔴 一個想提前拆但**拆唔到**嘅風險 —— 而對照組又一次接住咗我

**風險**:ADR-0028 要 redirect URI 喺 **Web** platform,而我哋當初要求 infra 加嘅係 **SPA** platform(plan 附錄 C 第四輪原文寫住「加 platform **Single-page application**(唔係 Web)」)。若真係加咗喺 SPA 下,server-side exchange 會撞 **`AADSTS9002327`**(SPA client-type 只可以經 cross-origin 兌換)。

**試過點拆**:用一個假 code 打 token endpoint,諗住睇錯誤碼分辨 —— SPA 會回 `9002327`,Web 會回「code 唔啱」嗰類。

**結果:個測試冇區分度。**

| case | 錯誤碼 |
|---|---|
| 真 redirect_uri + 真 secret | `AADSTS9002313` |
| **對照 A** 故意錯 redirect_uri | `AADSTS9002313` |
| **對照 B** 故意錯 client_secret | `AADSTS9002313` |

三個一模一樣 ⇒ 假 code 令 Entra 喺檢查 redirect_uri / secret **之前**就 reject 咗 ⇒ **呢個測試證明唔到任何嘢,已棄用。**

🔴 **值得記低嘅唔係個風險,係我差啲又做咗同一件事** —— 如果我只跑第一個 case,我會見到一個「唔係 9002327」嘅結果,然後好可能寫成「唔係 SPA 問題」。**兩個對照組一跑就見到個方法本身無效。** 呢個係本 phase 第四次靠對照組接住,亦係第二次喺同一日發生(上一次係 `localStorage` 嗰個診斷)。

⇒ 呢個風險**只可以靠 F9-8 一次真登入拆**。好消息係若真係撞到,錯誤碼好明確,而修法對 infra 嚟講係一句好具體嘅嘢:「把 redirect URI 由 SPA platform 搬去 Web platform」。

### 🟢 SSO 真登入通咗(Chris,公司網)—— 順帶拆咗 `AADSTS9002327` 個風險

Chris 喺公司網開站,撳「Continue with Microsoft Entra ID」→ 跳到 Microsoft 登入頁 → **入到系統**。

⇒ **F9-18 個風險冇兌現** —— infra 條 redirect URI 係 **Web** platform 唔係 SPA,所以 server-side exchange 行得通。(呢個係我試過用假 code 提前拆但拆唔到嗰個。)

🟢 **順帶證咗一樣本來未知嘅嘢:DEV 個 ACA 出得到公網。** SSO 要成功,api container 必須打得通 `login.microsoftonline.com` **兩次**(換 token + 攞 JWKS)。呢個之前完全未驗過 —— B3 只證咗 ACA → private endpoint PG,而「PG 通 ⇒ 公網通」係一個唔成立嘅推論。

### 🔴 Chris 跟住發現 Graph / ServiceNow 連唔到 —— 而對照組證咗**唔係今次整壞**

部署 #1 個 revision `--0000002` 仲喺度,啱啱好做對照組:

| env | `--0000002`(部署 #1,今次冇碰過) | `--0000003`(今次) |
|---|---|---|
| `GRAPH_TENANT_ID` | `PLACEHOLDER-not-connected` | `PLACEHOLDER-not-connected` |
| `SERVICENOW_INSTANCE_URL` | `https://placeholder.service-now.com` | `https://placeholder.service-now.com` |

⇒ **兩個一模一樣。唔係「斷咗」,係 F3-6 當初拍板「先 placeholder,部署成功再接」而一直未接。** Chris 今次先第一次真正入到 DEV 系統,所以先見到。

### ✅ 部署 #3 —— 接真 Graph + ServiceNow(Chris 拍板「兩個都接」)

我先講咗風險(SyncSweep `@Cron` 會打真 Graph · gate ② 會打真 SN · UOP 同 n8n 共用 SN 帳號 R7 分唔到邊個做),Chris 重申兩個都接 ⇒ 照做。

🟢 **查 `.env` 之後風險比我講嗰個細** —— `SERVICENOW_INSTANCE_URL` = `https://ricohapdev.service-now.com`,係 **dev instance 唔係 prod**。

**順帶執返一個一直冇部署過嘅洞**:`SERVICENOW_O365_CATALOG_ITEM_SYS_ID` / `SERVICENOW_D365_CATALOG_ITEM_SYS_ID` 兩個 env **腳本由頭到尾都冇送過**。佢哋走 `config.get` 唔係 `getOrThrow` ⇒ 唔設照 boot,**但一建單就 throw**「catalog item is not configured」⇒ 會變成「ServiceNow 接咗但建單壞」,而且只有人試建單先發現。值取自 `.env.example`(明文標註 = ricohapdev 實測值,同 instance 對得上)。

**結果**:PATCH 兩個 `exit 0` · revision `--0000004` `RunningAtMaxScale`/`Healthy` · log `19 migrations found` / `Seeded 24 OpCos…` / `Entra SSO is configured` / `Nest application successfully started`,零 ERROR。

### 🔴 一個 guard 接住咗嘅 parse bug —— 而佢令我一個已經講咗出口嘅結論變成「啱得好彩」

寫 params 嗰陣我加咗個 guard:任何一個值攞唔到就 `throw` 停手。佢真係 fire 咗 —— `servicenowO365CatalogItemSysId` 攞唔到值。

**原因**:我 parse `.env` 用嘅 regex 係 `^\s*[A-Za-z_]+\s*=` —— **唔含數字**,而啲 key 叫 `SERVICENOW_O365_…` / `D365_…`。

🔴 **即係我早前同 Chris 講「`.env` 缺三個 catalog key」嗰句,係用一個有缺陷嘅方法得出嚟。** 用 `Grep` 重查證實 `.env` **真係**冇 —— 結論啱,但**啱只係好彩**,方法本身會漏任何含數字嘅 key。

順手用修正 regex(`[A-Za-z_][A-Za-z0-9_]*`)掃埋成個 `.env`,睇有冇其他一直被我漏咗嘅 key ⇒ 只有 `N8N_OUTBOUND_WEBHOOK_KEY`(空值,而 DEV 行 `direct` provider,用唔著)。

**教訓唔係「regex 寫錯咗」,係「一個唔啱嘅方法可以連續畀出啱嘅答案」** —— 若果嗰兩個 sys_id 啱啱好喺 `.env` 入面,我個 guard 就唔會 fire,我會靜靜咁部署咗兩個空值上去,然後「建單壞」呢件事會喺幾日後先浮面。

### 🔴 我洩漏咗 DEV 嘅 `INTAKE_API_KEY`,已 rotate

比對「本機 `.env` 同 DEV 部署嘅 intake key 係咪同一條」嗰陣,我寫咗個叫 **`H`** 嘅 PowerShell 函數做 hash。`H` 撞正 `Get-History` 嘅內建 alias(PowerShell 唔分大小寫)⇒ 佢冇 hash,反而把**原值**塞入 error message。

**DEV 個 64-hex intake key 因此出現喺 tool output。** 按 H4 一律當已洩漏處理。

🟢 **rotate 成本啱好係零** —— n8n 仲未用過佢,而我哋正正要交條 key 畀 n8n owner。Chris 即刻批,一次過畀新嗰條。

**教訓**:遮蔽 secret 嘅**輔助工具本身**都要當 secret-handling code 咁審。單字母 / 常見縮寫做函數名喺 PowerShell 好易撞內建 alias,而失敗模式係「靜靜咁改為印原值」。

### 🔴 而 rotate 過程揭到一個更值得記嘅陷阱:**改 secret 唔會令佢生效**

PATCH `exit 0`,ACA 側 secret 一查(比 hash)**確實已經係新值**。睇落完成。

**但 revision 完全冇動過** —— 仲係 `03:11:33` 嗰個。原因:**ACA 嘅 secret 住喺 `configuration`,唔係 `template`**,所以改佢**唔會產生新 revision**,而跑緊嘅容器係啟動嗰刻注入 env 嘅 ⇒ **佢仲攞住舊 key**。

⇒ 「PATCH 成功 + ACA 側值已更新」**兩個都真,但 rotate 仍然未生效**。要 `az containerapp revision restart` 逼佢重起。

呢個係 checklist F3-7 一直寫住嗰句「改完要新 revision」嘅實測版本,今次係喺 secret 而唔係 `ConnectorConfig` 上面兌現。已把成段寫入 `patch-deploy-dev.ps1` 收尾提示。

### 🔴 同一段入面,一個**假陽性收貨條件**險啲收咗貨

輪詢「舊 replica 走咗未」嗰陣,我個條件係 `$_.c -like '*T03:11*'`。但 `ConvertFrom-Json` 已經把 `createdTime` 轉成 **`DateTime` 物件**,所以個字串比對**永遠唔會匹配** ⇒ 條件形同虛設,第一次輪詢就印咗 `✅ 舊 replica 已走`。

**而嗰刻舊 replica 其實仲喺度跑緊。**

改用 `[datetime]` 比較重跑,先真係見到只剩一個 `04:37:52` 嘅 Running replica。

⇒ **本 phase 第 N 次同一個模式**:一個「睇落合理嘅檢查」實際上冇檢查到嘢,而佢報嘅係**成功**。呢次冇對照組接住 —— 接住佢嘅係「個結果嚟得太快、太乾淨」呢種唔安樂感。

**收貨後 log 實證**(`04:38` 時間戳):`19 migrations found` · `Seeded 24 OpCos…` · `Entra SSO is configured` · `Nest application successfully started`,零 WARN。

### Blockers

🟢 **B9 完成 —— SSO 真登入通咗。**
🟢 **F3-7b 完成 —— Chris 實測 Graph + ServiceNow 兩個 connector 都連得到。** ⇒ 順帶證咗 outbound 對 `graph.microsoft.com` 同 `ricohapdev.service-now.com` 都通(先前只證到 `login.microsoftonline.com`,而我特別標明過唔可以由此推論)。
🔴 **F9-8 仲爭一半:break-glass 未驗**(Chris 話等陣試)。ADR-0028 明文要求「兩邊都要通先算數」。
🔴 **F3-7b:Graph / SN 真連通未驗** —— 啟動 log 證明唔到(connector lazy;`SyncSweepService` 因為新 seed 冇 pending request 亦唔會自動打 Graph)⇒ 要喺 UI 撳 test connection。最可能失敗點 = outbound 去 `graph.microsoft.com` / `ricohapdev.service-now.com` 被 VNet route / firewall 擋。⚠️ SSO 只證咗 `login.microsoftonline.com` 通,**唔可以由此推論另外兩個 host**。
🔴 **F9-8 未做,而且做唔到 —— 要喺公司網。** build host 喺 Azure 段,`rapo-uop-web-dev.rci-t.com` → **`No such host is known`**(符合 B8:企業內部 DNS 記錄,只有公司網解析到)。
🔴 **仍然未有任何一次真人 SSO 登入嘅證據。** 本日全部係 unit test + build + container log + bundle grep,冇一樣係「有人真係撳咗個掣然後入到去」。

### Commits

- `3971ad3` — `feat(auth): SSO 改行 server-side code exchange(ADR-0028),移除 MSAL`
- `<pending>` — `chore(deploy): patch-deploy-dev 加四個 ENTRA_* env;DEV 部署 #2`

---

**End of W44 progress**(進行中)
