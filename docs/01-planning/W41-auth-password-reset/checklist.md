---
phase: W41-auth-password-reset
plan_ref: ./plan.md
status: active
last_updated: 2026-07-29
---

# W41 — Checklist

## F1 — Schema ✅

- [x] `PasswordResetToken` model(形狀照抄 `RefreshToken`:opaque token、只存 SHA-256、`expiresAt`、`onDelete: Cascade`)+ `usedAt`
- [x] `AppUser` 加 relation field `passwordResetTokens`
- [x] Migration `20260729140509_w41_password_reset_token` —— SQL 人手覆核:
      **只有 `CREATE TABLE` + 2 個 index + 1 個 cascade FK,零 `ALTER TABLE` 掂既有表**
- [x] `prisma validate` ✓ · `migrate deploy` ✓ · `prisma generate` ✓(299ms)
- [x] ⚠️ **途中撞到 `prisma generate` EPERM** —— 本機 stack 一直跑緊(15 個進程,其中
      `node ...\dist\src\main` 正正係 BUG-008 舊路徑嘅 build)鎖住 query engine DLL。
      用 `restart-stack` skill dry-run 核對 kill list(**15 個全部 trace 得返本項目**,
      冇掃到機上其他項目)後停 stack → generate 即刻成功。同 memory 記錄一致

## F2 — `password-reset.service.ts` ✅

- [x] `issue(email)` — 解析 user → 資格 → cooldown → 建 token → 返 raw token(**只此一次**)
- [x] `consume(rawToken, newPassword)` — 驗 live → 改密碼 → 副作用(plan §2.3)→ 標 `usedAt`
- [x] hash / randomBytes **沿用 `refresh-token.service.ts` 同一寫法**,冇另發明
- [x] cooldown = **5 分鐘**(OQ-3),DB-based,零新 dep
- [x] 🔴 **本 service 唔寄郵件** —— `issue()` 返 `null` 代表「乜都唔應該寄」,而
      always-204 嘅枚舉抵抗留喺 HTTP 邊界(F3)。咁 service 可以誠實答,唔使為咗
      遷就一條屬於 HTTP 層嘅政策而喺內部講大話
- [x] 註冊落 `AuthModule` · `tsc --noEmit` 零錯誤
- [x] **17 個 test 全綠**(見 F7 對應項)

## F2b — 途中撞到嘅 build 陷阱(已處理)

- [x] `prisma generate` EPERM —— 本機 stack 一直跑緊(15 個進程,含 `dist/src/main`
      = BUG-008 舊路徑)鎖住 query engine DLL。`restart-stack` skill dry-run 核對
      kill list(15 個全部 trace 得返本項目)→ 停 → generate 299ms 成功
- [x] `tsc --noEmit -p tsconfig.json` 又留低 stray tsbuildinfo(**AP-14 子型**)→ 已清

## F3 — Endpoints ✅

- [x] `POST /auth/forgot-password` `@Public` `@HttpCode(204)`
- [x] `POST /auth/reset-password` `@Public` `@HttpCode(204)` + 清 cookie
      (refresh 全部啱啱撤咗,留住 access cookie 等於送多 15 分鐘畀一個用戶以為已終止嘅 session)
