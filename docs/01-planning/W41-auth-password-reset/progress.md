---
phase: W41-auth-password-reset
plan_ref: ./plan.md
checklist_ref: ./checklist.md
last_updated: 2026-07-31
---

# W41 — Progress

## Day 1 — 2026-07-29 · kickoff

**背景**:AUTH-4c-C 由 2026-07-13(ADR-0006)起 deferred,阻塞係「平台冇發郵件能力」。
CH-011 / ADR-0019 落咗 ACS transport,而同日 UAT 亦已把 Graph / ServiceNow / ACS
三個整合由 placeholder 換成真憑證(email connector `active`)⇒ 前置全清。

**分類判斷**:AUTH-4c-A = W20、4c-B = W21,都係 phase;本項有 schema + 前後端 + 多日,
⇒ 同樣做 **phase(W41)**,唔做 change。**H1 唔另開 ADR** —— `PasswordResetToken`
已由 ADR-0019 **D8 #1** 授權。

**Grounding**(落 plan 前實讀,唔靠記憶):

| 讀咗 | 攞到嘅嘢 |
|---|---|
| `ADR-0019` D7 / D8 | 九條設計決定 + 明確 out-of-scope |
| `refresh-token.service.ts` | token 形狀 SSOT — `randomBytes(32).hex` + `createHash('sha256')`,只存 hash |
| `schema.prisma` `RefreshToken` / `AppUser` | 照抄形狀;`AppUser` 已有 `lockedUntil` / `failedLoginCount` / `mustChangePassword` |
| `auth.service.ts` `changePassword` | 既有改密碼路徑 + audit 形狀(`actorId === targetId`) |
| `notification-dispatch.service.ts` | 契約:**永不 throw** ⇒ fire-and-forget 安全(OQ-2 嘅依據) |
| `templates.ts` | CH-011 已預留接口,並**明文寫低** password-reset 唔可以入 `REPLAYABLE_TEMPLATES` |
| `auth.controller.ts` / `router.tsx` | 現有 route 形狀 |

**四條 OQ 全部由 Chris 拍板,全部跟建議**(plan §8):新 env + 未設照 204 ·
fire-and-forget · 5 分鐘 cooldown · fragment token。

其中 OQ-1 特別值得記:選 `config.get` 而唔係 `getOrThrow`,除咗 ADR-0019 D4 之外,
仲有一個當日嘅實證理由 —— **UAT 而家就係未設 `APP_BASE_URL`**,`getOrThrow` 會即刻
crash loop,而 BUG-008 啱啱先因為同類原因(容器起唔到身)死過一次。

**下一步**:F1 schema + additive migration。

## Day 2 — 2026-07-30 · F1–F7 落地(跨 7/29 夜)+ F8a/F8b live

**交付**:schema + additive migration(只 `CREATE TABLE` + 2 index + 1 cascade FK,零
`ALTER TABLE` 掂既有表)· `password-reset.service.ts`(+17 test)· 兩個 `@Public` 204 endpoint ·
`password-reset` template(**冇**入 `REPLAYABLE_TEMPLATES`)· 新 audit action · 前端兩頁 + Login link。
**api 626 → 651 test / 59 suites · web 188 → 196 test / 24 files · 兩邊 lint `exit=0` · `vite build` ✓**

**F8a — UAT 環境**:設 `APP_BASE_URL` 指向 **web 嘅 public FQDN**(api 係 `.internal.` ingress,
而條連結係畀人喺瀏覽器開)。設之前先驗過個 URL 真 200 —— 唔可以送一條死 URL 落郵件。
🔴 設前設後各 dump 一次 `env[].{name,secretRef}` 逐行對比:**18 → 19,7 個 secretRef 一個唔少** ——
`--set-env-vars` 有弄壞 secretref 綁定嘅已知風險,而嗰啲 secret 值係 Chris 親手設、我聲明過唔經手,
所以必須對比而唔係信 exit code。新 revision `--0000009` 唔信 `runningState` flag(BUG-008 教訓),
改用真 probe:`POST /api/auth/login` → **401 真 JSON**。

**F8b — 本機真跑**:四種情況全部 `204 | bodyLen=0`(枚舉抵抗喺真 HTTP 成立,唔止喺 mock),
但真 DB **只多 1 行 token** ⇒ SSO / 唔存在 / cooldown 三種係真零寫入。`hash_len = 64`(raw token
唔喺 DB)· `ttl_remaining = 00:27:54` ⇒ TTL 30 分鐘真值。audit 三種 reason 分明,而
**`metadata ? 'emailAttempted'` 返 `t`** —— 呢個正係 checklist 標「G8 fails-before 必須實證」嗰條,
而家係真 `AuditLog` 行出嘅。順帶:**api 起得起就證明咗 `AuthModule → FulfilmentModule` 嘅 DI graph
真 work**(循環依賴會令 Nest 啟動直接死),而 test 用 mock 係證唔到嘅。

