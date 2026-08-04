# ADR-0027 — Azure DEV 部署拓撲:api ingress 對外定收返 internal(擴 ADR-0012 至第二個雲環境)

- **Status**:**Proposed** —— 🔴 **待 Chris 拍板 D1**(**OQ-1 已 resolved 2026-08-04 ⇒ 推薦嘅 Option A 走得通**,見下)
- **Date**:2026-08-04
- **Owner**:Chris Lai
- **觸發**:CLAUDE.md §5 **H1**(部署 topology = 架構決定,同 ADR-0012 同源)+ **H4**(把 API 直接暴露互聯網 = 安全邊界改變)
- **Phase**:W44-azure-dev-deploy
- **關係**:**擴充** ADR-0012(唔 supersede)—— ADR-0012 定嘅係 UAT 一個環境嘅拓撲,本 ADR 決定**第二個雲環境**點做,以及 UAT 嗰條「單一 origin」原則喺呢度保唔保得住。

---

## Context

### 🔴 先更正一個一直錯咗嘅前提:之前嗰個「UAT」唔係 UAT

Chris 2026-08-04 更正:**W32/W33 部署嗰個環境唔係真正嘅 UAT,只係一個測試用嘅 Azure 環境** —— 我哋自己喺 `rcitest` subscription 由零建起嘅**孤島**(自建 RG + 自建 ACR + 自建 ACA env**冇 VNet 整合** + PG 開 public `0.0.0.0`)。佢住喺 Azure 公網上,同企業網絡**冇任何連繫**。

**呢個就係佢連唔到 n8n 嘅根本原因,而且係雙向嘅**:

| 方向 | 用途 | 舊環境點解唔通 |
|---|---|---|
| **n8n → UOP** | `POST /requests/intake` | n8n 喺企業內網,而舊環境只有一個 `azurecontainerapps.io` 公網 FQDN,冇企業 domain 入口 |
| **UOP → n8n** | outbound webhook · `LicenseOperationsProvider` · `TicketUpdateProvider`(ADR-0017 三個接縫) | 🔴 ACA env **冇 VNet 整合** ⇒ **打唔入企業內網**,無論 n8n 個 URL 係咩 |

⇒ ADR-0012 同 `07-uat-as-built.md` 入面所有「UAT」字眼,**實際指嘅係「自建測試環境」**。命名更正處理:Chris 拍板**保留檔名 / ADR 標題**(改名會令 git history 同文檔引用永久對唔上,W36 教訓),改為喺每個相關檔頂加更正 blockquote。

### 呢個更正令「六處差異」塌縮成一件事

W44 F1 原本列咗 DEV 同舊環境有六處差異。有咗上面個更正,佢哋唔係六件獨立嘅事 —— 係**「自建孤島 → 企業託管」同一個轉變嘅六個表現**:共用 ACA env(企業 env)· PE 落 `vNet-RCITest-HKG`(企業 hub)· **冇 ACR**(registry 應該係企業中央嗰個,所以只有一個 RG scope 嘅 SP 睇唔到 —— **B1 由「唔知去咗邊」變成「要問企業中央 registry 座標同權限」**)· custom domain `.rci-t.com` · PG v18 / App Insights(infra 標準)· api external ingress(infra 假設,即本 ADR 要拍板嗰樣)。

### 本 ADR 管乜、唔管乜(範圍澄清)

🔴 **D1 只管 inbound**(n8n → UOP)。**Outbound(UOP → n8n)完全唔受 D1 影響** —— ingress 設定係 inbound 概念,api 收唔收返 internal 同 UOP 打唔打得出去無關。Outbound 通唔通,**完全繫於 ACA env 有冇 VNet 整合 + 路由到 on-prem**(即 W44 **B3**)。

⇒ **B3 升級**:佢原本只係「container 連唔連到 private PG/Redis」,而家連 **ADR-0017 三個接縫嘅 outbound 半邊通唔通都繫喺佢度**。呢個環境開嚟就係為咗接 n8n,所以 B3 由「部署細節」變成**本環境成敗嘅關鍵**。

---

Infra team 交付咗 `RG-RAPO-UOP-DEV`,目的係令 UOP **同 n8n UAT 接得通**。W44 F1 實測(2026-08-04,SP 真登入)發現佢哋**已經預先建好**兩個 container app,而且 **api 個 ingress 係 `external`**(`aca-rapo-uop-api-dev.…azurecontainerapps.io`,`allowInsecure=false`),仲喺 `.env` 一併交咗個 `azure_url_for_api_call` 畀我哋。