- [x] 🔴 **一律 204**:唔存在 / SSO / 停用 / 撞 cooldown 全部同一回應(D8 #4)
- [x] `reset-password` 錯誤**唔分**「唔存在 / 過期 / 用過」—— 一句到尾
- [x] 🔴 **fire-and-forget 寄郵件**(OQ-2)+ `.catch(() => undefined)`
      —— 唔係唔信 dispatcher 個「永不 throw」契約,而係呢個失敗模式係 **unhandled
      rejection**,BUG-002 已證實佢會殺死 Nest process。一行保費,保住成個 API
- [x] `AuthModule` import `FulfilmentModule`(auth → fulfilment → integration 單向,**接線前**驗證過)
- [x] `dto/password-reset.dto.ts` 另開檔 —— `ResetPasswordDto` 個名已被 admin-reset 佔用,
      兩個係唔同權限來源嘅流程,唔應該共用一個名

## F4 — Template ✅

- [x] `password-reset` 加入 `TemplateKey` + `TEMPLATES`,全部插值經 `escapeHtml`
- [x] 🔴 **冇加入 `REPLAYABLE_TEMPLATES`**,並更新咗嗰段註解 —— 佢原本寫「下一個到嘅
      template 就係 4c-C」,而家佢到咗
- [x] 連結用 **fragment `#token=`**(OQ-4),test 直接 assert `not.toContain('?token=')`
- [x] `APP_BASE_URL` 用 `config.get`(**唔用 `getOrThrow`**,OQ-1)+ 入 `.env.example`,
      並寫明「唔設嘅後果係**靜默**嘅:token 照發、照返 204,用戶就係等唔到信」
- [x] TTL 常數由 service **export** 畀 template 用 —— 兩個 literal 會喺改動嗰日各行各路,
      而讀信嗰個人會信封信

## F3b — 一條被我改動掃到嘅既有 test(已修)

- [x] `outbound-retry.service.spec.ts` 有條 test 用 `'password-reset'` 做 stand-in,
      註解明寫「using an unknown key here keeps this test independent of when 4c-C lands」。
      4c-C 一落地佢就由 **unknown-template** 分支跌落 **known-but-not-replayable** 分支 ——
      而佢只 assert `BadRequestException`,所以**唔會紅**,unknown 分支就咁靜靜冇咗覆蓋
- [x] 修法:兩條 test 各自 assert **錯誤訊息**(`/single-use/` vs `/Unknown notification template/`),
      並補返 unknown-template 一條

## F5 — Audit(隨 F2 一併做,因為 service 即刻要用)

- [x] 新 action `AUTH_PASSWORD_RESET_REQUESTED: 'auth.password_reset_requested'`
- [x] 🔴 **查證後:metadata 白名單唔使擴** —— 我用 `emailAttempted` + `reason`,
      **兩個都已經喺 `AUDIT_METADATA_KEYS`**(`emailAttempted` 係 W29 Q1 為 login-failure
      加嘅,`reason` 一直都喺)。D8 #8 個警告係針對「新 metadata key」,而我復用既有 key
      ⇒ 少一個改動,兼且復用一個**已經審視過**嘅 PII 決定
- [x] 但**更新咗 `emailAttempted` 個註解** —— 佢原本寫「the one place we deliberately
      store PII in metadata」,而家係兩個 caller。一個帶住過時理由嘅 PII 白名單 key,
      正正係下一個人講服自己加第三個用途嘅方式(AP-13 預防)
- [x] 真正改密碼**沿用既有 `user.password_change`**,`actorId === targetId`
- [x] 每個 request 都寫一行(issued / cooldown / no-eligible-account),因為 D8 #4
      令 HTTP 回應一律 204 ⇒ audit 係**唯一**睇得到結果嘅地方

## F6 — 前端 ✅(live 視覺驗證除外,見下)

- [x] `/forgot-password` 頁(一個 email 欄 + 一個 primary action)
- [x] `/reset-password` 頁(讀 `location.hash`,新密碼 + 確認 + 無 token 分支)
- [x] Login 頁加 `Forgot password?` —— 用 **`Button variant="ghost"`** 而唔係裸 `<a>`:
      全 repo grep 過,**冇任何既有 text-link pattern**(`text-accent` 全部係 selected
      state / icon)。發明一個新 pattern 正正係 H6 叫我哋唔好做嘅事;`justify-between`
      個右邊位本身就係 handoff layout 預留嘅
- [x] 成功訊息**中性**(`If an account exists…`),唔透露帳號存唔存在
- [x] 🔴 **前端唔重複 TTL 分鐘數** —— `RESET_TTL_MINUTES` 只有一個家(郵件本身會 render 佢)。
      喺頁面抄多份就係第二個真相來源,佢會 stale 而讀嘅人會信(AP-3)
- [x] 兩頁 layout 照 `ForcePasswordChange` 同一個卡片 shell,**但唔抽共用 component** ——
      抽就要郁既有檔(§1.3 唔順手改)
- [x] token-only(全部 `bg-bg`/`bg-card`/`border-border`/`text-fg*`/`accent-soft`/`danger-soft`)
      · lucide stroke icon · 一 view 一 primary
- [ ] ⚠️ **light + dark 真 render** —— 🚧 **已交 Chris 目視(2026-07-30),結果待回報**。
      原因:`list_connected_browsers` 回 **`[]`**(零 browser instance,同 4 日前 W35 G3 一樣)·
      Playwright MCP 唔喺本 session · repo 冇 playwright dep(裝 dev dep 唔犯 H2,但 chromium
      binary 下載會撞本機擋 `.dll` 嘅 DLP,兼且動 lockfile ⇒ 唔值)
- [x] 已做**靜態** token 存在性證明(補償上一項,但**唔取代**佢):`apps/web/src/index.css:4`
      直接 `@import` handoff `styles.css`(引入唔係複製),而 `colors.css` 裡我用到嘅
      `--fg-subtle`/`--accent-soft`/`--danger-soft` 喺 **light(L19/24/31)同 dark(L48/52/58)
      兩邊都有真值** ⇒ 排除「token 唔存在 → 透明繼承」。但證唔到對比度同 layout,所以上一項維持未勾

## F7 — 前端 test ✅

- [x] `forgot-password.test.tsx` — POST path + **中性訊息**(assert 唔出現「已寄出」語氣)
- [x] `reset-password.test.tsx` — 🔴 **token 由 fragment 讀**(assert `#token=` 而唔係 `?token=`)
      / 無 token 唔顯示 form / 弱密碼擋 / 確認唔符擋 / 成功後 `navigate('/login')` / server 拒絕訊息
- [x] web **188 → 196** test · 24 files · lint 零 output · `vite build` ✓
- [ ] ⚠️ **誠實缺口**:`forgot-password` 嘅 **error 分支冇 test**。三種寫法
      (`mockRejectedValue` / synchronous throw / `mockImplementation` 返 `Promise.reject`)
      都被 vitest 判成 unhandled rejection,即使 component 喺 try/catch 內 await 咗。
      冇再屈個 test 去遷就 runner —— `reset-password` 有一條**等價**嘅 server-rejection
      test 而且過,所以個 pattern 本身有證明,未證嘅只係呢一頁嘅嗰份
- [x] 順帶發現:`forgot-password` 個 **400 分支實務上幾乎去唔到** —— input 係
      `type="email" required`,瀏覽器原生 validation 喺任何請求發出之前就擋咗

## F7 — Test(H5 critical path)

- [x] G1 **service 層** — 唔存在 / SSO / 停用 / cooldown 四種都 `null` **且 `create` 冇被呼叫**
      (淨 assert `null` 會漏咗「返 null 但照建 token」);HTTP 層 204 待 F3
- [x] G2 token 單次 — 已用 → 拒且零寫入
- [x] G3 token 過期 — 拒;另驗 TTL 落喺 29–30 分鐘窗口
- [x] G4 只存 hash — `tokenHash` 係 64 hex **且 ≠ rawToken**
- [x] G5 副作用 — refresh `updateMany` 全撤 / `lockedUntil` null / `failedLoginCount` 0 /
      `mustChangePassword` **false** / token `usedAt` / 全部喺**同一個 `$transaction`**
- [x] G6 弱密碼由**共用** `validatePassword()` 擋,且零寫入
- [x] ➕ 額外一條:三種拒絕原因(unknown / expired / spent)**錯誤訊息必須完全一樣** —— 
      分辨得出就等於話畀攻擊者知佢差一步
- [x] **api 626 → 643 test / 59 suites 全綠**(新增 17)
- [x] G7 boundary — `REPLAYABLE_TEMPLATES` 唔包 `password-reset`(F3b 兩條 test 各自 assert
      錯誤訊息 `/single-use/` vs `/Unknown notification template/`)
- [x] G8 audit metadata 冇被白名單丟走 —— 🔴 **F8 真 DB 實證,唔係 mock**:
      `select (metadata ? 'emailAttempted') from "AuditLog" …` 對四行真紀錄全部返 `t`
- [x] G9 H4 — 冇 log token / 密碼 / hash。**全 `auth/` 目錄 grep 過所有 `logger.*`**(唔係抽樣):
      W41 兩處 = `auth.controller.ts:117`(靜態文字)+ `password-reset.service.ts:205`(只有
      `userId=`)⇒ 零 token / 零密碼 / 零 hash / 零 email
- [x] ⚠️ **G1 + G8 fails-before 實證** —— G1 已 assert `create` 冇被叫(F7);G8 由 F8 真 DB 補上

## F8 — Live

### F8a — UAT 環境 ✅

- [x] UAT 加 `APP_BASE_URL` = `https://ca-uop-web.lemonhill-2df17b88.eastasia.azurecontainerapps.io`
      —— 指向 **web 嘅 public FQDN**,唔係 api(`ca-uop-api` 係 `.internal.` ingress,而條連結
      係畀人喺瀏覽器開)。設之前先 `Invoke-WebRequest` 驗過真 **200**,唔可以送一條死 URL 落郵件
- [x] 🔴 **secretRef 完好**:設前設後各 dump 一次 `env[].{name,secretRef}` 逐行對比 ——
      18 → 19 個,**7 個 secretRef(database-url / local-admin-initial-password / graph-client-secret /
      servicenow-password / intake-api-key / auth-jwt-secret / acs-connection-string)一個唔少**。
      `--set-env-vars` 有弄壞 secretref 綁定嘅已知風險,而嗰啲 secret 值係 Chris 親手設、我聲明過
      唔經手 ⇒ 必須對比而唔係信 exit code
- [x] 新 revision `ca-uop-api--0000009` 真健康 —— 唔信 `runningState` flag(BUG-008 個教訓),
      改用真 probe:`POST /api/auth/login`(唔存在帳號)→ **401 真 JSON** ⇒ api 活 + DB 通 +
      migration 已 apply + web→api internal 代理通
- [x] 🔴 **probe 證實 UAT image 冇 W41 code**:`POST /api/auth/forgot-password` → **404
      `Cannot POST /auth/forgot-password`**(Nest router 出嘅 JSON,唔係 nginx SPA fallback)
      ⇒ 端到端真寄必須先部署,唔係設完 env 就驗得到。**呢點係 probe 出嚟,唔係假設**
- [x] `curl.exe` 撞 SSL error 35 / status 000,`Invoke-WebRequest` 200 —— 差別係走唔走系統 proxy。
      記落嚡:**本機驗 UAT 用 `Invoke-WebRequest`,唔用 curl**

### F8b — 本機真跑(issue 半段,唔需要 browser 或郵件)✅

- [x] 🔴 **枚舉抵抗真 HTTP 實證**(唔係 test 裡嘅 mock):四種情況全部 `204 | bodyLen=0`
      —— A local-password / B SSO-無密碼 / C 唔存在地址 / D local 第二次(撞 cooldown)
- [x] 真 DB 對照:四次 POST **只建 1 個 token**(`row_count=1`)⇒ SSO / 唔存在 / cooldown
      三種都真係零寫入,唔止係「返 null」
- [x] 只存 hash:`min/max length("tokenHash") = 64`(SHA-256 hex)⇒ raw token 唔喺 DB
- [x] TTL 真值:`ttl_remaining = 00:27:54`(POST 後約兩分鐘查)⇒ 30 分鐘成立
- [x] 唯一 live token 屬 local-password admin:`belongs_to_local_admin = t` ·
      `is_local_password_user = t`
- [x] audit 三種 reason 真分明:`issued` / `no-eligible-account` ×2 / `cooldown` ——
      對住 HTTP 全部 204,即 F5 註解「audit 係**唯一**睇得到結果嘅地方」真係成立
- [x] 額外收穫:**`AuthModule → FulfilmentModule` 嘅 DI graph 真 work** —— api 起得起就係證明
      (循環依賴會令 Nest 啟動直接死),而 test 用 mock 係證唔到呢樣嘅
- [x] ⚠️ **本機無法驗 consume 半段** —— raw token 只出現喺郵件,而我哋刻意唔 log(G9)。
      呢個係設計正確嘅後果,唔係缺口;consume 只能靠真郵件驗(F8c)

### F8d — 途中發現 → **Chris 裁決「修」→ 已修** ✅(見 plan §9 changelog)

- [x] 🔴 **`APP_BASE_URL` 未設時 audit 會報一個誤導性嘅 `reason: 'issued'`** ——
      controller 原本喺 `issue()` **之後**才檢查 baseUrl,所以 token 已建、audit 已寫,而郵件一封都冇寄。
      即係「為咩我個用戶收唔到信」呢個問題,audit 答唔到:佢會答 `issued`。一行會講大話嘅 audit,
      同 ADR-0009 個精神直接衝突 —— **已修**
- [x] **先 raise 後改,冇單方面動** —— 原本刻意唔改(會偏離 OQ-1 字面嘅「audit 記低」,而嗰句係
      Chris 親自批准嘅),按 §13「Spec wins,除非 explicitly raise + get approval」只 raise。
      **Chris 拍板要修之後才改** ⇒ plan §9 加一行正式收窄 OQ-1:「未設 → 照返 204 +
      **只 log,唔寫 audit**」
- [x] 改動本體 = **檢查移到 `issue()` 之前**(`auth.controller.ts`)⇒ 未設時**唔建 token、唔寫
      audit、唔燒用戶個 5 分鐘 cooldown**,只留一行 `logger.error`。**統一 204 不變** ——
      唔可以因為配置錯而變成一個可以用嚟枚舉帳號嘅訊號
- [x] 🔴 **fails-before 實證**(唔止聲稱):暫時把順序改返舊嘅 → **只有新嗰條 assertion 紅**
      (`expect(issue).not.toHaveBeenCalled()` · `Received number of calls: 1` · `1: "ops@example.com"`)、
      其餘 **12 條照綠** ⇒ 佢精準接住順序 regression 而唔誤傷其他行為。改返正確順序後全綠
- [x] 連帶兩處必須同步,否則會留低錯文件 / 接唔住 regression:
      · `.env.example` 原本寫「唔設嘅後果:**token 照發**、照返 204」—— 移咗檢查之後 token 唔會再發,
        已改寫(並寫明為咩 audit 唔記)
      · test 由 `'does not send … when APP_BASE_URL is unset'` 改名 `'issues nothing at all …'`
        並加 `expect(issue).not.toHaveBeenCalled()` —— 舊版只 assert `send`,**兩種順序都會綠**
- [x] api **651 test 全綠 / 59 suites** · lint `exit=0`
- [x] UAT 已於 2026-07-30 設好 `APP_BASE_URL` ⇒ 實務上唔會走到呢個分支(但修完之後,將來新開
      環境忘記設嘅後果由「audit 講大話」變成「audit 沉默 + 一行 error log」)

### F8c — 部署 + 端到端

- [x] W41 commit `7e1f00b`(22 files / +1943 / -39)+ **PR #51**
      —— push 後用獨立 `git ls-remote` 驗 sha、PR 用獨立 `gh pr list` 驗存在
      (memory:git/gh 嘅 network 寫操作會**假報成功**,唔可以信佢自己嘅 output)
- [x] build image `uat-7e1f00b` —— api run **`ckd` Succeeded**(4m08s)· web run **`cke` Succeeded**
      —— 兩者都係查 **management plane** 拎真實狀態,唔靠 CLI stdout
- [x] 🔴 **BUG-008 嗰道 `RUN test -f dist/main.js` build gate 過咗** —— 即係 W41 新增嘅檔案
      (全部喺 `src/` 內)冇再次搬走 emit 根。呢道閘第一次真正幫到手就係今次
- [x] deploy **image-only**(`az containerapp update --image`)—— 刻意**唔走 ARM**。
      ⚠️ **我落決定嗰陣嘅理由已經過時**:我當時讀到嘅文件話「`ACS_*` / `APP_BASE_URL` 未 wire
      落 template」,但同 branch 上嘅 **CH-012(`600ff40`,Chris 決定「隨 W41 一齊上」)**
      已經接線落 `aca.json` + `aca.bicep`(+3 param / +1 secret / +3 env)。
      **結論唔變,但理由要換**:走 ARM 要 gitignored params 檔有真值(`acsConnectionString`
      係**必填 securestring** —— CH-012 D3 刻意由 defaultValue 空改為必填),而 `--image`
      完全唔掂 secret / config,係 as-built 文件嘅日常首選
- [x] 🔴 **一個文件事實錯誤,直接影響 F8c 判斷**:`07-uat-as-built.md` / `README.md` /
      `02-environment-reference.md` 同 CH-012 個 commit message 都寫住「api container
      **只有 16 個 env**」/「`ACS_*` 一個都冇 wire」。**實測係 19**(設 `APP_BASE_URL` 前 18),
      而 `ACS_CONNECTION_STRING`(secretRef `acs-connection-string`)+ `ACS_SENDER_ADDRESS`
      **兩個都已經在**(Chris 2026-07-29 親手設落 container)。
      ⇒ **CH-012 講「仲要做:owner 填 params 真值 → 隨 W41 部署 → 真寄」呢步對 F8c 唔係前置** ——
      running container 已經齊料,`--image` 部署又冇碰過 template ⇒ **F8c 端到端而家就做得**。
      教訓:**「template 有冇」同「container 有冇」係兩本帳**,混埋一齊就會得出「email 喺 UAT
      唔 work」呢個錯結論。講 env 狀態一律 `az containerapp show` 實測
- [x] 真驗證(唔信 `exit=0`,BUG-008 教訓):`ca-uop-api--0000010` **RunningAtMaxScale/Healthy** ·
      `ca-uop-web--0000006` **Running/Healthy** · 兩者 image tag 都係 `uat-7e1f00b`
- [x] 🔴 **決定性 probe:同一個 endpoint 部署前 404、部署後 204** ⇒ W41 真上線,唔係推論
      | probe | 前 | 後 |
      |---|---|---|
      | `POST /auth/login`(唔存在帳號)| 401 | 401(無 regression · migration OK)|
      | `POST /auth/forgot-password` | **404** | **204** |
      | `POST /auth/reset-password`(假 token)| — | **400** `This reset link is invalid or has expired` |
- [x] ⚠️ 誠實註腳:probe「弱密碼 + 假 token」返嘅係**同一句 token 錯誤** ⇒ token 檢查喺密碼驗證
      之前短路,所以呢個 probe **驗唔到**密碼政策(政策本身由 G6 unit test 覆蓋)。token 無效時
      唔做任何其他事,本身係正確設計
- [x] 對 `admin@uop.local` 真發一次 → **204**。個地址係假嘅收唔到信,所以 token 冇人拎得到
      (token 只出現喺郵件裡)⇒ 零安全風險,但 ACS 會真被呼叫
- [ ] 🔴 **端到端真寄一封 → 真收到 → 真重設 → 舊 session 真失效** —— 🚧 **需 owner 執行**,
      原因:UAT 冇一個「local-password + 真實可收件 email」嘅帳號(`admin@uop.local` 地址係假嘅;
      `chris.lai@rapo.com.hk` 係 SSO 無密碼 ⇒ **唔合資格重設**),而建 / 改 user 要 admin 登入,
      而我唔處理密碼。步驟見 progress Day 2
- [ ] 🔴 **以收件人真係收到為準**,唔可以以 API 202 為準(ADR-0019 OQ-1 custom domain 風險)

### F8e — 環境坑(記落嚡,將來部署會再撞)

- [x] `az acr build` 撞 **`'charmap' codec can't encode '✔'`** —— az CLI 個 log streaming 用
      cp1252,遇到 `prisma generate` / `vite build` 輸出嘅 `✔` 就 crash,**exit=1 但 ACR 側 build
      照跑完**。`04-deploy-runbook.md` 現有嘅對策係「crash 之後查 management plane」,但
      **加 `--no-logs` 係更好嘅預防**(實測 web build 一次過乾淨 `exit=0`)⇒ 值得補入文件
- [x] `az containerapp logs show` **查唔到** —— 佢走 `eastasia.azurecontainerapps.dev`(**data plane**)
      → 撞公司 proxy 自簽證書 `CERTIFICATE_VERIFY_FAILED`。`az monitor log-analytics query` 又要另裝
      extension。⇒ **本機睇唔到 UAT container log,要用 Azure Portal**(瀏覽器信公司 CA)。
      呢點對「email 有冇真寄出」嘅診斷特別重要,因為 email 失敗**唔入** `OutboundFailure` 佇列

## Closeout

- [x] api / web test 全綠 · lint 零 output —— **api 651 / 59 suites · web 196 / 24 files ·
      兩邊 `lint exit=0`**(commit 前重跑過,唔靠上一輪嘅記憶)
- [x] BACKLOG 同步(R7)—— `AUTH-4c-C` 由 🟡 解封中 → 🟢 實作+部署完成,前置欄改成兩項
      待 owner + 一項待裁決。**冇強行加 W41 入 phase 表**:嗰個表本身已唔係完整索引
      (W37 排喺 W36 前,W38–W40 都唔在表內)
- [x] progress Day-N(R2)—— Day 2 + F8c 端到端 8 步(交 owner 執行)
- [x] ADR-0019「零 caller」債已清 —— 寫入 **「實作補註」section 而唔係改 Consequences**
      (§6:Accepted ADR 唔改內容)。並補記第三個「唔畀探」配置 `APP_BASE_URL`
- [x] 🔴 **債清嘅範圍講清楚**:清嘅係「零 production caller」,**唔係** D5「唔畀探」嘅代價 ——
      後者仍然成立,所以 F8c 同 CH-011 A11 一樣,判準係**收件人真係收到**

> ⚠️ **Phase 未 closed** —— 尚欠 F6 light+dark 目視 + F8c 端到端真寄真收,兩者都交 owner。
> 收到結果後補勾,再做最終 closeout commit。
