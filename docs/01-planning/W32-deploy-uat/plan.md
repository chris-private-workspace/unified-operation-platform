---
phase: W32-deploy-uat
name: "Azure UAT 部署準備 — 文件 + build artifacts + RCI PAR 治理流程(不含實際 provision)"
sprint_week: W32
start_date: 2026-07-22
end_date: 2026-07-24          # planned, may slip with changelog log
status: draft                 # draft | active | closed
spec_refs:
  - docs/adr/0012-azure-uat-deployment-topology.md（本 phase 產出 — topology 決定）
  - docs/architecture.md §7（locked stack「Docker Compose」→ 本 phase 由 H2 觸發改為 Azure Container Apps）
  - docs/13-deployment/（本 phase 產出 — 部署文件集）
prior_phase: W31-outbound-failure-recovery
---

# Phase W32 — Azure UAT 部署準備

> **Plan version**:1.0(initial)
> **Owner**:AI(執行)/ Chris Lai(decision)
> **Approved by**:_pending_ —— topology / 認證 / PAR 三個決定已由 AskUserQuestion 拍板(見 §6),plan 本身待 approve 後轉 `active`

## 0. 觸發背景

用戶本機已登入 Azure service principal(可對 **UAT 環境**執行 Azure 動作),要求**先準備部署相關嘅文件同流程**。故本 phase = **部署準備(pre-deploy)**:出齊文件、build artifacts、治理流程 —— **唔包括**實際 `az` provision / deploy(嗰步要 PAR 批 + 用戶明確落令先做,見 §1 out-of-scope)。

部署目標 = Ricoh **RCI**(Regional Cloud Infrastructure,AP 區 MS Azure 資料中心)。開資源前必經 **PAR(Project Authorization Request)**治理流程(1-2 週),故文件必須配合 PAR 表交付。

## 1. Scope

### 三個已拍板決定(AskUserQuestion,2026-07-22)

| # | 決定 | 選擇 |
|---|---|---|
| **D1 topology** | Azure 部署架構 | **Container Apps 單一 origin**(api container + web nginx container,同一 ingress hostname)+ managed **PostgreSQL Flexible Server** + **Key Vault**;**Redis 暫不開**(code 未 wired BullMQ) |
| **D2 auth** | 認證模式 | **dev = 帳密登入 · Azure = Entra SSO**(dual-provider ADR-0005)+ seeded break-glass 本地 admin。〔2026-07-22 owner 釐清,見 changelog〕需 UAT Entra app registration(AUTH-2b)|
| **D3 governance** | RCI PAR 授權流程 | **納入部署流程文件**(已讀 `RCI Project Authorization Request Process v1.9.docx`) |

### 選 D1 嘅決定性理由(單一 origin 對兩種認證都啱)

- **Entra SSO**(Azure 主認證):MSAL → Bearer header;**同源**即零 CORS(`main.ts` 至今無 `enableCors`)。
- **Break-glass 本地 admin**:httpOnly + `SameSite=Strict` cookie(ADR-0006 §7)—— 跨 origin **永遠唔帶**,必須同源。
- 兩條都指向 **單一 origin**(nginx 前置 serve SPA + proxy `/api`)→ topology 揀 ACA 單一 origin 而非 App Service 雙 Web App 嘅硬理由。

### Changelog

- **2026-07-22 · D2 釐清**:kickoff AskUserQuestion 原答「本地帳密登入」(當時理解 AUTH-2b 卡住)。Owner 隨後釐清專案要求 = **dev 帳密 / Azure Entra SSO**(dual-provider)。→ 修正 ADR-0012 D2 + 全部部署文件認證段 + web Dockerfile 加 `VITE_ENTRA_*` build-arg。**Topology 不變**(單一 origin 對 SSO 一樣啱)。break-glass 本地 admin 保留(SSO bootstrap + 緊急)。

### 唔喺本 phase(明確 out-of-scope)