**呢個同 UAT 相反。** ADR-0012 §Decision 1 明文揀咗 **api = internal ingress**,對外只有 web 一個 hostname,理由係兩條認證約束:

> `SameSite=Strict` 令跨 site 請求**永遠唔帶** cookie…而 `main.ts` 至今**無** `enableCors`
> — ADR-0012 約束一

所以問題唔係「external 好定 internal 好」,而係:**infra 開咗 external,我哋要唔要用?**

### 三個決定性事實

**① 單一 origin 已經足夠畀 n8n 用。** web container 個 nginx **已經**把 `/api/*` 反向代理落 api(`nginx.conf.template`,`API_UPSTREAM` 係 env 渲染)。即係 n8n 打 `https://rapo-uop-web-dev.rci-t.com/api/requests/intake` 就**已經**到得到 intake endpoint —— **唔需要** api 對外。呢條路 UAT 一直行緊。

**② api external = 平台第一次把整個 API 直接暴露互聯網。** 唔淨止 `/requests/intake`,而係**所有** route,包括 `/docs/api` 個 OpenAPI UI(會把成套 endpoint + DTO 結構公開)。防線只剩 `IntakeKeyGuard`(fail-closed)同 JWT guard —— 兩者都可靠,但「可靠」同「唔應該暴露」係兩件事。

**③ Option A 原本嗰個未驗證前提,已經冇咗大半。** 原本擔心 n8n 解析唔到企業 custom domain `rapo-uop-web-dev.rci-t.com`。Chris 2026-08-04 確認 **n8n UAT 住喺企業內網(on-prem / 內部 VM)** ⇒ 企業 DNS 解析企業 domain,呢條路成立(**OQ-1 resolved**)。

⚠️ **但仍未係實測**:「內網解析到企業 domain」係一個**合理推論**,唔係一個 curl 出嚟嘅 200。而且個 A record 指住 ACA 公網 IP ⇒ n8n 除咗解析到,仲要**出得到公網**先到得到。⇒ 降級成 **F7 部署後第一件要驗嘅嘢**,唔再 block D1 拍板。

### 順帶:cookie 邊界喺兩個選項下都唔變

無論揀邊個,**browser 流量一律行 web 同源 proxy**。AUTH-4c-B 個 httpOnly + `SameSite=Strict` cookie 唔受影響,`main.ts` 亦**唔使加** `enableCors`。兩個選項嘅分別**只在於 machine-to-machine(n8n)行邊條路**,唔涉及瀏覽器。呢點必須講清楚,因為「api 對外」好容易被誤讀成「前端跨 origin 打 api」——**唔係**。

## Decision

### D1 — api ingress:🔴 **待拍板**

| | **Option A — 收返 internal(推薦)** | **Option B — 保持 external** |
|---|---|---|
| n8n 打邊度 | `https://rapo-uop-web-dev.rci-t.com/api/requests/intake` | `https://aca-rapo-uop-api-dev.…azurecontainerapps.io/requests/intake` |
| 對外暴露 | **只有 web 一個 hostname** | web + **整個 API**(含 `/docs/api`) |
| 同 UAT 一致 | ✅ 一套拓撲兩個環境 | ❌ 兩個環境兩套 |
| `aca-dev.json` | 貼近 `aca.json`,api 加 `allowInsecure:true` | api ingress 照 infra 現狀 |
| 未驗證前提 | ~~n8n 解析唔解析到 `.rci-t.com`~~ **OQ-1 resolved** — n8n 喺企業內網 ⇒ 成立(實測留 F7) | 無(公網 FQDN) |
| 要同 infra 講 | 要(佢哋開咗 external,我哋收窄)+ `azure_url_for_api_call` 變成用唔著 | 唔使 |
| 多一跳 | nginx → api(內部,可忽略) | 無 |

**推薦 Option A**,理由三條:①ADR-0012 嗰兩條認證約束嘅**設計意圖**係「對外面只有一個 hostname」,唔止係為咗 cookie ②DEV 環境本身係為咗接 n8n 而開,而 n8n 需要嘅嘢 Option A **已經滿足** ⇒ external 係**多出嚟嘅**暴露,唔係需求 ③兩個環境同一套拓撲,runbook / template / 排錯經驗全部通用。

**OQ-1 resolved 之後,Option A 已經冇已知障礙。** 若 F7 實測發現 n8n 打唔到 web hostname(例如內網出唔到公網),⇒ 轉 Option B 並照 D2 收窄 —— 呢個 fallback 成本細,因為 ingress 設定改一個 ARM 欄就得,唔使重 build image。

### D2 — 若揀 Option B,必須同時收窄(唔可以淨係「開咗就算」)

