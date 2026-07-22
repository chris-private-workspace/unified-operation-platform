# 03 — Build Images

> 兩個 image:`uop-api`(NestJS)+ `uop-web`(nginx serve SPA + proxy `/api`)。Dockerfile 喺 `apps/api/Dockerfile` / `apps/web/Dockerfile`。

## 為何 build context = repo ROOT

兩個 build **都由 repo root** 做 context,唔係各自 app 目錄:

- **`uop-web`**:`apps/web/src/index.css` `@import '../../../design_handoff_licenseops/design-system/styles.css'` —— build 需要 root 嘅 `design_handoff_licenseops/` token。
- **`uop-api`**:npm workspace,`prisma generate` + `nest build` 需要 root `package.json` + `package-lock.json`。

故 `.dockerignore` **只喺 root 生效**(Docker 只讀 context root 嗰個),已寫 `/.dockerignore` 一份治兩個 build(排除 `node_modules`/`dist`/`.env*`/`docs`,保留 `design_handoff_licenseops/` + app source)。

## Build 指令(本地)

```bash
# 由 repo root 執行
docker build -f apps/api/Dockerfile -t uop-api:<tag> .
docker build -f apps/web/Dockerfile -t uop-web:<tag> .
```

- `uop-api`:multi-stage(build:`npm ci --workspace=@uop/api` → `prisma generate` → `nest build`;runtime:`--omit=dev` + 由 build stage copy `.prisma` client)。runtime `node dist/main`,`EXPOSE 3000`。
- `uop-web`:multi-stage(build:`npm ci --workspace=@uop/web` → `vite build`;runtime:`nginx:1.27-alpine` serve `dist` + `nginx.conf.template`)。`EXPOSE 8080`。
- `--workspace` scope install → `uop-web` image 唔會拖 api 嘅 `argon2`/`prisma`。

### uop-web 嘅 Entra SSO build-arg(build-time 烘死)

Azure UAT 用 Entra SSO(ADR-0012 D2)。`VITE_ENTRA_*` 係 **vite build-time** 變數 → 烘死落 bundle,故 `uop-web` image **對特定 UAT app registration + hostname specific**。Dockerfile 已宣告 4 個 `ARG`(預設空 → 跌返 break-glass 本地登入):

```bash
docker build -f apps/web/Dockerfile -t uop-web:<tag> . \
  --build-arg VITE_ENTRA_CLIENT_ID=<uop-web-spa-client-id> \
  --build-arg VITE_ENTRA_TENANT_ID=<tenant-id> \
  --build-arg VITE_ENTRA_API_SCOPE=api://<uop-api-client-id>/access_as_user \
  --build-arg VITE_ENTRA_REDIRECT_URI=https://<uop-web-fqdn>
```
- 全部 **非 secret**(client/tenant id 係公開識別碼;SPA 無 client secret)→ 烘落 bundle 安全(H4)。
- 換 tenant / hostname → **要重 build**(因 build-time)。redirect URI 雞蛋問題見 `04-deploy-runbook.md §3`。

## ⚠️ 本地 build 喺公司網被 CDN 503 擋(2026-07-22 實測)

W32 實跑 `docker build -f apps/api/Dockerfile .`:**未行到 Dockerfile 指令就死喺 base image pull** ——

```
production.cloudfront.docker.com/.../blobs/sha256/64cfb949...: 503 Service Unavailable
ERROR: failed to solve: failed to copy: ... 503 Service Unavailable
```

`docker pull node:20-slim` 單獨試都係同一 blob 持續 503。**根因 = 公司 proxy 擋 Docker Hub CloudFront CDN**,同 **RISK R1**(Prisma engine CDN 被封)同一類環境阻塞,**唔係 Dockerfile 缺陷**(死喺 `WORKDIR /app` 之前,即 base image 未落齊)。

**含意**:本地 `docker build` 喺公司網**唔可靠**。有兩條路:

| 路徑 | 做法 | 適用 |
|---|---|---|
| **A(推薦)`az acr build`** | image 喺 **ACR 雲端** build,base image 由 Azure 側直拉 Docker Hub,**唔經公司 proxy** | 正式 UAT 部署 |
| **B 本地 build 換網** | 轉**流動網路**跑 `docker build`(同 R1 workaround),再 `docker push` 上 ACR | 要本地驗 image 時 |

正式部署 **用 A**(見 `04-deploy-runbook.md`):

```bash
az acr build --registry <acr> --image uop-api:<tag> -f apps/api/Dockerfile .
az acr build --registry <acr> --image uop-web:<tag> -f apps/web/Dockerfile .
```

`az acr build` 上傳 context(已受 `.dockerignore` 收窄)去 ACR Tasks,喺 Azure build → 直接入 registry,一步完成、繞開 proxy。

## 未驗證項(誠實記錄)

- ❌ **image build 未喺本機成功**(卡 Docker Hub CDN 503,環境問題)。Dockerfile 邏輯(workspace scope、prisma copy、nginx template)**未經一次成功 build 驗證**。
- 首次 `az acr build` / 換網 build 時要**實測**以下未證假設:
  - `argon2@0.44` 喺 `node:20-slim` 有 prebuilt binary(若 `npm ci` 因 native 編譯失敗 → build stage 加 `python3 make g++`)。
  - `prisma generate` 喺容器內攞到 `debian-openssl-3.0.x` engine(ACR 側網路正常應 OK;若卡 = R1 同款)。
  - runtime stage copy `node_modules/.prisma` 足夠(`@prisma/client` 由 `npm ci --omit=dev` 提供)。
- 呢啲**必須真 build 綠燈先可當 pass**,唔可憑 Dockerfile 睇落啱就當成功(H7)。

## Image tag 策略

- UAT:`uop-api:uat-<gitsha>` / `uop-web:uat-<gitsha>`(可追溯到 commit)。
- ACA revision 綁 image tag;roll back = 指返上一個 tag 嘅 revision。
