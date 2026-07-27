# 08 — n8n ↔ 平台整合上線 runbook(inbound intake)

> **用途**:把「W36 交付完 adapter」同「真係有單入到平台」之間**仲欠嘅嘢**寫成一份可執行清單。分**平台側 / n8n 側 / 憑證衛生**三部分。
> **點解要呢份**:W36 收官時,平台側 gate 9/9 全綠 —— 但**整條線仍然通唔到**,原因散喺三處(UAT placeholder 憑證、n8n 三個接線缺口、一個未 rotate 嘅帳號)。呢份文件就係把佢哋收埋一齊,避免「以為做完」。
> **相關**:ADR-0017(三接縫)· `W36-n8n-intake-adapter/N8N-WF1-CHANGES.md`(n8n 側精確改動)· `docs/05-usage/N8N-INTEGRATION-SETUP.md`(雙向對接)· `07-uat-as-built.md` · `BACKLOG` **SEC-001**
> **H4**:全文零 secret。所有 key / 密碼一律「喺邊度攞」,**唔寫值**。

---

## 0. 一頁總覽 —— 邊樣卡住邊樣

```
n8n onboarding 完成
   │
   ├─[A] Call node 有冇送 X-Intake-Key ?  ── 冇 → 401,一張都入唔到  🔴 未做
   ├─[B] UOP_INTAKE_URL 指啱 route ?      ── 錯 → 400(送名但打去要 GUID 嗰條)🔴 未做
   ├─[C] payload 個 department 係咪       ── 唔係 → 400 unknown department  🔴 未做
   │     18 條 Job Function 之一 ?
   │
   ▼ 到得呢度先輪到平台 resolve(cheapest-first,前面唔過就唔會行落去)
   │
   ├─[D] department → Opco.code           ── 常數表,無外部依賴  ✅ 已通
   ├─[E] licenceCode → skuId GUID         ── 要 catalog 有真 SKU  🔴 UAT 未通(Graph = placeholder)
   └─[F] REQ number → sc_request sysId    ── 要真 ServiceNow      🔴 UAT 未通(SN = placeholder)
   │
   ▼
  201 Created
```

**⇒ A/B/C 三個係 n8n 側(§2),E/F 兩個係平台側(§1)。兩邊都要掂先有 201。**

> 分開做係有價值嘅:**淨做 §2** 已經令錯誤由「永遠 401 咩都睇唔到」變成「400 而且講得出邊個值對唔到」—— 第一張真單就會自報 ServiceNow `License` variable 實際係咩值(**OQ-4** 靠呢個攞答案)。

---

## 1. 平台側前置(UAT)

### 1.1 現況 —— 兩個 placeholder 卡住 E 同 F

`07-uat-as-built.md` §認證 記錄:**Graph / ServiceNow = placeholder(app boot OK;真整合未接)**。連帶後果:

| # | 缺 | 直接後果 | 解 |
|---|---|---|---|
| **E** | catalog 冇真 SKU(要真 Graph 行 `POST /license/catalog/sync`) | **任何** `licenseCode` 都 resolve 唔到 → **400** | `DEPLOY-harden` #2 換真 Graph 憑證 → 再跑 catalog sync |
| **F** | ServiceNow 不可達 | REQ number 反查失敗 → **503** | `DEPLOY-harden` #2 換真 SN 憑證 |

⚠️ **resolve 係 cheapest-first**(常數 → DB → 網絡),所以 UAT 而家實際會**先撞 E 回 400**,未行到 F。修好 E 之後先會見到 F 嘅 503。**唔好見到 400 就以為 SN 冇問題。**

> ⚠️ 上表引自 W33/W34 as-built 記錄。**上線當日請自己再 confirm 一次**(catalog 有冇行、SN 憑證換咗未),唔好靠本文 snapshot。

### 1.2 每個環境要補嘅 OpCo(W36 新增)

`RAPO/IT (RDC2)` 係 W36 新增嘅第 24 個 OpCo。**`seed.ts` 有,但已部署環境唔會自動有** —— 每個環境要各自補一次:

