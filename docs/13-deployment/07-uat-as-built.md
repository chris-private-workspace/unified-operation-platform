# 07 — UAT As-Built(實際部署記錄)

> 實際跑緊嘅環境快照。**最後核實 2026-08-03**(首次部署 W33 / 2026-07-22)。**唔含任何 secret**(值喺 running env / gitignored persistent params 檔)。
>
> 🔴 **本檔已經過時咗兩次,而兩次都唔自知**:2026-08-02 發現佢寫住 `uat-1bc7cdb` 而真實係 `uat-7e1f00b`(W41 冇更新);**2026-08-03 再犯** —— 佢寫住 `uat-629d018` / api `--0000011`,而真實係 **`uat-8646f79` / api `--0000012`**(CH-019 部署完又冇更新)。⇒ **每次部署完必須即刻更新呢個 section**,而**開工第一步一律 `az containerapp revision list` 實測,唔信本檔**。同 `CLAUDE.md §14` 嗰條座標紀律同源。
> 部署路徑見 [`04-deploy-runbook.md`](./04-deploy-runbook.md);過程詳錄 `docs/01-planning/W33-deploy-exec/progress.md`。

## Subscription / 位置

| | |
|---|---|
| Subscription | `Microsoft Azure (rcitest): #1023861`(`30dac177-6dcb-412e-94f6-da9308fd1d09`)|
| Tenant | `4f63aaa0-5612-4fe8-8175-9f9f4d26c7b4` |
| Resource Group | **`RG-RCITest-RAPO-N8N`**(shared;SP = Contributor 只限此 RG)|
| Region | `eastasia`(RCI1 HK)|

## 資源清單

| 資源 | 名 | 備註 |
|---|---|---|
| ACR | `acruopuat`(`acruopuat.azurecr.io`)| Basic · admin enabled |
| api image | `uop-api:uat-a71bbdf` | **2026-08-03** · 含 **CH-020**(onboarding catalog task closure,ADR-0024)+ CH-019(批量 curation)+ W42/CH-013/CH-016/017 · self-migrate entrypoint · devDeps |
| web image | `uop-web:uat-a71bbdf` | 同 tag · **CH-020 冇前端改動**,純重 build · 含 CH-019 Import CSV + CH-018 Export CSV · nginx Host fix · break-glass(無 VITE_ENTRA)|
| PostgreSQL | `psql-uop-uat`(v16 Burstable B1ms)| DB `platform` · public + "Allow Azure services" |
| Log Analytics | `law-uop-uat` | ACA container log |
| Key Vault | `kv-uop-uat` | **建咗但未 wire**(data-plane 被 proxy 擋;secret 暫用 ACA native)|
| ACA env | `cae-uop-uat` | 綁 `law-uop-uat` |
| api app | `ca-uop-api` | **internal** ingress · targetPort 3000 · `allowInsecure:true` · 1 replica · revision **`--0000013`** RunningAtMaxScale/Healthy |
| web app | `ca-uop-web` | **external** ingress · targetPort 8080 · 1-2 replica · revision **`--0000009`** Running/Healthy |

> **api container env(2026-08-02 重驗,仍然 19 個)**,含 `ACS_CONNECTION_STRING`(secretRef)· `ACS_SENDER_ADDRESS`(前兩者 2026-07-29 由 owner 直接設落 container)· `APP_BASE_URL`(設之前係 18)。**即 email 配置齊、寄得出。** template 亦已接線(CH-012)。
>
> 🔴 **唔好由 template 推論 container** —— 兩本獨立嘅帳:日常部署走 `--image` 唔碰 template,而 env 可以直接設落 container。查一律用 `az containerapp show --query "…env[].{name,secretRef}"`,唔信文件(呢份文件本身曾經寫錯「只有 16 個」)。

## URL

| | |
|---|---|
| **Public(web)** | `https://ca-uop-web.lemonhill-2df17b88.eastasia.azurecontainerapps.io` |
| api internal | `ca-uop-api.internal.lemonhill-2df17b88.eastasia.azurecontainerapps.io` |

> `lemonhill-2df17b88` = ACA env 生成嘅 default domain(每個 env 唯一)。

## 認證(as-built)

- **模式 = break-glass 本地 admin**(dual-provider 嘅本地面)。SSO **未啟**(SP 無權建 Entra app reg → 待 IT)。
- 帳號 `admin@uop.local`(role ADMIN)· 初始密碼喺部署時生成(session-temp,已交 owner)。
- ⚠️ **`mustChangePassword` 目前 false** —— owner 首登後**應手動改密**(Settings)。
- Graph / ServiceNow = **placeholder**(app boot OK;真整合未接)。

