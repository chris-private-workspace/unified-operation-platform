---
phase: W39-n8n-license-provider
plan_ref: ./plan.md
status: in-progress    # in-progress | complete
last_updated: 2026-07-28
---

# Phase W39 — Checklist

## ✅ D0 Gate —— 已解除(2026-07-28,Chris Lai,五個全跟建議)

- [x] **OQ-1 = A**:`already_assigned` **一視同仁照 +1**,同 `assigned` 完全一樣處理 ⇒ **`assign.service` 要開一個 `already_assigned` 分支**(W38 對非 `assigned` 一律 fail-loud;呢個就係 W38 明文留低嘅「庚必須正面處理」)。⚠️ **代價要入 ADR 補註**:n8n 路徑明知有更準嘅資訊但刻意唔用
- [x] **OQ-2 = A**:provider **唔傳遞** n8n 個 `details`,只留 status + 平台自己寫嘅安全描述
- [x] **OQ-3 = B**:`ritmId` **唔入**介面(Graph 實作永遠用唔着)
- [x] **OQ-4 = A**:未配置 → **`inactive`**;配置咗但打唔通先 `error`
- [x] **OQ-5**:維持**唔加** `listUsersBySku`(2002 有 mode 2 ≠ 平台需要佢)
- [x] Chris approve plan → `status: draft → active`

## F1 — `N8nLicenseProvider`

- [ ] `n8n-license.provider.ts` —— `extends LicenseOperationsProvider`,用 global `fetch`(零新 dep)
- [ ] `listTenantSkus()` → 2002 **mode 1** → map 三個欄
- [ ] `findUser(upn)` → 2005 單筆 → `synced`→`DirectoryUser` / `not_synced`→**null**(同 Graph 語意一致)
- [ ] `assignLicense()` → 2003 —— 🔴 **兩種 response 形狀都 handle**(`Route Status` 直接 respond vs `Build Response`)
- [ ] transport 失敗 **throw 503**(同 `GraphLicenseProvider` 一致嘅 error 契約)
- [ ] verify:`graph-license.provider.ts` / `license-ops.provider.ts` / `assign.service.ts` **三個檔 diff = 0**

## F2 — Outcome mapping + 雙向 H5 contract test

- [ ] `success`→`assigned` · `not_synced`→`not_synced` · `error`→`error` · `already_assigned`→ 按 **OQ-1**
- [ ] **同一組 case 餵兩個 provider,assert 同一 outcome**
- [ ] 🔴 test 註釋寫明:**`no_seats` 兩個 provider 都產生唔到**(座位係平台決策,2003 根本唔檢查)—— 免得下手以為漏咗
- [ ] **OQ-2 守門 test**:餵一個 `details` 含 UPN 嘅 2003 回應,assert 出到嚟嘅 outcome **唔含該 UPN**

## F3 — `n8n-license` connector

- [ ] 非機密欄(webhook base URL + 三條 path)落 `ConnectorConfig`;**`x-uop-secret` 只經 env**
- [ ] `GET /admin/integrations` 三態(OQ-4)
- [ ] audit 白名單只收非機密欄
- [ ] **硬紅線 test**:餵假 secret,assert 回應 + audit row **零洩漏**(鏡射 W30 G1)

## F4 — Probe(2002 mode 1)

- [ ] `PROBEABLE` 加 `n8n-license`,只探 **2002 mode 1**
- [ ] 🔴 **負面斷言**:跑晒探針,assert **2003 / 2005 從未被呼叫**(2003 會**真派 licence**)
- [ ] code comment 寫明「Do not add a probe for 2003/2005」(鏡射 W30 對 n8n webhook 嘅做法)
- [ ] fails-before:令探針去打 2003 → 上面負面斷言真係變紅 → 還原

## F5 — 選路 wiring

- [ ] `integration.module` `useClass` → factory(讀配置選 `graph` **預設** / `n8n`)
- [ ] **G6**:唔設配置起 app → 行為同 W38 一模一樣
- [ ] **G1**:既有 467 test **零改動**(`git diff` 既有 spec 零刪除)
- [ ] `license-ops.boundary.spec.ts` 四條邊界仍然綠(換實作 ≠ 放寬邊界)

## F6 — Doc-sync

- [ ] ADR-0017 實作補註加「庚」段:**四處合約落差** + OQ 拍板 + OQ-1 代價
- [ ] `BACKLOG` 己庚辛 row · `SESSION_SUMMARY` · runbook 08(切換前置)

## Verify

- [ ] `npm test -w @uop/api` 全綠(≥467)· lint 0 · tsc 0
- [ ] **G3**:零 schema · 零新 runtime dep(`schema.prisma` + 3 個 `package.json` diff 全 0)
- [ ] 🚧 **G8 live 切換 = 明文唔做** —— n8n 側 secret 仍 `CHANGE_ME_SHARED_SECRET`、UAT 未接通、平台未部署。closeout **必須**寫「未驗」,**唔准當 pass**
- [ ] `anti-patterns` 自檢(尤其 **AP-2 mock 當 real** —— 本 phase 全程冇真 n8n,呢條係最大風險)

---

## Cross-Cutting

- [ ] All deliverables committed to git
- [ ] OQ 拍板反映入 ADR-0017 實作補註(R4)
- [ ] 架構-adjacent 決定 → ADR(預期**無新 ADR**:ADR-0017 已 Accepted)
- [ ] Pending 同步 `BACKLOG.md`(R7)
- [ ] `progress.md` retro + status flip
- [ ] Phase N+1 trigger noted(= **辛** `TicketUpdateProvider`,號碼 W40)