- 建議走 **`POST /admin/opcos`**(CH-004),唔使重跑全 seed
- 值:`code = RAPO/IT (RDC2)` · `company = RAPO` · `costCenter = IT (RDC2)`
- 冇補 → Job Function `RAPO IT (RDC2)` 一律 **400**(其餘 17 條唔受影響)

> 背景:AD 側呢個 OU 個 `description` 仍然係 `RAPO/IT`,**平台刻意切細過 AD**(OQ-2,Chris 2026-07-27)。連帶:`RAPO/IT` 嘅 FY26 數字前後**唔可以直接比較**。

### 1.3 ⚠️ 同 ADR-0016 預算 gate 嘅交互(未上線,但要記住)

新增嘅 `RAPO/IT (RDC2)` **`allocated = 0`**。ADR-0016 預算 gate 一旦上線,`assigned + 1 > allocated` 會擋 —— 即係**該 OpCo 一單都 assign 唔到**。

⇒ **ADR-0016 上線前要先為佢設 allocation**(`PATCH /license/ledger/:id`,ADR-0007)。呢個唔阻 intake 建單,只阻 assign。

### 1.4 `INTAKE_API_KEY`

- **兩條 route 共用同一個 key**(canonical `/requests/intake` + adapter `/requests/intake/n8n`,OQ-3)
- `IntakeKeyGuard` 用 `getOrThrow` ⇒ **未設 app 直情 boot 唔起**。UAT 而家 boot 得起 = 已經有值
- 值喺 UAT ACA container secret(`02-environment-reference.md` 列為 🔴 Key Vault 級)。交畀 n8n 要走 secure channel,**唔好貼 chat / 唔好寫落任何文件**

---

## 2. n8n 側改動(全部喺 n8n UI 做)

> **精確 node-by-node 改動 = `docs/01-planning/W36-n8n-intake-adapter/N8N-WF1-CHANGES.md`。** 本節只講「做咩 + 點驗」,唔重複嗰份嘅逐欄表。
> 🔴 **兩批要同一次做齊** —— 只做接線唔改 payload,`department` 仍然係 AI 抽嘅自由文本,一樣 400。

### 2.1 接線三項(`N8N-WF1-CHANGES.md §2.5`)

#### (a) 🔴 加 `X-Intake-Key` —— 用 Header Auth credential,唔好用 raw header

實讀 `1001` / `1005` 兩個 `WF1 - Call UOP Intake` 個 `parameters`,**冇 `sendHeaders`、`credentials` 空** ⇒ 現狀一 enable 就**全部 401**。

**做法**(repo 內已有現成範式:`docs/05-usage/n8n-intake-test.workflow.json`):

1. n8n → **Credentials** → 睇下有冇既有嘅 **`UOP Intake Key (X-Intake-Key)`**(之前 import 過 intake test workflow 就會有)
   - 冇 → 新建 **Header Auth**:Name = `X-Intake-Key`,Value = 該環境嘅 `INTAKE_API_KEY`
2. 打開 `1001` 同 `1005` 個 `WF1 - Call UOP Intake`
3. **Authentication** = `Generic Credential Type` → **Header Auth** → 揀該 credential

> **點解唔用 "Send Headers" 打字入去**:噉樣 secret 會寫入 workflow JSON,一 export 就洩漏 —— 即係 §3 SEC-001 同一個病。credential store 唔會出現喺 export。

#### (b) `UOP_INTAKE_URL` 指去 adapter route

兩個 node 已經係 `={{ $env.UOP_INTAKE_URL }}` ⇒ **唔使郁 node,改 n8n 環境變數就得**。

UAT 值:

```
UOP_INTAKE_URL = https://ca-uop-web.lemonhill-2df17b88.eastasia.azurecontainerapps.io/api/requests/intake/n8n
```

兩個易錯位:

- **有 `/api` 前綴** —— 對外只有 web container 一個 hostname,佢 proxy `/api/*` 去 internal api(ADR-0012 單一 origin)。**直接打 api 內部 hostname 由外面去唔到。**
- 結尾係 **`/intake/n8n`**,唔係 `/intake`。打錯去 canonical route → 因為送緊名而唔係 GUID,**400**。

改完 **n8n 要 restart** 先讀到新 env。

#### (c) enable `1005` 個 `WF1 - Call UOP Intake`

