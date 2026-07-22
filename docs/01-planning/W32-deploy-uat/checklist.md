# W32 — Checklist

> Tick daily。對應 `plan.md` §2 deliverables。未勾項不可刪(只 →[x] 或加 🚧 + reason)。

## F1 — ADR-0012 topology
- [x] 寫 `docs/adr/0012-azure-uat-deployment-topology.md`(5 節齊)
- [x] Status `Accepted` + 日期 2026-07-22 + 記低「Docker Compose → ACA」supersede(dev 仍用 compose)
- [x] `docs/adr/README.md` index 加一行

## F2 — 部署文件集 docs/13-deployment
- [x] `README.md`(索引 + topology 一頁摘要)
- [x] `01-topology.md`(架構圖 + 資源清單 + 網路/port/secrets 流向)
- [x] `02-environment-reference.md`(全 env var,標 secret,dev-bypass 必 OFF)
- [x] `03-build-images.md`(Dockerfile 解釋 + ACR + tag 策略)
- [x] `04-deploy-runbook.md`(provision→build→deploy→migrate→seed→smoke→rollback)
- [x] `06-prod-hardening-checklist.md`(上線前安全自檢)
- [x] **G-DOCS**:env reference grep 對照 code `getOrThrow`/`config.get` 全中(逐個標 file:line)

## F3 — Container build artifacts
- [x] `apps/api/Dockerfile`(+ 根 `.dockerignore` —— **偏離**:改用單一 root `.dockerignore`,因 context=root 時 per-app 唔生效,見 progress)
- [x] `apps/web/Dockerfile` + `apps/web/nginx.conf.template`(envsubst;偏離:`.template` 而非 `nginx.conf`,配 nginx image envsubst 機制)
- [x] `apps/api/package.json` 加 `prisma:deploy`(未改 `prisma:migrate`)
- 🚧 **G-BUILD**:`docker build` 兩個 image —— **BLOCKED**:公司 proxy 擋 Docker Hub CDN(`production.cloudfront.docker.com` 503,持續),死喺 base image pull,同 RISK R1 同類環境阻塞,**非 Dockerfile 缺陷**。→ 正式部署改用 `az acr build`(Azure 側,繞開 proxy);本機驗證需換流動網路。target phase = W33 deploy-exec(或換網補驗)

## F4 — RCI PAR 輸入 pack
- [x] `05-rci-par-process.md`(PAR 流程 + Section 1 輸入 pack)
- [x] 對齊 PAR v1.9 實際欄位;🔲 標明待 Chris/RIT 填實際數值位

## 收官
- [x] **G-INTEGRITY**:全文件零真 secret(grep 掃 password/secret/連接字串樣式 → 零命中)
- [x] api test 全綠:**345 passed / 345**(traced `API_TEST_EXIT=0`,因改過 api/package.json 而重跑);web src 零改動 → baseline **131** 不變,未重跑
- [x] progress.md Day-1 寫齊 + retro
- [x] BACKLOG:DEPLOY 拆 DEPLOY-prep ✅ / DEPLOY-exec 候選(待 PAR)
