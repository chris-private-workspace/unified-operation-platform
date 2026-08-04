# ADR-0027 — Azure DEV 部署拓撲:api ingress 對外定收返 internal(擴 ADR-0012 至第二個雲環境)

- **Status**:**Proposed** —— 🔴 **待 Chris 拍板 D1**(兩個選項並列,見下)
- **Date**:2026-08-04
- **Owner**:Chris Lai
- **觸發**:CLAUDE.md §5 **H1**(部署 topology = 架構決定,同 ADR-0012 同源)+ **H4**(把 API 直接暴露互聯網 = 安全邊界改變)
- **Phase**:W44-azure-dev-deploy
- **關係**:**擴充** ADR-0012(唔 supersede)—— ADR-0012 定嘅係 UAT 一個環境嘅拓撲,本 ADR 決定**第二個雲環境**點做,以及 UAT 嗰條「單一 origin」原則喺呢度保唔保得住。

---

## Context

Infra team 交付咗 `RG-RAPO-UOP-DEV`,目的係令 UOP **同 n8n UAT 接得通**。W44 F1 實測(2026-08-04,SP 真登入)發現佢哋**已經預先建好**兩個 container app,而且 **api 個 ingress 係 `external`**(`aca-rapo-uop-api-dev.…azurecontainerapps.io`,`allowInsecure=false`),仲喺 `.env` 一併交咗個 `azure_url_for_api_call` 畀我哋。

**呢個同 UAT 相反。** ADR-0012 §Decision 1 明文揀咗 **api = internal ingress**,對外只有 web 一個 hostname,理由係兩條認證約束:

> `SameSite=Strict` 令跨 site 請求**永遠唔帶** cookie…而 `main.ts` 至今**無** `enableCors`
> — ADR-0012 約束一

所以問題唔係「external 好定 internal 好」,而係:**infra 開咗 external,我哋要唔要用?**

### 三個決定性事實

**① 單一 origin 已經足夠畀 n8n 用。** web container 個 nginx **已經**把 `/api/*` 反向代理落 api(`nginx.conf.template`,`API_UPSTREAM` 係 env 渲染)。即係 n8n 打 `https://rapo-uop-web-dev.rci-t.com/api/requests/intake` 就**已經**到得到 intake endpoint —— **唔需要** api 對外。呢條路 UAT 一直行緊。

**② api external = 平台第一次把整個 API 直接暴露互聯網。** 唔淨止 `/requests/intake`,而係**所有** route,包括 `/docs/api` 個 OpenAPI UI(會把成套 endpoint + DTO 結構公開)。防線只剩 `IntakeKeyGuard`(fail-closed)同 JWT guard —— 兩者都可靠,但「可靠」同「唔應該暴露」係兩件事。

**③ Option A 有一個未驗證前提。** n8n UAT 要解析到 **`rapo-uop-web-dev.rci-t.com`** 呢個企業 custom domain。若 n8n 所處網段解析唔到 `.rci-t.com`(而 `azurecontainerapps.io` 係公網一定解析到),Option A 就走唔通。**呢點未驗**,係 D1 拍板前唯一要落地查嘅嘢。

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
| 未驗證前提 | 🔴 **n8n 解析唔解析到 `.rci-t.com`** | 無(公網 FQDN) |
| 要同 infra 講 | 要(佢哋開咗 external,我哋收窄)+ `azure_url_for_api_call` 變成用唔著 | 唔使 |
| 多一跳 | nginx → api(內部,可忽略) | 無 |

**推薦 Option A**,理由三條:①ADR-0012 嗰兩條認證約束嘅**設計意圖**係「對外面只有一個 hostname」,唔止係為咗 cookie ②DEV 環境本身係為咗接 n8n 而開,而 n8n 需要嘅嘢 Option A **已經滿足** ⇒ external 係**多出嚟嘅**暴露,唔係需求 ③兩個環境同一套拓撲,runbook / template / 排錯經驗全部通用。

**若 ③ 嗰個未驗證前提爆咗**(n8n 解析唔到 `.rci-t.com`)⇒ 直接轉 Option B,並照 D2 收窄。

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

- **OQ-1(blocking D1)** — **n8n UAT 解析唔解析到 `rapo-uop-web-dev.rci-t.com`?** 呢個決定咗 Option A 走唔走得通。查法:喺 n8n 側直接 curl 個 web FQDN(部署完之後),或者問 infra team n8n 所處網段用邊個 DNS。
- **OQ-2(唔阻 D1)** — infra team 除咗 n8n,仲有冇其他系統打算直接打 `azure_url_for_api_call`?若有,Option A 要重新評估。

## References

- **ADR-0012**(Azure UAT 部署 topology,單一 origin)—— 本 ADR 擴充佢至第二個環境,**唔推翻**任何一條
- ADR-0006 §7(httpOnly + `SameSite=Strict` cookie)—— 單一 origin 嘅原始約束來源
- ADR-0017(n8n 三接縫)· ADR-0025 / ADR-0026(W43 onboarding licence request)
- `apps/web/nginx.conf.template`(`API_UPSTREAM` env 渲染 + `Host $proxy_host`)
- `docs/01-planning/W44-azure-dev-deploy/plan.md` 附錄 A(DEV 實測座標)/ 附錄 B(六處差異)
- `docs/13-deployment/04-deploy-runbook.md` §8.3(api internal ingress 要 `allowInsecure`)
