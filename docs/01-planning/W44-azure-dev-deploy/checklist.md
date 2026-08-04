---
phase: W44-azure-dev-deploy
plan_ref: ./plan.md
status: in-progress    # in-progress | complete
last_updated: 2026-08-04
---

# Phase W44 — Checklist

> Atomic checkbox(每 item ≤ 1–2 hour effort)。
> AI tick 完成嘅 item;唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。

## F0 — ADR:DEV 部署拓撲(api external ingress)

- [x] F0-1 起草 ADR:Context — infra team 已開 api external ingress + 畀咗 `azure_url_for_api_call`,意圖係令 n8n UAT 打得到
- [x] F0-2 Decision — **兩個選項並列待拍板**(⚠️ **相對 plan 有調整**,見 progress Day 1:寫 ADR 時發現 `nginx.conf.template` 已經 proxy `/api` ⇒ **收返 internal 亦完全滿足 n8n**,所以唔應該把 external 當成唯一路)
- [x] F0-3 明寫代價 — 平台第一次把整個 API(含 `/docs/api`)直接暴露互聯網;防線只剩 `IntakeKeyGuard` fail-closed + JWT guard
- [x] F0-4 Alternatives — Option A 收返 internal / Option B 保持 external + D2 三項收窄 / Option C per-path(ACA 做唔到)/ Option D 前端直打 api(明確 reject)
- [x] F0-5 明寫 **cookie 邊界不變**(AUTH-4c-B `SameSite=Strict` httpOnly 唔受影響 —— 兩個選項嘅分別**只在 machine-to-machine**,唔涉及瀏覽器)
- [ ] F0-6 🔴 **等 Chris 拍板 D1 + 改 Status = Accepted**(未 Accept 唔可以開 F2)
- [x] F0-6b **OQ-1 resolved**(Chris 2026-08-04):n8n UAT 住喺**企業內網**(on-prem / 內部 VM)⇒ 解析得到企業 domain,**Option A 走得通**。⚠️ 仍係推論唔係實測 ⇒ 實測降級做 **F7-1**,唔再 block D1
- [x] F0-7 `docs/adr/README.md` index 加一行(順帶修正 **ADR-0026 index status** `Proposed` → `Accepted`,檔本身一直係 Accepted,W43 收官漏改)

## F1 — 環境 discovery + 差異登記

- [x] F1-1 SP 登入 + 確認 subscription / tenant / role assignment
- [x] F1-2 列 RG 資源清單
- [x] F1-3 查兩個 container app 現狀(image / ingress / env / secret / registry / identity)
- [x] F1-4 查 PG + Redis(版本 / admin / 網絡)
- [x] F1-5 查 PE subnet + private DNS zone group
- [x] F1-6 確認 Key Vault data-plane 可用性
- [x] F1-7 確認 RG 內無 ACR + 嗰個 GUID 唔係 subscription
- [x] F1-8 確認 `apps/api/src` 零 BullMQ/Redis 用法
- [x] F1-9 寫 `docs/13-deployment/09-dev-as-built.md`(座標 + 六處差異 + 四條 infra 問題)
- [x] F1-10 把四條問題交畀 Chris → infra team(**2026-08-04 已答**;Q3 網絡 ✅ / Q4 join ✅ / Q2 部分 / **Q1 答咗但實測用唔到**)
- [ ] F1-11 🔴 **第二輪問題**(plan 附錄 C,含**精簡版**):**Q1** image 兩條路都斷,三個解法揀一個 · **Q3** container 打唔打得入內網 n8n + 用邊個 base URL · Q4(minor)http 定 https。~~Q2 database~~ **已自己解決,拎走咗**

## F2 — DEV 專用 ARM template(**前置 F0-6**)

- [ ] F2-1 部署前 `az resource show` 兩個 app 完整 JSON 存底(R6 — 防 ARM 覆蓋刪走 infra 已配好嘅嘢)
- [ ] F2-2 新建 `deploy/azure/aca-dev.json` — 只 update 既有 app,**唔建 ACA env**
- [ ] F2-3 `managedEnvironmentId` 用既有 `acaen-rapo-dev` 完整 resource id(cross-RG)
- [ ] F2-4 **保住 web custom domain + SNI cert binding**(ARM 宣告式,漏寫即刪)
- [ ] F2-5 api ingress 按 F0 拍板結果設定
- [ ] F2-6 `RUN_MIGRATIONS_ON_START` / `RUN_SEED_ON_START` = true(operator 連唔到 private DB)
- [ ] F2-7 UAT 個 `aca.json` **一個字唔改** — 用 `git diff` 證
- [ ] F2-8 verify:`az deployment group validate` 返 `Succeeded`

## F3 — params 檔 + secret 策略(**B2 已解封**)

- [x] F3-0 建 UOP 嘅 database —— `az postgres flexible-server db create -s pgsql-rapo-uop-dev -g RG-RAPO-UOP-DEV -d platform`;verify `db list` 由 3 個系統 db 變 4 個(**management plane,唔需要連到 PG data-plane**)
- [ ] F3-1 `deploy/azure/aca.params.dev.json`(由 `aca.params.example.json` 起)
- [ ] F3-2 `databaseUrl` = `postgresql://rapoaiuopdev:<pw>@pgsql-rapo-uop-dev.postgres.database.azure.com:5432/platform?sslmode=require`
- [ ] F3-3 `appBaseUrl` = `https://rapo-uop-web-dev.rci-t.com`(**唔係** `.env` 寫嘅 http)
- [ ] F3-4 其餘 secret 沿用 runbook §4 生成規則
- [ ] F3-5 verify:`git check-ignore -v deploy/azure/aca.params.dev.json` 有 output(H4 硬要求)

