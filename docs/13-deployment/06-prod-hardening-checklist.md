# 06 — Prod Hardening Checklist（上線前逐項）

> UAT/prod bring-up **前**逐項核。每項有明確可觀察驗證（唔靠「應該係」）。

## 認證 / 授權（Azure = Entra SSO 主 + break-glass 本地 admin）

- [ ] `AUTH_DEV_BYPASS` **未設**（api）—— 驗:登入頁真出現,唔係直入 ADMIN。`az containerapp show ... --query "properties.template.containers[0].env"` 確認冇此 key
- [ ] `VITE_AUTH_DEV_BYPASS` build 時 **未設 / false** —— 驗:bundle 內 `AUTH_DEV_BYPASS===true` 為 false（login gate 生效）
- [ ] **Entra SSO**:`ENTRA_TENANT_ID` + `ENTRA_API_AUDIENCE` 已設 → SSO 登入行得通;`VITE_ENTRA_*` 已烘入 web bundle（redirect URI = UAT hostname 逐字對）
- [ ] SSO Bearer token audience 對得返 `ENTRA_API_AUDIENCE`（錯 audience → 401);過期 token 401 而非放行
- [ ] **Break-glass**:`AUTH_JWT_SECRET`（Key Vault,強隨機）令本地 admin 可登入;首登**強制改密**（`LOCAL_ADMIN_INITIAL_PASSWORD` 只係初值）
- [ ] break-glass lockout（5 次/15 分）+ 密碼 policy（min12/≥3 類）live 驗一次
- [ ] SSO users 需已 provision + 有 role 先入到（未 provision 應 fail-closed,唔會攞到 ADMIN）

## 傳輸 / cookie

- [ ] `NODE_ENV=production`（api）—— 驗:登入後 cookie `uop_access` 有 **`Secure`** flag
- [ ] 全程 **HTTPS**（ACA ingress 自動 TLS）;無 HTTP 明文入口
- [ ] cookie 三屬性齊:`HttpOnly` + `Secure` + `SameSite=Strict`（DevTools → Application → Cookies）
- [ ] 單一 origin → **零 CORS**（Network tab 無 CORS preflight 失敗;`main.ts` 無 `enableCors`）

## Secrets

- [ ] 全部 secret（`02` 清單 🔴 項）**只**喺 Key Vault;container env 用 `secretref` / KV reference,唔係明文
- [ ] `git grep` 掃過:無真 secret / 連接字串入 repo（只應命中變數名 + 佔位）
- [ ] image 內無 `.env`（`.dockerignore` 擋 `**/.env*`,保留 `.env.example`）—— 驗:`docker run --rm <img> sh -c 'ls -a apps/api'` 無 `.env`
- [ ] KV 存取靠 **Managed Identity** + RBAC（Key Vault Secrets User),唔用共享 key

## 資料 / 備份

- [ ] PostgreSQL Flexible **private access**（唔對 Internet 開 5432);臨時 firewall allow 已收
- [ ] `prisma migrate deploy` 已跑(**唔係** `migrate dev`);migration 全 apply
- [ ] DB 備份策略生效（RCI daily/weekly/monthly)—— rollback 依賴此

## Image / 部署

- [ ] image 由 **`az acr build`** 出（繞開公司 proxy;03 §CDN 503)且**真綠燈**過（唔係憑睇）
- [ ] `uop-api` = **internal** ingress(唔對外);對外只有 `uop-web`
- [ ] ACA revision 可 rollback 到上一個 good image tag
- [ ] smoke test（`04 §6`)全綠

## 誠實閘（H7）

- [ ] 以上每個 ☑ 都有**真** curl / DevTools / `az` 輸出支持;trace 唔到 = 寫「未驗證」,唔當 pass
- [ ] 首次 `az acr build` 未成功前,**唔可**聲稱 image build OK（03 §未驗證項三個假設要真 build 證）