## 重部署 / 更新

改 `deploy/azure/aca.json` 或 params 檔個 image tag → 重跑 `04 §5`(宣告式,建新 revision)。

**Secret 值嘅所在**:自 `04 §4` 起改為 **gitignored persistent params 檔**(`deploy/azure/aca.params.uat.json`,owner 本地保管)—— 唔會隨 session 清,重部署直接重用,所以**唔再需要重生成 secret 或重設 DB 密碼**。W33/W34 當時用嘅係 session-temp 檔,先會有下面嗰個「舊 DBPW 冇咗」嘅問題;而家已經唔適用。

### image-only re-deploy(唔掂 secret — 日常首選)

若 secret 唔需要變(絕大多數情況),**`az containerapp update --image` 係最快嘅路**:只換 image、保留現有 secret / config,DBPW、admin 密碼、config 全部不變,rollback = 換返舊 tag。呢條路喺 W34(2026-07-23)首次實測可行,BUG-008 修復部署亦係用佢:

```bash
TAG=uat-$(git rev-parse --short HEAD)
# build（Azure 側；CLI 印 ✔/✓ 會 charmap crash exit 1 假象，查 az acr task list-runs 真 status）
PYTHONIOENCODING=utf-8 az acr build --registry acruopuat --image uop-api:$TAG -f apps/api/Dockerfile .   # + uop-web
# 換 image（保留 secret；建新 revision → 新 api 啟動自動跑 self-migrate，新 migration auto-apply）
PYTHONIOENCODING=utf-8 az containerapp update -g RG-RCITest-RAPO-N8N -n ca-uop-api --image acruopuat.azurecr.io/uop-api:$TAG -o none   # + ca-uop-web
```

**驗**:`az containerapp revision list`(新 revision `image` 啱 + `RunningAtMaxScale`)+ §04 smoke test(curl **`-k --ssl-no-revoke`** 繞 schannel revocation)。功能探測範例(W34):`PATCH /api/admin/integrations/graph/config` 無 token → **401=已部署 / 404=未部署**。

> 🔴 **revision `Running/Healthy` 係唯一可接受嘅 pass 標準。** `az acr build` Succeeded 只證明 image build 到,唔證明佢起得身 —— BUG-008 就係 build 綠、626 test 綠、lint 零 output,但每個容器一起身就 CrashLoopBackOff(見 `04 §8.5`)。

**部署歷史**:`uat-mig3` / `uat-web2`(W33)→ `uat-0cf0cf3`(W34,api `--0000003` / web `--0000002`)→ `uat-2b5057a`(**failed**,BUG-008,rollback)→ `uat-1bc7cdb`(api `--0000006` / web `--0000005`)→ `uat-7e1f00b`(W41,api `--0000010` / web `--0000006` —— **當時冇更新本檔**)→ `uat-629d018`(2026-08-02,api `--0000011` / web `--0000007`)→ `uat-8646f79`(CH-019,2026-08-03,api `--0000012` / web `--0000008` —— **又冇更新本檔**)→ **`uat-a71bbdf`**(現行,2026-08-03,api `--0000013` / web `--0000009`)。

### 2026-08-03 部署(`uat-8646f79` → `uat-a71bbdf`,CH-020)

走 **image-only** 路。⚠️ **開頭第一件事就撞到本檔過時** —— 佢寫住現行 `uat-629d018` / api `--0000011`,實測係 `uat-8646f79` / api `--0000012`(CH-019 部署完冇更新)。preflight 四項:

| 檢查 | 結果 |
|---|---|
| 新 migration | **1 個**(`20260803060106_ch020_line_item_task_ref` —— `RequestLineItem` 加兩個 **nullable** 欄,零 backfill)→ 隨新 revision 自動跑 |
| 新 required env | **冇** —— `git diff 8646f79..a71bbdf` 揾唔到任何新 `getOrThrow` |
| 新 dependency | **冇** —— `package.json` / `package-lock.json` 零改動 |
| `deploy/` 改動 | **零** ⇒ image-only 唔會漏嘢,亦冇「params 檔抹走 container 現值」嘅風險 |

