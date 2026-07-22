# W32 — Progress Log

> Plan:`plan.md`(v1.0)· Checklist:`checklist.md`

---

## Day 1 — 2026-07-22

### Kickoff

用戶本機已登入 Azure SP(UAT),要求**先準備部署文件同流程**。開 phase W32(部署準備,**不含實際 provision**)。

**開工前 context 摸查(對住 code,非記憶)**:
- 後端 `nest build`→`dist/`、`node dist/main`、listen `PORT ?? 3000`;前端 Vite SPA、dev 靠 vite proxy `/api`→api。
- **無 Dockerfile**(兩個 app 都要新建)· `main.ts` **無 `enableCors`** · cookie `secure: NODE_ENV==='production'`。
- **Redis/BullMQ code 完全未 wired**(只 `@nestjs/schedule` @Cron)→ UAT 唔開 Redis。
- boot-required env(`getOrThrow`):Graph×3 / ServiceNow×3 / `INTAKE_API_KEY` / `AUTH_JWT_SECRET`(本地登入)/ `DATABASE_URL`;條件式:`N8N_OUTBOUND_*`(provider=n8n)、`ENTRA_TENANT_ID`+`ENTRA_API_AUDIENCE`(SSO)。
- web build **依賴 repo root** `design_handoff_licenseops/`(`src/index.css` `@import`)→ Docker build context 必須 root。
- Prisma prod 要 `migrate deploy`(現 `prisma:migrate` = `migrate dev`,唔可用 prod)。

### 三個決定(AskUserQuestion)

