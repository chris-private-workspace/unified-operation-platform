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

**End of W44 progress**(進行中)
