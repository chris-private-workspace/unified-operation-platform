---
phase: W33-deploy-exec
name: "Azure UAT 實際部署 — 執行 W32 runbook,真 provision + deploy + smoke"
sprint_week: W33
start_date: 2026-07-22
end_date: 2026-07-22
status: closed                # smoke test PASS,同日收官
spec_refs:
  - docs/13-deployment/04-deploy-runbook.md（本 phase 執行嘅藍圖 = R1 pre-doc）
  - docs/adr/0012-azure-uat-deployment-topology.md（topology 決定）
prior_phase: W32-deploy-uat
---

# Phase W33 — Azure UAT 實際部署

> **Plan version**:1.0
> **Owner**:AI(執行)/ Chris Lai(decision)
> **R1 pre-doc**:`docs/13-deployment/04-deploy-runbook.md`(W32 已 approve）—— 本 phase = 執行佢。

## 1. Scope

用戶落令「開始嘗試執行部署」。本 phase 按 W32 runbook 真正 provision + deploy 到 Ricoh RCI（rcitest sub · `RG-RCITest-RAPO-N8N` · eastasia），並 smoke 到可登入。

### 三個決定（AskUserQuestion,2026-07-22 — 因唯讀偵察揪到約束後拍板）

| # | 決定 | 選擇 |
|---|---|---|
| D1 | 認證路徑（SP 建唔到 app reg）| **break-glass 本地 admin 先行**,SSO 待 IT |
| D2 | Provision go | **Go** — 落 shared RG,自己命名資源 |
| D3 | 整合憑證 | **placeholder 先跑起**（Graph/ServiceNow 真憑證後接）|

### 唔喺本 phase

- ❌ SSO（SP 無權建 Entra app registration → IT 手尾）
- ❌ 真 Graph / ServiceNow 整合（placeholder）
- ❌ Hardening（KV wiring / private Postgres / Managed Identity）—— 部分被 proxy data-plane 擋,留後
- ❌ 真數 curation

## 2. Deliverables

- ACR + api/web image（`az acr build`）· PostgreSQL Flexible + platform DB · LAW · KV
- ACA env + `ca-uop-api`(internal) + `ca-uop-web`(external 單一 origin)
- IaC:`deploy/azure/aca.bicep`(參考) + `aca.json`(實際部署,手寫 ARM 因 bicep CLI 裝唔到)
- `apps/api/docker-entrypoint.sh`（env-flag 自 migrate+seed）+ Dockerfile/nginx 修正

## 3. Acceptance（G-SMOKE）

- [x] web SPA 200 · `/api/docs/api` 200（全鏈路 proxy）
- [x] break-glass `admin@uop.local` 登入 200（role ADMIN）
- [x] 零真 secret 入 git（ARM template 只 `@secure()` param；值喺 session-temp params）

## 4. Dependencies / 約束

- SP = Contributor **只限** `RG-RCITest-RAPO-N8N`;**建唔到** Entra app reg
- 公司 proxy **擋所有 data-plane**（Docker CDN / ACR /v2/ / KV / aka.ms / LA query）→ 全走 management plane + `az acr build` + 自 migrate

## 5. 結果

**✅ 成功上線**（同日）。過程 4 個環境/配置 debug fix + IaC 走位,詳見 `progress.md`。

---

**Lifecycle**:phase 同日 closeout（status closed）。