`1005` = **排程路徑**(未到入職日),而排程係 onboarding 嘅**正常情況**。個 node 由 kickoff 至今一直 `disabled = true` ⇒ 唔 enable,排程單**永遠唔會入平台**。

✅ 安全:兩個 node 都設咗 `onError = continueRegularOutput` ⇒ **fire-and-forget**,平台回非 2xx 都唔會阻住 onboarding(合 W24 CONTRACT A3)。

### 2.2 Payload 兩項(`N8N-WF1-CHANGES.md §1` / `§2`)

| Workflow | 改咩 | 點解 |
|---|---|---|
| `1001` | `request.department` 由 `u.department`(AI 抽)→ **`p.jobFunction`**(1004 form 值);`targetUser` 四欄改讀 validated 版;`validated` → `true` | 平台**零 fallback 精確查** 18 條 Job Function。AI 自由文本(如 `RHK/Information Technology`)**必 400** |
| `1005` | `Check Activate Date` + `Prepare Schedule Record` 各加 `jobFunction` 落 `execution_context`;`WF1 - Prepare` 改讀 `ctx.jobFunction` | 排程路徑要拎到同一個值 |

> ✅ 好消息:所需值(`jobFunction` / `username` / `sAMAccountName` / `derivedEmail`)**喺 `prepare approval data` 已經現成**,唔使新增運算。
> 🔴 **唔好郁**:`_uopNeeded` gate · `licenseItems[]` 來源 · `idempotencyKey`。

### 2.3 ⚠️ `licenseCode` 可以係 `null`

兩個 prepare node 都係 `licenseCode: (it.variables && it.variables.License) || null`。ServiceNow catalog 個 `License` variable 攞唔到 → 送 `null` → 平台 **400,而且係成張單拒收,唔係跳過嗰個 line**。

刻意 fail-closed(唔知派緊咩 licence 就唔應該建單),但要知代價。訊息形如 `licenseItems.0.licenseCode must be a string` —— 講到邊個 index,講唔到邊個 RITM。

---

## 3. SEC-001 —— WinRM 服務帳號憑證衛生

> 同 intake **無直接關係**,但屬同一批 n8n 交付揪出嚟嘅安全項,一齊追。狀態見 `BACKLOG` A 區 **SEC-001**。

### 3.1 現況

`1002` 個 **disabled** node `Execute Command (Setup ABW Share Folder) (PRD)2` 內,Python `winrm.Session(auth=(...))` 曾**硬寫 AD 服務帳號 + 明文密碼**。

已做(2026-07-27):

- ✅ 該路徑**從來冇入過 git history**(`git log --all` 零 commit)⇒ 唔使改寫歷史
- ✅ 值已 **scrub** 成 placeholder(全目錄掃 52 處,只有呢一處係真 secret)
- ✅ `docs/06-reference/03-n8n-workflow/` 已 **gitignore**(`git add -A --dry-run` 實證:連 `git add .` 都拉唔到)

### 3.2 🔴 仲要做 —— 三步,缺一不可

| 步 | 動作 | 點解唔可以省 |
|---|---|---|
| **①** | 喺 AD **rotate** 該服務帳號密碼 | scrub 只清咗檔案,**清唔到「已洩漏」呢件事** —— 密碼曾以明文躺喺本機檔案系統 |
| **②** | 改該 node,**拆走硬寫** —— `auth=(...)` 改用 n8n credential 或 `$env`(如 `os.environ['WINRM_USER']` / `['WINRM_PASSWORD']`),值放 credential store / container env | 🔴 **淨做 ① 會兜返轉頭**:1002 有 sticky note 明寫呢個 node 係 `STUBBED 2026-07-23`、**「To restore on PRD: enable that node」** ⇒ 佢會復活。復活後再 export,**新密碼又會以明文出現喺 JSON**。做咗 ② 之後,將來 rotate 只需改 credential |
| **③** | 確認該帳號**喺 workflow 以外仲有冇用途**(scheduled task / 其他 script / service logon) | rotate 會整跌所有用緊佢嘅嘢。**呢樣文件查唔到** —— 十個 workflow 掃過只出現一次,但 workflow 以外嘅用途要人手確認 |