## F4 — web 建構調整

- [ ] F4-1 `nginx.conf.template` `/api` upstream 支援 **https + external**(DEV `allowInsecure=false`)
- [ ] F4-2 重新確認 `Host` header 規則喺 https upstream 下仍啱(runbook §8.2 個 `$proxy_host` 坑)
- [ ] F4-3 改動經 template 變數,**唔影響 UAT** — 用 UAT 值渲染一次對比
- [ ] F4-4 verify:本機起 web container 渲染出嚟嘅 nginx.conf 逐行睇過

## F5 — image build + push(🔴 **前置 B1 —— 2026-08-04 實測兩條路都斷,等 infra 揀解法**)

> `az acr build` ❌ 冇 management plane(AcrPush 唔包 `scheduleRun/action`)· 本地 `docker build` ❌ Docker Hub CDN 503 **兼** ACR firewall 拒 `165.85.7.2`。三個解法見 plan 附錄 C **Q1**。

- [ ] F5-0 🔴 等 infra 回覆 Q1 並確認走邊條路(決定咗先寫得 F5-1..4 嘅實際步驟)
- [ ] F5-1 配 ACR credential 落 container app `registries`
- [ ] F5-2 `az acr build` api image(tag `dev-<short-sha>`)
- [ ] F5-3 `az acr build` web image
- [ ] F5-4 verify:`az acr task list-runs` 兩個都 `Succeeded`(**唔可以信 CLI exit code** — charmap crash 假象)

## F6 — 部署 + smoke(🔴 **前置 F2/F3/F5 + B3**)

- [ ] F6-1 `az deployment group create`
- [ ] F6-2 verify:`az deployment group show` → `provisioningState = Succeeded`
- [ ] F6-3 verify:兩個 revision **Running / Healthy**(`az rest` replica 狀態)
- [ ] F6-4 verify:`GET https://rapo-uop-web-dev.rci-t.com/` = 200
- [ ] F6-5 verify:`GET .../api/docs/api` = 200
- [ ] F6-6 verify:break-glass login = 200 + role ADMIN
- [ ] F6-7 verify:**PG v18 migration 真跑得過**(G8 — 第一次踩 v18)
- [ ] F6-8 verify:seed 完成(24 OpCo + admin + catalog SKU 真數)
- [ ] F6-9 R6 對數:逐項對返 F2-1 存底,確認 ARM 冇刪走 infra 配好嘅嘢

## F7 — n8n UAT 接線驗證(前置 F6)

- [ ] F7-1 n8n UAT 打 `POST /requests/intake` → **真 201**
- [ ] F7-2 verify:DB 真 row(Request + line item),唔可以只睇 HTTP code
- [ ] F7-3 對 W42 retro 五個 n8n 側缺口:URL `/api` 前綴
- [ ] F7-4 對:`X-Intake-Key` 有冇送
- [ ] F7-5 對:`resolveOpco` 只認 RHK/RAPO(其餘返 `''` → 404)
- [ ] F7-6 對:`requestId` 係 REQ number 唔係冪等鍵 sysId
- [ ] F7-7 對:2003 sticky 要求 assigner skip 已持有 E5 嘅 user
- [ ] F7-8 逐項標明係 **n8n 側改** 定 **平台側改**

### 🔴 F7 outbound 半邊(舊環境做唔到嗰樣 —— 唔驗呢半就係「接通」驗一半當全部)

- [ ] F7-9 由 UOP container 側實試打企業內網嘅 n8n(ADR-0017 三個接縫嘅 outbound)
- [ ] F7-10 verify:**n8n 側真收到**,唔可以只睇平台側冇 error —— B3 唔通嘅話呢個會**紅得靜**(provider fail 但 app 照起得身)
- [ ] F7-11 三個接縫逐個確認:outbound webhook(`N8N_OUTBOUND_WEBHOOK_*`)· `LicenseOperationsProvider` · `TicketUpdateProvider`

## F8 — doc sync + closeout

- [ ] F8-1 `09-dev-as-built.md` 補實際部署結果
- [ ] F8-2 `01-topology.md` 加 DEV 欄
- [ ] F8-3 `04-deploy-runbook.md` 加 DEV 分支說明(唔改 UAT 段落)
- [ ] F8-4 CLAUDE.md §0 + §9 更新
- [ ] F8-5 `SESSION_SUMMARY.md` 更新
- [ ] F8-6 `RISK_REGISTER.md` 加本 phase risk
- [ ] F8-7 memory 更新(`azure-uat-deployment` 加 DEV,或者新開一則)

---

## Cross-Cutting

- [ ] All deliverables committed to git
- [ ] All open-question status changes reflected in decision tracker(R4)
- [ ] All architectural-adjacent decisions documented as ADR(per CLAUDE.md §5)
- [ ] Pending / next-candidate changes synced to `BACKLOG.md`(R7)
- [ ] `progress.md` retro section written
- [ ] `progress.md` frontmatter status flipped to `closed`
- [ ] Phase N+1 kickoff trigger noted in retro

---

**Lifecycle reminder**:呢份 checklist 隨 plan deliverables 衍生。新加 deliverable 必須先入 plan + changelog,然後再加 checklist item。
