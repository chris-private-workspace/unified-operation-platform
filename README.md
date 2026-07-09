# Unified Operation Platform

IT operation / support 的管理 + 操作平台(逐步引入 AI 功能)。第一個模組 **LicenseOps** —— 消費 ServiceNow onboarding request,驅動 M365 license 履行(**System of Action**)。

## 係咩

一個自建 admin portal:維護 live M365 狀態、orchestrate license 履行、處理人手介入,並作為將來引入 n8n / AI 的受控 action 基礎。ServiceNow(System of Record)負責 intake / approval / SLA;本平台**消費**佢嘅 request、執行、回寫狀態 —— sync 而唔複製。

## 文件導航

- **AI 協作憲法**:[`CLAUDE.md`](./CLAUDE.md)(每 session 必讀)
- **平台主 spec**:[`docs/architecture.md`](./docs/architecture.md)
- **LicenseOps 模組決策 SSOT**:[`docs/02-architecture/licenseops/DESIGN.md`](./docs/02-architecture/licenseops/DESIGN.md)
- **開發流程(三軌)**:[`docs/01-planning/PROCESS.md`](./docs/01-planning/PROCESS.md)
- **有咩 pending**:[`docs/01-planning/BACKLOG.md`](./docs/01-planning/BACKLOG.md)
- **架構決定**:[`docs/adr/`](./docs/adr/)
- **本地 setup + 當前 build 現狀**:[`docs/setup.md`](./docs/setup.md)
- **UI 設計參考(hifi)**:[`design_handoff_licenseops/`](./design_handoff_licenseops/)

## 技術棧

NestJS(modular monolith)+ Prisma / PostgreSQL · Redis + BullMQ · Microsoft Graph + ServiceNow 整合 · REST + OpenAPI · Entra ID SSO(未建)· 前端 React + Vite + Tailwind + shadcn/ui(另一 deliverable)。詳見 `docs/architecture.md §7`。

## 快速開始

Monorepo（`apps/api` NestJS + `apps/web` 前端 placeholder）。後端已跑得起:`npm install` → `docker compose up -d` → `apps/api/.env` → `npm run prisma:migrate && npm run seed` → `npm run start:dev`（`http://localhost:3100/docs/api`）。完整步驟 + 本機避坑（Prisma engine CDN / port）見 [`docs/setup.md`](./docs/setup.md)。

## 開發紀律

本項目用一套結構化 AI-協作開發流程:三軌工作流(Phase / Change / Bug)+ hard constraints(H1-H5)+ ADR + 中央 BACKLOG。詳見 `CLAUDE.md` + `docs/01-planning/PROCESS.md`。