- ❌ **實際 provision / deploy**(跑 `az` 開資源、推 image、apply migration 落雲)—— 需 **PAR 批准** + 用戶明確落令;本 phase 只出 runbook
- ❌ **建立 UAT Entra app registration**(AUTH-2b:client id / redirect URI / API scope 登記)—— 屬部署時提供嘅值,唔喺本 phase 準備工作內。Azure UAT **主認證 = Entra SSO**(D2);本 phase 只出文件講點配置,值由用戶部署時填(已有 Azure 存取)
- ❌ **CI/CD pipeline 自動化**(Azure DevOps Pipelines)—— 先手動 runbook,自動化留後續 phase
- ❌ **Redis / BullMQ 資源** —— code 未 wired(只有 `@nestjs/schedule` @Cron),UAT 唔開
- ❌ **生產真數 curation**(真 tenant catalog sync + 37-SKU businessAlias,DD-1 殘留)—— 屬 deploy-time ops step,runbook 列出但唔喺本 phase 執行
- ❌ **改任何 app 執行邏輯** —— 本 phase 零 `src/` 業務 code 改動(只加 build artifacts + 一個 prod migration npm script)

## 2. Deliverables

### F1 — ADR-0012:Azure UAT 部署 topology

- **觸發**:CLAUDE.md §5 **H2**(locked stack 寫「部署:Docker Compose」)+ **H1**(部署 topology = 架構決定)
- **內容**:`docs/adr/0012-azure-uat-deployment-topology.md` —— Context(RCI/PAR + cookie 語意)→ Decision(ACA 單一 origin + PostgreSQL Flexible + Key Vault,Redis 暫緩)→ Alternatives(App Service / VM+compose,連同被否原因)→ Consequences → References;更新 `docs/adr/README.md` index
- **Acceptance**:
  - Status `Accepted`(Chris 已透過 AskUserQuestion 拍板 D1)· 日期 2026-07-22
  - 明確記低「locked stack 由 Docker Compose → ACA」呢個 supersede,並講清 Docker Compose 仍係**本地 dev** infra(唔係被廢)
  - index 加一行
- **Effort**:1.5h

### F2 — 部署文件集(`docs/13-deployment/`)

- **內容**:
  - `README.md` —— 文件集索引 + 一頁 topology 摘要 + 讀者路線
  - `01-topology.md` —— ACA 單一 origin 架構圖、資源清單(ACA env / 2 container / PostgreSQL Flexible / Key Vault / ACR / Log Analytics)、網路 + port + secrets 流向
  - `02-environment-reference.md` —— **全部** env var 逐個列(backend boot-required + 條件式 + 前端 build-time VITE_),標明邊個係 secret → Key Vault,prod 值指引(`NODE_ENV=production`、dev-bypass **必 OFF**)
  - `03-build-images.md` —— 兩個 Dockerfile 點解(build context = repo root 因為 web `@import` design_handoff + api monorepo workspace)、ACR、image tag 策略
  - `04-deploy-runbook.md` —— 逐步:provision → build/push image → deploy → `prisma migrate deploy` → seed → smoke test → rollback;每步標「誰做」(RIT vs 我哋 SP)
  - `05-rci-par-process.md` —— PAR 治理流程 + 本系統對應 PAR Section 1 嘅輸入 pack(見 F4)
  - `06-prod-hardening-checklist.md` —— 上線前安全自檢(dev-bypass off / HTTPS / secrets 入 KV / cookie Secure / seed admin 首登改密)
- **Acceptance**:
  - env reference **逐個對得返** code 入面 `getOrThrow` / `config.get` 呼叫點(grep 佐證,唔靠記憶)
  - 零真 secret 寫入任何文件(H4)—— 只寫變數名 + 來源,值一律 Key Vault / 佔位
  - topology 圖同 AskUserQuestion preview 一致
- **Effort**:4h

### F3 — Container build artifacts(repo files)

- **內容**:
  - `apps/api/Dockerfile`(multi-stage:deps → build `nest build` + `prisma generate` → runtime `node dist/main`)+ `apps/api/.dockerignore`
  - `apps/web/Dockerfile`(multi-stage:vite build → nginx serve static)+ `apps/web/nginx.conf`(SPA fallback + `/api` proxy 到 api container)+ `apps/web/.dockerignore`
  - `apps/api/package.json`:加 `"prisma:deploy": "prisma migrate deploy"`(**唔改** `prisma:migrate` = `migrate dev`;prod 唔可用 `migrate dev`)
