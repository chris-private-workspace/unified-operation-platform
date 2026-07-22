# W33 — Checklist

> 執行 `docs/13-deployment/04-deploy-runbook.md`。

## Provision（management plane）
- [x] ACR `acruopuat` + admin enabled
- [x] api image `az acr build`（uat-mig3 最終）· web image（uat-web2 最終）
- [x] PostgreSQL Flexible `psql-uop-uat`（v16）+ `platform` DB
- [x] Log Analytics `law-uop-uat` + Key Vault `kv-uop-uat`

## Deploy（ARM，因 bicep CLI 裝唔到）
- [x] `deploy/azure/aca.json`(手寫 ARM) + params（secret ACA native secureString）
- [x] `az deployment group create` — ACA env + api(internal) + web(external)

## Smoke（G-SMOKE）
- [x] web SPA 200
- [x] `/api/docs/api` 200（全鏈路）
- [x] break-glass login `admin@uop.local` → 200（ADMIN）

## 收官
- [x] plan / checklist / progress 齊
- [x] W33 artifacts commit（`1ff571a`）
- [x] scratchpad 明文 secret 清（保留 params @ session-temp）
- [x] BACKLOG:DEPLOY-exec 標 ✅ + 拆 DEPLOY-harden 候選
- [x] push + PR（stacked #20）

## Deferred（記入 progress / hardening checklist）
- 🚧 SSO（IT app reg）· 🚧 真 Graph/ServiceNow · 🚧 KV wiring / private PG / Managed Identity · 🚧 改 admin 密碼