> 掃描時嘅實際教訓(值得記住):`ConvertTo-SecureString` / `-AsPlainText` 呢類「secret 應該長成點」嘅 pattern **命唔中呢個密碼**(佢係 Python tuple)。要有第二條路 —— **睇結構**(把所有字串 literal 遮罩再睇 shape),唔係淨睇值。

### 3.3 連帶(非 secret,唔急)

- phase 2 四條 workflow 仍然 `CHANGE_ME_SHARED_SECRET` hardcoded(**係 placeholder,唔係真值**)
- `2004` hardcode DEV host `ricohapdev.service-now.com`

---

## 4. 驗收 —— 每個階段應該見到咩

**唔好一次過驗。** 逐級推進,每級有一個明確、可分辨嘅預期回應:

| 階段 | 做完 | 預期 | 見到唔同嘢即係 |
|---|---|---|---|
| 0 | 咩都未做 | **401** | — |
| 1 | §2.1(a) 加咗 key | **400**(講得出邊個值對唔到) | 仍然 401 = credential 冇 attach 上去,或者 key 值唔啱 |
| 2 | §2.1(b) URL 改咗 + §2.2 payload 改咗 | **400 licence code …**(卡喺 E) | `Unknown department '…'` = payload 改動未生效 |
| 3 | §1.1 換真 Graph + catalog sync | **503 ServiceNow is unavailable**(卡喺 F) | 仍然 400 licence = catalog 未 sync,或該 licence 名喺 catalog 無**唯一**命中 |
| 4 | §1.1 換真 SN | **201** ✅ | — |

### 平台側點確認真係入咗

```
GET /requests            → 見到新單,origin = onboarding-intake
GET /requests/{id}       → opco 啱 · line item 有嘢 · stage = REQUESTED · handledById = null
                           accountCreatedAt / azureSyncedAt = null（正常,見下）
```

重推同一張 → **仍然一張**(`serviceNowSysId` `@unique`,idempotent)。

> ✅ `accountCreatedAt` / `azureSyncedAt` **一定係 null**,呢個係**設計**唔係 bug:n8n 冇送,而由「n8n 幾時 POST」推導「AD 已 sync 落 Entra」= 靠估開 sync gate。平台照舊要喺 Graph `findUser(upn)` 真命中先 assign。

### ⚠️ 誠實邊界

W36 嘅 live 驗證行嘅係 **demo-harness mock ServiceNow**,payload 亦係照 n8n node 個 `jsCode` 重砌。**證到**:adapter → `IntakeService` → DB 成條路真係通、反查用啱 table(`sc_request`)同 REQ number、8 個 case 行為正確。**未證**:真 SN 回應欄名、真 n8n 打入嚟。

⇒ **上表階段 4 至今未有人行過。** 第一次行請當係真對接,唔好當回歸測試。

---

## 5. 檔案索引

| 關注 | 位置 |
|---|---|
| n8n 側逐 node 精確改動 | `docs/01-planning/W36-n8n-intake-adapter/N8N-WF1-CHANGES.md`(**§2.5** 接線 · §1/§2 payload · §2.6 `licenseCode` null) |
| Job Function ↔ OpCo 18 條對照 + 逐條理據 | `docs/01-planning/W36-n8n-intake-adapter/MAPPING.md` |
| 兩條 route 差異 / 點揀 | `docs/05-usage/N8N-INTEGRATION-SETUP.md` **§1.5** · `N8N-INTAKE-HANDOFF.md` **§8** |
| 平台側實作 | `apps/api/src/fulfilment/intake-adapter.service.ts` · `opco-department-map.ts` · `dto/n8n-native-intake.dto.ts` |
| 決策 | `docs/adr/0017-n8n-execution-seams-switchable-integration.md`(**D4**)· ADR-0008 · ADR-0012(單一 origin) |
| UAT 實際環境 | `07-uat-as-built.md` · `02-environment-reference.md` |
| 本地 smoke(唔使 n8n) | `apps/api/scripts/demo-harness/README.md` Scenario 3 · `npm run demo:mock-sn` |
| 追蹤狀態 | `BACKLOG.md` A 區 **SEC-001** · `N8N-SEAMS-戊` row · W36 `progress.md` retro C1-C6 |