**兩件事誠實記低**:

1. **light + dark 真 render 仍未勾** —— `list_connected_browsers` 回 `[]`(同 4 日前 W35 G3
   一樣)· Playwright MCP 唔喺本 session · repo 冇 playwright dep ⇒ **已交 Chris 目視**。
   我只做到靜態證明(`index.css:4` 直接 `@import` handoff,而我用到嘅 token 喺 light/dark
   兩邊都有真值 ⇒ 排除「token 唔存在 → 透明繼承」),但佢證唔到對比度同 layout,所以項目唔勾。
2. 🔴 **F8 途中發現**:`APP_BASE_URL` 未設時,audit 會寫一行 **`reason: 'issued'`** 而郵件一封
   都冇寄(controller 喺 `issue()` **之後**才檢查 baseUrl)。即係「為咩我個用戶收唔到信」呢個問題,
   audit 答唔到 —— 佢會答 `issued`。一行會講大話嘅 audit 同 ADR-0009 個精神衝突,而我**刻意冇
   單方面修**:個 3 行移位修法會令未設時完全冇 audit,直接偏離 OQ-1 字面嘅「audit 記低」(Chris
   親自批准)⇒ 按 §13 只 raise + 入 plan §9 changelog,**待 Chris 裁決**。

**F8c — 部署**:commit `7e1f00b` → **PR #51** → build `uat-7e1f00b`(api run `ckd` / web run `cke`,
兩個都係查 management plane 拎真實狀態)→ deploy **image-only**(刻意唔走 ARM)。
`--0000010` / `--0000006` 都 **Healthy**,而**同一個 endpoint 部署前 404、部署後 204** ⇒ W41 真上線。

順帶:**BUG-008 嗰道 `RUN test -f dist/main.js` build gate 過咗** —— W41 新增嘅檔案全部喺 `src/` 內,
冇再次搬走 emit 根。呢道閘第一次真正幫到手就係今次。

**兩個環境坑**:`az acr build` 會撞 `'charmap' codec can't encode '✔'`(cp1252 撞 prisma/vite 嘅勾號,
**exit=1 但 ACR 側 build 照跑完**)⇒ 加 `--no-logs` 係比「crash 後查 management plane」更好嘅預防。
`az containerapp logs show` 走 data plane,撞公司 proxy 自簽證書 ⇒ **本機睇唔到 UAT container log,
要用 Azure Portal**;而 email 失敗**唔入** `OutboundFailure` 佇列,所以呢點對診斷特別重要。

## 一個我搞錯咗、而且值得記落嚡嘅判斷失誤(2026-07-30)

我喺 `git status` 見到 `docs/13-deployment/` 五個檔「出現又消失」,就講咗「被還原」。**錯 ——
佢哋係被 commit 咗**(`0eda17a`),`git log` 一睇就知,而我冇睇就講。由「git status 唔再顯示」
跳到「內容被還原」,中間隔咗幾個同樣講得通嘅可能(被 commit / stash / 改回原狀),我揀咗一個
當成事實。**H7 講嘅「結果類陳述必 trace」唔止管 test pass,同樣管「發生咗咩事」呢類陳述。**

查真之後揪出一個**更有價值**嘅嘢 —— 一個會直接令人做錯判斷嘅文件事實錯誤:

`07-uat-as-built.md` / `README.md` / `02-environment-reference.md` 同 CH-012 個 commit message
都寫住 api container「**只有 16 個 env**」、「`ACS_*` 一個都冇 wire」。**實測係 19**(設
`APP_BASE_URL` 前 18),而 `ACS_CONNECTION_STRING`(secretRef)+ `ACS_SENDER_ADDRESS` 兩個都已經
在 —— Chris 2026-07-29 親手設落 container。

⇒ CH-012 寫「仲要做:owner 填 `acsConnectionString` 真值落 params 檔 → 隨 W41 部署 → 真寄一封」,
呢步**對 F8c 唔係前置**:running container 已經齊料,而 `--image` 部署又完全冇碰 template。
**F8c 端到端而家就做得。**

根因係**「template 有冇」同「running container 有冇」係兩本帳**,而文件把兩者混埋一齊講,
於是得出「email 喺 UAT 唔會 work」呢個錯結論(實情:配置齊,寄得出)。
⇒ **講 env 狀態一律 `az containerapp show --query "…env[].{name,secretRef}"` 實測,唔信文件。**

