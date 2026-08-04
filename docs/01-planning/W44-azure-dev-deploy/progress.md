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

### Decisions / Open-Questions Resolved

- **OQ-1(新增,blocking ADR-0027 D1)**:n8n UAT 解析唔解析到企業 custom domain `rapo-uop-web-dev.rci-t.com`?解析到 → Option A;解析唔到 → Option B + D2 三項收窄。**未查**。
- **OQ-2(新增,唔阻)**:infra team 除咗 n8n,仲有冇其他系統打算直接打 `azure_url_for_api_call`?

### Blockers

- **F0-6** — 等 Chris 拍板 ADR-0027 D1 + 改 Status。**未 Accept 唔開 F2**(PROCESS R5)。
- **B1 / B2 / B3** 維持(Day 0 已記)—— 等 infra team。
- **F1-10** — 四條問題未交出。

### Actual vs Planned Effort

| Deliverable | Planned (h) | Actual (h) | Variance |
|---|---|---|---|
| F0 ADR draft | 2 | ~1.5 | −0.5 |
| F1-9 as-built | (F1 3h 內) | ~1 | — |

### Commits

- `<pending>` — `docs(adr): ADR-0027 draft — Azure DEV 部署拓撲 + DEV as-built`

---

**End of W44 progress**(進行中)