- **Acceptance**:
  - **G-BUILD**:兩個 image `docker build` 成功(⚠️ 可能撞 RISK R1 —— 公司 proxy 封 `binaries.prisma.sh`;若撞到,如實記錄 + 文件寫低 workaround,唔扮成功)
  - build context 由 repo root(web 要 `design_handoff_licenseops/`,api 要 root workspace)
  - 零 secret / `.env` 入 image(`.dockerignore` 擋 `.env*`)
  - api image `NODE_ENV=production`
- **Effort**:3h

### F4 — RCI PAR Section 1 輸入 pack

- **內容**:`05-rci-par-process.md` 內附一節,將本系統填入 PAR 表 Section 1 所需資料整理好:
  - 系統元件(ACA×2、PostgreSQL Flexible、Key Vault、ACR、Log Analytics)
  - 元件間通訊(source→dest / protocol / port 表)
  - 整合現有系統(M365 Graph outbound HTTPS 443、ServiceNow Table API 443、n8n webhook 443)
  - User Access/Authentication(本地帳密 + 建議 MFA;user location = 各 OpCo;access via Browser over Internet/VPN)
  - RCI location 建議(RCI1 HK 最近)
- **Acceptance**:對齊 PAR 表 v1.9 實際欄位(已讀 docx);標明「待 Chris / RIT 填實際數值」嘅位
- **Effort**:1.5h

## 3. Verify

- **G-DOCS**:env reference grep 對照 code 全中(無漏、無多、無錯名)
- **G-BUILD**:`docker build` 兩個 image(如撞 RISK R1 → 記錄實況 + workaround)
- **G-ADR**:ADR-0012 format 齊 5 節 + index 更新
- **G-INTEGRITY**:全部文件零真 secret(grep 掃 `SECRET`/`PASSWORD`/連接字串樣式 → 只應命中變數名 / 佔位)
- **本 phase 零 app test 改動**(唔掂 `src/` 業務邏輯)—— 故 api/web test 數不變,只需維持全綠

## 4. Effort

| Deliverable | Estimate |
|---|---|
| F1 ADR-0012 | 1.5h |
| F2 部署文件集 | 4h |
| F3 Dockerfiles + build 驗證 | 3h |
| F4 PAR 輸入 pack | 1.5h |
| **合計** | **~10h(2 日)** |

## 5. Dependencies

- ✅ 三個決定已拍板(AskUserQuestion 2026-07-22)
- ✅ RCI PAR v1.9 已讀(`docs/13-deployment/*.docx`)
- ✅ 本機 Azure SP 已登入(UAT)—— 但本 phase **唔用**佢做 provision,只準備
- ❌ **實際 deploy 阻塞**:PAR 批准(1-2 週)+ 用戶明確落令 —— 屬下一 phase(W33 deploy-exec,待 PAR)
- ⚠️ **RISK R1**(Prisma engine CDN 被公司 proxy 封)可能影響 `docker build` 內嘅 `prisma generate` —— F3 acceptance 已預留誠實記錄路徑

## 6. Open Questions / 已拍板

**三個核心決定已拍板**(§1 D1–D3)。以下屬**實作級選擇,由 AI 拍板**,列出畀 Chris 過目;有異議 approve 時講:

| # | 選擇 | 理由 |
|---|---|---|
| I1 | **web nginx container 前置**(而唔係用 `@nestjs/serve-static` 由 api serve SPA) | serve-static 要加 runtime dependency = 再觸發 H2;nginx 係 infra 唔係 app dep,且反向代理 `/api` 更貼 prod 慣例 |
| I2 | **image build context = repo root**,兩個 Dockerfile 都 `-f apps/xxx/Dockerfile .` | web `@import` design_handoff tokens、api 用 root workspace,兩者都需要 root 檔案 |
| I3 | **`prisma:deploy` 另開 script**,唔改 `prisma:migrate` | prod 唔可用 `migrate dev`(會嘗試建新 migration);additive、零風險 |
| I4 | **本 phase 唔跑 `az`** —— 只出 runbook | provision 前必經 PAR;避免喺未批准前動雲資源 |

---

**Lifecycle reminder**:plan locked after `status: active`。deviation → changelog(R3)。