（另外 `aca.bicep` 有兩處 drift,CH-012 已記錄但刻意 out-of-scope 冇修:api ingress 缺
`allowInsecure:true` · `API_UPSTREAM` 用 `'http://${api.name}'` 而唔係 resolved internal FQDN
⇒ 照 bicep 部署會重現一個 `aca.json` 已修好嘅 bug。冇任何流程用到 bicep。）

## F8f — 本機真跑(2026-07-30 下午)· 三個發現,兩個係意外收穫

owner 決定唔寄真信:佢自己個地址 `chris.lai@rapo.com.hk` 係 **SSO 帳號**,由設計上唔合資格
email 重設。呢點本身值得記 —— **owner 本人永遠用唔到呢個功能**,佢係為冇 Entra 帳號嘅
local-password user(外部 / 臨時人員)而做。要真驗就需要「local-password + 真實 mailbox」
呢個組合,而嗰個組合喺 owner 身上唔存在。

**發現一:本機 `.env` 一直缺 `APP_BASE_URL`。** 第一次 POST 返 204 但零 token、零 audit、
零佇列。推論鏈(基於確定 code path):`issue()` 一定寫 audit ⇒ audit 零新行 ⇒ `issue()` 冇被
呼叫 ⇒ 而 controller 喺 `issue()` 之前只有一個 return 點 = `if (!baseUrl) return`。
⇒ 任何本機開發者跑 forgot-password 都係**靜默唔 work**,而 `.env.example` 明明有嗰個 key。

**發現二(意外收穫):F8d 個 fix 攞到真環境前後對照。** 同一個 DB、同一個操作 ——
fix 之前(F8b,01:25)建咗 token + 寫咗 `reason:'issued'`,而本機 baseUrl 一直未設,即
**嗰封信從來冇寄過**;fix 之後零 token 零 audit。⇒ F8b 留喺 dev DB 嗰行 `issued` 就係
「誤導性 audit」嘅**真實標本**,唔係我 raise 嗰陣講嘅假想情境。

**發現三(意外收穫):真實重現咗 ADR-0019 OQ-1 / CH-011 R1。** 帶 shell env 重啟後重跑,
token 建咗、audit `issued`、佇列 0 行 ⇒ **ACS 真被呼叫而且接受咗 202**。但收件地址
`w41.e2e@uop.local` 係一個**根本唔存在嘅 domain** —— 而平台側**所有信號全綠**,冇任何一處
睇得出嗰封信一定送唔到。⇒ 「以收件人真係收到為準」係實測出嚟嘅必要條件,唔係謹慎修辭。

**同時糾正咗我自己一句錯話**:我早前寫「email 失敗唔入 `OutboundFailure` 佇列」,理由係
schema 個 `kind` 註解只列三個值 —— 但 `kind` 係 `String` 冇 enum 約束,而 CH-011 A11 第一次
寄失敗真係入咗佇列。⚠️ 今次 ACS 接受咗,所以我**冇直接重現**入佇列,只可以講原推論錯。

## 🚧 F8c 端到端 —— 需 owner 執行(唔係我唔做,係我做唔到)

**為咩要你做**:UAT 冇一個「local-password + 真實可收件 email」嘅帳號 —— `admin@uop.local` 個地址
係假嘅收唔到信,而 `chris.lai@rapo.com.hk` 係 SSO 無密碼 ⇒ **由設計上唔合資格重設**。而建 / 改 user
要 admin 登入,而我唔處理密碼。

1. 登入 `https://ca-uop-web.lemonhill-2df17b88.eastasia.azurecontainerapps.io`(`admin@uop.local`)
2. **Settings › Users & roles → 建一個新 local user**,email = 你真實收得到信嘅地址。
   ⚠️ **建新 user,唔好改 admin 自己個 email** —— 改咗會鎖死你自己唯一嘅 break-glass 入口
3. Sign out。想驗「舊 session 真失效」就**先喺另一個無痕窗口用新 user 登入一次並留住**
4. `/forgot-password` → 入嗰個真實地址 → Send reset link
5. 🔴 **等真封信,以真係收到為準**(記得睇 spam)。ADR-0019 OQ-1 個風險係 custom domain 靠 DNS 側
   SPF/DKIM,失敗模式係「ACS 收貨但唔送達,而平台側睇落完全成功」⇒ 收唔到就去 **Azure Portal** 睇
   `ca-uop-api` 個 container log(本機 az CLI 睇唔到,見上面環境坑)