1. **關 `/docs/api`**,或者至少喺 external 路徑上關 —— OpenAPI UI 對互聯網公開,等同送一份完整攻擊面清單。
2. 考慮 ACA **IP restriction**,只放行 n8n UAT 出口 IP。
3. `azure_url_for_api_call` 要當**半公開 secret** 對待,唔寫入任何 public doc。

### D3 — browser 流量**永遠**行 web 同源 proxy(兩個選項皆然,唔議)

前端**唔可以**直接打 api external FQDN。呢條係 ADR-0012 約束一嘅延續,同 D1 點揀完全無關。任何 PR 若令 `apps/web` 直接指向 api hostname,即屬違反本 ADR。

### D4 — Redis 唔接(沿用 ADR-0012 §Decision 4)

DEV 環境有 `redis-rapo-uop-dev`,但 `apps/api/src` 實測**零** BullMQ / Redis 用法。ADR-0012 已明文「到 BullMQ 真正 wired 先開 Redis;届時屬另一次 H2 評估」—— 本 ADR **不預批**,維持原狀。

## Alternatives Considered

- **Option A(收返 internal)** — 見 D1 表,**推薦**。唯一風險係 n8n 側 DNS 解析,而呢個查得到。
- **Option B(保持 external)** — 見 D1 表。唔係錯,但要付 D2 嗰三項收窄先算負責任。
- **Option C — api external 但只開 `/requests/intake` 一條 path**:ACA ingress **唔支援 per-path 規則**(唔係 App Gateway / Front Door),做唔到。要做就要加一層 gateway ⇒ 為咗一個 endpoint 加一個元件,同 §1.2 Simplicity 相反。
- **Option D — 兩個 ingress 都 external,前端直接打 api**:**明確 reject** —— 即刻踩爆 ADR-0012 約束一(`SameSite=Strict` cookie 唔會過 site)兼要加 `enableCors`。呢個係「api external」最常見嘅誤讀,寫喺度做防呆。

## Consequences

- **Positive(A)**:對外攻擊面同 UAT 一樣細;一套 template / runbook 兩個環境;`azure_url_for_api_call` 用唔著呢件事本身就係一個清楚訊號 —— DEV 對外只有一個門。
- **Negative(A)**:要同 infra team 講「你哋開咗嘅嘢我哋收窄咗」,並確認佢哋冇其他系統打算直接打 api。
- **Negative(B)**:平台第一次把整個 API 暴露互聯網,而 D2 三項收窄全部係**額外工作**,唔做就係淨暴露。
- **Neutral(兩者)**:cookie / CORS / 前端行為**一個字唔變**(D3);`main.ts` 唔使加 `enableCors`;api 側零 code 改動。

## Open Questions

- **OQ-1 — resolved(Chris 2026-08-04)**:n8n UAT 住喺**企業內網(on-prem / 內部 VM)**⇒ 企業 DNS 解析企業 domain,Option A 成立。⚠️ 仍係推論唔係實測(見 Context ③)⇒ 實測降級做 **W44 F7** 第一項。
- **OQ-2(唔阻 D1)** — infra team 除咗 n8n,仲有冇其他系統打算直接打 `azure_url_for_api_call`?若有,Option A 要重新評估。
- **OQ-3(新增 —— 唔阻 D1,但阻成個環境)** — 🔴 **UOP 由 ACA 打得入企業內網嘅 n8n 嗎?** 即 W44 **B3**。呢個環境開嚟就係為咗接 n8n,而 outbound 半邊(ADR-0017 三個接縫)完全繫於 ACA env 有冇 VNet 整合 + 路由到 on-prem。**D1 揀 A 定 B 都改變唔到呢件事** —— 兩者都要 B3 通先做得到 outbound。查法:問 infra team,或者部署後由 container 側實試打 n8n。

## References

- **ADR-0012**(Azure UAT 部署 topology,單一 origin)—— 本 ADR 擴充佢至第二個環境,**唔推翻**任何一條
- ADR-0006 §7(httpOnly + `SameSite=Strict` cookie)—— 單一 origin 嘅原始約束來源
- ADR-0017(n8n 三接縫)· ADR-0025 / ADR-0026(W43 onboarding licence request)
- `apps/web/nginx.conf.template`(`API_UPSTREAM` env 渲染 + `Host $proxy_host`)
- `docs/01-planning/W44-azure-dev-deploy/plan.md` 附錄 A(DEV 實測座標)/ 附錄 B(六處差異)
- `docs/13-deployment/04-deploy-runbook.md` §8.3(api internal ingress 要 `allowInsecure`)