- **D1** topology = **ACA 單一 origin** + PostgreSQL Flexible + Key Vault,Redis 暫緩（決定性理由:`SameSite=Strict` cookie 跨 origin 唔帶 → 必須單一 origin）
- **D2** UAT 認證 = **本地帳密登入**(Entra SSO / AUTH-2b 仍卡 IT）
- **D3** = **納入 RCI PAR 治理流程**(已讀 v1.9 docx）

### RCI PAR 摘要(已讀 docx)

Ricoh RCI = AP 區 MS Azure DC(RCI1 HK / RCI2 AU East / RCI3 SG)。開資源前必經 **PAR**(1-2 週):Requestor 填 Section 1 → RIT 核實 + 出系統設計/報價(Section 2)→ sponsor 批 → Infra + Security Manager endorse → GM RIT 批 → RIT provision。PAR 表 **明列 Azure Container Apps + Key Vault** 做可選資源 → 同 D1 topology 對得上。

### Branch

由 `main` 開 `chore/w32-deploy-uat`(部署 prep 獨立於 CH-006/007 未 merge stack;env/Dockerfile/topology 皆不依賴嗰兩個 change 嘅 code)。

### 交付(F1–F4 全部完成)

- **F1** ADR-0012 `azure-uat-deployment-topology`(Accepted 2026-07-22)+ index。明確界定「Docker Compose → ACA」只 supersede**雲部署**,dev compose 不變。
- **F2** `docs/13-deployment/` 6 份:README / 01-topology / 02-environment-reference / 03-build-images / 04-deploy-runbook / 06-prod-hardening-checklist。env reference **逐個標 file:line** 對返 code getOrThrow。
- **F3** `apps/api/Dockerfile` + `apps/web/Dockerfile` + `apps/web/nginx.conf.template` + root `.dockerignore` + api `prisma:deploy` script。
- **F4** `05-rci-par-process.md`:PAR 流程 + Section 1 輸入 pack(🔲 標待 Chris/RIT 填)。

### G-BUILD 實測發現(重要,誠實記錄)

跑 `docker build -f apps/api/Dockerfile .` → **exit 1**(背景 wrapper 個 `echo` 令通知誤報 exit 0 —— **好彩 trace 咗 log**,H7)。失敗**唔係** Prisma(R1),係 **Docker Hub CDN 503**:拉 base image `node:20-slim` 時 `production.cloudfront.docker.com` 某 blob 持續 503(單獨 `docker pull node:20-slim` 都同一 blob 死)。**根因 = 公司 proxy 擋 Docker Hub CDN**,同 RISK R1 同一類環境阻塞,**非 Dockerfile 缺陷**(死喺 Dockerfile 首條指令之前)。

**含意 → 影響 runbook**:本地 build 喺公司網唔可靠 → 正式部署改 **`az acr build`**(Azure 側 build,繞開 proxy)。Dockerfile 邏輯(workspace scope / prisma copy / nginx template)**未經一次成功 build 驗證** → 首次 `az acr build` 要真綠燈(03 §未驗證項列低三個假設)。

### G-INTEGRITY

grep 掃 `docs/13-deployment` password/secret/連接字串樣式 → **零命中**(只佔位 `<...>` / `00000000-...`)。

### 偏離(R3 changelog)

| 偏離 | plan 原寫 | 實際 | 理由 |
|---|---|---|---|
| dockerignore | `apps/api/.dockerignore` + `apps/web/.dockerignore` | 單一 **root** `.dockerignore` | Docker 只讀 context root 嗰個;context=repo root → per-app 唔生效 |
| nginx 檔名 | `nginx.conf` | `nginx.conf.template` | 配 nginx image `/etc/nginx/templates/*.template` envsubst 機制注入 `${API_UPSTREAM}` |
| G-BUILD | `docker build` 綠燈 | 🚧 blocked(CDN 503)→ 改 `az acr build`;本機需換網補驗 | 環境阻塞,非缺陷 |

### 紀律自檢

- **H1/H2** ✅ 部署 topology = 架構決定 + 動到 locked stack「Docker Compose」→ **STOP + AskUserQuestion 拍板 + 寫 ADR-0012**(未寫 code 前)。
- **H3** ✅ 屬平台部署,唔滲新模組。
- **H4** ✅ 零真 secret 入文件/image/git;`.dockerignore` 擋 `.env*`;env reference 只列變數名 + KV 來源。
- **H5** N/A(零 `src/` 業務改動;唯一 code 改動 = 加 npm script line)。
- **H7** ✅ G-BUILD 冇當 pass;trace log 揪出通知誤報 exit 0。
- **H8** ✅ 讀檔用 Read/Grep;bash 只 docker/git/npm + docx 解壓(無專用工具);docx 文字寫檔再 Read。

### 進度 tick

- [x] planning artifacts + ADR-0012 + 6 文件 + Dockerfiles + PAR pack
- [x] G-DOCS / G-INTEGRITY
- 🚧 G-BUILD(CDN 503,改 `az acr build`;W33 或換網補驗)
- [x] api test **345 passed / 345**(traced exit 0;web src 零改動,baseline 131 不變)

### D2 認證釐清(owner,交付後同日)

Chris 釐清專案要求 = **本地開發帳密 / Azure 環境 Entra SSO**(唔係我原本理解嘅「UAT 淨用本地帳密」)。呢個正正係 ADR-0005 dual-provider。**修正**:ADR-0012 D2 + 約束二 + Decision §6 + Consequences;`01/02/05/06` + README 認證段;web Dockerfile 加 4 個 `VITE_ENTRA_*` build-arg;runbook build/deploy/smoke 加 SSO。**Topology 零改動** —— 單一 origin 對 Bearer(同源零 CORS)同 break-glass cookie(Strict 需同源)都啱。break-glass 本地 admin 保留(SSO bootstrap 雞蛋問題 + 緊急存取)。前置:UAT Entra app registration(AUTH-2b)—— 用戶已有 Azure 存取,部署時提供。

### 教訓

**① 背景 command 用 `; echo EXIT=$?` 會令 wrapper 報 echo 嘅 exit(0),遮住真失敗。** 必須 trace log 入面個真 `*_EXIT=` 先算數(H7)。以後背景 build/test 一律讀 log 尾,唔信通知個 exit code。

**② 公司 proxy 唔止封 Prisma CDN(R1),連 Docker Hub CloudFront blob 都 503。** 本地容器 build 喺公司網不可靠 → 雲部署用 `az acr build` 反而更順(Azure 側網路)。呢個係「阻塞變成更好架構」嘅例子。

**③ 部署文件唔可以憑 Dockerfile「睇落啱」就當 build 得過。** 三個未證假設(argon2 prebuilt / prisma engine target / prisma client copy)必須一次真 build 綠燈先可 tick。
