# 07 — UAT As-Built(實際部署記錄)

> W33 實際部署嘅環境快照(2026-07-22)。**唔含任何 secret**(值喺 running env / session-temp params 檔)。
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
| api image | `uop-api:uat-0cf0cf3` | **W34**(ADR-0013 connector config)· self-migrate entrypoint · devDeps |
| web image | `uop-web:uat-0cf0cf3` | **W34** · nginx Host fix · break-glass(無 VITE_ENTRA)|
| PostgreSQL | `psql-uop-uat`(v16 Burstable B1ms)| DB `platform` · public + "Allow Azure services" |
| Log Analytics | `law-uop-uat` | ACA container log |
| Key Vault | `kv-uop-uat` | **建咗但未 wire**(data-plane 被 proxy 擋;secret 暫用 ACA native)|
| ACA env | `cae-uop-uat` | 綁 `law-uop-uat` |
| api app | `ca-uop-api` | **internal** ingress · targetPort 3000 · `allowInsecure:true` · 1 replica |
| web app | `ca-uop-web` | **external** ingress · targetPort 8080 · 1-2 replica |

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

改 `deploy/azure/aca.json` 或 `aca.params.json` 個 image tag → 重跑 `04 §5`(宣告式,建新 revision)。secret 值喺 session-temp `aca.params.json`(session 結束會清;長期要重生成或改用 KV wiring)。

### W34 re-deploy(2026-07-23,image-only,唔掂 secret — 推薦捷徑)

W33 secret 喺 session-temp 已清 → 重跑 ARM §5 要重生成**全部** secret(含**重設 DB 密碼**,因舊 DBPW 冇咗),side-effect 大。實測 **`az containerapp update --image` 可行**(W33 記錄嘅 `containerapp` 擴充擋已解除),**只換 image、保留現有 secret/config**,DBPW / admin 密碼 / config 全部不變,rollback = 換返舊 tag:

```bash
TAG=uat-$(git rev-parse --short HEAD)
# build（Azure 側；CLI 印 ✔/✓ 會 charmap crash exit 1 假象，查 az acr task list-runs 真 status）
PYTHONIOENCODING=utf-8 az acr build --registry acruopuat --image uop-api:$TAG -f apps/api/Dockerfile .   # + uop-web
# 換 image（保留 secret；建新 revision → 新 api 啟動自動跑 self-migrate，新 migration auto-apply）
PYTHONIOENCODING=utf-8 az containerapp update -g RG-RCITest-RAPO-N8N -n ca-uop-api --image acruopuat.azurecr.io/uop-api:$TAG -o none   # + ca-uop-web
```

**驗**:`az containerapp revision list`(新 revision `image` 啱 + `RunningAtMaxScale`)+ §04 smoke test(curl **`-k --ssl-no-revoke`** 繞 schannel revocation)。**W34 專屬探測**:`PATCH /api/admin/integrations/graph/config` 無 token → **401=已部署 / 404=未部署**。`uat-mig3`/`uat-web2` → **`uat-0cf0cf3`**(revision api `--0000003` / web `--0000002`)。

## Deferred → BACKLOG `DEPLOY-harden`

1. **SSO** —— IT 建 UAT Entra app reg(uop-api + uop-web)→ 後端加 `ENTRA_TENANT_ID`/`ENTRA_API_AUDIENCE`,前端 `--build-arg VITE_ENTRA_*` 重 build web。
2. **真 Graph / ServiceNow** —— 換 placeholder 做真 UAT 憑證。
3. **Hardening**(部分需唔受限網路或 Azure 側做):secret → **Key Vault + Managed Identity**(取代 ACA native + ACR admin creds)· Postgres → **private access / VNet** · 改 admin 初始密碼。清單見 `06-prod-hardening-checklist.md`。
4. **成本** —— ACA / Postgres / LAW / ACR 持續收費;閒置可 scale api 到 0 或停。