**Smoke(逐層 + 對照組)**:SPA `200` · `/api/docs/api` `200` · `POST /api/requests/intake` 無 key → **`401`** · **兩個同形狀但唔存在嘅 route → `404`**(呢個對照組先令上面嗰個 401 有意義)。

**CH-020 實質證據 —— 抽 running OpenAPI 實搜**(唔係靠 tag 推論):`N8nFlatIntakeDto` ×2(schema + `$ref`)· `serviceNowTaskSysId` / `serviceNowTaskNumber` 各 ×1 · `oneOf` ×1(即 `/requests/intake` 兩張合約真係接線咗)· `flat contract discriminator` ×1;對照組一個唔存在嘅字串 ×0。

> 🔴 **一項驗唔到,唔當驗過**:**migration 有冇真係 apply,平台外面證明唔到**。公司網連唔到 UAT DB data-plane,而 entrypoint 個 `prisma migrate deploy` 係**非致命**(失敗都照起身)⇒ revision Healthy **唔等於** migration 成功。冇任何 `@Public` endpoint 會讀 `RequestLineItem`,所以 curl 探唔到。
> **最平嘅結論性檢查 = owner 開一次 UAT 個 Requests 頁**:migration 若失敗,嗰版所有 `RequestLineItem` query 會 P2022 500。(風險本身低:additive nullable 欄,同一個 migration 喺 dev DB 同 scratch DB 各 apply 過一次。)

### 2026-08-02 部署(`uat-7e1f00b` → `uat-629d018`,70 個 commit)

走 **image-only** 路(唔碰 secret / 唔走全量 ARM)。部署前 preflight 四項實測:

| 檢查 | 結果 |
|---|---|
| 新 migration | **1 個**(`20260731012942_add_default_onboarding_sku`,ADR-0020)→ 隨新 revision **自動跑**(`RUN_MIGRATIONS_ON_START=true`) |
| 新 required env | **冇** —— 全部 `getOrThrow` key 已設;唯一未設嘅 `N8N_OUTBOUND_WEBHOOK_KEY` 喺上一版已經一直未設而跑得住 |
| 新 dependency | **冇** —— `apps/api/package.json` 只加咗 npm scripts |
| `aca.json` 改動 | 有(CH-012 ACS 接線),**但 container 早已有嗰三個 env** ⇒ template 只係追返現況,image-only 唔會漏嘢。走全量 ARM 反而有「params 檔冇 ACS 真值 → 抹走 container 現值」嘅風險 |

**BUG-008 複查**:CH-017 加咗 `apps/api/prisma/reset-ledger.ts`(`src/` 以外嘅 `.ts`,正正係 §04 §8.5 嗰個觸發條件)—— `tsconfig.build.json` 已 `exclude` `prisma`/`scripts`,閘門有效。

**Smoke(逐層 + 對照組)**:SPA `200` · `/api/docs/api` `200` · `POST /api/license/ledger/reset` 無 token → **`401`**(CH-017 endpoint 存在)· 同一形狀嘅**不存在 endpoint → `404`** ⇒ 呢個對照組先令上面嗰個 401 有意義。前端另抽 JS bundle 實搜字串,`Export CSV` / `sku-catalog.csv` / `Base licence`(CH-018)同 `Allocation + assigned` / `Confirm reset scope`(CH-017)全部命中。

## Deferred → BACKLOG `DEPLOY-harden`

1. **email 端到端真寄真收** —— 配置已齊(container 實測有三個 env,template 亦已接線 CH-012)。剩低嘅係**證據**:ACS 冇 probe,sender domain 唔對會收貨但唔送達而 API 仍返 `Succeeded`,所以要收件人真係收到先算數(同 CH-011 A11 判準一致)。走全量 ARM 前記得 params 檔要有 `acsConnectionString` 真值,否則會抹走 container 現值。
2. **SSO** —— IT 建 UAT Entra app reg(uop-api + uop-web)→ 後端加 `ENTRA_TENANT_ID`/`ENTRA_API_AUDIENCE`,前端 `--build-arg VITE_ENTRA_*` 重 build web。
3. **真 Graph / ServiceNow** —— 換 placeholder 做真 UAT 憑證。
4. **Hardening**(部分需唔受限網路或 Azure 側做):secret → **Key Vault + Managed Identity**(取代 ACA native + ACR admin creds)· Postgres → **private access / VNet** · 改 admin 初始密碼。清單見 `06-prod-hardening-checklist.md`。
5. **成本** —— ACA / Postgres / LAW / ACR 持續收費;閒置可 scale api 到 0 或停。
