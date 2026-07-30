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

- `uop-api`:multi-stage(build:`npm ci --workspace=@uop/api` → `prisma generate` → `nest build`;runtime:`--omit=dev` + 由 build stage copy `.prisma` client)。runtime `node dist/main`,`EXPOSE 3000`。**`dist/main.js` 呢個路徑係有前提嘅,見下面「emit 佈局」。**
- `uop-web`:multi-stage(build:`npm ci --workspace=@uop/web` → `vite build`;runtime:`nginx:1.27-alpine` serve `dist` + `nginx.conf.template`)。`EXPOSE 8080`。
- `--workspace` scope install → `uop-web` image 唔會拖 api 嘅 `argon2`/`prisma`。

### 🔴 emit 佈局:`rootDir` 釘死 `dist/main.js`(BUG-008)

`docker-entrypoint.sh` 最後一行係 `exec node dist/main` —— 呢個路徑**唔係天然成立**。

TypeScript 喺冇 `rootDir` 嗰陣,用「所有被編譯檔案嘅共同父目錄」做輸出根。所以只要有一個 `src/` 以外嘅 `.ts` 被 include 落 build,輸出根就會由 `src/` 抬升到 `apps/api/`,`main.js` 靜靜搬去 `dist/src/main.js`,**每個容器一起身就 `MODULE_NOT_FOUND` → CrashLoopBackOff**。

CH-011 加 `apps/api/scripts/send-connectivity-check.ts`(`src/` 以外第一個 `.ts`)就係咁觸發,UAT 同步 `2b5057a` 全掛,rollback 到 `uat-0cf0cf3`。詳見 `docs/03-implementation/bugs/BUG-008-dist-entrypoint-path-drift/`。

現有兩道閘(**改動時唔好拆**):

| 閘 | 位置 | 作用 |
|---|---|---|
| `"rootDir": "./src"` + exclude `scripts` | `apps/api/tsconfig.build.json` | 將來再有 `src/` 以外嘅 `.ts` 被 include,**tsc 直接報錯**,而唔係靜靜搬走 entrypoint |
| `RUN test -f dist/main.js` | `apps/api/Dockerfile`(build stage) | 「build 成功但一定死」嘅 image 喺 ACR 就爆,唔會流到部署 |

> 兩者都**只落 `tsconfig.build.json`**,刻意唔落 `tsconfig.json` —— 嗰度加 `rootDir` 會令 `prisma/seed.ts`(UAT entrypoint 真係會跑)同 `scripts/*.ts` 走 ts-node 時撞 TS6059。
>
> ⚠️ **呢個 bug 冇任何一道原有 gate 攔得到**:626 個 test 綠(ts-jest 直接跑 `src/**`,唔碰 `dist`)· `npm run build` 成功(tsc 唔當換佈局係問題)· lint 零 output · `az acr build` Succeeded(只證明 image build 到,**唔證明佢起得身**)。所以「test 綠 + build 綠」唔可以當部署會成功。

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

## 驗證狀態(2026-07-30 更新)

**Dockerfile 邏輯已由真 build + 真部署證實。** W32 寫落嘅三個「未證假設」已經由多次成功嘅 `az acr build` 間接證實 —— 若 `argon2` native 編譯失敗或 `prisma generate` 攞唔到 engine,build 根本唔會 Succeeded:

| 原假設 | 現況 |
|---|---|
| `argon2` 喺 `node:20-slim` 有 prebuilt binary | ✅ 成功 build 已證(否則 `npm ci` 會失敗) |
| `prisma generate` 喺容器內攞到 `debian-openssl-3.0.x` engine | ✅ 同上 |
| runtime stage copy `node_modules/.prisma` 足夠 | ✅ 容器實際 Running/Healthy 已證 |

現行 UAT = **`uat-1bc7cdb`**(api revision `--0000006`、web `--0000005`,兩者 Running/Healthy,smoke 全過)。

> ⚠️ **本地** `docker build` 仍然未成功過(卡 Docker Hub CDN 503,環境問題,見上一節)。「已驗證」指嘅係 **`az acr build` 這條路徑**。
>
> 而且 build 綠 ≠ 起得身 —— BUG-008 就係 build Succeeded 但每個容器都 crash(見上面「emit 佈局」)。真正嘅 pass 標準係 **revision Running/Healthy + smoke test 過**(H7)。

## Image tag 策略

- UAT:`uop-api:uat-<gitsha>` / `uop-web:uat-<gitsha>`(可追溯到 commit)。
- ACA revision 綁 image tag;roll back = 指返上一個 tag 嘅 revision。