6. 撳連結 → 應該落 `/reset-password#token=…` → 設新密碼 → 應該自動彈返 `/login`
7. 用**新**密碼登入 → 成功;第 3 步嗰個無痕窗口 **應該已經失效**(refresh token 全撤)
8. 再撳一次**同一條**連結 → 應該話 `This reset link is invalid or has expired`(單次性)

---

## Day 3 — 2026-07-31 · Closeout(owner 三個決定)

Chris 一次過答齊:①**F6 已目視**(冇提出問題)②**端到端 🚧 deferred 結案** ③**已自己喺
`apps/api/.env` 加 `APP_BASE_URL=http://localhost:5173`**。

**第 3 項我冇當佢生效就收貨。** 當時個 api 仲係帶住 shell env 跑緊,所以 `.env` 生唔生效根本
未驗過 —— 要完整重啟先講得準。重啟之後實測:`POST /api/auth/forgot-password`(`admin@uop.local`)
→ `204` · 3 分鐘內新 token **1** · audit **`issued`** · 失敗佇列 **0**。🔴 呢個順帶**第二次**驗證
F8d 個 fix 嘅兩邊行為 —— 未設 → 零 token 零 audit(F8f 實測)· 已設 → 正常建同記錄(今日實測)。
測試 token 已清(`DELETE 1`)。

### 途中撞到一個新坑,值得單獨記:**stale `.tsbuildinfo` = 無聲假綠燈**

重啟 stack 時 api 一直起唔到,而所有信號都話冇事:`npm run build` **`exit=0`**、
`nest start --watch` 印 **`Found 0 errors`** —— 但 `apps/api/dist` **根本唔存在**,
`node dist/main` 報 `MODULE_NOT_FOUND`。**症狀同 BUG-008 一模一樣,根因完全唔同。**

因果鏈:`nest start --watch` 啟動時**清 `dist/`**,但**唔刪 `tsbuildinfo`** ⇒ tsc
(`"incremental": true`)讀個 cache 判斷「輸出已最新」→ **skip emit** → dist 空。

🔴 **修法有次序要求**:刪 `apps/api/*.tsbuildinfo` **同埋** `dist/`,然後**直接起 stack,中間
唔可以插一次 `npm run build`** —— 插咗就即刻重新生成 tsbuildinfo,而 watch 一起身又清 dist,
循環重現。**我實測撞咗三次先睇穿**:頭兩次都係「刪 cache → build → 起」,而嗰個 build 正正
係令佢重現嘅一步。

⚠️ **點解本機會出而 Docker 唔會**:Dockerfile 有 BUG-008 加嘅 `RUN test -f dist/main.js` gate,
本機 `nest build` **冇呢道閘** ⇒ 本機可以靜靜漂移到起唔到身而冇任何紅燈。教訓同 BUG-008 同源:
**`exit=0` 唔等於有輸出**。

### 我今日講錯過兩次,兩次都係同一種錯

1. 見到 verify 失敗,我即刻講「係 build 未完,冷啟慢過 90 秒」—— 重驗之後 api 仍然未起、
   進程得 9 個(得 web 鏈),證明嗰條 api 鏈**根本已經死咗**,唔係仲喺度 build。
2. 見到 kill list 有個 `$env...` 前綴,我講「嗰個就係 F8f 帶 `APP_BASE_URL` 起嘅 api」——
   但 `start-detached.ps1` 自己都係用 `$env:NODE_OPTIONS='--use-system-ca'` 起,單憑前綴
   **分辨唔到**。

兩次都係**由一個觀察跳到一個講得通嘅解釋,然後當佢係事實**。同 Day 2 嗰個「被還原 vs 被 commit」
係同一種錯 —— H7 講嘅「結果類陳述必 trace」唔止管 test pass,同樣管「點解會咁」呢類因果陳述。

### Closeout

- **`DD-4` 已登記**(結構性,唔係一次性 🚧)。判斷理由:根因唔係「今次冇時間驗」,而係
  **功能只服務 local-password user,而現時所有真人都係 SSO** ⇒ go-live 前會再被問。
  ⚠️ 登記時特別寫清楚**未證範圍**,避免將來有人讀成「呢個功能未驗過」——
  transport / endpoint / consume 邏輯各自都有真證據,未證嘅只係中間嗰段真人操作。
- BACKLOG `AUTH-4c-C` → **✅ 完成 · closed**(R7)
- checklist frontmatter `status: active` → **`closed`**

**W41 完。** 帶住走嘅只有 `DD-4`,而佢有明確恢復條件同判準(**一律以收件人真係收到為準**)。
